<?php

use App\Actions\Pickup\DeliverPickupAwbManifest;
use App\Actions\Pickup\PickupResultPeriod;
use App\Actions\Pickup\QueryReconciliationWorkspace;
use App\Actions\Pickup\ReconcilePickupProcessing;
use App\Models\CustomerAwbDeliveryPreference;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\PickupAwbDelivery;
use App\Models\PickupAwbManifest;
use App\Models\PickupCustomerReconciliation;
use App\Models\PickupProcessingReconciliation;
use App\Models\PickupTask;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;

require_once __DIR__.'/../Fixtures/pickup-automation.php';

beforeEach(function () {
    $this->travelTo('2026-10-26 12:00:00 UTC');
    config(['pickup.automation.enabled' => false, 'pickup.automation.auto_lock' => false, 'pickup.automation.send_enabled' => false, 'jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => true]);
    Queue::fake();
    Storage::fake('jne_reports');
    Storage::fake('local');
});

function reconciliationWorkspaceFixture(): array
{
    $fixture = pickupAutomationFixture(2, 0);
    $fixture['job'] = importPickupAutomationReport($fixture, 2, 0);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);

    return $fixture;
}

function reconciliationWorkspaceLockBody(array $fixture): array
{
    $workspace = app(QueryReconciliationWorkspace::class)->handle($fixture['task']);

    return ['action' => 'LOCK', 'expected_revision' => $workspace['version'], 'fingerprint' => $workspace['fingerprint'], 'review_token' => $workspace['review_token'], 'reason' => 'Seluruh bukti sumber diperiksa.'];
}

test('workspace uses actual evidence and does not calculate or mutate during investigation', function () {
    $fixture = reconciliationWorkspaceFixture();
    $before = PickupCustomerReconciliation::sole()->getAttributes();
    $this->actingAs($fixture['admin'])->getJson(route('reconciliation-workspace.show', $fixture['task']))->assertOk()
        ->assertJsonPath('status', 'VERIFIED')->assertJsonPath('coverage.status', 'COMPLETE')->assertJsonPath('metrics.expected', 2)->assertJsonPath('metrics.observed', 2)->assertJsonPath('metrics.matched', 2);
    $this->getJson(route('reconciliation-workspace.awbs', ['task' => $fixture['task'], 'mode' => 'included']))->assertOk()->assertJsonPath('total', 2)->assertJsonPath('data.0.report_id', $fixture['job']->id);
    $shipment = JneShipment::firstOrFail();
    $this->getJson(route('reconciliation-workspace.evidence', [$fixture['task'], $shipment]))->assertOk()->assertJsonPath('sources.data.0.report_job_id', $fixture['job']->id)->assertJsonMissingPath('sources.data.0.raw_data');
    expect(PickupCustomerReconciliation::sole()->getAttributes())->toBe($before);
    $this->assertDatabaseCount('pickup_customer_reconciliation_events', 1);
});

test('investigation sorts recipient names before pagination and returns the original shipper separately', function () {
    $fixture = reconciliationWorkspaceFixture();
    $shipments = JneShipment::orderBy('awb')->get();
    $shipments[0]->latestSource->update(['consignee_name' => 'ZULU PENERIMA']);
    $shipments[1]->latestSource->update(['shipper_name' => '836 TWINIS PENGIRIM ASLI', 'consignee_name' => 'ALFA PENERIMA']);
    foreach (range(1, 31) as $number) {
        $source = JneReportAwb::factory()->create([
            'report_job_id' => $fixture['job']->id, 'source_row' => 100 + $number,
            'awb' => sprintf('SORT%03d', $number), 'consignee_name' => $number === 31 ? '' : 'ALFA PENERIMA', 'entry_at' => $shipments[1]->latestSource->entry_at,
        ]);
        JneShipment::factory()->create([
            'awb' => $source->awb, 'customer_id' => null,
            'latest_report_awb_id' => $source->id, 'latest_report_job_id' => $fixture['job']->id,
        ]);
    }

    $this->actingAs($fixture['admin']);
    $first = $this->getJson(route('reconciliation-workspace.awbs', ['task' => $fixture['task'], 'mode' => 'candidates']))
        ->assertOk()->assertJsonPath('total', 33)->assertJsonCount(30, 'data')
        ->assertJsonPath('data.0.id', $shipments[1]->id)
        ->assertJsonPath('data.0.consignee_name', 'ALFA PENERIMA')
        ->assertJsonPath('data.0.shipper_name', '836 TWINIS PENGIRIM ASLI');
    expect(array_unique(array_column($first->json('data'), 'consignee_name')))->toBe(['ALFA PENERIMA']);
    $this->getJson(route('reconciliation-workspace.awbs', ['task' => $fixture['task'], 'mode' => 'candidates', 'page' => 2]))
        ->assertOk()->assertJsonCount(3, 'data')->assertJsonPath('data.0.consignee_name', 'ALFA PENERIMA')
        ->assertJsonPath('data.1.consignee_name', 'ZULU PENERIMA')->assertJsonPath('data.2.consignee_name', '');
});

test('pool search preserves the operational day latest evidence and literal wildcard searches', function () {
    $fixture = reconciliationWorkspaceFixture();
    $start = PickupResultPeriod::start('2026-10-26')->utc();
    $wanted = [];
    foreach ([$start->subSecond(), $start, $start->addDay()->subSecond(), $start->addDay()] as $index => $at) {
        $source = JneReportAwb::factory()->create(['report_job_id' => $fixture['job']->id, 'source_row' => 100 + $index, 'entry_at' => $at,
            'shipper_name' => 'POOL_% literal', 'consignee_name' => sprintf('Penerima %d', $index)]);
        $shipment = JneShipment::factory()->create(['awb' => $source->awb, 'customer_id' => null, 'pickup_task_id' => null, 'latest_report_awb_id' => $source->id, 'latest_report_job_id' => $fixture['job']->id]);
        if (in_array($index, [1, 2], true)) {
            $wanted[] = $shipment->id;
        }
        if ($index === 3) {
            JneReportAwb::factory()->create(['report_job_id' => ReportJob::factory()->create()->id, 'source_row' => 200, 'awb' => $source->awb, 'entry_at' => $start, 'shipper_name' => 'POOL_% literal']);
        }
    }
    $this->actingAs($fixture['admin'])->getJson(route('reconciliation-workspace.awbs', ['task' => $fixture['task'], 'mode' => 'unassigned', 'q' => 'POOL_%']))
        ->assertOk()->assertJsonPath('total', 2)->assertJsonPath('data.0.id', $wanted[0])->assertJsonPath('data.1.id', $wanted[1])
        ->assertJsonPath('data.0.customer', null);
    expect(JneShipment::whereNull('pickup_task_id')->count())->toBe(4);
});

test('MySQL pool queries retain filtering pagination and workspace membership in an isolated database', function () {
    $database = 'reconciliation_pool_test_'.bin2hex(random_bytes(6));
    $original = config('database.default');
    $base = config('database.connections.mysql');
    config(['database.connections.pool_server' => [...$base, 'url' => null, 'database' => null]]);
    DB::connection('pool_server')->statement('CREATE DATABASE '.$database);
    config(['database.connections.pool_test' => [...$base, 'url' => null, 'database' => $database], 'database.default' => 'pool_test']);
    try {
        Artisan::call('migrate', ['--database' => 'pool_test', '--force' => true, '--no-interaction' => true]);
        $fixture = reconciliationWorkspaceFixture();
        $row = JneShipment::orderBy('id')->firstOrFail();
        $row->update(['pickup_task_id' => null]);
        $row->latestSource->update(['shipper_name' => 'Pool Pengirim', 'consignee_name' => 'ALFA']);
        $this->actingAs($fixture['admin']);
        foreach (['unassigned', 'suggested', 'candidates'] as $mode) {
            $this->getJson(route('reconciliation-workspace.awbs', ['task' => $fixture['task'], 'mode' => $mode, 'q' => 'Pool Pengirim']))
                ->assertOk()->assertJsonPath('total', 1)->assertJsonPath('data.0.id', $row->id)->assertJsonPath('data.0.consignee_name', 'ALFA');
        }
        $this->getJson(route('reconciliation-workspace.awbs', ['task' => $fixture['task'], 'mode' => 'unassigned', 'q' => 'Pool Pengirim', 'page' => 2]))
            ->assertOk()->assertJsonPath('total', 1)->assertJsonCount(0, 'data');
        expect(app(QueryReconciliationWorkspace::class)->scope($fixture['task'], [$fixture['task']->id])->count())->toBe(2);
        $this->getJson(route('reconciliation-workspace.show', $fixture['task']))->assertOk()->assertJsonPath('metrics.observed', 2);
    } finally {
        config(['database.default' => $original]);
        DB::purge('pool_test');
        DB::connection('pool_server')->statement('DROP DATABASE '.$database);
        DB::purge('pool_server');
    }
});

test('matching ready AWBs may lock without coverage while a failed report remains blocked', function (string $condition) {
    $fixture = reconciliationWorkspaceFixture();
    if ($condition === 'unknown') {
        $fixture['contract']->update(['active_key' => null]);
    } else {
        $fixture['job']->update(['projection_status' => 'FAILED']);
    }
    $this->actingAs($fixture['admin'])->getJson(route('reconciliation-workspace.show', $fixture['task']))->assertOk()->assertJsonPath('eligible', $condition === 'unknown')->assertJsonPath('status', $condition === 'unknown' ? 'VERIFIED' : 'PROCESSING_FAILED');
    $response = $this->postJson(route('reconciliation-workspace.lock', $fixture['task']), reconciliationWorkspaceLockBody($fixture));
    if ($condition === 'unknown') {
        $response->assertOk();
        expect(PickupCustomerReconciliation::sole()->approval_snapshot['included_count'])->toBe(2);
    } else {
        $response->assertConflict();
        expect(PickupCustomerReconciliation::sole()->approval_snapshot)->toBeNull();
    }
})->with(['unknown', 'failed']);

test('missing excess category and ambiguous evidence remain blocking discrepancies', function (string $condition) {
    $fixture = reconciliationWorkspaceFixture();
    $shipment = JneShipment::firstOrFail();
    match ($condition) {
        'missing' => $shipment->update(['pickup_task_id' => null, 'customer_id' => null, 'match_status' => 'UNMATCHED']),
        'category' => $shipment->update(['category' => 'css_orion']),
        'ambiguous' => $shipment->update(['customer_match_status' => 'AMBIGUOUS']),
        'excess' => importPickupAutomationReport($fixture, 3, 0),
    };
    if (in_array($condition, ['missing', 'excess'], true)) {
        app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    }
    $this->actingAs($fixture['admin'])->getJson(route('reconciliation-workspace.show', $fixture['task']))->assertOk()->assertJsonPath('eligible', false)->assertJsonPath('status', 'IN_REVIEW');
    $this->postJson(route('reconciliation-workspace.lock', $fixture['task']), reconciliationWorkspaceLockBody($fixture))->assertConflict();
})->with(['missing', 'excess', 'category', 'ambiguous']);

test('unknown data stays null and opening an unevaluated workspace creates nothing', function () {
    $fixture = pickupAutomationFixture(2, 0);
    $this->actingAs($fixture['admin'])->getJson(route('reconciliation-workspace.show', $fixture['task']))->assertOk()->assertJsonPath('status', 'OPEN')->assertJsonPath('quantity_status', 'NOT_EVALUATED')->assertJsonPath('metrics.expected', null)->assertJsonPath('metrics.observed', null)->assertJsonPath('categories.cashless_hybrid.observed', null);
    $this->assertDatabaseCount('pickup_customer_reconciliations', 0);
});

test('approved lock is versioned immutable audited and does not change finalized quantities', function () {
    $fixture = reconciliationWorkspaceFixture();
    $proof = $fixture['task']->proof->fresh()->getAttributes();
    $this->actingAs($fixture['admin'])->postJson(route('reconciliation-workspace.lock', $fixture['task']), reconciliationWorkspaceLockBody($fixture))->assertOk();
    $snapshot = PickupCustomerReconciliation::sole()->approval_snapshot;
    expect($snapshot['included_awbs'])->toHaveCount(2)->and($snapshot['reviewer']['id'])->toBe($fixture['admin']->id);
    $this->getJson(route('reconciliation-workspace.show', $fixture['task']))->assertOk()->assertJsonPath('status', 'LOCKED')->assertJsonMissingPath('approval.included_awbs');
    $this->getJson(route('reconciliation-workspace.awbs', ['task' => $fixture['task'], 'mode' => 'snapshot']))->assertOk()->assertJsonPath('total', 2);
    $this->postJson(route('reconciliation-workspace.lock', $fixture['task']), reconciliationWorkspaceLockBody($fixture))->assertConflict();
    expect($fixture['task']->proof->fresh()->getAttributes())->toBe($proof);
    $this->assertDatabaseCount('pickup_customer_reconciliation_events', 2);
});

test('approved recipient names are sorted and remain frozen when source names change', function () {
    $fixture = reconciliationWorkspaceFixture();
    $shipments = JneShipment::orderBy('awb')->get();
    $shipments[0]->latestSource->update(['consignee_name' => 'ZULU PENERIMA']);
    $shipments[1]->latestSource->update(['consignee_name' => 'ALFA PENERIMA']);
    $this->actingAs($fixture['admin'])->postJson(route('reconciliation-workspace.lock', $fixture['task']), reconciliationWorkspaceLockBody($fixture))->assertOk();
    $shipments[1]->latestSource->update(['consignee_name' => 'PENERIMA BERUBAH']);

    $this->getJson(route('reconciliation-workspace.awbs', ['task' => $fixture['task'], 'mode' => 'snapshot']))
        ->assertOk()->assertJsonPath('data.0.id', $shipments[1]->id)
        ->assertJsonPath('data.0.consignee_name', 'ALFA PENERIMA')->assertJsonPath('data.1.consignee_name', 'ZULU PENERIMA');
});

test('late evidence keeps the approved snapshot and records one post lock change per evidence state', function () {
    $fixture = reconciliationWorkspaceFixture();
    $this->actingAs($fixture['admin'])->postJson(route('reconciliation-workspace.lock', $fixture['task']), reconciliationWorkspaceLockBody($fixture))->assertOk();
    $approved = PickupCustomerReconciliation::sole()->approval_snapshot;
    $manifest = PickupAwbManifest::sole()->getAttributes();
    importPickupAutomationReport($fixture, 3, 0);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    $group = PickupCustomerReconciliation::sole();
    expect($group->approval_snapshot)->toBe($approved)->and($group->post_lock_change['event'])->toBe('POST_LOCK')->and($group->post_lock_change['added_count'])->toBe(1);
    expect(PickupAwbManifest::sole()->snapshot)->toBe(json_decode($manifest['snapshot'], true));
    expect(PickupAwbManifest::sole()->status)->toBe('REVIEW');
    $this->getJson(route('reconciliation-workspace.show', $fixture['task']))->assertOk()->assertJsonPath('status', 'LOCKED_REVIEW');
    expect(DB::table('pickup_customer_reconciliation_events')->get()->filter(fn ($event): bool => (json_decode($event->snapshot, true)['event'] ?? '') === 'POST_LOCK')->count())->toBe(1);
});

test('normal legacy unlock cannot bypass an approved snapshot and explicit reopen preserves its history', function () {
    $fixture = reconciliationWorkspaceFixture();
    $this->actingAs($fixture['admin'])->postJson(route('reconciliation-workspace.lock', $fixture['task']), reconciliationWorkspaceLockBody($fixture))->assertOk();
    $group = PickupCustomerReconciliation::sole();
    $result = PickupProcessingReconciliation::sole();
    $this->postJson(route('pickup-automation.review', $fixture['task']), ['action' => 'UNLOCK', 'expected_version' => $result->input_version, 'reason' => 'Koreksi terkontrol'])->assertConflict();
    $this->postJson(route('reconciliation-workspace.lock', $fixture['task']), ['action' => 'REOPEN', 'expected_revision' => $group->revision, 'reason' => 'Bukti tambahan perlu ditinjau.'])->assertOk();
    expect($group->fresh()->approval_snapshot)->toBeNull()->and($result->fresh()->review_open)->toBeTrue()->and($result->fresh()->status)->toBe('REVIEW');
    $event = json_decode(DB::table('pickup_customer_reconciliation_events')->latest('revision')->value('snapshot'), true);
    expect($event['previous_approval']['included_awbs'])->toHaveCount(2);
});

test('stale fingerprint and stale reconciliation versions cannot approve unseen evidence', function (string $condition) {
    $fixture = reconciliationWorkspaceFixture();
    $data = reconciliationWorkspaceLockBody($fixture);
    if ($condition === 'version') {
        PickupCustomerReconciliation::sole()->increment('revision');
    } else {
        $data['fingerprint'] = str_repeat('a', 64);
    }
    $this->actingAs($fixture['admin'])->postJson(route('reconciliation-workspace.lock', $fixture['task']), $data)->assertConflict();
    expect(PickupCustomerReconciliation::sole()->approval_snapshot)->toBeNull();
})->with(['version', 'fingerprint']);

test('candidate search includes cross customer and already owned evidence but preview rejects conflicting ownership', function () {
    $fixture = reconciliationWorkspaceFixture();
    $otherTask = PickupTask::factory()->create();
    $shipment = JneShipment::firstOrFail();
    $shipment->update(['pickup_task_id' => $otherTask->id, 'customer_id' => $otherTask->customer_id]);
    $result = PickupProcessingReconciliation::sole();
    $result->update(['locked_at' => null, 'status' => 'PARTIAL']);
    $body = ['action' => 'ADD', 'expected_revision' => PickupCustomerReconciliation::sole()->revision, 'expected_version' => $result->input_version,
        'target_task_id' => $fixture['task']->id, 'reason' => 'Periksa bukti lintas customer.', 'items' => [['id' => $shipment->id, 'version' => $shipment->version]]];
    $this->actingAs($fixture['admin'])->getJson(route('reconciliation-workspace.awbs', ['task' => $fixture['task'], 'mode' => 'candidates', 'q' => $shipment->awb]))->assertOk()->assertJsonPath('data.0.customer_id', $otherTask->customer_id)->assertJsonPath('data.0.conflict', true);
    $preview = $this->postJson(route('reconciliation-workspace.preview', $fixture['task']), $body)->assertOk()->assertJsonPath('allowed', false);
    $this->postJson(route('reconciliation-workspace.apply', $fixture['task']), [...$body, 'preview_hash' => $preview->json('preview_hash')])->assertConflict();
    expect($shipment->fresh()->pickup_task_id)->toBe($otherTask->id);
});

test('bulk removal has a non mutating preview then applies atomically with evidence audits and unchanged POP', function () {
    $fixture = reconciliationWorkspaceFixture();
    $result = PickupProcessingReconciliation::sole();
    $result->update(['locked_at' => null, 'status' => 'PARTIAL']);
    $rows = JneShipment::all();
    $proof = $fixture['task']->proof->fresh()->getAttributes();
    $body = ['action' => 'REMOVE', 'expected_revision' => PickupCustomerReconciliation::sole()->revision, 'expected_version' => $result->input_version,
        'target_task_id' => $fixture['task']->id, 'reason' => 'Bukti salah atribusi diperiksa.', 'items' => $rows->map->only(['id', 'version'])->all()];
    $this->actingAs($fixture['admin']);
    $preview = $this->postJson(route('reconciliation-workspace.preview', $fixture['task']), $body)->assertOk()->assertJsonPath('allowed', true);
    expect(JneShipment::whereNotNull('pickup_task_id')->count())->toBe(2);
    $this->postJson(route('reconciliation-workspace.apply', $fixture['task']), [...$body, 'preview_hash' => $preview->json('preview_hash')])->assertOk();
    expect(JneShipment::whereNotNull('pickup_task_id')->count())->toBe(0)->and($fixture['task']->proof->fresh()->getAttributes())->toBe($proof);
    $this->getJson(route('reconciliation-workspace.awbs', ['task' => $fixture['task'], 'mode' => 'excluded']))->assertOk()->assertJsonPath('total', 2);
    $this->getJson(route('reconciliation-workspace.awbs', ['task' => $fixture['task'], 'mode' => 'included']))->assertOk()->assertJsonPath('total', 0);
    $this->assertDatabaseCount('pickup_awb_review_events', 2);
    expect(json_decode(DB::table('pickup_awb_review_events')->first()->evidence, true)['source']['report_id'])->toBe($fixture['job']->id);
});

test('duplicate selection and stale AWB versions cannot apply a partial batch', function (string $condition) {
    $fixture = reconciliationWorkspaceFixture();
    $result = PickupProcessingReconciliation::sole();
    $result->update(['locked_at' => null, 'status' => 'PARTIAL']);
    $items = JneShipment::all()->map->only(['id', 'version'])->all();
    if ($condition === 'duplicate') {
        $items[1] = $items[0];
    } else {
        $items[1]['version']++;
    }
    $body = ['action' => 'REMOVE', 'expected_revision' => PickupCustomerReconciliation::sole()->revision, 'expected_version' => $result->input_version, 'target_task_id' => $fixture['task']->id, 'reason' => 'Periksa seluruh bukti.', 'items' => $items];
    $response = $this->actingAs($fixture['admin'])->postJson(route('reconciliation-workspace.preview', $fixture['task']), $body);
    $condition === 'duplicate' ? $response->assertUnprocessable() : $response->assertConflict();
    expect(JneShipment::whereNotNull('pickup_task_id')->count())->toBe(2);
    $this->assertDatabaseCount('pickup_awb_review_events', 0);
})->with(['duplicate', 'stale']);

test('all investigation and mutation endpoints preserve admin authorization', function () {
    $fixture = reconciliationWorkspaceFixture();
    $this->actingAs(User::factory()->create(['role' => 'pickup_staff']));
    foreach (['show', 'awbs'] as $endpoint) {
        $this->getJson(route('reconciliation-workspace.'.$endpoint, $fixture['task']))->assertForbidden();
    }
    $this->getJson(route('reconciliation-workspace.evidence', [$fixture['task'], JneShipment::firstOrFail()]))->assertForbidden();
    foreach (['preview', 'apply', 'lock'] as $endpoint) {
        $this->postJson(route('reconciliation-workspace.'.$endpoint, $fixture['task']), [])->assertForbidden();
    }
});

test('shared account candidates never inherit the selected customer by opening or searching', function () {
    $fixture = reconciliationWorkspaceFixture();
    $shipment = JneShipment::firstOrFail();
    $shipment->update(['customer_id' => null, 'pickup_task_id' => null, 'customer_match_status' => 'AMBIGUOUS', 'match_status' => 'AMBIGUOUS']);
    $this->actingAs($fixture['admin'])->getJson(route('reconciliation-workspace.awbs', ['task' => $fixture['task'], 'mode' => 'candidates', 'account' => $shipment->customer_account]))
        ->assertOk()->assertJsonFragment(['id' => $shipment->id, 'customer_id' => null, 'customer_match_status' => 'AMBIGUOUS']);
    expect($shipment->fresh()->customer_id)->toBeNull();
});

test('bulk cherry picking reuses audited attribution and requires the exact reviewed preview', function () {
    $fixture = reconciliationWorkspaceFixture();
    $result = PickupProcessingReconciliation::sole();
    $result->update(['locked_at' => null, 'status' => 'PARTIAL']);
    JneShipment::query()->update(['pickup_task_id' => null, 'customer_id' => null, 'match_status' => 'UNMATCHED', 'customer_match_status' => 'UNMATCHED']);
    $items = JneShipment::all()->map->only(['id', 'version'])->all();
    $data = ['action' => 'ADD', 'expected_revision' => PickupCustomerReconciliation::sole()->revision, 'expected_version' => $result->input_version,
        'target_task_id' => $fixture['task']->id, 'reason' => 'Kode sumber pada report terbukti sesuai.', 'items' => $items];
    $this->actingAs($fixture['admin']);
    $preview = $this->postJson(route('reconciliation-workspace.preview', $fixture['task']), $data)->assertOk()->assertJsonPath('allowed', true);
    $this->postJson(route('reconciliation-workspace.apply', $fixture['task']), [...$data, 'preview_hash' => str_repeat('a', 64)])->assertConflict();
    $this->assertDatabaseCount('pickup_awb_review_events', 0);
    $this->postJson(route('reconciliation-workspace.apply', $fixture['task']), [...$data, 'preview_hash' => $preview->json('preview_hash')])->assertOk();
    expect(JneShipment::where('pickup_task_id', $fixture['task']->id)->where('customer_id', $fixture['customer']->id)->count())->toBe(2);
    expect(DB::table('jne_shipment_match_events')->where('method', 'REVIEW')->count())->toBe(2);
    $this->assertDatabaseCount('pickup_awb_review_events', 2);
});

test('a new source or concurrent AWB correction invalidates the preview before any mutation', function (string $condition) {
    $fixture = reconciliationWorkspaceFixture();
    $result = PickupProcessingReconciliation::sole();
    $result->update(['locked_at' => null, 'status' => 'PARTIAL']);
    $rows = JneShipment::all();
    $data = ['action' => 'REMOVE', 'expected_revision' => PickupCustomerReconciliation::sole()->revision, 'expected_version' => $result->input_version,
        'target_task_id' => $fixture['task']->id, 'reason' => 'Review sumber tidak sesuai.', 'items' => $rows->map->only(['id', 'version'])->all()];
    $this->actingAs($fixture['admin']);
    $preview = $this->postJson(route('reconciliation-workspace.preview', $fixture['task']), $data)->assertOk();
    if ($condition === 'version') {
        $rows->last()->increment('version');
    } else {
        $source = $rows->last()->latestSource;
        $newSource = $source->replicate();
        $newSource->report_job_id = ReportJob::factory()->create(['status' => 'COMPLETED', 'import_status' => 'IMPORTED', 'projection_status' => 'PROJECTED'])->id;
        $newSource->source_row += 20;
        $newSource->save();
        $rows->last()->update(['latest_report_awb_id' => $newSource->id]);
    }
    $this->postJson(route('reconciliation-workspace.apply', $fixture['task']), [...$data, 'preview_hash' => $preview->json('preview_hash')])->assertConflict();
    expect(JneShipment::whereNotNull('pickup_task_id')->count())->toBe(2);
    $this->assertDatabaseCount('pickup_awb_review_events', 0);
})->with(['version', 'new source']);

test('nearby source dates may be investigated but cannot bypass retail bucket restrictions', function () {
    $fixture = reconciliationWorkspaceFixture();
    $row = JneShipment::firstOrFail();
    $row->update(['pickup_task_id' => null]);
    $row->latestSource->update(['entry_at' => now()->subDay()]);
    $result = PickupProcessingReconciliation::sole();
    $result->update(['locked_at' => null, 'status' => 'PARTIAL']);
    $this->actingAs($fixture['admin'])->getJson(route('reconciliation-workspace.awbs', ['task' => $fixture['task'], 'mode' => 'candidates', 'date' => '2026-10-25', 'q' => $row->awb]))->assertOk()->assertJsonPath('total', 1);
    $this->postJson(route('reconciliation-workspace.preview', $fixture['task']), ['action' => 'ADD', 'expected_revision' => PickupCustomerReconciliation::sole()->revision,
        'expected_version' => $result->input_version, 'target_task_id' => $fixture['task']->id, 'reason' => 'Investigasi data lintas hari.', 'items' => [['id' => $row->id, 'version' => $row->version]]])->assertOk()->assertJsonPath('allowed', false);
});

test('large AWB investigations are paginated with bounded queries and compact histories', function () {
    $fixture = pickupAutomationFixture(65, 0);
    importPickupAutomationReport($fixture, 65, 0);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    $this->actingAs($fixture['admin']);
    DB::enableQueryLog();
    DB::flushQueryLog();
    try {
        $response = $this->getJson(route('reconciliation-workspace.awbs', ['task' => $fixture['task'], 'mode' => 'included']))->assertOk()->assertJsonCount(30, 'data')->assertJsonPath('total', 65)->assertJsonPath('last_page', 3);
        $queries = count(DB::getQueryLog());
    } finally {
        DB::disableQueryLog();
    }
    expect($queries)->toBeLessThan(25);
    $this->getJson(route('reconciliation-workspace.show', $fixture['task']))->assertOk()->assertJsonMissingPath('history.data.0.snapshot.evidence.shipments');
    $history = app(QueryReconciliationWorkspace::class)->handle($fixture['task'])['history']->items()[0];
    expect(json_decode($history->snapshot, true))->not->toHaveKey('evidence');
    $this->getJson(route('reconciliation-workspace.awbs', ['task' => $fixture['task'], 'mode' => 'included', 'page' => 3]))->assertOk()->assertJsonCount(5, 'data');
});

test('confirming current attribution reuses existing admin review without changing quantities or ownership', function () {
    $fixture = reconciliationWorkspaceFixture();
    $result = PickupProcessingReconciliation::sole();
    $result->update(['locked_at' => null, 'status' => 'PARTIAL']);
    $row = JneShipment::firstOrFail();
    $before = $row->only(['customer_id', 'pickup_task_id', 'category']);
    $data = ['action' => 'CONFIRM', 'expected_revision' => PickupCustomerReconciliation::sole()->revision, 'expected_version' => $result->input_version,
        'target_task_id' => $fixture['task']->id, 'reason' => 'Kode customer dan tanggal sumber dikonfirmasi.', 'items' => [$row->only(['id', 'version'])]];
    $this->actingAs($fixture['admin']);
    $preview = $this->postJson(route('reconciliation-workspace.preview', $fixture['task']), $data)->assertOk()->assertJsonPath('allowed', true);
    $this->postJson(route('reconciliation-workspace.apply', $fixture['task']), [...$data, 'preview_hash' => $preview->json('preview_hash')])->assertOk();
    expect($row->fresh()->only(array_keys($before)))->toBe($before)->and($row->fresh()->match_method)->toBe('REVIEW');
    $this->assertDatabaseHas('pickup_awb_review_events', ['action' => 'CONFIRM', 'actor_id' => $fixture['admin']->id]);
});

test('a background source version change requires renewed review even when counts still match', function () {
    $fixture = reconciliationWorkspaceFixture();
    $data = reconciliationWorkspaceLockBody($fixture);
    JneShipment::firstOrFail()->increment('version');
    $this->actingAs($fixture['admin'])->postJson(route('reconciliation-workspace.lock', $fixture['task']), $data)->assertConflict();
    expect(PickupCustomerReconciliation::sole()->approval_snapshot)->toBeNull();
});

test('post lock attribution conflicts keep delivery on hold even when the observed AWB count is unchanged', function () {
    $fixture = reconciliationWorkspaceFixture();
    $this->actingAs($fixture['admin'])->postJson(route('reconciliation-workspace.lock', $fixture['task']), reconciliationWorkspaceLockBody($fixture))->assertOk();
    $group = PickupCustomerReconciliation::sole();
    $group->update(['post_lock_change' => ['event' => 'POST_LOCK', 'hash' => str_repeat('b', 64)]]);
    JneShipment::firstOrFail()->update(['match_method' => 'MANUAL', 'customer_match_status' => 'CONFLICT', 'match_status' => 'CONFLICT']);
    $fixture['job']->update(['parameters' => ['awbs' => JneShipment::pluck('awb')->all()]]);
    $manifest = PickupAwbManifest::sole();
    $manifest->update(['status' => 'READY']);
    $preference = CustomerAwbDeliveryPreference::factory()->create(['customer_id' => $fixture['customer']->id, 'enabled' => true, 'channel' => 'email', 'recipient' => 'review@example.test']);
    $delivery = PickupAwbDelivery::factory()->create(['pickup_awb_manifest_id' => $manifest->id, 'status' => 'READY', 'recipient' => $preference->recipient, 'preference_revision' => $preference->revision]);
    Mail::fake();
    config(['pickup.automation.enabled' => true, 'pickup.automation.send_enabled' => true, 'mail.default' => 'smtp']);
    app(DeliverPickupAwbManifest::class)->handle($delivery->id);
    expect($delivery->fresh()->status)->toBe('CANCELLED');
    Mail::assertNothingSent();
    $this->getJson(route('reconciliation-workspace.show', $fixture['task']))->assertOk()->assertJsonPath('status', 'LOCKED_REVIEW');
});

test('an imported AWB subset may lock matching quantities without claiming full source coverage', function () {
    $fixture = reconciliationWorkspaceFixture();
    $fixture['job']->update(['parameters' => ['awbs' => JneShipment::pluck('awb')->all()]]);
    $this->actingAs($fixture['admin'])->getJson(route('reconciliation-workspace.show', $fixture['task']))->assertOk()
        ->assertJsonPath('metrics.matched', 2)->assertJsonPath('eligible', true)->assertJsonPath('coverage.required_for_lock', false)->assertJsonPath('coverage.requirements.0.linked_awb_count', 2)
        ->assertJsonPath('coverage.requirements.0.blocking_reasons.0', fn (string $reason): bool => str_contains($reason, 'Upload Connote'));
    $this->postJson(route('reconciliation-workspace.lock', $fixture['task']), reconciliationWorkspaceLockBody($fixture))->assertOk();
    expect(PickupCustomerReconciliation::sole()->approval_snapshot['lock_basis'])->toBe('MATCHED_OPERATIONAL_AWBS');
});
