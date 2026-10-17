<?php

namespace App\Http\Resources;

use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Customer */
class CustomerResource extends JsonResource
{
    /** @var array{meta: array<string, mixed>} */
    public $with = ['meta' => []];

    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return ['id' => $this->id, 'name' => $this->name, 'pickup_address' => $this->pickup_address, 'contact' => $this->contact,
            'customer_code' => $this->customer_code, 'email' => $this->email, 'phone' => $this->phone,
            'latitude' => $this->latitude, 'longitude' => $this->longitude, 'is_active' => $this->is_active, 'version' => $this->version];
    }
}
