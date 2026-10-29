<?php

use App\Actions\Pickup\QueuePickupReconciliations;
use App\Jobs\QueueBulkPickupReconciliationsJob;
use App\Jobs\ReconcilePickupProcessingJob;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Support\Facades\Queue;

beforeEach(function () {
    $this->travelTo('2026-10-27 08:00:00 UTC');
    config(['pickup.automation.enabled' => false]);
});

test('bulk validation snapshots all filtered finalized pickups across pages and leaves evaluation to workers', function () {
    Queue::fake([QueueBulkPickupReconciliationsJob::class, ReconcilePickupProcessingJob::class]);
    $admin = User::factory()->create(['role' => 'admin_supervisor', 'is_active' => true]);
    $tasks = PickupTask::factory()->count(12)->has(PickupRecord::factory(), 'proof')->create(['status' => 'PICKED_UP', 'customer_name_snapshot' => 'Bulk Match']);
    PickupTask::factory()->has(PickupRecord::factory(), 'proof')->create(['status' => 'PICKED_UP', 'customer_name_snapshot' => 'Outside filter']);
    PickupTask::factory()->create(['status' => 'SCHEDULED', 'scheduled_at' => now(), 'customer_name_snapshot' => 'Bulk Match']);
    config(['pickup.automation.enabled' => true]);

    $this->actingAs($admin)->postJson(route('pickup-automation.bulk-recheck'), ['q' => 'Bulk Match', 'date_from' => '2026-10-27', 'date_to' => '2026-10-27', 'per_page' => 10, 'page' => 2])
        ->assertAccepted()->assertJsonPath('queued_count', 12)->assertJsonPath('skipped_count', 1);

    Queue::assertPushed(QueueBulkPickupReconciliationsJob::class, fn ($job) => $job->taskIds === $tasks->modelKeys() && $job->queue === 'default');
    Queue::assertNotPushed(ReconcilePickupProcessingJob::class);
    $this->assertDatabaseCount('pickup_processing_reconciliations', 0);
    $this->assertDatabaseCount('pickup_awb_manifests', 0);
});

test('bulk selected pickup IDs stay inside the active filter and an empty selection never means all', function () {
    Queue::fake([QueueBulkPickupReconciliationsJob::class]);
    $admin = User::factory()->create(['role' => 'admin_supervisor', 'is_active' => true]);
    $tasks = PickupTask::factory()->count(2)->has(PickupRecord::factory(), 'proof')->create(['status' => 'PICKED_UP', 'customer_name_snapshot' => 'Selected Match']);
    $outside = PickupTask::factory()->has(PickupRecord::factory(), 'proof')->create(['status' => 'PICKED_UP', 'customer_name_snapshot' => 'Other']);
    config(['pickup.automation.enabled' => true]);
    $this->actingAs($admin)->postJson(route('pickup-automation.bulk-recheck'), ['q' => 'Selected Match', 'selected_ids' => [$tasks[0]->id, $outside->id]])
        ->assertAccepted()->assertJsonPath('queued_count', 1);
    Queue::assertPushed(QueueBulkPickupReconciliationsJob::class, fn ($job) => $job->taskIds === [$tasks[0]->id]);
    $this->postJson(route('pickup-automation.bulk-recheck'), ['selected_ids' => []])->assertAccepted()->assertJsonPath('queued_count', 0);
    Queue::assertPushed(QueueBulkPickupReconciliationsJob::class, 1);
});

test('bulk validation rejects guests staff inactive admins invalid dates and disabled automation', function () {
    Queue::fake();
    $url = route('pickup-automation.bulk-recheck');
    $this->postJson($url)->assertUnauthorized();
    $this->actingAs(User::factory()->create(['role' => 'pickup_staff', 'is_active' => true]))->postJson($url)->assertForbidden();
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor', 'is_active' => false]))->postJson($url)->assertForbidden();
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor', 'is_active' => true]))->postJson($url)->assertConflict();
    config(['pickup.automation.enabled' => true]);
    $this->postJson($url, ['date_from' => '2026-10-27', 'date_to' => '2026-10-01'])->assertUnprocessable()->assertJsonValidationErrors('date_to');
    $this->postJson($url, ['scope' => 'backlog'])->assertUnprocessable()->assertJsonValidationErrors('scope');
    $this->postJson($url, ['selected_ids' => [1, 1]])->assertUnprocessable()->assertJsonValidationErrors('selected_ids.0');
    Queue::assertNothingPushed();
});

test('bulk worker queues checks without changing input versions or approving unresolved pickups', function () {
    Queue::fake([ReconcilePickupProcessingJob::class]);
    $task = PickupTask::factory()->has(PickupRecord::factory(), 'proof')->create(['status' => 'PICKED_UP']);
    config(['pickup.automation.enabled' => true]);

    (new QueueBulkPickupReconciliationsJob([$task->id]))->handle(app(QueuePickupReconciliations::class));

    Queue::assertPushed(ReconcilePickupProcessingJob::class, fn ($job) => $job->taskId === $task->id);
    $this->assertDatabaseHas('pickup_processing_reconciliations', ['pickup_task_id' => $task->id, 'input_version' => 0, 'evaluated_input_version' => 0, 'locked_at' => null]);
    $this->assertDatabaseCount('pickup_awb_manifests', 0);
});
