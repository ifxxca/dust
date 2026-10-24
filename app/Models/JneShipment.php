<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Database\Factories\JneShipmentFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * @property CarbonImmutable|null $last_observed_at
 * @property-read CarbonImmutable|null $last_report_received_at
 * @property list<array<string, mixed>>|null $category_evidence
 */
class JneShipment extends Model
{
    /** @use HasFactory<JneShipmentFactory> */
    use HasFactory;

    public const STATUSES = ['DELIVERED', 'CANCELLED', 'RETURNED', 'IN_TRANSIT', 'EXCEPTION', 'UNKNOWN'];

    public const TERMINAL_STATUSES = ['DELIVERED', 'CANCELLED', 'RETURNED'];

    public const MATCH_STATUSES = ['MATCHED', 'UNMATCHED', 'AMBIGUOUS', 'CANDIDATE', 'CONFLICT'];

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['last_observed_at' => 'immutable_datetime', 'last_report_received_at' => 'immutable_datetime', 'version' => 'integer', 'customer_match_candidates' => 'array', 'category_evidence' => 'array'];
    }

    /** @return BelongsTo<JneReportAwb, $this> */
    public function latestSource(): BelongsTo
    {
        return $this->belongsTo(JneReportAwb::class, 'latest_report_awb_id');
    }

    /** @return BelongsTo<PickupTask, $this> */
    public function pickup(): BelongsTo
    {
        return $this->belongsTo(PickupTask::class, 'pickup_task_id');
    }

    /** @return BelongsTo<Customer, $this> */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /** @return HasMany<JneReportAwb, $this> */
    public function sources(): HasMany
    {
        return $this->hasMany(JneReportAwb::class, 'awb', 'awb');
    }

    /** @return HasMany<JneShipmentObservation, $this> */
    public function observations(): HasMany
    {
        return $this->hasMany(JneShipmentObservation::class);
    }

    /** @return HasOne<PickupCashlessAwb, $this> */
    public function cashlessClaim(): HasOne
    {
        return $this->hasOne(PickupCashlessAwb::class, 'awb', 'awb');
    }
}
