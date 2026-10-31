<?php

test('local tunnel redirects guests to HTTPS login on the original host', function (string $proxyAddress) {
    $response = $this->withServerVariables(['REMOTE_ADDR' => $proxyAddress])
        ->withHeaders([
            'X-Forwarded-Proto' => 'https',
            'X-Forwarded-Port' => '443',
            'X-Forwarded-Host' => 'untrusted.example',
        ])
        ->get('http://tunnel.test/dashboard');

    $response->assertRedirect('https://tunnel.test/login');
})->with(['127.0.0.1', '::1']);

test('external connections cannot change the login scheme through forwarded headers', function () {
    $response = $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.10'])
        ->withHeaders([
            'X-Forwarded-Proto' => 'https',
            'X-Forwarded-Port' => '443',
        ])
        ->get('http://tunnel.test/dashboard');

    $response->assertRedirect('http://tunnel.test/login');
});

test('direct local access continues to redirect guests to HTTP login', function () {
    $response = $this->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
        ->get('http://localhost:8010/dashboard');

    $response->assertRedirect('http://localhost:8010/login');
});
