<?php

namespace App\Models;

use Database\Factories\PickupCashlessAwbFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PickupCashlessAwb extends Model
{
    /** @use HasFactory<PickupCashlessAwbFactory> */
    use HasFactory;

    protected $guarded = ['id', 'original_awb'];

    protected function casts(): array
    {
        return ['version' => 'integer'];
    }

    /** @return HasMany<PickupCashlessAwbEvent, $this> */
    public function events(): HasMany
    {
        return $this->hasMany(PickupCashlessAwbEvent::class)->orderByDesc('revision');
    }
}
