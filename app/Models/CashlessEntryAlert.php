<?php

namespace App\Models;

use Database\Factories\CashlessEntryAlertFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CashlessEntryAlert extends Model
{
    /** @use HasFactory<CashlessEntryAlertFactory> */
    use HasFactory;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['read_at' => 'immutable_datetime'];
    }
}
