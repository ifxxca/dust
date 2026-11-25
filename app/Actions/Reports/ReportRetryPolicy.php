<?php

namespace App\Actions\Reports;

use App\Models\ReportJob;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

class ReportRetryPolicy
{
    public const MAX_ATTEMPTS = 3;

    private const TRANSIENT = ['NETWORK_TIMEOUT', 'NETWORK_CONNECTION', 'UPSTREAM_HTTP', 'HYBRID_DOWNLOAD_TRANSIENT', 'HYBRID_DOWNLOAD_TIMEOUT', 'HYBRID_PAGE_TRANSIENT', 'HYBRID_SESSION_EXPIRED', 'HYBRID_KEEPALIVE', 'APEX_NAVIGATION', 'APEX_PAGE', 'APEX_SESSION', 'APEX_ENDPOINTS_UNAVAILABLE', 'DOWNLOAD_TIMEOUT', 'DOWNLOAD_FAILED', 'DOWNLOAD_MISSING', 'REPORT_TIMEOUT', 'JOB_TIMEOUT', 'APEX_SOURCE_API', 'API_UNAVAILABLE', 'API_TRANSIENT', 'WORKER_STOPPED', 'WORKER_EXPIRED'];

    public function enabled(): bool
    {
        return (bool) config('jne-reports.automatic_retry_enabled');
    }

    public function source(ReportJob $job): string
    {
        return $job->source_file_path ? 'apex' : $job->source;
    }

    public function isHybrid(ReportJob $job): bool
    {
        return in_array($job->source, ['roberto', 'nuralamt'], true) && $job->source_file_path === null;
    }

    public function hybridMaxAttempts(): int
    {
        return 1 + min(2, max(0, (int) config('jne-reports.hybrid_auto_retry_max', 1)));
    }

    public function attemptLimit(ReportJob $job): int
    {
        return $this->isHybrid($job) ? (int) ($job->parameters['hybrid_retry']['attempt_limit'] ?? $this->hybridMaxAttempts()) : self::MAX_ATTEMPTS;
    }

    public function cycleAttempt(ReportJob $job): int
    {
        return $job->attempt_count - ($this->isHybrid($job) ? (int) ($job->parameters['hybrid_retry']['cycle_start_attempt'] ?? 0) : 0);
    }

    public function cycleLimit(ReportJob $job): int
    {
        return $this->attemptLimit($job) - ($this->isHybrid($job) ? (int) ($job->parameters['hybrid_retry']['cycle_start_attempt'] ?? 0) : 0);
    }

    /** @param Builder<ReportJob> $query */
    public function constrainBudget(Builder $query, string $source, bool $exhausted = false): void
    {
        $operator = $exhausted ? '>=' : '<';
        if (! in_array($source, ['roberto', 'nuralamt'], true)) {
            $query->where('attempt_count', $operator, self::MAX_ATTEMPTS);

            return;
        }
        $query->where(function ($budget) use ($operator): void {
            $budget->where(fn ($default) => $default->whereNull('parameters->hybrid_retry->attempt_limit')->where('attempt_count', $operator, $this->hybridMaxAttempts()))
                ->orWhere(fn ($custom) => $custom->whereNotNull('parameters->hybrid_retry->attempt_limit')->whereColumn('attempt_count', $operator, 'parameters->hybrid_retry->attempt_limit'));
        });
    }

    /**
     * Normal work wins until a retry has waited five minutes beyond its due time; then alternate.
     *
     * @param  Builder<ReportJob>  $query
     */
    public function nextHybridClaim(Builder $query, string $source): ?ReportJob
    {
        $normal = (clone $query)->where('status', 'QUEUED')->orderBy('id')->lockForUpdate()->first();
        $retry = (clone $query)->where('status', 'RETRY_WAIT')->orderBy('retry_available_at')->orderBy('id')->lockForUpdate()->first();
        if ($retry === null || $normal === null) {
            return $normal ?? $retry;
        }
        $lastClaim = DB::table('report_job_events as events')->join('report_jobs as jobs', 'jobs.id', '=', 'events.report_job_id')
            ->where('jobs.source', $source)->where('events.status', 'RUNNING')->where('events.message', 'like', 'Worker mengambil%')
            ->orderByDesc('events.id')->value('events.message');

        return $retry->retry_available_at->lessThanOrEqualTo(now()->subMinutes(5)) && $lastClaim !== 'Worker mengambil retry Hybrid.' ? $retry : $normal;
    }

    /** Serializes claims and cooldown changes across hosts, independent of cache configuration. */
    public function lockSource(string $source): object
    {
        $control = DB::table('report_source_controls')->where('source', $source)->lockForUpdate()->first();
        abort_unless($control !== null, 503, 'Kontrol sumber retry belum tersedia. Periksa migrasi.');

        return $control;
    }

    /** @param Builder<ReportJob> $query */
    public function constrainClaims(Builder $query, string $source): void
    {
        $this->constrainBudget($query, $source);
        $query->whereNotExists(function ($busy) use ($source): void {
            $busy->selectRaw('1')->from('report_jobs as retry_busy')
                ->whereColumn('retry_busy.customer_account', 'report_jobs.customer_account')
                ->whereIn('retry_busy.status', ReportJob::ACTIVE_STATUSES)
                ->where(function ($effective) use ($source): void {
                    if ($source === 'apex') {
                        $effective->where('retry_busy.source', 'apex')->orWhereNotNull('retry_busy.source_file_path');
                    } else {
                        $effective->where('retry_busy.source', $source)->whereNull('retry_busy.source_file_path');
                    }
                });
        });
    }

    /** @param array<string, mixed> $evidence */
    public function checkpoint(ReportJob $job, array $evidence): void
    {
        $state = $evidence['submission_state'];
        abort_unless($job->retry_protocol === 1 && $this->source($job) === 'apex', 409);
        $batch = $evidence['batch_number'] ?? null;
        $parameters = $job->parameters ?? [];
        if ($job->report_mode === 'A') {
            abort_unless(is_int($batch) && $batch >= 1 && $batch <= (int) ceil(count($parameters['awbs'] ?? []) / config('jne-reports.max_awbs')), 422);
        } else {
            abort_unless($batch === null, 422);
        }
        $previous = $batch !== null ? ($parameters['apex_retry_batches'][$batch]['state'] ?? 'not_submitted') : $job->retry_submission_state;
        abort_unless($state === $previous || ($previous === 'not_submitted' && $state === 'uncertain') || (in_array($previous, ['uncertain', 'history'], true) && $state === 'history'), 409);
        if ($state === 'history') {
            $history = $evidence['history'] ?? [];
            abort_unless(preg_match('~^https://dash-ccc0[1-4]\.jne\.co\.id$~D', $history['origin'] ?? '') === 1
                && $this->validHistoryIdentity($history)
                && ($history['filename'] ?? '') !== '' && ($history['created'] ?? '') !== ''
                && ($history['submitted_at'] ?? 0) > 0, 422);
            $existing = $batch !== null ? ($parameters['apex_retry_batches'][$batch]['history'] ?? null) : ($parameters['apex_history'] ?? null);
            abort_if($existing !== null && $existing != $history, 409, 'Identitas History tidak boleh berubah.');
            if ($batch === null) {
                $parameters['apex_history'] = $history;
            }
        }
        if ($batch !== null) {
            $parameters['apex_retry_batches'][$batch] = ['state' => $state, ...($state === 'history' ? ['history' => $history] : [])];
            $job->retry_submission_state = collect($parameters['apex_retry_batches'])->contains(fn (array $part): bool => $part['state'] === 'uncertain') ? 'uncertain' : 'history';
        } else {
            $job->retry_submission_state = $state;
        }
        $job->parameters = $parameters;
        $job->save();
    }

    /** @param array{http_status?: int|null, retry_after?: string|null, error_stage?: string|null, root_cause?: string|null} $evidence */
    public function fail(ReportJob $job, string $message, array $evidence = []): void
    {
        $key = hash('sha256', $job->claim_token.':'.$job->attempt_count);
        if ($job->retry_failure_key === $key && ! in_array($job->status, ['QUEUED', 'WAITING_APEX'], true) && ! str_starts_with($message, 'ATTEMPT_LIMIT:')) {
            return;
        }
        $code = explode(':', $message, 2)[0];
        $code = preg_match('/^[A-Z][A-Z0-9_]{0,63}$/D', $code) === 1 ? $code : 'UNKNOWN';
        $http = $evidence['http_status'] ?? null;
        $transient = in_array($code, self::TRANSIENT, true)
            && ($http === null || in_array($http, [408, 425, 429, 500, 502, 503, 504], true));
        $safe = $job->retry_protocol === 1 && ($this->source($job) !== 'apex'
            || $job->retry_submission_state === 'not_submitted'
            || ($job->retry_submission_state === 'history' && (isset($job->parameters['apex_history']) || isset($job->parameters['apex_retry_batches']))));
        $parameters = $job->parameters ?? [];
        $hybrid = $this->isHybrid($job);
        $unknown = $hybrid && $code === 'HYBRID_ERROR' && ($http === null || in_array($http, [500, 502, 503, 504], true))
            && (($evidence['error_stage'] ?? null) === 'prepare_csv' || str_starts_with($message, 'HYBRID_ERROR: [prepare_csv]'));
        $unknownUsed = (bool) ($parameters['hybrid_retry']['unknown_retry_used'] ?? false);
        $retryable = $transient || $unknown;
        $retry = $retryable && $safe && $job->attempt_count < $this->attemptLimit($job) && (! $unknown || ! $unknownUsed);
        $classification = $code === 'ATTEMPT_LIMIT' ? 'EXHAUSTED' : (! $retryable ? 'PERMANENT' : (! $safe ? 'UNSAFE_TO_RETRY' : ($retry ? ($unknown ? 'UNKNOWN' : 'TRANSIENT') : 'EXHAUSTED')));
        $available = null;
        $control = $this->lockSource($this->source($job));
        if ($retryable) {
            $base = $job->attempt_count <= 1 ? 30 : 120;
            if ($hybrid) {
                $firstRetry = $this->cycleAttempt($job) <= 1;
                $base = max($firstRetry ? 120 : 300, (int) config($firstRetry ? 'jne-reports.hybrid_retry_delay_seconds' : 'jne-reports.hybrid_retry_second_delay_seconds'));
            }
            $retryAfter = $this->retryAfter($evidence['retry_after'] ?? null);
            $available = CarbonImmutable::now()->ceilSecond()->addSeconds($base + random_int(0, $base === 30 ? 15 : 30));
            if ($retryAfter?->isAfter($available)) {
                $available = $retryAfter->addSeconds(random_int(0, 15));
            }
            $failures = $control->consecutive_failures + 1;
            $cooldown = $control->available_at ? CarbonImmutable::parse($control->available_at) : null;
            if ($http === 429 || $retryAfter !== null || $failures >= 3) {
                $candidate = $retryAfter ?? now()->addSeconds($failures >= 3 ? 120 : 30);
                if ($cooldown === null || $candidate->isAfter($cooldown)) {
                    $cooldown = $candidate;
                }
            }
            DB::table('report_source_controls')->where('source', $control->source)->update([
                'consecutive_failures' => $failures, 'available_at' => $cooldown, 'updated_at' => now(),
            ]);
        }
        if ($hybrid) {
            $stage = $evidence['error_stage'] ?? null;
            $rootCause = $evidence['root_cause'] ?? null;
            if ($rootCause === null || $rootCause === 'REPORTED_ERROR') {
                $rootCause = $unknown ? 'UNCLASSIFIED' : $code;
            }
            if ($stage === null && preg_match('/^HYBRID_[A-Z_]+: \[([a-z_]+)\]/', $message, $matches) === 1) {
                $stage = $matches[1];
            }
            $parameters['hybrid_retry'] = [...($parameters['hybrid_retry'] ?? []),
                'attempt_limit' => $this->attemptLimit($job), 'cycle_start_attempt' => (int) ($parameters['hybrid_retry']['cycle_start_attempt'] ?? 0),
                'unknown_retry_used' => $unknownUsed || ($unknown && $retry),
                'last_failure' => ['stage' => $stage, 'root_cause' => $rootCause, 'attempt' => $job->attempt_count,
                    'cycle_attempt' => $this->cycleAttempt($job), 'next_retry_at' => $retry ? $available?->toIso8601String() : null],
            ];
        }
        $job->update([
            ...($hybrid ? ['parameters' => $parameters] : []),
            'status' => $retry ? 'RETRY_WAIT' : 'NEEDS_ATTENTION', 'error_message' => $message,
            'active_slot' => null, 'lease_expires_at' => null,
            'retry_available_at' => $retry ? $available : null, 'retry_final_at' => $retry ? null : now(),
            'retry_classification' => $classification, 'retry_error_code' => $code, 'retry_failure_key' => $key,
            'completed_at' => $retry ? null : now(), 'reviewed_at' => null, 'reviewed_by' => null, 'review_note' => null,
        ]);
        $job->recordEvent($retry
            ? 'Retry '.($this->cycleAttempt($job) + 1).'/'.$this->cycleLimit($job).' dijadwalkan '.$available->toIso8601String().' · '.$code.'.'
            : 'Attention Queue · '.$classification.' · percobaan '.$this->cycleAttempt($job).'/'.$this->cycleLimit($job).' · '.$code.'.');
    }

    public function succeeded(ReportJob $job): void
    {
        if (! $this->enabled() || $job->retry_protocol !== 1) {
            return;
        }
        DB::table('report_source_controls')->where('source', $this->source($job))->update(['consecutive_failures' => 0, 'updated_at' => now()]);
    }

    /** @param array{origin: string, id: string, filename: string, created: string, submitted_at: int} $history */
    public function restoreCheckpoint(int $id, array $history, int $batch): ReportJob
    {
        return DB::transaction(function () use ($id, $history, $batch): ReportJob {
            $this->lockSource('apex');
            $job = ReportJob::whereKey($id)->lockForUpdate()->firstOrFail();
            abort_unless($this->enabled() && $job->retry_protocol === 1 && $job->report_mode === 'A'
                && $job->status === 'NEEDS_ATTENTION' && $job->file_path === null
                && $job->active_slot === null && $job->lease_expires_at === null
                && $job->attempt_count > 0 && $job->attempt_count < self::MAX_ATTEMPTS
                && $job->retry_error_code === 'API_REJECTED'
                && ($job->parameters['apex_retry_batches'][$batch]['state'] ?? null) === 'uncertain',
                409, 'Hanya checkpoint Upload Connote yang ditolak API dapat dipulihkan dari History asli.');
            $prefix = $job->report_type === 'unresolved' ? 'active-awbs' : 'hybrid-'.$job->source;
            abort_unless(preg_match('/^'.preg_quote($prefix.'-'.$id.'-'.$batch.'-', '/').'[a-f0-9-]{36}\.csv$/D', $history['filename'] ?? '') === 1,
                422, 'Nama file History tidak sesuai job dan batch asli.');
            $this->checkpoint($job, ['submission_state' => 'history', 'batch_number' => $batch, 'history' => $history]);
            abort_unless($job->retry_submission_state === 'history', 409, 'Masih ada batch dengan hasil pengiriman belum pasti.');
            $job->recordEvent('Checkpoint History asli dipulihkan setelah penolakan API. Process APEX tidak dikirim ulang; batas percobaan tetap tiga.');
            $base = $job->attempt_count === 1 ? 30 : 120;
            $job->update(['status' => 'RETRY_WAIT', 'retry_available_at' => now()->addSeconds($base + random_int(0, $base === 30 ? 15 : 30)),
                'retry_final_at' => null, 'retry_classification' => 'TRANSIENT', 'completed_at' => null,
                'reviewed_at' => null, 'reviewed_by' => null, 'review_note' => null]);

            return $job;
        }, 3);
    }

    /** @param array<string, mixed> $history */
    private function validHistoryIdentity(array $history): bool
    {
        $id = $history['id'] ?? '';
        if (preg_match('/^[A-Za-z0-9_-]{1,128}$/D', $id) === 1) {
            return true;
        }
        if (! str_starts_with($id, 'metadata:') || strlen($id) > 2048) {
            return false;
        }
        try {
            $identity = json_decode(substr($id, 9), true, 4, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return false;
        }

        return is_array($identity) && array_is_list($identity) && count($identity) === 3
            && $identity[0] === ($history['filename'] ?? null) && $identity[1] === ($history['created'] ?? null)
            && is_string($identity[2]) && trim($identity[2]) !== '';
    }

    private function retryAfter(?string $value): ?CarbonImmutable
    {
        if ($value === null) {
            return null;
        }
        if (preg_match('/^[0-9]{1,9}$/D', trim($value)) === 1) {
            return CarbonImmutable::now()->addSeconds((int) trim($value));
        }
        try {
            $date = CarbonImmutable::createFromFormat('!D, d M Y H:i:s \G\M\T', $value, 'UTC');
        } catch (\InvalidArgumentException) {
            return null;
        }

        return $date !== false && $date->isFuture() ? $date : null;
    }
}
