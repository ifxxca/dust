<?php

namespace App\Actions\Pickup;

use App\Models\CashlessEntryBatch;
use App\Models\CashlessEntryItem;
use App\Models\PickupCashlessAwb;
use App\Models\PickupTask;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ManageCashlessEntryBatches
{
    public const Sources = ['roberto', 'nuralamt'];

    public function resumeVerification(int $id, string $reason, bool $confirmApproval = false): CashlessEntryBatch
    {
        abort_if(trim($reason) === '' || mb_strlen($reason) > 500, 422, 'Alasan pemulihan wajib diisi, maksimal 500 karakter.');
        $source = CashlessEntryBatch::findOrFail($id)->source;

        return DB::transaction(function () use ($id, $reason, $source, $confirmApproval): CashlessEntryBatch {
            $lane = DB::table('cashless_entry_lanes')->where('source', $source)->lockForUpdate()->first();
            $batch = CashlessEntryBatch::whereKey($id)->lockForUpdate()->firstOrFail();
            abort_unless($batch->status === 'UNKNOWN' && $lane !== null && ($lane->active_batch_id === null || (int) $lane->active_batch_id === $id)
                && $batch->ho_number !== null && ($confirmApproval ? $batch->verification !== null : $batch->verification === null) && $batch->approved_at === null,
                409, 'Status batch, bukti approval, atau HO tidak memenuhi syarat pemulihan ini.');
            $items = $batch->items()->lockForUpdate()->get();
            abort_unless($items->contains('status', 'ACCEPTED') && $items->every(fn ($item): bool => in_array($item->status,
                ['ACCEPTED', 'PREVIOUSLY_ENTERED', 'ORION_REJECTED', 'NOT_FOUND', 'NEEDS_DATA', 'INVALID'], true)),
                409, 'Masih ada input tanpa hasil pasti. Jangan ulangi resi atau approval.');
            $batch->update(['status' => $confirmApproval ? 'CONFIRMING' : 'VERIFYING', 'worker_id' => null, 'claim_key' => null, 'claim_token_hash' => null,
                'lease_until' => null, 'error_message' => null]);
            DB::table('cashless_entry_lanes')->where('source', $source)->update(['active_batch_id' => $id]);
            $evidence = json_encode(['operator' => 'console', 'reason' => $reason, 'ho_number' => $batch->ho_number], JSON_THROW_ON_ERROR);
            DB::table('cashless_entry_events')->insert(['batch_id' => $id, 'event_key' => (string) Str::uuid(),
                'payload_hash' => hash('sha256', $evidence), 'type' => $confirmApproval ? 'approval-confirmation-requested' : 'verification-resumed', 'evidence' => $evidence, 'created_at' => now()]);

            return $batch;
        }, 3);
    }

    public function enqueueUnbatched(int $taskId, string $reason): ?CashlessEntryBatch
    {
        abort_if(trim($reason) === '' || mb_strlen($reason) > 500, 422, 'Alasan pemulihan antrean wajib diisi, maksimal 500 karakter.');

        return DB::transaction(function () use ($taskId, $reason): ?CashlessEntryBatch {
            $task = PickupTask::whereKey($taskId)->lockForUpdate()->firstOrFail();
            $proof = $task->proof()->first();
            abort_unless($task->status === 'PICKED_UP' && $proof?->finalized_at !== null, 409, 'POP harus final sebelum resi diteruskan ke pemrosesan.');
            $records = PickupCashlessAwb::where('pickup_task_id', $taskId)->whereNotNull('awb')->orderBy('id')->lockForUpdate()->get();
            $attempted = CashlessEntryItem::whereIn('pickup_cashless_awb_id', $records->pluck('id'))->pluck('pickup_cashless_awb_id');
            $unbatched = $records->whereNotIn('id', $attempted);
            if ($unbatched->isEmpty()) {
                return null;
            }
            abort_if($records->count() > $proof->cashless_hybrid, 409, 'Jumlah resi tercatat melebihi jumlah Cashless pada POP. Periksa bukti sebelum memproses.');
            foreach ($unbatched as $record) {
                abort_unless(preg_match('/^[A-Z0-9_-]{1,16}$/D', $record->awb) === 1 && preg_match('/^(0101|0166)[0-9]+$/D', $record->awb) !== 1,
                    409, 'Periksa format resi cashless '.$record->awb.' sebelum memproses.');
            }
            $batch = $this->enqueue((string) Str::uuid(), $taskId, $proof->staff_id, $unbatched->pluck('awb')->values()->all(), 'nuralamt');
            $evidence = json_encode(['reason' => $reason, 'pickup_record_id' => $proof->id, 'source' => 'nuralamt'], JSON_THROW_ON_ERROR);
            DB::table('cashless_entry_events')->insert(['batch_id' => $batch->id, 'event_key' => (string) Str::uuid(),
                'payload_hash' => hash('sha256', $evidence), 'type' => 'recorded-awbs-queued', 'evidence' => $evidence, 'created_at' => now()]);

            return $batch;
        }, 3);
    }

    /** @param list<string> $awbs */
    public function enqueue(string $submissionKey, int $taskId, int $actorId, array $awbs, ?string $source): CashlessEntryBatch
    {
        $batch = CashlessEntryBatch::create([
            'submission_key' => $submissionKey, 'pickup_task_id' => $taskId, 'created_by' => $actorId,
            'source' => $source, 'status' => $source === null ? 'WAITING_SOURCE' : 'QUEUED',
        ]);
        $now = now();
        CashlessEntryItem::insert(PickupCashlessAwb::where('pickup_task_id', $taskId)->whereIn('awb', $awbs)->orderBy('id')->get()
            ->map(fn (PickupCashlessAwb $record): array => ['batch_id' => $batch->id, 'pickup_cashless_awb_id' => $record->id,
                'awb' => $record->awb, 'status' => 'PENDING', 'created_at' => $now, 'updated_at' => $now])->all());

        return $batch;
    }

    public function retryFailures(int $id, string $reason): CashlessEntryBatch
    {
        abort_if(trim($reason) === '' || mb_strlen($reason) > 500, 422, 'Alasan retry wajib diisi, maksimal 500 karakter.');

        return DB::transaction(function () use ($id, $reason): CashlessEntryBatch {
            $previous = CashlessEntryBatch::whereKey($id)->lockForUpdate()->firstOrFail();
            abort_unless(in_array($previous->status, CashlessEntryBatch::Terminal, true)
                && in_array($previous->source, self::Sources, true), 409, 'Batch belum selesai atau server belum ditentukan.');
            $recordIds = $previous->items()->whereIn('status', ['NOT_FOUND', 'NEEDS_DATA', 'INVALID', 'CANCELLED'])->pluck('pickup_cashless_awb_id');
            abort_if($recordIds->isEmpty(), 409, 'Tidak ada resi gagal yang aman untuk diulang.');
            abort_if(CashlessEntryItem::whereIn('pickup_cashless_awb_id', $recordIds)->where('batch_id', '>', $id)->exists(), 409, 'Gunakan batch percobaan terakhir. Resi sudah memiliki percobaan lanjutan.');
            $records = PickupCashlessAwb::whereIn('id', $recordIds)->orderBy('id')->lockForUpdate()->get();
            $awbs = [];
            foreach ($records as $record) {
                abort_unless($record->pickup_task_id === $previous->pickup_task_id && is_string($record->awb)
                    && preg_match('/^[A-Z0-9_-]{1,16}$/D', $record->awb) === 1 && preg_match('/^(0101|0166)[0-9]+$/D', $record->awb) !== 1,
                    409, 'Perbaiki nomor resi dan bukti handover sebelum mengulang.');
                $awbs[] = $record->awb;
            }
            $batch = $this->enqueue((string) Str::uuid(), $previous->pickup_task_id, $previous->created_by,
                $awbs, $previous->source);
            $evidence = json_encode(['operator' => 'console', 'previous_batch_id' => $id, 'reason' => $reason], JSON_THROW_ON_ERROR);
            DB::table('cashless_entry_events')->insert(['batch_id' => $batch->id, 'event_key' => (string) Str::uuid(),
                'payload_hash' => hash('sha256', $evidence), 'type' => 'retry-created', 'evidence' => $evidence, 'created_at' => now()]);

            return $batch;
        }, 3);
    }

    public function resolveOrionRejection(int $id, string $reason): CashlessEntryBatch
    {
        abort_if(trim($reason) === '' || mb_strlen($reason) > 500, 422, 'Alasan pemulihan wajib diisi, maksimal 500 karakter.');
        $source = CashlessEntryBatch::findOrFail($id)->source;

        return DB::transaction(function () use ($id, $reason, $source): CashlessEntryBatch {
            $lane = DB::table('cashless_entry_lanes')->where('source', $source)->lockForUpdate()->first();
            $batch = CashlessEntryBatch::whereKey($id)->lockForUpdate()->firstOrFail();
            abort_unless($batch->source === $source && in_array($source, self::Sources, true)
                && $batch->status === 'UNKNOWN' && $lane !== null
                && $batch->ho_number !== null && $batch->verification === null && $batch->approved_at === null,
                409, 'Pemulihan hanya untuk batch tertahan sebelum approval.');
            $items = $batch->items()->lockForUpdate()->get();
            $unknown = $items->where('status', 'UNKNOWN');
            abort_unless($unknown->count() === 1 && $items->every(fn (CashlessEntryItem $item): bool => in_array($item->status,
                ['PENDING', 'UNKNOWN', 'NOT_FOUND', 'NEEDS_DATA', 'INVALID', 'PREVIOUSLY_ENTERED', 'ORION_REJECTED'], true)),
                409, 'Batch memiliki hasil input yang harus diperiksa terlebih dahulu.');
            $item = $unknown->first();
            abort_unless(is_string($item->message) && $this->outcome($item->message, $item->awb) === 'ORION_REJECTED'
                && $batch->error_message === 'Respons Hybrid belum dikenali: '.$item->message,
                409, 'Respons tertahan bukan penolakan Orion yang dikenali.');
            $pending = $items->where('status', 'PENDING');
            $pendingIds = $pending->pluck('pickup_cashless_awb_id');
            abort_if(CashlessEntryItem::whereIn('pickup_cashless_awb_id', $pendingIds)->where('batch_id', '>', $id)->exists(),
                409, 'Resi sudah memiliki percobaan lanjutan.');
            $records = PickupCashlessAwb::whereIn('id', $pendingIds)->lockForUpdate()->get()->keyBy('id');
            $awbs = [];
            foreach ($pending as $pendingItem) {
                $record = $records->get($pendingItem->pickup_cashless_awb_id);
                abort_unless($record !== null && $record->awb === $pendingItem->awb && $record->pickup_task_id === $batch->pickup_task_id,
                    409, 'Bukti resi yang belum diproses sudah berubah.');
                $awbs[] = $pendingItem->awb;
            }
            $item->update(['status' => 'ORION_REJECTED']);
            $batch->items()->where('status', 'PENDING')->update(['status' => 'CANCELLED']);
            $batch->update(['status' => 'FAILED', 'lease_until' => null,
                'error_message' => 'Percobaan dihentikan tanpa resi berhasil. Respons Orion dicatat sebagai penolakan.']);
            DB::table('cashless_entry_lanes')->where('source', $source)->where('active_batch_id', $id)->update(['active_batch_id' => null]);
            $next = $pending->isEmpty() ? null : $this->enqueue((string) Str::uuid(), $batch->pickup_task_id,
                $batch->created_by, $awbs, $source);
            $evidence = json_encode(['operator' => 'console', 'reason' => $reason, 'item_id' => $item->id,
                'message' => $item->message, 'next_batch_id' => $next?->id], JSON_THROW_ON_ERROR);
            DB::table('cashless_entry_events')->insert(['batch_id' => $id, 'event_key' => (string) Str::uuid(),
                'payload_hash' => hash('sha256', $evidence), 'type' => 'orion-rejection-resolved', 'evidence' => $evidence, 'created_at' => now()]);

            return $next ?? $batch;
        }, 3);
    }

    public function claim(string $source, string $worker, string $claimKey): ?CashlessEntryBatch
    {
        if (! config('pickup.cashless_entry.enabled')) {
            return null;
        }

        return DB::transaction(function () use ($source, $worker, $claimKey): ?CashlessEntryBatch {
            $lane = DB::table('cashless_entry_lanes')->where('source', $source)->lockForUpdate()->first();
            abort_if($lane === null, 403);
            $replay = CashlessEntryBatch::where('claim_key', $claimKey)->lockForUpdate()->first();
            if ($replay !== null) {
                abort_unless($replay->source === $source && $replay->worker_id === $worker, 409);

                return ! in_array($replay->status, [...CashlessEntryBatch::Terminal, 'UNKNOWN'], true)
                    && $replay->lease_until?->isFuture() ? $replay->load('items') : null;
            }
            if ($lane->active_batch_id !== null) {
                $active = CashlessEntryBatch::whereKey($lane->active_batch_id)->lockForUpdate()->firstOrFail();
                if (in_array($active->status, ['VERIFYING', 'CONFIRMING'], true) && $active->worker_id === null) {
                    $active->forceFill(['worker_id' => $worker, 'claim_key' => $claimKey,
                        'claim_token_hash' => hash('sha256', $this->token($active, $claimKey)), 'lease_until' => now()->addSeconds(300)])->save();

                    return $active->load('items');
                }
                if ($active->status === 'CLAIMED' && ! $active->lease_until?->isFuture()) {
                    $active->update(['status' => 'QUEUED', 'worker_id' => null, 'claim_key' => null, 'claim_token_hash' => null, 'lease_until' => null]);
                    DB::table('cashless_entry_lanes')->where('source', $source)->update(['active_batch_id' => null]);
                } elseif ($active->status === 'UNKNOWN' || ! $active->lease_until?->isFuture()) {
                    if ($active->status !== 'UNKNOWN') {
                        $active->update(['status' => 'UNKNOWN', 'lease_until' => null, 'error_message' => 'Lease worker habis. Periksa HO dan hasil input sebelum mengulang.']);
                    } else {
                        $active->update(['lease_until' => null]);
                    }
                    DB::table('cashless_entry_lanes')->where('source', $source)->where('active_batch_id', $active->id)->update(['active_batch_id' => null]);
                } else {
                    return null;
                }
            }
            $batch = CashlessEntryBatch::where('source', $source)->where('status', 'QUEUED')->orderBy('id')->lockForUpdate()->first();
            if ($batch === null) {
                return null;
            }
            $batch->forceFill(['status' => 'CLAIMED', 'worker_id' => $worker, 'claim_key' => $claimKey,
                'claim_token_hash' => hash('sha256', $this->token($batch, $claimKey)), 'lease_until' => now()->addSeconds(300)])->save();
            DB::table('cashless_entry_lanes')->where('source', $source)->update(['active_batch_id' => $batch->id]);

            return $batch->load('items');
        }, 3);
    }

    public function token(CashlessEntryBatch $batch, ?string $key = null): string
    {
        return hash_hmac('sha256', 'cashless:'.$batch->id.':'.($key ?? $batch->claim_key), (string) config('app.key'));
    }

    /** @param array<string, mixed> $data */
    public function checkpoint(int $id, string $source, string $worker, string $token, array $data): CashlessEntryBatch
    {
        return DB::transaction(function () use ($id, $source, $worker, $token, $data): CashlessEntryBatch {
            $lane = DB::table('cashless_entry_lanes')->where('source', $source)->lockForUpdate()->first();
            $batch = CashlessEntryBatch::whereKey($id)->where('source', $source)->lockForUpdate()->firstOrFail();
            abort_unless($batch->worker_id === $worker && is_string($batch->claim_token_hash)
                && hash_equals($batch->claim_token_hash, hash('sha256', $token)), 409, 'Kepemilikan batch tidak sesuai.');
            $hash = hash('sha256', json_encode($data, JSON_THROW_ON_ERROR));
            $previous = DB::table('cashless_entry_events')->where('batch_id', $id)->where('event_key', $data['event_key'])->first();
            if ($previous !== null) {
                abort_unless(hash_equals($previous->payload_hash, $hash), 409, 'Event sudah digunakan untuk hasil berbeda.');

                return $batch;
            }
            abort_unless((int) $lane?->active_batch_id === $batch->id && $batch->lease_until?->isFuture()
                && ! in_array($batch->status, [...CashlessEntryBatch::Terminal, 'UNKNOWN'], true), 409, 'Batch sudah berhenti atau lease habis.');
            $this->apply($batch, $data);
            $batch->lease_until = $batch->status === 'UNKNOWN' ? null : now()->addSeconds(300);
            $batch->save();
            DB::table('cashless_entry_events')->insert(['batch_id' => $id, 'event_key' => $data['event_key'],
                'payload_hash' => $hash, 'type' => $data['type'], 'evidence' => json_encode($data, JSON_THROW_ON_ERROR), 'created_at' => now()]);
            if (in_array($batch->status, [...CashlessEntryBatch::Terminal, 'UNKNOWN'], true)) {
                DB::table('cashless_entry_lanes')->where('source', $source)->where('active_batch_id', $id)->update(['active_batch_id' => null]);
            }

            return $batch;
        }, 3);
    }

    /** @param array<string, mixed> $data */
    private function apply(CashlessEntryBatch $batch, array $data): void
    {
        $type = $data['type'];
        if ($type === 'heartbeat') {
            return;
        }
        if ($type === 'hold') {
            $batch->status = 'UNKNOWN';
            $batch->error_message = $data['message'] ?? 'Hasil request belum pasti. Periksa bukti HO.';

            return;
        }
        if ($type === 'creating') {
            abort_unless($batch->status === 'CLAIMED', 409);
            $batch->status = 'CREATING_HO';

            return;
        }
        if ($type === 'created') {
            abort_unless($batch->status === 'CREATING_HO' && $batch->ho_number === null, 409);
            abort_if(CashlessEntryBatch::where('source', $batch->source)->where('ho_number', $data['ho_number'])->exists(), 409, 'HO sudah digunakan oleh batch lain.');
            $batch->ho_number = $data['ho_number'];
            $batch->status = 'ENTERING';

            return;
        }
        abort_unless($batch->status === 'ENTERING' || ($type === 'approval-start' && $batch->status === 'VERIFYING')
            || ($type === 'approved' && in_array($batch->status, ['APPROVING', 'CONFIRMING'], true)), 409);
        abort_unless(($data['ho_number'] ?? null) === $batch->ho_number, 409, 'Nomor HO berbeda dari batch.');
        if (in_array($type, ['scan-start', 'scan-result'], true)) {
            $item = $batch->items()->whereKey($data['item_id'])->lockForUpdate()->firstOrFail();
            abort_unless($item->awb === $data['awb'], 409);
            if ($type === 'scan-start') {
                abort_unless($item->status === 'PENDING' && ! $batch->items()->where('status', 'IN_FLIGHT')->exists(), 409);
                $record = PickupCashlessAwb::whereKey($item->pickup_cashless_awb_id)->lockForUpdate()->firstOrFail();
                abort_unless($record->awb === $item->awb && $record->pickup_task_id === $batch->pickup_task_id, 409, 'Resi handover sudah berubah.');
                $item->update(['status' => 'IN_FLIGHT']);
            } else {
                abort_unless($item->status === 'IN_FLIGHT', 409);
                $outcome = $this->outcome($data['message'], $item->awb);
                abort_unless($outcome === $data['outcome'], 422, 'Pesan server tidak mendukung hasil resi.');
                preg_match('/nomor\s*:\s*(HO-[A-Z0-9-]+)/i', $data['message'], $previous);
                $item->update(['status' => $outcome, 'message' => $data['message'], 'previous_ho' => $previous[1] ?? null,
                    'elapsed_ms' => $data['elapsed_ms'] ?? null]);
                if ($outcome === 'UNKNOWN') {
                    $batch->status = 'UNKNOWN';
                    $batch->error_message = 'Respons Hybrid belum dikenali: '.$data['message'];
                }
            }

            return;
        }
        abort_if($batch->items()->whereIn('status', ['PENDING', 'IN_FLIGHT', 'UNKNOWN'])->exists(), 409, 'Masih ada resi tanpa hasil pasti.');
        $accepted = $batch->items()->where('status', 'ACCEPTED')->pluck('awb')->sort()->values()->all();
        if ($type === 'empty') {
            abort_unless($accepted === [], 409);
            $batch->status = 'FAILED';
            $batch->error_message = 'Tidak ada AWB baru yang berhasil masuk ke HO.';

            return;
        }
        if ($type === 'approval-start') {
            $observed = $data['verified_awbs'];
            sort($observed);
            abort_unless($accepted !== [] && $accepted === $observed, 409, 'Isi HO tidak sesuai daftar AWB yang berhasil.');
            $batch->verification = ['ho_number' => $batch->ho_number, 'awbs' => $observed];
            $batch->status = 'APPROVING';

            return;
        }
        abort_unless($type === 'approved' && $batch->verification !== null
            && ($data['print_available'] ?? false) === true && ($data['approve_available'] ?? true) === false, 422, 'Approval belum terbukti.');
        $batch->status = $batch->items()->where('status', '!=', 'ACCEPTED')->exists() ? 'PARTIAL' : 'DONE';
        $batch->approved_at = now();
    }

    public function outcome(string $message, string $awb): string
    {
        if ($message === 'Data connote berhasil disimpan') {
            return 'ACCEPTED';
        }
        if ($message === 'Nomor resi melebihi batas input Hybrid (16 karakter).') {
            return 'INVALID';
        }
        if (preg_match('/^Connote pernah di HO dg nomor\s*:\s*HO-[A-Z0-9-]+$/iD', $message)) {
            return 'PREVIOUSLY_ENTERED';
        }
        if ($message === 'Connote '.$awb.' sudah dientry di orion') {
            return 'ORION_REJECTED';
        }
        if ($message === 'Connote '.$awb.' tidak ditemukan.') {
            return 'NOT_FOUND';
        }
        if (in_array($message, ['Destinasi tidak lengkap', 'Lengkapi data terlebih dahulu',
            'Destinasi tidak tersedia, lengkapi data terlebih dahulu', 'Goods Value tidak boleh 0'], true)) {
            return 'NEEDS_DATA';
        }

        return 'UNKNOWN';
    }
}
