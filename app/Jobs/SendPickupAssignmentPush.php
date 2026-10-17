<?php

namespace App\Jobs;

use App\Actions\Mobile\FcmClient;
use App\Models\MobilePushDevice;
use App\Models\PickupTask;
use App\Models\PickupTaskEvent;
use App\Models\User;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

class SendPickupAssignmentPush implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 60;

    public function __construct(public int $eventId, public int $deviceId) {}

    /**
     * Execute the job.
     */
    public function handle(FcmClient $fcm): void
    {
        if (! config('mobile_push.enabled')) {
            return;
        }
        $event = PickupTaskEvent::find($this->eventId);
        if (! $event || ! in_array($event->action, ['assigned', 'taken_over'], true) || ! $event->new_staff_id
            || $event->previous_staff_id === $event->new_staff_id) {
            return;
        }
        foreach (MobilePushDevice::whereKey($this->deviceId)->where('user_id', $event->new_staff_id)->where('is_active', true)->cursor() as $device) {
            $task = PickupTask::find($event->pickup_task_id);
            $user = User::find($device->user_id);
            $token = $device->activeMobileToken($user);
            $latest = PickupTaskEvent::where('pickup_task_id', $event->pickup_task_id)->whereIn('action', ['assigned', 'taken_over'])->max('id');
            if (! $task || $task->status !== 'ASSIGNED' || $task->assigned_staff_id !== $event->new_staff_id || (int) $latest !== $event->id
                || ! $token) {
                continue;
            }
            $claimed = DB::table('mobile_push_deliveries')->insertOrIgnore(['mobile_push_device_id' => $device->id, 'pickup_task_event_id' => $event->id,
                'status' => 'attempted', 'created_at' => now(), 'updated_at' => now()]);
            if (! $claimed) {
                continue;
            }
            try {
                $ttl = max(1, min(300, (int) now()->diffInSeconds($token->expires_at, false), (int) now()->diffInSeconds($token->created_at->addMinutes((int) config('sanctum.expiration')), false)));
                $sent = $fcm->send($device->fcm_token, ['type' => 'pickup_assigned', 'task_id' => (string) $task->id,
                    'event_id' => (string) $event->id, 'recipient_id' => (string) $user->id], $ttl);
                if (! $sent) {
                    MobilePushDevice::whereKey($device->id)->where('token_hash', $device->token_hash)->update(['is_active' => false]);
                }
                $status = $sent ? 'accepted' : 'unregistered';
            } catch (Throwable) {
                $status = 'failed_or_uncertain';
                Log::warning('Assignment push failed or delivery is uncertain.', ['event_id' => $event->id, 'device_id' => $device->id]);
            }
            DB::table('mobile_push_deliveries')->where('mobile_push_device_id', $device->id)->where('pickup_task_event_id', $event->id)->update(['status' => $status, 'updated_at' => now()]);
        }
    }
}
