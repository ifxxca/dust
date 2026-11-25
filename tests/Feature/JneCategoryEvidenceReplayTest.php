<?php

use App\Actions\Reports\ResolveJneCategories;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneShipmentMatchEvent;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

require_once __DIR__.'/../Fixtures/pickup-automation.php';

test('category evidence ignores JSON object key order but retains strict source values', function (string $change, int $events) {
    Http::preventStrayRequests();
    Storage::fake('jne_reports');
    $this->travelTo('2026-10-27 08:00:00 UTC');
    config(['pickup.automation.enabled' => false, 'jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => true]);
    $fixture = pickupAutomationFixture(1, 0);
    $fixture['contract']->update(['definition' => [...$fixture['contract']->definition, 'hybrid_categories' => ['roberto:manual' => 'manual_hybrid']]]);
    importPickupAutomationReport($fixture, 1, 0);
    JneReportAwb::sole()->update(['source_evidence' => ['hybrid_origins' => [['report_job_id' => 900, 'source' => 'roberto', 'report_type' => 'manual', 'checksum' => 'fixture']]]]);
    app(ResolveJneCategories::class)->handle(JneShipment::all());
    $shipment = JneShipment::sole();
    $evidence = $shipment->category_evidence;
    $evidence[0] = array_reverse($evidence[0], true);
    if ($change === 'scalar_type') {
        $evidence[0]['contract_revision'] = (string) $evidence[0]['contract_revision'];
    } elseif ($change === 'nested_order') {
        $evidence[1]['hybrid_origin'] = array_reverse($evidence[1]['hybrid_origin'], true);
    } elseif ($change === 'list_order') {
        $evidence = array_reverse($evidence);
    }
    DB::table('jne_shipments')->where('id', $shipment->id)->update(['category_evidence' => json_encode($evidence, JSON_THROW_ON_ERROR)]);
    $before = $shipment->fresh();
    $auditCount = JneShipmentMatchEvent::where('method', 'CATEGORY')->count();

    app(ResolveJneCategories::class)->handle(JneShipment::all());

    expect(JneShipmentMatchEvent::where('method', 'CATEGORY')->count())->toBe($auditCount + $events);
    expect($shipment->fresh()->version)->toBe($before->version + $events);
    expect($shipment->fresh()->only(['customer_id', 'pickup_task_id', 'category', 'category_status', 'match_status']))
        ->toBe($before->only(['customer_id', 'pickup_task_id', 'category', 'category_status', 'match_status']));
    Http::assertNothingSent();
})->with([['object_order', 0], ['nested_order', 0], ['scalar_type', 1], ['list_order', 1]]);

test('category replay reads current persisted state instead of stale or partial model attributes', function (string $modelState) {
    Storage::fake('jne_reports');
    config(['pickup.automation.enabled' => false, 'jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => true]);
    $fixture = pickupAutomationFixture(1, 0);
    importPickupAutomationReport($fixture, 1, 0);
    $before = JneShipment::sole();
    $events = JneShipmentMatchEvent::where('method', 'CATEGORY')->count();
    $input = $modelState === 'partial' ? JneShipment::select('id', 'awb')->sole()
        : $before->fresh()->forceFill(['category' => null, 'category_status' => 'UNMATCHED', 'category_evidence' => [], 'version' => 1]);

    app(ResolveJneCategories::class)->handle(collect([$input]));
    app(ResolveJneCategories::class)->handle(collect([$input]));

    expect(JneShipmentMatchEvent::where('method', 'CATEGORY')->count())->toBe($events)
        ->and($before->fresh()->getAttributes())->toBe($before->getAttributes())
        ->and($input->version)->toBe($before->version)->and($input->category)->toBe('manual_hybrid');
})->with(['stale', 'partial']);

test('category decision and audit roll back together if the audit cannot be stored', function () {
    Storage::fake('jne_reports');
    config(['pickup.automation.enabled' => false, 'jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => true]);
    $fixture = pickupAutomationFixture(1, 0);
    importPickupAutomationReport($fixture, 1, 0);
    $shipment = JneShipment::sole();
    $shipment->update(['category' => null, 'category_status' => 'UNMATCHED', 'category_evidence' => []]);
    $before = $shipment->getAttributes();
    $events = JneShipmentMatchEvent::where('method', 'CATEGORY')->count();
    JneShipmentMatchEvent::creating(function (JneShipmentMatchEvent $event): void {
        if ($event->method === 'CATEGORY') {
            throw new RuntimeException('Audit storage unavailable');
        }
    });

    expect(fn () => app(ResolveJneCategories::class)->handle(collect([$shipment])))->toThrow(RuntimeException::class);
    expect($shipment->fresh()->getAttributes())->toBe($before)
        ->and(JneShipmentMatchEvent::where('method', 'CATEGORY')->count())->toBe($events);
});
