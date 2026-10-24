<?php

namespace App\Models;

use Database\Factories\JneShipmentObservationFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class JneShipmentObservation extends Model
{
    /** @use HasFactory<JneShipmentObservationFactory> */
    use HasFactory;

    public const UPDATED_AT = null;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['observed_at' => 'immutable_datetime', 'changes_current' => 'boolean'];
    }
}
