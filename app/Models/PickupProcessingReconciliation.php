<?php

namespace App\Models;

use Database\Factories\PickupProcessingReconciliationFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * @property array<string, mixed>|null $evidence
 * @property array<string, array<string, int|null>>|null $categories
 * @property list<string>|null $reasons
 */
class PickupProcessingReconciliation extends Model
{
    /** @use HasFactory<PickupProcessingReconciliationFactory> */
    use HasFactory;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['review_open' => 'boolean', 'locked_at' => 'immutable_datetime', 'categories' => 'array', 'reasons' => 'array', 'evidence' => 'array', 'revision' => 'integer', 'input_version' => 'integer', 'evaluated_input_version' => 'integer', 'evaluated_at' => 'immutable_datetime', 'next_evaluation_at' => 'immutable_datetime'];
    }
}
