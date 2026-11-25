<?php

namespace App\Actions\Pickup;

use App\Actions\Reports\ReevaluateJneAwbs;
use App\Models\CashlessEntryBatch;
use App\Models\CashlessEntryItem;
use App\Models\Customer;
use App\Models\HandoverSession;
use App\Models\JneShipment;
use App\Models\PickupCashlessAwb;
use App\Models\PickupCashlessAwbEvent;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class CorrectFailedCashlessAwb
{
    public const Correctable = ['NOT_FOUND', 'NEEDS_DATA', 'INVALID', 'ORION_REJECTED', 'CANCELLED'];

    public function __construct(private ReevaluateJneAwbs $reevaluate, private QueuePickupReconciliations $queue, private ManageCashlessEntryBatches $batches) {}

    /** @param array<string, mixed> $data */
    public function handle(User $user, int $batchId, int $itemId, array $data): CashlessEntryBatch
    {
        $data['awb'] = is_string($data['awb'] ?? null) ? ValidateAwbSignature::normalize($data['awb']) : ($data['awb'] ?? null);
        $data = Validator::make($data, ['submission_key' => ['required', 'uuid'], 'expected_version' => ['required', 'integer', 'min:1'],
            'awb' => ['required', 'string', 'min:6', 'max:16', 'regex:/^[A-Z0-9_$-]+$/D', 'not_regex:/^(0101|0166)[0-9]+$/D']],
            ['awb.min' => 'Nomor resi minimal 6 karakter. Kode barang/SKU pendek tidak dapat digunakan.',
                'awb.max' => 'Nomor resi cashless maksimal 16 karakter.', 'awb.not_regex' => 'Gunakan resi Cashless, bukan resi Manual.'])->validate();
        $hash = hash('sha256', json_encode([$batchId, $itemId, $data], JSON_THROW_ON_ERROR));

        try {
            return DB::transaction(function () use ($user, $batchId, $itemId, $data, $hash): CashlessEntryBatch {
                $actor = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
                $previous = CashlessEntryBatch::findOrFail($batchId);
                abort_unless($actor->canExecutePickup() && $previous->created_by === $actor->id, 404);
                $task = PickupTask::findOrFail($previous->pickup_task_id);
                Customer::whereKey($task->customer_id)->lockForUpdate()->firstOrFail();
                $sessionId = $task->handoverItem()->value('handover_session_id');
                if ($sessionId !== null) {
                    HandoverSession::whereKey($sessionId)->lockForUpdate()->firstOrFail();
                }
                $task = PickupTask::whereKey($task->id)->lockForUpdate()->firstOrFail();
                abort_unless($task->status === 'PICKED_UP' && $task->proof()->whereNotNull('finalized_at')->exists(), 409, 'Pickup harus memiliki POP final untuk koreksi ini.');
                $previous = CashlessEntryBatch::whereKey($batchId)->lockForUpdate()->firstOrFail();
                $item = $previous->items()->whereKey($itemId)->lockForUpdate()->firstOrFail();
                $existing = PickupCashlessAwbEvent::where('submission_key', $data['submission_key'])->first();
                if ($existing !== null) {
                    abort_unless($existing->actor_id === $actor->id && hash_equals($existing->payload_hash, $hash), 409, 'Kunci koreksi sudah digunakan untuk data berbeda.');

                    return CashlessEntryBatch::where('submission_key', $data['submission_key'])->where('created_by', $actor->id)->firstOrFail();
                }
                abort_unless(in_array($previous->status, CashlessEntryBatch::Terminal, true)
                    && in_array($previous->source, ManageCashlessEntryBatches::Sources, true)
                    && in_array($item->status, self::Correctable, true), 409, 'Hasil input belum pasti atau resi sudah diproses. Periksa HO sebelum mengoreksi.');
                abort_if(CashlessEntryItem::where('pickup_cashless_awb_id', $item->pickup_cashless_awb_id)->where('batch_id', '>', $batchId)->exists(),
                    409, 'Resi sudah memiliki percobaan lanjutan. Buka hasil batch terbaru.');
                $record = PickupCashlessAwb::whereKey($item->pickup_cashless_awb_id)->lockForUpdate()->firstOrFail();
                abort_unless($record->pickup_task_id === $task->id && $record->awb === $item->awb && $record->version === (int) $data['expected_version'],
                    409, 'Resi sudah berubah. Muat ulang hasil sebelum mengoreksi.');
                abort_if(CashlessEntryItem::where('pickup_cashless_awb_id', $record->id)
                    ->join('cashless_entry_batches as batches', 'batches.id', '=', 'cashless_entry_items.batch_id')
                    ->whereNotIn('batches.status', CashlessEntryBatch::Terminal)->exists(), 409, 'Masih ada proses aktif untuk resi ini.');
                if ($record->awb === $data['awb']) {
                    throw ValidationException::withMessages(['awb' => 'Masukkan nomor resi pengganti yang berbeda.']);
                }
                $signatureMatches = app(ValidateAwbSignature::class)->handle($data['awb']);
                if (PickupCashlessAwb::where('awb', $data['awb'])->where('id', '!=', $record->id)->exists()) {
                    throw ValidationException::withMessages(['awb' => 'Resi pengganti sudah tercatat pada pickup. Gunakan resi unik.']);
                }
                $shipment = JneShipment::where('awb', $data['awb'])->lockForUpdate()->first();
                if ($shipment !== null && (($shipment->pickup_task_id !== null && $shipment->pickup_task_id !== $task->id)
                    || ($shipment->category_status === 'MATCHED' && $shipment->category !== 'cashless_hybrid'))) {
                    throw ValidationException::withMessages(['awb' => 'Resi pengganti terikat ke pickup lain atau bukan kategori Cashless.']);
                }
                $before = $record->only(['awb', 'raw_awb', 'version']);
                $record->update(['awb' => $data['awb'], 'raw_awb' => $data['awb'], 'version' => $record->version + 1]);
                $this->reevaluate->handle([$item->awb, $record->awb]);
                $next = $this->batches->enqueue($data['submission_key'], $task->id, $actor->id, [$record->awb], ManageCashlessEntryBatches::CaptureSource);
                $record->events()->create(['pickup_task_id' => $task->id, 'customer_id' => $record->customer_id, 'actor_id' => $actor->id,
                    'submission_key' => $data['submission_key'], 'payload_hash' => $hash, 'revision' => $record->version,
                    'previous_awb' => $before['awb'], 'awb' => $record->awb, 'previous_raw_awb' => $before['raw_awb'], 'raw_awb' => $record->raw_awb,
                    'reason' => 'Mengganti resi yang ditolak Hybrid: '.$item->status,
                    'affected_results' => ['signature_matches' => $signatureMatches, 'before' => $before, 'after' => $record->only(['awb', 'raw_awb', 'version']),
                        'previous_batch_id' => $batchId, 'previous_item_id' => $itemId, 'next_batch_id' => $next->id]]);
                $this->queue->handle([$task->id]);

                return $next;
            }, 3);
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages(['awb' => 'Resi atau koreksi sudah tersimpan. Muat ulang hasil sebelum mencoba lagi.']);
        }
    }
}
