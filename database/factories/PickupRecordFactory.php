<?php

namespace Database\Factories;

use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<PickupRecord>
 */
class PickupRecordFactory extends Factory
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
            'staff_id' => User::factory()->state(['role' => 'pickup_staff']),
            'submission_key' => (string) Str::uuid(),
            'customer_name' => fake()->name(), 'pickup_address' => fake()->address(), 'contact' => fake()->safeEmail(),
            'manual_hybrid' => 2, 'cashless_hybrid' => 1, 'css_orion' => 0,
            'notes' => null, 'picked_up_at' => now(), 'finalized_at' => now(),
        ];
    }
}
