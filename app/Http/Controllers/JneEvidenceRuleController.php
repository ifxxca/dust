<?php

namespace App\Http\Controllers;

use App\Actions\Reports\ManageJneEvidenceRules;
use App\Models\Customer;
use App\Models\JneCustomerCodeAlias;
use App\Models\JneShipperAlias;
use App\Models\JneSourceContract;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class JneEvidenceRuleController extends Controller
{
    public function index(Request $request): Response
    {
        abort_unless($request->user()?->is_active && $request->user()->role === 'admin_supervisor', 403);
        $installed = Schema::hasTable('jne_evidence_rule_events');
        $q = $request->validate(['q' => ['nullable', 'string', 'max:100']])['q'] ?? '';
        $contracts = $installed ? JneSourceContract::when($q !== '', fn ($query) => $query->where('source', 'like', '%'.$q.'%'))->orderByDesc('id')->paginate(30, ['*'], 'contracts_page')->withQueryString() : null;
        $codes = $installed ? JneCustomerCodeAlias::when($q !== '', fn ($query) => $query->where('code', 'like', '%'.$q.'%'))->orderByDesc('id')->paginate(30, ['*'], 'codes_page')->withQueryString() : null;
        $shippers = $installed ? JneShipperAlias::where(fn ($query) => $query->whereNotNull('verified_at')->orWhereNotNull('account_scope')->orWhereNotNull('valid_from')->orWhereNotNull('valid_thru')->orWhereNotNull('verification_reason'))
            ->when($q !== '', fn ($query) => $query->where('shipper_name', 'like', '%'.$q.'%'))->orderByDesc('id')->paginate(30, ['*'], 'shippers_page')->withQueryString() : null;
        $events = $installed ? DB::table('jne_evidence_rule_events as e')->leftJoin('users as u', 'u.id', '=', 'e.actor_id')->orderByDesc('e.id')->paginate(30, ['e.*', 'u.name as actor_name'], 'events_page')->withQueryString() : null;

        return Inertia::render('jne-evidence-rules', [
            'installed' => $installed, 'enabled' => (bool) config('jne-reports.evidence_policies_enabled'),
            'contracts' => $contracts?->items() ?? [], 'codeAliases' => $codes?->items() ?? [], 'scopedAliases' => $shippers?->items() ?? [], 'events' => $events?->items() ?? [],
            'q' => $q, 'pages' => collect(['Kontrak' => $contracts, 'Kode' => $codes, 'Pengirim' => $shippers, 'Audit' => $events])->map(fn ($page): array => ['previous' => $page?->previousPageUrl(), 'next' => $page?->nextPageUrl(), 'total' => $page?->total() ?? 0]),
            'customers' => Customer::where('is_active', true)->orderBy('name')->get(['id', 'name', 'customer_code']),
        ]);
    }

    public function store(Request $request, ManageJneEvidenceRules $rules): RedirectResponse
    {
        $data = $request->validate(['kind' => ['required', Rule::in(['contract', 'code_alias', 'shipper_alias'])]]);
        $rules->store($request->user(), $data['kind'], $request->all());

        return back();
    }

    public function disable(Request $request, ManageJneEvidenceRules $rules): RedirectResponse
    {
        $data = $request->validate(['kind' => ['required', Rule::in(['contract', 'code_alias', 'shipper_alias'])], 'id' => ['required', 'integer', 'min:1'], 'version' => ['required', 'integer', 'min:1'], 'reason' => ['required', 'string', 'max:500']]);
        $rules->disable($request->user(), $data['kind'], (int) $data['id'], (int) $data['version'], $data['reason']);

        return back();
    }
}
