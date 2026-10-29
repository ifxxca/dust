<?php

namespace App\Actions\Pickup;

use Illuminate\Database\Query\Builder;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;

class QueryCustomerPickupDays
{
    public function __construct(private QueryPickupResults $pickups) {}

    /** UTC timestamps plus two hours align the date with 05.00 WIB.
     * @param  literal-string  $column
     * @return literal-string
     */
    public static function daySql(string $column): string
    {
        return DB::getDriverName() === 'sqlite' ? "date($column, '+2 hours')" : "date(date_add($column, interval 2 hour))";
    }

    /** @param array<string, mixed> $filters */
    public function handle(array $filters): Builder
    {
        $operational = Arr::except($filters, ['q', 'automation_status', 'delivery_status', 'category', 'reconciliation_group', 'selected_ids', 'quick_pickup']);
        $matching = DB::query()->fromSub($this->pickups->handle($operational), 'match_pickup')->leftJoin('customers as match_customer', 'match_customer.id', '=', 'match_pickup.customer_id')->select('match_pickup.id');
        if (! empty($filters['q'])) {
            $term = '%'.addcslashes($filters['q'], '%_\\').'%';
            $matching->where(fn ($query) => $query->where('match_pickup.customer_name', 'like', $term)->orWhere('match_customer.name', 'like', $term)
                ->orWhere('match_customer.customer_code', 'like', $term)->orWhere('match_pickup.reference', 'like', $term)->orWhere('match_pickup.staff_name', 'like', $term));
        }
        $full = $this->pickups->handle(Arr::except($operational, ['staff_id', 'staff', 'reference', 'customer', 'pop_status', 'verification_status', 'handover_status', 'visit_outcome', 'pickup_queue', 'discrepancy_status']));
        $day = self::daySql('p.period_at');
        $buckets = DB::query()->fromSub($full, 'p')->leftJoinSub($matching, 'matching', 'matching.id', '=', 'p.id')
            ->leftJoin('pickup_processing_reconciliations as r', 'r.pickup_task_id', '=', 'p.id')
            ->whereNotIn('p.task_status', ['CANCELLED', 'NO_PACKAGES'])
            ->select('p.customer_id')->selectRaw("$day as business_date, min(p.id) as id, min(case when p.finalized_at is not null then p.id end) as queue_task_id, min(p.reference) as reference, min(p.customer_name) as customer_name, count(*) as pickup_count, min(p.staff_name) as staff_name, min(p.picked_up_at) as picked_up_at, min(p.period_at) as period_at, min(p.finalized_at) as finalized_at")
            ->selectRaw('sum(case when r.input_version <> r.evaluated_input_version then 1 else 0 end) as dirty_count, max(r.last_error) as last_error, max(case when matching.id is not null then 1 else 0 end) as matches_filter')
            ->selectRaw('sum(case when r.customer_reconciliation_id is not null then 1 else 0 end) as compiled_count, min(r.customer_reconciliation_id) as min_group_id, max(r.customer_reconciliation_id) as max_group_id')
            ->groupBy('p.customer_id')->groupByRaw($day);
        foreach (['manual_hybrid', 'cashless_hybrid', 'css_orion'] as $category) {
            $buckets->selectRaw("sum(p.$category) as $category");
        }
        $latestManifest = DB::table('pickup_awb_manifests')->select('pickup_task_id')->selectRaw("coalesce(max(case when status <> 'SUPERSEDED' then id end), max(id)) as manifest_id")->groupBy('pickup_task_id');
        $latestDelivery = DB::table('pickup_awb_deliveries')->select('pickup_awb_manifest_id')->selectRaw('max(id) as delivery_id')->groupBy('pickup_awb_manifest_id');
        $query = DB::query()->fromSub($buckets, 'b')->join('customers as c', 'c.id', '=', 'b.customer_id')
            ->leftJoin('pickup_customer_reconciliations as g', fn ($join) => $join->on('g.customer_id', '=', 'b.customer_id')->on('g.business_date', '=', 'b.business_date'))
            ->leftJoinSub($latestManifest, 'lm', 'lm.pickup_task_id', '=', 'b.id')->leftJoin('pickup_awb_manifests as m', 'm.id', '=', 'lm.manifest_id')
            ->leftJoinSub($latestDelivery, 'ld', 'ld.pickup_awb_manifest_id', '=', 'm.id')->leftJoin('pickup_awb_deliveries as d', 'd.id', '=', 'ld.delivery_id')
            ->where('b.matches_filter', 1)
            ->select('b.*', 'c.customer_code', 'g.id as customer_reconciliation_id', 'g.categories as automation_categories', 'g.reasons as automation_reasons', 'g.evaluated_at', 'm.id as manifest_id', 'm.status as manifest_status')
            ->selectRaw("case when g.id is null or g.pickup_count <> b.pickup_count or b.compiled_count <> b.pickup_count or b.min_group_id <> g.id or b.max_group_id <> g.id or b.dirty_count > 0 then 'NOT_EVALUATED' else g.status end as automation_status")
            ->selectRaw('case when g.id is null or g.pickup_count <> b.pickup_count or b.compiled_count <> b.pickup_count or b.min_group_id <> g.id or b.max_group_id <> g.id or b.dirty_count > 0 then 1 else 0 end as input_version, 0 as evaluated_input_version')
            ->selectRaw("coalesce(d.status, case when m.status = 'READY' then 'AWAITING_CONFIGURATION' when m.status = 'FAILED' then 'DOCUMENT_FAILED' when m.status = 'REVIEW' then 'REVIEW' when m.id is not null then 'BUILDING_DOCUMENT' else 'NOT_READY' end) as delivery_status");
        if (! empty($filters['category'])) {
            $category = $filters['category'];
            $query->where(fn ($present) => $present->where('b.'.$category, '>', 0)->orWhere('g.categories->'.$category.'->confirmed', '>', 0));
        }
        $query = DB::query()->fromSub($query, 'compiled');

        return DB::query()->fromSub($query->select('compiled.*')->selectRaw("case when automation_status = 'REVIEW' or last_error is not null or delivery_status in ('UNKNOWN','FAILED','DOCUMENT_FAILED','REVIEW') then 'review' when automation_status = 'DONE' then 'done' else 'waiting' end as reconciliation_group"), 'customer_days');
    }
}
