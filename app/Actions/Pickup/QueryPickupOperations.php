<?php

namespace App\Actions\Pickup;

use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

class QueryPickupOperations
{
    public function __construct(private QueryPickupResults $pickups, private QueryPackageProcessing $processing) {}

    /**
     * Latest quantities for the selected pickup cohort; recording activity remains separately dated.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function handle(array $filters): array
    {
        $period = array_intersect_key($filters, array_flip(['date_from', 'date_to']));
        $identity = array_intersect_key($filters, array_flip(['q', 'reference', 'customer', 'staff', 'customer_id', 'staff_id', 'category', 'processing_system']));
        $receipt = $this->processing->summary($this->processing->handle([...$identity, ...$period]));
        $eligible = $this->pickups->handle($identity)->select('id');
        $recordings = DB::table('pickup_processing_records as r')->whereIn('r.pickup_task_id', $eligible)
            ->leftJoin('pickup_processing_records as previous', function ($join): void {
                $join->on('previous.pickup_task_id', '=', 'r.pickup_task_id')->on('previous.category', '=', 'r.category')->on('previous.system', '=', 'r.system')->whereRaw('previous.revision = r.revision - 1');
            });
        foreach (['category' => 'category', 'processing_system' => 'system'] as $filter => $column) {
            if (! empty($identity[$filter])) {
                $recordings->where('r.'.$column, $identity[$filter]);
            }
        }
        PickupResultPeriod::apply($recordings, 'r.created_at', $period);
        $changes = (array) $recordings->selectRaw('count(*) as recording_count,
            coalesce(sum(cast(r.successful_quantity as signed) - cast(coalesce(previous.successful_quantity, 0) as signed)), 0) as manual_success_change,
            coalesce(sum(cast(r.failed_quantity as signed) - cast(coalesce(previous.failed_quantity, 0) as signed)), 0) as manual_failed_change,
            coalesce(sum(cast(r.unknown_quantity as signed) - cast(coalesce(previous.unknown_quantity, 0) as signed)), 0) as manual_unknown_change')->first();

        $today = PickupResultPeriod::today();
        $olderReceipts = $this->processing->handle([...$identity, 'scope' => 'backlog']);
        $backlog = $this->processing->summary($olderReceipts);
        $olderPop = $this->pickups->handle([...$identity, 'scope' => 'backlog_origin'])->whereNotNull('finalized_at');
        $reconciliation = $this->processing->handle([...$identity, 'scope' => 'backlog'])->where('reconciliation_required', 1)->count();

        return [
            'presets' => PickupResultPeriod::presets(), 'today' => $today->toDateString(),
            'activity' => [
                'scheduled' => $this->pickups->handle([...$identity, ...$period])->count(),
                'visited' => $this->pickups->handle([...$identity, ...$period])->whereIn('period_source', ['PICKUP', 'VISIT_OUTCOME', 'VISIT_STARTED'])->count(),
                'pop_quantity' => $receipt['pop_quantity'],
                'received_quantity' => $receipt['received_quantity'],
                'received_cohort_manual_remaining' => $receipt['manual_remaining_quantity'],
                'confirmed_processed_quantity' => null,
                ...array_map(intval(...), $changes),
            ],
            'backlog' => [
                'unconfirmed_quantity' => $backlog['unconfirmed_quantity'],
                'manual_remaining_quantity' => $backlog['manual_remaining_quantity'],
                'waiting_handover' => (clone $olderPop)->whereNull('session_id')->count(),
                'waiting_verification' => (clone $olderPop)->whereNotNull('session_id')->where(fn (Builder $query) => $query->where('verification_status', 'PENDING')->orWhere('needs_review', 1))->count(),
                'reconciliation_count' => $reconciliation,
            ],
        ];
    }
}
