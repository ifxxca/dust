<?php

namespace App\Models;

use Database\Factories\CashlessEntryItemFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CashlessEntryItem extends Model
{
    /** @use HasFactory<CashlessEntryItemFactory> */
    use HasFactory;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['elapsed_ms' => 'integer'];
    }
}
