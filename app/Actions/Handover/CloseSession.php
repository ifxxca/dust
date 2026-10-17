<?php

namespace App\Actions\Handover;

use App\Models\HandoverSession;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class CloseSession
{
    public function handle(User $user, int $sessionId, int $expectedVersion): HandoverSession
    {
        return DB::transaction(function () use ($user, $sessionId, $expectedVersion) {
            $actor = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            abort_unless($actor->canVerifyHandover(), 403);
            $session = HandoverSession::whereKey($sessionId)->lockForUpdate()->firstOrFail();
            if ($session->status === 'CLOSED') {
                return $session;
            }
            abort_if($session->version !== $expectedVersion, 409, 'SESSION_STALE: Muat ulang session.');
            abort_unless($session->items()->exists() && ! $session->items()->where('status', 'PENDING')->exists(), 409, 'Semua item harus diperiksa sebelum penutupan.');
            foreach ($session->items()->with(['proof.revisions', 'revisions'])->get() as $item) {
                abort_if($item->needsReview(), 409, 'POP berubah setelah verifikasi. Admin harus memeriksa ulang hasil.');
                $values = $item->effectiveValues();
                abort_if($values['status'] === 'DISCREPANCY' && blank($values['discrepancy_notes']), 409, 'Semua discrepancy harus memiliki catatan.');
            }
            $session->update(['status' => 'CLOSED', 'closed_by' => $actor->id, 'closed_at' => now(), 'version' => $session->version + 1]);
            $session->events()->create(['actor_id' => $actor->id, 'action' => 'closed', 'session_version' => $session->version, 'occurred_at' => now()]);

            return $session;
        }, 3);
    }
}
