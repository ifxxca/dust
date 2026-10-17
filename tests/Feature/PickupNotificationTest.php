<?php

use App\Actions\Pickup\StartPickup;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

test('web managers see confirmed proof once while start and collected produce no notification', function () {
    Storage::fake('local');
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $manager = User::factory()->create(['role' => 'cs']);
    $task = PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $staff->id]);
    $token = $staff->createToken('mobile:'.Str::uuid().':Android', ['mobile:read', 'mobile:execute'], now()->addDay());
    $this->withToken($token->plainTextToken)->postJson(route('mobile.tasks.start', $task), ['expected_version' => 1])->assertCreated();
    $this->postJson(route('mobile.tasks.start', $task), ['expected_version' => 1])->assertOk();
    $this->postJson(route('mobile.tasks.visit', $task), ['expected_version' => 2, 'outcome' => 'COLLECTED'])->assertOk();
    app('auth')->forgetGuards();
    $this->withHeader('Authorization', '')->actingAs($manager)->getJson(route('api.pickup-notifications.index'))
        ->assertOk()->assertJsonCount(0, 'data')->assertJsonPath('meta.unread_count', 0);

    $payload = ['expected_version' => 3, 'submission_key' => (string) Str::uuid(), 'manual_hybrid' => 1, 'cashless_hybrid' => 2, 'css_orion' => 0, 'signature' => UploadedFile::fake()->image('signature.png')];
    $this->actingAs($staff)->postJson(route('api.tasks.proof', $task), [...$payload, 'expected_version' => 99])->assertConflict();
    $this->actingAs($manager)->getJson(route('api.pickup-notifications.index'))->assertJsonCount(0, 'data');
    $this->actingAs($staff)->postJson(route('api.tasks.proof', $task), $payload)->assertCreated();
    $this->postJson(route('api.tasks.proof', $task), $payload)->assertOk();
    $response = $this->actingAs($manager)->getJson(route('api.pickup-notifications.index'))
        ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.title', 'Pickup selesai')
        ->assertJsonPath('data.0.task_id', $task->id)->assertJsonPath('data.0.staff_name', $staff->name)
        ->assertJsonPath('data.0.customer_name', $task->customer_name_snapshot)->assertJsonPath('meta.unread_count', 1);
    expect($task->fresh()->status)->toBe('PICKED_UP');
    expect(array_keys($response->json('data.0')))->toBe(['id', 'type', 'title', 'task_id', 'reference', 'customer_name', 'staff_name', 'occurred_at', 'read']);
});

test('read state is per manager and marking displayed events cannot hide later commits', function () {
    $first = User::factory()->create(['role' => 'cs']);
    $second = User::factory()->create(['role' => 'admin_supervisor']);
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $task = PickupTask::factory()->create(['status' => 'PICKED_UP', 'assigned_staff_id' => $staff->id]);
    $eventId = $task->events()->create(['action' => 'pickup_finalized', 'actor_id' => $staff->id, 'task_version' => 3, 'occurred_at' => now()])->id;
    $this->actingAs($first)->patchJson(route('api.pickup-notifications.update'), ['event_ids' => [$eventId], 'user_id' => $second->id])->assertOk();
    $this->patchJson(route('api.pickup-notifications.update'), ['event_ids' => [$eventId]])->assertOk();
    $this->getJson(route('api.pickup-notifications.index'))->assertJsonPath('meta.unread_count', 0)->assertJsonPath('data.0.read', true);
    $this->actingAs($second)->getJson(route('api.pickup-notifications.index'))->assertJsonPath('meta.unread_count', 1)->assertJsonPath('data.0.read', false);
    $other = PickupTask::factory()->create(['status' => 'PICKED_UP', 'assigned_staff_id' => $staff->id]);
    $other->events()->create(['action' => 'pickup_finalized', 'actor_id' => $staff->id, 'task_version' => 3, 'occurred_at' => now()]);
    $this->actingAs($first)->getJson(route('api.pickup-notifications.index'))->assertJsonPath('meta.unread_count', 1)->assertJsonPath('data.0.read', false);
    $this->assertDatabaseCount('pickup_notification_reads', 1);
    $this->assertDatabaseHas('pickup_notification_reads', ['user_id' => $first->id, 'pickup_task_event_id' => $eventId]);
});

test('notifications require an active web manager session', function (string $role, bool $active, int $status) {
    $user = User::factory()->create(['role' => $role, 'is_active' => $active]);
    $this->actingAs($user)->getJson(route('api.pickup-notifications.index'))->assertStatus($status);
    $this->patchJson(route('api.pickup-notifications.update'), ['event_ids' => [1]])->assertStatus($status === 200 ? 422 : $status);
})->with([['cs', true, 200], ['admin_supervisor', true, 200], ['cs', false, 403], ['admin_supervisor', false, 403], ['pickup_staff', true, 403], ['retail_staff', true, 403]]);

test('guest and mobile bearer cannot access web notification feed', function () {
    $this->getJson(route('api.pickup-notifications.index'))->assertUnauthorized();
    $this->patchJson(route('api.pickup-notifications.update'), ['event_ids' => [1]])->assertUnauthorized();
    $staff = User::factory()->create(['role' => 'admin_supervisor']);
    $token = $staff->createToken('mobile:test:Android', ['*'], now()->addDay());
    $this->withToken($token->plainTextToken)->getJson(route('api.pickup-notifications.index'))->assertUnauthorized();
});

test('marking notifications read requires the web csrf token', function () {
    $manager = User::factory()->create(['role' => 'cs']);
    $this->app['env'] = 'local';
    $this->actingAs($manager)->withSession(['_token' => 'notifications-csrf'])
        ->patchJson(route('api.pickup-notifications.update'), ['event_ids' => [1]])->assertStatus(419);
    $this->assertDatabaseCount('pickup_notification_reads', 0);
});

test('rolled back execution leaves no notification and no packages is not successful POP', function () {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $manager = User::factory()->create(['role' => 'cs']);
    $task = PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $staff->id]);
    DB::beginTransaction();
    try {
        app(StartPickup::class)->handle($staff, $task->id, 1);
    } finally {
        DB::rollBack();
    }
    $this->actingAs($manager)->getJson(route('api.pickup-notifications.index'))->assertJsonCount(0, 'data');
    $this->actingAs($staff)->postJson(route('api.tasks.start', $task), ['expected_version' => 1])->assertCreated();
    $this->postJson(route('api.tasks.visit', $task), ['expected_version' => 2, 'outcome' => 'NO_PACKAGES', 'reason' => 'Tidak ada paket'])->assertOk();
    $this->actingAs($manager)->getJson(route('api.pickup-notifications.index'))->assertJsonCount(0, 'data')->assertJsonPath('meta.unread_count', 0);
});

test('feed paginates and rejects invalid page or reading unrelated audit events', function () {
    $manager = User::factory()->create(['role' => 'cs']);
    $task = PickupTask::factory()->create();
    for ($version = 1; $version <= 21; $version++) {
        $task->events()->create(['action' => 'pickup_finalized', 'actor_id' => $manager->id, 'task_version' => $version, 'occurred_at' => now()]);
    }
    $unrelated = $task->events()->create(['action' => 'execution_started', 'actor_id' => $manager->id, 'task_version' => 22, 'occurred_at' => now()]);
    $this->actingAs($manager)->getJson(route('api.pickup-notifications.index'))->assertJsonCount(20, 'data')->assertJsonPath('meta.last_page', 2)->assertJsonPath('meta.unread_count', 21);
    $this->getJson(route('api.pickup-notifications.index', ['page' => 2]))->assertJsonCount(1, 'data')->assertJsonPath('meta.current_page', 2);
    $this->getJson(route('api.pickup-notifications.index', ['page' => 0]))->assertUnprocessable()->assertJsonValidationErrors('page');
    $this->patchJson(route('api.pickup-notifications.update'), ['event_ids' => [$unrelated->id]])->assertUnprocessable()->assertJsonValidationErrors('event_ids.0');
    $this->patchJson(route('api.pickup-notifications.update'), ['event_ids' => []])->assertUnprocessable()->assertJsonValidationErrors('event_ids');
    $this->patchJson(route('api.pickup-notifications.update'), ['event_ids' => [999999]])->assertUnprocessable()->assertJsonValidationErrors('event_ids.0');
    $this->patchJson(route('api.pickup-notifications.update'), ['event_ids' => [1, 1]])->assertUnprocessable()->assertJsonValidationErrors('event_ids.0');
    $this->patchJson(route('api.pickup-notifications.update'), ['event_ids' => range(1, 21)])->assertUnprocessable()->assertJsonValidationErrors('event_ids');
    $this->assertDatabaseCount('pickup_notification_reads', 0);
});
