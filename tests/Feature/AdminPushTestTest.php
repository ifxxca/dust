<?php

use App\Actions\Mobile\FcmClient;
use App\Jobs\SendMobileTestPush;
use App\Models\MobilePushDevice;
use App\Models\User;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;

beforeEach(function () {
    $this->pushCredentialsPath = tempnam(sys_get_temp_dir(), 'push_admin_test_');
    file_put_contents($this->pushCredentialsPath, '{}');
    config(['mobile_push.enabled' => true, 'mobile_push.project_id' => 'push-test', 'mobile_push.credentials' => $this->pushCredentialsPath]);
    Http::preventStrayRequests();
});

afterEach(function () {
    if (is_file($this->pushCredentialsPath)) {
        unlink($this->pushCredentialsPath);
    }
});

function adminTestDevice(User $user): MobilePushDevice
{
    $installation = (string) Str::uuid();
    $token = $user->createToken('mobile:'.$installation.':Android', ['mobile:read'], now()->addDay());
    $fcm = 'test-fcm-'.Str::random(30);

    return MobilePushDevice::create(['installation_id' => $installation, 'user_id' => $user->id,
        'personal_access_token_id' => $token->accessToken->id, 'fcm_token' => $fcm, 'token_hash' => hash('sha256', $fcm), 'is_active' => true]);
}

test('admin queues a test to one registered device without changing pickup data or exposing tokens', function () {
    $this->withoutVite();
    Queue::fake([SendMobileTestPush::class]);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $device = adminTestDevice($staff);
    $id = (string) Str::uuid();
    $this->actingAs($admin)->get(route('push-test'))->assertOk()->assertInertia(fn ($page) => $page->component('push-test')->where('enabled', true)->where('configured', true));
    $response = $this->getJson(route('api.push-test.devices'))->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.eligible', true);
    expect($response->getContent())->not->toContain($device->fcm_token, $device->token_hash, $this->pushCredentialsPath, 'personal_access_token_id');
    $payload = ['device_id' => $device->id, 'submission_key' => $id];
    $this->postJson(route('api.push-test.store'), $payload)->assertAccepted()->assertJsonPath('data.status', 'queued');
    $this->getJson(route('api.push-test.show', $id))->assertOk()->assertJsonPath('data.request_id', $id)->assertJsonPath('data.status', 'queued');
    Queue::assertPushed(SendMobileTestPush::class, fn ($job) => $job->adminId === $admin->id && $job->recipientId === $staff->id && $job->deviceId === $device->id && $job->tokenId === $device->personal_access_token_id && $job->testId === $id && $job->connection === 'database' && $job->queue === 'mobile-push');
    $this->postJson(route('api.push-test.store'), $payload)->assertOk();
    Queue::assertPushed(SendMobileTestPush::class, 1);
    $this->assertDatabaseCount('pickup_tasks', 0);
    $this->assertDatabaseCount('pickup_task_events', 0);
    $this->assertDatabaseCount('mobile_push_deliveries', 0);
});

test('non admin or inactive users cannot access push test endpoints', function (string $role, bool $active) {
    Queue::fake([SendMobileTestPush::class]);
    $this->actingAs(User::factory()->create(['role' => $role, 'is_active' => $active]));
    $this->get(route('push-test'))->assertForbidden();
    $this->getJson(route('api.push-test.devices'))->assertForbidden();
    $this->getJson(route('api.push-test.show', (string) Str::uuid()))->assertForbidden();
    $this->postJson(route('api.push-test.store'), [])->assertForbidden();
    Queue::assertNothingPushed();
})->with([['cs', true], ['pickup_staff', true], ['retail_staff', true], ['admin_supervisor', false]]);

test('push test requires a web session and does not accept a mobile bearer as admin access', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $token = $admin->createToken('test', ['*']);
    $this->withToken($token->plainTextToken)->postJson(route('api.push-test.store'), [])->assertUnauthorized();
    $this->getJson(route('api.push-test.devices'))->assertUnauthorized();
});

test('admin device list searches and paginates without showing inactive or non pickup accounts', function () {
    $staff = User::factory()->create(['role' => 'pickup_staff', 'name' => 'Penerima Uji']);
    $device = adminTestDevice($staff);
    foreach ([['role' => 'cs'], ['role' => 'pickup_staff', 'is_active' => false]] as $attributes) {
        adminTestDevice(User::factory()->create($attributes));
    }
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']));
    $this->getJson(route('api.push-test.devices', ['q' => 'Penerima']))->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $device->id);
    for ($index = 0; $index < 20; $index++) {
        adminTestDevice($staff);
    }
    $this->getJson(route('api.push-test.devices'))->assertOk()->assertJsonCount(20, 'data')->assertJsonPath('meta.last_page', 2)->assertJsonPath('meta.total', 21);
    $this->getJson(route('api.push-test.devices', ['page' => 2]))->assertOk()->assertJsonCount(1, 'data');
});

test('push test rejects ineligible registrations before queueing', function (string $case) {
    Queue::fake([SendMobileTestPush::class]);
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $device = adminTestDevice($staff);
    match ($case) {
        'inactive_user' => $staff->update(['is_active' => false]),
        'wrong_role' => $staff->update(['role' => 'cs']),
        'inactive_device' => $device->update(['is_active' => false]),
        'expired' => $device->personalAccessToken->update(['expires_at' => now()->subMinute()]),
        'revoked' => $device->personalAccessToken->delete(),
        'wrong_installation' => $device->update(['installation_id' => (string) Str::uuid()]),
        'missing_ability' => $device->personalAccessToken->update(['abilities' => []]),
    };
    $response = $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->postJson(route('api.push-test.store'), ['device_id' => $device->id, 'submission_key' => (string) Str::uuid()]);
    if ($case === 'revoked') {
        $response->assertUnprocessable()->assertJsonValidationErrors('device_id');
    } else {
        $response->assertConflict();
    }
    Queue::assertNothingPushed();
})->with(['inactive_user', 'wrong_role', 'inactive_device', 'expired', 'revoked', 'wrong_installation', 'missing_ability']);

test('disabled or missing Firebase configuration rejects a new test without queueing', function (string $case) {
    Queue::fake([SendMobileTestPush::class]);
    $device = adminTestDevice(User::factory()->create(['role' => 'pickup_staff']));
    config($case === 'disabled' ? ['mobile_push.enabled' => false] : ['mobile_push.credentials' => 'missing-credentials-file']);
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->postJson(route('api.push-test.store'), ['device_id' => $device->id, 'submission_key' => (string) Str::uuid()])->assertConflict();
    Queue::assertNothingPushed();
})->with(['disabled', 'missing_credentials']);

test('test request rejects caller supplied tokens and notification content', function () {
    Queue::fake([SendMobileTestPush::class]);
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->postJson(route('api.push-test.store'), ['device_id' => 0, 'submission_key' => 'invalid', 'fcm_token' => 'injected', 'body' => 'injected'])
        ->assertUnprocessable()->assertJsonValidationErrors(['device_id', 'submission_key', 'fcm_token', 'body']);
    Queue::assertNothingPushed();
});

test('test status is scoped to its administrator and expires without triggering a resend', function () {
    Queue::fake([SendMobileTestPush::class]);
    $device = adminTestDevice(User::factory()->create(['role' => 'pickup_staff']));
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $id = (string) Str::uuid();
    $this->actingAs($admin)->postJson(route('api.push-test.store'), ['device_id' => $device->id, 'submission_key' => $id])->assertAccepted();
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->getJson(route('api.push-test.show', $id))->assertNotFound();
    $this->travel(31)->minutes();
    $this->actingAs($admin)->getJson(route('api.push-test.show', $id))->assertNotFound();
    $fcm = Mockery::mock(FcmClient::class);
    $fcm->shouldNotReceive('sendTest');
    (new SendMobileTestPush($admin->id, $device->id, $device->user_id, $device->personal_access_token_id, $id))->handle($fcm);
    Queue::assertPushed(SendMobileTestPush::class, 1);
});

test('same test key cannot be replayed for another device', function () {
    Queue::fake([SendMobileTestPush::class]);
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $first = adminTestDevice($staff);
    $second = adminTestDevice($staff);
    $id = (string) Str::uuid();
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->postJson(route('api.push-test.store'), ['device_id' => $first->id, 'submission_key' => $id])->assertAccepted();
    $this->postJson(route('api.push-test.store'), ['device_id' => $second->id, 'submission_key' => $id])->assertConflict();
    Queue::assertPushed(SendMobileTestPush::class, 1);
});

test('test job rechecks permissions and session after queue delay without sending to a rebound account', function (string $case) {
    Queue::fake([SendMobileTestPush::class]);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $device = adminTestDevice(User::factory()->create(['role' => 'pickup_staff']));
    $tokenId = $device->personal_access_token_id;
    $userId = $device->user_id;
    $id = (string) Str::uuid();
    $this->actingAs($admin)->postJson(route('api.push-test.store'), ['device_id' => $device->id, 'submission_key' => $id])->assertAccepted();
    if ($case === 'rebound') {
        $other = adminTestDevice(User::factory()->create(['role' => 'pickup_staff']));
        $device->update(['user_id' => $other->user_id, 'personal_access_token_id' => $other->personal_access_token_id]);
    } elseif ($case === 'revoked') {
        $device->personalAccessToken->delete();
    } elseif ($case === 'inactive_staff') {
        $device->user->update(['is_active' => false]);
    } else {
        $admin->update(['role' => 'cs']);
    }
    $fcm = Mockery::mock(FcmClient::class);
    $fcm->shouldNotReceive('sendTest');
    (new SendMobileTestPush($admin->id, $device->id, $userId, $tokenId, $id))->handle($fcm);
    expect(Cache::get(SendMobileTestPush::cacheKey($admin->id, $id))['status'])->toBe('skipped');
})->with(['rebound', 'revoked', 'inactive_staff', 'admin_access_changed']);

test('test job reports accepted unregistered and uncertain results once without retrying transport', function (string $outcome) {
    Queue::fake([SendMobileTestPush::class]);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $device = adminTestDevice(User::factory()->create(['role' => 'pickup_staff']));
    $id = (string) Str::uuid();
    $this->actingAs($admin)->postJson(route('api.push-test.store'), ['device_id' => $device->id, 'submission_key' => $id])->assertAccepted();
    $fcm = Mockery::mock(FcmClient::class);
    $expectation = $fcm->shouldReceive('sendTest')->once()->with($device->fcm_token, $id, $device->user_id, 300);
    if ($outcome === 'failed_or_uncertain') {
        $expectation->andThrow(new RuntimeException('Do not expose transport diagnostics or credentials'));
    } else {
        $expectation->andReturn($outcome === 'accepted');
    }
    $job = new SendMobileTestPush($admin->id, $device->id, $device->user_id, $device->personal_access_token_id, $id);
    $job->handle($fcm);
    $job->handle($fcm);
    $this->getJson(route('api.push-test.show', $id))->assertOk()->assertJsonPath('data.status', $outcome);
    expect($device->fresh()->is_active)->toBe($outcome !== 'unregistered');
    $this->assertDatabaseCount('pickup_task_events', 0);
})->with(['accepted', 'unregistered', 'failed_or_uncertain']);

test('queue failure is visible as failed queueing rather than a successful delivery', function () {
    $queue = Mockery::mock(Illuminate\Contracts\Queue\Queue::class);
    $queue->shouldReceive('push')->once()->andThrow(new RuntimeException('unavailable'));
    Queue::shouldReceive('connection')->with('database')->andReturn($queue);
    $device = adminTestDevice(User::factory()->create(['role' => 'pickup_staff']));
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->postJson(route('api.push-test.store'), ['device_id' => $device->id, 'submission_key' => (string) Str::uuid()])->assertOk()->assertJsonPath('data.status', 'queue_failed');
});

test('test sending is rate limited per admin', function () {
    Queue::fake([SendMobileTestPush::class]);
    $device = adminTestDevice(User::factory()->create(['role' => 'pickup_staff']));
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']));
    for ($index = 0; $index < 6; $index++) {
        $this->postJson(route('api.push-test.store'), ['device_id' => $device->id, 'submission_key' => (string) Str::uuid()])->assertAccepted();
    }
    $this->postJson(route('api.push-test.store'), ['device_id' => $device->id, 'submission_key' => (string) Str::uuid()])->assertTooManyRequests();
    Queue::assertPushed(SendMobileTestPush::class, 6);
});

test('database mobile push worker sends a separate safe test payload through mocked FCM', function () {
    $key = openssl_pkey_new(['private_key_bits' => 2048]);
    openssl_pkey_export($key, $private);
    file_put_contents($this->pushCredentialsPath, json_encode(['project_id' => 'push-test', 'client_email' => 'test@example.test', 'private_key' => $private]));
    Http::fake(['https://oauth2.googleapis.com/token' => Http::response(['access_token' => 'mock-oauth']),
        'https://fcm.googleapis.com/v1/projects/push-test/messages:send' => Http::response(['name' => 'projects/push-test/messages/example'])]);
    $device = adminTestDevice(User::factory()->create(['role' => 'pickup_staff']));
    $id = (string) Str::uuid();
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->postJson(route('api.push-test.store'), ['device_id' => $device->id, 'submission_key' => $id])->assertAccepted();
    $this->assertDatabaseHas('jobs', ['queue' => 'mobile-push']);
    Artisan::call('queue:work', ['connection' => 'database', '--queue' => 'mobile-push', '--once' => true, '--tries' => 1, '--timeout' => 60]);
    $this->getJson(route('api.push-test.show', $id))->assertOk()->assertJsonPath('data.status', 'accepted');
    Http::assertSent(fn ($request) => str_contains($request->url(), 'messages:send')
        && $request['message']['notification']['title'] === 'Tes notifikasi Retail Operations'
        && $request['message']['data'] === ['type' => 'push_test', 'test_id' => $id, 'recipient_id' => (string) $device->user_id]
        && $request['message']['android']['notification']['channel_id'] === 'pickup_assignments');
    Http::assertSentCount(2);
    $this->assertDatabaseCount('jobs', 0);
    $this->assertDatabaseCount('pickup_tasks', 0);
});
