<?php

namespace App\Actions\Pickup;

use App\Models\CashlessEntryBatch;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class ManageUserHybridAccount
{
    /** @param array{hybrid_username?: string|null, hybrid_password?: string|null, remove?: bool} $data */
    public function handle(User $actor, User $user, array $data): User
    {
        abort_unless($actor->is_active && $actor->role === 'admin_supervisor', 403);
        try {
            return DB::transaction(function () use ($actor, $user, $data): User {
                DB::table('cashless_entry_lanes')->where('source', ManageCashlessEntryBatches::CaptureSource)->lockForUpdate()->first();
                $locked = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
                abort_unless(in_array($locked->role, User::PICKUP_ROLES, true), 422, 'Akun Hybrid hanya untuk petugas operasional.');
                $batches = CashlessEntryBatch::where('hybrid_user_id', $locked->id)->whereNotIn('status', [...CashlessEntryBatch::Terminal, 'QUEUED', 'WAITING_ACCOUNT'])->lockForUpdate()->get();
                abort_if($batches->contains(fn ($batch): bool => $batch->status !== 'UNKNOWN' && $batch->lease_until?->isFuture()), 409, 'Tunggu batch cashless aktif selesai sebelum mengubah akun Hybrid.');
                abort_if($batches->contains(fn ($batch): bool => $batch->ho_number !== null), 409, 'Selesaikan pemeriksaan HO sebelum mengubah kredensial Hybrid.');
                $remove = $data['remove'] ?? false;
                $username = $remove ? null : trim($data['hybrid_username'] ?? '');
                abort_if($batches->isNotEmpty() && ($remove || $username !== $locked->hybrid_username), 409, 'Selesaikan pemeriksaan HO sebelum mengganti username Hybrid.');
                if (! $remove && ($data['hybrid_password'] ?? '') === '' && ($locked->hybrid_password === null || $username !== $locked->hybrid_username)) {
                    throw ValidationException::withMessages(['hybrid_password' => 'Isi password untuk akun Hybrid ini.']);
                }
                $locked->forceFill(['hybrid_username' => $username,
                    'hybrid_password' => $remove ? null : (($data['hybrid_password'] ?? '') !== '' ? $data['hybrid_password'] : $locked->hybrid_password),
                    'hybrid_account_key' => $remove ? null : hash('sha256', 'nuralamt:'.strtolower($username)),
                    'hybrid_credential_version' => $locked->hybrid_credential_version + 1])->save();
                CashlessEntryBatch::where('hybrid_user_id', $locked->id)->whereIn('status', ['QUEUED', 'WAITING_ACCOUNT'])
                    ->update(['status' => $remove ? 'WAITING_ACCOUNT' : 'QUEUED']);
                Log::info('Staff Hybrid account updated', ['actor_id' => $actor->id, 'user_id' => $locked->id, 'configured' => ! $remove]);

                return $locked;
            }, 3);
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages(['hybrid_username' => 'Akun Hybrid ini sudah digunakan petugas lain.']);
        }
    }
}
