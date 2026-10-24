<?php

namespace Database\Factories;

use App\Models\Customer;
use App\Models\JneCustomerCodeAlias;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<JneCustomerCodeAlias>
 */
class JneCustomerCodeAliasFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'customer_id' => Customer::factory(), 'code' => fake()->unique()->numerify('######').'A',
            'created_by' => User::factory()->state(['role' => 'admin_supervisor']), 'reason' => 'Synthetic registered alias', 'is_active' => false,
        ];
    }
}
