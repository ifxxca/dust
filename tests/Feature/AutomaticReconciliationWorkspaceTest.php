<?php

use App\Actions\Pickup\ManageReconciliationWorkspace;
use App\Actions\Pickup\ReconcilePickupProcessing;
use App\Jobs\QueueHistoricalPickupReconciliationsJob;
use App\Jobs\ReconcilePickupProcessingJob;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\PickupAwbManifest;
use App\Models\PickupCashlessAwb;
use App\Models\PickupCustomerReconciliation;
use App\Models\PickupProcessingReconciliation;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;

require_once __DIR__.'/../Fixtures/pickup-automation.php';

beforeEach(function () {
    $this->travelTo('2026-10-26 12:00:00 UTC');
    config(['pickup.automation.enabled' => false, 'pickup.automation.auto_lock' => true, 'pickup.automation.send_enabled' => false,
        'jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => true]);
    Queue::fake();
    Notification::fake();
    Storage::fake('jne_reports');
    Storage::fake('local');
});

test('verified imports match and lock with one immutable system snapshot without manual approval', function () {
    $fixture = pickupAutomationFixture(2, 1);
    $proof = $fixture['task']->proof->fresh()->getAttributes();
    importPickupAutomationReport($fixture, 2, 1);
    (new ReconcilePickupProcessingJob($fixture['task']->id))->handle(app(ReconcilePickupProcessing::class));

    $group = PickupCustomerReconciliation::sole();
    expect($group->approval_snapshot)->toMatchArray(['event' => 'AUTO_LOCK', 'mode' => 'AUTOMATIC', 'included_count' => 3])
        ->and($group->approval_snapshot['reviewer'])->toBe(['id' => null, 'name' => 'Sistem'])
        ->and($group->locked_at)->not->toBeNull()
        ->and(JneShipment::where('customer_match_status', 'MATCHED')->where('match_status', 'MATCHED')->count())->toBe(3)
        ->and($fixture['task']->proof->fresh()->getAttributes())->toBe($proof);
    $this->assertDatabaseCount('pickup_awb_review_events', 0);
    $this->assertDatabaseCount('pickup_awb_manifests', 1);
    $this->assertDatabaseCount('pickup_customer_reconciliation_events', 2);
    $this->actingAs($fixture['admin'])->getJson(route('reconciliation-workspace.show', $fixture['task']))
        ->assertOk()->assertJsonPath('status', 'LOCKED')->assertJsonPath('approval.mode', 'AUTOMATIC');
    $this->getJson(route('reconciliation-workspace.awbs', $fixture['task']))->assertOk()->assertJsonPath('total', 0);
    Notification::assertNothingSent();
});

test('matching imported AWBs automatically lock without source contracts or full collection certification', function () {
    $fixture = pickupAutomationFixture(2, 0);
    $job = importPickupAutomationReport($fixture, 2, 0);
    $job->update(['source' => 'hybrid', 'report_type' => 'combined']);
    JneReportAwb::where('report_job_id', $job->id)->each(fn (JneReportAwb $row) => $row->update([
        'shipper_name' => '4000 Vanny',
        'raw_data' => [...$row->raw_data, 'SHIPPER_NAME' => '4000 Vanny'],
        'source_evidence' => ['hybrid_origins' => [['report_job_id' => $job->id, 'source' => 'roberto', 'report_type' => 'manual', 'checksum' => $job->file_checksum]]],
    ]));
    $fixture['contract']->delete();
    config(['jne-reports.collection_capabilities' => [], 'jne-reports.category_markers_enabled' => true]);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    $group = PickupCustomerReconciliation::sole();
    expect($group->status)->toBe('DONE')->and($group->locked_at)->not->toBeNull()
        ->and($group->approval_snapshot['mode'])->toBe('AUTOMATIC')
        ->and($group->approval_snapshot['lock_basis'])->toBe('MATCHED_OPERATIONAL_AWBS')
        ->and($group->approval_snapshot['coverage']['required_for_lock'])->toBeFalse();
    $this->assertDatabaseCount('pickup_awb_manifests', 1);
    $this->actingAs($fixture['admin'])->getJson(route('reconciliation-workspace.show', $fixture['task']))
        ->assertOk()->assertJsonPath('status', 'LOCKED')->assertJsonPath('coverage.required_for_lock', false);
    $snapshot = $group->approval_snapshot;
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    expect($group->fresh()->approval_snapshot)->toBe($snapshot);
    Notification::assertNothingSent();
});

test('a shortage stays open and automatically locks when the remaining AWB arrives without full source certification', function () {
    $fixture = pickupAutomationFixture(2, 0);
    config(['jne-reports.collection_capabilities' => []]);
    importPickupAutomationReport($fixture, 1, 0);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    $group = PickupCustomerReconciliation::sole();
    expect($group->status)->toBe('PARTIAL')->and($group->approval_snapshot)->toBeNull();

    importPickupAutomationReport($fixture, 2, 0);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    expect($group->fresh()->approval_snapshot['mode'])->toBe('AUTOMATIC')
        ->and($group->fresh()->approval_snapshot['included_count'])->toBe(2);
});

test('failed sources are distinct from normal waiting and never lock', function () {
    $fixture = pickupAutomationFixture(2, 0);
    $job = importPickupAutomationReport($fixture, 2, 0);
    $job->update(['projection_status' => 'FAILED', 'projection_error' => 'Sumber gagal diproyeksikan']);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);

    expect(PickupCustomerReconciliation::sole()->approval_snapshot)->toBeNull();
    $this->actingAs($fixture['admin'])->getJson(route('reconciliation-workspace.show', $fixture['task']))
        ->assertOk()->assertJsonPath('status', 'PROCESSING_FAILED');
});

test('ambiguous attribution blocks automatic locking even when observed quantities are equal', function () {
    $fixture = pickupAutomationFixture(2, 0);
    importPickupAutomationReport($fixture, 2, 0);
    JneShipment::firstOrFail()->update(['match_method' => 'MANUAL', 'customer_match_status' => 'CONFLICT', 'match_status' => 'CONFLICT']);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);

    expect(PickupCustomerReconciliation::sole()->approval_snapshot)->toBeNull();
    $this->actingAs($fixture['admin'])->getJson(route('reconciliation-workspace.awbs', $fixture['task']))
        ->assertOk()->assertJsonPath('total', 1)->assertJsonPath('data.0.customer_match_status', 'CONFLICT');
});

test('a valid authorized correction resumes calculation and automatically locks without another approval', function () {
    $fixture = pickupAutomationFixture(2, 0);
    importPickupAutomationReport($fixture, 3, 0);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    $group = PickupCustomerReconciliation::sole();
    $row = JneShipment::orderByDesc('id')->firstOrFail();
    $result = PickupProcessingReconciliation::sole();
    $body = ['action' => 'REMOVE', 'expected_revision' => $group->revision, 'expected_version' => $result->input_version,
        'target_task_id' => $fixture['task']->id, 'reason' => 'Bukti sumber menunjukkan resi ini bukan milik pickup.', 'items' => [['id' => $row->id, 'version' => $row->version]]];
    $proof = $fixture['task']->proof->fresh()->getAttributes();
    $this->actingAs($fixture['admin']);
    $preview = $this->postJson(route('reconciliation-workspace.preview', $fixture['task']), $body)->assertOk()->assertJsonPath('allowed', true);
    $this->postJson(route('reconciliation-workspace.apply', $fixture['task']), [...$body, 'preview_hash' => $preview->json('preview_hash')])->assertOk();

    expect($group->fresh()->approval_snapshot['mode'])->toBe('AUTOMATIC')
        ->and($group->fresh()->approval_snapshot['included_count'])->toBe(2)
        ->and($result->fresh()->review_open)->toBeFalse()
        ->and($fixture['task']->proof->fresh()->getAttributes())->toBe($proof);
    $this->assertDatabaseCount('pickup_awb_review_events', 1);
    $this->postJson(route('reconciliation-workspace.apply', $fixture['task']), [...$body, 'preview_hash' => $preview->json('preview_hash')])->assertConflict();
    $this->assertDatabaseCount('pickup_awb_review_events', 1);
});

test('repeated imports and delivery updates preserve the original lock without repetitive post lock events', function () {
    $fixture = pickupAutomationFixture(2, 0);
    importPickupAutomationReport($fixture, 2, 0);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    $snapshot = PickupCustomerReconciliation::sole()->approval_snapshot;
    $manifest = PickupAwbManifest::sole()->getAttributes();
    $this->travel(1)->minutes();
    importPickupAutomationReport($fixture, 2, 0);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    JneShipment::query()->update(['tracking_status' => 'DELIVERED']);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);

    $group = PickupCustomerReconciliation::sole();
    expect($group->approval_snapshot)->toBe($snapshot)->and($group->post_lock_change)->toBeNull()
        ->and(PickupAwbManifest::sole()->getAttributes())->toBe($manifest);
    $events = DB::table('pickup_customer_reconciliation_events')->get()->map(fn ($row) => json_decode($row->snapshot, true));
    expect($events->where('event', 'AUTO_LOCK'))->toHaveCount(1)->and($events->where('event', 'POST_LOCK'))->toHaveCount(0);
});

test('late extra evidence records one material discrepancy without changing the locked snapshot', function () {
    $fixture = pickupAutomationFixture(2, 0);
    importPickupAutomationReport($fixture, 2, 0);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    $snapshot = PickupCustomerReconciliation::sole()->approval_snapshot;
    importPickupAutomationReport($fixture, 3, 0);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);

    $group = PickupCustomerReconciliation::sole();
    expect($group->approval_snapshot)->toBe($snapshot)->and($group->post_lock_change['added_count'])->toBe(1);
    expect(DB::table('pickup_customer_reconciliation_events')->get()->filter(fn ($row) => (json_decode($row->snapshot, true)['event'] ?? '') === 'POST_LOCK'))->toHaveCount(1);
});

test('resolved late conflicts automatically leave attention while preserving the same snapshot and separate document failures', function (string $documentStatus, string $blockedStatus, ?string $documentError) {
    $fixture = pickupAutomationFixture(2, 0);
    importPickupAutomationReport($fixture, 2, 0);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    $snapshot = PickupCustomerReconciliation::sole()->approval_snapshot;
    PickupAwbManifest::sole()->update(['status' => $documentStatus, 'last_error' => $documentError]);
    $shipment = JneShipment::firstOrFail();
    $shipment->update(['tracking_status' => 'CANCELLED']);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    expect(PickupCustomerReconciliation::sole()->post_lock_change)->not->toBeNull()
        ->and(PickupAwbManifest::sole()->status)->toBe($blockedStatus);

    $shipment->update(['tracking_status' => 'IN_TRANSIT']);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    expect(PickupCustomerReconciliation::sole()->approval_snapshot)->toBe($snapshot)
        ->and(PickupCustomerReconciliation::sole()->post_lock_change)->toBeNull()
        ->and(PickupAwbManifest::sole()->status)->toBe($documentStatus)
        ->and(PickupAwbManifest::sole()->last_error)->toBe($documentError);
    expect(DB::table('pickup_customer_reconciliation_events')->get()->filter(fn ($row) => (json_decode($row->snapshot, true)['event'] ?? '') === 'POST_LOCK_RESOLVED'))->toHaveCount(1);
})->with(['document pending' => ['PENDING', 'REVIEW', null], 'separate render failure' => ['FAILED', 'FAILED', 'Worker dokumen gagal']]);

test('new pending source attempts alone do not create a material post lock discrepancy', function () {
    $fixture = pickupAutomationFixture(2, 0);
    $job = importPickupAutomationReport($fixture, 2, 0);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    $snapshot = PickupCustomerReconciliation::sole()->approval_snapshot;
    $pending = $job->replicate();
    $pending->fill(['status' => 'QUEUED', 'import_status' => 'PENDING', 'projection_status' => 'PENDING'])->save();
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);

    expect(PickupCustomerReconciliation::sole()->approval_snapshot)->toBe($snapshot)
        ->and(PickupCustomerReconciliation::sole()->post_lock_change)->toBeNull();
    $this->actingAs($fixture['admin'])->getJson(route('reconciliation-workspace.show', $fixture['task']))->assertOk()->assertJsonPath('status', 'LOCKED');
});

test('automatic locking is idempotent and rejects stale versions from competing decisions', function () {
    $fixture = pickupAutomationFixture(2, 0);
    importPickupAutomationReport($fixture, 2, 0);
    config(['pickup.automation.auto_lock' => false]);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    $group = PickupCustomerReconciliation::sole();
    $oldRevision = $group->revision;
    $result = PickupProcessingReconciliation::sole();
    $result->increment('input_version');
    $action = app(ManageReconciliationWorkspace::class);
    expect($action->lock(null, $fixture['task'], ['action' => 'LOCK', 'expected_revision' => $oldRevision], automatic: true)['action'])->toBe('PENDING_EVIDENCE');
    expect($group->fresh()->approval_snapshot)->toBeNull();
    config(['pickup.automation.auto_lock' => true]);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    $snapshot = $group->fresh()->approval_snapshot;
    expect($action->lock(null, $fixture['task'], ['action' => 'LOCK', 'expected_revision' => $oldRevision], automatic: true)['action'])->toBe('ALREADY_LOCKED')
        ->and($group->fresh()->approval_snapshot)->toBe($snapshot);
});

test('a snapshot storage failure rolls back the lock and audit atomically', function () {
    $fixture = pickupAutomationFixture(2, 0);
    importPickupAutomationReport($fixture, 2, 0);
    config(['pickup.automation.auto_lock' => false]);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    $before = PickupCustomerReconciliation::sole()->getAttributes();
    PickupCustomerReconciliation::saving(function (PickupCustomerReconciliation $group) {
        if ($group->approval_snapshot !== null) {
            throw new RuntimeException('Simulated snapshot storage failure');
        }
    });
    config(['pickup.automation.auto_lock' => true]);

    expect(fn () => app(ReconcilePickupProcessing::class)->handle($fixture['task']->id))->toThrow(RuntimeException::class);
    expect(PickupCustomerReconciliation::sole()->getAttributes())->toBe($before);
    $this->assertDatabaseCount('pickup_customer_reconciliation_events', 1);
});

test('recommendations rank scan and exact pickup references before verified customer day candidates', function () {
    $fixture = pickupAutomationFixture(2, 0);
    $job = importPickupAutomationReport($fixture, 2, 0);
    foreach (['CUSTOMER', 'REFERENCE', 'SCAN', 'UNRELATED'] as $kind) {
        $source = JneReportAwb::factory()->create(['report_job_id' => $job->id, 'source_row' => 100 + strlen($kind), 'awb' => 'SUGGEST-'.$kind,
            'entry_at' => JneShipment::firstOrFail()->latestSource->entry_at, 'reference' => $kind === 'REFERENCE' ? $fixture['task']->reference : null]);
        JneShipment::factory()->create(['awb' => $source->awb, 'customer_id' => $kind === 'CUSTOMER' ? $fixture['customer']->id : null,
            'customer_match_status' => $kind === 'CUSTOMER' ? 'MATCHED' : 'UNMATCHED', 'latest_report_awb_id' => $source->id, 'latest_report_job_id' => $job->id]);
        if ($kind === 'SCAN') {
            PickupCashlessAwb::factory()->create(['awb' => $source->awb, 'original_awb' => $source->awb, 'pickup_task_id' => $fixture['task']->id, 'customer_id' => $fixture['customer']->id, 'created_by' => $fixture['admin']->id]);
        }
    }

    $this->actingAs($fixture['admin'])->getJson(route('reconciliation-workspace.awbs', ['task' => $fixture['task'], 'mode' => 'suggested']))
        ->assertOk()->assertJsonPath('total', 3)->assertJsonPath('data.0.awb', 'SUGGEST-SCAN')->assertJsonPath('data.1.awb', 'SUGGEST-REFERENCE')
        ->assertJsonPath('data.2.awb', 'SUGGEST-CUSTOMER');
});

test('a complete empty report queues bounded automatic reevaluation including customers absent from the report', function () {
    $fixture = pickupAutomationFixture(2, 0);
    importPickupAutomationReport($fixture, 2, 0);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    config(['pickup.automation.enabled' => true]);
    importPickupAutomationReport($fixture, 0, 0);

    Queue::assertPushed(QueueHistoricalPickupReconciliationsJob::class, fn ($job) => $job->customerIds === null && $job->dateFrom === '2026-10-25' && $job->dateTo === '2026-10-26');
});
