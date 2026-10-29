<?php

use App\Actions\Reports\ManageReportJobs;
use App\Actions\Reports\QueueScheduledJneReports;
use App\Models\JneReportProfile;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Support\Str;

test('admin imports hundreds of accounts without queuing downloads or overwriting edited schedules', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $accounts = array_map(fn (int $i): array => ['customer_account' => str_pad((string) $i, 8, '0', STR_PAD_LEFT), 'national_account' => $i % 2 ? 'N' : 'Y'], range(1, 100));
    $payload = ['accounts' => $accounts, 'enabled' => false, 'interval_minutes' => 30, 'lookback_days' => 1];

    $this->actingAs($admin)->post(route('jne-monitoring.profile-bulk'), $payload)->assertRedirectToRoute('jne-monitoring.profiles')->assertSessionHasNoErrors();
    $this->assertDatabaseCount('jne_report_profiles', 100);
    $this->assertDatabaseCount('report_jobs', 0);
    $this->assertDatabaseHas('jne_report_profiles', ['customer_account' => '00000002', 'national_account' => 'Y', 'enabled' => false]);
    $profile = JneReportProfile::where('customer_account', '00000001')->sole();
    $profile->update(['interval_minutes' => 17]);

    $this->post(route('jne-monitoring.profile-bulk'), $payload)->assertSessionHasNoErrors();
    $this->assertDatabaseCount('jne_report_profiles', 100);
    expect($profile->fresh()->interval_minutes)->toBe(17);
});

test('conflicting national flags roll back the whole bulk import', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    JneReportProfile::factory()->create(['customer_account' => '80089400', 'national_account' => 'Y']);
    $this->actingAs($admin)->post(route('jne-monitoring.profile-bulk'), [
        'accounts' => [['customer_account' => '11729800', 'national_account' => 'N'], ['customer_account' => '80089400', 'national_account' => 'N']],
        'enabled' => false, 'interval_minutes' => 30, 'lookback_days' => 1,
    ])->assertSessionHasErrors('accounts.1.national_account');
    $this->assertDatabaseCount('jne_report_profiles', 1);
});

test('batch reports retain each national choice across date parts and worker claims', function () {
    config(['jne-reports.worker_id' => 'test-worker']);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $this->actingAs($admin)->post(route('jne-reports.store'), [
        'accounts' => [['customer_account' => '11729800', 'national_account' => 'N'], ['customer_account' => '80089400', 'national_account' => 'Y']],
        'date_from' => '2026-10-01', 'date_thru' => '2026-10-06',
    ])->assertRedirectToRoute('jne-reports.index')->assertSessionHasNoErrors();
    $this->assertDatabaseCount('report_jobs', 4);
    expect(ReportJob::get()->pluck('request_key')->unique())->toHaveCount(1);
    expect(ReportJob::where('customer_account', '80089400')->pluck('national_account')->unique()->all())->toBe(['Y']);
    $jobs = app(ManageReportJobs::class);
    expect($jobs->claim('test-worker', (string) Str::uuid())->national_account)->toBe('N');
    expect($jobs->claim('other-worker', (string) Str::uuid()))->toBeNull();
});

test('scheduled jobs snapshot national flags independently from later profile edits', function () {
    $this->travelTo('2026-10-23 08:00:00 UTC');
    $profile = JneReportProfile::factory()->create(['national_account' => 'Y', 'enabled' => true, 'lookback_days' => 1]);
    expect(app(QueueScheduledJneReports::class)->handle())->toBe(1);
    $profile->update(['national_account' => 'N']);
    expect(ReportJob::sole()->national_account)->toBe('Y');
});

test('bulk imports require admin access and report requests reject invalid or conflicting inputs', function () {
    $this->actingAs(User::factory()->create(['role' => 'cs']))->post(route('jne-monitoring.profile-bulk'), [])->assertForbidden();
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']));
    foreach ([
        [['customer_account' => '001', 'national_account' => 'YES']],
        [['customer_account' => '001', 'national_account' => 'Y'], ['customer_account' => ' 001 ', 'national_account' => 'N']],
        [['customer_account' => 123, 'national_account' => 'N']],
    ] as $accounts) {
        $this->postJson(route('jne-reports.store'), ['accounts' => $accounts, 'date_from' => '2026-10-23', 'date_thru' => '2026-10-23'])->assertUnprocessable();
    }
    $this->postJson(route('jne-reports.store'), ['accounts' => 'bad', 'date_from' => '2026-10-23', 'date_thru' => '2026-10-23'])->assertUnprocessable();
    $this->assertDatabaseCount('report_jobs', 0);
});
