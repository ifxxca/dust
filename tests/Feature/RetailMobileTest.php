<?php

use App\Models\Customer;
use App\Models\HandoverSession;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

test('mobile shell returns 503 when its build artifacts are unavailable', function () {
    app()->usePublicPath(sys_get_temp_dir().'/retail-pwa-missing-'.Str::uuid());
    $this->getJson(route('retail.app'))->assertServiceUnavailable()
        ->assertJsonPath('message', 'Aplikasi mobile belum dibangun. Jalankan npm run build:pwa.');
    $this->getJson(route('retail.worker'))->assertServiceUnavailable();
});

test('browser login uses the existing session without creating bearer tokens and logout returns 401', function () {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $this->getJson(route('retail.me'))->assertUnauthorized();
    $this->postJson(route('login.store'), ['email' => $staff->email, 'password' => 'password'])->assertOk();
    $this->getJson(route('retail.me'))->assertOk()->assertJsonPath('data.id', $staff->id)->assertHeader('Cache-Control', 'no-store, private');
    $this->assertDatabaseCount('personal_access_tokens', 0);
    $this->postJson(route('logout'))->assertOk();
    $this->getJson(route('retail.me'))->assertUnauthorized();
});

test('browser session cannot authorize native mobile token endpoints and bearer cannot authorize browser endpoints', function () {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $token = $staff->createToken('mobile:test:Android', ['mobile:read']);
    $this->withToken($token->plainTextToken)->getJson(route('retail.me'))->assertUnauthorized();
    $this->withHeader('Authorization', '')->actingAs($staff)->getJson(route('mobile.me'))->assertUnauthorized();
});

test('browser mobile returns 403 for inactive or non operational accounts', function (string $role, bool $active) {
    $staff = User::factory()->create(['role' => $role, 'is_active' => $active]);
    $this->actingAs($staff)->getJson(route('retail.me'))->assertForbidden();
    $this->getJson(route('retail.tasks.index'))->assertForbidden();
    if (! $active) {
        $this->postJson(route('logout'))->assertOk();
        $this->getJson(route('retail.me'))->assertUnauthorized();
    }
})->with([['cs', true], ['pickup_staff', false]]);

test('browser mobile returns 403 when a retail or supervisor account tries to execute pickup', function (string $role) {
    $staff = User::factory()->create(['role' => $role]);
    $task = PickupTask::factory()->create(['assigned_staff_id' => $staff->id, 'status' => 'ASSIGNED']);
    $this->actingAs($staff)->getJson(route('retail.tasks.show', $task))->assertOk()
        ->assertJsonPath('data.can.execute', false)->assertJsonPath('data.can.assign', false);
    $this->postJson(route('retail.tasks.start', $task), ['expected_version' => $task->version])->assertForbidden();
    expect($task->fresh()->execution_started_at)->toBeNull();
    $this->assertDatabaseCount('pickup_task_events', 0);
})->with(['retail_staff', 'admin_supervisor']);

test('browser task lists isolate staff and hidden task details return 404', function () {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $own = PickupTask::factory()->create(['assigned_staff_id' => $staff->id, 'status' => 'ASSIGNED']);
    $other = PickupTask::factory()->create(['status' => 'ASSIGNED']);
    $this->actingAs($staff)->getJson(route('retail.tasks.index'))->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $own->id);
    $this->getJson(route('retail.tasks.show', $other))->assertNotFound();
    $this->getJson(route('api.users.index'))->assertForbidden();
});

test('browser supervisors create scheduled manual pickups with one audited record on replay', function () {
    $supervisor = User::factory()->create(['role' => 'admin_supervisor']);
    $customer = Customer::factory()->create();
    $payload = ['customer_id' => $customer->id, 'pickup_address' => $customer->pickup_address,
        'scheduled_at' => '2026-11-16T09:00:00+07:00', 'notes' => 'Pickup dibuat supervisor', 'submission_key' => (string) Str::uuid()];

    $id = $this->actingAs($supervisor)->postJson(route('retail.tasks.store'), $payload)->assertCreated()
        ->assertJsonPath('data.status', 'SCHEDULED')->assertJsonPath('data.assigned_staff', null)
        ->assertJsonPath('data.can.execute', false)->json('data.id');
    $this->postJson(route('retail.tasks.store'), $payload)->assertOk()->assertJsonPath('data.id', $id);
    $task = PickupTask::sole();
    expect($task->created_by)->toBe($supervisor->id)->and($task->version)->toBe(1)
        ->and($task->events()->pluck('action')->all())->toBe(['created']);
    $this->getJson(route('retail.tasks.show', $task))->assertOk()->assertJsonPath('data.can.take_over', false);
    $this->postJson(route('retail.tasks.takeover', $task), ['expected_version' => 1, 'expected_assigned_staff_id' => null])->assertForbidden();
    $this->assertDatabaseCount('pickup_tasks', 1);
});

test('browser retail accounts cannot create pickup tasks', function () {
    $staff = User::factory()->create(['role' => 'retail_staff']);
    $customer = Customer::factory()->create();
    $this->actingAs($staff)->postJson(route('retail.tasks.store'), [
        'customer_id' => $customer->id, 'pickup_address' => $customer->pickup_address,
        'scheduled_at' => '2026-11-16T09:00:00+07:00', 'notes' => 'Tidak berwenang', 'submission_key' => (string) Str::uuid(),
    ])->assertForbidden();
    $this->assertDatabaseCount('pickup_tasks', 0);
});

test('browser writes require CSRF protection and a valid token reaches existing validation', function () {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    app()->instance('env', 'local');
    $this->actingAs($staff)->postJson(route('retail.handovers.store'), [])->assertStatus(419);
    $this->withSession(['_token' => 'csrf-fixture'])->withHeader('X-CSRF-TOKEN', 'csrf-fixture')
        ->postJson(route('retail.handovers.store'), [])->assertUnprocessable()->assertJsonValidationErrors('task_ids');
    $this->assertDatabaseCount('handover_sessions', 0);
});

test('browser execution and proof reuse idempotency audit and private photo signature evidence', function () {
    Storage::fake('local');
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $task = PickupTask::factory()->create(['assigned_staff_id' => $staff->id, 'status' => 'ASSIGNED']);
    $started = $this->actingAs($staff)->postJson(route('retail.tasks.start', $task), ['expected_version' => $task->version])->assertCreated();
    $this->postJson(route('retail.tasks.visit', $task), ['expected_version' => $task->fresh()->version, 'outcome' => 'COLLECTED'])->assertOk();
    $body = ['expected_version' => $task->fresh()->version, 'submission_key' => (string) Str::uuid(),
        'manual_hybrid' => 1, 'cashless_hybrid' => 0, 'css_orion' => 0,
        'signature' => UploadedFile::fake()->image('signature.png'), 'photos' => [UploadedFile::fake()->image('photo.jpg')]];
    $proof = $this->postJson(route('retail.tasks.proof', $task), $body)->assertCreated()->assertJsonPath('data.total', 1);
    $this->postJson(route('retail.tasks.proof', $task), $body)->assertOk()->assertJsonPath('data.id', $proof->json('data.id'));
    $this->getJson(route('retail.submissions.show', ['submission_key' => $body['submission_key'], 'kind' => 'proof']))->assertOk()->assertJsonPath('data.committed', true);
    expect($proof->json('data.attachments.0.url'))->toStartWith('/m/api/v1/pickup-evidence/');
    $attachment = $task->proof()->first()->attachments()->first();
    $this->get(route('retail.evidence', $attachment))->assertOk()->assertHeader('Cache-Control', 'no-store, private');
    $this->actingAs(User::factory()->create(['role' => 'pickup_staff']))->getJson(route('retail.evidence', $attachment))->assertNotFound();
    $this->assertDatabaseCount('pickup_records', 1);
    $this->assertDatabaseCount('pickup_attachments', 2);
    $this->assertDatabaseCount('pickup_task_events', 3);
    expect($task->fresh()->status)->toBe('PICKED_UP');
});

test('browser handover replays one submission without duplicate membership', function () {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $task = PickupTask::factory()->create(['assigned_staff_id' => $staff->id, 'status' => 'PICKED_UP']);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'staff_id' => $staff->id]);
    $body = ['submission_key' => (string) Str::uuid(), 'task_ids' => [$task->id]];
    $created = $this->actingAs($staff)->postJson(route('retail.handovers.store'), $body)->assertCreated();
    $this->postJson(route('retail.handovers.store'), $body)->assertOk()->assertJsonPath('data.id', $created->json('data.id'));
    $this->getJson(route('retail.handovers.index'))->assertOk()->assertJsonMissingPath('data.0.items');
    $this->assertDatabaseCount('handover_sessions', 1);
    $this->assertDatabaseCount('handover_items', 1);
    expect(HandoverSession::first()->created_by)->toBe($staff->id);
});

test('browser cashless uses the same signature rules and idempotent endpoint', function () {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $task = PickupTask::factory()->create(['assigned_staff_id' => $staff->id, 'status' => 'PICKED_UP']);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'staff_id' => $staff->id]);
    $body = ['submission_key' => (string) Str::uuid(), 'awbs' => ['SKU123456789']];
    $this->actingAs($staff)->postJson(route('retail.cashless-handover.store', $task), $body)->assertUnprocessable()->assertJsonValidationErrors('awbs.0');
    $this->assertDatabaseCount('pickup_cashless_awbs', 0);
    $body['awbs'] = ['TG1234567890'];
    $this->postJson(route('retail.cashless-handover.store', $task), $body)->assertOk()->assertJsonPath('data.saved', 1);
    $this->postJson(route('retail.cashless-handover.store', $task), $body)->assertOk()->assertJsonPath('data.stored_count', 1);
    $this->getJson(route('retail.cashless-handover.index'))->assertOk()->assertJsonPath('tasks.data.0.id', $task->id);
    $this->assertDatabaseCount('pickup_cashless_awbs', 1);
    $this->assertDatabaseCount('cashless_entry_batches', 1);
});
