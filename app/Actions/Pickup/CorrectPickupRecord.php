<?php

namespace App\Actions\Pickup;

use App\Models\HandoverItem;
use App\Models\HandoverSession;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class CorrectPickupRecord
{
    /** @param array<string, mixed> $data */
    public function handle(User $user, int $taskId, array $data): PickupTask
    {
        return DB::transaction(function () use ($user, $taskId, $data) {
            $actor = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            abort_unless($actor->is_active && $actor->role === 'admin_supervisor', 403);
            $sessionId = HandoverItem::where('pickup_task_id', $taskId)->value('handover_session_id');
            $session = $sessionId !== null ? HandoverSession::whereKey($sessionId)->lockForUpdate()->firstOrFail() : null;
            $task = PickupTask::whereKey($taskId)->lockForUpdate()->firstOrFail();
            abort_if($task->version !== (int) $data['expected_version'], 409, 'TASK_STALE: Muat ulang tugas.');
            abort_unless($task->status === 'PICKED_UP', 409, 'POP belum difinalisasi.');
            $item = $task->handoverItem()->lockForUpdate()->first();
            abort_if($item?->handover_session_id !== $sessionId, 409, 'SESSION_STALE: Keanggotaan handover berubah. Muat ulang tugas.');
            $proof = $task->proof()->firstOrFail();
            $values = collect($data)->only(['customer_name', 'pickup_address', 'contact', 'manual_hybrid', 'cashless_hybrid', 'css_orion', 'notes'])->all();
            $proof->revisions()->create(['revision' => $proof->revisionNumber() + 1, 'values' => $values, 'actor_id' => $actor->id, 'reason' => $data['reason']]);
            $proof->receipts()->create(['proof_revision' => $proof->revisionNumber() + 1, 'recipient' => $values['contact'], 'status' => 'PENDING_CONFIGURATION']);
            $task->update(['version' => $task->version + 1]);
            $task->events()->create(['action' => 'proof_corrected', 'actor_id' => $actor->id, 'task_version' => $task->version, 'reason' => $data['reason'], 'occurred_at' => now()]);
            if ($item !== null && $session !== null) {
                $session->update(['version' => $session->version + 1]);
                $session->events()->create(['actor_id' => $actor->id, 'handover_item_id' => $item->id, 'action' => 'pickup_corrected', 'session_version' => $session->version, 'reason' => $data['reason'], 'changes' => ['pickup_revision' => $proof->revisionNumber() + 1], 'occurred_at' => now()]);
            }

            return $task;
        }, 3);
    }
}
