<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureActiveUser
{
    /**
     * Handle an incoming request.
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user() && ! $request->user()->is_active && ! $request->routeIs('logout')) {
            abort(403, 'Akun tidak aktif. Hubungi Admin.');
        }

        if ($request->user()?->role === 'customer') {
            if ($request->routeIs('dashboard', 'home')) {
                return redirect()->route('portal.dashboard');
            }
            abort_unless($request->routeIs('portal.*', 'logout', 'verification.*', 'password.*', 'login', 'login.store'), 403, 'Akses tersedia melalui portal customer.');
            if ($request->routeIs('portal.*') && ! $request->user()->hasVerifiedEmail()) {
                return redirect()->route('verification.notice');
            }
        }

        $response = $next($request);
        if ($request->routeIs('portal.*')) {
            $response->headers->set('Cache-Control', 'private, no-store');
        }

        return $response;
    }
}
