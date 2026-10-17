<?php

namespace App\Actions\Pickup;

use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class ChangeTaskLifecycle
{
    public function handle(User $user, int $taskId, int $expectedVersion, string $operation, string $reason): PickupTask
    {
        return DB::transaction(function () use ($user, $taskId, $expectedVersion, $operation, $reason) {
            $actor = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            $task = PickupTask::whereKey($taskId)->lockForUpdate()->firstOrFail();
            $visit = $task->visits()->latest('id')->first();
            $manager = $actor->canManagePickup();
            abort_unless($manager || ($operation === 'retry' && $actor->canExecutePickup() && $task->assigned_staff_id === $actor->id), 403);
            abort_if($task->version !== $expectedVersion, 409, 'TASK_STALE: Muat ulang tugas.');
            abort_unless(in_array($task->status, ['SCHEDULED', 'ASSIGNED'], true), 409, 'Tugas tidak dapat ditindaklanjuti.');
            if ($operation === 'retry') {
                abort(409, 'Kunjungan berikutnya harus dibuat sebagai task baru.');
            } else {
                abort_unless($manager, 403);
                abort_if($task->execution_started_at !== null && $visit?->outcome !== 'NO_PACKAGES', 409, 'Selesaikan pencatatan kunjungan; tugas dengan paket terkumpul tidak dapat dibatalkan.');
                $task->update(['status' => 'CANCELLED', 'version' => $task->version + 1]);
            }
            $task->events()->create(['action' => $operation === 'retry' ? 'retry_authorized' : 'cancelled', 'actor_id' => $actor->id, 'new_staff_id' => $task->assigned_staff_id, 'task_version' => $task->version, 'reason' => $reason, 'occurred_at' => now()]);

            return $task;
        }, 3);
    }
}
