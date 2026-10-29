<?php

use App\Actions\Pickup\QueuePickupReconciliations;
use App\Jobs\QueueHistoricalPickupReconciliationsJob;
use App\Jobs\ReconcilePickupProcessingJob;
use App\Models\Customer;
use App\Models\JneShipperAlias;
use App\Models\PickupProcessingReconciliation;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;

test('global evidence invalidation has bounded interactive reads', function (int $size) {
    $customer = Customer::factory()->create();
    PickupTask::factory()->count($size)->has(PickupRecord::factory(), 'proof')->create(['customer_id' => $customer->id, 'status' => 'PICKED_UP']);
    $alias = JneShipperAlias::factory()->create(['customer_id' => $customer->id]);
    Queue::fake();
    config(['pickup.automation.enabled' => true]);
    DB::flushQueryLog();
    DB::enableQueryLog();

    try {
        $alias->update(['is_active' => false]);
        $reads = count(array_filter(DB::getQueryLog(), fn (array $entry): bool => str_starts_with(strtolower($entry['query']), 'select')));
    } finally {
        DB::disableQueryLog();
        DB::flushQueryLog();
    }

    expect($reads)->toBeLessThanOrEqual(4);
    if (getenv('HARDENING_METRICS') === '1') {
        fwrite(STDERR, json_encode(['metric' => 'interactive_invalidation_selects', 'size' => $size, 'selects' => $reads], JSON_THROW_ON_ERROR).PHP_EOL);
    }
    $this->assertDatabaseCount('pickup_processing_reconciliations', 0);
    Queue::assertPushed(QueueHistoricalPickupReconciliationsJob::class, 1);
    Queue::assertNotPushed(ReconcilePickupProcessingJob::class);
})->with([100, 501]);

test('historical pages cover the entire customer scope and coalesce shared customer days', function () {
    $customer = Customer::factory()->create();
    $tasks = PickupTask::factory()->count(501)->has(PickupRecord::factory(['picked_up_at' => '2026-10-27 08:00:00']), 'proof')->create(['customer_id' => $customer->id, 'status' => 'PICKED_UP']);
    $outside = PickupTask::factory()->has(PickupRecord::factory(), 'proof')->create(['status' => 'PICKED_UP']);
    Queue::fake();
    config(['pickup.automation.enabled' => true]);
    $action = app(QueuePickupReconciliations::class);
    $job = new QueueHistoricalPickupReconciliationsJob($outside->id, customerIds: [$customer->id]);

    foreach ([200, 400, 501] as $expected) {
        $job->handle($action);
        expect(PickupProcessingReconciliation::count())->toBe($expected);
        if ($expected < 501) {
            $job = Queue::pushed(QueueHistoricalPickupReconciliationsJob::class)->last();
        }
    }

    expect(PickupProcessingReconciliation::whereIn('pickup_task_id', $tasks->modelKeys())->where('input_version', 1)->count())->toBe(501);
    $this->assertDatabaseMissing('pickup_processing_reconciliations', ['pickup_task_id' => $outside->id]);
    Queue::assertPushed(ReconcilePickupProcessingJob::class, 1);
    Queue::assertPushed(QueueHistoricalPickupReconciliationsJob::class, 2);
    $this->assertDatabaseCount('pickup_awb_manifests', 0);

    (new QueueHistoricalPickupReconciliationsJob($outside->id, customerIds: [$customer->id]))->handle($action);
    expect(PickupProcessingReconciliation::count())->toBe(501);
    expect(PickupProcessingReconciliation::where('input_version', 2)->count())->toBe(200);
    $this->assertDatabaseCount('pickup_awb_manifests', 0);
});

test('rolled back evidence changes do not publish or strand a unique historical producer', function () {
    config(['queue.default' => 'database', 'cache.default' => 'array']);
    $task = PickupTask::factory()->has(PickupRecord::factory(), 'proof')->create(['status' => 'PICKED_UP']);
    $alias = JneShipperAlias::factory()->create(['customer_id' => $task->customer_id]);
    config(['pickup.automation.enabled' => true]);

    DB::beginTransaction();
    $alias->update(['is_active' => false]);
    $this->assertDatabaseCount('jobs', 0);
    DB::rollBack();
    $this->assertDatabaseCount('jobs', 0);

    $alias->refresh()->update(['is_active' => false]);
    $this->assertDatabaseCount('jobs', 1);
    $alias->update(['is_active' => true]);
    $this->assertDatabaseCount('jobs', 1);
    $this->artisan('queue:work', ['--once' => true, '--queue' => 'default', '--sleep' => 0, '--tries' => 1])->assertSuccessful();
    $this->assertDatabaseHas('pickup_processing_reconciliations', ['pickup_task_id' => $task->id, 'input_version' => 1]);
    $this->assertDatabaseHas('jobs', ['queue' => 'reconciliation']);
});

test('retrying a partially completed historical page eventually invalidates every record', function () {
    $tasks = PickupTask::factory()->count(201)->has(PickupRecord::factory(), 'proof')->create(['status' => 'PICKED_UP']);
    Queue::fake();
    config(['pickup.automation.enabled' => true]);
    $action = app(QueuePickupReconciliations::class);
    $failedAction = Mockery::mock(QueuePickupReconciliations::class);
    $failedAction->shouldReceive('handle')->once()->andReturnUsing(function (array $ids) use ($action): void {
        $action->handle(array_slice($ids, 0, 50));
        throw new RuntimeException('Interrupted page');
    });
    $job = new QueueHistoricalPickupReconciliationsJob($tasks->last()->id);
    expect(fn () => $job->handle($failedAction))->toThrow(RuntimeException::class, 'Interrupted page');
    expect(PickupProcessingReconciliation::count())->toBe(50);
    Queue::assertNotPushed(QueueHistoricalPickupReconciliationsJob::class);

    $job->handle($action);
    Queue::pushed(QueueHistoricalPickupReconciliationsJob::class)->last()->handle($action);

    expect(PickupProcessingReconciliation::count())->toBe(201);
    expect(PickupProcessingReconciliation::where('input_version', '>=', 1)->count())->toBe(201);
    $this->assertDatabaseCount('pickup_awb_manifests', 0);
});

test('historical upper bound is captured after evidence commits', function () {
    $alias = JneShipperAlias::factory()->create();
    Queue::fake();
    config(['pickup.automation.enabled' => true]);
    DB::beginTransaction();
    $alias->update(['is_active' => false]);
    config(['pickup.automation.enabled' => false]);
    $task = PickupTask::factory()->has(PickupRecord::factory(), 'proof')->create(['status' => 'PICKED_UP']);
    config(['pickup.automation.enabled' => true]);
    Queue::assertNotPushed(QueueHistoricalPickupReconciliationsJob::class);
    DB::commit();

    Queue::assertPushed(QueueHistoricalPickupReconciliationsJob::class, fn ($job) => $job->upperId === $task->id);
});

test('expired producer suppression tolerates duplicate pending pages without duplicating customer day work', function () {
    config(['queue.default' => 'database', 'cache.default' => 'array']);
    $task = PickupTask::factory()->has(PickupRecord::factory(), 'proof')->create(['status' => 'PICKED_UP']);
    $alias = JneShipperAlias::factory()->create(['customer_id' => $task->customer_id]);
    config(['pickup.automation.enabled' => true]);
    $alias->update(['is_active' => false]);
    $this->travel(61)->seconds();
    $alias->update(['is_active' => true]);
    expect(DB::table('jobs')->where('queue', 'default')->count())->toBe(2);

    foreach ([1, 2] as $attempt) {
        $this->artisan('queue:work', ['--once' => true, '--queue' => 'default', '--sleep' => 0, '--tries' => 1])->assertSuccessful();
        $this->assertDatabaseHas('pickup_processing_reconciliations', ['pickup_task_id' => $task->id, 'input_version' => $attempt]);
    }

    expect(DB::table('jobs')->where('queue', 'reconciliation')->count())->toBe(1);
    $this->assertDatabaseCount('pickup_processing_reconciliations', 1);
    $this->assertDatabaseCount('pickup_awb_manifests', 0);
});
