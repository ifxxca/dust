<?php

namespace App\Http\Controllers;

use App\Actions\Pickup\AssignPickupTasks;
use App\Actions\Pickup\CreatePickupTask;
use App\Actions\Pickup\TakeOverTask;
use App\Http\Requests\AssignmentRequest;
use App\Http\Requests\BulkAssignmentRequest;
use App\Http\Requests\StorePickupTaskRequest;
use App\Http\Requests\TakeoverRequest;
use App\Http\Resources\PickupTaskResource;
use App\Models\PickupTask;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class PickupTaskController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        Gate::authorize('viewAny', PickupTask::class);
        $data = $request->validate(['q' => ['nullable', 'string', 'max:100'], 'history' => ['sometimes', 'boolean'], 'status' => ['nullable', Rule::in(['SCHEDULED', 'ASSIGNED', 'PICKED_UP', 'NO_PACKAGES', 'CANCELLED'])],
            'date_from' => ['nullable', 'date_format:Y-m-d'], 'date_to' => ['nullable', 'date_format:Y-m-d', Rule::when($request->filled('date_from'), 'after_or_equal:date_from')],
            'customer_id' => ['nullable', 'integer', 'min:1'], 'staff_id' => ['nullable', 'integer', 'min:1'], 'schedule_id' => ['nullable', 'integer', 'min:1'], 'pickup_type' => ['nullable', Rule::in(['regular', 'on_demand'])],
            'page' => ['sometimes', 'integer', 'min:1'], 'mine' => ['sometimes', 'boolean'],
            'sort' => ['sometimes', Rule::in(['scheduled', 'newest', 'oldest'])],
            'per_page' => ['sometimes', 'integer', Rule::in([10, 20, 50])], 'summary' => ['sometimes', 'boolean']]);
        $query = PickupTask::with(['assignedStaff', 'visits'])->withExists('handoverItem');
        if ($request->routeIs('api.tasks.candidates', 'mobile.tasks.candidates')) {
            abort_unless($request->user()->canExecutePickup(), 403);
            $query->where('status', 'ASSIGNED')->whereNull('execution_started_at')->whereNotNull('assigned_staff_id')->where('assigned_staff_id', '!=', $request->user()->id);
        } elseif (! $request->user()->canManagePickup() || $request->boolean('mine')) {
            $query->where('assigned_staff_id', $request->user()->id);
        }
        $summary = null;
        if ($request->boolean('summary')) {
            $today = CarbonImmutable::now(config('pickup.timezone'))->startOfDay();
            $todayQuery = (clone $query)->where('scheduled_at', '>=', $today->utc())->where('scheduled_at', '<', $today->addDay()->utc());
            $counts = (clone $todayQuery)->toBase()->select('status')->selectRaw('COUNT(*) AS task_count')->groupBy('status')->pluck('task_count', 'status');
            $noPackages = (int) $counts->get('NO_PACKAGES', 0);
            $summary = ['date' => $today->toDateString(), 'total' => (int) $counts->sum(),
                'waiting' => (int) $counts->get('SCHEDULED', 0),
                'handling' => (int) $counts->get('ASSIGNED', 0),
                'successful' => (int) $counts->get('PICKED_UP', 0), 'no_packages' => $noPackages];
        }
        $query->when($data['status'] ?? null, fn ($query, $status) => $query->where('status', $status));
        if ($request->boolean('mine') && ! $request->boolean('history') && ! $request->filled('status')) {
            $query->whereIn('status', ['SCHEDULED', 'ASSIGNED']);
        }
        $query->when($data['customer_id'] ?? null, fn ($query, $id) => $query->where('customer_id', $id));
        $query->when($data['staff_id'] ?? null, fn ($query, $id) => $query->where('assigned_staff_id', $id));
        $query->when($data['pickup_type'] ?? null, fn ($query, $type) => $query->where('pickup_type', $type));
        $query->when($data['schedule_id'] ?? null, fn ($query, $id) => $query->where('pickup_schedule_id', $id));
        if ($request->boolean('history')) {
            $query->where(function ($query) {
                $query->whereIn('status', ['PICKED_UP', 'CANCELLED'])->orWhereHas('visits', fn ($visits) => $visits->whereNotNull('outcome'));
            });
        }
        if (! empty($data['q'])) {
            $search = '%'.addcslashes($data['q'], '%_\\').'%';
            $displayId = preg_match('/^PCK-(\d+)$/i', trim($data['q']), $matches) === 1 ? (int) $matches[1] : null;
            $query->where(function ($query) use ($search, $displayId) {
                $query->where('reference', 'like', $search)->orWhere('customer_name_snapshot', 'like', $search)->orWhere('pickup_address', 'like', $search);
                if ($displayId !== null) {
                    $query->orWhere('id', $displayId);
                }
            });
        }
        if (! empty($data['date_from'])) {
            $query->where('scheduled_at', '>=', CarbonImmutable::parse($data['date_from'], config('pickup.timezone'))->utc());
        }
        if (! empty($data['date_to'])) {
            $query->where('scheduled_at', '<', CarbonImmutable::parse($data['date_to'], config('pickup.timezone'))->addDay()->utc());
        }

        match ($data['sort'] ?? 'scheduled') {
            'newest' => $query->orderByDesc('created_at')->orderByDesc('id'),
            'oldest' => $query->orderBy('created_at')->orderBy('id'),
            default => $query->orderBy('scheduled_at')->orderBy('id'),
        };

        return PickupTaskResource::collection($query->paginate($data['per_page'] ?? 20))
            ->additional($summary === null ? [] : ['summary' => $summary]);
    }

    public function show(Request $request, PickupTask $task): PickupTaskResource
    {
        abort_unless($request->user()->can('view', $task), 404);

        return new PickupTaskResource($task->load(['assignedStaff', 'events.actor', 'events.previousStaff', 'events.newStaff', 'visits', 'proof.attachments', 'proof.receipt', 'proof.revisions', 'handoverItem']));
    }

    public function store(StorePickupTaskRequest $request, CreatePickupTask $create): JsonResponse
    {
        $task = $create->handle($request->user(), [
            'customer_id' => $request->integer('customer_id'),
            'pickup_address' => $request->string('pickup_address')->toString(),
            'scheduled_at' => $request->string('scheduled_at')->toString(),
            'notes' => $request->filled('notes') ? $request->string('notes')->toString() : null,
            'submission_key' => $request->filled('submission_key') ? $request->string('submission_key')->toString() : null,
            'previous_task_id' => $request->filled('previous_task_id') ? $request->integer('previous_task_id') : null,
        ]);

        return (new PickupTaskResource($task->load(['assignedStaff', 'events', 'visits', 'proof'])))->response()->setStatusCode($task->wasRecentlyCreated ? 201 : 200);
    }

    public function assign(AssignmentRequest $request, PickupTask $task, AssignPickupTasks $assign): PickupTaskResource
    {
        $task = $assign->handle($request->user(), $request->integer('assigned_staff_id'), [
            ['id' => $task->id, 'expected_version' => $request->integer('expected_version')],
        ])->sole();

        return new PickupTaskResource($task->load(['assignedStaff', 'events']));
    }

    public function takeover(TakeoverRequest $request, PickupTask $task, TakeOverTask $takeover): PickupTaskResource
    {
        $task = $takeover->handle($request->user(), $task->id, $request->integer('expected_version'), $request->integer('expected_assigned_staff_id'), $request->validated('reason'));

        return new PickupTaskResource($task->load(['assignedStaff', 'events']));
    }

    public function bulkAssign(BulkAssignmentRequest $request, AssignPickupTasks $assign): AnonymousResourceCollection
    {
        $selections = array_values(array_map(fn (array $task): array => ['id' => (int) $task['id'], 'expected_version' => (int) $task['expected_version']], $request->validated('tasks')));
        $tasks = $assign->handle($request->user(), $request->integer('assigned_staff_id'), $selections);

        return PickupTaskResource::collection($tasks->load(['assignedStaff', 'events']))
            ->additional(['meta' => ['assigned_count' => $tasks->count()]]);
    }
}
