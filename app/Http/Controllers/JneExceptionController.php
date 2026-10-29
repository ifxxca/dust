<?php

namespace App\Http\Controllers;

use App\Actions\Reports\ResolveJneCategories;
use App\Actions\Reports\ReviewJneExceptions;
use App\Models\Customer;
use App\Models\JneShipment;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class JneExceptionController extends Controller
{
    public function index(Request $request): Response
    {
        abort_unless($request->user()?->is_active && $request->user()->role === 'admin_supervisor', 403);
        $filters = $request->validate(['q' => ['nullable', 'string', 'max:100'], 'cause' => ['nullable', 'in:identity,pickup,category']]);
        $query = JneShipment::query()->with('sources.reportJob', 'latestSource', 'customer:id,name', 'pickup:id,reference', 'cashlessClaim');
        $cause = $filters['cause'] ?? 'identity';
        if ($cause === 'category' && ResolveJneCategories::enabled()) {
            $query->where('category_status', '<>', 'MATCHED');
        } elseif ($cause === 'pickup') {
            $query->where('match_status', '<>', 'MATCHED');
        } else {
            $query->where('customer_match_status', '<>', 'MATCHED');
        }
        $query->when(! empty($filters['q']), fn ($query) => $query->where('awb', 'like', '%'.$filters['q'].'%'));

        return Inertia::render('jne-exceptions', ['enabled' => (bool) config('jne-reports.evidence_policies_enabled'), 'filters' => [...['q' => '', 'cause' => 'identity'], ...$filters],
            'rows' => $query->orderBy('id')->paginate(50)->withQueryString()->through(fn (JneShipment $row): array => [
                ...$row->only(['id', 'awb', 'version', 'customer_match_status', 'customer_match_note', 'match_status', 'match_note', 'customer_match_candidates', 'category', 'category_status']),
                'group_key' => ReviewJneExceptions::groupKey($row), 'customer_name' => $row->customer?->name, 'pickup_reference' => $row->pickup?->reference,
                'sources' => $row->sources->map(fn ($source): array => $source->only(['id', 'report_job_id', 'customer_account', 'shipper_name', 'reference', 'original_customer_code', 'raw_data']))]),
            'customers' => Customer::where('is_active', true)->orderBy('name')->get(['id', 'name', 'customer_code'])]);
    }

    public function store(Request $request, ReviewJneExceptions $review): RedirectResponse
    {
        $review->handle($request->user(), $request->all());

        return back();
    }
}
