<?php

namespace App\Actions\Handover;

use App\Models\HandoverItem;
use App\Models\HandoverSession;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class AmendSession
{
    /** @param list<int>|null $taskIds */
    public function handle(User $user, int $sessionId, int $expectedVersion, string $reason, ?array $taskIds = null): HandoverSession
    {
        return DB::transaction(function () use ($user, $sessionId, $expectedVersion, $reason, $taskIds) {
            $actor = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            abort_unless($actor->canExecutePickup(), 403);
            $session = HandoverSession::whereKey($sessionId)->lockForUpdate()->firstOrFail();
            abort_if($session->version !== $expectedVersion, 409, 'SESSION_STALE: Muat ulang session.');
            if ($taskIds === null) {
                abort_unless($actor->role === 'admin_supervisor', 403);
                abort_unless($session->status === 'CLOSED', 409, 'Hanya session CLOSED yang dapat dibuka kembali.');
                $changes = $session->only(['status', 'closed_by', 'closed_at']);
                $session->update(['status' => 'IN_VERIFICATION', 'closed_by' => null, 'closed_at' => null, 'version' => $session->version + 1]);
                $action = 'reopened';
            } else {
                abort_unless($session->status === 'DRAFT', 409, 'Anggota hanya dapat diubah selama DRAFT.');
                $oldIds = $session->items()->pluck('pickup_task_id')->map(fn ($id) => (int) $id)->all();
                $tasks = PickupTask::whereIn('id', array_unique([...$oldIds, ...$taskIds]))->orderBy('id')->lockForUpdate()->get();
                $proofIds = PickupRecord::whereIn('pickup_task_id', $taskIds)->pluck('id', 'pickup_task_id');
                $memberships = HandoverItem::whereIn('pickup_task_id', $taskIds)->orderBy('pickup_task_id')->lockForUpdate()->pluck('handover_session_id', 'pickup_task_id');
                foreach ($taskIds as $id) {
                    $task = $tasks->firstWhere('id', $id);
                    abort_unless($task && $task->status === 'PICKED_UP' && $proofIds->has($id), 409, 'Task belum siap diserahkan.');
                    $memberSessionId = $memberships->get($id);
                    abort_if($memberSessionId !== null && $memberSessionId !== $session->id, 409, 'Task sudah masuk session lain.');
                }
                $session->items()->whereNotIn('pickup_task_id', $taskIds)->delete();
                foreach (array_diff($taskIds, $oldIds) as $id) {
                    $session->items()->create(['pickup_task_id' => $id, 'pickup_record_id' => $proofIds->get($id)]);
                }
                $changes = ['previous_task_ids' => $oldIds, 'new_task_ids' => $taskIds];
                $session->update(['version' => $session->version + 1]);
                $action = 'membership_changed';
            }
            $session->events()->create(['actor_id' => $actor->id, 'action' => $action, 'session_version' => $session->version, 'reason' => $reason, 'changes' => $changes, 'occurred_at' => now()]);

            return $session;
        }, 3);
    }
}
