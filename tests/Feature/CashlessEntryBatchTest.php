<?php

use App\Actions\Pickup\ManageCashlessEntryBatches;
use App\Actions\Pickup\RecordCashlessAwb;
use App\Models\CashlessEntryBatch;
use App\Models\PickupCashlessAwb;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Symfony\Component\HttpKernel\Exception\HttpException;

beforeEach(function () {
    config(['pickup.cashless_entry.enabled' => true, 'jne-reports.worker_token' => str_repeat('t', 40)]);
});

function entryBatch(array $awbs = ['TG001', 'CM002'], string $source = 'roberto'): CashlessEntryBatch
{
    $task = PickupTask::factory()->create();
    $batch = CashlessEntryBatch::factory()->create(['pickup_task_id' => $task->id, 'source' => $source]);
    foreach ($awbs as $awb) {
        $record = PickupCashlessAwb::factory()->create(['pickup_task_id' => $task->id, 'customer_id' => $task->customer_id, 'awb' => $awb]);
        $batch->items()->create(['pickup_cashless_awb_id' => $record->id, 'awb' => $awb, 'status' => 'PENDING']);
    }

    return $batch;
}

function entryHeaders(string $source = 'roberto'): array
{
    return ['Authorization' => 'Bearer '.str_repeat('t', 40), 'X-Worker-ID' => 'hybrid-'.$source];
}

function entryEvent(CashlessEntryBatch $batch, string $type, array $evidence = []): array
{
    return ['event_key' => (string) Str::uuid(), 'type' => $type,
        'ho_number' => 'HO-015-TEST-'.$batch->id, ...$evidence];
}

function entryClaim(CashlessEntryBatch $batch): array
{
    return test()->withHeaders(entryHeaders($batch->source))->postJson(route('internal.cashless-entries.claim'), ['claim_key' => (string) Str::uuid()])
        ->assertOk()->assertJsonPath('data.id', $batch->id)->json('data');
}

function entrySend(CashlessEntryBatch $batch, array $claim, string $type, array $evidence = []): TestResponse
{
    return test()->withHeaders([...entryHeaders($batch->source), 'X-Cashless-Claim' => $claim['claim_token']])
        ->postJson(route('internal.cashless-entries.checkpoint', $batch->id), entryEvent($batch, $type, $evidence));
}

function entryStart(CashlessEntryBatch $batch, array $claim): void
{
    entrySend($batch, $claim, 'creating')->assertOk();
    entrySend($batch, $claim, 'created')->assertOk();
}

test('a held verification resumes the same batch and HO without permitting scans or a second approval attempt', function () {
    $batch = entryBatch(['CMRECOVER'], 'nuralamt');
    $claim = entryClaim($batch);
    entryStart($batch, $claim);
    $item = $batch->items->first();
    entrySend($batch, $claim, 'scan-start', ['item_id' => $item->id, 'awb' => $item->awb])->assertOk();
    entrySend($batch, $claim, 'scan-result', ['item_id' => $item->id, 'awb' => $item->awb, 'message' => 'Data connote berhasil disimpan', 'outcome' => 'ACCEPTED'])->assertOk();
    entrySend($batch, $claim, 'hold', ['message' => 'CASHLESS_CSV: Ekspor gagal'])->assertOk();
    $this->artisan('cashless:entries', ['--confirm-approval' => $batch->id, '--reason' => 'Belum pernah approve'])->assertFailed();

    $this->artisan('cashless:entries', ['--resume-verification' => $batch->id, '--reason' => 'Kontrak ekspor diperbaiki'])->assertSuccessful();

    entrySend($batch, $claim, 'heartbeat')->assertConflict();
    $next = entryClaim($batch);
    expect($next['status'])->toBe('VERIFYING')->and($next['ho_number'])->toBe('HO-015-TEST-'.$batch->id);
    entrySend($batch, $next, 'scan-start', ['item_id' => $item->id, 'awb' => $item->awb])->assertConflict();
    entrySend($batch, $next, 'approval-start', ['verified_awbs' => ['OTHER']])->assertConflict();
    entrySend($batch, $next, 'approval-start', ['verified_awbs' => ['CMRECOVER']])->assertOk();
    entrySend($batch, $next, 'approved', ['print_available' => true, 'approve_available' => false])->assertOk()->assertJsonPath('data.status', 'DONE');
    $this->assertDatabaseCount('cashless_entry_batches', 1);
    $this->assertDatabaseHas('cashless_entry_events', ['batch_id' => $batch->id, 'type' => 'verification-resumed']);
    $this->artisan('cashless:entries', ['--resume-verification' => $batch->id, '--reason' => 'Jangan ulangi'])->assertFailed();
});

test('verification recovery refuses uncertain inputs an attempted approval or a different active lane', function (string $condition) {
    $batch = entryBatch(['CMUNSAFE']);
    $claim = entryClaim($batch);
    entryStart($batch, $claim);
    $batch->items()->update(['status' => in_array($condition, ['PENDING', 'IN_FLIGHT', 'UNKNOWN'], true) ? $condition : 'ACCEPTED']);
    if ($condition === 'approval') {
        entrySend($batch, $claim, 'approval-start', ['verified_awbs' => ['CMUNSAFE']])->assertOk();
    }
    entrySend($batch, $claim, 'hold', ['message' => 'Periksa sebelum mengulang'])->assertOk();
    if ($condition === 'lane') {
        $other = entryBatch(['CMOTHER']);
        entryClaim($other);
    }

    $this->artisan('cashless:entries', ['--resume-verification' => $batch->id, '--reason' => 'Periksa bukti'])->assertFailed();

    expect($batch->fresh()->status)->toBe('UNKNOWN');
    $this->assertDatabaseCount('cashless_entry_batches', $condition === 'lane' ? 2 : 1);
})->with(['PENDING', 'IN_FLIGHT', 'UNKNOWN', 'approval', 'lane']);

test('approval confirmation requires a prior verified attempt and accepts only read evidence without another approval start', function () {
    $batch = entryBatch(['CMCONFIRM']);
    $claim = entryClaim($batch);
    entryStart($batch, $claim);
    $batch->items()->update(['status' => 'ACCEPTED']);
    entrySend($batch, $claim, 'approval-start', ['verified_awbs' => ['CMCONFIRM']])->assertOk();
    entrySend($batch, $claim, 'hold', ['message' => 'Hasil approval belum terbukti'])->assertOk();

    $this->artisan('cashless:entries', ['--confirm-approval' => $batch->id, '--reason' => 'Baca bukti HO yang sama'])->assertSuccessful();

    $next = entryClaim($batch);
    expect($next['status'])->toBe('CONFIRMING');
    entrySend($batch, $next, 'approval-start', ['verified_awbs' => ['CMCONFIRM']])->assertConflict();
    entrySend($batch, $next, 'approved', ['print_available' => false, 'approve_available' => true])->assertUnprocessable();
    entrySend($batch, $next, 'approved', ['print_available' => true, 'approve_available' => false])->assertOk()->assertJsonPath('data.status', 'DONE');
    $this->assertDatabaseCount('cashless_entry_batches', 1);
    $this->assertDatabaseHas('cashless_entry_events', ['batch_id' => $batch->id, 'type' => 'approval-confirmation-requested']);
});

test('saved handovers enqueue exactly one immutable server batch and retries cannot change its server', function () {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $task = PickupTask::factory()->create(['assigned_staff_id' => $staff->id, 'status' => 'PICKED_UP', 'execution_started_at' => now()]);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'staff_id' => $staff->id]);
    $payload = ['submission_key' => (string) Str::uuid(), 'awbs' => ['TGNEW', 'CMNEW'], 'source' => 'roberto'];
    $this->actingAs($staff)->post(route('cashless-handover.store', $task), $payload)->assertRedirect();
    $this->post(route('cashless-handover.store', $task), $payload)->assertRedirect();
    $this->assertDatabaseCount('cashless_entry_batches', 1);
    $this->assertDatabaseCount('cashless_entry_items', 2);
    $this->assertDatabaseHas('cashless_entry_batches', ['source' => 'roberto', 'status' => 'QUEUED']);
    $this->postJson(route('cashless-handover.store', $task), [...$payload, 'source' => 'nuralamt'])->assertConflict();
    $this->assertDatabaseCount('jne_shipments', 0);
});

test('unrouted and disabled batches never become external work', function () {
    $batch = entryBatch();
    $batch->update(['source' => null, 'status' => 'WAITING_SOURCE']);
    $this->withHeaders(entryHeaders())->postJson(route('internal.cashless-entries.claim'), ['claim_key' => (string) Str::uuid()])->assertNoContent();
    $batch->update(['source' => 'roberto', 'status' => 'QUEUED']);
    config(['pickup.cashless_entry.enabled' => false]);
    $this->postJson(route('internal.cashless-entries.claim'), ['claim_key' => (string) Str::uuid()])->assertNoContent();
    expect($batch->fresh()->status)->toBe('QUEUED');
});

test('claim retries return the same token while another batch waits in its server lane', function () {
    $first = entryBatch(['TG1']);
    $second = entryBatch(['TG2']);
    $key = ['claim_key' => (string) Str::uuid()];
    $claim = $this->withHeaders(entryHeaders())->postJson(route('internal.cashless-entries.claim'), $key)->assertOk()->json('data');
    $this->postJson(route('internal.cashless-entries.claim'), $key)->assertOk()->assertJsonPath('data.claim_token', $claim['claim_token']);
    $this->postJson(route('internal.cashless-entries.claim'), ['claim_key' => (string) Str::uuid()])->assertNoContent();
    expect($first->fresh()->status)->toBe('CLAIMED')->and($second->fresh()->status)->toBe('QUEUED');
    $puman = entryBatch(['TG3'], 'nuralamt');
    entryClaim($puman);
});

test('worker endpoints reject missing authentication wrong source and stale ownership', function () {
    $batch = entryBatch();
    $this->postJson(route('internal.cashless-entries.claim'), ['claim_key' => (string) Str::uuid()])->assertUnauthorized();
    $claim = entryClaim($batch);
    $this->withHeaders([...entryHeaders('nuralamt'), 'X-Cashless-Claim' => $claim['claim_token']])
        ->postJson(route('internal.cashless-entries.checkpoint', $batch->id), entryEvent($batch, 'creating'))->assertNotFound();
    entrySend($batch, ['claim_token' => 'wrong'], 'creating')->assertConflict();
});

test('items are sequential and approval requires complete exact HO contents', function () {
    $batch = entryBatch();
    $claim = entryClaim($batch);
    entryStart($batch, $claim);
    [$first, $second] = $batch->items;
    entrySend($batch, $claim, 'scan-start', ['item_id' => $first->id, 'awb' => $first->awb])->assertOk();
    entrySend($batch, $claim, 'scan-start', ['item_id' => $second->id, 'awb' => $second->awb])->assertConflict();
    entrySend($batch, $claim, 'approval-start', ['verified_awbs' => [$first->awb]])->assertConflict();
    foreach ([$first, $second] as $index => $item) {
        if ($index !== 0) {
            entrySend($batch, $claim, 'scan-start', ['item_id' => $item->id, 'awb' => $item->awb])->assertOk();
        }
        entrySend($batch, $claim, 'scan-result', ['item_id' => $item->id, 'awb' => $item->awb,
            'message' => 'Data connote berhasil disimpan', 'outcome' => 'ACCEPTED'])->assertOk();
    }
    entrySend($batch, $claim, 'approval-start', ['verified_awbs' => ['TG001', 'EXTRA']])->assertConflict();
    entrySend($batch, $claim, 'approval-start', ['verified_awbs' => ['CM002', 'TG001']])->assertOk();
    entrySend($batch, $claim, 'approved', ['print_available' => true, 'approve_available' => true])->assertUnprocessable();
    entrySend($batch, $claim, 'approved', ['print_available' => true, 'approve_available' => false])->assertOk()->assertJsonPath('data.status', 'DONE');
    expect($batch->fresh()->approved_at)->not->toBeNull();
    expect(DB::table('cashless_entry_lanes')->where('source', 'roberto')->value('active_batch_id'))->toBeNull();
    $next = entryBatch(['TG3']);
    $nextClaim = entryClaim($next);
    entrySend($next, $nextClaim, 'creating')->assertOk();
    entrySend($next, $nextClaim, 'created', ['ho_number' => $batch->fresh()->ho_number])->assertConflict();
});

test('unknown or expired work is quarantined while the next batch proceeds with an isolated session', function (bool $expired) {
    $batch = entryBatch(['TG1']);
    $next = entryBatch(['TG2']);
    $claim = entryClaim($batch);
    entryStart($batch, $claim);
    if ($expired) {
        $this->travel(301)->seconds();
    } else {
        entrySend($batch, $claim, 'hold', ['message' => 'Respons hilang'])->assertOk()->assertJsonPath('data.status', 'UNKNOWN');
    }
    $nextClaim = entryClaim($next);

    expect($batch->fresh()->status)->toBe('UNKNOWN')->and($batch->fresh()->lease_until)->toBeNull();
    expect($next->fresh()->status)->toBe('CLAIMED')->and($nextClaim['fresh_session_required'])->toBeTrue();
    entrySend($batch, $claim, 'creating')->assertConflict();
    entryStart($next, $nextClaim);
    $this->assertDatabaseHas('cashless_entry_alerts', ['batch_id' => $batch->id]);
    $this->assertDatabaseCount('cashless_entry_batches', 2);
    expect($batch->items()->sole()->status)->toBe('PENDING');
})->with([true, false]);

test('an unknown scan result releases only its own lane and leaves uncertain resi out of future batches', function () {
    $batch = entryBatch(['UNKNOWN1']);
    $next = entryBatch(['TGNEW']);
    $claim = entryClaim($batch);
    entryStart($batch, $claim);
    $item = $batch->items->first();
    entrySend($batch, $claim, 'scan-start', ['item_id' => $item->id, 'awb' => $item->awb])->assertOk();
    entrySend($batch, $claim, 'scan-result', ['item_id' => $item->id, 'awb' => $item->awb, 'message' => 'Respons baru', 'outcome' => 'UNKNOWN'])->assertOk();

    $nextClaim = entryClaim($next);

    expect($nextClaim['fresh_session_required'])->toBeTrue();
    expect($nextClaim['items'])->toHaveCount(1);
    expect($nextClaim['items'][0]['awb'])->toBe('TGNEW');
    entrySend($batch, $claim, 'heartbeat')->assertConflict();
    expect(DB::table('cashless_entry_lanes')->where('source', 'roberto')->value('active_batch_id'))->toBe($next->id);
    $puman = entryBatch(['TGSEPARATE'], 'nuralamt');
    expect(entryClaim($puman)['fresh_session_required'])->toBeFalse();
    expect($item->fresh()->status)->toBe('UNKNOWN');
});

test('a legacy unknown lane is released without replaying its batch and recovery cannot take over a busy lane', function () {
    $batch = entryBatch(['TGOLD']);
    $claim = entryClaim($batch);
    entryStart($batch, $claim);
    $batch->items()->update(['status' => 'ACCEPTED']);
    $batch->update(['status' => 'UNKNOWN']);
    $next = entryBatch(['TGNEW']);

    entryClaim($next);
    $this->artisan('cashless:entries', ['--resume-verification' => $batch->id, '--reason' => 'Jangan ganggu batch aktif'])->assertFailed();

    expect($batch->fresh()->lease_until)->toBeNull();
    expect(DB::table('cashless_entry_lanes')->where('source', 'roberto')->value('active_batch_id'))->toBe($next->id);
    $this->assertDatabaseCount('cashless_entry_batches', 2);
});

test('retrying an acknowledged hold cannot release the next batch or duplicate its notification', function () {
    $batch = entryBatch(['TGOLD']);
    $claim = entryClaim($batch);
    entryStart($batch, $claim);
    $hold = entryEvent($batch, 'hold', ['message' => 'Respons hilang']);
    $headers = [...entryHeaders(), 'X-Cashless-Claim' => $claim['claim_token']];
    $url = route('internal.cashless-entries.checkpoint', $batch->id);
    $this->withHeaders($headers)->postJson($url, $hold)->assertOk();
    $next = entryBatch(['TGNEW']);
    $nextClaim = entryClaim($next);

    $this->withHeaders($headers)->postJson($url, $hold)->assertOk()->assertJsonPath('data.status', 'UNKNOWN');
    $this->postJson($url, [...$hold, 'message' => 'Pesan berbeda'])->assertConflict();

    expect(DB::table('cashless_entry_lanes')->where('source', 'roberto')->value('active_batch_id'))->toBe($next->id);
    $this->assertDatabaseCount('cashless_entry_alerts', 1);
    entrySend($next, $nextClaim, 'heartbeat')->assertOk();
});

test('resolving a quarantined Orion rejection keeps a newer batch active and queues only untried resi', function () {
    $batch = entryBatch(['TEST', 'TGPENDING']);
    entryStart($batch, entryClaim($batch));
    $batch->items->first()->update(['status' => 'UNKNOWN', 'message' => 'Connote TEST sudah dientry di orion']);
    $batch->update(['status' => 'UNKNOWN', 'error_message' => 'Respons Hybrid belum dikenali: Connote TEST sudah dientry di orion']);
    $next = entryBatch(['TGNEW']);
    $nextClaim = entryClaim($next);

    $this->artisan('cashless:entries', ['--resolve-orion' => $batch->id, '--reason' => 'Klasifikasi penolakan sudah pasti'])->assertSuccessful();

    expect(DB::table('cashless_entry_lanes')->where('source', 'roberto')->value('active_batch_id'))->toBe($next->id);
    expect(CashlessEntryBatch::latest('id')->first()->items->pluck('awb')->all())->toBe(['TGPENDING']);
    entrySend($next, $nextClaim, 'heartbeat')->assertOk();
});

test('repeated checkpoints are idempotent but their payload cannot change', function () {
    $batch = entryBatch();
    $claim = entryClaim($batch);
    $event = entryEvent($batch, 'creating');
    $this->withHeaders([...entryHeaders(), 'X-Cashless-Claim' => $claim['claim_token']]);
    $url = route('internal.cashless-entries.checkpoint', $batch->id);
    $this->postJson($url, $event)->assertOk();
    $this->postJson($url, $event)->assertOk();
    $this->postJson($url, [...$event, 'type' => 'heartbeat'])->assertConflict();
    $this->assertDatabaseCount('cashless_entry_events', 1);
});

test('an expired reservation can be reclaimed only before New was attempted and the old token is fenced', function () {
    $batch = entryBatch(['TG1']);
    $oldClaim = entryClaim($batch);
    $this->travel(301)->seconds();
    $newClaim = entryClaim($batch);
    expect($newClaim['claim_token'])->not->toBe($oldClaim['claim_token']);
    entrySend($batch, $oldClaim, 'creating')->assertConflict();
    entrySend($batch, $newClaim, 'creating')->assertOk();
});

test('business failures are classified from their actual message and remain exceptions', function () {
    $batch = entryBatch(['TG1']);
    $claim = entryClaim($batch);
    entryStart($batch, $claim);
    $item = $batch->items->first();
    entrySend($batch, $claim, 'scan-start', ['item_id' => $item->id, 'awb' => $item->awb])->assertOk();
    entrySend($batch, $claim, 'scan-result', ['item_id' => $item->id, 'awb' => $item->awb, 'outcome' => 'ACCEPTED', 'message' => 'Connote TG1 tidak ditemukan.'])->assertUnprocessable();
    entrySend($batch, $claim, 'scan-result', ['item_id' => $item->id, 'awb' => $item->awb, 'outcome' => 'NOT_FOUND', 'message' => 'Connote TG1 tidak ditemukan.'])->assertOk();
    entrySend($batch, $claim, 'empty')->assertOk()->assertJsonPath('data.status', 'FAILED');
    expect($batch->fresh()->approved_at)->toBeNull();
});

test('an approved subset finishes with exceptions instead of claiming the entire batch succeeded', function () {
    $batch = entryBatch();
    $claim = entryClaim($batch);
    entryStart($batch, $claim);
    foreach ($batch->items as $index => $item) {
        entrySend($batch, $claim, 'scan-start', ['item_id' => $item->id, 'awb' => $item->awb])->assertOk();
        entrySend($batch, $claim, 'scan-result', ['item_id' => $item->id, 'awb' => $item->awb,
            'message' => $index === 0 ? 'Data connote berhasil disimpan' : 'Connote '.$item->awb.' tidak ditemukan.',
            'outcome' => $index === 0 ? 'ACCEPTED' : 'NOT_FOUND'])->assertOk();
    }
    entrySend($batch, $claim, 'approval-start', ['verified_awbs' => ['TG001']])->assertOk();
    entrySend($batch, $claim, 'approved', ['print_available' => true, 'approve_available' => false])->assertOk()->assertJsonPath('data.status', 'PARTIAL');
    $this->assertDatabaseCount('jne_shipments', 0);
});

test('operators can route legacy batches explicitly and cancel unclaimed work with an audit reason', function () {
    $batch = entryBatch();
    $batch->update(['source' => null, 'status' => 'WAITING_SOURCE']);
    $this->artisan('cashless:entries', ['--route' => $batch->id, '--source' => 'nuralamt'])->assertSuccessful();
    expect($batch->fresh()->source)->toBe('nuralamt')->and($batch->fresh()->status)->toBe('QUEUED');
    $this->artisan('cashless:entries', ['--cancel' => $batch->id, '--reason' => 'Typo sebelum input'])->assertSuccessful();
    expect($batch->fresh()->status)->toBe('CANCELLED')->and($batch->items()->where('status', 'PENDING')->count())->toBe(0);
    $this->assertDatabaseCount('cashless_entry_events', 2);
});

test('cashless correction cannot change an AWB while its batch is queued or active', function () {
    $batch = entryBatch(['TG1']);
    $task = PickupTask::findOrFail($batch->pickup_task_id);
    $task->update(['status' => 'PICKED_UP', 'execution_started_at' => now()]);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $item = $batch->items->first();
    $payload = ['awb' => 'TGCHANGED', 'evidence_id' => $item->pickup_cashless_awb_id, 'expected_version' => 1,
        'submission_key' => (string) Str::uuid(), 'reason' => 'Koreksi typo'];
    expect(fn () => app(RecordCashlessAwb::class)->handle($admin, $task->id, $payload, true))
        ->toThrow(HttpException::class);
    $this->assertDatabaseHas('pickup_cashless_awbs', ['id' => $item->pickup_cashless_awb_id, 'awb' => 'TG1']);
});

test('a retry creates a fresh batch for definitive failures without duplicating captured evidence or accepted resi', function () {
    $batch = entryBatch();
    $batch->update(['status' => 'PARTIAL']);
    $batch->items()->where('awb', 'TG001')->update(['status' => 'ACCEPTED']);
    $batch->items()->where('awb', 'CM002')->update(['status' => 'NOT_FOUND']);
    $retry = app(ManageCashlessEntryBatches::class)->retryFailures($batch->id, 'Data sudah tersedia di server');
    expect($retry->id)->toBeGreaterThan($batch->id)->and($retry->status)->toBe('QUEUED')
        ->and($retry->ho_number)->toBeNull()->and($retry->source)->toBe('roberto')
        ->and($retry->items->pluck('awb')->all())->toBe(['CM002']);
    $this->assertDatabaseCount('pickup_cashless_awbs', 2);
    $this->assertDatabaseCount('cashless_entry_items', 3);
    $this->assertDatabaseHas('cashless_entry_items', ['batch_id' => $batch->id, 'awb' => 'TG001', 'status' => 'ACCEPTED']);
    expect(fn () => app(ManageCashlessEntryBatches::class)->retryFailures($batch->id, 'Ulang lagi'))
        ->toThrow(HttpException::class);
    entryStart($retry, entryClaim($retry));
});

test('uncertain and previously entered resi cannot be blindly requeued', function (string $status) {
    $batch = entryBatch(['TG1']);
    $batch->update(['status' => $status === 'UNKNOWN' ? 'UNKNOWN' : 'FAILED']);
    $batch->items()->update(['status' => $status]);
    expect(fn () => app(ManageCashlessEntryBatches::class)->retryFailures($batch->id, 'Coba lagi'))
        ->toThrow(HttpException::class);
    $this->artisan('cashless:entries', ['--retry' => $batch->id, '--reason' => 'Coba lagi'])->assertFailed();
    $this->assertDatabaseCount('cashless_entry_batches', 1);
})->with(['UNKNOWN', 'PREVIOUSLY_ENTERED', 'ORION_REJECTED', 'ACCEPTED']);

test('an Orion rejection remains an exception while the next resi can be entered and approved', function () {
    $batch = entryBatch(['TEST', 'TG2']);
    $claim = entryClaim($batch);
    entryStart($batch, $claim);
    foreach ($batch->items as $index => $item) {
        entrySend($batch, $claim, 'scan-start', ['item_id' => $item->id, 'awb' => $item->awb])->assertOk();
        $evidence = ['item_id' => $item->id, 'awb' => $item->awb,
            'message' => $index === 0 ? 'Connote TEST sudah dientry di orion' : 'Data connote berhasil disimpan',
            'outcome' => $index === 0 ? 'ORION_REJECTED' : 'ACCEPTED'];
        if ($index === 0) {
            entrySend($batch, $claim, 'scan-result', [...$evidence, 'outcome' => 'ACCEPTED'])->assertUnprocessable();
            entrySend($batch, $claim, 'scan-result', [...$evidence, 'message' => 'Connote OTHER sudah dientry di orion'])->assertUnprocessable();
        }
        entrySend($batch, $claim, 'scan-result', $evidence)->assertOk();
    }
    entrySend($batch, $claim, 'approval-start', ['verified_awbs' => ['TEST', 'TG2']])->assertConflict();
    entrySend($batch, $claim, 'approval-start', ['verified_awbs' => ['TG2']])->assertOk();
    entrySend($batch, $claim, 'approved', ['print_available' => true, 'approve_available' => false])
        ->assertOk()->assertJsonPath('data.status', 'PARTIAL');
    $this->assertDatabaseHas('cashless_entry_items', ['batch_id' => $batch->id, 'awb' => 'TEST', 'status' => 'ORION_REJECTED']);
    expect($batch->fresh()->verification['awbs'])->toBe(['TG2']);
});

test('resolving a legacy Orion hold preserves its evidence and retries only unfinished resi in a fresh batch', function () {
    $batch = entryBatch(['TEST', 'TG2', 'TG3']);
    $claim = entryClaim($batch);
    entryStart($batch, $claim);
    $item = $batch->items->first();
    entrySend($batch, $claim, 'scan-start', ['item_id' => $item->id, 'awb' => $item->awb])->assertOk();
    $item->update(['status' => 'UNKNOWN', 'message' => 'Connote TEST sudah dientry di orion']);
    $batch->update(['status' => 'UNKNOWN', 'error_message' => 'Respons Hybrid belum dikenali: Connote TEST sudah dientry di orion']);

    $this->artisan('cashless:entries', ['--resolve-orion' => $batch->id, '--reason' => 'Klasifikasi respons diperbaiki'])->assertSuccessful();

    $this->assertDatabaseHas('cashless_entry_batches', ['id' => $batch->id, 'status' => 'FAILED', 'ho_number' => 'HO-015-TEST-'.$batch->id, 'approved_at' => null]);
    $this->assertDatabaseHas('cashless_entry_items', ['id' => $item->id, 'status' => 'ORION_REJECTED', 'message' => 'Connote TEST sudah dientry di orion']);
    $this->assertDatabaseHas('cashless_entry_events', ['batch_id' => $batch->id, 'type' => 'orion-rejection-resolved']);
    $next = CashlessEntryBatch::latest('id')->first();
    expect($next->items->pluck('awb')->all())->toBe(['TG2', 'TG3']);
    expect($next->ho_number)->toBeNull()->and($next->source)->toBe('roberto');
    $this->assertDatabaseCount('pickup_cashless_awbs', 3);
    entrySend($batch, $claim, 'heartbeat')->assertConflict();
    entryStart($next, entryClaim($next));
    $this->artisan('cashless:entries', ['--resolve-orion' => $batch->id, '--reason' => 'Ulang'])->assertFailed();
    $this->assertDatabaseCount('cashless_entry_batches', 2);
});

test('Orion recovery never releases a timeout mismatched reply accepted resi or approval attempt', function (string $condition) {
    $batch = entryBatch(['TEST', 'TG2']);
    $claim = entryClaim($batch);
    entryStart($batch, $claim);
    $batch->items->first()->update(['status' => 'UNKNOWN', 'message' => 'Connote TEST sudah dientry di orion']);
    $batch->update(['status' => 'UNKNOWN', 'error_message' => 'Respons Hybrid belum dikenali: Connote TEST sudah dientry di orion']);
    if ($condition === 'timeout') {
        $batch->update(['error_message' => 'Lease worker habis.']);
    } elseif ($condition === 'mismatch') {
        $batch->items->first()->update(['message' => 'Connote OTHER sudah dientry di orion']);
    } elseif ($condition === 'accepted') {
        $batch->items->last()->update(['status' => 'ACCEPTED']);
    } else {
        $batch->update(['verification' => ['awbs' => ['TG2']]]);
    }

    $this->artisan('cashless:entries', ['--resolve-orion' => $batch->id, '--reason' => 'Periksa hasil'])->assertFailed();

    expect($batch->fresh()->status)->toBe('UNKNOWN');
    expect(DB::table('cashless_entry_lanes')->where('source', 'roberto')->value('active_batch_id'))->toBe($batch->id);
    $this->assertDatabaseCount('cashless_entry_batches', 1);
})->with(['timeout', 'mismatch', 'accepted', 'approval']);

test('an Orion hold with no remaining resi closes without creating another batch or approval', function () {
    $batch = entryBatch(['TEST']);
    entryStart($batch, entryClaim($batch));
    $batch->items->first()->update(['status' => 'UNKNOWN', 'message' => 'Connote TEST sudah dientry di orion']);
    $batch->update(['status' => 'UNKNOWN', 'error_message' => 'Respons Hybrid belum dikenali: Connote TEST sudah dientry di orion']);

    $this->artisan('cashless:entries', ['--resolve-orion' => $batch->id, '--reason' => 'Klasifikasi diperbaiki'])->assertSuccessful();

    $this->assertDatabaseHas('cashless_entry_batches', ['id' => $batch->id, 'status' => 'FAILED', 'approved_at' => null]);
    $this->assertDatabaseCount('cashless_entry_batches', 1);
    expect(DB::table('cashless_entry_lanes')->where('source', 'roberto')->value('active_batch_id'))->toBeNull();
});

test('a changed pending AWB rolls back Orion recovery instead of silently replaying modified evidence', function () {
    $batch = entryBatch(['TEST', 'TG2']);
    entryStart($batch, entryClaim($batch));
    $batch->items->first()->update(['status' => 'UNKNOWN', 'message' => 'Connote TEST sudah dientry di orion']);
    $batch->update(['status' => 'UNKNOWN', 'error_message' => 'Respons Hybrid belum dikenali: Connote TEST sudah dientry di orion']);
    PickupCashlessAwb::whereKey($batch->items->last()->pickup_cashless_awb_id)->update(['awb' => 'TGCHANGED']);

    $this->artisan('cashless:entries', ['--resolve-orion' => $batch->id, '--reason' => 'Klasifikasi diperbaiki'])->assertFailed();

    expect($batch->fresh()->status)->toBe('UNKNOWN');
    $this->assertDatabaseHas('cashless_entry_items', ['batch_id' => $batch->id, 'awb' => 'TG2', 'status' => 'PENDING']);
    $this->assertDatabaseCount('cashless_entry_batches', 1);
    expect(DB::table('cashless_entry_lanes')->where('source', 'roberto')->value('active_batch_id'))->toBe($batch->id);
});
