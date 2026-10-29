<?php

namespace App\Jobs;

use App\Actions\Mobile\FcmClient;
use App\Models\CashlessEntryAlert;
use App\Models\CashlessEntryBatch;
use App\Models\MobilePushDevice;
use App\Models\User;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

class SendCashlessEntryAlertPush implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 60;

    /**
     * Create a new job instance.
     */
    public function __construct(public int $alertId, public int $deviceId) {}

    /**
     * Execute the job.
     */
    public function handle(FcmClient $fcm): void
    {
        if (! config('mobile_push.enabled')) {
            return;
        }
        $alert = CashlessEntryAlert::find($this->alertId);
        $batch = $alert ? CashlessEntryBatch::find($alert->batch_id) : null;
        $user = $alert ? User::find($alert->user_id) : null;
        $device = $user ? MobilePushDevice::whereKey($this->deviceId)->where('user_id', $user->id)->first() : null;
        $token = $device?->activeMobileToken($user);
        if (! $alert || ! $batch || ! $user || ! $device || ! $token || $batch->created_by !== $user->id
            || ! in_array($batch->status, ['FAILED', 'PARTIAL', 'UNKNOWN'], true) || $alert->read_at !== null) {
            return;
        }
        $claimed = DB::table('cashless_entry_alert_deliveries')->insertOrIgnore(['alert_id' => $alert->id, 'device_id' => $device->id,
            'status' => 'attempted', 'created_at' => now(), 'updated_at' => now()]);
        if (! $claimed) {
            return;
        }
        try {
            $ttl = max(1, min(300, (int) now()->diffInSeconds($token->expires_at, false),
                (int) now()->diffInSeconds($token->created_at->addMinutes((int) config('sanctum.expiration')), false)));
            $sent = $fcm->sendCashlessAlert($device->fcm_token, ['type' => 'cashless_entry_attention',
                'task_id' => (string) $batch->pickup_task_id, 'batch_id' => (string) $batch->id,
                'event_id' => (string) $alert->id, 'recipient_id' => (string) $user->id], $ttl);
            if (! $sent) {
                MobilePushDevice::whereKey($device->id)->where('token_hash', $device->token_hash)->update(['is_active' => false]);
            }
            $status = $sent ? 'accepted' : 'unregistered';
        } catch (Throwable) {
            $status = 'failed_or_uncertain';
            Log::warning('Cashless alert push failed or delivery is uncertain.', ['alert_id' => $alert->id, 'device_id' => $device->id]);
        }
        DB::table('cashless_entry_alert_deliveries')->where('alert_id', $alert->id)->where('device_id', $device->id)
            ->update(['status' => $status, 'updated_at' => now()]);
    }
}
