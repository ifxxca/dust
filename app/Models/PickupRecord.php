<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Database\Factories\PickupRecordFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/** @property CarbonImmutable $picked_up_at */
class PickupRecord extends Model
{
    /** @use HasFactory<PickupRecordFactory> */
    use HasFactory;

    protected $guarded = ['id'];

    /** @return HasMany<PickupRecordRevision, $this> */
    public function revisions(): HasMany
    {
        return $this->hasMany(PickupRecordRevision::class)->orderBy('revision');
    }

    /** @return array<string, mixed> */
    public function effectiveValues(): array
    {
        $original = $this->only(['customer_name', 'pickup_address', 'contact', 'manual_hybrid', 'cashless_hybrid', 'css_orion', 'notes']);

        return [...$original, ...($this->revisions->isEmpty() ? [] : $this->revisions->last()->values)];
    }

    public function revisionNumber(): int
    {
        return $this->revisions->isEmpty() ? 0 : $this->revisions->last()->revision;
    }

    public function latestCorrection(): ?PickupRecordRevision
    {
        return $this->revisions->last();
    }

    protected function casts(): array
    {
        return ['picked_up_at' => 'immutable_datetime', 'finalized_at' => 'immutable_datetime', 'manual_hybrid' => 'integer', 'cashless_hybrid' => 'integer', 'css_orion' => 'integer'];
    }

    /** @return HasMany<PickupAttachment, $this> */
    public function attachments(): HasMany
    {
        return $this->hasMany(PickupAttachment::class);
    }

    /** @return HasOne<PickupReceipt, $this> */
    public function receipt(): HasOne
    {
        return $this->hasOne(PickupReceipt::class)->ofMany('proof_revision', 'max');
    }

    /** @return HasMany<PickupReceipt, $this> */
    public function receipts(): HasMany
    {
        return $this->hasMany(PickupReceipt::class)->orderBy('proof_revision');
    }
}
