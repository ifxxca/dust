<?php

use App\Models\HandoverSession;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Symfony\Component\Process\Process;

test('android apk reads isolated tasks and revokes its token after locked restart', function () {
    if (getenv('MOBILE_ANDROID_SMOKE') !== '1') {
        $this->markTestSkipped('Opt-in device test requires a built APK, emulator/device, JDK and SDK.');
    }
    $nativeIndex = base_path('android/app/src/main/assets/public/index.html');
    if (! is_file($nativeIndex) || ! str_contains(file_get_contents($nativeIndex), "connect-src 'self' http://127.0.0.1:8000;")) {
        $this->markTestSkipped('Build and sync with MOBILE_API_URL=http://127.0.0.1:8000 before running the isolated Android smoke test.');
    }
    $serial = getenv('MOBILE_ANDROID_SERIAL') ?: 'emulator-5554';
    $databasePath = tempnam(sys_get_temp_dir(), 'mobile_m1_');
    $storagePath = $databasePath.'_storage';
    mkdir($storagePath);
    $server = null;
    $original = config('database.default');
    config(['database.connections.mobile_smoke' => [...config('database.connections.sqlite'), 'database' => $databasePath, 'url' => null], 'database.default' => 'mobile_smoke']);
    try {
        Artisan::call('migrate', ['--database' => 'mobile_smoke', '--force' => true]);
        $staff = User::factory()->create(['role' => 'pickup_staff', 'email' => 'android-smoke@example.test', 'name' => 'Native Staff']);
        $mobileM2 = getenv('MOBILE_ANDROID_M2') === '1';
        $mobileM3 = getenv('MOBILE_ANDROID_M3') === '1';
        $mobileM4 = getenv('MOBILE_ANDROID_M4') === '1';
        $processDeath = getenv('MOBILE_ANDROID_PROCESS_DEATH') === '1';
        if ($mobileM4) {
            User::factory()->create(['role' => 'retail_staff', 'email' => 'android-receiver@example.test', 'name' => 'Native Receiver']);
            foreach ([1, 2] as $number) {
                $task = PickupTask::factory()->create(['assigned_staff_id' => $staff->id, 'status' => 'PICKED_UP', 'customer_name_snapshot' => 'M4 Own '.$number]);
                PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'staff_id' => $staff->id, 'customer_name' => $task->customer_name_snapshot]);
            }
        } elseif ($mobileM3 || $processDeath) {
            $collected = PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $staff->id, 'customer_name_snapshot' => 'M3 Collected', 'execution_started_at' => $processDeath ? now() : null]);
            if ($processDeath) {
                $collected->visits()->create(['staff_id' => $staff->id, 'started_at' => now(), 'outcome' => 'COLLECTED', 'recorded_at' => now()]);
            }
        } elseif ($mobileM2) {
            PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $staff->id, 'customer_name_snapshot' => 'M2 Own']);
            PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $staff->id, 'customer_name_snapshot' => 'M2 Retry']);
        } else {
            PickupTask::factory()->count(21)->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $staff->id, 'customer_name_snapshot' => 'Native Customer']);
            PickupTask::factory()->create(['status' => 'SCHEDULED', 'assigned_staff_id' => null, 'customer_name_snapshot' => 'Restricted Scheduled Customer']);
        }
        $other = User::factory()->create(['role' => 'pickup_staff', 'email' => 'android-other@example.test']);
        if ($mobileM4) {
            $task = PickupTask::factory()->create(['assigned_staff_id' => $other->id, 'status' => 'PICKED_UP', 'customer_name_snapshot' => 'M4 Other']);
            PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'staff_id' => $other->id, 'customer_name' => $task->customer_name_snapshot]);
            foreach (range(4, 23) as $number) {
                $extra = PickupTask::factory()->create(['assigned_staff_id' => $staff->id, 'status' => 'PICKED_UP', 'customer_name_snapshot' => 'M4 Page '.$number]);
                PickupRecord::factory()->create(['pickup_task_id' => $extra->id, 'staff_id' => $staff->id, 'customer_name' => $extra->customer_name_snapshot]);
            }
        } elseif (! $mobileM3 && ! $processDeath) {
            PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $other->id, 'customer_name_snapshot' => $mobileM2 ? 'M2 Available' : 'Available Candidate']);
        }
        $server = new Process([PHP_BINARY, '-d', 'extension=pdo_sqlite', '-d', 'extension=sqlite3', '-S', '127.0.0.1:8001', '-t', '.', base_path('vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php')], base_path('public'), [
            'APP_ENV' => 'testing', 'DB_CONNECTION' => 'sqlite', 'DB_DATABASE' => $databasePath, 'DB_URL' => '', 'CACHE_STORE' => 'array', 'SESSION_DRIVER' => 'array',
            'LARAVEL_STORAGE_PATH' => $storagePath, 'PICKUP_RECEIPT_CHANNEL' => '', 'MAIL_MAILER' => 'array', 'MOBILE_PUSH_ENABLED' => 'false',
        ]);
        $server->start();
        $ready = false;
        for ($attempt = 0; $attempt < 50; $attempt++) {
            $socket = @fsockopen('127.0.0.1', 8001, $errorNumber, $errorMessage, 0.2);
            if ($socket) {
                fclose($socket);
                $ready = true;
                break;
            }
            usleep(100000);
        }
        expect($ready && $server->isRunning())->toBeTrue();
        (new Process(['adb', '-s', $serial, 'reverse', 'tcp:8000', 'tcp:8001']))->mustRun();
        $classes = $mobileM2 ? 'com.retailpickup.mobile.dev.MobileExecutionAndroidTest,com.retailpickup.mobile.dev.MobileLocalStoreTest' : 'com.retailpickup.mobile.dev.SecureSessionStoreTest,com.retailpickup.mobile.dev.MobileWorkspaceTest,com.getcapacitor.myapp.ExampleInstrumentedTest';
        if ($mobileM3) {
            $classes = 'com.retailpickup.mobile.dev.MobileProofAndroidTest,com.retailpickup.mobile.dev.MobileLocalStoreTest';
        }
        if ($mobileM4) {
            $classes = 'com.retailpickup.mobile.dev.MobileHandoverAndroidTest,com.retailpickup.mobile.dev.MobileLocalStoreTest';
        }
        (new Process(['adb', '-s', $serial, 'install', '-r', '-g', base_path('android/app/build/outputs/apk/debug/app-debug.apk')]))->mustRun();
        $runner = new Process(['cmd', '/c', 'gradlew.bat', ':app:connectedDebugAndroidTest', '-Pandroid.testInstrumentationRunnerArguments.mobileSmoke=true', '-Pandroid.testInstrumentationRunnerArguments.mobileM2='.($mobileM2 ? 'true' : 'false'), '-Pandroid.testInstrumentationRunnerArguments.mobileM3='.($mobileM3 ? 'true' : 'false'), '-Pandroid.testInstrumentationRunnerArguments.mobileM4='.($mobileM4 ? 'true' : 'false'), '-Pandroid.testInstrumentationRunnerArguments.class='.$classes, '--console=plain'], base_path('android'), ['ANDROID_SERIAL' => $serial], null, 240);
        if ($processDeath) {
            $buildTests = new Process(['cmd', '/c', 'gradlew.bat', ':app:assembleDebugAndroidTest', '--console=plain'], base_path('android'), [], null, 240);
            $buildTests->mustRun();
            (new Process(['adb', '-s', $serial, 'install', '-r', '-g', base_path('android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk')]))->mustRun();
            foreach (['prepareRecovery', 'recoverInDifferentProcessWithoutAutomaticSubmit'] as $phase) {
                $phaseTest = new Process(['adb', '-s', $serial, 'shell', 'am', 'instrument', '-w', '-e', 'mobileProcessDeath', 'true', '-e', 'captureSource', getenv('MOBILE_ANDROID_CAPTURE_DEATH') ?: 'none', '-e', 'class', 'com.retailpickup.mobile.dev.MobileDraftProcessDeathTest#'.$phase, 'com.retailpickup.mobile.dev.test/androidx.test.runner.AndroidJUnitRunner'], base_path(), [], null, 90);
                $phaseTest->mustRun();
                expect($phaseTest->getOutput())->toContain('OK (1 test)');
                if ($phase === 'prepareRecovery') {
                    (new Process(['adb', '-s', $serial, 'shell', 'am', 'force-stop', 'com.retailpickup.mobile.dev']))->mustRun();
                    $this->assertDatabaseCount('pickup_records', 0);
                }
            }
        } else {
            $runner->run();
            expect($runner->isSuccessful())->toBeTrue(substr($runner->getOutput().$runner->getErrorOutput(), -6000));
        }
        if ($processDeath) {
            $this->assertDatabaseCount('pickup_records', 0);
        }
        $this->assertDatabaseCount('personal_access_tokens', 0);
        $this->assertDatabaseCount('pickup_tasks', $processDeath ? 1 : ($mobileM4 ? 23 : ($mobileM3 ? 1 : ($mobileM2 ? 5 : 23))));
        expect(PickupTask::where('status', 'ASSIGNED')->count())->toBe($processDeath ? 1 : ($mobileM3 || $mobileM4 ? 0 : ($mobileM2 ? 4 : 22)));
        $this->assertDatabaseCount('pickup_task_events', $mobileM3 ? 3 : ($mobileM2 ? 9 : 0));
        if ($mobileM3) {
            $this->assertDatabaseCount('pickup_visits', 1);
            $this->assertDatabaseCount('pickup_records', 1);
            $this->assertDatabaseCount('pickup_attachments', 5);
        }
        if ($mobileM2) {
            $this->assertDatabaseCount('pickup_visits', 2);
            $this->assertDatabaseCount('pickup_records', 0);
            expect(PickupTask::find(2)->status)->toBe('NO_PACKAGES')->and(PickupTask::find(4)->previous_task_id)->toBe(2);
            expect(PickupTask::find(5)->previous_task_id)->toBeNull()->and(PickupTask::find(5)->created_by)->toBe($staff->id)->and(PickupTask::find(5)->assigned_staff_id)->toBe($staff->id);
        }
        if ($mobileM4) {
            $this->assertDatabaseCount('handover_sessions', 1);
            $this->assertDatabaseCount('handover_items', 2);
            $this->assertDatabaseCount('handover_events', 7);
            expect(HandoverSession::first()->version)->toBe(7)->and(HandoverSession::first()->status)->toBe('CLOSED');
            $this->assertDatabaseHas('handover_items', ['status' => 'DISCREPANCY', 'discrepancy_notes' => 'Kategori berbeda meskipun total sama']);
        }
    } finally {
        $server?->stop();
        (new Process(['adb', '-s', $serial, 'reverse', '--remove', 'tcp:8000']))->run();
        DB::disconnect('mobile_smoke');
        config(['database.default' => $original]);
        if (is_string($databasePath) && is_file($databasePath)) {
            unlink($databasePath);
        }
        if (str_starts_with($storagePath, sys_get_temp_dir().DIRECTORY_SEPARATOR) && is_dir($storagePath)) {
            File::deleteDirectory($storagePath);
        }
    }
});
