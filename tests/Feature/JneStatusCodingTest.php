<?php

use App\Actions\Reports\ClassifyJneShipmentStatus;
use App\Actions\Reports\ProjectJneShipments;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneShipmentObservation;
use App\Models\ReportJob;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;

beforeEach(function () {
    Http::preventStrayRequests();
    Queue::fake();
    config(['pickup.automation.enabled' => false, 'jne-reports.category_markers_enabled' => false]);
});

test('provided delivery codes classify independently of the display text', function (array $codes, string $expected) {
    foreach ($codes as $code) {
        $source = JneReportAwb::factory()->make(['status_web' => 'Unrecognized display', 'status_pod' => 'Success', 'awb_cancel' => '', 'raw_data' => ['CODING' => $code]]);

        expect(app(ClassifyJneShipmentStatus::class)->handle($source))->toBe($expected, $code);
    }
})->with([
    'delivery' => [['CR3', 'D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'D07', 'D08', 'D09', 'D10', 'D11', 'D12', 'D15', 'D16', 'D24', 'D25', 'DB1', 'DB2'], 'DELIVERED'],
    'completed return' => [['R01', 'R02', 'R03', 'R04', 'R05', 'R06', 'R07', 'R08', 'R09', 'R10', 'R11', 'R12', 'R13'], 'RETURNED'],
    'transit' => [['BI1', 'IP1', 'IP2', 'IP3', 'OP1', 'OP2', 'OP3', 'PU0', 'PU1', 'RC1', 'TP1', 'TP4', 'TP5'], 'IN_TRANSIT'],
    'cancelled' => [['CR2', 'CA'], 'CANCELLED'],
    'exceptions and unfinished returns' => [['CR1', 'CR4', 'CR5', 'CR6', 'CR7', 'DP5', 'NT', 'OC', 'OS', 'PS2', 'U01', 'U02', 'U03', 'U04', 'U05', 'U06', 'U07', 'U08', 'U09', 'U10', 'U11', 'U12', 'U13', 'U14', 'U21', 'U22', 'U23', 'U24', 'U25', 'UB2', 'X1', 'X10', 'IP3-INTL'], 'EXCEPTION'],
]);

test('coding and cancellation take precedence while missing and unknown coding use explicit status text', function (?string $code, string $web, string $cancel, string $expected) {
    $source = JneReportAwb::factory()->make(['raw_data' => ['CODING' => $code], 'status_web' => $web, 'status_pod' => 'Success', 'awb_cancel' => $cancel]);

    expect(app(ClassifyJneShipmentStatus::class)->handle($source))->toBe($expected);
})->with([
    ['D01', 'SHIPMENT PROBLEM', '', 'DELIVERED'], ['D01', 'DELIVERED', 'Y', 'CANCELLED'],
    ['U01', 'DELIVERED', '', 'EXCEPTION'], ['R01', 'DELIVERED', '', 'RETURNED'],
    [' d02 ', 'Display', '', 'DELIVERED'], ['="D04"', 'Display', '', 'DELIVERED'],
    [null, 'PROCESSED AT SORTING CENTER [TEST HUB]', '', 'IN_TRANSIT'],
    ['', 'PROCESSED AT TRANSIT [TEST HUB]', '', 'IN_TRANSIT'],
    ['', 'RECEIVED AT SORTING CENTER [TEST HUB]', '', 'IN_TRANSIT'],
    ['', 'PROCESS AND FORWARD TO [TEST HUB]', '', 'IN_TRANSIT'],
    ['', 'RECEIVED AT  TRANSIT [TEST HUB]', '', 'IN_TRANSIT'],
    ['', 'ARRIVE AT LAST FACILITY [TEST HUB]', '', 'IN_TRANSIT'],
    ['', 'ON DESTINATION CUSTOM CLEARANCE PROCESS', '', 'IN_TRANSIT'],
    ['U37', 'SHIPMENT  PROBLEM', '', 'EXCEPTION'],
    ['RFI', 'PACKAGE FAILED TO RETURN- PLEASE PICK UP AT JNE', '', 'EXCEPTION'],
    ['D37', 'SHIPPING PROBLEM', '', 'EXCEPTION'],
    ['', 'SHIPMENT BEING HELD DUE TO DID NOT PASS X-RAY CHECK DANGEROUS GOODS', '', 'EXCEPTION'],
    ['', 'SHIPMENT RETURN', '', 'EXCEPTION'],
    ['', 'RETURN SHIPMENT TO [TEST RECIPIENT]', '', 'RETURNED'],
    ['', 'DELIVERED TO TEST RECIPIENT', '', 'DELIVERED'],
    ['D99', 'FAILED', '', 'UNKNOWN'], ['', 'UNDELIVERED TO TEST RECIPIENT', '', 'UNKNOWN'],
    ['', 'Error On Push', '', 'UNKNOWN'], ['', '', '', 'UNKNOWN'],
]);

test('projection loads coding without the full raw payload and repeated reports retain a stable classification', function () {
    $report = ReportJob::factory()->create(['status' => 'COMPLETED', 'import_status' => 'IMPORTED']);
    $source = JneReportAwb::factory()->create(['report_job_id' => $report->id, 'status_web' => 'Display without a recognised status', 'status_pod' => null, 'awb_cancel' => null, 'raw_data' => ['CODING' => 'D01', 'PRIVATE_FIELD' => 'original evidence']]);

    app(ProjectJneShipments::class)->handle($report->id);
    app(ProjectJneShipments::class)->handle($report->id);

    expect(JneShipment::sole()->tracking_status)->toBe('DELIVERED');
    expect(JneShipmentObservation::sole()->tracking_status)->toBe('DELIVERED');
    expect($source->fresh()->raw_data)->toBe(['CODING' => 'D01', 'PRIVATE_FIELD' => 'original evidence']);
});

test('status recompilation corrects current and historical classifications without changing matching source evidence or observation times', function () {
    $older = JneReportAwb::factory()->create(['status_web' => 'Display', 'status_pod' => null, 'awb_cancel' => null, 'raw_data' => ['CODING' => 'D01']]);
    $newer = JneReportAwb::factory()->create(['awb' => $older->awb, 'status_web' => 'Display', 'status_pod' => null, 'awb_cancel' => null, 'raw_data' => ['CODING' => 'R01']]);
    $shipment = JneShipment::factory()->create(['awb' => $older->awb, 'latest_report_awb_id' => $newer->id, 'tracking_status' => 'UNKNOWN', 'status_signature' => str_repeat('a', 64)]);
    foreach ([$older, $newer] as $source) {
        JneShipmentObservation::factory()->create(['jne_shipment_id' => $shipment->id, 'jne_report_awb_id' => $source->id, 'tracking_status' => 'UNKNOWN', 'status_signature' => str_repeat('a', 64)]);
    }
    $shipment->refresh();
    $identity = array_intersect_key($shipment->getAttributes(), array_flip(['awb', 'customer_id', 'pickup_task_id', 'latest_report_awb_id', 'last_observed_at', 'match_status', 'category']));
    $sourceEvidence = JneReportAwb::orderBy('id')->get()->map->getAttributes()->all();
    $observationTimes = JneShipmentObservation::orderBy('id')->get()->map(fn ($row): array => array_intersect_key($row->getAttributes(), array_flip(['id', 'observed_at', 'created_at', 'changes_current'])))->all();

    $this->artisan('jne-monitoring:rebuild', ['--statuses-only' => true, '--dry-run' => true])->assertSuccessful();
    expect($shipment->fresh()->tracking_status)->toBe('UNKNOWN');
    $this->artisan('jne-monitoring:rebuild', ['--statuses-only' => true])->assertSuccessful();

    expect($shipment->fresh()->tracking_status)->toBe('RETURNED');
    expect(array_intersect_key($shipment->fresh()->getAttributes(), $identity))->toBe($identity);
    expect(JneShipmentObservation::orderBy('id')->pluck('tracking_status')->all())->toBe(['DELIVERED', 'RETURNED']);
    expect(JneShipmentObservation::orderBy('id')->get()->map(fn ($row): array => array_intersect_key($row->getAttributes(), array_flip(['id', 'observed_at', 'created_at', 'changes_current'])))->all())->toBe($observationTimes);
    expect(JneReportAwb::orderBy('id')->get()->map->getAttributes()->all())->toBe($sourceEvidence);
    $version = $shipment->fresh()->version;
    $this->artisan('jne-monitoring:rebuild', ['--statuses-only' => true])->expectsOutput('2 source rows classified; 0 shipment status corrections; 0 observation corrections.')->assertSuccessful();
    expect($shipment->fresh()->version)->toBe($version);
    $this->assertDatabaseCount('report_jobs', 2);
    Queue::assertNothingPushed();
    Http::assertNothingSent();
});

test('status recompilation restricts its correction scope to the requested report account', function () {
    foreach (['ACCOUNT_A', 'ACCOUNT_B'] as $account) {
        $report = ReportJob::factory()->create(['customer_account' => $account]);
        $source = JneReportAwb::factory()->create(['report_job_id' => $report->id, 'raw_data' => ['CODING' => 'D01'], 'awb_cancel' => null]);
        JneShipment::factory()->create(['awb' => $source->awb, 'latest_report_awb_id' => $source->id, 'customer_account' => $account, 'tracking_status' => 'UNKNOWN']);
    }

    $this->artisan('jne-monitoring:rebuild', ['--statuses-only' => true, '--account' => 'ACCOUNT_A'])->assertSuccessful();

    expect(JneShipment::orderBy('customer_account')->pluck('tracking_status')->all())->toBe(['DELIVERED', 'UNKNOWN']);
});
