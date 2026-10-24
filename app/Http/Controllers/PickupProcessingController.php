<?php

namespace App\Http\Controllers;

use App\Actions\Pickup\RecordPackageProcessing;
use App\Http\Requests\RecordPackageProcessingRequest;
use App\Models\PickupTask;
use Illuminate\Http\JsonResponse;

class PickupProcessingController extends Controller
{
    public function store(RecordPackageProcessingRequest $request, PickupTask $task, RecordPackageProcessing $action): JsonResponse
    {
        $record = $action->handle($request->user(), $task->id, $request->validated());

        return response()->json(['data' => ['id' => $record->id, 'revision' => $record->revision, 'provenance' => 'MANUAL', 'externally_confirmed' => false]]);
    }
}
