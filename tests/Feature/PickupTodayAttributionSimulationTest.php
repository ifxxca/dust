<?php

use App\Actions\Handover\CreateSession;
use App\Actions\Handover\VerifyItem;
use App\Actions\Pickup\QueryReconciliationWorkspace;
use App\Actions\Pickup\ReconcilePickupProcessing;
use App\Actions\Reports\ImportReportAwbs;
use App\Actions\Reports\ProjectJneShipments;
use App\Jobs\DeliverPickupAwbManifestJob;
use App\Models\Customer;
use App\Models\JneShipment;
use App\Models\JneShipperAlias;
use App\Models\PickupCustomerReconciliation;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

require_once __DIR__.'/../Fixtures/pickup-automation.php';

beforeEach(function () {
    $this->travelTo('2026-11-14 12:00:00 UTC');
    config(['pickup.automation.enabled' => false, 'pickup.automation.auto_lock' => false, 'pickup.automation.send_enabled' => false,
        'jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => true,
        'jne-reports.category_markers_enabled' => false, 'jne-reports.source_timezone' => 'Asia/Jakarta']);
});

/** @return array<string, mixed> */
function todayAttributionFixture(int $manual = 1): array
{
    expect(app()->environment())->toBe('testing');
    expect(config('database.connections.sqlite.database'))->toBe(':memory:');
    Http::preventStrayRequests();
    Mail::fake();
    Notification::fake();
    Queue::fake();
    Storage::fake('jne_reports');
    Storage::fake('local');
    $fixture = pickupAutomationFixture($manual, 0);
    $fixture['customer']->update(['name' => 'Vanny Songket']);
    $fixture['task']->update(['customer_name_snapshot' => 'Vanny Songket']);

    return $fixture;
}

/** @param list<array<string, string>> $rows */
function todayAttributionImport(array $fixture, array $rows): ReportJob
{
    $defaults = ['AWB' => '', 'ID_ACCOUNT' => 'SIM_AUTO_ACCOUNT', 'CUSTOMER_CODE' => '', 'SHIPPER_NAME' => '', 'CONSIGNEE_NAME' => 'PENERIMA SIMULASI',
        'STATUS_WEB' => 'ON PROCESS', 'STATUS_POD' => '', 'AWB_CANCEL' => 'N', 'NOREF' => '', 'TGL_ENTRY' => '2026-11-14 10:00:00', 'PROCESS_TYPE' => 'MANUAL', 'QTY' => '1'];
    $stream = fopen('php://temp', 'w+b');
    fputcsv($stream, array_keys($defaults), ',', '"', '');
    foreach ($rows as $index => $row) {
        fputcsv($stream, array_values(array_replace($defaults, ['AWB' => '0101'.str_pad((string) ($index + 1), 12, '0', STR_PAD_LEFT)], $row)), ',', '"', '');
    }
    rewind($stream);
    $csv = stream_get_contents($stream);
    fclose($stream);
    $path = 'today-attribution/'.Str::uuid().'.csv';
    Storage::disk('jne_reports')->put($path, $csv);
    $job = ReportJob::factory()->create(['source' => 'apex', 'report_type' => 'apex', 'created_by' => $fixture['admin']->id,
        'customer_account' => 'SIM_AUTO_ACCOUNT', 'date_from' => '2026-11-14', 'date_thru' => '2026-11-14', 'status' => 'COMPLETED',
        'file_path' => $path, 'file_checksum' => hash('sha256', $csv), 'started_at' => now(), 'completed_at' => now(), 'row_count' => count($rows),
        'parameters' => ['collection_evidence' => pickupAutomationCollectionEvidence('2026-11-14', '2026-11-14', count($rows))]]);
    app(ImportReportAwbs::class)->handle($job->id);
    app(ProjectJneShipments::class)->handle($job->id);

    return $job->fresh();
}

function todayAttributionBook(array $fixture, Customer $customer, int $manual): PickupTask
{
    $task = PickupTask::factory()->create(['customer_id' => $customer->id, 'customer_name_snapshot' => $customer->name, 'scheduled_at' => now(), 'status' => 'PICKED_UP']);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'manual_hybrid' => $manual, 'cashless_hybrid' => 0, 'css_orion' => 0]);
    $session = app(CreateSession::class)->handle($fixture['admin'], [$task->id], (string) Str::uuid());
    app(VerifyItem::class)->handle($fixture['admin'], $session->id, $session->items()->sole()->id, ['expected_version' => 1, 'manual_hybrid' => $manual, 'cashless_hybrid' => 0, 'css_orion' => 0]);
    app(ReconcilePickupProcessing::class)->handle($task->id);

    return $task;
}

/** @param list<JneShipment> $shipments
 * @return array<string, mixed>
 */
function todayAttributionDecision(PickupTask $task, array $shipments, string $action): array
{
    $workspace = app(QueryReconciliationWorkspace::class)->handle($task);

    return ['action' => $action, 'expected_revision' => $workspace['version'], 'expected_version' => DB::table('pickup_processing_reconciliations')->where('pickup_task_id', $task->id)->value('input_version'),
        'target_task_id' => $task->id, 'reason' => 'Simulasi: bukti customer mengonfirmasi salah kode pengirim.',
        'items' => array_map(fn (JneShipment $row): array => $row->fresh()->only(['id', 'version']), $shipments)];
}

afterEach(function () {
    Mail::assertNothingSent();
    Notification::assertNothingSent();
    Http::assertNothingSent();
    Queue::assertNotPushed(DeliverPickupAwbManifestJob::class);
});

test('today sender variants use verified identity and never turn suggestions into automatic ownership', function (string $shipper, string $code, string $alias, string $expected, bool $linked) {
    $fixture = todayAttributionFixture();
    if ($alias !== '') {
        JneShipperAlias::factory()->create(['customer_id' => $fixture['customer']->id, 'shipper_name' => $alias]);
    }
    todayAttributionImport($fixture, [['SHIPPER_NAME' => $shipper, 'CUSTOMER_CODE' => $code]]);

    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);

    $shipment = JneShipment::sole();
    expect($shipment->customer_match_status)->toBe($expected);
    if ($expected === 'MATCHED') {
        expect($shipment->customer_id)->toBe($fixture['customer']->id);
        expect($shipment->pickup_task_id)->toBe($linked ? $fixture['task']->id : null);
    } else {
        expect($shipment->customer_id)->toBeNull();
        expect($shipment->pickup_task_id)->toBeNull();
        if ($expected === 'CANDIDATE') {
            expect(collect($shipment->customer_match_candidates)->pluck('customer_id')->all())->toContain($fixture['customer']->id);
        }
        expect(PickupCustomerReconciliation::sole()->approval_snapshot)->toBeNull();
    }
    if (! $linked) {
        $this->actingAs($fixture['admin'])->getJson(route('reconciliation-workspace.awbs', ['task' => $fixture['task'], 'mode' => 'unassigned', 'q' => 'Songket']))->assertOk()->assertJsonPath('total', 1);
    }
})->with([
    'kode benar, ejaan Vany berbeda dari master Vanny' => ['4000 Vany Songket', '', '', 'MATCHED', true],
    'kode kurang satu nol' => ['400 Vany Songket', '', '', 'CANDIDATE', false],
    'kode salah tidak terdaftar' => ['201 Vany Songket', '', '', 'UNMATCHED', false],
    'nama saja tanpa alias' => ['Vany Songket', '', '', 'UNMATCHED', false],
    'nama master saja tanpa alias' => ['Vanny Songket', '', '', 'UNMATCHED', false],
    'alias sah mengenali customer tetapi belum menentukan pickup' => ['Vany Songket', '', 'Vany Songket', 'MATCHED', false],
    'nama typo terhadap alias sah hanya kandidat' => ['Vany Songket', '', 'Vanny Songket', 'CANDIDATE', false],
    'nama tanpa kode tetapi kolom kode sah tersedia' => ['Vany Songket', '4000', '', 'MATCHED', true],
]);

test('a valid but wrong code can allocate to another customer and requires explicit audited reassign', function () {
    $fixture = todayAttributionFixture(4);
    $other = Customer::factory()->create(['customer_code' => '201', 'name' => 'TOKO LAIN']);
    $otherBook = todayAttributionBook($fixture, $other, 2);
    todayAttributionImport($fixture, [['SHIPPER_NAME' => '4000 Vany Songket'], ['SHIPPER_NAME' => '400 Vany Songket'], ['SHIPPER_NAME' => 'Vany Songket'], ['SHIPPER_NAME' => '201 Vany Songket']]);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    app(ReconcilePickupProcessing::class)->handle($otherBook->id);
    $proofs = PickupRecord::orderBy('id')->get()->map->getAttributes()->all();
    $wrong = JneShipment::where('customer_id', $other->id)->sole();
    expect($wrong->pickup_task_id)->toBe($otherBook->id);
    expect(JneShipment::where('pickup_task_id', $fixture['task']->id)->count())->toBe(1);
    expect(JneShipment::whereNull('pickup_task_id')->count())->toBe(2);
    $this->actingAs($fixture['admin']);
    $this->getJson(route('reconciliation-workspace.awbs', ['task' => $fixture['task'], 'mode' => 'unassigned', 'q' => 'Vany Songket']))->assertOk()->assertJsonPath('total', 2);
    $this->getJson(route('reconciliation-workspace.awbs', ['task' => $fixture['task'], 'mode' => 'suggested']))->assertOk()->assertJsonPath('total', 0);
    $this->getJson(route('reconciliation-workspace.awbs', ['task' => $fixture['task'], 'mode' => 'candidates', 'q' => '201 Vany']))->assertOk()->assertJsonPath('total', 1)->assertJsonPath('data.0.conflict', true);
    $blocked = todayAttributionDecision($fixture['task'], [$wrong], 'ADD');
    $this->postJson(route('reconciliation-workspace.preview', $fixture['task']), $blocked)->assertOk()->assertJsonPath('allowed', false);
    $pooled = JneShipment::whereNull('pickup_task_id')->orderBy('id')->get()->all();
    $body = todayAttributionDecision($fixture['task'], $pooled, 'ADD');
    $preview = $this->postJson(route('reconciliation-workspace.preview', $fixture['task']), $body)->assertOk()->assertJsonPath('allowed', true);
    expect(JneShipment::whereNull('pickup_task_id')->count())->toBe(2);

    $this->postJson(route('reconciliation-workspace.apply', $fixture['task']), [...$body, 'preview_hash' => $preview->json('preview_hash')])->assertOk();
    expect(app(QueryReconciliationWorkspace::class)->handle($fixture['task'])['quantity_status'])->toBe('SHORTAGE');
    $body = todayAttributionDecision($fixture['task'], [$wrong], 'REASSIGN');
    $preview = $this->postJson(route('reconciliation-workspace.preview', $fixture['task']), $body)->assertOk()->assertJsonPath('allowed', true);
    config(['pickup.automation.auto_lock' => true]);
    $this->postJson(route('reconciliation-workspace.apply', $fixture['task']), [...$body, 'preview_hash' => $preview->json('preview_hash')])->assertOk();

    expect(JneShipment::where('pickup_task_id', $fixture['task']->id)->count())->toBe(4);
    expect(JneShipment::where('pickup_task_id', $otherBook->id)->count())->toBe(0);
    expect(app(QueryReconciliationWorkspace::class)->handle($fixture['task'])['status'])->toBe('LOCKED');
    expect(PickupRecord::orderBy('id')->get()->map->getAttributes()->all())->toBe($proofs);
    $this->assertDatabaseCount('jne_report_awbs', 4);
    $this->assertDatabaseCount('pickup_awb_review_events', 4);
    $this->postJson(route('reconciliation-workspace.apply', $fixture['task']), [...$body, 'preview_hash' => $preview->json('preview_hash')])->assertConflict();
});

test('today unassigned search needs a real sender fragment or AWB rather than an assumed customer code', function () {
    $fixture = todayAttributionFixture();
    todayAttributionImport($fixture, [['SHIPPER_NAME' => 'Vany Songket']]);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    $this->actingAs($fixture['admin']);

    foreach (['Vanny' => 0, '4000' => 0, 'Songket' => 1, '0101000000000001' => 1] as $query => $total) {
        $this->getJson(route('reconciliation-workspace.awbs', ['task' => $fixture['task'], 'mode' => 'unassigned', 'q' => $query]))->assertOk()->assertJsonPath('total', $total);
    }

    expect(JneShipment::sole()->pickup_task_id)->toBeNull();
});

test('a verified name alias and an exact pickup reference together can allocate without a sender code', function () {
    $fixture = todayAttributionFixture();
    JneShipperAlias::factory()->create(['customer_id' => $fixture['customer']->id, 'shipper_name' => 'Vany Songket']);

    todayAttributionImport($fixture, [['SHIPPER_NAME' => 'Vany Songket', 'NOREF' => $fixture['task']->reference]]);

    expect(JneShipment::sole()->customer_id)->toBe($fixture['customer']->id);
    expect(JneShipment::sole()->pickup_task_id)->toBe($fixture['task']->id);
});

test('a truncated code that belongs to another registered customer is not treated as a typo candidate', function () {
    $fixture = todayAttributionFixture();
    $other = Customer::factory()->create(['customer_code' => '400', 'name' => 'CUSTOMER KODE 400']);
    $otherBook = todayAttributionBook($fixture, $other, 2);

    todayAttributionImport($fixture, [['SHIPPER_NAME' => '400 Vany Songket']]);

    expect(JneShipment::sole()->customer_id)->toBe($other->id);
    expect(JneShipment::sole()->pickup_task_id)->toBe($otherBook->id);
    expect(JneShipment::sole()->customer_match_status)->toBe('MATCHED');
});

test('a wrong valid code can even lock the wrong book and then requires official reopening before reassign', function () {
    $fixture = todayAttributionFixture();
    $other = Customer::factory()->create(['customer_code' => '201', 'name' => 'TOKO LAIN']);
    $otherBook = todayAttributionBook($fixture, $other, 1);
    config(['pickup.automation.auto_lock' => true]);
    todayAttributionImport($fixture, [['SHIPPER_NAME' => '201 Vany Songket']]);
    app(ReconcilePickupProcessing::class)->handle($otherBook->id);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    $locked = PickupCustomerReconciliation::where('customer_id', $other->id)->sole();
    expect($locked->approval_snapshot['included_count'])->toBe(1);
    $oldSnapshot = $locked->approval_snapshot;
    $shipment = JneShipment::sole();
    $body = todayAttributionDecision($fixture['task'], [$shipment], 'REASSIGN');
    $this->actingAs($fixture['admin']);
    $preview = $this->postJson(route('reconciliation-workspace.preview', $fixture['task']), $body)->assertOk()->assertJsonPath('allowed', false);
    $this->postJson(route('reconciliation-workspace.apply', $fixture['task']), [...$body, 'preview_hash' => $preview->json('preview_hash')])->assertConflict();
    expect($locked->fresh()->approval_snapshot)->toBe($oldSnapshot);
    $this->postJson(route('reconciliation-workspace.lock', $otherBook), ['action' => 'REOPEN', 'expected_revision' => $locked->fresh()->revision, 'reason' => 'Simulasi: customer mengonfirmasi kode 201 salah input, seharusnya 4000.'])->assertOk();
    $body = todayAttributionDecision($fixture['task'], [$shipment], 'REASSIGN');
    $preview = $this->postJson(route('reconciliation-workspace.preview', $fixture['task']), $body)->assertOk()->assertJsonPath('allowed', true);

    $this->postJson(route('reconciliation-workspace.apply', $fixture['task']), [...$body, 'preview_hash' => $preview->json('preview_hash')])->assertOk();

    expect($shipment->fresh()->pickup_task_id)->toBe($fixture['task']->id);
    expect(app(QueryReconciliationWorkspace::class)->handle($fixture['task'])['status'])->toBe('LOCKED');
    $reopened = DB::table('pickup_customer_reconciliation_events')->where('customer_reconciliation_id', $locked->id)->get()
        ->map(fn ($row): array => json_decode($row->snapshot, true))->firstWhere('event', 'REOPEN');
    expect($reopened['previous_approval'])->toBe($oldSnapshot);
});

test('ambiguous registered sender aliases stay in the pool instead of choosing either customer', function () {
    $fixture = todayAttributionFixture();
    $other = Customer::factory()->create(['customer_code' => '201', 'name' => 'TOKO LAIN']);
    foreach ([$fixture['customer'], $other] as $customer) {
        JneShipperAlias::factory()->create(['customer_id' => $customer->id, 'shipper_name' => 'Vany Songket']);
    }

    todayAttributionImport($fixture, [['SHIPPER_NAME' => 'Vany Songket']]);

    expect(JneShipment::sole()->customer_match_status)->toBe('AMBIGUOUS');
    expect(JneShipment::sole()->pickup_task_id)->toBeNull();
});

test('admin corrections require a reason and reject changed AWB evidence after preview', function () {
    $fixture = todayAttributionFixture();
    todayAttributionImport($fixture, [['SHIPPER_NAME' => 'Vany Songket']]);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    $shipment = JneShipment::sole();
    $body = todayAttributionDecision($fixture['task'], [$shipment], 'ADD');
    $this->actingAs($fixture['admin']);
    $this->postJson(route('reconciliation-workspace.preview', $fixture['task']), [...$body, 'reason' => ''])->assertUnprocessable()->assertJsonValidationErrors('reason');
    $preview = $this->postJson(route('reconciliation-workspace.preview', $fixture['task']), $body)->assertOk()->assertJsonPath('allowed', true);
    $shipment->increment('version');

    $this->postJson(route('reconciliation-workspace.apply', $fixture['task']), [...$body, 'preview_hash' => $preview->json('preview_hash')])->assertConflict();

    expect($shipment->fresh()->pickup_task_id)->toBeNull();
    $this->assertDatabaseCount('pickup_awb_review_events', 0);
});

test('a valid wrong prefix is held when independent verified code or sender alias contradicts it', function (string $proof) {
    $fixture = todayAttributionFixture();
    Customer::factory()->create(['customer_code' => '201', 'name' => 'TOKO LAIN']);
    if ($proof === 'alias') {
        JneShipperAlias::factory()->create(['customer_id' => $fixture['customer']->id, 'shipper_name' => '201 Vany Songket']);
    }
    todayAttributionImport($fixture, [['SHIPPER_NAME' => '201 Vany Songket', 'CUSTOMER_CODE' => $proof === 'column' ? '4000' : '']]);

    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);

    expect(JneShipment::sole()->customer_match_status)->toBe('CONFLICT');
    expect(JneShipment::sole()->pickup_task_id)->toBeNull();
    expect(PickupCustomerReconciliation::sole()->approval_snapshot)->toBeNull();
})->with(['column', 'alias']);

test('today take out returns an excess AWB to the pool and reimport does not silently put it back', function () {
    $fixture = todayAttributionFixture();
    $rows = [['SHIPPER_NAME' => '4000 Vany Songket'], ['SHIPPER_NAME' => '4000 Vany Songket']];
    todayAttributionImport($fixture, $rows);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    expect(app(QueryReconciliationWorkspace::class)->handle($fixture['task'])['quantity_status'])->toBe('EXCESS');
    $removed = JneShipment::orderByDesc('id')->firstOrFail();
    $body = todayAttributionDecision($fixture['task'], [$removed], 'REMOVE');
    $this->actingAs($fixture['admin']);
    $preview = $this->postJson(route('reconciliation-workspace.preview', $fixture['task']), $body)->assertOk()->assertJsonPath('allowed', true);

    $this->postJson(route('reconciliation-workspace.apply', $fixture['task']), [...$body, 'preview_hash' => $preview->json('preview_hash')])->assertOk();
    todayAttributionImport($fixture, $rows);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);

    expect($removed->fresh()->pickup_task_id)->toBeNull();
    $this->assertDatabaseCount('jne_shipments', 2);
    $this->assertDatabaseCount('jne_report_awbs', 4);
    $this->assertDatabaseCount('pickup_awb_exclusions', 1);
    $this->assertDatabaseCount('pickup_awb_review_events', 1);
});

test('two pickup books today share unique allocations and one daily result after repeated imports', function () {
    $fixture = todayAttributionFixture();
    $second = todayAttributionBook($fixture, $fixture['customer'], 1);
    $rows = [['SHIPPER_NAME' => '4000 Vany Songket'], ['SHIPPER_NAME' => '4000 Vany Songket']];
    todayAttributionImport($fixture, $rows);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    todayAttributionImport($fixture, $rows);

    app(ReconcilePickupProcessing::class)->handle($second->id);

    $this->assertDatabaseCount('jne_shipments', 2);
    $this->assertDatabaseCount('pickup_customer_reconciliations', 1);
    expect(JneShipment::where('pickup_task_id', $fixture['task']->id)->count())->toBe(1);
    expect(JneShipment::where('pickup_task_id', $second->id)->count())->toBe(1);
    expect(PickupCustomerReconciliation::sole()->categories['manual_hybrid'])->toMatchArray(['expected' => 2, 'confirmed' => 2, 'shortfall' => 0, 'excess' => 0]);
});

test('today pool and add respect retail boundaries rather than import date', function (string $entry, int $visible) {
    $fixture = todayAttributionFixture();
    $this->travelTo('2026-11-15 00:00:00 UTC');
    todayAttributionImport($fixture, [['SHIPPER_NAME' => 'Vany Songket', 'TGL_ENTRY' => $entry]]);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    $this->actingAs($fixture['admin'])->getJson(route('reconciliation-workspace.awbs', ['task' => $fixture['task'], 'mode' => 'unassigned', 'q' => 'Vany']))->assertOk()->assertJsonPath('total', $visible);
    $body = todayAttributionDecision($fixture['task'], [JneShipment::sole()], 'ADD');

    $this->postJson(route('reconciliation-workspace.preview', $fixture['task']), $body)->assertOk()->assertJsonPath('allowed', $visible === 1);

    expect(JneShipment::sole()->pickup_task_id)->toBeNull();
})->with([
    'kemarin 23.00 ditolak' => ['2026-11-13 23:00:00', 0],
    'hari ini 04.59 masih bucket kemarin' => ['2026-11-14 04:59:59', 0],
    'hari ini 05.00 masuk bucket hari ini' => ['2026-11-14 05:00:00', 1],
    'besok 04.59 masih bucket hari ini' => ['2026-11-15 04:59:59', 1],
    'besok 05.00 masuk bucket besok' => ['2026-11-15 05:00:00', 0],
]);

test('canceled pool evidence is searchable but cannot be added', function () {
    $fixture = todayAttributionFixture();
    todayAttributionImport($fixture, [['SHIPPER_NAME' => 'Vany Songket', 'AWB_CANCEL' => 'Y']]);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    $this->actingAs($fixture['admin'])->getJson(route('reconciliation-workspace.awbs', ['task' => $fixture['task'], 'mode' => 'unassigned']))->assertOk()->assertJsonPath('total', 1);
    $body = todayAttributionDecision($fixture['task'], [JneShipment::sole()], 'ADD');

    $this->postJson(route('reconciliation-workspace.preview', $fixture['task']), $body)->assertOk()->assertJsonPath('allowed', false);

    expect(JneShipment::sole()->pickup_task_id)->toBeNull();
});

test('equal totals in the wrong category today cannot finalize', function () {
    $fixture = todayAttributionFixture();
    todayAttributionImport($fixture, [['SHIPPER_NAME' => '4000 Vany Songket', 'PROCESS_TYPE' => 'ORION']]);

    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);

    $workspace = app(QueryReconciliationWorkspace::class)->handle($fixture['task']);
    expect($workspace['quantity_status'])->toBe('CONFLICT');
    expect($workspace['categories']['manual_hybrid']['shortfall'])->toBe(1);
    expect($workspace['categories']['css_orion']['excess'])->toBe(1);
    expect($workspace['eligible'])->toBeFalse();
    $this->assertDatabaseCount('pickup_awb_manifests', 0);
});

test('staff cannot cherry pick today even with a current preview payload', function () {
    $fixture = todayAttributionFixture();
    todayAttributionImport($fixture, [['SHIPPER_NAME' => 'Vany Songket']]);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    $body = todayAttributionDecision($fixture['task'], [JneShipment::sole()], 'ADD');
    $this->actingAs(User::factory()->create(['role' => 'pickup_staff', 'is_active' => true]));

    $this->postJson(route('reconciliation-workspace.preview', $fixture['task']), $body)->assertForbidden();

    expect(JneShipment::sole()->pickup_task_id)->toBeNull();
    $this->assertDatabaseCount('pickup_awb_review_events', 0);
});

test('matching today still waits without source proof and late extra evidence preserves an immutable snapshot', function () {
    $fixture = todayAttributionFixture();
    $rows = [['SHIPPER_NAME' => '4000 Vany Songket']];
    todayAttributionImport($fixture, $rows);
    $definition = $fixture['contract']->definition;
    $fixture['contract']->update(['definition' => [...$definition, 'collection_mode' => 'unverified']]);
    config(['pickup.automation.auto_lock' => true]);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    $waiting = app(QueryReconciliationWorkspace::class)->handle($fixture['task']);
    expect($waiting['quantity_status'])->toBe('MATCHED');
    expect($waiting['status'])->toBe('WAITING_SOURCE');
    $this->assertDatabaseCount('pickup_awb_manifests', 0);
    $fixture['contract']->update(['definition' => $definition]);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    $snapshot = PickupCustomerReconciliation::sole()->approval_snapshot;
    expect($snapshot['mode'])->toBe('AUTOMATIC');

    todayAttributionImport($fixture, [...$rows, ['SHIPPER_NAME' => '4000 Vany Songket']]);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);

    expect(PickupCustomerReconciliation::sole()->approval_snapshot)->toBe($snapshot);
    expect(PickupCustomerReconciliation::sole()->post_lock_change['added_count'])->toBe(1);
    expect(DB::table('pickup_customer_reconciliation_events')->get()->filter(fn ($row): bool => (json_decode($row->snapshot, true)['event'] ?? '') === 'POST_LOCK'))->toHaveCount(1);
});
