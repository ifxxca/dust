<?php

namespace App\Actions\Handover;

use App\Models\HandoverSession;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class VerifyItem
{
    /** @param array<string, mixed> $data */
    public function handle(User $user, int $sessionId, int $itemId, array $data): HandoverSession
    {
        return DB::transaction(function () use ($user, $sessionId, $itemId, $data) {
            $actor = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            abort_unless($actor->canVerifyHandover(), 403);
            $session = HandoverSession::whereKey($sessionId)->lockForUpdate()->firstOrFail();
            abort_if($session->status === 'CLOSED', 409, 'Session sudah ditutup. Koreksi/reopen belum diotorisasi.');
            $member = $session->items()->whereKey($itemId)->firstOrFail(['id', 'pickup_task_id']);
            PickupTask::whereKey($member->pickup_task_id)->lockForUpdate()->firstOrFail();
            $item = $session->items()->whereKey($itemId)->lockForUpdate()->firstOrFail();
            abort_unless($item->status === 'PENDING', 409, 'Item telah diperiksa. Koreksi tidak boleh menimpa hasil awal.');
            abort_if($session->version !== (int) $data['expected_version'], 409, 'SESSION_STALE: Muat ulang session.');
            $proof = $item->proof;
            abort_if(isset($data['expected_pickup_revision']) && $proof->revisionNumber() !== (int) $data['expected_pickup_revision'], 409, 'POP berubah. Muat ulang session dan periksa jumlah POP sebelum menyimpan.');
            $values = $proof->effectiveValues();
            $pickup = ['manual_hybrid' => (int) $values['manual_hybrid'], 'cashless_hybrid' => (int) $values['cashless_hybrid'], 'css_orion' => (int) $values['css_orion']];
            $retail = ['manual_hybrid' => (int) $data['manual_hybrid'], 'cashless_hybrid' => (int) $data['cashless_hybrid'], 'css_orion' => (int) $data['css_orion']];
            $result = (new CompareQuantities)->handle($pickup, $retail);
            $notes = $data['discrepancy_notes'] ?? null;
            if ($result['status'] === 'DISCREPANCY' && blank($notes)) {
                throw ValidationException::withMessages(['discrepancy_notes' => 'Catatan wajib ketika ada selisih pada kategori mana pun.']);
            }
            $item->update([...$retail, 'status' => $result['status'], 'discrepancy_notes' => $notes, 'verified_by' => $actor->id, 'verified_at' => now(), 'verified_pickup_revision' => $proof->revisionNumber()]);
            $session->update(['status' => 'IN_VERIFICATION', 'verification_started_at' => $session->verification_started_at ?? now(), 'version' => $session->version + 1]);
            $session->events()->create(['actor_id' => $actor->id, 'handover_item_id' => $item->id, 'action' => 'item_verified', 'session_version' => $session->version, 'changes' => ['pickup_revision' => $proof->revisionNumber(), 'pickup' => $pickup, 'retail' => $retail, 'differences' => $result['differences']], 'occurred_at' => now()]);

            return $session;
        }, 3);
    }
}
