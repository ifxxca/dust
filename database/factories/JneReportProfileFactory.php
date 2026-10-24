<?php

namespace Database\Factories;

use App\Models\JneReportProfile;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<JneReportProfile>
 */
class JneReportProfileFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'customer_account' => fake()->unique()->numerify('########'), 'enabled' => false, 'mode' => 'rolling',
            'lookback_days' => 5, 'interval_minutes' => 360, 'next_run_at' => now(), 'version' => 1,
            'created_by' => User::factory()->state(['role' => 'admin_supervisor']), 'updated_by' => fn (array $attributes): int => $attributes['created_by'],
        ];
    }
}
