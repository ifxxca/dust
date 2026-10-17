<?php

namespace Database\Factories;

use App\Models\PickupTask;
use App\Models\PickupVisit;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PickupVisit>
 */
class PickupVisitFactory extends Factory
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
            'started_at' => now(),
        ];
    }
}
