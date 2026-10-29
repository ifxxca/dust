<?php

use App\Models\ReportJob;
use Illuminate\Support\Str;

beforeEach(function () {
    config(['jne-reports.worker_token' => str_repeat('pool-secret', 4), 'jne-reports.worker_id' => 'jne-report-1',
        'jne-reports.apex_pool_enabled' => true, 'jne-reports.apex_concurrency' => 5]);
});

function apexPoolHeaders(int $instance, ?string $claim = null): array
{
    return ['Authorization' => 'Bearer '.config('jne-reports.worker_token'),
        'X-Worker-ID' => 'jne-report-1'.($instance ? '-instance-'.$instance : ''), 'X-Report-Claim' => $claim ?? ''];
}

test('five pool workers claim five distinct jobs while a sixth identity is rejected', function () {
    $jobs = collect(range(1, 6))->map(fn ($index) => ReportJob::factory()->create(['customer_account' => 'POOL'.$index]));
    foreach (range(1, 5) as $instance) {
        $key = (string) Str::uuid();
        $response = $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => $key], apexPoolHeaders($instance))
            ->assertOk()->assertJsonPath('data.id', $jobs[$instance - 1]->id);
        $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => $key], apexPoolHeaders($instance))
            ->assertOk()->assertJsonPath('data.claim_token', $response->json('data.claim_token'));
        $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], apexPoolHeaders($instance))->assertNoContent();
    }
    $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], apexPoolHeaders(6))->assertForbidden();
    expect(ReportJob::whereNotNull('active_slot')->pluck('active_slot')->sort()->values()->all())->toBe([4, 5, 6, 7, 8]);
    expect($jobs->last()->fresh()->status)->toBe('QUEUED');
});

test('pool claims serialize periods of an in flight customer and keep processing other accounts', function () {
    $first = ReportJob::factory()->create(['customer_account' => 'SAME', 'date_from' => '2026-10-01', 'date_thru' => '2026-10-02']);
    $duplicate = ReportJob::factory()->create(['customer_account' => 'SAME', 'date_from' => '2026-10-06', 'date_thru' => '2026-10-10']);
    $other = ReportJob::factory()->create(['customer_account' => 'OTHER']);
    $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], apexPoolHeaders(1))->assertOk()->assertJsonPath('data.id', $first->id);
    $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], apexPoolHeaders(2))->assertOk()->assertJsonPath('data.id', $other->id);
    expect($duplicate->fresh()->status)->toBe('QUEUED');
});

test('legacy worker drains its current job without claiming more when the pool is enabled', function () {
    config(['jne-reports.apex_pool_enabled' => false]);
    $old = ReportJob::factory()->create(['customer_account' => 'OLD']);
    $claim = $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], apexPoolHeaders(0))->assertOk()->json('data.claim_token');
    ReportJob::factory()->create(['customer_account' => 'NEW']);
    config(['jne-reports.apex_pool_enabled' => true]);
    $this->postJson(route('internal.report-jobs.progress', $old), ['status' => 'WAITING_REPORT'], apexPoolHeaders(0, $claim))->assertOk();
    $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], apexPoolHeaders(0))->assertNoContent();
    $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], apexPoolHeaders(1))->assertOk();
    expect($old->fresh()->status)->toBe('WAITING_REPORT');
});

test('workers cannot update another instance job and failure releases only the owning slot', function () {
    $first = ReportJob::factory()->create(['customer_account' => 'FIRST']);
    $second = ReportJob::factory()->create(['customer_account' => 'SECOND']);
    $firstClaim = $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], apexPoolHeaders(1))->assertOk()->json('data.claim_token');
    $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], apexPoolHeaders(2))->assertOk();
    $this->postJson(route('internal.report-jobs.progress', $first), ['status' => 'WAITING_REPORT'], apexPoolHeaders(2, $firstClaim))->assertForbidden();
    $this->postJson(route('internal.report-jobs.fail', $first), ['status' => 'NEEDS_ATTENTION', 'error_message' => 'Fixture: hasil belum pasti.'], apexPoolHeaders(1, $firstClaim))->assertOk();
    expect($first->fresh()->active_slot)->toBeNull();
    expect($second->fresh()->active_slot)->toBe(5);
    expect($second->fresh()->status)->toBe('RUNNING');
});

test('verified empty parameter reports finish without a fabricated CSV and release their slot idempotently', function () {
    $job = ReportJob::factory()->create(['source' => 'apex', 'report_type' => 'apex', 'report_mode' => 'P']);
    $claim = $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], apexPoolHeaders(1))->assertOk()->json('data.claim_token');
    $payload = ['status' => 'NO_DATA', 'error_message' => 'APEX_NO_DATA: History 123 mengonfirmasi No Data Found.'];
    $this->postJson(route('internal.report-jobs.fail', $job), $payload, apexPoolHeaders(1, $claim))->assertOk()->assertJsonPath('data.status', 'NO_DATA');
    $this->postJson(route('internal.report-jobs.fail', $job), $payload, apexPoolHeaders(1, $claim))->assertOk();
    expect($job->fresh()->status)->toBe('NO_DATA');
    expect($job->fresh()->row_count)->toBe(0);
    expect($job->fresh()->active_slot)->toBeNull();
    expect($job->fresh()->file_path)->toBeNull();
    expect($job->fresh()->error_message)->toBeNull();
    expect($job->fresh()->parameters['no_data_evidence'])->toBe($payload['error_message']);
    $this->assertDatabaseCount('report_job_events', 2);
});

test('an upload connote report cannot be marked empty by a parameter report result', function () {
    $job = ReportJob::factory()->create(['report_type' => 'unresolved', 'report_mode' => 'A']);
    $claim = $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], apexPoolHeaders(1))->assertOk()->json('data.claim_token');
    $this->postJson(route('internal.report-jobs.fail', $job), ['status' => 'NO_DATA', 'error_message' => 'APEX_NO_DATA: No Data Found.'], apexPoolHeaders(1, $claim))->assertUnprocessable();
    expect($job->fresh()->status)->toBe('RUNNING');
});

test('pausing the pool stops new claims while preserving heartbeat and claim replay', function () {
    $job = ReportJob::factory()->create();
    $key = (string) Str::uuid();
    $claim = $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => $key], apexPoolHeaders(1))->assertOk()->json('data.claim_token');
    ReportJob::factory()->create();
    config(['jne-reports.apex_pool_paused' => true]);
    $this->postJson(route('internal.report-jobs.progress', $job), ['status' => 'WAITING_REPORT'], apexPoolHeaders(1, $claim))->assertOk();
    $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => $key], apexPoolHeaders(1))->assertOk()->assertJsonPath('data.id', $job->id);
    $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], apexPoolHeaders(2))->assertNoContent();
});
