<?php

use App\Models\Customer;
use App\Models\HandoverItem;
use App\Models\HandoverSession;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneShipmentObservation;
use App\Models\PickupRecord;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->withoutVite();
});

/** @param array<string, mixed> $source
 * @param  array<string, mixed>  $shipment
 */
function performanceShipment(?Customer $customer = null, array $source = [], array $shipment = []): JneShipment
{
    $row = JneReportAwb::factory()->create([
        'entry_at' => '2026-11-02 05:00:00', 'service' => 'REG23',
        'raw_data' => ['ZONE_USER_ENTRI' => 'CGK537 JAKARTA AGEN PURI MANSION'], ...$source,
    ]);

    return JneShipment::factory()->create([
        'awb' => $row->awb, 'latest_report_awb_id' => $row->id, 'latest_report_job_id' => $row->report_job_id,
        'tracking_status' => 'IN_TRANSIT', 'customer_id' => $customer?->id,
        'customer_match_status' => $customer ? 'MATCHED' : 'UNMATCHED', 'last_observed_at' => '2026-11-03 01:00:00', ...$shipment,
    ]);
}

function performancePeriod(array $extra = []): array
{
    return ['period' => 'custom', 'date_from' => '2026-11-02', 'date_thru' => '2026-11-02', ...$extra];
}

test('performance uses the operational entry period and excludes undated AWBs without import fallback', function () {
    foreach (['2026-11-01 21:59:59', '2026-11-01 22:00:00', '2026-11-02 21:59:59', '2026-11-02 22:00:00', null] as $entry) {
        performanceShipment(source: ['entry_at' => $entry]);
    }
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))
        ->get(route('operational-performance', performancePeriod()))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('operational-performance')
            ->where('performance.summary.total', 2)->where('performance.summary.undated', 1)
            ->where('performance.daily.0.date', '2026-11-02')->where('performance.daily.0.total', 2));
});

test('daily weekly and monthly presets use Jakarta operational today before 0500', function (string $period, string $from) {
    $this->travelTo('2026-11-03 21:30:00 UTC');
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))
        ->get(route('operational-performance', ['period' => $period]))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('filters.date_from', $from)->where('filters.date_thru', '2026-11-03'));
})->with([['daily', '2026-11-03'], ['weekly', '2026-10-28'], ['monthly', '2026-11-01']]);

test('outlet and matched customer scope apply identically to cards daily groups reasons and previews', function () {
    $customer = Customer::factory()->create();
    performanceShipment($customer, ['raw_data' => ['ZONE_USER_ENTRI' => 'Outlet A', 'IREG_CODE' => 'U1', 'RECEIVED/REASON' => 'ALAMAT TIDAK LENGKAP']], ['tracking_status' => 'EXCEPTION']);
    performanceShipment($customer, ['raw_data' => ['ZONE_USER_ENTRI' => 'Outlet B']], ['tracking_status' => 'RETURNED']);
    performanceShipment(Customer::factory()->create(), ['raw_data' => ['ZONE_USER_ENTRI' => 'Outlet A']], ['tracking_status' => 'EXCEPTION']);
    performanceShipment($customer, ['raw_data' => ['ZONE_USER_ENTRI' => 'Outlet A']], ['customer_match_status' => 'CONFLICT']);
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))
        ->get(route('operational-performance', performancePeriod(['customer_id' => $customer->id, 'outlet' => 'Outlet A'])))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('performance.summary.total', 1)->where('performance.summary.exceptions', 1)
            ->where('performance.customers.data.0.total', 1)->where('performance.daily.0.total', 1)->where('performance.services.0.total', 1)
            ->where('performance.outlets.0.label', 'Outlet A')->where('performance.exceptions.rows.0.code', 'U1')->has('performance.attention', 1)->has('performance.returns.rows', 0));
});

test('shared account ambiguous and conflicting ownership stay unresolved without changing attribution', function () {
    $customer = Customer::factory()->create();
    performanceShipment($customer, shipment: ['customer_account' => 'SHARED']);
    performanceShipment(null, shipment: ['customer_account' => 'SHARED', 'customer_match_status' => 'AMBIGUOUS']);
    $conflict = performanceShipment($customer, shipment: ['customer_account' => 'SHARED', 'customer_match_status' => 'CONFLICT']);
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))
        ->get(route('operational-performance', performancePeriod()))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('performance.summary.total', 3)->where('performance.summary.unlinked', 2)
            ->where('performance.customers.data.0.customer_id', null)->where('performance.customers.data.0.total', 2));
    $this->get(route('operational-performance', performancePeriod(['customer_id' => $customer->id])))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('performance.summary.total', 1));
    expect($conflict->fresh()->customer_match_status)->toBe('CONFLICT');
});

test('duplicate and late source observations cannot multiply or replace the projected AWB', function () {
    $shipment = performanceShipment(source: ['service' => 'YES23']);
    $late = JneReportAwb::factory()->create(['awb' => $shipment->awb, 'entry_at' => '2026-11-02 01:00:00', 'service' => 'REG05']);
    JneShipmentObservation::factory()->create(['jne_shipment_id' => $shipment->id, 'jne_report_awb_id' => $late->id, 'observed_at' => '2026-11-01 01:00:00', 'changes_current' => false]);
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->get(route('operational-performance', performancePeriod()))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('performance.summary.total', 1)->where('performance.services.0.label', 'YES23'));
    expect($shipment->fresh()->latest_report_awb_id)->not->toBe($late->id);
});

test('SLA rates stay unavailable for zero populations rather than showing zero percent', function () {
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->get(route('operational-performance', performancePeriod()))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('performance.summary.total', 0)->where('performance.summary.on_sla', null)
            ->where('performance.summary.over_sla', null)->where('performance.summary.on_time_success_rate', null)->where('performance.summary.unrcc', null));
});

test('numeric raw SLA ETD and YES boundary times never invent a deadline or cutoff rule', function (string $entry) {
    performanceShipment(source: ['entry_at' => $entry, 'service' => 'YES23', 'etd_days' => 1, 'delivered_at' => '2026-11-03 01:00:00',
        'raw_data' => ['SLA' => '-1', 'ZONE_USER_ENTRI' => 'Outlet A']], shipment: ['tracking_status' => 'DELIVERED']);
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->get(route('operational-performance', performancePeriod()))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('performance.summary.delivered', 1)->where('performance.summary.on_sla', null)
            ->where('performance.summary.on_time_success_rate', null)->where('performance.services.0.label', 'YES23')->where('performance.services.0.total', 1));
})->with(['2026-11-02 11:59:59', '2026-11-02 12:00:00', '2026-11-02 12:00:01']);

test('unknown service and missing source dates remain explicit without classifying NON YES', function () {
    performanceShipment(source: ['service' => null]);
    performanceShipment(source: ['service' => 'UNVERIFIED_CODE', 'delivered_at' => null]);
    performanceShipment(source: ['entry_at' => null]);
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->get(route('operational-performance', performancePeriod()))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('performance.summary.total', 2)->where('performance.summary.undated', 1)
            ->has('performance.services', 2)->where('performance.services.0.label', 'Belum tersedia')->where('performance.summary.on_sla', null));
});

test('UNRCC stays distinct from exceptions and return grouping preserves source evidence', function () {
    $customer = Customer::factory()->create();
    foreach (['RETURNED', 'RETURNED', 'EXCEPTION', 'UNKNOWN'] as $status) {
        performanceShipment($customer, ['status_web' => $status === 'UNKNOWN' ? 'FAILED' : $status, 'raw_data' => ['IREG_CODE' => '0', 'RECEIVED/REASON' => 'REJECTED BY RECIPIENT']], ['tracking_status' => $status]);
    }
    performanceShipment($customer, ['status_web' => 'RETURNED', 'raw_data' => null], ['tracking_status' => 'RETURNED']);
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->get(route('operational-performance', performancePeriod()))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('performance.summary.returned', 3)->where('performance.summary.exceptions', 1)
            ->where('performance.summary.unrcc', null)->where('performance.returns.rows.0.code', '0')->where('performance.returns.rows.0.total', 2)
            ->where('performance.returns.rows.1.description', null)->where('performance.exceptions.rows.0.total', 1));
});

test('dashboard drilldowns preserve cohort outlet customer and exact source reason including zero codes', function () {
    $customer = Customer::factory()->create();
    $wanted = performanceShipment($customer, ['status_web' => 'RETURNED', 'status_pod' => null, 'raw_data' => ['ZONE_USER_ENTRI' => 'Outlet A', 'IREG_CODE' => '0', 'RECEIVED/REASON' => 'Reason A']], ['tracking_status' => 'RETURNED']);
    performanceShipment($customer, ['raw_data' => ['ZONE_USER_ENTRI' => 'Outlet A', 'IREG_CODE' => 'R1', 'RECEIVED/REASON' => 'Reason A']], ['tracking_status' => 'RETURNED']);
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->get(route('shipment-monitoring.index', [
        ...performancePeriod(), 'customer_id' => $customer->id, 'attribution' => 'matched', 'outlet' => 'Outlet A',
        'status' => 'RETURNED', 'source_code' => '0', 'source_reason' => 'Reason A', 'source_web' => 'RETURNED', 'source_pod' => '',
    ]))->assertOk()->assertInertia(fn (Assert $page) => $page->where('shipments.total', 1)->where('shipments.data.0.awb', $wanted->awb));
});

test('performance preview remains bounded read only with no followup state inferred from tracking', function () {
    for ($i = 0; $i < 12; $i++) {
        performanceShipment(shipment: ['tracking_status' => 'EXCEPTION']);
    }
    $proof = PickupRecord::factory()->create(['finalized_at' => now()]);
    $handover = HandoverItem::create(['handover_session_id' => HandoverSession::factory()->create()->id, 'pickup_task_id' => $proof->pickup_task_id, 'pickup_record_id' => $proof->id, 'status' => 'VERIFIED', 'manual_hybrid' => 7]);
    $before = [JneShipment::all()->toArray(), $proof->fresh()->toArray(), $handover->fresh()->toArray(), DB::table('jne_shipment_observations')->count(), DB::table('jne_shipment_match_events')->count()];
    Queue::fake();
    Http::preventStrayRequests();
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->get(route('operational-performance', performancePeriod()))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('performance.summary.attention', 12)->has('performance.attention', 10)
            ->where('performance.attention.0.note', null)->where('performance.attention.0.follow_up_state', null));
    expect([JneShipment::all()->toArray(), $proof->fresh()->toArray(), $handover->fresh()->toArray(), DB::table('jne_shipment_observations')->count(), DB::table('jne_shipment_match_events')->count()])->toBe($before);
    Queue::assertNothingPushed();
    Http::assertNothingSent();
});

test('performance rejects invalid or unbounded filters with 422', function (array $filters, string $field) {
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->getJson(route('operational-performance', performancePeriod($filters)))
        ->assertUnprocessable()->assertJsonValidationErrors($field);
})->with([
    [['date_thru' => '2027-03-01'], 'date_thru'], [['date_from' => 'not-a-date'], 'date_from'],
    [['date_thru' => '2026-11-01'], 'date_thru'], [['customer_id' => 9999], 'customer_id'],
    [['period' => 'forever'], 'period'], [['outlet' => str_repeat('x', 256)], 'outlet'],
]);

test('performance preserves existing admin only authorization', function (string $role) {
    $this->actingAs(User::factory()->create(['role' => $role]))->get(route('operational-performance'))->assertForbidden();
})->with(['cs', 'retail_staff', 'pickup_staff']);

test('guest and inactive admins cannot read performance', function () {
    $this->get(route('operational-performance'))->assertRedirect(route('login'));
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor', 'is_active' => false]))->get(route('operational-performance'))->assertForbidden();
});

test('large facet sets keep exact totals while paging customers and disclosing truncated previews', function () {
    foreach (Customer::factory()->count(22)->create() as $index => $customer) {
        performanceShipment($customer, ['service' => 'SERVICE_'.$index, 'status_web' => 'RETURNED', 'raw_data' => ['ZONE_USER_ENTRI' => 'Outlet '.$index, 'IREG_CODE' => 'R'.$index]], ['tracking_status' => 'RETURNED']);
    }
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->get(route('operational-performance', performancePeriod(['customer_page' => 2])))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('performance.summary.total', 22)->where('performance.customers.total', 22)
            ->where('performance.customers.current_page', 2)->has('performance.customers.data', 7)
            ->has('performance.services', 20)->where('performance.services_truncated', true)
            ->has('performance.outlets', 20)->where('performance.outlets_truncated', true)
            ->has('performance.returns.rows', 15)->where('performance.returns.truncated', true));
});

test('performance bounds real MySQL aggregations over a representative isolated source population', function () {
    if (DB::getDriverName() !== 'mysql') {
        $this->markTestSkipped('Native isolated MySQL benchmark only.');
    }
    $server = DB::selectOne('SELECT @@port as port, @@datadir as directory');
    expect((int) $server->port)->toBe(54185);
    expect($server->directory)->toContain('dust-performance-mysql-');
    expect(DB::connection()->getDatabaseName())->toStartWith('performance_');
    $this->travelTo('2026-11-03 08:00:00 UTC');
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $customers = Customer::factory()->count(12)->create();
    $jobs = ReportJob::factory()->count(2)->create();
    $sourceMetadata = array_fill_keys(array_map(fn (int $index): string => 'SOURCE_FIELD_'.$index, range(1, 128)), str_repeat('fixture', 5));
    for ($offset = 0; $offset < 30000; $offset += 500) {
        $sources = [];
        $shipments = [];
        $observations = [];
        for ($i = $offset; $i < $offset + 500; $i++) {
            $awb = 'PERF'.str_pad((string) $i, 8, '0', STR_PAD_LEFT);
            $status = ['DELIVERED', 'IN_TRANSIT', 'EXCEPTION', 'RETURNED', 'UNKNOWN'][$i % 5];
            foreach ([0, 1] as $version) {
                $sources[] = ['id' => 100000 + $i * 2 + $version, 'report_job_id' => $jobs[$version]->id, 'source_row' => $i + 2, 'awb' => $awb,
                    'customer_account' => 'SHARED', 'entry_at' => '2026-11-'.str_pad((string) (1 + $i % 2), 2, '0', STR_PAD_LEFT).' 05:00:00',
                    'service' => ['REG23', 'YES23', 'CTC23'][$i % 3], 'status_web' => $status, 'status_pod' => null,
                    'raw_data' => json_encode([...$sourceMetadata, 'ZONE_USER_ENTRI' => 'Outlet '.($i % 4), 'IREG_CODE' => 'R'.($i % 10), 'RECEIVED/REASON' => 'Source reason '.($i % 10), 'SLA' => '-1'], JSON_THROW_ON_ERROR)];
                $observations[] = ['jne_shipment_id' => 100000 + $i, 'jne_report_awb_id' => 100000 + $i * 2 + $version, 'observed_at' => '2026-11-03 01:00:00', 'tracking_status' => $status, 'status_signature' => str_repeat('a', 64), 'changes_current' => $version === 1, 'created_at' => now()];
            }
            $shipments[] = ['id' => 100000 + $i, 'awb' => $awb, 'customer_account' => 'SHARED', 'customer_id' => $customers[$i % 12]->id,
                'customer_match_status' => 'MATCHED', 'tracking_status' => $status, 'latest_report_awb_id' => 100001 + $i * 2, 'latest_report_job_id' => $jobs[1]->id, 'last_observed_at' => '2026-11-03 01:00:00'];
        }
        DB::table('jne_report_awbs')->insert($sources);
        DB::table('jne_shipments')->insert($shipments);
        DB::table('jne_shipment_observations')->insert($observations);
    }
    $this->actingAs($admin);
    foreach ([['outlet' => 'Outlet 0', 'customer_id' => $customers[0]->id], []] as $filters) {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $start = hrtime(true);
        $response = $this->get(route('operational-performance', ['period' => 'custom', 'date_from' => '2026-11-01', 'date_thru' => '2026-11-02', ...$filters]));
        $elapsed = (hrtime(true) - $start) / 1e6;
        $queries = DB::getQueryLog();
        DB::disableQueryLog();
        $response->assertOk();
        expect($response->inertiaProps('performance.summary.total'))->toBe($filters === [] ? 30000 : 2500);
        expect(count($queries))->toBeLessThan(30);
        expect(count($response->inertiaProps('performance.attention')))->toBeLessThanOrEqual(10);
        $aggregation = collect($queries)->first(fn (array $query): bool => str_contains($query['query'], 'WITH population AS'));
        fwrite(STDERR, json_encode(['population' => 30000, 'sources' => 60000, 'observations' => 60000, 'scope' => $filters === [] ? 'all' : 'customer_outlet',
            'http_ms' => round($elapsed, 2), 'sql_ms' => round(array_sum(array_column($queries, 'time')), 2), 'queries' => count($queries),
            'query_times_ms' => array_column($queries, 'time'),
            'explain' => DB::select('EXPLAIN FORMAT=JSON '.$aggregation['query'], $aggregation['bindings'])], JSON_THROW_ON_ERROR).PHP_EOL);
    }
    DB::flushQueryLog();
})->group('performance-mysql');
