<?php

namespace App\Models;

use Database\Factories\CustomerFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Customer extends Model
{
    /** @return HasMany<JneShipperAlias, $this> */
    public function shipperAliases(): HasMany
    {
        return $this->hasMany(JneShipperAlias::class)->whereNotNull('mapping_key');
    }

    /** @use HasFactory<CustomerFactory> */
    use HasFactory;

    protected $fillable = ['name', 'pickup_address', 'contact', 'created_by', 'customer_code', 'email', 'phone', 'latitude', 'longitude', 'is_active', 'version', 'updated_by'];

    protected function casts(): array
    {
        return ['latitude' => 'decimal:7', 'longitude' => 'decimal:7', 'is_active' => 'boolean', 'version' => 'integer'];
    }
}
