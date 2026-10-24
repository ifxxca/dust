<?php

namespace App\Models;

use Database\Factories\JneShipperAliasFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class JneShipperAlias extends Model
{
    /** @use HasFactory<JneShipperAliasFactory> */
    use HasFactory;

    protected $guarded = ['id'];

    protected static function booted(): void
    {
        static::creating(function (self $alias): void {
            $alias->normalized_name = self::normalize($alias->shipper_name);
            $alias->alias_key = hash('sha256', $alias->normalized_name);
            $alias->mapping_key = hash('sha256', $alias->customer_id.':'.$alias->alias_key);
        });
    }

    protected function casts(): array
    {
        return ['is_active' => 'boolean', 'version' => 'integer'];
    }

    public static function normalize(string $name): string
    {
        return trim(preg_replace('/\s+/u', ' ', mb_strtoupper($name)) ?? '');
    }

    /** @return BelongsTo<Customer, $this> */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /** @return BelongsTo<JneReportProfile, $this> */
    public function profile(): BelongsTo
    {
        return $this->belongsTo(JneReportProfile::class, 'jne_report_profile_id');
    }
}
