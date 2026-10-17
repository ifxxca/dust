<?php

namespace App\Actions\Handover;

use App\Models\HandoverSession;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class CreateSession
{
    /** @param list<int> $taskIds */
    public function handle(User $user, array $taskIds, string $submissionKey): HandoverSession
    {
        return DB::transaction(function () use ($user, $taskIds, $submissionKey) {
            $actor = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            abort_unless($actor->canExecutePickup(), 403);
            $existing = HandoverSession::where('submission_key', $submissionKey)->first();
            if ($existing) {
                abort_unless($existing->created_by === $actor->id, 409);

                return $existing;
            }
            $tasks = PickupTask::whereIn('id', $taskIds)->orderBy('id')->lockForUpdate()->get();
            abort_unless($tasks->count() === count($taskIds), 409, 'Task tidak tersedia.');
            foreach ($tasks as $task) {
                $membership = $task->handoverItem()->lockForUpdate()->first();
                abort_unless($task->status === 'PICKED_UP' && $task->proof()->exists() && $membership === null, 409, 'Task belum final atau sudah masuk session. Muat ulang kandidat.');
            }
            $session = HandoverSession::create(['reference' => (string) Str::ulid(), 'submission_key' => $submissionKey, 'created_by' => $actor->id]);
            foreach ($tasks as $task) {
                $session->items()->create(['pickup_task_id' => $task->id, 'pickup_record_id' => $task->proof->id]);
            }
            $session->events()->create(['actor_id' => $actor->id, 'action' => 'created', 'session_version' => 1, 'occurred_at' => now()]);

            return $session->refresh();
        }, 3);
    }
}
