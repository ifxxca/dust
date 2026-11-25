<?php

namespace App\Actions\Pickup;

use App\Models\Customer;
use App\Models\JneShipment;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Query\Builder;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;

class QueryCustomerPortal
{
    /** @param array<string, mixed> $filters
     * @return array<string, mixed>
     */
    public function filters(array $filters): array
    {
        $today = CarbonImmutable::today('Asia/Jakarta');
        $from = $filters['date_from'] ?? $today->startOfMonth()->toDateString();
        $to = $filters['date_to'] ?? max($from, $today->toDateString());
        abort_if($to < $from, 422, 'Tanggal akhir harus sesudah tanggal mulai.');

        return ['date_from' => $from, 'date_to' => $to, 'q' => $filters['q'] ?? '', 'status' => $filters['status'] ?? '', 'category' => $filters['category'] ?? ''];
    }

    public function shipments(Customer $customer): Builder
    {
        return DB::table('jne_shipments as s')->join('jne_report_awbs as a', 'a.id', '=', 's.latest_report_awb_id')
            ->leftJoin('pickup_tasks as p', function ($join) use ($customer): void {
                $join->on('p.id', '=', 's.pickup_task_id')->where('p.customer_id', $customer->id)->where('s.match_status', 'MATCHED');
            })->leftJoin('pickup_records as r', function ($join): void {
                $join->on('r.pickup_task_id', '=', 'p.id')->whereNotNull('r.finalized_at');
            })
            ->where('s.customer_id', $customer->id)->where('s.customer_match_status', 'MATCHED');
    }

    public function amountSql(): string
    {
        $cod = DB::getDriverName() === 'sqlite' ? "json_extract(a.raw_data, '$.COD_FLAG')" : "JSON_UNQUOTE(JSON_EXTRACT(a.raw_data, '$.COD_FLAG'))";

        return "CASE WHEN (s.category_status = 'MATCHED' AND s.category = 'cashless_hybrid') OR UPPER(TRIM($cod)) = 'Y' THEN 0 WHEN s.category_status = 'MATCHED' AND s.category IN ('manual_hybrid','css_orion') AND UPPER(TRIM($cod)) = 'N' THEN a.amount_cents ELSE NULL END";
    }

    /** @param array<string, mixed> $filters */
    private function period(Builder $query, string $column, array $filters): Builder
    {
        return $query->where($column, '>=', CarbonImmutable::parse($filters['date_from'], 'Asia/Jakarta')->utc()->format('Y-m-d H:i:s'))
            ->where($column, '<', CarbonImmutable::parse($filters['date_to'], 'Asia/Jakarta')->addDay()->utc()->format('Y-m-d H:i:s'));
    }

    /** @param array<string, mixed> $filters
     * @return array<string, mixed>
     */
    public function summary(Customer $customer, array $filters): array
    {
        $query = $this->period($this->shipments($customer), 'r.picked_up_at', $filters);
        $row = $query->selectRaw("COUNT(*) AS total,
            SUM(CASE WHEN s.tracking_status='DELIVERED' THEN 1 ELSE 0 END) AS delivered,
            SUM(CASE WHEN s.tracking_status='IN_TRANSIT' THEN 1 ELSE 0 END) AS active,
            MAX(s.last_observed_at) AS updated_at")->first();
        $pickups = $this->period(DB::table('pickup_tasks as p')->join('pickup_records as r', 'r.pickup_task_id', '=', 'p.id')->where('p.customer_id', $customer->id)->whereNotNull('r.finalized_at'), 'r.picked_up_at', $filters)->count();

        $statuses = $this->period($this->shipments($customer), 'r.picked_up_at', $filters)
            ->groupBy('s.tracking_status')->selectRaw('s.tracking_status, COUNT(*) AS total')->pluck('total', 'tracking_status');
        $cod = DB::getDriverName() === 'sqlite' ? "json_extract(a.raw_data, '$.COD_FLAG')" : "JSON_UNQUOTE(JSON_EXTRACT(a.raw_data, '$.COD_FLAG'))";
        $categories = $this->period($this->shipments($customer), 'r.picked_up_at', $filters)
            ->where('s.category_status', 'MATCHED')->selectRaw("SUM(CASE WHEN s.category IN ('manual_hybrid', 'css_orion') THEN 1 ELSE 0 END) AS manual,
                SUM(CASE WHEN s.category = 'cashless_hybrid' THEN 1 ELSE 0 END) AS cashless,
                SUM(CASE WHEN s.category IN ('manual_hybrid', 'css_orion') AND UPPER(TRIM($cod)) = 'Y' THEN 1 ELSE 0 END) AS cod,
                SUM(CASE WHEN s.category IN ('manual_hybrid', 'css_orion') AND UPPER(TRIM($cod)) = 'N' THEN 1 ELSE 0 END) AS non_cod")->first();
        $recent = $this->pickupQuery($customer, $filters)->limit(5)->get();
        $amounts = $this->pickupAmounts($customer, $recent->map(fn (PickupTask $task): int => $task->id)->values()->all());

        return ['total' => (int) $row->total, 'pickups' => $pickups, 'delivered' => (int) $row->delivered, 'active' => (int) $row->active,
            'by_status' => collect(JneShipment::STATUSES)->map(fn (string $status): array => ['status' => $status, 'total' => (int) ($statuses[$status] ?? 0)])->all(),
            'groups' => ['manual' => (int) $categories->manual, 'cashless' => (int) $categories->cashless, 'cod' => (int) $categories->cod, 'non_cod' => (int) $categories->non_cod,
                'cod_unknown' => (int) $categories->manual - (int) $categories->cod - (int) $categories->non_cod],
            'recent_pickups' => $recent->map(fn (PickupTask $task): array => $this->pickupRow($task, $amounts[$task->id] ?? null))->all(),
            'updated_at' => $row->updated_at];
    }

    /** @param array<string, mixed> $filters
     * @return LengthAwarePaginator<int, object>
     */
    public function monitoring(Customer $customer, array $filters, ?int $taskId = null): LengthAwarePaginator
    {
        $query = $this->shipments($customer);
        if ($taskId !== null) {
            $query->where('s.pickup_task_id', $taskId)->where('s.match_status', 'MATCHED');
        } else {
            $this->period($query, 'r.picked_up_at', $filters);
        }
        if ($filters['q'] !== '') {
            $search = '%'.addcslashes($filters['q'], '%_\\').'%';
            $query->where(fn (Builder $q) => $q->where('s.awb', 'like', $search)->orWhere('a.shipper_name', 'like', $search)->orWhere('a.consignee_name', 'like', $search));
        }
        foreach (['status' => 's.tracking_status', 'category' => 's.category'] as $filter => $column) {
            if ($filters[$filter] !== '') {
                $query->where($column, $filters[$filter]);
            }
        }

        return $query->select(['s.id', 's.awb', 's.category', 's.tracking_status', 's.last_observed_at', 'a.shipper_name', 'a.consignee_name', 'a.entry_at', 'r.picked_up_at', 'p.reference as pickup_reference', 'p.id as pickup_id'])
            ->selectRaw($this->amountSql().' AS amount_cents')->orderByDesc('r.picked_up_at')->orderByDesc('s.id')->paginate(20)->withQueryString();
    }

    /** @param array<string, mixed> $filters
     * @return LengthAwarePaginator<int, mixed>
     */
    public function history(Customer $customer, array $filters): LengthAwarePaginator
    {
        $tasks = $this->pickupQuery($customer, $filters)->paginate(20)->withQueryString();
        $amounts = $this->pickupAmounts($customer, $tasks->getCollection()->map(fn (PickupTask $task): int => $task->id)->values()->all());

        return $tasks->through(fn (PickupTask $task): array => $this->pickupRow($task, $amounts[$task->id] ?? null));
    }

    /** @param array<string, mixed> $filters
     * @return EloquentBuilder<PickupTask>
     */
    private function pickupQuery(Customer $customer, array $filters): EloquentBuilder
    {
        return PickupTask::where('customer_id', $customer->id)->whereHas('proof', function ($proof) use ($filters): void {
            $proof->whereNotNull('finalized_at')->where('picked_up_at', '>=', CarbonImmutable::parse($filters['date_from'], 'Asia/Jakarta')->utc())
                ->where('picked_up_at', '<', CarbonImmutable::parse($filters['date_to'], 'Asia/Jakarta')->addDay()->utc());
        })->when($filters['q'] !== '', fn ($q) => $q->where('reference', 'like', '%'.addcslashes($filters['q'], '%_\\').'%'))
            ->with(['assignedStaff:id,name', 'proof.revisions', 'handoverItem.revisions', 'processingReconciliation'])
            ->orderByDesc(PickupRecord::select('picked_up_at')->whereColumn('pickup_records.pickup_task_id', 'pickup_tasks.id')->limit(1))->orderByDesc('id');
    }

    /** @return LengthAwarePaginator<int, object> */
    public function shipmentHistory(JneShipment $shipment): LengthAwarePaginator
    {
        return DB::table('jne_shipment_observations as o')->join('jne_report_awbs as a', 'a.id', '=', 'o.jne_report_awb_id')
            ->where('o.jne_shipment_id', $shipment->id)->where('a.awb', $shipment->awb)
            ->groupBy('o.status_signature', 'o.tracking_status', 'a.status_web', 'a.status_pod')
            ->select(['o.tracking_status as status', 'a.status_web as description', 'a.status_pod as pod'])
            ->selectRaw('MAX(a.source_status_at) AS status_at, MAX(o.observed_at) AS observed_at')
            ->orderByDesc('observed_at')->orderBy('o.status_signature')->paginate(20)->withQueryString();
    }

    /** @param list<int> $ids
     * @return array<int, object>
     */
    public function pickupAmounts(Customer $customer, array $ids): array
    {
        $amount = $this->amountSql();

        return $this->shipments($customer)->whereIn('s.pickup_task_id', $ids)->where('s.match_status', 'MATCHED')
            ->groupBy('s.pickup_task_id')->selectRaw("s.pickup_task_id, COUNT(*) AS awbs, COUNT($amount) AS amount_known, SUM($amount) AS amount_cents")
            ->get()->keyBy('pickup_task_id')->all();
    }

    /** @return array<string, mixed> */
    public function pickupRow(PickupTask $task, ?object $amount): array
    {
        $proof = $task->proof;
        $counts = $proof?->effectiveValues() ?? [];
        $total = array_sum(array_intersect_key($counts, array_flip(['manual_hybrid', 'cashless_hybrid', 'css_orion'])));
        $handover = $task->handoverItem?->effectiveValues();

        return ['id' => $task->id, 'reference' => $task->reference, 'picked_up_at' => $proof?->picked_up_at?->toIso8601String(), 'staff' => $task->assignedStaff?->name,
            'manual' => (int) ($counts['manual_hybrid'] ?? 0), 'cashless' => (int) ($counts['cashless_hybrid'] ?? 0), 'orion' => (int) ($counts['css_orion'] ?? 0), 'total' => $total,
            'awb_count' => (int) ($amount?->awbs ?? 0), 'amount_cents' => $amount?->amount_cents === null ? null : (int) $amount->amount_cents,
            'amount_complete' => $proof?->finalized_at !== null && (int) ($amount?->awbs ?? 0) === $total && (int) ($amount?->amount_known ?? 0) === $total,
            'handover_status' => $handover['status'] ?? 'PENDING', 'reconciliation_status' => $task->processingReconciliation?->locked_at ? 'Selesai' : 'Dalam proses'];
    }
}
