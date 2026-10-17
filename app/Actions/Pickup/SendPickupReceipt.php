<?php

namespace App\Actions\Pickup;

use App\Mail\PickupReceiptMail;
use App\Models\PickupReceipt;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Throwable;

class SendPickupReceipt
{
    public function handle(User $user, int $taskId): PickupReceipt
    {
        [$receipt, $attempt, $record, $values] = DB::transaction(function () use ($user, $taskId) {
            $actor = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            $task = PickupTask::whereKey($taskId)->lockForUpdate()->firstOrFail();
            abort_unless($actor->canManagePickup() || ($actor->canExecutePickup() && ($task->assigned_staff_id === $actor->id || $task->handoverItem()->exists())), 403);
            $record = $task->proof()->with(['revisions', 'attachments'])->firstOrFail();
            $receipt = $record->receipts()->where('proof_revision', $record->revisionNumber())->lockForUpdate()->firstOrFail();
            if (in_array($receipt->status, ['ACCEPTED_BY_PROVIDER', 'DELIVERED'], true)) {
                return [$receipt, null, $record, []];
            }
            abort_if(in_array($receipt->status, ['PROCESSING', 'UNKNOWN'], true), 409, 'Pengiriman sedang diproses atau hasil provider belum pasti. Jangan kirim ulang sebelum rekonsiliasi.');
            if (config('pickup.receipt_channel') !== 'email' || config('mail.default') !== 'smtp') {
                $receipt->update(['status' => 'PENDING_CONFIGURATION', 'last_error' => 'Kanal email/SMTP operasional belum dikonfigurasi.']);

                return [$receipt, null, $record, []];
            }
            if (! filter_var($receipt->recipient, FILTER_VALIDATE_EMAIL)) {
                $receipt->update(['status' => 'PENDING_RECIPIENT', 'last_error' => 'Kontak POP bukan alamat email valid.']);

                return [$receipt, null, $record, []];
            }
            foreach ($record->attachments as $file) {
                if (! Storage::disk('local')->exists($file->path)) {
                    $receipt->update(['status' => 'FAILED', 'last_error' => 'File bukti tidak tersedia. Pengiriman belum dilakukan.']);

                    return [$receipt, null, $record, []];
                }
            }
            $values = $record->effectiveValues();
            $receipt->update(['status' => 'PROCESSING', 'channel' => 'email', 'last_error' => null]);
            $attempt = $receipt->attempts()->create(['actor_id' => $actor->id, 'status' => 'PROCESSING']);

            return [$receipt, $attempt, $record, $values];
        }, 3);
        if ($attempt === null) {
            return $receipt;
        }
        try {
            $sent = Mail::to($receipt->recipient)->send(new PickupReceiptMail($record, $values, $receipt->proof_revision));
            $status = $sent === null ? 'UNKNOWN' : 'ACCEPTED_BY_PROVIDER';
            $messageId = $sent?->getMessageId();
            $error = $sent === null ? 'Provider tidak mengembalikan konfirmasi penerimaan.' : null;
        } catch (Throwable $exception) {
            report($exception);
            $status = 'UNKNOWN';
            $messageId = null;
            $error = 'Hasil pengiriman belum pasti. Periksa log/provider sebelum mengirim ulang.';
        }
        DB::transaction(function () use ($receipt, $attempt, $status, $messageId, $error): void {
            PickupReceipt::whereKey($receipt->id)->lockForUpdate()->firstOrFail()->update(['status' => $status, 'provider_message_id' => $messageId, 'accepted_at' => $status === 'ACCEPTED_BY_PROVIDER' ? now() : null, 'last_error' => $error]);
            $attempt->update(['status' => $status, 'provider_message_id' => $messageId, 'error' => $error, 'finished_at' => now()]);
        });

        return $receipt->refresh();
    }
}
