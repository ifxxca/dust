<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Database\Factories\PickupTaskFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * @property CarbonImmutable $scheduled_at
 * @property CarbonImmutable|null $execution_started_at
 */
class PickupTask extends Model
{
    /** @use HasFactory<PickupTaskFactory> */
    use HasFactory;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['scheduled_at' => 'immutable_datetime', 'execution_started_at' => 'immutable_datetime', 'version' => 'integer'];
    }

    /** @return BelongsTo<User, $this> */
    public function assignedStaff(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_staff_id');
    }

    /** @return HasMany<PickupTaskEvent, $this> */
    public function events(): HasMany
    {
        return $this->hasMany(PickupTaskEvent::class)->orderBy('task_version');
    }

    public function eligibleFor(User $user): bool
    {
        return $user->canExecutePickup() && $this->status === 'ASSIGNED'
            && $this->execution_started_at === null && $this->assigned_staff_id !== null && $this->assigned_staff_id !== $user->id;
    }

    /** @return HasMany<PickupVisit, $this> */
    public function visits(): HasMany
    {
        return $this->hasMany(PickupVisit::class)->orderBy('id');
    }

    /** @return HasOne<PickupVisit, $this> */
    public function latestVisit(): HasOne
    {
        return $this->hasOne(PickupVisit::class)->latestOfMany();
    }

    /** @return HasOne<PickupRecord, $this> */
    public function proof(): HasOne
    {
        return $this->hasOne(PickupRecord::class);
    }

    /** @return HasOne<HandoverItem, $this> */
    public function handoverItem(): HasOne
    {
        return $this->hasOne(HandoverItem::class);
    }
}
