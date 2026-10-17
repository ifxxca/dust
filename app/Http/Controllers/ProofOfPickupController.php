<?php

namespace App\Http\Controllers;

use App\Actions\Pickup\FinalizePickup;
use App\Actions\Pickup\SendPickupReceipt;
use App\Http\Requests\FinalizePickupRequest;
use App\Http\Resources\PickupRecordResource;
use App\Models\PickupAttachment;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class ProofOfPickupController extends Controller
{
    public function store(FinalizePickupRequest $request, PickupTask $task, FinalizePickup $action, SendPickupReceipt $sender): PickupRecordResource
    {
        $record = $action->handle($request->user(), $task->id, $request->validated());
        if (config('pickup.receipt_channel') === 'email' && ! in_array($record->receipt?->status, ['PROCESSING', 'UNKNOWN', 'ACCEPTED_BY_PROVIDER', 'DELIVERED'], true)) {
            try {
                $sender->handle($request->user(), $task->id);
            } catch (\Throwable $exception) {
                report($exception);
            }
        }

        return new PickupRecordResource($record->refresh()->load(['attachments', 'receipt', 'receipts', 'revisions']));
    }

    public function attachment(Request $request, PickupAttachment $attachment): BinaryFileResponse
    {
        $record = PickupRecord::findOrFail($attachment->pickup_record_id);
        $task = PickupTask::findOrFail($record->pickup_task_id);
        abort_unless($request->user()->can('view', $task), 404);
        abort_unless(Storage::disk('local')->exists($attachment->path), 404);

        return response()->file(Storage::disk('local')->path($attachment->path), ['Content-Type' => $attachment->mime_type, 'Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff']);
    }
}
