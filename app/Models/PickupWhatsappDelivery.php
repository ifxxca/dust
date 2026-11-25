<?php

namespace App\Models;

use Database\Factories\PickupWhatsappDeliveryFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/** @property list<array<string, mixed>> $parts */
class PickupWhatsappDelivery extends Model
{
    /** @use HasFactory<PickupWhatsappDeliveryFactory> */
    use HasFactory;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['parts' => 'array', 'attempts' => 'integer', 'started_at' => 'immutable_datetime', 'accepted_at' => 'immutable_datetime'];
    }

    /** @return array<string, mixed> */
    public function summary(): array
    {
        return [...$this->only(['id', 'pickup_task_id', 'pickup_receipt_id', 'pickup_awb_manifest_id', 'session', 'target', 'target_label', 'status', 'attempts', 'last_error', 'created_at', 'accepted_at']),
            'parts' => array_map(fn (array $part): array => array_intersect_key($part, array_flip(['type', 'filename', 'status', 'message_id', 'attempt_history'])), $this->parts)];
    }
}
