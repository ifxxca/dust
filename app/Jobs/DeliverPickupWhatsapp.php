<?php

namespace App\Jobs;

use App\Actions\Pickup\ManageWhatsappDelivery;
use App\Models\PickupWhatsappDelivery;
use DateTimeInterface;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

class DeliverPickupWhatsapp implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    public int $tries = 0;

    public int $timeout = 65;

    public int $uniqueFor = 86400;

    public function __construct(public int $deliveryId)
    {
        $this->onQueue('deliveries');
    }

    public function uniqueId(): string
    {
        return 'pickup-whatsapp:'.$this->deliveryId;
    }

    public function retryUntil(): DateTimeInterface
    {
        return now()->addDay();
    }

    public function handle(ManageWhatsappDelivery $action): void
    {
        $delay = $action->handle($this->deliveryId);
        if ($delay !== null) {
            $this->release($delay);
        }
    }

    public function failed(?Throwable $exception): void
    {
        PickupWhatsappDelivery::whereKey($this->deliveryId)->where('status', 'SENDING')->update([
            'status' => 'UNKNOWN', 'last_error' => 'Worker berhenti atau batas antrean terlampaui. Periksa hasil sebelum mengirim ulang.',
        ]);
        PickupWhatsappDelivery::whereKey($this->deliveryId)->whereIn('status', ['READY', 'WAITING'])->update([
            'status' => 'WAITING', 'last_error' => 'Menunggu penjadwalan ulang. Belum ada pengiriman pada percobaan ini.',
        ]);
    }
}
