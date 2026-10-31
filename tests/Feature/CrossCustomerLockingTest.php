<?php

use App\Actions\Pickup\ReconcilePickupProcessing;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\ReportJob;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Symfony\Component\Process\Process;

require_once __DIR__.'/../Fixtures/cross-customer-locking.php';

test('customer day reconciliation does not lock unrelated unowned shipment records', function () {
    if (getenv('CROSS_LOCKING') !== '1' || (int) getenv('HARDENING_MYSQL_PORT') !== 54184) {
        $this->markTestSkipped('Explicit disposable MySQL locking fixture required.');
    }
    Http::preventStrayRequests();
    Queue::fake();
    $this->travelTo('2026-10-29 08:00:00 UTC');
    $infrastructure = crossLockDatabase();
    $database = $infrastructure['database'];
    $gate = sys_get_temp_dir().DIRECTORY_SEPARATOR.$database;
    $process = null;
    $measurement = [];
    try {
        $fixture = crossLockFixture();
        $before = DB::table('jne_shipments')->orderBy('id')->get(['id', 'customer_id', 'pickup_task_id', 'latest_report_job_id', 'version'])->toJson();
        file_put_contents($gate.'.json', json_encode(['port' => 54184, 'database' => $database, 'gate' => $gate, 'tasks' => $fixture['tasks']], JSON_THROW_ON_ERROR));
        $process = new Process([PHP_BINARY, __DIR__.'/cross-customer-worker.php', $gate.'.json', '0', 'hold'], base_path(), ['APP_ENV' => 'testing', 'MAIL_MAILER' => 'array', 'MOBILE_PUSH_ENABLED' => 'false'], null, 150);
        $process->start();
        $deadline = microtime(true) + 110;
        while (! is_file($gate.'.held0') && $process->isRunning() && microtime(true) < $deadline) {
            usleep(100000);
        }
        expect(is_file($gate.'.held0'))->toBeTrue($process->getOutput().$process->getErrorOutput());
        $held = json_decode(file_get_contents($gate.'.held0'), true, flags: JSON_THROW_ON_ERROR);
        $locks = DB::connection('cross_observer')->select("SELECT l.INDEX_NAME,l.LOCK_MODE,COUNT(*) AS entries,SUM(s.customer_id IS NULL OR s.customer_id<>?) AS unrelated FROM performance_schema.data_locks l LEFT JOIN jne_shipments s ON s.id=CAST(l.LOCK_DATA AS UNSIGNED) WHERE l.OBJECT_SCHEMA=? AND l.OBJECT_NAME='jne_shipments' AND l.LOCK_TYPE='RECORD' AND l.INDEX_NAME='PRIMARY' AND l.LOCK_MODE NOT IN ('X,GAP','S,GAP') AND l.LOCK_DATA<>'supremum pseudo-record' GROUP BY l.INDEX_NAME,l.LOCK_MODE", [$fixture['customers'][0], $database]);
        $allLocks = DB::connection('cross_observer')->select("SELECT INDEX_NAME,LOCK_MODE,COUNT(*) AS entries FROM performance_schema.data_locks WHERE OBJECT_SCHEMA=? AND OBJECT_NAME='jne_shipments' GROUP BY INDEX_NAME,LOCK_MODE", [$database]);
        $plans = [];
        foreach ($held['queries'] as $query) {
            $plans[] = ['sql' => $query['sql'], 'plan' => DB::connection('cross_observer')->select('EXPLAIN FORMAT=JSON '.$query['sql'], $query['bindings'])];
        }
        $measurement = ['tag' => getenv('CROSS_LOCK_TAG') ?: 'baseline', 'version' => DB::connection('cross_observer')->selectOne('SELECT VERSION() AS version')->version, 'population' => DB::table('jne_shipments')->count(), 'held' => $held, 'record_locks' => $locks, 'all_locks' => $allLocks, 'plans' => $plans];
        touch($gate.'.release');
        $process->wait();
        $measurement['worker'] = ['exit' => $process->getExitCode(), 'output' => $process->getOutput(), 'stderr' => $process->getErrorOutput()];
        file_put_contents(base_path('docs/technical-audit/evidence/cross-lock-scope.ndjson'), json_encode($measurement, JSON_THROW_ON_ERROR).PHP_EOL, FILE_APPEND);
        expect($process->isSuccessful())->toBeTrue($process->getOutput());
        expect(collect($locks)->sum('unrelated'))->toBe(0);
        $snapshot = json_decode(DB::table('pickup_customer_reconciliations')->where('customer_id', $fixture['customers'][0])->value('evidence'), true, flags: JSON_THROW_ON_ERROR);
        $expectedIds = [...$fixture['ownedIds'][0], ...array_slice($fixture['poolIds'][0], 1)];
        $selectedIds = array_column($snapshot['shipments'], 'id');
        sort($expectedIds);
        sort($selectedIds);
        expect($selectedIds)->toBe($expectedIds);
        expect(DB::table('jne_shipments')->orderBy('id')->get(['id', 'customer_id', 'pickup_task_id', 'latest_report_job_id', 'version'])->toJson())->toBe($before);
        Http::assertNothingSent();
    } finally {
        touch($gate.'.release');
        if ($process?->isRunning()) {
            $process->stop(0);
        }
        config(['database.default' => 'sqlite']);
        DB::purge('cross_mysql');
        DB::purge('cross_observer');
        DB::connection('cross_server')->statement('DROP DATABASE '.$database);
    }
})->group('cross-customer-locking');

test('required unowned rows stay locked until a concurrent explicit ownership decision can commit', function () {
    if (getenv('CROSS_LOCKING') !== '1' || (int) getenv('HARDENING_MYSQL_PORT') !== 54184) {
        $this->markTestSkipped('Explicit disposable MySQL locking fixture required.');
    }
    Http::preventStrayRequests();
    Queue::fake();
    $this->travelTo('2026-10-29 08:00:00 UTC');
    $setup = crossLockDatabase();
    $database = $setup['database'];
    $gate = sys_get_temp_dir().DIRECTORY_SEPARATOR.$database;
    $holder = null;
    $writer = null;
    try {
        $fixture = crossLockFixture(100);
        $claimId = $fixture['poolIds'][0][2];
        $payload = ['port' => 54184, 'database' => $database, 'gate' => $gate, 'tasks' => $fixture['tasks'],
            'subjects' => [3 => 0], 'admin' => $fixture['admin']->id, 'claim_id' => $claimId];
        file_put_contents($gate.'.json', json_encode($payload, JSON_THROW_ON_ERROR));
        $holder = new Process([PHP_BINARY, __DIR__.'/cross-customer-worker.php', $gate.'.json', '0', 'hold'], base_path(),
            ['APP_ENV' => 'testing', 'MAIL_MAILER' => 'array', 'MOBILE_PUSH_ENABLED' => 'false'], null, 60);
        $holder->start();
        $deadline = microtime(true) + 30;
        while (! is_file($gate.'.held0') && $holder->isRunning() && microtime(true) < $deadline) {
            usleep(50000);
        }
        expect(is_file($gate.'.held0'))->toBeTrue($holder->getOutput().$holder->getErrorOutput());
        $writer = new Process([PHP_BINARY, __DIR__.'/cross-customer-worker.php', $gate.'.json', '3', 'claim'], base_path(),
            ['APP_ENV' => 'testing', 'MAIL_MAILER' => 'array', 'MOBILE_PUSH_ENABLED' => 'false'], null, 60);
        $writer->start();
        touch($gate.'.go');
        $deadline = microtime(true) + 10;
        $waits = [];
        do {
            $waits = DB::connection('cross_observer')->select("SELECT r.OBJECT_NAME,r.INDEX_NAME,r.LOCK_MODE FROM performance_schema.data_lock_waits w JOIN performance_schema.data_locks r ON r.ENGINE_LOCK_ID=w.REQUESTING_ENGINE_LOCK_ID AND r.ENGINE=w.ENGINE WHERE r.OBJECT_SCHEMA=? AND r.OBJECT_NAME='jne_shipments'", [$database]);
            if ($waits !== []) {
                break;
            }
            usleep(50000);
        } while ($writer->isRunning() && microtime(true) < $deadline);
        expect($waits)->not->toBeEmpty();
        expect(DB::table('jne_shipments')->where('id', $claimId)->value('pickup_task_id'))->toBeNull();
        touch($gate.'.release');
        $holder->wait();
        $writer->wait();
        expect($holder->isSuccessful())->toBeTrue($holder->getOutput().$holder->getErrorOutput());
        expect($writer->isSuccessful())->toBeTrue($writer->getOutput().$writer->getErrorOutput());
        $row = JneShipment::findOrFail($claimId);
        expect($row->customer_id)->toBe($fixture['customers'][0]);
        expect($row->pickup_task_id)->toBe($fixture['tasks'][0][0]);
        app(ReconcilePickupProcessing::class)->handle($fixture['tasks'][0][0]);
        expect($row->fresh()->pickup_task_id)->toBe($fixture['tasks'][0][0]);
        file_put_contents(base_path('docs/technical-audit/evidence/cross-lock-ownership-race.json'), json_encode(['required_row_waits' => $waits,
            'holder' => json_decode($holder->getOutput(), true), 'writer' => json_decode($writer->getOutput(), true), 'ownership_preserved_after_replay' => true], JSON_THROW_ON_ERROR));
        Http::assertNothingSent();
    } finally {
        touch($gate.'.release');
        foreach ([$holder, $writer] as $process) {
            if ($process?->isRunning()) {
                $process->stop(0);
            }
        }
        config(['database.default' => 'sqlite']);
        DB::purge('cross_mysql');
        DB::purge('cross_observer');
        DB::connection('cross_server')->statement('DROP DATABASE '.$database);
    }
})->group('cross-customer-locking');

test('mixed customer actions preserve ownership provenance and frozen baselines under overlap', function () {
    if (getenv('CROSS_LOCKING') !== '1' || (int) getenv('HARDENING_MYSQL_PORT') !== 54184) {
        $this->markTestSkipped('Explicit disposable MySQL locking fixture required.');
    }
    Http::preventStrayRequests();
    Queue::fake();
    $this->travelTo('2026-10-29 08:00:00 UTC');
    $setup = crossLockDatabase();
    $database = $setup['database'];
    $gate = sys_get_temp_dir().DIRECTORY_SEPARATOR.$database;
    try {
        $fixture = crossLockFixture(100);
        $proofs = DB::table('pickup_records')->orderBy('id')->get()->toJson();
        $handover = DB::table('handover_items')->orderBy('id')->get()->toJson();
        $cashless = DB::table('pickup_cashless_awbs')->orderBy('id')->get()->toJson();
        $payload = ['port' => 54184, 'database' => $database, 'gate' => $gate, 'tasks' => $fixture['tasks'], 'subjects' => [3 => 0],
            'admin' => $fixture['admin']->id, 'reports' => $fixture['reports']];
        $measurements = [];
        $matrix = [
            'two customers' => [[0, 'reconcile'], [1, 'reconcile']],
            'three customers' => [[0, 'reconcile'], [1, 'reconcile'], [2, 'reconcile']],
            'same customer twice' => [[0, 'reconcile'], [3, 'reconcile']],
            'another customer projection' => [[0, 'reconcile'], [1, 'projection']],
            'same customer projection' => [[0, 'reconcile'], [3, 'projection']],
            'another customer ownership' => [[0, 'reconcile'], [1, 'claim']],
        ];
        foreach ($matrix as $scenario => $operations) {
            foreach ([1, 2] as $repeat) {
                $payload['claim_id'] = $fixture['poolIds'][1][$repeat];
                $before = (int) DB::selectOne("SELECT COUNT AS n FROM information_schema.INNODB_METRICS WHERE NAME='lock_deadlocks'")->n;
                $outcome = crossLockRun($payload, $operations);
                $after = (int) DB::selectOne("SELECT COUNT AS n FROM information_schema.INNODB_METRICS WHERE NAME='lock_deadlocks'")->n;
                $measurements[] = ['scenario' => $scenario, 'repeat' => $repeat, 'deadlocks_delta' => $after - $before, ...$outcome];
                foreach ($outcome['workers'] as $worker) {
                    expect($worker['exit'])->toBe(0, $worker['stdout'].$worker['stderr']);
                }
                expect($after - $before)->toBe(0);
                if ($scenario === 'another customer ownership') {
                    expect(JneShipment::findOrFail($payload['claim_id'])->pickup_task_id)->toBe($fixture['tasks'][1][0]);
                }
            }
        }
        $target = JneShipment::findOrFail($fixture['poolIds'][1][5]);
        $conflict = ReportJob::factory()->create(['created_by' => $fixture['admin']->id, 'customer_account' => 'SHARED_LOCK', 'report_mode' => 'A', 'status' => 'COMPLETED',
            'import_status' => 'IMPORTED', 'projection_status' => 'NOT_PROJECTED', 'started_at' => now()->subDay(), 'completed_at' => now()->subDay()]);
        JneReportAwb::factory()->create(['report_job_id' => $conflict->id, 'awb' => $target->awb, 'customer_account' => 'SHARED_LOCK', 'entry_at' => now(), 'observed_at' => now()->subDay(),
            'shipper_name' => '', 'raw_data' => ['CUSTOMER_CODE' => '4003', 'PROCESS_TYPE' => 'MANUAL']]);
        $payload['conflict_report'] = $conflict->id;
        $before = (int) DB::selectOne("SELECT COUNT AS n FROM information_schema.INNODB_METRICS WHERE NAME='lock_deadlocks'")->n;
        $outcome = crossLockRun($payload, [[0, 'reconcile'], [1, 'conflict']]);
        $after = (int) DB::selectOne("SELECT COUNT AS n FROM information_schema.INNODB_METRICS WHERE NAME='lock_deadlocks'")->n;
        $measurements[] = ['scenario' => 'late conflicting evidence', 'deadlocks_delta' => $after - $before, ...$outcome];
        file_put_contents(base_path('docs/technical-audit/evidence/cross-lock-mixed-actions.json'), json_encode($measurements, JSON_THROW_ON_ERROR));
        foreach ($outcome['workers'] as $worker) {
            expect($worker['exit'])->toBe(0, $worker['stdout'].$worker['stderr']);
        }
        expect($after - $before)->toBe(0);
        expect($target->fresh()->customer_match_status)->toBe('CONFLICT');
        expect($target->fresh()->pickup_task_id)->toBeNull();
        expect($target->fresh()->latest_report_job_id)->toBe($fixture['reports'][1]);
        expect(DB::table('pickup_records')->orderBy('id')->get()->toJson())->toBe($proofs);
        expect(DB::table('handover_items')->orderBy('id')->get()->toJson())->toBe($handover);
        expect(DB::table('pickup_cashless_awbs')->orderBy('id')->get()->toJson())->toBe($cashless);
        expect(DB::table('jne_shipments')->whereNotNull('jne_shipments.pickup_task_id')->whereNotNull('jne_shipments.customer_id')
            ->join('pickup_tasks', 'pickup_tasks.id', '=', 'jne_shipments.pickup_task_id')->whereColumn('jne_shipments.customer_id', '<>', 'pickup_tasks.customer_id')->count())->toBe(0);
        Http::assertNothingSent();
    } finally {
        config(['database.default' => 'sqlite']);
        DB::purge('cross_mysql');
        DB::purge('cross_observer');
        DB::connection('cross_server')->statement('DROP DATABASE '.$database);
    }
})->group('cross-customer-locking');

test('scoped current reads avoid the demonstrated cross customer primary lock cycle', function () {
    if (getenv('CROSS_LOCKING') !== '1' || (int) getenv('HARDENING_MYSQL_PORT') !== 54184) {
        $this->markTestSkipped('Explicit disposable MySQL locking fixture required.');
    }
    Http::preventStrayRequests();
    Queue::fake();
    $this->travelTo('2026-10-29 08:00:00 UTC');
    $infrastructure = crossLockDatabase();
    $database = $infrastructure['database'];
    $gate = sys_get_temp_dir().DIRECTORY_SEPARATOR.$database;
    try {
        $fixture = crossLockFixture();
        $queries = [];
        DB::listen(function (QueryExecuted $event) use (&$queries): void {
            if (! str_starts_with($event->sql, 'select') || ! str_contains($event->sql, 'jne_shipments') || ! str_contains($event->sql, 'for update')) {
                return;
            }
            $frame = collect(debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS, 40))->first(fn (array $frame): bool => isset($frame['file']) && str_contains(str_replace('\\', '/', $frame['file']), '/app/'));
            if ($frame && str_ends_with(str_replace('\\', '/', $frame['file']), '/ReconcileCustomerPickupDay.php')) {
                $queries[] = ['sql' => $event->sql, 'bindings' => $event->bindings];
            }
        });
        app(ReconcilePickupProcessing::class)->handle($fixture['tasks'][0][0]);
        expect($queries)->not->toBeEmpty();
        $scopes = [];
        foreach ([0, 1, 2] as $index) {
            foreach ($queries as $query) {
                $members = $fixture['tasks'][$index];
                if (str_contains($query['sql'], ' or ')) {
                    $bindings = [...$members, $fixture['customers'][$index], $query['bindings'][3], $query['bindings'][4], ...$members];
                } elseif (str_contains($query['sql'], 'is null')) {
                    $bindings = [$fixture['customers'][$index], $query['bindings'][1], $query['bindings'][2], ...$members];
                } else {
                    $bindings = $members;
                }
                $scopes[$index][] = ['sql' => $query['sql'], 'bindings' => $bindings];
            }
        }
        $payload = ['port' => 54184, 'database' => $database, 'gate' => $gate, 'tasks' => $fixture['tasks'],
            'customers' => $fixture['customers'], 'poolIds' => $fixture['poolIds'], 'scope_queries' => $scopes];
        $outcomes = [];
        $before = (int) DB::selectOne("SELECT COUNT AS n FROM information_schema.INNODB_METRICS WHERE NAME='lock_deadlocks'")->n;
        foreach ([[[0, 'cycle'], [1, 'cycle']], [[0, 'cycle'], [1, 'cycle'], [2, 'cycle']]] as $operations) {
            foreach ([1, 2] as $repeat) {
                $outcomes[] = crossLockRun($payload, $operations);
            }
        }
        $after = (int) DB::selectOne("SELECT COUNT AS n FROM information_schema.INNODB_METRICS WHERE NAME='lock_deadlocks'")->n;
        $status = DB::select('SHOW ENGINE INNODB STATUS')[0]->Status;
        $graph = explode('TRANSACTIONS', explode('LATEST DETECTED DEADLOCK', $status)[1] ?? '')[0];
        $safe = implode("\n", array_filter(explode("\n", $graph), fn (string $line): bool => preg_match('/TRANSACTION|ACTIVE|LOCK WAIT|RECORD LOCKS|ROLL BACK|^select /i', $line) === 1));
        file_put_contents(base_path('docs/technical-audit/evidence/cross-lock-cycle.ndjson'), json_encode(['tag' => getenv('CROSS_LOCK_TAG') ?: 'baseline', 'population' => DB::table('jne_shipments')->count(),
            'deadlocks_delta' => $after - $before, 'scopes' => $scopes, 'outcomes' => $outcomes, 'graph_redacted' => $safe], JSON_THROW_ON_ERROR).PHP_EOL, FILE_APPEND);
        expect($after - $before)->toBe(0);
        foreach ($outcomes as $outcome) {
            foreach ($outcome['workers'] as $worker) {
                expect($worker['exit'])->toBe(0, $worker['stdout'].$worker['stderr']);
            }
        }
        Http::assertNothingSent();
    } finally {
        config(['database.default' => 'sqlite']);
        DB::purge('cross_mysql');
        DB::purge('cross_observer');
        DB::connection('cross_server')->statement('DROP DATABASE '.$database);
    }
})->group('cross-customer-locking');
