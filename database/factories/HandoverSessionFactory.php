<?php

namespace Database\Factories;

use App\Models\HandoverSession;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<HandoverSession>
 */
class HandoverSessionFactory extends Factory
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
            'submission_key' => (string) Str::uuid(),
            'created_by' => User::factory()->state(['role' => 'retail_staff']),
            'status' => 'DRAFT', 'version' => 1,
        ];
    }
}
