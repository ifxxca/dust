<?php

use App\Models\HandoverSession;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\User;
use Carbon\CarbonImmutable;

test('dashboard trends use seven local scheduled days and keep staff ownership and assignment queue semantics', function () {
    config(['pickup.timezone' => 'Asia/Jakarta']);
    $this->travelTo(CarbonImmutable::parse('2026-10-13T03:00:00Z'));
    $cs = User::factory()->create(['role' => 'cs']);
    $owner = User::factory()->create(['role' => 'pickup_staff']);
    PickupTask::factory()->create(['scheduled_at' => '2026-10-06 17:00:00']);
    PickupTask::factory()->create(['scheduled_at' => '2026-10-06 16:59:59', 'status' => 'PICKED_UP']);
    PickupTask::factory()->create(['scheduled_at' => '2026-10-12 03:00:00', 'status' => 'PICKED_UP', 'assigned_staff_id' => $owner->id]);
    PickupTask::factory()->create(['scheduled_at' => '2026-10-13 03:00:00', 'status' => 'ASSIGNED', 'assigned_staff_id' => $owner->id]);
    PickupTask::factory()->create(['scheduled_at' => '2026-10-13 16:59:59']);
    PickupTask::factory()->create(['scheduled_at' => '2026-10-13 17:00:00']);

    $this->actingAs($cs)->get(route('dashboard'))->assertOk()->assertInertia(fn ($page) => $page
        ->where('trends.today', [1, 0, 0, 0, 0, 1, 2])
        ->where('trends.waiting', [1, 0, 0, 0, 0, 0, 1])
        ->where('trends.assigned_today', [0, 0, 0, 0, 0, 0, 1])
        ->where('trends.picked_up_today', [0, 0, 0, 0, 0, 1, 0])
        ->where('stats.waiting', 3)->where('retail', null));
    $this->actingAs($owner)->get(route('dashboard'))->assertOk()->assertInertia(fn ($page) => $page
        ->where('trends.today', [0, 0, 0, 0, 0, 1, 1])
        ->where('trends.waiting', [0, 0, 0, 0, 0, 0, 0])->where('retail', null));
});

test('dashboard handover rows show pending items and latest corrected discrepancies even after closure', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $closed = HandoverSession::factory()->create(['status' => 'CLOSED']);
    $closedProof = PickupRecord::factory()->create();
    $item = $closed->items()->create(['pickup_task_id' => $closedProof->pickup_task_id, 'pickup_record_id' => $closedProof->id, 'status' => 'VERIFIED']);
    $item->revisions()->create(['revision' => 1, 'pickup_revision' => 0, 'actor_id' => $admin->id, 'reason' => 'Koreksi angka', 'values' => ['status' => 'DISCREPANCY', 'discrepancy_notes' => 'Satu paket kurang']]);
    $draft = HandoverSession::factory()->create();
    $pendingProof = PickupRecord::factory()->create();
    $draft->items()->create(['pickup_task_id' => $pendingProof->pickup_task_id, 'pickup_record_id' => $pendingProof->id, 'status' => 'PENDING']);

    $this->actingAs($admin)->get(route('dashboard'))->assertOk()->assertInertia(fn ($page) => $page
        ->where('retail.sessions.0.id', $draft->id)->where('retail.sessions.0.items_count', 1)->where('retail.sessions.0.pending_count', 1)
        ->where('retail.sessions.0.discrepancy_count', 0)->has('retail.sessions.0.created_at')
        ->where('retail.sessions.1.id', $closed->id)->where('retail.sessions.1.pending_count', 0)->where('retail.sessions.1.discrepancy_count', 1));
    $item->revisions()->create(['revision' => 2, 'pickup_revision' => 0, 'actor_id' => $admin->id, 'reason' => 'Angka diperbaiki', 'values' => ['status' => 'VERIFIED']]);
    $this->get(route('dashboard'))->assertInertia(fn ($page) => $page->where('retail.sessions.1.discrepancy_count', 0));
    $this->actingAs(User::factory()->create(['role' => 'cs']))->get(route('dashboard'))->assertInertia(fn ($page) => $page->where('retail', null));
});
