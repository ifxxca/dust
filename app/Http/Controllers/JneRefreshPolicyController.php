<?php

namespace App\Http\Controllers;

use App\Actions\Reports\ManageJneRefreshPolicy;
use App\Models\JneReportProfile;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Inertia\Inertia;
use Inertia\Response;

class JneRefreshPolicyController extends Controller
{
    public function index(Request $request): Response
    {
        abort_unless($request->user()?->is_active && $request->user()->role === 'admin_supervisor', 403);
        $installed = Schema::hasColumn('jne_report_profiles', 'refresh_policy');

        return Inertia::render('jne-refresh-policy', ['installed' => $installed, 'enabled' => (bool) config('jne-reports.tracking_policies_enabled'),
            'profiles' => JneReportProfile::where('source', 'apex')->where('report_type', 'unresolved')->get(),
            'events' => $installed ? DB::table('jne_evidence_rule_events')->where('kind', 'tracking_policy')->orderByDesc('id')->paginate(30)->withQueryString() : null]);
    }

    public function store(Request $request, JneReportProfile $profile, ManageJneRefreshPolicy $policies): RedirectResponse
    {
        $policies->handle($request->user(), $profile->id, $request->all());

        return back();
    }
}
