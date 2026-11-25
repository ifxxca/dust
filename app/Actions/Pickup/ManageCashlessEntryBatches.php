<?php

namespace App\Actions\Pickup;

use App\Models\CashlessEntryBatch;
use App\Models\CashlessEntryItem;
use App\Models\PickupCashlessAwb;
use App\Models\PickupTask;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ManageCashlessEntryBatches
{
    public const Sources = ['roberto', 'nuralamt'];

    public const CaptureSource = 'roberto';

    /** @return array{confirmed: int, batch_ids: list<int>, checksum: string} */
    public function confirmApprovedReport(string $source, string $date, string $csv, string $checksum, ?int $reportId = null, ?int $taskId = null, bool $dryRun = false): array
    {
        abort_unless(in_array($source, self::Sources, true) && preg_match('/^\d{4}-\d{2}-\d{2}$/D', $date) === 1, 422, 'Sumber atau tanggal report tidak valid.');
        abort_unless(strlen($csv) <= 20971520 && hash_equals($checksum, hash('sha256', $csv)), 409, 'Checksum report tidak sesuai.');
        $result = ['confirmed' => 0, 'batch_ids' => [], 'checksum' => $checksum];
        $stream = fopen('php://temp', 'w+b');
        fwrite($stream, $csv);
        rewind($stream);
        $approved = [];
        $conflicts = [];
        try {
            $headers = array_map(fn ($value): string => trim(ltrim($value ?? '', "\xEF\xBB\xBF")), fgetcsv($stream, null, ',', '"', '') ?: []);
            if (array_diff(['Cnote No', 'HO No', 'HO Date', 'Approved'], $headers) !== [] || count(array_unique($headers)) !== count($headers)) {
                return $result;
            }
            $prefix = strtoupper(CarbonImmutable::parse($date)->format('d-M-Y')).' ';
            $rowNumber = 1;
            $seen = [];
            while (($values = fgetcsv($stream, null, ',', '"', '')) !== false) {
                $rowNumber++;
                if ($values === [null]) {
                    continue;
                }
                abort_unless(count($values) === count($headers), 422, 'Struktur report cashless tidak valid.');
                $row = array_combine($headers, array_map(fn ($value): string => trim($value ?? ''), $values));
                abort_unless(str_starts_with(strtoupper($row['HO Date']), $prefix), 422, 'Tanggal baris report cashless tidak sesuai.');
                $awb = strtoupper(ltrim($row['Cnote No'], "'"));
                $ho = $row['HO No'];
                $key = 'awb:'.$awb;
                $identity = [$ho, $row['Approved']];
                if (isset($seen[$key]) && $seen[$key] !== $identity) {
                    $conflicts[$key] = true;
                }
                $seen[$key] = $identity;
                if ($row['Approved'] === 'Y' && preg_match('/^[A-Z0-9_$-]{6,100}$/D', $awb) === 1 && preg_match('/^HO-[A-Z0-9-]{1,60}$/D', $ho) === 1) {
                    $approved[$key] = ['awb' => $awb, 'ho_number' => $ho, 'source_row' => $rowNumber];
                }
            }
        } finally {
            fclose($stream);
        }
        $approved = array_diff_key($approved, $conflicts);
        if ($approved === []) {
            return $result;
        }

        return DB::transaction(function () use ($approved, $source, $date, $checksum, $reportId, $taskId, $dryRun, $result): array {
            DB::table('cashless_entry_lanes')->where('source', $source)->lockForUpdate()->firstOrFail();
            $recordIds = PickupCashlessAwb::whereIn('awb', array_column($approved, 'awb'))->when($taskId !== null, fn ($query) => $query->where('pickup_task_id', $taskId))->pluck('id');
            $latestIds = CashlessEntryItem::whereIn('pickup_cashless_awb_id', $recordIds)->selectRaw('MAX(id)')->groupBy('pickup_cashless_awb_id');
            $batchIds = CashlessEntryItem::whereIn('id', $latestIds)->pluck('batch_id')->unique();
            $batches = CashlessEntryBatch::whereIn('id', $batchIds)->where('source', $source)->orderBy('id')->lockForUpdate()->get()->keyBy('id');
            $records = PickupCashlessAwb::whereIn('id', $recordIds)->orderBy('id')->lockForUpdate()->get()->keyBy('id');
            $tasks = PickupTask::whereIn('id', $records->pluck('pickup_task_id'))->get(['id', 'customer_id'])->keyBy('id');
            $items = CashlessEntryItem::whereIn('id', $latestIds)->orderBy('id')->lockForUpdate()->get();
            $confirmed = [];
            foreach ($items as $item) {
                $batch = $batches->get($item->batch_id);
                $record = $records->get($item->pickup_cashless_awb_id);
                $proof = $approved['awb:'.$item->awb] ?? null;
                if ($batch === null || ! in_array($batch->status, [...CashlessEntryBatch::Terminal, 'UNKNOWN'], true)
                    || $record === null || $record->awb !== $item->awb || $record->pickup_task_id !== $batch->pickup_task_id
                    || $record->customer_id !== $tasks->get($record->pickup_task_id)?->customer_id || $proof === null
                    || $date < CarbonImmutable::instance($record->created_at)->setTimezone(config('pickup.timezone'))->subHours(5)->toDateString()
                    || $item->status === 'CONFIRMED' || ($item->status === 'ACCEPTED' && $batch->approved_at !== null)
                    || ($item->status === 'PREVIOUSLY_ENTERED' && $item->previous_ho !== null && $item->previous_ho !== $proof['ho_number'])) {
                    continue;
                }
                $confirmed[$batch->id][] = ['item_id' => $item->id, 'previous_status' => $item->status, ...$proof];
                if (! $dryRun) {
                    $item->update(['status' => 'CONFIRMED', 'previous_ho' => $proof['ho_number'],
                        'message' => 'Dikonfirmasi dari report Hybrid '.$date.': Approved=Y, HO '.$proof['ho_number'].'.']);
                }
            }
            $result['confirmed'] = array_sum(array_map('count', $confirmed));
            $result['batch_ids'] = array_keys($confirmed);
            if ($dryRun) {
                return $result;
            }
            foreach ($confirmed as $batchId => $proofs) {
                $batch = $batches->get($batchId);
                $allRecords = $batch->items()->pluck('pickup_cashless_awb_id');
                $currentIds = CashlessEntryItem::whereIn('pickup_cashless_awb_id', $allRecords)->selectRaw('MAX(id)')->groupBy('pickup_cashless_awb_id');
                $unresolved = CashlessEntryItem::query()->join('cashless_entry_batches as current_batches', 'current_batches.id', '=', 'cashless_entry_items.batch_id')
                    ->whereIn('cashless_entry_items.id', $currentIds)->whereNot(fn ($query) => $query
                    ->where(fn ($query) => $query->where('cashless_entry_items.status', 'CONFIRMED')->whereNotNull('cashless_entry_items.previous_ho'))
                    ->orWhere(fn ($query) => $query->where('cashless_entry_items.status', 'ACCEPTED')->whereNotNull('current_batches.approved_at')->whereIn('current_batches.status', ['DONE', 'PARTIAL'])))->exists();
                $batch->update(['status' => $unresolved ? 'PARTIAL' : 'DONE', 'error_message' => null, 'lease_until' => null]);
                $this->lane($batchId)->where('active_batch_id', $batchId)->update(['active_batch_id' => null]);
                $evidence = json_encode(['operator' => $reportId === null ? 'console' : 'system', 'source' => $source, 'report_id' => $reportId, 'date' => $date, 'checksum' => $checksum, 'items' => $proofs], JSON_THROW_ON_ERROR);
                DB::table('cashless_entry_events')->insert(['batch_id' => $batchId, 'event_key' => (string) Str::uuid(), 'type' => 'report-confirmed',
                    'payload_hash' => hash('sha256', $evidence), 'evidence' => $evidence, 'created_at' => now()]);
            }

            return $result;
        }, 3);
    }

    public function retryBook(User $actor, int $taskId, string $reason, string $key): CashlessEntryBatch
    {
        return DB::transaction(function () use ($actor, $taskId, $reason, $key): CashlessEntryBatch {
            DB::table('cashless_entry_lanes')->where('source', self::CaptureSource)->lockForUpdate()->firstOrFail();
            $task = PickupTask::whereKey($taskId)->lockForUpdate()->firstOrFail();
            $proof = $task->proof()->first();
            abort_unless($actor->canManagePickup() || ($actor->canExecutePickup() && $proof?->staff_id === $actor->id), 404);
            $hash = hash('sha256', json_encode([$actor->id, $taskId, $reason], JSON_THROW_ON_ERROR));
            $replay = CashlessEntryBatch::where('submission_key', $key)->lockForUpdate()->first();
            if ($replay !== null) {
                $event = DB::table('cashless_entry_events')->where('batch_id', $replay->id)->where('type', 'book-retry-created')->first();
                abort_unless($event !== null && hash_equals($event->payload_hash, $hash), 409, 'Kunci pengiriman sudah dipakai untuk permintaan berbeda.');

                return $replay;
            }
            abort_unless($task->status === 'PICKED_UP' && $proof?->finalized_at !== null, 409, 'POP harus final sebelum cashless diproses ulang.');
            $batches = CashlessEntryBatch::where('pickup_task_id', $taskId)->orderBy('id')->lockForUpdate()->get()->keyBy('id');
            $records = PickupCashlessAwb::where('pickup_task_id', $taskId)->whereNotNull('awb')->orderBy('id')->lockForUpdate()->get();
            abort_if($records->count() > $proof->cashless_hybrid, 409, 'Jumlah resi melebihi Cashless pada POP. Periksa bukti pickup.');
            $items = CashlessEntryItem::whereIn('pickup_cashless_awb_id', $records->pluck('id'))->orderBy('id')->lockForUpdate()->get();
            $latest = $items->keyBy('pickup_cashless_awb_id');
            $attemptedItems = [];
            $unverifiableBatches = [];
            foreach (DB::table('cashless_entry_events')->whereIn('batch_id', $batches->keys())->whereIn('type', ['scan-start', 'scan-result'])->get(['batch_id', 'evidence']) as $event) {
                $evidence = json_decode($event->evidence, true);
                if (! is_array($evidence) || ! isset($evidence['item_id']) || ! ctype_digit((string) $evidence['item_id'])) {
                    $unverifiableBatches[] = $event->batch_id;
                } else {
                    $attemptedItems[] = (int) $evidence['item_id'];
                }
            }
            $unsafeBatches = $items->groupBy('batch_id')->filter(function ($batchItems, int $batchId) use ($batches): bool {
                $batch = $batches->get($batchId);

                return $batch === null || ! in_array($batch->status, CashlessEntryBatch::Terminal, true)
                    || $batchItems->contains(fn ($item): bool => in_array($item->status, ['UNKNOWN', 'IN_FLIGHT', 'PENDING'], true))
                    || ($batch->approved_at === null && $batchItems->contains('status', 'ACCEPTED'));
            })->keys();
            $awbs = [];
            $unattemptedItems = [];
            $skipped = ['successful' => 0, 'queued' => 0, 'review' => 0];
            foreach ($records as $record) {
                $item = $latest->get($record->id);
                $batch = $item === null ? null : $batches->get($item->batch_id);
                if ($record->customer_id !== $task->customer_id || ($item !== null && ($batch === null || $item->awb !== $record->awb))
                    || preg_match('/^[A-Z0-9_$-]{6,16}$/D', $record->awb) !== 1 || preg_match('/^(0101|0166)[0-9]+$/D', $record->awb) === 1) {
                    $skipped['review']++;
                } elseif (in_array($batch?->status, ['DONE', 'PARTIAL'], true) && (($item?->status === 'CONFIRMED' && $item->previous_ho !== null)
                    || ($item?->status === 'ACCEPTED' && $batch->approved_at !== null))) {
                    $skipped['successful']++;
                } elseif ($batch !== null && ! in_array($batch->status, [...CashlessEntryBatch::Terminal, 'UNKNOWN'], true)) {
                    $skipped['queued']++;
                } elseif ($item?->status === 'PENDING' && $batch->status === 'UNKNOWN'
                    && ! in_array($item->id, $attemptedItems, true) && ! in_array($batch->id, $unverifiableBatches, true)) {
                    $awbs[] = $record->awb;
                    $unattemptedItems[] = $item->id;
                } elseif ($item !== null && ($unsafeBatches->contains($item->batch_id) || ! in_array($item->status, ['NOT_FOUND', 'NEEDS_DATA', 'INVALID', 'CANCELLED'], true))) {
                    $skipped['review']++;
                } else {
                    $awbs[] = $record->awb;
                }
            }
            abort_if($awbs === [], 409, 'Tidak ada resi yang aman untuk diulang. '.$skipped['successful'].' sudah berhasil, '.$skipped['queued'].' masih diantrekan/diproses, '.$skipped['review'].' perlu diperiksa. Untuk hasil belum pasti, gunakan Periksa hasil HO terlebih dahulu.');
            abort_if(count($awbs) > 500, 409, 'Maksimal 500 resi per batch. Periksa jumlah cashless buku ini.');
            $batch = $this->enqueue($key, $taskId, $proof->staff_id, $awbs, self::CaptureSource);
            CashlessEntryItem::whereIn('id', $unattemptedItems)->where('status', 'PENDING')->update(['status' => 'CANCELLED',
                'message' => 'Belum pernah dikirim; diteruskan ke batch #'.$batch->id.'.']);
            DB::table('cashless_entry_events')->insert(['batch_id' => $batch->id, 'event_key' => (string) Str::uuid(),
                'payload_hash' => $hash, 'type' => 'book-retry-created', 'evidence' => json_encode([
                    'actor_id' => $actor->id, 'reason' => $reason, 'pickup_task_id' => $taskId,
                    'previous_batch_ids' => $latest->whereIn('awb', $awbs)->pluck('batch_id')->unique()->values()->all(),
                    'queued_count' => count($awbs), 'skipped' => $skipped,
                    'unattempted_item_ids' => $unattemptedItems,
                ], JSON_THROW_ON_ERROR), 'created_at' => now()]);

            return $batch;
        }, 3);
    }

    public function recover(User $actor, int $id, string $action, string $reason, string $key, string $expectedStatus): CashlessEntryBatch
    {
        return DB::transaction(function () use ($actor, $id, $action, $reason, $key, $expectedStatus): CashlessEntryBatch {
            $lane = $this->lane($id)->lockForUpdate()->first();
            $batch = CashlessEntryBatch::whereKey($id)->lockForUpdate()->firstOrFail();
            abort_unless($actor->canManagePickup() || ($actor->canExecutePickup() && $batch->created_by === $actor->id), 404);
            $hash = hash('sha256', json_encode([$actor->id, $action, $reason, $expectedStatus], JSON_THROW_ON_ERROR));
            $previous = DB::table('cashless_entry_events')->where('batch_id', $id)->where('event_key', $key)->first();
            if ($previous !== null) {
                abort_unless(hash_equals($previous->payload_hash, $hash), 409, 'Permintaan pemulihan sudah digunakan untuk tindakan berbeda.');

                return CashlessEntryBatch::findOrFail(json_decode($previous->evidence, true, flags: JSON_THROW_ON_ERROR)['result_batch_id']);
            }
            abort_unless($batch->status === $expectedStatus, 409, 'Status batch berubah. Segarkan sebelum melanjutkan.');
            if ($action === 'inspect') {
                abort_unless($batch->status === 'UNKNOWN' && $batch->ho_number !== null && $lane !== null
                    && ($lane->active_batch_id === null || (int) $lane->active_batch_id === $id), 409, 'HO tidak dapat diperiksa saat ini; akun sedang dipakai atau batch belum tertahan.');
                $batch->update(['status' => 'INSPECTING', 'worker_id' => null, 'claim_key' => null, 'claim_token_hash' => null, 'lease_until' => null,
                    'error_message' => 'Pemeriksaan isi HO diantrekan; tidak ada scan atau approval ulang.']);
                $this->lane($id)->update(['active_batch_id' => $id]);
                $result = $batch;
            } elseif ($action === 'finalize') {
                $result = $this->resumeVerification($id, $reason, actor: $actor);
            } else {
                abort_unless($action === 'retry', 422);
                $result = $this->retryFailures($id, $reason, $actor);
            }
            DB::table('cashless_entry_events')->insert(['batch_id' => $id, 'event_key' => $key, 'payload_hash' => $hash,
                'type' => 'recovery-requested', 'evidence' => json_encode(['actor_id' => $actor->id, 'action' => $action, 'reason' => $reason,
                    'result_batch_id' => $result->id], JSON_THROW_ON_ERROR), 'created_at' => now()]);

            return $result;
        }, 3);
    }

    public function resumeVerification(int $id, string $reason, bool $confirmApproval = false, ?User $actor = null): CashlessEntryBatch
    {
        abort_if(trim($reason) === '' || mb_strlen($reason) > 500, 422, 'Alasan pemulihan wajib diisi, maksimal 500 karakter.');
        $source = CashlessEntryBatch::findOrFail($id)->source;

        return DB::transaction(function () use ($id, $reason, $confirmApproval, $actor): CashlessEntryBatch {
            $lane = $this->lane($id)->lockForUpdate()->first();
            $batch = CashlessEntryBatch::whereKey($id)->lockForUpdate()->firstOrFail();
            abort_unless($batch->status === 'UNKNOWN' && $lane !== null && ($lane->active_batch_id === null || (int) $lane->active_batch_id === $id)
                && $batch->ho_number !== null && ($confirmApproval ? $batch->verification !== null : $batch->verification === null) && $batch->approved_at === null,
                409, 'Status batch, bukti approval, atau HO tidak memenuhi syarat pemulihan ini.');
            $items = $batch->items()->lockForUpdate()->get();
            abort_unless($items->contains('status', 'ACCEPTED') && $items->every(fn ($item): bool => in_array($item->status,
                ['ACCEPTED', 'PREVIOUSLY_ENTERED', 'ORION_REJECTED', 'NOT_FOUND', 'NEEDS_DATA', 'INVALID', 'CANCELLED'], true)),
                409, 'Masih ada input tanpa hasil pasti. Jangan ulangi resi atau approval.');
            $batch->update(['status' => $confirmApproval ? 'CONFIRMING' : 'VERIFYING', 'worker_id' => null, 'claim_key' => null, 'claim_token_hash' => null,
                'lease_until' => null, 'error_message' => null]);
            $this->lane($id)->update(['active_batch_id' => $id]);
            $evidence = json_encode(['operator' => $actor?->id ?? 'console', 'reason' => $reason, 'ho_number' => $batch->ho_number], JSON_THROW_ON_ERROR);
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
            $awbs = [];
            foreach ($unbatched as $record) {
                $awb = $record->awb;
                abort_unless(is_string($awb) && preg_match('/^[A-Z0-9_$-]{1,16}$/D', $awb) === 1 && preg_match('/^(0101|0166)[0-9]+$/D', $awb) !== 1,
                    409, 'Periksa format resi cashless '.$record->awb.' sebelum memproses.');
                $awbs[] = $awb;
            }
            $batch = $this->enqueue((string) Str::uuid(), $taskId, $proof->staff_id, $awbs, self::CaptureSource);
            $evidence = json_encode(['reason' => $reason, 'pickup_record_id' => $proof->id, 'source' => self::CaptureSource], JSON_THROW_ON_ERROR);
            DB::table('cashless_entry_events')->insert(['batch_id' => $batch->id, 'event_key' => (string) Str::uuid(),
                'payload_hash' => hash('sha256', $evidence), 'type' => 'recorded-awbs-queued', 'evidence' => $evidence, 'created_at' => now()]);

            return $batch;
        }, 3);
    }

    /** @param list<string> $awbs */
    public function enqueue(string $submissionKey, int $taskId, int $actorId, array $awbs, ?string $source): CashlessEntryBatch
    {
        $personal = config('pickup.cashless_entry.per_user_accounts') && $source === self::CaptureSource;
        $owner = $personal ? User::findOrFail($actorId) : null;
        $batch = CashlessEntryBatch::create([
            'submission_key' => $submissionKey, 'pickup_task_id' => $taskId, 'created_by' => $actorId,
            'hybrid_user_id' => $owner?->id,
            'source' => $source, 'status' => $source === null ? 'WAITING_SOURCE' : ($personal && $owner->hybrid_password === null ? 'WAITING_ACCOUNT' : 'QUEUED'),
        ]);
        $now = now();
        CashlessEntryItem::insert(PickupCashlessAwb::where('pickup_task_id', $taskId)->whereIn('awb', $awbs)->orderBy('id')->get()
            ->map(fn (PickupCashlessAwb $record): array => ['batch_id' => $batch->id, 'pickup_cashless_awb_id' => $record->id,
                'awb' => $record->awb, 'status' => 'PENDING', 'created_at' => $now, 'updated_at' => $now])->all());

        return $batch;
    }

    public function retryFailures(int $id, string $reason, ?User $actor = null): CashlessEntryBatch
    {
        abort_if(trim($reason) === '' || mb_strlen($reason) > 500, 422, 'Alasan retry wajib diisi, maksimal 500 karakter.');

        return DB::transaction(function () use ($id, $reason, $actor): CashlessEntryBatch {
            $previous = CashlessEntryBatch::whereKey($id)->lockForUpdate()->firstOrFail();
            abort_unless(in_array($previous->status, CashlessEntryBatch::Terminal, true)
                && in_array($previous->source, self::Sources, true), 409, 'Batch belum selesai atau server belum ditentukan.');
            abort_if($previous->items()->whereIn('status', ['UNKNOWN', 'IN_FLIGHT', 'PENDING'])->exists()
                || ($previous->approved_at === null && $previous->items()->where('status', 'ACCEPTED')->exists()), 409, 'Periksa hasil input dan selesaikan HO asal sebelum retry.');
            $recordIds = $previous->items()->whereIn('status', ['NOT_FOUND', 'NEEDS_DATA', 'INVALID', 'CANCELLED'])->pluck('pickup_cashless_awb_id');
            abort_if($recordIds->isEmpty(), 409, 'Tidak ada resi gagal yang aman untuk diulang.');
            abort_if(CashlessEntryItem::whereIn('pickup_cashless_awb_id', $recordIds)->where('batch_id', '>', $id)->exists(), 409, 'Gunakan batch percobaan terakhir. Resi sudah memiliki percobaan lanjutan.');
            $records = PickupCashlessAwb::whereIn('id', $recordIds)->orderBy('id')->lockForUpdate()->get();
            $awbs = [];
            foreach ($records as $record) {
                abort_unless($record->pickup_task_id === $previous->pickup_task_id && is_string($record->awb)
                    && preg_match('/^[A-Z0-9_$-]{1,16}$/D', $record->awb) === 1 && preg_match('/^(0101|0166)[0-9]+$/D', $record->awb) !== 1,
                    409, 'Perbaiki nomor resi dan bukti handover sebelum mengulang.');
                $awbs[] = $record->awb;
            }
            $batch = $this->enqueue((string) Str::uuid(), $previous->pickup_task_id, $previous->created_by,
                $awbs, self::CaptureSource);
            $evidence = json_encode(['operator' => $actor?->id ?? 'console', 'previous_batch_id' => $id, 'reason' => $reason], JSON_THROW_ON_ERROR);
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
            $lane = $this->lane($id)->lockForUpdate()->first();
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
            $this->lane($id)->where('active_batch_id', $id)->update(['active_batch_id' => null]);
            $next = $pending->isEmpty() ? null : $this->enqueue((string) Str::uuid(), $batch->pickup_task_id,
                $batch->created_by, $awbs, self::CaptureSource);
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
        if (str_starts_with($worker, 'cashless-')) {
            return config('pickup.cashless_entry.per_user_accounts') ? $this->claimPersonal($source, $worker, $claimKey) : null;
        }
        if (config('pickup.cashless_entry.per_user_accounts')) {
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
                if (in_array($active->status, ['VERIFYING', 'CONFIRMING', 'INSPECTING'], true) && $active->worker_id === null) {
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
            $lane = $this->lane($id)->lockForUpdate()->first();
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
                $this->lane($id)->where('active_batch_id', $id)->update(['active_batch_id' => null]);
            }

            return $batch;
        }, 3);
    }

    private function lane(int $id): Builder
    {
        $batch = CashlessEntryBatch::findOrFail($id);
        if ($batch->hybrid_user_id !== null) {
            DB::table('cashless_entry_lanes')->where('source', $batch->source)->lockForUpdate()->first();

            return DB::table('cashless_entry_user_lanes')->where('source', $batch->source)->where('user_id', $batch->hybrid_user_id);
        }

        return DB::table('cashless_entry_lanes')->where('source', $batch->source);
    }

    private function claimPersonal(string $source, string $worker, string $claimKey): ?CashlessEntryBatch
    {
        abort_unless($source === self::CaptureSource && preg_match('/^cashless-roberto-[1-5]$/D', $worker), 403);

        return DB::transaction(function () use ($source, $worker, $claimKey): ?CashlessEntryBatch {
            DB::table('cashless_entry_lanes')->where('source', $source)->lockForUpdate()->firstOrFail();
            $replay = CashlessEntryBatch::where('claim_key', $claimKey)->lockForUpdate()->first();
            if ($replay !== null) {
                abort_unless($replay->worker_id === $worker && $replay->source === $source && $replay->hybrid_user_id !== null, 409);

                return ! in_array($replay->status, [...CashlessEntryBatch::Terminal, 'UNKNOWN'], true) && $replay->lease_until?->isFuture() ? $replay->load('items') : null;
            }
            $active = CashlessEntryBatch::where('source', $source)->whereNotNull('hybrid_user_id')
                ->whereNotNull('worker_id')->whereNotIn('status', [...CashlessEntryBatch::Terminal, 'UNKNOWN', 'QUEUED', 'WAITING_ACCOUNT'])->lockForUpdate()->get();
            foreach ($active as $batch) {
                if ($batch->lease_until?->isFuture()) {
                    continue;
                }
                $untouched = $batch->status === 'CLAIMED';
                $batch->update(['status' => $untouched ? 'QUEUED' : 'UNKNOWN', 'lease_until' => null,
                    ...($untouched ? ['worker_id' => null, 'claim_key' => null, 'claim_token_hash' => null] : ['error_message' => 'Lease worker habis. Periksa HO dan hasil input sebelum mengulang.'])]);
                $this->lane($batch->id)->where('active_batch_id', $batch->id)->update(['active_batch_id' => null]);
            }
            $busy = $active->filter(fn ($batch): bool => $batch->lease_until?->isFuture() ?? false);
            if ($busy->count() >= 5 || $busy->contains('worker_id', $worker)) {
                return null;
            }
            $users = User::where('is_active', true)->whereIn('role', User::PICKUP_ROLES)->whereNotNull('hybrid_password')->whereNotNull('hybrid_account_key')
                ->whereNotIn('id', $busy->pluck('hybrid_user_id'))->select('id');
            $batch = CashlessEntryBatch::where('source', $source)->whereIn('hybrid_user_id', $users)
                ->where(fn ($query) => $query->where('status', 'QUEUED')->orWhere(fn ($query) => $query->whereIn('status', ['VERIFYING', 'CONFIRMING', 'INSPECTING'])->whereNull('worker_id')))
                ->orderBy('id')->lockForUpdate()->first();
            if ($batch === null) {
                return null;
            }
            DB::table('cashless_entry_user_lanes')->insertOrIgnore(['source' => $source, 'user_id' => $batch->hybrid_user_id, 'active_batch_id' => null]);
            $lane = $this->lane($batch->id)->lockForUpdate()->firstOrFail();
            abort_if($lane->active_batch_id !== null && (int) $lane->active_batch_id !== $batch->id, 409, 'Akun masih menjalankan batch lain.');
            $batch->forceFill(['status' => $batch->status === 'QUEUED' ? 'CLAIMED' : $batch->status, 'worker_id' => $worker, 'claim_key' => $claimKey,
                'claim_token_hash' => hash('sha256', $this->token($batch, $claimKey)), 'lease_until' => now()->addSeconds(300)])->save();
            $this->lane($batch->id)->update(['active_batch_id' => $batch->id]);

            return $batch->load('items');
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
        if ($type === 'inspection-result') {
            $this->applyInspection($batch, $data);

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
                $message = (string) ($data['message'] ?? '');
                $outcome = $this->outcome($message, $item->awb);
                abort_unless($outcome === $data['outcome'], 422, 'Pesan server tidak mendukung hasil resi.');
                preg_match('/nomor\s*:\s*(HO-[A-Z0-9-]+)/i', $message, $previous);
                $item->update(['status' => $outcome, 'message' => $message, 'previous_ho' => $previous[1] ?? null,
                    'elapsed_ms' => $data['elapsed_ms'] ?? null]);
                if ($outcome === 'UNKNOWN') {
                    $batch->status = 'UNKNOWN';
                    $batch->error_message = $message === '' ? 'Respons Hybrid kosong. Periksa hasil input pada HO sebelum melanjutkan.' : 'Respons Hybrid belum dikenali: '.$message;
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

    /** @param array<string, mixed> $data */
    private function applyInspection(CashlessEntryBatch $batch, array $data): void
    {
        abort_unless($batch->status === 'INSPECTING' && $data['ho_number'] === $batch->ho_number
            && $data['filters_clear'] === true && $data['ui_total'] === count($data['verified_awbs'])
            && $data['print_available'] !== $data['approve_available'], 409, 'Isi atau status HO belum dapat dibuktikan lengkap.');
        $items = $batch->items()->lockForUpdate()->get();
        $observed = collect($data['verified_awbs']);
        abort_if(CashlessEntryItem::whereIn('pickup_cashless_awb_id', $items->where('status', '!=', 'CANCELLED')->pluck('pickup_cashless_awb_id'))->where('batch_id', '>', $batch->id)->exists(),
            409, 'Resi sudah memiliki percobaan lanjutan. Bukti batch lama tidak diubah.');
        abort_if($observed->diff($items->pluck('awb'))->isNotEmpty(), 409, 'HO memuat resi di luar batch. Pemeriksaan manual diperlukan.');
        foreach ($items as $item) {
            $record = PickupCashlessAwb::whereKey($item->pickup_cashless_awb_id)->lockForUpdate()->firstOrFail();
            abort_unless($record->awb === $item->awb && $record->pickup_task_id === $batch->pickup_task_id, 409, 'Resi pickup telah dikoreksi; bukti batch tidak lagi sesuai.');
            abort_if(($item->status === 'ACCEPTED' && ! $observed->contains($item->awb))
                || ($observed->contains($item->awb) && ! in_array($item->status, ['ACCEPTED', 'UNKNOWN', 'IN_FLIGHT'], true)),
                409, 'Isi HO bertentangan dengan riwayat percobaan. Tidak ada resi yang diulang.');
        }
        abort_if($observed->isEmpty() && $data['print_available'], 409, 'Approval HO kosong tidak dapat dibuktikan.');
        foreach ($items as $item) {
            if (in_array($item->status, ['UNKNOWN', 'IN_FLIGHT', 'PENDING'], true)) {
                $found = $observed->contains($item->awb);
                $item->update(['status' => $found ? 'ACCEPTED' : 'CANCELLED',
                    'message' => $found ? 'Input dikonfirmasi dari isi HO yang sama.' : 'Tidak tercantum pada HO yang diperiksa lengkap; dapat diantrekan ulang.']);
            }
        }
        if ($observed->isEmpty()) {
            $batch->status = 'FAILED';
            $batch->error_message = 'HO terverifikasi kosong. Resi yang belum masuk dapat diproses ulang.';
        } elseif ($data['print_available']) {
            $batch->verification = ['ho_number' => $batch->ho_number, 'awbs' => $observed->sort()->values()->all()];
            $batch->approved_at ??= now();
            $batch->status = $batch->items()->where('status', '!=', 'ACCEPTED')->exists() ? 'PARTIAL' : 'DONE';
            $batch->error_message = null;
        } else {
            $batch->status = 'UNKNOWN';
            $batch->error_message = 'Isi HO telah diperiksa. Selesaikan HO asal terlebih dahulu; resi yang belum masuk tetap disimpan untuk retry.';
        }
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
