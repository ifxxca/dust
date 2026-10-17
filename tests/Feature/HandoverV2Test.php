<?php

use App\Actions\Handover\CreateSession;
use App\Models\HandoverSession;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Support\Str;
use Laravel\Sanctum\PersonalAccessToken;

function handoverV2Session(User $creator): HandoverSession
{
    $task = PickupTask::factory()->create(['status' => 'PICKED_UP', 'assigned_staff_id' => $creator->id]);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'staff_id' => $creator->id, 'manual_hybrid' => 3, 'cashless_hybrid' => 2, 'css_orion' => 1]);

    return app(CreateSession::class)->handle($creator, [$task->id], (string) Str::uuid());
}

test('receiving accounts cannot inherit pickup mutation access from an older device token', function () {
    $user = User::factory()->create(['role' => 'pickup_staff']);
    $token = $user->createToken('mobile:'.Str::uuid().':Android', ['mobile:read', 'mobile:execute', 'mobile:handover'], now()->addDay());
    $task = PickupTask::factory()->create(['assigned_staff_id' => $user->id, 'status' => 'ASSIGNED']);
    $user->update(['role' => 'retail_staff']);
    $this->withToken($token->plainTextToken)->getJson(route('mobile.tasks.show', $task))->assertOk()->assertJsonPath('data.can.execute', false);
    $this->postJson(route('mobile.tasks.start', $task), ['expected_version' => 1])->assertForbidden();
    expect($task->fresh()->execution_started_at)->toBeNull();
});

test('receiving personnel log in with handover access without new mobile pickup mutation permissions', function (string $role) {
    $user = User::factory()->create(['role' => $role]);
    $response = $this->postJson(route('mobile.auth.store'), ['email' => $user->email, 'password' => 'password', 'device_id' => (string) Str::uuid(), 'device_name' => 'Receiver Android'])->assertCreated();
    $token = PersonalAccessToken::findToken($response->json('data.token'));
    expect($token->abilities)->toBe(['mobile:read', 'mobile:handover']);
    $this->withToken($response->json('data.token'))->getJson(route('mobile.handovers.index', ['receiving' => 1]))->assertOk()->assertJsonPath('capabilities.receive', true);
    $this->postJson(route('mobile.tasks.store'), [])->assertForbidden();
})->with(['retail_staff', 'admin_supervisor']);

test('verification preserves POP and audits exact lower excess zero and category offset counts on both platforms', function (string $platform, array $actual, array $differences, string $status) {
    $creator = User::factory()->create(['role' => 'pickup_staff']);
    $receiver = User::factory()->create(['role' => 'retail_staff']);
    $session = handoverV2Session($creator);
    $item = $session->items()->sole();
    if ($platform === 'mobile') {
        $token = $receiver->createToken('mobile:'.Str::uuid().':Receiver', ['mobile:read', 'mobile:handover'], now()->addDay());
        $this->withToken($token->plainTextToken);
    } else {
        $this->actingAs($receiver);
    }
    $notes = $status === 'DISCREPANCY' ? 'Hasil hitung fisik dicatat' : null;
    $response = $this->postJson(route($platform.'.handovers.verify', [$session, $item->id]), [...$actual, 'expected_version' => 1, 'expected_pickup_revision' => 0, 'discrepancy_notes' => $notes]);
    $response->assertOk()->assertJsonPath('data.status', 'IN_VERIFICATION')->assertJsonPath('data.items.0.status', $status)->assertJsonPath('data.items.0.differences', $differences)->assertJsonPath('data.items.0.verified_by', $receiver->id)->assertJsonPath('data.items.0.verified_pickup_revision', 0);
    expect($item->fresh()->only(array_keys($actual)))->toBe($actual);
    expect($item->proof->fresh()->only(array_keys($actual)))->toBe(['manual_hybrid' => 3, 'cashless_hybrid' => 2, 'css_orion' => 1]);
    $event = $session->events()->where('action', 'item_verified')->sole();
    expect($event->actor_id)->toBe($receiver->id);
    expect($event->changes['retail'])->toBe($actual);
    expect($event->changes['differences'])->toBe($differences);
    expect($item->fresh()->verified_at)->not->toBeNull();
    $this->postJson(route($platform.'.handovers.close', $session), ['expected_version' => 2])->assertOk()->assertJsonPath('data.status', 'CLOSED');
    expect($session->fresh()->closed_by)->toBe($receiver->id);
    $this->assertDatabaseCount('handover_events', 3);
})->with(['api', 'mobile'])->with([
    'match' => [['manual_hybrid' => 3, 'cashless_hybrid' => 2, 'css_orion' => 1], ['manual_hybrid' => 0, 'cashless_hybrid' => 0, 'css_orion' => 0], 'VERIFIED'],
    'shortage' => [['manual_hybrid' => 2, 'cashless_hybrid' => 2, 'css_orion' => 1], ['manual_hybrid' => -1, 'cashless_hybrid' => 0, 'css_orion' => 0], 'DISCREPANCY'],
    'excess' => [['manual_hybrid' => 5, 'cashless_hybrid' => 2, 'css_orion' => 1], ['manual_hybrid' => 2, 'cashless_hybrid' => 0, 'css_orion' => 0], 'DISCREPANCY'],
    'zero' => [['manual_hybrid' => 0, 'cashless_hybrid' => 0, 'css_orion' => 0], ['manual_hybrid' => -3, 'cashless_hybrid' => -2, 'css_orion' => -1], 'DISCREPANCY'],
    'offset' => [['manual_hybrid' => 4, 'cashless_hybrid' => 1, 'css_orion' => 1], ['manual_hybrid' => 1, 'cashless_hybrid' => -1, 'css_orion' => 0], 'DISCREPANCY'],
]);

test('pickup creators and CS cannot verify or close even with a handover token', function (string $platform, string $role) {
    $actor = User::factory()->create(['role' => $role]);
    $creator = $role === 'pickup_staff' ? $actor : User::factory()->create(['role' => 'pickup_staff']);
    $session = handoverV2Session($creator);
    $item = $session->items()->sole();
    if ($platform === 'mobile') {
        $this->withToken($actor->createToken('mobile:'.Str::uuid().':Android', ['mobile:read', 'mobile:handover'], now()->addDay())->plainTextToken);
    } else {
        $this->actingAs($actor);
    }
    $this->postJson(route($platform.'.handovers.verify', [$session, $item->id]), ['expected_version' => 1, 'manual_hybrid' => 3, 'cashless_hybrid' => 2, 'css_orion' => 1])->assertForbidden();
    $this->postJson(route($platform.'.handovers.close', $session), ['expected_version' => 1])->assertForbidden();
    expect($session->fresh()->version)->toBe(1);
    expect($item->fresh()->status)->toBe('PENDING');
    $this->assertDatabaseCount('handover_events', 1);
})->with(['api', 'mobile'])->with(['pickup_staff', 'cs']);

test('stale POP revision and concurrent receiving updates cannot overwrite verification', function () {
    $creator = User::factory()->create(['role' => 'pickup_staff']);
    $receiver = User::factory()->create(['role' => 'retail_staff']);
    $session = handoverV2Session($creator);
    $item = $session->items()->sole();
    $this->actingAs($receiver);
    $body = ['expected_version' => 1, 'expected_pickup_revision' => 1, 'manual_hybrid' => 3, 'cashless_hybrid' => 2, 'css_orion' => 1];
    $route = route('api.handovers.verify', [$session, $item->id]);
    $this->postJson($route, $body)->assertConflict();
    $this->postJson($route, [...$body, 'expected_pickup_revision' => 0])->assertOk();
    $secondReceiver = User::factory()->create(['role' => 'retail_staff']);
    $this->actingAs($secondReceiver)->postJson($route, [...$body, 'expected_pickup_revision' => 0, 'manual_hybrid' => 4, 'discrepancy_notes' => 'Concurrent'])->assertConflict();
    expect($item->fresh()->verified_by)->toBe($receiver->id);
    expect($item->fresh()->manual_hybrid)->toBe(3);
    $item->proof->revisions()->create(['revision' => 1, 'values' => ['manual_hybrid' => 4], 'actor_id' => $secondReceiver->id, 'reason' => 'Koreksi POP']);
    $this->getJson(route('api.handovers.show', $session))->assertOk()->assertJsonPath('data.items.0.needs_review', true)->assertJsonPath('data.items.0.verified_pickup.manual_hybrid', 3)->assertJsonPath('data.items.0.verified_differences.manual_hybrid', 0)->assertJsonPath('data.can_close', false);
    $this->postJson(route('api.handovers.close', $session), ['expected_version' => 2])->assertConflict();
    $this->assertDatabaseCount('handover_events', 2);
});
