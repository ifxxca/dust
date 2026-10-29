<?php

namespace App\Observers;

use App\Actions\Pickup\QueuePickupReconciliations;
use App\Jobs\QueueHistoricalPickupReconciliationsJob;
use App\Models\HandoverItem;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

class PickupAutomationObserver
{
    public function saved(Model $model): void
    {
        if (! config('pickup.automation.enabled')) {
            return;
        }
        $taskId = $model->getAttribute('pickup_task_id');
        if ($model instanceof PickupTask) {
            $taskId = $model->id;
        } elseif ($model->getAttribute('pickup_record_id')) {
            $taskId = PickupRecord::whereKey($model->getAttribute('pickup_record_id'))->first()?->pickup_task_id;
        } elseif ($model->getAttribute('handover_item_id')) {
            $taskId = HandoverItem::whereKey($model->getAttribute('handover_item_id'))->first()?->pickup_task_id;
        }
        if ($taskId) {
            app(QueuePickupReconciliations::class)->handle([(int) $taskId]);
        } else {
            DB::afterCommit(fn () => QueueHistoricalPickupReconciliationsJob::dispatch(PickupTask::max('id') ?? 0));
        }
    }

    public function deleted(Model $model): void
    {
        $this->saved($model);
    }
}
