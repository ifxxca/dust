<?php

use App\Models\HandoverSession;
use App\Models\PickupCashlessAwb;
use App\Models\PickupProcessingReconciliation;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Support\Str;

function mobileCashlessBook(array $abilities = ['mobile:read', 'mobile:handover']): array
{
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $task = PickupTask::factory()->create(['assigned_staff_id' => $staff->id, 'status' => 'PICKED_UP']);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'staff_id' => $staff->id, 'cashless_hybrid' => 2]);
    $token = $staff->createToken('mobile:'.Str::uuid().':Android', $abilities, now()->addDay());

    return [$staff, $task, $token];
}

test('mobile cashless saves the same audited evidence visible on the web without redirects or duplicate retries', function () {
    [$staff, $task, $token] = mobileCashlessBook();
    $data = ['submission_key' => (string) Str::uuid(), 'awbs' => ['TGANDROID001', 'CMANDROID002']];
    $this->withToken($token->plainTextToken)->getJson(route('mobile.cashless-handover.index', ['task' => $task->id]))
        ->assertOk()->assertHeader('Cache-Control', 'no-store, private')->assertJsonPath('selected.can_record', true)->assertJsonPath('selected.target', 2);
    $this->postJson(route('mobile.cashless-handover.store', $task), $data)->assertOk()
        ->assertJsonPath('data.pickup_task_id', $task->id)->assertJsonPath('data.saved', 2)->assertJsonPath('data.stored_count', 2);
    $this->postJson(route('mobile.cashless-handover.store', $task), $data)->assertOk()->assertJsonPath('data.stored_count', 2);
    $this->assertDatabaseCount('pickup_cashless_awbs', 2);
    $this->assertDatabaseCount('pickup_cashless_awb_events', 2);
    $this->assertDatabaseCount('jne_shipments', 0);
    $this->getJson(route('mobile.cashless-handover.index', ['task' => $task->id]))->assertOk()->assertJsonPath('selected.awbs.total', 2);
    app('auth')->forgetGuards();
    $this->withHeader('Authorization', '')->actingAs($staff, 'web')->getJson(route('api.cashless-awbs.index', $task))
        ->assertOk()->assertJsonPath('meta.total', 2)->assertJsonPath('reconciliation.identified_awbs', 2);
});

test('mobile readonly tokens can read their own book but cannot submit cashless handover', function () {
    [$staff, $task, $token] = mobileCashlessBook(['mobile:read']);
    $this->withToken($token->plainTextToken)->getJson(route('mobile.cashless-handover.index', ['task' => $task->id]))->assertOk()->assertJsonPath('selected.can_record', false);
    $this->postJson(route('mobile.cashless-handover.store', $task), ['submission_key' => (string) Str::uuid(), 'awbs' => ['TG001']])->assertForbidden();
    $this->assertDatabaseCount('pickup_cashless_awbs', 0);
});

test('mobile cashless requires a mobile token and isolates pickup ownership', function () {
    [$staff, $task, $token] = mobileCashlessBook();
    [, $other] = mobileCashlessBook();
    $this->getJson(route('mobile.cashless-handover.index'))->assertUnauthorized();
    $this->withToken($token->plainTextToken)->getJson(route('mobile.cashless-handover.index'))
        ->assertOk()->assertJsonCount(1, 'tasks.data')->assertJsonPath('tasks.data.0.id', $task->id);
    $this->getJson(route('mobile.cashless-handover.index', ['task' => $other->id]))->assertNotFound();
    $this->postJson(route('mobile.cashless-handover.store', $other), ['submission_key' => (string) Str::uuid(), 'awbs' => ['TG001']])->assertForbidden();
    $this->assertDatabaseCount('pickup_cashless_awbs', 0);
    app('auth')->forgetGuards();
    $webToken = $staff->createToken('web-tool', ['mobile:read', 'mobile:handover']);
    $this->withToken($webToken->plainTextToken)->getJson(route('mobile.cashless-handover.index'))->assertUnauthorized();
});

test('mobile rejects invalid resi and cannot add to a locked pickup', function () {
    [$staff, $task, $token] = mobileCashlessBook();
    $this->withToken($token->plainTextToken)->postJson(route('mobile.cashless-handover.store', $task), ['submission_key' => (string) Str::uuid(), 'awbs' => ['0101500123456']])
        ->assertUnprocessable()->assertJsonValidationErrors('awbs.0');
    PickupProcessingReconciliation::factory()->create(['pickup_task_id' => $task->id, 'status' => 'DONE', 'locked_at' => now()]);
    $this->postJson(route('mobile.cashless-handover.store', $task), ['submission_key' => (string) Str::uuid(), 'awbs' => ['TG001']])->assertForbidden();
    $this->assertDatabaseCount('pickup_cashless_awbs', 0);
});

test('web and mobile share the same unique AWB claim', function () {
    [$staff, $task, $token] = mobileCashlessBook();
    PickupCashlessAwb::factory()->create(['awb' => 'TGTAKEN']);
    $this->withToken($token->plainTextToken)->postJson(route('mobile.cashless-handover.store', $task), ['submission_key' => (string) Str::uuid(), 'awbs' => ['TGNEW', 'TGTAKEN']])
        ->assertUnprocessable()->assertJsonValidationErrors('awbs');
    $this->assertDatabaseCount('pickup_cashless_awbs', 1);
});

test('mobile can confirm an identical committed batch after locking without changing finalized data', function (string $closure) {
    [$staff, $task, $token] = mobileCashlessBook();
    $data = ['submission_key' => (string) Str::uuid(), 'awbs' => ['TGRECOVER1', 'TGRECOVER2']];
    $this->withToken($token->plainTextToken)->postJson(route('mobile.cashless-handover.store', $task), $data)->assertOk();
    if ($closure === 'reconciliation') {
        $locked = PickupProcessingReconciliation::factory()->create(['pickup_task_id' => $task->id, 'status' => 'DONE', 'locked_at' => now()]);
    } else {
        $locked = HandoverSession::factory()->create(['status' => 'CLOSED', 'sertim_closed_at' => now()]);
        $locked->items()->create(['pickup_task_id' => $task->id, 'pickup_record_id' => $task->proof->id]);
    }
    $before = $locked->fresh()->getAttributes();
    $this->getJson(route('mobile.cashless-handover.index', ['task' => $task->id]))->assertOk()->assertJsonPath('selected.can_record', false);
    $this->postJson(route('mobile.cashless-handover.store', $task), $data)->assertOk()->assertJsonPath('data.stored_count', 2);
    $this->postJson(route('mobile.cashless-handover.store', $task), [...$data, 'awbs' => ['TGNEW']])->assertForbidden();
    $this->assertDatabaseCount('pickup_cashless_awbs', 2);
    $this->assertDatabaseCount('pickup_cashless_awb_events', 2);
    expect($locked->fresh()->getAttributes())->toBe($before);
})->with(['reconciliation', 'handover']);
