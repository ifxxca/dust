<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureReportWorker
{
    public function handle(Request $request, Closure $next): Response
    {
        $expected = config('jne-reports.worker_token');
        $token = $request->bearerToken();
        abort_unless(is_string($expected) && strlen($expected) >= 32 && is_string($token) && hash_equals($expected, $token), 401);
        $workers = [config('jne-reports.worker_id') => 'apex', 'hybrid-roberto' => 'roberto', 'hybrid-nuralamt' => 'nuralamt'];
        $source = $workers[$request->header('X-Worker-ID', '')] ?? null;
        abort_unless(is_string($source), 403);
        $request->attributes->set('report_source', $source);

        return $next($request);
    }
}
