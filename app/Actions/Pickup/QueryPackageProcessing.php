<?php

namespace App\Actions\Pickup;

use App\Models\PickupProcessingRecord;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

class QueryPackageProcessing
{
    public function __construct(private QueryPickupResults $pickups) {}

    public function latest(): Builder
    {
        return DB::table('pickup_processing_records as r')->where('r.revision', '=', function (Builder $query): void {
            $query->from('pickup_processing_records as candidate')->selectRaw('max(candidate.revision)')
                ->whereColumn('candidate.pickup_task_id', 'r.pickup_task_id')->whereColumn('candidate.category', 'r.category')->whereColumn('candidate.system', 'r.system');
        });
    }

    /** @param array<string, mixed> $filters */
    public function handle(array $filters = []): Builder
    {
        $duplicates = $this->latest()->whereNotNull('external_reference')->select(['system', 'external_reference'])->groupBy('system', 'external_reference')->havingRaw('count(*) > 1');
        $records = DB::query()->fromSub($this->latest(), 'r')
            ->leftJoinSub($duplicates, 'duplicate', fn ($join) => $join->on('duplicate.system', '=', 'r.system')->on('duplicate.external_reference', '=', 'r.external_reference'))
            ->select(['r.pickup_task_id', 'r.category'])
            ->selectRaw("sum(r.successful_quantity) as manual_quantity, sum(r.failed_quantity) as failed_quantity, sum(r.pending_quantity) as pending_quantity, sum(r.unknown_quantity) as unknown_outcome_quantity,
                count(*) as record_count, max(r.created_at) as last_updated_at, max(r.pickup_revision) as max_pickup_revision, min(r.pickup_revision) as min_pickup_revision,
                min(r.received_quantity) as min_received_baseline, max(r.received_quantity) as max_received_baseline, count(r.received_quantity) as received_baseline_count,
                min(r.handover_revision) as min_handover_revision, max(r.handover_revision) as max_handover_revision,
                max(case when r.system = 'JNE_HYBRID' then 1 else 0 end) as has_hybrid,
                max(case when r.system = 'MYORION' then 1 else 0 end) as has_orion,
                max(case when duplicate.external_reference is not null then 1 else 0 end) as duplicate_reference")
            ->groupBy('r.pickup_task_id', 'r.category');
        $union = null;
        foreach (PickupProcessingRecord::CATEGORIES as $category) {
            $pickupFilters = ($filters['scope'] ?? null) === 'backlog' ? [...$filters, 'scope' => 'backlog_origin'] : $filters;
            $categoryQuery = DB::query()->fromSub($this->pickups->handle([...$pickupFilters, 'category' => $category]), 'p')
                ->select('p.*')->selectRaw("'$category' as category, case when finalized_at is not null then $category else 0 end as pop_quantity,
                    case when verification_status in ('VERIFIED', 'DISCREPANCY') then received_$category else null end as received_quantity");
            $union = $union ? $union->unionAll($categoryQuery) : $categoryQuery;
        }
        $quantities = DB::query()->fromSub($union, 'p')
            ->leftJoinSub($records, 'r', fn ($join) => $join->on('r.pickup_task_id', '=', 'p.id')->on('r.category', '=', 'p.category'))
            ->select('p.*')
            ->selectRaw('coalesce(r.manual_quantity, 0) as manual_quantity, coalesce(r.failed_quantity, 0) as failed_quantity, coalesce(r.pending_quantity, 0) as pending_quantity, coalesce(r.unknown_outcome_quantity, 0) as unknown_outcome_quantity,
                coalesce(r.record_count, 0) as record_count, r.last_updated_at, coalesce(r.has_hybrid, 0) as has_hybrid, coalesce(r.has_orion, 0) as has_orion,
                coalesce(r.duplicate_reference, 0) as duplicate_reference, null as confirmed_quantity,
                coalesce(p.received_quantity, p.pop_quantity) as unconfirmed_quantity,
                case when r.record_count > 0 and (p.received_quantity is null or p.needs_review = 1 or r.min_pickup_revision <> p.pickup_revision or r.max_pickup_revision <> p.pickup_revision
                    or r.received_baseline_count <> r.record_count or r.min_received_baseline <> p.received_quantity or r.max_received_baseline <> p.received_quantity
                    or r.min_handover_revision <> p.handover_revision or r.max_handover_revision <> p.handover_revision) then 1 else 0 end as baseline_changed');
        $flags = DB::query()->fromSub($quantities, 'q')->select('q.*')
            ->selectRaw('case when manual_quantity + failed_quantity + pending_quantity + unknown_outcome_quantity > received_quantity or baseline_changed = 1 or duplicate_reference = 1 or record_count > 1 then 1 else 0 end as reconciliation_required,
                case when unconfirmed_quantity > manual_quantity + failed_quantity + pending_quantity + unknown_outcome_quantity then unconfirmed_quantity - manual_quantity - failed_quantity - pending_quantity - unknown_outcome_quantity else 0 end as not_recorded_quantity');
        $states = DB::query()->fromSub($flags, 'f')->select('f.*')->selectRaw("case when reconciliation_required = 1 then 'RECONCILIATION_REQUIRED' when unknown_outcome_quantity > 0 then 'UNKNOWN' when failed_quantity > 0 then 'FAILED' when pending_quantity > 0 then 'PENDING' when record_count > 0 then 'MANUAL_RECORDED' else 'NOT_RECORDED' end as processing_status,
            case when reconciliation_required = 1 or failed_quantity > 0 or unknown_outcome_quantity > 0 then 1 else 0 end as requires_attention,
            case when record_count > 0 then 'MANUAL' else 'NOT_RECORDED' end as provenance");
        $query = DB::query()->fromSub($states, 'processing')->where(fn (Builder $match) => $match->where('pop_quantity', '>', 0)->orWhere('received_quantity', '>', 0)->orWhere('record_count', '>', 0));
        if (($filters['scope'] ?? null) === 'backlog') {
            $query->where(fn (Builder $work) => $work->where('unconfirmed_quantity', '>', 0)->orWhere('requires_attention', 1));
        }
        foreach (['category', 'processing_status', 'provenance'] as $key) {
            if (! empty($filters[$key])) {
                $query->where($key, $filters[$key]);
            }
        }
        if (! empty($filters['processing_system'])) {
            $query->where($filters['processing_system'] === 'JNE_HYBRID' ? 'has_hybrid' : 'has_orion', 1);
        }
        if (! empty($filters['reconciliation'])) {
            $query->where('reconciliation_required', $filters['reconciliation'] === 'yes' ? 1 : 0);
        }

        return $query;
    }

    /** @return array<string, int|null> */
    public function summary(Builder $query): array
    {
        $summary = (array) (clone $query)->selectRaw('count(distinct id) as pickup_count, count(*) as category_count, coalesce(sum(pop_quantity), 0) as pop_quantity,
            coalesce(sum(received_quantity), 0) as received_quantity, count(case when received_quantity is null then 1 end) as unverified_categories,
            null as confirmed_quantity, coalesce(sum(manual_quantity), 0) as manual_quantity, coalesce(sum(failed_quantity), 0) as failed_quantity,
            coalesce(sum(pending_quantity), 0) as pending_quantity, coalesce(sum(unknown_outcome_quantity), 0) as unknown_outcome_quantity,
            coalesce(sum(unconfirmed_quantity), 0) as unconfirmed_quantity, coalesce(sum(not_recorded_quantity), 0) as not_recorded_quantity,
            coalesce(sum(requires_attention), 0) as attention_count,
            coalesce(sum(case when received_quantity > manual_quantity then received_quantity - manual_quantity else 0 end), 0) as manual_remaining_quantity')->first();

        return [...array_map(intval(...), $summary), 'confirmed_quantity' => null];
    }

    /** @param array<string, mixed> $filters */
    public function pickupExport(Builder $pickups, array $filters): Builder
    {
        $summary = $this->handle($filters)->select('id')->groupBy('id')->selectRaw('sum(pop_quantity) as processing_pop_quantity, sum(received_quantity) as processing_received_quantity,
            null as confirmed_processed_quantity, sum(manual_quantity) as manual_recorded_quantity, sum(failed_quantity) as failed_processing_quantity,
            sum(pending_quantity) as pending_processing_quantity, sum(unconfirmed_quantity) as unknown_processing_quantity, sum(unknown_outcome_quantity) as unknown_outcome_quantity,
            max(has_hybrid) as has_hybrid, max(has_orion) as has_orion, max(last_updated_at) as processing_updated_at,
            max(reconciliation_required) as processing_reconciliation, max(record_count) as processing_record_count');

        return DB::query()->fromSub($pickups, 'pickups')->leftJoinSub($summary, 'processing_summary', 'processing_summary.id', '=', 'pickups.id')->select('pickups.*')
            ->addSelect(['processing_pop_quantity', 'processing_received_quantity', 'confirmed_processed_quantity', 'manual_recorded_quantity', 'failed_processing_quantity', 'pending_processing_quantity', 'unknown_processing_quantity', 'unknown_outcome_quantity', 'has_hybrid', 'has_orion', 'processing_updated_at', 'processing_reconciliation', 'processing_record_count']);
    }

    /** @return array<string, mixed> */
    public function row(\stdClass $record): array
    {
        $data = (array) $record;
        foreach (['id', 'pop_quantity', 'received_quantity', 'confirmed_quantity', 'manual_quantity', 'failed_quantity', 'pending_quantity', 'unknown_outcome_quantity', 'record_count', 'unconfirmed_quantity', 'not_recorded_quantity', 'reconciliation_required', 'requires_attention', 'baseline_changed', 'duplicate_reference', 'has_hybrid', 'has_orion'] as $key) {
            $data[$key] = $data[$key] === null ? null : (int) $data[$key];
        }
        $data['needs_review'] = (bool) $record->needs_review;
        $reasons = [];
        if ($record->received_quantity === null && $record->record_count > 0) {
            $reasons[] = 'Penerimaan Retail belum diverifikasi.';
        }
        if ($record->received_quantity !== null && $record->manual_quantity + $record->failed_quantity + $record->pending_quantity + $record->unknown_outcome_quantity > $record->received_quantity) {
            $reasons[] = 'Total deklarasi melebihi jumlah diterima Retail.';
        }
        if ($record->baseline_changed) {
            $reasons[] = 'Baseline POP atau penerimaan berubah/belum tersedia; tinjau catatan.';
        }
        if ($record->duplicate_reference) {
            $reasons[] = 'Referensi yang sama muncul pada beberapa catatan efektif dalam sistem ini.';
        }
        if ($record->record_count > 1) {
            $reasons[] = 'Dua sistem memiliki deklarasi untuk kategori ini; pastikan alokasi tidak tumpang tindih.';
        }
        $data['reconciliation_reasons'] = $reasons;
        $data['systems'] = array_values(array_filter([$record->has_hybrid ? 'JNE_HYBRID' : null, $record->has_orion ? 'MYORION' : null]));

        return $data;
    }
}
