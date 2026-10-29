<?php

namespace App\Models;

use Database\Factories\CustomerAwbDeliveryPreferenceFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CustomerAwbDeliveryPreference extends Model
{
    /** @use HasFactory<CustomerAwbDeliveryPreferenceFactory> */
    use HasFactory;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['enabled' => 'boolean', 'revision' => 'integer'];
    }
}
