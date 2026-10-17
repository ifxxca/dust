<?php

namespace App\Http\Controllers;

use App\Actions\Pickup\RecordPickupVisit;
use App\Actions\Pickup\StartPickup;
use App\Http\Requests\RecordPickupVisitRequest;
use App\Http\Resources\PickupVisitResource;
use App\Models\PickupTask;
use Illuminate\Http\Request;

class PickupExecutionController extends Controller
{
    public function start(Request $request, PickupTask $task, StartPickup $start): PickupVisitResource
    {
        $data = $request->validate(['expected_version' => ['required', 'integer', 'min:1']]);

        return new PickupVisitResource($start->handle($request->user(), $task->id, $data['expected_version']));
    }

    public function record(RecordPickupVisitRequest $request, PickupTask $task, RecordPickupVisit $record): PickupVisitResource
    {
        return new PickupVisitResource($record->handle($request->user(), $task->id, $request->integer('expected_version'), $request->validated('outcome'), $request->validated('reason'), $request->validated('notes')));
    }
}
