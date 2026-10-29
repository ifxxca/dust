<?php

namespace App\Models;

use Database\Factories\PickupAwbDeliveryFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PickupAwbDelivery extends Model
{
    /** @use HasFactory<PickupAwbDeliveryFactory> */
    use HasFactory;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['preference_revision' => 'integer', 'started_at' => 'immutable_datetime', 'accepted_at' => 'immutable_datetime'];
    }

    /** @return BelongsTo<PickupAwbManifest, $this> */
    public function manifest(): BelongsTo
    {
        return $this->belongsTo(PickupAwbManifest::class, 'pickup_awb_manifest_id');
    }
}
