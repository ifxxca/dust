<?php

namespace Database\Factories;

use App\Models\JneMappingRun;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<JneMappingRun>
 */
class JneMappingRunFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'normalized_names' => ['TEST SHIPPER'], 'status' => 'QUEUED',
            'created_by' => User::factory()->state(['role' => 'admin_supervisor']),
        ];
    }
}
