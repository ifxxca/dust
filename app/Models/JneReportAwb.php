<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Database\Factories\JneReportAwbFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property CarbonImmutable|null $observed_at
 * @property CarbonImmutable|null $entry_at
 * @property CarbonImmutable|null $source_status_at
 * @property array<string, mixed>|null $raw_data
 */
class JneReportAwb extends Model
{
    /** @use HasFactory<JneReportAwbFactory> */
    use HasFactory;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['raw_data' => 'array', 'source_evidence' => 'array', 'entry_at' => 'immutable_datetime', 'source_status_at' => 'immutable_datetime', 'observed_at' => 'immutable_datetime'];
    }

    /** @return BelongsTo<ReportJob, $this> */
    public function reportJob(): BelongsTo
    {
        return $this->belongsTo(ReportJob::class);
    }
}
