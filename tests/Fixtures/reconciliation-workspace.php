<?php

use App\Actions\Pickup\PickupResultPeriod;
use App\Actions\Pickup\ReconcilePickupProcessing;
use Illuminate\Support\Facades\Storage;

require __DIR__.'/ui-ux-browser.php';
require_once __DIR__.'/pickup-automation.php';

config(['jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => true,
    'jne-reports.category_markers_enabled' => false, 'pickup.automation.enabled' => false, 'pickup.automation.send_enabled' => false]);
Storage::fake('jne_reports');
$fixture = pickupAutomationFixture(35, 0);
importPickupAutomationReport($fixture, 35, 0);
app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
$ids['workspace_task'] = $fixture['task']->id;
$ids['workspace_customer'] = $fixture['customer']->id;
$ids['workspace_date'] = PickupResultPeriod::date($fixture['task']->proof->picked_up_at)->toDateString();
$fixture['admin']->update(['email' => 'reconciliation-reviewer@example.test']);
file_put_contents($auditDb.'.ids.json', json_encode($ids, JSON_THROW_ON_ERROR));
echo PHP_EOL.json_encode(['workspace_task' => $fixture['task']->id, 'quantity' => 35]);
