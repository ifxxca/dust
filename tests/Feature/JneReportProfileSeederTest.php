<?php

use App\Actions\Reports\QueueScheduledJneReports;
use App\Models\JneReportProfile;
use App\Models\ReportJob;
use App\Models\User;
use Database\Seeders\JneReportProfileSeeder;

test('seeded profiles are ready for the scheduler without creating fake report results', function () {
    $this->travelTo('2026-10-23 08:00:00 UTC');
    $admin = User::factory()->create(['role' => 'admin_supervisor', 'is_active' => true]);

    $this->seed(JneReportProfileSeeder::class);

    $this->assertDatabaseCount('jne_report_profiles', 4);
    $this->assertDatabaseCount('jne_shipments', 0);
    expect(JneReportProfile::get()->every(fn (JneReportProfile $profile): bool => $profile->enabled && $profile->interval_minutes === 30 && $profile->updated_by === $admin->id))->toBeTrue();
    $this->assertDatabaseHas('jne_report_profiles', ['source' => 'apex', 'report_type' => 'unresolved', 'lookback_days' => 60]);

    expect(app(QueueScheduledJneReports::class)->handle())->toBe(4);
    $this->assertDatabaseHas('report_jobs', ['source' => 'hybrid', 'report_type' => 'combined', 'status' => 'COLLECTING_SOURCES']);
    expect(ReportJob::where('source', 'hybrid')->count())->toBe(2);
    expect(ReportJob::where('source', 'hybrid')->get()->every(fn (ReportJob $job): bool => $job->date_from->toDateString() === '2026-10-23'))->toBeTrue();
    $this->assertDatabaseHas('report_jobs', ['source' => 'apex', 'report_type' => 'apex', 'customer_account' => '20087000', 'status' => 'QUEUED']);
    $this->assertDatabaseHas('report_jobs', ['source' => 'apex', 'report_type' => 'unresolved', 'status' => 'NO_DATA']);
    $this->assertDatabaseCount('report_jobs', 8);
});

test('repeated seeding preserves edited schedules and their next run', function () {
    User::factory()->create(['role' => 'admin_supervisor', 'is_active' => true]);
    $this->seed(JneReportProfileSeeder::class);
    $profile = JneReportProfile::where('customer_account', 'HYBRID_PM')->sole();
    $profile->update(['enabled' => false, 'interval_minutes' => 17, 'next_run_at' => null]);

    $this->seed(JneReportProfileSeeder::class);

    $this->assertDatabaseCount('jne_report_profiles', 4);
    $this->assertDatabaseHas('jne_report_profiles', ['id' => $profile->id, 'enabled' => false, 'interval_minutes' => 17, 'next_run_at' => null]);
});

test('seeding requires an active administrator and does not create partial schedules', function () {
    User::factory()->create(['role' => 'admin_supervisor', 'is_active' => false]);
    User::factory()->create(['role' => 'cs', 'is_active' => true]);

    expect(fn () => $this->seed(JneReportProfileSeeder::class))->toThrow(RuntimeException::class, 'Buat Admin aktif');

    $this->assertDatabaseCount('jne_report_profiles', 0);
});
