<?php

use App\Models\HandoverSession;
use App\Models\PickupRecord;
use App\Models\PickupSchedule;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;

test('mysql concurrent operational requests preserve one owner or handover membership', function (string $scenario) {
    $database = 'm1_test_'.bin2hex(random_bytes(8));
    $base = config('database.connections.mysql');
    config(['database.connections.m1_server' => [...$base, 'database' => null]]);
    DB::connection('m1_server')->statement('CREATE DATABASE `'.$database.'`');
    config(['database.connections.m1_test' => [...$base, 'database' => $database], 'database.default' => 'm1_test']);
    $gate = sys_get_temp_dir().DIRECTORY_SEPARATOR.$database;
    $processes = [];
    try {
        Artisan::call('migrate', ['--database' => 'm1_test', '--force' => true]);
        $a = User::factory()->create(['role' => 'pickup_staff']);
        $b = User::factory()->create(['role' => 'pickup_staff']);
        $c = User::factory()->create(['role' => 'pickup_staff']);
        $task = PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $a->id]);
        if ($scenario === 'claim') {
            $task->update(['status' => 'SCHEDULED', 'assigned_staff_id' => null]);
        }
        if (in_array($scenario, ['handover', 'correction'], true)) {
            $task->update(['status' => 'PICKED_UP']);
            PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'staff_id' => $a->id]);
        }
        $targetId = $task->id;
        if (in_array($scenario, ['generation', 'manual_generation'], true)) {
            $schedule = PickupSchedule::factory()->create(['starts_on' => '2026-01-01', 'weekdays' => [1, 2, 3, 4, 5, 6, 7]]);
            $targetId = $schedule->id;
        }
        if ($scenario === 'manual') {
            $targetId = $task->customer_id;
        }
        if ($scenario === 'correction') {
            $b->update(['role' => 'admin_supervisor']);
            $c->update(['role' => 'admin_supervisor']);
        }
        if ($scenario === 'bulk_assignment') {
            $otherRecipient = User::factory()->create(['role' => 'pickup_staff']);
            $b->update(['role' => 'cs']);
            $c->update(['role' => 'admin_supervisor']);
            $task->update(['status' => 'SCHEDULED', 'assigned_staff_id' => null]);
            PickupTask::factory()->create(['status' => 'SCHEDULED']);
        }
        foreach ($scenario === 'start' ? [$a, $b] : [$b, $c] as $index => $staff) {
            $operation = $scenario === 'start' && $index === 1 ? 'takeover' : ($scenario === 'manual_generation' && $index === 0 ? 'generation' : $scenario);
            $recipientId = $scenario === 'bulk_assignment' && $index === 1 ? $otherRecipient->id : $a->id;
            $process = new Process([PHP_BINARY, base_path('tests/Feature/takeover-worker.php'), $database, (string) $staff->id, (string) $targetId, (string) $recipientId, $gate, (string) $index, $operation], base_path(), ['APP_ENV' => 'testing']);
            $process->setTimeout(20);
            $process->start();
            $processes[] = $process;
        }
        $deadline = microtime(true) + 10;
        while ((! file_exists($gate.'.0') || ! file_exists($gate.'.1')) && microtime(true) < $deadline) {
            usleep(10000);
        }
        expect(file_exists($gate.'.0') && file_exists($gate.'.1'))->toBeTrue();
        file_put_contents($gate, 'go');
        $outcomes = [];
        foreach ($processes as $process) {
            $process->wait();
            expect($process->getErrorOutput())->toBe('');
            $outcomes[] = trim($process->getOutput());
        }
        sort($outcomes);
        if ($scenario === 'bulk_assignment') {
            expect($outcomes)->toBe(['200', '409']);
            expect(PickupTask::where('status', 'ASSIGNED')->whereIn('assigned_staff_id', [$a->id, $otherRecipient->id])->where('version', 2)->count())->toBe(2);
            expect(PickupTask::distinct()->count('assigned_staff_id'))->toBe(1);
            foreach (PickupTask::all() as $assigned) {
                expect($assigned->events()->where('action', 'assigned')->count())->toBe(1);
            }

            return;
        }
        if ($scenario === 'manual') {
            expect($outcomes)->toBe(['200', '409']);
            $created = PickupTask::where('customer_id', $targetId)->whereNotNull('creation_submission_key')->sole();
            expect($created->status)->toBe('ASSIGNED')->and($created->events()->count())->toBe(2);

            return;
        }
        if ($scenario === 'manual_generation') {
            expect(in_array($outcomes, [['0', '200'], ['1', '409']], true))->toBeTrue();
            expect(PickupTask::where('customer_id', $schedule->customer_id)->count())->toBe(1);

            return;
        }
        if ($scenario === 'generation') {
            expect($outcomes)->toBe(['0', '1']);
            expect(PickupTask::where('pickup_schedule_id', $targetId)->count())->toBe(1);

            return;
        }
        if ($scenario === 'start') {
            expect($outcomes[0])->toBe('200')->and($outcomes[1])->toBeIn(['403', '409']);
        } else {
            expect($outcomes)->toBe(['200', '409']);
        }
        if ($scenario === 'handover') {
            expect(HandoverSession::count())->toBe(1)->and($task->handoverItem()->count())->toBe(1);

            return;
        }
        if ($scenario === 'correction') {
            expect($task->fresh()->version)->toBe(2)->and($task->fresh()->status)->toBe('PICKED_UP');
            expect($task->proof->revisions()->count())->toBe(1)->and($task->events()->count())->toBe(1);

            return;
        }
        expect($task->fresh()->version)->toBe(2)->and($task->fresh()->status)->toBe('ASSIGNED');
        expect($task->events()->count())->toBe(1);
        $event = $task->events()->sole();
        expect($event->new_staff_id)->toBe($task->fresh()->assigned_staff_id);
        if ($event->action === 'execution_started') {
            expect($task->fresh()->assigned_staff_id)->toBe($a->id)->and($task->visits()->count())->toBe(1);
        } else {
            expect($event->previous_staff_id)->toBe($scenario === 'claim' ? null : $a->id)->and($task->fresh()->execution_started_at)->toBeNull();
        }
    } finally {
        foreach ($processes as $process) {
            if ($process->isRunning()) {
                $process->stop();
            }
        }
        config(['database.default' => 'sqlite']);
        DB::purge('m1_test');
        DB::connection('m1_server')->statement('DROP DATABASE `'.$database.'`');
        foreach ([$gate, $gate.'.0', $gate.'.1'] as $file) {
            if (file_exists($file)) {
                unlink($file);
            }
        }
    }
})->with(['takeover', 'claim', 'start', 'handover', 'generation', 'correction', 'manual', 'manual_generation', 'bulk_assignment'])->group('mysql-concurrency');
