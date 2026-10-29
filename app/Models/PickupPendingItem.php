<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Database\Factories\PickupPendingItemFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** @property CarbonImmutable|null $processing_date */
class PickupPendingItem extends Model
{
    /** @use HasFactory<PickupPendingItemFactory> */
    use HasFactory;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['version' => 'integer', 'processing_date' => 'immutable_date', 'ready_at' => 'immutable_datetime', 'processed_at' => 'immutable_datetime'];
    }

    /** @return BelongsTo<PickupTask, $this> */
    public function pickup(): BelongsTo
    {
        return $this->belongsTo(PickupTask::class, 'pickup_task_id');
    }

    /** @return BelongsTo<JneShipment, $this> */
    public function shipment(): BelongsTo
    {
        return $this->belongsTo(JneShipment::class, 'jne_shipment_id');
    }
}
