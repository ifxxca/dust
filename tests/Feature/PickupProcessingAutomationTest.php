<?php

use App\Actions\Pickup\ReconcilePickupProcessing;
use App\Jobs\RenderPickupAwbManifestJob;
use App\Models\JneShipment;
use App\Models\PickupAwbManifest;
use App\Models\PickupCustomerReconciliation;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\ReportJob;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;

require_once __DIR__.'/../Fixtures/pickup-automation.php';

beforeEach(function () {
    $this->travelTo('2026-10-26 08:00:00 UTC');
    config(['jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => true, 'pickup.automation.enabled' => false]);
});

test('verified customer code and date fill one pickup and complete Vanny with 66 manual and 100 Orion AWBs', function () {
    Queue::fake([RenderPickupAwbManifestJob::class]);
    Storage::fake('jne_reports');
    $fixture = pickupAutomationFixture(66, 100);
    importPickupAutomationReport($fixture, 66, 100);

    $result = app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);

    expect($result->status)->toBe('DONE');
    expect($result->categories['manual_hybrid']['confirmed'])->toBe(66);
    expect($result->categories['css_orion']['confirmed'])->toBe(100);
    expect(JneShipment::where('match_method', 'CUSTOMER_CODE_DATE')->where('pickup_task_id', $fixture['task']->id)->count())->toBe(166);
    $this->assertDatabaseCount('pickup_awb_manifests', 1);
    $this->assertDatabaseCount('pickup_awb_manifest_items', 166);
    $this->assertDatabaseCount('pickup_processing_records', 0);
    Queue::assertPushed(RenderPickupAwbManifestJob::class);
});

test('partial counts progress after another report without counting observations or QTY twice', function () {
    Queue::fake([RenderPickupAwbManifestJob::class]);
    Storage::fake('jne_reports');
    $fixture = pickupAutomationFixture();
    importPickupAutomationReport($fixture, 1, 1);
    $first = app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    expect($first->status)->toBe('PARTIAL');
    expect($first->categories['manual_hybrid']['shortfall'])->toBe(1);
    $this->assertDatabaseCount('pickup_awb_manifests', 0);
    importPickupAutomationReport($fixture);

    $result = app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);

    expect($result->status)->toBe('DONE');
    expect($result->categories['manual_hybrid']['confirmed'])->toBe(2);
    $this->assertDatabaseCount('jne_shipments', 3);
    $this->assertDatabaseCount('pickup_awb_manifests', 1);
    $this->assertDatabaseCount('pickup_processing_reconciliation_events', 2);
});

test('equal totals across incorrect categories remain under review', function () {
    Queue::fake([RenderPickupAwbManifestJob::class]);
    Storage::fake('jne_reports');
    $fixture = pickupAutomationFixture();
    importPickupAutomationReport($fixture, 3, 0);

    $result = app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);

    expect($result->status)->toBe('REVIEW');
    expect($result->categories['manual_hybrid']['excess'])->toBe(1);
    expect($result->categories['css_orion']['shortfall'])->toBe(1);
    Queue::assertNotPushed(RenderPickupAwbManifestJob::class);
});

test('same day bucket fills verified capacity and waits for the remaining pickup verification before building the daily manifest', function () {
    Queue::fake([RenderPickupAwbManifestJob::class]);
    Storage::fake('jne_reports');
    $fixture = pickupAutomationFixture();
    $other = PickupTask::factory()->create(['customer_id' => $fixture['customer']->id, 'status' => 'PICKED_UP']);
    PickupRecord::factory()->create(['pickup_task_id' => $other->id]);
    importPickupAutomationReport($fixture);

    $result = app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);

    expect($result->status)->toBe('DONE');
    expect(JneShipment::where('pickup_task_id', $fixture['task']->id)->count())->toBe(3);
    expect(JneShipment::where('pickup_task_id', $other->id)->count())->toBe(0);
    expect(PickupCustomerReconciliation::sole()->status)->toBe('AWAITING_VERIFICATION');
    Queue::assertNotPushed(RenderPickupAwbManifestJob::class);
});

test('matching counts complete without collection configuration and changed baseline invalidates manifests', function () {
    Queue::fake([RenderPickupAwbManifestJob::class]);
    Storage::fake('jne_reports');
    $fixture = pickupAutomationFixture();
    $definition = $fixture['contract']->definition;
    unset($definition['collection_mode']);
    $fixture['contract']->update(['definition' => $definition]);
    importPickupAutomationReport($fixture);
    expect(app(ReconcilePickupProcessing::class)->handle($fixture['task']->id)->status)->toBe('DONE');
    $fixture['contract']->update(['definition' => [...$definition, 'collection_mode' => 'complete_date_report']]);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    $fixture['task']->proof->revisions()->create(['revision' => 1, 'values' => ['manual_hybrid' => 3], 'actor_id' => $fixture['admin']->id, 'reason' => 'Koreksi jumlah POP']);

    $result = app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);

    expect($result->status)->toBe('REVIEW');
    expect(PickupAwbManifest::sole()->status)->toBe('SUPERSEDED');
});

test('source dates from yesterday do not fill todays pickup merely because import happens today', function () {
    Queue::fake([RenderPickupAwbManifestJob::class]);
    Storage::fake('jne_reports');
    $fixture = pickupAutomationFixture();
    importPickupAutomationReport($fixture, 2, 1, '2026-10-25');

    $result = app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);

    expect($result->status)->toBe('WAITING_DATA');
    expect(JneShipment::whereNotNull('pickup_task_id')->count())->toBe(0);
    expect(DB::table('pickup_awb_manifest_items')->count())->toBe(0);
});

test('a newer empty report leaves matched pickup complete while collection coverage remains unproven', function () {
    Queue::fake([RenderPickupAwbManifestJob::class]);
    Storage::fake('jne_reports');
    $fixture = pickupAutomationFixture();
    importPickupAutomationReport($fixture);
    importPickupAutomationReport($fixture, 0, 0);
    $result = app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    expect($result->status)->toBe('DONE');
    expect($result->categories['manual_hybrid']['confirmed'])->toBe(2);
    expect($result->evidence['coverage']['complete'])->toBeFalse();
    expect($result->reasons)->toBe([]);
    $this->assertDatabaseCount('pickup_awb_manifests', 1);
    Queue::assertPushed(RenderPickupAwbManifestJob::class);
});

test('a failed report supporting the pickup blocks completion and document creation', function (array $failure) {
    Queue::fake([RenderPickupAwbManifestJob::class]);
    Storage::fake('jne_reports');
    $fixture = pickupAutomationFixture();
    $job = importPickupAutomationReport($fixture);
    $job->update($failure);

    $result = app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);

    expect($result->status)->toBe('REVIEW');
    expect($result->reasons)->toContain('3 resi memiliki report sumber yang belum selesai diimpor dan diproyeksikan.');
    expect($result->locked_at)->toBeNull();
    $this->assertDatabaseCount('pickup_awb_manifests', 0);
    Queue::assertNotPushed(RenderPickupAwbManifestJob::class);
})->with([
    'source failed' => [['status' => 'NEEDS_ATTENTION']],
    'import failed' => [['import_status' => 'FAILED']],
    'projection failed' => [['projection_status' => 'FAILED']],
]);

test('an unrelated failed report does not block an otherwise valid pickup', function () {
    Queue::fake([RenderPickupAwbManifestJob::class]);
    Storage::fake('jne_reports');
    $fixture = pickupAutomationFixture();
    importPickupAutomationReport($fixture);
    ReportJob::factory()->create(['status' => 'NEEDS_ATTENTION', 'customer_account' => 'OTHER_ACCOUNT']);

    $result = app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);

    expect($result->status)->toBe('DONE');
    expect($result->locked_at)->not->toBeNull();
    $this->assertDatabaseCount('pickup_awb_manifests', 1);
    Queue::assertPushed(RenderPickupAwbManifestJob::class);
});
