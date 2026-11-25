<?php

use App\Actions\Pickup\ManageCashlessEntryBatches;
use App\Models\CashlessEntryBatch;
use App\Models\PickupCashlessAwb;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

beforeEach(function () {
    config(['pickup.cashless_entry.enabled' => true, 'pickup.cashless_entry.per_user_accounts' => true,
        'jne-reports.worker_token' => str_repeat('t', 40)]);
});

function personalHybridUser(string $username): User
{
    $user = User::factory()->create(['role' => 'pickup_staff', 'is_active' => true]);
    $user->forceFill(['hybrid_username' => $username, 'hybrid_password' => 'sensitive-password',
        'hybrid_account_key' => hash('sha256', 'nuralamt:'.$username), 'hybrid_credential_version' => 1])->save();

    return $user;
}

function personalCashlessBatch(User $owner, string $status = 'QUEUED'): CashlessEntryBatch
{
    return CashlessEntryBatch::factory()->create(['source' => 'roberto', 'created_by' => $owner->id, 'hybrid_user_id' => $owner->id, 'status' => $status]);
}

function personalWorkerHeaders(int $slot = 1): array
{
    return ['Authorization' => 'Bearer '.str_repeat('t', 40), 'X-Worker-ID' => 'cashless-roberto-'.$slot];
}

test('only an admin can configure encrypted staff credentials without returning or sharing the password', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $this->actingAs($staff)->patchJson(route('api.users.hybrid', $staff), ['hybrid_username' => 'staff-one', 'hybrid_password' => '  secret  '])->assertForbidden();

    $response = $this->actingAs($admin)->patchJson(route('api.users.hybrid', $staff), ['hybrid_username' => 'Staff-One', 'hybrid_password' => '  secret  '])->assertOk()
        ->assertJsonPath('data.hybrid_username', 'Staff-One')->assertJsonMissingPath('data.hybrid_password');

    expect($staff->fresh()->hybrid_password)->toBe('  secret  ');
    expect(DB::table('users')->where('id', $staff->id)->value('hybrid_password'))->not->toContain('secret');
    expect($staff->fresh()->toArray())->not->toHaveKeys(['hybrid_password', 'hybrid_account_key', 'hybrid_username']);
    $this->getJson(route('api.users.index'))->assertOk()->assertJsonMissingPath('data.0.hybrid_password');
    expect($response->getContent())->not->toContain('secret');
});

test('two staff cannot register the same Hybrid login and an empty password preserves the current one', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $first = personalHybridUser('same-login');
    $second = User::factory()->create(['role' => 'pickup_staff']);

    $this->actingAs($admin)->patchJson(route('api.users.hybrid', $second), ['hybrid_username' => 'SAME-LOGIN', 'hybrid_password' => 'secret'])->assertUnprocessable()->assertJsonValidationErrors('hybrid_username');
    $this->patchJson(route('api.users.hybrid', $first), ['hybrid_username' => 'same-login', 'hybrid_password' => ''])->assertOk();

    expect($first->fresh()->hybrid_password)->toBe('sensitive-password');
    expect($second->fresh()->hybrid_password)->toBeNull();
});

test('five distinct accounts run concurrently while the sixth and another job for a busy account wait', function () {
    $manager = app(ManageCashlessEntryBatches::class);
    $first = personalHybridUser('staff-1');
    $firstBatch = personalCashlessBatch($first);
    $secondForFirst = personalCashlessBatch($first);
    $batches = [$firstBatch];
    foreach (range(2, 6) as $number) {
        $batches[] = personalCashlessBatch(personalHybridUser('staff-'.$number));
    }
    foreach (range(1, 5) as $slot) {
        $claim = $manager->claim('roberto', 'cashless-roberto-'.$slot, (string) Str::uuid());
        expect($claim->id)->toBe($batches[$slot - 1]->id);
    }
    expect($manager->claim('roberto', 'cashless-roberto-1', (string) Str::uuid()))->toBeNull();
    expect($secondForFirst->fresh()->status)->toBe('QUEUED');
    expect($batches[5]->fresh()->status)->toBe('QUEUED');
    $manager->checkpoint($firstBatch->id, 'roberto', 'cashless-roberto-1', $manager->token($firstBatch->fresh()), ['event_key' => (string) Str::uuid(), 'type' => 'hold', 'message' => 'Review required']);
    expect($manager->claim('roberto', 'cashless-roberto-1', (string) Str::uuid())->id)->toBe($secondForFirst->id);
});

test('claim secrets are scoped to the claimed staff and restricted to cashless worker endpoints', function () {
    $first = personalHybridUser('staff-one');
    personalCashlessBatch($first);
    personalCashlessBatch(personalHybridUser('staff-two'));
    $key = (string) Str::uuid();

    $claim = $this->postJson(route('internal.cashless-entries.claim'), ['claim_key' => $key], personalWorkerHeaders())->assertOk()
        ->assertJsonPath('data.hybrid_account.user_id', $first->id)->assertJsonPath('data.hybrid_account.username', 'staff-one')
        ->assertHeader('Cache-Control', 'no-store, private')->json('data');
    $this->postJson(route('internal.cashless-entries.claim'), ['claim_key' => $key], personalWorkerHeaders())->assertOk()->assertJsonPath('data.id', $claim['id']);
    $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], personalWorkerHeaders())->assertForbidden();
    $this->postJson(route('internal.cashless-entries.claim'), ['claim_key' => (string) Str::uuid()], personalWorkerHeaders(6))->assertForbidden();
    $this->postJson(route('internal.cashless-entries.claim'), ['claim_key' => (string) Str::uuid()], [...personalWorkerHeaders(), 'X-Worker-ID' => 'cashless-nuralamt-1'])->assertForbidden();
    $this->postJson(route('internal.cashless-entries.checkpoint', $claim['id']), ['event_key' => (string) Str::uuid(), 'type' => 'heartbeat'], [...personalWorkerHeaders(2), 'X-Cashless-Claim' => $claim['claim_token']])->assertConflict();
});

test('saving an account releases waiting batches and credentials cannot change during a live batch', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $task = PickupTask::factory()->create();
    PickupCashlessAwb::factory()->create(['pickup_task_id' => $task->id, 'customer_id' => $task->customer_id, 'awb' => 'CMSTAFF001']);
    $batch = app(ManageCashlessEntryBatches::class)->enqueue((string) Str::uuid(), $task->id, $staff->id, ['CMSTAFF001'], 'roberto');
    expect($batch->status)->toBe('WAITING_ACCOUNT');
    expect($batch->hybrid_user_id)->toBe($staff->id);
    expect($batch->items()->count())->toBe(1);
    $this->actingAs($admin)->patchJson(route('api.users.hybrid', $staff), ['hybrid_username' => 'ready-staff', 'hybrid_password' => 'ready-secret'])->assertOk();
    expect($batch->fresh()->status)->toBe('QUEUED');
    app(ManageCashlessEntryBatches::class)->claim('roberto', 'cashless-roberto-1', (string) Str::uuid());

    $this->patchJson(route('api.users.hybrid', $staff), ['hybrid_username' => 'other', 'hybrid_password' => 'changed-secret'])->assertConflict();

    expect($staff->fresh()->hybrid_password)->toBe('ready-secret');
});

test('expired untouched claims can retry but uncertain input expires to review without replaying its AWBs', function () {
    $manager = app(ManageCashlessEntryBatches::class);
    $staff = personalHybridUser('expiry-staff');
    $batch = personalCashlessBatch($staff);
    $manager->claim('roberto', 'cashless-roberto-1', (string) Str::uuid());
    $this->travel(301)->seconds();
    expect($manager->claim('roberto', 'cashless-roberto-2', (string) Str::uuid())->id)->toBe($batch->id);
    $manager->checkpoint($batch->id, 'roberto', 'cashless-roberto-2', $manager->token($batch->fresh()), ['event_key' => (string) Str::uuid(), 'type' => 'creating']);
    $this->travel(301)->seconds();

    expect($manager->claim('roberto', 'cashless-roberto-1', (string) Str::uuid()))->toBeNull();
    expect($batch->fresh()->status)->toBe('UNKNOWN');
});
