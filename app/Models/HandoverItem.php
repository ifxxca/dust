<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class HandoverItem extends Model
{
    protected $guarded = ['id'];

    /** @return HasMany<HandoverItemRevision, $this> */
    public function revisions(): HasMany
    {
        return $this->hasMany(HandoverItemRevision::class)->orderBy('revision');
    }

    /** @return array<string, mixed> */
    public function effectiveValues(): array
    {
        return [...$this->only(['manual_hybrid', 'cashless_hybrid', 'css_orion', 'status', 'discrepancy_notes', 'verified_by', 'verified_at']), ...($this->revisions->isEmpty() ? [] : $this->revisions->last()->values)];
    }

    public function needsReview(): bool
    {
        $baseline = $this->revisions->isEmpty() ? ($this->verified_pickup_revision ?? 0) : $this->revisions->last()->pickup_revision;

        return $this->status !== 'PENDING' && $baseline !== $this->proof->revisionNumber();
    }

    public function latestCorrection(): ?HandoverItemRevision
    {
        return $this->revisions->last();
    }

    /** @return HasOne<HandoverItemRevision, $this> */
    public function latestRevisionRecord(): HasOne
    {
        return $this->hasOne(HandoverItemRevision::class)->ofMany('revision', 'max');
    }

    /** @param Builder<HandoverItem> $query */
    public function scopeWithStatus(Builder $query, string $status): void
    {
        $query->where(function ($query) use ($status) {
            $query->whereHas('latestRevisionRecord', fn ($revision) => $revision->where('values->status', $status))
                ->orWhere(fn ($original) => $original->whereDoesntHave('revisions')->where('handover_items.status', $status));
        });
    }

    /** @return BelongsTo<PickupRecord, $this> */
    public function proof(): BelongsTo
    {
        return $this->belongsTo(PickupRecord::class, 'pickup_record_id');
    }

    /** @return BelongsTo<PickupTask, $this> */
    public function task(): BelongsTo
    {
        return $this->belongsTo(PickupTask::class, 'pickup_task_id');
    }

    /** @return BelongsTo<HandoverSession, $this> */
    public function session(): BelongsTo
    {
        return $this->belongsTo(HandoverSession::class, 'handover_session_id');
    }

    protected function casts(): array
    {
        return ['manual_hybrid' => 'integer', 'cashless_hybrid' => 'integer', 'css_orion' => 'integer', 'verified_at' => 'immutable_datetime'];
    }
}
