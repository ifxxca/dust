<?php

namespace App\Actions\Reports;

use App\Models\PickupTask;
use Illuminate\Support\Facades\DB;

class QueryCashlessReconciliation
{
    /**
     * @return array<string, int|string|bool|null>
     */
    public function handle(PickupTask $task): array
    {
        $task->loadMissing('proof.revisions');
        $expected = $task->proof?->finalized_at ? (int) $task->proof->effectiveValues()['cashless_hybrid'] : null;
        $row = DB::table('pickup_cashless_awbs as e')->leftJoin('jne_shipments as s', 's.awb', '=', 'e.awb')
            ->where('e.pickup_task_id', $task->id)->whereNotNull('e.awb')
            ->selectRaw("count(*) as identified, count(s.id) as collected,
                sum(case when s.customer_match_status = 'MATCHED' and s.match_status = 'MATCHED' and s.customer_id = e.customer_id and s.pickup_task_id = e.pickup_task_id then 1 else 0 end) as confirmed,
                sum(case when s.customer_match_status = 'CANDIDATE' then 1 else 0 end) as candidates,
                sum(case when s.customer_match_status in ('CONFLICT', 'AMBIGUOUS') or s.match_status in ('CONFLICT', 'AMBIGUOUS') then 1 else 0 end) as conflicts")->first();
        $identified = (int) $row->identified;
        $collected = (int) $row->collected;
        $confirmed = (int) $row->confirmed;

        return ['category' => 'cashless_hybrid', 'expected_quantity' => $expected, 'identified_awbs' => $identified,
            'collected_awbs' => $collected, 'confirmed_awbs' => $confirmed, 'candidate_awbs' => (int) $row->candidates,
            'unmatched_awbs' => max(0, $collected - $confirmed - (int) $row->candidates - (int) $row->conflicts),
            'awaiting_source_awbs' => $identified - $collected, 'conflicts' => (int) $row->conflicts,
            'shortfall_quantity' => $expected === null ? null : max(0, $expected - $confirmed),
            'excess_quantity' => $expected === null ? null : max(0, $confirmed - $expected),
            'missing_quantity' => null, 'collection_complete' => false,
            'window' => $task->sertimWindowClosed() ? 'CLOSED' : 'OPEN'];
    }
}
