<?php

use App\Actions\Handover\CreateSession;
use App\Actions\Pickup\AssignPickupTasks;
use App\Actions\Pickup\CorrectPickupRecord;
use App\Actions\Pickup\CreatePickupTask;
use App\Actions\Pickup\StartPickup;
use App\Actions\Pickup\TakeOverTask;
use App\Actions\Scheduling\GeneratePickupTasks;
use App\Models\PickupSchedule;
use App\Models\PickupTask;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;

require __DIR__.'/../../vendor/autoload.php';
$application = require __DIR__.'/../../bootstrap/app.php';
$application->make(Kernel::class)->bootstrap();
[$script, $database, $actorId, $taskId, $oldId, $gate, $index] = $argv;
$operation = $argv[7] ?? 'takeover';
config(['database.default' => 'mysql', 'database.connections.mysql.database' => $database]);
DB::purge('mysql');
$actor = User::findOrFail((int) $actorId);
file_put_contents($gate.'.'.$index, 'ready');
$deadline = microtime(true) + 15;
while (! file_exists($gate) && microtime(true) < $deadline) {
    usleep(10000);
}
try {
    if ($operation === 'bulk_assignment') {
        $tasks = PickupTask::orderBy('id')->get();
        if ((int) $index === 1) {
            $tasks = $tasks->reverse();
        }
        $application->make(AssignPickupTasks::class)->handle($actor, (int) $oldId, $tasks->map(fn ($task) => ['id' => $task->id, 'expected_version' => 1])->values()->all());
    } elseif ($operation === 'start') {
        $application->make(StartPickup::class)->handle($actor, (int) $taskId, 1);
    } elseif ($operation === 'handover') {
        $application->make(CreateSession::class)->handle($actor, [(int) $taskId], (string) Str::uuid());
    } elseif ($operation === 'generation') {
        echo $application->make(GeneratePickupTasks::class)->handle((int) $taskId, CarbonImmutable::now(config('pickup.timezone')));
        exit;
    } elseif (in_array($operation, ['manual', 'manual_generation'], true)) {
        $schedule = $operation === 'manual_generation' ? PickupSchedule::findOrFail((int) $taskId) : null;
        $scheduled = $schedule ? CarbonImmutable::now($schedule->timezone)->format('Y-m-d').' '.$schedule->pickup_time : CarbonImmutable::now(config('pickup.timezone'))->addDays(2)->format('Y-m-d').' 12:00:00';
        $application->make(CreatePickupTask::class)->handle($actor, ['customer_id' => $schedule?->customer_id ?? (int) $taskId, 'pickup_address' => 'Concurrency address', 'scheduled_at' => CarbonImmutable::parse($scheduled, $schedule?->timezone ?? config('pickup.timezone'))->toIso8601String(), 'notes' => 'Customer request', 'submission_key' => (string) Str::uuid()]);
    } elseif ($operation === 'correction') {
        $application->make(CorrectPickupRecord::class)->handle($actor, (int) $taskId, ['expected_version' => 1, 'customer_name' => 'Koreksi Concurrent', 'pickup_address' => 'Jl. Test', 'contact' => 'test@example.test', 'manual_hybrid' => 3, 'cashless_hybrid' => 1, 'css_orion' => 0, 'notes' => null, 'reason' => 'Salah pencatatan']);
    } else {
        $application->make(TakeOverTask::class)->handle($actor, (int) $taskId, 1, (int) $oldId);
    }
    echo '200';
} catch (HttpException $exception) {
    echo $exception->getStatusCode();
}
