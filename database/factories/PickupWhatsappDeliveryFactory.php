<?php

namespace Database\Factories;

use App\Models\Customer;
use App\Models\PickupAwbManifest;
use App\Models\PickupTask;
use App\Models\PickupWhatsappDelivery;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PickupWhatsappDelivery>
 */
class PickupWhatsappDeliveryFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'customer_id' => Customer::factory(),
            'pickup_task_id' => fn (array $attributes): int => PickupTask::factory()->create(['customer_id' => $attributes['customer_id']])->id,
            'pickup_awb_manifest_id' => fn (array $attributes): int => PickupAwbManifest::factory()->create(['pickup_task_id' => $attributes['pickup_task_id'], 'snapshot' => ['customer_id' => $attributes['customer_id']]])->id,
            'deduplication_key' => hash('sha256', fake()->uuid()), 'session' => 'office', 'target' => '628123456789@c.us',
            'status' => 'READY', 'parts' => [['type' => 'text', 'text' => 'Ringkasan pengiriman uji', 'status' => 'PENDING']],
        ];
    }
}
