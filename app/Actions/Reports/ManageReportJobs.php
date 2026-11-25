<?php

namespace App\Actions\Reports;

use App\Actions\Pickup\ManageCashlessEntryBatches;
use App\Jobs\ImportJneReportAwbs;
use App\Models\ReportJob;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Throwable;

class ManageReportJobs
{
    public function __construct(private CombineHybridReports $combiner, private ReportRetryPolicy $retry) {}

    public function claim(string $workerId, string $claimKey, string $source = 'apex', bool $retryProtocol = false): ?ReportJob
    {
        abort_unless(array_key_exists($source, ReportJob::SOURCE_SLOTS), 422);
        $this->recoverExpired();

        try {
            return DB::transaction(function () use ($workerId, $claimKey, $source, $retryProtocol): ?ReportJob {
                $control = $this->retry->enabled() ? $this->retry->lockSource($source) : null;
                $existing = ReportJob::where('claim_key', $claimKey)->lockForUpdate()->first();
                if ($existing !== null) {
                    abort_unless($existing->worker_id === $workerId && ($existing->source === $source || ($source === 'apex' && $existing->source_file_path)), 409);

                    return $existing;
                }

                $slot = $source === 'apex' ? (ReportJob::apexWorkerSlots()[$workerId] ?? null) : ReportJob::SOURCE_SLOTS[$source];
                if ($source === 'apex' && config('jne-reports.apex_pool_paused')) {
                    return null;
                }
                if ($slot === null) {
                    return null;
                }
                if ($control?->available_at && now()->lt($control->available_at)) {
                    return null;
                }
                $job = ReportJob::where(function ($query) use ($source): void {
                    $query->where(fn ($query) => $query->where('source', $source)->where('status', 'QUEUED'));
                    if ($source === 'apex') {
                        $query->orWhere(fn ($query) => $query->where('status', 'WAITING_APEX')->whereNotNull('source_file_path'));
                    }
                    if ($this->retry->enabled()) {
                        $query->orWhere(function ($due) use ($source): void {
                            $due->where('status', 'RETRY_WAIT')->where('retry_available_at', '<=', now())
                                ->where(function ($effective) use ($source): void {
                                    $effective->where('source', $source);
                                    if ($source === 'apex') {
                                        $effective->orWhereNotNull('source_file_path');
                                    } else {
                                        $effective->whereNull('source_file_path');
                                    }
                                });
                        });
                    }
                })->where(function ($query): void {
                    $query->where('report_mode', '<>', 'P')->orWhereNotExists(function ($busy): void {
                        $busy->selectRaw('1')->from('report_jobs as busy')
                            ->whereColumn('busy.customer_account', 'report_jobs.customer_account')
                            ->where('busy.report_mode', 'P')->whereIn('busy.status', ReportJob::ACTIVE_STATUSES);
                    });
                });
                if ($this->retry->enabled()) {
                    $this->retry->constrainClaims($job, $source);
                }
                $job = $this->retry->enabled() && in_array($source, ['roberto', 'nuralamt'], true)
                    ? $this->retry->nextHybridClaim($job, $source)
                    : $job->orderBy('id')->lockForUpdate()->first();
                if ($job === null || ReportJob::where('active_slot', $slot)->lockForUpdate()->exists()) {
                    return null;
                }

                $isRetry = $job->status === 'RETRY_WAIT';
                $retryFields = $this->retry->enabled() ? [
                    'retry_protocol' => $retryProtocol ? 1 : null, 'retry_available_at' => null, 'error_message' => null,
                    'retry_submission_state' => isset($job->parameters['apex_history']) || isset($job->parameters['apex_retry_batches']) ? 'history' : ($source === 'apex' ? ($retryProtocol ? 'not_submitted' : 'uncertain') : null),
                ] : [];
                if ($this->retry->enabled() && $this->retry->isHybrid($job)) {
                    $retryFields['parameters'] = [...($job->parameters ?? []), 'hybrid_retry' => [
                        ...($job->parameters['hybrid_retry'] ?? []), 'attempt_limit' => $this->retry->attemptLimit($job),
                    ]];
                }
                $job->update([
                    ...$retryFields,
                    'status' => 'RUNNING', 'worker_id' => $workerId, 'claim_key' => $claimKey,
                    'claim_token' => Str::random(64), 'active_slot' => $slot,
                    'attempt_count' => $job->attempt_count + 1, 'started_at' => $job->started_at ?? now(),
                    'lease_expires_at' => now()->addSeconds(config('jne-reports.lease_seconds')),
                ]);
                $job->recordEvent($isRetry && $this->retry->isHybrid($job) ? 'Worker mengambil retry Hybrid.' : ($job->source_file_path ? 'Worker APEX mengambil AWB Hybrid untuk Upload Connote.' : 'Worker mengambil antrean.'));
                if ($control !== null && $control->consecutive_failures >= 3) {
                    DB::table('report_source_controls')->where('source', $source)->update(['available_at' => now()->addSeconds(30), 'updated_at' => now()]);
                }

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

    /** @param array{http_status?: int|null, retry_after?: string|null, error_stage?: string|null, root_cause?: string|null} $evidence */
    public function fail(int $id, string $workerId, string $claimToken, string $status, string $message, array $evidence = []): ReportJob
    {
        $job = DB::transaction(function () use ($id, $workerId, $claimToken, $status, $message, $evidence): ReportJob {
            if ($this->retry->enabled()) {
                $this->retry->lockSource($this->retry->source(ReportJob::findOrFail($id)));
            }
            $job = ReportJob::whereKey($id)->lockForUpdate()->firstOrFail();
            $this->assertOwner($job, $workerId, $claimToken, false);
            if ($status === 'NO_DATA') {
                abort_unless($job->source === 'apex' && $job->report_type === 'apex' && $job->report_mode === 'P'
                    && str_starts_with($message, 'APEX_NO_DATA:')
                    && (str_contains($workerId, '-instance-') || ($this->retry->enabled() && $job->retry_protocol === 1)), 422);
                if ($job->status === 'NO_DATA' && ($job->parameters['no_data_evidence'] ?? null) === $message) {
                    return $job;
                }
                abort_unless(in_array($job->status, ReportJob::ACTIVE_STATUSES, true) && $job->lease_expires_at?->isFuture(), 409, 'Job tidak lagi aktif.');
                $job->update(['status' => 'NO_DATA', 'row_count' => 0, 'awb_count' => 0, 'error_message' => null,
                    'parameters' => [...($job->parameters ?? []), 'no_data_evidence' => $message],
                    'active_slot' => null, 'lease_expires_at' => null, 'completed_at' => now()]);
                $job->recordEvent($message);
                $this->retry->succeeded($job);

                return $job;
            }
            if (($this->retry->enabled() && $job->retry_failure_key === hash('sha256', $claimToken.':'.$job->attempt_count))
                || ($job->status === $status && $job->error_message === $message)) {
                return $job;
            }
            abort_unless(in_array($job->status, ReportJob::ACTIVE_STATUSES, true) && $job->lease_expires_at?->isFuture(), 409, 'Job tidak lagi aktif.');
            if ($this->retry->enabled()) {
                $this->retry->fail($job, $message, $evidence);

                return $job;
            }
            $job->update(['status' => $status, 'error_message' => $message, 'active_slot' => null, 'lease_expires_at' => null]);
            $job->recordEvent($message);

            return $job;
        }, 5);
        if ($job->hybrid_batch_id) {
            $this->combiner->handle($job->hybrid_batch_id);
        }

        return $job;
    }

    /** @param array<string, mixed> $evidence */
    public function checkpoint(int $id, string $workerId, string $claimToken, array $evidence): ReportJob
    {
        abort_unless($this->retry->enabled(), 409);

        return DB::transaction(function () use ($id, $workerId, $claimToken, $evidence): ReportJob {
            $job = ReportJob::whereKey($id)->lockForUpdate()->firstOrFail();
            $this->assertOwner($job, $workerId, $claimToken);
            abort_unless(in_array($job->status, ReportJob::ACTIVE_STATUSES, true), 409);
            $this->retry->checkpoint($job, $evidence);

            return $job;
        }, 5);
    }

    /** @param array<string, mixed> $collectionEvidence */
    public function upload(int $id, string $workerId, string $claimToken, UploadedFile $file, ?int $rowCount = null, array $collectionEvidence = []): ReportJob
    {
        $checksum = hash_file('sha256', $file->getRealPath());
        abort_unless(is_string($checksum), 422, 'Checksum tidak dapat dihitung.');

        return DB::transaction(function () use ($id, $workerId, $claimToken, $file, $checksum, $rowCount, $collectionEvidence): ReportJob {
            if ($this->retry->enabled()) {
                $this->retry->lockSource('apex');
            }
            $job = ReportJob::whereKey($id)->lockForUpdate()->firstOrFail();
            $this->assertOwner($job, $workerId, $claimToken, false);
            $disk = Storage::disk('jne_reports');
            if ($job->status === 'COMPLETED') {
                abort_unless(hash_equals($job->file_checksum, $checksum) && $disk->exists($job->file_path), 409, 'CSV yang berbeda sudah tersimpan atau file tidak tersedia.');
                abort_unless($collectionEvidence === [] || Arr::sortRecursive($job->parameters['collection_evidence'] ?? []) === Arr::sortRecursive($collectionEvidence), 409, 'Bukti koleksi tersimpan tidak boleh diganti melalui replay upload.');
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
                    'parameters' => $collectionEvidence === [] ? $job->parameters : [...($job->parameters ?? []), 'collection_evidence' => $collectionEvidence],
                ]);
                $job->recordEvent('CSV tervalidasi dan tersimpan.');
                $this->retry->succeeded($job);
            } catch (Throwable $exception) {
                $disk->delete($path);
                throw $exception;
            }
            $this->enqueueImport($job);

            return $job;
        });
    }

    /**
     * @param  list<string>  $awbs
     * @param  array<string, mixed>  $collectionEvidence
     */
    public function uploadSource(int $id, string $workerId, string $claimToken, UploadedFile $file, int $rowCount, array $awbs, array $collectionEvidence = []): ReportJob
    {
        $checksum = hash_file('sha256', $file->getRealPath());
        abort_unless(is_string($checksum), 422);

        $batchId = ReportJob::whereKey($id)->value('hybrid_batch_id');

        return DB::transaction(function () use ($id, $workerId, $claimToken, $file, $rowCount, $awbs, $checksum, $batchId, $collectionEvidence): ReportJob {
            if ($this->retry->enabled()) {
                $this->retry->lockSource(ReportJob::findOrFail($id)->source);
            }
            if ($batchId !== null) {
                ReportJob::whereKey($batchId)->lockForUpdate()->firstOrFail();
            }
            $job = ReportJob::whereKey($id)->lockForUpdate()->firstOrFail();
            if ($job->source_file_path) {
                abort_unless($job->source_worker_id === $workerId && $claimToken !== '' && is_string($job->source_claim_token) && hash_equals($job->source_claim_token, $claimToken), 403);
                abort_unless(hash_equals($job->source_file_checksum, $checksum), 409, 'CSV sumber berbeda sudah tersimpan.');
                abort_unless($collectionEvidence === [] || Arr::sortRecursive($job->parameters['collection_evidence'] ?? []) === Arr::sortRecursive($collectionEvidence), 409, 'Bukti koleksi tersimpan tidak boleh diganti melalui replay upload.');
                abort_unless(Storage::disk('jne_reports')->putFileAs('report-jobs/'.$job->id, $file, 'source-'.$checksum.'.csv', ['visibility' => 'private']) === $job->source_file_path, 503, 'Pemulihan CSV sumber gagal. Ulangi upload file asli yang sama.');
                $this->confirmCashlessReportAfterCommit($job);

                return $job;
            }
            $this->assertOwner($job, $workerId, $claimToken);
            abort_unless($job->source !== 'apex' && $job->status === 'DOWNLOADING', 409);
            $disk = Storage::disk('jne_reports');
            $path = 'report-jobs/'.$job->id.'/source-'.$checksum.'.csv';
            try {
                abort_unless($disk->putFileAs('report-jobs/'.$job->id, $file, 'source-'.$checksum.'.csv', ['visibility' => 'private']) === $path, 503);
                $this->retry->succeeded($job);
                $job->update([
                    'source_file_path' => $path, 'source_file_checksum' => $checksum, 'source_row_count' => $rowCount,
                    'awb_count' => count($awbs), 'source_worker_id' => $workerId, 'source_claim_token' => $claimToken,
                    'parameters' => [...($job->parameters ?? []), 'awbs' => $awbs, ...($collectionEvidence === [] ? [] : ['collection_evidence' => $collectionEvidence])], 'report_mode' => 'A', 'status' => $batchId !== null ? 'SOURCE_SAVED' : ($awbs === [] ? 'NO_DATA' : 'WAITING_APEX'),
                    'active_slot' => null, 'lease_expires_at' => null, 'claim_key' => null, 'claim_token' => null,
                    'completed_at' => $batchId !== null || $awbs === [] ? now() : null,
                ]);
                $job->recordEvent($awbs === [] ? 'CSV Hybrid kosong; tidak ada AWB untuk dikirim ke APEX.' : count($awbs).' AWB unik dari '.$rowCount.' baris Hybrid menunggu konversi APEX.');
                $this->confirmCashlessReportAfterCommit($job);
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

    private function confirmCashlessReportAfterCommit(ReportJob $job): void
    {
        if (! config('pickup.cashless_entry.report_confirmation_enabled') || $job->report_type !== 'cashless' || ! in_array($job->source, ['roberto', 'nuralamt'], true)) {
            return;
        }
        DB::afterCommit(function () use ($job): void {
            try {
                app(ManageCashlessEntryBatches::class)->confirmApprovedReport($job->source, $job->date_from->toDateString(),
                    Storage::disk('jne_reports')->get($job->source_file_path), $job->source_file_checksum, $job->id);
            } catch (Throwable $exception) {
                report($exception);
            }
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

    public function retryApexSourceFailure(int $id, int $actorId): ReportJob
    {
        abort_if($this->retry->enabled(), 409, 'Retry penarikan dikelola kebijakan antrean otomatis.');

        return DB::transaction(function () use ($id, $actorId): ReportJob {
            $job = ReportJob::whereKey($id)->lockForUpdate()->firstOrFail();
            $parameterReport = $job->source === 'apex' && $job->report_type === 'apex' && $job->report_mode === 'P';
            $hybridReport = $job->source === 'hybrid' && $job->report_type === 'combined' && $job->report_mode === 'A' && $job->source_file_path !== null;
            abort_unless(($parameterReport || $hybridReport) && $job->status === 'NEEDS_ATTENTION'
                && str_starts_with($job->error_message ?? '', 'APEX_SOURCE_API:') && $job->file_path === null
                && $job->attempt_count === 1 && $job->active_slot === null && $job->lease_expires_at === null, 409,
                'Hanya kegagalan API 500 APEX yang terkonfirmasi pada percobaan pertama dapat diulang sekali.');
            $job->recordEvent('Admin #'.$actorId.' mengulang satu kali kegagalan APEX terkonfirmasi: '.$job->error_message);
            $job->update(['status' => $hybridReport ? 'WAITING_APEX' : 'QUEUED', 'worker_id' => null,
                'claim_key' => null, 'claim_token' => null, 'error_message' => null, 'completed_at' => null,
                'reviewed_at' => null, 'reviewed_by' => null, 'review_note' => null]);

            return $job;
        }, 3);
    }

    /** @param array{origin: string, id: string, filename: string, created: string, submitted_at: int} $history */
    public function resumeApexHistory(int $id, array $history): ReportJob
    {
        abort_if($this->retry->enabled(), 409, 'Pemulihan otomatis memakai History tersimpan dan batas tiga percobaan.');
        abort_unless(filter_var($history['origin'], FILTER_VALIDATE_URL) !== false
            && $history['id'] !== '' && $history['filename'] !== '' && $history['created'] !== ''
            && $history['submitted_at'] > 0, 422, 'Identitas History belum lengkap.');

        return DB::transaction(function () use ($id, $history): ReportJob {
            $job = ReportJob::whereKey($id)->lockForUpdate()->firstOrFail();
            abort_unless($job->source === 'apex' && $job->report_mode === 'P'
                && $job->status === 'NEEDS_ATTENTION' && $job->file_path === null
                && $job->active_slot === null && $job->lease_expires_at === null
                && Str::startsWith($job->error_message ?? '', ['REPORT_TIMEOUT:', 'JOB_TIMEOUT:', 'APEX_SOURCE_API:', 'WORKER_STOPPED:']),
                409, 'Hanya report parameter yang terhenti saat menunggu dapat dilanjutkan dari History.');
            $job->update(['parameters' => [...($job->parameters ?? []), 'apex_history' => $history],
                'status' => 'QUEUED', 'worker_id' => null, 'claim_key' => null, 'claim_token' => null,
                'completed_at' => null, 'error_message' => null, 'reviewed_at' => null, 'reviewed_by' => null, 'review_note' => null]);
            $job->recordEvent('Melanjutkan refresh report yang sama dari History JNE; Process tidak dikirim ulang.');

            return $job;
        }, 3);
    }

    public function retryHybridSources(int $id, int $actorId): ReportJob
    {
        return DB::transaction(function () use ($id, $actorId): ReportJob {
            if ($this->retry->enabled()) {
                foreach (['roberto', 'nuralamt'] as $source) {
                    $this->retry->lockSource($source);
                }
            }
            $batch = ReportJob::whereKey($id)->lockForUpdate()->firstOrFail();
            abort_unless($batch->source === 'hybrid' && $batch->report_type === 'combined' && $batch->status === 'NEEDS_ATTENTION' && $batch->source_file_path === null && $batch->file_path === null, 409, 'Hanya pengumpulan Hybrid yang belum dikirim ke APEX yang dapat diulang.');
            $failed = ReportJob::where('hybrid_batch_id', $batch->id)->whereIn('status', ['FAILED', 'NEEDS_ATTENTION'])->whereNull('source_file_path')->lockForUpdate()->get();
            $integrityReview = str_starts_with($batch->error_message ?? '', 'HYBRID_SOURCE_INVALID:');
            abort_if($failed->isEmpty() && ! $integrityReview, 409, 'Tidak ada sumber Hybrid gagal yang perlu diulang.');
            foreach ($failed as $source) {
                abort_unless($source->active_slot === null && ! $source->lease_expires_at?->isFuture(), 409, 'Sumber masih dimiliki worker aktif.');
                $retryFields = $this->retry->enabled() ? [
                    'parameters' => [...($source->parameters ?? []), 'hybrid_retry' => [
                        ...($source->parameters['hybrid_retry'] ?? []), 'cycle_start_attempt' => $source->attempt_count,
                        'attempt_limit' => $source->attempt_count + $this->retry->hybridMaxAttempts(), 'unknown_retry_used' => false,
                    ]],
                    'retry_available_at' => now(), 'retry_final_at' => null, 'retry_failure_key' => null, 'retry_classification' => null,
                ] : [];
                $source->update([...$retryFields, 'status' => $this->retry->enabled() ? 'RETRY_WAIT' : 'QUEUED', 'worker_id' => null, 'claim_key' => null, 'claim_token' => null, 'active_slot' => null, 'lease_expires_at' => null, 'completed_at' => null, 'error_message' => null, 'reviewed_at' => null, 'reviewed_by' => null, 'review_note' => null]);
                $source->recordEvent("Admin #{$actorId} mengantrekan ulang sumber yang gagal; sumber tersimpan tetap digunakan.");
            }
            $batch->update(['status' => 'COLLECTING_SOURCES', 'error_message' => null, 'reviewed_at' => null, 'reviewed_by' => null, 'review_note' => null]);
            $batch->recordEvent("Admin #{$actorId} mengulang {$failed->count()} sumber Hybrid gagal. Process APEX belum dijalankan.");
            $this->combiner->handle($batch->id);

            return $batch->refresh();
        }, 5);
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
        if ($this->retry->enabled()) {
            return $this->recoverRetryLeases();
        }
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

    private function recoverRetryLeases(): int
    {
        $expired = ReportJob::where(fn ($query) => $query->whereNotNull('active_slot')->where('lease_expires_at', '<=', now()))
            ->orWhere(function ($query): void {
                $query->whereIn('status', ['QUEUED', 'WAITING_APEX', 'RETRY_WAIT'])->where(function ($budgets): void {
                    $budgets->where(function ($apex): void {
                        $apex->where(fn ($source) => $source->whereNotIn('source', ['roberto', 'nuralamt'])->orWhereNotNull('source_file_path'));
                        $this->retry->constrainBudget($apex, 'apex', true);
                    })->orWhere(function ($hybrid): void {
                        $hybrid->whereIn('source', ['roberto', 'nuralamt'])->whereNull('source_file_path');
                        $this->retry->constrainBudget($hybrid, 'roberto', true);
                    });
                });
            })
            ->orderBy('id')->limit(100)->get();
        $count = 0;
        foreach ($expired as $expiredJob) {
            $job = DB::transaction(function () use ($expiredJob): ?ReportJob {
                $this->retry->lockSource($this->retry->source($expiredJob));
                $job = ReportJob::whereKey($expiredJob->id)->lockForUpdate()->first();
                if ($job === null) {
                    return null;
                }
                $overBudget = in_array($job->status, ['QUEUED', 'WAITING_APEX', 'RETRY_WAIT'], true) && $job->attempt_count >= $this->retry->attemptLimit($job);
                if (! $overBudget && ($job->active_slot === null || ! $job->lease_expires_at?->lessThanOrEqualTo(now()))) {
                    return null;
                }
                $this->retry->fail($job, $overBudget ? 'ATTEMPT_LIMIT: Batas percobaan telah tercapai.' : 'WORKER_EXPIRED: Lease worker berakhir; pemulihan mengikuti checkpoint terakhir.');

                return $job;
            }, 5);
            if ($job !== null) {
                $count++;
                if ($job->hybrid_batch_id) {
                    $this->combiner->handle($job->hybrid_batch_id);
                }
            }
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
