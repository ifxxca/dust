<?php

use App\Actions\Handover\CreateSession;
use App\Actions\Handover\VerifyItem;
use App\Actions\Pickup\ReconcilePickupProcessing;
use App\Models\JneShipment;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use Illuminate\Support\Str;

require __DIR__.'/ui-ux-browser.php';
require __DIR__.'/pickup-automation.php';
config(['pickup.automation.enabled' => false, 'jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => true, 'jne-reports.category_markers_enabled' => false]);
$fixture = pickupAutomationFixture(2, 0);
$other = PickupTask::factory()->create(['customer_id' => $fixture['customer']->id, 'customer_name_snapshot' => 'Vanny', 'status' => 'PICKED_UP', 'scheduled_at' => now()]);
PickupRecord::factory()->create(['pickup_task_id' => $other->id, 'manual_hybrid' => 2, 'cashless_hybrid' => 0, 'css_orion' => 0, 'picked_up_at' => now()->addMinutes(10)]);
$handover = app(CreateSession::class)->handle($fixture['admin'], [$other->id], (string) Str::uuid());
app(VerifyItem::class)->handle($fixture['admin'], $handover->id, $handover->items()->sole()->id, ['expected_version' => 1, 'manual_hybrid' => 2, 'cashless_hybrid' => 0, 'css_orion' => 0]);
importPickupAutomationReport($fixture, 4, 0);
foreach (JneShipment::where('customer_id', $fixture['customer']->id)->orderBy('id')->get() as $index => $shipment) {
    $shipment->update(['pickup_task_id' => $index < 3 ? $fixture['task']->id : $other->id, 'match_status' => 'MATCHED', 'match_method' => 'MANUAL']);
}
app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
$ids['customer_day_anchor'] = $fixture['task']->id;
$ids['customer_day_member'] = $other->id;
file_put_contents($auditDb.'.ids.json', json_encode($ids, JSON_THROW_ON_ERROR));
