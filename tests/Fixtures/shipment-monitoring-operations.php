<?php

use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneShipmentObservation;

require __DIR__.'/ui-ux-browser.php';

$shipment = JneShipment::findOrFail($ids['shipment']);
$shipment->latestSource->update(['service' => 'REG', 'destination_name' => 'Bandung', 'source_status_at' => now()->subHours(2)]);
for ($index = 0; $index < 28; $index++) {
    $observed = now()->subHours(30 - $index);
    $status = $index === 1 ? 'DELIVERED' : 'IN_TRANSIT';
    $source = JneReportAwb::factory()->create([
        'source_row' => 100 + $index, 'awb' => $shipment->awb,
        'observed_at' => $observed, 'source_status_at' => $observed->copy()->subHour(),
        'status_web' => $status, 'raw_data' => ['AWB' => $shipment->awb, 'STATUS_WEB' => $status, 'FIXTURE' => true],
    ]);
    JneShipmentObservation::factory()->create([
        'jne_shipment_id' => $shipment->id, 'jne_report_awb_id' => $source->id,
        'tracking_status' => $status, 'observed_at' => $observed, 'changes_current' => $index < 2,
        'created_at' => now(),
    ]);
}
JneShipment::where('tracking_status', 'IN_TRANSIT')->limit(2)->update(['last_observed_at' => now()->subDays(3)]);
JneShipment::where('tracking_status', 'UNKNOWN')->firstOrFail()->update(['last_observed_at' => null]);
foreach (JneShipment::with('latestSource')->get() as $index => $row) {
    $aging = $index % 2 === 0 ? 2 : 5;
    $ongoing = [2, 3, 6, 1][$index % 4];
    $row->latestSource->update([
        'service' => $index % 7 === 0 ? 'YES' : 'REG23',
        'entry_at' => now()->subDays(7),
        'raw_data' => [...$row->latestSource->raw_data, 'AGING' => (string) $aging, 'AGING_ONGOING' => (string) $ongoing,
            'ETD' => '3', 'SLA' => (string) ($aging - 3), 'CARRER' => $aging > 3 ? 'Over SLA' : 'On Time SLA'],
    ]);
}
echo PHP_EOL.'V1.2 fixture: populated/late snapshot evidence and explicit stale/unobserved rows.'.PHP_EOL;
