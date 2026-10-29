<?php

use App\Actions\Pickup\QueuePickupReconciliations;
use App\Actions\Pickup\ReconcilePickupProcessing;
use App\Actions\Reports\ImportReportAwbs;
use App\Actions\Reports\ProjectJneShipments;
use App\Actions\Reports\ResolveJneCustomerCodes;
use App\Http\Middleware\HandleInertiaRequests;
use App\Jobs\QueueHistoricalPickupReconciliationsJob;
use App\Jobs\ReconcilePickupProcessingJob;
use App\Jobs\RenderPickupAwbManifestJob;
use App\Models\Customer;
use App\Models\JneReportAwb;
use App\Models\PickupProcessingReconciliation;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\ReportJob;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Database\Events\TransactionBeginning;
use Illuminate\Database\Events\TransactionCommitted;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;

require_once __DIR__.'/../Fixtures/pickup-automation.php';

test('disposable MySQL profiles report history reconciliation lookup and bounded producers', function (int $size) {
    $port = (int) getenv('HARDENING_MYSQL_PORT');
    if (getenv('VALIDATION_LOAD') !== '1' || $port < 1024) {
        $this->markTestSkipped('Opt-in disposable MySQL workload measurement.');
    }
    Http::preventStrayRequests();
    Queue::fake([RenderPickupAwbManifestJob::class, ReconcilePickupProcessingJob::class, QueueHistoricalPickupReconciliationsJob::class]);
    Storage::fake('jne_reports');
    $this->travelTo('2026-10-27 08:00:00 UTC');
    config(['pickup.automation.enabled' => false, 'jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => true]);
    $settings = [...config('database.connections.mysql'), 'url' => null, 'host' => '127.0.0.1', 'port' => $port, 'username' => 'root', 'password' => '', 'database' => null];
    config(['database.connections.validation_server' => $settings]);
    expect(DB::connection('validation_server')->selectOne('select @@datadir as directory')->directory)->toContain('dust-hardening-mysql-');
    $database = 'hardening_validation_'.bin2hex(random_bytes(8));
    DB::connection('validation_server')->statement('CREATE DATABASE `'.$database.'`');
    config(['database.connections.validation_mysql' => [...$settings, 'database' => $database], 'database.default' => 'validation_mysql']);
    try {
        Artisan::call('migrate', ['--database' => 'validation_mysql', '--force' => true, '--no-interaction' => true]);
        $active = null;
        $stats = [];
        $transactionStarts = [];
        $fingerprints = [];
        $profile = getenv('M6_PROFILE_TAG');
        DB::listen(function (QueryExecuted $event) use (&$active, &$stats, &$fingerprints, $profile): void {
            if ($active !== null) {
                $stats['queries']++;
                $stats['selects'] += str_starts_with(strtolower($event->sql), 'select') ? 1 : 0;
                $stats['pending_selects'] += preg_match('/^select .*from [`"]pickup_pending_items\b/is', $event->sql) === 1 ? 1 : 0;
                $stats['max_query_ms'] = max($stats['max_query_ms'], $event->time);
                $stats['sql_ms'] += $event->time;
                if ($profile) {
                    $sql = preg_replace('/\?(?:,\s*\?)+/', '?list', $event->sql);
                    $key = hash('sha256', $sql);
                    if (! isset($fingerprints[$key])) {
                        $frames = array_values(array_filter(debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS, 40), fn (array $frame): bool => isset($frame['file']) && str_contains(str_replace('\\', '/', $frame['file']), '/app/')));
                        $fingerprints[$key] = ['fingerprint' => $key, 'sql' => $sql, 'calls' => 0, 'total_ms' => 0, 'max_ms' => 0,
                            'app_frame' => isset($frames[0]) ? ['file' => str_replace(base_path().DIRECTORY_SEPARATOR, '', $frames[0]['file']), 'line' => $frames[0]['line']] : null,
                            'example_sql' => $event->sql, 'example_bindings' => str_starts_with(strtolower($event->sql), 'select') ? $event->bindings : []];
                    }
                    $fingerprints[$key]['calls']++;
                    $fingerprints[$key]['total_ms'] += $event->time;
                    $fingerprints[$key]['max_ms'] = max($fingerprints[$key]['max_ms'], $event->time);
                }
            }
        });
        Event::listen(TransactionBeginning::class, function () use (&$active, &$transactionStarts): void {
            if ($active !== null) {
                $transactionStarts[] = hrtime(true);
            }
        });
        Event::listen(TransactionCommitted::class, function () use (&$active, &$transactionStarts, &$stats): void {
            if ($active !== null && $transactionStarts !== []) {
                $duration = (hrtime(true) - array_pop($transactionStarts)) / 1e6;
                $stats['transaction_ms_sum'] += $duration;
                if ($transactionStarts === []) {
                    $stats['outer_transaction_ms'] += $duration;
                }
            }
        });
        $measure = function (string $phase, callable $operation) use ($size, &$active, &$stats, &$transactionStarts, &$fingerprints, $profile): mixed {
            $stats = ['queries' => 0, 'selects' => 0, 'pending_selects' => 0, 'max_query_ms' => 0, 'sql_ms' => 0, 'transaction_ms_sum' => 0, 'outer_transaction_ms' => 0];
            $transactionStarts = [];
            $fingerprints = [];
            memory_reset_peak_usage();
            $memoryBefore = memory_get_usage(true);
            $started = hrtime(true);
            $active = $phase;
            try {
                return $operation();
            } finally {
                $active = null;
                $measurement = ['engine' => 'MySQL 8.0.30', 'size' => $size, 'phase' => $phase, ...$stats,
                    'duration_ms' => round((hrtime(true) - $started) / 1e6, 2), 'peak_php_bytes' => memory_get_peak_usage(true), 'allocated_before_bytes' => $memoryBefore];
                fwrite(STDERR, json_encode($measurement, JSON_THROW_ON_ERROR).PHP_EOL);
                if ($profile) {
                    usort($fingerprints, fn (array $left, array $right): int => $right['total_ms'] <=> $left['total_ms']);
                    $plans = 0;
                    foreach ($fingerprints as &$fingerprint) {
                        if ($plans < 5 && str_starts_with(strtolower($fingerprint['example_sql']), 'select')) {
                            $fingerprint['explain'] = DB::select('EXPLAIN FORMAT=JSON '.$fingerprint['example_sql'], $fingerprint['example_bindings']);
                            $plans++;
                        }
                        unset($fingerprint['example_sql'], $fingerprint['example_bindings']);
                    }
                    unset($fingerprint);
                    $measurement['fingerprints'] = $fingerprints;
                    $tag = preg_replace('/[^a-zA-Z0-9_-]/', '', $profile);
                    file_put_contents(base_path('docs/technical-audit/evidence/m6-profile-'.$tag.'.ndjson'), json_encode($measurement, JSON_THROW_ON_ERROR).PHP_EOL, FILE_APPEND);
                }
            }
        };
        $locksBefore = DB::select("SHOW GLOBAL STATUS WHERE Variable_name IN ('Innodb_deadlocks','Innodb_row_lock_waits','Innodb_row_lock_time')");
        $fixture = pickupAutomationFixture($size, 0);
        $csv = "AWB,ID_ACCOUNT,CUSTOMER_CODE,SHIPPER_NAME,TGL_ENTRY,PROCESS_TYPE,QTY\n";
        for ($index = 1; $index <= $size; $index++) {
            $csv .= '000MANUAL'.$index.",SIM_AUTO_ACCOUNT,4000,VANNY,2026-10-27 10:00:00,MANUAL,3\n";
        }
        Storage::disk('jne_reports')->put('measurement.csv', $csv);
        $reports = [];
        foreach ([1, 2] as $sequence) {
            $report = ReportJob::factory()->create(['created_by' => $fixture['admin']->id, 'status' => 'COMPLETED', 'customer_account' => 'SIM_AUTO_ACCOUNT', 'date_from' => '2026-10-27', 'date_thru' => '2026-10-27', 'started_at' => now(), 'completed_at' => now(), 'file_path' => 'measurement.csv', 'file_checksum' => hash('sha256', $csv)]);
            $measure('import_'.$sequence, fn () => app(ImportReportAwbs::class)->handle($report->id));
            $measure('projection_'.$sequence, fn () => app(ProjectJneShipments::class)->handle($report->id));
            $reports[] = $report;
            $this->travel(1)->minute();
        }
        $measure('older_projection_replay', fn () => app(ProjectJneShipments::class)->handle($reports[0]->id));
        $result = $measure('reconciliation', fn () => app(ReconcilePickupProcessing::class)->handle($fixture['task']->id));
        expect($result->status)->toBe('DONE');
        $this->assertDatabaseCount('jne_shipments', $size);
        $this->assertDatabaseCount('jne_report_awbs', 2 * $size);
        $this->assertDatabaseCount('jne_shipment_observations', 2 * $size);
        $this->assertDatabaseCount('pickup_awb_manifest_items', $size);
        Customer::factory()->count($size)->create(['created_by' => $fixture['admin']->id]);
        $sources = JneReportAwb::where('report_job_id', $reports[1]->id)->get();
        $resolved = $measure('customer_code_resolution', fn () => app(ResolveJneCustomerCodes::class)->handle($sources));
        expect($resolved)->toHaveCount($size);
        $plan = DB::select("EXPLAIN ANALYZE SELECT id,name,customer_code FROM customers WHERE is_active=1 AND UPPER(TRIM(customer_code)) IN ('4000','VALIDATION_NO_MATCH')");
        fwrite(STDERR, json_encode(['phase' => 'customer_code_explain', 'size' => $size, 'plan' => $plan], JSON_THROW_ON_ERROR).PHP_EOL);
        $historyCustomer = Customer::factory()->create(['created_by' => $fixture['admin']->id]);
        $history = PickupTask::factory()->count($size)->has(PickupRecord::factory(['staff_id' => $fixture['admin']->id]), 'proof')->create(['customer_id' => $historyCustomer->id, 'created_by' => $fixture['admin']->id, 'status' => 'PICKED_UP']);
        config(['pickup.automation.enabled' => true]);
        $upperId = $history->last()->id;
        $measure('historical_producer_all_pages', function () use ($history, $historyCustomer, $upperId): void {
            $afterId = 0;
            foreach (array_chunk($history->modelKeys(), 200) as $ids) {
                (new QueueHistoricalPickupReconciliationsJob($upperId, $afterId, [$historyCustomer->id]))->handle(app(QueuePickupReconciliations::class));
                $afterId = $ids[array_key_last($ids)];
            }
        });
        expect(PickupProcessingReconciliation::whereIn('pickup_task_id', $history->modelKeys())->where('input_version', 1)->count())->toBe($size);
        $this->assertDatabaseCount('pickup_awb_manifests', 1);
        $locksAfter = DB::select("SHOW GLOBAL STATUS WHERE Variable_name IN ('Innodb_deadlocks','Innodb_row_lock_waits','Innodb_row_lock_time')");
        fwrite(STDERR, json_encode(['phase' => 'lock_counters', 'size' => $size, 'before' => $locksBefore, 'after' => $locksAfter], JSON_THROW_ON_ERROR).PHP_EOL);
        if ($profile) {
            $this->actingAs($fixture['admin']);
            $this->withoutVite();
            foreach ([1, 2, 3] as $request) {
                $measure('terminal_report_partial_request_'.$request, function () use ($reports, &$stats): void {
                    $response = $this->get(route('jne-reports.awbs', $reports[1]->id), [
                        'X-Inertia' => 'true', 'X-Inertia-Partial-Component' => 'jne-report-awbs', 'X-Inertia-Partial-Data' => 'report,awbs',
                        'X-Inertia-Version' => app(HandleInertiaRequests::class)->version(Request::create('/')) ?? '',
                    ])->assertOk()->assertJsonPath('props.report.projection_status', 'PROJECTED')->assertJsonCount(50, 'props.awbs.data');
                    $stats['response_bytes'] = strlen($response->getContent());
                });
            }
        }
        Http::assertNothingSent();
    } finally {
        config(['database.default' => 'sqlite']);
        DB::purge('validation_mysql');
        DB::connection('validation_server')->statement('DROP DATABASE `'.$database.'`');
    }
})->with([100, 1000, 5000])->group('validation-load');
