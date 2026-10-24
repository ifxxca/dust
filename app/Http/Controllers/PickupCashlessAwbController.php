<?php

namespace App\Http\Controllers;

use App\Actions\Pickup\RecordCashlessAwb;
use App\Actions\Reports\QueryCashlessReconciliation;
use App\Http\Requests\RecordCashlessAwbRequest;
use App\Models\JneShipment;
use App\Models\PickupCashlessAwb;
use App\Models\PickupCashlessAwbEvent;
use App\Models\PickupTask;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class PickupCashlessAwbController extends Controller
{
    public function index(Request $request, PickupTask $task, QueryCashlessReconciliation $reconciliation): JsonResponse
    {
        Gate::authorize('viewCashlessAwb', $task);
        $request->validate(['page' => ['sometimes', 'integer', 'min:1']]);
        $records = PickupCashlessAwb::where('pickup_task_id', $task->id)->withCount('events')->orderByDesc('id')->paginate(50);
        $shipments = JneShipment::whereIn('awb', $records->pluck('awb')->filter())->get(['id', 'awb', 'customer_match_status', 'match_status', 'customer_id', 'pickup_task_id'])->keyBy('awb');
        $events = PickupCashlessAwbEvent::whereIn('pickup_cashless_awb_id', $records->pluck('id'))->orderByDesc('id')->limit(100)->get()->groupBy('pickup_cashless_awb_id');

        return response()->json(['data' => $records->getCollection()->map(fn (PickupCashlessAwb $record): array => [
            ...$record->only(['id', 'awb', 'raw_awb', 'original_awb', 'version', 'customer_id', 'pickup_task_id', 'created_at', 'events_count']),
            'shipment' => $record->awb ? $shipments->get($record->awb) : null,
            'events' => $events->get($record->id, collect())->map(fn ($event): array => $event->only(['id', 'revision', 'previous_awb', 'awb', 'previous_raw_awb', 'raw_awb', 'actor_id', 'reason', 'created_at', 'affected_results']))]),
            'meta' => ['current_page' => $records->currentPage(), 'last_page' => $records->lastPage(), 'total' => $records->total()],
            'can' => ['record' => $request->user()->can('recordCashlessAwb', $task), 'correct' => $request->user()->can('correctCashlessAwb', $task)],
            'reconciliation' => $reconciliation->handle($task)]);
    }

    public function history(Request $request, PickupTask $task, int $evidence): JsonResponse
    {
        Gate::authorize('viewCashlessAwb', $task);
        $request->validate(['page' => ['sometimes', 'integer', 'min:1']]);
        $record = PickupCashlessAwb::where('pickup_task_id', $task->id)->findOrFail($evidence);
        $events = $record->events()->paginate(50)->through(fn ($event): array => $event->only(['id', 'revision', 'previous_awb', 'awb', 'previous_raw_awb', 'raw_awb', 'actor_id', 'customer_id', 'pickup_task_id', 'reason', 'created_at', 'affected_results']));

        return response()->json($events);
    }

    public function store(RecordCashlessAwbRequest $request, PickupTask $task, RecordCashlessAwb $action): JsonResponse
    {
        $record = $action->handle($request->user(), $task->id, $request->validated());

        return response()->json(['data' => $record->only(['id', 'awb', 'version'])]);
    }

    public function correct(RecordCashlessAwbRequest $request, PickupTask $task, RecordCashlessAwb $action): JsonResponse
    {
        $record = $action->handle($request->user(), $task->id, $request->validated(), true);

        return response()->json(['data' => $record->only(['id', 'awb', 'version'])]);
    }
}
