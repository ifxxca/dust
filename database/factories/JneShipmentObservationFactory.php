<?php

namespace Database\Factories;

use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneShipmentObservation;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<JneShipmentObservation>
 */
class JneShipmentObservationFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'jne_shipment_id' => JneShipment::factory(), 'jne_report_awb_id' => JneReportAwb::factory(),
            'tracking_status' => 'UNKNOWN', 'status_signature' => hash('sha256', 'fixture'), 'observed_at' => now(), 'changes_current' => false,
        ];
    }
}
