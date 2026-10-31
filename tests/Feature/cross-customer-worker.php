<?php

use App\Actions\Pickup\ReconcilePickupProcessing;
use App\Actions\Reports\MatchJneShipments;
use App\Actions\Reports\ProjectJneShipments;
use App\Jobs\QueueHistoricalPickupReconciliationsJob;
use App\Jobs\RenderPickupAwbManifestJob;
use App\Models\JneShipment;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;

require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
$fixture = json_decode(file_get_contents($argv[1]), true, flags: JSON_THROW_ON_ERROR);
$index = (int) $argv[2];
$mode = $argv[3] ?? 'hold';
if ($fixture['port'] !== 54184 || ! str_starts_with($fixture['database'], 'hardening_lock_')) {
    throw new RuntimeException('Isolated cross-customer server required.');
}
$settings = [...config('database.connections.mysql'), 'url' => null, 'host' => '127.0.0.1', 'port' => 54184, 'username' => 'root', 'password' => '', 'database' => $fixture['database']];
config(['database.default' => 'mysql', 'database.connections.mysql' => $settings, 'pickup.automation.enabled' => false,
    'jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => true, 'jne-reports.category_markers_enabled' => false]);
DB::purge('mysql');
if (! str_contains(DB::selectOne('SELECT @@datadir AS directory')->directory, 'dust-hardening-mysql-lock-')) {
    throw new RuntimeException('Wrong server directory.');
}
Http::preventStrayRequests();
Queue::fake();
if ($mode === 'queue') {
    config(['queue.default' => 'database', 'queue.connections.database.connection' => 'mysql', 'queue.connections.database.retry_after' => 2,
        'queue.failed.database' => 'mysql', 'cache.default' => 'database']);
    $realQueue = Queue::getFacadeRoot()->queue;
    Queue::swap($realQueue);
    Queue::fake([RenderPickupAwbManifestJob::class, QueueHistoricalPickupReconciliationsJob::class]);
    app('queue.worker')->setManager($realQueue);
    $paused = false;
    DB::listen(function (QueryExecuted $query) use ($fixture, $index, &$paused): void {
        if ($index !== 0 || $paused || ! str_starts_with($query->sql, 'update') || ! str_contains($query->sql, 'pickup_processing_reconciliations')) {
            return;
        }
        $paused = true;
        touch($fixture['gate'].'.paused');
        $deadline = microtime(true) + 30;
        while (! is_file($fixture['gate'].'.release') && microtime(true) < $deadline) {
            usleep(10000);
        }
    });
    $started = hrtime(true);
    Artisan::call('queue:work', ['connection' => 'database', '--once' => true, '--queue' => 'reconciliation', '--sleep' => 0, '--tries' => 4, '--timeout' => 1]);
    echo json_encode(['mode' => $mode, 'duration_ms' => (hrtime(true) - $started) / 1e6, 'pcntl' => extension_loaded('pcntl')], JSON_THROW_ON_ERROR);
    exit(0);
}
if ($mode === 'cycle') {
    $attempts = 0;
    $started = hrtime(true);
    DB::transaction(function () use ($fixture, $index, &$attempts): void {
        $attempts++;
        DB::table('customers')->where('id', $fixture['customers'][$index])->lockForUpdate()->first();
        DB::table('jne_shipments')->where('id', $fixture['poolIds'][$index][1])->lockForUpdate()->first();
        touch($fixture['gate'].'.ready'.$index);
        $deadline = microtime(true) + 20;
        while (! is_file($fixture['gate'].'.go') && microtime(true) < $deadline) {
            usleep(10000);
        }
        foreach ($fixture['scope_queries'][$index] as $query) {
            DB::select($query['sql'], $query['bindings']);
        }
    }, 3);
    echo json_encode(['mode' => $mode, 'attempts' => $attempts, 'duration_ms' => (hrtime(true) - $started) / 1e6], JSON_THROW_ON_ERROR);
    exit(0);
}
$queries = [];
$held = false;
DB::listen(function (QueryExecuted $query) use ($fixture, $mode, $index, &$held, &$queries): void {
    if (! str_starts_with(strtolower($query->sql), 'select') || ! str_contains($query->sql, 'jne_shipments') || ! str_contains($query->sql, 'for update')) {
        return;
    }
    $frames = debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS, 40);
    $appFrame = collect($frames)->first(fn (array $frame): bool => isset($frame['file']) && str_contains(str_replace('\\', '/', $frame['file']), '/app/'));
    if ($appFrame === null || ! str_ends_with(str_replace('\\', '/', $appFrame['file']), '/ReconcileCustomerPickupDay.php')) {
        return;
    }
    $queries[] = ['sql' => $query->sql, 'bindings' => $query->bindings, 'ms' => $query->time, 'line' => $appFrame['line']];
    if ($mode === 'hold' && ! $held && str_contains($query->sql, 'is null')) {
        $held = true;
        file_put_contents($fixture['gate'].'.held'.$index, json_encode(['connection_id' => DB::selectOne('SELECT CONNECTION_ID() AS id')->id, 'queries' => $queries], JSON_THROW_ON_ERROR));
        $deadline = microtime(true) + 35;
        while (! is_file($fixture['gate'].'.release') && microtime(true) < $deadline) {
            usleep(10000);
        }
    }
});
$started = hrtime(true);
try {
    $subject = $fixture['subjects'][$index] ?? $index;
    if ($mode !== 'hold') {
        touch($fixture['gate'].'.ready'.$index);
        $deadline = microtime(true) + 20;
        while (! is_file($fixture['gate'].'.go') && microtime(true) < $deadline) {
            usleep(10000);
        }
        $started = hrtime(true);
    }
    if ($mode === 'claim') {
        $row = JneShipment::findOrFail($fixture['claim_id']);
        $task = PickupTask::findOrFail($fixture['tasks'][$subject][0]);
        app(MatchJneShipments::class)->manual(User::findOrFail($fixture['admin']), $row->id, $task->reference, $row->version, 'Synthetic explicit ownership decision');
        $result = null;
    } elseif (in_array($mode, ['projection', 'conflict'], true)) {
        app(ProjectJneShipments::class)->handle($mode === 'conflict' ? $fixture['conflict_report'] : $fixture['reports'][$subject]);
        $result = null;
    } else {
        $result = app(ReconcilePickupProcessing::class)->handle($fixture['tasks'][$subject][0]);
    }
    Http::assertNothingSent();
    echo json_encode(['result' => 'PASS', 'status' => $result?->status, 'queries' => $queries, 'duration_ms' => (hrtime(true) - $started) / 1e6], JSON_THROW_ON_ERROR);
} catch (Throwable $exception) {
    echo json_encode(['result' => 'FAIL', 'exception' => $exception::class, 'driver_code' => $exception->errorInfo[1] ?? null, 'duration_ms' => (hrtime(true) - $started) / 1e6], JSON_THROW_ON_ERROR);
    exit(1);
}
