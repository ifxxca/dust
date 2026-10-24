<?php

namespace Database\Factories;

use App\Models\Customer;
use App\Models\PickupCashlessAwb;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PickupCashlessAwb>
 */
class PickupCashlessAwbFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'pickup_task_id' => PickupTask::factory(),
            'customer_id' => Customer::factory(),
            'original_awb' => fake()->unique()->numerify('###############'),
            'awb' => fn (array $attributes): string => $attributes['original_awb'],
            'raw_awb' => fn (array $attributes): string => $attributes['original_awb'],
            'created_by' => User::factory(),
        ];
    }
}
