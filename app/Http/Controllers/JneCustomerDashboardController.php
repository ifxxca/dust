<?php

namespace App\Http\Controllers;

use App\Actions\Reports\JneAwbSource;
use App\Actions\Reports\QueryJneCustomerDashboard;
use App\Models\Customer;
use App\Models\JneShipment;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class JneCustomerDashboardController extends Controller
{
    public function __invoke(Request $request, QueryJneCustomerDashboard $dashboard): Response
    {
        abort_unless($request->user()?->is_active && $request->user()->role === 'admin_supervisor', 403);
        $data = $request->validate([
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_thru' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:date_from'],
            'mapping' => ['nullable', Rule::in(['all', 'unmapped', 'ambiguous'])],
            'server' => ['nullable', Rule::in(['all', ...array_keys(JneAwbSource::LABELS)])],
            'age' => ['nullable', Rule::in(['all', '7_plus', '14_plus'])],
            'service' => ['nullable', 'string', 'max:100'], 'destination' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', Rule::in(JneShipment::STATUSES)], 'page' => ['sometimes', 'integer', 'min:1'],
        ]);
        $timezone = config('jne-reports.source_timezone');
        $today = CarbonImmutable::today($timezone);
        $from = CarbonImmutable::parse($data['date_from'] ?? $today->subDays(29)->toDateString(), $timezone)->startOfDay();
        $thru = CarbonImmutable::parse($data['date_thru'] ?? $today->toDateString(), $timezone)->startOfDay();
        if ($from->greaterThan($thru) || $from->diffInDays($thru) > 365) {
            throw ValidationException::withMessages(['date_thru' => 'Pilih periode berurutan maksimal 366 hari.']);
        }
        $filters = ['customer_id' => $data['customer_id'] ?? null, 'date_from' => $from->toDateString(), 'date_thru' => $thru->toDateString(),
            'mapping' => $data['mapping'] ?? 'all', 'server' => $data['server'] ?? 'all', 'age' => $data['age'] ?? 'all', 'service' => $data['service'] ?? '', 'destination' => $data['destination'] ?? '', 'status' => $data['status'] ?? ''];

        return Inertia::render('jne-customer-dashboard', [
            ...$dashboard->handle($filters, $from, $thru), 'filters' => $filters, 'timezone' => $timezone,
            'selectedCustomer' => $filters['customer_id'] ? Customer::findOrFail($filters['customer_id'])->only(['id', 'name', 'customer_code']) : null,
        ]);
    }
}
