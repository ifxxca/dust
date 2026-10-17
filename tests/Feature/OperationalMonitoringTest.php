<?php

use App\Models\HandoverSession;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Support\Facades\DB;

test('monitoring uses latest verification revision and retains discrepancies in closed sessions', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $task = PickupTask::factory()->create(['status' => 'PICKED_UP']);
    $proof = PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
    $session = HandoverSession::factory()->create(['status' => 'CLOSED']);
    $item = $session->items()->create(['pickup_task_id' => $task->id, 'pickup_record_id' => $proof->id, 'manual_hybrid' => 2, 'cashless_hybrid' => 1, 'css_orion' => 0, 'status' => 'VERIFIED', 'verified_by' => $admin->id, 'verified_at' => now(), 'verified_pickup_revision' => 0]);
    $item->revisions()->create(['revision' => 1, 'pickup_revision' => 0, 'actor_id' => $admin->id, 'reason' => 'Salah pencatatan', 'values' => ['manual_hybrid' => 1, 'cashless_hybrid' => 1, 'css_orion' => 0, 'status' => 'DISCREPANCY', 'discrepancy_notes' => 'Kurang satu', 'verified_by' => $admin->id, 'verified_at' => now()->toIso8601String()]]);
    $this->actingAs($admin)->getJson(route('api.discrepancies.index', ['session_status' => 'CLOSED']))->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.notes', 'Kurang satu');
    $this->getJson(route('api.handovers.index'))->assertOk()->assertJsonPath('data.0.discrepancy_count', 1);
    $this->get(route('dashboard'))->assertInertia(fn ($page) => $page->where('retail.discrepancies', 1));
    $item->revisions()->create(['revision' => 2, 'pickup_revision' => 0, 'actor_id' => $admin->id, 'reason' => 'Koreksi angka', 'values' => ['manual_hybrid' => 2, 'cashless_hybrid' => 1, 'css_orion' => 0, 'status' => 'VERIFIED', 'discrepancy_notes' => null, 'verified_by' => $admin->id, 'verified_at' => now()->toIso8601String()]]);
    $this->getJson(route('api.discrepancies.index'))->assertOk()->assertJsonPath('meta.total', 0);
    expect($item->revisions()->count())->toBe(2);
    $this->actingAs(User::factory()->create(['role' => 'cs']))->getJson(route('api.discrepancies.index'))->assertForbidden();
});

test('pickup filters remain scoped and paginated without per row queries on representative data', function () {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $other = User::factory()->create(['role' => 'pickup_staff']);
    PickupTask::factory()->count(45)->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $staff->id, 'scheduled_at' => '2026-10-13 03:00:00']);
    PickupTask::factory()->count(30)->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $other->id, 'scheduled_at' => '2026-10-13 03:00:00']);
    DB::enableQueryLog();
    $this->actingAs($staff)->getJson(route('api.tasks.index', ['date_from' => '2026-10-13', 'date_to' => '2026-10-13', 'pickup_type' => 'on_demand']))->assertOk()->assertJsonCount(20, 'data')->assertJsonPath('meta.total', 45)->assertJsonPath('meta.last_page', 3);
    $queries = count(DB::getQueryLog());
    DB::disableQueryLog();
    expect($queries)->toBeLessThan(15);
    $this->getJson(route('api.tasks.index', ['staff_id' => $other->id]))->assertOk()->assertJsonCount(0, 'data');
    $this->getJson(route('api.tasks.index', ['page' => 3]))->assertOk()->assertJsonCount(5, 'data');
});

test('retry task returns to next workspace tasks without being stuck in historical no package attention', function () {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $task = PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $staff->id, 'execution_started_at' => null]);
    $task->visits()->create(['staff_id' => $staff->id, 'started_at' => now()->subDay(), 'outcome' => 'NO_PACKAGES', 'reason' => 'Tutup', 'recorded_at' => now()->subDay()]);
    $this->actingAs($staff)->get(route('dashboard'))->assertInertia(fn ($page) => $page->has('nextTasks', 1)->has('attention', 0));
});
