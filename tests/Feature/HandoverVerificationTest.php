<?php

use App\Models\HandoverSession;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

test('end to end CS assignment pickup proof mixed staff handover verification and closure', function () {
    Storage::fake('local');
    $cs = User::factory()->create(['role' => 'cs']);
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $retail = User::factory()->create(['role' => 'retail_staff']);
    $customerId = $this->actingAs($cs)->postJson(route('api.customers.store'), ['name' => 'Customer E2E', 'pickup_address' => 'Jl. Pickup 1', 'contact' => 'customer@example.test'])->assertCreated()->json('data.id');
    $ids = [];
    foreach ([$staff, $retail] as $index => $operator) {
        $taskId = $this->actingAs($cs)->postJson(route('api.tasks.store'), ['customer_id' => $customerId, 'pickup_address' => 'Jl. Pickup 1', 'scheduled_at' => now()->addDay()->addHours($index)->toIso8601String()])->assertCreated()->json('data.id');
        $this->postJson(route('api.tasks.assign', $taskId), ['assigned_staff_id' => $operator->id, 'expected_version' => 1])->assertOk();
        $this->actingAs($operator)->postJson(route('api.tasks.start', $taskId), ['expected_version' => 2])->assertCreated();
        $this->postJson(route('api.tasks.visit', $taskId), ['expected_version' => 3, 'outcome' => 'COLLECTED'])->assertOk();
        $this->postJson(route('api.tasks.proof', $taskId), ['expected_version' => 4, 'submission_key' => (string) Str::uuid(), 'manual_hybrid' => 2, 'cashless_hybrid' => 1, 'css_orion' => 0, 'signature' => UploadedFile::fake()->image('signature.png')])->assertCreated();
        $ids[] = $taskId;
    }
    $key = (string) Str::uuid();
    $response = $this->actingAs($retail)->postJson(route('api.handovers.store'), ['submission_key' => $key, 'task_ids' => $ids])->assertCreated()->assertJsonCount(2, 'data.items')->assertJsonPath('data.status', 'DRAFT');
    $session = HandoverSession::findOrFail($response->json('data.id'));
    $this->postJson(route('api.handovers.store'), ['submission_key' => $key, 'task_ids' => $ids])->assertOk();
    $this->postJson(route('api.handovers.store'), ['submission_key' => (string) Str::uuid(), 'task_ids' => [$ids[0]]])->assertConflict();
    $this->postJson(route('api.handovers.close', $session), ['expected_version' => 1])->assertConflict();
    [$one, $two] = $session->items()->get()->all();
    $this->postJson(route('api.handovers.verify', [$session, $one->id]), ['expected_version' => 1, 'manual_hybrid' => 2, 'cashless_hybrid' => 1, 'css_orion' => 0])->assertOk()->assertJsonPath('data.status', 'IN_VERIFICATION')->assertJsonPath('data.items.0.status', 'VERIFIED');
    $changed = ['expected_version' => 2, 'manual_hybrid' => 1, 'cashless_hybrid' => 2, 'css_orion' => 0];
    $this->postJson(route('api.handovers.verify', [$session, $two->id]), $changed)->assertUnprocessable()->assertJsonValidationErrors('discrepancy_notes');
    $this->postJson(route('api.handovers.verify', [$session, $two->id]), [...$changed, 'discrepancy_notes' => 'Kategori berbeda meskipun total sama'])->assertOk()->assertJsonPath('data.items.1.status', 'DISCREPANCY')->assertJsonPath('data.items.1.differences.manual_hybrid', -1);
    $this->postJson(route('api.handovers.close', $session), ['expected_version' => 3])->assertOk()->assertJsonPath('data.status', 'CLOSED')->assertJsonPath('data.items.1.status', 'DISCREPANCY');
    $this->postJson(route('api.handovers.verify', [$session, $two->id]), [...$changed, 'expected_version' => 4, 'discrepancy_notes' => 'Diubah'])->assertConflict();
    expect(PickupRecord::whereIn('pickup_task_id', $ids)->pluck('manual_hybrid')->all())->toBe([2, 2]);
    expect($session->fresh()->closed_by)->toBe($retail->id)->and($session->events()->count())->toBe(4);
    $this->getJson(route('api.tasks.show', $ids[0]))->assertOk()->assertJsonPath('data.proof.total', 3);
    $this->actingAs($cs)->getJson(route('api.handovers.show', $session))->assertForbidden();
});

test('handover enforces eligibility permissions stale requests and item session ownership', function () {
    $operator = User::factory()->create(['role' => 'admin_supervisor']);
    $task = PickupTask::factory()->create(['status' => 'PICKED_UP']);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
    $this->actingAs(User::factory()->create(['role' => 'cs']))->postJson(route('api.handovers.store'), ['submission_key' => (string) Str::uuid(), 'task_ids' => [$task->id]])->assertForbidden();
    $unfinished = PickupTask::factory()->create();
    $this->actingAs($operator)->postJson(route('api.handovers.store'), ['submission_key' => (string) Str::uuid(), 'task_ids' => [$task->id, $unfinished->id]])->assertConflict();
    expect(HandoverSession::count())->toBe(0);
    $response = $this->postJson(route('api.handovers.store'), ['submission_key' => (string) Str::uuid(), 'task_ids' => [$task->id]])->assertCreated();
    $session = HandoverSession::findOrFail($response->json('data.id'));
    $item = $session->items()->sole();
    $data = ['expected_version' => 2, 'manual_hybrid' => 2, 'cashless_hybrid' => 1, 'css_orion' => 0];
    $this->postJson(route('api.handovers.verify', [$session, $item->id]), $data)->assertConflict();
    $another = HandoverSession::factory()->create();
    $this->postJson(route('api.handovers.verify', [$another, $item->id]), [...$data, 'expected_version' => 1])->assertNotFound();
    $this->postJson(route('api.handovers.verify', [$session, $item->id]), [...$data, 'expected_version' => 1])->assertOk();
    $this->postJson(route('api.handovers.verify', [$session, $item->id]), $data)->assertConflict();
    expect($item->fresh()->verified_by)->toBe($operator->id)->and($item->fresh()->manual_hybrid)->toBe(2);
    $this->postJson(route('api.handovers.close', $session), ['expected_version' => 1])->assertConflict();
    $this->postJson(route('api.handovers.close', $session), ['expected_version' => 2])->assertOk();
});
