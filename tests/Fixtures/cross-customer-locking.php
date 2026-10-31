<?php

use App\Actions\Handover\CreateSession;
use App\Actions\Handover\VerifyItem;
use App\Actions\Pickup\ReconcilePickupProcessing;
use App\Actions\Reports\ProjectJneShipments;
use App\Models\Customer;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneSourceContract;
use App\Models\PickupCashlessAwb;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;

/** @return array{database: string, settings: array<string, mixed>} */
function crossLockDatabase(): array
{
    $settings = [...config('database.connections.mysql'), 'url' => null, 'host' => '127.0.0.1', 'port' => 54184, 'username' => 'root', 'password' => '', 'database' => null];
    config(['database.connections.cross_server' => $settings]);
    $server = DB::connection('cross_server')->selectOne('SELECT @@port AS port,@@datadir AS directory');
    if ((int) $server->port !== 54184 || ! str_contains($server->directory, 'dust-hardening-mysql-lock-')) {
        throw new RuntimeException('Disposable locking server required.');
    }
    $database = 'hardening_lock_'.bin2hex(random_bytes(8));
    DB::connection('cross_server')->statement('CREATE DATABASE '.$database);
    config(['database.connections.cross_mysql' => [...$settings, 'database' => $database], 'database.default' => 'cross_mysql',
        'database.connections.cross_observer' => [...$settings, 'database' => $database], 'queue.default' => 'database',
        'queue.connections.database.connection' => 'cross_mysql', 'queue.failed.database' => 'cross_mysql',
        'pickup.automation.enabled' => false, 'jne-reports.evidence_policies_enabled' => true,
        'jne-reports.category_reconciliation_enabled' => true, 'jne-reports.category_markers_enabled' => false]);
    Artisan::call('migrate', ['--database' => 'cross_mysql', '--force' => true, '--no-interaction' => true]);

    return compact('database', 'settings');
}

/** @return array<string, mixed> */
function crossLockFixture(int $poolPerCustomer = 2000): array
{
    $admin = User::factory()->create(['role' => 'admin_supervisor', 'is_active' => true]);
    JneSourceContract::factory()->create(['source' => 'apex', 'report_type' => 'apex', 'active_key' => JneSourceContract::key('apex', 'apex'), 'created_by' => $admin->id, 'verified_by' => $admin->id, 'verified_at' => now(),
        'definition' => ['customer_code_column' => 'CUSTOMER_CODE', 'category_column' => 'PROCESS_TYPE', 'category_values' => ['MANUAL' => 'manual_hybrid', 'CASHLESS' => 'cashless_hybrid'],
            'automatic_reconciliation' => true, 'pickup_date_column' => 'TGL_ENTRY', 'collection_mode' => 'complete_date_report', 'collection_requirements' => ['apex:apex:SHARED_LOCK']]]);
    $customers = [];
    $tasks = [];
    $poolIds = [];
    $ownedIds = [];
    $reports = [];
    foreach ([0, 1, 2] as $index) {
        $code = (string) (4001 + $index);
        $customer = Customer::factory()->create(['created_by' => $admin->id, 'customer_code' => $code, 'name' => 'Fixture '.$index, 'is_active' => true]);
        $members = [];
        foreach ([0, 1] as $member) {
            $task = PickupTask::factory()->create(['customer_id' => $customer->id, 'status' => 'PICKED_UP', 'scheduled_at' => now()->addMinutes($member), 'created_by' => $admin->id]);
            PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'staff_id' => $admin->id, 'manual_hybrid' => 10, 'cashless_hybrid' => $member === 0 ? 1 : 0, 'css_orion' => 0]);
            $members[] = $task;
        }
        $session = app(CreateSession::class)->handle($admin, array_map(fn ($task): int => $task->id, $members), (string) Str::uuid());
        foreach ($session->items()->orderBy('id')->get() as $member => $item) {
            app(VerifyItem::class)->handle($admin, $session->id, $item->id, ['expected_version' => $session->fresh()->version, 'manual_hybrid' => 10, 'cashless_hybrid' => $member === 0 ? 1 : 0, 'css_orion' => 0]);
        }
        $report = ReportJob::factory()->create(['created_by' => $admin->id, 'customer_account' => 'SHARED_LOCK', 'report_mode' => 'A', 'status' => 'COMPLETED',
            'import_status' => 'IMPORTED', 'projection_status' => 'PROJECTED', 'started_at' => now(), 'completed_at' => now(), 'date_from' => now()->toDateString(), 'date_thru' => now()->toDateString(), 'file_checksum' => hash('sha256', 'fixture'.$index)]);
        $sourceRows = [];
        for ($number = 0; $number < $poolPerCustomer + 21; $number++) {
            $sourceRows[] = ['report_job_id' => $report->id, 'source_row' => $number + 2, 'awb' => 'LOCK'.$index.'X'.$number, 'customer_account' => 'SHARED_LOCK',
                'raw_data' => json_encode(['CUSTOMER_CODE' => $code, 'PROCESS_TYPE' => $number === 20 ? 'CASHLESS' : 'MANUAL'], JSON_THROW_ON_ERROR),
                'shipper_name' => '', 'entry_at' => now()->format('Y-m-d H:i:s'), 'observed_at' => now()->format('Y-m-d H:i:s')];
        }
        foreach (array_chunk($sourceRows, 250) as $chunk) {
            DB::table('jne_report_awbs')->insert($chunk);
        }
        $sources = JneReportAwb::where('report_job_id', $report->id)->orderBy('id')->get(['id', 'awb']);
        $registry = [];
        foreach ($sources as $number => $source) {
            $registry[] = ['customer_account' => 'SHARED_LOCK', 'awb' => $source->awb, 'latest_report_awb_id' => $source->id, 'latest_report_job_id' => $report->id,
                'last_observed_at' => now(), 'tracking_status' => 'UNKNOWN', 'customer_id' => $customer->id, 'customer_match_status' => 'MATCHED',
                'customer_match_method' => 'CUSTOMER_CODE', 'pickup_task_id' => $number < 21 ? $members[$number < 10 || $number === 20 ? 0 : 1]->id : null,
                'match_status' => $number < 21 ? 'MATCHED' : 'AMBIGUOUS', 'match_method' => $number < 21 ? 'MANUAL' : 'CUSTOMER_CODE_DATE',
                'category' => $number === 20 ? 'cashless_hybrid' : 'manual_hybrid', 'category_status' => 'MATCHED', 'version' => 1, 'created_at' => now(), 'updated_at' => now()];
        }
        foreach (array_chunk($registry, 250) as $chunk) {
            DB::table('jne_shipments')->insert($chunk);
        }
        $owned = JneShipment::where('customer_id', $customer->id)->whereNotNull('pickup_task_id')->orderBy('id')->get();
        $pool = JneShipment::where('customer_id', $customer->id)->whereNull('pickup_task_id')->orderBy('id')->pluck('id')->all();
        $cashless = $owned->last();
        PickupCashlessAwb::factory()->create(['pickup_task_id' => $members[0]->id, 'customer_id' => $customer->id, 'awb' => $cashless->awb, 'original_awb' => $cashless->awb, 'raw_awb' => $cashless->awb, 'created_by' => $admin->id]);
        DB::table('pickup_awb_exclusions')->insert(['pickup_task_id' => $members[0]->id, 'jne_shipment_id' => $pool[0], 'actor_id' => $admin->id, 'reason' => 'Synthetic exclusion', 'created_at' => now(), 'updated_at' => now()]);
        $late = ReportJob::factory()->create(['created_by' => $admin->id, 'customer_account' => 'SHARED_LOCK', 'report_mode' => 'A', 'status' => 'COMPLETED',
            'import_status' => 'IMPORTED', 'projection_status' => 'NOT_PROJECTED', 'started_at' => now()->subDay(), 'completed_at' => now()->subDay()]);
        JneReportAwb::factory()->create(['report_job_id' => $late->id, 'awb' => $owned->first()->awb, 'customer_account' => 'SHARED_LOCK', 'shipper_name' => '',
            'entry_at' => now(), 'observed_at' => now()->subDay(), 'raw_data' => ['CUSTOMER_CODE' => (string) (4001 + (($index + 1) % 3)), 'PROCESS_TYPE' => 'MANUAL']]);
        app(ProjectJneShipments::class)->handle($late->id);
        $customers[] = $customer->id;
        $tasks[] = array_map(fn ($task): int => $task->id, $members);
        $poolIds[] = $pool;
        $ownedIds[] = $owned->modelKeys();
        $reports[] = $report->id;
    }
    JneShipment::factory()->count(100)->create(['customer_account' => 'SHARED_LOCK', 'customer_id' => null, 'customer_match_status' => 'AMBIGUOUS']);
    $historicTask = PickupTask::factory()->create(['customer_id' => $customers[2], 'status' => 'PICKED_UP', 'scheduled_at' => now()->subDays(3), 'created_by' => $admin->id]);
    $noise = [];
    for ($number = 0; $number < 24000; $number++) {
        $noise[] = ['awb' => 'HISTLOCK'.$number, 'customer_account' => 'SHARED_LOCK', 'customer_id' => $customers[2], 'pickup_task_id' => $historicTask->id, 'created_at' => now(), 'updated_at' => now()];
        if (count($noise) === 250) {
            DB::table('jne_shipments')->insert($noise);
            $noise = [];
        }
    }
    foreach ($tasks as $members) {
        app(ReconcilePickupProcessing::class)->handle($members[0]);
    }

    return compact('admin', 'customers', 'tasks', 'poolIds', 'ownedIds', 'reports');
}

/**
 * @param  array<string, mixed>  $payload
 * @param  list<array{int, string}>  $operations
 * @return array<string, mixed>
 */
function crossLockRun(array $payload, array $operations): array
{
    $gate = $payload['gate'];
    foreach (glob($gate.'.ready*') ?: [] as $file) {
        unlink($file);
    }
    if (is_file($gate.'.go')) {
        unlink($gate.'.go');
    }
    file_put_contents($gate.'.json', json_encode($payload, JSON_THROW_ON_ERROR));
    $processes = [];
    $samples = [];
    $started = hrtime(true);
    try {
        foreach ($operations as [$index, $mode]) {
            $process = new Process([PHP_BINARY, base_path('tests/Feature/cross-customer-worker.php'), $gate.'.json', (string) $index, $mode],
                base_path(), ['APP_ENV' => 'testing', 'MAIL_MAILER' => 'array', 'MOBILE_PUSH_ENABLED' => 'false'], null, 180);
            $process->start();
            $processes[] = $process;
        }
        $deadline = microtime(true) + 20;
        while (collect($operations)->contains(fn ($operation): bool => ! is_file($gate.'.ready'.$operation[0])) && microtime(true) < $deadline) {
            usleep(10000);
        }
        touch($gate.'.go');
        while (collect($processes)->contains(fn ($process): bool => $process->isRunning())) {
            $edges = DB::connection('cross_observer')->select('SELECT r.OBJECT_NAME,r.INDEX_NAME,r.LOCK_MODE,w.REQUESTING_THREAD_ID,w.BLOCKING_THREAD_ID FROM performance_schema.data_lock_waits w JOIN performance_schema.data_locks r ON r.ENGINE_LOCK_ID=w.REQUESTING_ENGINE_LOCK_ID AND r.ENGINE=w.ENGINE WHERE r.OBJECT_SCHEMA=?', [$payload['database']]);
            if ($edges !== [] && count($samples) < 100) {
                $samples[] = ['elapsed_ms' => (hrtime(true) - $started) / 1e6, 'edges' => $edges];
            }
            usleep(50000);
            if ((hrtime(true) - $started) / 1e9 > 170) {
                throw new RuntimeException('Isolated concurrency deadline exceeded.');
            }
        }
        $workers = [];
        foreach ($processes as $process) {
            $process->wait();
            $workers[] = ['exit' => $process->getExitCode(), 'stdout' => $process->getOutput(), 'stderr' => $process->getErrorOutput()];
        }

        return ['duration_ms' => (hrtime(true) - $started) / 1e6, 'workers' => $workers, 'waits' => $samples];
    } finally {
        touch($gate.'.go');
        foreach ($processes as $process) {
            if ($process->isRunning()) {
                $process->stop(0);
            }
        }
    }
}
