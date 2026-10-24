<?php

namespace App\Actions\Reports;

use App\Models\JneShipment;

class ReevaluateJneAwbs
{
    public function __construct(private MatchJneShipments $matcher) {}

    /** @param list<string> $awbs */
    public function handle(array $awbs): void
    {
        $shipments = JneShipment::whereIn('awb', $awbs)->with('latestSource', 'pickup')->orderBy('id')->lockForUpdate()->get();
        $sources = $shipments->map->latestSource->filter()->values();
        $candidates = $this->matcher->candidates($sources);
        foreach ($shipments as $shipment) {
            if ($shipment->latestSource) {
                $this->matcher->automatic($shipment, $shipment->latestSource, $candidates);
            }
        }
    }
}
