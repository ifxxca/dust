<?php

namespace Database\Factories;

use App\Models\PickupProcessingReconciliation;
use App\Models\PickupTask;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PickupProcessingReconciliation>
 */
class PickupProcessingReconciliationFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'pickup_task_id' => PickupTask::factory(), 'status' => 'WAITING_DATA', 'revision' => 1,
            'categories' => [], 'reasons' => [], 'evidence' => [], 'evaluated_at' => now(), 'next_evaluation_at' => now()->addMinutes(5),
        ];
    }
}
