<?php

namespace App\Models;

use Database\Factories\PickupVisitFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PickupVisit extends Model
{
    /** @use HasFactory<PickupVisitFactory> */
    use HasFactory;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['started_at' => 'immutable_datetime', 'recorded_at' => 'immutable_datetime'];
    }
}
