<?php

namespace App\Http\Controllers;

use App\Models\CashlessEntryBatch;
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
        $result = ['id' => $batch->id, 'task_id' => $task->id, 'reference' => $task->reference,
            'customer' => $task->customer_name_snapshot, 'status' => $batch->status,
            'server' => $batch->source === 'nuralamt' ? 'Puman' : 'PM', 'ho_number' => $batch->ho_number,
            'message' => $batch->error_message, 'total' => $batch->items()->count(),
            'accepted' => $batch->items()->where('status', 'ACCEPTED')->count(),
            'items' => $batch->items()->where('status', '!=', 'ACCEPTED')->paginate(50, ['id', 'awb', 'status', 'message'])->withQueryString()];

        return $request->routeIs('mobile.*') ? response()->json($result) : Inertia::render('cashless-entry-result', ['result' => $result]);
    }
}
