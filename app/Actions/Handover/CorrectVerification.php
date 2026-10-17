<?php

namespace App\Actions\Handover;

use App\Models\HandoverSession;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CorrectVerification
{
    /** @param array<string, mixed> $data */
    public function handle(User $user, int $sessionId, int $itemId, array $data): HandoverSession
    {
        return DB::transaction(function () use ($user, $sessionId, $itemId, $data) {
            $actor = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            abort_unless($actor->is_active && $actor->role === 'admin_supervisor', 403);
            $session = HandoverSession::whereKey($sessionId)->lockForUpdate()->firstOrFail();
            abort_unless($session->status === 'IN_VERIFICATION', 409, 'Reopen session CLOSED sebelum mengoreksi hasil.');
            abort_if($session->version !== (int) $data['expected_version'], 409, 'SESSION_STALE: Muat ulang session.');
            $item = $session->items()->whereKey($itemId)->lockForUpdate()->firstOrFail();
            abort_if($item->status === 'PENDING', 409, 'Gunakan verifikasi awal untuk item yang belum diperiksa.');
            PickupTask::whereKey($item->pickup_task_id)->lockForUpdate()->firstOrFail();
            $proof = $item->proof;
            $retail = ['manual_hybrid' => (int) $data['manual_hybrid'], 'cashless_hybrid' => (int) $data['cashless_hybrid'], 'css_orion' => (int) $data['css_orion']];
            $values = $proof->effectiveValues();
            $pickup = ['manual_hybrid' => (int) $values['manual_hybrid'], 'cashless_hybrid' => (int) $values['cashless_hybrid'], 'css_orion' => (int) $values['css_orion']];
            $result = (new CompareQuantities)->handle($pickup, $retail);
            $notes = $data['discrepancy_notes'] ?? null;
            if ($result['status'] === 'DISCREPANCY' && blank($notes)) {
                throw ValidationException::withMessages(['discrepancy_notes' => 'Catatan wajib ketika ada selisih.']);
            }
            $revision = $item->revisions->isEmpty() ? 1 : $item->revisions->last()->revision + 1;
            $item->revisions()->create(['revision' => $revision, 'pickup_revision' => $proof->revisionNumber(), 'values' => [...$retail, 'status' => $result['status'], 'discrepancy_notes' => $notes, 'verified_by' => $actor->id, 'verified_at' => now()->toIso8601String()], 'actor_id' => $actor->id, 'reason' => $data['reason']]);
            $session->update(['version' => $session->version + 1]);
            $session->events()->create(['actor_id' => $actor->id, 'handover_item_id' => $item->id, 'action' => 'verification_corrected', 'session_version' => $session->version, 'reason' => $data['reason'], 'occurred_at' => now()]);

            return $session;
        }, 3);
    }
}
