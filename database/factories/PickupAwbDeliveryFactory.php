<?php

namespace Database\Factories;

use App\Models\PickupAwbDelivery;
use App\Models\PickupAwbManifest;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PickupAwbDelivery>
 */
class PickupAwbDeliveryFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'pickup_awb_manifest_id' => PickupAwbManifest::factory(), 'channel' => 'email', 'recipient' => 'customer@example.test',
            'recipient_hash' => hash('sha256', 'customer@example.test'), 'status' => 'READY', 'submission_key' => fake()->uuid(), 'preference_revision' => 1,
        ];
    }
}
