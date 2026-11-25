<?php

use App\Actions\Reports\ManageReportJobs;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

require __DIR__.'/../../vendor/autoload.php';
$application = require __DIR__.'/../../bootstrap/app.php';
$application->make(Kernel::class)->bootstrap();
[$script, $database, $gate, $index] = $argv;
$instance = $argv[4] ?? null;
$instance = $instance === '' ? null : $instance;
$source = $argv[5] ?? 'apex';
config(['database.default' => 'mysql', 'database.connections.mysql.database' => $database,
    'database.connections.mysql.url' => null,
    'jne-reports.apex_pool_enabled' => $instance !== null, 'jne-reports.apex_concurrency' => 5]);
if ($source !== 'apex') {
    config(['jne-reports.automatic_retry_enabled' => true, 'jne-reports.hybrid_auto_retry_max' => 1]);
}
DB::purge('mysql');
file_put_contents($gate.'.'.$index, 'ready');
$deadline = microtime(true) + 15;
while (! file_exists($gate) && microtime(true) < $deadline) {
    usleep(10000);
}
$worker = $source === 'apex' ? 'jne-report-1'.($instance !== null ? '-instance-'.$instance : '') : 'hybrid-'.$source;
$job = $application->make(ManageReportJobs::class)->claim($worker, (string) Str::uuid(), $source, $source !== 'apex');
echo $job?->id ?? 'none';
