<?php

use App\Actions\Reports\ProjectJneShipments;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Database\Events\TransactionBeginning;
use Illuminate\Database\Events\TransactionCommitted;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;

require __DIR__.'/../../vendor/autoload.php';
$application = require __DIR__.'/../../bootstrap/app.php';
$application->make(Kernel::class)->bootstrap();
$fixture = json_decode(file_get_contents($argv[1]), true, flags: JSON_THROW_ON_ERROR);
$index = (int) $argv[2];
config(['database.default' => 'mysql', 'database.connections.mysql.url' => null, 'database.connections.mysql.host' => '127.0.0.1',
    'database.connections.mysql.port' => $fixture['port'], 'database.connections.mysql.username' => 'root', 'database.connections.mysql.password' => '',
    'database.connections.mysql.database' => $fixture['database'], 'pickup.automation.enabled' => false,
    'jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => true, 'jne-reports.category_markers_enabled' => false]);
DB::purge('mysql');
if (! str_contains(DB::selectOne('select @@datadir as directory')->directory, 'dust-hardening-mysql-') || ! str_starts_with($fixture['database'], 'hardening_pilot_')) {
    throw new RuntimeException('Disposable pilot database required.');
}
Http::preventStrayRequests();
Queue::fake();
$connectionId = DB::selectOne('select connection_id() as id')->id;
$transactionStart = null;
$transactionMs = [];
Event::listen(TransactionBeginning::class, function () use (&$transactionStart): void {
    $transactionStart = hrtime(true);
});
Event::listen(TransactionCommitted::class, function () use (&$transactionStart, &$transactionMs): void {
    if ($transactionStart !== null) {
        $transactionMs[] = (hrtime(true) - $transactionStart) / 1e6;
        $transactionStart = null;
    }
});
$fingerprints = [];
$queries = 0;
$sqlMs = 0;
$maxMs = 0;
$lockMs = 0;
DB::listen(function (QueryExecuted $query) use (&$queries, &$sqlMs, &$maxMs, &$lockMs, &$fingerprints): void {
    $fingerprint = preg_replace('/\\?(?:\\s*,\\s*\\?)+/', '?...', $query->sql);
    $fingerprints[$fingerprint] ??= ['count' => 0, 'total_ms' => 0, 'max_ms' => 0];
    $fingerprints[$fingerprint]['count']++;
    $fingerprints[$fingerprint]['total_ms'] += $query->time;
    $fingerprints[$fingerprint]['max_ms'] = max($fingerprints[$fingerprint]['max_ms'], $query->time);
    $queries++;
    $sqlMs += $query->time;
    $maxMs = max($maxMs, $query->time);
    if (str_contains($query->sql, 'for update')) {
        $lockMs += $query->time;
    }
});
touch($fixture['gate'].'.ready'.$index);
$deadline = microtime(true) + 15;
while (! file_exists($fixture['gate'].'.go') && microtime(true) < $deadline) {
    usleep(10000);
}
$started = hrtime(true);
try {
    app(ProjectJneShipments::class)->handle($fixture['reports'][$index]);
    Http::assertNothingSent();
    Queue::assertNothingPushed();
    uasort($fingerprints, fn (array $left, array $right): int => $right['total_ms'] <=> $left['total_ms']);
    echo json_encode(['result' => 'PASS', 'connection_id' => $connectionId, 'report_id' => $fixture['reports'][$index],
        'transaction_ms' => $transactionMs, 'sql_fingerprints' => array_slice($fingerprints, 0, 12, true), 'index' => $index, 'queries' => $queries, 'sql_ms' => $sqlMs, 'max_query_ms' => $maxMs,
        'lock_select_ms' => $lockMs, 'duration_ms' => (hrtime(true) - $started) / 1e6, 'peak_php_bytes' => memory_get_peak_usage(true)], JSON_THROW_ON_ERROR);
} catch (Throwable $exception) {
    echo json_encode(['result' => 'FAIL', 'exception_class' => $exception::class, 'code' => $exception->getCode()], JSON_THROW_ON_ERROR);
    exit(1);
}
