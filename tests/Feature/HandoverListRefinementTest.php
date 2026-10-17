<?php

use App\Models\HandoverSession;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\User;

test('handover list exposes valid verification progress and closure eligibility without resolving discrepancies', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $session = HandoverSession::factory()->create(['status' => 'IN_VERIFICATION']);
    $proof = PickupRecord::factory()->create();
    $item = $session->items()->create(['pickup_task_id' => $proof->pickup_task_id, 'pickup_record_id' => $proof->id, 'status' => 'DISCREPANCY', 'discrepancy_notes' => 'Kurang satu', 'verified_pickup_revision' => 0]);
    $url = route('api.handovers.index', ['q' => 'HO-'.$session->id]);

    $this->actingAs($admin)->getJson($url)->assertOk()->assertJsonPath('data.0.can_close', true)->assertJsonPath('data.0.verified_count', 1)->assertJsonPath('data.0.discrepancy_count', 1);
    $item->update(['discrepancy_notes' => null]);
    $this->getJson($url)->assertOk()->assertJsonPath('data.0.can_close', false);
    $item->update(['discrepancy_notes' => 'Kurang satu']);
    $proof->revisions()->create(['revision' => 1, 'actor_id' => $admin->id, 'reason' => 'Koreksi jumlah', 'values' => ['manual_hybrid' => 4]]);
    $this->getJson($url)->assertOk()->assertJsonPath('data.0.can_close', false)->assertJsonPath('data.0.review_count', 1)->assertJsonPath('data.0.verified_count', 0);
    $session->update(['status' => 'CLOSED']);
    $this->getJson($url)->assertOk()->assertJsonPath('data.0.can_close', false)->assertJsonPath('data.0.discrepancy_count', 1);
});

test('handover filters search real session references and staff names using local dates and preserve global tab counts', function () {
    config(['pickup.timezone' => 'Asia/Jakarta']);
    $staff = User::factory()->create(['role' => 'retail_staff', 'name' => 'Petugas Handover']);
    $task = PickupTask::factory()->create(['assigned_staff_id' => $staff->id]);
    $proof = PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
    $session = HandoverSession::factory()->create(['created_at' => '2026-10-12 17:00:00']);
    $session->items()->create(['pickup_task_id' => $task->id, 'pickup_record_id' => $proof->id]);
    HandoverSession::factory()->create(['created_at' => '2026-10-12 16:59:59']);
    HandoverSession::factory()->create(['created_at' => '2026-10-13 17:00:00', 'status' => 'CLOSED']);

    $this->actingAs($staff)->getJson(route('api.handovers.index', ['active' => 1, 'summary' => 1, 'q' => 'Petugas Handover', 'staff_id' => $staff->id, 'date_from' => '2026-10-13', 'date_to' => '2026-10-13']))
        ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $session->id)->assertJsonPath('summary', ['active' => 2, 'closed' => 1, 'discrepancies' => 0]);
    $this->getJson(route('api.handovers.index', ['q' => 'HO-'.str_pad((string) $session->id, 4, '0', STR_PAD_LEFT)]))->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $session->id);
    $this->getJson(route('api.handovers.index', ['q' => $session->reference]))->assertOk()->assertJsonCount(1, 'data');
    $this->getJson(route('api.handovers.index', ['history' => 1]))->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.status', 'CLOSED');
    $this->getJson(route('api.handovers.index', ['q' => '%']))->assertOk()->assertJsonCount(0, 'data');
    $this->getJson(route('api.handovers.index', ['date_from' => '2026-10-14', 'date_to' => '2026-10-13', 'per_page' => 500]))->assertUnprocessable()->assertJsonValidationErrors(['date_to', 'per_page']);
    $this->actingAs(User::factory()->create(['role' => 'cs']))->getJson(route('api.handovers.index', ['summary' => 1]))->assertForbidden();
});

test('handover pagination is bounded while the existing default remains compatible', function () {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    HandoverSession::factory()->count(12)->create();

    $this->actingAs($staff)->getJson(route('api.handovers.index', ['per_page' => 10]))->assertOk()->assertJsonCount(10, 'data')->assertJsonPath('meta.total', 12)->assertJsonPath('meta.last_page', 2)->assertJsonPath('data.0.can_close', false);
    $this->getJson(route('api.handovers.index', ['per_page' => 10, 'page' => 2]))->assertOk()->assertJsonCount(2, 'data')->assertJsonPath('meta.from', 11)->assertJsonPath('meta.to', 12);
    $this->getJson(route('api.handovers.index'))->assertOk()->assertJsonPath('meta.per_page', 20)->assertJsonMissingPath('summary');
});
