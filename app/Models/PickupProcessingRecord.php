<?php

namespace App\Models;

use Database\Factories\PickupProcessingRecordFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PickupProcessingRecord extends Model
{
    /** @use HasFactory<PickupProcessingRecordFactory> */
    use HasFactory;

    public const CATEGORIES = ['manual_hybrid', 'cashless_hybrid', 'css_orion'];

    public const SYSTEMS = ['JNE_HYBRID', 'MYORION'];

    public const UPDATED_AT = null;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['created_at' => 'immutable_datetime', 'successful_quantity' => 'integer', 'failed_quantity' => 'integer', 'pending_quantity' => 'integer', 'unknown_quantity' => 'integer', 'revision' => 'integer', 'pickup_revision' => 'integer', 'received_quantity' => 'integer', 'handover_revision' => 'integer'];
    }

    /** @return BelongsTo<User, $this> */
    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }
}
