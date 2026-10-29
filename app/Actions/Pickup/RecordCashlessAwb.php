<?php

namespace App\Actions\Pickup;

use App\Actions\Reports\QueryCashlessReconciliation;
use App\Actions\Reports\ReevaluateJneAwbs;
use App\Models\CashlessEntryBatch;
use App\Models\CashlessEntryItem;
use App\Models\HandoverSession;
use App\Models\JneShipment;
use App\Models\PickupCashlessAwb;
use App\Models\PickupCashlessAwbEvent;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class RecordCashlessAwb
{
    public function __construct(private ReevaluateJneAwbs $reevaluate, private QueryCashlessReconciliation $reconciliation) {}

    /**
     * @param  array<string, mixed>  $data
     */
    public function handle(User $user, int $taskId, array $data, bool $correction = false): PickupCashlessAwb
    {
        try {
            return DB::transaction(function () use ($user, $taskId, $data, $correction): PickupCashlessAwb {
                $actor = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
                $sessionId = PickupTask::findOrFail($taskId)->handoverItem()->value('handover_session_id');
                if ($sessionId !== null) {
                    HandoverSession::whereKey($sessionId)->lockForUpdate()->firstOrFail();
                }
                $task = PickupTask::whereKey($taskId)->lockForUpdate()->firstOrFail();
                Gate::forUser($actor)->authorize($correction ? 'correctCashlessAwb' : 'recordCashlessAwb', $task);
                $data = Validator::make($data, self::rules($correction))->validate();
                $raw = $data['awb'] ?? null;
                $awb = $raw === null ? null : mb_strtoupper(trim($raw));
                if ($awb !== null && preg_match('/^[A-Z0-9_-]{1,100}$/D', $awb) !== 1) {
                    throw ValidationException::withMessages(['awb' => 'AWB harus berisi 1–100 huruf, angka, tanda hubung atau garis bawah tanpa spasi.']);
                }
                $reason = $data['reason'] ?? null;
                if ($correction && trim($reason ?? '') === '') {
                    throw ValidationException::withMessages(['reason' => 'Alasan koreksi wajib diisi.']);
                }
                $payloadHash = hash('sha256', json_encode([$task->id, $correction, $data], JSON_THROW_ON_ERROR));
                $existing = PickupCashlessAwbEvent::where('submission_key', $data['submission_key'])->first();
                if ($existing) {
                    abort_unless($existing->actor_id === $actor->id && $existing->pickup_task_id === $task->id && hash_equals($existing->payload_hash, $payloadHash), 409, 'Kunci pengiriman telah dipakai untuk data berbeda.');

                    return PickupCashlessAwb::whereKey($existing->pickup_cashless_awb_id)->firstOrFail();
                }
                $record = isset($data['evidence_id']) ? PickupCashlessAwb::where('pickup_task_id', $task->id)->whereKey($data['evidence_id'])->lockForUpdate()->firstOrFail() : null;
                if ($record) {
                    abort_if($record->version !== (int) $data['expected_version'], 409, 'Sertim berubah. Muat ulang sebelum mengoreksi.');
                    abort_if(CashlessEntryItem::where('pickup_cashless_awb_id', $record->id)
                        ->join('cashless_entry_batches', 'cashless_entry_batches.id', '=', 'cashless_entry_items.batch_id')
                        ->whereNotIn('cashless_entry_batches.status', CashlessEntryBatch::Terminal)->exists(),
                        409, 'Resi terikat batch input Hybrid yang belum selesai. Batalkan batch yang belum diklaim atau periksa HO sebelum mengoreksi.');
                }
                if ($awb === null && $record === null) {
                    throw ValidationException::withMessages(['awb' => 'AWB wajib diisi untuk bukti baru.']);
                }
                if ($awb !== null && PickupCashlessAwb::where('awb', $awb)->when($record, fn ($query) => $query->where('id', '!=', $record->id))->exists()) {
                    throw ValidationException::withMessages(['awb' => 'AWB sudah diklaim pada Sertim aktif. Periksa bukti sebelum mengoreksi.']);
                }
                $previousAwb = $record?->awb;
                $previousRaw = $record?->raw_awb;
                $awbs = array_values(array_unique(array_filter([$previousAwb, $awb], fn (?string $value): bool => $value !== null)));
                $before = $this->snapshot($task, $awbs);
                if ($record === null) {
                    $record = new PickupCashlessAwb;
                    $record->forceFill(['pickup_task_id' => $task->id, 'customer_id' => $task->customer_id, 'original_awb' => $raw,
                        'raw_awb' => $raw, 'awb' => $awb, 'version' => 1, 'created_by' => $actor->id])->save();
                } else {
                    $record->update(['awb' => $awb, 'raw_awb' => $raw, 'version' => $record->version + 1]);
                }
                $this->reevaluate->handle($awbs);
                $record->events()->create(['pickup_task_id' => $task->id, 'customer_id' => $record->customer_id, 'actor_id' => $actor->id,
                    'submission_key' => $data['submission_key'], 'payload_hash' => $payloadHash, 'revision' => $record->version,
                    'previous_awb' => $previousAwb, 'awb' => $awb, 'previous_raw_awb' => $previousRaw, 'raw_awb' => $raw,
                    'reason' => $reason, 'affected_results' => ['before' => $before, 'after' => $this->snapshot($task, $awbs)]]);

                return $record;
            }, 3);
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages(['awb' => 'AWB atau kunci pengiriman sudah dipakai. Muat ulang Sertim untuk memeriksa hasil.']);
        }
    }

    /** @return array<string, list<string>> */
    public static function rules(bool $correction): array
    {
        return ['submission_key' => ['required', 'uuid'],
            'awb' => [$correction ? 'nullable' : 'required', 'string', 'max:100'],
            'reason' => [$correction ? 'required' : 'prohibited', 'string', 'max:500'],
            'evidence_id' => [$correction ? 'sometimes' : 'prohibited', 'integer', 'min:1'],
            'expected_version' => [$correction ? 'required_with:evidence_id' : 'prohibited', 'integer', 'min:1']];
    }

    /**
     * @param  list<string>  $awbs
     * @return array{shipments: list<array<string, mixed>>, reconciliation: array<string, int|string|bool|null>}
     */
    private function snapshot(PickupTask $task, array $awbs): array
    {
        return ['shipments' => array_values(JneShipment::whereIn('awb', $awbs)->orderBy('id')->get(['id', 'awb', 'customer_id', 'pickup_task_id', 'customer_match_status', 'match_status', 'version'])->map->toArray()->all()),
            'reconciliation' => $this->reconciliation->handle($task)];
    }
}
