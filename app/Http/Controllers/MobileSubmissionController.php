<?php

namespace App\Http\Controllers;

use App\Models\HandoverSession;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class MobileSubmissionController extends Controller
{
    public function show(Request $request, string $submission_key): JsonResponse
    {
        Validator::make(['submission_key' => $submission_key], ['submission_key' => ['required', 'uuid']])->validate();
        $request->validate(['kind' => ['required', 'in:proof,handover,task']]);
        if ($request->input('kind') === 'task') {
            $task = PickupTask::where('creation_submission_key', strtolower($submission_key))->where('created_by', $request->user()->id)->firstOrFail();
            abort_unless($request->user()->can('view', $task), 404);

            return response()->json(['data' => ['kind' => 'task', 'resource_id' => $task->id, 'task_id' => $task->id, 'committed' => true], 'meta' => new \stdClass]);
        }
        if ($request->input('kind') === 'handover') {
            $session = HandoverSession::where('submission_key', $submission_key)->where('created_by', $request->user()->id)->firstOrFail();

            return response()->json(['data' => ['kind' => 'handover', 'resource_id' => $session->id, 'committed' => true], 'meta' => new \stdClass]);
        }
        $record = PickupRecord::where('submission_key', $submission_key)->where('staff_id', $request->user()->id)->firstOrFail();
        $task = PickupTask::findOrFail($record->pickup_task_id);
        abort_unless($request->user()->can('view', $task), 404);

        return response()->json(['data' => ['kind' => 'proof', 'resource_id' => $record->id, 'task_id' => $task->id, 'committed' => true], 'meta' => new \stdClass]);
    }
}
