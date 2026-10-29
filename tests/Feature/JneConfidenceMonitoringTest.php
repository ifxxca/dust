<?php

use App\Models\Customer;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneShipmentObservation;
use App\Models\PickupTask;
use App\Models\ReportJob;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->withoutVite();
});

function confidenceScenario(): Customer
{
    $customer = Customer::factory()->create();
    $pickup = PickupTask::factory()->create(['customer_id' => $customer->id]);
    $otherPickup = PickupTask::factory()->create();
    foreach ([['CONFIRMED', 'MATCHED', 'MATCHED', $pickup->id], ['REVIEW', 'CONFLICT', 'CONFLICT', $pickup->id],
        ['CANDIDATE', 'CANDIDATE', 'UNMATCHED', null], ['UNKNOWN', 'UNMATCHED', 'UNMATCHED', null],
        ['AMBIGUOUS', 'AMBIGUOUS', 'AMBIGUOUS', $pickup->id], ['WRONG_PICKUP', 'MATCHED', 'MATCHED', $otherPickup->id]] as [$awb, $customerStatus, $pickupStatus, $pickupId]) {
        $source = JneReportAwb::factory()->create(['awb' => $awb, 'customer_account' => 'SHARED', 'entry_at' => '2026-10-24 00:00:00']);
        JneShipment::factory()->create(['awb' => $awb, 'customer_account' => 'SHARED', 'customer_match_status' => $customerStatus,
            'customer_id' => $pickupId ? $customer->id : null, 'pickup_task_id' => $pickupId, 'match_status' => $pickupStatus,
            'latest_report_awb_id' => $source->id, 'latest_report_job_id' => $source->report_job_id]);
    }

    return $customer;
}

test('monitoring counts confidence independently and applies the same filters to summary and list', function () {
    confidenceScenario();
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']));
    $this->get(route('jne-monitoring.index'))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('identitySummary.collected', 6)->where('identitySummary.customer_matched', 2)->where('identitySummary.pickup_matched', 1)
        ->where('identitySummary.candidates', 1)->where('identitySummary.conflicts', 1)->where('identitySummary.ambiguous', 1)->where('identitySummary.unmatched', 1));
    $this->get(route('jne-monitoring.index', ['customer_match' => 'CONFLICT']))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('identitySummary.collected', 1)->where('identitySummary.customer_matched', 0)->where('identitySummary.pickup_matched', 0)
        ->where('shipments.total', 1)->where('shipments.data.0.awb', 'REVIEW'));
});

test('monitoring operations summary covers all filtered shipments independently of pagination', function (int $pageNumber, int $pageSize) {
    $report = ReportJob::factory()->create();
    for ($index = 1; $index <= 51; $index++) {
        $source = JneReportAwb::factory()->create(['report_job_id' => $report->id, 'source_row' => $index + 1, 'awb' => 'PAGED'.$index]);
        $shipment = JneShipment::factory()->create(['awb' => $source->awb, 'customer_account' => 'PAGED', 'match_status' => 'CONFLICT',
            'last_observed_at' => '2026-10-01 00:00:00', 'latest_report_awb_id' => $source->id, 'latest_report_job_id' => $report->id]);
        if ($index === 1) {
            JneReportAwb::factory()->create(['awb' => $source->awb]);
            JneShipmentObservation::factory()->create(['jne_shipment_id' => $shipment->id, 'jne_report_awb_id' => $source->id, 'created_at' => '2026-10-25 12:00:00']);
        }
    }
    $excluded = JneShipment::factory()->create(['customer_account' => 'OTHER']);
    $excludedSource = JneReportAwb::factory()->create(['awb' => $excluded->awb]);
    JneShipmentObservation::factory()->create(['jne_shipment_id' => $excluded->id, 'jne_report_awb_id' => $excludedSource->id, 'created_at' => '2026-10-26 12:00:00']);

    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))
        ->get(route('jne-monitoring.index', ['account' => 'PAGED', 'page' => $pageNumber, 'per_page' => 50]))
        ->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('jne-monitoring')
        ->where('shipments.total', 51)->where('shipments.current_page', $pageNumber)->has('shipments.data', $pageSize)
        ->where('operationsSummary.source_observations', 52)
        ->where('operationsSummary.pickup_conflicts', 51)
        ->where('operationsSummary.last_report_received_at', '2026-10-25 12:00:00'));
})->with(['first page' => [1, 50], 'second page' => [2, 1], 'empty page' => [3, 0]]);

test('customer dashboard excludes retained conflict pointers from customer scope and verified totals', function () {
    $customer = confidenceScenario();
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']));
    $period = ['date_from' => '2026-10-24', 'date_thru' => '2026-10-24'];
    $this->get(route('jne-monitoring.customer-dashboard', $period))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('summary.shipments', 6)->where('summary.mapped', 2)->where('summary.unmapped', 4)->where('summary.customers', 1)
        ->where('summary.pickup_matched', 1)->where('summary.candidates', 1)->where('summary.conflicts', 1));
    $this->get(route('jne-monitoring.customer-dashboard', [...$period, 'customer_id' => $customer->id]))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('summary.shipments', 2)->where('summary.unmapped', 0)->has('shipments.data', 2));
    foreach (['unmapped' => 4, 'candidate' => 1, 'conflict' => 1, 'ambiguous' => 1] as $mapping => $quantity) {
        $this->get(route('jne-monitoring.customer-dashboard', [...$period, 'mapping' => $mapping]))->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('summary.shipments', $quantity)->where('summary.mapped', 0)->where('summary.unmapped', $quantity));
    }
});

test('alias ownership summary includes candidate and conflict records that have no reusable mapping', function () {
    confidenceScenario();
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']));
    $this->get(route('jne-shipper-aliases.index'))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('ownership.total', 6)->where('ownership.recognized', 2)->where('ownership.candidates', 1)->where('ownership.conflicts', 1)
        ->where('ownership.ambiguous', 1)->where('ownership.unmatched', 1));
});
