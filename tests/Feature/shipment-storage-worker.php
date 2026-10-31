<?php

use App\Actions\Reports\ProjectJneShipments;
use App\Actions\Reports\ResolveJneCategories;
use App\Models\JneShipment;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;

require __DIR__.'/../../vendor/autoload.php';
$fixture = json_decode(file_get_contents($argv[1]), true, flags: JSON_THROW_ON_ERROR);
$mode = $argv[2];
$index = (int) $argv[3];
if ($mode === 'legacy') {
    $legacy = realpath($fixture['legacy_file']);
    if (! is_string($legacy) || ! str_starts_with($legacy, sys_get_temp_dir().DIRECTORY_SEPARATOR.'dust-storage-legacy-') || hash_file('sha256', $legacy) !== $fixture['legacy_sha256']) {
        throw new RuntimeException('Historical fixture identity mismatch.');
    }
    require $legacy;
}
$application = require __DIR__.'/../../bootstrap/app.php';
$application->make(Kernel::class)->bootstrap();
config(['database.default' => 'mysql', 'database.connections.mysql.url' => null, 'database.connections.mysql.host' => '127.0.0.1',
    'database.connections.mysql.port' => $fixture['port'], 'database.connections.mysql.username' => 'root', 'database.connections.mysql.password' => '',
    'database.connections.mysql.database' => $fixture['database'], 'pickup.automation.enabled' => false,
    'jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => true, 'jne-reports.category_markers_enabled' => true]);
DB::purge('mysql');
if ($fixture['port'] !== 54182 || ! str_starts_with($fixture['database'], 'hardening_storage_') || ! str_contains(DB::selectOne('select @@datadir as directory')->directory, 'dust-hardening-mysql-')) {
    throw new RuntimeException('Disposable storage database required.');
}
Http::preventStrayRequests();
Queue::fake();
$before = DB::table('jne_shipment_match_events')->count();
$queries = 0;
DB::listen(function (QueryExecuted $query) use (&$queries): void {
    $queries++;
});
touch($fixture['gate'].'.ready'.$index);
$deadline = microtime(true) + 15;
while (! is_file($fixture['gate'].'.go') && microtime(true) < $deadline) {
    usleep(10000);
}
$started = hrtime(true);
if ($mode === 'legacy') {
    foreach ([1, 2] as $replay) {
        DB::transaction(fn () => app(ResolveJneCategories::class)->handle(JneShipment::orderBy('id')->lockForUpdate()->get()));
    }
} else {
    app(ProjectJneShipments::class)->handle($fixture['reports'][$index]);
}
Http::assertNothingSent();
Queue::assertNothingPushed();
echo json_encode(['mode' => $mode, 'index' => $index, 'events_before' => $before, 'events_after' => DB::table('jne_shipment_match_events')->count(),
    'queries' => $queries, 'duration_ms' => (hrtime(true) - $started) / 1e6], JSON_THROW_ON_ERROR);
