<?php

namespace Database\Factories;

use App\Models\JneCollectionWindow;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<JneCollectionWindow>
 */
class JneCollectionWindowFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'pickup_task_id' => PickupTask::factory(), 'updated_by' => User::factory()->state(['role' => 'admin_supervisor']), 'status' => 'OPEN',
        ];
    }
}
