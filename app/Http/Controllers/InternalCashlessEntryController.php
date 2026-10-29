<?php

namespace App\Http\Controllers;

use App\Actions\Pickup\ManageCashlessEntryBatches;
use App\Http\Requests\CashlessEntryCheckpointRequest;
use App\Models\CashlessEntryBatch;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class InternalCashlessEntryController extends Controller
{
    public function claim(Request $request, ManageCashlessEntryBatches $action): JsonResponse|Response
    {
        $source = $request->attributes->get('report_source');
        abort_unless(in_array($source, ManageCashlessEntryBatches::Sources, true), 403);
        $data = $request->validate(['claim_key' => ['required', 'uuid']]);
        $batch = $action->claim($source, $request->header('X-Worker-ID'), $data['claim_key']);
        if ($batch === null) {
            return response()->noContent();
        }

        return response()->json(['data' => [...$batch->only(['id', 'source', 'status', 'ho_number']),
            'claim_token' => $action->token($batch), 'lease_seconds' => 300,
            'fresh_session_required' => $batch->status === 'CLAIMED' && CashlessEntryBatch::where('source', $source)->where('status', 'UNKNOWN')->exists(),
            'items' => $batch->items->map->only(['id', 'awb', 'status'])->values()]]);
    }

    public function checkpoint(CashlessEntryCheckpointRequest $request, int $batch, ManageCashlessEntryBatches $action): JsonResponse
    {
        $result = $action->checkpoint($batch, $request->attributes->get('report_source'), $request->header('X-Worker-ID'),
            $request->header('X-Cashless-Claim', ''), $request->validated());

        return response()->json(['data' => $result->only(['id', 'status', 'ho_number', 'approved_at'])]);
    }
}
