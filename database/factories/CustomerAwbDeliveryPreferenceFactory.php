<?php

namespace Database\Factories;

use App\Models\Customer;
use App\Models\CustomerAwbDeliveryPreference;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<CustomerAwbDeliveryPreference>
 */
class CustomerAwbDeliveryPreferenceFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'customer_id' => Customer::factory(), 'enabled' => false, 'channel' => 'email', 'recipient' => 'customer@example.test', 'revision' => 1,
        ];
    }
}
