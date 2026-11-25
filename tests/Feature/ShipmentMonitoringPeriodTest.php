<?php

use App\Actions\Reports\QueryShipmentMonitoring;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->withoutVite();
    $this->travelTo('2026-11-25 09:00:00 UTC');
});

function periodMonitoringShipment(string $entry, string $status = 'IN_TRANSIT', ?string $delivered = null): JneShipment
{
    $source = JneReportAwb::factory()->create(['entry_at' => $entry, 'delivered_at' => $delivered, 'raw_data' => ['SLA' => '1', 'CARRER' => 'Over SLA']]);

    return JneShipment::factory()->create(['awb' => $source->awb, 'latest_report_awb_id' => $source->id, 'tracking_status' => $status]);
}

test('all three monitoring pages default to the same fourteen operational days without changing detail access', function () {
    periodMonitoringShipment('2026-11-11 21:59:59');
    $wanted = periodMonitoringShipment('2026-11-11 22:00:00');
    periodMonitoringShipment('2026-11-25 22:00:00');
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']));
    foreach (['overview', 'index', 'attention'] as $route) {
        $this->get(route('shipment-monitoring.'.$route))->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('filters.date_from', '2026-11-12')->where('filters.date_thru', '2026-11-25')->where('summary.total', 1));
    }
    $this->get(route('shipment-monitoring.show', $wanted->id))->assertOk();
});

test('date time filtering uses WIB and includes the selected end minute on all pages', function () {
    periodMonitoringShipment('2026-11-24 17:29:59');
    periodMonitoringShipment('2026-11-24 17:30:00');
    periodMonitoringShipment('2026-11-24 17:30:59');
    periodMonitoringShipment('2026-11-24 17:31:00');
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']));
    foreach (['overview', 'index', 'attention'] as $route) {
        $this->get(route('shipment-monitoring.'.$route, ['date_from' => '2026-11-25T00:30', 'date_thru' => '2026-11-25T00:30']))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->where('summary.total', 2));
    }
    $this->getJson(route('shipment-monitoring.index', ['date_from' => '2026-11-25T00:31', 'date_thru' => '2026-11-25T00:30']))->assertUnprocessable()->assertJsonValidationErrors('date_thru');
    $this->getJson(route('shipment-monitoring.index', ['date_from' => '2026-02-31T00:30']))->assertUnprocessable()->assertJsonValidationErrors('date_from');
    $this->getJson(route('shipment-monitoring.index', ['date_from' => '2026-11-25T22:00', 'date_thru' => '2026-11-25']))->assertOk();
    $this->getJson(route('shipment-monitoring.index', ['date_from' => '2026-11-25', 'date_thru' => '2026-11-25T03:00']))->assertUnprocessable()->assertJsonValidationErrors('date_thru');
});

test('priority filters and pagination do not narrow overview KPIs', function () {
    foreach (range(1, 7) as $index) {
        periodMonitoringShipment('2026-11-25 01:00:00');
    }
    periodMonitoringShipment('2026-11-25 01:00:00', 'RETURNED');
    periodMonitoringShipment('2026-11-25 01:00:00', 'RETURNED');
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']));
    $this->get(route('shipment-monitoring.overview', ['page' => 2]))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('summary.total', 9)->where('priorityPage', 2)
        ->loadDeferredProps('attention-preview', fn (Assert $deferred) => $deferred->has('preview', 4)));
    $this->get(route('shipment-monitoring.overview', ['attention' => 'return']))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('summary.total', 9)->where('priorityCategory', 'return')
        ->loadDeferredProps('attention-preview', fn (Assert $deferred) => $deferred->has('preview', 2)->where('preview.0.tracking_status', 'RETURNED')));
});

test('shipment trend counts current unique AWBs and explicit deliveries within the selected entry cohort', function () {
    $shipment = periodMonitoringShipment('2026-11-24 22:30:00', 'DELIVERED', '2026-11-25 01:00:00');
    JneReportAwb::factory()->create(['awb' => $shipment->awb, 'entry_at' => '2026-11-24 22:30:00', 'delivered_at' => '2026-11-25 01:00:00']);
    periodMonitoringShipment('2026-11-24 23:00:00', 'DELIVERED');
    periodMonitoringShipment('2026-10-01 01:00:00', 'DELIVERED', '2026-11-25 01:00:00');
    $trend = app(QueryShipmentMonitoring::class)->trend(['date_from' => '2026-11-12', 'date_thru' => '2026-11-25']);
    expect($trend)->toHaveCount(14);
    expect($trend[13])->toBe(['date' => '2026-11-25', 'entered' => 2, 'delivered' => 1]);
    expect(array_sum(array_column($trend, 'entered')))->toBe(2);
});
