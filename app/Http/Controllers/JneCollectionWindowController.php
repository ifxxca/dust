<?php

namespace App\Http\Controllers;

use App\Actions\Reports\ManageJneCollectionWindow;
use App\Actions\Reports\QueryJneCollectionWindows;
use App\Models\JneSourceContract;
use App\Models\PickupTask;
use App\Models\ReportJob;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Inertia\Inertia;
use Inertia\Response;

class JneCollectionWindowController extends Controller
{
    public function show(Request $request, PickupTask $pickupTask, QueryJneCollectionWindows $windows): Response
    {
        abort_unless($request->user()?->is_active && $request->user()->role === 'admin_supervisor', 403);
        $installed = Schema::hasTable('jne_collection_windows');
        $q = $request->validate(['q' => ['nullable', 'string', 'max:100']])['q'] ?? '';

        return Inertia::render('jne-collection-window', [
            'task' => $pickupTask->only(['id', 'reference', 'customer_name_snapshot']),
            'enabled' => $installed && QueryJneCollectionWindows::enabled(),
            'window' => $windows->handle(collect([$pickupTask]))[$pickupTask->id],
            'contracts' => $installed ? JneSourceContract::whereNotNull('active_key')->whereNotNull('verified_at')->get(['id', 'source', 'report_type', 'revision', 'definition']) : [],
            'reports' => ReportJob::whereNull('hybrid_batch_id')->when($q !== '', fn ($query) => $query->where(fn ($query) => $query->where('customer_account', 'like', '%'.$q.'%')->orWhere('source', 'like', '%'.$q.'%')->orWhere('id', $q)))
                ->orderByDesc('id')->paginate(30, ['id', 'source', 'report_type', 'customer_account', 'status', 'import_status', 'projection_status'], 'reports_page')->withQueryString(),
            'events' => $installed ? DB::table('jne_reconciliation_events as e')->leftJoin('users as u', 'u.id', '=', 'e.actor_id')->where('pickup_task_id', $pickupTask->id)->orderByDesc('e.id')->paginate(20, ['e.*', 'u.name as actor_name'])->withQueryString() : null,
            'q' => $q, 'timezone' => config('jne-reports.source_timezone'),
        ]);
    }

    public function store(Request $request, PickupTask $pickupTask, ManageJneCollectionWindow $windows): RedirectResponse
    {
        $windows->handle($request->user(), $pickupTask->id, $request->all());

        return back();
    }
}
