<?php

use App\Actions\Reports\ManageReportJobs;
use App\Jobs\QueueHistoricalPickupReconciliationsJob;
use App\Models\Customer;
use App\Models\PickupProcessingReconciliation;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\Process\Process;

test('disposable MySQL workers recover interrupted internal work with shared database locks', function (string $scenario) {
    $port = (int) getenv('HARDENING_MYSQL_PORT');
    if ($port < 1024) {
        $this->markTestSkipped('Explicit disposable MySQL instance required.');
    }
    Http::preventStrayRequests();
    Storage::fake('jne_reports');
    $settings = [...config('database.connections.mysql'), 'url' => null, 'host' => '127.0.0.1', 'port' => $port, 'username' => 'root', 'password' => '', 'database' => null];
    config(['database.connections.queue_validation_server' => $settings]);
    expect(DB::connection('queue_validation_server')->selectOne('select @@datadir as directory')->directory)->toContain('dust-hardening-mysql-');
    $database = 'hardening_queue_'.bin2hex(random_bytes(8));
    DB::connection('queue_validation_server')->statement('CREATE DATABASE `'.$database.'`');
    config(['database.connections.queue_validation' => [...$settings, 'database' => $database], 'database.default' => 'queue_validation', 'queue.default' => 'database', 'queue.failed.database' => 'queue_validation', 'cache.default' => 'database', 'pickup.automation.enabled' => false]);
    $gate = sys_get_temp_dir().DIRECTORY_SEPARATOR.$database;
    $worker = null;
    try {
        Artisan::call('migrate', ['--database' => 'queue_validation', '--force' => true, '--no-interaction' => true]);
        $admin = User::factory()->create(['role' => 'admin_supervisor']);
        if ($scenario === 'producer') {
            $customer = Customer::factory()->create(['created_by' => $admin->id]);
            $tasks = PickupTask::factory()->count(501)->has(PickupRecord::factory(['staff_id' => $admin->id, 'picked_up_at' => now()]), 'proof')->create(['customer_id' => $customer->id, 'created_by' => $admin->id, 'status' => 'PICKED_UP']);
            config(['pickup.automation.enabled' => true]);
            foreach ([1, 2, 3] as $dispatch) {
                QueueHistoricalPickupReconciliationsJob::dispatch($tasks->last()->id);
            }
            $this->assertDatabaseCount('jobs', 1);
            $this->assertDatabaseCount('pickup_processing_reconciliations', 0);
        } else {
            $csv = "AWB,ID_ACCOUNT,STATUS_WEB\n";
            foreach (range(1, 250) as $index) {
                $csv .= 'INTERRUPT'.$index.",TESTACCOUNT,ON PROCESS\n";
            }
            Storage::disk('jne_reports')->put('interrupted.csv', $csv);
            $report = ReportJob::factory()->create(['created_by' => $admin->id, 'status' => 'COMPLETED', 'file_path' => 'interrupted.csv', 'file_checksum' => hash('sha256', $csv)]);
            app(ManageReportJobs::class)->queueImport($report->id);
        }
        file_put_contents($gate.'.json', json_encode(['port' => $port, 'database' => $database, 'gate' => $gate, 'scenario' => $scenario, 'reports_root' => Storage::disk('jne_reports')->path('')], JSON_THROW_ON_ERROR));
        $worker = new Process([PHP_BINARY, __DIR__.'/validation-queue-worker.php', $gate.'.json'], base_path(), [
            'APP_ENV' => 'testing', 'MOBILE_PUSH_ENABLED' => 'false', 'MAIL_MAILER' => 'array', 'PICKUP_AWB_SEND_ENABLED' => 'false',
        ], null, 40);
        $worker->start();
        $deadline = microtime(true) + 15;
        while (! file_exists($gate.'.paused') && $worker->isRunning() && microtime(true) < $deadline) {
            usleep(10000);
        }
        expect(file_exists($gate.'.paused'))->toBeTrue($worker->getErrorOutput());
        $worker->stop(0);
        if ($scenario === 'producer') {
            expect(PickupProcessingReconciliation::count())->toBe(50);
        } elseif ($scenario === 'projection') {
            $this->assertDatabaseCount('jne_report_awbs', 250);
            $this->assertDatabaseCount('jne_shipments', 0);
            $this->assertDatabaseCount('jne_shipment_observations', 0);
        } else {
            $this->assertDatabaseCount('jne_report_awbs', 0);
        }
        DB::table('jobs')->where('queue', 'default')->update(['reserved_at' => now()->subMinutes(5)->timestamp]);
        if ($scenario === 'producer') {
            foreach ([1, 2, 3] as $page) {
                $this->artisan('queue:work', ['connection' => 'database', '--once' => true, '--queue' => 'default', '--sleep' => 0, '--tries' => 3])->assertSuccessful();
            }
            expect(PickupProcessingReconciliation::whereIn('pickup_task_id', $tasks->modelKeys())->where('input_version', '>=', 1)->count())->toBe(501);
            expect(DB::table('jobs')->where('queue', 'default')->count())->toBe(0);
            expect(DB::table('jobs')->where('queue', 'reconciliation')->count())->toBe(1);
            $this->artisan('pickups:queue-automation')->assertSuccessful();
            $this->artisan('queue:work', ['connection' => 'database', '--once' => true, '--queue' => 'reconciliation', '--sleep' => 0, '--tries' => 4])->assertSuccessful();
            $this->assertDatabaseCount('pickup_awb_manifests', 0);
            QueueHistoricalPickupReconciliationsJob::dispatch($tasks->last()->id);
            DB::table('jobs')->where('queue', 'default')->update(['attempts' => 3]);
            $this->artisan('queue:work', ['connection' => 'database', '--once' => true, '--queue' => 'default', '--sleep' => 0, '--tries' => 3])->assertSuccessful();
            $this->assertDatabaseCount('failed_jobs', 1);
        } else {
            $this->artisan('queue:work', ['connection' => 'database', '--once' => true, '--queue' => 'default', '--sleep' => 0, '--tries' => 3])->assertSuccessful();
            if ($scenario === 'projection') {
                expect($report->fresh()->import_status)->toBe('IMPORTED');
                expect($report->fresh()->projection_status)->toBe('FAILED');
            } else {
                expect($report->fresh()->import_status)->toBe('FAILED');
            }
            $this->assertDatabaseCount('failed_jobs', 1);
            if ($scenario === 'projection') {
                app(ManageReportJobs::class)->queueProjection($report->id);
            } else {
                app(ManageReportJobs::class)->queueImport($report->id);
            }
            $this->artisan('queue:work', ['connection' => 'database', '--once' => true, '--queue' => 'default', '--sleep' => 0, '--tries' => 3])->assertSuccessful();
            expect($report->fresh()->import_status)->toBe('IMPORTED');
            expect($report->fresh()->projection_status)->toBe('PROJECTED');
            $this->assertDatabaseCount('jne_report_awbs', 250);
            $this->assertDatabaseCount('jne_shipment_observations', 250);
        }
        Http::assertNothingSent();
    } finally {
        if ($worker?->isRunning()) {
            $worker->stop(0);
        }
        config(['database.default' => 'sqlite']);
        DB::purge('queue_validation');
        DB::connection('queue_validation_server')->statement('DROP DATABASE `'.$database.'`');
        foreach (glob($gate.'.*') ?: [] as $file) {
            if (is_file($file)) {
                unlink($file);
            }
        }
    }
})->with(['producer', 'import', 'projection'])->group('mysql-concurrency');
