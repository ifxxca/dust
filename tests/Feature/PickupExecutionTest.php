<?php

use App\Models\PickupTask;
use App\Models\PickupVisit;
use App\Models\User;

test('assigned operator starts and records a visit without finalizing pickup', function (string $outcome) {
    $staff = User::factory()->create(['role' => 'retail_staff']);
    $task = PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $staff->id]);
    $this->actingAs($staff)->postJson(route('api.tasks.start', $task), ['expected_version' => 1])->assertCreated();
    expect($task->fresh()->execution_started_at)->not->toBeNull()->and($task->fresh()->version)->toBe(2);
    $payload = ['expected_version' => 2, 'outcome' => $outcome, 'reason' => $outcome === 'NO_PACKAGES' ? 'Customer tutup' : null];
    $this->postJson(route('api.tasks.visit', $task), $payload)->assertOk()->assertJsonPath('data.outcome', $outcome);
    $this->postJson(route('api.tasks.visit', $task), $payload)->assertOk();
    expect(PickupVisit::count())->toBe(1)->and($task->fresh()->status)->toBe($outcome === 'NO_PACKAGES' ? 'NO_PACKAGES' : 'ASSIGNED')->and($task->events()->count())->toBe(2);
    $this->postJson(route('api.tasks.start', $task), ['expected_version' => 3])->assertConflict();
})->with(['COLLECTED', 'NO_PACKAGES']);

test('no packages requires a reason and visit results cannot be silently overwritten', function () {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $task = PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $staff->id]);
    $this->actingAs($staff)->postJson(route('api.tasks.start', $task), ['expected_version' => 1])->assertCreated();
    $this->postJson(route('api.tasks.visit', $task), ['expected_version' => 2, 'outcome' => 'NO_PACKAGES'])->assertUnprocessable();
    $this->postJson(route('api.tasks.visit', $task), ['expected_version' => 2, 'outcome' => 'COLLECTED'])->assertOk();
    $this->postJson(route('api.tasks.visit', $task), ['expected_version' => 3, 'outcome' => 'NO_PACKAGES', 'reason' => 'Lainnya'])->assertConflict();
});

test('previous assignee cannot start after takeover and started task cannot be taken over', function () {
    $old = User::factory()->create(['role' => 'pickup_staff']);
    $new = User::factory()->create(['role' => 'retail_staff']);
    $task = PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $old->id]);
    $this->actingAs($new)->postJson(route('api.tasks.takeover', $task), ['expected_version' => 1, 'expected_assigned_staff_id' => $old->id])->assertOk();
    $this->actingAs($old)->postJson(route('api.tasks.start', $task), ['expected_version' => 1])->assertForbidden();
    $this->actingAs($new)->postJson(route('api.tasks.start', $task), ['expected_version' => 2])->assertCreated();
    $this->actingAs($old)->postJson(route('api.tasks.takeover', $task), ['expected_version' => 3, 'expected_assigned_staff_id' => $new->id])->assertConflict();
    $this->postJson(route('api.tasks.visit', $task), ['expected_version' => 3, 'outcome' => 'COLLECTED'])->assertForbidden();
});
