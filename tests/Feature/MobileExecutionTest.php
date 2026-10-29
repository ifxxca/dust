<?php

use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Support\Str;

test('staff claim unassigned pickups once and move them from available to mine without starting the visit', function () {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $other = User::factory()->create(['role' => 'pickup_staff']);
    $task = PickupTask::factory()->create(['status' => 'SCHEDULED', 'assigned_staff_id' => null]);
    $token = $staff->createToken('mobile:'.Str::uuid().':Android', ['mobile:read', 'mobile:execute'], now()->addDay());
    $body = ['expected_version' => 1, 'expected_assigned_staff_id' => null];
    $this->withToken($token->plainTextToken)->postJson(route('mobile.tasks.takeover', $task), $body)->assertOk()
        ->assertJsonPath('data.status', 'ASSIGNED')->assertJsonPath('data.assigned_staff.id', $staff->id)
        ->assertJsonPath('data.can.execute', true)->assertJsonPath('data.version', 2)->assertJsonPath('data.execution_started_at', null);
    $this->getJson(route('mobile.tasks.candidates'))->assertJsonCount(0, 'data');
    $this->getJson(route('mobile.tasks.index', ['mine' => 1]))->assertJsonPath('data.0.id', $task->id);
    $this->postJson(route('mobile.tasks.takeover', $task), $body)->assertConflict();
    $otherToken = $other->createToken('mobile:'.Str::uuid().':Android', ['mobile:read', 'mobile:execute'], now()->addDay());
    app('auth')->forgetGuards();
    $this->withToken($otherToken->plainTextToken)->postJson(route('mobile.tasks.takeover', $task), $body)->assertConflict();
    expect($task->fresh()->assigned_staff_id)->toBe($staff->id)->and($task->visits()->count())->toBe(0);
    expect($task->events()->where('action', 'assigned')->where('actor_id', $staff->id)->whereNull('previous_staff_id')->count())->toBe(1);
});

test('claim requires a known empty owner and an execute-capable token', function () {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $task = PickupTask::factory()->create(['status' => 'SCHEDULED', 'assigned_staff_id' => null]);
    $read = $staff->createToken('mobile:'.Str::uuid().':Android', ['mobile:read'], now()->addDay());
    $this->withToken($read->plainTextToken)->postJson(route('mobile.tasks.takeover', $task), ['expected_version' => 1, 'expected_assigned_staff_id' => null])->assertForbidden();
    $execute = $staff->createToken('mobile:'.Str::uuid().':Android', ['mobile:read', 'mobile:execute'], now()->addDay());
    app('auth')->forgetGuards();
    $this->withToken($execute->plainTextToken)->postJson(route('mobile.tasks.takeover', $task), ['expected_version' => 1])->assertUnprocessable()->assertJsonValidationErrors('expected_assigned_staff_id');
    $this->postJson(route('mobile.tasks.takeover', $task), ['expected_version' => 1, 'expected_assigned_staff_id' => 0])->assertUnprocessable();
    $this->postJson(route('mobile.tasks.takeover', $task), ['expected_version' => 1, 'expected_assigned_staff_id' => null, 'assigned_staff_id' => $staff->id])->assertUnprocessable();
    expect($task->fresh()->assigned_staff_id)->toBeNull()->and($task->version)->toBe(1);
});

test('mobile takeover preserves guards and prevents previous owner execution', function () {
    $old = User::factory()->create(['role' => 'pickup_staff']);
    $new = User::factory()->create(['role' => 'pickup_staff']);
    $task = PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $old->id]);
    $token = $new->createToken('mobile:'.Str::uuid().':Android', ['mobile:read', 'mobile:execute'], now()->addDay());
    $this->withToken($token->plainTextToken)->postJson(route('mobile.tasks.takeover', $task), ['expected_version' => 1, 'expected_assigned_staff_id' => $old->id])->assertOk()->assertJsonPath('data.assigned_staff.id', $new->id);
    $this->postJson(route('mobile.tasks.takeover', $task), ['expected_version' => 1, 'expected_assigned_staff_id' => $old->id])->assertConflict();
    $oldToken = $old->createToken('mobile:'.Str::uuid().':Android', ['mobile:read', 'mobile:execute'], now()->addDay());
    app('auth')->forgetGuards();
    $this->withToken($oldToken->plainTextToken)->postJson(route('mobile.tasks.start', $task), ['expected_version' => 2])->assertForbidden();
    expect($task->visits()->count())->toBe(0);
    expect($task->events()->where('action', 'taken_over')->count())->toBe(1);
});

test('mobile collected and no packages preserve lifecycle and replay guards', function (string $outcome) {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $token = $staff->createToken('mobile:'.Str::uuid().':Android', ['mobile:read', 'mobile:execute'], now()->addDay());
    $task = PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $staff->id]);
    $this->withToken($token->plainTextToken)->postJson(route('mobile.tasks.start', $task), ['expected_version' => 1])->assertCreated();
    $this->postJson(route('mobile.tasks.start', $task), ['expected_version' => 1])->assertOk();
    if ($outcome === 'NO_PACKAGES') {
        $this->postJson(route('mobile.tasks.visit', $task), ['expected_version' => 2, 'outcome' => $outcome])->assertUnprocessable()->assertJsonValidationErrors('reason');
    }
    $body = ['expected_version' => 2, 'outcome' => $outcome, 'reason' => $outcome === 'NO_PACKAGES' ? 'Customer tutup' : null, 'notes' => null];
    $this->postJson(route('mobile.tasks.visit', $task), $body)->assertOk();
    $this->postJson(route('mobile.tasks.visit', $task), $body)->assertOk();
    $this->postJson(route('mobile.tasks.visit', $task), [...$body, 'notes' => 'different'])->assertConflict();
    expect($task->fresh()->status)->toBe($outcome === 'NO_PACKAGES' ? 'NO_PACKAGES' : 'ASSIGNED');
    expect($task->visits()->count())->toBe(1);
    expect($task->events()->where('action', 'visit_recorded')->count())->toBe(1);
    if ($outcome === 'NO_PACKAGES') {
        $this->postJson(route('mobile.tasks.retry', $task), ['expected_version' => 3, 'reason' => 'Customer siap'])->assertConflict();
        $this->getJson(route('mobile.tasks.show', $task))->assertOk()->assertJsonPath('data.status', 'NO_PACKAGES')->assertJsonPath('data.can.retry', false)->assertJsonPath('data.can.execute', false)->assertJsonPath('data.can.create_follow_up', true);
        $this->postJson(route('mobile.tasks.start', $task), ['expected_version' => 3])->assertConflict();
        $this->getJson(route('mobile.tasks.index', ['mine' => 1]))->assertOk()->assertJsonCount(0, 'data');
        $this->getJson(route('mobile.tasks.index', ['mine' => 1, 'history' => 1]))->assertOk()->assertJsonPath('data.0.id', $task->id);
        expect($task->visits()->count())->toBe(1);
    }
})->with(['COLLECTED', 'NO_PACKAGES']);

test('mobile lifecycle endpoints require valid active pickup bearer', function (string $role, bool $active, int $expected) {
    $user = User::factory()->create(['role' => $role, 'is_active' => $active]);
    $task = PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $user->id]);
    $token = $user->createToken('mobile:'.Str::uuid().':Android', ['mobile:read', 'mobile:execute'], now()->addDay());
    $this->withToken($token->plainTextToken)->postJson(route('mobile.tasks.start', $task), ['expected_version' => 1])->assertStatus($expected);
})->with([['cs', true, 403], ['pickup_staff', false, 403]]);
