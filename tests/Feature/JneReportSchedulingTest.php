<?php

use App\Actions\Reports\QueueScheduledJneReports;
use App\Models\Customer;
use App\Models\JneReportAwb;
use App\Models\JneReportProfile;
use App\Models\JneShipment;
use App\Models\ReportJob;
use App\Models\User;

beforeEach(function () {
    config(['pickup.timezone' => 'Asia/Jakarta']);
    $this->withoutVite();
});

test('fixed monthly profile queues six FIFO five day reports once per due cycle', function () {
    $this->travelTo('2026-10-21 00:00:00 UTC');
    $profile = JneReportProfile::factory()->create(['enabled' => true, 'mode' => 'fixed', 'date_from' => '2026-09-01', 'date_thru' => '2026-09-30']);

    $this->artisan('jne-reports:queue-due')->assertSuccessful();
    $this->artisan('jne-reports:queue-due')->assertSuccessful();

    $this->assertDatabaseCount('report_jobs', 6);
    $jobs = ReportJob::orderBy('id')->get();
    expect($jobs->map(fn (ReportJob $job): array => [$job->date_from->toDateString(), $job->date_thru->toDateString()])->all())->toBe([
        ['2026-09-01', '2026-09-05'], ['2026-09-06', '2026-09-10'], ['2026-09-11', '2026-09-15'],
        ['2026-09-16', '2026-09-20'], ['2026-09-21', '2026-09-25'], ['2026-09-26', '2026-09-30'],
    ]);
    expect($jobs->pluck('schedule_key')->unique())->toHaveCount(6);
    expect($jobs->pluck('request_key')->unique())->toHaveCount(1);
    expect($jobs->first()->request_key)->not->toBeNull();
    expect($jobs->pluck('status')->unique()->all())->toBe(['QUEUED']);
    expect($profile->fresh()->next_run_at->toIso8601String())->toBe('2026-10-21T06:00:00+00:00');
});

test('rolling profile includes older open shipment entry dates and excludes old terminal shipments', function () {
    $this->travelTo('2026-10-21 00:00:00 UTC');
    $profile = JneReportProfile::factory()->create(['enabled' => true, 'lookback_days' => 5, 'customer_account' => 'TESTACCOUNT']);
    $report = ReportJob::factory()->create(['status' => 'COMPLETED', 'import_status' => 'IMPORTED', 'projection_status' => 'PROJECTED']);
    $open = JneReportAwb::factory()->create(['report_job_id' => $report->id, 'entry_at' => '2026-01-10 00:00:00']);
    $closed = JneReportAwb::factory()->create(['report_job_id' => $report->id, 'entry_at' => '2026-01-01 00:00:00']);
    JneShipment::factory()->create(['latest_report_awb_id' => $open->id, 'tracking_status' => 'IN_TRANSIT']);
    JneShipment::factory()->create(['latest_report_awb_id' => $closed->id, 'tracking_status' => 'DELIVERED']);

    app(QueueScheduledJneReports::class)->handle();

    expect(ReportJob::where('jne_report_profile_id', $profile->id)->orderBy('id')->get()->map(fn (ReportJob $job): array => [$job->date_from->toDateString(), $job->date_thru->toDateString()])->all())->toBe([
        ['2026-01-10', '2026-01-10'], ['2026-10-17', '2026-10-21'],
    ]);
});

test('active or unreviewed failed account reports block automatic resubmission', function (string $status) {
    $profile = JneReportProfile::factory()->create(['enabled' => true, 'customer_account' => 'TESTACCOUNT']);
    ReportJob::factory()->create(['status' => $status]);

    expect(app(QueueScheduledJneReports::class)->handle())->toBe(0);

    $this->assertDatabaseCount('report_jobs', 1);
    expect($profile->fresh()->last_error)->toContain('belum diperiksa');
})->with(['QUEUED', 'RUNNING', 'WAITING_REPORT', 'DOWNLOADING', 'FAILED', 'NEEDS_ATTENTION']);

test('completed report with failed import or projection blocks refresh until reviewed', function (string $import, string $projection) {
    $profile = JneReportProfile::factory()->create(['enabled' => true, 'customer_account' => 'TESTACCOUNT']);
    ReportJob::factory()->create(['status' => 'COMPLETED', 'import_status' => $import, 'projection_status' => $projection]);

    expect(app(QueueScheduledJneReports::class)->handle())->toBe(0);

    expect($profile->fresh()->last_error)->not->toBeNull();
    $this->assertDatabaseCount('report_jobs', 1);
})->with([['FAILED', 'NOT_PROJECTED'], ['IMPORTED', 'FAILED'], ['QUEUED', 'NOT_PROJECTED'], ['IMPORTED', 'QUEUED']]);

test('review records active admin decision without retrying old job and permits next due cycle', function () {
    $profile = JneReportProfile::factory()->create(['enabled' => true, 'customer_account' => 'TESTACCOUNT', 'lookback_days' => 1]);
    $old = ReportJob::factory()->create(['status' => 'NEEDS_ATTENTION']);

    $this->actingAs(User::findOrFail($profile->updated_by))->post(route('jne-monitoring.review-report', $old->id), ['reason' => 'History diperiksa, hasil lama telah ditinjau.'])->assertRedirectToRoute('jne-monitoring.profiles');

    expect($old->fresh()->status)->toBe('NEEDS_ATTENTION');
    expect($old->fresh()->reviewed_by)->toBe($profile->updated_by);
    expect($old->fresh()->review_note)->toBe('History diperiksa, hasil lama telah ditinjau.');
    expect(app(QueueScheduledJneReports::class)->handle())->toBe(1);
    $this->assertDatabaseCount('report_jobs', 2);
});

test('disabled profiles and inactive administrators do not schedule JNE jobs', function () {
    JneReportProfile::factory()->create(['enabled' => false]);
    $inactive = User::factory()->create(['role' => 'admin_supervisor', 'is_active' => false]);
    $profile = JneReportProfile::factory()->create(['enabled' => true, 'updated_by' => $inactive->id]);

    expect(app(QueueScheduledJneReports::class)->handle())->toBe(0);

    expect($profile->fresh()->enabled)->toBeFalse();
    $this->assertDatabaseCount('report_jobs', 0);
});

test('overlapping windows merge into consecutive bounded date jobs with no duplicate dates', function () {
    expect(app(QueueScheduledJneReports::class)->periods([['2026-10-01', '2026-10-05'], ['2026-10-03', '2026-10-07'], ['2026-10-13', '2026-10-13']]))->toBe([
        ['2026-10-01', '2026-10-05'], ['2026-10-06', '2026-10-07'], ['2026-10-13', '2026-10-13'],
    ]);
});

test('oversized scheduled work remains visible instead of creating an unbounded queue', function () {
    $profile = JneReportProfile::factory()->create(['enabled' => true, 'mode' => 'fixed', 'date_from' => '2020-01-01', 'date_thru' => '2026-01-01']);

    expect(app(QueueScheduledJneReports::class)->handle())->toBe(0);

    expect($profile->fresh()->last_error)->toContain('terlalu banyak');
    $this->assertDatabaseCount('report_jobs', 0);
});

test('admin saves explicit account mapping and disabled profile then changes it with revision protection', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $customer = Customer::factory()->create();
    $payload = ['customer_account' => 'testaccount', 'customer_id' => $customer->id, 'enabled' => false, 'mode' => 'rolling', 'lookback_days' => 30, 'date_from' => null, 'date_thru' => null, 'interval_minutes' => 360];

    $this->actingAs($admin)->post(route('jne-monitoring.profile-store'), $payload)->assertRedirectToRoute('jne-monitoring.profiles')->assertSessionHasNoErrors();

    $profile = JneReportProfile::sole();
    expect($profile->customer_account)->toBe('TESTACCOUNT');
    expect($profile->enabled)->toBeFalse();
    expect($profile->next_run_at)->toBeNull();
    $this->put(route('jne-monitoring.profile-update', $profile->id), [...$payload, 'customer_account' => 'TESTACCOUNT', 'enabled' => true, 'version' => 1])->assertRedirectToRoute('jne-monitoring.profiles');
    expect($profile->fresh()->enabled)->toBeTrue();
    expect($profile->fresh()->version)->toBe(2);
    $this->put(route('jne-monitoring.profile-update', $profile->id), [...$payload, 'version' => 1])->assertConflict();
});

test('profile creation rejects unsafe ranges duplicate accounts and unsupported intervals', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    JneReportProfile::factory()->create(['customer_account' => 'TESTACCOUNT']);

    $this->actingAs($admin)->postJson(route('jne-monitoring.profile-store'), ['customer_account' => 'TESTACCOUNT', 'enabled' => true, 'mode' => 'fixed', 'lookback_days' => 0, 'date_from' => '2026-10-20', 'date_thru' => '2026-10-19', 'interval_minutes' => 1])->assertUnprocessable()->assertJsonValidationErrors(['customer_account', 'lookback_days', 'date_thru', 'interval_minutes']);

    $this->assertDatabaseCount('jne_report_profiles', 1);
});

test('review requires reason and normal successful report cannot be acknowledged as an error', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $failed = ReportJob::factory()->create(['status' => 'FAILED']);
    $success = ReportJob::factory()->create(['status' => 'COMPLETED', 'import_status' => 'IMPORTED', 'projection_status' => 'PROJECTED']);

    $this->actingAs($admin)->postJson(route('jne-monitoring.review-report', $failed->id), ['reason' => ''])->assertUnprocessable()->assertJsonValidationErrors('reason');
    $this->post(route('jne-monitoring.review-report', $success->id), ['reason' => 'No error'])->assertConflict();

    expect($failed->fresh()->reviewed_at)->toBeNull();
});
