<?php

namespace Database\Factories;

use App\Models\Customer;
use App\Models\PickupSchedule;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PickupSchedule>
 */
class PickupScheduleFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'customer_id' => Customer::factory(), 'pickup_address' => fake()->address(), 'weekdays' => [1, 2, 3, 4, 5], 'pickup_time' => '09:00', 'timezone' => config('pickup.timezone'), 'starts_on' => now()->toDateString(), 'created_by' => User::factory()->state(['role' => 'cs']),
        ];
    }
}
