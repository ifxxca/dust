<?php

namespace App\Http\Controllers;

use App\Actions\Pickup\CorrectFailedCashlessAwb;
use App\Models\CashlessEntryBatch;
use App\Models\CashlessEntryItem;
use App\Models\PickupCashlessAwb;
use App\Models\PickupTask;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class CashlessEntryResultController extends Controller
{
    public function show(Request $request, CashlessEntryBatch $batch): Response|JsonResponse
    {
        abort_unless($request->user()?->is_active && $batch->created_by === $request->user()->id, 404);
        $request->validate(['page' => ['sometimes', 'integer', 'min:1']]);
        $task = PickupTask::findOrFail($batch->pickup_task_id);
        $items = $batch->items()->whereNotIn('status', ['ACCEPTED', 'CONFIRMED'])->paginate(50, ['id', 'awb', 'status', 'message', 'pickup_cashless_awb_id'])->withQueryString();
        $recordIds = $items->getCollection()->pluck('pickup_cashless_awb_id');
        $records = PickupCashlessAwb::whereIn('id', $recordIds)->get(['id', 'awb', 'version'])->keyBy('id');
        $nextAttempts = CashlessEntryItem::whereIn('pickup_cashless_awb_id', $recordIds)->where('batch_id', '>', $batch->id)
            ->select('pickup_cashless_awb_id')->selectRaw('MAX(batch_id) as next_batch_id')->groupBy('pickup_cashless_awb_id')->pluck('next_batch_id', 'pickup_cashless_awb_id');
        $items->through(function (CashlessEntryItem $item) use ($records, $nextAttempts, $batch, $request): array {
            $record = $records->get($item->pickup_cashless_awb_id);

            return [...$item->only(['id', 'awb', 'status', 'message']), 'version' => $record?->version,
                'replacement_batch_id' => $nextAttempts->get($item->pickup_cashless_awb_id),
                'can_correct' => $request->user()->canExecutePickup()
                    && (! $request->routeIs('mobile.*') || $request->user()->tokenCan('mobile:execute') || $request->user()->tokenCan('mobile:handover'))
                    && in_array($batch->status, CashlessEntryBatch::Terminal, true)
                    && in_array($item->status, CorrectFailedCashlessAwb::Correctable, true)
                    && $record?->awb === $item->awb && ! $nextAttempts->has($item->pickup_cashless_awb_id)];
        });
        $result = ['id' => $batch->id, 'task_id' => $task->id, 'reference' => $task->reference,
            'customer' => $task->customer_name_snapshot, 'status' => $batch->status,
            'server' => $batch->source === 'nuralamt' ? 'Puman' : 'PM', 'ho_number' => $batch->ho_number,
            'message' => $batch->error_message, 'total' => $batch->items()->count(),
            'accepted' => $batch->items()->whereIn('status', ['ACCEPTED', 'CONFIRMED'])->count(),
            'items' => $items];

        return $request->routeIs('mobile.*', 'retail.*') ? response()->json($result) : Inertia::render('cashless-entry-result', ['result' => $result]);
    }

    public function correct(Request $request, CashlessEntryBatch $batch, int $item, CorrectFailedCashlessAwb $action): JsonResponse
    {
        abort_unless($request->user()?->canExecutePickup() && $batch->created_by === $request->user()->id, 404);
        $next = $action->handle($request->user(), $batch->id, $item, $request->only(['submission_key', 'expected_version', 'awb']));

        return response()->json(['batch_id' => $next->id, 'status' => $next->status,
            'message' => 'Resi pengganti tersimpan. Hanya resi pengganti yang masuk antrean; jumlah POP tetap.']);
    }
}
