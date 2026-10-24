<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Database\Factories\ReportJobFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * @property CarbonImmutable $date_from
 * @property CarbonImmutable $date_thru
 * @property CarbonImmutable|null $started_at
 * @property CarbonImmutable|null $completed_at
 * @property CarbonImmutable|null $lease_expires_at
 * @property CarbonImmutable|null $imported_at
 * @property CarbonImmutable|null $reviewed_at
 * @property array{awbs?: list<string>}|null $parameters
 * @property 'Y'|'N' $national_account
 */
class ReportJob extends Model
{
    /** @use HasFactory<ReportJobFactory> */
    use HasFactory;

    public const ACTIVE_STATUSES = ['RUNNING', 'WAITING_REPORT', 'DOWNLOADING'];

    public const TERMINAL_STATUSES = ['COMPLETED', 'NO_DATA', 'SOURCE_SAVED', 'FAILED', 'NEEDS_ATTENTION'];

    public const SOURCE_SLOTS = ['apex' => 1, 'roberto' => 2, 'nuralamt' => 3, 'hybrid' => 1];

    public const REPORT_TYPES = ['apex' => ['apex', 'unresolved'], 'roberto' => ['cashless', 'manual'], 'nuralamt' => ['cashless', 'manual'], 'hybrid' => ['combined']];

    public const HYBRID_PARTS = [['roberto', 'cashless'], ['roberto', 'manual'], ['nuralamt', 'cashless'], ['nuralamt', 'manual']];

    protected $guarded = ['id'];

    protected $attributes = ['source' => 'apex', 'report_type' => 'apex', 'national_account' => 'N'];

    protected $hidden = ['claim_token', 'claim_key', 'file_path', 'parameters', 'source_file_path', 'source_claim_token'];

    public function workflowStage(): string
    {
        if (in_array($this->status, ['FAILED', 'NEEDS_ATTENTION'], true) || $this->import_status === 'FAILED' || $this->projection_status === 'FAILED') {
            return 'ATTENTION';
        }
        if ($this->status !== 'COMPLETED') {
            return $this->status;
        }
        if ($this->import_status === 'IMPORTED' && $this->projection_status === 'PROJECTED') {
            return 'READY';
        }

        return $this->import_status === 'QUEUED' || $this->import_status === 'IMPORTED' ? 'PROCESSING' : 'CSV_STORED';
    }

    protected function casts(): array
    {
        return [
            'date_from' => 'immutable_date', 'date_thru' => 'immutable_date',
            'parameters' => 'array', 'claim_token' => 'encrypted',
            'started_at' => 'immutable_datetime', 'completed_at' => 'immutable_datetime',
            'lease_expires_at' => 'immutable_datetime', 'attempt_count' => 'integer', 'file_size' => 'integer',
            'imported_at' => 'immutable_datetime', 'imported_awb_count' => 'integer', 'duplicate_awb_count' => 'integer',
            'reviewed_at' => 'immutable_datetime', 'row_count' => 'integer',
            'source_row_count' => 'integer', 'awb_count' => 'integer', 'source_claim_token' => 'encrypted',
            'hybrid_batch_id' => 'integer',
        ];
    }

    public function recordEvent(?string $message = null): void
    {
        DB::table('report_job_events')->insert([
            'report_job_id' => $this->id, 'status' => $this->status,
            'worker_id' => $this->worker_id, 'message' => $message, 'created_at' => now(),
        ]);
    }
}
