<?php

namespace App\Http\Resources;

use App\Models\PickupVisit;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin PickupVisit */
class PickupVisitResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return $this->resource->only(['id', 'pickup_task_id', 'staff_id', 'started_at', 'outcome', 'reason', 'notes', 'recorded_at']);
    }
}
