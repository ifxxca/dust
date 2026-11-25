<?php

namespace App\Http\Controllers;

use App\Actions\Monitoring\QueryItControlCenter;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Symfony\Component\HttpFoundation\Response;

class ItControlCenterController extends Controller
{
    public function __invoke(Request $request, QueryItControlCenter $query): Response
    {
        abort_unless($request->user()?->is_active && $request->user()->role === 'admin_supervisor', 403);

        $response = Inertia::render('it-control-center', ['monitoring' => $query->handle()])->toResponse($request);
        $response->headers->set('Cache-Control', 'private, no-store');

        return $response;
    }
}
