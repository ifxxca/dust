<?php

namespace App\Actions\Pickup;

use App\Models\Customer;
use App\Models\PickupPendingItem;
use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class QueryPickupAutomation
{
    public function __construct(private QueryPickupResults $pickups) {}

    /** @param array<string, mixed> $filters */
    private function base(array $filters): Builder
    {
        $baseFilters = Arr::except($filters, ['q', 'automation_status', 'delivery_status', 'category', 'reconciliation_group']);
        if (in_array($baseFilters['scope'] ?? '', ['backlog', 'backlog_origin'], true)) {
            throw ValidationException::withMessages(['scope' => 'Backlog tidak tersedia; gunakan pending yang tercatat.']);
        }
        $latestManifest = DB::table('pickup_awb_manifests')->select('pickup_task_id')->selectRaw("coalesce(max(case when status <> 'SUPERSEDED' then id end), max(id)) as manifest_id")->groupBy('pickup_task_id');
        $latestDelivery = DB::table('pickup_awb_deliveries')->select('pickup_awb_manifest_id')->selectRaw('max(id) as delivery_id')->groupBy('pickup_awb_manifest_id');
        $query = DB::query()->fromSub($this->pickups->handle($baseFilters), 'p')
            ->leftJoin('customers as c', 'c.id', '=', 'p.customer_id')
            ->leftJoin('pickup_processing_reconciliations as r', 'r.pickup_task_id', '=', 'p.id')
            ->leftJoinSub($latestManifest, 'latest_manifest', 'latest_manifest.pickup_task_id', '=', 'p.id')
            ->leftJoin('pickup_awb_manifests as m', 'm.id', '=', 'latest_manifest.manifest_id')
            ->leftJoinSub($latestDelivery, 'latest_delivery', 'latest_delivery.pickup_awb_manifest_id', '=', 'm.id')
            ->leftJoin('pickup_awb_deliveries as d', 'd.id', '=', 'latest_delivery.delivery_id')
            ->select('p.*', 'c.customer_code', 'r.categories as automation_categories', 'r.reasons as automation_reasons', 'r.evaluated_at', 'r.last_error', 'r.input_version', 'r.evaluated_input_version', 'm.id as manifest_id', 'm.status as manifest_status', 'm.xlsx_path', 'm.pdf_path')
            ->selectRaw("coalesce(r.status, 'NOT_EVALUATED') as automation_status, coalesce(d.status, case when m.status = 'READY' then 'AWAITING_CONFIGURATION' when m.status = 'FAILED' then 'DOCUMENT_FAILED' when m.status = 'REVIEW' then 'REVIEW' when m.id is not null then 'BUILDING_DOCUMENT' else 'NOT_READY' end) as delivery_status");
        if (! empty($filters['q'])) {
            $term = '%'.$filters['q'].'%';
            $query->where(fn ($search) => $search->where('p.customer_name', 'like', $term)->orWhere('c.customer_code', 'like', $term)->orWhere('p.reference', 'like', $term)->orWhere('p.staff_name', 'like', $term)->orWhere('r.reasons', 'like', $term));
        }
        if (! empty($filters['category'])) {
            $category = $filters['category'];
            $query->where(fn ($present) => $present->where('p.'.$category, '>', 0)->orWhere('r.categories->'.$category.'->confirmed', '>', 0));
        }
        $query = DB::query()->fromSub($query, 'a');
        $query = DB::query()->fromSub($query->select('a.*')->selectRaw("case when automation_status = 'REVIEW' or last_error is not null or delivery_status in ('UNKNOWN','FAILED','DOCUMENT_FAILED','REVIEW') then 'review' when automation_status = 'DONE' then 'done' else 'waiting' end as reconciliation_group"), 'cases');

        return $query;
    }

    /** @param array<string, mixed> $filters
     * @return array<string, mixed>
     */
    public function handle(array $filters): array
    {
        $query = $this->withQuantities(app(QueryCustomerPickupDays::class)->handle($filters));
        $summary = (array) (clone $query)->select([])->selectRaw("count(*) as total, sum(case when reconciliation_group = 'review' then 1 else 0 end) as review, sum(case when reconciliation_group = 'done' then 1 else 0 end) as done, sum(case when reconciliation_group = 'waiting' then 1 else 0 end) as waiting, sum(case when automation_status = 'DONE' and delivery_status not in ('ACCEPTED','DELIVERED') then 1 else 0 end) as unsent")->first();
        $query = $this->filtered($query, $filters);
        $allocation = (array) (clone $query)->select([])->selectRaw("count(*) as total, coalesce(sum(pickup_count),0) as pickup_books,
            sum(case when quantity_status = 'MATCHED' then 1 else 0 end) as matched,
            sum(case when quantity_status = 'SHORTAGE' then 1 else 0 end) as shortage,
            sum(case when quantity_status = 'EXCESS' then 1 else 0 end) as excess,
            sum(case when quantity_status = 'CONFLICT' then 1 else 0 end) as conflict")->first();
        $rows = $query->orderByRaw("case when automation_status = 'REVIEW' then 0 when automation_status <> 'DONE' then 1 else 2 end")
            ->orderByDesc('period_at')->orderByDesc('id')->paginate($filters['per_page'] ?? 10)->withQueryString()->through($this->row(...));

        return ['rows' => $rows, 'summary' => array_map(intval(...), $summary), 'allocation_summary' => array_map(intval(...), $allocation), 'pool_summary' => $this->poolSummary($filters), 'processing' => $this->processing($filters), 'pending_count' => PickupPendingItem::whereIn('status', ['PENDING', 'READY'])->count(), 'generated_at' => now()->toIso8601String(), 'enabled' => (bool) config('pickup.automation.enabled')];
    }

    private function withQuantities(Builder $query): Builder
    {
        $expected = $confirmed = $missing = $excess = $unknown = [];
        foreach (['manual_hybrid', 'cashless_hybrid', 'css_orion'] as $category) {
            $value = "json_extract(automation_categories, '$.$category.expected')";
            $expected[] = $value;
            $unknown[] = "($value is null or json_type($value) = 'NULL')";
            $confirmed[] = "coalesce(json_extract(automation_categories, '$.$category.confirmed'), 0)";
            $missing[] = "coalesce(json_extract(automation_categories, '$.$category.shortfall'), 0)";
            $excess[] = "coalesce(json_extract(automation_categories, '$.$category.excess'), 0)";
        }
        $unknownSql = implode(' or ', $unknown);
        $expectedSql = implode(' + ', $expected);
        $confirmedSql = implode(' + ', $confirmed);
        $missingSql = implode(' + ', $missing);
        $excessSql = implode(' + ', $excess);
        $quantities = DB::query()->fromSub($query, 'quantities')->select('quantities.*')
            ->selectRaw("case when $unknownSql then null else $expectedSql end as expected_quantity, ($confirmedSql) as allocated_quantity")
            ->selectRaw("case when input_version <> evaluated_input_version then 'NOT_EVALUATED' when $unknownSql then 'UNKNOWN'
                when ($missingSql) > 0 and ($excessSql) > 0 then 'CONFLICT' when ($excessSql) > 0 then 'EXCESS'
                when ($missingSql) > 0 then 'SHORTAGE' when automation_status = 'REVIEW' then 'CONFLICT' else 'MATCHED' end as quantity_status");

        return DB::query()->fromSub($quantities, 'quantity_statuses')->select('quantity_statuses.*')->selectRaw('allocated_quantity - expected_quantity as difference');
    }

    /** Global canonical AWBs, independently scoped to the displayed operational dates and category.
     * @param  array<string, mixed>  $filters
     * @return array<string, int|string|null>
     */
    private function poolSummary(array $filters): array
    {
        $from = $filters['date_from'] ?? PickupResultPeriod::today()->toDateString();
        $to = $filters['date_to'] ?? $from;
        $query = DB::table('jne_shipments as awb')->join('jne_report_awbs as source', 'source.id', '=', 'awb.latest_report_awb_id')
            ->where('source.entry_at', '>=', PickupResultPeriod::start($from)->utc())
            ->where('source.entry_at', '<', PickupResultPeriod::start($to)->addDay()->utc())
            ->when(! empty($filters['category']), fn (Builder $rows) => $rows->where('awb.category', $filters['category']));
        $counts = $query->selectRaw('count(*) as total, sum(case when awb.pickup_task_id is not null then 1 else 0 end) as allocated, sum(case when awb.pickup_task_id is null then 1 else 0 end) as unassigned')->first();

        return ['total' => (int) $counts->total, 'allocated' => (int) $counts->allocated, 'unassigned' => (int) $counts->unassigned,
            'date_from' => $from, 'date_to' => $to, 'category' => $filters['category'] ?? null];
    }

    /** @param array<string, mixed> $filters
     * @return array{regular_target: ?int, regular_processed: int, pending_incoming: int, target: ?int, processed: int}
     */
    private function processing(array $filters): array
    {
        $target = 0;
        $unknownTarget = false;
        $days = [];
        foreach ($this->base($filters)->select(['id', 'picked_up_at', 'automation_categories'])->get() as $task) {
            if ($task->picked_up_at !== null) {
                $date = PickupResultPeriod::date(CarbonImmutable::parse($task->picked_up_at, 'UTC'))->toDateString();
                $days[$date][] = (int) $task->id;
            }
            $counts = $task->automation_categories ? json_decode($task->automation_categories, true, 512, JSON_THROW_ON_ERROR) : [];
            if ($counts === []) {
                $unknownTarget = true;
            }
            foreach ($counts as $category) {
                if (isset($category['expected'])) {
                    $target += (int) $category['expected'];
                } else {
                    $unknownTarget = true;
                }
            }
        }
        $regular = 0;
        if ($days !== []) {
            $query = DB::table('jne_shipments as shipment')
                ->join('jne_report_awbs as source', 'source.id', '=', 'shipment.latest_report_awb_id')
                ->join('pickup_tasks as pickup', 'pickup.id', '=', 'shipment.pickup_task_id')
                ->whereColumn('shipment.customer_id', 'pickup.customer_id')
                ->where('shipment.match_status', 'MATCHED')->where('shipment.customer_match_status', 'MATCHED')
                ->where('shipment.category_status', 'MATCHED')->where('shipment.tracking_status', '!=', 'CANCELLED')
                ->where(function (Builder $buckets) use ($days): void {
                    foreach ($days as $date => $ids) {
                        $from = PickupResultPeriod::start($date)->utc();
                        $buckets->orWhere(fn (Builder $bucket) => $bucket->whereIn('shipment.pickup_task_id', $ids)
                            ->where('source.entry_at', '>=', $from)->where('source.entry_at', '<', $from->addDay()));
                    }
                });
            PickupResultPeriod::apply($query, 'source.entry_at', $filters);
            $regular = $query->count();
        }
        $pendingQuery = PickupPendingItem::where('status', 'PROCESSED')->whereHas('shipment', fn ($shipment) => $shipment->where('match_status', 'MATCHED')->where('customer_match_status', 'MATCHED')->where('category_status', 'MATCHED')->where('tracking_status', '!=', 'CANCELLED'))
            ->with(['pickup:id,customer_id', 'pickup.proof:id,pickup_task_id,picked_up_at', 'shipment:id,pickup_task_id,customer_id,latest_report_awb_id,category', 'shipment.latestSource:id,entry_at']);
        foreach (['date_from' => '>=', 'date_to' => '<='] as $key => $operator) {
            if (! empty($filters[$key])) {
                $pendingQuery->whereDate('processing_date', $operator, $filters[$key]);
            }
        }
        if (! empty($filters['q'])) {
            $term = '%'.$filters['q'].'%';
            $pendingQuery->whereHas('pickup', fn ($task) => $task->where('reference', 'like', $term)->orWhere('customer_name_snapshot', 'like', $term)->orWhereIn('customer_id', Customer::where('customer_code', 'like', $term)->select('id')));
        }
        if (! empty($filters['category'])) {
            $pendingQuery->where('category', $filters['category']);
        }
        if (! empty($filters['staff_id'])) {
            $pendingQuery->whereHas('pickup', fn ($task) => $task->where('assigned_staff_id', $filters['staff_id']));
        }
        $incoming = 0;
        foreach ($pendingQuery->lazyById(500) as $pending) {
            $origin = $pending->pickup?->proof?->picked_up_at;
            $entry = $pending->shipment?->latestSource?->entry_at;
            if ($origin && $entry && $pending->shipment->pickup_task_id === $pending->pickup_task_id && $pending->shipment->customer_id === $pending->pickup->customer_id && $pending->category === $pending->shipment->category
                && PickupResultPeriod::date($entry)->greaterThan(PickupResultPeriod::date($origin))
                && PickupResultPeriod::date($entry)->toDateString() === $pending->processing_date?->toDateString()) {
                $incoming++;
            }
        }

        return ['regular_target' => $unknownTarget ? null : $target, 'regular_processed' => $regular, 'pending_incoming' => $incoming, 'target' => $unknownTarget ? null : $target + $incoming, 'processed' => $regular + $incoming];
    }

    /** @return array<string, mixed> */
    public function row(\stdClass $row): array
    {
        $data = (array) $row;
        $data['categories'] = $row->automation_categories ? json_decode($row->automation_categories, true, 512, JSON_THROW_ON_ERROR) : [];
        $data['reasons'] = $row->automation_reasons ? json_decode($row->automation_reasons, true, 512, JSON_THROW_ON_ERROR) : [];
        $data['picked_up_at'] = $row->picked_up_at ? CarbonImmutable::parse($row->picked_up_at, 'UTC')->toIso8601String() : null;
        $data['evaluated_at'] = $row->evaluated_at ? CarbonImmutable::parse($row->evaluated_at, 'UTC')->toIso8601String() : null;
        $deadline = isset($row->validation_started_at) ? CarbonImmutable::parse($row->validation_started_at, 'UTC')->addHours(12) : null;
        $data['closure_due_at'] = $deadline?->toIso8601String();
        $data['closure_overdue'] = $deadline !== null && now()->greaterThanOrEqualTo($deadline) && ($row->finalization_status ?? 'PENDING') === 'PENDING';
        $data['dirty'] = (int) $row->input_version !== (int) $row->evaluated_input_version;
        foreach (['expected_quantity', 'allocated_quantity', 'difference'] as $quantity) {
            if (property_exists($row, $quantity)) {
                $data[$quantity] = $row->{$quantity} === null ? null : (int) $row->{$quantity};
            }
        }
        if (isset($data['pickup_count'])) {
            $data['pickup_count'] = (int) $data['pickup_count'];
        }
        unset($data['automation_categories'], $data['automation_reasons'], $data['xlsx_path'], $data['pdf_path']);

        return $data;
    }

    /** @param array<string, mixed> $filters */
    public function query(array $filters): Builder
    {
        return $this->filtered(app(QueryCustomerPickupDays::class)->handle($filters), $filters)->orderBy('id');
    }

    /** @param array<string, mixed> $filters */
    private function filtered(Builder $query, array $filters): Builder
    {
        foreach (['automation_status', 'delivery_status', 'reconciliation_group'] as $filter) {
            if (! empty($filters[$filter])) {
                $query->where($filter, $filters[$filter]);
            }
        }

        return $query;
    }
}
