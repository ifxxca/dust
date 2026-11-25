<?php

use App\Actions\Mobile\FcmClient;
use App\Jobs\SendCashlessEntryAlertPush;
use App\Models\CashlessEntryAlert;
use App\Models\CashlessEntryBatch;
use App\Models\MobilePushDevice;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

test('cashless push requests an audible high priority channel without changing its recipient or deep link', function () {
    Storage::fake('local');
    $key = openssl_pkey_new(['private_key_bits' => 2048]);
    openssl_pkey_export($key, $privateKey);
    Storage::disk('local')->put('fcm-test.json', json_encode(['project_id' => 'cashless-test', 'client_email' => 'test@example.test', 'private_key' => $privateKey], JSON_THROW_ON_ERROR));
    config(['mobile_push.project_id' => 'cashless-test', 'mobile_push.credentials' => Storage::disk('local')->path('fcm-test.json')]);
    Http::preventStrayRequests();
    Http::fake(['https://oauth2.googleapis.com/token' => Http::response(['access_token' => 'fixture-oauth']),
        'https://fcm.googleapis.com/v1/projects/cashless-test/messages:send' => Http::response(['name' => 'fixture-message'])]);
    $data = ['type' => 'cashless_entry_attention', 'task_id' => '854', 'batch_id' => '11', 'event_id' => '9', 'recipient_id' => '1'];

    expect(app(FcmClient::class)->sendCashlessAlert('fixture-device-token', $data, 300))->toBeTrue();

    Http::assertSent(fn ($request): bool => str_contains($request->url(), 'messages:send')
        && $request['message']['token'] === 'fixture-device-token' && $request['message']['data'] === $data
        && $request['message']['android']['notification']['tag'] === 'cashless-task-854'
        && $request['message']['android']['priority'] === 'HIGH'
        && $request['message']['android']['notification']['channel_id'] === 'cashless_processing'
        && $request['message']['android']['notification']['sound'] === 'retail_notification'
        && $request['message']['android']['notification']['notification_priority'] === 'PRIORITY_HIGH'
        && $request['message']['android']['notification']['default_vibrate_timings'] === true);
    Http::assertSentCount(2);
});

function cashlessAlertDevice(User $user): MobilePushDevice
{
    $installation = (string) Str::uuid();
    $token = $user->createToken('mobile:'.$installation.':Android', ['mobile:read'], now()->addHours(24));

    $fcm = 'fcm-cashless-'.$installation;

    return MobilePushDevice::create(['installation_id' => $installation, 'user_id' => $user->id,
        'personal_access_token_id' => $token->accessToken->id, 'fcm_token' => $fcm,
        'token_hash' => hash('sha256', $fcm), 'is_active' => true]);
}

test('each problematic batch produces one persistent alert and one push per owner device', function (string $status) {
    config(['mobile_push.enabled' => true]);
    Queue::fake([SendCashlessEntryAlertPush::class]);
    $owner = User::factory()->create(['role' => 'pickup_staff']);
    $device = cashlessAlertDevice($owner);
    $other = User::factory()->create(['role' => 'pickup_staff']);
    cashlessAlertDevice($other);
    $batch = CashlessEntryBatch::factory()->create(['created_by' => $owner->id]);

    $batch->update(['status' => $status, 'error_message' => 'Periksa resi pada batch']);
    $batch->touch();

    $this->assertDatabaseHas('cashless_entry_alerts', ['batch_id' => $batch->id, 'user_id' => $owner->id, 'read_at' => null]);
    $this->assertDatabaseCount('cashless_entry_alerts', 1);
    Queue::assertPushed(SendCashlessEntryAlertPush::class, 1);
    Queue::assertPushed(SendCashlessEntryAlertPush::class, fn ($job) => $job->deviceId === $device->id && $job->queue === 'mobile-push');
})->with(['FAILED', 'PARTIAL', 'UNKNOWN']);

test('success and queued work produce no failure alert and rollback discards alerts and push', function () {
    config(['mobile_push.enabled' => true]);
    Queue::fake([SendCashlessEntryAlertPush::class]);
    $owner = User::factory()->create(['role' => 'pickup_staff']);
    cashlessAlertDevice($owner);
    $batch = CashlessEntryBatch::factory()->create(['created_by' => $owner->id]);
    $batch->update(['status' => 'DONE']);
    DB::beginTransaction();
    $batch->update(['status' => 'UNKNOWN']);
    DB::rollBack();

    $this->assertDatabaseCount('cashless_entry_alerts', 0);
    Queue::assertNothingPushed();
    expect($batch->fresh()->status)->toBe('DONE');
});

test('staff see only their own cashless failures on web and cannot read another users alert', function () {
    $owner = User::factory()->create(['role' => 'pickup_staff']);
    $other = User::factory()->create(['role' => 'pickup_staff']);
    $batch = CashlessEntryBatch::factory()->create(['created_by' => $owner->id, 'status' => 'FAILED', 'error_message' => 'Connote belum tersedia']);
    $otherBatch = CashlessEntryBatch::factory()->create(['created_by' => $other->id, 'status' => 'UNKNOWN']);
    $alert = CashlessEntryAlert::where('batch_id', $batch->id)->sole();
    $otherAlert = CashlessEntryAlert::where('batch_id', $otherBatch->id)->sole();
    $task = PickupTask::factory()->create();
    $task->events()->create(['action' => 'pickup_finalized', 'actor_id' => $owner->id, 'task_version' => 1, 'occurred_at' => now()]);

    $this->actingAs($owner)->getJson(route('api.pickup-notifications.index'))->assertOk()->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.batch_id', $batch->id)->assertJsonPath('data.0.message', 'Connote belum tersedia')->assertJsonPath('meta.unread_count', 1);
    $this->patchJson(route('api.pickup-notifications.update'), ['cashless_alert_ids' => [$otherAlert->id]])->assertUnprocessable();
    $this->patchJson(route('api.pickup-notifications.update'), ['cashless_alert_ids' => [$alert->id]])->assertOk();
    $this->getJson(route('api.pickup-notifications.index'))->assertJsonPath('meta.unread_count', 0)->assertJsonPath('data.0.read', true);
    expect($otherAlert->fresh()->read_at)->toBeNull();
});

test('mobile failure history persists independently of push and requires an active matching account', function () {
    $owner = User::factory()->create(['role' => 'pickup_staff']);
    CashlessEntryBatch::factory()->create(['created_by' => $owner->id, 'status' => 'PARTIAL']);
    $alert = CashlessEntryAlert::sole();
    $this->getJson(route('mobile.notifications.index'))->assertUnauthorized();
    $token = $owner->createToken('mobile:test:Android', ['mobile:read'], now()->addHours(24));

    $this->withToken($token->plainTextToken)->getJson(route('mobile.notifications.index'))->assertOk()
        ->assertJsonPath('data.0.title', 'Cashless selesai dengan pengecualian')->assertJsonPath('meta.unread_count', 1);
    $this->patchJson(route('mobile.notifications.update'), ['cashless_alert_ids' => [$alert->id]])->assertOk();
    $this->getJson(route('mobile.notifications.index'))->assertJsonPath('meta.unread_count', 0);
    $this->getJson(route('mobile.notifications.index', ['unread_only' => 1]))->assertOk()->assertJsonCount(0, 'data');
    $this->getJson(route('mobile.notifications.index', ['unread_only' => 0]))->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.read', true);
    $this->getJson(route('mobile.notifications.index', ['unread_only' => 'invalid']))->assertUnprocessable();
    $owner->update(['is_active' => false]);
    app('auth')->forgetGuards();
    $this->getJson(route('mobile.notifications.index'))->assertForbidden();
});

test('push retries do not resend and the payload contains only navigation identifiers', function () {
    config(['mobile_push.enabled' => true]);
    Queue::fake([SendCashlessEntryAlertPush::class]);
    $owner = User::factory()->create(['role' => 'pickup_staff']);
    $device = cashlessAlertDevice($owner);
    $batch = CashlessEntryBatch::factory()->create(['created_by' => $owner->id, 'status' => 'UNKNOWN', 'error_message' => 'Secret AWB diagnostic']);
    $alert = CashlessEntryAlert::sole();
    $fcm = Mockery::mock(FcmClient::class);
    $fcm->shouldReceive('sendCashlessAlert')->once()->with($device->fcm_token, [
        'type' => 'cashless_entry_attention', 'task_id' => (string) $batch->pickup_task_id,
        'batch_id' => (string) $batch->id, 'event_id' => (string) $alert->id, 'recipient_id' => (string) $owner->id,
    ], Mockery::type('int'))->andReturn(true);

    $job = new SendCashlessEntryAlertPush($alert->id, $device->id);
    $job->handle($fcm);
    $job->handle($fcm);

    $this->assertDatabaseHas('cashless_entry_alert_deliveries', ['alert_id' => $alert->id, 'device_id' => $device->id, 'status' => 'accepted']);
    $this->assertDatabaseCount('cashless_entry_alert_deliveries', 1);
});

test('logout account switching and already read alerts suppress queued mobile delivery', function (string $condition) {
    config(['mobile_push.enabled' => true]);
    Queue::fake([SendCashlessEntryAlertPush::class]);
    $owner = User::factory()->create(['role' => 'pickup_staff']);
    $device = cashlessAlertDevice($owner);
    CashlessEntryBatch::factory()->create(['created_by' => $owner->id, 'status' => 'FAILED']);
    $alert = CashlessEntryAlert::sole();
    if ($condition === 'logout') {
        $owner->tokens()->delete();
    } elseif ($condition === 'read') {
        $alert->update(['read_at' => now()]);
    } else {
        $device->update(['user_id' => User::factory()->create()->id]);
    }
    $fcm = Mockery::mock(FcmClient::class);
    $fcm->shouldNotReceive('sendCashlessAlert');

    (new SendCashlessEntryAlertPush($alert->id, $device->id))->handle($fcm);

    $this->assertDatabaseCount('cashless_entry_alert_deliveries', 0);
})->with(['logout', 'read', 'switched']);

test('push errors leave the in app alert intact and never replay an uncertain delivery', function (bool $unregistered) {
    config(['mobile_push.enabled' => true]);
    Queue::fake([SendCashlessEntryAlertPush::class]);
    $owner = User::factory()->create(['role' => 'pickup_staff']);
    $device = cashlessAlertDevice($owner);
    CashlessEntryBatch::factory()->create(['created_by' => $owner->id, 'status' => 'FAILED']);
    $alert = CashlessEntryAlert::sole();
    $fcm = Mockery::mock(FcmClient::class);
    $expectation = $fcm->shouldReceive('sendCashlessAlert')->once();
    if ($unregistered) {
        $expectation->andReturn(false);
    } else {
        $expectation->andThrow(new RuntimeException('Connection lost'));
    }

    $job = new SendCashlessEntryAlertPush($alert->id, $device->id);
    $job->handle($fcm);
    $job->handle($fcm);

    $this->assertDatabaseHas('cashless_entry_alerts', ['id' => $alert->id, 'read_at' => null]);
    $this->assertDatabaseHas('cashless_entry_alert_deliveries', ['alert_id' => $alert->id,
        'status' => $unregistered ? 'unregistered' : 'failed_or_uncertain']);
    expect($device->fresh()->is_active)->toBe(! $unregistered);
})->with([true, false]);

test('legacy alert backfill is idempotent and never requeues cashless entry', function () {
    $batch = CashlessEntryBatch::factory()->create();
    DB::table('cashless_entry_batches')->where('id', $batch->id)->update(['status' => 'FAILED']);

    $this->artisan('cashless:entries', ['--notify-existing' => true, '--batch' => $batch->id])->assertSuccessful();
    $this->artisan('cashless:entries', ['--notify-existing' => true, '--batch' => $batch->id])->assertSuccessful();

    $this->assertDatabaseHas('cashless_entry_alerts', ['batch_id' => $batch->id, 'user_id' => $batch->created_by]);
    $this->assertDatabaseCount('cashless_entry_alerts', 1);
    $this->assertDatabaseCount('cashless_entry_batches', 1);
    expect($batch->fresh()->status)->toBe('FAILED');
});
