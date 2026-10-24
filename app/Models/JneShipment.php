<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Database\Factories\JneShipmentFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** @property CarbonImmutable|null $last_observed_at */
class JneShipment extends Model
{
    /** @use HasFactory<JneShipmentFactory> */
    use HasFactory;

    public const STATUSES = ['DELIVERED', 'CANCELLED', 'RETURNED', 'IN_TRANSIT', 'EXCEPTION', 'UNKNOWN'];

    public const TERMINAL_STATUSES = ['DELIVERED', 'CANCELLED', 'RETURNED'];

    public const MATCH_STATUSES = ['MATCHED', 'UNMATCHED', 'AMBIGUOUS'];

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['last_observed_at' => 'immutable_datetime', 'version' => 'integer'];
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
}
