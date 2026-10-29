<?php

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

require __DIR__.'/../../vendor/autoload.php';
$application = require __DIR__.'/../../bootstrap/app.php';
$application->make(Kernel::class)->bootstrap();
$fixture = json_decode(file_get_contents($argv[1]), true, flags: JSON_THROW_ON_ERROR);
config(['database.default' => 'mysql', 'database.connections.mysql.url' => null, 'database.connections.mysql.host' => '127.0.0.1',
    'database.connections.mysql.port' => $fixture['port'], 'database.connections.mysql.username' => 'root', 'database.connections.mysql.password' => '',
    'database.connections.mysql.database' => $fixture['database'], 'queue.default' => 'database', 'cache.default' => 'database',
    'pickup.automation.enabled' => $fixture['scenario'] === 'producer', 'pickup.awb_send_enabled' => false,
    'filesystems.disks.jne_reports.root' => $fixture['reports_root']]);
DB::purge('mysql');
if (! str_contains(DB::selectOne('select @@datadir as directory')->directory, 'dust-hardening-mysql-')
    || ! str_starts_with($fixture['database'], 'hardening_queue_')) {
    throw new RuntimeException('Disposable queue database required.');
}
$writes = 0;
DB::listen(function (QueryExecuted $query) use ($fixture, &$writes): void {
    $table = match ($fixture['scenario']) {
        'producer' => 'pickup_processing_reconciliations',
        'projection' => 'jne_shipments',
        default => 'jne_report_awbs',
    };
    $operation = $fixture['scenario'] === 'projection' ? 'update' : 'insert';
    if (! str_starts_with(strtolower($query->sql), $operation) || ! str_contains($query->sql, '`'.$table.'`')) {
        return;
    }
    $writes++;
    if (($fixture['scenario'] === 'producer' && $writes === 50) || in_array($fixture['scenario'], ['import', 'projection'], true)) {
        touch($fixture['gate'].'.paused');
        $deadline = microtime(true) + 30;
        while (! file_exists($fixture['gate'].'.release') && microtime(true) < $deadline) {
            usleep(10000);
        }
    }
});
Artisan::call('queue:work', ['connection' => 'database', '--once' => true, '--queue' => 'default', '--sleep' => 0, '--tries' => 3]);
