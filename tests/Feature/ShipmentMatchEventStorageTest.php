<?php

use App\Actions\Pickup\ReconcilePickupProcessing;
use App\Actions\Reports\ImportReportAwbs;
use App\Actions\Reports\ProjectJneShipments;
use App\Jobs\ImportJneReportAwbs;
use App\Jobs\QueueHistoricalPickupReconciliationsJob;
use App\Jobs\ReconcilePickupProcessingJob;
use App\Jobs\RenderPickupAwbManifestJob;
use App\Models\JneShipment;
use App\Models\ReportJob;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Database\Events\TransactionBeginning;
use Illuminate\Database\Events\TransactionCommitted;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\Process\Process;

require_once __DIR__.'/../Fixtures/pickup-automation.php';

test('isolated MySQL distinguishes legitimate audit changes from unchanged replay and legacy workers', function (int $size) {
    $port = (int) getenv('HARDENING_MYSQL_PORT');
    $legacy = getenv('STORAGE_LEGACY_CATEGORY_FILE');
    if (getenv('SHIPMENT_STORAGE_REPRO') !== '1' || $port !== 54182 || ! is_string($legacy) || ! is_file($legacy)) {
        $this->markTestSkipped('Explicit isolated storage investigation and historical fixture required.');
    }
    Http::preventStrayRequests();
    $reports = Storage::fake('shipment-storage-'.bin2hex(random_bytes(8)));
    Storage::set('jne_reports', $reports);
    Queue::fake([QueueHistoricalPickupReconciliationsJob::class, ReconcilePickupProcessingJob::class, RenderPickupAwbManifestJob::class]);
    $this->freezeTime();
    $settings = [...config('database.connections.mysql'), 'url' => null, 'host' => '127.0.0.1', 'port' => $port, 'username' => 'root', 'password' => '', 'database' => null];
    config(['database.connections.storage_server' => $settings]);
    expect(DB::connection('storage_server')->selectOne('select @@datadir as directory')->directory)->toContain('dust-hardening-mysql-');
    $database = 'hardening_storage_'.bin2hex(random_bytes(8));
    DB::connection('storage_server')->statement('CREATE DATABASE '.$database);
    config(['database.connections.storage_mysql' => [...$settings, 'database' => $database], 'database.default' => 'storage_mysql',
        'queue.default' => 'database', 'queue.connections.database.connection' => 'storage_mysql', 'queue.failed.database' => 'storage_mysql',
        'pickup.automation.enabled' => false, 'jne-reports.evidence_policies_enabled' => true,
        'jne-reports.category_reconciliation_enabled' => true, 'jne-reports.category_markers_enabled' => true]);
    $gate = sys_get_temp_dir().DIRECTORY_SEPARATOR.$database;
    $processes = [];
    $measurements = [];
    $active = false;
    $queries = 0;
    $starts = [];
    $transactionMs = 0;
    DB::listen(function (QueryExecuted $query) use (&$active, &$queries): void {
        if ($active) {
            $queries++;
        }
    });
    Event::listen(TransactionBeginning::class, function () use (&$active, &$starts): void {
        if ($active) {
            $starts[] = hrtime(true);
        }
    });
    Event::listen(TransactionCommitted::class, function () use (&$active, &$starts, &$transactionMs): void {
        if ($active && $starts !== []) {
            $start = array_pop($starts);
            if ($starts === []) {
                $transactionMs += (hrtime(true) - $start) / 1e6;
            }
        }
    });
    $measure = function (string $phase, callable $operation) use (&$active, &$queries, &$measurements, &$starts, &$transactionMs, $size): void {
        $before = DB::table('jne_shipment_match_events')->count();
        $queries = 0;
        $starts = [];
        $transactionMs = 0;
        $active = true;
        $started = hrtime(true);
        $operation();
        $duration = (hrtime(true) - $started) / 1e6;
        $active = false;
        $payload = DB::selectOne('SELECT COUNT(*) AS events, SUM(JSON_STORAGE_SIZE(evidence)) AS bytes, AVG(JSON_STORAGE_SIZE(evidence)) AS mean_bytes FROM jne_shipment_match_events');
        $measurements[] = ['phase' => $phase, 'events_before' => $before, 'events_after' => $payload->events,
            'new_events_per_awb' => ($payload->events - $before) / $size, 'queries' => $queries, 'duration_ms' => $duration,
            'committed_outer_transaction_ms' => $transactionMs, 'transaction_level_after' => DB::transactionLevel(),
            'total_binary_json_bytes' => $payload->bytes, 'mean_binary_json_bytes' => $payload->mean_bytes];
    };
    try {
        Artisan::call('migrate', ['--database' => 'storage_mysql', '--force' => true, '--no-interaction' => true]);
        $fixture = pickupAutomationFixture($size, 0);
        $csv = "AWB,ID_ACCOUNT,CUSTOMER_CODE,SHIPPER_NAME,TGL_ENTRY,PROCESS_TYPE\n";
        foreach (range(1, $size) as $number) {
            $csv .= 'STORAGE'.$number.',SIM_AUTO_ACCOUNT,4000,VANNY,'.now()->format('Y-m-d H:i:s').",MANUAL\n";
        }
        Storage::disk('jne_reports')->put('storage.csv', $csv);
        $report = ReportJob::factory()->create(['created_by' => $fixture['admin']->id, 'status' => 'COMPLETED', 'customer_account' => 'SIM_AUTO_ACCOUNT', 'report_mode' => 'A',
            'started_at' => now(), 'completed_at' => now(), 'file_path' => 'storage.csv', 'file_checksum' => hash('sha256', $csv)]);
        $measure('initial_import', fn () => app(ImportReportAwbs::class)->handle($report->id));
        $this->assertDatabaseCount('jne_shipment_match_events', 0);
        $measure('initial_projection', fn () => app(ProjectJneShipments::class)->handle($report->id));
        $this->assertDatabaseCount('jne_shipment_match_events', 2 * $size);
        $measure('same_report_import', fn () => app(ImportReportAwbs::class)->handle($report->id));
        $measure('same_projection', fn () => app(ProjectJneShipments::class)->handle($report->id));
        $measure('unchanged_reconciliation', fn () => app(ReconcilePickupProcessing::class)->handle($fixture['task']->id));
        $this->assertDatabaseCount('jne_shipment_match_events', 2 * $size);
        $newer = $report->replicate(['request_key', 'claim_key', 'active_slot', 'schedule_key']);
        $newer->fill(['started_at' => now()->addMinute(), 'import_status' => 'NOT_IMPORTED', 'projection_status' => 'NOT_PROJECTED'])->save();
        $measure('new_report_same_awbs', function () use ($newer): void {
            app(ImportReportAwbs::class)->handle($newer->id);
            app(ProjectJneShipments::class)->handle($newer->id);
        });
        $measure('older_report_replay', fn () => app(ProjectJneShipments::class)->handle($report->id));
        $measure('queue_retry_twice', function () use ($report): void {
            $fake = Queue::getFacadeRoot();
            Queue::swap($fake->queue);
            try {
                foreach ([1, 2] as $attempt) {
                    ImportJneReportAwbs::dispatch($report->id);
                    $this->assertDatabaseCount('jobs', 1);
                    $this->artisan('queue:work', ['connection' => 'database', '--once' => true, '--queue' => 'default', '--sleep' => 0, '--tries' => 1])->assertSuccessful();
                    $this->assertDatabaseCount('jobs', 0);
                    $this->assertDatabaseCount('failed_jobs', 0);
                }
            } finally {
                Queue::swap($fake);
            }
        });
        $stableEvents = DB::table('jne_shipment_match_events')->count();
        $measure('customer_deactivated_reconciliation', function () use ($fixture): void {
            $fixture['customer']->update(['is_active' => false]);
            app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
        });
        expect(DB::table('jne_shipment_match_events')->count())->toBeGreaterThan($stableEvents);
        $measure('customer_reactivated_reconciliation', function () use ($fixture): void {
            $fixture['customer']->update(['is_active' => true]);
            app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
        });
        $beforeChildren = DB::table('jne_shipment_match_events')->count();
        try {
            DB::transaction(function () use ($fixture): void {
                $fixture['customer']->update(['is_active' => false]);
                app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
                throw new RuntimeException('Injected storage rollback.');
            });
        } catch (RuntimeException $exception) {
            expect($exception->getMessage())->toBe('Injected storage rollback.');
        }
        expect(DB::table('jne_shipment_match_events')->count())->toBe($beforeChildren);
        expect($fixture['customer']->fresh()->is_active)->toBeTrue();
        file_put_contents($gate.'.json', json_encode(['port' => $port, 'database' => $database, 'gate' => $gate,
            'reports' => [$report->id, $newer->id], 'legacy_file' => $legacy, 'legacy_sha256' => hash_file('sha256', $legacy)], JSON_THROW_ON_ERROR));
        foreach ([0, 1] as $index) {
            $process = new Process([PHP_BINARY, __DIR__.'/shipment-storage-worker.php', $gate.'.json', 'projection', (string) $index], base_path(), ['APP_ENV' => 'testing', 'MAIL_MAILER' => 'array', 'MOBILE_PUSH_ENABLED' => 'false'], null, 180);
            $process->start();
            $processes[] = $process;
        }
        $deadline = microtime(true) + 15;
        while ((! is_file($gate.'.ready0') || ! is_file($gate.'.ready1')) && microtime(true) < $deadline) {
            usleep(10000);
        }
        expect(is_file($gate.'.ready0') && is_file($gate.'.ready1'))->toBeTrue();
        touch($gate.'.go');
        $children = [];
        foreach ($processes as $process) {
            $process->wait();
            expect($process->isSuccessful())->toBeTrue($process->getErrorOutput().$process->getOutput());
            $children[] = json_decode($process->getOutput(), true, flags: JSON_THROW_ON_ERROR);
        }
        expect(DB::table('jne_shipment_match_events')->count())->toBe($beforeChildren);
        $legacyProcess = new Process([PHP_BINARY, __DIR__.'/shipment-storage-worker.php', $gate.'.json', 'legacy', '0'], base_path(), ['APP_ENV' => 'testing', 'MAIL_MAILER' => 'array', 'MOBILE_PUSH_ENABLED' => 'false'], null, 180);
        $legacyProcess->mustRun();
        $legacyResult = json_decode($legacyProcess->getOutput(), true, flags: JSON_THROW_ON_ERROR);
        expect($legacyResult['events_after'] - $legacyResult['events_before'])->toBe(2 * $size);
        $measure('fresh_reconciliation_after_legacy', fn () => app(ReconcilePickupProcessing::class)->handle($fixture['task']->id));
        expect(DB::table('jne_shipment_match_events')->count())->toBe($legacyResult['events_after']);
        expect(JneShipment::where('latest_report_job_id', $newer->id)->count())->toBe($size);
        expect(JneShipment::where('customer_id', $fixture['customer']->id)->where('match_status', 'MATCHED')->count())->toBe($size);
        expect($fixture['task']->proof->fresh()->manual_hybrid)->toBe($size);
        $this->assertDatabaseCount('jne_shipment_observations', 2 * $size);
        $duplicates = DB::selectOne('SELECT SUM(n-1) AS duplicates FROM (SELECT COUNT(*) AS n FROM jne_shipment_match_events GROUP BY jne_shipment_id,method,previous_pickup_task_id,pickup_task_id,previous_customer_id,customer_id,match_status,customer_match_status,actor_id,reason,SHA2(CAST(evidence AS CHAR),256)) e');
        file_put_contents(base_path('docs/technical-audit/evidence/shipment-storage-reproduction.ndjson'), json_encode(['size' => $size, 'phases' => $measurements,
            'overlap' => $children, 'legacy' => $legacyResult, 'duplicates_including_legitimate_returns' => $duplicates->duplicates, 'rollback_preserved' => true], JSON_THROW_ON_ERROR).PHP_EOL, FILE_APPEND);
        Http::assertNothingSent();
    } finally {
        foreach ($processes as $process) {
            if ($process->isRunning()) {
                $process->stop(0);
            }
        }
        config(['database.default' => 'sqlite']);
        DB::purge('storage_mysql');
        DB::connection('storage_server')->statement('DROP DATABASE '.$database);
        foreach (glob($gate.'.*') ?: [] as $file) {
            if (is_file($file)) {
                unlink($file);
            }
        }
    }
})->with(['100 AWBs' => [100], '1000 AWBs' => [1000], '5000 AWBs' => [5000]])->group('shipment-storage');
