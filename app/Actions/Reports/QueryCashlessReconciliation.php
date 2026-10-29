<?php

namespace App\Actions\Reports;

use App\Models\PickupTask;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

class QueryCashlessReconciliation
{
    /**
     * @return array<string, int|string|bool|null>
     */
    public function handle(PickupTask $task): array
    {
        return $this->forTasks(new Collection([$task]))[$task->id];
    }

    /**
     * @param  Collection<int, PickupTask>  $tasks
     * @return array<int, array<string, int|string|bool|null>>
     */
    public function forTasks(Collection $tasks): array
    {
        $tasks->loadMissing('proof.revisions');
        $categoryRequired = ResolveJneCategories::enabled() ? " and s.category_status = 'MATCHED' and s.category = 'cashless_hybrid'" : '';
        $categoryConflict = ResolveJneCategories::enabled() ? " or s.category_status = 'CONFLICT'" : '';
        $windows = app(QueryJneCollectionWindows::class)->handle($tasks);
        $rows = DB::table('pickup_cashless_awbs as e')->leftJoin('jne_shipments as s', 's.awb', '=', 'e.awb')
            ->whereIn('e.pickup_task_id', $tasks->modelKeys())->whereNotNull('e.awb')->select('e.pickup_task_id')
            ->selectRaw("count(*) as identified, count(s.id) as collected,
                sum(case when s.customer_match_status = 'MATCHED' and s.match_status = 'MATCHED' and s.customer_id = e.customer_id and s.pickup_task_id = e.pickup_task_id {$categoryRequired} then 1 else 0 end) as confirmed,
                sum(case when s.customer_match_status = 'CANDIDATE' then 1 else 0 end) as candidates,
                sum(case when s.customer_match_status in ('CONFLICT', 'AMBIGUOUS') or s.match_status in ('CONFLICT', 'AMBIGUOUS') {$categoryConflict} then 1 else 0 end) as conflicts")
            ->groupBy('e.pickup_task_id')->get()->keyBy('pickup_task_id');
        $closed = DB::table('handover_items as i')->join('handover_sessions as h', 'h.id', '=', 'i.handover_session_id')
            ->whereIn('i.pickup_task_id', $tasks->modelKeys())->where(fn ($query) => $query->whereNotNull('h.sertim_closed_at')->orWhere('h.status', 'CLOSED'))
            ->pluck('i.pickup_task_id')->all();
        $result = [];
        foreach ($tasks as $task) {
            $row = $rows->get($task->id);
            $expected = $task->proof?->finalized_at ? (int) $task->proof->effectiveValues()['cashless_hybrid'] : null;
            $identified = (int) ($row->identified ?? 0);
            $collected = (int) ($row->collected ?? 0);
            $confirmed = (int) ($row->confirmed ?? 0);
            $candidates = (int) ($row->candidates ?? 0);
            $conflicts = (int) ($row->conflicts ?? 0);
            $result[$task->id] = ['category' => 'cashless_hybrid', 'expected_quantity' => $expected, 'identified_awbs' => $identified,
                'collected_awbs' => $collected, 'confirmed_awbs' => $confirmed, 'candidate_awbs' => $candidates,
                'unmatched_awbs' => max(0, $collected - $confirmed - $candidates - $conflicts),
                'awaiting_source_awbs' => $identified - $collected, 'conflicts' => $conflicts,
                'shortfall_quantity' => $expected === null ? null : max(0, $expected - $confirmed),
                'excess_quantity' => $expected === null ? null : max(0, $confirmed - $expected),
                'missing_quantity' => $windows[$task->id]['complete'] && $conflicts === 0 && $candidates === 0 && $identified === $confirmed && $expected !== null ? max(0, $expected - $confirmed) : null,
                'collection_complete' => $windows[$task->id]['complete'], 'collection_status' => $windows[$task->id]['status'], 'collection_version' => $windows[$task->id]['version'],
                'window' => in_array($task->id, $closed, true) ? 'CLOSED' : 'OPEN'];
        }

        return $result;
    }
}
