<?php

namespace Database\Factories;

use App\Models\CashlessEntryAlert;
use App\Models\CashlessEntryBatch;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<CashlessEntryAlert>
 */
class CashlessEntryAlertFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'batch_id' => CashlessEntryBatch::factory(),
            'user_id' => fn (array $attributes): int => CashlessEntryBatch::whereKey($attributes['batch_id'])->firstOrFail()->created_by,
        ];
    }
}
