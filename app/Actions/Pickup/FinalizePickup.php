<?php

namespace App\Actions\Pickup;

use App\Models\Customer;
use App\Models\PickupCashlessAwb;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class FinalizePickup
{
    public function __construct(private RecordCashlessHandover $cashless, private ManageCashlessEntryBatches $entries) {}

    /** @param array<string, mixed> $data */
    public function handle(User $user, int $taskId, array $data): PickupRecord
    {
        $stored = [];
        try {
            return DB::transaction(function () use ($user, $taskId, $data, &$stored) {
                $actor = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
                abort_unless($actor->canExecutePickup(), 403);
                if ($data['cashless_capture'] ?? false) {
                    $customerId = PickupTask::whereKey($taskId)->value('customer_id');
                    Customer::whereKey($customerId)->lockForUpdate()->firstOrFail();
                }
                $task = PickupTask::whereKey($taskId)->lockForUpdate()->firstOrFail();
                abort_unless($task->assigned_staff_id === $actor->id, 403);
                $existing = $task->proof()->first();
                $awbs = ($data['cashless_capture'] ?? false) ? array_values($data['cashless_awbs'] ?? []) : null;
                $captureHash = $awbs === null ? null : hash('sha256', json_encode(['nuralamt', $awbs], JSON_THROW_ON_ERROR));
                if ($existing !== null) {
                    abort_unless($existing->submission_key === $data['submission_key'], 409, 'Bukti pickup sudah final. Koreksi memerlukan kebijakan tersendiri.');
                    abort_unless($existing->cashless_capture_hash === $captureHash, 409, 'Daftar resi pada POP yang sudah tersimpan tidak dapat diganti.');
                    $this->entries->enqueueUnbatched($taskId, 'Pemeriksaan ulang antrean saat pengiriman POP final.');

                    return $existing->load(['attachments', 'receipt']);
                }
                abort_unless($task->status === 'ASSIGNED' && $task->execution_started_at !== null, 409, 'Pickup belum dimulai.');
                abort_if($task->version !== (int) $data['expected_version'], 409, 'TASK_STALE: Muat ulang tugas.');
                $visit = $task->visits()->latest('id')->first();
                abort_unless($visit?->outcome === 'COLLECTED' && $visit->staff_id === $actor->id, 409, 'Catat kunjungan berhasil sebelum finalisasi.');
                if ($awbs !== null) {
                    if (count($awbs) !== (int) $data['cashless_hybrid'] || count(array_unique($awbs)) !== count($awbs)) {
                        throw ValidationException::withMessages(['cashless_awbs' => 'Jumlah Cashless Hybrid harus sesuai resi unik yang dicatat.']);
                    }
                    $savedAwbs = PickupCashlessAwb::where('pickup_task_id', $taskId)->whereNotNull('awb')->lockForUpdate()->pluck('awb')->all();
                    if (array_diff($savedAwbs, $awbs) !== []) {
                        throw ValidationException::withMessages(['cashless_awbs' => 'Ada resi cashless tersimpan yang belum tercantum. Muat ulang buku pickup.']);
                    }
                    $newAwbs = array_values(array_diff($awbs, $savedAwbs));
                    if ($newAwbs !== []) {
                        $this->cashless->handle($actor, $taskId, ['submission_key' => $data['submission_key'],
                            'source' => 'nuralamt', 'awbs' => $newAwbs], enqueueEntry: false);
                    }
                }
                $record = $task->proof()->create([
                    'staff_id' => $actor->id, 'submission_key' => $data['submission_key'],
                    'cashless_capture_hash' => $captureHash,
                    'customer_name' => $task->customer_name_snapshot, 'pickup_address' => $task->pickup_address, 'contact' => $task->contact_snapshot,
                    'manual_hybrid' => $data['manual_hybrid'], 'cashless_hybrid' => $data['cashless_hybrid'], 'css_orion' => $data['css_orion'],
                    'notes' => $data['notes'] ?? null, 'picked_up_at' => $visit->recorded_at, 'finalized_at' => now(),
                ]);
                foreach (['photo' => $data['photos'] ?? [], 'signature' => [$data['signature']]] as $kind => $files) {
                    foreach ($files as $file) {
                        $path = $file->store('pickup-evidence', 'local');
                        if ($path === false) {
                            throw new \RuntimeException('Bukti tidak dapat disimpan.');
                        }
                        $stored[] = $path;
                        $record->attachments()->create(['kind' => $kind, 'path' => $path, 'mime_type' => $file->getMimeType(), 'size' => $file->getSize()]);
                    }
                }
                $record->receipt()->create(['recipient' => $record->contact, 'status' => 'PENDING_CONFIGURATION']);
                $task->update(['status' => 'PICKED_UP', 'version' => $task->version + 1]);
                $task->events()->create(['action' => 'pickup_finalized', 'actor_id' => $actor->id, 'task_version' => $task->version, 'occurred_at' => now()]);
                $this->entries->enqueueUnbatched($taskId, 'Resi tercatat diteruskan setelah POP final.');

                return $record->load(['attachments', 'receipt']);
            });
        } catch (\Throwable $exception) {
            Storage::disk('local')->delete($stored);
            throw $exception;
        }
    }
}
