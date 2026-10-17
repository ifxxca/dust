<?php

use App\Actions\Scheduling\GeneratePickupTasks;
use App\Models\Customer;
use App\Models\PickupSchedule;
use App\Models\PickupTask;
use App\Models\User;

test('CS and admin open the dedicated customer workspace', function (string $role) {
    $this->withoutVite();
    $this->actingAs(User::factory()->create(['role' => $role]))->get(route('operations', ['screen' => 'customers']))
        ->assertOk()->assertInertia(fn ($page) => $page->component('customers'));
})->with(['cs', 'admin_supervisor']);
use Carbon\CarbonImmutable;
use Illuminate\Support\Str;

function customerDetailsPayload(array $overrides = []): array
{
    return [...['name' => 'Toko Customer', 'customer_code' => 'cust-001', 'email' => 'customer@example.test', 'phone' => '081234567890',
        'pickup_address' => 'Jl. Customer 1', 'latitude' => '-6.2000000', 'longitude' => '106.8166667', 'is_active' => true], ...$overrides];
}

test('CS and Admin create customer details with normalized unique code and separate contacts', function (string $role) {
    $actor = User::factory()->create(['role' => $role]);
    $this->actingAs($actor)->postJson(route('api.customers.store'), customerDetailsPayload())->assertCreated()
        ->assertJsonPath('data.customer_code', 'CUST-001')->assertJsonPath('data.email', 'customer@example.test')->assertJsonPath('data.phone', '081234567890')
        ->assertJsonPath('data.latitude', '-6.2000000')->assertJsonPath('data.longitude', '106.8166667')->assertJsonPath('data.is_active', true)->assertJsonPath('data.version', 1);
    $this->assertDatabaseHas('customers', ['customer_code' => 'CUST-001', 'contact' => 'customer@example.test', 'phone' => '081234567890', 'created_by' => $actor->id]);
})->with(['cs', 'admin_supervisor']);

test('legacy customer create remains valid and customer updates preserve existing pickup snapshots', function () {
    $cs = User::factory()->create(['role' => 'cs']);
    $created = $this->actingAs($cs)->postJson(route('api.customers.store'), ['name' => 'Lama', 'pickup_address' => 'Alamat Lama', 'contact' => '081234567890'])->assertCreated();
    $customer = Customer::findOrFail($created->json('data.id'));
    expect($customer->customer_code)->toStartWith('CUST-')->and($customer->is_active)->toBeTrue();
    $task = PickupTask::factory()->create(['customer_id' => $customer->id, 'customer_name_snapshot' => 'Lama', 'contact_snapshot' => '081234567890', 'pickup_address' => 'Alamat Lama', 'status' => 'ASSIGNED']);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $body = [...customerDetailsPayload(['name' => 'Baru', 'is_active' => false]), 'expected_version' => 1];
    $this->actingAs($admin)->patchJson(route('api.customers.update', $customer), $body)->assertOk()->assertJsonPath('data.version', 2)->assertJsonPath('data.is_active', false);
    expect($customer->fresh()->created_by)->toBe($cs->id)->and($customer->fresh()->updated_by)->toBe($admin->id);
    expect($task->fresh()->customer_name_snapshot)->toBe('Lama')->and($task->fresh()->contact_snapshot)->toBe('081234567890')->and($task->fresh()->pickup_address)->toBe('Alamat Lama')->and($task->fresh()->status)->toBe('ASSIGNED');
    $this->patchJson(route('api.customers.update', $customer), [...$body, 'name' => 'Stale'])->assertConflict()->assertJsonPath('code', 'CUSTOMER_STALE');
    expect($customer->fresh()->name)->toBe('Baru')->and($customer->fresh()->version)->toBe(2);
    $this->patchJson(route('api.customers.update', $customer), ['expected_version' => 2, 'customer_code' => 'cust-001', 'is_active' => true])->assertOk()->assertJsonPath('data.is_active', true)->assertJsonPath('data.version', 3);
});

test('customer create rejects invalid fields without persisting data', function (array $overrides, string $field) {
    $this->actingAs(User::factory()->create(['role' => 'cs']))->postJson(route('api.customers.store'), customerDetailsPayload($overrides))->assertUnprocessable()->assertJsonValidationErrors($field);
    $this->assertDatabaseCount('customers', 0);
})->with([
    [['email' => 'invalid'], 'email'], [['phone' => 'telephone'], 'phone'], [['latitude' => 91], 'latitude'], [['longitude' => 181], 'longitude'],
    [['latitude' => null, 'longitude' => 0], 'latitude'], [['latitude' => 0, 'longitude' => null], 'longitude'], [['name' => ' '], 'name'],
    [['email' => null, 'phone' => null], 'contact'], [['is_active' => 'inactive'], 'is_active'], [['customer_code' => str_repeat('a', 65)], 'customer_code'],
    [['created_by' => 1], 'created_by'], [['updated_by' => 1], 'updated_by'], [['version' => 99], 'version'], [['unexpected' => 'field'], 'unexpected'],
]);

test('customer code collision is rejected and coordinates can be cleared together including zero', function () {
    $actor = User::factory()->create(['role' => 'cs']);
    $response = $this->actingAs($actor)->postJson(route('api.customers.store'), customerDetailsPayload(['latitude' => 0, 'longitude' => 0]))->assertCreated()->assertJsonPath('data.latitude', '0.0000000');
    $id = $response->json('data.id');
    $this->postJson(route('api.customers.store'), customerDetailsPayload(['customer_code' => ' CUST-001 ']))->assertUnprocessable()->assertJsonValidationErrors('customer_code');
    $this->patchJson(route('api.customers.update', $id), ['expected_version' => 1, 'latitude' => null])->assertUnprocessable()->assertJsonValidationErrors('latitude');
    $this->patchJson(route('api.customers.update', $id), ['expected_version' => 1, 'latitude' => null, 'longitude' => null])->assertOk()->assertJsonPath('data.latitude', null)->assertJsonPath('data.longitude', null);
    $this->assertDatabaseCount('customers', 1);
});

test('customer update cannot erase all contacts and preserves data after validation failure', function () {
    $cs = User::factory()->create(['role' => 'cs']);
    $customer = Customer::factory()->create(['email' => 'original@example.test', 'phone' => '081234567890', 'contact' => 'original@example.test']);
    $this->actingAs($cs)->patchJson(route('api.customers.update', $customer), ['expected_version' => 1, 'contact' => null, 'email' => null, 'phone' => null])->assertUnprocessable()->assertJsonValidationErrors('contact');
    expect($customer->fresh()->contact)->toBe('original@example.test')->and($customer->fresh()->email)->toBe('original@example.test')->and($customer->fresh()->version)->toBe(1);
    $this->patchJson(route('api.customers.update', $customer), ['expected_version' => 1, 'contact' => null, 'email' => null, 'phone' => '089876543210'])->assertOk()->assertJsonPath('data.contact', '089876543210')->assertJsonPath('data.email', null);
});

test('unsupported and inactive users cannot manage customer records', function (array $attributes) {
    $customer = Customer::factory()->create();
    $actor = User::factory()->create($attributes);
    $this->actingAs($actor)->postJson(route('api.customers.store'), customerDetailsPayload())->assertForbidden();
    $this->patchJson(route('api.customers.update', $customer), ['expected_version' => 1, 'is_active' => false])->assertForbidden();
    expect($customer->fresh()->is_active)->toBeTrue()->and($customer->fresh()->version)->toBe(1);
    $this->assertDatabaseCount('customers', 1);
})->with([[['role' => 'pickup_staff']], [['role' => 'retail_staff']], [['role' => 'cs', 'is_active' => false]], [['role' => 'admin_supervisor', 'is_active' => false]]]);

test('manager searches details and filters inactive customers with correct pagination', function () {
    $cs = User::factory()->create(['role' => 'cs']);
    Customer::factory()->count(21)->create(['name' => 'Active Match', 'is_active' => true]);
    $inactive = Customer::factory()->create(['is_active' => false, 'customer_code' => 'CUSTOM-SEARCH', 'email' => 'special@example.test', 'phone' => '081999000123']);
    $this->actingAs($cs)->getJson(route('api.customers.index'))->assertOk()->assertJsonPath('meta.total', 22)->assertJsonCount(20, 'data');
    $this->getJson(route('api.customers.index', ['page' => 2]))->assertJsonCount(2, 'data');
    $this->getJson(route('api.customers.index', ['is_active' => 0]))->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $inactive->id);
    foreach (['CUSTOM-SEARCH', 'special@example.test', '081999000123'] as $query) {
        $this->getJson(route('api.customers.index', ['q' => $query]))->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $inactive->id);
    }
    $this->getJson(route('api.customers.index', ['active_only' => 1]))->assertJsonPath('meta.total', 21);
    $this->getJson(route('api.customers.index', ['q' => '%']))->assertJsonCount(0, 'data');
});

test('mobile customer lookup cannot expose inactive customers or manage customer data', function () {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $token = $staff->createToken('mobile:'.Str::uuid().':Android', ['mobile:read', 'mobile:execute'], now()->addDay());
    $active = Customer::factory()->create();
    Customer::factory()->create(['is_active' => false]);
    $this->withToken($token->plainTextToken)->getJson(route('mobile.customers.index', ['active_only' => 0]))->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $active->id);
    $this->getJson(route('mobile.customers.index', ['is_active' => 0]))->assertOk()->assertJsonCount(0, 'data');
    $this->postJson('/api/mobile/v1/customers', customerDetailsPayload())->assertMethodNotAllowed();
    $this->patchJson('/api/mobile/v1/customers/'.$active->id, ['expected_version' => 1, 'is_active' => false])->assertNotFound();
    app('auth')->forgetGuards();
    app('auth')->shouldUse('web');
    $this->patchJson(route('api.customers.update', $active), ['expected_version' => 1, 'is_active' => false])->assertUnauthorized();
    expect($active->fresh()->is_active)->toBeTrue();
});

test('inactive customer prevents new pickups but existing creation key can reconcile', function () {
    $cs = User::factory()->create(['role' => 'cs']);
    $customer = Customer::factory()->create();
    $body = ['customer_id' => $customer->id, 'pickup_address' => 'Alamat Snapshot', 'scheduled_at' => '2026-10-15T02:00:00Z', 'submission_key' => (string) Str::uuid()];
    $created = $this->actingAs($cs)->postJson(route('api.tasks.store'), $body)->assertCreated();
    $this->patchJson(route('api.customers.update', $customer), ['expected_version' => 1, 'is_active' => false])->assertOk();
    $this->postJson(route('api.tasks.store'), [...$body, 'submission_key' => (string) Str::uuid(), 'scheduled_at' => '2026-10-16T02:00:00Z'])->assertUnprocessable()->assertJsonValidationErrors('customer_id');
    $this->postJson(route('api.tasks.store'), $body)->assertOk()->assertJsonPath('data.id', $created->json('data.id'));
    $this->assertDatabaseCount('pickup_tasks', 1);
});

test('inactive customers pause generation and cannot activate regular schedules', function () {
    $cs = User::factory()->create(['role' => 'cs']);
    $customer = Customer::factory()->create(['is_active' => false]);
    $schedule = PickupSchedule::factory()->create(['customer_id' => $customer->id, 'is_active' => true, 'starts_on' => '2026-01-01', 'ends_on' => null, 'weekdays' => [1, 2, 3, 4, 5, 6, 7]]);
    expect(app(GeneratePickupTasks::class)->handle($schedule->id, CarbonImmutable::parse('2026-10-14', 'Asia/Jakarta')))->toBe(0);
    $this->assertDatabaseCount('pickup_tasks', 0);
    $body = ['customer_id' => $customer->id, 'pickup_address' => 'Alamat', 'weekdays' => [3], 'pickup_time' => '08:00', 'starts_on' => '2026-01-01', 'is_active' => true];
    $this->actingAs($cs)->postJson(route('api.schedules.store'), $body)->assertUnprocessable()->assertJsonValidationErrors('customer_id');
    $this->patchJson(route('api.schedules.update', $schedule), [...$body, 'expected_version' => 1])->assertUnprocessable()->assertJsonValidationErrors('customer_id');
    $this->patchJson(route('api.schedules.update', $schedule), [...$body, 'expected_version' => 1, 'is_active' => false])->assertOk();
    $this->assertDatabaseCount('pickup_schedules', 1);
});
