<?php

namespace App\Actions\Pickup;

use App\Actions\Handover\CompareQuantities;
use App\Models\HandoverSession;
use App\Models\PickupTask;
use App\Models\User;

class QueryPickupQuickDetail
{
    public function __construct(private QueryPickupResults $results, private CompareQuantities $compare) {}

    /** @return array<string, mixed> */
    public function handle(PickupTask $task, User $actor): array
    {
        $task->load(['proof.revisions', 'proof.attachments', 'handoverItem.revisions']);
        $result = $this->results->row($this->results->handle()->where('id', $task->id)->first());
        $visit = $task->visits()->reorder('id', 'desc')->first();
        $proof = $task->proof;
        $item = $task->handoverItem;
        $session = $item ? HandoverSession::findOrFail($item->handover_session_id) : null;
        $handover = null;
        if ($item) {
            $values = $item->effectiveValues();
            $correction = $item->latestCorrection();
            $revision = $correction !== null ? $correction->pickup_revision : $item->verified_pickup_revision;
            $baseline = $proof->only(['manual_hybrid', 'cashless_hybrid', 'css_orion']);
            foreach ($proof->revisions as $correction) {
                if ($correction->revision <= ($revision ?? -1)) {
                    $baseline = array_replace($baseline, array_intersect_key($correction->values, $baseline));
                }
            }
            $received = array_intersect_key($values, $baseline);
            $handover = [
                'reference' => $session->reference, 'status' => $session->status,
                'received' => $item->status === 'PENDING' ? null : $received,
                'total_received' => $item->status === 'PENDING' ? null : array_sum($received),
                'verified_by' => $values['verified_by'] ? User::query()->whereKey($values['verified_by'])->value('name') : null,
                'verified_at' => $values['verified_at'], 'verified_pickup_revision' => $revision,
                'differences' => $revision === null ? null : $this->compare->handle(
                    ['manual_hybrid' => (int) $baseline['manual_hybrid'], 'cashless_hybrid' => (int) $baseline['cashless_hybrid'], 'css_orion' => (int) $baseline['css_orion']],
                    ['manual_hybrid' => (int) $received['manual_hybrid'], 'cashless_hybrid' => (int) $received['cashless_hybrid'], 'css_orion' => (int) $received['css_orion']],
                )['differences'],
                'discrepancy_notes' => $values['discrepancy_notes'],
            ];
        }

        return [
            'result' => $result,
            'visit' => $visit?->only(['outcome', 'started_at', 'recorded_at', 'reason', 'notes']),
            'proof' => $proof ? [
                ...array_intersect_key($proof->effectiveValues(), array_flip(['manual_hybrid', 'cashless_hybrid', 'css_orion', 'notes'])),
                'revision' => $proof->revisionNumber(), 'finalized_at' => $proof->finalized_at,
                'attachments' => $proof->attachments->map(fn ($file) => ['id' => $file->id, 'kind' => $file->kind, 'url' => route('api.evidence', $file)]),
            ] : null,
            'handover' => $handover,
            'capabilities' => [
                'correct_pop' => $task->status === 'PICKED_UP' && $proof?->finalized_at !== null,
                'verify' => $actor->canVerifyHandover() && $session?->status !== 'CLOSED' && $item?->status === 'PENDING',
                'correct_verification' => $session?->status === 'IN_VERIFICATION' && $item->status !== 'PENDING',
            ],
            'timezone' => PickupResultPeriod::TIMEZONE,
        ];
    }
}
