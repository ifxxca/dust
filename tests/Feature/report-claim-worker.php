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
config(['database.default' => 'mysql', 'database.connections.mysql.database' => $database,
    'jne-reports.apex_pool_enabled' => $instance !== null, 'jne-reports.apex_concurrency' => 5]);
DB::purge('mysql');
file_put_contents($gate.'.'.$index, 'ready');
$deadline = microtime(true) + 15;
while (! file_exists($gate) && microtime(true) < $deadline) {
    usleep(10000);
}
$job = $application->make(ManageReportJobs::class)->claim('jne-report-1'.($instance !== null ? '-instance-'.$instance : ''), (string) Str::uuid());
echo $job?->id ?? 'none';
