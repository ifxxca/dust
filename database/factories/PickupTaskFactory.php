<?php

namespace Database\Factories;

use App\Models\Customer;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<PickupTask>
 */
class PickupTaskFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'reference' => (string) Str::ulid(),
            'customer_id' => Customer::factory(),
            'customer_name_snapshot' => fake()->company(),
            'pickup_address' => fake()->address(),
            'contact_snapshot' => fake()->phoneNumber(),
            'scheduled_at' => now()->addDay(),
            'status' => 'SCHEDULED',
            'version' => 1,
            'created_by' => User::factory(),
        ];
    }
}
