<?php

namespace App\Actions\Pickup;

use App\Models\JneShipment;
use App\Models\PickupPendingItem;
use App\Models\PickupTask;
use Illuminate\Database\Eloquent\Collection;

class PickupAwbEligibility
{
    public function sameDay(PickupTask $task, JneShipment $shipment): bool
    {
        $task->loadMissing('proof');
        $shipment->loadMissing('latestSource');
        $pickupAt = $task->proof?->picked_up_at;
        $entryAt = $shipment->latestSource?->entry_at;

        return $pickupAt !== null && $entryAt !== null && PickupResultPeriod::date($pickupAt)->equalTo(PickupResultPeriod::date($entryAt));
    }

    /**
     * @param  Collection<int, PickupTask>  $tasks
     * @param  Collection<int, JneShipment>  $shipments
     * @return array<string, true>
     */
    public function processedKeys(Collection $tasks, Collection $shipments): array
    {
        $tasks->loadMissing('proof');
        $shipments->loadMissing('latestSource:id,entry_at');
        $byId = $tasks->keyBy('id');
        $crossDayIds = $shipments->filter(function (JneShipment $shipment) use ($byId): bool {
            $task = $byId->get($shipment->pickup_task_id);

            return $task !== null && $shipment->latestSource?->entry_at !== null && ! $this->sameDay($task, $shipment);
        })->modelKeys();
        $keys = [];
        foreach (array_chunk($crossDayIds, 500) as $ids) {
            foreach (PickupPendingItem::whereIn('pickup_task_id', $tasks->modelKeys())->whereIn('jne_shipment_id', $ids)
                ->where('status', 'PROCESSED')->whereNotNull('processing_date')->get(['pickup_task_id', 'jne_shipment_id', 'processing_date']) as $pending) {
                $keys[$pending->pickup_task_id.':'.$pending->jne_shipment_id.':'.$pending->processing_date->toDateString()] = true;
            }
        }

        return $keys;
    }

    /** @param array<string, true>|null $processedKeys */
    public function allowed(PickupTask $task, JneShipment $shipment, ?array $processedKeys = null): bool
    {
        if ($this->sameDay($task, $shipment)) {
            return true;
        }

        $date = $shipment->latestSource?->entry_at;
        if ($processedKeys !== null) {
            return $date !== null && isset($processedKeys[$task->id.':'.$shipment->id.':'.PickupResultPeriod::date($date)->toDateString()]);
        }

        return $date !== null && PickupPendingItem::where('pickup_task_id', $task->id)->where('jne_shipment_id', $shipment->id)
            ->where('status', 'PROCESSED')->whereDate('processing_date', PickupResultPeriod::date($date)->toDateString())->exists();
    }
}
