<?php

namespace App\Actions\Pickup;

use App\Models\PickupTask;
use Illuminate\Support\Facades\DB;

class QueryPickupProcessingDetail
{
    public function __construct(private QueryPackageProcessing $processing) {}

    /** @return array<string, mixed> */
    public function handle(PickupTask $task): array
    {
        $processingHistory = $this->processing->latest()->where('r.pickup_task_id', $task->id)->join('users as recorder', 'recorder.id', '=', 'r.actor_id');
        $processingColumns = ['r.id', 'r.category', 'r.system', 'r.revision', 'r.successful_quantity', 'r.failed_quantity', 'r.pending_quantity', 'r.unknown_quantity', 'r.external_reference', 'r.reason', 'r.pickup_revision', 'r.handover_revision', 'r.received_quantity', 'r.actor_id', 'r.created_at', 'recorder.name as actor_name'];
        $latestProcessing = $processingHistory->select($processingColumns)->get();
        $history = DB::table('pickup_processing_records as r')->join('users as recorder', 'recorder.id', '=', 'r.actor_id')->where('r.pickup_task_id', $task->id)
            ->leftJoin('pickup_processing_records as previous', function ($join) {
                $join->on('previous.pickup_task_id', '=', 'r.pickup_task_id')->on('previous.category', '=', 'r.category')->on('previous.system', '=', 'r.system')->whereRaw('previous.revision = r.revision - 1');
            })
            ->select($processingColumns)->addSelect(['previous.successful_quantity as previous_successful', 'previous.failed_quantity as previous_failed', 'previous.pending_quantity as previous_pending', 'previous.unknown_quantity as previous_unknown'])
            ->orderByDesc('r.id')->paginate(20, ['*'], 'processing_page')->withQueryString();
        $query = $this->processing->handle()->where('id', $task->id);

        return ['rows' => (clone $query)->get()->map($this->processing->row(...)), 'summary' => $this->processing->summary($query), 'latest' => $latestProcessing, 'history' => $history, 'can_record' => $task->proof?->finalized_at !== null];
    }
}
