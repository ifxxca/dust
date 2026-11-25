<?php

use App\Actions\Monitoring\OperationsTelemetry;
use App\Actions\Monitoring\QueryItControlCenter;
use App\Actions\Monitoring\RecordOperationsTelemetry;
use App\Actions\Reports\ReportPipelineFailure;
use App\Jobs\ImportJneReportAwbs;
use App\Models\PickupCustomerReconciliation;
use App\Models\PickupProcessingReconciliation;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Console\Events\CommandFinished;
use Illuminate\Console\Events\CommandStarting;
use Illuminate\Console\Events\ScheduledBackgroundTaskFinished;
use Illuminate\Console\Events\ScheduledTaskFinished;
use Illuminate\Console\Events\ScheduledTaskStarting;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Database\QueryException;
use Illuminate\Http\UploadedFile;
use Illuminate\Queue\Events\JobExceptionOccurred;
use Illuminate\Queue\Events\JobProcessing;
use Illuminate\Queue\Events\Looping;
use Illuminate\Queue\Events\WorkerStopping;
use Illuminate\Queue\WorkerOptions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;
use Symfony\Component\Console\Input\ArrayInput;
use Symfony\Component\Console\Output\BufferedOutput;

beforeEach(function () {
    $this->withoutVite();
    config(['control-center.path' => storage_path('framework/testing/it-control-center-'.Str::uuid()), 'control-center.enabled' => true]);
});

afterEach(function () {
    $path = realpath(config('control-center.path'));
    $parent = realpath(storage_path('framework/testing'));
    if ($path && $parent && str_starts_with($path, $parent.DIRECTORY_SEPARATOR.'it-control-center-')) {
        File::deleteDirectory($path);
    }
});

test('only active administrators can read the control center', function (string $role, bool $active, int $status) {
    $this->actingAs(User::factory()->create(['role' => $role, 'is_active' => $active]))
        ->get(route('it-control-center'))->assertStatus($status);
})->with([['admin_supervisor', true, 200], ['cs', true, 403], ['pickup_staff', true, 403], ['retail_staff', true, 403], ['admin_supervisor', false, 403]]);

test('guest monitoring redirects to login and no mutation route exists', function () {
    $this->get(route('it-control-center'))->assertRedirect(route('login'));
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))
        ->post(route('it-control-center'))->assertStatus(405);
});

test('queue metrics separate ready reserved and delayed jobs without exposing payloads', function () {
    $this->freezeTime();
    foreach ([['attempts' => 0, 'reserved_at' => null, 'available_at' => now()->timestamp - 1], ['attempts' => 0, 'reserved_at' => null, 'available_at' => now()->timestamp + 120], ['attempts' => 1, 'reserved_at' => now()->timestamp, 'available_at' => now()->timestamp - 1], ['attempts' => 2, 'reserved_at' => now()->timestamp - 100, 'available_at' => now()->timestamp - 1]] as $row) {
        DB::table('jobs')->insert(['queue' => 'default', 'payload' => 'PRIVATE_JOB_PAYLOAD', 'created_at' => now()->timestamp - 200, ...$row]);
    }
    DB::table('failed_jobs')->insert(['uuid' => Str::uuid(), 'connection' => 'database', 'queue' => 'default', 'payload' => 'PRIVATE_JOB_PAYLOAD', 'exception' => 'SQLSTATE[40001]: password=PRIVATE_DATABASE_PASSWORD customer@example.test 0166000001234', 'failed_at' => now()]);
    DB::table('failed_jobs')->insert(['uuid' => Str::uuid(), 'connection' => 'database', 'queue' => 'default', 'payload' => 'PRIVATE_JOB_PAYLOAD', 'exception' => 'Old failure', 'failed_at' => now()->subDays(2)]);
    $snapshot = app(QueryItControlCenter::class)->handle();
    expect(collect($snapshot['queues']['rows'])->firstWhere('name', 'default'))
        ->toMatchArray(['total' => 4, 'pending' => 1, 'reserved' => 2, 'delayed' => 1, 'failed' => 1, 'retries' => 1, 'expired_reservations' => 1, 'oldest_pending_seconds' => 200, 'worker_timeout' => null, 'timeout_risk' => null]);
    expect($snapshot['diagnostics'][0]['code'])->toBe('DB_DEADLOCK');
    expect(json_encode($snapshot))->not->toContain('PRIVATE_', 'customer@example.test', '0166000001234');
    expect(DB::table('jobs')->count())->toBe(4);
});

test('heartbeat evidence distinguishes busy idle stopped stale and unknown workers', function () {
    $this->freezeTime();
    foreach ([['busy', 'BUSY', now()], ['idle', 'IDLE', now()], ['stopped', 'STOPPED', now()], ['stale', 'BUSY', now()->subMinutes(3)]] as [$id, $state, $at]) {
        app(OperationsTelemetry::class)->write('workers', $id, ['identity' => $id, 'runtime' => 'PHP queue', 'queue' => 'default', 'connection' => 'database', 'state' => $state, 'observed_at' => $at->toIso8601String(), 'job' => 'ImportJneReportAwbs', 'job_id' => '123', 'timeout' => 95]);
    }
    $snapshot = app(QueryItControlCenter::class)->handle();
    $workers = collect($snapshot['workers'])->keyBy('identity');
    expect($workers['busy'])->toMatchArray(['state' => 'BUSY', 'job' => 'ImportJneReportAwbs']);
    expect($workers['idle'])->toMatchArray(['state' => 'IDLE', 'job' => null]);
    expect($workers['stopped']['state'])->toBe('STOPPED');
    expect($workers['stale'])->toMatchArray(['state' => 'UNKNOWN', 'stale' => true, 'job' => null]);
    expect($workers[config('jne-reports.worker_id')]['state'])->toBe('UNKNOWN');
    expect(collect($snapshot['queues']['rows'])->firstWhere('name', 'default')['timeout_risk'])->toBeTrue();
});

test('scheduler reports actual last run successes failures and nonzero exit codes', function () {
    app(Kernel::class)->bootstrap();
    $task = collect(app(Schedule::class)->events())->first(fn ($event) => str_contains($event->command ?? '', 'jne-reports:queue-due'));
    $this->freezeTime();
    Event::dispatch(new ScheduledTaskStarting($task));
    $task->exitCode = 0;
    Event::dispatch(new ScheduledTaskFinished($task, .25));
    $first = now()->toIso8601String();
    $this->travel(1)->minutes();
    Event::dispatch(new ScheduledTaskStarting($task));
    $task->exitCode = 1;
    Event::dispatch(new ScheduledTaskFinished($task, .5));
    $snapshot = app(QueryItControlCenter::class)->handle();
    expect($snapshot['scheduler'])->toHaveCount(4);
    $row = collect($snapshot['scheduler'])->firstWhere('name', 'jne-reports:queue-due');
    expect($row)->toMatchArray(['state' => 'FAILED', 'last_run' => now()->toIso8601String(), 'last_success' => $first, 'last_failure' => now()->toIso8601String(), 'duration_ms' => 500, 'missed' => null]);
    expect(collect($snapshot['scheduler'])->firstWhere('name', 'pickups:generate')['state'])->toBe('UNKNOWN');
});

test('integration recovery and failover evidence never claim live external health', function () {
    $this->freezeTime();
    ReportJob::factory()->create(['status' => 'NEEDS_ATTENTION', 'error_message' => 'FORM_VALUE: password=SECRET_TEST', 'updated_at' => now()->subMinutes(5)]);
    $job = ReportJob::factory()->create(['status' => 'COMPLETED', 'started_at' => now()->subMinutes(2), 'completed_at' => now(), 'parameters' => ['apex_history' => ['origin' => 'https://dash-ccc02.jne.co.id'], 'awbs' => ['PRIVATE_AWB']], 'import_status' => 'IMPORTED', 'imported_at' => now(), 'imported_awb_count' => 34, 'duplicate_awb_count' => 2, 'projection_status' => 'FAILED', 'projection_error' => 'SQLSTATE[40001]: SECRET_TEST']);
    app(OperationsTelemetry::class)->write('workers', 'apex-test', ['identity' => 'apex-test', 'runtime' => 'Node APEX', 'state' => 'IDLE', 'observed_at' => now()->toIso8601String(), 'failovers' => [['observed_at' => now()->toIso8601String(), 'from' => 'dash-ccc01.jne.co.id', 'to' => 'dash-ccc02.jne.co.id']]]);
    $snapshot = app(QueryItControlCenter::class)->handle();
    expect($snapshot['integrations'][0])->toMatchArray(['state' => 'UNKNOWN', 'recorded_endpoint' => 'dash-ccc02.jne.co.id', 'endpoint' => null, 'recent_failures' => 1]);
    expect($snapshot['integrations'][0]['last_success'])->toBe(now()->toIso8601String());
    expect($snapshot['integrations'][0]['failovers'][0]['to'])->toBe('dash-ccc02.jne.co.id');
    expect(collect($snapshot['pipelines'])->firstWhere('id', 'report:'.$job->id.':import'))->toMatchArray(['stage' => 'IMPORTED', 'outcome' => 'SUCCESS', 'records' => 34, 'duplicates' => 2, 'duration_ms' => null]);
    expect(collect($snapshot['pipelines'])->firstWhere('id', 'report:'.$job->id.':projection')['error']['code'])->toBe('DB_DEADLOCK');
    expect(json_encode($snapshot))->not->toContain('SECRET_TEST', 'PRIVATE_AWB');
});

test('unavailable telemetry and insufficient performance samples remain unknown', function () {
    $snapshot = app(QueryItControlCenter::class)->handle();
    expect($snapshot['workers'])->each(fn ($row) => $row->state->toBe('UNKNOWN'));
    expect($snapshot['performance'])->toMatchArray(['sample_count' => 0, 'duration_p50_ms' => null, 'duration_p95_ms' => null, 'throughput' => null, 'backlog_trend' => null]);
    expect(collect($snapshot['services'])->firstWhere('name', 'Infrastructure / CPU / RAM / disk'))->toMatchArray(['state' => 'UNKNOWN', 'coverage' => 'UNAVAILABLE']);
});

test('bounded attempt samples expose retry failure and percentile measurements', function () {
    $this->freezeTime();
    $runs = [];
    foreach ([10, 20, 30, 40, 50] as $index => $duration) {
        $runs[] = ['duration_ms' => $duration, 'wait_ms' => 100, 'job_id' => (string) $index, 'job' => 'ImportJneReportAwbs', 'observed_at' => now()->toIso8601String(), 'state' => $index === 0 ? 'FAILED_ATTEMPT' : 'PROCESSED', 'attempts' => 2, 'error' => ['code' => 'TIMEOUT']];
    }
    app(OperationsTelemetry::class)->write('workers', 'measured', ['identity' => 'measured', 'runtime' => 'PHP queue', 'state' => 'IDLE', 'observed_at' => now()->toIso8601String(), 'runs' => $runs]);
    $snapshot = app(QueryItControlCenter::class)->handle();
    expect($snapshot['performance'])->toMatchArray(['sample_count' => 5, 'duration_p50_ms' => 30, 'duration_p95_ms' => 50, 'wait_p50_ms' => 100, 'failed_attempt_percent' => 20.0]);
    expect(collect($snapshot['diagnostics'])->firstWhere('code', 'TIMEOUT')['id'])->toBe('attempt:0:2');
});

test('telemetry storage failure cannot stop a worker operation', function () {
    config(['control-center.path' => __FILE__]);
    app(RecordOperationsTelemetry::class)->worker('IDLE', 'database', 'default');
    app(RecordOperationsTelemetry::class)->exception(new RuntimeException('PRIVATE_SECRET'));
    expect(app(OperationsTelemetry::class)->read('workers'))->toBe([]);
});

test('real queue lifecycle events expose current job and preserve failure evidence without its message', function () {
    $id = Queue::connection('database')->push(new ImportJneReportAwbs(123), queue: 'default');
    $job = Queue::connection('database')->pop('default');
    Event::dispatch(new Looping('database', 'default', new WorkerOptions(timeout: 75)));
    Event::dispatch(new JobProcessing('database', $job));
    $worker = collect(app(QueryItControlCenter::class)->handle()['workers'])->firstWhere('runtime', 'PHP queue');
    expect($worker)->toMatchArray(['state' => 'BUSY', 'job' => 'ImportJneReportAwbs', 'job_id' => (string) $id, 'timeout' => 75]);
    Event::dispatch(new JobExceptionOccurred('database', $job, new RuntimeException('SECRET_CREDENTIAL: private@example.test')));
    $snapshot = app(QueryItControlCenter::class)->handle();
    expect(collect($snapshot['workers'])->firstWhere('runtime', 'PHP queue')['state'])->toBe('IDLE');
    expect($snapshot['diagnostics'])->toHaveCount(1);
    expect(json_encode($snapshot))->not->toContain('SECRET_CREDENTIAL', 'private@example.test');
    Event::dispatch(new WorkerStopping(connectionName: 'database', queue: 'default'));
    expect(collect(app(QueryItControlCenter::class)->handle()['workers'])->firstWhere('runtime', 'PHP queue')['state'])->toBe('STOPPED');
});

test('caught pipeline database errors retain safe correlation without SQL or bindings', function () {
    $databaseError = new PDOException('SQLSTATE[40001]: deadlock');
    $databaseError->errorInfo = ['40001', 1213, 'SECRET_BINDING'];
    $exception = new QueryException('sqlite', 'select SECRET_BINDING', ['private@example.test'], $databaseError);
    app(ReportPipelineFailure::class)->handle($exception, 'projection', 123);
    $snapshot = app(QueryItControlCenter::class)->handle();
    expect(collect($snapshot['diagnostics'])->firstWhere('id', 'report:123')['code'])->toBe('DB_DEADLOCK');
    expect(json_encode($snapshot))->not->toContain('SECRET_BINDING', 'private@example.test');
});

test('monitoring uses bounded sources and never probes integrations or dispatches work', function () {
    Http::preventStrayRequests();
    Queue::fake();
    ReportJob::factory()->count(105)->create(['status' => 'COMPLETED']);
    DB::enableQueryLog();
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->get(route('it-control-center'))->assertOk()
        ->assertHeader('Cache-Control', 'no-store, private')
        ->assertInertia(fn (Assert $page) => $page->component('it-control-center')->has('monitoring.pipelines', 100));
    $queries = collect(DB::getQueryLog())->pluck('query');
    DB::disableQueryLog();
    expect($queries->filter(fn (string $query): bool => str_contains($query, 'jne_shipments') || str_contains($query, 'jne_report_awbs') || str_contains($query, 'reconciliation_events')))->toBeEmpty();
    expect($queries->count())->toBeLessThan(35);
    Http::assertNothingSent();
    Queue::assertNothingPushed();
});

test('old active reports remain visible beyond the recent ID window and retail stages use actual status names', function () {
    $old = ReportJob::factory()->create(['status' => 'WAITING_APEX']);
    ReportJob::factory()->create(['status' => 'COLLECTING_SOURCES', 'source' => 'hybrid', 'report_type' => 'combined']);
    ReportJob::factory()->count(105)->create(['status' => 'COMPLETED']);
    $snapshot = app(QueryItControlCenter::class)->handle();
    expect($snapshot['pipelines'][0]['stage'])->toBe('COLLECTING_SOURCES');
    expect(collect($snapshot['pipelines'])->firstWhere('id', 'report:'.$old->id)['stage'])->toBe('WAITING_APEX');
    expect(collect($snapshot['backlogs'])->sum('count'))->toBe(2);
});

test('recycled workers move to bounded history without inflating unavailable worker counts or losing run samples', function () {
    config(['queue.default' => 'database']);
    $this->freezeTime();
    $telemetry = app(OperationsTelemetry::class);
    for ($index = 0; $index < 60; $index++) {
        $telemetry->write('workers', 'retired-'.$index, [
            'identity' => 'retired-'.$index, 'runtime' => 'PHP queue', 'queue' => 'default', 'connection' => 'database',
            'state' => 'STOPPED', 'observed_at' => now()->subMinutes(5)->toIso8601String(),
            'runs' => [['job_id' => (string) $index, 'job' => 'ImportJneReportAwbs', 'state' => 'PROCESSED', 'observed_at' => now()->subMinutes(6)->toIso8601String(), 'duration_ms' => 30]],
        ]);
    }
    $telemetry->write('workers', 'active', ['identity' => 'active', 'runtime' => 'PHP queue', 'queue' => 'default,reconciliation,documents,deliveries,mobile-push', 'connection' => 'database', 'state' => 'IDLE', 'observed_at' => now()->toIso8601String()]);
    $telemetry->write('workers', 'no-stop-evidence', ['identity' => 'no-stop-evidence', 'runtime' => 'PHP queue', 'queue' => 'default', 'connection' => 'database', 'state' => 'BUSY', 'observed_at' => now()->subMinutes(5)->toIso8601String()]);
    $snapshot = app(QueryItControlCenter::class)->handle();
    expect($snapshot['retired_workers_count'])->toBe(60);
    expect($snapshot['retired_workers'])->toHaveCount(20);
    expect($snapshot['retired_workers'][0])->toMatchArray(['state' => 'STOPPED', 'stale' => true]);
    expect(collect($snapshot['workers'])->where('state', 'STOPPED'))->toBeEmpty();
    expect(collect($snapshot['workers'])->firstWhere('identity', 'no-stop-evidence')['state'])->toBe('UNKNOWN');
    expect($snapshot['overview'])->toMatchArray(['workers_available' => 1, 'workers_unknown' => 3]);
    expect($snapshot['performance']['sample_count'])->toBe(60);
    expect(collect($snapshot['services'])->firstWhere('name', 'PHP queues')['state'])->toBe('HEALTHY');
});

test('service health uses the worker for its own queue and never treats past job success as a heartbeat', function () {
    config(['queue.default' => 'database']);
    $this->freezeTime();
    ReportJob::factory()->create(['status' => 'COMPLETED', 'completed_at' => now(), 'import_status' => 'IMPORTED', 'imported_at' => now()]);
    $before = app(QueryItControlCenter::class)->handle();
    expect(collect($before['services'])->firstWhere('name', 'CSV import')['state'])->toBe('UNKNOWN');
    $telemetry = app(OperationsTelemetry::class);
    $telemetry->write('workers', 'import', ['identity' => 'import', 'runtime' => 'PHP queue', 'queue' => 'default', 'connection' => 'database', 'state' => 'IDLE', 'observed_at' => now()->toIso8601String()]);
    $telemetry->write('workers', 'documents', ['identity' => 'documents', 'runtime' => 'PHP queue', 'queue' => 'documents', 'connection' => 'database', 'state' => 'UNHEALTHY', 'observed_at' => now()->toIso8601String()]);
    $telemetry->write('workers', 'deliveries', ['identity' => 'deliveries', 'runtime' => 'PHP queue', 'queue' => 'deliveries,mobile-push', 'connection' => 'database', 'state' => 'IDLE', 'observed_at' => now()->toIso8601String()]);
    $services = collect(app(QueryItControlCenter::class)->handle()['services'])->keyBy('name');
    expect($services['CSV import']['state'])->toBe('HEALTHY');
    expect($services['Customer mapping']['state'])->toBe('HEALTHY');
    expect($services['Dokumen AWB']['state'])->toBe('UNHEALTHY');
    expect($services['Rekonsiliasi & kompilasi']['state'])->toBe('UNKNOWN');
    expect($services['PHP queues']['state'])->toBe('DEGRADED');
    expect($services['SMTP email'])->toMatchArray(['state' => 'HEALTHY', 'readiness_state' => 'UNKNOWN']);
    expect($services['FCM push'])->toMatchArray(['state' => 'HEALTHY', 'readiness_state' => 'UNKNOWN']);
    $this->travel(3)->minutes();
    expect(collect(app(QueryItControlCenter::class)->handle()['services'])->firstWhere('name', 'CSV import')['state'])->toBe('UNKNOWN');
});

test('scheduler health respects different cron frequencies policy skips stale events and recovery', function () {
    $this->travelTo(now()->startOfHour()->addMinutes(6));
    app(Kernel::class)->bootstrap();
    $telemetry = app(OperationsTelemetry::class);
    foreach (app(Schedule::class)->events() as $event) {
        $name = RecordOperationsTelemetry::scheduleName($event);
        $telemetry->write('schedules', $name, ['identity' => $name, 'state' => $name === 'pickups:generate' ? 'SKIPPED' : 'SUCCESS', 'observed_at' => ($name === 'pickups:queue-automation --recover' ? now()->subMinutes(6) : now())->toIso8601String()]);
    }
    $first = app(QueryItControlCenter::class)->handle();
    expect(collect($first['scheduler'])->firstWhere('name', 'pickups:queue-automation --recover')['state'])->toBe('SUCCESS');
    expect(collect($first['services'])->firstWhere('name', 'Scheduler')['state'])->toBe('HEALTHY');
    $telemetry->write('schedules', 'jne-reports:queue-due', ['identity' => 'jne-reports:queue-due', 'state' => 'FAILED', 'observed_at' => now()->toIso8601String()]);
    expect(collect(app(QueryItControlCenter::class)->handle()['services'])->firstWhere('name', 'Scheduler'))->toMatchArray(['state' => 'HEALTHY', 'execution_state' => 'NEEDS_ATTENTION']);
    $this->travel(10)->minutes();
    $stale = app(QueryItControlCenter::class)->handle();
    expect($stale['scheduler'])->each(fn ($row) => $row->state->toBe('UNKNOWN'));
    expect(collect($stale['scheduler'])->firstWhere('name', 'jne-reports:queue-due')['last_state'])->toBe('FAILED');
    expect(collect($stale['services'])->firstWhere('name', 'Scheduler')['state'])->toBe('UNKNOWN');
});

test('integration checks expire independently of heartbeat and keep source and endpoint boundaries', function () {
    $this->freezeTime();
    $telemetry = app(OperationsTelemetry::class);
    $telemetry->write('workers', 'node', ['identity' => 'node', 'runtime' => 'Node Hybrid', 'state' => 'IDLE', 'observed_at' => now()->toIso8601String(), 'integrations' => [
        'roberto' => ['state' => 'HEALTHY', 'observed_at' => now()->subMinutes(4)->toIso8601String(), 'endpoint' => 'PRIVATE_TOKEN.example.test'],
        'nuralamt' => ['state' => 'UNHEALTHY', 'observed_at' => now()->subMinute()->toIso8601String()],
    ]]);
    $snapshot = app(QueryItControlCenter::class)->handle();
    $integrations = collect($snapshot['integrations'])->keyBy('source');
    expect($integrations['roberto'])->toMatchArray(['state' => 'HEALTHY', 'endpoint' => null]);
    expect($integrations['nuralamt']['state'])->toBe('UNHEALTHY');
    expect(collect($snapshot['services'])->firstWhere('name', 'Hybrid PM')['state'])->toBe('HEALTHY');
    expect(collect($snapshot['services'])->firstWhere('name', 'Hybrid Puman'))->toMatchArray(['state' => 'HEALTHY', 'readiness_state' => 'UNHEALTHY']);
    expect(json_encode($snapshot))->not->toContain('PRIVATE_TOKEN');
    $telemetry->write('workers', 'node', ['identity' => 'node', 'runtime' => 'Node Hybrid', 'state' => 'IDLE', 'observed_at' => now()->toIso8601String(), 'integrations' => [
        'roberto' => ['state' => 'HEALTHY', 'observed_at' => now()->subMinutes(12)->toIso8601String()],
        'nuralamt' => ['state' => 'HEALTHY', 'observed_at' => now()->addMinute()->toIso8601String()],
    ]]);
    $expired = app(QueryItControlCenter::class)->handle();
    expect($expired['integrations'])->each(fn ($row) => $row->state->toBe('UNKNOWN'));
    expect(collect($expired['services'])->firstWhere('name', 'Hybrid PM'))->toMatchArray(['state' => 'HEALTHY', 'readiness_state' => 'UNKNOWN']);
});

test('mixed apex endpoint checks are degraded and stopped processes cannot prove a live integration', function () {
    $this->freezeTime();
    foreach ([['one', 'IDLE', 'HEALTHY'], ['two', 'IDLE', 'UNHEALTHY']] as [$identity, $state, $health]) {
        app(OperationsTelemetry::class)->write('workers', $identity, ['identity' => $identity, 'runtime' => 'Node APEX', 'state' => $state, 'observed_at' => now()->toIso8601String(), 'integrations' => ['apex' => ['state' => $health, 'observed_at' => now()->toIso8601String(), 'endpoint' => 'dash-ccc02.jne.co.id']]]);
    }
    $snapshot = app(QueryItControlCenter::class)->handle();
    expect($snapshot['integrations'][0])->toMatchArray(['state' => 'DEGRADED', 'endpoint' => 'dash-ccc02.jne.co.id']);
    foreach (['one', 'two'] as $identity) {
        app(OperationsTelemetry::class)->write('workers', $identity, ['identity' => $identity, 'runtime' => 'Node APEX', 'state' => 'STOPPED', 'observed_at' => now()->toIso8601String(), 'integrations' => ['apex' => ['state' => 'HEALTHY', 'observed_at' => now()->toIso8601String()]]]);
    }
    $stopped = app(QueryItControlCenter::class)->handle();
    expect($stopped['integrations'][0]['state'])->toBe('UNKNOWN');
    expect(collect($stopped['services'])->firstWhere('name', 'APEX JNE CCC')['state'])->toBe('UNHEALTHY');
});

test('authenticated legacy worker requests provide live idle busy and completion evidence without a restart', function () {
    $this->freezeTime();
    config(['jne-reports.worker_token' => str_repeat('secret', 8), 'jne-reports.worker_id' => 'jne-report-1', 'jne-reports.apex_pool_enabled' => true]);
    $headers = ['Authorization' => 'Bearer '.config('jne-reports.worker_token'), 'X-Worker-ID' => 'jne-report-1-instance-1'];
    $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], $headers)->assertNoContent();
    $worker = fn (): array => collect(app(QueryItControlCenter::class)->handle()['workers'])->firstWhere('identity', 'jne-report-1-instance-1:api');
    expect($worker())->toMatchArray(['state' => 'IDLE', 'job_id' => null]);
    expect($worker()['evidence'])->toContain('terautentikasi');
    $job = ReportJob::factory()->create();
    $claim = $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], $headers)->assertOk()->json('data.claim_token');
    expect($worker())->toMatchArray(['state' => 'BUSY', 'job_id' => (string) $job->id]);
    $this->travel(1)->minutes();
    $owned = [...$headers, 'X-Report-Claim' => $claim];
    $this->postJson(route('internal.report-jobs.progress', $job), ['status' => 'WAITING_REPORT'], $owned)->assertOk();
    expect($worker()['observed_at'])->toBe(now()->toIso8601String());
    $this->postJson(route('internal.report-jobs.fail', $job), ['status' => 'NO_DATA', 'error_message' => 'APEX_NO_DATA: PRIVATE_SECRET'], $owned)->assertOk();
    $snapshot = app(QueryItControlCenter::class)->handle();
    expect($worker()['state'])->toBe('IDLE');
    expect($snapshot['integrations'][0]['state'])->toBe('HEALTHY');
    expect(json_encode(app(OperationsTelemetry::class)->read('workers')))->not->toContain($claim, 'PRIVATE_SECRET', config('jne-reports.worker_token'));
    $this->travel(3)->minutes();
    expect($worker()['state'])->toBe('UNKNOWN');
});

test('unauthenticated invalid and foreign-owner requests cannot forge worker telemetry', function () {
    config(['jne-reports.worker_token' => str_repeat('secret', 8), 'jne-reports.worker_id' => 'jne-report-1']);
    $headers = ['Authorization' => 'Bearer '.config('jne-reports.worker_token'), 'X-Worker-ID' => 'jne-report-1'];
    $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()])->assertUnauthorized();
    $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], [...$headers, 'X-Worker-ID' => 'unregistered-worker'])->assertForbidden();
    $this->postJson(route('internal.report-jobs.claim'), [], $headers)->assertUnprocessable();
    $job = ReportJob::factory()->create(['status' => 'WAITING_REPORT', 'worker_id' => 'another-worker', 'claim_token' => Str::random(64), 'lease_expires_at' => now()->addMinutes(5)]);
    $this->postJson(route('internal.report-jobs.progress', $job), ['status' => 'WAITING_REPORT'], [...$headers, 'X-Report-Claim' => 'FORGED_CLAIM'])->assertForbidden();
    expect(app(OperationsTelemetry::class)->read('workers'))->toBe([]);
});

test('native apex heartbeat replaces api fallback without double counting and telemetry failure leaves api responses intact', function () {
    $this->freezeTime();
    config(['jne-reports.worker_token' => str_repeat('secret', 8), 'jne-reports.worker_id' => 'jne-report-1']);
    $headers = ['Authorization' => 'Bearer '.config('jne-reports.worker_token'), 'X-Worker-ID' => 'jne-report-1'];
    $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], $headers)->assertNoContent();
    app(OperationsTelemetry::class)->write('workers', 'jne-report-1:native:123', ['identity' => 'jne-report-1:native:123', 'runtime' => 'Node APEX', 'state' => 'IDLE', 'observed_at' => now()->toIso8601String()]);
    $workers = collect(app(QueryItControlCenter::class)->handle()['workers'])->where('runtime', 'Node APEX');
    expect($workers)->toHaveCount(1);
    expect($workers->first()['identity'])->toBe('jne-report-1:native:123');
    config(['control-center.path' => __FILE__]);
    $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], $headers)->assertNoContent();
});

test('idempotent claim of an old completed report does not fabricate a new successful integration check', function () {
    $this->freezeTime();
    config(['jne-reports.worker_token' => str_repeat('secret', 8), 'jne-reports.worker_id' => 'jne-report-1']);
    $key = (string) Str::uuid();
    ReportJob::factory()->create(['status' => 'COMPLETED', 'worker_id' => 'jne-report-1', 'claim_key' => $key, 'completed_at' => now()->subDay()]);
    $headers = ['Authorization' => 'Bearer '.config('jne-reports.worker_token'), 'X-Worker-ID' => 'jne-report-1'];
    $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => $key], $headers)->assertOk()->assertJsonPath('data.status', 'COMPLETED');
    $snapshot = app(QueryItControlCenter::class)->handle();
    expect(collect($snapshot['workers'])->firstWhere('identity', 'jne-report-1:api')['state'])->toBe('IDLE');
    expect($snapshot['integrations'][0]['state'])->toBe('UNKNOWN');
});

test('hybrid source handoff and replay leave its worker idle while apex processes the same report', function (string $source) {
    $this->freezeTime();
    Storage::fake('jne_reports');
    config(['jne-reports.worker_token' => str_repeat('secret', 8), 'jne-reports.worker_id' => 'jne-report-1']);
    $headers = ['Authorization' => 'Bearer '.config('jne-reports.worker_token'), 'X-Worker-ID' => 'hybrid-'.$source];
    $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], $headers)->assertNoContent();
    $job = ReportJob::factory()->create(['source' => $source, 'report_type' => 'cashless', 'date_from' => '2026-10-23', 'date_thru' => '2026-10-23']);
    $claim = $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], $headers)->assertOk()->json('data.claim_token');
    $owned = [...$headers, 'X-Report-Claim' => $claim];
    foreach (['WAITING_REPORT', 'DOWNLOADING'] as $status) {
        $this->postJson(route('internal.report-jobs.progress', $job), ['status' => $status], $owned)->assertOk();
    }
    $file = fn () => UploadedFile::fake()->createWithContent('source.csv', "Cnote No,HO Date\nCMPRIVATE123,23-OCT-2026 12:00\n");
    $this->postJson(route('internal.report-jobs.source-upload', $job), ['file' => $file()], $owned)->assertOk()->assertJsonPath('data.status', 'WAITING_APEX');
    $snapshot = app(QueryItControlCenter::class)->handle();
    expect(collect($snapshot['workers'])->firstWhere('identity', 'hybrid-'.$source.':api')['state'])->toBe('IDLE');
    expect(collect($snapshot['integrations'])->firstWhere('source', $source)['state'])->toBe('HEALTHY');
    $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], [...$headers, 'X-Worker-ID' => 'jne-report-1'])->assertOk();
    $this->postJson(route('internal.report-jobs.source-upload', $job), ['file' => $file()], $owned)->assertOk()->assertJsonPath('data.status', 'RUNNING');
    $workers = collect(app(QueryItControlCenter::class)->handle()['workers']);
    expect($workers->firstWhere('identity', 'hybrid-'.$source.':api')['state'])->toBe('IDLE');
    expect($workers->firstWhere('identity', 'jne-report-1:api')['state'])->toBe('BUSY');
    expect(json_encode(app(OperationsTelemetry::class)->read('workers')))->not->toContain('CMPRIVATE123', $claim);
})->with(['roberto', 'nuralamt']);

test('queue source failure is sanitized isolated and recovers on the next snapshot', function () {
    $this->freezeTime();
    $query = app(QueryItControlCenter::class);
    config(['queue.connections.database.table' => 'missing_queue_PRIVATE_SECRET']);
    $failed = $query->handle();
    expect($failed['queues']['rows'])->toBeNull();
    expect(collect($failed['source_diagnostics'])->firstWhere('source', 'database_queue'))->toMatchArray(['state' => 'UNKNOWN', 'exception_type' => 'QueryException', 'sqlstate' => 'HY000', 'driver_code' => 1]);
    expect(collect($failed['queues']['failed_rows'])->firstWhere('name', 'default')['failed'])->toBe(0);
    expect(collect($failed['services'])->firstWhere('name', 'Database')['state'])->toBe('HEALTHY');
    expect(json_encode($failed['source_diagnostics']))->not->toContain('PRIVATE_SECRET', 'select ', 'SQL:');
    config(['queue.connections.database.table' => 'jobs']);
    $recovered = $query->handle();
    expect($recovered['unavailable'])->not->toContain('database_queue');
    expect(collect($recovered['queues']['rows'])->firstWhere('name', 'default')['pending'])->toBe(0);
    expect(collect($recovered['source_diagnostics'])->firstWhere('source', 'database_queue')['state'])->toBe('HEALTHY');
});

test('failed job source failure preserves live queue counts and keeps failures unknown', function () {
    config(['queue.failed.table' => 'missing_failed_jobs']);
    $snapshot = app(QueryItControlCenter::class)->handle();
    expect(collect($snapshot['queues']['rows'])->firstWhere('name', 'default'))->toMatchArray(['pending' => 0, 'reserved' => 0, 'failed' => null]);
    expect($snapshot['unavailable'])->toContain('failed_queue_counts:database')->not->toContain('database_queue');
});

test('a healthy idle worker retains recent execution failure and later success separately', function () {
    config(['queue.default' => 'database']);
    $this->freezeTime();
    $telemetry = app(OperationsTelemetry::class);
    $telemetry->write('workers', 'import', ['identity' => 'import', 'runtime' => 'PHP queue', 'queue' => 'default', 'connection' => 'database', 'state' => 'IDLE', 'observed_at' => now()->toIso8601String()]);
    $job = ReportJob::factory()->create(['status' => 'COMPLETED', 'import_status' => 'FAILED', 'import_error' => 'IMPORT_FAILED: PRIVATE_SECRET']);
    $service = fn () => collect(app(QueryItControlCenter::class)->handle()['services'])->firstWhere('name', 'CSV import');
    expect($service())->toMatchArray(['runtime_state' => 'HEALTHY', 'execution_state' => 'NEEDS_ATTENTION', 'recent_failures' => 1]);
    $this->travel(1)->seconds();
    ReportJob::factory()->create(['status' => 'COMPLETED', 'import_status' => 'IMPORTED', 'imported_at' => now()]);
    expect($service())->toMatchArray(['runtime_state' => 'HEALTHY', 'execution_state' => 'HEALTHY', 'recent_failures' => 1]);
    expect($service()['last_failure'])->not->toBeNull();
    expect($job->fresh()->import_status)->toBe('FAILED');
});

test('business unknown and partial records are attention evidence without fabricated failed runs', function () {
    $this->freezeTime();
    ReportJob::factory()->create(['status' => 'NEEDS_ATTENTION', 'error_message' => null, 'projection_status' => 'PENDING', 'import_status' => 'PENDING']);
    $snapshot = app(QueryItControlCenter::class)->handle();
    expect($snapshot['error_summary'])->toMatchArray(['attention_records' => 1, 'error_events' => 0, 'failed_jobs' => 0, 'failed_runs' => 0, 'unique_incidents' => null]);
});

test('error events deduplicate by event id and group by fingerprint correlation and attempt', function () {
    $this->freezeTime();
    $telemetry = app(OperationsTelemetry::class);
    $event = ['event_id' => 'event-1', 'report_id' => 42, 'exception_class' => 'RuntimeException', 'component' => 'CSV import', 'code' => 'IMPORT_FAILED', 'fingerprint' => 'abcdef0123456789', 'attempt' => 1, 'observed_at' => now()->subMinute()->toIso8601String(), 'message' => 'PRIVATE_PAYLOAD'];
    $telemetry->write('errors', 'one', ['observed_at' => now()->toIso8601String(), 'errors' => [$event, [...$event, 'event_id' => 'event-2', 'attempt' => 2, 'observed_at' => now()->toIso8601String()]]]);
    $telemetry->write('errors', 'two', ['observed_at' => now()->toIso8601String(), 'errors' => [$event, [...$event, 'event_id' => 'event-3', 'report_id' => 43]]]);
    $snapshot = app(QueryItControlCenter::class)->handle();
    expect($snapshot['error_summary'])->toMatchArray(['error_events' => 3, 'incident_groups' => 2, 'unique_incidents' => null]);
    expect(collect($snapshot['diagnostics'])->firstWhere('id', 'report:42'))->toMatchArray(['occurrences' => 2, 'attempts' => [1, 2], 'first_at' => now()->subMinute()->toIso8601String(), 'last_at' => now()->toIso8601String()]);
    expect(json_encode($snapshot))->not->toContain('PRIVATE_PAYLOAD');
});

test('worker concurrency timeout risk and elapsed time use lifecycle and the matching connection', function () {
    $this->freezeTime();
    $telemetry = app(OperationsTelemetry::class);
    foreach ([['one', 'database', 'BUSY', 80], ['two', 'database', 'IDLE', 80], ['other', 'redis', 'BUSY', 500]] as [$id, $connection, $state, $timeout]) {
        $telemetry->write('workers', $id, ['identity' => $id, 'runtime' => 'PHP queue', 'connection' => $connection, 'queue' => 'default', 'state' => $state, 'timeout' => $timeout, 'job' => 'TestJob', 'job_started_at' => now()->subSeconds(12)->toIso8601String(), 'attempts' => 2, 'observed_at' => now()->toIso8601String()]);
    }
    $snapshot = app(QueryItControlCenter::class)->handle();
    expect(collect($snapshot['queues']['rows'])->firstWhere('name', 'default'))->toMatchArray(['observed_concurrency' => 2, 'timeout_risk' => false]);
    expect(collect($snapshot['workers'])->firstWhere('identity', 'one'))->toMatchArray(['elapsed_seconds' => 12, 'attempts' => 2]);
    expect(collect($snapshot['workers'])->firstWhere('identity', 'two')['elapsed_seconds'])->toBeNull();
});

test('command lifecycle records names exit codes and durations without arguments or output', function () {
    $this->freezeTime();
    $input = new ArrayInput(['PRIVATE_SECRET']);
    $output = new BufferedOutput;
    Event::dispatch(new CommandStarting('jne-monitoring:rebuild', $input, $output));
    Event::dispatch(new CommandFinished('jne-monitoring:rebuild', $input, $output, 2));
    Event::dispatch(new CommandStarting('unobserved-command', $input, $output));
    $snapshot = app(QueryItControlCenter::class)->handle();
    expect($snapshot['commands'])->toHaveCount(1);
    expect($snapshot['commands'][0])->toMatchArray(['name' => 'jne-monitoring:rebuild', 'state' => 'FAILED', 'exit_code' => 2]);
    expect($snapshot['commands'][0]['duration_ms'])->toBeGreaterThanOrEqual(0);
    expect(json_encode($snapshot['commands']))->not->toContain('PRIVATE_SECRET');
});

test('scheduler exposes next expected UTC instant while retaining its own schedule timezone', function () {
    $this->travelTo('2026-11-06 03:00:00 UTC');
    app(Kernel::class)->bootstrap();
    $event = app(Schedule::class)->command('test:timezone')->dailyAt('09:30')->timezone('Asia/Bangkok');
    $rows = app(QueryItControlCenter::class)->handle()['scheduler'];
    expect(collect($rows)->firstWhere('name', 'test:timezone'))->toMatchArray(['timezone' => 'Asia/Bangkok', 'next_expected_at' => '2026-11-07T02:30:00+00:00', 'missed' => null]);
});

test('reconciliation failures and compilation attention remain visible with a healthy reconciliation worker', function () {
    config(['queue.default' => 'database']);
    $this->freezeTime();
    PickupProcessingReconciliation::factory()->create(['status' => 'FAILED', 'last_error' => 'IMPORT_FAILED: PRIVATE_SECRET']);
    PickupCustomerReconciliation::factory()->create(['status' => 'PARTIAL']);
    app(OperationsTelemetry::class)->write('workers', 'reconciliation', ['identity' => 'reconciliation', 'runtime' => 'PHP queue', 'queue' => 'reconciliation', 'connection' => 'database', 'state' => 'IDLE', 'observed_at' => now()->toIso8601String()]);
    $snapshot = app(QueryItControlCenter::class)->handle();
    expect(collect($snapshot['services'])->firstWhere('name', 'Rekonsiliasi & kompilasi'))->toMatchArray(['runtime_state' => 'HEALTHY', 'execution_state' => 'NEEDS_ATTENTION', 'recent_failures' => 2]);
    expect($snapshot['error_summary'])->toMatchArray(['failed_runs' => 1, 'attention_records' => 1]);
    expect(json_encode($snapshot))->not->toContain('PRIVATE_SECRET');
});

test('background scheduler launch cannot be mistaken for successful completion', function () {
    $this->freezeTime();
    app(Kernel::class)->bootstrap();
    $task = app(Schedule::class)->command('test:background')->everyMinute()->runInBackground();
    Event::dispatch(new ScheduledTaskStarting($task));
    $task->exitCode = 0;
    Event::dispatch(new ScheduledTaskFinished($task, .01));
    $row = fn () => collect(app(QueryItControlCenter::class)->handle()['scheduler'])->firstWhere('name', 'test:background');
    expect($row())->toMatchArray(['state' => 'RUNNING', 'last_success' => null]);
    Event::dispatch(new ScheduledBackgroundTaskFinished($task));
    expect($row())->toMatchArray(['state' => 'SUCCESS', 'last_success' => now()->toIso8601String(), 'duration_ms' => null]);
});

test('an unavailable secondary database queue cannot erase a readable primary queue', function () {
    config(['queue.connections.secondary' => [...config('queue.connections.database'), 'connection' => 'missing_connection']]);
    $snapshot = app(QueryItControlCenter::class)->handle();
    expect(collect($snapshot['queues']['sources'])->firstWhere('connection', 'secondary')['available'])->toBeFalse();
    expect(collect($snapshot['queues']['rows'])->firstWhere('name', 'default'))->toMatchArray(['connection' => 'database', 'pending' => 0]);
    expect($snapshot['unavailable'])->toContain('database_queue:secondary')->not->toContain('database_queue');
});

test('a worker on another connection cannot prove the selected queue runtime is healthy', function () {
    $this->freezeTime();
    config(['queue.default' => 'database']);
    app(OperationsTelemetry::class)->write('workers', 'other', ['identity' => 'other', 'runtime' => 'PHP queue', 'queue' => 'default', 'connection' => 'redis', 'state' => 'IDLE', 'observed_at' => now()->toIso8601String()]);
    $snapshot = app(QueryItControlCenter::class)->handle();
    expect(collect($snapshot['services'])->firstWhere('name', 'CSV import')['runtime_state'])->toBe('UNKNOWN');
});
