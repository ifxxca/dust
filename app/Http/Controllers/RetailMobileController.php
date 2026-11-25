<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class RetailMobileController extends Controller
{
    public function index(): Response
    {
        $path = public_path('retail/index.html');
        abort_unless(is_file($path), 503, 'Aplikasi mobile belum dibangun. Jalankan npm run build:pwa.');

        $contents = file_get_contents($path);
        if ($contents === false) {
            abort(503, 'Shell aplikasi mobile belum dapat dibaca.');
        }

        return response($contents)
            ->header('Cache-Control', 'no-store')
            ->header('X-Content-Type-Options', 'nosniff')
            ->header('X-Frame-Options', 'DENY')
            ->header('Referrer-Policy', 'same-origin')
            ->header('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $request->user()->only(['id', 'name', 'role', 'is_active']),
            'meta' => ['operational_timezone' => config('pickup.timezone')],
        ])->header('Cache-Control', 'private, no-store');
    }

    public function worker(): Response
    {
        $path = public_path('retail/sw.js');
        abort_unless(is_file($path), 503);

        $contents = file_get_contents($path);
        if ($contents === false) {
            abort(503, 'Service worker belum dapat dibaca.');
        }

        return response($contents)
            ->header('Content-Type', 'application/javascript')
            ->header('Service-Worker-Allowed', '/m')
            ->header('Cache-Control', 'no-cache, no-store')
            ->header('X-Content-Type-Options', 'nosniff');
    }
}
