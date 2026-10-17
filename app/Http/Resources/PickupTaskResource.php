<?php

namespace App\Http\Resources;

use App\Models\PickupTask;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin PickupTask */
class PickupTaskResource extends JsonResource
{
    /** @var array{meta: array<string, mixed>} */
    public $with = ['meta' => []];

    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $user = $request->user();
        $mobileExecute = ! $request->routeIs('mobile.*') || $user->role === 'pickup_staff';
        $full = in_array($user->role, ['cs', 'admin_supervisor'], true) || $this->assigned_staff_id === $user->id
            || ($user->canExecutePickup() && ($this->resource->getAttribute('handover_item_exists') ?? $this->resource->handoverItem()->exists()));
        $data = [
            'id' => $this->id, 'reference' => $this->reference, 'pickup_type' => $this->pickup_type,
            'pickup_schedule_id' => $this->pickup_schedule_id, 'occurrence_date' => $this->occurrence_date,
            'customer' => ['id' => $this->customer_id, 'name' => $this->customer_name_snapshot],
            'pickup_address' => $this->pickup_address,
            'scheduled_at' => $this->scheduled_at->toIso8601String(),
            'status' => $this->status, 'version' => $this->version,
            'previous_task_id' => $this->previous_task_id,
            'assigned_staff' => $this->assignedStaff ? ['id' => $this->assignedStaff->id, 'name' => $this->assignedStaff->name] : null,
            'can' => ['assign' => ! $request->routeIs('mobile.*') && $user->canManagePickup() && $this->status === 'SCHEDULED', 'take_over' => $mobileExecute && $this->resource->eligibleFor($user)],
        ];
        if ($full) {
            $data['contact'] = $this->contact_snapshot;
            $data['notes'] = $this->notes;
            $data['execution_started_at'] = $this->execution_started_at?->toIso8601String();
            $data['can']['execute'] = $mobileExecute && $user->canExecutePickup() && $this->assigned_staff_id === $user->id && $this->status === 'ASSIGNED';
            $latestVisit = $this->relationLoaded('visits') ? $this->visits->last() : null;
            $data['can']['retry'] = false;
            $data['can']['create_follow_up'] = $this->status === 'NO_PACKAGES' && $user->can('create', PickupTask::class);
            $data['can']['cancel'] = $user->canManagePickup() && in_array($this->status, ['SCHEDULED', 'ASSIGNED'], true) && ($this->execution_started_at === null || $latestVisit?->outcome === 'NO_PACKAGES');
            $data['can']['correct_proof'] = $user->role === 'admin_supervisor' && $this->status === 'PICKED_UP';
            $data['handover_session_id'] = $this->whenLoaded('handoverItem', fn () => $this->handoverItem?->handover_session_id);
            $data['visits'] = PickupVisitResource::collection($this->whenLoaded('visits'));
            $data['proof'] = new PickupRecordResource($this->whenLoaded('proof'));
            $data['events'] = $this->whenLoaded('events', fn () => $this->events->map(fn ($event) => [
                'action' => $event->action, 'actor_id' => $event->actor_id,
                'actor_name' => $event->relationLoaded('actor') ? $event->actor?->name : null,
                'previous_staff_name' => $event->relationLoaded('previousStaff') ? $event->previousStaff?->name : null,
                'new_staff_name' => $event->relationLoaded('newStaff') ? $event->newStaff?->name : null,
                'previous_staff_id' => $event->previous_staff_id, 'new_staff_id' => $event->new_staff_id,
                'task_version' => $event->task_version, 'reason' => $event->reason,
                'occurred_at' => $event->occurred_at->toIso8601String(),
            ]));
        }

        return $data;
    }
}
