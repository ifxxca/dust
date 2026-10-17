<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** @property array<string, mixed> $values */
class HandoverItemRevision extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['values' => 'array', 'revision' => 'integer', 'pickup_revision' => 'integer'];
    }
}
