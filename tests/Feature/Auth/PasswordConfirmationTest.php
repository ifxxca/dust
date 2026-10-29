<?php

use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

test('confirm password screen can be rendered', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->get(route('password.confirm'));

    $response->assertOk();

    $response->assertInertia(fn (Assert $page) => $page
        ->component('auth/confirm-password'),
    );
});

test('password confirmation requires authentication', function () {
    $response = $this->get(route('password.confirm'));

    $response->assertRedirect(route('login'));
});

test('incorrect password confirmation explains recovery in Indonesian and leaves the session unconfirmed', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->post(route('password.confirm.store'), ['password' => 'incorrect-password'])
        ->assertSessionHasErrors(['password' => 'Kata sandi yang dimasukkan tidak sesuai.'])
        ->assertSessionMissing('auth.password_confirmed_at');
});
