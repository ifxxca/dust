<?php

use App\Actions\Pickup\ReconcilePickupProcessing;
use App\Actions\Reports\ImportReportAwbs;
use App\Actions\Reports\ProjectJneShipments;
use App\Jobs\ReconcilePickupProcessingJob;
use App\Jobs\RenderPickupAwbManifestJob;
use App\Models\JneShipment;
use App\Models\ReportJob;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\Process\Process;

require_once __DIR__.'/../Fixtures/pickup-automation.php';

test('overlapping MySQL projectors preserve observations snapshot ordering and reconciliation', function (int $size, int $workerCount) {
    $port = (int) getenv('HARDENING_MYSQL_PORT');
    if (getenv('PILOT_CONCURRENCY') !== '1' || $port < 1024) {
        $this->markTestSkipped('Opt-in disposable MySQL concurrency workload.');
    }
    Http::preventStrayRequests();
    Storage::fake('jne_reports');
    Queue::fake([ReconcilePickupProcessingJob::class, RenderPickupAwbManifestJob::class]);
    $this->travelTo('2026-10-27 08:00:00 UTC');
    config(['pickup.automation.enabled' => false, 'jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => true]);
    $settings = [...config('database.connections.mysql'), 'url' => null, 'host' => '127.0.0.1', 'port' => $port, 'username' => 'root', 'password' => '', 'database' => null];
    config(['database.connections.pilot_server' => $settings]);
    expect(DB::connection('pilot_server')->selectOne('select @@datadir as directory')->directory)->toContain('dust-hardening-mysql-');
    $database = 'hardening_pilot_'.bin2hex(random_bytes(8));
    DB::connection('pilot_server')->statement('CREATE DATABASE `'.$database.'`');
    config(['database.connections.pilot_mysql' => [...$settings, 'database' => $database], 'database.default' => 'pilot_mysql']);
    $gate = sys_get_temp_dir().DIRECTORY_SEPARATOR.$database;
    $processes = [];
    try {
        Artisan::call('migrate', ['--database' => 'pilot_mysql', '--force' => true, '--no-interaction' => true]);
        $fixture = pickupAutomationFixture($size, 0);
        $csv = "AWB,ID_ACCOUNT,CUSTOMER_CODE,SHIPPER_NAME,TGL_ENTRY,PROCESS_TYPE\n";
        foreach (range(1, $size) as $number) {
            $csv .= 'PILOT'.$number.",SIM_AUTO_ACCOUNT,4000,VANNY,2026-10-27 10:00:00,MANUAL\n";
        }
        Storage::disk('jne_reports')->put('concurrent.csv', $csv);
        $reports = [];
        foreach (range(0, $workerCount - 1) as $index) {
            $report = ReportJob::factory()->create(['created_by' => $fixture['admin']->id, 'status' => 'COMPLETED', 'customer_account' => 'SIM_AUTO_ACCOUNT', 'started_at' => now()->addMinutes($index),
                'file_path' => 'concurrent.csv', 'file_checksum' => hash('sha256', $csv)]);
            app(ImportReportAwbs::class)->handle($report->id);
            $reports[] = $report->id;
        }
        file_put_contents($gate.'.json', json_encode(['port' => $port, 'database' => $database, 'gate' => $gate, 'reports' => $reports], JSON_THROW_ON_ERROR));
        $before = DB::select("SELECT NAME, COUNT FROM information_schema.INNODB_METRICS WHERE NAME IN ('lock_deadlocks', 'lock_timeouts')");
        foreach (range(0, $workerCount - 1) as $index) {
            $process = new Process([PHP_BINARY, __DIR__.'/pilot-report-worker.php', $gate.'.json', (string) $index], base_path(), ['APP_ENV' => 'testing', 'MAIL_MAILER' => 'array', 'MOBILE_PUSH_ENABLED' => 'false'], null, 180);
            $process->start();
            $processes[] = $process;
        }
        $deadline = microtime(true) + 15;
        while (collect(range(0, $workerCount - 1))->contains(fn (int $index): bool => ! file_exists($gate.'.ready'.$index)) && microtime(true) < $deadline) {
            usleep(10000);
        }
        expect(collect(range(0, $workerCount - 1))->every(fn (int $index): bool => file_exists($gate.'.ready'.$index)))->toBeTrue();
        $started = hrtime(true);
        touch($gate.'.go');
        $lockSamples = [];
        $waitSamples = [];
        while (collect($processes)->contains(fn (Process $process): bool => $process->isRunning())) {
            $sample = DB::connection('pilot_server')->select('SELECT OBJECT_NAME, INDEX_NAME, LOCK_TYPE, LOCK_MODE, LOCK_STATUS, COUNT(*) AS locks FROM performance_schema.data_locks WHERE OBJECT_SCHEMA = ? GROUP BY OBJECT_NAME, INDEX_NAME, LOCK_TYPE, LOCK_MODE, LOCK_STATUS', [$database]);
            if (count($lockSamples) < 6 || collect($sample)->contains('LOCK_STATUS', 'WAITING')) {
                $lockSamples[] = $sample;
            }
            $waits = DB::connection('pilot_server')->select(<<<'SQL'
                SELECT w.REQUESTING_ENGINE_TRANSACTION_ID AS waiting_trx_id,
                    w.BLOCKING_ENGINE_TRANSACTION_ID AS blocking_trx_id,
                    r.OBJECT_NAME AS table_name, r.INDEX_NAME AS index_name,
                    r.LOCK_TYPE AS lock_type, r.LOCK_MODE AS waiting_mode, b.LOCK_MODE AS blocking_mode,
                    r.LOCK_DATA AS waiting_key, b.LOCK_DATA AS blocking_key,
                    rt.trx_mysql_thread_id AS waiting_connection, bt.trx_mysql_thread_id AS blocking_connection,
                    rt.trx_started AS waiting_started, bt.trx_started AS blocking_started,
                    rt.trx_wait_started AS wait_started,
                    TIMESTAMPDIFF(MICROSECOND, rt.trx_started, NOW(6)) / 1000000 AS waiting_age_seconds,
                    TIMESTAMPDIFF(MICROSECOND, bt.trx_started, NOW(6)) / 1000000 AS blocking_age_seconds,
                    TIMESTAMPDIFF(MICROSECOND, rt.trx_wait_started, NOW(6)) / 1000000 AS wait_age_seconds,
                    rt.trx_state AS waiting_state, bt.trx_state AS blocking_state,
                    rt.trx_rows_locked AS waiting_rows_locked, bt.trx_rows_locked AS blocking_rows_locked,
                    rt.trx_rows_modified AS waiting_rows_modified, bt.trx_rows_modified AS blocking_rows_modified,
                    rt.trx_isolation_level AS isolation_level,
                    COALESCE(rs.DIGEST_TEXT, rt.trx_query) AS waiting_sql,
                    COALESCE(bs.DIGEST_TEXT, bt.trx_query) AS blocking_sql
                FROM performance_schema.data_lock_waits w
                JOIN performance_schema.data_locks r ON r.ENGINE_LOCK_ID = w.REQUESTING_ENGINE_LOCK_ID AND r.ENGINE = w.ENGINE
                JOIN performance_schema.data_locks b ON b.ENGINE_LOCK_ID = w.BLOCKING_ENGINE_LOCK_ID AND b.ENGINE = w.ENGINE
                LEFT JOIN information_schema.innodb_trx rt ON rt.trx_id = w.REQUESTING_ENGINE_TRANSACTION_ID
                LEFT JOIN information_schema.innodb_trx bt ON bt.trx_id = w.BLOCKING_ENGINE_TRANSACTION_ID
                LEFT JOIN performance_schema.events_statements_current rs ON rs.THREAD_ID = w.REQUESTING_THREAD_ID
                LEFT JOIN performance_schema.events_statements_current bs ON bs.THREAD_ID = w.BLOCKING_THREAD_ID
                WHERE r.OBJECT_SCHEMA = ?
                SQL, [$database]);
            if ($waits !== []) {
                $waitSamples[] = ['elapsed_ms' => (hrtime(true) - $started) / 1e6, 'edges' => $waits];
            }
            usleep(250000);
            if ((hrtime(true) - $started) / 1e9 > 175) {
                throw new RuntimeException('Concurrent fixture deadline exceeded.');
            }
        }
        $duration = (hrtime(true) - $started) / 1e6;
        $results = [];
        $rawWorkers = [];
        foreach ($processes as $process) {
            $process->wait();
            $rawWorkers[] = ['exit_code' => $process->getExitCode(), 'stdout' => $process->getOutput(), 'stderr' => $process->getErrorOutput()];
        }
        file_put_contents(base_path('docs/technical-audit/evidence/m7-concurrency-attempts.ndjson'), json_encode([
            'database' => $database, 'size' => $size, 'worker_count' => $workerCount, 'duration_ms' => $duration,
            'reports' => $reports, 'wait_samples' => $waitSamples, 'workers' => $rawWorkers,
        ], JSON_THROW_ON_ERROR).PHP_EOL, FILE_APPEND);
        foreach ($processes as $process) {
            expect($process->getErrorOutput())->toBe('');
            expect($process->isSuccessful())->toBeTrue($process->getOutput());
            $results[] = json_decode($process->getOutput(), true, flags: JSON_THROW_ON_ERROR);
        }
        expect(ReportJob::whereIn('id', $reports)->where('projection_status', 'PROJECTED')->count())->toBe($workerCount);
        $this->assertDatabaseCount('jne_shipments', $size);
        $this->assertDatabaseCount('jne_shipment_observations', $workerCount * $size);
        expect(JneShipment::where('latest_report_job_id', $reports[$workerCount - 1])->count())->toBe($size);
        $projectionEvents = DB::table('jne_shipment_match_events')->count();
        app(ProjectJneShipments::class)->handle($reports[0]);
        $this->assertDatabaseCount('jne_shipment_observations', $workerCount * $size);
        expect(JneShipment::where('latest_report_job_id', $reports[$workerCount - 1])->count())->toBe($size);
        expect(DB::table('jne_shipment_match_events')->count())->toBe($projectionEvents);
        expect($waitSamples)->not->toBeEmpty();
        expect(app(ReconcilePickupProcessing::class)->handle($fixture['task']->id)->status)->toBe('DONE');
        $manifestIds = DB::table('pickup_awb_manifests')->pluck('id')->all();
        $eventCount = DB::table('jne_shipment_match_events')->count();
        expect(app(ReconcilePickupProcessing::class)->handle($fixture['task']->id)->status)->toBe('DONE');
        expect(DB::table('pickup_awb_manifests')->pluck('id')->all())->toBe($manifestIds);
        expect(DB::table('jne_shipment_match_events')->count())->toBe($eventCount);
        $measurement = ['size' => $size, 'worker_count' => $workerCount, 'reports' => $reports, 'pickup_task_id' => $fixture['task']->id, 'pair_duration_ms' => $duration, 'workers' => $results, 'locks_before' => $before,
            'locks_after' => DB::select("SELECT NAME, COUNT FROM information_schema.INNODB_METRICS WHERE NAME IN ('lock_deadlocks', 'lock_timeouts')"), 'lock_samples' => $lockSamples, 'wait_samples' => $waitSamples];
        file_put_contents(base_path('docs/technical-audit/evidence/'.(getenv('M7_CONCURRENCY_TAG') === 'repeat' ? 'm7-concurrency-repeat' : 'm7-concurrency').'.ndjson'), json_encode($measurement, JSON_THROW_ON_ERROR).PHP_EOL, FILE_APPEND);
        Http::assertNothingSent();
    } finally {
        foreach ($processes as $process) {
            if ($process->isRunning()) {
                $process->stop(0);
            }
        }
        config(['database.default' => 'sqlite']);
        DB::purge('pilot_mysql');
        DB::connection('pilot_server')->statement('DROP DATABASE `'.$database.'`');
        foreach (glob($gate.'.*') ?: [] as $file) {
            if (is_file($file)) {
                unlink($file);
            }
        }
    }
})->with(['1000 / two' => [1000, 2], '5000 / two' => [5000, 2], '5000 / three' => [5000, 3]])->group('pilot-concurrency');
