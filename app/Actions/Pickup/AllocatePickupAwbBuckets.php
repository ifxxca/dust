<?php

namespace App\Actions\Pickup;

use App\Models\Customer;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneShipmentMatchEvent;
use App\Models\PickupPendingItem;
use App\Models\PickupProcessingReconciliation;
use App\Models\PickupProcessingRecord;
use App\Models\PickupTask;
use Illuminate\Support\Facades\DB;

class AllocatePickupAwbBuckets
{
    public const METHOD = 'BUCKET_FIFO';

    public const NOTE = 'Dialokasikan otomatis dari bucket customer, hari operasional, dan kategori berdasarkan urutan pickup.';

    public function handle(PickupTask $origin): void
    {
        $origin->loadMissing('proof');
        if (! config('jne-reports.evidence_policies_enabled') || ! $origin->proof?->picked_up_at) {
            return;
        }

        DB::transaction(function () use ($origin): void {
            $customer = Customer::whereKey($origin->customer_id)->lockForUpdate()->firstOrFail();
            if (! $customer->is_active) {
                return;
            }
            $date = PickupResultPeriod::date($origin->proof->picked_up_at)->toDateString();
            $from = PickupResultPeriod::start($date)->utc();
            $thru = $from->addDay();
            $tasks = PickupTask::where('customer_id', $origin->customer_id)
                ->whereHas('proof', fn ($query) => $query->whereNotNull('finalized_at')->where('picked_up_at', '>=', $from)->where('picked_up_at', '<', $thru))
                ->with(['proof.revisions', 'handoverItem.revisions', 'handoverItem.proof.revisions'])
                ->orderBy('id')->lockForUpdate()->get()
                ->sortBy([fn (PickupTask $left, PickupTask $right): int => $left->proof->picked_up_at <=> $right->proof->picked_up_at, ['id', 'asc']]);
            if ($tasks->count() < 2) {
                return;
            }
            $pending = PickupPendingItem::whereIn('status', ['PENDING', 'READY'])
                ->whereHas('pickup', fn ($query) => $query->where('customer_id', $customer->id))
                ->with('pickup.proof')->get();
            if ($pending->contains(fn (PickupPendingItem $item): bool => $item->pickup?->proof?->picked_up_at !== null
                && PickupResultPeriod::date($item->pickup->proof->picked_up_at)->toDateString() < $date)) {
                return;
            }
            $states = PickupProcessingReconciliation::whereIn('pickup_task_id', $tasks->modelKeys())->lockForUpdate()->get()->keyBy('pickup_task_id');
            $owned = JneShipment::whereIn('pickup_task_id', $tasks->modelKeys())->orderBy('id')->lockForUpdate()->get(['id', 'pickup_task_id', 'category']);
            $exclusions = DB::table('pickup_awb_exclusions')->whereIn('pickup_task_id', $tasks->modelKeys())->get()->groupBy('pickup_task_id');
            $pool = JneShipment::where('customer_id', $customer->id)->where('customer_match_status', 'MATCHED')
                ->whereNull('pickup_task_id')->where('match_method', 'CUSTOMER_CODE_DATE')->whereIn('match_status', ['AMBIGUOUS', 'UNMATCHED'])
                ->where('category_status', 'MATCHED')->whereIn('category', PickupProcessingRecord::CATEGORIES)->where('tracking_status', '!=', 'CANCELLED')
                ->whereDoesntHave('cashlessClaim')
                ->whereHas('latestSource', fn ($query) => $query->where('entry_at', '>=', $from)->where('entry_at', '<', $thru)
                    ->whereHas('reportJob', fn ($job) => $job->where('status', 'COMPLETED')->where('import_status', 'IMPORTED')->where('projection_status', 'PROJECTED')))
                ->with('latestSource:id,entry_at,report_job_id')
                ->orderBy(JneReportAwb::select('entry_at')->whereColumn('jne_report_awbs.id', 'jne_shipments.latest_report_awb_id'))
                ->orderBy('awb')->orderBy('id')->lockForUpdate()->get();
            foreach ($tasks as $task) {
                $state = $states->get($task->id);
                $handover = $task->handoverItem;
                if ($state && ($state->locked_at !== null || $state->status === 'DONE' || $state->review_open)) {
                    continue;
                }
                if (! $handover || $handover->needsReview() || ($handover->effectiveValues()['status'] ?? null) !== 'VERIFIED') {
                    continue;
                }
                $received = $handover->effectiveValues();
                $pop = $task->proof->effectiveValues();
                if (collect(PickupProcessingRecord::CATEGORIES)->contains(fn (string $category): bool => (int) $pop[$category] !== (int) $received[$category])) {
                    continue;
                }
                foreach (PickupProcessingRecord::CATEGORIES as $category) {
                    $reserved = $owned->where('pickup_task_id', $task->id)->where('category', $category)->count()
                        + $pending->where('pickup_task_id', $task->id)->where('category', $category)->count();
                    $remaining = max(0, (int) $received[$category] - $reserved);
                    $excluded = ($exclusions->get($task->id) ?? collect())->pluck('jne_shipment_id')->all();
                    foreach ($pool->where('category', $category)->whereNotIn('id', $excluded)->take($remaining) as $poolKey => $shipment) {
                        JneShipmentMatchEvent::create(['jne_shipment_id' => $shipment->id, 'previous_pickup_task_id' => null, 'pickup_task_id' => $task->id,
                            'previous_customer_id' => $customer->id, 'customer_id' => $customer->id, 'customer_match_status' => 'MATCHED',
                            'match_status' => 'MATCHED', 'method' => self::METHOD, 'actor_id' => null, 'reason' => self::NOTE,
                            'evidence' => [['method' => self::METHOD, 'customer_id' => $customer->id, 'business_date' => $date, 'category' => $category,
                                'source_id' => $shipment->latest_report_awb_id, 'entry_at' => $shipment->latestSource->entry_at->toIso8601String(),
                                'pickup_task_id' => $task->id, 'pickup_order' => $tasks->modelKeys(), 'expected' => (int) $received[$category],
                                'pickup_revision' => $task->proof->revisionNumber(), 'handover_revision' => $handover->latestCorrection()->revision ?? 0]]]);
                        $shipment->update(['pickup_task_id' => $task->id, 'match_status' => 'MATCHED', 'match_method' => self::METHOD, 'match_note' => self::NOTE, 'version' => $shipment->version + 1]);
                        $pool->forget($poolKey);
                    }
                }
            }
        }, 3);
    }
}
