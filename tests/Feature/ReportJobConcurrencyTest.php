<?php

use App\Models\ReportJob;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;

test('simultaneous MySQL claimers cannot claim the same job or create two active jobs', function (int $queuedCount) {
    $database = 'jne_test_'.bin2hex(random_bytes(8));
    $base = config('database.connections.mysql');
    $original = config('database.default');
    config(['database.connections.jne_server' => [...$base, 'database' => null]]);
    DB::connection('jne_server')->statement('CREATE DATABASE '.$database);
    config(['database.connections.jne_test' => [...$base, 'database' => $database], 'database.default' => 'jne_test']);
    $gate = sys_get_temp_dir().DIRECTORY_SEPARATOR.$database;
    $processes = [];
    try {
        Artisan::call('migrate', ['--database' => 'jne_test', '--force' => true]);
        $jobs = ReportJob::factory()->count($queuedCount)->create();
        foreach ([0, 1] as $index) {
            $process = new Process([PHP_BINARY, base_path('tests/Feature/report-claim-worker.php'), $database, $gate, (string) $index], base_path(), ['APP_ENV' => 'testing']);
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
            expect($process->isSuccessful())->toBeTrue();
            $results[] = trim($process->getOutput());
        }
        sort($results);
        $expected = [(string) $jobs->first()->id, 'none'];
        sort($expected);
        expect($results)->toBe($expected);
        expect(ReportJob::where('status', 'RUNNING')->count())->toBe(1);
        expect(ReportJob::sum('attempt_count'))->toBe('1');
        expect(ReportJob::where('status', 'QUEUED')->count())->toBe($queuedCount - 1);
    } finally {
        foreach ($processes as $process) {
            if ($process->isRunning()) {
                $process->stop();
            }
        }
        config(['database.default' => $original]);
        DB::purge('jne_test');
        DB::connection('jne_server')->statement('DROP DATABASE '.$database);
        foreach ([$gate, $gate.'.0', $gate.'.1'] as $file) {
            if (file_exists($file)) {
                unlink($file);
            }
        }
    }
})->with([1, 2])->group('mysql-concurrency');

test('five simultaneous MySQL pool claimers reserve distinct jobs and slots', function () {
    $database = 'jne_pool_test_'.bin2hex(random_bytes(8));
    $base = config('database.connections.mysql');
    $original = config('database.default');
    config(['database.connections.jne_server' => [...$base, 'database' => 'mysql']]);
    DB::connection('jne_server')->statement('CREATE DATABASE '.$database);
    config(['database.connections.jne_test' => [...$base, 'database' => $database], 'database.default' => 'jne_test']);
    $gate = sys_get_temp_dir().DIRECTORY_SEPARATOR.$database;
    $processes = [];
    try {
        Artisan::call('migrate', ['--database' => 'jne_test', '--force' => true]);
        foreach (range(1, 8) as $index) {
            ReportJob::factory()->create(['customer_account' => 'POOL'.$index]);
        }
        foreach (range(1, 5) as $instance) {
            $process = new Process([PHP_BINARY, base_path('tests/Feature/report-claim-worker.php'), $database, $gate, (string) $instance, (string) $instance], base_path(), ['APP_ENV' => 'testing']);
            $process->setTimeout(30);
            $process->start();
            $processes[] = $process;
        }
        $deadline = microtime(true) + 15;
        while (count(array_filter(range(1, 5), fn ($instance) => file_exists($gate.'.'.$instance))) < 5 && microtime(true) < $deadline) {
            usleep(10000);
        }
        file_put_contents($gate, 'go');
        $results = [];
        foreach ($processes as $process) {
            $process->wait();
            expect($process->getErrorOutput())->toBe('');
            expect($process->isSuccessful())->toBeTrue();
            $results[] = trim($process->getOutput());
        }
        expect(array_unique($results))->toHaveCount(5)->not->toContain('none');
        expect(ReportJob::where('status', 'RUNNING')->count())->toBe(5);
        expect((int) ReportJob::sum('attempt_count'))->toBe(5);
        expect(ReportJob::whereNotNull('active_slot')->pluck('active_slot')->sort()->values()->all())->toBe([4, 5, 6, 7, 8]);
    } finally {
        foreach ($processes as $process) {
            if ($process->isRunning()) {
                $process->stop();
            }
        }
        config(['database.default' => $original]);
        DB::purge('jne_test');
        DB::connection('jne_server')->statement('DROP DATABASE '.$database);
        foreach ([$gate, ...array_map(fn ($instance) => $gate.'.'.$instance, range(1, 5))] as $file) {
            if (file_exists($file)) {
                unlink($file);
            }
        }
    }
})->group('mysql-concurrency');
