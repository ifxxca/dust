<?php

namespace App\Actions\Reports;

use App\Actions\Pickup\PickupResultPeriod;
use App\Models\JneReportAwb;
use App\Models\JneSourceContract;
use App\Models\PickupTask;
use Illuminate\Support\Collection;

class MatchJnePickupDates
{
    /**
     * @param  Collection<int, JneReportAwb>  $history
     * @param  array<int, array<string, mixed>>  $decisions
     * @return array<int, array{pickups: list<int>, evidence: list<array<string, mixed>>, conflict: bool}>
     */
    public function handle(Collection $history, array $decisions): array
    {
        if (! config('jne-reports.evidence_policies_enabled')) {
            return [];
        }
        (new \Illuminate\Database\Eloquent\Collection($history->all()))->loadMissing('reportJob');
        $contracts = JneSourceContract::whereNotNull('active_key')->whereNotNull('verified_at')->get()->keyBy('active_key');
        $dates = [];
        foreach ($history as $source) {
            $decision = $decisions[$source->id] ?? [];
            $job = $source->reportJob;
            $contract = $contracts->get(JneSourceContract::key($job->source, $job->report_type));
            $registeredPrefix = in_array($decision['method'] ?? '', ['SHIPPER_CODE_PREFIX', 'SHIPPER_ALIAS_CODE'], true)
                && $job->status === 'COMPLETED' && $job->import_status === 'IMPORTED';
            $verifiedColumn = ($decision['method'] ?? '') === 'CUSTOMER_CODE' && $contract !== null
                && ($contract->definition['pickup_date_column'] ?? null) === 'TGL_ENTRY'
                && ($contract->definition['automatic_reconciliation'] ?? false) === true;
            if (($decision['status'] ?? '') !== 'MATCHED' || ! $source->entry_at || (! $registeredPrefix && ! $verifiedColumn)) {
                continue;
            }
            $date = PickupResultPeriod::date($source->entry_at)->toDateString();
            $dates[$source->awb][$date] = ['customer_id' => (int) $decision['customer_id'], 'source_id' => $source->id,
                'identity_method' => $decision['method'], 'date_column' => 'TGL_ENTRY',
                'contract_id' => $contract?->id, 'contract_revision' => $contract?->revision];
        }
        if ($dates === []) {
            return [];
        }
        $customerIds = collect($dates)->flatten(1)->pluck('customer_id')->unique();
        $allDates = array_merge(...array_map(array_keys(...), array_values($dates)));
        sort($allDates);
        $from = PickupResultPeriod::start($allDates[0])->utc();
        $thru = PickupResultPeriod::start($allDates[array_key_last($allDates)])->addDay()->utc();
        $tasks = PickupTask::whereIn('customer_id', $customerIds)->whereHas('proof', fn ($query) => $query->whereNotNull('finalized_at')->where('picked_up_at', '>=', $from)->where('picked_up_at', '<', $thru))
            ->with(['proof.revisions', 'handoverItem.revisions', 'handoverItem.proof.revisions'])->get();
        $result = [];
        foreach ($history as $source) {
            $evidence = $dates[$source->awb] ?? [];
            if ($evidence === []) {
                continue;
            }
            $picks = [];
            if (count($evidence) === 1) {
                $date = array_key_first($evidence);
                $candidates = $tasks->filter(fn (PickupTask $task): bool => $task->customer_id === $evidence[$date]['customer_id'] && PickupResultPeriod::date($task->proof->picked_up_at)->toDateString() === $date);
                if ($candidates->count() > 1) {
                    $picks = array_values($candidates->modelKeys());
                } elseif ($task = $candidates->first()) {
                    $handover = $task->handoverItem;
                    if ($handover && ! $handover->needsReview() && ($handover->effectiveValues()['status'] ?? null) === 'VERIFIED') {
                        $picks = [$task->id];
                    }
                }
            }
            $result[$source->id] = ['pickups' => $picks, 'conflict' => count($evidence) > 1, 'evidence' => [['method' => 'CUSTOMER_CODE_DATE', 'dates' => $evidence, 'candidate_pickup_ids' => $picks, 'timezone' => config('jne-reports.source_timezone')]]];
        }

        return $result;
    }
}
