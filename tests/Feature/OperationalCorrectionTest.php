<?php

use App\Models\HandoverSession;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Support\Str;

test('admin corrections preserve originals and require review and explicit reopen after closure', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $task = PickupTask::factory()->create(['status' => 'PICKED_UP']);
    $proof = PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'manual_hybrid' => 2, 'cashless_hybrid' => 1, 'css_orion' => 0]);
    $this->actingAs($admin)->postJson(route('api.handovers.store'), ['submission_key' => (string) Str::uuid(), 'task_ids' => [$task->id]])->assertCreated();
    $session = HandoverSession::sole();
    $item = $session->items()->sole();
    $qty = ['manual_hybrid' => 2, 'cashless_hybrid' => 1, 'css_orion' => 0];
    $this->postJson(route('api.handovers.verify', [$session, $item->id]), [...$qty, 'expected_version' => 1])->assertOk();
    $this->postJson(route('api.handovers.close', $session), ['expected_version' => 2])->assertOk();
    $correction = [...$qty, 'manual_hybrid' => 3, 'customer_name' => 'Nama benar', 'pickup_address' => 'Alamat benar', 'contact' => 'customer@example.test', 'expected_version' => 1, 'reason' => 'Salah input'];
    $this->postJson(route('api.tasks.correct', $task), $correction)->assertOk()->assertJsonPath('data.proof.manual_hybrid', 3)->assertJsonPath('data.proof.original.manual_hybrid', 2);
    expect($proof->fresh()->manual_hybrid)->toBe(2)->and($session->fresh()->status)->toBe('CLOSED');
    $this->getJson(route('api.handovers.show', $session))->assertJsonPath('data.items.0.needs_review', true);
    $this->postJson(route('api.handovers.correct', [$session, $item->id]), [...$qty, 'expected_version' => 4, 'reason' => 'Hitung ulang'])->assertConflict();
    $this->postJson(route('api.handovers.reopen', $session), ['expected_version' => 4, 'reason' => 'Periksa koreksi'])->assertOk();
    $this->postJson(route('api.handovers.close', $session), ['expected_version' => 5])->assertConflict();
    $this->postJson(route('api.handovers.correct', [$session, $item->id]), [...$qty, 'expected_version' => 5, 'reason' => 'Hitung ulang'])->assertUnprocessable();
    $this->postJson(route('api.handovers.correct', [$session, $item->id]), [...$qty, 'expected_version' => 5, 'reason' => 'Hitung ulang', 'discrepancy_notes' => 'Fisik kurang satu'])->assertOk()->assertJsonPath('data.items.0.status', 'DISCREPANCY')->assertJsonPath('data.items.0.needs_review', false);
    $this->postJson(route('api.handovers.close', $session), ['expected_version' => 6])->assertOk()->assertJsonPath('data.items.0.status', 'DISCREPANCY');
    expect($item->fresh()->status)->toBe('VERIFIED')->and($item->revisions()->sole()->actor_id)->toBe($admin->id)->and($proof->revisions()->sole()->reason)->toBe('Salah input');
    $this->actingAs(User::factory()->create(['role' => 'pickup_staff']))->postJson(route('api.tasks.correct', $task), $correction)->assertForbidden();
    $this->postJson(route('api.handovers.reopen', $session), ['expected_version' => 7, 'reason' => 'Tes'])->assertForbidden();
});

test('draft membership changes are audited and locked after verification', function () {
    $staff = User::factory()->create(['role' => 'retail_staff']);
    $tasks = PickupTask::factory()->count(2)->create(['status' => 'PICKED_UP']);
    foreach ($tasks as $task) {
        PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
    }
    $this->actingAs($staff)->postJson(route('api.handovers.store'), ['submission_key' => (string) Str::uuid(), 'task_ids' => [$tasks[0]->id]])->assertCreated();
    $session = HandoverSession::sole();
    $this->patchJson(route('api.handovers.amend', $session), ['expected_version' => 1, 'reason' => 'Tambah penyerahan', 'task_ids' => $tasks->modelKeys()])->assertOk()->assertJsonCount(2, 'data.items');
    $this->patchJson(route('api.handovers.amend', $session), ['expected_version' => 1, 'reason' => 'Stale', 'task_ids' => [$tasks[0]->id]])->assertConflict();
    $item = $session->items()->first();
    $this->postJson(route('api.handovers.verify', [$session, $item->id]), ['expected_version' => 2, 'manual_hybrid' => 2, 'cashless_hybrid' => 1, 'css_orion' => 0])->assertOk();
    $this->patchJson(route('api.handovers.amend', $session), ['expected_version' => 3, 'reason' => 'Ubah', 'task_ids' => [$tasks[1]->id]])->assertConflict();
    expect($session->events()->where('action', 'membership_changed')->sole()->changes['new_task_ids'])->toBe($tasks->modelKeys());
});
