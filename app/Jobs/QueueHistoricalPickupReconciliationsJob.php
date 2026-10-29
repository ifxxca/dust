<?php

namespace App\Jobs;

use App\Actions\Pickup\QueuePickupReconciliations;
use App\Models\PickupTask;
use Illuminate\Contracts\Queue\ShouldBeUniqueUntilProcessing;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class QueueHistoricalPickupReconciliationsJob implements ShouldBeUniqueUntilProcessing, ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 60;

    /** Bound suppression if publication fails; duplicate internal invalidation is safe. */
    public int $uniqueFor = 60;

    /** @param list<int>|null $customerIds */
    public function __construct(public int $upperId, public int $afterId = 0, public ?array $customerIds = null)
    {
        $this->onQueue('default');
    }

    public function uniqueId(): string
    {
        return hash('sha256', json_encode([$this->upperId, $this->afterId, $this->customerIds], JSON_THROW_ON_ERROR));
    }

    /** @return list<int> */
    public function backoff(): array
    {
        return [15, 60];
    }

    /**
     * Execute the job.
     */
    public function handle(QueuePickupReconciliations $reconciliations): void
    {
        if (! config('pickup.automation.enabled')) {
            return;
        }
        $tasks = PickupTask::where('id', '>', $this->afterId)->where('id', '<=', $this->upperId)
            ->when($this->customerIds !== null, fn ($query) => $query->whereIn('customer_id', $this->customerIds))
            ->whereHas('proof', fn ($proof) => $proof->whereNotNull('finalized_at'))->orderBy('id')->limit(200)->get(['id']);
        $ids = array_values($tasks->map(fn (PickupTask $task): int => $task->id)->all());
        $reconciliations->handle($ids);
        $lastId = $ids !== [] ? $ids[array_key_last($ids)] : 0;
        if (count($ids) === 200 && $lastId < $this->upperId) {
            self::dispatch($this->upperId, $lastId, $this->customerIds)->afterCommit();
        }
    }
}
