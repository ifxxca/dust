<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

class EnsureMobileToken
{
    /**
     * Handle an incoming request.
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $token = $user?->currentAccessToken();
        abort_unless($request->bearerToken() && $token instanceof PersonalAccessToken && str_starts_with($token->name, 'mobile:'), 401);
        abort_unless($token->can('mobile:read'), 403);
        if ($request->routeIs('mobile.tasks.store', 'mobile.tasks.takeover', 'mobile.tasks.start', 'mobile.tasks.visit', 'mobile.tasks.retry', 'mobile.tasks.proof')) {
            abort_unless($user->role === 'pickup_staff' && $token->can('mobile:execute'), 403, 'Sesi belum memiliki akses execution. Logout online dan login ulang setelah pembaruan aplikasi.');
        }
        if ($request->routeIs('mobile.handovers.store', 'mobile.handovers.amend', 'mobile.handovers.verify', 'mobile.handovers.close', 'mobile.cashless-handover.store')) {
            abort_unless($token->can('mobile:handover'), 403, 'Sesi belum memiliki akses handover. Logout online dan login ulang setelah pembaruan aplikasi.');
        }
        if (! $request->routeIs('mobile.auth.destroy')) {
            abort_unless($user->is_active, 403, 'Akun tidak aktif. Hubungi Admin.');
            abort_unless($user->canExecutePickup(), 403, 'Akun belum memiliki akses operasional mobile.');
        }
        $response = $next($request);
        $response->headers->set('Cache-Control', 'private, no-store');

        return $response;
    }
}
