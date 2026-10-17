<?php

namespace App\Actions\Pickup;

use App\Models\Customer;
use App\Models\PickupTask;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class CreatePickupTask
{
    /** @param array{customer_id: int|string, pickup_address: string, scheduled_at: string, notes?: ?string, submission_key?: ?string, previous_task_id?: ?int} $data */
    public function handle(User $user, array $data): PickupTask
    {
        return DB::transaction(function () use ($user, $data): PickupTask {
            $actor = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            abort_unless($actor->can('create', PickupTask::class), 403);
            $scheduled = CarbonImmutable::parse($data['scheduled_at'])->utc();
            $address = trim($data['pickup_address']);
            $notes = isset($data['notes']) ? trim($data['notes']) : null;
            $key = isset($data['submission_key']) ? strtolower($data['submission_key']) : null;
            $previousId = isset($data['previous_task_id']) ? (int) $data['previous_task_id'] : null;
            if ($key && ($existing = PickupTask::where('created_by', $actor->id)->where('creation_submission_key', $key)->first())) {
                abort_unless($existing->customer_id === (int) $data['customer_id'] && $existing->pickup_address === $address
                    && $existing->scheduled_at->equalTo($scheduled) && $existing->notes === $notes && $existing->previous_task_id === $previousId,
                    409, 'SUBMISSION_CONFLICT: Key sudah digunakan dengan input berbeda.');
                abort_unless($actor->can('view', $existing), 404);

                return $existing;
            }
            $customer = Customer::whereKey($data['customer_id'])->lockForUpdate()->firstOrFail();
            if (! $customer->is_active) {
                throw ValidationException::withMessages(['customer_id' => 'Customer tidak aktif. Pilih customer aktif untuk pickup baru.']);
            }
            if ($previousId) {
                $previous = PickupTask::whereKey($previousId)->lockForUpdate()->firstOrFail();
                abort_unless($actor->can('view', $previous), 404);
                abort_unless($previous->status === 'NO_PACKAGES' && $previous->customer_id === $customer->id, 422, 'Task asal harus selesai tanpa paket untuk customer yang sama.');
                abort_unless($scheduled->greaterThan($previous->scheduled_at), 422, 'Jadwal kunjungan baru harus setelah jadwal task asal.');
            }
            abort_if(PickupTask::where('customer_id', $customer->id)->where('status', '!=', 'CANCELLED')
                ->where('scheduled_at', '>=', $scheduled->startOfMinute())->where('scheduled_at', '<', $scheduled->startOfMinute()->addMinute())->lockForUpdate()->exists(),
                409, 'DUPLICATE_PICKUP: Customer sudah memiliki task pada menit jadwal tersebut. Periksa daftar sebelum membuat task baru.');
            $staff = $actor->role === 'pickup_staff';
            $task = PickupTask::create([
                'reference' => (string) Str::ulid(), 'customer_id' => $customer->id,
                'customer_name_snapshot' => $customer->name, 'contact_snapshot' => $customer->contact,
                'pickup_address' => $address, 'scheduled_at' => $scheduled, 'notes' => $notes,
                'created_by' => $actor->id, 'status' => $staff ? 'ASSIGNED' : 'SCHEDULED',
                'assigned_staff_id' => $staff ? $actor->id : null, 'version' => $staff ? 2 : 1,
                'creation_submission_key' => $key, 'previous_task_id' => $previousId, 'pickup_type' => 'on_demand',
            ]);
            $task->events()->create(['action' => 'created', 'actor_id' => $actor->id, 'task_version' => 1, 'reason' => $previousId ? 'Kunjungan lanjutan PCK-'.$previousId : null, 'occurred_at' => now()]);
            if ($staff) {
                $task->events()->create(['action' => 'assigned', 'actor_id' => $actor->id, 'new_staff_id' => $actor->id, 'task_version' => 2, 'occurred_at' => now()]);
            }

            return $task;
        }, 3);
    }
}
