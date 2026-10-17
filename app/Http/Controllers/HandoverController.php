<?php

namespace App\Http\Controllers;

use App\Actions\Handover\AmendSession;
use App\Actions\Handover\CloseSession;
use App\Actions\Handover\CreateSession;
use App\Actions\Handover\VerifyItem;
use App\Http\Requests\StoreHandoverRequest;
use App\Http\Requests\VerifyHandoverRequest;
use App\Http\Resources\HandoverResource;
use App\Models\HandoverItem;
use App\Models\HandoverSession;
use App\Models\PickupTask;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class HandoverController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        abort_unless($request->user()->canExecutePickup(), 403);
        $data = $request->validate(['page' => ['sometimes', 'integer', 'min:1'], 'history' => ['sometimes', 'boolean'], 'active' => ['sometimes', 'boolean'], 'summary' => ['sometimes', 'boolean'],
            'mine' => ['sometimes', 'boolean'], 'receiving' => ['sometimes', 'boolean'],
            'per_page' => ['sometimes', 'integer', Rule::in([10, 20, 50])], 'q' => ['nullable', 'string', 'max:100'], 'staff_id' => ['nullable', 'integer', 'min:1'],
            'date_from' => ['nullable', 'date_format:Y-m-d'], 'date_to' => ['nullable', 'date_format:Y-m-d', Rule::when($request->filled('date_from'), 'after_or_equal:date_from')],
            'status' => ['nullable', Rule::in(['DRAFT', 'IN_VERIFICATION', 'CLOSED'])]]);
        abort_if($request->boolean('receiving') && ! $request->user()->canVerifyHandover(), 403);

        $query = HandoverSession::with(['items.proof.revisions', 'items.revisions', 'items.task.assignedStaff'])->withCount(['items', 'items as pending_count' => fn ($query) => $query->where('status', 'PENDING'), 'items as discrepancy_count' => fn ($query) => $query->withStatus('DISCREPANCY')])
            ->when($request->boolean('history'), fn ($query) => $query->where('status', 'CLOSED'))
            ->when($request->boolean('active'), fn ($query) => $query->where('status', '!=', 'CLOSED'))
            ->when($request->boolean('mine'), fn ($query) => $query->where('created_by', $request->user()->id))
            ->when($request->boolean('receiving'), fn ($query) => $query->where('status', '!=', 'CLOSED'))
            ->when($data['status'] ?? null, fn ($query, $status) => $query->where('status', $status))
            ->when($data['staff_id'] ?? null, fn ($query, $staff) => $query->whereHas('items.task', fn ($task) => $task->where('assigned_staff_id', $staff)));
        if (! empty($data['q'])) {
            $search = '%'.addcslashes($data['q'], '%_\\').'%';
            $displayId = preg_match('/^HO-(\d+)$/i', trim($data['q']), $matches) === 1 ? (int) $matches[1] : null;
            $query->where(function ($match) use ($search, $displayId) {
                $match->where('reference', 'like', $search)->orWhereHas('items.task.assignedStaff', fn ($staff) => $staff->where('name', 'like', $search));
                if ($displayId !== null) {
                    $match->orWhere('id', $displayId);
                }
            });
        }
        if (! empty($data['date_from'])) {
            $query->where('created_at', '>=', CarbonImmutable::parse($data['date_from'], config('pickup.timezone'))->utc());
        }
        if (! empty($data['date_to'])) {
            $query->where('created_at', '<', CarbonImmutable::parse($data['date_to'], config('pickup.timezone'))->addDay()->utc());
        }
        $summary = $request->boolean('summary') ? ['active' => HandoverSession::where('status', '!=', 'CLOSED')->count(), 'closed' => HandoverSession::where('status', 'CLOSED')->count(), 'discrepancies' => HandoverItem::withStatus('DISCREPANCY')->count()] : null;

        return HandoverResource::collection($query->orderByRaw('CASE WHEN status = ? THEN 1 ELSE 0 END', ['CLOSED'])->latest('id')->paginate($data['per_page'] ?? 20))
            ->additional([
                ...($summary === null ? [] : ['summary' => $summary]),
                'capabilities' => [
                    'create' => ! $request->routeIs('mobile.*') || $request->user()->tokenCan('mobile:handover'),
                    'receive' => $request->user()->canVerifyHandover() && (! $request->routeIs('mobile.*') || $request->user()->tokenCan('mobile:handover')),
                ],
            ]);
    }

    public function candidates(Request $request): JsonResponse
    {
        abort_unless($request->user()->canExecutePickup(), 403);
        $data = $request->validate(['page' => ['sometimes', 'integer', 'min:1'], 'q' => ['nullable', 'string', 'max:100']]);
        $query = PickupTask::with(['assignedStaff', 'proof.revisions'])->where('status', 'PICKED_UP')->whereHas('proof')->whereDoesntHave('handoverItem');
        if (! empty($data['q'])) {
            $search = '%'.addcslashes($data['q'], '%_\\').'%';
            $displayId = preg_match('/^PCK-(\d+)$/i', trim($data['q']), $matches) === 1 ? (int) $matches[1] : null;
            $query->where(function ($match) use ($search, $displayId) {
                $match->where('reference', 'like', $search)->orWhere('customer_name_snapshot', 'like', $search)->orWhereHas('assignedStaff', fn ($staff) => $staff->where('name', 'like', $search));
                if ($displayId !== null) {
                    $match->orWhere('id', $displayId);
                }
            });
        }
        $tasks = $query->orderBy('id')->paginate(20);

        return response()->json(['data' => $tasks->getCollection()->map(function ($task) {
            $values = $task->proof->effectiveValues();

            return ['id' => $task->id, 'reference' => $task->reference, 'customer_name' => $values['customer_name'], 'staff_name' => $task->assignedStaff?->name, 'total' => $values['manual_hybrid'] + $values['cashless_hybrid'] + $values['css_orion']];
        }), 'meta' => ['current_page' => $tasks->currentPage(), 'last_page' => $tasks->lastPage()]]);
    }

    public function show(Request $request, HandoverSession $session): HandoverResource
    {
        abort_unless($request->user()->canExecutePickup(), 403);

        return $this->resource($session);
    }

    public function store(StoreHandoverRequest $request, CreateSession $action): HandoverResource
    {
        return $this->resource($action->handle($request->user(), array_values(array_map('intval', $request->validated('task_ids'))), $request->validated('submission_key')));
    }

    public function verify(VerifyHandoverRequest $request, HandoverSession $session, int $item, VerifyItem $action): HandoverResource
    {
        return $this->resource($action->handle($request->user(), $session->id, $item, $request->validated()));
    }

    public function close(Request $request, HandoverSession $session, CloseSession $action): HandoverResource
    {
        abort_unless($request->user()->canVerifyHandover(), 403);
        $data = $request->validate(['expected_version' => ['required', 'integer', 'min:1']]);

        return $this->resource($action->handle($request->user(), $session->id, (int) $data['expected_version']));
    }

    private function resource(HandoverSession $session): HandoverResource
    {
        return new HandoverResource($session->load(['creator:id,name', 'items.proof.revisions', 'items.revisions', 'items.task.assignedStaff', 'events']));
    }

    public function reopen(Request $request, HandoverSession $session, AmendSession $action): HandoverResource
    {
        abort_unless($request->user()->role === 'admin_supervisor', 403);
        $data = $request->validate(['expected_version' => ['required', 'integer', 'min:1'], 'reason' => ['required', 'string', 'max:500']]);

        return $this->resource($action->handle($request->user(), $session->id, (int) $data['expected_version'], $data['reason']));
    }

    public function amend(Request $request, HandoverSession $session, AmendSession $action): HandoverResource
    {
        abort_unless($request->user()->canExecutePickup(), 403);
        $data = $request->validate(['expected_version' => ['required', 'integer', 'min:1'], 'reason' => ['required', 'string', 'max:500'], 'task_ids' => ['required', 'array', 'min:1', 'max:100'], 'task_ids.*' => ['required', 'integer', 'distinct', 'min:1']]);

        return $this->resource($action->handle($request->user(), $session->id, (int) $data['expected_version'], $data['reason'], array_values(array_map('intval', $data['task_ids']))));
    }
}
