<?php

namespace App\Models;

use Database\Factories\PickupAwbManifestFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property array{customer_id: int, customer_name: string, customer_code: string|null, reference: string, pickup_date: string, categories: array<string, mixed>, unit: string, template_version: int, pickup_task_ids?: list<int>, pickup_references?: list<string>} $snapshot
 * @property array<string, string>|null $checksums
 */
class PickupAwbManifest extends Model
{
    /** @use HasFactory<PickupAwbManifestFactory> */
    use HasFactory;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['snapshot' => 'array', 'checksums' => 'array', 'revision' => 'integer', 'render_attempts' => 'integer', 'next_render_at' => 'immutable_datetime'];
    }

    /** @return BelongsTo<PickupTask, $this> */
    public function pickup(): BelongsTo
    {
        return $this->belongsTo(PickupTask::class, 'pickup_task_id');
    }

    /** @return HasMany<PickupAwbDelivery, $this> */
    public function deliveries(): HasMany
    {
        return $this->hasMany(PickupAwbDelivery::class);
    }
}
