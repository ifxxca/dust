<?php

use App\Actions\Reports\ImportReportAwbs;
use App\Actions\Reports\ProjectJneShipments;
use App\Actions\Reports\QueryActiveJneAwbs;
use App\Models\Customer;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneShipmentObservation;
use App\Models\JneShipperAlias;
use App\Models\ReportJob;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;

require_once __DIR__.'/../Fixtures/pickup-automation.php';

beforeEach(function () {
    $this->withoutVite();
    $this->travelTo('2026-11-02 08:00:00 UTC');
    config(['pickup.automation.enabled' => false, 'jne-reports.source_timezone' => 'Asia/Jakarta']);
});

/** @param list<array<string, string>> $rows */
function shipmentTrackingReport(array $rows, string $observedAt): ReportJob
{
    $stream = fopen('php://temp', 'w+b');
    $defaults = ['AWB' => 'MONITOR001', 'ID_ACCOUNT' => 'TESTACCOUNT', 'STATUS_WEB' => 'ON PROCESS', 'STATUS_POD' => '', 'AWB_CANCEL' => '', 'SHIPPER_NAME' => 'Monitoring Sender', 'TGL_ENTRY' => '2026-11-02 05:00:00', 'TGL_UPDATE_STATUS_POD' => '', 'TGL_TARIK_REPORT' => CarbonImmutable::parse($observedAt, 'UTC')->toIso8601String(), 'CUSTOMER_CODE' => '', 'PROCESS_TYPE' => ''];
    fputcsv($stream, array_keys($defaults), ',', '"', '');
    foreach ($rows as $row) {
        fputcsv($stream, array_values(array_replace($defaults, $row)), ',', '"', '');
    }
    rewind($stream);
    $csv = stream_get_contents($stream);
    fclose($stream);
    $job = ReportJob::factory()->create(['customer_account' => $rows[0]['ID_ACCOUNT'] ?? 'TESTACCOUNT', 'status' => 'COMPLETED', 'started_at' => $observedAt, 'completed_at' => $observedAt, 'file_checksum' => hash('sha256', $csv)]);
    $job->update(['file_path' => 'tracking-tests/'.$job->id.'.csv']);
    Storage::disk('jne_reports')->put($job->file_path, $csv);
    app(ImportReportAwbs::class)->handle($job->id);
    app(ProjectJneShipments::class)->handle($job->id);

    return $job->fresh();
}

test('new active evidence exposes source timestamps and separate receipt time without external calls or jobs', function () {
    Storage::fake('jne_reports');
    Queue::fake();
    Http::preventStrayRequests();
    $this->travelTo('2026-11-02 08:00:00 UTC');
    $report = shipmentTrackingReport([['TGL_UPDATE_STATUS_POD' => '2026-11-02 06:00:00']], '2026-11-02 01:00:00');
    $admin = User::factory()->create(['role' => 'admin_supervisor']);

    $this->actingAs($admin)->get(route('shipment-monitoring.index'))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('shipment-monitoring')->where('summary.total', 1)->where('summary.active', 1)->where('summary.failed_final', null)->where('summary.stale', null)
        ->where('shipments.data.0.tracking_status', 'IN_TRANSIT')->where('shipments.data.0.source_status_at', '2026-11-01T23:00:00+00:00')
        ->where('shipments.data.0.observed_at', '2026-11-02T01:00:00+00:00')->where('shipments.data.0.received_at', '2026-11-02T08:00:00+00:00')->where('shipments.data.0.source_report_id', $report->id));
    Queue::assertNothingPushed();
    Http::assertNothingSent();
});

test('delivered and cancelled stop baseline routine polling while exceptions returns and unverified failures stay open', function () {
    Storage::fake('jne_reports');
    $this->travelTo('2026-11-02 08:00:00 UTC');
    shipmentTrackingReport([[]], '2026-11-02 01:00:00');
    shipmentTrackingReport([['STATUS_WEB' => 'DELIVERED']], '2026-11-02 02:00:00');
    expect(app(QueryActiveJneAwbs::class)->handle(60)->count())->toBe(0);
    expect(JneShipmentObservation::where('changes_current', true)->count())->toBe(2);
    shipmentTrackingReport([
        ['AWB' => 'CANCEL', 'AWB_CANCEL' => 'Y'],
        ['AWB' => 'RETURN', 'STATUS_WEB' => 'RETURNED TO SHIPPER'],
        ['AWB' => 'EXCEPT', 'STATUS_WEB' => 'CONSIGNEE NOT AT HOME', 'STATUS_POD' => 'UNDEL'],
        ['AWB' => 'FAIL', 'STATUS_WEB' => 'FAILED'],
    ], '2026-11-02 03:00:00');

    expect(app(QueryActiveJneAwbs::class)->handle(60)->orderBy('awb')->pluck('awb')->all())->toBe(['EXCEPT', 'FAIL', 'RETURN']);
    $this->assertDatabaseHas('jne_shipments', ['awb' => 'FAIL', 'tracking_status' => 'UNKNOWN']);
    $this->assertDatabaseHas('jne_shipments', ['awb' => 'EXCEPT', 'tracking_status' => 'EXCEPTION']);
});

test('repeated identical imports and duplicate reports retain provenance with zero redundant transitions', function () {
    Storage::fake('jne_reports');
    $this->travelTo('2026-11-02 08:00:00 UTC');
    $first = shipmentTrackingReport([[]], '2026-11-02 01:00:00');
    app(ImportReportAwbs::class)->handle($first->id);
    app(ProjectJneShipments::class)->handle($first->id);
    $this->assertDatabaseCount('jne_shipment_observations', 1);
    shipmentTrackingReport([[]], '2026-11-02 01:00:00');
    shipmentTrackingReport([['STATUS_WEB' => ' on process ', 'AWB_CANCEL' => 'N']], '2026-11-02 02:00:00');

    $this->assertDatabaseCount('jne_shipments', 1);
    $this->assertDatabaseCount('jne_report_awbs', 3);
    $this->assertDatabaseCount('jne_shipment_observations', 3);
    expect(JneShipmentObservation::where('changes_current', true)->count())->toBe(1);
    expect(JneReportAwb::latest('id')->first()->raw_data['STATUS_WEB'])->toBe(' on process ');
});

test('canonical comparison adopts legacy signatures without inventing a transition', function () {
    Storage::fake('jne_reports');
    $this->travelTo('2026-11-02 08:00:00 UTC');
    shipmentTrackingReport([[]], '2026-11-02 01:00:00');
    JneShipment::query()->update(['status_signature' => hash('sha256', '["ON PROCESS",null,null]')]);

    shipmentTrackingReport([['STATUS_WEB' => 'on process']], '2026-11-02 02:00:00');

    expect(JneShipmentObservation::where('changes_current', true)->count())->toBe(1);
});

test('older evidence remains searchable without overwriting a newer terminal snapshot', function () {
    Storage::fake('jne_reports');
    $this->travelTo('2026-11-02 08:00:00 UTC');
    $new = shipmentTrackingReport([['STATUS_WEB' => 'DELIVERED']], '2026-11-02 02:00:00');
    shipmentTrackingReport([[]], '2026-11-02 01:00:00');
    $record = JneShipment::sole();
    expect($record->latest_report_job_id)->toBe($new->id);
    expect($record->tracking_status)->toBe('DELIVERED');
    expect(JneShipmentObservation::where('changes_current', true)->count())->toBe(1);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);

    $this->actingAs($admin)->get(route('shipment-monitoring.show', [$record->id, 'history' => 'all']))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('history.total', 2)->where('history.data.1.changes_current', false)->where('source.report_job_id', $new->id));
});

test('shipment detail exposes source sender and recipient without requiring raw evidence inspection', function () {
    $source = JneReportAwb::factory()->create(['entry_at' => now()->subDay(), 'shipper_name' => '864C PT KREASI PANEN JAYA', 'consignee_name' => 'CV SENTRIS INNO PASIFIK']);
    $shipment = JneShipment::factory()->create(['awb' => $source->awb, 'latest_report_awb_id' => $source->id]);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);

    $this->actingAs($admin)->get(route('shipment-monitoring.show', $shipment))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('shipment-monitoring-detail')
        ->where('source.shipper_name', '864C PT KREASI PANEN JAYA')
        ->where('source.consignee_name', 'CV SENTRIS INNO PASIFIK'));
});

test('monitoring filters by current report shipper without requiring a mapped customer and retains pagination context', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    foreach (range(1, 21) as $index) {
        $source = JneReportAwb::factory()->create(['entry_at' => now()->subDay(), 'shipper_name' => '864C PT KREASI PANEN JAYA']);
        JneShipment::factory()->create(['awb' => $source->awb, 'latest_report_awb_id' => $source->id, 'customer_id' => null, 'tracking_status' => 'IN_TRANSIT']);
    }
    $other = JneReportAwb::factory()->create(['entry_at' => now()->subDay(), 'shipper_name' => 'PENGIRIM LAIN']);
    JneShipment::factory()->create(['latest_report_awb_id' => $other->id, 'customer_id' => null, 'tracking_status' => 'IN_TRANSIT']);

    $this->actingAs($admin)->get(route('shipment-monitoring.index', ['shipper' => 'kreasi panen', 'status' => 'IN_TRANSIT', 'customer_link' => 'unlinked', 'page' => 2]))
        ->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('shipments.total', 21)->where('summary.total', 21)->where('facets.total', 21)
        ->has('shipments.data', 1)->where('shipments.data.0.shipper_name', '864C PT KREASI PANEN JAYA')
        ->where('shipments.data.0.customer', null)->where('filters.shipper', 'kreasi panen'));

    $shipment = JneShipment::where('latest_report_awb_id', '<>', $other->id)->first();
    $this->get(route('shipment-monitoring.show', [$shipment, 'shipper' => 'kreasi panen', 'return_page' => 2]))
        ->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('shipment.shipper_name', '864C PT KREASI PANEN JAYA')
        ->where('context.shipper', 'kreasi panen')
        ->where('returnTo', route('shipment-monitoring.index', ['shipper' => 'kreasi panen', 'page' => 2])));
});

test('shipper search uses current evidence rather than superseded report names', function () {
    Storage::fake('jne_reports');
    $this->travelTo('2026-11-02 08:00:00 UTC');
    shipmentTrackingReport([['SHIPPER_NAME' => 'PENGIRIM LAMA']], '2026-11-02 01:00:00');
    shipmentTrackingReport([['SHIPPER_NAME' => 'PENGIRIM BARU']], '2026-11-02 02:00:00');
    $admin = User::factory()->create(['role' => 'admin_supervisor']);

    $this->actingAs($admin)->get(route('shipment-monitoring.index', ['shipper' => 'LAMA']))
        ->assertOk()->assertInertia(fn (Assert $page) => $page->where('shipments.total', 0));
    $this->get(route('shipment-monitoring.index', ['shipper' => 'BARU']))
        ->assertOk()->assertInertia(fn (Assert $page) => $page->where('shipments.total', 1)->where('shipments.data.0.shipper_name', 'PENGIRIM BARU'));
});

test('shipper search treats wildcard characters as literal and composes with AWB prefix', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    foreach (['SHIP01' => 'TOKO 100%_! ASLI', 'SHIP02' => 'TOKO 100AB ASLI'] as $awb => $shipper) {
        $source = JneReportAwb::factory()->create(['entry_at' => now()->subDay(), 'awb' => $awb, 'shipper_name' => $shipper]);
        JneShipment::factory()->create(['awb' => $awb, 'latest_report_awb_id' => $source->id]);
    }

    $this->actingAs($admin)->get(route('shipment-monitoring.index', ['shipper' => '%_!']))
        ->assertOk()->assertInertia(fn (Assert $page) => $page->where('shipments.total', 1)->where('shipments.data.0.awb', 'SHIP01'));
    $this->get(route('shipment-monitoring.index', ['shipper' => 'ASLI', 'q' => 'SHIP02']))
        ->assertOk()->assertInertia(fn (Assert $page) => $page->where('shipments.total', 1)->where('shipments.data.0.awb', 'SHIP02'));
    $this->get(route('shipment-monitoring.index', ['shipper' => str_repeat('x', 256)]))->assertSessionHasErrors('shipper');
});

test('A to B to A corrections and late corrections to terminal states are retained and reopen tracking', function () {
    Storage::fake('jne_reports');
    $this->travelTo('2026-11-02 08:00:00 UTC');
    shipmentTrackingReport([[]], '2026-11-02 01:00:00');
    shipmentTrackingReport([['STATUS_WEB' => 'DELIVERED']], '2026-11-02 02:00:00');
    shipmentTrackingReport([[]], '2026-11-02 03:00:00');

    expect(JneShipmentObservation::orderBy('id')->pluck('tracking_status')->all())->toBe(['IN_TRANSIT', 'DELIVERED', 'IN_TRANSIT']);
    expect(JneShipmentObservation::where('changes_current', true)->count())->toBe(3);
    expect(app(QueryActiveJneAwbs::class)->handle(60)->count())->toBe(1);
});

test('same normalized state with new raw delivery evidence keeps a meaningful correction', function () {
    Storage::fake('jne_reports');
    $this->travelTo('2026-11-02 08:00:00 UTC');
    shipmentTrackingReport([['STATUS_WEB' => 'DELIVERED TO [PERSON A]']], '2026-11-02 01:00:00');
    shipmentTrackingReport([['STATUS_WEB' => 'DELIVERED TO [PERSON B]']], '2026-11-02 02:00:00');

    expect(JneShipmentObservation::where('changes_current', true)->count())->toBe(2);
    expect(JneShipment::sole()->latestSource->status_web)->toBe('DELIVERED TO [PERSON B]');
});

test('shared account with ambiguous shipper identity stays visible without assigning a customer', function () {
    Storage::fake('jne_reports');
    $this->travelTo('2026-11-02 08:00:00 UTC');
    foreach (Customer::factory()->count(2)->create() as $customer) {
        JneShipperAlias::factory()->create(['customer_id' => $customer->id, 'shipper_name' => 'Monitoring Sender']);
    }
    shipmentTrackingReport([[]], '2026-11-02 01:00:00');
    $admin = User::factory()->create(['role' => 'admin_supervisor']);

    $this->actingAs($admin)->get(route('shipment-monitoring.index'))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('shipments.data.0.customer', null)->where('shipments.data.0.customer_match_status', 'AMBIGUOUS')->where('summary.total', 1));
});

test('tracking changes and monitoring reads preserve finalized proof handover and reconciliation audit state', function () {
    Storage::fake('jne_reports');
    Queue::fake();
    $this->travelTo('2026-11-02 01:00:00 UTC');
    $fixture = pickupAutomationFixture(1, 0);
    importPickupAutomationReport($fixture, 1, 0);
    $tables = ['pickup_records', 'pickup_record_revisions', 'handover_items', 'handover_item_revisions'];
    $before = collect($tables)->mapWithKeys(fn (string $table): array => [$table => DB::table($table)->orderBy('id')->get()->toJson()]);
    shipmentTrackingReport([['AWB' => '000MANUAL1', 'ID_ACCOUNT' => 'SIM_AUTO_ACCOUNT', 'SHIPPER_NAME' => 'VANNY', 'CUSTOMER_CODE' => '4000', 'PROCESS_TYPE' => 'MANUAL', 'STATUS_WEB' => 'DELIVERED']], '2026-11-02 02:00:00');
    $shipment = JneShipment::sole();
    $decisions = DB::table('jne_shipment_match_events')->count();

    $this->actingAs($fixture['admin'])->get(route('shipment-monitoring.show', $shipment->id))->assertOk();
    $this->get(route('shipment-monitoring.index'))->assertOk();
    $this->get(route('shipment-monitoring.overview'))->assertOk();
    $this->get(route('shipment-monitoring.attention'))->assertOk();

    foreach ($tables as $table) {
        expect(DB::table($table)->orderBy('id')->get()->toJson())->toBe($before[$table]);
    }
    expect(DB::table('jne_shipment_match_events')->count())->toBe($decisions);
    Queue::assertNothingPushed();
});

test('monitoring denies non admins inactive admins and guests on both read endpoints', function () {
    $record = JneShipment::factory()->create();
    $this->get(route('shipment-monitoring.index'))->assertRedirect(route('login'));
    $this->get(route('shipment-monitoring.show', $record->id))->assertRedirect(route('login'));
    foreach ([['role' => 'cs'], ['role' => 'retail_staff'], ['role' => 'pickup_staff'], ['role' => 'admin_supervisor', 'is_active' => false]] as $attributes) {
        $this->actingAs(User::factory()->create($attributes));
        $this->get(route('shipment-monitoring.index'))->assertForbidden();
        $this->get(route('shipment-monitoring.show', $record->id))->assertForbidden();
    }
});

test('server pagination customer and status filters and literal AWB prefix search stay bounded', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $customer = Customer::factory()->create();
    JneShipment::factory()->for(JneReportAwb::factory()->state(['entry_at' => now()->subDay()]), 'latestSource')->count(25)->sequence(fn ($sequence) => ['awb' => 'PAGE'.str_pad((string) $sequence->index, 3, '0', STR_PAD_LEFT)])->create(['customer_id' => $customer->id, 'tracking_status' => 'IN_TRANSIT', 'last_observed_at' => now()]);
    JneShipment::factory()->for(JneReportAwb::factory()->state(['entry_at' => now()->subDay()]), 'latestSource')->create(['awb' => 'OTHER', 'tracking_status' => 'DELIVERED']);
    JneShipment::factory()->for(JneReportAwb::factory()->state(['entry_at' => now()->subDay()]), 'latestSource')->create(['awb' => '00123', 'tracking_status' => 'UNKNOWN']);

    $this->actingAs($admin)->get(route('shipment-monitoring.index', ['customer_id' => $customer->id, 'status' => 'IN_TRANSIT', 'page' => 2]))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('shipments.total', 25)->has('shipments.data', 5)->where('shipments.current_page', 2)->where('summary.active', 25));
    $this->get(route('shipment-monitoring.index', ['q' => 'PAGE%']))->assertOk()->assertInertia(fn (Assert $page) => $page->where('shipments.total', 0));
    $this->get(route('shipment-monitoring.index', ['q' => 'page00']))->assertOk()->assertInertia(fn (Assert $page) => $page->where('shipments.total', 10));
    $this->get(route('shipment-monitoring.index', ['q' => '0']))->assertOk()->assertInertia(fn (Assert $page) => $page->where('shipments.total', 1)->where('shipments.data.0.awb', '00123'));
    $this->get(route('shipment-monitoring.index', ['lifecycle' => 'terminal']))->assertOk()->assertInertia(fn (Assert $page) => $page->where('shipments.total', 1)->where('shipments.data.0.terminal', true));
});

test('date filtering uses the 05 WIB operational boundary and freshness needs a chosen threshold', function () {
    Storage::fake('jne_reports');
    $this->travelTo('2026-11-02 08:00:00 UTC');
    shipmentTrackingReport([
        ['AWB' => 'BEFORE', 'TGL_ENTRY' => '2026-11-02 04:59:59'],
        ['AWB' => 'START', 'TGL_ENTRY' => '2026-11-02 05:00:00'],
        ['AWB' => 'END', 'TGL_ENTRY' => '2026-11-03 04:59:59'],
        ['AWB' => 'AFTER', 'TGL_ENTRY' => '2026-11-03 05:00:00'],
    ], '2026-11-02 01:00:00');
    $admin = User::factory()->create(['role' => 'admin_supervisor']);

    $this->actingAs($admin)->get(route('shipment-monitoring.index', ['date_from' => '2026-11-02', 'date_thru' => '2026-11-02', 'freshness_hours' => 6, 'freshness' => 'stale']))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('shipments.total', 2)->where('summary.stale', 2)->where('shipments.data.0.freshness', 'stale'));
    $this->getJson(route('shipment-monitoring.index', ['freshness' => 'stale']))->assertUnprocessable()->assertJsonValidationErrors('freshness_hours')
        ->assertJsonPath('errors.freshness_hours.0', 'Pilih batas usia data (jam) untuk mencari data yang melewati batas.');
    $this->getJson(route('shipment-monitoring.index', ['date_from' => '2026-11-03', 'date_thru' => '2026-11-02']))->assertUnprocessable()->assertJsonValidationErrors('date_thru');
});

test('history defaults to transitions and paginates retained unchanged observations separately', function () {
    Storage::fake('jne_reports');
    $this->travelTo('2026-11-02 08:00:00 UTC');
    for ($index = 0; $index < 27; $index++) {
        shipmentTrackingReport([[]], '2026-11-02 01:'.str_pad((string) $index, 2, '0', STR_PAD_LEFT).':00');
    }
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $shipment = JneShipment::sole();

    $this->actingAs($admin)->get(route('shipment-monitoring.show', $shipment->id))->assertOk()->assertInertia(fn (Assert $page) => $page->where('history.total', 1));
    $this->get(route('shipment-monitoring.show', [$shipment->id, 'history' => 'all', 'page' => 2]))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('history.total', 27)->has('history.data', 2)->where('history.data.0.changes_current', false));
    $this->get(route('shipment-monitoring.show', 999999))->assertNotFound();
});

test('freshness separates never observed evidence and does not label terminal snapshots stale', function () {
    $this->travelTo('2026-11-02 08:00:00 UTC');
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    JneShipment::factory()->for(JneReportAwb::factory()->state(['entry_at' => now()->subDay()]), 'latestSource')->create(['tracking_status' => 'IN_TRANSIT', 'last_observed_at' => '2026-11-02 01:00:00']);
    JneShipment::factory()->for(JneReportAwb::factory()->state(['entry_at' => now()->subDay()]), 'latestSource')->create(['tracking_status' => 'UNKNOWN', 'last_observed_at' => null]);
    JneShipment::factory()->for(JneReportAwb::factory()->state(['entry_at' => now()->subDay()]), 'latestSource')->create(['tracking_status' => 'DELIVERED', 'last_observed_at' => '2026-10-01 01:00:00']);

    $this->actingAs($admin)->get(route('shipment-monitoring.index', ['freshness_hours' => 6]))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('summary.stale', 1)->where('summary.unobserved', 1)->where('summary.unknown', 1));
    $this->get(route('shipment-monitoring.index', ['freshness' => 'unobserved']))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('shipments.total', 1)->where('shipments.data.0.freshness', 'unobserved')->where('shipments.data.0.received_at', null));
});

test('unsupported tracking filters return validation errors instead of broadening queries', function (string $field, string $value) {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);

    $this->actingAs($admin)->getJson(route('shipment-monitoring.index', [$field => $value]))->assertUnprocessable()->assertJsonValidationErrors($field);
})->with([
    ['status', 'FAILED'], ['lifecycle', 'failed'], ['per_page', '6000'], ['freshness_hours', '0'], ['history', 'everything'],
]);

test('representative isolated ingestion measures unchanged transition amplification and bounded monitoring reads', function (int $size) {
    Storage::fake('jne_reports');
    Queue::fake();
    $this->travelTo('2026-11-02 08:00:00 UTC');
    $rows = array_map(fn (int $index): array => ['AWB' => 'MEASURE'.str_pad((string) $index, 6, '0', STR_PAD_LEFT)], range(1, $size));
    shipmentTrackingReport($rows, '2026-11-02 01:00:00');
    $before = JneShipmentObservation::where('changes_current', true)->count();
    DB::flushQueryLog();
    DB::enableQueryLog();
    $started = hrtime(true);
    shipmentTrackingReport($rows, '2026-11-02 02:00:00');
    $elapsed = (hrtime(true) - $started) / 1e6;
    $queries = count(DB::getQueryLog());
    DB::disableQueryLog();
    DB::flushQueryLog();
    expect(JneShipmentObservation::where('changes_current', true)->count())->toBe($before);
    $this->assertDatabaseCount('jne_shipment_observations', 2 * $size);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    DB::enableQueryLog();
    $started = hrtime(true);
    $this->actingAs($admin)->get(route('shipment-monitoring.index'))->assertOk()->assertInertia(fn (Assert $page) => $page->has('shipments.data', min(20, $size))->where('shipments.total', $size));
    $readMs = (hrtime(true) - $started) / 1e6;
    $readQueries = count(DB::getQueryLog());
    DB::disableQueryLog();
    DB::flushQueryLog();
    expect($readQueries)->toBeLessThan(30);
    Queue::assertNothingPushed();
    fwrite(STDERR, json_encode(['shipment_monitoring_fixture' => $size, 'unchanged_import_ms' => round($elapsed, 2), 'import_queries' => $queries, 'read_ms' => round($readMs, 2), 'read_queries' => $readQueries, 'new_transitions' => 0, 'new_observations' => $size, 'peak_memory_bytes' => memory_get_peak_usage(true)], JSON_THROW_ON_ERROR).PHP_EOL);
})->with([100, 1000]);
