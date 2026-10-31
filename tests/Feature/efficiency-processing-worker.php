<?php

use App\Actions\Reports\ProjectJneShipments;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;

require __DIR__.'/../../vendor/autoload.php';
require __DIR__.'/../Fixtures/processing-efficiency.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
$fixture = json_decode(file_get_contents($argv[1]), true, flags: JSON_THROW_ON_ERROR);
$index = (int) $argv[2];
if ($fixture['port'] !== 54183 || ! str_starts_with($fixture['database'], 'hardening_eff_')) {
    throw new RuntimeException('Disposable efficiency infrastructure required.');
}
$settings = [...config('database.connections.mysql'), 'url' => null, 'host' => '127.0.0.1', 'port' => 54183, 'username' => 'root', 'password' => '', 'database' => $fixture['database']];
config(['database.default' => 'mysql', 'database.connections.mysql' => $settings, 'database.connections.eff_observer' => $settings,
    'pickup.automation.enabled' => false, 'jne-reports.evidence_policies_enabled' => true,
    'jne-reports.category_reconciliation_enabled' => true, 'jne-reports.category_markers_enabled' => false]);
DB::purge('mysql');
if (! str_contains(DB::selectOne('SELECT @@datadir AS directory')->directory, 'dust-hardening-mysql-eff-')) {
    throw new RuntimeException('Wrong server directory.');
}
Http::preventStrayRequests();
Queue::fake();
$measure = processingEfficiencyProbe();
touch($fixture['gate'].'.ready'.$index);
$deadline = microtime(true) + 20;
while (! is_file($fixture['gate'].'.go') && microtime(true) < $deadline) {
    usleep(10000);
}
$row = $measure('overlap_projection_'.$index, fn () => app(ProjectJneShipments::class)->handle($fixture['reports'][$index]));
Http::assertNothingSent();
Queue::assertNothingPushed();
echo json_encode($row, JSON_THROW_ON_ERROR);
