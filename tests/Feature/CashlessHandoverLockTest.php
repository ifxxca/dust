<?php

use App\Actions\Handover\CashlessHandoverReadiness;
use App\Actions\Handover\CreateSession;
use App\Models\CashlessEntryBatch;
use App\Models\HandoverSession;
use App\Models\PickupCashlessAwb;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

beforeEach(function () {
    config(['pickup.cashless_entry.handover_lock' => true]);
});

function cashlessLockTask(User $actor, int $count = 1): PickupTask
{
    $task = PickupTask::factory()->create(['assigned_staff_id' => $actor->id, 'status' => 'PICKED_UP']);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'staff_id' => $actor->id, 'manual_hybrid' => 2, 'cashless_hybrid' => $count, 'css_orion' => 0]);

    return $task;
}

function cashlessLockAttempt(PickupTask $task, string $status = 'ACCEPTED', string $batchStatus = 'DONE', bool $approved = true, ?PickupCashlessAwb $record = null): array
{
    $record ??= PickupCashlessAwb::factory()->create(['pickup_task_id' => $task->id, 'customer_id' => $task->customer_id, 'created_by' => $task->assigned_staff_id]);
    $batch = CashlessEntryBatch::factory()->create(['pickup_task_id' => $task->id, 'created_by' => $task->assigned_staff_id, 'status' => $batchStatus, 'approved_at' => $approved ? now() : null]);
    $item = $batch->items()->create(['pickup_cashless_awb_id' => $record->id, 'awb' => $record->awb, 'status' => $status]);

    return [$record, $batch, $item];
}

function cashlessLockLogin(string $platform, User $actor): void
{
    if ($platform === 'mobile') {
        test()->withToken($actor->createToken('mobile:'.Str::uuid().':Android', ['mobile:read', 'mobile:handover'], now()->addDay())->plainTextToken);
    } else {
        test()->actingAs($actor);
    }
}

test('handover rejects every unfinished cashless state atomically on web and mobile', function (string $platform, string $status, string $batchStatus, bool $approved) {
    $actor = User::factory()->create(['role' => 'admin_supervisor']);
    $ready = cashlessLockTask($actor, 0);
    $blocked = cashlessLockTask($actor);
    cashlessLockAttempt($blocked, $status, $batchStatus, $approved);
    cashlessLockLogin($platform, $actor);

    $this->postJson(route($platform.'.handovers.store'), ['submission_key' => (string) Str::uuid(), 'task_ids' => [$ready->id, $blocked->id]])
        ->assertConflict()->assertJsonPath('message', fn (string $message): bool => str_contains($message, 'HANDOVER_CASHLESS_BLOCKED') && str_contains($message, 'PCK-'.$blocked->id));
    $this->assertDatabaseCount('handover_sessions', 0);
    $this->assertDatabaseCount('handover_items', 0);
    $this->assertDatabaseCount('handover_events', 0);
})->with(['api', 'mobile'])->with([
    'queued' => ['PENDING', 'QUEUED', false],
    'waiting account' => ['PENDING', 'WAITING_ACCOUNT', false],
    'entering' => ['IN_FLIGHT', 'ENTERING', false],
    'unknown' => ['UNKNOWN', 'UNKNOWN', false],
    'rejected' => ['ORION_REJECTED', 'FAILED', false],
    'not found' => ['NOT_FOUND', 'PARTIAL', true],
    'previously entered' => ['PREVIOUSLY_ENTERED', 'PARTIAL', true],
    'unapproved' => ['ACCEPTED', 'APPROVING', false],
    'missing approval evidence' => ['ACCEPTED', 'DONE', false],
]);

test('approved latest cashless attempts permit handover for every operational role', function (string $platform, string $role) {
    $actor = User::factory()->create(['role' => $role]);
    $task = cashlessLockTask($actor, 2);
    cashlessLockAttempt($task);
    cashlessLockAttempt($task, batchStatus: 'PARTIAL');
    cashlessLockLogin($platform, $actor);

    $created = $this->postJson(route($platform.'.handovers.store'), ['submission_key' => (string) Str::uuid(), 'task_ids' => [$task->id]])
        ->assertCreated()->assertJsonPath('data.items.0.cashless_readiness.ready', true)->assertJsonPath('data.items.0.cashless_readiness.success', 2);
    $sessionId = $created->json('data.id');
    $this->postJson(route($platform.'.handovers.verify', [$sessionId, $created->json('data.items.0.id')]), ['expected_version' => 1, 'manual_hybrid' => 2, 'cashless_hybrid' => 2, 'css_orion' => 0])->assertOk()->assertJsonPath('data.can_close', true);
    $this->postJson(route($platform.'.handovers.close', $sessionId), ['expected_version' => 2])->assertOk()->assertJsonPath('data.status', 'CLOSED');
    $this->assertDatabaseCount('handover_items', 1);
})->with(['api', 'mobile'])->with(['pickup_staff', 'retail_staff', 'admin_supervisor']);

test('the scan count must match effective POP including revisions', function (string $condition) {
    $actor = User::factory()->create(['role' => 'pickup_staff']);
    $task = cashlessLockTask($actor, $condition === 'stray scan' ? 0 : 1);
    if ($condition !== 'missing scan') {
        cashlessLockAttempt($task);
    }
    if ($condition === 'revised POP') {
        $task->proof->revisions()->create(['revision' => 1, 'actor_id' => $actor->id, 'reason' => 'Tambah paket', 'values' => ['cashless_hybrid' => 2]]);
    }
    $this->actingAs($actor)->postJson(route('api.handovers.store'), ['submission_key' => (string) Str::uuid(), 'task_ids' => [$task->id]])->assertConflict();
    $this->assertDatabaseCount('handover_sessions', 0);
})->with(['missing scan', 'stray scan', 'revised POP']);

test('only the latest attempt for the current AWB and matching pickup customer can unlock handover', function (string $condition) {
    $actor = User::factory()->create(['role' => 'pickup_staff']);
    $task = cashlessLockTask($actor);
    [$record, $batch] = cashlessLockAttempt($task);
    match ($condition) {
        'newer failure' => cashlessLockAttempt($task, 'NOT_FOUND', 'FAILED', false, $record),
        'corrected AWB' => $record->update(['awb' => 'CM99999900901']),
        'wrong pickup' => $batch->update(['pickup_task_id' => cashlessLockTask($actor)->id]),
        'wrong customer' => $record->update(['customer_id' => cashlessLockTask($actor)->customer_id]),
    };
    $this->actingAs($actor)->postJson(route('api.handovers.store'), ['submission_key' => (string) Str::uuid(), 'task_ids' => [$task->id]])->assertConflict();
})->with(['newer failure', 'corrected AWB', 'wrong pickup', 'wrong customer']);

test('correcting a failed resi unlocks automatically only after its replacement is accepted and approved', function () {
    $actor = User::factory()->create(['role' => 'pickup_staff']);
    $task = cashlessLockTask($actor, 2);
    cashlessLockAttempt($task, batchStatus: 'PARTIAL');
    [$record, $failed, $item] = cashlessLockAttempt($task, 'NOT_FOUND', 'PARTIAL');
    $key = (string) Str::uuid();
    $body = ['submission_key' => $key, 'task_ids' => [$task->id]];
    $this->actingAs($actor)->postJson(route('api.handovers.store'), $body)->assertConflict();
    $response = $this->postJson(route('cashless-results.correct', [$failed, $item->id]), ['submission_key' => (string) Str::uuid(), 'expected_version' => 1, 'awb' => 'CM99999900902'])->assertOk();
    $replacement = CashlessEntryBatch::findOrFail($response->json('batch_id'));
    $this->postJson(route('api.handovers.store'), $body)->assertConflict();
    $replacement->items()->update(['status' => 'ACCEPTED']);
    $replacement->update(['status' => 'APPROVING']);
    $this->postJson(route('api.handovers.store'), $body)->assertConflict();
    $replacement->update(['status' => 'DONE', 'approved_at' => now()]);
    $this->postJson(route('api.handovers.store'), $body)->assertCreated()->assertJsonPath('data.items.0.cashless_readiness.success', 2);
    expect($record->fresh()->awb)->toBe('CM99999900902')->and($item->fresh()->status)->toBe('NOT_FOUND');
});

test('noncashless pickup remains available and blocked candidates expose their reason on both platforms', function (string $platform) {
    $actor = User::factory()->create(['role' => 'pickup_staff']);
    $ready = cashlessLockTask($actor, 0);
    $blocked = cashlessLockTask($actor);
    cashlessLockLogin($platform, $actor);
    $this->getJson(route($platform.'.handovers.candidates'))->assertOk()->assertJsonPath('data.0.cashless_readiness.ready', true)->assertJsonPath('data.1.cashless_readiness.ready', false)->assertJsonPath('data.1.cashless_readiness.expected', 1)->assertJsonPath('data.1.cashless_readiness.scanned', 0);
    $this->postJson(route($platform.'.handovers.store'), ['submission_key' => (string) Str::uuid(), 'task_ids' => [$ready->id]])->assertCreated();
})->with(['api', 'mobile']);

test('draft membership cannot add a blocked pickup but can remove an existing blocked member', function () {
    $actor = User::factory()->create(['role' => 'admin_supervisor']);
    $ready = cashlessLockTask($actor, 0);
    $blocked = cashlessLockTask($actor);
    $session = app(CreateSession::class)->handle($actor, [$ready->id], (string) Str::uuid());
    $this->actingAs($actor)->patchJson(route('api.handovers.amend', $session), ['expected_version' => 1, 'reason' => 'Tambah pickup', 'task_ids' => [$ready->id, $blocked->id]])->assertConflict();
    expect($session->fresh()->version)->toBe(1)->and($session->items()->count())->toBe(1);
    $session->items()->create(['pickup_task_id' => $blocked->id, 'pickup_record_id' => $blocked->proof->id]);
    $this->patchJson(route('api.handovers.amend', $session), ['expected_version' => 1, 'reason' => 'Keluarkan pickup tertahan', 'task_ids' => [$ready->id]])->assertOk()->assertJsonCount(1, 'data.items');
});

test('existing open sessions cannot bypass cashless lock through verification correction or closure', function (string $platform) {
    $actor = User::factory()->create(['role' => 'admin_supervisor']);
    $task = cashlessLockTask($actor);
    $session = HandoverSession::factory()->create(['created_by' => $actor->id]);
    $item = $session->items()->create(['pickup_task_id' => $task->id, 'pickup_record_id' => $task->proof->id]);
    cashlessLockLogin($platform, $actor);
    $quantities = ['expected_version' => 1, 'manual_hybrid' => 2, 'cashless_hybrid' => 1, 'css_orion' => 0];
    $this->postJson(route($platform.'.handovers.verify', [$session, $item->id]), $quantities)->assertConflict()->assertJsonPath('message', fn (string $message): bool => str_contains($message, 'HANDOVER_CASHLESS_BLOCKED'));
    expect($item->fresh()->status)->toBe('PENDING');
    $item->update(['status' => 'VERIFIED', 'verified_pickup_revision' => 0, 'manual_hybrid' => 2, 'cashless_hybrid' => 1, 'css_orion' => 0]);
    $session->update(['status' => 'IN_VERIFICATION']);
    $this->getJson(route($platform.'.handovers.show', $session))->assertOk()->assertJsonPath('data.can_close', false)->assertJsonPath('data.items.0.cashless_readiness.ready', false);
    $this->getJson(route($platform.'.handovers.index'))->assertOk()->assertJsonPath('data.0.can_close', false);
    $this->postJson(route($platform.'.handovers.close', $session), ['expected_version' => 1])->assertConflict();
    if ($platform === 'api') {
        $this->postJson(route('api.handovers.correct', [$session, $item->id]), [...$quantities, 'reason' => 'Periksa ulang'])->assertConflict();
    }
    expect($session->fresh()->status)->toBe('IN_VERIFICATION')->and($session->fresh()->version)->toBe(1);
    $this->assertDatabaseCount('handover_events', 0);
    $this->assertDatabaseCount('handover_item_revisions', 0);
})->with(['api', 'mobile']);

test('historical closed handovers stay readable and idempotent without retroactive validation', function () {
    $actor = User::factory()->create(['role' => 'admin_supervisor']);
    $task = cashlessLockTask($actor);
    $session = HandoverSession::factory()->create(['created_by' => $actor->id, 'status' => 'CLOSED', 'closed_at' => now()]);
    $session->items()->create(['pickup_task_id' => $task->id, 'pickup_record_id' => $task->proof->id]);
    $before = $session->fresh()->getAttributes();
    $this->actingAs($actor)->getJson(route('api.handovers.show', $session))->assertOk()->assertJsonPath('data.status', 'CLOSED')->assertJsonPath('data.items.0.cashless_readiness', null);
    $this->postJson(route('api.handovers.close', $session), ['expected_version' => 1])->assertOk();
    $this->postJson(route('api.handovers.store'), ['submission_key' => $session->submission_key, 'task_ids' => [$task->id]])->assertOk()->assertJsonPath('data.id', $session->id);
    expect($session->fresh()->getAttributes())->toBe($before);
    $this->assertDatabaseCount('handover_events', 0);
});

test('bulk readiness has constant query growth', function () {
    $actor = User::factory()->create(['role' => 'pickup_staff']);
    $tasks = new Collection;
    for ($index = 0; $index < 20; $index++) {
        $task = cashlessLockTask($actor);
        cashlessLockAttempt($task);
        $tasks->push($task);
    }
    DB::enableQueryLog();
    DB::flushQueryLog();
    try {
        $readiness = app(CashlessHandoverReadiness::class)->handle($tasks);
        $queries = count(DB::getQueryLog());
    } finally {
        DB::disableQueryLog();
    }
    expect($readiness)->toHaveCount(20)->and(array_column($readiness, 'ready'))->not->toContain(false)->and($queries)->toBeLessThanOrEqual(4);
});
