<?php

use App\Actions\Pickup\RecordCashlessAwb;
use App\Models\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

require __DIR__.'/../../vendor/autoload.php';
$application = require __DIR__.'/../../bootstrap/app.php';
$application->make(Kernel::class)->bootstrap();
[$script, $database, $gate, $index, $staffId, $taskId] = $argv;
config(['database.default' => 'mysql', 'database.connections.mysql.database' => $database]);
DB::purge('mysql');
file_put_contents($gate.'.'.$index, 'ready');
$deadline = microtime(true) + 15;
while (! file_exists($gate) && microtime(true) < $deadline) {
    usleep(10000);
}
try {
    $application->make(RecordCashlessAwb::class)->handle(User::findOrFail($staffId), (int) $taskId, ['awb' => '000001', 'submission_key' => (string) Str::uuid()]);
    echo 'claimed';
} catch (ValidationException) {
    echo 'conflict';
}
