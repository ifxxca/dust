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
        if (ResolveJneCategories::enabled()) {
            return $this->configured($tasks, $cashless);
        }
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

    /**
     * @param  Collection<int, PickupTask>  $tasks
     * @param  array<int, array<string, int|string|bool|null>>  $cashless
     * @return array<int, array<string, mixed>>
     */
    private function configured(Collection $tasks, array $cashless): array
    {
        $shipments = JneShipment::whereIn('pickup_task_id', $tasks->modelKeys())->get()->groupBy('pickup_task_id');
        $result = [];
        foreach ($tasks as $task) {
            $rows = $shipments->get($task->id, collect());
            $confident = $rows->filter(fn (JneShipment $row): bool => $row->customer_match_status === 'MATCHED' && $row->match_status === 'MATCHED' && $row->customer_id === $task->customer_id);
            $classified = $confident->where('category_status', 'MATCHED')->whereIn('category', PickupProcessingRecord::CATEGORIES)->count();
            $unclassified = $confident->count() - $classified;
            $unresolvedIdentity = $rows->count() - $confident->count();
            $values = $task->proof?->finalized_at ? $task->proof->effectiveValues() : null;
            $complete = (bool) $cashless[$task->id]['collection_complete'];
            $categories = [];
            foreach (PickupProcessingRecord::CATEGORIES as $category) {
                $known = $rows->filter(fn (JneShipment $row): bool => $row->category === $category || collect($row->category_evidence ?? [])->contains('category', $category));
                $confirmed = $confident->where('category_status', 'MATCHED')->where('category', $category)->count();
                $conflicts = $known->filter(fn (JneShipment $row): bool => in_array($row->customer_match_status, ['AMBIGUOUS', 'CONFLICT'], true) || in_array($row->match_status, ['AMBIGUOUS', 'CONFLICT'], true) || $row->category_status === 'CONFLICT' || ($row->customer_id !== null && $row->customer_id !== $task->customer_id))->count();
                $candidates = $known->filter(fn (JneShipment $row): bool => $row->customer_match_status === 'CANDIDATE' || $row->match_status === 'CANDIDATE')->count();
                $identified = $known->count();
                if ($category === 'cashless_hybrid') {
                    $conflicts = max($conflicts, (int) $cashless[$task->id]['conflicts']);
                    $candidates = max($candidates, (int) $cashless[$task->id]['candidate_awbs']);
                    $identified = max($identified, (int) $cashless[$task->id]['identified_awbs']);
                }
                $unmatched = max(0, $identified - $confirmed - $conflicts - $candidates);
                $expected = $values === null ? null : (int) $values[$category];
                $shortfall = $expected === null ? null : max(0, $expected - $confirmed);
                $excess = $expected === null ? null : max(0, $confirmed - $expected);
                $review = $unclassified > 0 || $unresolvedIdentity > 0 || $conflicts > 0 || $candidates > 0 || $unmatched > 0;
                $reconciled = $expected !== null && $confirmed === $expected && ! $review && $complete;
                $state = $expected === null ? 'AWAITING_POP' : ($conflicts > 0 ? 'CONFLICT' : ($excess > 0 ? 'EXCESS' : ($review ? 'REVIEW' : ($reconciled ? 'RECONCILED' : ($complete && $shortfall > 0 ? 'MISSING' : ($shortfall === 0 ? 'IDENTIFIED_COUNTS' : 'AWAITING_EVIDENCE'))))));
                $categories[$category] = ['category' => $category, 'expected_quantity' => $expected, 'identified_awbs' => $identified, 'confirmed_awbs' => $confirmed, 'candidate_awbs' => $candidates,
                    'unmatched_awbs' => $unmatched, 'conflicts' => $conflicts, 'shortfall_quantity' => $shortfall, 'excess_quantity' => $excess,
                    'missing_quantity' => $complete && ! $review ? $shortfall : null, 'collection_complete' => $complete, 'reconciled' => $reconciled, 'state' => $state];
            }
            $result[$task->id] = ['categories' => $categories, 'confirmed_pickup_awbs' => $confident->count(), 'category_confirmed_awbs' => $classified, 'unclassified_awbs' => $unclassified,
                'collection_complete' => $complete, 'collection_status' => $cashless[$task->id]['collection_status'], 'reconciled' => collect($categories)->every('reconciled', true), 'sertim_window' => $cashless[$task->id]['window']];
        }

        return $result;
    }
}
