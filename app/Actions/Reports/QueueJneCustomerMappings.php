<?php

namespace App\Actions\Reports;

use App\Jobs\SyncJneCustomerMappings;
use App\Models\JneMappingRun;
use App\Models\JneShipment;

class QueueJneCustomerMappings
{
    /** @param list<string> $normalizedNames */
    public function handle(array $normalizedNames, int $actorId): JneMappingRun
    {
        $run = JneMappingRun::create([
            'normalized_names' => array_values(array_unique($normalizedNames)),
            'created_by' => $actorId, 'upper_id' => JneShipment::max('id') ?? 0,
        ]);
        SyncJneCustomerMappings::dispatch($run->id)->afterCommit();

        return $run;
    }
}
