<?php

namespace App\Http\Resources;

use App\Actions\Handover\CompareQuantities;
use App\Models\HandoverSession;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin HandoverSession */
class HandoverResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $mayWrite = ! $request->routeIs('mobile.*') || $request->user()->tokenCan('mobile:handover');
        $mayReceive = $request->user()->canVerifyHandover() && $mayWrite;

        return [
            'id' => $this->id, 'reference' => $this->reference, 'status' => $this->status, 'version' => $this->version,
            'task_count' => $this->whenCounted('items'), 'pending_count' => $this->whenHas('pending_count'), 'discrepancy_count' => $this->whenHas('discrepancy_count'),
            'review_count' => $this->whenLoaded('items', fn () => $this->items->filter(fn ($item) => $item->needsReview())->count()),
            'verified_count' => $this->whenLoaded('items', fn () => $this->items->filter(fn ($item) => $item->status !== 'PENDING' && ! $item->needsReview())->count()),
            'can' => ['edit' => $mayWrite && $this->status === 'DRAFT', 'verify' => $mayReceive && $this->status !== 'CLOSED', 'receive' => $mayReceive],
            'can_close' => $this->whenLoaded('items', fn () => $mayReceive && $this->status !== 'CLOSED' && $this->items->isNotEmpty() && $this->items->every(function ($item) {
                $values = $item->effectiveValues();

                return $item->status !== 'PENDING' && ! $item->needsReview() && ($values['status'] !== 'DISCREPANCY' || filled($values['discrepancy_notes']));
            })),
            'created_by' => $this->created_by, 'closed_by' => $this->closed_by, 'closed_at' => $this->closed_at,
            'creator' => $this->whenLoaded('creator', fn () => $this->creator?->only(['id', 'name'])),
            'verification_started_at' => $this->verification_started_at, 'created_at' => $this->created_at,
            'staff_names' => $this->whenLoaded('items', fn () => $this->items->map(fn ($item) => $item->task->assignedStaff?->name)->filter()->unique()->values()),
            'total_packages' => $this->whenLoaded('items', fn () => $this->items->sum(function ($item) {
                $values = $item->proof->effectiveValues();

                return $values['manual_hybrid'] + $values['cashless_hybrid'] + $values['css_orion'];
            })),
            'items' => $this->when(! $request->routeIs('api.handovers.index', 'mobile.handovers.index') && $this->relationLoaded('items'), fn () => $this->items->map(function ($item) {
                $proof = $item->proof;
                $pv = $proof->effectiveValues();
                $rv = $item->effectiveValues();
                $pickup = ['manual_hybrid' => (int) $pv['manual_hybrid'], 'cashless_hybrid' => (int) $pv['cashless_hybrid'], 'css_orion' => (int) $pv['css_orion']];
                $retail = ['manual_hybrid' => $rv['manual_hybrid'], 'cashless_hybrid' => $rv['cashless_hybrid'], 'css_orion' => $rv['css_orion']];
                $correction = $item->latestCorrection();
                $verifiedRevision = $correction !== null ? $correction->pickup_revision : $item->verified_pickup_revision;
                $baseline = $proof->only(['manual_hybrid', 'cashless_hybrid', 'css_orion']);
                foreach ($proof->revisions as $revision) {
                    if ($revision->revision <= ($verifiedRevision ?? -1)) {
                        $baseline = array_replace($baseline, array_intersect_key($revision->values, $baseline));
                    }
                }
                $baseline = ['manual_hybrid' => (int) $baseline['manual_hybrid'], 'cashless_hybrid' => (int) $baseline['cashless_hybrid'], 'css_orion' => (int) $baseline['css_orion']];

                return ['id' => $item->id, 'task_id' => $item->pickup_task_id, 'reference' => $item->task->reference,
                    'customer_name' => $pv['customer_name'], 'contact' => $pv['contact'], 'pickup_address' => $pv['pickup_address'], 'picked_up_at' => $proof->picked_up_at,
                    'pickup_staff' => $item->task->assignedStaff?->only(['id', 'name']),
                    'pickup' => [...$pickup, 'total' => array_sum($pickup)], 'retail' => [...$retail, 'total' => $item->status === 'PENDING' ? null : array_sum($retail)],
                    'differences' => $item->status === 'PENDING' ? null : (new CompareQuantities)->handle($pickup, $retail)['differences'],
                    'status' => $rv['status'], 'discrepancy_notes' => $rv['discrepancy_notes'], 'verified_by' => $rv['verified_by'], 'verified_at' => $rv['verified_at'],
                    'needs_review' => $item->needsReview(), 'pickup_revision' => $proof->revisionNumber(), 'original_retail' => $item->only(['manual_hybrid', 'cashless_hybrid', 'css_orion', 'status', 'discrepancy_notes', 'verified_pickup_revision']),
                    'verified_pickup_revision' => $verifiedRevision,
                    'verified_pickup' => $verifiedRevision === null ? null : $baseline,
                    'verified_differences' => $verifiedRevision === null ? null : (new CompareQuantities)->handle($baseline, $retail)['differences'],
                    'revisions' => $item->revisions->map(fn ($revision) => $revision->only(['revision', 'pickup_revision', 'values', 'actor_id', 'reason', 'created_at']))];
            })),
            'events' => $this->whenLoaded('events', fn () => $this->events->map(fn ($event) => $event->only(['actor_id', 'action', 'handover_item_id', 'session_version', 'occurred_at', 'reason', 'changes']))),
        ];
    }
}
