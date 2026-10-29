<?php

namespace App\Actions\Pickup;

use App\Jobs\ReconcilePickupProcessingJob;
use App\Models\PickupProcessingReconciliation;
use App\Models\PickupTask;
use Illuminate\Support\Facades\DB;

class QueuePickupReconciliations
{
    /** @param list<int> $taskIds */
    public function handle(array $taskIds, bool $invalidate = true): void
    {
        if (! config('pickup.automation.enabled')) {
            return;
        }
        foreach (PickupTask::whereIn('id', $taskIds)->whereDoesntHave('proof', fn ($proof) => $proof->whereNotNull('finalized_at'))->get() as $task) {
            $taskIds = array_values(array_unique([...$taskIds, ...app(ReconcileCustomerPickupDay::class)->memberIds($task)]));
        }
        $tasks = PickupTask::whereIn('id', $taskIds)->whereHas('proof', fn ($proof) => $proof->whereNotNull('finalized_at'))
            ->with('proof:id,pickup_task_id,picked_up_at')->orderBy('id')->get(['id', 'customer_id', 'scheduled_at']);
        $days = [];
        foreach ($tasks as $task) {
            $taskId = $task->id;
            $row = PickupProcessingReconciliation::firstOrCreate(['pickup_task_id' => $taskId], ['revision' => 0]);
            if ($invalidate) {
                $row->increment('input_version', 1, ['next_evaluation_at' => now()->addMinutes(5)]);
            } else {
                $row->update(['next_evaluation_at' => now()->addMinutes(5)]);
            }
            $day = PickupResultPeriod::date($task->proof->picked_up_at ?? $task->scheduled_at)->toDateString();
            $days['pickup-customer-day:'.$task->customer_id.':'.$day] ??= $taskId;
        }
        foreach ($days as $key => $taskId) {
            DB::afterCommit(fn () => ReconcilePickupProcessingJob::dispatch($taskId, $key));
        }
    }
}
