<?php

namespace Database\Factories;

use App\Models\JneShipment;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<JneShipment>
 */
class JneShipmentFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'customer_account' => 'TESTACCOUNT', 'awb' => fake()->unique()->numerify('###############'),
            'tracking_status' => 'UNKNOWN', 'match_status' => 'UNMATCHED', 'version' => 1,
        ];
    }
}
