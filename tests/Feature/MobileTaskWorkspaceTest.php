<?php

use App\Models\HandoverSession;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Support\Str;

test('mobile mine and available reuse separate ownership and candidate scopes', function () {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $token = $staff->createToken('mobile:'.Str::uuid().':Android', ['mobile:read'], now()->addDay());
    $other = User::factory()->create(['role' => 'pickup_staff']);
    $own = PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $staff->id]);
    $candidate = PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $other->id]);
    PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $other->id, 'execution_started_at' => now()]);
    $unassigned = PickupTask::factory()->create(['status' => 'SCHEDULED']);
    PickupTask::factory()->create(['status' => 'CANCELLED']);
    PickupTask::factory()->create(['status' => 'SCHEDULED', 'execution_started_at' => now()]);

    $this->withToken($token->plainTextToken)->getJson(route('mobile.tasks.index', ['mine' => 1]))->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $own->id);
    $available = $this->getJson(route('mobile.tasks.candidates'))->assertOk()->assertJsonCount(2, 'data')->assertJsonPath('data.0.id', $candidate->id)->assertJsonPath('data.0.can.take_over', true)->assertJsonMissingPath('data.0.contact');
    expect(array_column($available->json('data'), 'id'))->toEqualCanonicalizing([$candidate->id, $unassigned->id]);
    $this->getJson(route('mobile.tasks.show', $unassigned))->assertOk()->assertJsonPath('data.can.take_over', true)->assertJsonMissingPath('data.contact');
    $this->getJson(route('mobile.tasks.show', $candidate))->assertOk()->assertJsonMissingPath('data.contact');
    $this->getJson(route('mobile.tasks.show', $own))->assertOk()->assertJsonPath('data.contact', $own->contact_snapshot);
});

test('mobile cannot read an unrelated ineligible task', function () {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $token = $staff->createToken('mobile:'.Str::uuid().':Android', ['mobile:read'], now()->addDay());
    $task = PickupTask::factory()->create(['status' => 'PICKED_UP']);

    $this->withToken($token->plainTextToken)->getJson(route('mobile.tasks.show', $task))->assertNotFound();
});

test('mobile search filters and pagination retain the existing contract', function () {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $token = $staff->createToken('mobile:'.Str::uuid().':Android', ['mobile:read'], now()->addDay());
    PickupTask::factory()->count(21)->create(['assigned_staff_id' => $staff->id, 'status' => 'ASSIGNED', 'customer_name_snapshot' => 'Dicari', 'scheduled_at' => '2026-10-13T08:00:00Z']);
    PickupTask::factory()->create(['assigned_staff_id' => $staff->id, 'status' => 'CANCELLED', 'customer_name_snapshot' => 'Dicari']);
    $query = ['q' => 'Dicari', 'status' => 'ASSIGNED', 'date_from' => '2026-10-13', 'date_to' => '2026-10-13'];

    $first = $this->withToken($token->plainTextToken)->getJson(route('mobile.tasks.index', $query))->assertOk()->assertJsonCount(20, 'data')->assertJsonPath('meta.total', 21)->assertJsonPath('meta.per_page', 20);
    $second = $this->getJson(route('mobile.tasks.index', [...$query, 'page' => 2]))->assertOk()->assertJsonCount(1, 'data');
    expect(array_intersect(array_column($first->json('data'), 'id'), array_column($second->json('data'), 'id')))->toBeEmpty();
    $this->getJson(route('mobile.tasks.index', ['per_page' => 99]))->assertUnprocessable()->assertJsonValidationErrors('per_page');
});

test('mobile tokens cannot call operations outside V1 allowlist or web api', function (string $path, string $method, int $status) {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $token = $staff->createToken('mobile:'.Str::uuid().':Android', ['mobile:read'], now()->addDay());
    if (str_starts_with($path, '/api/mobile/v1/handovers/')) {
        HandoverSession::factory()->create(['id' => 1]);
    }
    $this->withToken($token->plainTextToken)->json($method, $path)->assertStatus($status);
})->with([
    ['/api/mobile/v1/handovers/1/close', 'POST', 403],
    ['/api/mobile/v1/handovers/1/items/1/verification', 'POST', 403],
    ['/api/mobile/v1/handovers/1/reopen', 'POST', 404],
    ['/api/mobile/v1/pickup-tasks/1/cancel', 'POST', 404],
    ['/api/v1/handovers', 'GET', 401],
]);
