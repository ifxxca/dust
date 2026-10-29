<?php

use App\Actions\Handover\CorrectVerification;
use App\Actions\Handover\VerifyItem;
use App\Actions\Pickup\CorrectPickupRecord;
use App\Actions\Pickup\FinalizePickup;
use App\Actions\Pickup\ReconcilePickupProcessing;
use App\Models\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Database\QueryException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

require __DIR__.'/../../vendor/autoload.php';
$application = require __DIR__.'/../../bootstrap/app.php';
$application->make(Kernel::class)->bootstrap();
[$script, $file, $operation, $actorId] = $argv;
$settings = json_decode(file_get_contents($file), true, flags: JSON_THROW_ON_ERROR);
config(['database.default' => 'mysql', 'database.connections.mysql.host' => '127.0.0.1', 'database.connections.mysql.port' => $settings['port'],
    'database.connections.mysql.username' => 'root', 'database.connections.mysql.password' => '', 'database.connections.mysql.database' => $settings['database'],
    'filesystems.disks.local.root' => $settings['gate'].'-evidence']);
DB::purge('mysql');
DB::statement('SET SESSION innodb_lock_wait_timeout = 8');
$actor = User::findOrFail((int) $actorId);
$first = in_array($operation, ['finalize', 'correct'], true);
$paused = false;
$actorLocks = 0;
DB::connection()->beforeExecuting(function (string $query) use ($settings, $first): void {
    if (! $first && str_contains($query, 'for update') && preg_match('/from `(customers|handover_sessions)`/', $query)) {
        touch($settings['gate'].'.second-attempted');
    }
});
DB::listen(function (QueryExecuted $query) use ($settings, $first, &$paused, &$actorLocks): void {
    if (str_contains($query->sql, 'from `users`') && str_contains($query->sql, 'for update')) {
        $actorLocks++;
    }
    if (! str_contains($query->sql, 'for update') || ! preg_match('/from `(customers|pickup_tasks|handover_sessions)`/', $query->sql, $match)) {
        return;
    }
    if (! $first) {
        touch($settings['gate'].'.second-held');
    } elseif (! $paused) {
        $paused = true;
        file_put_contents($settings['gate'].'.held', $match[1]);
        $deadline = microtime(true) + 12;
        while (! file_exists($settings['gate'].'.release') && microtime(true) < $deadline) {
            usleep(10000);
        }
    }
});
try {
    if ($operation === 'finalize') {
        $application->make(FinalizePickup::class)->handle($actor, $settings['task_id'], ['expected_version' => 1, 'submission_key' => $settings['key'],
            'manual_hybrid' => 2, 'cashless_hybrid' => 1, 'css_orion' => 0, 'cashless_capture' => 1, 'cashless_awbs' => ['TGLOCK001'], 'signature' => UploadedFile::fake()->image('signature.png')]);
    } elseif ($operation === 'reconcile') {
        $application->make(ReconcilePickupProcessing::class)->handle($settings['task_id']);
    } elseif ($operation === 'correct') {
        $application->make(CorrectPickupRecord::class)->handle($actor, $settings['task_id'], ['expected_version' => 1, 'customer_name' => 'Corrected', 'pickup_address' => 'Test address',
            'contact' => 'test@example.test', 'manual_hybrid' => 2, 'cashless_hybrid' => 1, 'css_orion' => 0, 'notes' => null, 'reason' => 'Correction']);
    } elseif ($operation === 'correct_verification') {
        $application->make(CorrectVerification::class)->handle($actor, $settings['session_id'], $settings['item_id'], ['expected_version' => $settings['session_version'], 'manual_hybrid' => 2, 'cashless_hybrid' => 1, 'css_orion' => 0, 'reason' => 'Verified correction']);
    } else {
        $application->make(VerifyItem::class)->handle($actor, $settings['session_id'], $settings['item_id'], ['expected_version' => 1, 'expected_pickup_revision' => 0, 'manual_hybrid' => 2, 'cashless_hybrid' => 1, 'css_orion' => 0]);
    }
    $status = 200;
} catch (HttpException $exception) {
    $status = $exception->getStatusCode();
} catch (Throwable $exception) {
    $status = $exception instanceof QueryException ? (int) ($exception->errorInfo[1] ?? 500) : 500;
}
echo json_encode(['status' => $status, 'actor_locks' => $actorLocks], JSON_THROW_ON_ERROR);
