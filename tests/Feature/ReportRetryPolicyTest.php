<?php

use App\Actions\Monitoring\QueryItControlCenter;
use App\Actions\Reports\CombineHybridReports;
use App\Actions\Reports\ManageReportJobs;
use App\Actions\Reports\QueueScheduledJneReports;
use App\Actions\Reports\ReportRetryPolicy;
use App\Models\JneReportProfile;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia as Assert;
use Symfony\Component\HttpKernel\Exception\HttpException;

beforeEach(function () {
    config(['jne-reports.automatic_retry_enabled' => true, 'jne-reports.worker_token' => str_repeat('retry-secret', 4), 'jne-reports.worker_id' => 'jne-report-1']);
    config(['jne-reports.hybrid_auto_retry_max' => 1, 'jne-reports.hybrid_retry_delay_seconds' => 120, 'jne-reports.hybrid_retry_second_delay_seconds' => 300]);
    $this->freezeTime();
    $this->travelTo(now()->startOfSecond());
});

function retryHeaders(string $worker = 'jne-report-1', string $claim = ''): array
{
    return ['Authorization' => 'Bearer '.config('jne-reports.worker_token'), 'X-Worker-ID' => $worker, 'X-Report-Claim' => $claim];
}

function retryClaim(string $worker = 'jne-report-1', ?string $key = null): TestResponse
{
    return test()->postJson(route('internal.report-jobs.claim'), ['claim_key' => $key ?? (string) Str::uuid(), 'retry_protocol' => 1], retryHeaders($worker));
}

function retryFailure(ReportJob $job, string $token, string $worker = 'jne-report-1', array $overrides = []): TestResponse
{
    return test()->postJson(route('internal.report-jobs.fail', $job), array_replace(['status' => 'NEEDS_ATTENTION', 'error_message' => 'NETWORK_TIMEOUT: Koneksi terputus.'], $overrides), retryHeaders($worker, $token));
}

test('eligible report retries remain delayed in the same queue and stop at the source budget', function (string $source, string $type, string $mode, ?string $sourceFile, string $worker) {
    $job = ReportJob::factory()->create(['source' => $source, 'report_type' => $type, 'report_mode' => $mode, 'source_file_path' => $sourceFile, 'status' => $sourceFile ? 'WAITING_APEX' : 'QUEUED']);
    $hybrid = in_array($source, ['roberto', 'nuralamt'], true);
    $limit = $hybrid ? 2 : 3;
    for ($attempt = 1; $attempt <= $limit; $attempt++) {
        $token = retryClaim($worker)->assertOk()->assertJsonPath('data.id', $job->id)->assertJsonPath('data.attempt_count', $attempt)->json('data.claim_token');
        retryFailure($job, $token, $worker)->assertOk()->assertJsonPath('data.status', $attempt < $limit ? 'RETRY_WAIT' : 'NEEDS_ATTENTION');
        $job->refresh();
        expect($job->active_slot)->toBeNull()->and($job->lease_expires_at)->toBeNull();
        if ($attempt < $limit) {
            $base = $hybrid ? 120 : ($attempt === 1 ? 30 : 120);
            $seconds = (int) now()->diffInSeconds($job->retry_available_at);
            expect($seconds)->toBeBetween($base, $base + ($base === 30 ? 15 : 30));
            retryClaim($worker)->assertNoContent();
            $this->travelTo($job->retry_available_at);
        }
    }
    expect($job->attempt_count)->toBe($limit)->and($job->retry_classification)->toBe('EXHAUSTED')->and($job->retry_final_at)->not->toBeNull();
    $this->travel(10)->minutes();
    retryClaim($worker)->assertNoContent();
    $this->assertDatabaseCount('report_jobs', 1);
    $this->assertDatabaseCount('jobs', 0);
})->with([
    'parameter APEX' => ['apex', 'apex', 'P', null, 'jne-report-1'],
    'active AWBs' => ['apex', 'unresolved', 'A', null, 'jne-report-1'],
    'Hybrid APEX conversion' => ['hybrid', 'combined', 'A', 'combined.csv', 'jne-report-1'],
    'PM manual' => ['roberto', 'manual', 'P', null, 'hybrid-roberto'],
    'PM cashless' => ['roberto', 'cashless', 'P', null, 'hybrid-roberto'],
    'Puman manual' => ['nuralamt', 'manual', 'P', null, 'hybrid-nuralamt'],
    'Puman cashless' => ['nuralamt', 'cashless', 'P', null, 'hybrid-nuralamt'],
]);

test('claim and failure acknowledgements are idempotent and old claims cannot change a later attempt', function () {
    $job = ReportJob::factory()->create();
    $key = (string) Str::uuid();
    $token = retryClaim(key: $key)->assertOk()->json('data.claim_token');
    retryClaim(key: $key)->assertOk()->assertJsonPath('data.claim_token', $token)->assertJsonPath('data.attempt_count', 1);
    retryFailure($job, $token)->assertOk();
    $due = $job->refresh()->retry_available_at;
    $events = DB::table('report_job_events')->count();
    retryFailure($job, $token, overrides: ['error_message' => 'NETWORK_TIMEOUT: duplicate acknowledgement'])->assertOk();
    expect($job->refresh()->retry_available_at->equalTo($due))->toBeTrue();
    $this->assertDatabaseCount('report_job_events', $events);
    $this->travelTo($due);
    $nextToken = retryClaim()->assertOk()->json('data.claim_token');
    expect($nextToken)->not->toBe($token);
    retryFailure($job, $token)->assertForbidden();
    expect($job->refresh()->status)->toBe('RUNNING')->and($job->attempt_count)->toBe(2);
});

test('permanent or unknown errors are never retried', function (string $code, ?int $http) {
    $job = ReportJob::factory()->create();
    $token = retryClaim()->assertOk()->json('data.claim_token');
    retryFailure($job, $token, overrides: ['error_message' => $code.': Invalid request', 'http_status' => $http])->assertOk()->assertJsonPath('data.status', 'NEEDS_ATTENTION');
    expect($job->refresh()->retry_classification)->toBe('PERMANENT')->and($job->attempt_count)->toBe(1);
})->with([['FORM_VALUE', null], ['HISTORY_STRUCTURE', null], ['CSV_INVALID', null], ['APEX_ACCESS', 403], ['HYBRID_LOGIN', 401], ['UPSTREAM_HTTP', 404], ['UPSTREAM_HTTP', 501], ['UNKNOWN', null], ['FORM_VALUE', 429]]);

test('Retry After delays both the job and other jobs on the same source', function (string $header, int $minimum) {
    $job = ReportJob::factory()->create();
    $token = retryClaim()->assertOk()->json('data.claim_token');
    retryFailure($job, $token, overrides: ['error_message' => 'UPSTREAM_HTTP: rate limited', 'http_status' => 429, 'retry_after' => $header === 'http-date' ? now()->addSeconds(300)->utc()->format('D, d M Y H:i:s \G\M\T') : $header])->assertOk();
    expect((int) now()->diffInSeconds($job->refresh()->retry_available_at))->toBeGreaterThanOrEqual($minimum);
    ReportJob::factory()->create(['customer_account' => 'OTHER']);
    retryClaim()->assertNoContent();
    $this->travel($minimum - 1)->seconds();
    retryClaim()->assertNoContent();
})->with([['300', 300], ['http-date', 300], ['invalid header', 30]]);

test('APEX submission uncertainty fails closed and a pinned History is resumed without changing its identity', function () {
    $job = ReportJob::factory()->create();
    $token = retryClaim()->assertOk()->json('data.claim_token');
    $checkpoint = route('internal.report-jobs.retry-checkpoint', $job);
    $this->postJson($checkpoint, ['submission_state' => 'uncertain'], retryHeaders(claim: $token))->assertOk();
    $history = ['origin' => 'https://dash-ccc02.jne.co.id', 'id' => '123', 'filename' => 'original.csv', 'created' => '06-NOV-2026 10:00', 'submitted_at' => now()->getTimestampMs()];
    $this->postJson($checkpoint, ['submission_state' => 'history', 'history' => [...$history, 'origin' => 'https://evil.test']], retryHeaders(claim: $token))->assertUnprocessable();
    $this->postJson($checkpoint, ['submission_state' => 'history', 'history' => $history], retryHeaders(claim: $token))->assertOk();
    $this->postJson($checkpoint, ['submission_state' => 'history', 'history' => [...$history, 'id' => '124']], retryHeaders(claim: $token))->assertConflict();
    retryFailure($job, $token)->assertOk()->assertJsonPath('data.status', 'RETRY_WAIT');
    $this->travelTo($job->refresh()->retry_available_at);
    retryClaim()->assertOk()->assertJsonPath('data.parameters.apex_history', $history);
});

test('uncertain APEX submit or old workers never trigger a fresh Process retry', function (bool $oldWorker) {
    $job = ReportJob::factory()->create();
    $token = $oldWorker
        ? $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], retryHeaders())->assertOk()->json('data.claim_token')
        : retryClaim()->assertOk()->json('data.claim_token');
    if (! $oldWorker) {
        $this->postJson(route('internal.report-jobs.retry-checkpoint', $job), ['submission_state' => 'uncertain'], retryHeaders(claim: $token))->assertOk();
    }
    retryFailure($job, $token)->assertOk()->assertJsonPath('data.status', 'NEEDS_ATTENTION');
    expect($job->refresh()->retry_classification)->toBe('UNSAFE_TO_RETRY');
})->with([true, false]);

test('source and account concurrency limits allow another account without executing one account twice', function () {
    config(['jne-reports.apex_pool_enabled' => true, 'jne-reports.apex_concurrency' => 2]);
    $first = ReportJob::factory()->create();
    $second = ReportJob::factory()->create();
    $other = ReportJob::factory()->create(['customer_account' => 'OTHER', 'report_mode' => 'A']);
    retryClaim('jne-report-1-instance-1')->assertOk()->assertJsonPath('data.id', $first->id);
    retryClaim('jne-report-1-instance-2')->assertOk()->assertJsonPath('data.id', $other->id);
    retryClaim('jne-report-1-instance-2')->assertNoContent();
    expect($second->refresh()->attempt_count)->toBe(0);
});

test('three consecutive failures open a shared cooldown and allow only a spaced recovery probe', function () {
    config(['jne-reports.apex_pool_enabled' => true, 'jne-reports.apex_concurrency' => 2]);
    foreach (['A', 'B', 'C'] as $account) {
        $job = ReportJob::factory()->create(['customer_account' => $account]);
        $token = retryClaim('jne-report-1-instance-1')->assertOk()->assertJsonPath('data.id', $job->id)->json('data.claim_token');
        retryFailure($job, $token, 'jne-report-1-instance-1')->assertOk();
    }
    ReportJob::factory()->create(['customer_account' => 'D']);
    retryClaim('jne-report-1-instance-2')->assertNoContent();
    $this->travel(120)->seconds();
    retryClaim('jne-report-1-instance-1')->assertOk();
    retryClaim('jne-report-1-instance-2')->assertNoContent();
});

test('expired worker recovery uses the same retry budget and only a safe checkpoint', function () {
    $job = ReportJob::factory()->create();
    retryClaim()->assertOk();
    $this->travel(301)->seconds();
    expect(app(ManageReportJobs::class)->recoverExpired())->toBe(1);
    expect($job->refresh()->status)->toBe('RETRY_WAIT')->and($job->attempt_count)->toBe(1);
    expect(app(ManageReportJobs::class)->recoverExpired())->toBe(0);
});

test('Hybrid parent waits while a child retries and only receives a final failure after exhaustion', function () {
    $parent = ReportJob::factory()->create(['source' => 'hybrid', 'report_type' => 'combined', 'customer_account' => 'HYBRID_PM', 'status' => 'COLLECTING_SOURCES']);
    $child = ReportJob::factory()->create(['source' => 'roberto', 'report_type' => 'manual', 'hybrid_batch_id' => $parent->id]);
    $token = retryClaim('hybrid-roberto')->assertOk()->json('data.claim_token');
    retryFailure($child, $token, 'hybrid-roberto')->assertOk();
    expect($parent->refresh()->status)->toBe('COLLECTING_SOURCES');
    $this->travelTo($child->refresh()->retry_available_at);
    $token = retryClaim('hybrid-roberto')->assertOk()->json('data.claim_token');
    retryFailure($child, $token, 'hybrid-roberto', ['error_message' => 'HYBRID_CSV: invalid file'])->assertOk();
    expect($parent->refresh()->status)->toBe('NEEDS_ATTENTION');
});

test('manual retry paths cannot bypass the total attempt limit', function () {
    $job = ReportJob::factory()->create(['status' => 'NEEDS_ATTENTION', 'attempt_count' => 3, 'error_message' => 'APEX_SOURCE_API: Error']);
    expect(fn () => app(ManageReportJobs::class)->retryApexSourceFailure($job->id, $job->created_by))->toThrow(HttpException::class);
    expect($job->refresh()->attempt_count)->toBe(3)->and($job->status)->toBe('NEEDS_ATTENTION');
});

test('cashless download timeouts delay at most three attempts while retaining the saved manual source', function () {
    config(['jne-reports.hybrid_auto_retry_max' => 2]);
    $this->freezeTime();
    $parent = ReportJob::factory()->create(['source' => 'hybrid', 'report_type' => 'combined', 'customer_account' => 'HYBRID_PM', 'status' => 'COLLECTING_SOURCES']);
    $cashless = ReportJob::factory()->create(['source' => 'roberto', 'report_type' => 'cashless', 'hybrid_batch_id' => $parent->id]);
    $manual = ReportJob::factory()->create(['source' => 'roberto', 'report_type' => 'manual', 'hybrid_batch_id' => $parent->id, 'status' => 'SOURCE_SAVED', 'attempt_count' => 1, 'file_path' => 'saved-manual.csv', 'file_checksum' => hash('sha256', 'saved-manual')]);
    $savedManual = $manual->refresh()->getAttributes();

    foreach ([1 => 120, 2 => 300, 3 => null] as $attempt => $base) {
        $token = retryClaim('hybrid-roberto')->assertOk()->assertJsonPath('data.id', $cashless->id)->assertJsonPath('data.attempt_count', $attempt)->json('data.claim_token');
        retryFailure($cashless, $token, 'hybrid-roberto', ['error_message' => 'HYBRID_DOWNLOAD_TIMEOUT: [prepare_csv] Batas waktu menunggu tautan CSV Hybrid terlampaui.'])->assertOk();
        $cashless->refresh();
        if ($base !== null) {
            expect($cashless->status)->toBe('RETRY_WAIT')
                ->and((int) now()->diffInSeconds($cashless->retry_available_at))->toBeBetween($base, $base + 30)
                ->and($parent->refresh()->status)->toBe('COLLECTING_SOURCES');
            retryClaim('hybrid-roberto')->assertNoContent();
            $this->travelTo($cashless->retry_available_at);
        }
    }

    expect($cashless->retry_classification)->toBe('EXHAUSTED')
        ->and($cashless->retry_error_code)->toBe('HYBRID_DOWNLOAD_TIMEOUT')
        ->and($parent->refresh()->status)->toBe('NEEDS_ATTENTION')
        ->and($manual->refresh()->getAttributes())->toBe($savedManual);
    $this->travel(10)->minutes();
    retryClaim('hybrid-roberto')->assertNoContent();
    $this->assertDatabaseCount('report_jobs', 3);
    $this->assertDatabaseCount('jobs', 0);
});

test('final failure remains in the IT attention queue beyond the diagnostic sampling window', function () {
    $this->withoutVite();
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $job = ReportJob::factory()->create();
    $token = retryClaim()->assertOk()->json('data.claim_token');
    retryFailure($job, $token, overrides: ['error_message' => 'FORM_VALUE: invalid'])->assertOk();
    $this->travel(2)->days();
    $this->actingAs($admin)->get(route('it-control-center'))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('monitoring.report_retries.attention_total', 1)
        ->where('monitoring.report_retries.attention.0.id', $job->id)
        ->where('monitoring.report_retries.attention.0.code', 'FORM_VALUE')
        ->missing('monitoring.report_retries.attention.0.claim_token'));
});

test('scheduler deduplicates the entire cycle while a report is waiting for automatic retry', function () {
    $profile = JneReportProfile::factory()->create(['enabled' => true, 'customer_account' => 'TESTACCOUNT']);
    $job = ReportJob::factory()->create();
    $token = retryClaim()->assertOk()->json('data.claim_token');
    retryFailure($job, $token)->assertOk();
    expect(app(QueueScheduledJneReports::class)->handle())->toBe(0);
    $this->assertDatabaseCount('report_jobs', 1);
});

test('batch retries preserve each original History and reuse an existing started checkpoint', function () {
    config(['jne-reports.batch_checkpoints_enabled' => true]);
    $job = ReportJob::factory()->create(['report_mode' => 'A', 'report_type' => 'unresolved', 'parameters' => ['awbs' => array_map(fn (int $number): string => 'TG'.$number, range(1, 6001))]]);
    $token = retryClaim()->assertOk()->json('data.claim_token');
    $checkpoint = route('internal.report-jobs.retry-checkpoint', $job);
    $history = ['origin' => 'https://dash-ccc01.jne.co.id', 'id' => '123', 'filename' => 'original.csv', 'created' => '06-NOV-2026 10:00', 'submitted_at' => now()->getTimestampMs()];
    foreach ([1, 2] as $number) {
        $this->postJson(route('internal.report-jobs.batch', [$job, $number]), ['start_key' => (string) Str::uuid()], retryHeaders(claim: $token))->assertOk();
        $this->postJson($checkpoint, ['batch_number' => $number, 'submission_state' => 'uncertain'], retryHeaders(claim: $token))->assertOk();
        $this->postJson($checkpoint, ['batch_number' => $number, 'submission_state' => 'history', 'history' => [...$history, 'id' => (string) (123 + $number)]], retryHeaders(claim: $token))->assertOk();
    }
    retryFailure($job, $token)->assertOk()->assertJsonPath('data.status', 'RETRY_WAIT');
    $this->travelTo($job->refresh()->retry_available_at);
    $token = retryClaim()->assertOk()->assertJsonPath('data.parameters.apex_retry_batches.2.history.id', '125')->json('data.claim_token');
    $this->postJson(route('internal.report-jobs.batch', [$job, 1]), ['start_key' => (string) Str::uuid()], retryHeaders(claim: $token))->assertOk();
    expect($job->refresh()->retry_submission_state)->toBe('history');
});

test('a later uncertain batch prevents replaying any previously submitted APEX batch', function () {
    $job = ReportJob::factory()->create(['report_mode' => 'A', 'parameters' => ['awbs' => ['TG123456789']]]);
    $token = retryClaim()->assertOk()->json('data.claim_token');
    $this->postJson(route('internal.report-jobs.retry-checkpoint', $job), ['batch_number' => 1, 'submission_state' => 'uncertain'], retryHeaders(claim: $token))->assertOk();
    retryFailure($job, $token)->assertOk()->assertJsonPath('data.status', 'NEEDS_ATTENTION');
    expect($job->refresh()->retry_classification)->toBe('UNSAFE_TO_RETRY');
});

test('existing queued work over the attempt budget becomes Attention rather than silently waiting forever', function () {
    $job = ReportJob::factory()->create(['attempt_count' => 3]);
    retryClaim()->assertNoContent();
    expect($job->refresh()->status)->toBe('NEEDS_ATTENTION')->and($job->retry_classification)->toBe('EXHAUSTED');
});

test('retry checkpoint endpoints reject invalid ownership and malformed metadata', function () {
    $job = ReportJob::factory()->create();
    $token = retryClaim()->assertOk()->json('data.claim_token');
    $url = route('internal.report-jobs.retry-checkpoint', $job);
    $this->postJson($url, ['submission_state' => 'uncertain'])->assertUnauthorized();
    $this->postJson($url, ['submission_state' => 'uncertain'], retryHeaders(claim: 'wrong-owner'))->assertForbidden();
    $this->postJson($url, ['submission_state' => 'not_submitted'], retryHeaders(claim: $token))->assertUnprocessable();
    $this->postJson($url, ['submission_state' => 'history'], retryHeaders(claim: $token))->assertUnprocessable();
    retryFailure($job, $token, overrides: ['http_status' => 900])->assertUnprocessable();
    retryFailure($job, $token, overrides: ['error_stage' => 'https://private/apex?session=123'])->assertUnprocessable()->assertJsonValidationErrors('error_stage');
    retryFailure($job, $token, overrides: ['root_cause' => 'password=secret'])->assertUnprocessable()->assertJsonValidationErrors('root_cause');
    expect($job->refresh()->status)->toBe('RUNNING');
});

test('verified empty customer reports finish without consuming retry attempts on a compatible single worker', function () {
    $job = ReportJob::factory()->create();
    $token = retryClaim()->assertOk()->json('data.claim_token');
    retryFailure($job, $token, overrides: ['status' => 'NO_DATA', 'error_message' => 'APEX_NO_DATA: History confirms exact account and period.'])->assertOk()->assertJsonPath('data.status', 'NO_DATA');
    expect($job->refresh()->attempt_count)->toBe(1)->and($job->retry_available_at)->toBeNull()->and($job->retry_final_at)->toBeNull();
});

test('retrying reports are failed attempts rather than final failures in Control Center', function () {
    $job = ReportJob::factory()->create();
    $token = retryClaim()->assertOk()->json('data.claim_token');
    retryFailure($job, $token)->assertOk();
    $monitoring = app(QueryItControlCenter::class)->handle();
    expect($monitoring['report_retries']['waiting'])->toBe(1)->and($monitoring['report_retries']['attention_total'])->toBe(0);
    expect(collect($monitoring['pipelines'])->firstWhere('id', 'report:'.$job->id)['outcome'])->toBe('WAITING');
    expect(collect($monitoring['diagnostics'])->firstWhere('id', 'report:'.$job->id)['kind'])->toBe('FAILED_ATTEMPT');
});

test('checkpoint accepts the exact opaque identities returned by APEX and keeps them immutable', function (bool $metadata) {
    $job = ReportJob::factory()->create();
    $token = retryClaim()->assertOk()->json('data.claim_token');
    $url = route('internal.report-jobs.retry-checkpoint', $job);
    $history = ['origin' => 'https://dash-ccc01.jne.co.id', 'filename' => str_repeat('a', 80).'.csv', 'created' => '06-NOV-2026 10:00', 'submitted_at' => now()->getTimestampMs()];
    $history['id'] = $metadata ? 'metadata:'.json_encode([$history['filename'], $history['created'], 'ACCOUNT'], JSON_THROW_ON_ERROR) : 'REPORT_123-abc';
    $this->postJson($url, ['submission_state' => 'uncertain'], retryHeaders(claim: $token))->assertOk();
    $this->postJson($url, ['submission_state' => 'history', 'history' => $history], retryHeaders(claim: $token))->assertOk();
    $this->postJson($url, ['submission_state' => 'history', 'history' => $history], retryHeaders(claim: $token))->assertOk();
    $this->postJson($url, ['submission_state' => 'history', 'history' => [...$history, 'id' => 'another']], retryHeaders(claim: $token))->assertConflict();
    expect($job->refresh()->parameters['apex_history'])->toBe($history);
})->with([true, false]);

test('metadata History cannot refer to a different filename or creation time', function () {
    $job = ReportJob::factory()->create();
    $token = retryClaim()->assertOk()->json('data.claim_token');
    $url = route('internal.report-jobs.retry-checkpoint', $job);
    $this->postJson($url, ['submission_state' => 'uncertain'], retryHeaders(claim: $token))->assertOk();
    $history = ['origin' => 'https://dash-ccc01.jne.co.id', 'filename' => 'original.csv', 'created' => '06-NOV-2026 10:00', 'submitted_at' => now()->getTimestampMs(), 'id' => 'metadata:["other.csv","06-NOV-2026 10:00","USER"]'];
    $this->postJson($url, ['submission_state' => 'history', 'history' => $history], retryHeaders(claim: $token))->assertUnprocessable();
    expect($job->refresh()->retry_submission_state)->toBe('uncertain');
});

test('rejected batch checkpoints resume the original History without resetting their attempt budget', function () {
    $job = ReportJob::factory()->create(['report_mode' => 'A', 'report_type' => 'unresolved', 'parameters' => ['awbs' => ['TG123456789']]]);
    $token = retryClaim()->assertOk()->json('data.claim_token');
    $this->postJson(route('internal.report-jobs.retry-checkpoint', $job), ['batch_number' => 1, 'submission_state' => 'uncertain'], retryHeaders(claim: $token))->assertOk();
    retryFailure($job, $token, overrides: ['error_message' => 'API_REJECTED: HTTP 422', 'http_status' => 422])->assertOk();
    $history = ['origin' => 'https://dash-ccc01.jne.co.id', 'id' => '123', 'filename' => 'active-awbs-'.$job->id.'-1-'.Str::uuid().'.csv', 'created' => '06-NOV-2026 10:00', 'submitted_at' => now()->getTimestampMs()];
    expect(fn () => app(ReportRetryPolicy::class)->restoreCheckpoint($job->id, [...$history, 'filename' => 'other.csv'], 1))->toThrow(HttpException::class);
    app(ReportRetryPolicy::class)->restoreCheckpoint($job->id, $history, 1);
    expect($job->refresh()->status)->toBe('RETRY_WAIT')->and($job->attempt_count)->toBe(1);
    expect(fn () => app(ReportRetryPolicy::class)->restoreCheckpoint($job->id, $history, 1))->toThrow(HttpException::class);
    $this->travelTo($job->retry_available_at);
    retryClaim()->assertOk()->assertJsonPath('data.attempt_count', 2)->assertJsonPath('data.parameters.apex_retry_batches.1.history.id', '123');
    $this->assertDatabaseCount('report_jobs', 1);
});

test('unknown prepare CSV errors get only one conservative retry even when two retries are configured', function () {
    config(['jne-reports.hybrid_auto_retry_max' => 2]);
    $child = ReportJob::factory()->create(['source' => 'roberto', 'report_type' => 'cashless']);
    $failure = ['error_message' => 'HYBRID_ERROR: [prepare_csv] Scraping gagal.', 'error_stage' => 'prepare_csv', 'root_cause' => 'UNCLASSIFIED'];
    $token = retryClaim('hybrid-roberto')->assertOk()->json('data.claim_token');
    retryFailure($child, $token, 'hybrid-roberto', $failure)->assertOk()->assertJsonPath('data.status', 'RETRY_WAIT');
    expect($child->refresh()->retry_classification)->toBe('UNKNOWN')
        ->and($child->parameters['hybrid_retry']['last_failure'])->toMatchArray(['stage' => 'prepare_csv', 'root_cause' => 'UNCLASSIFIED', 'attempt' => 1])
        ->and($child->parameters['hybrid_retry']['last_failure']['next_retry_at'])->toBe($child->retry_available_at->toIso8601String());
    $this->travelTo($child->retry_available_at);
    $token = retryClaim('hybrid-roberto')->assertOk()->json('data.claim_token');
    retryFailure($child, $token, 'hybrid-roberto', $failure)->assertOk()->assertJsonPath('data.status', 'NEEDS_ATTENTION');
    expect($child->refresh()->attempt_count)->toBe(2)->and($child->retry_classification)->toBe('EXHAUSTED');
    retryClaim('hybrid-roberto')->assertNoContent();
});

test('Hybrid invalid credentials permissions schema and confirmed structure fail without retry', function (string $code, string $stage) {
    $child = ReportJob::factory()->create(['source' => 'nuralamt', 'report_type' => 'cashless']);
    $token = retryClaim('hybrid-nuralamt')->assertOk()->json('data.claim_token');
    retryFailure($child, $token, 'hybrid-nuralamt', ['error_message' => $code.': ['.$stage.'] invalid', 'error_stage' => $stage])->assertOk()->assertJsonPath('data.status', 'NEEDS_ATTENTION');
    expect($child->refresh()->retry_classification)->toBe('PERMANENT')->and($child->retry_available_at)->toBeNull();
})->with([['HYBRID_LOGIN', 'login'], ['HYBRID_ACCESS', 'open_report'], ['HYBRID_FILTER', 'set_filters'], ['HYBRID_STRUCTURE', 'prepare_csv'], ['HYBRID_CSV', 'download_csv'], ['HYBRID_ERROR', 'source_upload']]);

test('temporary Hybrid page download and session failures use delayed queue recovery', function (string $code) {
    $child = ReportJob::factory()->create(['source' => 'roberto', 'report_type' => 'cashless']);
    $token = retryClaim('hybrid-roberto')->assertOk()->json('data.claim_token');
    retryFailure($child, $token, 'hybrid-roberto', ['error_message' => $code.': sementara'])->assertOk()->assertJsonPath('data.status', 'RETRY_WAIT');
    expect($child->refresh()->retry_classification)->toBe('TRANSIENT')->and($child->retry_available_at->greaterThanOrEqualTo(now()->addSeconds(120)))->toBeTrue();
})->with(['HYBRID_PAGE_TRANSIENT', 'HYBRID_SESSION_EXPIRED', 'HYBRID_DOWNLOAD_TRANSIENT']);

test('Hybrid retry configuration cannot exceed two automatic retries or retry before Retry After', function (int $configured, int $limit) {
    config(['jne-reports.hybrid_auto_retry_max' => $configured]);
    $child = ReportJob::factory()->create(['source' => 'roberto', 'report_type' => 'manual']);
    $token = retryClaim('hybrid-roberto')->assertOk()->json('data.claim_token');
    retryFailure($child, $token, 'hybrid-roberto', ['error_message' => 'UPSTREAM_HTTP: unavailable', 'http_status' => 503, 'retry_after' => '600'])->assertOk();
    expect($child->refresh()->parameters['hybrid_retry']['attempt_limit'])->toBe($limit);
    if ($limit > 1) {
        expect($child->retry_available_at->greaterThanOrEqualTo(now()->addSeconds(600)))->toBeTrue();
        $this->travel(599)->seconds();
        retryClaim('hybrid-roberto')->assertNoContent();
    } else {
        expect($child->status)->toBe('NEEDS_ATTENTION')->and($child->retry_available_at)->toBeNull();
    }
})->with([[0, 1], [1, 2], [2, 3], [99, 3]]);

test('normal Hybrid jobs take priority but an overdue retry gets a turn between normal claims', function () {
    $retry = ReportJob::factory()->create(['source' => 'roberto', 'report_type' => 'cashless']);
    $token = retryClaim('hybrid-roberto')->assertOk()->json('data.claim_token');
    retryFailure($retry, $token, 'hybrid-roberto')->assertOk();
    $normal = ReportJob::factory()->count(3)->create(['source' => 'roberto', 'report_type' => 'manual']);
    $this->travelTo($retry->refresh()->retry_available_at);
    $token = retryClaim('hybrid-roberto')->assertOk()->assertJsonPath('data.id', $normal[0]->id)->json('data.claim_token');
    retryClaim('hybrid-roberto')->assertNoContent();
    retryFailure($normal[0], $token, 'hybrid-roberto', ['error_message' => 'HYBRID_CSV: invalid'])->assertOk();
    $this->travel(301)->seconds();
    $token = retryClaim('hybrid-roberto')->assertOk()->assertJsonPath('data.id', $retry->id)->json('data.claim_token');
    retryFailure($retry, $token, 'hybrid-roberto')->assertOk();
    retryClaim('hybrid-roberto')->assertOk()->assertJsonPath('data.id', $normal[1]->id);
    expect($normal[2]->refresh()->attempt_count)->toBe(0);
});

test('a worker crash during the last Hybrid retry becomes final and rejects the stale owner', function () {
    $child = ReportJob::factory()->create(['source' => 'roberto', 'report_type' => 'manual']);
    $token = retryClaim('hybrid-roberto')->assertOk()->json('data.claim_token');
    retryFailure($child, $token, 'hybrid-roberto')->assertOk();
    $this->travelTo($child->refresh()->retry_available_at);
    $token = retryClaim('hybrid-roberto')->assertOk()->json('data.claim_token');
    $this->travel(301)->seconds();
    expect(app(ManageReportJobs::class)->recoverExpired())->toBe(1);
    expect($child->refresh()->status)->toBe('NEEDS_ATTENTION')->and($child->attempt_count)->toBe(2)->and($child->retry_classification)->toBe('EXHAUSTED');
    $events = DB::table('report_job_events')->count();
    expect(app(ManageReportJobs::class)->recoverExpired())->toBe(0);
    retryFailure($child, $token, 'hybrid-roberto')->assertOk()->assertJsonPath('data.status', 'NEEDS_ATTENTION');
    $this->assertDatabaseCount('report_job_events', $events);
    $this->postJson(route('internal.report-jobs.progress', $child), ['status' => 'DOWNLOADING'], retryHeaders('hybrid-roberto', $token))->assertConflict();
});

test('selective retry reuses saved sibling artifacts combines once and allows only one APEX reservation', function () {
    Storage::fake('jne_reports');
    $parent = ReportJob::factory()->create(['source' => 'hybrid', 'report_type' => 'combined', 'customer_account' => 'HYBRID_PM', 'status' => 'COLLECTING_SOURCES', 'date_thru' => '2026-10-01']);
    $cashless = ReportJob::factory()->create(['source' => 'roberto', 'report_type' => 'cashless', 'hybrid_batch_id' => $parent->id, 'date_thru' => '2026-10-01']);
    $manual = ReportJob::factory()->create(['source' => 'roberto', 'report_type' => 'manual', 'hybrid_batch_id' => $parent->id, 'date_thru' => '2026-10-01']);
    $token = retryClaim('hybrid-roberto')->assertOk()->json('data.claim_token');
    retryFailure($cashless, $token, 'hybrid-roberto')->assertOk();
    $manualToken = retryClaim('hybrid-roberto')->assertOk()->assertJsonPath('data.id', $manual->id)->json('data.claim_token');
    foreach (['WAITING_REPORT', 'DOWNLOADING'] as $status) {
        $this->postJson(route('internal.report-jobs.progress', $manual), ['status' => $status], retryHeaders('hybrid-roberto', $manualToken))->assertOk();
    }
    $this->postJson(route('internal.report-jobs.source-upload', $manual), ['file' => UploadedFile::fake()->createWithContent('manual.csv', "Cnote no,Date\n010150012345626,01-OCT-2026 12:00\n")], retryHeaders('hybrid-roberto', $manualToken))->assertOk();
    $saved = $manual->refresh()->getAttributes();
    $checksum = $manual->source_file_checksum;
    expect($parent->refresh()->status)->toBe('COLLECTING_SOURCES')->and($parent->source_file_path)->toBeNull();
    retryClaim()->assertNoContent();
    $this->travelTo($cashless->refresh()->retry_available_at);
    $token = retryClaim('hybrid-roberto')->assertOk()->json('data.claim_token');
    foreach (['WAITING_REPORT', 'DOWNLOADING'] as $status) {
        $this->postJson(route('internal.report-jobs.progress', $cashless), ['status' => $status], retryHeaders('hybrid-roberto', $token))->assertOk();
    }
    $csv = "Cnote No,HO Date\nTG123456789,01-OCT-2026 12:00\n";
    foreach ([1, 2] as $replay) {
        $this->postJson(route('internal.report-jobs.source-upload', $cashless), ['file' => UploadedFile::fake()->createWithContent('cashless.csv', $csv)], retryHeaders('hybrid-roberto', $token))->assertOk();
        app(CombineHybridReports::class)->handle($parent->id);
    }
    expect($parent->refresh()->status)->toBe('WAITING_APEX')->and($parent->awb_count)->toBe(2)
        ->and($manual->refresh()->getAttributes())->toBe($saved)->and(hash_file('sha256', Storage::disk('jne_reports')->path($manual->source_file_path)))->toBe($checksum);
    expect(DB::table('report_job_events')->where('report_job_id', $parent->id)->where('status', 'WAITING_APEX')->count())->toBe(1);
    retryClaim()->assertOk()->assertJsonPath('data.id', $parent->id);
    retryClaim()->assertNoContent();
    $this->assertDatabaseCount('report_jobs', 3);
});

test('an authorized manual recovery opens a bounded cycle without resetting lifetime attempts or saved sources', function () {
    $this->withoutVite();
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $parent = ReportJob::factory()->create(['source' => 'hybrid', 'report_type' => 'combined', 'customer_account' => 'HYBRID_PM', 'status' => 'NEEDS_ATTENTION']);
    $child = ReportJob::factory()->create(['source' => 'roberto', 'report_type' => 'cashless', 'hybrid_batch_id' => $parent->id, 'status' => 'NEEDS_ATTENTION', 'attempt_count' => 3, 'retry_classification' => 'EXHAUSTED', 'retry_protocol' => 1]);
    $manual = ReportJob::factory()->create(['source' => 'roberto', 'report_type' => 'manual', 'hybrid_batch_id' => $parent->id, 'status' => 'SOURCE_SAVED', 'source_file_path' => 'saved.csv']);
    $saved = $manual->refresh()->getAttributes();
    $this->actingAs(User::factory()->create(['role' => 'staff_pickup']))->post(route('report-runs.retry-sources', $parent))->assertForbidden();
    $this->actingAs($admin)->post(route('report-runs.retry-sources', $parent))->assertRedirect();
    $events = DB::table('report_job_events')->count();
    $this->postJson(route('report-runs.retry-sources', $parent))->assertConflict();
    $this->assertDatabaseCount('report_job_events', $events);
    expect($child->refresh()->attempt_count)->toBe(3)->and($parent->refresh()->status)->toBe('COLLECTING_SOURCES');
    foreach ([4, 5] as $attempt) {
        $token = retryClaim('hybrid-roberto')->assertOk()->assertJsonPath('data.id', $child->id)->assertJsonPath('data.attempt_count', $attempt)->json('data.claim_token');
        retryFailure($child, $token, 'hybrid-roberto')->assertOk();
        if ($attempt === 4) {
            $this->travelTo($child->refresh()->retry_available_at);
        }
    }
    expect($child->refresh()->status)->toBe('NEEDS_ATTENTION')->and($child->attempt_count)->toBe(5)
        ->and($manual->refresh()->getAttributes())->toBe($saved)->and($parent->refresh()->status)->toBe('NEEDS_ATTENTION');
    expect(DB::table('report_job_events')->where('report_job_id', $child->id)->where('message', 'like', 'Admin #'.$admin->id.'%')->count())->toBe(1);
});

test('run detail exposes retry evidence but never the internal parameters or worker ownership tokens', function () {
    $this->withoutVite();
    $parent = ReportJob::factory()->create(['source' => 'hybrid', 'report_type' => 'combined', 'customer_account' => 'HYBRID_PM', 'status' => 'COLLECTING_SOURCES']);
    $child = ReportJob::factory()->create(['source' => 'roberto', 'report_type' => 'cashless', 'hybrid_batch_id' => $parent->id]);
    $token = retryClaim('hybrid-roberto')->assertOk()->json('data.claim_token');
    retryFailure($child, $token, 'hybrid-roberto', ['error_message' => 'HYBRID_ERROR: [prepare_csv] gagal', 'error_stage' => 'prepare_csv', 'root_cause' => 'UNCLASSIFIED'])->assertOk();
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->get(route('report-runs.index'))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('runs.data.0.sources.0.cycle_attempt', 1)->where('runs.data.0.sources.0.max_attempts', 2)
        ->where('runs.data.0.sources.0.retry_classification', 'UNKNOWN')->where('runs.data.0.sources.0.error_stage', 'prepare_csv')
        ->has('runs.data.0.sources.0.events', 2)->missing('runs.data.0.sources.0.parameters')->missing('runs.data.0.sources.0.claim_token'));
});
