<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Database\Factories\JneReportProfileFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * @property CarbonImmutable|null $date_from
 * @property CarbonImmutable|null $date_thru
 * @property CarbonImmutable|null $next_run_at
 * @property CarbonImmutable|null $last_run_at
 * @property 'Y'|'N' $national_account
 * @property array<string, mixed>|null $refresh_policy
 */
class JneReportProfile extends Model
{
    /** @use HasFactory<JneReportProfileFactory> */
    use HasFactory;

    protected $guarded = ['id'];

    protected $attributes = ['source' => 'apex', 'report_type' => 'apex', 'national_account' => 'N'];

    protected function casts(): array
    {
        return ['refresh_policy' => 'array', 'enabled' => 'boolean', 'date_from' => 'immutable_date', 'date_thru' => 'immutable_date', 'next_run_at' => 'immutable_datetime', 'last_run_at' => 'immutable_datetime', 'version' => 'integer', 'interval_minutes' => 'integer', 'lookback_days' => 'integer'];
    }
}
