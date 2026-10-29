<?php

namespace App\Jobs;

use App\Actions\Pickup\PickupResultPeriod;
use App\Actions\Pickup\ReconcilePickupProcessing;
use App\Models\PickupProcessingReconciliation;
use App\Models\PickupTask;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

class ReconcilePickupProcessingJob implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    public int $tries = 4;

    public int $timeout = 60;

    public int $uniqueFor = 0;

    public ?string $customerDayKey = null;

    public function __construct(public int $taskId, ?string $customerDayKey = null)
    {
        $this->onQueue('reconciliation');
        $this->customerDayKey = $customerDayKey;
        if ($customerDayKey !== null) {
            return;
        }
        $task = PickupTask::with('proof')->find($this->taskId);
        if ($task) {
            $day = PickupResultPeriod::date($task->proof->picked_up_at ?? $task->scheduled_at)->toDateString();
            $this->customerDayKey = 'pickup-customer-day:'.$task->customer_id.':'.$day;
        }
    }

    public function uniqueId(): string
    {
        return $this->customerDayKey ?? 'pickup:'.$this->taskId;
    }

    /** @return list<int> */
    public function backoff(): array
    {
        return [15, 60, 180];
    }

    public function handle(ReconcilePickupProcessing $action): void
    {
        $action->handle($this->taskId);
    }

    public function failed(?Throwable $exception): void
    {
        PickupProcessingReconciliation::where('pickup_task_id', $this->taskId)->update(['last_error' => 'Validasi otomatis gagal. Periksa worker atau antrekan ulang.', 'next_evaluation_at' => now()->addMinutes(5)]);
    }
}
