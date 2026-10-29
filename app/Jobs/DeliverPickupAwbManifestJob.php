<?php

namespace App\Jobs;

use App\Actions\Pickup\DeliverPickupAwbManifest;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class DeliverPickupAwbManifestJob implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    /**
     * Create a new job instance.
     */
    public int $tries = 1;

    public int $timeout = 60;

    public int $uniqueFor = 180;

    public function __construct(public int $deliveryId)
    {
        $this->onQueue('deliveries');
    }

    /**
     * Execute the job.
     */
    public function handle(DeliverPickupAwbManifest $action): void
    {
        $action->handle($this->deliveryId);
    }

    public function uniqueId(): string
    {
        return 'delivery:'.$this->deliveryId;
    }
}
