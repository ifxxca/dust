<?php

namespace App\Actions\Reports;

use App\Jobs\QueueHistoricalPickupReconciliationsJob;
use App\Models\Customer;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneShipmentObservation;
use App\Models\JneSourceContract;
use App\Models\PickupTask;
use App\Models\ReportJob;
use Illuminate\Support\Facades\DB;

class ProjectJneShipments
{
    public function __construct(private MatchJneShipments $matcher, private ClassifyJneShipmentStatus $statuses) {}

    public function handle(int $reportId): void
    {
        DB::transaction(function () use ($reportId): void {
            $job = ReportJob::whereKey($reportId)->lockForUpdate()->firstOrFail();
            abort_unless($job->import_status === 'IMPORTED', 409, 'Impor CSV belum selesai.');
            $sources = JneReportAwb::where('report_job_id', $job->id)->orderBy('id')->get(['id', 'report_job_id', 'awb', 'customer_account', 'shipper_name', 'status_web', 'status_pod', 'awb_cancel', 'reference', 'observed_at', 'entry_at', 'raw_data->CODING as coding']);
            $candidates = $this->matcher->candidates($sources, lockCustomerScope: true);
            foreach ($sources->chunk(250) as $chunk) {
                JneShipment::insertOrIgnore($chunk->map(fn (JneReportAwb $source): array => ['customer_account' => $source->customer_account, 'awb' => $source->awb, 'created_at' => now(), 'updated_at' => now()])->all());
                $shipments = JneShipment::whereIn('awb', $chunk->pluck('awb'))->with('pickup:id,customer_id')->orderBy('id')->lockForUpdate()->get()->keyBy('awb');
                $shipments->load('latestSource:id,entry_at,status_web,status_pod,awb_cancel,raw_data->CODING as coding');
                $observedIds = JneShipmentObservation::whereIn('jne_report_awb_id', $chunk->pluck('id'))->pluck('jne_report_awb_id')->all();
                $observations = [];
                foreach ($chunk as $source) {
                    $shipment = $shipments->get($source->awb);
                    $observedAt = $source->observed_at ?? $job->started_at ?? $job->created_at;
                    $status = $this->classify($source);
                    $signature = $this->statusSignature($source);
                    $previousSignature = $shipment->latestSource ? $this->statusSignature($shipment->latestSource) : $shipment->status_signature;
                    $newer = $shipment->last_observed_at === null || $observedAt->greaterThan($shipment->last_observed_at)
                        || ($observedAt->equalTo($shipment->last_observed_at) && $job->id > $shipment->latest_report_job_id);
                    if (! in_array($source->id, $observedIds, true)) {
                        $observations[] = ['jne_shipment_id' => $shipment->id, 'jne_report_awb_id' => $source->id, 'observed_at' => $observedAt,
                            'tracking_status' => $status, 'status_signature' => $signature, 'changes_current' => $newer && $signature !== $previousSignature, 'created_at' => now()];
                    }
                    if ($newer) {
                        $shipment->update(['customer_account' => $source->customer_account, 'latest_report_awb_id' => $source->id, 'latest_report_job_id' => $job->id, 'last_observed_at' => $observedAt,
                            'tracking_status' => $status, 'status_signature' => $signature, 'version' => $shipment->version + 1]);
                        $shipment->setRelation('latestSource', $source);
                    }
                    $this->matcher->automatic($shipment, $source, $candidates);
                }
                if ($observations !== []) {
                    JneShipmentObservation::insert($observations);
                }
            }
            $job->update(['projection_status' => 'PROJECTED', 'projection_error' => null]);
            if (ResolveJneCategories::markersEnabled()) {
                app(ResolveJneCategories::class)->handle(JneShipment::whereIn('awb', $sources->pluck('awb'))->orderBy('id')->lockForUpdate()->get());
            }
            if (config('pickup.automation.enabled')) {
                $customers = Customer::whereIn('id', JneShipment::whereIn('awb', $sources->pluck('awb'))->select('customer_id'))->orderBy('id')->get(['id']);
                $contract = JneSourceContract::where('active_key', JneSourceContract::key($job->source, $job->report_type))->whereNotNull('verified_at')->first();
                $completeDateReport = ($contract?->definition['collection_mode'] ?? null) === 'complete_date_report' && empty(data_get($job->getAttribute('parameters'), 'awbs'));
                DB::afterCommit(function () use ($customers, $job, $completeDateReport): void {
                    $upperId = PickupTask::max('id') ?? 0;
                    if ($completeDateReport && $job->date_from && $job->date_thru) {
                        QueueHistoricalPickupReconciliationsJob::dispatch($upperId, dateFrom: $job->date_from->subDay()->toDateString(), dateTo: $job->date_thru->toDateString());

                        return;
                    }
                    foreach ($customers->chunk(200) as $chunk) {
                        $ids = array_values($chunk->map(fn (Customer $customer): int => $customer->id)->all());
                        QueueHistoricalPickupReconciliationsJob::dispatch($upperId, customerIds: $ids);
                    }
                });
            }
        }, 3);
    }

    private function statusSignature(JneReportAwb $source): string
    {
        return $this->statuses->signature($source);
    }

    public function classify(JneReportAwb $source): string
    {
        return $this->statuses->handle($source);
    }
}
