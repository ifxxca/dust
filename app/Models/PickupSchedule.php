<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Database\Factories\PickupScheduleFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property array<int, int> $weekdays
 * @property CarbonImmutable $starts_on
 * @property CarbonImmutable|null $ends_on
 */
class PickupSchedule extends Model
{
    /** @use HasFactory<PickupScheduleFactory> */
    use HasFactory;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['weekdays' => 'array', 'is_active' => 'boolean', 'version' => 'integer', 'starts_on' => 'immutable_date', 'ends_on' => 'immutable_date', 'last_generated_at' => 'immutable_datetime'];
    }

    /** @return BelongsTo<Customer, $this> */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /** @return HasMany<PickupTask, $this> */
    public function tasks(): HasMany
    {
        return $this->hasMany(PickupTask::class);
    }
}
