<?php

use App\Actions\Mobile\FcmClient;
use App\Actions\Pickup\StartPickup;
use App\Actions\Pickup\TakeOverTask;
use App\Jobs\SendPickupAssignmentPush;
use App\Models\MobilePushDevice;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;

function pushRegistration(User $user): array
{
    $installation = (string) Str::uuid();
    $token = $user->createToken('mobile:'.$installation.':Android', ['mobile:read'], now()->addHours(24));
    $fcm = 'fcm-test-'.Str::random(30);
    $device = MobilePushDevice::create(['installation_id' => $installation, 'user_id' => $user->id,
        'personal_access_token_id' => $token->accessToken->id, 'fcm_token' => $fcm, 'token_hash' => hash('sha256', $fcm), 'is_active' => true]);

    return [$device, $token];
}

function mockFcmHttp(object $test, int $status = 200, array $body = ['name' => 'projects/push-test/messages/test']): void
{
    $key = openssl_pkey_new(['private_key_bits' => 2048]);
    openssl_pkey_export($key, $private);
    $test->credentialsPath = tempnam(sys_get_temp_dir(), 'fcm_test_');
    file_put_contents($test->credentialsPath, json_encode(['project_id' => 'push-test', 'client_email' => 'test@example.test', 'private_key' => $private]));
    config(['mobile_push.credentials' => $test->credentialsPath, 'mobile_push.project_id' => 'push-test', 'mobile_push.enabled' => true]);
    Http::preventStrayRequests();
    Http::fake(['https://oauth2.googleapis.com/token' => Http::response(['access_token' => 'mock-oauth'], 200),
        'https://fcm.googleapis.com/v1/projects/push-test/messages:send' => Http::response($body, $status)]);
}

afterEach(function () {
    if (isset($this->credentialsPath) && is_file($this->credentialsPath)) {
        unlink($this->credentialsPath);
    }
});

test('push registration cannot reuse a token bound to another installation', function () {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    [$first] = pushRegistration($staff);
    [$second, $token] = pushRegistration($staff);
    $this->withToken($token->plainTextToken)->postJson(route('mobile.push.store'), ['installation_id' => $second->installation_id, 'fcm_token' => $first->fcm_token])->assertConflict();
    expect($second->fresh()->token_hash)->toBe($second->token_hash);
});

test('switching accounts rebinds installation without targeting the previous account', function () {
    $old = User::factory()->create(['role' => 'pickup_staff']);
    [$device] = pushRegistration($old);
    $new = User::factory()->create(['role' => 'pickup_staff']);
    $token = $new->createToken('mobile:'.$device->installation_id.':Android', ['mobile:read'], now()->addHours(24));
    $this->withToken($token->plainTextToken)->postJson(route('mobile.push.store'), ['installation_id' => $device->installation_id, 'fcm_token' => $device->fcm_token])->assertOk();
    expect($device->fresh()->user_id)->toBe($new->id);
    expect(MobilePushDevice::where('user_id', $old->id)->count())->toBe(0);
    $this->assertDatabaseCount('mobile_push_devices', 1);
});

test('unchanged assignee audit does not queue any assignment notification', function () {
    config(['mobile_push.enabled' => true]);
    Queue::fake([SendPickupAssignmentPush::class]);
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $task = PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $staff->id]);
    $task->events()->create(['action' => 'assigned', 'actor_id' => $staff->id, 'previous_staff_id' => $staff->id, 'new_staff_id' => $staff->id, 'task_version' => 1, 'occurred_at' => now()]);
    Queue::assertNothingPushed();
});

test('queue failure cannot undo an assignment transaction', function () {
    config(['mobile_push.enabled' => true]);
    $queue = Mockery::mock(Illuminate\Contracts\Queue\Queue::class);
    $queue->shouldReceive('push')->once()->andThrow(new RuntimeException('Queue unavailable'));
    Queue::shouldReceive('connection')->with('database')->andReturn($queue);
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    pushRegistration($staff);
    $task = PickupTask::factory()->create();
    $this->actingAs(User::factory()->create())->postJson(route('api.tasks.assign', $task), ['assigned_staff_id' => $staff->id, 'expected_version' => 1])->assertOk();
    expect($task->fresh()->status)->toBe('ASSIGNED');
    expect($task->events()->where('action', 'assigned')->count())->toBe(1);
});

test('notification target no longer owned returns safe detail state', function () {
    $old = User::factory()->create(['role' => 'pickup_staff']);
    [$device, $token] = pushRegistration($old);
    $new = User::factory()->create(['role' => 'pickup_staff']);
    $task = PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $old->id]);
    app(TakeOverTask::class)->handle($new, $task->id, 1, $old->id);
    app(StartPickup::class)->handle($new, $task->id, 2);
    $this->withToken($token->plainTextToken)->getJson(route('mobile.tasks.show', $task))->assertNotFound()->assertJsonMissingPath('data');
});

test('FCM timeout preserves the task and records uncertain delivery without retry', function () {
    mockFcmHttp($this);
    Http::fake(['https://fcm.googleapis.com/v1/projects/push-test/messages:send' => Http::failedConnection()]);
    Queue::fake([SendPickupAssignmentPush::class]);
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    [$device] = pushRegistration($staff);
    $task = PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $staff->id]);
    $event = $task->events()->create(['action' => 'assigned', 'actor_id' => $staff->id, 'new_staff_id' => $staff->id, 'task_version' => 1, 'occurred_at' => now()]);
    $job = new SendPickupAssignmentPush($event->id, $device->id);
    $job->handle(app(FcmClient::class));
    $job->handle(app(FcmClient::class));
    $this->assertDatabaseHas('mobile_push_deliveries', ['status' => 'failed_or_uncertain']);
    expect($task->fresh()->status)->toBe('ASSIGNED');
    Http::assertSentCount(2);
});

test('push registration requires mobile bearer and binds installation to that session', function () {
    $this->postJson(route('mobile.push.store'), [])->assertUnauthorized();
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    [$device, $token] = pushRegistration($staff);
    $this->withToken($token->plainTextToken)->postJson(route('mobile.push.store'), [])->assertUnprocessable()->assertJsonValidationErrors(['installation_id', 'fcm_token']);
    $this->postJson(route('mobile.push.store'), ['installation_id' => (string) Str::uuid(), 'fcm_token' => str_repeat('x', 30)])->assertForbidden();
    $this->postJson(route('mobile.push.store'), ['installation_id' => $device->installation_id, 'fcm_token' => str_repeat('y', 30)])
        ->assertOk()->assertJsonPath('data.registered', true)->assertJsonMissingPath('data.fcm_token');
    expect($device->fresh()->fcm_token)->toBe(str_repeat('y', 30));
    expect(DB::table('mobile_push_devices')->value('fcm_token'))->not->toBe(str_repeat('y', 30));
    $this->assertDatabaseCount('mobile_push_devices', 1);
});

test('inactive or unsupported mobile users cannot register push', function (array $attributes) {
    $user = User::factory()->create($attributes);
    [$device, $token] = pushRegistration($user);
    $this->withToken($token->plainTextToken)->postJson(route('mobile.push.store'), ['installation_id' => $device->installation_id, 'fcm_token' => str_repeat('x', 30)])->assertForbidden();
})->with([[['role' => 'cs']], [['role' => 'pickup_staff', 'is_active' => false]]]);

test('assignment commits an audit and queues one push while replay stays a conflict', function () {
    config(['mobile_push.enabled' => true]);
    Queue::fake([SendPickupAssignmentPush::class]);
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    pushRegistration($staff);
    $task = PickupTask::factory()->create();
    $this->actingAs(User::factory()->create())->postJson(route('api.tasks.assign', $task), ['assigned_staff_id' => $staff->id, 'expected_version' => 1])->assertOk();
    $event = $task->events()->where('action', 'assigned')->sole();
    $this->postJson(route('api.tasks.assign', $task), ['assigned_staff_id' => $staff->id, 'expected_version' => 2])->assertConflict();
    Queue::assertPushed(SendPickupAssignmentPush::class, fn ($job) => $job->eventId === $event->id && $job->queue === 'mobile-push');
    Queue::assertPushed(SendPickupAssignmentPush::class, 1);
    expect($task->fresh()->assigned_staff_id)->toBe($staff->id);
    expect($task->events()->where('action', 'assigned')->count())->toBe(1);
});

test('database mobile push worker processes committed assignment with mocked FCM transport', function () {
    mockFcmHttp($this);
    config(['queue.connections.database.connection' => config('database.default')]);
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    pushRegistration($staff);
    $task = PickupTask::factory()->create();
    $this->actingAs(User::factory()->create())->postJson(route('api.tasks.assign', $task), ['assigned_staff_id' => $staff->id, 'expected_version' => 1])->assertOk();
    $this->assertDatabaseHas('jobs', ['queue' => 'mobile-push']);
    Artisan::call('queue:work', ['connection' => 'database', '--queue' => 'mobile-push', '--once' => true, '--tries' => 1, '--timeout' => 60]);
    $this->assertDatabaseCount('jobs', 0);
    $this->assertDatabaseHas('mobile_push_deliveries', ['status' => 'accepted']);
    Http::assertSentCount(2);
    expect($task->fresh()->status)->toBe('ASSIGNED');
});

test('rolled back assignment never queues push', function () {
    config(['mobile_push.enabled' => true]);
    Queue::fake([SendPickupAssignmentPush::class]);
    $task = PickupTask::factory()->create();
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    DB::beginTransaction();
    pushRegistration($staff);
    $task->events()->create(['action' => 'assigned', 'actor_id' => $staff->id, 'new_staff_id' => $staff->id, 'task_version' => 2, 'occurred_at' => now()]);
    Queue::assertNothingPushed();
    DB::rollBack();
    Queue::assertNothingPushed();
    expect($task->events()->count())->toBe(0);
});

test('FCM sends only minimum nonsensitive payload once per assignment and device', function () {
    mockFcmHttp($this);
    Queue::fake([SendPickupAssignmentPush::class]);
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    [$device] = pushRegistration($staff);
    $task = PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $staff->id]);
    $event = $task->events()->create(['action' => 'assigned', 'actor_id' => $staff->id, 'new_staff_id' => $staff->id, 'task_version' => 1, 'occurred_at' => now()]);
    $job = new SendPickupAssignmentPush($event->id, $device->id);
    $job->handle(app(FcmClient::class));
    $job->handle(app(FcmClient::class));
    Http::assertSent(fn ($request) => str_contains($request->url(), 'messages:send')
        && $request['message']['token'] === $device->fcm_token
        && $request['message']['notification']['title'] === 'Pickup baru ditugaskan'
        && $request['message']['notification']['body'] === 'Anda memiliki tugas pickup baru. Ketuk untuk melihat detail tugas.'
        && $request['message']['data'] === ['type' => 'pickup_assigned', 'task_id' => (string) $task->id, 'event_id' => (string) $event->id, 'recipient_id' => (string) $staff->id]);
    Http::assertSentCount(2);
    $this->assertDatabaseHas('mobile_push_deliveries', ['pickup_task_event_id' => $event->id, 'status' => 'accepted']);
});

test('assignment queues independent deliveries to both active installations', function () {
    mockFcmHttp($this);
    Queue::fake([SendPickupAssignmentPush::class]);
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    [$first] = pushRegistration($staff);
    [$second] = pushRegistration($staff);
    $task = PickupTask::factory()->create();
    $this->actingAs(User::factory()->create())->postJson(route('api.tasks.assign', $task), ['assigned_staff_id' => $staff->id, 'expected_version' => 1])->assertOk();
    Queue::assertPushed(SendPickupAssignmentPush::class, 2);
    foreach (Queue::pushed(SendPickupAssignmentPush::class) as $job) {
        $job->handle(app(FcmClient::class));
    }
    Http::assertSent(fn ($request) => str_contains($request->url(), 'messages:send') && $request['message']['token'] === $first->fcm_token);
    Http::assertSent(fn ($request) => str_contains($request->url(), 'messages:send') && $request['message']['token'] === $second->fcm_token);
    Http::assertSentCount(3);
    $this->assertDatabaseCount('mobile_push_deliveries', 2);
});

test('takeover notifies new staff and suppresses pending delivery to previous staff', function () {
    mockFcmHttp($this);
    Queue::fake([SendPickupAssignmentPush::class]);
    $old = User::factory()->create(['role' => 'pickup_staff']);
    $new = User::factory()->create(['role' => 'pickup_staff']);
    [$oldDevice] = pushRegistration($old);
    [$newDevice] = pushRegistration($new);
    $task = PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $old->id]);
    $oldEvent = $task->events()->create(['action' => 'assigned', 'actor_id' => $old->id, 'new_staff_id' => $old->id, 'task_version' => 1, 'occurred_at' => now()]);
    app(TakeOverTask::class)->handle($new, $task->id, 1, $old->id);
    $event = $task->events()->where('action', 'taken_over')->sole();
    (new SendPickupAssignmentPush($oldEvent->id, $oldDevice->id))->handle(app(FcmClient::class));
    (new SendPickupAssignmentPush($event->id, $newDevice->id))->handle(app(FcmClient::class));
    Http::assertSent(fn ($request) => str_contains($request->url(), 'messages:send') && $request['message']['token'] === $newDevice->fcm_token);
    Http::assertSentCount(2);
    $this->assertDatabaseCount('mobile_push_deliveries', 1);
});

test('inactive expired revoked and disabled registrations receive no new push', function (string $condition) {
    mockFcmHttp($this);
    Queue::fake([SendPickupAssignmentPush::class]);
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    [$device, $token] = pushRegistration($staff);
    $task = PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $staff->id]);
    $event = $task->events()->create(['action' => 'assigned', 'actor_id' => $staff->id, 'new_staff_id' => $staff->id, 'task_version' => 1, 'occurred_at' => now()]);
    match ($condition) {
        'inactive' => $staff->update(['is_active' => false]),
        'role' => $staff->update(['role' => 'cs']),
        'expired' => $token->accessToken->update(['expires_at' => now()->subMinute()]),
        'revoked' => $token->accessToken->delete(),
        'disabled' => $device->update(['is_active' => false]),
    };
    (new SendPickupAssignmentPush($event->id, $device->id))->handle(app(FcmClient::class));
    Http::assertNothingSent();
})->with(['inactive', 'role', 'expired', 'revoked', 'disabled']);

test('online logout removes only registrations linked to that mobile session', function () {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    [$first, $token] = pushRegistration($staff);
    [$second] = pushRegistration($staff);
    $this->withToken($token->plainTextToken)->deleteJson(route('mobile.auth.destroy'))->assertOk();
    expect(MobilePushDevice::find($first->id))->toBeNull();
    expect(MobilePushDevice::find($second->id))->not->toBeNull();
});

test('FCM failure leaves assignment committed and does not replay uncertain delivery', function () {
    mockFcmHttp($this, 503, ['error' => ['status' => 'UNAVAILABLE']]);
    Queue::fake([SendPickupAssignmentPush::class]);
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    [$device] = pushRegistration($staff);
    $task = PickupTask::factory()->create();
    $this->actingAs(User::factory()->create())->postJson(route('api.tasks.assign', $task), ['assigned_staff_id' => $staff->id, 'expected_version' => 1])->assertOk();
    $event = $task->events()->where('action', 'assigned')->sole();
    $job = new SendPickupAssignmentPush($event->id, $device->id);
    $job->handle(app(FcmClient::class));
    $job->handle(app(FcmClient::class));
    expect($task->fresh()->status)->toBe('ASSIGNED');
    $this->assertDatabaseHas('mobile_push_deliveries', ['status' => 'failed_or_uncertain']);
    Http::assertSentCount(2);
});

test('FCM unregistered disables the stale token without leaking FCM errors', function () {
    mockFcmHttp($this, 404, ['error' => ['details' => [['errorCode' => 'UNREGISTERED']]]]);
    Queue::fake([SendPickupAssignmentPush::class]);
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    [$device] = pushRegistration($staff);
    $task = PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $staff->id]);
    $event = $task->events()->create(['action' => 'assigned', 'actor_id' => $staff->id, 'new_staff_id' => $staff->id, 'task_version' => 1, 'occurred_at' => now()]);
    (new SendPickupAssignmentPush($event->id, $device->id))->handle(app(FcmClient::class));
    expect($device->fresh()->is_active)->toBeFalse();
    Http::assertSentCount(2);
});
