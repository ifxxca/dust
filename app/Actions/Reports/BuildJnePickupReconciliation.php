<?php

namespace App\Actions\Reports;

use App\Models\JneShipment;
use App\Models\PickupProcessingRecord;
use App\Models\PickupTask;
use Illuminate\Database\Eloquent\Collection;

class BuildJnePickupReconciliation
{
    public function __construct(private QueryCashlessReconciliation $cashless) {}

    /**
     * @param  Collection<int, PickupTask>  $tasks
     * @return array<int, array<string, mixed>>
     */
    public function handle(Collection $tasks): array
    {
        $cashless = $this->cashless->forTasks($tasks);
        $counts = JneShipment::join('pickup_tasks as p', 'p.id', '=', 'jne_shipments.pickup_task_id')
            ->whereIn('pickup_task_id', $tasks->modelKeys())->where('match_status', 'MATCHED')->where('customer_match_status', 'MATCHED')
            ->whereColumn('jne_shipments.customer_id', 'p.customer_id')->select('pickup_task_id')->selectRaw('count(*) as total')->groupBy('pickup_task_id')->pluck('total', 'pickup_task_id');
        $result = [];
        foreach ($tasks as $task) {
            $values = $task->proof?->finalized_at ? $task->proof->effectiveValues() : null;
            $categories = [];
            foreach (PickupProcessingRecord::CATEGORIES as $category) {
                $expected = $values === null ? null : (int) $values[$category];
                $data = $category === 'cashless_hybrid' ? $cashless[$task->id] : [
                    'category' => $category, 'expected_quantity' => $expected, 'identified_awbs' => 0, 'confirmed_awbs' => 0,
                    'candidate_awbs' => 0, 'unmatched_awbs' => 0, 'conflicts' => 0, 'missing_quantity' => null,
                    'shortfall_quantity' => $expected, 'excess_quantity' => $expected === null ? null : 0,
                    'collection_complete' => false,
                ];
                $data['state'] = $expected === null ? 'AWAITING_POP' : ($data['conflicts'] > 0 ? 'CONFLICT'
                    : ($data['excess_quantity'] > 0 ? 'EXCESS'
                        : ($category !== 'cashless_hybrid' && $expected > 0 ? 'CATEGORY_EVIDENCE_REQUIRED'
                            : ($data['confirmed_awbs'] === $expected ? 'IDENTIFIED_COUNTS' : 'AWAITING_EVIDENCE'))));
                $data['reconciled'] = false;
                $categories[$category] = $data;
            }
            $linked = (int) ($counts[$task->id] ?? 0);
            $confirmed = (int) $cashless[$task->id]['confirmed_awbs'];
            $result[$task->id] = ['categories' => $categories, 'confirmed_pickup_awbs' => $linked,
                'category_confirmed_awbs' => $confirmed, 'unclassified_awbs' => max(0, $linked - $confirmed),
                'collection_complete' => false, 'reconciled' => false, 'sertim_window' => $cashless[$task->id]['window']];
        }

        return $result;
    }
}
