<?php

use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\Process\Process;

test('admin request runs through actual Laravel worker API Chromium and private CSV download with mocked JNE', function () {
    $root = sys_get_temp_dir().DIRECTORY_SEPARATOR.'jne_e2e_'.bin2hex(random_bytes(8));
    File::makeDirectory($root, 0700);
    $database = $root.DIRECTORY_SEPARATOR.'database.sqlite';
    touch($database);
    $original = config('database.default');
    config([
        'database.connections.jne_e2e' => [...config('database.connections.sqlite'), 'database' => $database],
        'database.default' => 'jne_e2e', 'filesystems.disks.jne_reports.root' => $root.DIRECTORY_SEPARATOR.'reports',
    ]);
    Storage::forgetDisk('jne_reports');
    $server = null;
    try {
        Artisan::call('migrate', ['--database' => 'jne_e2e', '--force' => true]);
        $admin = User::factory()->create(['role' => 'admin_supervisor']);
        $this->actingAs($admin)->post(route('jne-reports.store'), [
            'customer_account' => 'TEST001', 'national_account' => 'Y', 'date_from' => '2026-10-01', 'date_thru' => '2026-10-02',
        ])->assertRedirectToRoute('jne-reports.index');
        $job = ReportJob::sole();

        $socket = stream_socket_server('tcp://127.0.0.1:0');
        $address = stream_socket_get_name($socket, false);
        fclose($socket);
        $url = 'http://'.$address;
        $token = str_repeat('fixture-token', 4);
        $server = new Process([PHP_BINARY, '-d', 'extension=pdo_sqlite', '-d', 'extension=sqlite3', '-S', $address, base_path('vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php')], public_path(), [
            'APP_ENV' => 'testing', 'APP_URL' => $url,
            'DB_CONNECTION' => 'sqlite', 'DB_DATABASE' => $database, 'DB_URL' => '',
            'JNE_REPORT_WORKER_TOKEN' => $token, 'JNE_REPORT_WORKER_ID' => 'jne-report-1',
            'JNE_REPORT_STORAGE_PATH' => $root.DIRECTORY_SEPARATOR.'reports',
            'QUEUE_CONNECTION' => 'sync',
        ]);
        $server->start();
        $deadline = microtime(true) + 10;
        while (@file_get_contents($url.'/up') === false && microtime(true) < $deadline) {
            usleep(100000);
        }
        $runner = new Process(['node', base_path('workers/jne-report/test/laravel-flow.mjs')], base_path('workers/jne-report'), [
            'RETAIL_OPERATIONS_URL' => $url, 'JNE_REPORT_WORKER_TOKEN' => $token, 'JNE_E2E_DATA_DIR' => $root.DIRECTORY_SEPARATOR.'worker',
        ], null, 45);
        $runner->run();
        expect($runner->getErrorOutput())->toBe('');
        expect($runner->isSuccessful())->toBeTrue($runner->getOutput());
        expect($runner->getOutput())->toContain('LARAVEL_CHROMIUM_FIXTURE_OK');

        $job->refresh();
        expect($job->status)->toBe('COMPLETED')->and($job->attempt_count)->toBe(1)->and($job->completed_at)->not->toBeNull();
        $csv = "AWB,ID_ACCOUNT,STATUS_WEB\nFIXTURE,TEST001,Delivered\n";
        expect($job->file_checksum)->toBe(hash('sha256', $csv));
        expect($job->import_status)->toBe('IMPORTED');
        expect($job->projection_status)->toBe('PROJECTED');
        $this->assertDatabaseHas('jne_shipments', ['customer_account' => 'TEST001', 'awb' => 'FIXTURE', 'tracking_status' => 'DELIVERED']);
        $this->assertDatabaseCount('jne_shipment_observations', 1);
        $this->assertDatabaseHas('jne_report_awbs', ['report_job_id' => $job->id, 'awb' => 'FIXTURE', 'customer_account' => 'TEST001', 'status_web' => 'Delivered']);
        Storage::disk('jne_reports')->assertExists($job->file_path);
        $response = $this->get(route('jne-reports.download', $job))->assertOk()->assertDownload('jne-report-'.$job->id.'.csv');
        expect($response->streamedContent())->toBe($csv);
    } finally {
        $server?->stop();
        config(['database.default' => $original]);
        DB::purge('jne_e2e');
        Storage::forgetDisk('jne_reports');
        if (str_starts_with($root, sys_get_temp_dir().DIRECTORY_SEPARATOR.'jne_e2e_')) {
            File::deleteDirectory($root);
        }
    }
});
