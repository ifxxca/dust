<?php

use App\Models\JneReportProfile;
use App\Models\ReportJob;
use App\Models\User;

test('historical reports split apex periods and collect both hybrid types daily without changing schedules', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor', 'is_active' => true]);
    $apex = JneReportProfile::factory()->create(['enabled' => true, 'customer_account' => '81609900', 'national_account' => 'Y', 'created_by' => $admin->id]);
    $profiles = collect([$apex]);
    foreach (['HYBRID_PM', 'HYBRID_PUMAN'] as $account) {
        $profiles->push(JneReportProfile::factory()->create(['enabled' => true, 'source' => 'hybrid', 'report_type' => 'combined', 'customer_account' => $account, 'created_by' => $admin->id]));
    }
    JneReportProfile::factory()->create(['enabled' => true, 'report_type' => 'unresolved', 'created_by' => $admin->id]);
    JneReportProfile::factory()->create(['enabled' => false, 'created_by' => $admin->id]);
    $before = $profiles->mapWithKeys(fn ($profile) => [$profile->id => $profile->fresh()->getAttributes()])->all();

    $this->artisan('jne-reports:queue-range', ['from' => '2026-10-01', 'thru' => '2026-10-26', '--user' => $admin->id])->assertSuccessful();

    expect(ReportJob::where('source', 'apex')->orderBy('date_from')->get()->map(fn ($job) => [$job->date_from->toDateString(), $job->date_thru->toDateString(), $job->national_account])->all())
        ->toBe([
            ['2026-10-01', '2026-10-05', 'Y'], ['2026-10-06', '2026-10-10', 'Y'],
            ['2026-10-11', '2026-10-15', 'Y'], ['2026-10-16', '2026-10-20', 'Y'],
            ['2026-10-21', '2026-10-25', 'Y'], ['2026-10-26', '2026-10-26', 'Y'],
        ]);
    expect(ReportJob::where('source', 'hybrid')->where('status', 'COLLECTING_SOURCES')->count())->toBe(52);
    expect(ReportJob::where('source', 'apex')->distinct()->count('request_key'))->toBe(1);
    expect(ReportJob::where('source', 'hybrid')->distinct()->count('request_key'))->toBe(52);
    foreach (ReportJob::where('source', 'hybrid')->get() as $batch) {
        expect(ReportJob::where('request_key', $batch->request_key)->count())->toBe(3);
    }
    foreach (['roberto', 'nuralamt'] as $source) {
        foreach (['manual', 'cashless'] as $type) {
            expect(ReportJob::where('source', $source)->where('report_type', $type)->whereNotNull('hybrid_batch_id')->whereColumn('date_from', 'date_thru')->count())->toBe(26);
        }
    }
    foreach ($profiles as $profile) {
        expect($profile->fresh()->getAttributes())->toBe($before[$profile->id]);
    }
    $this->artisan('jne-reports:queue-range', ['from' => '2026-10-01', 'thru' => '2026-10-26', '--user' => $admin->id])->assertSuccessful();
    $this->assertDatabaseCount('report_jobs', 162);
});

test('historical requests reuse completed and uncertain existing periods and respect source selection', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor', 'is_active' => true]);
    $profile = JneReportProfile::factory()->create(['enabled' => true, 'created_by' => $admin->id]);
    JneReportProfile::factory()->create(['enabled' => true, 'source' => 'hybrid', 'report_type' => 'combined', 'customer_account' => 'HYBRID_PM', 'created_by' => $admin->id]);
    foreach ([['2026-10-01', '2026-10-05', 'COMPLETED'], ['2026-10-06', '2026-10-10', 'NEEDS_ATTENTION']] as [$from, $thru, $status]) {
        ReportJob::factory()->create(['customer_account' => $profile->customer_account, 'date_from' => $from, 'date_thru' => $thru, 'status' => $status]);
    }

    $this->artisan('jne-reports:queue-range', ['from' => '2026-10-01', 'thru' => '2026-10-11', '--user' => $admin->id, '--source' => 'apex'])->assertFailed();

    $this->assertDatabaseCount('report_jobs', 3);
    expect(ReportJob::whereDate('date_from', '2026-10-11')->whereDate('date_thru', '2026-10-11')->sole()->status)->toBe('QUEUED');
    expect(ReportJob::where('source', 'hybrid')->exists())->toBeFalse();
});

test('historical requests reject invalid ranges and inactive actors without creating work', function (array $arguments, bool $active) {
    $admin = User::factory()->create(['role' => 'admin_supervisor', 'is_active' => $active]);
    JneReportProfile::factory()->create(['enabled' => true, 'created_by' => $admin->id]);

    $this->artisan('jne-reports:queue-range', [...$arguments, '--user' => $admin->id])->assertFailed();

    $this->assertDatabaseCount('report_jobs', 0);
})->with([
    [['from' => '2026-10-02', 'thru' => '2026-10-01'], true],
    [['from' => '2026-02-30', 'thru' => '2026-10-01'], true],
    [['from' => '2025-01-01', 'thru' => '2026-10-01'], true],
    [['from' => '2026-10-01', 'thru' => '2026-10-02'], false],
]);
