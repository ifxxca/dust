<?php

use App\Actions\Handover\CreateSession;
use App\Actions\Handover\VerifyItem;
use App\Actions\Pickup\ManageReconciliationWorkspace;
use App\Actions\Pickup\QueryPickupAutomation;
use App\Actions\Pickup\QueryReconciliationWorkspace;
use App\Actions\Pickup\ReconcilePickupProcessing;
use App\Models\Customer;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneShipmentMatchEvent;
use App\Models\PickupCustomerReconciliation;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;

require_once __DIR__.'/../Fixtures/pickup-automation.php';

test('concurrent retail closure creates one snapshot and one report in an isolated MySQL database', function () {
    $this->travelTo('2026-11-20 08:00:00 UTC');
    $database = 'reconciliation_test_'.bin2hex(random_bytes(8));
    $base = config('database.connections.mysql');
    $original = config('database.default');
    config(['database.connections.reconciliation_server' => [...$base, 'database' => null, 'url' => null]]);
    DB::connection('reconciliation_server')->statement('CREATE DATABASE '.$database);
    config(['database.connections.reconciliation_test' => [...$base, 'database' => $database, 'url' => null], 'database.default' => 'reconciliation_test',
        'pickup.automation.enabled' => false, 'pickup.automation.auto_lock' => false, 'pickup.automation.send_enabled' => false,
        'jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => true]);
    $gate = sys_get_temp_dir().DIRECTORY_SEPARATOR.$database;
    $processes = [];
    try {
        Artisan::call('migrate', ['--database' => 'reconciliation_test', '--force' => true, '--no-interaction' => true]);
        Queue::fake();
        Storage::fake('jne_reports');
        Storage::fake('local');
        $fixture = pickupAutomationFixture(10, 0);
        importPickupAutomationReport($fixture, 9, 0);
        app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
        $workspace = app(QueryReconciliationWorkspace::class)->handle($fixture['task']);
        $actors = User::factory()->count(2)->create(['role' => 'retail_staff', 'is_active' => true]);
        $body = ['action' => 'CLOSE_WITH_EXCEPTION', 'expected_revision' => $workspace['version'], 'fingerprint' => $workspace['fingerprint'],
            'review_token' => $workspace['review_token'], 'reason_code' => 'PENDING_GOODS', 'reason' => 'Satu paket pending atas permintaan customer.'];
        file_put_contents($gate.'.json', json_encode(['actors' => $actors->modelKeys(), 'body' => $body], JSON_THROW_ON_ERROR));
        foreach ([0, 1] as $index) {
            $process = new Process([PHP_BINARY, base_path('tests/Fixtures/reconciliation-lock-worker.php'), $database, $gate, (string) $index, (string) $fixture['task']->id, 'exception'], base_path(),
                ['APP_ENV' => 'testing', 'JNE_REPORT_STORAGE_PATH' => Storage::disk('jne_reports')->path('')]);
            $process->setTimeout(35)->start();
            $processes[] = $process;
        }
        $deadline = microtime(true) + 20;
        while ((! file_exists($gate.'.0') || ! file_exists($gate.'.1')) && microtime(true) < $deadline) {
            usleep(10000);
        }
        expect(file_exists($gate.'.0') && file_exists($gate.'.1'))->toBeTrue();
        file_put_contents($gate, 'go');
        $outcomes = [];
        foreach ($processes as $process) {
            $process->wait();
            expect($process->isSuccessful())->toBeTrue($process->getOutput().$process->getErrorOutput());
            $outcomes[] = trim($process->getOutput());
        }
        sort($outcomes);
        expect($outcomes)->toBe(['completed', 'conflict'])->and(PickupCustomerReconciliation::sole()->approval_snapshot['included_count'])->toBe(9);
        expect(DB::table('pickup_awb_manifests')->count())->toBe(1)->and(DB::table('pickup_awb_manifest_items')->count())->toBe(9);
        expect(DB::table('pickup_customer_reconciliation_events')->get()->filter(fn ($row) => (json_decode($row->snapshot, true)['event'] ?? '') === 'CLOSE_WITH_EXCEPTION')->count())->toBe(1);
    } finally {
        foreach ($processes as $process) {
            if ($process->isRunning()) {
                $process->stop();
            }
        }
        config(['database.default' => $original]);
        DB::purge('reconciliation_test');
        DB::connection('reconciliation_server')->statement('DROP DATABASE '.$database);
        foreach (glob($gate.'*') as $file) {
            unlink($file);
        }
    }
});

test('concurrent MySQL reconciliation jobs serialize one customer day and create exactly one automatic snapshot', function () {
    $this->travelTo('2026-10-26 12:00:00 UTC');
    $database = 'reconciliation_test_'.bin2hex(random_bytes(8));
    $base = config('database.connections.mysql');
    $original = config('database.default');
    config(['database.connections.reconciliation_server' => [...$base, 'database' => null, 'url' => null]]);
    DB::connection('reconciliation_server')->statement('CREATE DATABASE '.$database);
    config(['database.connections.reconciliation_test' => [...$base, 'database' => $database, 'url' => null], 'database.default' => 'reconciliation_test',
        'pickup.automation.enabled' => false, 'pickup.automation.auto_lock' => false, 'pickup.automation.send_enabled' => false,
        'jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => true]);
    $gate = sys_get_temp_dir().DIRECTORY_SEPARATOR.$database;
    $processes = [];
    try {
        Artisan::call('migrate', ['--database' => 'reconciliation_test', '--force' => true, '--no-interaction' => true]);
        Queue::fake();
        Storage::fake('jne_reports');
        Storage::fake('local');
        $fixture = pickupAutomationFixture(2, 0);
        importPickupAutomationReport($fixture, 2, 0);
        app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
        $workerEnvironment = ['APP_ENV' => 'testing', 'JNE_REPORT_STORAGE_PATH' => Storage::disk('jne_reports')->path('')];
        foreach ([0, 1] as $index) {
            $process = new Process([PHP_BINARY, base_path('tests/Fixtures/reconciliation-lock-worker.php'), $database, $gate, (string) $index, (string) $fixture['task']->id], base_path(), $workerEnvironment);
            $process->setTimeout(35);
            $process->start();
            $processes[] = $process;
        }
        $deadline = microtime(true) + 20;
        while ((! file_exists($gate.'.0') || ! file_exists($gate.'.1')) && microtime(true) < $deadline) {
            usleep(10000);
        }
        expect(file_exists($gate.'.0') && file_exists($gate.'.1'))->toBeTrue();
        file_put_contents($gate, 'go');
        foreach ($processes as $process) {
            $process->wait();
            expect($process->isSuccessful())->toBeTrue($process->getOutput().$process->getErrorOutput());
            expect(trim($process->getOutput()))->toBe('completed');
        }
        expect(PickupCustomerReconciliation::sole()->approval_snapshot['mode'])->toBe('AUTOMATIC');
        $events = DB::table('pickup_customer_reconciliation_events')->get()->map(fn ($event) => json_decode($event->snapshot, true));
        expect($events->where('event', 'AUTO_LOCK'))->toHaveCount(1);
        $this->actingAs($fixture['admin'])->getJson(route('reconciliation-workspace.awbs', ['task' => $fixture['task'], 'mode' => 'included']))
            ->assertOk()->assertJsonPath('total', 2);
        $this->getJson(route('reconciliation-workspace.awbs', ['task' => $fixture['task'], 'mode' => 'suggested']))
            ->assertOk()->assertJsonPath('total', 0);
        $this->assertDatabaseCount('pickup_awb_manifests', 1);
        $this->assertDatabaseCount('pickup_customer_reconciliation_events', 2);
        $categoryEvents = JneShipmentMatchEvent::where('method', 'CATEGORY')->count();
        $versions = JneShipment::orderBy('id')->pluck('version')->all();
        JneShipment::query()->update(['category_evidence' => '[]']);
        $categoryGate = $gate.'.category';
        $categoryProcesses = [];
        foreach ([0, 1] as $index) {
            $process = new Process([PHP_BINARY, base_path('tests/Fixtures/reconciliation-lock-worker.php'), $database, $categoryGate, (string) $index, (string) $fixture['task']->id, 'category'], base_path(), $workerEnvironment);
            $process->setTimeout(35);
            $process->start();
            $processes[] = $process;
            $categoryProcesses[] = $process;
        }
        $deadline = microtime(true) + 20;
        while ((! file_exists($categoryGate.'.0') || ! file_exists($categoryGate.'.1')) && microtime(true) < $deadline) {
            usleep(10000);
        }
        expect(file_exists($categoryGate.'.0') && file_exists($categoryGate.'.1'))->toBeTrue();
        file_put_contents($categoryGate, 'go');
        foreach ($categoryProcesses as $process) {
            $process->wait();
            expect($process->isSuccessful())->toBeTrue($process->getOutput().$process->getErrorOutput());
        }
        expect(JneShipmentMatchEvent::where('method', 'CATEGORY')->count())->toBe($categoryEvents + 2)
            ->and(JneShipment::orderBy('id')->pluck('version')->all())->toBe(array_map(fn (int $version): int => $version + 1, $versions));
        $monitor = app(QueryPickupAutomation::class)->handle(['date_from' => '2026-10-26', 'date_to' => '2026-10-26']);
        expect($monitor['pool_summary'])->toMatchArray(['total' => 2, 'allocated' => 2, 'unassigned' => 0]);
        expect($monitor['allocation_summary']['matched'])->toBe(1);
        $targets = [];
        foreach (['6000', '7000'] as $code) {
            $customer = Customer::factory()->create(['customer_code' => $code]);
            $task = PickupTask::factory()->create(['customer_id' => $customer->id, 'status' => 'PICKED_UP', 'scheduled_at' => now()]);
            PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'manual_hybrid' => 1, 'cashless_hybrid' => 0, 'css_orion' => 0]);
            $session = app(CreateSession::class)->handle($fixture['admin'], [$task->id], (string) Str::uuid());
            app(VerifyItem::class)->handle($fixture['admin'], $session->id, $session->items()->sole()->id,
                ['expected_version' => 1, 'manual_hybrid' => 1, 'cashless_hybrid' => 0, 'css_orion' => 0]);
            app(ReconcilePickupProcessing::class)->handle($task->id);
            $targets[] = $task;
        }
        $source = JneReportAwb::factory()->create(['report_job_id' => ReportJob::sole()->id, 'entry_at' => now()]);
        $shared = JneShipment::factory()->create(['awb' => $source->awb, 'customer_id' => null, 'pickup_task_id' => null,
            'latest_report_awb_id' => $source->id, 'latest_report_job_id' => $source->report_job_id, 'category' => 'manual_hybrid', 'category_status' => 'MATCHED']);
        $bodies = [];
        foreach ($targets as $task) {
            $workspace = app(QueryReconciliationWorkspace::class)->handle($task);
            $body = ['action' => 'ADD', 'target_task_id' => $task->id, 'expected_revision' => $workspace['version'],
                'expected_version' => DB::table('pickup_processing_reconciliations')->where('pickup_task_id', $task->id)->value('input_version'),
                'reason' => 'Concurrent allocation fixture with verified source evidence.', 'items' => [['id' => $shared->id, 'version' => $shared->version]]];
            $preview = app(ManageReconciliationWorkspace::class)->change($fixture['admin'], $task, $body, apply: false);
            expect($preview['allowed'])->toBeTrue();
            $bodies[] = [...$body, 'preview_hash' => $preview['preview_hash']];
        }
        $allocationGate = $gate.'.allocation';
        file_put_contents($allocationGate.'.json', json_encode(['bodies' => $bodies, 'actors' => [$fixture['admin']->id, User::factory()->create(['role' => 'admin_supervisor', 'is_active' => true])->id]], JSON_THROW_ON_ERROR));
        $allocationProcesses = [];
        foreach ($targets as $index => $task) {
            $process = new Process([PHP_BINARY, base_path('tests/Fixtures/reconciliation-lock-worker.php'), $database, $allocationGate, (string) $index, (string) $task->id, 'allocation'], base_path(), $workerEnvironment);
            $process->setTimeout(35);
            $process->start();
            $processes[] = $process;
            $allocationProcesses[] = $process;
        }
        $deadline = microtime(true) + 20;
        while ((! file_exists($allocationGate.'.0') || ! file_exists($allocationGate.'.1')) && microtime(true) < $deadline) {
            usleep(10000);
        }
        expect(file_exists($allocationGate.'.0') && file_exists($allocationGate.'.1'))->toBeTrue();
        file_put_contents($allocationGate, 'go');
        $outcomes = [];
        foreach ($allocationProcesses as $process) {
            $process->wait();
            expect($process->isSuccessful())->toBeTrue($process->getOutput().$process->getErrorOutput());
            $outcomes[] = trim($process->getOutput());
        }
        sort($outcomes);
        expect($outcomes)->toBe(['completed', 'conflict'])->and($shared->fresh()->pickup_task_id)->toBeIn(array_map(fn ($task): int => $task->id, $targets));
        expect(DB::table('pickup_awb_review_events')->where('action', 'ADD')->count())->toBe(1);
    } finally {
        foreach ($processes as $process) {
            if ($process->isRunning()) {
                $process->stop();
            }
        }
        config(['database.default' => $original]);
        DB::purge('reconciliation_test');
        DB::connection('reconciliation_server')->statement('DROP DATABASE '.$database);
        foreach ([$gate, $gate.'.0', $gate.'.1', $gate.'.category', $gate.'.category.0', $gate.'.category.1', $gate.'.allocation', $gate.'.allocation.0', $gate.'.allocation.1', $gate.'.allocation.json'] as $file) {
            if (file_exists($file)) {
                unlink($file);
            }
        }
    }
})->group('mysql-concurrency');
