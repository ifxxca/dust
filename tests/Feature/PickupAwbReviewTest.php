<?php

use App\Actions\Handover\CreateSession;
use App\Actions\Handover\VerifyItem;
use App\Actions\Pickup\PickupResultPeriod;
use App\Actions\Pickup\QueryPickupAutomation;
use App\Actions\Pickup\ReconcilePickupProcessing;
use App\Actions\Reports\MatchJneShipments;
use App\Actions\Reports\ProjectJneShipments;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\PickupAwbDelivery;
use App\Models\PickupAwbManifest;
use App\Models\PickupCashlessAwb;
use App\Models\PickupPendingItem;
use App\Models\PickupProcessingReconciliation;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\ReportJob;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

require_once __DIR__.'/../Fixtures/pickup-automation.php';

beforeEach(function () {
    $this->travelTo('2026-10-26 08:00:00 UTC');
    config(['jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => true, 'pickup.automation.enabled' => false]);
    Queue::fake();
    Storage::fake('jne_reports');
    $this->fixture = pickupAutomationFixture(2, 0);
    importPickupAutomationReport($this->fixture, 1, 0);
    app(ReconcilePickupProcessing::class)->handle($this->fixture['task']->id);
    $this->actingAs($this->fixture['admin']);
});

function reviewAwbSource(array $fixture, string $awb, string $entry, string $sender = '400 0 Vanny'): JneShipment
{
    $job = ReportJob::factory()->create(['created_by' => $fixture['admin']->id, 'customer_account' => 'SIM_AUTO_ACCOUNT', 'date_from' => substr($entry, 0, 10), 'date_thru' => substr($entry, 0, 10), 'status' => 'COMPLETED', 'import_status' => 'IMPORTED', 'projection_status' => 'PROJECTED', 'file_checksum' => hash('sha256', $awb)]);
    $source = JneReportAwb::factory()->create(['report_job_id' => $job->id, 'awb' => $awb, 'customer_account' => 'SIM_AUTO_ACCOUNT', 'shipper_name' => $sender,
        'entry_at' => CarbonImmutable::parse($entry, 'Asia/Jakarta')->utc(), 'raw_data' => ['CUSTOMER_CODE' => $sender === 'VANNY' ? '4000' : '400 0', 'PROCESS_TYPE' => 'MANUAL']]);

    return JneShipment::factory()->create(['awb' => $awb, 'latest_report_awb_id' => $source->id, 'latest_report_job_id' => $job->id, 'category' => 'manual_hybrid', 'category_status' => 'MATCHED']);
}

function reviewAwbPayload(PickupTask $task, string $action, array $extra = []): array
{
    return ['action' => $action, 'expected_version' => PickupProcessingReconciliation::where('pickup_task_id', $task->id)->value('input_version') ?? 0, 'reason' => 'Konfirmasi bukti paket oleh customer', ...$extra];
}

test('one operational bucket includes 04:59 tomorrow and excludes 05:00 tomorrow', function () {
    $before = reviewAwbSource($this->fixture, 'BOUNDARY-BEFORE', '2026-10-27 04:59:59', 'VANNY');
    $after = reviewAwbSource($this->fixture, 'BOUNDARY-AFTER', '2026-10-27 05:00:00', 'VANNY');
    $matcher = app(MatchJneShipments::class);
    $sources = JneReportAwb::whereIn('awb', [$before->awb, $after->awb])->get();
    $candidates = $matcher->candidates($sources);
    foreach ($sources as $source) {
        $matcher->automatic(JneShipment::where('awb', $source->awb)->firstOrFail(), $source, $candidates);
    }
    expect($before->fresh()->pickup_task_id)->toBe($this->fixture['task']->id);
    expect($after->fresh()->pickup_task_id)->toBeNull();
    expect(PickupResultPeriod::date(CarbonImmutable::parse('2026-10-27 04:59:59', 'Asia/Jakarta'))->toDateString())->toBe('2026-10-26');
});

test('review approves a typo without rewriting raw source and prevents another pickup from claiming it', function () {
    $task = $this->fixture['task'];
    $shipment = reviewAwbSource($this->fixture, 'TYPO-AWB', '2026-10-26 12:00:00');
    $this->getJson(route('pickup-automation.candidates', $task))->assertOk()->assertJsonPath('rows.data.0.awb', 'TYPO-AWB');
    $this->postJson(route('pickup-automation.review', $task), reviewAwbPayload($task, 'ADD', ['shipment_id' => $shipment->id, 'shipment_version' => $shipment->version]))->assertOk();
    expect($shipment->fresh()->pickup_task_id)->toBe($task->id);
    expect($shipment->latestSource->shipper_name)->toBe('400 0 Vanny');
    $other = PickupTask::factory()->create(['customer_id' => $task->customer_id]);
    PickupRecord::factory()->create(['pickup_task_id' => $other->id]);
    $this->postJson(route('pickup-automation.review', $other), reviewAwbPayload($other, 'ADD', ['shipment_id' => $shipment->id, 'shipment_version' => $shipment->fresh()->version]))->assertConflict();
    $this->getJson(route('pickup-automation.candidates', $other))->assertOk()->assertJsonCount(0, 'rows.data');
    $this->assertDatabaseHas('pickup_awb_review_events', ['pickup_task_id' => $task->id, 'action' => 'ADD', 'actor_id' => $this->fixture['admin']->id]);
});

test('completed pickup locks and explicit removal survives validation and another import', function () {
    $task = $this->fixture['task'];
    importPickupAutomationReport($this->fixture, 2, 0);
    $result = app(ReconcilePickupProcessing::class)->handle($task->id);
    expect($result->locked_at)->not->toBeNull();
    $row = JneShipment::where('pickup_task_id', $task->id)->firstOrFail();
    $remove = ['shipment_id' => $row->id, 'shipment_version' => $row->version];
    $this->postJson(route('pickup-automation.review', $task), reviewAwbPayload($task, 'REMOVE', $remove))->assertConflict();
    $this->postJson(route('pickup-automation.review', $task), reviewAwbPayload($task, 'UNLOCK'))->assertOk();
    $this->postJson(route('pickup-automation.review', $task), reviewAwbPayload($task, 'REMOVE', $remove))->assertOk();
    $this->postJson(route('pickup-automation.review', $task), reviewAwbPayload($task, 'VALIDATE'))->assertOk()->assertJsonPath('status', 'PARTIAL');
    importPickupAutomationReport($this->fixture, 2, 0);
    app(ReconcilePickupProcessing::class)->handle($task->id);
    expect($row->fresh()->pickup_task_id)->toBeNull();
    expect(PickupAwbManifest::sole()->status)->toBe('SUPERSEDED');
});

test('old source cannot fill todays pickup except a ready pending item tied to its origin', function () {
    $task = $this->fixture['task'];
    $this->postJson(route('pickup-automation.review', $task), reviewAwbPayload($task, 'PENDING', ['category' => 'manual_hybrid', 'label' => 'Order 123, alamat belum lengkap']))->assertOk();
    $pending = PickupPendingItem::sole();
    $this->postJson(route('pickup-automation.review', $task), reviewAwbPayload($task, 'READY', ['pending_id' => $pending->id, 'pending_version' => $pending->version]))->assertOk();
    $this->travelTo('2026-10-27 08:00:00 UTC');
    $row = reviewAwbSource($this->fixture, 'PENDING-RESOLVED', '2026-10-27 10:00:00');
    $add = ['shipment_id' => $row->id, 'shipment_version' => $row->version];
    $this->postJson(route('pickup-automation.review', $task), reviewAwbPayload($task, 'ADD', $add))->assertUnprocessable();
    $this->postJson(route('pickup-automation.review', $task), reviewAwbPayload($task, 'ADD', [...$add, 'pending_id' => $pending->id, 'pending_version' => $pending->fresh()->version]))->assertOk();
    expect($pending->fresh()->status)->toBe('PROCESSED');
    expect($pending->fresh()->processing_date->toDateString())->toBe('2026-10-27');
    expect($row->fresh()->pickup_task_id)->toBe($task->id);
    expect($task->proof->manual_hybrid)->toBe(2);
    $result = app(QueryPickupAutomation::class)->handle(['date_from' => '2026-10-27', 'date_to' => '2026-10-27']);
    expect($result['processing']['pending_incoming'])->toBe(1);
    expect($result['processing']['processed'])->toBe(1);
    $this->postJson(route('pickup-automation.review', $task), reviewAwbPayload($task, 'ADD', [...$add, 'shipment_version' => $row->fresh()->version, 'pending_id' => $pending->id, 'pending_version' => $pending->fresh()->version]))->assertConflict();
});

test('review rejects stale tabs unauthorized staff and unrecorded backlog', function () {
    $task = $this->fixture['task'];
    $this->postJson(route('pickup-automation.review', $task), reviewAwbPayload($task, 'PENDING', ['expected_version' => 999, 'category' => 'manual_hybrid', 'label' => 'Pending satu']))->assertConflict();
    $this->getJson(route('pickup-automation.index', ['scope' => 'backlog']))->assertUnprocessable();
    $this->actingAs(User::factory()->create(['role' => 'pickup_staff', 'is_active' => true]));
    $this->getJson(route('pickup-automation.candidates', $task))->assertForbidden();
    $this->getJson(route('pickup-automation.pending'))->assertForbidden();
    $this->postJson(route('pickup-automation.review', $task), reviewAwbPayload($task, 'VALIDATE'))->assertForbidden();
});

test('fifty new pickups plus one documented carryover yield fifty one processed without changing either POP', function () {
    $origin = $this->fixture['task'];
    $origin->proof->update(['manual_hybrid' => 50]);
    $origin->handoverItem->update(['manual_hybrid' => 50]);
    importPickupAutomationReport($this->fixture, 49, 0);
    app(ReconcilePickupProcessing::class)->handle($origin->id);
    $this->postJson(route('pickup-automation.review', $origin), reviewAwbPayload($origin, 'PENDING', ['category' => 'manual_hybrid', 'label' => 'Order tertunda dari kemarin']))->assertOk();
    $pending = PickupPendingItem::sole();
    $this->postJson(route('pickup-automation.review', $origin), reviewAwbPayload($origin, 'READY', ['pending_id' => $pending->id, 'pending_version' => $pending->version]))->assertOk();
    $this->travelTo('2026-10-27 08:00:00 UTC');
    $today = PickupTask::factory()->create(['customer_id' => $origin->customer_id, 'customer_name_snapshot' => 'Vanny', 'status' => 'PICKED_UP', 'created_by' => $this->fixture['admin']->id]);
    PickupRecord::factory()->create(['pickup_task_id' => $today->id, 'manual_hybrid' => 50, 'cashless_hybrid' => 0, 'css_orion' => 0]);
    $session = app(CreateSession::class)->handle($this->fixture['admin'], [$today->id], (string) Str::uuid());
    app(VerifyItem::class)->handle($this->fixture['admin'], $session->id, $session->items()->sole()->id, ['expected_version' => 1, 'manual_hybrid' => 50, 'cashless_hybrid' => 0, 'css_orion' => 0]);
    $job = ReportJob::factory()->create(['customer_account' => 'SIM_AUTO_ACCOUNT', 'date_from' => '2026-10-27', 'date_thru' => '2026-10-27', 'status' => 'COMPLETED', 'import_status' => 'IMPORTED', 'projection_status' => 'PROJECTED', 'file_checksum' => hash('sha256', 'carryover-simulation')]);
    for ($index = 1; $index <= 51; $index++) {
        JneReportAwb::factory()->create(['report_job_id' => $job->id, 'source_row' => $index, 'awb' => 'TODAY-'.$index, 'customer_account' => 'SIM_AUTO_ACCOUNT', 'shipper_name' => 'VANNY',
            'status_web' => 'ON PROCESS', 'status_pod' => '', 'entry_at' => CarbonImmutable::parse('2026-10-27 10:00', 'Asia/Jakarta')->utc(), 'raw_data' => ['CUSTOMER_CODE' => '4000', 'PROCESS_TYPE' => 'MANUAL']]);
    }
    app(ProjectJneShipments::class)->handle($job->id);
    expect(JneShipment::where('pickup_task_id', $today->id)->count())->toBe(0);
    $carryover = JneShipment::where('awb', 'TODAY-51')->firstOrFail();
    $this->postJson(route('pickup-automation.review', $origin), reviewAwbPayload($origin, 'ADD', ['shipment_id' => $carryover->id, 'shipment_version' => $carryover->version, 'pending_id' => $pending->id, 'pending_version' => $pending->fresh()->version]))->assertOk();
    $this->postJson(route('pickup-automation.review', $origin), reviewAwbPayload($origin, 'VALIDATE'))->assertOk()->assertJsonPath('status', 'DONE');
    expect(app(ReconcilePickupProcessing::class)->handle($today->id)->status)->toBe('DONE');
    $result = app(QueryPickupAutomation::class)->handle(['date_from' => '2026-10-27', 'date_to' => '2026-10-27']);
    expect($result['processing'])->toBe(['regular_target' => 50, 'regular_processed' => 50, 'pending_incoming' => 1, 'target' => 51, 'processed' => 51]);
    expect($origin->proof->fresh()->manual_hybrid)->toBe(50);
    expect($today->proof->fresh()->manual_hybrid)->toBe(50);
    expect($carryover->fresh()->pickup_task_id)->toBe($origin->id);
});

test('pending capacity cannot exceed missing verified AWBs and a conflicting Sertim cannot be overridden', function () {
    $task = $this->fixture['task'];
    $payload = ['category' => 'manual_hybrid', 'label' => 'Order pending'];
    $this->postJson(route('pickup-automation.review', $task), reviewAwbPayload($task, 'PENDING', $payload))->assertOk();
    $this->postJson(route('pickup-automation.review', $task), reviewAwbPayload($task, 'PENDING', $payload))->assertUnprocessable();
    $row = reviewAwbSource($this->fixture, 'SERTIM-CONFLICT', '2026-10-26 12:00');
    $other = PickupTask::factory()->create();
    PickupCashlessAwb::factory()->create(['pickup_task_id' => $other->id, 'customer_id' => $other->customer_id, 'awb' => $row->awb]);
    $this->postJson(route('pickup-automation.review', $task), reviewAwbPayload($task, 'ADD', ['shipment_id' => $row->id, 'shipment_version' => $row->version]))->assertConflict();
    expect($row->fresh()->pickup_task_id)->toBeNull();
});

test('source without entry time does not acquire a pickup even with an exact reference', function () {
    $row = reviewAwbSource($this->fixture, 'MISSING-ENTRY-TIME', '2026-10-26 12:00', 'VANNY');
    $source = $row->latestSource;
    $source->update(['entry_at' => null, 'reference' => $this->fixture['task']->reference]);
    $matcher = app(MatchJneShipments::class);
    $matcher->automatic($row, $source, $matcher->candidates(collect([$source])));
    expect($row->fresh()->pickup_task_id)->toBeNull();
    $this->postJson(route('pickup-automation.review', $this->fixture['task']), reviewAwbPayload($this->fixture['task'], 'ADD', ['shipment_id' => $row->id, 'shipment_version' => $row->fresh()->version]))->assertUnprocessable();
});

test('active Sertim uses its pickup execution day before POP finalization while rejecting another day', function () {
    $task = PickupTask::factory()->create(['customer_id' => $this->fixture['task']->customer_id, 'status' => 'ASSIGNED', 'execution_started_at' => now()]);
    $sameDay = reviewAwbSource($this->fixture, 'ACTIVE-SERTIM-TODAY', '2026-10-26 12:00');
    $nextDay = reviewAwbSource($this->fixture, 'ACTIVE-SERTIM-TOMORROW', '2026-10-27 12:00');
    foreach ([$sameDay, $nextDay] as $shipment) {
        PickupCashlessAwb::factory()->create(['pickup_task_id' => $task->id, 'customer_id' => $task->customer_id, 'awb' => $shipment->awb]);
    }
    $matcher = app(MatchJneShipments::class);
    $sources = JneReportAwb::whereIn('awb', [$sameDay->awb, $nextDay->awb])->get();
    $candidates = $matcher->candidates($sources);
    foreach ($sources as $source) {
        $matcher->automatic(JneShipment::where('awb', $source->awb)->firstOrFail(), $source, $candidates);
    }
    expect($sameDay->fresh()->pickup_task_id)->toBe($task->id);
    expect($nextDay->fresh()->pickup_task_id)->toBeNull();
    expect($task->proof)->toBeNull();
});

test('uncertain sending blocks unlocking and preserves the ready document and reconciliation', function () {
    $task = $this->fixture['task'];
    importPickupAutomationReport($this->fixture, 2, 0);
    app(ReconcilePickupProcessing::class)->handle($task->id);
    $manifest = PickupAwbManifest::sole();
    $manifest->update(['status' => 'READY']);
    PickupAwbDelivery::factory()->create(['pickup_awb_manifest_id' => $manifest->id, 'status' => 'UNKNOWN']);
    $this->postJson(route('pickup-automation.review', $task), reviewAwbPayload($task, 'UNLOCK'))->assertConflict();
    expect($manifest->fresh()->status)->toBe('READY');
    expect(PickupProcessingReconciliation::sole()->locked_at)->not->toBeNull();
    $this->assertDatabaseCount('pickup_awb_review_events', 0);
});

test('a legacy completion retains its lock when late evidence requires review and source searches are scoped', function () {
    $task = $this->fixture['task'];
    importPickupAutomationReport($this->fixture, 2, 0);
    app(ReconcilePickupProcessing::class)->handle($task->id);
    PickupProcessingReconciliation::sole()->update(['locked_at' => null]);
    reviewAwbSource($this->fixture, 'LATE-EXTRA', '2026-10-26 12:00', 'VANNY');
    $result = app(ReconcilePickupProcessing::class)->handle($task->id);
    expect($result->status)->toBe('REVIEW');
    expect($result->locked_at)->not->toBeNull();
    $this->getJson(route('pickup-automation.show', ['task' => $task, 'shipment_q' => '000MANUAL1']))->assertOk()->assertJsonPath('assigned_shipments.total', 1)->assertJsonPath('shipment_query', '000MANUAL1');
    $this->getJson(route('pickup-automation.show', ['task' => $task, 'shipment_q' => 'other-customer']))->assertOk()->assertJsonPath('assigned_shipments.total', 0);
});
