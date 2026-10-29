<?php

use App\Actions\Handover\CreateSession;
use App\Actions\Handover\VerifyItem;
use App\Actions\Pickup\AllocatePickupAwbBuckets;
use App\Actions\Pickup\ReconcilePickupProcessing;
use App\Actions\Reports\MatchJneShipments;
use App\Actions\Reports\ProjectJneShipments;
use App\Jobs\RenderPickupAwbManifestJob;
use App\Models\Customer;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneShipmentMatchEvent;
use App\Models\PickupCashlessAwb;
use App\Models\PickupCustomerReconciliation;
use App\Models\PickupPendingItem;
use App\Models\PickupProcessingReconciliation;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

require_once __DIR__.'/../Fixtures/pickup-automation.php';

beforeEach(function () {
    $this->travelTo('2026-10-06 16:00:00 UTC');
    config(['pickup.automation.enabled' => false, 'jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => true]);
});

/** @param array{admin: User, customer: Customer, task: PickupTask} $fixture */
function secondBucketPickup(array $fixture, int $manual, int $orion = 0): PickupTask
{
    $fixture['task']->proof->update(['picked_up_at' => '2026-10-06 09:00:00']);
    $task = PickupTask::factory()->create(['customer_id' => $fixture['customer']->id, 'status' => 'PICKED_UP']);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'manual_hybrid' => $manual, 'cashless_hybrid' => 0, 'css_orion' => $orion, 'picked_up_at' => '2026-10-06 15:00:00']);
    $session = app(CreateSession::class)->handle($fixture['admin'], [$task->id], (string) Str::uuid());
    app(VerifyItem::class)->handle($fixture['admin'], $session->id, $session->items()->sole()->id, ['expected_version' => 1, 'manual_hybrid' => $manual, 'cashless_hybrid' => 0, 'css_orion' => $orion]);

    return $task;
}

test('bucket fills both manual targets before marking the missing Orion category and accepts a later report without moving locked AWBs', function () {
    Storage::fake('jne_reports');
    Queue::fake([RenderPickupAwbManifestJob::class]);
    $fixture = pickupAutomationFixture(4, 7);
    $second = secondBucketPickup($fixture, 4);
    importPickupAutomationReport($fixture, 8, 0);
    $reconcile = app(ReconcilePickupProcessing::class);

    $secondResult = $reconcile->handle($second->id);
    $firstResult = $reconcile->handle($fixture['task']->id);

    expect($secondResult->status)->toBe('DONE');
    expect($firstResult->status)->toBe('PARTIAL');
    expect($firstResult->categories['manual_hybrid']['confirmed'])->toBe(4);
    expect($firstResult->categories['css_orion']['shortfall'])->toBe(7);
    $firstAwbs = JneShipment::where('pickup_task_id', $fixture['task']->id)->orderBy('awb')->pluck('awb')->all();
    $secondAwbs = JneShipment::where('pickup_task_id', $second->id)->orderBy('awb')->pluck('awb')->all();
    expect($firstAwbs)->toBe(['000MANUAL1', '000MANUAL2', '000MANUAL3', '000MANUAL4']);
    expect($secondAwbs)->toBe(['000MANUAL5', '000MANUAL6', '000MANUAL7', '000MANUAL8']);
    expect(JneShipmentMatchEvent::where('method', 'BUCKET_FIFO')->count())->toBe(8);

    importPickupAutomationReport($fixture, 8, 7);
    $completed = $reconcile->handle($fixture['task']->id);
    $reconcile->handle($second->id);
    $eventCount = JneShipmentMatchEvent::count();
    $reconcile->handle($fixture['task']->id);
    $reconcile->handle($second->id);

    expect($completed->status)->toBe('DONE');
    expect($completed->locked_at)->not->toBeNull();
    expect(JneShipment::where('pickup_task_id', $second->id)->orderBy('awb')->pluck('awb')->all())->toBe($secondAwbs);
    expect(JneShipmentMatchEvent::count())->toBe($eventCount);
    $this->assertDatabaseCount('pickup_awb_manifests', 1);
    $this->assertDatabaseCount('pickup_awb_manifest_items', 15);
    Queue::assertPushed(RenderPickupAwbManifestJob::class);
});

test('fourteen available AWBs fill only the first of two fourteen AWB pickups', function () {
    Storage::fake('jne_reports');
    Queue::fake([RenderPickupAwbManifestJob::class]);
    $fixture = pickupAutomationFixture(14, 0);
    $second = secondBucketPickup($fixture, 14);
    importPickupAutomationReport($fixture, 14, 0);

    $later = app(ReconcilePickupProcessing::class)->handle($second->id);
    $earlier = app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);

    expect($earlier->status)->toBe('DONE');
    expect($later->status)->toBe('WAITING_DATA');
    expect($later->categories['manual_hybrid']['shortfall'])->toBe(14);
    expect(JneShipment::where('pickup_task_id', $fixture['task']->id)->count())->toBe(14);
    expect(JneShipment::where('pickup_task_id', $second->id)->count())->toBe(0);
    expect(PickupCustomerReconciliation::sole()->status)->toBe('PARTIAL');
    Queue::assertNotPushed(RenderPickupAwbManifestJob::class);
});

test('manual ownership and per pickup exclusions are reserved before feeding remaining capacity', function () {
    Storage::fake('jne_reports');
    $fixture = pickupAutomationFixture(2, 0);
    $second = secondBucketPickup($fixture, 2);
    importPickupAutomationReport($fixture, 4, 0);
    $manual = JneShipment::where('awb', '000MANUAL1')->sole();
    app(MatchJneShipments::class)->manual($fixture['admin'], $manual->id, $second->reference, $manual->version, 'Recorded pickup ownership');
    $excluded = JneShipment::where('awb', '000MANUAL2')->sole();
    DB::table('pickup_awb_exclusions')->insert(['pickup_task_id' => $fixture['task']->id, 'jne_shipment_id' => $excluded->id, 'actor_id' => $fixture['admin']->id, 'reason' => 'Excluded from first pickup', 'created_at' => now(), 'updated_at' => now()]);

    app(AllocatePickupAwbBuckets::class)->handle($fixture['task']);

    expect($manual->fresh()->pickup_task_id)->toBe($second->id);
    expect($manual->fresh()->match_method)->toBe('MANUAL');
    expect($excluded->fresh()->pickup_task_id)->toBe($second->id);
    expect(JneShipment::where('pickup_task_id', $fixture['task']->id)->orderBy('awb')->pluck('awb')->all())->toBe(['000MANUAL3', '000MANUAL4']);
    expect(JneShipmentMatchEvent::where('method', 'BUCKET_FIFO')->count())->toBe(3);
});

test('locked and open correction pickups cannot receive new automatic allocations', function (array $state) {
    Storage::fake('jne_reports');
    $fixture = pickupAutomationFixture(2, 0);
    $second = secondBucketPickup($fixture, 2);
    importPickupAutomationReport($fixture, 2, 0);
    PickupProcessingReconciliation::factory()->create(['pickup_task_id' => $fixture['task']->id, ...$state]);

    app(AllocatePickupAwbBuckets::class)->handle($second);

    expect(JneShipment::where('pickup_task_id', $fixture['task']->id)->count())->toBe(0);
    expect(JneShipment::where('pickup_task_id', $second->id)->count())->toBe(2);
})->with([
    'locked' => [['locked_at' => '2026-10-06 16:00:00', 'review_open' => false]],
    'completed' => [['status' => 'DONE', 'review_open' => false]],
    'correction in progress' => [['locked_at' => null, 'review_open' => true]],
]);

test('pending items reserve their category capacity and older pending items block feeding from another day', function () {
    Storage::fake('jne_reports');
    $fixture = pickupAutomationFixture(2, 0);
    $second = secondBucketPickup($fixture, 2);
    importPickupAutomationReport($fixture, 3, 0);
    PickupPendingItem::factory()->create(['pickup_task_id' => $fixture['task']->id, 'category' => 'manual_hybrid', 'status' => 'PENDING']);

    app(AllocatePickupAwbBuckets::class)->handle($fixture['task']);

    expect(JneShipment::where('pickup_task_id', $fixture['task']->id)->count())->toBe(1);
    expect(JneShipment::where('pickup_task_id', $second->id)->count())->toBe(2);

    $previous = PickupTask::factory()->create(['customer_id' => $fixture['customer']->id]);
    PickupRecord::factory()->create(['pickup_task_id' => $previous->id, 'picked_up_at' => '2026-10-05 10:00:00']);
    PickupPendingItem::factory()->create(['pickup_task_id' => $previous->id, 'status' => 'READY']);
    JneShipment::query()->update(['pickup_task_id' => null, 'match_method' => 'CUSTOMER_CODE_DATE', 'match_status' => 'AMBIGUOUS']);
    $eventCount = JneShipmentMatchEvent::count();

    app(AllocatePickupAwbBuckets::class)->handle($fixture['task']);

    expect(JneShipment::whereNotNull('pickup_task_id')->count())->toBe(0);
    expect(JneShipmentMatchEvent::count())->toBe($eventCount);
});

test('bucket excludes cancelled or unresolved AWBs and incomplete reports', function (string $protection) {
    Storage::fake('jne_reports');
    $fixture = pickupAutomationFixture(1, 0);
    secondBucketPickup($fixture, 1);
    $report = importPickupAutomationReport($fixture, 1, 0);
    $shipment = JneShipment::sole();
    match ($protection) {
        'cancelled' => $shipment->update(['tracking_status' => 'CANCELLED']),
        'category' => $shipment->update(['category_status' => 'CONFLICT']),
        'customer' => $shipment->update(['customer_match_status' => 'CONFLICT']),
        'reference' => $shipment->update(['match_method' => 'REFERENCE']),
        'failed source' => $report->update(['projection_status' => 'FAILED']),
        'next retail day' => JneReportAwb::whereKey($shipment->latest_report_awb_id)->update(['entry_at' => '2026-10-06 22:00:00']),
        'previous retail day' => JneReportAwb::whereKey($shipment->latest_report_awb_id)->update(['entry_at' => '2026-10-05 21:59:00']),
    };
    $eventCount = JneShipmentMatchEvent::count();

    app(AllocatePickupAwbBuckets::class)->handle($fixture['task']);

    expect($shipment->fresh()->pickup_task_id)->toBeNull();
    expect(JneShipmentMatchEvent::count())->toBe($eventCount);
})->with(['cancelled', 'category', 'customer', 'reference', 'failed source', 'next retail day', 'previous retail day']);

test('bucket revalidation command previews without writes and validates only the selected customer and business date with a backup', function () {
    Storage::fake('jne_reports');
    Storage::fake('local');
    Queue::fake([RenderPickupAwbManifestJob::class]);
    $fixture = pickupAutomationFixture(1, 0);
    $second = secondBucketPickup($fixture, 1);
    importPickupAutomationReport($fixture, 2, 0);
    $options = ['--customer' => $fixture['customer']->id, '--date-from' => '2026-10-06', '--date-to' => '2026-10-06'];

    $this->artisan('pickups:reconcile-buckets', [...$options, '--dry-run' => true])->expectsOutput('1 bucket / 2 pickup.')->assertSuccessful();
    expect(JneShipment::whereNotNull('pickup_task_id')->count())->toBe(0);
    $this->artisan('pickups:reconcile-buckets', [...$options, '--date-from' => '2026-10-07', '--date-to' => '2026-10-07'])->expectsOutput('0 bucket / 0 pickup.')->assertSuccessful();
    $this->artisan('pickups:reconcile-buckets', [...$options, '--customer' => $fixture['customer']->id + 999])->expectsOutput('0 bucket / 0 pickup.')->assertSuccessful();
    $this->artisan('pickups:reconcile-buckets', [...$options, '--backup' => true])->expectsOutput('1 customer / hari dikompilasi, 0 gagal.')->assertSuccessful();

    expect(PickupProcessingReconciliation::whereIn('pickup_task_id', [$fixture['task']->id, $second->id])->where('status', 'DONE')->count())->toBe(2);
    expect(Storage::disk('local')->allFiles('backups'))->toHaveCount(1);
    $backup = json_decode(Storage::disk('local')->get(Storage::disk('local')->allFiles('backups')[0]), true);
    expect(array_column($backup['shipments'], 'pickup_task_id'))->toBe([null, null]);
    Queue::assertPushed(RenderPickupAwbManifestJob::class);
});

test('feeding follows pickup and AWB timestamps instead of database insertion order', function () {
    Storage::fake('jne_reports');
    $fixture = pickupAutomationFixture(1, 0);
    $second = secondBucketPickup($fixture, 1);
    $fixture['task']->proof->update(['picked_up_at' => '2026-10-06 15:00:00']);
    $second->proof->update(['picked_up_at' => '2026-10-06 09:00:00']);
    importPickupAutomationReport($fixture, 2, 0);
    JneReportAwb::where('awb', '000MANUAL1')->update(['entry_at' => '2026-10-06 21:59:00']);
    JneReportAwb::where('awb', '000MANUAL2')->update(['entry_at' => '2026-10-06 03:00:00']);

    app(AllocatePickupAwbBuckets::class)->handle($fixture['task']);

    expect(JneShipment::where('pickup_task_id', $second->id)->sole()->awb)->toBe('000MANUAL2');
    expect(JneShipment::where('pickup_task_id', $fixture['task']->id)->sole()->awb)->toBe('000MANUAL1');
});

test('existing automatic ownership survives the addition of another pickup and new AWBs only fill remaining capacity', function () {
    Storage::fake('jne_reports');
    Queue::fake([RenderPickupAwbManifestJob::class]);
    $fixture = pickupAutomationFixture(2, 0);
    importPickupAutomationReport($fixture, 1, 0);
    $owned = JneShipment::sole();
    expect($owned->pickup_task_id)->toBe($fixture['task']->id);
    $second = secondBucketPickup($fixture, 2);
    importPickupAutomationReport($fixture, 4, 0);

    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    $later = app(ReconcilePickupProcessing::class)->handle($second->id);

    expect($owned->fresh()->pickup_task_id)->toBe($fixture['task']->id);
    expect($owned->fresh()->match_status)->toBe('MATCHED');
    expect(JneShipment::where('pickup_task_id', $fixture['task']->id)->count())->toBe(2);
    expect($later->status)->toBe('DONE');
    Queue::assertPushed(RenderPickupAwbManifestJob::class);
});

test('excess bucket AWBs remain unassigned and cannot falsely complete both pickups', function () {
    Storage::fake('jne_reports');
    $fixture = pickupAutomationFixture(1, 0);
    $second = secondBucketPickup($fixture, 1);
    importPickupAutomationReport($fixture, 3, 0);

    $first = app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    $later = app(ReconcilePickupProcessing::class)->handle($second->id);

    expect(JneShipment::where('pickup_task_id', $fixture['task']->id)->count())->toBe(1);
    expect(JneShipment::where('pickup_task_id', $second->id)->count())->toBe(1);
    expect(JneShipment::whereNull('pickup_task_id')->count())->toBe(1);
    expect($first->status)->toBe('REVIEW');
    expect($later->status)->toBe('REVIEW');
    $this->assertDatabaseCount('pickup_awb_manifests', 0);
});

test('cashless buckets preserve explicit Sertim ownership before distributing unclaimed AWBs', function () {
    config(['jne-reports.category_markers_enabled' => true]);
    $fixture = pickupAutomationFixture(0, 0);
    $second = secondBucketPickup($fixture, 0);
    foreach ([$fixture['task'], $second] as $task) {
        $task->proof->update(['cashless_hybrid' => 1]);
        $task->handoverItem->update(['cashless_hybrid' => 1]);
    }
    PickupCashlessAwb::factory()->create(['awb' => 'TGCLAIM1', 'original_awb' => 'TGCLAIM1', 'pickup_task_id' => $second->id, 'customer_id' => $fixture['customer']->id]);
    $job = ReportJob::factory()->create(['source' => 'hybrid', 'report_type' => 'combined', 'status' => 'COMPLETED', 'import_status' => 'IMPORTED']);
    foreach (['TGCLAIM1', 'TGUNCLAIMED2'] as $index => $awb) {
        JneReportAwb::factory()->create(['report_job_id' => $job->id, 'source_row' => $index + 1, 'awb' => $awb, 'shipper_name' => '4000 VANNY', 'entry_at' => '2026-10-06 10:00:00', 'reference' => null]);
    }
    app(ProjectJneShipments::class)->handle($job->id);

    app(AllocatePickupAwbBuckets::class)->handle($fixture['task']);

    $claim = JneShipment::where('awb', 'TGCLAIM1')->sole();
    expect($claim->pickup_task_id)->toBe($second->id);
    expect($claim->match_method)->toBe('SERTIM');
    $automatic = JneShipment::where('awb', 'TGUNCLAIMED2')->sole();
    expect($automatic->pickup_task_id)->toBe($fixture['task']->id);
    expect($automatic->category)->toBe('cashless_hybrid');
    expect($automatic->match_method)->toBe('BUCKET_FIFO');
});
