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
        $query = app(QueryCustomerPickupDays::class)->handle($filters);
        $summary = (array) (clone $query)->selectRaw("count(*) as total, sum(case when reconciliation_group = 'review' then 1 else 0 end) as review, sum(case when reconciliation_group = 'done' then 1 else 0 end) as done, sum(case when reconciliation_group = 'waiting' then 1 else 0 end) as waiting, sum(case when automation_status = 'DONE' and delivery_status not in ('ACCEPTED','DELIVERED') then 1 else 0 end) as unsent")->first();
        $query = $this->filtered($query, $filters);
        $rows = $query->orderByRaw("case when automation_status = 'REVIEW' then 0 when automation_status <> 'DONE' then 1 else 2 end")
            ->orderByDesc('period_at')->orderByDesc('id')->paginate($filters['per_page'] ?? 10)->withQueryString()->through($this->row(...));

        return ['rows' => $rows, 'summary' => array_map(intval(...), $summary), 'processing' => $this->processing($filters), 'pending_count' => PickupPendingItem::whereIn('status', ['PENDING', 'READY'])->count(), 'generated_at' => now()->toIso8601String(), 'enabled' => (bool) config('pickup.automation.enabled')];
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
        $data['dirty'] = (int) $row->input_version !== (int) $row->evaluated_input_version;
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
