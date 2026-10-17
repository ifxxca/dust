<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PickupReceipt extends Model
{
    protected $guarded = ['id'];

    /** @return HasMany<ReceiptAttempt, $this> */
    public function attempts(): HasMany
    {
        return $this->hasMany(ReceiptAttempt::class);
    }
}
