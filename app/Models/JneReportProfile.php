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

    public function dailyCollectionTime(): ?string
    {
        return $this->source === 'apex' && $this->report_type === 'apex' && $this->interval_minutes === 1440
            ? config('jne-reports.daily_account_report_at') : null;
    }

    public function nextScheduledRun(): CarbonImmutable
    {
        $time = $this->dailyCollectionTime();
        if ($time === null) {
            return CarbonImmutable::now()->addMinutes($this->interval_minutes);
        }
        $local = CarbonImmutable::now(config('pickup.timezone'));
        $next = $local->setTimeFromTimeString($time);

        return ($next->lessThanOrEqualTo($local) ? $next->addDay() : $next)->utc();
    }

    protected function casts(): array
    {
        return ['refresh_policy' => 'array', 'enabled' => 'boolean', 'date_from' => 'immutable_date', 'date_thru' => 'immutable_date', 'next_run_at' => 'immutable_datetime', 'last_run_at' => 'immutable_datetime', 'version' => 'integer', 'interval_minutes' => 'integer', 'lookback_days' => 'integer'];
    }
}
