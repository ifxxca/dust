<?php

use App\Actions\Pickup\ManageReconciliationWorkspace;
use App\Actions\Pickup\ReconcilePickupProcessing;
use App\Actions\Reports\ResolveJneCategories;
use App\Models\JneShipment;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

[$script, $database, $gate, $index, $taskId] = $argv;
if (getenv('APP_ENV') !== 'testing' || ! preg_match('/^reconciliation_test_[a-f0-9]{16}$/', $database)) {
    throw new RuntimeException('Only an isolated reconciliation test database is allowed.');
}
require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
require __DIR__.'/pickup-automation.php';
pickupAutomationCapability();
config(['database.default' => 'mysql', 'database.connections.mysql.database' => $database, 'database.connections.mysql.url' => null,
    'pickup.automation.enabled' => false, 'pickup.automation.auto_lock' => true, 'pickup.automation.send_enabled' => false,
    'jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => true]);
DB::purge('mysql');
Queue::fake();
Notification::fake();
Http::preventStrayRequests();
$categoryReplay = ($argv[5] ?? '') === 'category';
$shipments = $categoryReplay ? JneShipment::where('pickup_task_id', $taskId)->get() : collect();
file_put_contents($gate.'.'.$index, 'ready');
$deadline = microtime(true) + 20;
while (! file_exists($gate) && microtime(true) < $deadline) {
    usleep(10000);
}
if (! file_exists($gate)) {
    throw new RuntimeException('Concurrent test gate did not open.');
}
if (($argv[5] ?? '') === 'allocation') {
    $payload = json_decode(file_get_contents($gate.'.json'), true, flags: JSON_THROW_ON_ERROR);
    try {
        $app->make(ManageReconciliationWorkspace::class)->change(User::findOrFail($payload['actors'][$index]), PickupTask::findOrFail($taskId), $payload['bodies'][$index], apply: true);
    } catch (HttpExceptionInterface $exception) {
        if ($exception->getStatusCode() !== 409) {
            throw $exception;
        }
        echo 'conflict';

        return;
    }
} elseif (($argv[5] ?? '') === 'exception') {
    $payload = json_decode(file_get_contents($gate.'.json'), true, flags: JSON_THROW_ON_ERROR);
    try {
        $app->make(ManageReconciliationWorkspace::class)->lock(User::findOrFail($payload['actors'][$index]), PickupTask::findOrFail($taskId), $payload['body']);
    } catch (HttpExceptionInterface $exception) {
        if ($exception->getStatusCode() !== 409) {
            throw $exception;
        }
        echo 'conflict';

        return;
    }
} elseif ($categoryReplay) {
    $app->make(ResolveJneCategories::class)->handle($shipments);
} else {
    $app->make(ReconcilePickupProcessing::class)->handle((int) $taskId);
}
echo 'completed';
