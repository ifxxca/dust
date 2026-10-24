<?php

namespace App\Models;

use Database\Factories\JneMappingRunFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * @property list<string> $normalized_names
 * @property bool $reapply_all
 */
class JneMappingRun extends Model
{
    /** @use HasFactory<JneMappingRunFactory> */
    use HasFactory;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['normalized_names' => 'array', 'reapply_all' => 'boolean', 'last_id' => 'integer', 'upper_id' => 'integer',
            'affected_count' => 'integer', 'completed_at' => 'immutable_datetime'];
    }
}
