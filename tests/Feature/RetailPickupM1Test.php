<?php

use App\Models\Customer;
use App\Models\PickupTask;
use App\Models\PickupTaskEvent;
use App\Models\User;

test('json login logout use consistent envelopes without credential leakage', function () {
    $user = User::factory()->create();
    $this->postJson('/login', ['email' => $user->email, 'password' => 'password'])->assertOk()->assertJsonPath('data.id', $user->id)->assertJsonMissingPath('data.password');
    $this->postJson('/logout')->assertOk()->assertJsonPath('data', null);
    $this->getJson(route('api.me'))->assertUnauthorized();
});

test('operational account references cannot be deleted through profile settings', function () {
    $user = User::factory()->create();
    Customer::factory()->create(['created_by' => $user->id]);
    $this->actingAs($user)->delete(route('profile.destroy'), ['password' => 'password'])->assertConflict();
    expect($user->fresh())->not->toBeNull();
});

test('browser ISO timestamp with milliseconds is accepted and unknown fields are rejected', function () {
    $customer = Customer::factory()->create();
    $cs = User::factory()->create();
    $payload = ['customer_id' => $customer->id, 'pickup_address' => 'Alamat Browser', 'scheduled_at' => '2026-10-13T02:30:00.000Z'];
    $this->actingAs($cs)->postJson(route('api.tasks.store'), $payload)->assertCreated()->assertJsonPath('data.status', 'SCHEDULED');
    $this->postJson(route('api.tasks.store'), [...$payload, 'unexpected' => 'data'])->assertUnprocessable()->assertJsonPath('code', 'VALIDATION_FAILED');
    expect(PickupTask::count())->toBe(1);
});

test('unauthenticated API requests and bound page access are protected', function () {
    $this->getJson(route('api.tasks.index'))->assertUnauthorized()->assertJsonPath('code', 'UNAUTHENTICATED');
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $task = PickupTask::factory()->create();
    $this->actingAs($staff)->get(route('operations', ['screen' => 'detail', 'task' => $task->id]))->assertNotFound();
    $this->get(route('operations', ['screen' => 'users']))->assertForbidden();
});

test('customer minimum and on-demand snapshots are persisted with audit', function () {
    $cs = User::factory()->create();
    $this->actingAs($cs)->postJson(route('api.customers.store'), ['name' => 'Toko Satu', 'pickup_address' => 'Jalan A', 'contact' => '0812345'])->assertCreated();
    $customer = Customer::first();
    $this->postJson(route('api.tasks.store'), ['customer_id' => $customer->id, 'pickup_address' => 'Jalan B', 'scheduled_at' => '2026-10-13T09:00:00+07:00'])->assertCreated()->assertJsonPath('data.status', 'SCHEDULED')->assertJsonPath('data.contact', '0812345');
    $customer->update(['name' => 'Nama baru', 'contact' => 'baru']);
    $task = PickupTask::first();
    expect($task->customer_name_snapshot)->toBe('Toko Satu')->and($task->pickup_address)->toBe('Jalan B')->and($task->scheduled_at->format('H:i'))->toBe('02:00');
    expect($task->events()->first()->actor_id)->toBe($cs->id);
});

test('invalid customer address time and injected state are rejected', function (array $overrides) {
    $cs = User::factory()->create();
    $customer = Customer::factory()->create();
    $this->actingAs($cs)->postJson(route('api.tasks.store'), [...['customer_id' => $customer->id, 'pickup_address' => 'Jalan A', 'scheduled_at' => '2026-10-13T09:00:00+07:00'], ...$overrides])->assertUnprocessable();
    expect(PickupTask::count())->toBe(0)->and(PickupTaskEvent::count())->toBe(0);
})->with([[['customer_id' => 999]], [['pickup_address' => ' ']], [['scheduled_at' => 'bad']], [['scheduled_at' => '2026-10-13T09:00:00']], [['status' => 'ASSIGNED']], [['execution_started_at' => now()->toIso8601String()]]]);

test('initial assignment and direct takeover preserve task and revoke old ownership', function () {
    $cs = User::factory()->create();
    $a = User::factory()->create(['role' => 'pickup_staff']);
    $b = User::factory()->create(['role' => 'pickup_staff']);
    $c = User::factory()->create(['role' => 'pickup_staff']);
    $task = PickupTask::factory()->create();
    $this->actingAs($cs)->postJson(route('api.tasks.assign', $task), ['assigned_staff_id' => $a->id, 'expected_version' => 1])->assertOk()->assertJsonPath('data.version', 2);
    $this->actingAs($b)->getJson(route('api.tasks.candidates'))->assertOk()->assertJsonCount(1, 'data');
    $this->getJson(route('api.tasks.show', $task))->assertOk()->assertJsonMissingPath('data.contact')->assertJsonMissingPath('data.events');
    $payload = ['expected_version' => 2, 'expected_assigned_staff_id' => $a->id, 'reason' => 'Pengganti'];
    $this->postJson(route('api.tasks.takeover', $task), $payload)->assertOk()->assertJsonPath('data.status', 'ASSIGNED')->assertJsonPath('data.assigned_staff.id', $b->id);
    $this->actingAs($c)->postJson(route('api.tasks.takeover', $task), $payload)->assertConflict();
    $this->actingAs($a)->getJson(route('api.tasks.index'))->assertJsonCount(0, 'data');
    $this->getJson(route('api.tasks.show', $task))->assertJsonMissingPath('data.contact');
    expect(PickupTask::count())->toBe(1)->and($task->fresh()->version)->toBe(3);
    $event = $task->events()->where('action', 'taken_over')->sole();
    expect($event->previous_staff_id)->toBe($a->id)->and($event->new_staff_id)->toBe($b->id)->and($event->actor_id)->toBe($b->id)->and($event->occurred_at)->not->toBeNull();
});

test('inactive and non-pickup assignees are rejected', function (array $attributes) {
    $task = PickupTask::factory()->create();
    $staff = User::factory()->create($attributes);
    $this->actingAs(User::factory()->create())->postJson(route('api.tasks.assign', $task), ['assigned_staff_id' => $staff->id, 'expected_version' => 1])->assertUnprocessable();
    expect($task->fresh()->assigned_staff_id)->toBeNull();
})->with([[['role' => 'pickup_staff', 'is_active' => false]], [['role' => 'cs']]]);

test('takeover rejects started unassigned self and stale tasks', function (string $scenario) {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $other = User::factory()->create(['role' => 'pickup_staff']);
    $task = PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $scenario === 'self' ? $staff->id : $other->id]);
    if ($scenario === 'started') {
        $task->update(['execution_started_at' => now()]);
    }
    if ($scenario === 'unassigned') {
        $task->update(['status' => 'SCHEDULED', 'assigned_staff_id' => null]);
    }
    $this->actingAs($staff)->postJson(route('api.tasks.takeover', $task), ['expected_version' => $scenario === 'stale' ? 9 : 1, 'expected_assigned_staff_id' => $task->assigned_staff_id ?? $other->id])->assertConflict();
    expect($task->events()->count())->toBe(0);
})->with(['started', 'unassigned', 'self', 'stale']);

test('role and session boundaries prevent unauthorized operations', function (string $role) {
    $user = User::factory()->create(['role' => $role]);
    $task = PickupTask::factory()->create();
    $this->actingAs($user)->postJson(route('api.tasks.takeover', $task), ['expected_version' => 1, 'expected_assigned_staff_id' => 1])->assertForbidden();
})->with(['cs']);

test('admin can create assign and take over while pickup and retail share operational access', function (string $role) {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $operator = User::factory()->create(['role' => $role]);
    $other = User::factory()->create(['role' => 'pickup_staff']);
    $customer = Customer::factory()->create();
    $this->actingAs($admin)->get(route('operations', ['screen' => 'create']))->assertOk();
    $response = $this->postJson(route('api.tasks.store'), ['customer_id' => $customer->id, 'pickup_address' => 'Alamat', 'scheduled_at' => '2026-10-13T09:00:00+07:00'])->assertCreated()->assertJsonPath('data.can.assign', true);
    $task = PickupTask::findOrFail($response->json('data.id'));
    $this->getJson(route('api.staff'))->assertOk()->assertJsonFragment(['id' => $operator->id, 'name' => $operator->name]);
    $this->postJson(route('api.tasks.assign', $task), ['assigned_staff_id' => $other->id, 'expected_version' => 1])->assertOk();
    PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $other->id, 'execution_started_at' => now()]);
    $this->actingAs($operator)->get(route('operations', ['screen' => 'mine']))->assertOk();
    $this->get(route('operations', ['screen' => 'available']))->assertOk();
    $this->getJson(route('api.tasks.candidates'))->assertOk()->assertJsonCount(1, 'data');
    $this->postJson(route('api.tasks.takeover', $task), ['expected_version' => 2, 'expected_assigned_staff_id' => $other->id])->assertOk()->assertJsonPath('data.assigned_staff.id', $operator->id)->assertJsonPath('data.status', 'ASSIGNED');
    $this->getJson(route('api.tasks.index', ['mine' => 1]))->assertOk()->assertJsonCount(1, 'data');
    if ($role !== 'admin_supervisor') {
        $this->postJson(route('api.tasks.store'), [])->assertStatus($role === 'pickup_staff' ? 422 : 403);
        $this->getJson(route('api.users.index'))->assertForbidden();
        $this->getJson(route('api.customers.index'))->assertStatus($role === 'pickup_staff' ? 200 : 403);
        $this->getJson(route('api.tasks.index'))->assertJsonCount(1, 'data');
    } else {
        $this->getJson(route('api.tasks.index'))->assertJsonCount(2, 'data');
    }
})->with(['pickup_staff', 'retail_staff', 'admin_supervisor']);

test('admin and both staff roles cannot bypass execution and active eligibility', function (string $role) {
    $operator = User::factory()->create(['role' => $role]);
    $other = User::factory()->create(['role' => 'pickup_staff']);
    $task = PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $other->id, 'execution_started_at' => now()]);
    $this->actingAs($operator)->postJson(route('api.tasks.takeover', $task), ['expected_version' => 1, 'expected_assigned_staff_id' => $other->id])->assertConflict();
    $operator->update(['is_active' => false]);
    $this->postJson(route('api.tasks.takeover', $task), ['expected_version' => 1, 'expected_assigned_staff_id' => $other->id])->assertForbidden();
    expect($task->fresh()->assigned_staff_id)->toBe($other->id)->and($task->events()->count())->toBe(0);
})->with(['pickup_staff', 'retail_staff', 'admin_supervisor']);

test('inactive login and active session revocation are enforced and registration is disabled', function () {
    $user = User::factory()->create(['is_active' => false]);
    $this->post('/login', ['email' => $user->email, 'password' => 'password'])->assertSessionHasErrors();
    $this->actingAs($user)->getJson(route('api.me'))->assertForbidden();
    $this->get('/register')->assertNotFound();
    $this->post('/register', [])->assertNotFound();
});

test('admin provisions single role accounts and cannot deactivate assigned staff', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $this->actingAs($admin)->postJson(route('api.users.store'), ['name' => 'CS Baru', 'email' => 'cs@example.test', 'password' => 'testpassword123', 'password_confirmation' => 'testpassword123', 'role' => 'cs', 'is_active' => true])->assertCreated()->assertJsonMissingPath('data.password');
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $staff->id]);
    $this->patchJson(route('api.users.update', $staff), ['is_active' => false])->assertConflict();
    $this->actingAs(User::factory()->create())->getJson(route('api.users.index'))->assertForbidden();
});

test('all active operational staff roles can receive initial assignment', function (string $role) {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $staff = User::factory()->create(['role' => $role]);
    $task = PickupTask::factory()->create();
    $this->actingAs($admin)->postJson(route('api.tasks.assign', $task), ['assigned_staff_id' => $staff->id, 'expected_version' => 1])->assertOk()->assertJsonPath('data.assigned_staff.id', $staff->id);
})->with(['pickup_staff', 'retail_staff', 'admin_supervisor']);

test('changing pickup staff to retail staff preserves assignment and access', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $task = PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $staff->id]);
    $this->actingAs($admin)->patchJson(route('api.users.update', $staff), ['role' => 'retail_staff'])->assertOk();
    $this->actingAs($staff->fresh())->getJson(route('api.tasks.show', $task))->assertOk()->assertJsonStructure(['data' => ['contact', 'notes']]);
});

test('audit insertion failure rolls back takeover', function () {
    $old = User::factory()->create(['role' => 'pickup_staff']);
    $new = User::factory()->create(['role' => 'pickup_staff']);
    $task = PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $old->id]);
    PickupTaskEvent::creating(function (): void {
        throw new RuntimeException('Audit unavailable');
    });
    try {
        $this->actingAs($new)->postJson(route('api.tasks.takeover', $task), ['expected_version' => 1, 'expected_assigned_staff_id' => $old->id])->assertStatus(500);
        expect($task->fresh()->assigned_staff_id)->toBe($old->id)->and($task->fresh()->version)->toBe(1);
    } finally {
        PickupTaskEvent::flushEventListeners();
    }
});
