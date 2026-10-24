<?php

namespace App\Policies;

use App\Models\PickupTask;
use App\Models\User;

class PickupTaskPolicy
{
    public function viewCashlessAwb(User $user, PickupTask $pickupTask): bool
    {
        return $user->canManagePickup() || ($user->canExecutePickup()
            && ($pickupTask->assigned_staff_id === $user->id || $pickupTask->handoverItem()->exists()));
    }

    public function recordCashlessAwb(User $user, PickupTask $pickupTask): bool
    {
        return $user->canExecutePickup() && $pickupTask->assigned_staff_id === $user->id
            && $pickupTask->status === 'ASSIGNED' && $pickupTask->execution_started_at !== null
            && ! $pickupTask->proof()->whereNotNull('finalized_at')->exists() && ! $pickupTask->sertimWindowClosed();
    }

    public function correctCashlessAwb(User $user, PickupTask $pickupTask): bool
    {
        return $user->is_active && $user->role === 'admin_supervisor'
            && in_array($pickupTask->status, ['ASSIGNED', 'PICKED_UP'], true)
            && ($pickupTask->execution_started_at !== null || $pickupTask->proof()->whereNotNull('finalized_at')->exists());
    }

    /**
     * Determine whether the user can view any models.
     */
    public function viewAny(User $user): bool
    {
        return $user->canManagePickup() || $user->canExecutePickup();
    }

    /**
     * Determine whether the user can view the model.
     */
    public function view(User $user, PickupTask $pickupTask): bool
    {
        return $this->viewAny($user) && (in_array($user->role, ['cs', 'admin_supervisor'], true)
            || $pickupTask->assigned_staff_id === $user->id || $pickupTask->eligibleFor($user)
            || ($user->canExecutePickup() && $pickupTask->handoverItem()->exists()));
    }

    /**
     * Determine whether the user can create models.
     */
    public function create(User $user): bool
    {
        return $user->canManagePickup() || ($user->is_active && $user->role === 'pickup_staff');
    }

    /**
     * Determine whether the user can update the model.
     */
    public function update(User $user, PickupTask $pickupTask): bool
    {
        return false;
    }

    /**
     * Determine whether the user can delete the model.
     */
    public function delete(User $user, PickupTask $pickupTask): bool
    {
        return false;
    }

    /**
     * Determine whether the user can restore the model.
     */
    public function restore(User $user, PickupTask $pickupTask): bool
    {
        return false;
    }

    /**
     * Determine whether the user can permanently delete the model.
     */
    public function forceDelete(User $user, PickupTask $pickupTask): bool
    {
        return false;
    }
}
