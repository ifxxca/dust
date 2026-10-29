<?php

namespace Database\Factories;

use App\Models\JneSourceContract;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<JneSourceContract>
 */
class JneSourceContractFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'source' => 'apex', 'report_type' => 'apex', 'revision' => 1, 'definition' => [],
            'created_by' => User::factory()->state(['role' => 'admin_supervisor']), 'reason' => 'Synthetic UAT draft; no production semantics',
        ];
    }
}
