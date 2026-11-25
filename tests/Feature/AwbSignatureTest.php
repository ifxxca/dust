<?php

use App\Actions\Pickup\QueryCashlessScanProgress;
use App\Actions\Pickup\ValidateAwbSignature;
use App\Models\CashlessEntryBatch;
use App\Models\PickupCashlessAwb;
use App\Models\PickupCashlessAwbEvent;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

function signatureBook(): array
{
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $task = PickupTask::factory()->create(['assigned_staff_id' => $staff->id, 'status' => 'PICKED_UP']);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'staff_id' => $staff->id]);
    $token = $staff->createToken('mobile:'.Str::uuid().':Android', ['mobile:read', 'mobile:handover'], now()->addDay());

    return [$staff, $task, $token];
}

test('signature matching enforces exact characters length digits hyphens and dollar literals', function (string $awb, array $expected) {
    expect(app(ValidateAwbSignature::class)->matches($awb))->toBe($expected);
})->with([
    ['AKJNE12345678', ['AKJNE########']],
    ['JNAC-3064401124', ['JNAC-##########']], ['JNAC-3064401235', ['JNAC-##########']],
    ['JNAC3064401124', []], ['JNAC-306440112', []], ['JNAC-30644011245', []], ['JNAC-306440112X', []],
    ['AKJNE1234567', []], ['AKJNE123456789', []], ['AKJNE1234567X', []],
    ['BSC-123456789012', ['BSC-############']], ['BSC123456789012', []],
    ['$333260100123456', ['$333260100######']],
    ['RMA911008', ['RMA911008']], ['RMA9110089', []], ['rma911008', []],
    ['QR:TG1234567890', []], ['SKU260', []],
    ['BLIJC04501234567', ['BLIJC0450#######', 'BLIJC###########']],
]);

test('all supplied signatures match concrete values without being silently rewritten', function () {
    $signatures = config('pickup.awb_signatures');
    expect($signatures)->toHaveCount(155);
    foreach ($signatures as $signature) {
        expect(app(ValidateAwbSignature::class)->matches(str_replace('#', '0', $signature)))->toContain($signature);
    }
});

test('mobile accepts JNAC cashless and preserves the hyphen in stored AWBs', function () {
    [, $task, $token] = signatureBook();
    $this->withToken($token->plainTextToken)->postJson(route('mobile.cashless-handover.store', $task),
        ['submission_key' => (string) Str::uuid(), 'awbs' => ['JNAC-3064401124', 'JNAC-3064401235']])
        ->assertOk()->assertJsonPath('data.saved', 2);
    expect(PickupCashlessAwb::orderBy('id')->pluck('awb')->all())->toBe(['JNAC-3064401124', 'JNAC-3064401235']);
});

test('mobile records one overlapping AWB with every match in its existing audit evidence and replays after configuration changes', function () {
    [, $task, $token] = signatureBook();
    $body = ['submission_key' => (string) Str::uuid(), 'awbs' => ['BLIJC04501234567', '$333260100123456']];
    $this->withToken($token->plainTextToken)->postJson(route('mobile.cashless-handover.store', $task), $body)
        ->assertOk()->assertJsonPath('data.saved', 2);
    expect(PickupCashlessAwbEvent::first()->affected_results['signature_matches'])->toBe(['BLIJC0450#######', 'BLIJC###########']);
    config(['pickup.awb_signatures' => []]);
    $this->postJson(route('mobile.cashless-handover.store', $task), $body)->assertOk()->assertJsonPath('data.stored_count', 2);
    $this->assertDatabaseCount('pickup_cashless_awbs', 2);
    $this->assertDatabaseCount('cashless_entry_batches', 1);
});

test('mobile cannot bypass signature validation or strip meaningful raw characters', function (string $awb) {
    [, $task, $token] = signatureBook();
    $this->withToken($token->plainTextToken)->postJson(route('mobile.cashless-handover.store', $task),
        ['submission_key' => (string) Str::uuid(), 'awbs' => [$awb]])->assertUnprocessable()->assertJsonValidationErrors('awbs.0');
    $this->assertDatabaseCount('pickup_cashless_awbs', 0);
    $this->assertDatabaseCount('cashless_entry_batches', 0);
})->with(['SKU123456789', "\0TG1234567890", "TG1234567890\0", "\u{00a0}TG1234567890"]);

test('single AWB capture endpoint applies the same signature rule', function () {
    [$staff, $task] = signatureBook();
    $task->proof()->delete();
    $task->update(['status' => 'ASSIGNED', 'execution_started_at' => now()]);
    $this->actingAs($staff)->postJson(route('api.cashless-awbs.store', $task), ['submission_key' => (string) Str::uuid(), 'awb' => 'SKU123456789'])
        ->assertUnprocessable()->assertJsonValidationErrors('awb')->assertJsonPath('errors.awb.0', 'Format resi tidak dikenali.');
    $this->postJson(route('api.cashless-awbs.store', $task), ['submission_key' => (string) Str::uuid(), 'awb' => '010112345678901'])
        ->assertUnprocessable()->assertJsonPath('errors.awb.0', 'Resi ini termasuk Manual. Gunakan resi Cashless.');
    $this->assertDatabaseCount('pickup_cashless_awbs', 0);
});

test('POP capture cannot create unsupported AWBs or external work', function () {
    Storage::fake('local');
    [$staff, $task] = signatureBook();
    $task->proof()->delete();
    $task->update(['status' => 'ASSIGNED', 'execution_started_at' => now()]);
    $task->visits()->create(['staff_id' => $staff->id, 'started_at' => now(), 'recorded_at' => now(), 'outcome' => 'COLLECTED']);
    $this->actingAs($staff)->postJson(route('api.tasks.proof', $task), [
        'submission_key' => (string) Str::uuid(), 'expected_version' => $task->version,
        'manual_hybrid' => 0, 'cashless_hybrid' => 1, 'css_orion' => 0,
        'cashless_capture' => 1, 'cashless_awbs' => ['SKU123456789'], 'signature' => UploadedFile::fake()->image('signature.png'),
    ])->assertUnprocessable()->assertJsonValidationErrors('cashless_awbs');
    $this->assertDatabaseCount('pickup_cashless_awbs', 0);
    $this->assertDatabaseCount('pickup_records', 0);
    $this->assertDatabaseCount('cashless_entry_batches', 0);
    expect(Storage::disk('local')->allFiles())->toBe([]);
});

test('correction endpoint rejects unsupported replacements without changing historical evidence', function () {
    [$staff, $task] = signatureBook();
    $record = PickupCashlessAwb::factory()->create(['pickup_task_id' => $task->id, 'awb' => 'OLD-HISTORICAL', 'version' => 1]);
    $batch = CashlessEntryBatch::factory()->create(['pickup_task_id' => $task->id, 'created_by' => $staff->id, 'status' => 'FAILED', 'source' => 'roberto']);
    $item = $batch->items()->create(['pickup_cashless_awb_id' => $record->id, 'awb' => $record->awb, 'status' => 'NOT_FOUND']);
    $this->actingAs($staff)->postJson(route('cashless-results.correct', [$batch, $item]), [
        'submission_key' => (string) Str::uuid(), 'expected_version' => $record->version, 'awb' => 'SKU123456789',
    ])->assertUnprocessable()->assertJsonValidationErrors('awb');
    expect($record->fresh()->awb)->toBe('OLD-HISTORICAL');
    $this->assertDatabaseCount('cashless_entry_batches', 1);
});

test('progress counts latest attempts once and requires approval evidence before reporting success', function () {
    [, $task, $token] = signatureBook();
    $approved = CashlessEntryBatch::factory()->create(['pickup_task_id' => $task->id, 'status' => 'DONE', 'approved_at' => now()]);
    $queued = CashlessEntryBatch::factory()->create(['pickup_task_id' => $task->id, 'status' => 'QUEUED', 'approved_at' => null]);
    $failed = CashlessEntryBatch::factory()->create(['pickup_task_id' => $task->id, 'status' => 'FAILED', 'approved_at' => null]);
    foreach (['success', 'pending', 'retrying', 'failed', 'stored'] as $index => $state) {
        $record = PickupCashlessAwb::factory()->create(['pickup_task_id' => $task->id, 'customer_id' => $task->customer_id, 'awb' => 'TG'.str_pad((string) $index, 10, '0', STR_PAD_LEFT)]);
        if ($state === 'stored') {
            continue;
        }
        if ($state === 'retrying') {
            $failed->items()->create(['pickup_cashless_awb_id' => $record->id, 'awb' => $record->awb, 'status' => 'NOT_FOUND']);
        }
        $batch = $state === 'success' ? $approved : ($state === 'failed' ? $failed : $queued);
        $batch->items()->create(['pickup_cashless_awb_id' => $record->id, 'awb' => $record->awb, 'status' => $state === 'retrying' ? 'PENDING' : ($state === 'failed' ? 'NOT_FOUND' : 'ACCEPTED')]);
    }
    $expected = ['total' => 5, 'success' => 1, 'pending' => 2, 'retrying' => 1, 'failed' => 1, 'attention' => 0];
    expect(app(QueryCashlessScanProgress::class)->handle($task->id)['summary'])->toBe($expected);
    $this->withToken($token->plainTextToken)->getJson(route('mobile.cashless-handover.index', ['task' => $task->id]))
        ->assertOk()->assertJsonPath('selected.scan_progress.summary', $expected);
});
