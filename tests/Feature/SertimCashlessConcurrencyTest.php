<?php

use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;

test('simultaneous MySQL claims for the same AWB cannot assign it to two pickups', function () {
    $database = 'sertim_test_'.bin2hex(random_bytes(8));
    $base = config('database.connections.mysql');
    $original = config('database.default');
    config(['database.connections.sertim_server' => [...$base, 'database' => null]]);
    DB::connection('sertim_server')->statement('CREATE DATABASE '.$database);
    config(['database.connections.sertim_test' => [...$base, 'database' => $database], 'database.default' => 'sertim_test']);
    $gate = sys_get_temp_dir().DIRECTORY_SEPARATOR.$database;
    $processes = [];
    try {
        Artisan::call('migrate', ['--database' => 'sertim_test', '--force' => true]);
        foreach ([0, 1] as $index) {
            $staff = User::factory()->create(['role' => 'pickup_staff']);
            $task = PickupTask::factory()->create(['assigned_staff_id' => $staff->id, 'status' => 'ASSIGNED', 'execution_started_at' => now()]);
            $process = new Process([PHP_BINARY, base_path('tests/Feature/sertim-claim-worker.php'), $database, $gate, (string) $index, (string) $staff->id, (string) $task->id], base_path(), ['APP_ENV' => 'testing']);
            $process->setTimeout(25);
            $process->start();
            $processes[] = $process;
        }
        $deadline = microtime(true) + 15;
        while ((! file_exists($gate.'.0') || ! file_exists($gate.'.1')) && microtime(true) < $deadline) {
            usleep(10000);
        }
        expect(file_exists($gate.'.0') && file_exists($gate.'.1'))->toBeTrue();
        file_put_contents($gate, 'go');
        $results = [];
        foreach ($processes as $process) {
            $process->wait();
            expect($process->getErrorOutput())->toBe('');
            expect($process->isSuccessful())->toBeTrue($process->getOutput());
            $results[] = trim($process->getOutput());
        }
        sort($results);
        expect($results)->toBe(['claimed', 'conflict']);
        $this->assertDatabaseCount('pickup_cashless_awbs', 1);
        $this->assertDatabaseCount('pickup_cashless_awb_events', 1);
    } finally {
        foreach ($processes as $process) {
            if ($process->isRunning()) {
                $process->stop();
            }
        }
        config(['database.default' => $original]);
        DB::purge('sertim_test');
        DB::connection('sertim_server')->statement('DROP DATABASE '.$database);
        foreach ([$gate, $gate.'.0', $gate.'.1'] as $file) {
            if (file_exists($file)) {
                unlink($file);
            }
        }
    }
})->group('mysql-concurrency');
