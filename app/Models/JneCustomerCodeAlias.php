<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Database\Factories\JneCustomerCodeAliasFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * @property CarbonImmutable|null $valid_from
 * @property CarbonImmutable|null $valid_thru
 */
class JneCustomerCodeAlias extends Model
{
    /** @use HasFactory<JneCustomerCodeAliasFactory> */
    use HasFactory;

    protected $guarded = ['id'];

    public static function normalize(string $value): string
    {
        return JneShipperAlias::normalize($value);
    }

    protected static function booted(): void
    {
        static::creating(function (self $alias): void {
            $alias->normalized_code = self::normalize($alias->code);
            $alias->mapping_key = hash('sha256', implode('|', [$alias->customer_id, $alias->normalized_code, $alias->account_scope, $alias->valid_from?->toDateString(), $alias->valid_thru?->toDateString()]));
        });
    }

    protected function casts(): array
    {
        return ['is_active' => 'boolean', 'verified_at' => 'immutable_datetime', 'valid_from' => 'immutable_date', 'valid_thru' => 'immutable_date', 'version' => 'integer'];
    }
}
