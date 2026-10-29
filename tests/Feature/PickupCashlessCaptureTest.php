<?php

use App\Models\CashlessEntryBatch;
use App\Models\PickupCashlessAwb;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

function popCashlessFixture(): array
{
    Storage::fake('local');
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $task = PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $staff->id, 'execution_started_at' => now()]);
    $task->visits()->create(['staff_id' => $staff->id, 'started_at' => now(), 'outcome' => 'COLLECTED', 'recorded_at' => now()]);

    return [$staff, $task, ['expected_version' => 1, 'submission_key' => (string) Str::uuid(),
        'manual_hybrid' => 1, 'cashless_hybrid' => 2, 'css_orion' => 0, 'cashless_capture' => 1,
        'cashless_awbs' => ['TGPOP001', 'CMPOP002'], 'signature' => UploadedFile::fake()->image('signature.png')]];
}

test('POP commits scanned resi once counts them and queues Puman without a separate handover', function () {
    [$staff, $task, $payload] = popCashlessFixture();

    $this->actingAs($staff)->postJson(route('api.tasks.proof', $task), [...$payload, 'source' => 'roberto'])
        ->assertCreated()->assertJsonPath('data.cashless_hybrid', 2)->assertJsonPath('data.total', 3);
    $this->postJson(route('api.tasks.proof', $task), $payload)->assertOk();

    $this->assertDatabaseCount('pickup_cashless_awbs', 2);
    $this->assertDatabaseCount('cashless_entry_batches', 1);
    $this->assertDatabaseHas('cashless_entry_batches', ['pickup_task_id' => $task->id, 'source' => 'nuralamt', 'status' => 'QUEUED']);
    $this->assertDatabaseCount('pickup_records', 1);
    $this->assertDatabaseCount('pickup_attachments', 1);
    expect($task->fresh()->status)->toBe('PICKED_UP');
    $this->postJson(route('api.tasks.proof', $task), [...$payload, 'cashless_awbs' => ['TGDIFFERENT', 'CMPOP002']])->assertConflict();
    $this->assertDatabaseCount('cashless_entry_batches', 1);
});

test('invalid scanned lists cannot finalize POP or create external work', function (array $changes) {
    [$staff, $task, $payload] = popCashlessFixture();

    $this->actingAs($staff)->postJson(route('api.tasks.proof', $task), [...$payload, ...$changes])->assertUnprocessable();

    $this->assertDatabaseCount('pickup_records', 0);
    $this->assertDatabaseCount('pickup_cashless_awbs', 0);
    $this->assertDatabaseCount('cashless_entry_batches', 0);
    expect($task->fresh()->status)->toBe('ASSIGNED');
})->with([
    [['cashless_hybrid' => 3]], [['cashless_awbs' => ['TGPOP001', 'tgpop001']]],
    [['cashless_awbs' => ['016660047446626', 'TGPOP001']]], [['cashless_awbs' => []]],
    [['cashless_awbs' => ['has spaces', 'TGPOP001']]], [['signature' => null]],
]);

test('a resi already owned by another pickup rolls back the complete POP', function () {
    [$staff, $task, $payload] = popCashlessFixture();
    PickupCashlessAwb::factory()->create(['awb' => 'TGPOP001']);

    $this->actingAs($staff)->postJson(route('api.tasks.proof', $task), $payload)->assertUnprocessable();

    $this->assertDatabaseCount('pickup_records', 0);
    $this->assertDatabaseCount('cashless_entry_batches', 0);
    expect(Storage::disk('local')->allFiles())->toBe([]);
});

test('existing unbatched resi and newly captured resi enter one POP batch', function () {
    [$staff, $task, $payload] = popCashlessFixture();
    PickupCashlessAwb::factory()->create(['pickup_task_id' => $task->id, 'customer_id' => $task->customer_id, 'awb' => 'TGPOP001']);

    $this->actingAs($staff)->postJson(route('api.tasks.proof', $task), $payload)->assertCreated();

    $this->assertDatabaseCount('pickup_cashless_awbs', 2);
    expect(CashlessEntryBatch::sole()->items->pluck('awb')->all())->toBe(['TGPOP001', 'CMPOP002']);
});

test('individually scanned resi enter Puman when a legacy client finalizes POP without capture fields', function () {
    [$staff, $task, $payload] = popCashlessFixture();
    unset($payload['cashless_capture'], $payload['cashless_awbs']);
    $payload['cashless_hybrid'] = 1;
    $this->actingAs($staff)->postJson(route('api.cashless-awbs.store', $task), ['submission_key' => (string) Str::uuid(), 'awb' => 'CM64041400789'])->assertOk();
    $this->assertDatabaseCount('cashless_entry_batches', 0);

    $this->postJson(route('api.tasks.proof', $task), $payload)->assertCreated();
    $this->postJson(route('api.tasks.proof', $task), $payload)->assertOk();

    $batch = CashlessEntryBatch::sole();
    expect($batch->source)->toBe('nuralamt')->and($batch->status)->toBe('QUEUED');
    expect($batch->items->pluck('awb')->all())->toBe(['CM64041400789']);
    $this->assertDatabaseHas('cashless_entry_events', ['batch_id' => $batch->id, 'type' => 'recorded-awbs-queued']);
    $this->assertDatabaseHas('pickup_records', ['pickup_task_id' => $task->id, 'cashless_hybrid' => 1, 'cashless_capture_hash' => null]);
});

test('recovery queues only never batched resi and never replays attempted input', function (string $status) {
    [$staff, $task] = popCashlessFixture();
    $task->update(['status' => 'PICKED_UP']);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'staff_id' => $staff->id, 'cashless_hybrid' => 2]);
    $old = PickupCashlessAwb::factory()->create(['pickup_task_id' => $task->id, 'customer_id' => $task->customer_id, 'awb' => 'TGATTEMPTED']);
    PickupCashlessAwb::factory()->create(['pickup_task_id' => $task->id, 'customer_id' => $task->customer_id, 'awb' => 'CMUNBATCHED']);
    $previous = CashlessEntryBatch::factory()->create(['pickup_task_id' => $task->id, 'status' => $status]);
    $previous->items()->create(['pickup_cashless_awb_id' => $old->id, 'awb' => $old->awb, 'status' => 'PENDING']);
    $options = ['--queue-unbatched' => $task->id, '--reason' => 'Pulihkan antrean POP lama'];

    $this->artisan('cashless:entries', $options)->assertSuccessful();
    $this->artisan('cashless:entries', $options)->assertSuccessful();

    $this->assertDatabaseCount('cashless_entry_batches', 2);
    $batch = CashlessEntryBatch::latest('id')->first();
    expect($batch->source)->toBe('nuralamt')->and($batch->created_by)->toBe($staff->id);
    expect($batch->items->pluck('awb')->all())->toBe(['CMUNBATCHED']);
    expect($previous->fresh()->status)->toBe($status);
})->with(['QUEUED', 'UNKNOWN', 'DONE', 'FAILED', 'CANCELLED']);

test('recovery refuses unfinished POP excess quantities invalid resi and a PM override', function (string $condition) {
    [$staff, $task] = popCashlessFixture();
    if ($condition !== 'unfinished') {
        $task->update(['status' => 'PICKED_UP']);
        PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'staff_id' => $staff->id, 'cashless_hybrid' => $condition === 'quantity' ? 0 : 1]);
    }
    PickupCashlessAwb::factory()->create(['pickup_task_id' => $task->id, 'customer_id' => $task->customer_id,
        'awb' => $condition === 'invalid' ? '016660047446626' : 'CMPENDING']);
    $options = ['--queue-unbatched' => $task->id, '--reason' => 'Periksa antrean'];
    if ($condition === 'pm') {
        $options['--source'] = 'roberto';
    }

    $this->artisan('cashless:entries', $options)->assertFailed();

    $this->assertDatabaseCount('cashless_entry_batches', 0);
})->with(['unfinished', 'quantity', 'invalid', 'pm']);

test('a mobile execution token can submit cashless with POP and processing failures never change its quantity', function () {
    [$staff, $task, $payload] = popCashlessFixture();
    $token = $staff->createToken('mobile:'.Str::uuid().':Android', ['mobile:read', 'mobile:execute'], now()->addDay());

    $this->withToken($token->plainTextToken)->postJson(route('mobile.tasks.proof', $task), $payload)->assertCreated();
    $batch = CashlessEntryBatch::sole();
    $batch->items()->update(['status' => 'NOT_FOUND', 'message' => 'Tidak ditemukan']);
    $batch->update(['status' => 'FAILED']);

    $this->assertDatabaseHas('pickup_records', ['pickup_task_id' => $task->id, 'cashless_hybrid' => 2]);
    $this->assertDatabaseHas('cashless_entry_alerts', ['batch_id' => $batch->id, 'user_id' => $staff->id]);
    $this->getJson(route('mobile.cashless-results.show', $batch))->assertOk()->assertJsonPath('items.total', 2)
        ->assertJsonPath('items.data.0.awb', 'TGPOP001')->assertJsonPath('items.data.0.message', 'Tidak ditemukan');
    $other = User::factory()->create(['role' => 'pickup_staff']);
    $otherToken = $other->createToken('mobile:'.Str::uuid().':Android', ['mobile:read'], now()->addDay());
    app('auth')->forgetGuards();
    $this->withToken($otherToken->plainTextToken)->getJson(route('mobile.cashless-results.show', $batch))->assertNotFound();
});

test('zero cashless POP does not create an empty worker batch', function () {
    [$staff, $task, $payload] = popCashlessFixture();

    $this->actingAs($staff)->postJson(route('api.tasks.proof', $task), [...$payload, 'cashless_hybrid' => 0, 'cashless_awbs' => []])->assertCreated();

    $this->assertDatabaseCount('cashless_entry_batches', 0);
});

test('evidence storage failure rolls back captured resi the batch and POP together', function () {
    [$staff, $task, $payload] = popCashlessFixture();
    $disk = Mockery::mock(FilesystemAdapter::class);
    $disk->shouldReceive('putFileAs')->once()->andReturn(false);
    $disk->shouldReceive('delete')->once()->with([])->andReturn(true);
    Storage::shouldReceive('disk')->with('local')->andReturn($disk);

    $this->actingAs($staff)->postJson(route('api.tasks.proof', $task), $payload)->assertServerError();

    $this->assertDatabaseCount('pickup_records', 0);
    $this->assertDatabaseCount('pickup_cashless_awbs', 0);
    $this->assertDatabaseCount('cashless_entry_batches', 0);
    $this->assertDatabaseCount('pickup_cashless_awb_events', 0);
    expect($task->fresh()->status)->toBe('ASSIGNED');
});

test('result view excludes accepted resi paginates exceptions and rejects other users on web', function () {
    [$staff, $task, $payload] = popCashlessFixture();
    $this->actingAs($staff)->postJson(route('api.tasks.proof', $task), $payload)->assertCreated();
    $batch = CashlessEntryBatch::sole();
    $batch->items()->where('awb', 'TGPOP001')->update(['status' => 'ACCEPTED']);
    $batch->items()->where('awb', 'CMPOP002')->update(['status' => 'NEEDS_DATA', 'message' => 'Destinasi tidak lengkap']);
    $batch->update(['status' => 'PARTIAL']);

    $this->get(route('cashless-results.show', $batch))->assertOk()->assertInertia(fn ($page) => $page
        ->component('cashless-entry-result')->where('result.accepted', 1)->where('result.items.total', 1)
        ->where('result.items.data.0.awb', 'CMPOP002')->where('result.items.data.0.message', 'Destinasi tidak lengkap'));
    $this->getJson(route('cashless-results.show', [$batch, 'page' => 0]))->assertUnprocessable();
    $this->actingAs(User::factory()->create(['role' => 'pickup_staff']))->get(route('cashless-results.show', $batch))->assertNotFound();
});
