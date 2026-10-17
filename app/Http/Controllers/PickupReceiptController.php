<?php

namespace App\Http\Controllers;

use App\Actions\Pickup\SendPickupReceipt;
use App\Models\PickupTask;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PickupReceiptController extends Controller
{
    public function send(Request $request, PickupTask $task, SendPickupReceipt $action): JsonResponse
    {
        return response()->json(['data' => $action->handle($request->user(), $task->id)->only(['status', 'recipient', 'channel', 'proof_revision', 'provider_message_id', 'accepted_at', 'delivered_at', 'last_error'])]);
    }
}
