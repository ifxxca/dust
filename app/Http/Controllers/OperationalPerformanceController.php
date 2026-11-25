<?php

namespace App\Http\Controllers;

use App\Actions\Reports\QueryOperationalPerformance;
use App\Http\Requests\OperationalPerformanceRequest;
use App\Models\Customer;
use Inertia\Inertia;
use Inertia\Response;

class OperationalPerformanceController extends Controller
{
    public function __invoke(OperationalPerformanceRequest $request, QueryOperationalPerformance $performance): Response
    {
        $filters = $request->validated();

        return Inertia::render('operational-performance', [
            'performance' => $performance->handle($filters),
            'filters' => $filters,
            'selectedCustomer' => empty($filters['customer_id']) ? null : Customer::find($filters['customer_id'], ['id', 'name', 'customer_code']),
            'timezone' => 'Asia/Jakarta',
        ]);
    }
}
