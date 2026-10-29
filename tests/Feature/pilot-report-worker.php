<?php

use App\Actions\Reports\ProjectJneShipments;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Support\Facades\DB;
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
$queries = 0;
$sqlMs = 0;
$maxMs = 0;
$lockMs = 0;
DB::listen(function (QueryExecuted $query) use (&$queries, &$sqlMs, &$maxMs, &$lockMs): void {
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
    echo json_encode(['result' => 'PASS', 'index' => $index, 'queries' => $queries, 'sql_ms' => $sqlMs, 'max_query_ms' => $maxMs,
        'lock_select_ms' => $lockMs, 'duration_ms' => (hrtime(true) - $started) / 1e6, 'peak_php_bytes' => memory_get_peak_usage(true)], JSON_THROW_ON_ERROR);
} catch (Throwable $exception) {
    echo json_encode(['result' => 'FAIL', 'exception_class' => $exception::class, 'code' => $exception->getCode()], JSON_THROW_ON_ERROR);
    exit(1);
}
