<?php

namespace App\Http\Controllers;

use App\Actions\Pickup\RecordCashlessHandover;
use App\Http\Requests\StoreCashlessHandoverRequest;
use App\Models\CashlessEntryBatch;
use App\Models\PickupCashlessAwb;
use App\Models\PickupTask;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class CashlessHandoverController extends Controller
{
    public function index(Request $request): Response|JsonResponse
    {
        abort_unless($request->user()->canExecutePickup(), 403);
        $data = $request->validate(['q' => ['nullable', 'string', 'max:100'], 'date' => ['nullable', 'date_format:Y-m-d'],
            'task' => ['nullable', 'integer', 'min:1'], 'page' => ['sometimes', 'integer', 'min:1'], 'awb_page' => ['sometimes', 'integer', 'min:1']]);
        $query = PickupTask::with(['proof.revisions', 'handoverItem.session', 'processingReconciliation'])
            ->withCount(['cashlessAwbs' => fn ($awb) => $awb->whereNotNull('awb')])
            ->where('assigned_staff_id', $request->user()->id)->whereIn('status', ['ASSIGNED', 'PICKED_UP']);
        if (! empty($data['q'])) {
            $search = '%'.addcslashes(trim($data['q']), '%_\\').'%';
            $query->where(fn ($match) => $match->where('reference', 'like', $search)->orWhere('customer_name_snapshot', 'like', $search));
        }
        if (! empty($data['date'])) {
            $start = CarbonImmutable::parse($data['date'], config('pickup.timezone'))->setTime(5, 0);
            $query->where(fn ($bucket) => $bucket
                ->whereHas('proof', fn ($proof) => $proof->where('picked_up_at', '>=', $start->utc())->where('picked_up_at', '<', $start->addDay()->utc()))
                ->orWhere(fn ($scheduled) => $scheduled->whereDoesntHave('proof')->where('scheduled_at', '>=', $start->utc())->where('scheduled_at', '<', $start->addDay()->utc())));
        }
        $tasks = $query->orderByDesc('scheduled_at')->orderByDesc('id')->paginate(10)->withQueryString()
            ->through(fn (PickupTask $task): array => $this->task($task, $request));
        $selected = null;
        if (! empty($data['task'])) {
            $task = PickupTask::with(['proof.revisions', 'handoverItem.session', 'processingReconciliation'])
                ->where('assigned_staff_id', $request->user()->id)->whereKey($data['task'])->firstOrFail();
            Gate::authorize('viewCashlessAwb', $task);
            $task->loadCount(['cashlessAwbs' => fn ($awb) => $awb->whereNotNull('awb')]);
            $selected = [...$this->task($task, $request), 'awbs' => PickupCashlessAwb::where('pickup_task_id', $task->id)->whereNotNull('awb')
                ->latest('id')->paginate(50, ['id', 'awb', 'created_at'], 'awb_page')->withQueryString(),
                'entry_enabled' => (bool) config('pickup.cashless_entry.enabled'),
                'entry_batches' => CashlessEntryBatch::where('pickup_task_id', $task->id)->withCount('items')
                    ->with(['items' => fn ($items) => $items->where('status', '!=', 'PENDING')->select(['id', 'batch_id', 'awb', 'status', 'message'])])
                    ->latest('id')->limit(10)->get(['id', 'pickup_task_id', 'source', 'status', 'ho_number', 'error_message', 'approved_at', 'created_at'])];
        }

        $workspace = ['tasks' => $tasks, 'selected' => $selected,
            'filters' => ['q' => $data['q'] ?? '', 'date' => $data['date'] ?? ''], 'timezone' => config('pickup.timezone')];

        return $request->routeIs('mobile.cashless-handover.index') ? response()->json($workspace) : Inertia::render('cashless-handover', $workspace);
    }

    public function store(StoreCashlessHandoverRequest $request, PickupTask $task, RecordCashlessHandover $action): RedirectResponse|JsonResponse
    {
        $saved = $action->handle($request->user(), $task->id, $request->validated());

        if ($request->routeIs('mobile.cashless-handover.store')) {
            return response()->json(['data' => ['pickup_task_id' => $task->id, 'saved' => $saved,
                'stored_count' => $task->cashlessAwbs()->whereNotNull('awb')->count()]]);
        }

        return to_route('cashless-handover.index', ['task' => $task->id]);
    }

    /** @return array<string, mixed> */
    private function task(PickupTask $task, Request $request): array
    {
        $values = $task->proof?->finalized_at ? $task->proof->effectiveValues() : null;

        return ['id' => $task->id, 'reference' => $task->reference, 'customer' => $values['customer_name'] ?? $task->customer_name_snapshot,
            'scheduled_at' => ($task->proof->picked_up_at ?? $task->scheduled_at)->toIso8601String(), 'status' => $task->status,
            'target' => $values === null ? null : (int) $values['cashless_hybrid'], 'saved_count' => $task->cashless_awbs_count,
            'can_record' => $request->user()->can('handoverCashlessAwb', $task)
                && (! $request->routeIs('mobile.*') || $request->user()->tokenCan('mobile:handover'))];
    }
}
