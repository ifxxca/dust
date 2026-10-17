<?php

use App\Models\HandoverSession;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\User;
use Carbon\CarbonImmutable;
use Inertia\Testing\AssertableInertia as Assert;

test('dashboard uses operational day boundaries and real task counts', function () {
    $this->travelTo(CarbonImmutable::parse('2026-10-12T00:30:00Z'));
    config(['pickup.timezone' => 'Asia/Jakarta']);
    $cs = User::factory()->create(['role' => 'cs']);
    PickupTask::factory()->create(['scheduled_at' => '2026-10-11 19:00:00', 'status' => 'SCHEDULED']);
    PickupTask::factory()->create(['scheduled_at' => '2026-10-12 02:00:00', 'status' => 'ASSIGNED']);
    PickupTask::factory()->create(['scheduled_at' => '2026-10-12 18:00:00', 'status' => 'PICKED_UP']);
    $this->actingAs($cs)->get(route('dashboard'))->assertOk()->assertInertia(fn (Assert $page) => $page->component('dashboard')->where('operationalDate', '2026-10-12')->where('stats.today', 2)->where('stats.waiting', 1)->where('stats.assigned_today', 1)->where('stats.picked_up_today', 0)->where('retail', null));
});

test('pickup dashboard and workspace expose only the assigned users tasks', function () {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $own = PickupTask::factory()->create(['assigned_staff_id' => $staff->id, 'status' => 'ASSIGNED', 'scheduled_at' => now()]);
    PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => User::factory()->create(['role' => 'pickup_staff'])->id]);
    $this->actingAs($staff)->get(route('dashboard'))->assertOk()->assertInertia(fn (Assert $page) => $page->has('recent', 1)->where('recent.0.id', $own->id)->has('nextTasks', 1)->where('retail', null));
    $this->get(route('operations', ['screen' => 'mine']))->assertOk()->assertInertia(fn (Assert $page) => $page->where('workspaceStats.today', 1));
    $own->visits()->create(['staff_id' => $staff->id, 'started_at' => now(), 'outcome' => 'COLLECTED', 'recorded_at' => now()]);
    $this->get(route('dashboard'))->assertInertia(fn (Assert $page) => $page->has('nextTasks', 1));
    $own->visits()->update(['outcome' => 'NO_PACKAGES', 'reason' => 'Tutup']);
    $own->update(['execution_started_at' => now()]);
    $this->get(route('dashboard'))->assertInertia(fn (Assert $page) => $page->has('nextTasks', 0));
});

test('search and pickup history preserve ownership authorization', function () {
    $staff = User::factory()->create(['role' => 'retail_staff']);
    $active = PickupTask::factory()->create(['assigned_staff_id' => $staff->id, 'status' => 'ASSIGNED', 'customer_name_snapshot' => 'Cari Customer']);
    $done = PickupTask::factory()->create(['assigned_staff_id' => $staff->id, 'status' => 'PICKED_UP', 'customer_name_snapshot' => 'Cari Customer']);
    PickupTask::factory()->create(['assigned_staff_id' => User::factory()->create(['role' => 'pickup_staff'])->id, 'status' => 'PICKED_UP', 'customer_name_snapshot' => 'Cari Customer']);
    $this->actingAs($staff)->getJson(route('api.tasks.index', ['q' => 'Cari', 'history' => 1]))->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $done->id);
    $this->getJson(route('api.tasks.index', ['q' => 'missing']))->assertOk()->assertJsonCount(0, 'data');
    $active->visits()->create(['staff_id' => $staff->id, 'started_at' => now(), 'outcome' => 'NO_PACKAGES', 'reason' => 'Tutup', 'recorded_at' => now()]);
    $this->getJson(route('api.tasks.index', ['history' => 1]))->assertOk()->assertJsonCount(2, 'data');
});

test('retail overview includes actual discrepancy counts without claiming resolution', function () {
    $retail = User::factory()->create(['role' => 'retail_staff']);
    $session = HandoverSession::factory()->create(['status' => 'CLOSED']);
    $proof = PickupRecord::factory()->create();
    $session->items()->create(['pickup_task_id' => $proof->pickup_task_id, 'pickup_record_id' => $proof->id, 'status' => 'DISCREPANCY', 'discrepancy_notes' => 'Selisih fisik']);
    $moment = CarbonImmutable::parse('2026-10-12T01:00:00Z');
    $session->events()->create(['actor_id' => $retail->id, 'action' => 'created', 'session_version' => 1, 'occurred_at' => $moment]);
    $this->actingAs($retail)->get(route('dashboard'))->assertOk()->assertInertia(fn (Assert $page) => $page->where('retail.draft', 0)->where('retail.discrepancies', 1)->where('retail.pending_items', 0)->has('retail.sessions', 1));
    $this->getJson(route('api.handovers.show', $session))->assertOk()->assertJsonPath('data.events.0.occurred_at', $moment->toISOString());
    $draft = HandoverSession::factory()->create();
    $this->get(route('dashboard'))->assertInertia(fn (Assert $page) => $page->where('retail.sessions.0.id', $draft->id));
    $this->getJson(route('api.handovers.index'))->assertOk()->assertJsonPath('data.0.id', $draft->id);
    $this->getJson(route('api.handovers.index', ['history' => 1]))->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.status', 'CLOSED')->assertJsonPath('data.0.task_count', 1)->assertJsonPath('data.0.discrepancy_count', 1);
    $this->actingAs(User::factory()->create(['role' => 'cs']))->getJson(route('api.handovers.index'))->assertForbidden();
});
