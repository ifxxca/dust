<?php

namespace Database\Factories;

use App\Models\CashlessEntryBatch;
use App\Models\CashlessEntryItem;
use App\Models\PickupCashlessAwb;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<CashlessEntryItem>
 */
class CashlessEntryItemFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'batch_id' => CashlessEntryBatch::factory(), 'pickup_cashless_awb_id' => PickupCashlessAwb::factory(),
            'awb' => fake()->unique()->bothify('TG##########'), 'status' => 'PENDING',
        ];
    }
}
