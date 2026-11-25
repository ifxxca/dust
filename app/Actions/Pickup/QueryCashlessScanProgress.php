<?php

namespace App\Actions\Pickup;

use Illuminate\Database\Query\JoinClause;
use Illuminate\Support\Facades\DB;

class QueryCashlessScanProgress
{
    /** @return array{summary: array<string, int>, recent: list<array<string, mixed>>, registered_awbs: list<string>, confirmed_ids: list<int>, failed_attempts: list<string>} */
    public function handle(int $taskId): array
    {
        $latest = DB::table('cashless_entry_items')->selectRaw('MAX(cashless_entry_items.id) as id')
            ->join('pickup_cashless_awbs', 'pickup_cashless_awbs.id', '=', 'cashless_entry_items.pickup_cashless_awb_id')
            ->where('pickup_cashless_awbs.pickup_task_id', $taskId)->groupBy('pickup_cashless_awb_id');
        $rows = DB::table('pickup_cashless_awbs as records')
            ->join('pickup_tasks as tasks', 'tasks.id', '=', 'records.pickup_task_id')
            ->leftJoin('cashless_entry_items as items', function (JoinClause $join) use ($latest): void {
                $join->on('items.pickup_cashless_awb_id', '=', 'records.id')->whereIn('items.id', $latest);
            })
            ->leftJoin('cashless_entry_batches as batches', 'batches.id', '=', 'items.batch_id')
            ->where('records.pickup_task_id', $taskId)->whereNotNull('records.awb')
            ->select(['records.id', 'records.awb', 'records.customer_id', 'tasks.customer_id as task_customer_id', 'items.awb as attempted_awb', 'items.previous_ho', 'items.status', 'items.message', 'items.batch_id', 'batches.pickup_task_id as attempted_task_id', 'batches.status as batch_status', 'batches.approved_at'])
            ->selectSub(DB::table('cashless_entry_items as attempts')->selectRaw('COUNT(*)')
                ->whereColumn('attempts.pickup_cashless_awb_id', 'records.id'), 'attempts')->orderByDesc('records.id')->get();
        $summary = ['total' => $rows->count(), 'success' => 0, 'pending' => 0, 'retrying' => 0, 'failed' => 0, 'attention' => 0];
        $recent = [];
        $confirmedIds = [];
        $failedAttempts = [];
        foreach ($rows as $row) {
            $state = match (true) {
                $row->status !== null && ($row->attempted_awb !== $row->awb || (int) $row->attempted_task_id !== $taskId || $row->customer_id !== $row->task_customer_id) => 'attention',
                $row->status === 'CONFIRMED' && $row->previous_ho !== null && in_array($row->batch_status, ['DONE', 'PARTIAL'], true) => 'success',
                $row->status === 'ACCEPTED' && $row->approved_at !== null && in_array($row->batch_status, ['DONE', 'PARTIAL'], true) => 'success',
                in_array($row->status, ['NOT_FOUND', 'NEEDS_DATA', 'INVALID', 'ORION_REJECTED', 'CANCELLED'], true) => 'failed',
                in_array($row->batch_status, ['FAILED', 'CANCELLED'], true) => 'failed',
                $row->batch_status === 'UNKNOWN' || $row->status === 'PREVIOUSLY_ENTERED' => 'attention',
                (int) $row->attempts > 1 => 'retrying',
                default => 'pending',
            };
            $summary[$state]++;
            if ($state === 'success') {
                $confirmedIds[] = (int) $row->id;
            }
            if (in_array($state, ['failed', 'attention'], true)) {
                $failedAttempts[] = $row->id.':'.$row->batch_id.':'.$state;
            }
            if (count($recent) < 50) {
                $recent[] = ['id' => $row->id, 'awb' => $row->awb, 'state' => $state, 'status' => $row->status,
                    'batch_status' => $row->batch_status, 'batch_id' => $row->batch_id,
                    'message' => $row->message, 'attempts' => (int) $row->attempts];
            }
        }

        return ['summary' => $summary, 'recent' => $recent, 'registered_awbs' => $rows->pluck('awb')->all(), 'confirmed_ids' => $confirmedIds, 'failed_attempts' => $failedAttempts];
    }
}
