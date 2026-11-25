<?php

namespace App\Http\Controllers;

use App\Actions\Reports\QueryShipmentMonitoring;
use App\Http\Requests\ShipmentMonitoringRequest;
use App\Models\Customer;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneShipmentObservation;
use Illuminate\Support\Arr;
use Inertia\Inertia;
use Inertia\Response;

class ShipmentMonitoringController extends Controller
{
    public function index(ShipmentMonitoringRequest $request, QueryShipmentMonitoring $monitoring): Response
    {
        return $this->listing($request, $monitoring, false);
    }

    public function attention(ShipmentMonitoringRequest $request, QueryShipmentMonitoring $monitoring): Response
    {
        return $this->listing($request, $monitoring, true);
    }

    private function listing(ShipmentMonitoringRequest $request, QueryShipmentMonitoring $monitoring, bool $attention): Response
    {
        $filters = Arr::except($request->monitoringFilters(), ['history', 'back', 'return_page']);
        if ($attention) {
            $filters['attention'] = $filters['attention'] ?? 'all';
        }
        $hours = empty($filters['freshness_hours']) ? null : (int) $filters['freshness_hours'];
        $refresh = $request->header('X-Monitoring-Refresh') === '1';
        $resolvedSummary = null;
        $summary = function () use ($monitoring, $filters, $refresh, &$resolvedSummary): array {
            return $resolvedSummary ??= $monitoring->cachedSummary($filters, $refresh);
        };
        $facetFilters = Arr::except($filters, $attention ? ['attention'] : ['status', 'lifecycle', 'attention']);
        $hasFacetScope = ! empty($filters['status']) || ! empty($filters['lifecycle']) || ! empty($filters['attention']);
        $facets = fn (): array => $hasFacetScope ? $monitoring->cachedSummary($facetFilters, $refresh) : $summary();

        return Inertia::render($attention ? 'shipment-monitoring-attention' : 'shipment-monitoring', [
            'shipments' => fn () => $monitoring->paginate($filters, (int) ($filters['per_page'] ?? 20), (int) ($filters['page'] ?? 1))->withQueryString()
                ->through(fn (JneShipment $shipment): array => $monitoring->row($shipment, $hours)),
            'summary' => $summary,
            'facets' => $facets,
            'filters' => $filters,
            'selectedCustomer' => empty($filters['customer_id']) ? null : Customer::find($filters['customer_id'], ['id', 'name', 'customer_code']),
            'timezone' => 'Asia/Jakarta',
        ]);
    }

    public function overview(ShipmentMonitoringRequest $request, QueryShipmentMonitoring $monitoring): Response
    {
        $filters = Arr::only($request->monitoringFilters(), ['date_from', 'date_thru', 'freshness_hours']);
        $hours = empty($filters['freshness_hours']) ? null : (int) $filters['freshness_hours'];
        $priorityCategory = $request->validated('attention') ?? 'all';
        $priorityPage = $request->integer('page', 1);

        return Inertia::render('shipment-monitoring-overview', [
            'summary' => fn (): array => $monitoring->cachedSummary($filters, $request->header('X-Monitoring-Refresh') === '1'),
            'trend' => Inertia::defer(fn (): array => $monitoring->trend($filters), 'shipment-trend'),
            'preview' => Inertia::defer(fn () => $monitoring->listing([...$filters, 'attention' => $priorityCategory])->offset(($priorityPage - 1) * 5)->limit(5)->get()
                ->map(fn (JneShipment $shipment): array => $monitoring->row($shipment, $hours)), 'attention-preview'),
            'filters' => $filters,
            'priorityCategory' => $priorityCategory,
            'priorityPage' => $priorityPage,
            'timezone' => 'Asia/Jakarta',
        ]);
    }

    public function show(ShipmentMonitoringRequest $request, int $shipment, QueryShipmentMonitoring $monitoring): Response
    {
        $filters = $request->validated();
        $record = $monitoring->listing(['shipment_id' => $shipment])->with('latestSource')->firstOrFail();
        $record->load('latestSource.reportJob');
        $history = JneShipmentObservation::where('jne_shipment_id', $record->id)
            ->when(($filters['history'] ?? 'changes') === 'changes', fn ($query) => $query->where('changes_current', true))
            ->orderByDesc('observed_at')->orderByDesc('id')->paginate(25)->withQueryString();
        $sources = JneReportAwb::whereIn('id', $history->getCollection()->pluck('jne_report_awb_id'))->get()->keyBy('id');

        return Inertia::render('shipment-monitoring-detail', [
            'shipment' => $monitoring->row($record, null),
            'journey' => $record->latestSource ? $monitoring->journey($record->latestSource, $record->tracking_status) : [],
            'context' => Arr::except($filters, ['history', 'page']),
            'returnTo' => route(($filters['back'] ?? '') === 'attention' ? 'shipment-monitoring.attention' : 'shipment-monitoring.index', [
                ...Arr::except($filters, ['history', 'back', 'return_page', 'page']),
                'page' => $filters['return_page'] ?? 1,
            ]),
            'source' => $record->latestSource ? [
                ...$record->latestSource->only(['id', 'report_job_id', 'source_row', 'shipper_name', 'consignee_name', 'status_web', 'status_pod', 'awb_cancel', 'raw_data', 'source_evidence', 'service', 'destination_name', 'observed_at', 'source_status_at', 'entry_at']),
                'source' => $record->latestSource->reportJob?->source,
                'checksum' => $record->latestSource->reportJob?->file_checksum,
                'delivered_at' => $record->latestSource->getAttribute('delivered_at'),
            ] : null,
            'history' => $history->through(function (JneShipmentObservation $observation) use ($sources): array {
                $source = $sources->get($observation->jne_report_awb_id);

                return [
                    ...$observation->only(['id', 'tracking_status', 'changes_current']),
                    'observed_at' => $observation->observed_at->toIso8601String(),
                    'received_at' => $observation->created_at->toIso8601String(),
                    'source_status_at' => $source?->source_status_at?->toIso8601String(),
                    'status_web' => $source?->status_web, 'status_pod' => $source?->status_pod,
                    'report_id' => $source?->report_job_id, 'source_row' => $source?->source_row,
                ];
            }),
            'historyMode' => $filters['history'] ?? 'changes',
            'timezone' => 'Asia/Jakarta',
        ]);
    }
}
