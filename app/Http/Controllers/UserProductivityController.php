<?php

namespace App\Http\Controllers;

use App\Actions\Reports\QueryUserProductivity;
use App\Http\Requests\UserProductivityRequest;
use Inertia\Inertia;
use Inertia\Response;

class UserProductivityController extends Controller
{
    /**
     * Handle the incoming request.
     */
    public function __invoke(UserProductivityRequest $request, QueryUserProductivity $productivity): Response
    {
        $input = $request->safe();
        $filters = [
            'date_from' => $input->string('date_from')->toString(),
            'date_thru' => $input->string('date_thru')->toString(),
            'q' => $input->string('q')->toString(),
            'manual_seconds' => $input->integer('manual_seconds'),
            'cashless_seconds' => $input->integer('cashless_seconds'),
            'orion_seconds' => $input->integer('orion_seconds'),
        ];

        return Inertia::render('user-productivity', [
            'productivity' => $productivity->handle($filters),
            'filters' => $filters,
        ]);
    }
}
