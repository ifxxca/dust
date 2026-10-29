<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Database\Factories\PickupCustomerReconciliationFactory;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * @property array<string, array<string, int|null>>|null $categories
 * @property list<string>|null $reasons
 * @property array<string, mixed>|null $evidence
 */
class PickupCustomerReconciliation extends Model
{
    /** @use HasFactory<PickupCustomerReconciliationFactory> */
    use HasFactory;

    protected $guarded = ['id'];

    /** @return Attribute<CarbonImmutable, string|\DateTimeInterface> */
    protected function businessDate(): Attribute
    {
        return Attribute::make(get: fn (string $date): CarbonImmutable => CarbonImmutable::parse($date)->startOfDay(),
            set: fn (string|\DateTimeInterface $date): string => CarbonImmutable::parse($date)->toDateString());
    }

    protected function casts(): array
    {
        return ['categories' => 'array', 'reasons' => 'array', 'evidence' => 'array', 'pickup_count' => 'integer', 'revision' => 'integer', 'locked_at' => 'immutable_datetime', 'evaluated_at' => 'immutable_datetime'];
    }
}
