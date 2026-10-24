<?php

use App\Actions\Pickup\RecordCashlessAwb;
use App\Actions\Reports\ProjectJneShipments;
use App\Models\HandoverSession;
use App\Models\JneReportAwb;
use App\Models\JneReportProfile;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\PickupVisit;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;

test('Chromium records cashless AWBs and audits an Admin correction in the existing pickup interface', function () {
    $root = sys_get_temp_dir().DIRECTORY_SEPARATOR.'sertim_ui_'.bin2hex(random_bytes(8));
    File::makeDirectory($root, 0700);
    $database = $root.DIRECTORY_SEPARATOR.'database.sqlite';
    touch($database);
    $original = config('database.default');
    config(['database.connections.sertim_ui' => [...config('database.connections.sqlite'), 'database' => $database], 'database.default' => 'sertim_ui']);
    $server = null;
    try {
        Artisan::call('migrate', ['--database' => 'sertim_ui', '--force' => true]);
        $staff = User::factory()->create(['email' => 'sertim-staff@example.test', 'password' => 'SertimFixture123!', 'role' => 'pickup_staff']);
        $admin = User::factory()->create(['email' => 'sertim-admin@example.test', 'password' => 'SertimFixture123!', 'role' => 'admin_supervisor']);
        JneReportProfile::factory()->create(['source' => 'apex', 'report_type' => 'unresolved', 'customer_account' => 'AWB_AKTIF', 'enabled' => false, 'updated_by' => $admin->id]);
        $sourceJob = ReportJob::factory()->create(['source' => 'apex', 'status' => 'COMPLETED', 'import_status' => 'IMPORTED', 'completed_at' => now()]);
        JneReportAwb::factory()->create(['report_job_id' => $sourceJob->id, 'awb' => 'SERTIM001', 'shipper_name' => 'Tokopedia', 'reference' => null, 'customer_account' => 'SHARED', 'entry_at' => now(), 'observed_at' => now()->subDays(2), 'status_web' => 'ON PROCESS', 'status_pod' => null]);
        app(ProjectJneShipments::class)->handle($sourceJob->id);
        $task = PickupTask::factory()->create(['assigned_staff_id' => $staff->id, 'status' => 'ASSIGNED', 'execution_started_at' => now()]);
        PickupVisit::factory()->create(['pickup_task_id' => $task->id, 'staff_id' => $staff->id, 'outcome' => 'COLLECTED']);
        $closed = PickupTask::factory()->create(['assigned_staff_id' => $staff->id, 'status' => 'ASSIGNED', 'execution_started_at' => now()]);
        app(RecordCashlessAwb::class)->handle($staff, $closed->id, ['awb' => 'CLOSED001', 'submission_key' => (string) Str::uuid()]);
        $closed->update(['status' => 'PICKED_UP']);
        $proof = PickupRecord::factory()->create(['pickup_task_id' => $closed->id]);
        $session = HandoverSession::factory()->create(['status' => 'CLOSED', 'closed_at' => now(), 'sertim_closed_at' => now()]);
        $session->items()->create(['pickup_task_id' => $closed->id, 'pickup_record_id' => $proof->id]);
        $socket = stream_socket_server('tcp://127.0.0.1:0');
        $address = stream_socket_get_name($socket, false);
        fclose($socket);
        $url = 'http://'.$address;
        $server = new Process([PHP_BINARY, '-d', 'extension=pdo_sqlite', '-d', 'extension=sqlite3', '-S', $address, base_path('vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php')], public_path(), [
            'APP_ENV' => 'testing', 'APP_URL' => $url, 'DB_CONNECTION' => 'sqlite', 'DB_DATABASE' => $database, 'DB_URL' => '',
            'QUEUE_CONNECTION' => 'sync', 'SESSION_DRIVER' => 'file', 'CACHE_STORE' => 'array',
            'JNE_EVIDENCE_POLICIES_ENABLED' => 'true',
        ]);
        $server->start();
        $deadline = microtime(true) + 10;
        while (@file_get_contents($url.'/up') === false && microtime(true) < $deadline) {
            usleep(100000);
        }
        $runner = new Process(['node', base_path('workers/jne-report/test/sertim-ui-flow.mjs')], base_path('workers/jne-report'), [
            'RETAIL_OPERATIONS_URL' => $url, 'SERTIM_UI_TASK' => (string) $task->id, 'SERTIM_UI_CLOSED_TASK' => (string) $closed->id,
            'SERTIM_UI_CUSTOMER' => (string) $task->customer_id,
            'SERTIM_UI_ARTIFACT_DIR' => storage_path('app/private/jne-reconciliation-ui'),
        ], null, 70);
        $runner->run();
        expect($runner->isSuccessful())->toBeTrue($runner->getOutput().$runner->getErrorOutput());
        expect($runner->getOutput())->toContain('SERTIM_CHROMIUM_UI_OK');
        $this->assertDatabaseHas('pickup_cashless_awbs', ['pickup_task_id' => $task->id, 'awb' => 'SERTIM001']);
        $this->assertDatabaseHas('pickup_cashless_awbs', ['pickup_task_id' => $closed->id, 'original_awb' => 'CLOSED001', 'awb' => 'CLOSED002']);
        $this->assertDatabaseHas('pickup_cashless_awb_events', ['pickup_task_id' => $closed->id, 'previous_awb' => 'CLOSED001', 'awb' => 'CLOSED002', 'reason' => 'Original label checked in UI fixture']);
        expect($session->fresh()->status)->toBe('CLOSED');
        expect($proof->fresh()->cashless_hybrid)->toBe(1);
    } finally {
        $server?->stop();
        config(['database.default' => $original]);
        DB::purge('sertim_ui');
        if (str_starts_with($root, sys_get_temp_dir().DIRECTORY_SEPARATOR.'sertim_ui_')) {
            File::deleteDirectory($root);
        }
    }
});
