<?php

namespace App\Actions\Pickup;

use App\Jobs\DeliverPickupAwbManifestJob;
use App\Models\Customer;
use App\Models\CustomerAwbDeliveryPreference;
use App\Models\PickupAwbDelivery;
use App\Models\PickupAwbManifest;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class RetryPickupAwbEmail
{
    public function handle(User $actor, int $taskId, int $deliveryId): void
    {
        abort_unless($actor->is_active && $actor->role === 'admin_supervisor', 403);
        DB::transaction(function () use ($actor, $taskId, $deliveryId): void {
            $task = PickupTask::findOrFail($taskId);
            $customer = Customer::whereKey($task->customer_id)->lockForUpdate()->firstOrFail();
            PickupTask::whereKey($taskId)->lockForUpdate()->firstOrFail();
            $delivery = PickupAwbDelivery::whereKey($deliveryId)->lockForUpdate()->firstOrFail();
            $manifest = PickupAwbManifest::whereKey($delivery->pickup_awb_manifest_id)->lockForUpdate()->firstOrFail();
            abort_unless($manifest->snapshot['customer_id'] === $task->customer_id && ($manifest->pickup_task_id === $taskId || in_array($taskId, $manifest->snapshot['pickup_task_ids'] ?? [], true)), 404);
            abort_unless($manifest->status === 'READY' && $delivery->status === 'FAILED', 409, 'Hanya email yang pasti gagal yang boleh dicoba ulang. Email berhasil atau belum pasti tidak dikirim ulang.');
            $preference = CustomerAwbDeliveryPreference::where('customer_id', $task->customer_id)->lockForUpdate()->first()
                ?? CustomerAwbDeliveryPreference::fromCustomer($customer);
            abort_unless($customer->is_active && $preference->enabled && $preference->channel === $delivery->channel && in_array($delivery->recipient, $preference->emailRecipients(), true), 409, 'Alamat ini tidak lagi diaktifkan pada pengaturan email customer.');
            $delivery->update(['status' => 'READY', 'preference_revision' => $preference->revision, 'last_error' => null]);
            DeliverPickupAwbManifestJob::dispatch($delivery->id)->afterCommit();
            Log::info('Customer recap email retry requested', ['actor_id' => $actor->id, 'delivery_id' => $deliveryId, 'pickup_task_id' => $taskId]);
        }, 3);
    }
}
