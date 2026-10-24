<?php

namespace App\Actions\Pickup;

use App\Models\PickupProcessingRecord;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class RecordPackageProcessing
{
    /** @param array<string, mixed> $data */
    public function handle(User $user, int $taskId, array $data): PickupProcessingRecord
    {
        return DB::transaction(function () use ($user, $taskId, $data): PickupProcessingRecord {
            $actor = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            abort_unless($actor->is_active && $actor->role === 'admin_supervisor', 403);
            $payload = ['category' => $data['category'], 'system' => $data['system'], 'expected_revision' => (int) $data['expected_revision'], 'expected_pickup_revision' => (int) $data['expected_pickup_revision'], 'expected_handover_revision' => isset($data['expected_handover_revision']) ? (int) $data['expected_handover_revision'] : null,
                'successful_quantity' => (int) $data['successful_quantity'], 'failed_quantity' => (int) $data['failed_quantity'], 'pending_quantity' => (int) $data['pending_quantity'], 'unknown_quantity' => (int) $data['unknown_quantity'], 'external_reference' => $data['external_reference'] ?? null, 'reason' => $data['reason']];
            $hash = hash('sha256', json_encode($payload, JSON_THROW_ON_ERROR));
            $task = PickupTask::whereKey($taskId)->lockForUpdate()->firstOrFail();
            $existing = PickupProcessingRecord::where('submission_key', $data['submission_key'])->first();
            if ($existing) {
                abort_unless($existing->pickup_task_id === $taskId && $existing->actor_id === $actor->id && hash_equals($existing->payload_hash, $hash), 409, 'Kunci pengiriman sudah digunakan untuk catatan lain.');

                return $existing;
            }
            $proof = $task->proof()->with('revisions')->first();
            abort_unless($proof?->finalized_at !== null, 409, 'Finalisasi POP sebelum mencatat pemrosesan.');
            $latest = PickupProcessingRecord::where('pickup_task_id', $taskId)->where('category', $data['category'])->where('system', $data['system'])->orderByDesc('revision')->first();
            abort_if(($latest->revision ?? 0) !== (int) $data['expected_revision'], 409, 'Catatan pemrosesan berubah. Muat ulang lalu tinjau revisi terbaru.');
            abort_if($proof->revisionNumber() !== (int) $data['expected_pickup_revision'], 409, 'POP berubah. Muat ulang dan tinjau baseline.');
            $item = $task->handoverItem()->with('revisions')->first();
            $handoverRevision = $item && $item->status !== 'PENDING' ? ($item->latestCorrection()->revision ?? 0) : null;
            abort_if($handoverRevision !== $payload['expected_handover_revision'], 409, 'Penerimaan Retail berubah. Muat ulang dan tinjau baseline.');
            $received = $handoverRevision === null ? null : $item->effectiveValues()[$data['category']];
            $record = PickupProcessingRecord::create([
                ...collect($payload)->except(['expected_revision', 'expected_pickup_revision', 'expected_handover_revision'])->all(),
                'pickup_task_id' => $taskId, 'revision' => ($latest->revision ?? 0) + 1,
                'submission_key' => $data['submission_key'], 'payload_hash' => $hash,
                'pickup_revision' => $proof->revisionNumber(), 'handover_revision' => $handoverRevision,
                'received_quantity' => $received, 'actor_id' => $actor->id,
            ]);
            $task->update(['version' => $task->version + 1]);
            $task->events()->create(['actor_id' => $actor->id, 'action' => $latest ? 'processing_corrected' : 'processing_recorded', 'task_version' => $task->version, 'reason' => $data['reason'], 'occurred_at' => now()]);

            return $record;
        }, 3);
    }
}
