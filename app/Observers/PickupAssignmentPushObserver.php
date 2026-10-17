<?php

namespace App\Observers;

use App\Jobs\SendPickupAssignmentPush;
use App\Models\MobilePushDevice;
use App\Models\PickupTaskEvent;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

class PickupAssignmentPushObserver
{
    /**
     * Handle the PickupTaskEvent "created" event.
     */
    public function created(PickupTaskEvent $pickupTaskEvent): void
    {
        if (! config('mobile_push.enabled') || ! in_array($pickupTaskEvent->action, ['assigned', 'taken_over'], true)
            || ! $pickupTaskEvent->new_staff_id || $pickupTaskEvent->new_staff_id === $pickupTaskEvent->previous_staff_id) {
            return;
        }
        $eventId = $pickupTaskEvent->id;
        $staffId = $pickupTaskEvent->new_staff_id;
        DB::afterCommit(function () use ($eventId, $staffId): void {
            try {
                foreach (MobilePushDevice::where('user_id', $staffId)->where('is_active', true)->pluck('id') as $deviceId) {
                    SendPickupAssignmentPush::dispatch($eventId, $deviceId)->onConnection(config('mobile_push.queue_connection'))->onQueue('mobile-push');
                }
            } catch (Throwable) {
                Log::warning('Assignment push could not be queued.', ['event_id' => $eventId]);
            }
        });
    }
}
