<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class HandoverEvent extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['occurred_at' => 'immutable_datetime', 'changes' => 'array'];
    }
}
