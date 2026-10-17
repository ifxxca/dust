<?php

use App\Models\PickupTask;
use App\Models\User;
use Carbon\CarbonImmutable;

test('operational summary uses local scheduled day and latest visit without changing filtered pagination', function () {
    config(['pickup.timezone' => 'Asia/Jakarta']);
    $this->travelTo(CarbonImmutable::parse('2026-10-13T03:00:00Z'));
    $cs = User::factory()->create(['role' => 'cs']);
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    PickupTask::factory()->create(['scheduled_at' => '2026-10-12 17:00:00']);
    PickupTask::factory()->create(['scheduled_at' => '2026-10-13 16:59:59', 'status' => 'PICKED_UP']);
    PickupTask::factory()->create(['scheduled_at' => '2026-10-13 05:00:00', 'status' => 'CANCELLED']);
    $waiting = PickupTask::factory()->create(['scheduled_at' => '2026-10-13 05:00:00', 'status' => 'ASSIGNED', 'assigned_staff_id' => $staff->id]);
    $noPackages = PickupTask::factory()->create(['scheduled_at' => '2026-10-13 05:00:00', 'status' => 'NO_PACKAGES', 'assigned_staff_id' => $staff->id, 'execution_started_at' => now()]);
    $noPackages->visits()->create(['staff_id' => $staff->id, 'started_at' => now(), 'outcome' => 'NO_PACKAGES', 'reason' => 'Toko tutup', 'recorded_at' => now()]);
    $retried = PickupTask::factory()->create(['scheduled_at' => '2026-10-13 05:00:00', 'status' => 'ASSIGNED', 'assigned_staff_id' => $staff->id, 'execution_started_at' => now()]);
    $retried->visits()->create(['staff_id' => $staff->id, 'started_at' => now()->subHour(), 'outcome' => 'NO_PACKAGES', 'reason' => 'Belum siap', 'recorded_at' => now()->subHour()]);
    $retried->visits()->create(['staff_id' => $staff->id, 'started_at' => now(), 'outcome' => 'COLLECTED', 'recorded_at' => now()]);
    PickupTask::factory()->create(['scheduled_at' => '2026-10-12 16:59:59']);
    PickupTask::factory()->create(['scheduled_at' => '2026-10-13 17:00:00']);
    $this->actingAs($cs)->getJson(route('api.tasks.index', ['summary' => 1, 'q' => 'customer-does-not-exist']))->assertOk()
        ->assertJsonCount(0, 'data')->assertJsonPath('meta.total', 0)
        ->assertJsonPath('summary', ['date' => '2026-10-13', 'total' => 6, 'waiting' => 1, 'handling' => 2, 'successful' => 1, 'no_packages' => 1]);
    $this->actingAs($staff)->getJson(route('api.tasks.index', ['summary' => 1]))->assertOk()
        ->assertJsonPath('summary.total', 3)->assertJsonPath('summary.waiting', 0)->assertJsonPath('summary.successful', 0);
    $this->getJson(route('api.tasks.candidates', ['summary' => 1]))->assertOk()->assertJsonPath('summary.total', 0);
    expect($waiting->fresh()->status)->toBe('ASSIGNED');
});

test('operational list supports bounded pagination and deterministic sorting without changing legacy defaults', function () {
    $cs = User::factory()->create(['role' => 'cs']);
    $tasks = PickupTask::factory()->count(12)->create(['created_at' => '2026-10-13 03:00:00', 'scheduled_at' => '2026-10-13 05:00:00']);
    $this->actingAs($cs)->getJson(route('api.tasks.index', ['sort' => 'newest', 'per_page' => 10]))->assertOk()
        ->assertJsonCount(10, 'data')->assertJsonPath('data.0.id', $tasks->last()->id)->assertJsonPath('meta.total', 12)->assertJsonPath('meta.last_page', 2);
    $this->getJson(route('api.tasks.index', ['sort' => 'newest', 'per_page' => 10, 'page' => 2]))->assertOk()
        ->assertJsonCount(2, 'data')->assertJsonPath('meta.from', 11)->assertJsonPath('meta.to', 12);
    $this->getJson(route('api.tasks.index', ['sort' => 'oldest', 'per_page' => 50]))->assertOk()->assertJsonPath('data.0.id', $tasks->first()->id);
    $this->getJson(route('api.tasks.index'))->assertOk()->assertJsonPath('meta.per_page', 20)->assertJsonPath('data.0.id', $tasks->first()->id)->assertJsonMissingPath('summary');
    $this->getJson(route('api.tasks.index', ['q' => 'PCK-'.str_pad((string) $tasks->last()->id, 4, '0', STR_PAD_LEFT)]))->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $tasks->last()->id);
    $this->actingAs(User::factory()->create(['role' => 'pickup_staff']))->getJson(route('api.tasks.index', ['q' => 'PCK-'.$tasks->last()->id]))->assertOk()->assertJsonCount(0, 'data');
    $this->actingAs($cs);
    $this->getJson(route('api.tasks.index', ['per_page' => 1000, 'sort' => 'status desc', 'summary' => 'anything']))->assertUnprocessable()->assertJsonValidationErrors(['per_page', 'sort', 'summary']);
});
