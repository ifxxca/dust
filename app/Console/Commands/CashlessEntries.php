<?php

namespace App\Console\Commands;

use App\Actions\Pickup\ManageCashlessEntryBatches;
use App\Models\CashlessEntryBatch;
use App\Observers\CashlessEntryAlertObserver;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

#[Signature('cashless:entries {--source=} {--batch=} {--queue-unbatched= : Queue recorded resi without batch history for a finalized pickup to Puman} {--resume-verification= : Recheck an existing HO without creating or scanning again before its first approval} {--confirm-approval= : Read approval evidence for a held batch without clicking Approve again} {--route= : Route an unassigned batch to the explicit source} {--cancel= : Cancel an unclaimed batch only} {--retry= : Create a new batch for definitive failures only} {--resolve-orion= : Resolve a known Orion rejection before any accepted input} {--notify-existing : Notify owners of displayed problematic batches without replaying input} {--reason=}')]
#[Description('Inspect cashless entry batches and route a legacy unassigned batch without replaying external input')]
class CashlessEntries extends Command
{
    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        try {
            return $this->runBatchCommand();
        } catch (HttpExceptionInterface $exception) {
            $this->error($exception->getMessage() ?: 'Batch tidak dapat diubah.');

            return self::FAILURE;
        } catch (ModelNotFoundException) {
            $this->error('Batch tidak ditemukan.');

            return self::FAILURE;
        }
    }

    private function runBatchCommand(): int
    {
        if (count(array_filter([$this->option('route'), $this->option('cancel'), $this->option('retry'), $this->option('resolve-orion'), $this->option('queue-unbatched'), $this->option('resume-verification'), $this->option('confirm-approval')], fn ($value): bool => $value !== null)) > 1) {
            $this->error('Pilih satu tindakan: route, cancel, retry, resolve-orion, queue-unbatched, atau resume-verification.');

            return self::FAILURE;
        }
        $source = $this->option('source');
        if ($source !== null && ! in_array($source, ManageCashlessEntryBatches::Sources, true)) {
            $this->error('Source harus roberto (PM) atau nuralamt (Puman).');

            return self::FAILURE;
        }
        if ($this->option('queue-unbatched') !== null) {
            $reason = trim((string) $this->option('reason'));
            if (! ctype_digit((string) $this->option('queue-unbatched')) || $reason === '' || mb_strlen($reason) > 500 || ($source !== null && $source !== 'nuralamt')) {
                $this->error('Gunakan --queue-unbatched=PICKUP_ID --reason="alasan". Resi diteruskan ke Puman.');

                return self::FAILURE;
            }
            $batch = app(ManageCashlessEntryBatches::class)->enqueueUnbatched((int) $this->option('queue-unbatched'), $reason);
            $this->info($batch === null ? 'Tidak ada resi tanpa riwayat batch yang perlu diantrekan.' : 'Batch Puman #'.$batch->id.' dibuat untuk resi yang belum pernah diantrekan.');
        }
        if ($this->option('resume-verification') !== null) {
            $reason = trim((string) $this->option('reason'));
            if (! ctype_digit((string) $this->option('resume-verification')) || $reason === '' || mb_strlen($reason) > 500) {
                $this->error('Gunakan --resume-verification=BATCH_ID --reason="alasan". Resi dan HO tidak diulang.');

                return self::FAILURE;
            }
            $batch = app(ManageCashlessEntryBatches::class)->resumeVerification((int) $this->option('resume-verification'), $reason);
            $this->info('Pemeriksaan ulang HO '.$batch->ho_number.' dijadwalkan pada batch yang sama.');
        }
        if ($this->option('confirm-approval') !== null) {
            $reason = trim((string) $this->option('reason'));
            if (! ctype_digit((string) $this->option('confirm-approval')) || $reason === '' || mb_strlen($reason) > 500) {
                $this->error('Gunakan --confirm-approval=BATCH_ID --reason="alasan". Approve tidak diklik ulang.');

                return self::FAILURE;
            }
            $batch = app(ManageCashlessEntryBatches::class)->resumeVerification((int) $this->option('confirm-approval'), $reason, confirmApproval: true);
            $this->info('Konfirmasi baca-saja HO '.$batch->ho_number.' dijadwalkan tanpa klik Approve ulang.');
        }
        if ($this->option('route') !== null) {
            if ($source === null || ! ctype_digit((string) $this->option('route'))) {
                $this->error('Gunakan --route=ID --source=roberto atau nuralamt.');

                return self::FAILURE;
            }
            DB::transaction(function () use ($source): void {
                $batch = CashlessEntryBatch::whereKey($this->option('route'))->lockForUpdate()->firstOrFail();
                abort_unless($batch->status === 'WAITING_SOURCE' && $batch->source === null && $batch->claim_key === null, 409, 'Batch sudah memiliki server atau pernah diproses.');
                $batch->update(['source' => $source, 'status' => 'QUEUED']);
                $this->audit($batch, 'routed', ['source' => $source]);
            });
        }
        if ($this->option('cancel') !== null) {
            $reason = trim((string) $this->option('reason'));
            if (! ctype_digit((string) $this->option('cancel')) || $reason === '' || mb_strlen($reason) > 500 || $this->option('route') !== null) {
                $this->error('Gunakan --cancel=ID --reason="alasan" untuk batch yang belum diklaim.');

                return self::FAILURE;
            }
            DB::transaction(function () use ($reason): void {
                $batch = CashlessEntryBatch::whereKey($this->option('cancel'))->lockForUpdate()->firstOrFail();
                abort_unless(in_array($batch->status, ['WAITING_SOURCE', 'QUEUED'], true) && $batch->claim_key === null, 409, 'Batch pernah diklaim; hasil eksternal harus diperiksa terlebih dahulu.');
                $batch->update(['status' => 'CANCELLED', 'error_message' => $reason]);
                $batch->items()->where('status', 'PENDING')->update(['status' => 'CANCELLED']);
                $this->audit($batch, 'cancelled', ['reason' => $reason]);
            });
        }
        if ($this->option('retry') !== null) {
            $reason = trim((string) $this->option('reason'));
            if (! ctype_digit((string) $this->option('retry')) || $reason === '' || mb_strlen($reason) > 500) {
                $this->error('Gunakan --retry=ID --reason="alasan" untuk resi gagal pada batch terakhir.');

                return self::FAILURE;
            }
            $batch = app(ManageCashlessEntryBatches::class)->retryFailures((int) $this->option('retry'), $reason);
            $this->info('Batch baru #'.$batch->id.' dibuat. Worker akan membuat HO baru.');
        }
        if ($this->option('resolve-orion') !== null) {
            $reason = trim((string) $this->option('reason'));
            if (! ctype_digit((string) $this->option('resolve-orion')) || $reason === '' || mb_strlen($reason) > 500) {
                $this->error('Gunakan --resolve-orion=ID --reason="alasan" untuk penolakan Orion yang sudah tercatat.');

                return self::FAILURE;
            }
            $batch = app(ManageCashlessEntryBatches::class)->resolveOrionRejection((int) $this->option('resolve-orion'), $reason);
            $this->info($batch->status === 'QUEUED'
                ? 'Batch baru #'.$batch->id.' dibuat untuk resi yang belum selesai. HO sebelumnya tidak dilanjutkan.'
                : 'Batch ditutup tanpa approval. Tidak ada resi tersisa.');
        }
        $this->line('Eksekusi eksternal: '.(config('pickup.cashless_entry.enabled') ? 'aktif' : 'nonaktif (mode persiapan site)'));
        $batches = CashlessEntryBatch::query()->when($source, fn ($query) => $query->where('source', $source))
            ->when($this->option('batch'), fn ($query, $id) => $query->whereKey($id))->withCount('items')->latest('id')->limit(20)->get();
        if ($this->option('notify-existing')) {
            foreach ($batches as $batch) {
                app(CashlessEntryAlertObserver::class)->saved($batch);
            }
            $this->info('Notifikasi batch bermasalah disimpan tanpa mengulang input resi.');
        }
        $this->table(['Batch', 'Pickup', 'Server', 'Status', 'HO', 'Resi', 'Keterangan'], $batches->map(fn (CashlessEntryBatch $batch): array => [
            $batch->id, $batch->pickup_task_id, $batch->source ?? '-', $batch->status, $batch->ho_number ?? '-', $batch->items_count, $batch->error_message ?? '-',
        ])->all());
        if ($this->option('batch')) {
            foreach ($batches as $batch) {
                $this->table(['AWB', 'Status', 'Pesan'], $batch->items->map(fn ($item): array => [$item->awb, $item->status, $item->message ?? '-'])->all());
            }
        }

        return self::SUCCESS;
    }

    /** @param array<string, string> $evidence */
    private function audit(CashlessEntryBatch $batch, string $type, array $evidence): void
    {
        $json = json_encode(['operator' => 'console', ...$evidence], JSON_THROW_ON_ERROR);
        DB::table('cashless_entry_events')->insert(['batch_id' => $batch->id, 'event_key' => (string) Str::uuid(),
            'type' => $type, 'payload_hash' => hash('sha256', $json), 'evidence' => $json, 'created_at' => now()]);
    }
}
