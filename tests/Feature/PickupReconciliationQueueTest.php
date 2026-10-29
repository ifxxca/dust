<?php

use App\Actions\Pickup\QueuePickupReconciliations;
use App\Jobs\ReconcilePickupProcessingJob;
use App\Models\PickupProcessingReconciliation;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;

require_once __DIR__.'/../Fixtures/pickup-automation.php';

beforeEach(function () {
    $this->travelTo('2026-10-27 08:00:00 UTC');
    config(['pickup.automation.enabled' => false, 'cache.default' => 'array']);
});

test('pending reconciliation remains unique after the previous three minute expiry', function () {
    config(['queue.default' => 'database']);
    $task = PickupTask::factory()->has(PickupRecord::factory(), 'proof')->create(['status' => 'PICKED_UP']);
    config(['pickup.automation.enabled' => true]);
    $queue = app(QueuePickupReconciliations::class);
    $queue->handle([$task->id]);
    $this->travel(4)->minutes();
    $queue->handle([$task->id]);

    $this->assertDatabaseCount('jobs', 1);
    $this->assertDatabaseHas('jobs', ['queue' => 'reconciliation']);
    $this->assertDatabaseHas('pickup_processing_reconciliations', ['pickup_task_id' => $task->id, 'input_version' => 2]);
});

test('scheduled checks do not invalidate unchanged input and a proof change queues an immediate check', function () {
    Queue::fake([ReconcilePickupProcessingJob::class]);
    $task = PickupTask::factory()->has(PickupRecord::factory(), 'proof')->create(['status' => 'PICKED_UP']);
    PickupProcessingReconciliation::factory()->create(['pickup_task_id' => $task->id, 'input_version' => 3, 'evaluated_input_version' => 3, 'next_evaluation_at' => now()->subMinute()]);
    config(['pickup.automation.enabled' => true]);

    $this->artisan('pickups:queue-automation')->assertSuccessful();
    $this->assertDatabaseHas('pickup_processing_reconciliations', ['pickup_task_id' => $task->id, 'input_version' => 3, 'evaluated_input_version' => 3]);
    $task->proof->update(['notes' => 'Bukti diperbarui']);

    Queue::assertPushed(ReconcilePickupProcessingJob::class, fn ($job) => $job->taskId === $task->id);
    $this->assertDatabaseHas('pickup_processing_reconciliations', ['pickup_task_id' => $task->id, 'input_version' => 4]);
});

test('scheduler reaches later pickups instead of repeatedly taking the first two hundred dirty rows', function () {
    Queue::fake([ReconcilePickupProcessingJob::class]);
    $tasks = PickupTask::factory()->count(201)->has(PickupRecord::factory(), 'proof')->create(['status' => 'PICKED_UP']);
    foreach ($tasks as $task) {
        PickupProcessingReconciliation::factory()->create(['pickup_task_id' => $task->id, 'input_version' => 1, 'evaluated_input_version' => 0, 'next_evaluation_at' => now()->subMinute()]);
    }
    config(['pickup.automation.enabled' => true]);

    $this->artisan('pickups:queue-automation')->assertSuccessful();
    $this->artisan('pickups:queue-automation')->assertSuccessful();

    Queue::assertPushed(ReconcilePickupProcessingJob::class, fn ($job) => $job->taskId === $tasks->last()->id);
    expect(PickupProcessingReconciliation::where('input_version', 1)->count())->toBe(201);
});

test('importing matching AWBs automatically queues a worker that completes and locks the pickup without a validation click', function () {
    Storage::fake('jne_reports');
    config(['queue.default' => 'database', 'jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => true]);
    $fixture = pickupAutomationFixture(2, 0);
    config(['pickup.automation.enabled' => true]);

    importPickupAutomationReport($fixture, 2, 0);
    $this->assertDatabaseHas('jobs', ['queue' => 'default']);
    $this->artisan('queue:work', ['--once' => true, '--queue' => 'default', '--sleep' => 0, '--tries' => 1])->assertSuccessful();
    $this->assertDatabaseHas('jobs', ['queue' => 'reconciliation']);
    $this->artisan('queue:work', ['--once' => true, '--queue' => 'reconciliation', '--sleep' => 0, '--tries' => 1])->assertSuccessful();

    $result = PickupProcessingReconciliation::where('pickup_task_id', $fixture['task']->id)->sole();
    expect($result->status)->toBe('DONE');
    expect($result->locked_at)->not->toBeNull();
    $this->assertDatabaseCount('pickup_awb_manifests', 1);
    $this->assertDatabaseHas('jobs', ['queue' => 'documents']);
});
