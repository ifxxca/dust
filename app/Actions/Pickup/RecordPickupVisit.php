<?php

namespace App\Actions\Pickup;

use App\Models\PickupTask;
use App\Models\PickupVisit;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class RecordPickupVisit
{
    public function handle(User $user, int $taskId, int $expectedVersion, string $outcome, ?string $reason, ?string $notes): PickupVisit
    {
        return DB::transaction(function () use ($user, $taskId, $expectedVersion, $outcome, $reason, $notes) {
            $actor = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            abort_unless($actor->canExecutePickup(), 403);
            $task = PickupTask::whereKey($taskId)->lockForUpdate()->firstOrFail();
            abort_unless($task->assigned_staff_id === $actor->id, 403);
            $visit = $task->visits()->where('staff_id', $actor->id)->latest('id')->first();
            if ($visit?->outcome !== null && in_array($task->status, ['ASSIGNED', 'NO_PACKAGES'], true)) {
                abort_unless($visit->outcome === $outcome && $visit->reason === $reason && $visit->notes === $notes, 409, 'Hasil kunjungan sudah dicatat; koreksi belum diotorisasi.');

                return $visit;
            }
            abort_unless($task->status === 'ASSIGNED' && $task->execution_started_at !== null && $visit, 409, 'Mulai kunjungan terlebih dahulu.');
            abort_if($task->version !== $expectedVersion, 409, 'TASK_STALE: Muat ulang tugas.');
            $visit->update(['outcome' => $outcome, 'reason' => $reason, 'notes' => $notes, 'recorded_at' => now()]);
            $task->update(['version' => $task->version + 1, 'status' => $outcome === 'NO_PACKAGES' ? 'NO_PACKAGES' : 'ASSIGNED']);
            $task->events()->create(['action' => 'visit_recorded', 'actor_id' => $actor->id, 'task_version' => $task->version, 'reason' => $reason ? mb_substr($reason, 0, 500) : null, 'occurred_at' => now()]);

            return $visit;
        }, 3);
    }
}
