<?php

namespace App\Actions\Pickup;

use App\Models\PickupTask;
use App\Models\PickupVisit;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class StartPickup
{
    public function handle(User $user, int $taskId, int $expectedVersion): PickupVisit
    {
        return DB::transaction(function () use ($user, $taskId, $expectedVersion) {
            $actor = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            abort_unless($actor->canExecutePickup(), 403);
            $task = PickupTask::whereKey($taskId)->lockForUpdate()->firstOrFail();
            abort_unless($task->assigned_staff_id === $actor->id, 403, 'Tugas bukan tanggung jawab Anda.');
            abort_unless($task->status === 'ASSIGNED', 409, 'TASK_NOT_EXECUTABLE');
            $existing = $task->visits()->latest('id')->first();
            if ($existing && $existing->outcome === null) {
                return $existing;
            }
            abort_if($task->execution_started_at !== null || $existing !== null, 409, 'Kunjungan sudah dicatat. Kunjungan berikutnya harus menggunakan task baru.');
            abort_if($task->version !== $expectedVersion, 409, 'TASK_STALE: Muat ulang tugas.');
            $task->update(['execution_started_at' => now(), 'version' => $task->version + 1]);
            $visit = $task->visits()->create(['staff_id' => $actor->id, 'started_at' => $task->execution_started_at]);
            $task->events()->create(['action' => 'execution_started', 'actor_id' => $actor->id, 'new_staff_id' => $actor->id, 'task_version' => $task->version, 'occurred_at' => now()]);

            return $visit;
        }, 3);
    }
}
