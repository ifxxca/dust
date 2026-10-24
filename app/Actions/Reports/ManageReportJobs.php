<?php

namespace App\Actions\Reports;

use App\Jobs\ImportJneReportAwbs;
use App\Models\ReportJob;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Throwable;

class ManageReportJobs
{
    public function __construct(private CombineHybridReports $combiner) {}

    public function claim(string $workerId, string $claimKey, string $source = 'apex'): ?ReportJob
    {
        abort_unless(array_key_exists($source, ReportJob::SOURCE_SLOTS), 422);
        $this->recoverExpired();

        try {
            return DB::transaction(function () use ($workerId, $claimKey, $source): ?ReportJob {
                $existing = ReportJob::where('claim_key', $claimKey)->lockForUpdate()->first();
                if ($existing !== null) {
                    abort_unless($existing->worker_id === $workerId && ($existing->source === $source || ($source === 'apex' && $existing->source_file_path)), 409);

                    return $existing;
                }

                $slot = ReportJob::SOURCE_SLOTS[$source];
                $job = ReportJob::where(function ($query) use ($source): void {
                    $query->where(fn ($query) => $query->where('source', $source)->where('status', 'QUEUED'));
                    if ($source === 'apex') {
                        $query->orWhere(fn ($query) => $query->where('status', 'WAITING_APEX')->whereNotNull('source_file_path'));
                    }
                })->orderBy('id')->lockForUpdate()->first();
                if ($job === null || ReportJob::where('active_slot', $slot)->lockForUpdate()->exists()) {
                    return null;
                }

                $job->update([
                    'status' => 'RUNNING', 'worker_id' => $workerId, 'claim_key' => $claimKey,
                    'claim_token' => Str::random(64), 'active_slot' => $slot,
                    'attempt_count' => $job->attempt_count + 1, 'started_at' => $job->started_at ?? now(),
                    'lease_expires_at' => now()->addSeconds(config('jne-reports.lease_seconds')),
                ]);
                $job->recordEvent($job->source_file_path ? 'Worker APEX mengambil AWB Hybrid untuk Upload Connote.' : 'Worker mengambil antrean.');

                return $job;
            }, 5);
        } catch (UniqueConstraintViolationException) {
            return null;
        }
    }

    public function progress(int $id, string $workerId, string $claimToken, string $status): ReportJob
    {
        return DB::transaction(function () use ($id, $workerId, $claimToken, $status): ReportJob {
            $job = ReportJob::whereKey($id)->lockForUpdate()->firstOrFail();
            $this->assertOwner($job, $workerId, $claimToken);
            $next = ['RUNNING' => 'WAITING_REPORT', 'WAITING_REPORT' => 'DOWNLOADING'];
            abort_unless(in_array($job->status, ReportJob::ACTIVE_STATUSES, true) && ($job->status === $status || ($next[$job->status] ?? null) === $status), 409, 'Transisi status report tidak valid.');
            $changed = $job->status !== $status;
            $job->update(['status' => $status, 'lease_expires_at' => now()->addSeconds(config('jne-reports.lease_seconds'))]);
            if ($changed) {
                $job->recordEvent();
            }

            return $job;
        }, 5);
    }

    public function fail(int $id, string $workerId, string $claimToken, string $status, string $message): ReportJob
    {
        $job = DB::transaction(function () use ($id, $workerId, $claimToken, $status, $message): ReportJob {
            $job = ReportJob::whereKey($id)->lockForUpdate()->firstOrFail();
            $this->assertOwner($job, $workerId, $claimToken, false);
            if ($job->status === $status && $job->error_message === $message) {
                return $job;
            }
            abort_unless(in_array($job->status, ReportJob::ACTIVE_STATUSES, true) && $job->lease_expires_at?->isFuture(), 409, 'Job tidak lagi aktif.');
            $job->update(['status' => $status, 'error_message' => $message, 'active_slot' => null, 'lease_expires_at' => null]);
            $job->recordEvent($message);

            return $job;
        }, 5);
        if ($job->hybrid_batch_id) {
            $this->combiner->handle($job->hybrid_batch_id);
        }

        return $job;
    }

    public function upload(int $id, string $workerId, string $claimToken, UploadedFile $file, ?int $rowCount = null): ReportJob
    {
        $checksum = hash_file('sha256', $file->getRealPath());
        abort_unless(is_string($checksum), 422, 'Checksum tidak dapat dihitung.');

        return DB::transaction(function () use ($id, $workerId, $claimToken, $file, $checksum, $rowCount): ReportJob {
            $job = ReportJob::whereKey($id)->lockForUpdate()->firstOrFail();
            $this->assertOwner($job, $workerId, $claimToken, false);
            $disk = Storage::disk('jne_reports');
            if ($job->status === 'COMPLETED') {
                abort_unless(hash_equals($job->file_checksum, $checksum) && $disk->exists($job->file_path), 409, 'CSV yang berbeda sudah tersimpan atau file tidak tersedia.');
                $this->enqueueImport($job);

                return $job;
            }
            abort_unless($job->status === 'DOWNLOADING' && $job->lease_expires_at?->isFuture(), 409, 'Job belum siap menerima CSV.');
            $path = 'report-jobs/'.$job->id.'/'.$checksum.'.csv';
            try {
                $stored = $disk->putFileAs('report-jobs/'.$job->id, $file, $checksum.'.csv', ['visibility' => 'private']);
                abort_unless($stored === $path, 503, 'Penyimpanan CSV gagal. Coba upload file yang sama.');
                $job->update([
                    'status' => 'COMPLETED', 'file_path' => $path, 'file_size' => $file->getSize(),
                    'file_checksum' => $checksum, 'file_mime' => $file->getMimeType(),
                    'completed_at' => now(), 'active_slot' => null, 'lease_expires_at' => null, 'error_message' => null,
                    'row_count' => $rowCount,
                ]);
                $job->recordEvent('CSV tervalidasi dan tersimpan.');
            } catch (Throwable $exception) {
                $disk->delete($path);
                throw $exception;
            }
            $this->enqueueImport($job);

            return $job;
        });
    }

    /** @param list<string> $awbs */
    public function uploadSource(int $id, string $workerId, string $claimToken, UploadedFile $file, int $rowCount, array $awbs): ReportJob
    {
        $checksum = hash_file('sha256', $file->getRealPath());
        abort_unless(is_string($checksum), 422);

        $batchId = ReportJob::whereKey($id)->value('hybrid_batch_id');

        return DB::transaction(function () use ($id, $workerId, $claimToken, $file, $rowCount, $awbs, $checksum, $batchId): ReportJob {
            if ($batchId !== null) {
                ReportJob::whereKey($batchId)->lockForUpdate()->firstOrFail();
            }
            $job = ReportJob::whereKey($id)->lockForUpdate()->firstOrFail();
            if ($job->source_file_path) {
                abort_unless($job->source_worker_id === $workerId && $claimToken !== '' && is_string($job->source_claim_token) && hash_equals($job->source_claim_token, $claimToken), 403);
                abort_unless(hash_equals($job->source_file_checksum, $checksum), 409, 'CSV sumber berbeda sudah tersimpan.');

                return $job;
            }
            $this->assertOwner($job, $workerId, $claimToken);
            abort_unless($job->source !== 'apex' && $job->status === 'DOWNLOADING', 409);
            $disk = Storage::disk('jne_reports');
            $path = 'report-jobs/'.$job->id.'/source-'.$checksum.'.csv';
            try {
                abort_unless($disk->putFileAs('report-jobs/'.$job->id, $file, 'source-'.$checksum.'.csv', ['visibility' => 'private']) === $path, 503);
                $job->update([
                    'source_file_path' => $path, 'source_file_checksum' => $checksum, 'source_row_count' => $rowCount,
                    'awb_count' => count($awbs), 'source_worker_id' => $workerId, 'source_claim_token' => $claimToken,
                    'parameters' => ['awbs' => $awbs], 'report_mode' => 'A', 'status' => $batchId !== null ? 'SOURCE_SAVED' : ($awbs === [] ? 'NO_DATA' : 'WAITING_APEX'),
                    'active_slot' => null, 'lease_expires_at' => null, 'claim_key' => null, 'claim_token' => null,
                    'completed_at' => $batchId !== null || $awbs === [] ? now() : null,
                ]);
                $job->recordEvent($awbs === [] ? 'CSV Hybrid kosong; tidak ada AWB untuk dikirim ke APEX.' : count($awbs).' AWB unik dari '.$rowCount.' baris Hybrid menunggu konversi APEX.');
                if ($batchId !== null) {
                    $batch = ReportJob::whereKey($batchId)->firstOrFail();
                    $batch->recordEvent($job->source.' '.$job->report_type.' tersimpan: '.$rowCount.' baris, '.count($awbs).' AWB unik.');
                    $this->combiner->handle($batchId);
                }
            } catch (Throwable $exception) {
                $disk->delete($path);
                throw $exception;
            }

            return $job;
        });
    }

    public function queueImport(int $id): ReportJob
    {
        return DB::transaction(function () use ($id): ReportJob {
            $job = ReportJob::whereKey($id)->lockForUpdate()->firstOrFail();
            abort_unless($job->status === 'COMPLETED' && $job->file_path, 409, 'CSV belum selesai disimpan.');
            $this->enqueueImport($job);

            return $job;
        });
    }

    public function retryHybridSources(int $id, int $actorId): ReportJob
    {
        return DB::transaction(function () use ($id, $actorId): ReportJob {
            $batch = ReportJob::whereKey($id)->lockForUpdate()->firstOrFail();
            abort_unless($batch->source === 'hybrid' && $batch->report_type === 'combined' && $batch->status === 'NEEDS_ATTENTION' && $batch->source_file_path === null && $batch->file_path === null, 409, 'Hanya pengumpulan Hybrid yang belum dikirim ke APEX yang dapat diulang.');
            $failed = ReportJob::where('hybrid_batch_id', $batch->id)->whereIn('status', ['FAILED', 'NEEDS_ATTENTION'])->whereNull('source_file_path')->lockForUpdate()->get();
            abort_if($failed->isEmpty(), 409, 'Tidak ada sumber Hybrid gagal yang perlu diulang.');
            foreach ($failed as $source) {
                $source->update(['status' => 'QUEUED', 'worker_id' => null, 'claim_key' => null, 'claim_token' => null, 'active_slot' => null, 'lease_expires_at' => null, 'completed_at' => null, 'error_message' => null, 'reviewed_at' => null, 'reviewed_by' => null, 'review_note' => null]);
                $source->recordEvent("Admin #{$actorId} mengantrekan ulang sumber yang gagal; sumber tersimpan tetap digunakan.");
            }
            $batch->update(['status' => 'COLLECTING_SOURCES', 'error_message' => null, 'reviewed_at' => null, 'reviewed_by' => null, 'review_note' => null]);
            $batch->recordEvent("Admin #{$actorId} mengulang {$failed->count()} sumber Hybrid gagal. Process APEX belum dijalankan.");

            return $batch;
        });
    }

    private function enqueueImport(ReportJob $job): void
    {
        if ($job->source !== 'apex' && ! $job->source_file_path) {
            return;
        }
        if (in_array($job->import_status, ['IMPORTED', 'QUEUED'], true)) {
            return;
        }
        $job->update(['import_status' => 'QUEUED', 'import_error' => null, 'projection_status' => 'QUEUED', 'projection_error' => null,
            'reviewed_at' => null, 'reviewed_by' => null, 'review_note' => null]);
        ImportJneReportAwbs::dispatch($job->id)->afterCommit();
    }

    public function queueProjection(int $id): void
    {
        DB::transaction(function () use ($id): void {
            $job = ReportJob::whereKey($id)->lockForUpdate()->firstOrFail();
            abort_unless($job->status === 'COMPLETED' && $job->import_status === 'IMPORTED', 409, 'Impor CSV harus selesai sebelum memperbarui monitoring.');
            if (in_array($job->projection_status, ['QUEUED', 'PROJECTED'], true)) {
                return;
            }
            $job->update(['projection_status' => 'QUEUED', 'projection_error' => null, 'reviewed_at' => null, 'reviewed_by' => null, 'review_note' => null]);
            ImportJneReportAwbs::dispatch($job->id)->afterCommit();
        });
    }

    public function recoverExpired(): int
    {
        $batchIds = [];
        $count = DB::transaction(function () use (&$batchIds): int {
            $jobs = ReportJob::whereNotNull('active_slot')->where('lease_expires_at', '<=', now())->lockForUpdate()->get();
            foreach ($jobs as $job) {
                $job->update([
                    'status' => 'NEEDS_ATTENTION', 'active_slot' => null, 'lease_expires_at' => null,
                    'error_message' => 'WORKER_EXPIRED: Worker berhenti merespons. Periksa History JNE sebelum membuat permintaan baru; report tidak dikirim ulang otomatis.',
                ]);
                $job->recordEvent($job->error_message);
                if ($job->hybrid_batch_id) {
                    $batchIds[] = $job->hybrid_batch_id;
                }
            }

            return $jobs->count();
        }, 5);
        foreach (array_unique($batchIds) as $batchId) {
            $this->combiner->handle($batchId);
        }

        return $count;
    }

    public function assertOwner(ReportJob $job, string $workerId, string $claimToken, bool $requireLease = true): void
    {
        abort_unless($job->worker_id === $workerId && is_string($job->claim_token) && $claimToken !== '' && hash_equals($job->claim_token, $claimToken), 403);
        if ($requireLease) {
            abort_unless($job->lease_expires_at?->isFuture(), 409, 'Klaim worker kedaluwarsa.');
        }
    }
}
