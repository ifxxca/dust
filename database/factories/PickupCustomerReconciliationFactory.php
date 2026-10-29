<?php

namespace Database\Factories;

use App\Actions\Pickup\PickupResultPeriod;
use App\Models\Customer;
use App\Models\PickupCustomerReconciliation;
use App\Models\PickupTask;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PickupCustomerReconciliation>
 */
class PickupCustomerReconciliationFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return ['customer_id' => Customer::factory(),
            'anchor_task_id' => fn (array $attributes): int => PickupTask::factory()->create(['customer_id' => $attributes['customer_id'], 'scheduled_at' => now()])->id,
            'business_date' => PickupResultPeriod::today()->toDateString(), 'status' => 'AWAITING_VERIFICATION'];
    }
}
