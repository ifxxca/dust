<?php

use App\Models\Customer;
use App\Models\User;
use Inertia\Testing\AssertableInertia;

test('missing HTML pages render accessible recovery without changing the 404 status', function () {
    $this->withoutVite();
    $this->get('/ui-ux-page-that-does-not-exist')
        ->assertNotFound()
        ->assertInertia(fn (AssertableInertia $page) => $page->component('errors/not-found'));
});

test('missing shipment documents use recovery without exposing a record', function () {
    $this->withoutVite();
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))
        ->get(route('jne-monitoring.show', 999999))
        ->assertNotFound()
        ->assertInertia(fn (AssertableInertia $page) => $page->component('errors/not-found')->missing('shipment'));
});

test('missing JSON routes preserve their machine readable error contract', function () {
    $this->getJson('/api/v1/ui-ux-not-found')
        ->assertNotFound()
        ->assertJsonPath('code', 'NOT_FOUND')
        ->assertJsonStructure(['message', 'code', 'errors', 'meta'])
        ->assertHeaderMissing('X-Inertia');

    $this->getJson('/ui-ux-not-found')
        ->assertNotFound()
        ->assertHeaderMissing('X-Inertia');
});

test('web customer validation is Indonesian and preserves validation code fields and stored data', function () {
    app()->setLocale('en');
    $this->actingAs(User::factory()->create(['role' => 'cs']))
        ->postJson(route('api.customers.store'), ['name' => 'Customer validasi', 'pickup_address' => 'Alamat pickup'])
        ->assertUnprocessable()
        ->assertJsonPath('code', 'VALIDATION_FAILED')
        ->assertJsonPath('errors.contact.0', 'Isi minimal satu email, nomor telepon, atau kontak utama pickup.');

    expect(Customer::count())->toBe(0)
        ->and(app()->getLocale())->toBe('en');
});

test('web authentication failures use Indonesian while preserving the failed login response', function () {
    User::factory()->create(['email' => 'ui-ux@example.test']);
    $this->postJson(route('login.store'), ['email' => 'ui-ux@example.test', 'password' => 'incorrect'])
        ->assertUnprocessable()
        ->assertJsonPath('code', 'VALIDATION_FAILED')
        ->assertJsonPath('errors.email.0', 'Email atau kata sandi tidak sesuai.');
});

test('the operational HTTP locale does not replace the default process locale', function () {
    $this->withoutVite();
    app()->setLocale('en');
    $this->get(route('login'))->assertOk();
    expect(app()->getLocale())->toBe('en');
});
