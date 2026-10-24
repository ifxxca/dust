<?php

namespace App\Actions\Pickup;

use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

class QueryPickupResults
{
    /** @param array<string, mixed> $filters */
    public function handle(array $filters = []): Builder
    {
        $base = DB::table('pickup_tasks as t')
            ->leftJoin('customers as customer', 'customer.id', '=', 't.customer_id')
            ->leftJoin('users as staff', 'staff.id', '=', 't.assigned_staff_id')
            ->leftJoin('pickup_records as p', 'p.pickup_task_id', '=', 't.id')
            ->leftJoin('pickup_record_revisions as pr', function ($join) {
                $join->on('pr.pickup_record_id', '=', 'p.id')->where('pr.revision', '=', DB::raw('(select max(revision) from pickup_record_revisions where pickup_record_id = p.id)'));
            })
            ->leftJoin('pickup_visits as v', function ($join) {
                $join->on('v.pickup_task_id', '=', 't.id')->where('v.id', '=', DB::raw('(select max(id) from pickup_visits where pickup_task_id = t.id)'));
            })
            ->leftJoin('handover_items as i', 'i.pickup_task_id', '=', 't.id')
            ->leftJoin('handover_sessions as s', 's.id', '=', 'i.handover_session_id')
            ->leftJoin('handover_item_revisions as ir', function ($join) {
                $join->on('ir.handover_item_id', '=', 'i.id')->where('ir.revision', '=', DB::raw('(select max(revision) from handover_item_revisions where handover_item_id = i.id)'));
            })
            ->select(['t.id', 't.reference', 't.customer_id', 't.customer_name_snapshot as customer_name', 't.assigned_staff_id as staff_id', 'staff.name as staff_name', 't.scheduled_at', 't.status as task_status', 't.execution_started_at', 'v.outcome as visit_outcome', 'v.started_at as visit_started_at', 'v.recorded_at as visit_recorded_at', 'p.id as proof_id', 'p.finalized_at', 'p.picked_up_at', 'i.id as item_id', 's.id as session_id', 's.reference as session_reference', 's.status as handover_status', 's.closed_at'])
            ->selectRaw('coalesce(pr.revision, 0) as pickup_revision')
            ->addSelect('customer.name as customer_label')
            ->selectRaw("coalesce(ir.`values` ->> '$.status', i.status) as verification_status")
            ->selectRaw("coalesce(ir.`values` ->> '$.verified_at', i.verified_at) as verified_at")
            ->selectRaw("coalesce(ir.`values` ->> '$.verified_by', i.verified_by) as verified_by")
            ->selectRaw('coalesce(ir.pickup_revision, i.verified_pickup_revision) as verified_pickup_revision')
            ->selectRaw('case when i.status <> ? then coalesce(ir.revision, 0) else null end as handover_revision', ['PENDING'])
            ->selectRaw("case when i.status <> 'PENDING' and coalesce(ir.pickup_revision, i.verified_pickup_revision, 0) <> coalesce(pr.revision, 0) then 1 else 0 end as needs_review");
        foreach (['manual_hybrid', 'cashless_hybrid', 'css_orion'] as $category) {
            $base->selectRaw("coalesce(pr.`values` ->> '$.$category', p.$category, 0) as $category");
            $base->selectRaw("coalesce(ir.`values` ->> '$.$category', i.$category) as received_$category");
        }
        $originColumns = ['p.picked_up_at', 'v.recorded_at', 'v.started_at', 't.execution_started_at', 't.scheduled_at'];
        $scope = $filters['scope'] ?? 'daily';
        $period = match ($scope) {
            'backlog', 'backlog_origin' => ['date_to' => PickupResultPeriod::today()->subDay()->toDateString()],
            'outstanding' => ['date_to' => PickupResultPeriod::today()->toDateString()],
            default => $filters,
        };
        // Separate origins let each timestamp range use its index before loading revisions and sessions.
        if (! empty($period['date_from']) || ! empty($period['date_to'])) {
            $origins = null;
            foreach ($originColumns as $index => $column) {
                $origin = $index === 0
                    ? DB::table('pickup_records as p')->select('p.pickup_task_id as id')
                    : DB::table('pickup_tasks as t')->select('t.id')
                        ->leftJoin('pickup_records as p', 'p.pickup_task_id', '=', 't.id')
                        ->leftJoin('pickup_visits as v', function ($join): void {
                            $join->on('v.pickup_task_id', '=', 't.id')->where('v.id', '=', DB::raw('(select max(id) from pickup_visits where pickup_task_id = t.id)'));
                        });
                foreach (array_slice($originColumns, 0, $index) as $previous) {
                    $origin->whereNull($previous);
                }
                if ($column === 't.scheduled_at') {
                    $origin->whereIn('t.status', ['SCHEDULED', 'ASSIGNED', 'CANCELLED']);
                }
                PickupResultPeriod::apply($origin, $column, $period);
                $origins = $origins ? $origins->unionAll($origin) : $origin;
            }
            $base->whereIn('t.id', $origins);
        }
        $base->selectRaw("coalesce(p.picked_up_at, v.recorded_at, v.started_at, t.execution_started_at, case when t.status in ('SCHEDULED', 'ASSIGNED', 'CANCELLED') then t.scheduled_at else null end) as period_at")
            ->selectRaw("case when p.picked_up_at is not null then 'PICKUP' when v.recorded_at is not null then 'VISIT_OUTCOME' when v.started_at is not null or t.execution_started_at is not null then 'VISIT_STARTED' when t.status in ('SCHEDULED', 'ASSIGNED', 'CANCELLED') then 'SCHEDULE' else 'UNAVAILABLE' end as period_source")
            ->addSelect(['i.verified_at as received_at', 'i.created_at as handed_over_at']);
        $query = DB::query()->fromSub($base, 'results');
        if (($filters['scope'] ?? null) === 'backlog') {
            $query->whereRaw('('.implode(' or ', $this->queueConditions()).')');
        }
        foreach (['customer_id', 'staff_id'] as $key) {
            if (! empty($filters[$key])) {
                $query->where($key, $filters[$key]);
            }
        }
        foreach (['reference', 'customer', 'staff', 'q'] as $key) {
            if (! empty($filters[$key])) {
                $term = '%'.addcslashes($filters[$key], '%_\\').'%';
                $columns = match ($key) {
                    'customer' => ['customer_name'], 'staff' => ['staff_name'], 'reference' => ['reference'],
                    default => ['reference', 'customer_name', 'staff_name'],
                };
                $query->where(function (Builder $match) use ($columns, $term): void {
                    foreach ($columns as $column) {
                        $match->orWhere($column, 'like', $term);
                    }
                });
            }
        }
        if (! empty($filters['visit_outcome'])) {
            match ($filters['visit_outcome']) {
                'not_visited' => $query->where('period_source', 'SCHEDULE'),
                'in_progress' => $query->whereNotNull('visit_started_at')->whereNull('visit_outcome'),
                'visited' => $query->whereIn('period_source', ['PICKUP', 'VISIT_OUTCOME', 'VISIT_STARTED']),
                default => $query->where('visit_outcome', $filters['visit_outcome']),
            };
        }
        if (! empty($filters['pop_status'])) {
            $filters['pop_status'] === 'final' ? $query->whereNotNull('finalized_at') : $query->whereNull('finalized_at');
        }
        if (! empty($filters['handover_status'])) {
            match ($filters['handover_status']) {
                'none' => $query->whereNull('session_id'),
                'waiting' => $query->whereNotNull('finalized_at')->whereNull('session_id'),
                default => $query->where('handover_status', $filters['handover_status']),
            };
        }
        if (! empty($filters['verification_status'])) {
            match ($filters['verification_status']) {
                'verified' => $query->whereIn('verification_status', ['VERIFIED', 'DISCREPANCY'])->where('needs_review', 0),
                'pending' => $query->whereNotNull('session_id')->where('verification_status', 'PENDING'),
                'review' => $query->where('needs_review', 1),
                'none' => $query->whereNull('session_id'),
                default => $query,
            };
        }
        if (! empty($filters['discrepancy_status'])) {
            $filters['discrepancy_status'] === 'yes'
                ? $query->where('verification_status', 'DISCREPANCY')
                : $query->where(fn (Builder $match) => $match->whereNull('verification_status')->orWhere('verification_status', '!=', 'DISCREPANCY'));
        }
        if (! empty($filters['pickup_queue'])) {
            $query->whereRaw($this->queueConditions()[$filters['pickup_queue']]);
        }

        return $query;
    }

    /** @return array{not_visited: literal-string, incomplete: literal-string, waiting_handover: literal-string, unverified: literal-string, discrepancy: literal-string} */
    private function queueConditions(): array
    {
        return [
            'not_visited' => "period_source = 'SCHEDULE' and task_status in ('SCHEDULED', 'ASSIGNED')",
            'incomplete' => "finalized_at is null and task_status not in ('NO_PACKAGES', 'CANCELLED')",
            'waiting_handover' => 'finalized_at is not null and session_id is null',
            'unverified' => "session_id is not null and (verification_status = 'PENDING' or needs_review = 1)",
            'discrepancy' => "verification_status = 'DISCREPANCY'",
        ];
    }

    /**
     * Current work queues due through today, independent of the selected activity period.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, int>
     */
    public function queues(array $filters): array
    {
        $identity = array_intersect_key($filters, array_flip(['q', 'reference', 'customer', 'staff', 'customer_id', 'staff_id']));
        $query = $this->handle([...$identity, 'scope' => 'outstanding']);
        foreach ($this->queueConditions() as $key => $condition) {
            $query->selectRaw("count(case when $condition then 1 end) as $key");
        }

        return array_map(intval(...), (array) $query->first());
    }

    /** @return array<string, int> */
    public function summary(Builder $query): array
    {
        $row = (clone $query)->selectRaw($this->aggregateSql())->first();

        return array_map(intval(...), (array) $row);
    }

    /** @return literal-string */
    public function aggregateSql(): string
    {
        return "count(*) as total,
            count(case when finalized_at is not null then 1 end) as pop_final,
            count(case when finalized_at is null and task_status not in ('NO_PACKAGES', 'CANCELLED') then 1 end) as incomplete,
            count(case when finalized_at is not null and session_id is null then 1 end) as waiting_handover,
            count(case when session_id is not null and (verification_status = 'PENDING' or needs_review = 1) then 1 end) as unverified,
            count(case when verification_status in ('VERIFIED', 'DISCREPANCY') and needs_review = 0 then 1 end) as verified,
            count(case when verification_status = 'DISCREPANCY' then 1 end) as discrepancy,
            count(case when handover_status = 'CLOSED' then 1 end) as closed";
    }

    /** @return array<string, mixed> */
    public function row(\stdClass $row): array
    {
        $data = (array) $row;
        foreach (['scheduled_at', 'period_at', 'received_at', 'handed_over_at', 'execution_started_at', 'visit_started_at', 'visit_recorded_at', 'finalized_at', 'picked_up_at', 'closed_at', 'verified_at'] as $key) {
            $data[$key] = $data[$key] ? CarbonImmutable::parse($data[$key], 'UTC')->toIso8601String() : null;
        }
        $date = $data['period_at'] ? PickupResultPeriod::date(CarbonImmutable::parse($data['period_at'])) : null;
        $data['operational_date'] = $date?->toDateString();
        $handoverDate = $data['handed_over_at'] ? PickupResultPeriod::date(CarbonImmutable::parse($data['handed_over_at'])) : null;
        $data['subsequent_handover'] = $date !== null && $handoverDate !== null && $handoverDate->greaterThan($date);
        $data['total_packages'] = (int) $row->manual_hybrid + (int) $row->cashless_hybrid + (int) $row->css_orion;
        $data['needs_review'] = (bool) $row->needs_review;
        $data['next_action'] = match (true) {
            $data['needs_review'] => 'Tinjau ulang verifikasi setelah koreksi POP',
            $row->verification_status === 'DISCREPANCY' => 'Investigasi selisih fisik dan catat koreksi bila diperlukan',
            $row->handover_status === 'CLOSED' => 'Handover ditutup',
            $row->verification_status === 'VERIFIED' => 'Tinjau kesiapan penutupan sesi',
            $row->session_id !== null => 'Verifikasi penerimaan fisik',
            $row->finalized_at !== null => 'Masukkan pickup ke sesi handover',
            $row->task_status === 'NO_PACKAGES' => 'Kunjungan selesai tanpa paket',
            $row->task_status === 'CANCELLED' => 'Pickup dibatalkan',
            $row->visit_outcome === 'COLLECTED' => 'Finalisasi bukti POP',
            $row->staff_id === null => 'Tugaskan petugas pickup',
            default => 'Selesaikan kunjungan dan catat hasil',
        };

        return $data;
    }
}
