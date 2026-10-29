<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PickupCashlessAwbEvent extends Model
{
    public const UPDATED_AT = null;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['affected_results' => 'array', 'created_at' => 'immutable_datetime'];
    }
}
