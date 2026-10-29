<?php

namespace Database\Factories;

use App\Models\CashlessEntryBatch;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<CashlessEntryBatch>
 */
class CashlessEntryBatchFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'submission_key' => fake()->uuid(), 'pickup_task_id' => PickupTask::factory(),
            'created_by' => User::factory(), 'source' => 'roberto', 'status' => 'QUEUED',
        ];
    }
}
