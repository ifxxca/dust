<?php

use App\Models\HandoverSession;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\User;

test('execution workspace is available only to current operational assignee', function () {
    $owner = User::factory()->create(['role' => 'pickup_staff']);
    $other = User::factory()->create(['role' => 'retail_staff']);
    $task = PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $owner->id]);
    $url = route('operations', ['screen' => 'execute', 'task' => $task->id]);
    $this->get($url)->assertRedirect(route('login'));
    $this->actingAs($owner)->get($url)->assertOk()->assertInertia(fn ($page) => $page->component('pickup-wizard')->where('taskId', $task->id));
    $this->actingAs($other)->get($url)->assertNotFound();
    $this->postJson(route('api.tasks.takeover', $task), ['expected_version' => 1, 'expected_assigned_staff_id' => $owner->id])->assertOk();
    $this->actingAs($owner)->get($url)->assertNotFound();
    $this->actingAs(User::factory()->create(['role' => 'cs']))->get($url)->assertForbidden();
});

test('handover list provides actual staff and corrected package totals without returning full evidence', function () {
    $staff = User::factory()->create(['role' => 'retail_staff', 'name' => 'Petugas QA']);
    $task = PickupTask::factory()->create(['status' => 'PICKED_UP', 'assigned_staff_id' => $staff->id]);
    $proof = PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'manual_hybrid' => 2, 'cashless_hybrid' => 1, 'css_orion' => 0]);
    $proof->revisions()->create(['revision' => 1, 'actor_id' => $staff->id, 'reason' => 'Fixture versi terkoreksi', 'values' => ['manual_hybrid' => 4]]);
    $session = HandoverSession::factory()->create();
    $session->items()->create(['pickup_task_id' => $task->id, 'pickup_record_id' => $proof->id]);
    $this->actingAs($staff)->getJson(route('api.handovers.index'))->assertOk()->assertJsonPath('data.0.task_count', 1)->assertJsonPath('data.0.pending_count', 1)->assertJsonPath('data.0.total_packages', 5)->assertJsonPath('data.0.staff_names.0', 'Petugas QA')->assertJsonMissingPath('data.0.items');
});

test('task detail shows operational actor names and never exposes their account credentials', function () {
    $cs = User::factory()->create(['role' => 'cs', 'name' => 'CS Operasional']);
    $task = PickupTask::factory()->create();
    $task->events()->create(['actor_id' => $cs->id, 'action' => 'created', 'task_version' => 1, 'occurred_at' => now()]);
    $this->actingAs($cs)->getJson(route('api.tasks.show', $task))->assertOk()->assertJsonPath('data.events.0.actor_name', 'CS Operasional')->assertJsonMissingPath('data.events.0.actor.email')->assertJsonMissingPath('data.events.0.actor.password');
});

test('handover detail exposes creator identity and effective pickup snapshots only to operational users', function () {
    $creator = User::factory()->create(['role' => 'pickup_staff', 'name' => 'Petugas Pembuat']);
    $retail = User::factory()->create(['role' => 'retail_staff']);
    $task = PickupTask::factory()->create(['status' => 'PICKED_UP', 'assigned_staff_id' => $creator->id]);
    $proof = PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'contact' => '081200000000', 'pickup_address' => 'Alamat saat pickup']);
    $proof->revisions()->create(['revision' => 1, 'actor_id' => $creator->id, 'reason' => 'Koreksi informasi customer', 'values' => ['contact' => '081233333333', 'pickup_address' => 'Alamat pickup terkoreksi']]);
    $session = HandoverSession::factory()->create(['created_by' => $creator->id]);
    $session->items()->create(['pickup_task_id' => $task->id, 'pickup_record_id' => $proof->id]);

    $this->actingAs($retail)->getJson(route('api.handovers.show', $session))->assertOk()
        ->assertJsonPath('data.creator', ['id' => $creator->id, 'name' => 'Petugas Pembuat'])
        ->assertJsonPath('data.items.0.contact', '081233333333')->assertJsonPath('data.items.0.pickup_address', 'Alamat pickup terkoreksi')
        ->assertJsonPath('data.items.0.picked_up_at', $proof->picked_up_at->toISOString())->assertJsonMissingPath('data.creator.email')->assertJsonMissingPath('data.creator.password');
    $this->getJson(route('api.handovers.index'))->assertOk()->assertJsonMissingPath('data.0.items');
    $this->actingAs(User::factory()->create(['role' => 'cs']))->getJson(route('api.handovers.show', $session))->assertForbidden();
});
