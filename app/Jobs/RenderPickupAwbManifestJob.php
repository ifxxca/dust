<?php

namespace App\Jobs;

use App\Actions\Pickup\RenderPickupAwbManifest;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class RenderPickupAwbManifestJob implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    /**
     * Create a new job instance.
     */
    public int $tries = 4;

    public int $timeout = 75;

    public int $uniqueFor = 180;

    public function __construct(public int $manifestId)
    {
        $this->onQueue('documents');
    }

    /**
     * Execute the job.
     */
    public function handle(RenderPickupAwbManifest $action): void
    {
        $action->handle($this->manifestId);
    }

    public function uniqueId(): string
    {
        return 'manifest:'.$this->manifestId;
    }

    /** @return list<int> */
    public function backoff(): array
    {
        return [30, 120, 300];
    }
}
