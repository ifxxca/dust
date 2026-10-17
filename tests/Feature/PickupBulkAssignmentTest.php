<?php

use App\Actions\Pickup\AssignPickupTasks;
use App\Jobs\SendPickupAssignmentPush;
use App\Models\MobilePushDevice;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;

test('CS and admin assign several scheduled tasks atomically with one audit each', function (string $role) {
    $actor = User::factory()->create(['role' => $role]);
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $tasks = PickupTask::factory()->count(3)->create();
    $payload = ['assigned_staff_id' => (string) $staff->id, 'tasks' => $tasks->reverse()->map(fn ($task) => ['id' => (string) $task->id, 'expected_version' => '1'])->values()->all()];
    $this->actingAs($actor)->postJson(route('api.tasks.bulkAssign'), $payload)->assertOk()->assertJsonCount(3, 'data')->assertJsonPath('meta.assigned_count', 3);
    foreach ($tasks as $task) {
        expect($task->fresh()->status)->toBe('ASSIGNED');
        expect($task->fresh()->assigned_staff_id)->toBe($staff->id);
        expect($task->fresh()->version)->toBe(2);
        expect($task->events()->count())->toBe(1);
        $this->assertDatabaseHas('pickup_task_events', ['pickup_task_id' => $task->id, 'action' => 'assigned', 'actor_id' => $actor->id, 'new_staff_id' => $staff->id, 'previous_staff_id' => null, 'task_version' => 2]);
    }
    $this->postJson(route('api.tasks.bulkAssign'), $payload)->assertConflict();
    $this->assertDatabaseCount('pickup_task_events', 3);
})->with(['cs', 'admin_supervisor']);

test('bulk assignment rejects a stale version or non scheduled task with 409 without changing other tasks', function (string $status, int $version) {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $first = PickupTask::factory()->create();
    $second = PickupTask::factory()->create(['status' => $status, 'version' => $version]);
    $this->actingAs(User::factory()->create())->postJson(route('api.tasks.bulkAssign'), ['assigned_staff_id' => $staff->id, 'tasks' => [
        ['id' => $first->id, 'expected_version' => 1], ['id' => $second->id, 'expected_version' => 1],
    ]])->assertConflict();
    expect($first->fresh()->status)->toBe('SCHEDULED');
    expect($first->fresh()->version)->toBe(1);
    expect($first->fresh()->assigned_staff_id)->toBeNull();
    expect($second->fresh()->status)->toBe($status);
    $this->assertDatabaseCount('pickup_task_events', 0);
})->with([['SCHEDULED', 2], ['ASSIGNED', 1], ['NO_PACKAGES', 1], ['PICKED_UP', 1], ['CANCELLED', 1]]);

test('bulk assignment requires an active manager and a web session', function (?string $role, bool $active, int $status) {
    if ($role !== null) {
        $this->actingAs(User::factory()->create(['role' => $role, 'is_active' => $active]));
    }
    $this->postJson(route('api.tasks.bulkAssign'), [])->assertStatus($status);
    $this->assertDatabaseCount('pickup_task_events', 0);
})->with([[null, true, 401], ['pickup_staff', true, 403], ['retail_staff', true, 403], ['cs', false, 403], ['admin_supervisor', false, 403]]);

test('bulk assignment preserves existing operational staff eligibility', function (string $role) {
    $staff = User::factory()->create(['role' => $role]);
    $task = PickupTask::factory()->create();
    $this->actingAs(User::factory()->create())->postJson(route('api.tasks.bulkAssign'), ['assigned_staff_id' => $staff->id, 'tasks' => [['id' => $task->id, 'expected_version' => 1]]])->assertOk();
    expect($task->fresh()->assigned_staff_id)->toBe($staff->id);
})->with(['retail_staff', 'admin_supervisor']);

test('bulk assignment rejects inactive and non operational recipients with 422', function (array $attributes) {
    $staff = User::factory()->create($attributes);
    $task = PickupTask::factory()->create();
    $this->actingAs(User::factory()->create())->postJson(route('api.tasks.bulkAssign'), ['assigned_staff_id' => $staff->id, 'tasks' => [['id' => $task->id, 'expected_version' => 1]]])->assertUnprocessable()->assertJsonValidationErrors('assigned_staff_id');
    expect($task->fresh()->status)->toBe('SCHEDULED');
})->with([[['role' => 'pickup_staff', 'is_active' => false]], [['role' => 'cs']]]);

test('bulk assignment validates bounded distinct task snapshots and rejects injected fields with 422', function (string $case, string $field) {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $task = PickupTask::factory()->create();
    $selection = ['id' => $task->id, 'expected_version' => 1];
    $payload = ['assigned_staff_id' => $staff->id, 'tasks' => [$selection]];
    match ($case) {
        'empty' => $payload['tasks'] = [],
        'too_many' => $payload['tasks'] = array_fill(0, 101, $selection),
        'duplicate' => $payload['tasks'][] = ['id' => (string) $task->id, 'expected_version' => 1],
        'missing' => $payload['tasks'][0]['id'] = $task->id + 1000,
        'version' => $payload['tasks'][0]['expected_version'] = 0,
        'nested' => $payload['tasks'][0]['status'] = 'PICKED_UP',
        'top' => $payload['actor_id'] = $staff->id,
    };
    $this->actingAs(User::factory()->create())->postJson(route('api.tasks.bulkAssign'), $payload)->assertUnprocessable()->assertJsonValidationErrors($field);
    expect($task->fresh()->status)->toBe('SCHEDULED');
    $this->assertDatabaseCount('pickup_task_events', 0);
})->with([['empty', 'tasks'], ['too_many', 'tasks'], ['duplicate', 'tasks.1.id'], ['missing', 'tasks.0.id'], ['version', 'tasks.0.expected_version'], ['nested', 'tasks.0'], ['top', 'actor_id']]);

test('bulk assignment pushes once per task and target device after commit and never on rollback or replay', function () {
    config(['mobile_push.enabled' => true]);
    Queue::fake([SendPickupAssignmentPush::class]);
    $actor = User::factory()->create();
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $other = User::factory()->create(['role' => 'pickup_staff']);
    $devices = collect([$staff, $staff, $other])->map(function ($user) {
        $installation = (string) Str::uuid();
        $token = $user->createToken('mobile:'.$installation.':Android', ['mobile:read'], now()->addDay());
        $fcm = 'fake-fcm-'.Str::random(30);

        return MobilePushDevice::create(['installation_id' => $installation, 'user_id' => $user->id, 'personal_access_token_id' => $token->accessToken->id, 'fcm_token' => $fcm, 'token_hash' => hash('sha256', $fcm), 'is_active' => true]);
    });
    $tasks = PickupTask::factory()->count(2)->create();
    $selections = $tasks->map(fn ($task) => ['id' => $task->id, 'expected_version' => 1])->all();
    DB::beginTransaction();
    app(AssignPickupTasks::class)->handle($actor, $staff->id, $selections);
    Queue::assertNothingPushed();
    DB::rollBack();
    Queue::assertNothingPushed();
    $this->assertDatabaseCount('pickup_task_events', 0);
    $this->actingAs($actor)->postJson(route('api.tasks.bulkAssign'), ['assigned_staff_id' => $staff->id, 'tasks' => $selections])->assertOk();
    Queue::assertPushed(SendPickupAssignmentPush::class, 4);
    foreach ($tasks as $task) {
        $event = $task->events()->sole();
        foreach ($devices->take(2) as $device) {
            Queue::assertPushed(SendPickupAssignmentPush::class, fn ($job) => $job->eventId === $event->id && $job->deviceId === $device->id && $job->queue === 'mobile-push');
        }
    }
    Queue::assertNotPushed(SendPickupAssignmentPush::class, fn ($job) => $job->deviceId === $devices->last()->id);
    $this->postJson(route('api.tasks.bulkAssign'), ['assigned_staff_id' => $staff->id, 'tasks' => $selections])->assertConflict();
    Queue::assertPushed(SendPickupAssignmentPush::class, 4);
});

test('bulk assignment action rechecks actor and recipient under lock', function (string $subject) {
    $actor = User::factory()->create();
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $task = PickupTask::factory()->create();
    User::whereKey($subject === 'actor' ? $actor->id : $staff->id)->update(['is_active' => false]);
    try {
        app(AssignPickupTasks::class)->handle($actor, $staff->id, [['id' => $task->id, 'expected_version' => 1]]);
        $this->fail('An inactive actor or recipient must not assign tasks.');
    } catch (HttpException $exception) {
        expect($exception->getStatusCode())->toBe(403);
    } catch (ValidationException $exception) {
        expect($exception->errors())->toHaveKey('assigned_staff_id');
    }
    expect($task->fresh()->status)->toBe('SCHEDULED');
    $this->assertDatabaseCount('pickup_task_events', 0);
})->with(['actor', 'recipient']);

test('queue outage cannot roll back any task in a committed bulk assignment', function () {
    config(['mobile_push.enabled' => true]);
    $queue = Mockery::mock(Illuminate\Contracts\Queue\Queue::class);
    $queue->shouldReceive('push')->twice()->andThrow(new RuntimeException('Queue unavailable'));
    Queue::shouldReceive('connection')->with('database')->andReturn($queue);
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $installation = (string) Str::uuid();
    $token = $staff->createToken('mobile:'.$installation.':Android', ['mobile:read'], now()->addDay());
    $fcm = 'fake-fcm-'.Str::random(30);
    MobilePushDevice::create(['installation_id' => $installation, 'user_id' => $staff->id, 'personal_access_token_id' => $token->accessToken->id, 'fcm_token' => $fcm, 'token_hash' => hash('sha256', $fcm), 'is_active' => true]);
    $tasks = PickupTask::factory()->count(2)->create();
    $this->actingAs(User::factory()->create())->postJson(route('api.tasks.bulkAssign'), ['assigned_staff_id' => $staff->id, 'tasks' => $tasks->map(fn ($task) => ['id' => $task->id, 'expected_version' => 1])->all()])->assertOk()->assertJsonPath('meta.assigned_count', 2);
    expect(PickupTask::where('assigned_staff_id', $staff->id)->where('status', 'ASSIGNED')->count())->toBe(2);
    $this->assertDatabaseCount('pickup_task_events', 2);
});
