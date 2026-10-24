<?php

use App\Models\PickupProcessingRecord;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\User;
use Carbon\CarbonImmutable;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->travelTo(CarbonImmutable::parse('2026-10-19 05:00:00', 'UTC'));
});

test('processing is the default daily view while explicit Pickup and report bookmarks remain available', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $task = PickupTask::factory()->create(['scheduled_at' => now(), 'status' => 'PICKED_UP']);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
    $this->actingAs($admin)->get(route('pickup-results.index'))->assertOk()->assertInertia(fn (Assert $page) => $page->where('filters.monitoring', 'processing')->where('filters.date_from', '2026-10-19')->has('processing')->where('pickups', null));
    $this->get(route('pickup-results.index', ['monitoring' => 'pickup']))->assertInertia(fn (Assert $page) => $page->where('pickups.total', 1)->missing('processing'));
    $this->get(route('pickup-results.index', ['group_by' => 'staff']))->assertInertia(fn (Assert $page) => $page->has('report.data', 1)->where('filters.monitoring', 'pickup'));
});

test('quick detail fetches authoritative current processing and bounded history without protected evidence or transaction metadata', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $task = PickupTask::factory()->create(['status' => 'PICKED_UP']);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
    for ($revision = 1; $revision <= 23; $revision++) {
        PickupProcessingRecord::factory()->create(['pickup_task_id' => $task->id, 'actor_id' => $admin->id, 'revision' => $revision, 'successful_quantity' => $revision]);
    }
    $response = $this->actingAs($admin)->getJson(route('pickup-results.quick', $task))->assertOk()->assertHeader('Cache-Control', 'no-store, private')
        ->assertJsonPath('task.id', $task->id)->assertJsonPath('processing.summary.manual_quantity', 23)->assertJsonPath('processing.summary.confirmed_quantity', null)
        ->assertJsonCount(1, 'processing.latest')->assertJsonPath('processing.latest.0.revision', 23)->assertJsonCount(20, 'processing.history.data')->assertJsonPath('processing.history.total', 23)
        ->assertJsonMissingPath('task.contact_snapshot')->assertJsonMissingPath('processing.latest.0.payload_hash')->assertJsonMissingPath('processing.latest.0.submission_key')
        ->assertJsonMissingPath('task.proof')->assertJsonMissingPath('timeline');
    expect($response->json('processing.rows.0.reconciliation_reasons'))->not->toBeEmpty();
    $this->getJson(route('pickup-results.quick', [$task, 'processing_page' => 2]))->assertOk()->assertJsonCount(3, 'processing.history.data');
    $this->assertDatabaseCount('pickup_processing_records', 23);
});

test('quick detail supports pickups without POP or handover and handles missing records', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $task = PickupTask::factory()->create();
    $this->actingAs($admin)->getJson(route('pickup-results.quick', $task))->assertOk()->assertJsonPath('processing.can_record', false)->assertJsonCount(0, 'processing.rows')->assertJsonPath('result.handover_status', null);
    $this->getJson(route('pickup-results.quick', 999999))->assertNotFound();
    $this->getJson(route('pickup-results.quick', [$task, 'processing_page' => 0]))->assertUnprocessable();
});

test('quick detail enforces the existing active Admin boundary', function (string $role, bool $active) {
    $actor = User::factory()->create(['role' => $role, 'is_active' => $active]);
    $task = PickupTask::factory()->create();
    $this->actingAs($actor)->getJson(route('pickup-results.quick', $task))->assertForbidden();
})->with([['retail_staff', true], ['pickup_staff', true], ['cs', true], ['admin_supervisor', false]]);

test('drawer bookmarks preserve normalized date filters without spreading drawer state into CSV or pagination', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $tasks = PickupTask::factory()->count(11)->create(['scheduled_at' => now(), 'status' => 'PICKED_UP']);
    foreach ($tasks as $task) {
        PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
    }
    $this->actingAs($admin)->get(route('pickup-results.index', ['quick_pickup' => $tasks[0]->id, 'per_page' => 10]))->assertInertia(fn (Assert $page) => $page->missing('filters.quick_pickup')->where('processing.rows.next_page_url', fn ($url) => ! str_contains($url, 'quick_pickup=') && str_contains($url, 'date_from=2026-10-19')));
    $this->getJson(route('pickup-results.index', ['quick_pickup' => -1]))->assertUnprocessable();
    $this->get(route('pickup-results.export'))->assertOk();
});
