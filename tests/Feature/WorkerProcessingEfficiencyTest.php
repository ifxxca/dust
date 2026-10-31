<?php

use App\Actions\Pickup\QueuePickupReconciliations;
use App\Actions\Pickup\ReconcilePickupProcessing;
use App\Actions\Reports\ImportReportAwbs;
use App\Actions\Reports\MatchJneShipments;
use App\Actions\Reports\ProjectJneShipments;
use App\Actions\Reports\ResolveJneCategories;
use App\Jobs\QueueHistoricalPickupReconciliationsJob;
use App\Jobs\ReconcilePickupProcessingJob;
use App\Jobs\RenderPickupAwbManifestJob;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\ReportJob;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\Process\Process;

require_once __DIR__.'/../Fixtures/pickup-automation.php';
require_once __DIR__.'/../Fixtures/processing-efficiency.php';

test('native MySQL measures replay cost without losing late evidence or finalized baselines', function (int $size) {
    if (getenv('WORKER_EFFICIENCY') !== '1' || (int) getenv('HARDENING_MYSQL_PORT') !== 54183) {
        $this->markTestSkipped('Explicit disposable worker efficiency infrastructure required.');
    }
    Http::preventStrayRequests();
    $this->travelTo('2026-10-29 08:00:00 UTC');
    Queue::fake([QueueHistoricalPickupReconciliationsJob::class, ReconcilePickupProcessingJob::class, RenderPickupAwbManifestJob::class]);
    Storage::set('jne_reports', Storage::fake('efficiency-'.bin2hex(random_bytes(8))));
    $settings = [...config('database.connections.mysql'), 'url' => null, 'host' => '127.0.0.1', 'port' => 54183, 'username' => 'root', 'password' => '', 'database' => null];
    config(['database.connections.eff_server' => $settings]);
    expect(DB::connection('eff_server')->selectOne('SELECT @@port AS port,@@datadir AS directory')->directory)->toContain('dust-hardening-mysql-eff-');
    $database = 'hardening_eff_'.bin2hex(random_bytes(8));
    DB::connection('eff_server')->statement('CREATE DATABASE '.$database);
    config(['database.connections.eff_mysql' => [...$settings, 'database' => $database],
        'database.connections.eff_observer' => [...$settings, 'database' => $database], 'database.default' => 'eff_mysql',
        'queue.default' => 'database', 'queue.connections.database.connection' => 'eff_mysql', 'queue.failed.database' => 'eff_mysql',
        'pickup.automation.enabled' => false, 'jne-reports.evidence_policies_enabled' => true,
        'jne-reports.category_reconciliation_enabled' => true, 'jne-reports.category_markers_enabled' => false]);
    $processes = [];
    $gate = sys_get_temp_dir().DIRECTORY_SEPARATOR.$database;
    $output = base_path('docs/technical-audit/evidence/worker-efficiency-workloads.ndjson');
    $record = function (array $row) use ($size, $output): void {
        file_put_contents($output, json_encode(['size' => $size, 'engine' => 'MySQL 8.0.30', ...$row], JSON_THROW_ON_ERROR).PHP_EOL, FILE_APPEND);
    };
    try {
        Artisan::call('migrate', ['--database' => 'eff_mysql', '--force' => true, '--no-interaction' => true]);
        $fixture = pickupAutomationFixture($size, 0);
        $csv = "AWB,ID_ACCOUNT,CUSTOMER_CODE,SHIPPER_NAME,TGL_ENTRY,PROCESS_TYPE,STATUS_WEB\n";
        foreach (range(1, $size) as $number) {
            $csv .= 'EFF'.$number.",SIM_AUTO_ACCOUNT,4000,VANNY,2026-10-29 10:00:00,MANUAL,ON PROCESS\n";
        }
        Storage::disk('jne_reports')->put('eff.csv', $csv);
        $report = fn (int $minute): ReportJob => ReportJob::factory()->create(['created_by' => $fixture['admin']->id, 'status' => 'COMPLETED', 'customer_account' => 'SIM_AUTO_ACCOUNT', 'report_mode' => 'A',
            'date_from' => '2026-10-29', 'date_thru' => '2026-10-29', 'started_at' => now()->addMinutes($minute), 'completed_at' => now()->addMinutes(max(0, $minute)),
            'file_path' => 'eff.csv', 'file_checksum' => hash('sha256', $csv)]);
        $first = $report(0);
        $measure = processingEfficiencyProbe();
        $run = function (string $phase, callable $action) use ($measure, $record): array {
            $row = $measure($phase, $action);
            $record($row);
            expect($row['transaction_level_after'])->toBe(0);

            return $row;
        };
        $run('first_import', fn () => app(ImportReportAwbs::class)->handle($first->id));
        $run('first_projection', fn () => app(ProjectJneShipments::class)->handle($first->id));
        $run('initial_reconciliation', fn () => app(ReconcilePickupProcessing::class)->handle($fixture['task']->id));
        foreach ([1, 2] as $repeat) {
            expect($run('same_import_'.$repeat, fn () => app(ImportReportAwbs::class)->handle($first->id))['events_created'])->toBe(0);
            expect($run('same_projection_'.$repeat, fn () => app(ProjectJneShipments::class)->handle($first->id))['events_created'])->toBe(0);
            expect($run('unchanged_reconciliation_'.$repeat, fn () => app(ReconcilePickupProcessing::class)->handle($fixture['task']->id))['events_created'])->toBe(0);
        }
        $sources = JneReportAwb::where('report_job_id', $first->id)->get();
        $run('matching_candidates_only', fn () => app(MatchJneShipments::class)->candidates($sources));
        $run('category_resolution_only', fn () => app(ResolveJneCategories::class)->handle(JneShipment::orderBy('id')->get()));
        $second = $report(1);
        $run('new_evidence_import', fn () => app(ImportReportAwbs::class)->handle($second->id));
        $changed = $run('new_evidence_projection', fn () => app(ProjectJneShipments::class)->handle($second->id));
        expect($changed['events_created'])->toBe($size);
        $late = $report(-1);
        $run('late_report_import', fn () => app(ImportReportAwbs::class)->handle($late->id));
        $lateResult = $run('late_report_projection', fn () => app(ProjectJneShipments::class)->handle($late->id));
        expect($lateResult['events_created'])->toBe($size);
        expect(JneShipment::where('latest_report_job_id', $second->id)->count())->toBe($size);
        foreach ([1, 2] as $repeat) {
            $this->travel(6)->minutes();
            $row = $run('scheduled_queue_reconciliation_'.$repeat, function () use ($fixture): void {
                $fake = Queue::getFacadeRoot();
                Queue::swap($fake->queue);
                Queue::fake([QueueHistoricalPickupReconciliationsJob::class, RenderPickupAwbManifestJob::class]);
                app('queue.worker')->setManager($fake->queue);
                try {
                    config(['pickup.automation.enabled' => true]);
                    app(QueuePickupReconciliations::class)->handle([$fixture['task']->id], invalidate: false);
                    config(['pickup.automation.enabled' => false]);
                    $this->assertDatabaseCount('jobs', 1);
                    $this->artisan('queue:work', ['connection' => 'database', '--once' => true, '--sleep' => 0, '--queue' => 'reconciliation', '--tries' => 1])->assertSuccessful();
                    expect(DB::table('jobs')->count())->toBe(0, json_encode(DB::table('jobs')->get(['id', 'queue', 'attempts', 'reserved_at', 'available_at'])->all(), JSON_THROW_ON_ERROR));
                    $this->assertDatabaseCount('failed_jobs', 0);
                } finally {
                    config(['pickup.automation.enabled' => false]);
                    Queue::swap($fake);
                }
            });
            expect($row['events_created'])->toBe(0);
        }
        $reports = [];
        foreach ([20, 21] as $minute) {
            $job = $report($minute);
            app(ImportReportAwbs::class)->handle($job->id);
            $reports[] = $job->id;
        }
        file_put_contents($gate.'.json', json_encode(['port' => 54183, 'database' => $database, 'gate' => $gate, 'reports' => $reports], JSON_THROW_ON_ERROR));
        foreach ([0, 1] as $index) {
            $process = new Process([PHP_BINARY, __DIR__.'/efficiency-processing-worker.php', $gate.'.json', (string) $index], base_path(),
                ['APP_ENV' => 'testing', 'MAIL_MAILER' => 'array', 'MOBILE_PUSH_ENABLED' => 'false'], null, 240);
            $process->start();
            $processes[] = $process;
        }
        $deadline = microtime(true) + 20;
        while ((! is_file($gate.'.ready0') || ! is_file($gate.'.ready1')) && microtime(true) < $deadline) {
            usleep(10000);
        }
        expect(is_file($gate.'.ready0') && is_file($gate.'.ready1'))->toBeTrue();
        $pairStart = hrtime(true);
        touch($gate.'.go');
        $waits = [];
        while (collect($processes)->contains(fn (Process $process): bool => $process->isRunning())) {
            $sample = DB::connection('eff_observer')->select('SELECT r.OBJECT_NAME,r.INDEX_NAME,r.LOCK_MODE,r.LOCK_DATA,w.REQUESTING_THREAD_ID,w.BLOCKING_THREAD_ID FROM performance_schema.data_lock_waits w JOIN performance_schema.data_locks r ON r.ENGINE_LOCK_ID=w.REQUESTING_ENGINE_LOCK_ID AND r.ENGINE=w.ENGINE WHERE r.OBJECT_SCHEMA=?', [$database]);
            if ($sample !== [] && count($waits) < 150) {
                $waits[] = ['pair_elapsed_ms' => (hrtime(true) - $pairStart) / 1e6, 'edges' => $sample];
            }
            usleep(250000);
            if ((hrtime(true) - $pairStart) / 1e9 > 230) {
                throw new RuntimeException('Isolated overlap deadline exceeded.');
            }
        }
        $children = [];
        foreach ($processes as $process) {
            $process->wait();
            expect($process->getErrorOutput())->toBe('');
            expect($process->isSuccessful())->toBeTrue($process->getOutput());
            $children[] = json_decode($process->getOutput(), true, flags: JSON_THROW_ON_ERROR);
        }
        $record(['phase' => 'two_overlapping_new_reports', 'duration_ms' => (hrtime(true) - $pairStart) / 1e6, 'workers' => $children, 'lock_wait_samples' => $waits]);
        expect(ReportJob::whereIn('id', $reports)->where('projection_status', 'PROJECTED')->count())->toBe(2);
        expect(JneShipment::where('latest_report_job_id', $reports[1])->count())->toBe($size);
        $this->assertDatabaseCount('jne_shipment_observations', 5 * $size);
        expect($fixture['task']->proof->effectiveValues()['manual_hybrid'])->toBe($size);
        Http::assertNothingSent();
    } finally {
        foreach ($processes as $process) {
            if ($process->isRunning()) {
                $process->stop(0);
            }
        }
        config(['database.default' => 'sqlite']);
        DB::purge('eff_mysql');
        DB::purge('eff_observer');
        DB::connection('eff_server')->statement('DROP DATABASE '.$database);
    }
})->with([100, 1000, 5000])->group('worker-efficiency');
