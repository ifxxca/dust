<?php

namespace App\Jobs;

use App\Actions\Reports\MatchJneShipments;
use App\Models\JneMappingRun;
use App\Models\JneShipment;
use App\Models\JneShipperAlias;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;
use Throwable;

class SyncJneCustomerMappings implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 60;

    public function __construct(public int $runId) {}

    /**
     * Execute the job.
     */
    public function handle(MatchJneShipments $matcher): void
    {
        DB::transaction(function () use ($matcher): void {
            $run = JneMappingRun::whereKey($this->runId)->lockForUpdate()->firstOrFail();
            if (! in_array($run->status, ['QUEUED', 'RUNNING'], true)) {
                return;
            }
            $shipments = JneShipment::where('id', '>', $run->last_id)->where('id', '<=', $run->upper_id)
                ->orderBy('id')->limit(200)->lockForUpdate()->get();
            $shipments->load('latestSource', 'pickup', 'sources:id,awb,shipper_name');
            $affected = $shipments->filter(fn (JneShipment $shipment): bool => $shipment->latestSource !== null
                && $shipment->match_method !== 'MANUAL'
                && $shipment->sources->contains(fn ($source): bool => in_array(JneShipperAlias::normalize($source->shipper_name ?? ''), $run->normalized_names, true)));
            $candidates = $matcher->candidates($affected->map->latestSource->unique('id')->values());
            foreach ($affected as $shipment) {
                $matcher->automatic($shipment, $shipment->latestSource, $candidates);
            }
            $lastId = $shipments->last()?->id;
            $complete = $shipments->count() < 200 || $lastId === $run->upper_id;
            $run->update(['last_id' => $lastId ?? $run->last_id,
                'affected_count' => $run->affected_count + $affected->count(), 'status' => $complete ? 'COMPLETED' : 'RUNNING',
                'completed_at' => $complete ? now() : null, 'error_message' => null]);
            if (! $complete) {
                self::dispatch($run->id)->afterCommit();
            }
        }, 3);
    }

    public function failed(?Throwable $exception): void
    {
        JneMappingRun::whereKey($this->runId)->whereIn('status', ['QUEUED', 'RUNNING'])->update([
            'status' => 'FAILED', 'error_message' => 'Penerapan nama pengirim terhenti. Ulangi dari progres terakhir; hubungan manual tetap dipertahankan.',
        ]);
    }
}
