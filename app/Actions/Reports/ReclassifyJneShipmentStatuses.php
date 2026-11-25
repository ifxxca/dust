<?php

namespace App\Actions\Reports;

use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneShipmentObservation;
use App\Models\ReportJob;
use Illuminate\Support\Facades\DB;

class ReclassifyJneShipmentStatuses
{
    public function __construct(private ClassifyJneShipmentStatus $statuses) {}

    /** @return array{sources: int, shipments: int, observations: int} */
    public function handle(?string $account = null, bool $dryRun = false): array
    {
        $counts = ['sources' => 0, 'shipments' => 0, 'observations' => 0];
        JneReportAwb::query()->when($account !== null, fn ($query) => $query->whereIn('report_job_id', ReportJob::where('customer_account', $account)->select('id')))
            ->select(['id', 'status_web', 'status_pod', 'awb_cancel', 'raw_data->CODING as coding'])
            ->chunkById(500, function ($sources) use ($dryRun, &$counts): void {
                $states = [];
                foreach ($sources as $source) {
                    $states[$source->id] = ['tracking_status' => $this->statuses->handle($source), 'status_signature' => $this->statuses->signature($source)];
                }
                $counts['sources'] += $sources->count();
                $observations = JneShipmentObservation::whereIn('jne_report_awb_id', $sources->modelKeys())->get(['id', 'jne_report_awb_id', 'tracking_status', 'status_signature']);
                foreach ($observations as $observation) {
                    $state = $states[$observation->jne_report_awb_id];
                    if ($observation->tracking_status !== $state['tracking_status'] || $observation->status_signature !== $state['status_signature']) {
                        $counts['observations'] += $dryRun ? 1 : DB::table('jne_shipment_observations')->where('id', $observation->id)->update($state);
                    }
                }
                $shipments = JneShipment::whereIn('latest_report_awb_id', $sources->modelKeys())->get(['id', 'latest_report_awb_id', 'tracking_status', 'status_signature']);
                foreach ($shipments as $shipment) {
                    $state = $states[$shipment->latest_report_awb_id];
                    if ($shipment->tracking_status !== $state['tracking_status'] || $shipment->status_signature !== $state['status_signature']) {
                        $counts['shipments'] += $dryRun ? 1 : DB::table('jne_shipments')->where('id', $shipment->id)->where('latest_report_awb_id', $shipment->latest_report_awb_id)
                            ->where(fn ($query) => $query->where('tracking_status', '<>', $state['tracking_status'])->orWhereNull('status_signature')->orWhere('status_signature', '<>', $state['status_signature']))
                            ->update([...$state, 'version' => DB::raw('version + 1')]);
                    }
                }
            });

        return $counts;
    }
}
