<?php

namespace App\Observers;

use App\Jobs\SendCashlessEntryAlertPush;
use App\Models\CashlessEntryAlert;
use App\Models\CashlessEntryBatch;
use App\Models\MobilePushDevice;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

class CashlessEntryAlertObserver
{
    /** Persist one alert per batch; external delivery waits for commit. */
    public function saved(CashlessEntryBatch $batch): void
    {
        if (! in_array($batch->status, ['FAILED', 'PARTIAL', 'UNKNOWN'], true)) {
            return;
        }
        $alert = CashlessEntryAlert::firstOrCreate(['batch_id' => $batch->id], ['user_id' => $batch->created_by]);
        if (! $alert->wasRecentlyCreated || ! config('mobile_push.enabled')) {
            return;
        }
        DB::afterCommit(function () use ($alert): void {
            try {
                foreach (MobilePushDevice::where('user_id', $alert->user_id)->where('is_active', true)->pluck('id') as $deviceId) {
                    SendCashlessEntryAlertPush::dispatch($alert->id, $deviceId)
                        ->onConnection(config('mobile_push.queue_connection'))->onQueue('mobile-push');
                }
            } catch (Throwable) {
                Log::warning('Cashless alert push could not be queued.', ['alert_id' => $alert->id]);
            }
        });
    }
}
