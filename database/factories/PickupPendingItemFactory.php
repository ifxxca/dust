<?php

namespace Database\Factories;

use App\Models\PickupPendingItem;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<PickupPendingItem>
 */
class PickupPendingItemFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'reference' => (string) Str::ulid(), 'pickup_task_id' => PickupTask::factory(),
            'category' => 'manual_hybrid', 'label' => fake()->bothify('Pesanan ##??'), 'reason' => 'Destinasi belum lengkap',
            'status' => 'PENDING', 'version' => 1, 'created_by' => User::factory(), 'updated_by' => User::factory(),
        ];
    }
}
