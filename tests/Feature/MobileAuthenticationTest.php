<?php

use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Laravel\Sanctum\PersonalAccessToken;

test('mobile login issues a hashed pickup device token expiring in 24 hours', function () {
    $this->travelTo(new DateTimeImmutable('2026-10-13T00:00:00Z'));
    $user = User::factory()->create(['role' => 'pickup_staff']);
    $device = (string) Str::uuid();

    $response = $this->postJson(route('mobile.auth.store'), ['email' => strtoupper($user->email), 'password' => 'password', 'device_id' => $device, 'device_name' => 'Android Test']);

    $response->assertCreated()->assertJsonPath('data.user.id', $user->id)->assertJsonPath('data.expires_at', '2026-10-14T00:00:00+00:00');
    $token = PersonalAccessToken::findToken($response->json('data.token'));
    expect($token->abilities)->toBe(['mobile:read', 'mobile:execute', 'mobile:handover']);
    expect($token->token)->not->toBe($response->json('data.token'));
    expect($token->name)->toBe('mobile:'.$device.':Android Test');
    $this->assertDatabaseCount('personal_access_tokens', 1);
});

test('mobile login rejects invalid or inactive credentials with safe 422 feedback', function (bool $active, string $password) {
    $user = User::factory()->create(['role' => 'pickup_staff', 'is_active' => $active]);

    $this->postJson(route('mobile.auth.store'), ['email' => $user->email, 'password' => $password, 'device_id' => (string) Str::uuid(), 'device_name' => 'Android'])
        ->assertUnprocessable()->assertJsonPath('code', 'VALIDATION_FAILED')->assertJsonValidationErrors('email');

    $this->assertDatabaseCount('personal_access_tokens', 0);
})->with([[true, 'wrong'], [false, 'password']]);

test('mobile login refuses non operational roles without changing their web permissions', function (string $role) {
    $user = User::factory()->create(['role' => $role]);

    $this->postJson(route('mobile.auth.store'), ['email' => $user->email, 'password' => 'password', 'device_id' => (string) Str::uuid(), 'device_name' => 'Android'])
        ->assertForbidden()->assertJsonPath('code', 'FORBIDDEN');

    $this->assertDatabaseCount('personal_access_tokens', 0);
    $this->actingAs($user, 'web')->get(route('dashboard'))->assertOk();
})->with(['cs']);

test('mobile login validates device identity and rate limits unsuccessful attempts', function () {
    $this->postJson(route('mobile.auth.store'), ['email' => 'staff@example.test', 'password' => 'wrong', 'device_id' => 'invalid', 'device_name' => 'Android'])
        ->assertUnprocessable()->assertJsonValidationErrors('device_id');
    $payload = ['email' => 'rate-limit@example.test', 'password' => 'wrong', 'device_id' => (string) Str::uuid(), 'device_name' => 'Android'];
    for ($attempt = 0; $attempt < 5; $attempt++) {
        $this->postJson(route('mobile.auth.store'), $payload)->assertUnprocessable();
    }

    $this->postJson(route('mobile.auth.store'), $payload)->assertTooManyRequests()->assertJsonPath('code', 'RATE_LIMITED');
});

test('relogin replaces only the matching account and installation token', function () {
    $user = User::factory()->create(['role' => 'pickup_staff']);
    $device = (string) Str::uuid();
    $old = $user->createToken('mobile:'.$device.':Old name', ['mobile:read'], now()->addDay());
    $other = $user->createToken('mobile:'.Str::uuid().':Other device', ['mobile:read'], now()->addDay());
    $otherUser = User::factory()->create(['role' => 'pickup_staff']);
    $otherAccount = $otherUser->createToken('mobile:'.$device.':Other account', ['mobile:read'], now()->addDay());

    $this->postJson(route('mobile.auth.store'), ['email' => $user->email, 'password' => 'password', 'device_id' => $device, 'device_name' => 'New name'])->assertCreated();

    expect(PersonalAccessToken::findToken($old->plainTextToken))->toBeNull();
    $this->assertModelExists($other->accessToken);
    $this->assertModelExists($otherAccount->accessToken);
    $this->assertDatabaseCount('personal_access_tokens', 3);
});

test('mobile logout revokes only current device and keeps web session usable', function () {
    $user = User::factory()->create(['role' => 'pickup_staff']);
    $first = $user->createToken('mobile:'.Str::uuid().':A', ['mobile:read'], now()->addDay());
    $second = $user->createToken('mobile:'.Str::uuid().':B', ['mobile:read'], now()->addDay());

    $this->withToken($first->plainTextToken)->deleteJson(route('mobile.auth.destroy'))->assertOk();

    expect(PersonalAccessToken::findToken($first->plainTextToken))->toBeNull();
    Auth::forgetGuards();
    $this->withToken($first->plainTextToken)->getJson(route('mobile.me'))->assertUnauthorized();
    Auth::forgetGuards();
    $this->withToken($second->plainTextToken)->getJson(route('mobile.me'))->assertOk()->assertJsonPath('data.id', $user->id);
    $this->actingAs($user, 'web')->get(route('dashboard'))->assertOk();
});

test('mobile rejects expired revoked missing or nonmobile tokens with 401', function (string $kind) {
    $user = User::factory()->create(['role' => 'pickup_staff']);
    $token = $user->createToken($kind === 'nonmobile' ? 'other-api' : 'mobile:'.Str::uuid().':Android', ['mobile:read'], $kind === 'expired' ? now()->subMinute() : now()->addDay());
    if ($kind === 'revoked') {
        $token->accessToken->delete();
    }
    if ($kind !== 'missing') {
        $this->withToken($token->plainTextToken);
    }

    $this->getJson(route('mobile.me'))->assertUnauthorized()->assertJsonPath('code', 'UNAUTHENTICATED');
})->with(['expired', 'revoked', 'missing', 'nonmobile']);

test('mobile refuses web session fallback even for pickup staff', function () {
    $user = User::factory()->create(['role' => 'pickup_staff']);

    $this->actingAs($user, 'web')->getJson(route('mobile.me'))->assertUnauthorized();
});

test('mobile refuses changed account access but still permits device logout', function (array $changes) {
    $user = User::factory()->create(['role' => 'pickup_staff']);
    $token = $user->createToken('mobile:'.Str::uuid().':Android', ['mobile:read'], now()->addDay());
    $user->update($changes);

    $this->withToken($token->plainTextToken)->getJson(route('mobile.me'))->assertForbidden();
    Auth::forgetGuards();
    $this->deleteJson(route('mobile.auth.destroy'))->assertOk();

    expect(PersonalAccessToken::findToken($token->plainTextToken))->toBeNull();
})->with([[['is_active' => false]], [['role' => 'cs']]]);

test('mobile requires token read ability', function () {
    $user = User::factory()->create(['role' => 'pickup_staff']);
    $token = $user->createToken('mobile:'.Str::uuid().':Android', [], now()->addDay());

    $this->withToken($token->plainTextToken)->getJson(route('mobile.me'))->assertForbidden();
});

test('web login and logout still enforce csrf with mobile installed', function () {
    $this->app->detectEnvironment(fn () => 'local');
    $user = User::factory()->create(['role' => 'pickup_staff']);
    $payload = ['email' => $user->email, 'password' => 'password'];

    $this->withSession(['_token' => 'web-csrf'])->postJson(route('login.store'), $payload)->assertStatus(419);
    $this->withSession(['_token' => 'web-csrf'])->withHeader('X-CSRF-TOKEN', 'web-csrf')->postJson(route('login.store'), $payload)->assertOk();
    $this->assertAuthenticatedAs($user, 'web');
    $this->withHeader('X-CSRF-TOKEN', 'wrong')->postJson(route('logout'))->assertStatus(419);
    $this->withHeader('X-CSRF-TOKEN', session()->token())->postJson(route('logout'))->assertOk();
    $this->assertGuest('web');
    $this->assertDatabaseCount('personal_access_tokens', 0);
});

test('mobile cors allows only the configured webview origin without cookies', function () {
    $this->withHeaders(['Origin' => 'https://localhost', 'Access-Control-Request-Method' => 'GET', 'Access-Control-Request-Headers' => 'authorization'])->options(route('mobile.me'))
        ->assertNoContent()->assertHeader('Access-Control-Allow-Origin', 'https://localhost')->assertHeaderMissing('Access-Control-Allow-Credentials');

    $this->flushHeaders()->withHeaders(['Origin' => 'https://untrusted.example', 'Access-Control-Request-Method' => 'GET'])->options(route('mobile.me'))
        ->assertHeader('Access-Control-Allow-Origin', 'https://localhost');
});
