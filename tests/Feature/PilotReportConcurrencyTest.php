<?php

use App\Actions\Pickup\ReconcilePickupProcessing;
use App\Actions\Reports\ImportReportAwbs;
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

test('two MySQL projectors preserve observations snapshot ordering and reconciliation under overlap', function (int $size) {
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
        foreach ([0, 1] as $index) {
            $report = ReportJob::factory()->create(['created_by' => $fixture['admin']->id, 'status' => 'COMPLETED', 'customer_account' => 'SIM_AUTO_ACCOUNT', 'started_at' => now()->addMinutes($index),
                'file_path' => 'concurrent.csv', 'file_checksum' => hash('sha256', $csv)]);
            app(ImportReportAwbs::class)->handle($report->id);
            $reports[] = $report->id;
        }
        file_put_contents($gate.'.json', json_encode(['port' => $port, 'database' => $database, 'gate' => $gate, 'reports' => $reports], JSON_THROW_ON_ERROR));
        $before = DB::select("SELECT NAME, COUNT FROM information_schema.INNODB_METRICS WHERE NAME IN ('lock_deadlocks', 'lock_timeouts')");
        foreach ([0, 1] as $index) {
            $process = new Process([PHP_BINARY, __DIR__.'/pilot-report-worker.php', $gate.'.json', (string) $index], base_path(), ['APP_ENV' => 'testing', 'MAIL_MAILER' => 'array', 'MOBILE_PUSH_ENABLED' => 'false'], null, 180);
            $process->start();
            $processes[] = $process;
        }
        $deadline = microtime(true) + 15;
        while ((! file_exists($gate.'.ready0') || ! file_exists($gate.'.ready1')) && microtime(true) < $deadline) {
            usleep(10000);
        }
        expect(file_exists($gate.'.ready0') && file_exists($gate.'.ready1'))->toBeTrue();
        $started = hrtime(true);
        touch($gate.'.go');
        $lockSamples = [];
        while ($processes[0]->isRunning() || $processes[1]->isRunning()) {
            $sample = DB::connection('pilot_server')->select('SELECT OBJECT_NAME, INDEX_NAME, LOCK_TYPE, LOCK_MODE, LOCK_STATUS, COUNT(*) AS locks FROM performance_schema.data_locks WHERE OBJECT_SCHEMA = ? GROUP BY OBJECT_NAME, INDEX_NAME, LOCK_TYPE, LOCK_MODE, LOCK_STATUS', [$database]);
            if (count($lockSamples) < 6 || collect($sample)->contains('LOCK_STATUS', 'WAITING')) {
                $lockSamples[] = $sample;
            }
            usleep(250000);
            if ((hrtime(true) - $started) / 1e9 > 175) {
                throw new RuntimeException('Concurrent fixture deadline exceeded.');
            }
        }
        $duration = (hrtime(true) - $started) / 1e6;
        $results = [];
        foreach ($processes as $process) {
            $process->wait();
            expect($process->getErrorOutput())->toBe('');
            expect($process->isSuccessful())->toBeTrue($process->getOutput());
            $results[] = json_decode($process->getOutput(), true, flags: JSON_THROW_ON_ERROR);
        }
        expect(ReportJob::whereIn('id', $reports)->where('projection_status', 'PROJECTED')->count())->toBe(2);
        $this->assertDatabaseCount('jne_shipments', $size);
        $this->assertDatabaseCount('jne_shipment_observations', 2 * $size);
        expect(JneShipment::where('latest_report_job_id', $reports[1])->count())->toBe($size);
        expect(app(ReconcilePickupProcessing::class)->handle($fixture['task']->id)->status)->toBe('DONE');
        $manifestIds = DB::table('pickup_awb_manifests')->pluck('id')->all();
        $eventCount = DB::table('jne_shipment_match_events')->count();
        expect(app(ReconcilePickupProcessing::class)->handle($fixture['task']->id)->status)->toBe('DONE');
        expect(DB::table('pickup_awb_manifests')->pluck('id')->all())->toBe($manifestIds);
        expect(DB::table('jne_shipment_match_events')->count())->toBe($eventCount);
        $measurement = ['size' => $size, 'pair_duration_ms' => $duration, 'workers' => $results, 'locks_before' => $before,
            'locks_after' => DB::select("SELECT NAME, COUNT FROM information_schema.INNODB_METRICS WHERE NAME IN ('lock_deadlocks', 'lock_timeouts')"), 'lock_samples' => $lockSamples];
        file_put_contents(base_path('docs/technical-audit/evidence/m6-concurrency.ndjson'), json_encode($measurement, JSON_THROW_ON_ERROR).PHP_EOL, FILE_APPEND);
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
})->with([1000, 5000])->group('pilot-concurrency');
