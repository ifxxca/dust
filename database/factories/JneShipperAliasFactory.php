<?php

namespace Database\Factories;

use App\Models\Customer;
use App\Models\JneShipperAlias;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<JneShipperAlias>
 */
class JneShipperAliasFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $name = fake()->unique()->company();

        return ['customer_id' => Customer::factory(), 'shipper_name' => $name,
            'normalized_name' => JneShipperAlias::normalize($name), 'alias_key' => hash('sha256', JneShipperAlias::normalize($name)),
            'is_active' => true, 'created_by' => User::factory(), 'updated_by' => User::factory()];
    }
}
