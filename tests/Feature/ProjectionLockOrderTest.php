<?php

use App\Actions\Reports\ProjectJneShipments;
use App\Actions\Reports\ReportPipelineFailure;
use App\Models\JneShipment;
use App\Models\JneShipmentObservation;
use App\Models\ReportJob;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Queue;
use Symfony\Component\Process\Process;

require_once __DIR__.'/../Fixtures/cross-customer-locking.php';

test('projection failures log database error codes without SQL statements or customer values', function () {
    Log::spy();
    $previous = new PDOException('private-sender-address');
    $previous->errorInfo = ['40001', 1213, 'private-database-message'];
    $exception = new QueryException('mysql', 'insert into private_table values (?)', ['private-customer-value'], $previous);

    app(ReportPipelineFailure::class)->handle($exception, 'projection', 1336);

    Log::shouldHaveReceived('error')->once()->withArgs(function (string $message, array $context): bool {
        expect($context['sqlstate'])->toBe('40001');
        expect($context['database_error_code'])->toBe(1213);
        expect($context['report_job_id'])->toBe(1336);
        expect(json_encode($context))->not->toContain('private-sender-address', 'private-database-message', 'private_table', 'private-customer-value');

        return $message === 'JNE report pipeline failed.';
    });
});

test('projection waits for the customer gate before locking pickups or shipments', function () {
    if (getenv('CROSS_LOCKING') !== '1' || (int) getenv('HARDENING_MYSQL_PORT') !== 54184) {
        $this->markTestSkipped('Explicit disposable MySQL locking fixture required.');
    }
    Http::preventStrayRequests();
    Queue::fake();
    $this->travelTo('2026-10-29 08:00:00 UTC');
    $setup = crossLockDatabase();
    $database = $setup['database'];
    $gate = sys_get_temp_dir().DIRECTORY_SEPARATOR.$database;
    $worker = null;
    $holder = DB::connection('cross_observer');
    try {
        $fixture = crossLockFixture(25);
        $shipmentId = $fixture['ownedIds'][0][0];
        $before = JneShipment::findOrFail($shipmentId)->only(['customer_id', 'pickup_task_id']);
        file_put_contents($gate.'.json', json_encode(['port' => 54184, 'database' => $database, 'gate' => $gate, 'tasks' => $fixture['tasks'], 'reports' => $fixture['reports']], JSON_THROW_ON_ERROR));
        $holder->beginTransaction();
        $holder->table('customers')->where('id', $fixture['customers'][0])->lockForUpdate()->first();
        $worker = new Process([PHP_BINARY, __DIR__.'/cross-customer-worker.php', $gate.'.json', '0', 'projection'], base_path(), ['APP_ENV' => 'testing', 'MAIL_MAILER' => 'array', 'MOBILE_PUSH_ENABLED' => 'false'], null, 45);
        $worker->start();
        touch($gate.'.go');
        $deadline = microtime(true) + 20;
        $waits = [];
        do {
            $waits = $holder->select("SELECT r.OBJECT_NAME,r.LOCK_MODE FROM performance_schema.data_lock_waits w JOIN performance_schema.data_locks r ON r.ENGINE_LOCK_ID=w.REQUESTING_ENGINE_LOCK_ID AND r.ENGINE=w.ENGINE WHERE r.OBJECT_SCHEMA=? AND r.OBJECT_NAME='customers'", [$database]);
            if ($waits !== []) {
                break;
            }
            usleep(50000);
        } while ($worker->isRunning() && microtime(true) < $deadline);
        expect($waits)->not->toBeEmpty($worker->getOutput().$worker->getErrorOutput());
        $locks = $holder->select("SELECT OBJECT_NAME,LOCK_MODE FROM performance_schema.data_locks WHERE OBJECT_SCHEMA=? AND OBJECT_NAME IN ('jne_shipments','pickup_tasks') AND LOCK_TYPE='RECORD' AND LOCK_MODE LIKE 'X%'", [$database]);
        expect($locks)->toBeEmpty();
        $holder->table('jne_shipments')->where('id', $shipmentId)->update(['updated_at' => now()]);
        $holder->commit();
        $worker->wait();
        expect($worker->isSuccessful())->toBeTrue($worker->getOutput().$worker->getErrorOutput());
        expect(ReportJob::findOrFail($fixture['reports'][0])->projection_status)->toBe('PROJECTED');
        expect(JneShipment::findOrFail($shipmentId)->only(['customer_id', 'pickup_task_id']))->toBe($before);
        $observations = JneShipmentObservation::count();

        app(ProjectJneShipments::class)->handle($fixture['reports'][0]);

        expect(JneShipmentObservation::count())->toBe($observations);
        Http::assertNothingSent();
    } finally {
        if ($holder->transactionLevel() > 0) {
            $holder->rollBack();
        }
        touch($gate.'.go');
        if ($worker?->isRunning()) {
            $worker->stop(0);
        }
        config(['database.default' => 'sqlite']);
        DB::purge('cross_mysql');
        DB::purge('cross_observer');
        DB::connection('cross_server')->statement('DROP DATABASE '.$database);
    }
});
