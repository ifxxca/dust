<?php

namespace App\Http\Controllers;

use App\Actions\Pickup\ChangeTaskLifecycle;
use App\Models\PickupTask;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PickupLifecycleController extends Controller
{
    public function retry(Request $request, PickupTask $task, ChangeTaskLifecycle $action): JsonResponse
    {
        return $this->change($request, $task, $action, 'retry');
    }

    public function cancel(Request $request, PickupTask $task, ChangeTaskLifecycle $action): JsonResponse
    {
        return $this->change($request, $task, $action, 'cancel');
    }

    private function change(Request $request, PickupTask $task, ChangeTaskLifecycle $action, string $operation): JsonResponse
    {
        $data = $request->validate(['expected_version' => ['required', 'integer', 'min:1'], 'reason' => ['required', 'string', 'max:500']]);
        $result = $action->handle($request->user(), $task->id, (int) $data['expected_version'], $operation, $data['reason']);

        return response()->json(['data' => ['id' => $result->id, 'status' => $result->status, 'version' => $result->version]]);
    }
}
