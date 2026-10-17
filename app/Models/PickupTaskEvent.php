<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** @property CarbonImmutable $occurred_at */
class PickupTaskEvent extends Model
{
    protected $guarded = ['id'];

    /** @return BelongsTo<User, $this> */
    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }

    /** @return BelongsTo<User, $this> */
    public function previousStaff(): BelongsTo
    {
        return $this->belongsTo(User::class, 'previous_staff_id');
    }

    /** @return BelongsTo<User, $this> */
    public function newStaff(): BelongsTo
    {
        return $this->belongsTo(User::class, 'new_staff_id');
    }

    protected function casts(): array
    {
        return ['occurred_at' => 'immutable_datetime'];
    }
}
