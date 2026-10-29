<?php

namespace App\Actions\Reports;

use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneShipmentMatchEvent;
use App\Models\JneShipperAlias;
use App\Models\JneSourceContract;
use App\Models\PickupCashlessAwb;
use App\Models\PickupProcessingRecord;
use App\Models\ReportJob;
use Illuminate\Support\Collection;

class ResolveJneCategories
{
    public static function enabled(): bool
    {
        return config('jne-reports.evidence_policies_enabled') && config('jne-reports.category_reconciliation_enabled');
    }

    public static function markersEnabled(): bool
    {
        return self::enabled() || config('jne-reports.category_markers_enabled');
    }

    /** @param Collection<int, JneShipment> $shipments */
    public function handle(Collection $shipments): void
    {
        if (! self::markersEnabled() || $shipments->isEmpty()) {
            return;
        }
        $sources = JneReportAwb::whereIn('awb', $shipments->pluck('awb'))->orderBy('id')->get();
        $jobs = ReportJob::whereIn('id', $sources->pluck('report_job_id'))->get()->keyBy('id');
        $children = ReportJob::whereIn('hybrid_batch_id', $jobs->modelKeys())->where('status', 'SOURCE_SAVED')->orderBy('id')->get();
        $originsByJob = [];
        foreach ($children as $child) {
            foreach ($child->parameters['awbs'] ?? [] as $awb) {
                $originsByJob[$child->hybrid_batch_id]['awb:'.$awb][] = ['report_job_id' => $child->id, 'source' => $child->source, 'report_type' => $child->report_type, 'checksum' => $child->source_file_checksum];
            }
        }
        $contracts = JneSourceContract::whereNotNull('active_key')->whereNotNull('verified_at')->get()->keyBy('active_key');
        $claims = PickupCashlessAwb::whereIn('awb', $shipments->pluck('awb'))->get()->keyBy('awb');
        $byAwb = $sources->groupBy('awb');
        foreach ($shipments as $shipment) {
            $evidence = [];
            if (config('jne-reports.category_markers_enabled')) {
                if (preg_match('/^(0101|0166)[0-9]+$/D', $shipment->awb, $prefix)) {
                    $evidence[] = ['rule' => 'awb_prefix', 'prefix' => $prefix[1], 'category' => 'manual_hybrid'];
                } elseif (preg_match('/^(CM|TG)[A-Z0-9_-]+$/D', mb_strtoupper($shipment->awb), $prefix)) {
                    $evidence[] = ['rule' => 'awb_prefix', 'prefix' => $prefix[1], 'category' => 'cashless_hybrid'];
                }
            }
            foreach ($byAwb->get($shipment->awb, collect()) as $source) {
                $job = $jobs->get($source->report_job_id);
                $contract = $job ? $contracts->get(JneSourceContract::key($job->source, $job->report_type)) : null;
                $column = $contract?->definition['category_column'] ?? null;
                $raw = is_string($column) ? ($source->raw_data[$column] ?? null) : null;
                if (is_string($raw) && trim($raw) !== '') {
                    $category = null;
                    foreach ($contract->definition['category_values'] ?? [] as $value => $mapped) {
                        if (JneShipperAlias::normalize($raw) === JneShipperAlias::normalize((string) $value)) {
                            $category = $mapped;
                        }
                    }
                    $evidence[] = ['source_id' => $source->id, 'contract_id' => $contract->id, 'contract_revision' => $contract->revision, 'column' => $column, 'original_value' => $raw, 'category' => $category];
                }
                $origins = $source->source_evidence['hybrid_origins'] ?? [];
                $origins = $origins !== [] ? $origins : ($originsByJob[$job?->id]['awb:'.$source->awb] ?? []);
                foreach ($origins as $origin) {
                    $key = $origin['source'].':'.$origin['report_type'];
                    if ($category = $contract?->definition['hybrid_categories'][$key] ?? null) {
                        $evidence[] = ['source_id' => $source->id, 'contract_id' => $contract->id, 'contract_revision' => $contract->revision, 'hybrid_origin' => $origin, 'category' => $category];
                    }
                    if (config('jne-reports.category_markers_enabled') && in_array($origin['source'], ['roberto', 'nuralamt'], true)) {
                        $category = match ($origin['report_type']) {
                            'manual' => 'manual_hybrid',
                            'cashless' => 'cashless_hybrid',
                            default => null,
                        };
                        if ($category !== null) {
                            $evidence[] = ['rule' => 'hybrid_report_type', 'source_id' => $source->id, 'hybrid_origin' => $origin, 'category' => $category];
                        }
                    }
                }
                if (config('jne-reports.category_markers_enabled') && $job?->source === 'apex' && $job->report_type === 'apex' && $job->report_mode === 'P') {
                    $evidence[] = ['rule' => 'apex_customer_report', 'source_id' => $source->id, 'report_job_id' => $job->id, 'category' => 'css_orion'];
                }
            }
            if ($claim = $claims->get($shipment->awb)) {
                $evidence[] = ['sertim_id' => $claim->id, 'sertim_version' => $claim->version, 'pickup_task_id' => $claim->pickup_task_id, 'category' => 'cashless_hybrid'];
            }
            $categories = array_values(array_unique(array_filter(array_column($evidence, 'category'), fn ($value): bool => in_array($value, PickupProcessingRecord::CATEGORIES, true))));
            $status = count($categories) > 1 ? 'CONFLICT' : ($categories === [] ? 'UNMATCHED' : 'MATCHED');
            $category = count($categories) === 1 ? $categories[0] : null;
            if ($shipment->category_method === 'REVIEW') {
                if ($shipment->category_review_hash === self::fingerprint($evidence) || ($status === 'MATCHED' && $category === $shipment->category)) {
                    continue;
                }
                $category = $shipment->category;
                $status = 'CONFLICT';
            }
            if ($shipment->category === $category && $shipment->category_status === $status && self::orderedObjectKeys($shipment->category_evidence ?? []) === self::orderedObjectKeys($evidence)) {
                continue;
            }
            $before = ['category' => $shipment->category, 'status' => $shipment->category_status];
            $shipment->update(['category' => $category, 'category_status' => $status, 'category_method' => $shipment->category_method === 'REVIEW' ? 'REVIEW' : 'EVIDENCE', 'category_evidence' => $evidence, 'version' => $shipment->version + 1]);
            JneShipmentMatchEvent::create(['jne_shipment_id' => $shipment->id, 'previous_pickup_task_id' => $shipment->pickup_task_id, 'pickup_task_id' => $shipment->pickup_task_id,
                'previous_customer_id' => $shipment->customer_id, 'customer_id' => $shipment->customer_id, 'customer_match_status' => $shipment->customer_match_status,
                'match_status' => $shipment->match_status, 'method' => 'CATEGORY', 'actor_id' => null, 'reason' => 'Kategori diperiksa dari bukti terverifikasi; customer dan pickup tidak diubah.',
                'evidence' => [['category_before' => $before, 'category_after' => ['category' => $category, 'status' => $status], 'category_sources' => $evidence]]]);
        }
    }

    /** @param list<array<string, mixed>> $evidence */
    public static function fingerprint(array $evidence): string
    {
        return hash('sha256', json_encode($evidence, JSON_THROW_ON_ERROR));
    }

    /**
     * JSON object key order may change in MySQL; list order and scalar types remain evidence.
     *
     * @param  array<array-key, mixed>  $value
     * @return array<array-key, mixed>
     */
    private static function orderedObjectKeys(array $value): array
    {
        foreach ($value as $key => $item) {
            if (is_array($item)) {
                $value[$key] = self::orderedObjectKeys($item);
            }
        }
        if (! array_is_list($value)) {
            ksort($value);
        }

        return $value;
    }
}
