<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Database\Factories\CashlessEntryBatchFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property CarbonImmutable|null $lease_until
 * @property CarbonImmutable|null $approved_at
 * @property array<string, mixed>|null $verification
 */
class CashlessEntryBatch extends Model
{
    /** @use HasFactory<CashlessEntryBatchFactory> */
    use HasFactory;

    public const Terminal = ['DONE', 'PARTIAL', 'FAILED', 'CANCELLED'];

    protected $guarded = ['id'];

    protected $hidden = ['claim_key', 'claim_token_hash'];

    protected function casts(): array
    {
        return ['lease_until' => 'immutable_datetime', 'approved_at' => 'immutable_datetime', 'verification' => 'array'];
    }

    /** @return HasMany<CashlessEntryItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(CashlessEntryItem::class, 'batch_id')->orderBy('id');
    }
}
