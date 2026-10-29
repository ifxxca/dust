<?php

use App\Actions\Handover\CreateSession;
use App\Actions\Handover\VerifyItem;
use App\Actions\Pickup\FinalizePickup;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\Process\Process;

test('operational lock interleavings avoid deadlocks and preserve authoritative records', function (string $scenario) {
    $port = (int) getenv('HARDENING_MYSQL_PORT');
    if ($port < 1024) {
        $this->markTestSkipped('Requires an explicitly provisioned disposable MySQL port.');
    }
    $database = 'hardening_test_'.bin2hex(random_bytes(8));
    $settings = [...config('database.connections.mysql'), 'host' => '127.0.0.1', 'port' => $port, 'username' => 'root', 'password' => '', 'database' => null];
    config(['database.connections.hardening_server' => $settings]);
    $dataDirectory = DB::connection('hardening_server')->selectOne('select @@datadir as directory')->directory;
    if (! str_contains($dataDirectory, 'dust-hardening-mysql-')) {
        $this->fail('Refusing concurrency setup outside the disposable MySQL data directory.');
    }
    DB::connection('hardening_server')->statement('CREATE DATABASE `'.$database.'`');
    config(['database.connections.hardening_test' => [...$settings, 'database' => $database], 'database.default' => 'hardening_test']);
    $gate = sys_get_temp_dir().DIRECTORY_SEPARATOR.$database;
    $processes = [];
    try {
        Artisan::call('migrate', ['--database' => 'hardening_test', '--force' => true, '--no-interaction' => true]);
        $actor = User::factory()->create(['role' => $scenario === 'finalize' ? 'pickup_staff' : 'admin_supervisor']);
        $other = User::factory()->create(['role' => 'admin_supervisor']);
        $task = PickupTask::factory()->create(['status' => $scenario === 'finalize' ? 'ASSIGNED' : 'PICKED_UP', 'assigned_staff_id' => $actor->id, 'execution_started_at' => now()]);
        $session = null;
        if ($scenario === 'finalize') {
            $task->visits()->create(['staff_id' => $actor->id, 'started_at' => now(), 'outcome' => 'COLLECTED', 'recorded_at' => now()]);
            PickupTask::factory()->has(PickupRecord::factory(), 'proof')->create(['customer_id' => $task->customer_id, 'scheduled_at' => $task->scheduled_at, 'status' => 'PICKED_UP']);
        } else {
            PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
            $session = app(CreateSession::class)->handle($actor, [$task->id], (string) Str::uuid());
            if ($scenario === 'verification_correction') {
                $session = app(VerifyItem::class)->handle($other, $session->id, $session->items()->sole()->id, ['expected_version' => 1, 'expected_pickup_revision' => 0, 'manual_hybrid' => 2, 'cashless_hybrid' => 1, 'css_orion' => 0]);
            }
        }
        $config = ['database' => $database, 'port' => $port, 'gate' => $gate, 'task_id' => $task->id,
            'session_id' => $session?->id, 'session_version' => $session?->version, 'item_id' => $session?->items()->sole()->id, 'key' => (string) Str::uuid()];
        file_put_contents($gate.'.json', json_encode($config, JSON_THROW_ON_ERROR));
        $operations = $scenario === 'finalize' ? ['finalize', 'reconcile'] : ['correct', $scenario === 'verification_correction' ? 'correct_verification' : 'verify'];
        $actors = [$actor->id, $other->id];
        foreach ($operations as $index => $operation) {
            if ($index === 1) {
                $deadline = microtime(true) + 10;
                while (! file_exists($gate.'.held') && microtime(true) < $deadline) {
                    usleep(10000);
                }
                expect(file_exists($gate.'.held'))->toBeTrue();
            }
            $process = new Process([PHP_BINARY, __DIR__.'/operational-lock-worker.php', $gate.'.json', $operation, (string) $actors[$index]], base_path(), [
                'APP_ENV' => 'testing', 'QUEUE_CONNECTION' => 'sync', 'MOBILE_PUSH_ENABLED' => 'false', 'PICKUP_AUTOMATION_ENABLED' => 'false', 'MAIL_MAILER' => 'array',
            ], null, 25);
            $process->start();
            $processes[] = $process;
        }
        $firstLock = trim(file_get_contents($gate.'.held'));
        $secondGate = $firstLock === 'pickup_tasks' ? '.second-held' : '.second-attempted';
        $deadline = microtime(true) + 10;
        while (! file_exists($gate.$secondGate) && microtime(true) < $deadline) {
            usleep(10000);
        }
        expect(file_exists($gate.$secondGate))->toBeTrue();
        touch($gate.'.release');
        $results = [];
        foreach ($processes as $process) {
            $process->wait();
            expect($process->getErrorOutput())->toBe('');
            $results[] = json_decode($process->getOutput(), true, flags: JSON_THROW_ON_ERROR);
        }
        expect($results[0]['status'])->toBe(200);
        expect($results[1]['status'])->toBeIn([200, 409]);
        if ($scenario === 'finalize') {
            expect($task->proof()->count())->toBe(1);
            expect($task->cashlessAwbs()->count())->toBe(1);
            expect($task->proof->cashless_hybrid)->toBe(1);
            $payload = ['expected_version' => 1, 'submission_key' => $config['key'], 'manual_hybrid' => 2, 'cashless_hybrid' => 1, 'css_orion' => 0,
                'cashless_capture' => true, 'cashless_awbs' => ['TGLOCK001'], 'signature' => UploadedFile::fake()->image('signature.png')];
            $record = app(FinalizePickup::class)->handle($actor, $task->id, $payload);
            expect($record->id)->toBe($task->proof->id);
            expect($record->attachments()->count())->toBe(1);
            $this->assertDatabaseCount('cashless_entry_batches', 1);
            $rejected = PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $actor->id, 'execution_started_at' => now()]);
            $rejected->visits()->create(['staff_id' => $actor->id, 'started_at' => now(), 'outcome' => 'COLLECTED', 'recorded_at' => now()]);
            expect(fn () => app(FinalizePickup::class)->handle($actor, $rejected->id, [...$payload, 'submission_key' => (string) Str::uuid()]))->toThrow(ValidationException::class);
            expect($rejected->proof()->exists())->toBeFalse();
            expect($rejected->cashlessAwbs()->exists())->toBeFalse();
            expect($rejected->fresh()->status)->toBe('ASSIGNED');
            $this->assertDatabaseCount('cashless_entry_batches', 1);
        } else {
            expect($results[1]['actor_locks'])->toBe(1);
            expect($task->proof->manual_hybrid)->toBe(2);
            expect($task->proof->revisions()->count())->toBe(1);
            expect($session->items()->count())->toBe(1);
        }
    } finally {
        foreach ($processes as $process) {
            if ($process->isRunning()) {
                $process->stop();
            }
        }
        config(['database.default' => 'sqlite']);
        DB::purge('hardening_test');
        DB::connection('hardening_server')->statement('DROP DATABASE `'.$database.'`');
        foreach (glob($gate.'.*') ?: [] as $file) {
            if (is_file($file)) {
                unlink($file);
            }
        }
    }
})->with(['finalize', 'correction', 'verification_correction'])->group('mysql-concurrency');
