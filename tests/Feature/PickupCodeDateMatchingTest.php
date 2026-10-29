<?php

use App\Actions\Pickup\ReconcilePickupProcessing;
use App\Actions\Reports\ProjectJneShipments;
use App\Jobs\RenderPickupAwbManifestJob;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneShipperAlias;
use App\Models\PickupPendingItem;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\ReportJob;
use Illuminate\Support\Facades\Queue;

require_once __DIR__.'/../Fixtures/pickup-automation.php';

beforeEach(function () {
    $this->travelTo('2026-10-01 16:51:48 UTC');
    config(['jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => false,
        'jne-reports.category_markers_enabled' => true, 'pickup.automation.enabled' => false]);
});

function storedPrefixPickupReport(string $shipper, int $count = 1, string $entryAt = '2026-10-01 16:16:00', string $status = 'COMPLETED'): ReportJob
{
    $job = ReportJob::factory()->create(['source' => 'hybrid', 'report_type' => 'combined', 'report_mode' => 'A',
        'status' => $status, 'import_status' => 'IMPORTED', 'date_from' => '2026-10-01', 'date_thru' => '2026-10-01']);
    for ($index = 0; $index < $count; $index++) {
        JneReportAwb::factory()->create(['report_job_id' => $job->id, 'source_row' => $index + 1,
            'awb' => '0101'.str_pad((string) ($job->id * 100 + $index), 12, '0', STR_PAD_LEFT),
            'shipper_name' => $shipper, 'entry_at' => $entryAt, 'reference' => null, 'raw_data' => ['QTY' => 3]]);
    }
    app(ProjectJneShipments::class)->handle($job->id);

    return $job->fresh();
}

test('seventeen registered prefix AWBs complete and lock a verified pickup without a source contract', function () {
    Queue::fake([RenderPickupAwbManifestJob::class]);
    $fixture = pickupAutomationFixture(17, 0);
    $fixture['contract']->delete();
    storedPrefixPickupReport('4000 VANNY', 17);
    JneShipment::query()->update(['category' => null, 'category_status' => 'UNCONFIGURED']);

    $result = app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);

    expect($result->status)->toBe('DONE');
    expect($result->locked_at)->not->toBeNull();
    expect($result->reasons)->toBe([]);
    expect($result->categories['manual_hybrid'])->toBe(['pop' => 17, 'received' => 17, 'expected' => 17, 'confirmed' => 17, 'shortfall' => 0, 'excess' => 0]);
    expect(JneShipment::where('pickup_task_id', $fixture['task']->id)->where('match_status', 'MATCHED')->count())->toBe(17);
    expect($result->evidence['coverage']['complete'])->toBeFalse();
    expect($fixture['task']->proof->manual_hybrid)->toBe(17);
    $this->assertDatabaseCount('pickup_awb_manifests', 1);
    $this->assertDatabaseCount('pickup_awb_manifest_items', 17);
    $this->assertDatabaseCount('pickup_processing_reconciliation_events', 1);
    Queue::assertPushed(RenderPickupAwbManifestJob::class);
    $this->actingAs($fixture['admin'])->getJson(route('pickup-automation.show', $fixture['task']))
        ->assertOk()->assertJsonPath('reconciliation.status', 'DONE')
        ->assertJsonPath('reconciliation.reasons', [])
        ->assertJsonPath('reconciliation.evidence.coverage.complete', false);
});

test('verified suffix code aliases also fill a same day pickup', function () {
    $fixture = pickupAutomationFixture(1, 0);
    $fixture['contract']->delete();
    JneShipperAlias::factory()->create(['customer_id' => $fixture['customer']->id, 'shipper_name' => '4000A REGISTERED SENDER']);
    storedPrefixPickupReport('4000A CHANGED SENDER');

    expect(JneShipment::sole()->pickup_task_id)->toBe($fixture['task']->id);
    expect(JneShipment::sole()->match_status)->toBe('MATCHED');
});

test('prefix date allocation respects the five AM retail boundary', function (string $entryAt, bool $linked) {
    $fixture = pickupAutomationFixture(1, 0);
    $fixture['contract']->delete();
    storedPrefixPickupReport('4000 VANNY', entryAt: $entryAt);

    expect(JneShipment::sole()->pickup_task_id)->toBe($linked ? $fixture['task']->id : null);
})->with([
    '04:59 belongs to previous retail day' => ['2026-10-01 21:59:00', true],
    '05:00 starts next retail day' => ['2026-10-01 22:00:00', false],
    'previous day is never borrowed' => ['2026-09-30 16:16:00', false],
]);

test('multiple same day pickups wait for bucket reconciliation after projection', function () {
    $fixture = pickupAutomationFixture(1, 0);
    $fixture['contract']->delete();
    $other = PickupTask::factory()->create(['customer_id' => $fixture['customer']->id, 'status' => 'PICKED_UP']);
    PickupRecord::factory()->create(['pickup_task_id' => $other->id]);
    storedPrefixPickupReport('4000 VANNY');

    expect(JneShipment::sole()->pickup_task_id)->toBeNull();
    expect(JneShipment::sole()->match_status)->toBe('AMBIGUOUS');
});

test('failed source reports never establish a prefix date allocation', function () {
    $fixture = pickupAutomationFixture(1, 0);
    $fixture['contract']->delete();
    storedPrefixPickupReport('4000 VANNY', status: 'NEEDS_ATTENTION');

    expect(JneShipment::sole()->customer_id)->toBe($fixture['customer']->id);
    expect(JneShipment::sole()->pickup_task_id)->toBeNull();
});

test('pending items block an automatic prefix date allocation', function () {
    $fixture = pickupAutomationFixture(1, 0);
    $fixture['contract']->delete();
    $previous = PickupTask::factory()->create(['customer_id' => $fixture['customer']->id, 'status' => 'PICKED_UP']);
    PickupRecord::factory()->create(['pickup_task_id' => $previous->id, 'picked_up_at' => '2026-09-30 16:00:00']);
    PickupPendingItem::factory()->create(['pickup_task_id' => $previous->id, 'status' => 'PENDING']);
    storedPrefixPickupReport('4000 VANNY');

    expect(JneShipment::sole()->pickup_task_id)->toBeNull();
});
