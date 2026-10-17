<?php

use App\Models\HandoverSession;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Support\Str;

function mobileHandoverFixture(string $role = 'pickup_staff'): array
{
    $actor = User::factory()->create(['role' => $role]);
    $other = User::factory()->create(['role' => 'pickup_staff']);
    $tasks = collect([$actor, $other, $actor])->map(function ($staff) {
        $task = PickupTask::factory()->create(['assigned_staff_id' => $staff->id, 'status' => 'PICKED_UP']);
        PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'staff_id' => $staff->id]);

        return $task;
    });
    $token = $actor->createToken('mobile:'.Str::uuid().':Android', ['mobile:read', 'mobile:handover'], now()->addDay());

    return [$actor, $other, $tasks, $token];
}
test('mobile cross staff handover is idempotent with readonly lookup and compact lists', function () {
    [$actor,$other,$tasks,$token] = mobileHandoverFixture();
    $this->withToken($token->plainTextToken)->getJson(route('mobile.handovers.candidates'))->assertOk()->assertJsonCount(3, 'data');
    $key = (string) Str::uuid();
    $body = ['submission_key' => $key, 'task_ids' => [$tasks[0]->id, $tasks[1]->id]];
    $created = $this->postJson(route('mobile.handovers.store'), $body)->assertCreated()->assertJsonPath('data.status', 'DRAFT')->assertJsonCount(2, 'data.items');
    $this->postJson(route('mobile.handovers.store'), $body)->assertOk()->assertJsonPath('data.id', $created->json('data.id'));
    $this->getJson(route('mobile.submissions.show', ['submission_key' => $key, 'kind' => 'handover']))->assertOk()->assertJsonPath('data.resource_id', $created->json('data.id'));
    $this->getJson(route('mobile.handovers.index'))->assertOk()->assertJsonMissingPath('data.0.items');
    $this->getJson(route('mobile.handovers.candidates'))->assertJsonCount(1, 'data');
    $this->getJson(route('mobile.tasks.show', $tasks[1]))->assertOk()->assertJsonPath('data.proof.id', $tasks[1]->proof->id);
    $otherToken = $other->createToken('mobile:'.Str::uuid().':Other', ['mobile:read', 'mobile:handover'], now()->addDay());
    app('auth')->forgetGuards();
    $this->withToken($otherToken->plainTextToken)->getJson(route('mobile.submissions.show', ['submission_key' => $key, 'kind' => 'handover']))->assertNotFound();
    $this->postJson(route('mobile.handovers.store'), $body)->assertConflict();
    $this->assertDatabaseCount('handover_sessions', 1);
    $this->assertDatabaseCount('handover_items', 2);
});
test('mobile draft amendment replaces entire member list and rejects stale or verified sessions', function () {
    [$actor,$other,$tasks,$token] = mobileHandoverFixture();
    $sessionId = $this->withToken($token->plainTextToken)->postJson(route('mobile.handovers.store'), ['submission_key' => (string) Str::uuid(), 'task_ids' => [$tasks[0]->id, $tasks[1]->id]])->assertCreated()->json('data.id');
    $body = ['expected_version' => 1, 'reason' => 'Daftar lengkap diperiksa', 'task_ids' => [$tasks[1]->id, $tasks[2]->id]];
    $this->postJson(route('mobile.handovers.amend', $sessionId), $body)->assertOk()->assertJsonPath('data.version', 2)->assertJsonCount(2, 'data.items')->assertJsonPath('data.events.1.action', 'membership_changed');
    expect(HandoverSession::find($sessionId)->items->pluck('pickup_task_id')->all())->toBe([$tasks[1]->id, $tasks[2]->id]);
    $this->postJson(route('mobile.handovers.amend', $sessionId), $body)->assertConflict();
    $this->postJson(route('mobile.handovers.amend', $sessionId), [...$body, 'expected_version' => 2, 'task_ids' => []])->assertUnprocessable();
    HandoverSession::find($sessionId)->update(['status' => 'IN_VERIFICATION']);
    $this->postJson(route('mobile.handovers.amend', $sessionId), [...$body, 'expected_version' => 2])->assertConflict();
    $this->assertDatabaseCount('handover_events', 2);
});
test('mobile facade denies readonly writes and exposes no correction or management mutations', function () {
    [$actor,$other,$tasks,$token] = mobileHandoverFixture();
    $sessionId = $this->withToken($token->plainTextToken)->postJson(route('mobile.handovers.store'), ['submission_key' => (string) Str::uuid(), 'task_ids' => [$tasks[0]->id]])->assertCreated()->json('data.id');
    $readonly = $actor->createToken('mobile:'.Str::uuid().':Read', ['mobile:read'], now()->addDay());
    app('auth')->forgetGuards();
    $this->withToken($readonly->plainTextToken)->postJson(route('mobile.handovers.store'), ['submission_key' => (string) Str::uuid(), 'task_ids' => [$tasks[2]->id]])->assertForbidden();
    $this->postJson(route('mobile.handovers.amend', $sessionId), ['expected_version' => 1, 'reason' => 'test', 'task_ids' => [$tasks[2]->id]])->assertForbidden();
    foreach (['close', 'items/1/verification'] as $path) {
        $this->postJson('/api/mobile/v1/handovers/'.$sessionId.'/'.$path)->assertForbidden();
    }
    foreach (['reopen', 'items/1/correction'] as $path) {
        $this->postJson('/api/mobile/v1/handovers/'.$sessionId.'/'.$path)->assertNotFound();
    }
    app('auth')->forgetGuards();
    app('auth')->shouldUse('web');
    $this->getJson(route('api.handovers.show', $sessionId))->assertUnauthorized();
});

test('mobile verifies cross staff quantities and closes the same session visible on web', function () {
    [$actor, $other, $tasks, $token] = mobileHandoverFixture('retail_staff');
    $created = $this->withToken($token->plainTextToken)->postJson(route('mobile.handovers.store'), ['submission_key' => (string) Str::uuid(), 'task_ids' => [$tasks[0]->id, $tasks[1]->id]])->assertCreated();
    $sessionId = $created->json('data.id');
    $body = ['expected_version' => 1, 'manual_hybrid' => 2, 'cashless_hybrid' => 1, 'css_orion' => 0];
    $this->postJson(route('mobile.handovers.close', $sessionId), ['expected_version' => 1])->assertConflict();
    $first = $created->json('data.items.0.id');
    $second = $created->json('data.items.1.id');
    $this->postJson(route('mobile.handovers.verify', ['session' => $sessionId, 'item' => $first]), $body)->assertOk()->assertJsonPath('data.status', 'IN_VERIFICATION')->assertJsonPath('data.version', 2)->assertJsonPath('data.items.0.status', 'VERIFIED')->assertJsonPath('data.events.1.actor_id', $actor->id)->assertJsonPath('data.events.1.handover_item_id', $first);
    $this->postJson(route('mobile.handovers.verify', ['session' => $sessionId, 'item' => $first]), [...$body, 'expected_version' => 2])->assertConflict();
    $this->postJson(route('mobile.handovers.verify', ['session' => $sessionId, 'item' => $second]), $body)->assertConflict();
    $this->postJson(route('mobile.handovers.verify', ['session' => $sessionId, 'item' => $second]), [...$body, 'expected_version' => 2])->assertOk()->assertJsonPath('data.can_close', true);
    $this->postJson(route('mobile.handovers.close', $sessionId), ['expected_version' => 2])->assertConflict();
    $this->postJson(route('mobile.handovers.close', $sessionId), ['expected_version' => 3])->assertOk()->assertJsonPath('data.status', 'CLOSED')->assertJsonPath('data.version', 4);
    $this->postJson(route('mobile.handovers.close', $sessionId), ['expected_version' => 3])->assertOk();
    $this->assertDatabaseCount('handover_events', 4);
    $this->getJson(route('mobile.handovers.index', ['history' => 1]))->assertOk()->assertJsonCount(1, 'data');
    $this->getJson(route('mobile.handovers.index', ['active' => 1]))->assertOk()->assertJsonCount(0, 'data');
    app('auth')->forgetGuards();
    $this->withHeader('Authorization', '')->actingAs($actor, 'web')->getJson(route('api.handovers.show', $sessionId))->assertOk()->assertJsonPath('data.status', 'CLOSED')->assertJsonPath('data.items.1.verified_by', $actor->id);
});

test('mobile keeps category discrepancies after closure and validates every quantity', function () {
    [$actor, $other, $tasks, $token] = mobileHandoverFixture('retail_staff');
    $created = $this->withToken($token->plainTextToken)->postJson(route('mobile.handovers.store'), ['submission_key' => (string) Str::uuid(), 'task_ids' => [$tasks[0]->id]])->assertCreated();
    $sessionId = $created->json('data.id');
    $route = route('mobile.handovers.verify', ['session' => $sessionId, 'item' => $created->json('data.items.0.id')]);
    $body = ['expected_version' => 1, 'manual_hybrid' => 1, 'cashless_hybrid' => 2, 'css_orion' => 0];
    $this->postJson($route, $body)->assertUnprocessable()->assertJsonValidationErrors('discrepancy_notes');
    $this->postJson($route, [...$body, 'manual_hybrid' => -1, 'cashless_hybrid' => 1.2, 'css_orion' => 1000001])->assertUnprocessable()->assertJsonValidationErrors(['manual_hybrid', 'cashless_hybrid', 'css_orion']);
    $this->postJson($route, [...$body, 'discrepancy_notes' => 'Kategori berbeda walaupun total sama'])->assertOk()->assertJsonPath('data.items.0.status', 'DISCREPANCY')->assertJsonPath('data.can_close', true);
    $this->postJson(route('mobile.handovers.close', $sessionId), ['expected_version' => 2])->assertOk()->assertJsonPath('data.items.0.status', 'DISCREPANCY')->assertJsonPath('data.items.0.discrepancy_notes', 'Kategori berbeda walaupun total sama');
    $this->postJson($route, [...$body, 'expected_version' => 3])->assertConflict();
    $this->assertDatabaseCount('handover_events', 3);
});

test('mobile handover verifies only session members and rejects inactive or unauthorized personnel', function () {
    [$actor, $other, $tasks, $token] = mobileHandoverFixture('retail_staff');
    $created = $this->withToken($token->plainTextToken)->postJson(route('mobile.handovers.store'), ['submission_key' => (string) Str::uuid(), 'task_ids' => [$tasks[0]->id]])->assertCreated();
    $second = $this->postJson(route('mobile.handovers.store'), ['submission_key' => (string) Str::uuid(), 'task_ids' => [$tasks[1]->id]])->assertCreated();
    $body = ['expected_version' => 1, 'manual_hybrid' => 2, 'cashless_hybrid' => 1, 'css_orion' => 0];
    $this->postJson(route('mobile.handovers.verify', ['session' => $created->json('data.id'), 'item' => $second->json('data.items.0.id')]), $body)->assertNotFound();
    foreach ([['role' => 'retail_staff', 'is_active' => false], ['role' => 'pickup_staff'], ['role' => 'cs']] as $attributes) {
        $user = User::factory()->create($attributes);
        $pat = $user->createToken('mobile:'.Str::uuid().':Android', ['mobile:read', 'mobile:handover'], now()->addDay());
        app('auth')->forgetGuards();
        $this->withToken($pat->plainTextToken)->postJson(route('mobile.handovers.close', $created->json('data.id')), ['expected_version' => 1])->assertForbidden();
        $this->postJson(route('mobile.handovers.verify', ['session' => $created->json('data.id'), 'item' => $created->json('data.items.0.id')]), $body)->assertForbidden();
    }
    $this->assertDatabaseCount('handover_events', 2);
});
test('pickup history follows existing current assigned owner including no packages visits', function () {
    [$actor,$other,$tasks,$token] = mobileHandoverFixture();
    $waiting = PickupTask::factory()->create(['assigned_staff_id' => $actor->id, 'status' => 'ASSIGNED']);
    $noPackages = PickupTask::factory()->create(['assigned_staff_id' => $actor->id, 'status' => 'ASSIGNED', 'execution_started_at' => now()]);
    $noPackages->visits()->create(['staff_id' => $actor->id, 'started_at' => now(), 'outcome' => 'NO_PACKAGES', 'reason' => 'Tidak tersedia', 'recorded_at' => now()]);
    $this->withToken($token->plainTextToken)->getJson(route('mobile.tasks.index', ['history' => 1, 'mine' => 1]))->assertOk()->assertJsonCount(3, 'data');
    $this->getJson(route('mobile.tasks.index', ['history' => 1, 'mine' => 1, 'q' => $waiting->reference]))->assertJsonCount(0, 'data');
});
