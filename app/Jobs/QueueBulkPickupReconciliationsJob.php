<?php

namespace App\Jobs;

use App\Actions\Pickup\QueuePickupReconciliations;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class QueueBulkPickupReconciliationsJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 60;

    /** @param list<int> $taskIds */
    public function __construct(public array $taskIds)
    {
        $this->onQueue('default');
    }

    /**
     * Execute the job.
     */
    public function handle(QueuePickupReconciliations $reconciliations): void
    {
        foreach (array_chunk($this->taskIds, 200) as $ids) {
            $reconciliations->handle($ids, invalidate: false);
        }
    }
}
