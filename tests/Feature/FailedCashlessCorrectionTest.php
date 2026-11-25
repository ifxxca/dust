<?php

use App\Models\CashlessEntryBatch;
use App\Models\PickupCashlessAwb;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;

function failedCashlessFixture(): array
{
    $owner = User::factory()->create(['role' => 'pickup_staff']);
    $task = PickupTask::factory()->create(['assigned_staff_id' => $owner->id, 'status' => 'PICKED_UP']);
    $proof = PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'staff_id' => $owner->id, 'manual_hybrid' => 0, 'cashless_hybrid' => 5]);
    $batch = CashlessEntryBatch::factory()->create(['pickup_task_id' => $task->id, 'created_by' => $owner->id,
        'source' => 'nuralamt', 'status' => 'PARTIAL', 'approved_at' => now(), 'ho_number' => 'HO-666-TEST-1']);
    foreach (['CM00000000711', 'CM00000000712', 'CM00000000713', 'CM00000000714', 'WRONGSKU123'] as $index => $awb) {
        $record = PickupCashlessAwb::factory()->create(['pickup_task_id' => $task->id, 'customer_id' => $task->customer_id,
            'created_by' => $owner->id, 'awb' => $awb, 'raw_awb' => $awb, 'original_awb' => $awb, 'version' => 1]);
        $batch->items()->create(['pickup_cashless_awb_id' => $record->id, 'awb' => $awb,
            'status' => $index === 4 ? 'NOT_FOUND' : 'ACCEPTED', 'message' => $index === 4 ? 'Connote '.$awb.' tidak ditemukan.' : 'Data connote berhasil disimpan']);
    }

    return [$owner, $task, $proof, $batch, $batch->items()->where('status', 'NOT_FOUND')->sole(),
        ['submission_key' => (string) Str::uuid(), 'expected_version' => 1, 'awb' => ' cm00000000701 ']];
}

test('the courier replaces only a rejected resi and retries it once while preserving the approved four and finalized POP', function () {
    config(['pickup.cashless_entry.per_user_accounts' => true]);
    [$owner, $task, $proof, $batch, $item, $data] = failedCashlessFixture();
    $url = route('cashless-results.correct', [$batch, $item->id]);
    $beforeProof = $proof->fresh()->getAttributes();
    $this->actingAs($owner)->getJson(route('api.pickup-notifications.index'))->assertOk()->assertJsonPath('data.0.exception_count', 1);

    $response = $this->actingAs($owner)->postJson($url, $data)->assertOk()->assertJsonPath('status', 'WAITING_ACCOUNT');
    $nextId = $response->json('batch_id');
    $this->postJson($url, $data)->assertOk()->assertJsonPath('batch_id', $nextId);

    $next = CashlessEntryBatch::findOrFail($nextId);
    expect($next->items->pluck('awb')->all())->toBe(['CM00000000701']);
    expect($next->hybrid_user_id)->toBe($owner->id)->and($next->ho_number)->toBeNull();
    expect($next->source)->toBe('roberto')->and($batch->fresh()->source)->toBe('nuralamt');
    expect($proof->fresh()->getAttributes())->toBe($beforeProof);
    expect($batch->fresh()->status)->toBe('PARTIAL')->and($batch->items()->where('status', 'ACCEPTED')->count())->toBe(4);
    $this->assertDatabaseCount('pickup_cashless_awbs', 5);
    $this->assertDatabaseCount('cashless_entry_batches', 2);
    $this->assertDatabaseHas('pickup_cashless_awbs', ['id' => $item->pickup_cashless_awb_id, 'awb' => 'CM00000000701', 'original_awb' => 'WRONGSKU123', 'version' => 2]);
    $this->assertDatabaseHas('cashless_entry_items', ['id' => $item->id, 'awb' => 'WRONGSKU123', 'status' => 'NOT_FOUND']);
    $this->assertDatabaseHas('pickup_cashless_awb_events', ['actor_id' => $owner->id, 'previous_awb' => 'WRONGSKU123', 'awb' => 'CM00000000701']);
    $this->get(route('cashless-results.show', $batch))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('result.items.data.0.can_correct', false)->where('result.items.data.0.replacement_batch_id', $nextId));
    $this->postJson($url, [...$data, 'submission_key' => (string) Str::uuid()])->assertConflict();
});

test('correction refuses unsafe or already processed results', function (string $condition) {
    [$owner, , , $batch, $item, $data] = failedCashlessFixture();
    if (in_array($condition, ['UNKNOWN', 'ENTERING', 'APPROVING'], true)) {
        $batch->update(['status' => $condition]);
    } else {
        $item->update(['status' => $condition]);
    }

    $this->actingAs($owner)->postJson(route('cashless-results.correct', [$batch, $item->id]), $data)->assertConflict();

    $this->assertDatabaseCount('cashless_entry_batches', 1);
    $this->assertDatabaseHas('pickup_cashless_awbs', ['id' => $item->pickup_cashless_awb_id, 'awb' => 'WRONGSKU123', 'version' => 1]);
})->with(['UNKNOWN', 'ENTERING', 'APPROVING', 'ACCEPTED', 'IN_FLIGHT', 'PREVIOUSLY_ENTERED']);

test('short duplicate manual unchanged and stale replacement codes never create work', function (string $condition) {
    [$owner, , , $batch, $item, $data] = failedCashlessFixture();
    $data = match ($condition) {
        'stale' => [...$data, 'expected_version' => 2],
        default => [...$data, 'awb' => $condition],
    };

    $response = $this->actingAs($owner)->postJson(route('cashless-results.correct', [$batch, $item->id]), $data);
    if ($condition === 'stale') {
        $response->assertConflict();
    } else {
        $response->assertUnprocessable()->assertJsonValidationErrors('awb');
    }

    $this->assertDatabaseCount('cashless_entry_batches', 1);
    $this->assertDatabaseHas('pickup_cashless_awbs', ['id' => $item->pickup_cashless_awb_id, 'awb' => 'WRONGSKU123']);
})->with(['1234', '12345', 'SKU12', 'CM00000000711', '016660047446626', 'WRONGSKU123', 'stale']);

test('replacement is scoped to its owner and batch on both web and mobile with write permission', function () {
    [$owner, , , $batch, $item, $data] = failedCashlessFixture();
    $other = User::factory()->create(['role' => 'pickup_staff']);
    $this->actingAs($other)->postJson(route('cashless-results.correct', [$batch, $item->id]), $data)->assertNotFound();
    $this->actingAs($owner)->postJson(route('cashless-results.correct', [$batch, $item->id + 99]), $data)->assertNotFound();
    app('auth')->forgetGuards();
    $read = $owner->createToken('mobile:read-only:Android', ['mobile:read'], now()->addDay());
    $this->withToken($read->plainTextToken)->postJson(route('mobile.cashless-results.correct', [$batch, $item->id]), $data)->assertForbidden();
    $this->getJson(route('mobile.cashless-results.show', $batch))->assertOk()->assertJsonPath('items.data.0.can_correct', false);
    app('auth')->forgetGuards();
    $write = $owner->createToken('mobile:write:Android', ['mobile:read', 'mobile:execute'], now()->addDay());
    $this->withToken($write->plainTextToken)->getJson(route('mobile.cashless-results.show', $batch))->assertOk()->assertJsonPath('items.data.0.can_correct', true);
    $this->postJson(route('mobile.cashless-results.correct', [$batch, $item->id]), $data)->assertOk();
    $this->assertDatabaseCount('cashless_entry_batches', 2);
});
