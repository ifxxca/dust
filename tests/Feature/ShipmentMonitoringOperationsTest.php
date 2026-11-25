<?php

use App\Models\Customer;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->withoutVite();
    $this->travelTo('2026-11-02 08:00:00 UTC');
});

function operationsMonitoringRows(): void
{
    $customer = Customer::factory()->create();
    JneShipment::factory()->createMany([
        ['awb' => '001DELIVERED', 'customer_id' => $customer->id, 'tracking_status' => 'DELIVERED', 'last_observed_at' => '2026-11-02 07:00:00'],
        ['awb' => '002CANCELLED', 'customer_id' => $customer->id, 'tracking_status' => 'CANCELLED', 'last_observed_at' => '2026-10-01 01:00:00'],
        ['awb' => '003ACTIVE', 'customer_id' => $customer->id, 'tracking_status' => 'IN_TRANSIT', 'last_observed_at' => '2026-11-01 01:00:00'],
        ['awb' => '004EXCEPTION', 'customer_id' => $customer->id, 'tracking_status' => 'EXCEPTION', 'last_observed_at' => '2026-11-02 07:00:00'],
        ['awb' => '005UNKNOWN', 'customer_id' => null, 'tracking_status' => 'UNKNOWN', 'last_observed_at' => '2026-11-01 01:00:00'],
        ['awb' => '006RETURNED', 'customer_id' => $customer->id, 'tracking_status' => 'RETURNED', 'last_observed_at' => null],
    ])->each(function (JneShipment $shipment): void {
        $source = JneReportAwb::factory()->create(['entry_at' => now()->subDay(), 'awb' => $shipment->awb]);
        $shipment->update(['latest_report_awb_id' => $source->id]);
    });
}

test('overview aggregates distinct current shipments and bounded attention preview without mutations', function () {
    $this->travelTo('2026-11-02 08:00:00 UTC');
    operationsMonitoringRows();
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $before = JneShipment::orderBy('id')->get()->toArray();
    Queue::fake();
    Http::preventStrayRequests();

    $this->actingAs($admin)->get(route('shipment-monitoring.overview', ['freshness_hours' => 6]))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('shipment-monitoring-overview')->where('summary.total', 6)->where('summary.active', 2)
        ->where('summary.delivered', 1)->where('summary.cancelled', 1)->where('summary.unknown', 1)->where('summary.failed_final', null)
        ->where('summary.unlinked', 1)->where('summary.stale', 1)->where('summary.source_missing', 0)->where('summary.attention', 2)
        ->where('summary.distribution', ['DELIVERED' => 1, 'CANCELLED' => 1, 'RETURNED' => 1, 'IN_TRANSIT' => 1, 'EXCEPTION' => 1, 'UNKNOWN' => 1])
        ->where('summary.observed_at', '2026-11-02T07:00:00+00:00')->missing('preview')->loadDeferredProps('attention-preview', fn (Assert $deferred) => $deferred->has('preview', 2)));
    expect(JneShipment::orderBy('id')->get()->toArray())->toBe($before);
    Queue::assertNothingPushed();
    Http::assertNothingSent();
});

test('attention categories separate delivery quality and source evidence without counting a shipment twice', function (string $category, array $awbs) {
    $this->travelTo('2026-11-02 08:00:00 UTC');
    operationsMonitoringRows();
    $admin = User::factory()->create(['role' => 'admin_supervisor']);

    $response = $this->actingAs($admin)->get(route('shipment-monitoring.attention', ['attention' => $category, 'freshness_hours' => 6]));

    $response->assertOk()->assertInertia(fn (Assert $page) => $page->component('shipment-monitoring-attention')->where('shipments.total', count($awbs))->where('facets.total', 6)->where('facets.attention', 2));
    expect(collect($response->inertiaProps('shipments.data'))->pluck('awb')->sort()->values()->all())->toBe($awbs);
})->with([
    ['all', ['004EXCEPTION', '006RETURNED']],
    ['exception', ['004EXCEPTION']], ['return', ['006RETURNED']],
    ['over_sla', []], ['potential_overdue', []],
]);

test('freshness attention needs an explicit threshold and never silently assumes an SLA', function () {
    $this->travelTo('2026-11-02 08:00:00 UTC');
    operationsMonitoringRows();
    $admin = User::factory()->create(['role' => 'admin_supervisor']);

    $this->actingAs($admin)->get(route('shipment-monitoring.attention'))->assertOk()->assertInertia(fn (Assert $page) => $page->where('facets.stale', null)->where('shipments.total', 2));
    $this->getJson(route('shipment-monitoring.attention', ['attention' => 'stale']))->assertUnprocessable()->assertJsonValidationErrors('attention');
    $this->getJson(route('shipment-monitoring.attention', ['attention' => 'delayed']))->assertUnprocessable()->assertJsonValidationErrors('attention');
    $this->getJson(route('shipment-monitoring.index', ['customer_link' => 'guessed']))->assertUnprocessable()->assertJsonValidationErrors('customer_link');
});

test('customer filters and status tabs retain one consistent non-status scope', function () {
    operationsMonitoringRows();
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $customer = Customer::sole();

    $this->actingAs($admin)->get(route('shipment-monitoring.index', ['customer_id' => $customer->id, 'customer_link' => 'linked', 'status' => 'DELIVERED']))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('shipments.total', 1)->where('summary.total', 1)->where('facets.total', 5)->where('facets.delivered', 1)->where('facets.unknown', 0));
    $this->get(route('shipment-monitoring.index', ['customer_link' => 'unlinked']))->assertOk()->assertInertia(fn (Assert $page) => $page->where('shipments.total', 1)->where('shipments.data.0.customer', null));
    $this->get(route('shipment-monitoring.index', ['customer_id' => $customer->id, 'customer_link' => 'unlinked']))->assertOk()->assertInertia(fn (Assert $page) => $page->where('shipments.total', 0));
    $this->get(route('shipment-monitoring.index', ['q' => '001']))->assertOk()->assertInertia(fn (Assert $page) => $page->where('shipments.total', 1)->where('shipments.data.0.awb', '001DELIVERED')->where('facets.total', 1));
});

test('overview date cohorts preserve the 0500 Jakarta entry boundary', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    foreach (['2026-11-01 21:59:59', '2026-11-01 22:00:00', '2026-11-02 22:00:00'] as $entry) {
        $source = JneReportAwb::factory()->create(['entry_at' => $entry]);
        JneShipment::factory()->create(['latest_report_awb_id' => $source->id]);
    }

    $this->actingAs($admin)->get(route('shipment-monitoring.overview', ['date_from' => '2026-11-02', 'date_thru' => '2026-11-02']))->assertOk()->assertInertia(fn (Assert $page) => $page->where('summary.total', 1));
});

test('attention tab counts retain a selected tracking status and lifecycle scope', function () {
    operationsMonitoringRows();
    $admin = User::factory()->create(['role' => 'admin_supervisor']);

    $this->actingAs($admin)->get(route('shipment-monitoring.attention', ['status' => 'DELIVERED', 'lifecycle' => 'terminal']))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('shipments.total', 0)->where('facets.total', 1)->where('facets.unknown', 0)->where('facets.exception', 0)->where('facets.attention', 0));
});

test('all monitoring views keep existing role authorization', function (string $route, string $role) {
    $user = User::factory()->create(['role' => $role]);

    $this->actingAs($user)->get(route($route))->assertForbidden();
})->with(['shipment-monitoring.overview', 'shipment-monitoring.attention'])->with(['cs', 'retail_staff', 'pickup_staff']);

test('guest and inactive users cannot enter new monitoring views', function () {
    $this->get(route('shipment-monitoring.overview'))->assertRedirect(route('login'));
    $admin = User::factory()->create(['role' => 'admin_supervisor', 'is_active' => false]);

    $this->actingAs($admin)->get(route('shipment-monitoring.attention'))->assertForbidden();
});

test('detail keeps a safe filtered return path and existing source fields', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $source = JneReportAwb::factory()->create(['entry_at' => now()->subDay(), 'service' => 'REG', 'destination_name' => 'Bandung']);
    $shipment = JneShipment::factory()->create(['latest_report_awb_id' => $source->id]);

    $this->actingAs($admin)->get(route('shipment-monitoring.show', [$shipment->id, 'back' => 'attention', 'attention' => 'exception', 'return_page' => 2]))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('source.service', 'REG')->where('source.destination_name', 'Bandung')->where('returnTo', route('shipment-monitoring.attention', ['attention' => 'exception', 'page' => 2])));
    $this->getJson(route('shipment-monitoring.show', [$shipment->id, 'back' => 'https://example.com']))->assertUnprocessable()->assertJsonValidationErrors('back');
});

test('large isolated monitoring reads remain bounded and publish measured query plans', function () {
    $this->travelTo('2026-11-02 08:00:00 UTC');
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $report = ReportJob::factory()->create();
    for ($offset = 0; $offset < 30000; $offset += 500) {
        $rows = [];
        $sources = [];
        for ($i = $offset; $i < $offset + 500; $i++) {
            $awb = 'BENCH'.str_pad((string) $i, 8, '0', STR_PAD_LEFT);
            $rows[] = ['customer_account' => 'BENCH', 'awb' => $awb, 'tracking_status' => ['DELIVERED', 'IN_TRANSIT', 'UNKNOWN'][$i % 3], 'match_status' => 'UNMATCHED', 'last_observed_at' => '2026-11-02 01:00:00', 'created_at' => now(), 'updated_at' => now()];
            $sources[] = ['report_job_id' => $report->id, 'source_row' => $i + 1, 'awb' => $awb, 'customer_account' => 'BENCH', 'service' => 'REG23', 'entry_at' => '2026-10-28 01:00:00', 'raw_data' => json_encode(['AGING' => '2', 'AGING_ONGOING' => '5', 'ETD' => '3', 'SLA' => '-1', 'CARRER' => 'On Time SLA', 'fixture_padding' => str_repeat('x', 1000)], JSON_THROW_ON_ERROR)];
        }
        DB::table('jne_report_awbs')->insert($sources);
        $sourceIds = DB::table('jne_report_awbs')->where('report_job_id', $report->id)->whereBetween('source_row', [$offset + 1, $offset + 500])->pluck('id', 'awb');
        $rows = array_map(fn (array $row): array => [...$row, 'latest_report_awb_id' => $sourceIds[$row['awb']]], $rows);
        DB::table('jne_shipments')->insert($rows);
    }
    $this->actingAs($admin);
    foreach (['overview', 'index', 'attention'] as $view) {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $started = hrtime(true);
        $response = $this->get(route('shipment-monitoring.'.$view));
        $elapsed = (hrtime(true) - $started) / 1e6;
        $queries = DB::getQueryLog();
        DB::disableQueryLog();
        $response->assertOk();
        expect(count($queries))->toBeLessThan(30);
        if ($view === 'overview') {
            $response->assertInertia(fn (Assert $page) => $page->missing('preview')->loadDeferredProps('attention-preview', fn (Assert $deferred) => $deferred->has('preview', 5)));
        } else {
            expect(count($response->inertiaProps('shipments.data')))->toBe(20);
        }
        $plan = collect($queries)->first(fn (array $query): bool => str_contains($query['query'], 'count(*) as total'));
        fwrite(STDERR, json_encode(['monitoring_v12' => $view, 'rows' => 30000, 'http_ms' => round($elapsed, 2), 'queries' => count($queries), 'sql_ms' => round(array_sum(array_column($queries, 'time')), 2), 'plan' => $plan ? DB::select('EXPLAIN QUERY PLAN '.$plan['query'], $plan['bindings']) : null], JSON_THROW_ON_ERROR).PHP_EOL);
    }
    DB::flushQueryLog();
})->group('monitoring-performance');

test('monitoring shows the source AWB entry date without substituting an import or observation date', function (?string $entry, ?string $expected) {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $source = JneReportAwb::factory()->create(['entry_at' => $entry]);
    $shipment = JneShipment::factory()->create(['latest_report_awb_id' => $source->id, 'last_observed_at' => '2026-11-02 08:00:00']);

    $this->actingAs($admin)->get(route('shipment-monitoring.index'))->assertOk()->assertInertia(fn (Assert $page) => $page->when($entry !== null, fn (Assert $page) => $page->where('shipments.data.0.entry_at', $expected))->when($entry === null, fn (Assert $page) => $page->where('shipments.total', 0)));
    $this->get(route('shipment-monitoring.overview'))->assertOk()->assertInertia(fn (Assert $page) => $page->missing('preview')->loadDeferredProps('attention-preview', fn (Assert $deferred) => $deferred->has('preview', 0)));
    $this->get(route('shipment-monitoring.show', $shipment->id))->assertOk()->assertInertia(fn (Assert $page) => $page->where('shipment.entry_at', $expected));
})->with([
    ['2026-11-01 04:30:00', '2026-11-01T04:30:00+00:00'],
    [null, null],
]);
