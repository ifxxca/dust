<?php

use App\Actions\Reports\QueryShipmentMonitoring;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->withoutVite();
    config(['jne-reports.monitoring_summary_cache_seconds' => 15, 'jne-reports.monitoring_cache_store' => 'array']);
});

test('summary cache reuses filter scope across pagination expires and supports explicit refresh', function () {
    $this->travelTo('2026-11-25 01:00:00 UTC');
    JneShipment::factory()->create(['tracking_status' => 'IN_TRANSIT']);
    $monitoring = app(QueryShipmentMonitoring::class);
    $first = $monitoring->cachedSummary([]);
    JneShipment::factory()->create(['tracking_status' => 'DELIVERED']);

    expect($monitoring->cachedSummary(['page' => 2, 'per_page' => 50, 'q' => null, 'overdue_min' => null]))->toBe($first);
    expect($monitoring->cachedSummary(['status' => 'DELIVERED'])['total'])->toBe(1);
    expect($monitoring->cachedSummary([], refresh: true)['total'])->toBe(2);
    JneShipment::factory()->create(['tracking_status' => 'CANCELLED']);
    $this->travel(16)->seconds();
    expect($monitoring->cachedSummary([])['total'])->toBe(3);
});

test('empty metadata filter remains distinct from no filter in the summary cache', function () {
    $source = JneReportAwb::factory()->create(['service' => 'REG23']);
    JneShipment::factory()->create(['awb' => $source->awb, 'latest_report_awb_id' => $source->id]);
    $empty = JneReportAwb::factory()->create(['service' => null]);
    JneShipment::factory()->create(['awb' => $empty->awb, 'latest_report_awb_id' => $empty->id]);
    $monitoring = app(QueryShipmentMonitoring::class);

    expect($monitoring->cachedSummary([])['total'])->toBe(2);
    expect($monitoring->cachedSummary(['source_service' => null])['total'])->toBe(1);
    expect($monitoring->cachedSummary(['source_service' => 'REG23'])['total'])->toBe(1);
});

test('summary cache works across action instances with the existing database cache store', function () {
    config(['jne-reports.monitoring_cache_store' => 'database']);
    JneShipment::factory()->create(['tracking_status' => 'IN_TRANSIT']);
    expect((new QueryShipmentMonitoring)->cachedSummary([])['total'])->toBe(1);
    JneShipment::factory()->create(['tracking_status' => 'DELIVERED']);

    expect((new QueryShipmentMonitoring)->cachedSummary([])['total'])->toBe(1);
    expect((new QueryShipmentMonitoring)->cachedSummary([], refresh: true)['total'])->toBe(2);
});

test('cached HTTP summary refreshes without changing the selected filter and pagination scope', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    JneShipment::factory()->for(JneReportAwb::factory()->state(['entry_at' => now()->subDay()]), 'latestSource')->create(['tracking_status' => 'DELIVERED']);
    $this->actingAs($admin)->get(route('shipment-monitoring.index'))->assertOk()->assertInertia(fn (Assert $page) => $page->where('summary.total', 1));
    JneShipment::factory()->for(JneReportAwb::factory()->state(['entry_at' => now()->subDay()]), 'latestSource')->create(['tracking_status' => 'IN_TRANSIT']);

    $this->get(route('shipment-monitoring.index'))->assertOk()->assertInertia(fn (Assert $page) => $page->where('summary.total', 1)->where('shipments.total', 2));
    $this->withHeader('X-Monitoring-Refresh', '1')->get(route('shipment-monitoring.index'))->assertOk()->assertInertia(fn (Assert $page) => $page->where('summary.total', 2)->where('shipments.total', 2));
});

test('page selection occurs before source SLA evaluation and preserves derived filter ordering', function () {
    $this->travelTo('2026-11-25 01:00:00 UTC');
    foreach (range(1, 24) as $index) {
        $source = JneReportAwb::factory()->create(['raw_data' => ['CARRER' => 'On Time SLA', 'SLA' => '-1', 'AGING_ONGOING' => $index % 2 ? '5' : '2', 'ETD' => '3']]);
        JneShipment::factory()->create(['awb' => $source->awb, 'latest_report_awb_id' => $source->id, 'tracking_status' => 'IN_TRANSIT', 'last_observed_at' => now()]);
    }
    $monitoring = app(QueryShipmentMonitoring::class);
    DB::enableQueryLog();
    $page = $monitoring->paginate([], 20, 2);
    $queries = DB::getQueryLog();
    DB::disableQueryLog();

    expect($page->total())->toBe(24);
    expect($page->items())->toHaveCount(4);
    $evaluation = collect($queries)->first(fn (array $query): bool => str_contains($query['query'], ' as "s"'));
    expect($evaluation['query'])->toContain('limit 20 offset 20');
    expect($monitoring->paginate(['attention' => 'potential_overdue'], 20, 1)->total())->toBe(12);
    expect($monitoring->paginate([], 20, 99)->items())->toBe([]);
});

test('overview defers only the priority list and its follow-up does not repeat summary aggregation', function () {
    JneShipment::factory()->for(JneReportAwb::factory()->state(['entry_at' => now()->subDay()]), 'latestSource')->create(['tracking_status' => 'EXCEPTION']);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);

    $this->actingAs($admin)->get(route('shipment-monitoring.overview'))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('summary.attention', 1)->missing('preview')
        ->loadDeferredProps('attention-preview', fn (Assert $deferred) => $deferred->has('preview', 1)));
    DB::enableQueryLog();
    $this->withHeaders(['X-Inertia' => 'true', 'X-Inertia-Version' => Inertia::getVersion(), 'X-Inertia-Partial-Component' => 'shipment-monitoring-overview', 'X-Inertia-Partial-Data' => 'preview'])
        ->get(route('shipment-monitoring.overview'))->assertOk();
    $queries = DB::getQueryLog();
    DB::disableQueryLog();
    expect(collect($queries)->filter(fn (array $query): bool => str_contains($query['query'], 'count(*) as total')))->toHaveCount(0);
});
