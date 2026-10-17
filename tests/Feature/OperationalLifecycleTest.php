<?php

use App\Models\PickupTask;
use App\Models\PickupVisit;
use App\Models\User;

test('same task retry is refused after no packages and preserves the original visit', function () {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $task = PickupTask::factory()->create(['status' => 'NO_PACKAGES', 'assigned_staff_id' => $staff->id, 'execution_started_at' => now()]);
    $visit = PickupVisit::create(['pickup_task_id' => $task->id, 'staff_id' => $staff->id, 'started_at' => now(), 'outcome' => 'NO_PACKAGES', 'reason' => 'Tutup', 'recorded_at' => now()]);
    $this->actingAs($staff)->postJson(route('api.tasks.retry', $task), ['expected_version' => 1, 'reason' => 'Customer sudah siap'])->assertConflict();
    $this->postJson(route('api.tasks.retry', $task), ['expected_version' => 1, 'reason' => 'Ulang'])->assertConflict();
    $this->postJson(route('api.tasks.start', $task), ['expected_version' => 1])->assertConflict();
    expect($task->visits()->count())->toBe(1)->and($visit->fresh()->outcome)->toBe('NO_PACKAGES')->and($task->fresh()->version)->toBe(1);
    expect($task->events()->count())->toBe(0);
});

test('cancel is limited to managers and cannot discard collected packages', function () {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $cs = User::factory()->create(['role' => 'cs']);
    $task = PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $staff->id]);
    $payload = ['expected_version' => 1, 'reason' => 'Customer membatalkan'];
    $this->actingAs($staff)->postJson(route('api.tasks.cancel', $task), $payload)->assertForbidden();
    $this->actingAs($cs)->postJson(route('api.tasks.cancel', $task), $payload)->assertOk()->assertJsonPath('data.status', 'CANCELLED');
    $this->actingAs($staff)->postJson(route('api.tasks.start', $task), ['expected_version' => 2])->assertConflict();
    $collected = PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $staff->id, 'execution_started_at' => now()]);
    PickupVisit::create(['pickup_task_id' => $collected->id, 'staff_id' => $staff->id, 'started_at' => now(), 'outcome' => 'COLLECTED', 'recorded_at' => now()]);
    $this->actingAs($cs)->postJson(route('api.tasks.cancel', $collected), $payload)->assertConflict();
    $this->postJson(route('api.tasks.retry', $collected), $payload)->assertConflict();
});
