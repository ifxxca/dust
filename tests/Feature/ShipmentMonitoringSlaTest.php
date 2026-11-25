<?php

use App\Actions\Reports\ImportReportAwbs;
use App\Actions\Reports\ProjectJneShipments;
use App\Actions\Reports\QueryShipmentMonitoring;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->withoutVite();
    $this->travelTo('2026-11-05 08:00:00 UTC');
});

/** @param array<string, mixed> $raw */
function slaMonitoringShipment(string $status, array $raw = [], string $service = 'REG23'): JneShipment
{
    $source = JneReportAwb::factory()->create([
        'service' => $service, 'destination' => 'BDO', 'entry_at' => '2026-11-01 01:00:00',
        'raw_data' => array_replace(['AGING' => '0', 'AGING_ONGOING' => '1', 'ETD' => '3', 'SLA' => '-3', 'CARRER' => 'On Time SLA (became)'], $raw),
    ]);

    return JneShipment::factory()->create([
        'awb' => $source->awb, 'latest_report_awb_id' => $source->id, 'tracking_status' => $status,
        'customer_id' => null, 'last_observed_at' => '2026-11-05 01:00:00',
    ]);
}

test('native SLA uses independent lifecycle and signed source grade without inventing deadlines', function (string $tracking, array $raw, string $service, string $expected, ?int $variance) {
    $shipment = slaMonitoringShipment($tracking, $raw, $service);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);

    $this->actingAs($admin)->get(route('shipment-monitoring.index'))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('shipments.data.0.sla_status', $expected)->where('shipments.data.0.sla_variance', $variance)->where('shipments.data.0.customer', null));
    $this->get(route('shipment-monitoring.show', $shipment->id))->assertOk()->assertInertia(fn (Assert $page) => $page->where('shipment.sla_status', $expected));
})->with([
    ['IN_TRANSIT', [], 'REG23', 'ON_TIME', -3],
    ['IN_TRANSIT', ['AGING_ONGOING' => '3'], 'JTR23', 'ON_TIME', -3],
    ['EXCEPTION', ['SLA' => '2', 'CARRER' => 'Over SLA'], 'REG23', 'OVER_SLA', 2],
    ['IN_TRANSIT', ['SLA' => '2', 'CARRER' => 'Over SLA (became)'], 'REG23', 'OVER_SLA', 2],
    ['DELIVERED', ['SLA' => '0', 'CARRER' => 'On Time SLA'], 'REG23', 'DELIVERED_ON_TIME', 0],
    ['DELIVERED', ['SLA' => '2', 'CARRER' => 'Over SLA'], 'YES23', 'DELIVERED_LATE', 2],
    ['DELIVERED', ['SLA' => '2', 'CARRER' => 'On Time SLA'], 'REG23', 'UNKNOWN', null],
    ['IN_TRANSIT', ['SLA' => '0', 'CARRER' => 'Over SLA (became)'], 'REG23', 'UNKNOWN', null],
    ['IN_TRANSIT', ['SLA' => null], 'REG23', 'UNKNOWN', null],
    ['IN_TRANSIT', ['SLA' => ''], 'REG23', 'UNKNOWN', null],
    ['IN_TRANSIT', ['SLA' => true], 'REG23', 'UNKNOWN', null],
    ['IN_TRANSIT', ['CARRER' => null], 'REG23', 'UNKNOWN', null],
    ['IN_TRANSIT', ['CARRER' => 'Unverified'], 'REG23', 'UNKNOWN', null],
    ['CANCELLED', [], 'REG23', 'EXCLUDED', null],
    ['RETURNED', [], 'REG23', 'RETURN', null],
    ['IN_TRANSIT', ['ETD' => null], 'REG23', 'ON_TIME', -3],
    ['IN_TRANSIT', ['ETD' => '', 'AGING_ONGOING' => '20'], 'REG23', 'ON_TIME', -3],
    ['IN_TRANSIT', ['ETD' => '0', 'AGING_ONGOING' => '0', 'SLA' => '0'], 'REG23', 'ON_TIME', 0],
    ['IN_TRANSIT', ['AGING_ONGOING' => null], 'REG23', 'ON_TIME', -3],
    ['DELIVERED', ['AGING' => null, 'CARRER' => 'On Time SLA'], 'REG23', 'DELIVERED_ON_TIME', -3],
    ['IN_TRANSIT', ['SLA' => '="-3"', 'CARRER' => '="On Time SLA (became)"'], 'CUSTOM', 'ON_TIME', -3],
    ['IN_TRANSIT', ['AGING_ONGOING' => '20'], 'CTCYES23', 'ON_TIME', -3],
    ['UNKNOWN', ['AGING_ONGOING' => '20'], 'REG23', 'UNKNOWN', null],
]);

test('operational attention counts unique unmapped AWBs and excludes late delivered cancelled and data quality alone', function () {
    $this->travelTo('2026-11-10 01:00:00 UTC');
    $overdue = slaMonitoringShipment('EXCEPTION', ['AGING_ONGOING' => '8']);
    $due = slaMonitoringShipment('IN_TRANSIT', ['SLA' => '1', 'CARRER' => 'Over SLA (became)']);
    $risk = slaMonitoringShipment('IN_TRANSIT', ['AGING_ONGOING' => '6']);
    $return = slaMonitoringShipment('RETURNED');
    slaMonitoringShipment('IN_TRANSIT');
    slaMonitoringShipment('UNKNOWN');
    slaMonitoringShipment('CANCELLED');
    slaMonitoringShipment('DELIVERED', ['AGING' => '5', 'SLA' => '2', 'CARRER' => 'Over SLA']);
    slaMonitoringShipment('DELIVERED', ['AGING' => '2', 'SLA' => '-1', 'CARRER' => 'On Time SLA']);
    slaMonitoringShipment('DELIVERED', ['SLA' => null], 'YES');
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    Queue::fake();
    Http::preventStrayRequests();

    $response = $this->actingAs($admin)->get(route('shipment-monitoring.attention', ['freshness_hours' => 6]));

    $response->assertOk()->assertInertia(fn (Assert $page) => $page->where('shipments.total', 4)->where('summary.attention', 4)->where('facets.total', 10)
        ->where('facets.over_sla', 1)->where('facets.potential_overdue', 2)->where('facets.unlinked', 10)
        ->where('facets.on_time_rate', 50)->where('facets.delivered_evaluated', 2)->where('facets.delivered_unknown', 1));
    expect(collect($response->inertiaProps('shipments.data'))->pluck('id')->all())->toBe([$due->id, $overdue->id, $risk->id, $return->id]);
    $this->get(route('shipment-monitoring.index', ['sla_status' => 'DELIVERED_LATE']))->assertOk()->assertInertia(fn (Assert $page) => $page->where('summary.total', 1)->where('summary.attention', 0));
    Queue::assertNothingPushed();
    Http::assertNothingSent();
});

test('SLA filters compose with indexed source scope and pagination while observation age never advances SLA', function () {
    $this->travelTo('2027-01-01 00:00:00 UTC');
    foreach (range(1, 22) as $index) {
        slaMonitoringShipment('IN_TRANSIT', ['SLA' => '4', 'CARRER' => 'Over SLA (became)', 'AGING_ONGOING' => '7']);
    }
    slaMonitoringShipment('IN_TRANSIT', ['AGING_ONGOING' => '10'], 'CTC23');
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $filters = ['date_from' => '2026-11-01', 'date_thru' => '2026-11-01', 'service' => 'REG23', 'destination' => 'BD', 'sla_status' => 'OVER_SLA', 'overdue_min' => 4, 'overdue_max' => 4, 'page' => 2, 'freshness_hours' => 6];

    $this->actingAs($admin)->get(route('shipment-monitoring.index', $filters))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('summary.total', 22)->where('shipments.total', 22)->has('shipments.data', 2)->where('summary.over_sla', 22)
        ->where('shipments.data.0.sla_variance', 4)->where('shipments.data.0.freshness', 'stale'));
    $this->getJson(route('shipment-monitoring.index', ['overdue_min' => 5, 'overdue_max' => 2]))->assertUnprocessable()->assertJsonValidationErrors('overdue_max');
    $this->getJson(route('shipment-monitoring.index', ['attention' => 'unlinked']))->assertUnprocessable()->assertJsonValidationErrors('attention');
});

test('MySQL SLA projection agrees with page filters and aggregates in an isolated database', function () {
    $database = 'shipment_sla_test_'.bin2hex(random_bytes(6));
    $original = config('database.default');
    $base = config('database.connections.mysql');
    config(['database.connections.sla_server' => [...$base, 'url' => null, 'database' => null]]);
    DB::connection('sla_server')->statement('CREATE DATABASE '.$database);
    config(['database.connections.sla_test' => [...$base, 'url' => null, 'database' => $database], 'database.default' => 'sla_test']);
    try {
        Artisan::call('migrate', ['--database' => 'sla_test', '--force' => true, '--no-interaction' => true]);
        $wanted = slaMonitoringShipment('IN_TRANSIT', ['AGING_ONGOING' => '="6"', 'ETD' => '="3"']);
        slaMonitoringShipment('DELIVERED', ['AGING' => '4', 'SLA' => '1', 'CARRER' => 'Over SLA']);
        slaMonitoringShipment('IN_TRANSIT', ['ETD' => '', 'SLA' => null]);
        $admin = User::factory()->create(['role' => 'admin_supervisor']);

        $this->actingAs($admin)->get(route('shipment-monitoring.attention'))->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('shipments.total', 1)->where('shipments.data.0.id', $wanted->id)->where('shipments.data.0.sla_variance', -3)->where('shipments.data.0.potential_overdue', true)
            ->where('facets.sla_distribution.DELIVERED_LATE', 1)->where('facets.sla_distribution.UNKNOWN', 1));
        $this->get(route('operational-performance', ['period' => 'custom', 'date_from' => '2026-11-01', 'date_thru' => '2026-11-01']))->assertOk()->assertInertia(fn (Assert $page) => $page->where('performance.summary.attention', 1));
        $trend = app(QueryShipmentMonitoring::class)->trend(['date_from' => '2026-11-01', 'date_thru' => '2026-11-05']);
        expect(array_sum(array_column($trend, 'entered')))->toBe(3);
        foreach ([
            [['SLA' => 0, 'CARRER' => 'On Time SLA'], 'ON_TIME'],
            [['SLA' => null], 'UNKNOWN'],
            [['SLA' => ''], 'UNKNOWN'],
            [['SLA' => true], 'UNKNOWN'],
            [['SLA' => false], 'UNKNOWN'],
            [['SLA' => ['invalid']], 'UNKNOWN'],
            [['SLA' => (object) ['invalid' => 1]], 'UNKNOWN'],
            [['SLA' => '="-3"', 'CARRER' => '="On Time SLA (became)"'], 'ON_TIME'],
            [['SLA' => '0', 'CARRER' => 'on time sla'], 'UNKNOWN'],
            [['SLA' => '1', 'CARRER' => 'Over SLA (became)'], 'OVER_SLA'],
            [['SLA' => '1', 'CARRER' => 'On Time SLA'], 'UNKNOWN'],
        ] as [$raw, $expected]) {
            $probe = slaMonitoringShipment('IN_TRANSIT', $raw);
            $result = app(QueryShipmentMonitoring::class)->listing(['shipment_id' => $probe->id])->firstOrFail();
            expect($result->getAttribute('native_sla_grade'))->toBe($expected);
        }
    } finally {
        config(['database.default' => $original]);
        DB::purge('sla_test');
        DB::connection('sla_server')->statement('DROP DATABASE '.$database);
        DB::purge('sla_server');
    }
})->group('mysql-monitoring');

test('shipment journey uses only explicit valid source events without inventing delivery for active shipments', function () {
    $shipment = slaMonitoringShipment('IN_TRANSIT', [
        'OUTBOUND_MANIFEST_DATE' => '02-nov-2026 22:00', 'INBOUND_MANIFEST_DATE' => '03-nov-2026 07:00',
        'DATE_1ST_ATTEMPT' => '31-feb-2026 10:00', 'TGL_RECEIVED' => '03-nov-2026 10:00',
    ]);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);

    $this->actingAs($admin)->get(route('shipment-monitoring.show', $shipment->id))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->has('journey', 2)->where('journey.0.label', 'Manifest outbound')->where('journey.0.at', '2026-11-02T15:00:00+00:00')
        ->where('journey.1.label', 'Manifest inbound'));
    $shipment->update(['tracking_status' => 'DELIVERED']);
    $this->get(route('shipment-monitoring.show', $shipment->id))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->has('journey', 3)->where('journey.2.label', 'Diterima'));
});

test('real CSV import projection and repeated evidence preserve SLA and unique shipment attention', function () {
    $this->travelTo('2026-11-05 03:00:00 UTC');
    Storage::fake('jne_reports');
    Queue::fake();
    Http::preventStrayRequests();
    $row = ['AWB' => 'SLAIMPORT001', 'ID_ACCOUNT' => 'SLA_TEST', 'SHIPPER_NAME' => 'UNMAPPED TEST', 'SERVICE' => 'REG23', 'DEST' => 'BDO',
        'STATUS_WEB' => 'ON PROCESS', 'STATUS_POD' => '', 'AWB_CANCEL' => '', 'TGL_ENTRY' => '2026-11-01 08:00:00',
        'TGL_TARIK_REPORT' => '2026-11-05T09:00:00+07:00', 'AGING' => '0', 'AGING_ONGOING' => '4', 'ETD' => '3', 'SLA' => '-3', 'CARRER' => 'On Time SLA (became)'];
    $stream = fopen('php://temp', 'w+b');
    fputcsv($stream, array_keys($row), ',', '"', '');
    fputcsv($stream, array_values($row), ',', '"', '');
    rewind($stream);
    $csv = stream_get_contents($stream);
    fclose($stream);
    $report = ReportJob::factory()->create(['source' => 'apex', 'customer_account' => 'SLA_TEST', 'status' => 'COMPLETED', 'file_path' => 'sla-test.csv',
        'started_at' => '2026-11-05 02:00:00', 'completed_at' => '2026-11-05 02:30:00', 'file_checksum' => hash('sha256', $csv)]);
    Storage::disk('jne_reports')->put('sla-test.csv', $csv);
    foreach (range(1, 2) as $attempt) {
        app(ImportReportAwbs::class)->handle($report->id);
        app(ProjectJneShipments::class)->handle($report->id);
    }

    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->get(route('shipment-monitoring.attention'))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('summary.attention', 1)->where('shipments.total', 1)->where('shipments.data.0.sla_status', 'ON_TIME')->where('shipments.data.0.native_sla_grade', 'ON_TIME')->where('shipments.data.0.potential_overdue', true));
    $this->assertDatabaseCount('jne_shipments', 1);
    $this->assertDatabaseCount('jne_shipment_observations', 1);
    expect(JneReportAwb::sole()->raw_data['AGING'])->toBe('0');
    Queue::assertNothingPushed();
    Http::assertNothingSent();
});
