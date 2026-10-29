<?php

use App\Actions\Reports\ManageReportJobs;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;

test('confirmed upstream failures can retry once with an audit event and their original source files', function (bool $hybrid) {
    $admin = User::factory()->create(['role' => 'admin_supervisor', 'is_active' => true]);
    $job = ReportJob::factory()->create([
        'created_by' => $admin->id, 'source' => $hybrid ? 'hybrid' : 'apex',
        'report_type' => $hybrid ? 'combined' : 'apex', 'report_mode' => $hybrid ? 'A' : 'P',
        'status' => 'NEEDS_ATTENTION', 'attempt_count' => 1,
        'error_message' => 'APEX_SOURCE_API: History confirmed Error API 500 without CSV.',
        'source_file_path' => $hybrid ? 'report-jobs/source.csv' : null,
        'source_row_count' => $hybrid ? 897 : null, 'source_file_checksum' => $hybrid ? str_repeat('a', 64) : null,
        'worker_id' => 'jne-report-1-instance-2', 'claim_key' => (string) Str::uuid(), 'claim_token' => str_repeat('token', 10),
    ]);

    app(ManageReportJobs::class)->retryApexSourceFailure($job->id, $admin->id);

    $job->refresh();
    expect($job->status)->toBe($hybrid ? 'WAITING_APEX' : 'QUEUED');
    expect($job->only(['worker_id', 'claim_key', 'claim_token', 'error_message']))->toBe(['worker_id' => null, 'claim_key' => null, 'claim_token' => null, 'error_message' => null]);
    expect($job->source_file_path)->toBe($hybrid ? 'report-jobs/source.csv' : null);
    expect($job->source_row_count)->toBe($hybrid ? 897 : null);
    expect($job->source_file_checksum)->toBe($hybrid ? str_repeat('a', 64) : null);
    expect($job->attempt_count)->toBe(1);
    $this->assertDatabaseHas('report_job_events', ['report_job_id' => $job->id,
        'message' => 'Admin #'.$admin->id.' mengulang satu kali kegagalan APEX terkonfirmasi: APEX_SOURCE_API: History confirmed Error API 500 without CSV.']);
    $this->assertDatabaseCount('report_jobs', 1);
})->with([false, true]);

test('source failure retries reject uncertain completed repeated or still owned work', function (array $changes) {
    $job = ReportJob::factory()->create([
        'status' => 'NEEDS_ATTENTION', 'attempt_count' => 1,
        'error_message' => 'APEX_SOURCE_API: History confirmed Error API 500.', ...$changes,
    ]);
    $before = $job->fresh()->getAttributes();

    expect(fn () => app(ManageReportJobs::class)->retryApexSourceFailure($job->id, $job->created_by))->toThrow(HttpException::class);

    expect($job->fresh()->getAttributes())->toBe($before);
    $this->assertDatabaseCount('report_job_events', 0);
})->with([
    [['error_message' => 'REPORT_TIMEOUT: response uncertain']],
    [['error_message' => 'HISTORY_UNCONFIRMED: no correlated history']],
    [['attempt_count' => 2]],
    [['status' => 'COMPLETED', 'file_path' => 'result.csv']],
    [['active_slot' => 4]],
    [['lease_expires_at' => now()->addMinute()]],
    [['report_type' => 'unresolved', 'report_mode' => 'A']],
]);

test('retry command only selects confirmed source errors within the requested dates', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor', 'is_active' => true]);
    $eligible = ReportJob::factory()->create(['status' => 'NEEDS_ATTENTION', 'attempt_count' => 1, 'error_message' => 'APEX_SOURCE_API: confirmed native failure']);
    $uncertain = ReportJob::factory()->create(['status' => 'NEEDS_ATTENTION', 'attempt_count' => 1, 'error_message' => 'REPORT_TIMEOUT: uncertain']);
    $outside = ReportJob::factory()->create(['date_from' => '2026-10-27', 'date_thru' => '2026-10-27', 'status' => 'NEEDS_ATTENTION', 'attempt_count' => 1, 'error_message' => 'APEX_SOURCE_API: confirmed native failure']);

    $this->artisan('jne-reports:retry-source-failures', ['from' => '2026-10-01', 'thru' => '2026-10-26', '--user' => $admin->id])->assertSuccessful();

    expect($eligible->fresh()->status)->toBe('QUEUED');
    expect($uncertain->fresh()->status)->toBe('NEEDS_ATTENTION');
    expect($outside->fresh()->status)->toBe('NEEDS_ATTENTION');
});

test('retry command requires an active supervisor', function () {
    $user = User::factory()->create(['role' => 'admin_supervisor', 'is_active' => false]);
    $job = ReportJob::factory()->create(['status' => 'NEEDS_ATTENTION', 'attempt_count' => 1, 'error_message' => 'APEX_SOURCE_API: confirmed native failure']);

    $this->artisan('jne-reports:retry-source-failures', ['from' => '2026-10-01', 'thru' => '2026-10-26', '--user' => $user->id])->assertFailed();

    expect($job->fresh()->status)->toBe('NEEDS_ATTENTION');
    $this->assertDatabaseCount('report_job_events', 0);
});
