<?php

use App\Actions\Scheduling\GeneratePickupTasks;
use App\Models\Customer;
use App\Models\PickupSchedule;
use App\Models\PickupTask;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Str;

test('staff manual creation is self assigned and replay returns one audited task on web and mobile', function (string $prefix) {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $customer = Customer::factory()->create();
    $payload = ['customer_id' => $customer->id, 'pickup_address' => $customer->pickup_address, 'scheduled_at' => '2026-10-15T09:00:00+07:00', 'notes' => 'Customer meminta pickup langsung', 'submission_key' => (string) Str::uuid()];
    if ($prefix === 'mobile') {
        $token = $staff->createToken('mobile:'.Str::uuid().':Android', ['mobile:read', 'mobile:execute'], now()->addDay());
        $this->withToken($token->plainTextToken);
    } else {
        $this->actingAs($staff);
    }

    $id = $this->postJson(route($prefix.'.tasks.store'), $payload)->assertCreated()->assertJsonPath('data.status', 'ASSIGNED')->assertJsonPath('data.assigned_staff.id', $staff->id)->assertJsonPath('data.can.execute', true)->json('data.id');
    $this->postJson(route($prefix.'.tasks.store'), $payload)->assertOk()->assertJsonPath('data.id', $id);
    $this->postJson(route($prefix.'.tasks.store'), [...$payload, 'notes' => 'Berubah'])->assertConflict();
    $task = PickupTask::findOrFail($id);
    expect(PickupTask::count())->toBe(1)->and($task->created_by)->toBe($staff->id)->and($task->version)->toBe(2)
        ->and($task->events()->pluck('action')->all())->toBe(['created', 'assigned'])->and($task->visits()->count())->toBe(0);
})->with(['api', 'mobile']);

test('manual creation permissions do not grant retail or inactive staff management', function (string $role, bool $active, bool $allowed) {
    $user = User::factory()->create(['role' => $role, 'is_active' => $active]);
    expect($user->can('create', PickupTask::class))->toBe($allowed);
})->with([['cs', true, true], ['admin_supervisor', true, true], ['pickup_staff', true, true], ['retail_staff', true, false], ['pickup_staff', false, false]]);

test('mobile manual creation requires execute bearer and customer creation remains unavailable', function () {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $customer = Customer::factory()->create();
    $payload = ['customer_id' => $customer->id, 'pickup_address' => 'Jl A', 'scheduled_at' => '2026-10-15T09:00:00Z', 'notes' => 'Permintaan customer', 'submission_key' => (string) Str::uuid()];
    $this->postJson(route('mobile.tasks.store'), $payload)->assertUnauthorized();
    $token = $staff->createToken('mobile:'.Str::uuid().':Android', ['mobile:read'], now()->addDay());
    $this->withToken($token->plainTextToken)->postJson(route('mobile.tasks.store'), $payload)->assertForbidden();
    $this->getJson(route('mobile.customers.index', ['q' => $customer->name]))->assertOk()->assertJsonPath('data.0.id', $customer->id);
    $this->postJson('/api/mobile/v1/customers', [])->assertMethodNotAllowed();
    app('auth')->forgetGuards();
    $this->actingAs($staff)->postJson(route('api.customers.store'), ['name' => 'N', 'pickup_address' => 'A', 'contact' => '0812'])->assertForbidden();
    expect(PickupTask::count())->toBe(0);
});

test('staff cannot inject assignment and must supply a key and nonblank reason', function (array $change) {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $customer = Customer::factory()->create();
    $payload = ['customer_id' => $customer->id, 'pickup_address' => 'Jl A', 'scheduled_at' => '2026-10-15T09:00:00Z', 'notes' => 'Permintaan customer', 'submission_key' => (string) Str::uuid()];
    $this->actingAs($staff)->postJson(route('api.tasks.store'), [...$payload, ...$change])->assertUnprocessable();
    expect(PickupTask::count())->toBe(0);
})->with([[['assigned_staff_id' => 1]], [['status' => 'PICKED_UP']], [['notes' => ' ']], [['submission_key' => null]], [['customer_id' => 999999]]]);

test('manual duplicate detection covers existing regular tasks and different submission keys', function () {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $customer = Customer::factory()->create();
    $existing = PickupTask::factory()->create(['customer_id' => $customer->id, 'pickup_type' => 'regular', 'scheduled_at' => '2026-10-15 02:00:40']);
    $payload = ['customer_id' => $customer->id, 'pickup_address' => 'Jl A', 'scheduled_at' => '2026-10-15T09:00:00+07:00', 'notes' => 'Permintaan customer', 'submission_key' => (string) Str::uuid()];
    $this->actingAs($staff)->postJson(route('api.tasks.store'), $payload)->assertConflict()->assertJsonPath('message', 'DUPLICATE_PICKUP: Customer sudah memiliki task pada menit jadwal tersebut. Periksa daftar sebelum membuat task baru.');
    $this->postJson(route('api.tasks.store'), [...$payload, 'scheduled_at' => '2026-10-15T10:00:00+07:00'])->assertCreated();
    $this->postJson(route('api.tasks.store'), [...$payload, 'scheduled_at' => '2026-10-15T10:00:00+07:00', 'submission_key' => (string) Str::uuid()])->assertConflict();
    expect(PickupTask::count())->toBe(2)->and($existing->fresh()->status)->toBe('SCHEDULED');
});

test('regular generation does not duplicate manual pickup for the same customer and minute', function () {
    $customer = Customer::factory()->create();
    $schedule = PickupSchedule::factory()->create(['customer_id' => $customer->id, 'timezone' => 'Asia/Jakarta', 'starts_on' => '2026-01-01', 'ends_on' => null, 'pickup_time' => '09:00:00', 'weekdays' => [1, 2, 3, 4, 5, 6, 7]]);
    PickupTask::factory()->create(['customer_id' => $customer->id, 'scheduled_at' => '2026-10-15 02:00:00', 'status' => 'ASSIGNED']);
    expect(app(GeneratePickupTasks::class)->handle($schedule->id, CarbonImmutable::parse('2026-10-15', 'Asia/Jakarta')))->toBe(0);
    expect(PickupTask::count())->toBe(1);
});

test('follow up creates a linked new task and cannot reuse other staff or unfinished source', function () {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $customer = Customer::factory()->create();
    $old = PickupTask::factory()->create(['customer_id' => $customer->id, 'status' => 'NO_PACKAGES', 'assigned_staff_id' => $staff->id, 'scheduled_at' => '2026-10-14 02:00:00']);
    $payload = ['customer_id' => $customer->id, 'pickup_address' => 'Jl A', 'scheduled_at' => '2026-10-15T09:00:00+07:00', 'notes' => 'Customer sekarang siap', 'submission_key' => (string) Str::uuid(), 'previous_task_id' => $old->id];
    $this->actingAs($staff)->postJson(route('api.tasks.store'), $payload)->assertCreated()->assertJsonPath('data.previous_task_id', $old->id);
    $this->postJson(route('api.tasks.store'), [...$payload, 'submission_key' => (string) Str::uuid(), 'scheduled_at' => '2026-10-13T09:00:00+07:00'])->assertUnprocessable();
    $other = User::factory()->create(['role' => 'pickup_staff']);
    $this->actingAs($other)->postJson(route('api.tasks.store'), [...$payload, 'submission_key' => (string) Str::uuid()])->assertNotFound();
    $old->update(['status' => 'ASSIGNED']);
    $this->actingAs($staff)->postJson(route('api.tasks.store'), [...$payload, 'submission_key' => (string) Str::uuid()])->assertUnprocessable();
    expect(PickupTask::count())->toBe(2)->and($old->fresh()->version)->toBe(1);
});

test('task submission reconciliation is private to creator and current ownership', function () {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $other = User::factory()->create(['role' => 'pickup_staff']);
    $key = (string) Str::uuid();
    $task = PickupTask::factory()->create(['created_by' => $staff->id, 'creation_submission_key' => $key, 'assigned_staff_id' => $staff->id, 'status' => 'ASSIGNED']);
    $token = $staff->createToken('mobile:'.Str::uuid().':Android', ['mobile:read'], now()->addDay());
    $this->withToken($token->plainTextToken)->getJson(route('mobile.submissions.show', ['submission_key' => $key, 'kind' => 'task']))->assertOk()->assertJsonPath('data.task_id', $task->id);
    $otherToken = $other->createToken('mobile:'.Str::uuid().':Android', ['mobile:read'], now()->addDay());
    app('auth')->forgetGuards();
    $this->withToken($otherToken->plainTextToken)->getJson(route('mobile.submissions.show', ['submission_key' => $key, 'kind' => 'task']))->assertNotFound();
});

test('legacy completion backfill is audited idempotent and preserves resumed visits', function () {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $old = PickupTask::factory()->create(['assigned_staff_id' => $staff->id, 'status' => 'ASSIGNED', 'execution_started_at' => now()]);
    $old->visits()->create(['staff_id' => $staff->id, 'started_at' => now(), 'outcome' => 'NO_PACKAGES', 'reason' => 'Tutup', 'recorded_at' => now()]);
    $resumed = PickupTask::factory()->create(['assigned_staff_id' => $staff->id, 'status' => 'ASSIGNED', 'execution_started_at' => null]);
    $resumed->visits()->create(['staff_id' => $staff->id, 'started_at' => now(), 'outcome' => 'NO_PACKAGES', 'reason' => 'Tutup', 'recorded_at' => now()]);
    $resumed->visits()->create(['staff_id' => $staff->id, 'started_at' => now(), 'outcome' => null]);
    $this->artisan('pickup:complete-no-packages')->expectsOutput('Eligible (dry-run): 1')->assertSuccessful();
    expect($old->fresh()->status)->toBe('ASSIGNED');
    $this->artisan('pickup:complete-no-packages', ['--apply' => true])->expectsOutput('Completed: 1')->assertSuccessful();
    $this->artisan('pickup:complete-no-packages', ['--apply' => true])->expectsOutput('Completed: 0')->assertSuccessful();
    expect($old->fresh()->status)->toBe('NO_PACKAGES')->and($old->fresh()->version)->toBe(2)->and($old->visits()->count())->toBe(1)->and($old->events()->sole()->action)->toBe('no_packages_completed')->and($resumed->fresh()->status)->toBe('ASSIGNED');
});
