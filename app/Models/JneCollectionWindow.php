<?php

namespace App\Models;

use Database\Factories\JneCollectionWindowFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * @property list<int>|null $report_job_ids
 * @property list<string>|null $required_sources
 * @property list<array<string, mixed>>|null $report_evidence
 */
class JneCollectionWindow extends Model
{
    /** @use HasFactory<JneCollectionWindowFactory> */
    use HasFactory;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['required_sources' => 'array', 'report_job_ids' => 'array', 'report_evidence' => 'array', 'version' => 'integer', 'source_high_water_id' => 'integer', 'cutoff_at' => 'immutable_datetime', 'attested_at' => 'immutable_datetime'];
    }
}
