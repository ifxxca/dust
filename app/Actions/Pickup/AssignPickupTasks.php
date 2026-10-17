<?php

namespace App\Actions\Pickup;

use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class AssignPickupTasks
{
    /**
     * @param  list<array{id: int, expected_version: int}>  $selections
     * @return Collection<int, PickupTask>
     */
    public function handle(User $user, int $staffId, array $selections): Collection
    {
        return DB::transaction(function () use ($user, $staffId, $selections) {
            $users = User::whereKey([$user->id, $staffId])->orderBy('id')->lockForUpdate()->get()->keyBy('id');
            abort_unless($users->get($user->id)?->canManagePickup(), 403);
            if (! $users->get($staffId)?->canExecutePickup()) {
                throw ValidationException::withMessages(['assigned_staff_id' => 'Pilih petugas operasional yang masih aktif.']);
            }

            $versions = collect($selections)->pluck('expected_version', 'id');
            $tasks = PickupTask::whereKey($versions->keys())->orderBy('id')->lockForUpdate()->get();
            abort_if($tasks->count() !== count($selections), 409, 'TASK_STALE: Daftar tugas berubah. Muat ulang dan pilih kembali.');
            foreach ($tasks as $task) {
                abort_if($task->version !== $versions->get($task->id) || $task->status !== 'SCHEDULED', 409,
                    'TASK_STALE: PCK-'.$task->id.' sudah berubah atau ditugaskan. Tidak ada tugas dalam permintaan ini yang diubah. Muat ulang dan pilih kembali.');
            }
            foreach ($tasks as $task) {
                $task->update(['status' => 'ASSIGNED', 'assigned_staff_id' => $staffId, 'version' => $task->version + 1]);
                $task->events()->create(['action' => 'assigned', 'actor_id' => $user->id, 'previous_staff_id' => null,
                    'new_staff_id' => $staffId, 'task_version' => $task->version, 'reason' => null, 'occurred_at' => now()]);
            }

            return $tasks;
        }, 3);
    }
}
