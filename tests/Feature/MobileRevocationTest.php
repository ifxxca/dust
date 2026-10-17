<?php

use App\Models\MobilePushDevice;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;

function revocationDevice(User $user): array
{
    $installation = (string) Str::uuid();
    $token = $user->createToken('mobile:'.$installation.':Android', ['mobile:read'], now()->addDay());
    $fcm = 'test-only-fcm-'.Str::random(30);
    $registration = MobilePushDevice::create(['user_id' => $user->id, 'personal_access_token_id' => $token->accessToken->id, 'installation_id' => $installation, 'fcm_token' => $fcm, 'token_hash' => hash('sha256', $fcm), 'is_active' => true]);

    return [$installation, $token, $registration];
}
test('approved lost device revocation is scoped to account installation and audited without tokens', function () {
    Log::spy();
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $other = User::factory()->create(['role' => 'pickup_staff']);
    [$installation,$token,$registration] = revocationDevice($staff);
    [$second,$secondToken,$secondRegistration] = revocationDevice($staff);
    [$third,$thirdToken,$thirdRegistration] = revocationDevice($other);
    $this->artisan('mobile:revoke-device', ['user' => $staff->id, 'installation' => $installation, '--admin' => $admin->id, '--reason' => 'Perangkat dilaporkan hilang'])->assertSuccessful();
    expect($token->accessToken->fresh())->toBeNull();
    expect($registration->fresh())->toBeNull();
    expect($secondToken->accessToken->fresh())->not->toBeNull();
    expect($thirdToken->accessToken->fresh())->not->toBeNull();
    $this->withToken($token->plainTextToken)->getJson(route('mobile.me'))->assertUnauthorized();
    Log::shouldHaveReceived('notice')->with('mobile.device_revoked', Mockery::on(fn ($context) => $context['administrator_id'] === $admin->id && $context['user_id'] === $staff->id && $context['tokens_revoked'] === 1 && ! isset($context['token'])))->once();
});
test('revocation command rejects non administrator inactive administrator and invalid installation', function () {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $inactive = User::factory()->create(['role' => 'admin_supervisor', 'is_active' => false]);
    [$installation,$token] = revocationDevice($staff);
    foreach ([$staff, $inactive] as $actor) {
        $this->artisan('mobile:revoke-device', ['user' => $staff->id, 'installation' => $installation, '--admin' => $actor->id, '--reason' => 'test'])->assertFailed();
    }
    $this->artisan('mobile:revoke-device', ['user' => $staff->id, 'installation' => 'invalid', '--admin' => $inactive->id, '--reason' => 'test'])->assertFailed();
    expect($token->accessToken->fresh())->not->toBeNull();
});
test('Fortify valid password reset revokes all mobile devices and preserves other tokens and web guard', function () {
    Log::spy();
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    [$one,$first] = revocationDevice($staff);
    [$two,$second] = revocationDevice($staff);
    $integration = $staff->createToken('integration:test', ['integration:read']);
    $reset = Password::broker()->createToken($staff);
    $this->post(route('password.update'), ['email' => $staff->email, 'token' => $reset, 'password' => 'newpassword123', 'password_confirmation' => 'newpassword123'])->assertSessionHasNoErrors()->assertRedirect(route('login'));
    expect(Hash::check('newpassword123', $staff->fresh()->password))->toBeTrue();
    expect($first->accessToken->fresh())->toBeNull();
    expect($second->accessToken->fresh())->toBeNull();
    expect($integration->accessToken->fresh())->not->toBeNull();
    $this->assertDatabaseCount('mobile_push_devices', 0);
    $this->post(route('login.store'), ['email' => $staff->email, 'password' => 'newpassword123'])->assertSessionHasNoErrors();
    $this->assertAuthenticated('web');
    $this->post(route('logout'))->assertRedirect();
    $this->assertGuest('web');
});
test('invalid password reset does not revoke active devices', function () {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    [$installation,$token,$registration] = revocationDevice($staff);
    $this->post(route('password.update'), ['email' => $staff->email, 'token' => 'invalid', 'password' => 'newpassword123', 'password_confirmation' => 'newpassword123'])->assertSessionHasErrors('email');
    expect($token->accessToken->fresh())->not->toBeNull();
    expect($registration->fresh())->not->toBeNull();
});
