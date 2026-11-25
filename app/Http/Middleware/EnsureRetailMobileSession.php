<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureRetailMobileSession
{
    /**
     * Handle an incoming request.
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        abort_unless($user?->canExecutePickup(), 403, 'Akun belum memiliki akses operasional mobile.');
        if ($request->routeIs('retail.tasks.takeover', 'retail.tasks.start', 'retail.tasks.visit', 'retail.tasks.retry', 'retail.tasks.proof')) {
            abort_unless($user->role === 'pickup_staff', 403, 'Hanya petugas pickup yang dapat mengerjakan tugas.');
        }

        $response = $next($request);
        $response->headers->set('Cache-Control', 'private, no-store');

        return $response;
    }
}
