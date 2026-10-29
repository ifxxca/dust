<?php

namespace Database\Factories;

use App\Models\PickupAwbManifest;
use App\Models\PickupTask;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PickupAwbManifest>
 */
class PickupAwbManifestFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'pickup_task_id' => PickupTask::factory(), 'revision' => 1,
            'content_hash' => hash('sha256', fake()->uuid()), 'status' => 'PENDING',
            'snapshot' => ['customer_id' => 1, 'customer_name' => 'Customer Uji', 'customer_code' => '4000', 'reference' => 'PICKUP-TEST', 'pickup_date' => now()->toDateString(), 'unit' => 'AWB', 'categories' => [], 'template_version' => 1],
        ];
    }
}
