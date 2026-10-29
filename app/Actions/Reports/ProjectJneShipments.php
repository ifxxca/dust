<?php

namespace App\Actions\Reports;

use App\Jobs\QueueHistoricalPickupReconciliationsJob;
use App\Models\Customer;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneShipmentObservation;
use App\Models\PickupTask;
use App\Models\ReportJob;
use Illuminate\Support\Facades\DB;

class ProjectJneShipments
{
    public function __construct(private MatchJneShipments $matcher) {}

    public function handle(int $reportId): void
    {
        DB::transaction(function () use ($reportId): void {
            $job = ReportJob::whereKey($reportId)->lockForUpdate()->firstOrFail();
            abort_unless($job->import_status === 'IMPORTED', 409, 'Impor CSV belum selesai.');
            $sources = JneReportAwb::where('report_job_id', $job->id)->orderBy('id')->get(['id', 'report_job_id', 'awb', 'customer_account', 'shipper_name', 'status_web', 'status_pod', 'awb_cancel', 'reference', 'observed_at', 'entry_at']);
            $candidates = $this->matcher->candidates($sources);
            foreach ($sources->chunk(250) as $chunk) {
                JneShipment::insertOrIgnore($chunk->map(fn (JneReportAwb $source): array => ['customer_account' => $source->customer_account, 'awb' => $source->awb, 'created_at' => now(), 'updated_at' => now()])->all());
                $shipments = JneShipment::whereIn('awb', $chunk->pluck('awb'))->with('pickup:id,customer_id')->orderBy('id')->lockForUpdate()->get()->keyBy('awb');
                $shipments->whereIn('awb', $chunk->whereNull('entry_at')->pluck('awb'))->load('latestSource:id,entry_at');
                $observedIds = JneShipmentObservation::whereIn('jne_report_awb_id', $chunk->pluck('id'))->pluck('jne_report_awb_id')->all();
                $observations = [];
                foreach ($chunk as $source) {
                    $shipment = $shipments->get($source->awb);
                    $observedAt = $source->observed_at ?? $job->started_at ?? $job->created_at;
                    $status = $this->classify($source);
                    $signature = hash('sha256', json_encode([$source->status_web, $source->status_pod, $source->awb_cancel], JSON_THROW_ON_ERROR));
                    $newer = $shipment->last_observed_at === null || $observedAt->greaterThan($shipment->last_observed_at)
                        || ($observedAt->equalTo($shipment->last_observed_at) && $job->id > $shipment->latest_report_job_id);
                    if (! in_array($source->id, $observedIds, true)) {
                        $observations[] = ['jne_shipment_id' => $shipment->id, 'jne_report_awb_id' => $source->id, 'observed_at' => $observedAt,
                            'tracking_status' => $status, 'status_signature' => $signature, 'changes_current' => $newer && $signature !== $shipment->status_signature, 'created_at' => now()];
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
                DB::afterCommit(function () use ($customers): void {
                    $upperId = PickupTask::max('id') ?? 0;
                    foreach ($customers->chunk(200) as $chunk) {
                        $ids = array_values($chunk->map(fn (Customer $customer): int => $customer->id)->all());
                        QueueHistoricalPickupReconciliationsJob::dispatch($upperId, customerIds: $ids);
                    }
                });
            }
        }, 3);
    }

    public function classify(JneReportAwb $source): string
    {
        $web = strtoupper(trim($source->status_web ?? ''));
        $pod = strtoupper(trim($source->status_pod ?? ''));
        if (in_array(strtoupper(trim($source->awb_cancel ?? '')), ['Y', 'YES', '1'], true)) {
            return 'CANCELLED';
        }
        if (str_starts_with($web, 'DELIVERED TO [') || in_array($web, ['DELIVERED', 'TERKIRIM'], true) || $pod === 'DELIVERED') {
            return 'DELIVERED';
        }
        if (in_array($web, ['RETURNED', 'RETURNED TO SHIPPER'], true) || str_starts_with($web, 'RETURNED TO SHIPPER [')) {
            return 'RETURNED';
        }
        if (in_array($pod, ['UNDEL', 'UNDELIVERED'], true) || in_array($web, ['INCOMPLETE CONSIGNEE ADDRESS', 'CONSIGNEE UNKNOWN', 'CONSIGNEE NOT AT HOME'], true)) {
            return 'EXCEPTION';
        }
        foreach (['SHIPMENT RECEIVED AT', 'WITH DELIVERY COURIER', 'RECEIVED AT', 'DEPARTED FROM', 'PROCESSED AT', 'SHIPMENT FORWARDED', 'ON PROCESS', 'ON-PROCESS', 'IN TRANSIT'] as $prefix) {
            if ($web === $prefix || str_starts_with($web, $prefix.' [')) {
                return 'IN_TRANSIT';
            }
        }

        return 'UNKNOWN';
    }
}
