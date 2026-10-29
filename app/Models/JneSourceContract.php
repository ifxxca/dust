<?php

namespace App\Models;

use Database\Factories\JneSourceContractFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/** @property array<string, mixed> $definition */
class JneSourceContract extends Model
{
    /** @use HasFactory<JneSourceContractFactory> */
    use HasFactory;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['definition' => 'array', 'verified_at' => 'immutable_datetime', 'revision' => 'integer'];
    }

    public static function key(string $source, string $type): string
    {
        return hash('sha256', $source.':'.$type);
    }
}
