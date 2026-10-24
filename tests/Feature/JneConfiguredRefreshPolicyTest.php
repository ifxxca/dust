<?php

use App\Actions\Reports\ManageJneRefreshPolicy;
use App\Actions\Reports\QueryActiveJneAwbs;
use App\Actions\Reports\QueueScheduledJneReports;
use App\Models\JneReportAwb;
use App\Models\JneReportProfile;
use App\Models\JneShipment;
use App\Models\JneShipmentObservation;
use App\Models\ReportJob;
use App\Models\User;

beforeEach(function () {
    $this->withoutVite();
    $this->travelTo('2026-10-25 05:00:00 UTC');
    config(['jne-reports.tracking_policies_enabled' => true]);
});

function configuredRefreshPolicy(): array
{
    return ['enabled' => true, 'intervals' => ['IN_TRANSIT' => 180, 'UNKNOWN' => 60, 'DELIVERED' => 120], 'terminal_statuses' => ['DELIVERED'], 'terminal_confirmations' => 2,
        'sla_after_days' => 5, 'sla_interval_minutes' => 30, 'priority_statuses' => ['EXCEPTION'], 'availability_hours' => [], 'failure_backoff_minutes' => 20, 'max_failure_backoff_minutes' => 120];
}

test('terminal confirmation uses consecutive distinct observation times and never old terminal totals', function () {
    $policy = configuredRefreshPolicy();
    $shipment = JneShipment::factory()->create(['tracking_status' => 'DELIVERED']);
    foreach ([['DELIVERED', 3], ['IN_TRANSIT', 2], ['DELIVERED', 1], ['DELIVERED', 1]] as [$status, $days]) {
        JneShipmentObservation::factory()->create(['jne_shipment_id' => $shipment->id, 'tracking_status' => $status, 'observed_at' => now()->subDays($days), 'created_at' => now()->subHours(4)]);
    }
    expect(app(QueryActiveJneAwbs::class)->due(60, 30, $policy)->whereKey($shipment->id)->exists())->toBeTrue();
    JneShipmentObservation::factory()->create(['jne_shipment_id' => $shipment->id, 'tracking_status' => 'DELIVERED', 'observed_at' => now(), 'created_at' => now()->subHours(4)]);
    expect(app(QueryActiveJneAwbs::class)->handle(60, $policy)->whereKey($shipment->id)->exists())->toBeFalse();
});

test('configured SLA and priority scheduling keeps report receipt floors and never activates a schedule when saved', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $profile = JneReportProfile::factory()->create(['source' => 'apex', 'report_type' => 'unresolved', 'customer_account' => 'AWB_AKTIF', 'enabled' => false, 'interval_minutes' => 30, 'lookback_days' => 60]);
    $payload = ['definition' => configuredRefreshPolicy(), 'verified' => true, 'reason' => 'Synthetic policy verified', 'version' => $profile->version];
    $this->actingAs($admin)->post(route('jne-refresh.store', $profile), $payload)->assertRedirect()->assertSessionHasNoErrors();
    expect($profile->fresh()->enabled)->toBeFalse();
    $this->postJson(route('jne-refresh.store', $profile), $payload)->assertConflict();
    $source = JneReportAwb::factory()->create(['entry_at' => now()->subDays(8)]);
    $risk = JneShipment::factory()->create(['awb' => 'RISK', 'tracking_status' => 'IN_TRANSIT', 'latest_report_awb_id' => $source->id]);
    JneShipmentObservation::factory()->create(['jne_shipment_id' => $risk->id, 'created_at' => now()->subMinutes(31)]);
    $fresh = JneShipment::factory()->create(['awb' => 'FRESH', 'tracking_status' => 'IN_TRANSIT', 'latest_report_awb_id' => $source->id]);
    JneShipmentObservation::factory()->create(['jne_shipment_id' => $fresh->id, 'created_at' => now()->subMinutes(29)]);
    JneShipment::factory()->create(['awb' => 'NEW', 'tracking_status' => 'UNKNOWN']);
    $profile->refresh()->update(['enabled' => true, 'next_run_at' => now()]);
    app(QueueScheduledJneReports::class)->queueProfile($profile->id);
    expect(ReportJob::where('report_type', 'unresolved')->sole()->parameters['awbs'])->toBe(['NEW', 'RISK']);
});

test('configured source hours and bounded failure backoff avoid repeating uncertain external work', function () {
    $policy = configuredRefreshPolicy();
    $policy['availability_hours'] = [13];
    $profile = JneReportProfile::factory()->create(['source' => 'apex', 'report_type' => 'unresolved', 'customer_account' => 'AWB_AKTIF', 'enabled' => true,
        'refresh_policy' => ['definition' => $policy, 'verified_at' => now()->toIso8601String()]]);
    expect(app(QueueScheduledJneReports::class)->queueProfile($profile->id, true))->toBe(0);
    expect($profile->fresh()->next_run_at->hour)->toBe(6);
    $policy['availability_hours'] = [];
    $profile->update(['refresh_policy' => ['definition' => $policy, 'verified_at' => now()->toIso8601String()]]);
    ReportJob::factory()->count(3)->create(['source' => 'apex', 'report_type' => 'unresolved', 'customer_account' => 'AWB_AKTIF', 'status' => 'NEEDS_ATTENTION', 'reviewed_at' => null]);
    expect(app(QueueScheduledJneReports::class)->queueProfile($profile->id, true))->toBe(0);
    expect($profile->fresh()->next_run_at->equalTo(now()->addMinutes(80)))->toBeTrue();
    expect(ReportJob::where('status', 'QUEUED')->count())->toBe(0);
});

test('tracking policy activation rejects unverified semantics and non Admin writes', function () {
    $profile = JneReportProfile::factory()->create(['source' => 'apex', 'report_type' => 'unresolved']);
    $payload = ['definition' => configuredRefreshPolicy(), 'verified' => true, 'reason' => 'Synthetic verified policy', 'version' => 1];
    $this->actingAs(User::factory()->create(['role' => 'retail_staff']))->postJson(route('jne-refresh.store', $profile), $payload)->assertForbidden();
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']));
    config(['jne-reports.tracking_policies_enabled' => false]);
    $this->postJson(route('jne-refresh.store', $profile), $payload)->assertConflict();
    $payload['definition']['enabled'] = false;
    $this->post(route('jne-refresh.store', $profile), [...$payload, 'verified' => false])->assertRedirect();
    expect(ManageJneRefreshPolicy::active($profile->fresh()))->toBeNull();
});
