<?php

namespace App\Actions\Pickup;

use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class TakeOverTask
{
    public function handle(User $user, int $taskId, int $expectedVersion, ?int $expectedStaffId, ?string $reason = null): PickupTask
    {
        return DB::transaction(function () use ($user, $taskId, $expectedVersion, $expectedStaffId, $reason) {
            $actor = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            abort_unless($actor->canExecutePickup(), 403);
            $task = PickupTask::whereKey($taskId)->lockForUpdate()->firstOrFail();
            abort_if($task->version !== $expectedVersion || $task->assigned_staff_id !== $expectedStaffId, 409, 'TASK_STALE: Tugas sudah berubah. Muat ulang dan tinjau kembali.');
            abort_unless($task->eligibleFor($actor), 409, 'TASK_NOT_ELIGIBLE: Tugas tidak dapat diambil alih.');
            $previous = $task->assigned_staff_id;
            $task->update(['status' => 'ASSIGNED', 'assigned_staff_id' => $actor->id, 'version' => $task->version + 1]);
            $task->events()->create(['action' => $previous === null ? 'assigned' : 'taken_over', 'actor_id' => $actor->id, 'previous_staff_id' => $previous,
                'new_staff_id' => $actor->id, 'task_version' => $task->version, 'reason' => $reason, 'occurred_at' => now()]);

            return $task;
        }, 3);
    }
}
