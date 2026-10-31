<?php

use App\Jobs\ReconcilePickupProcessingJob;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Symfony\Component\Process\Process;

require_once __DIR__.'/../Fixtures/cross-customer-locking.php';

test('isolated reconciliation recovers a terminated transaction and overlapping expired queue lease', function () {
    if (getenv('CROSS_LOCKING') !== '1' || (int) getenv('HARDENING_MYSQL_PORT') !== 54184) {
        $this->markTestSkipped('Explicit disposable MySQL queue fixture required.');
    }
    Http::preventStrayRequests();
    Queue::fake();
    $this->travelTo('2026-10-29 08:00:00 UTC');
    $setup = crossLockDatabase();
    $database = $setup['database'];
    $gate = sys_get_temp_dir().DIRECTORY_SEPARATOR.$database;
    $processes = [];
    try {
        $fixture = crossLockFixture(20);
        config(['cache.default' => 'database', 'queue.connections.database.retry_after' => 2]);
        $fake = Queue::getFacadeRoot();
        Queue::swap($fake->queue);
        ReconcilePickupProcessingJob::dispatch($fixture['tasks'][0][0]);
        $this->assertDatabaseCount('jobs', 1);
        $payload = ['port' => 54184, 'database' => $database, 'gate' => $gate, 'tasks' => $fixture['tasks']];
        file_put_contents($gate.'.json', json_encode($payload, JSON_THROW_ON_ERROR));
        $start = function (int $index) use ($gate): Process {
            $process = new Process([PHP_BINARY, __DIR__.'/cross-customer-worker.php', $gate.'.json', (string) $index, 'queue'], base_path(),
                ['APP_ENV' => 'testing', 'MAIL_MAILER' => 'array', 'MOBILE_PUSH_ENABLED' => 'false'], null, 45);
            $process->start();

            return $process;
        };
        $processes[] = $first = $start(0);
        $deadline = microtime(true) + 20;
        while (! is_file($gate.'.paused') && $first->isRunning() && microtime(true) < $deadline) {
            usleep(50000);
        }
        expect(is_file($gate.'.paused'))->toBeTrue($first->getOutput().$first->getErrorOutput());
        $reserved = DB::table('jobs')->first(['id', 'attempts', 'reserved_at']);
        expect($reserved->attempts)->toBe(1);
        $deadline = microtime(true) + 5;
        while (time() <= $reserved->reserved_at + 2 && microtime(true) < $deadline) {
            usleep(100000);
        }
        $runningPastTimeout = $first->isRunning();
        if (PHP_OS_FAMILY === 'Windows') {
            expect($runningPastTimeout)->toBeTrue();
        }
        $processes[] = $second = $start(1);
        $deadline = microtime(true) + 12;
        do {
            $duplicate = DB::table('jobs')->where('id', $reserved->id)->first(['attempts', 'reserved_at']);
            if ($duplicate && $duplicate->attempts >= 2) {
                break;
            }
            usleep(50000);
        } while ($second->isRunning() && microtime(true) < $deadline);
        expect($duplicate?->attempts)->toBe(2);
        expect($first->isRunning())->toBeTrue();
        $first->stop(0);
        $second->wait();
        expect($second->isSuccessful())->toBeTrue($second->getOutput().$second->getErrorOutput());
        $this->assertDatabaseCount('jobs', 0);
        $this->assertDatabaseCount('failed_jobs', 0);
        $eventCount = DB::table('jne_shipment_match_events')->count();
        ReconcilePickupProcessingJob::dispatch($fixture['tasks'][0][0]);
        $this->assertDatabaseCount('jobs', 1);
        $processes[] = $replay = $start(2);
        $replay->wait();
        expect($replay->isSuccessful())->toBeTrue($replay->getOutput().$replay->getErrorOutput());
        $this->assertDatabaseCount('jobs', 0);
        $this->assertDatabaseCount('jne_shipment_match_events', $eventCount);
        file_put_contents(base_path('docs/technical-audit/evidence/cross-lock-queue-lease.json'), json_encode([
            'engine' => 'MySQL 8.4.11', 'fixture_retry_after_seconds' => 2, 'worker_timeout_seconds' => 1, 'host' => PHP_OS_FAMILY,
            'first_still_running_after_timeout' => $runningPastTimeout, 'overlapping_reservation_attempts' => $duplicate->attempts,
            'forced_termination' => 'isolated fixture child only', 'second' => json_decode($second->getOutput(), true), 'replay' => json_decode($replay->getOutput(), true),
            'queue_empty_after' => DB::table('jobs')->count() === 0, 'failed_jobs' => DB::table('failed_jobs')->count(), 'replay_event_growth' => DB::table('jne_shipment_match_events')->count() - $eventCount,
        ], JSON_THROW_ON_ERROR));
        Queue::swap($fake);
        Http::assertNothingSent();
    } finally {
        foreach ($processes as $process) {
            if ($process->isRunning()) {
                $process->stop(0);
            }
        }
        config(['database.default' => 'sqlite']);
        DB::purge('cross_mysql');
        DB::purge('cross_observer');
        DB::connection('cross_server')->statement('DROP DATABASE '.$database);
    }
})->group('cross-customer-locking');
