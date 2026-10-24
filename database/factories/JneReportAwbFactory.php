<?php

namespace Database\Factories;

use App\Models\JneReportAwb;
use App\Models\ReportJob;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<JneReportAwb>
 */
class JneReportAwbFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'report_job_id' => ReportJob::factory(), 'source_row' => 2,
            'awb' => fake()->unique()->numerify('###############'),
            'customer_account' => 'TESTACCOUNT', 'status_web' => 'Delivered', 'status_pod' => 'DELIVERED',
            'shipper_name' => fake()->company(), 'consignee_name' => fake()->name(),
        ];
    }
}
