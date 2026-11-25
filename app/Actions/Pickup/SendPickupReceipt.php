<?php

namespace App\Actions\Pickup;

use App\Mail\PickupReceiptMail;
use App\Models\Customer;
use App\Models\PickupReceipt;
use App\Models\PickupTask;
use App\Models\ReceiptAttempt;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\Mailer\Exception\UnexpectedResponseException;
use Throwable;

class SendPickupReceipt
{
    public function handle(User $user, int $taskId): PickupReceipt
    {
        if (config('pickup.email_recipients.enabled')) {
            return $this->sendMultiple($user, $taskId);
        }
        [$receipt, $attempt, $record, $values] = DB::transaction(function () use ($user, $taskId) {
            $actor = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            $task = PickupTask::whereKey($taskId)->lockForUpdate()->firstOrFail();
            abort_unless($actor->canManagePickup() || ($actor->canExecutePickup() && ($task->assigned_staff_id === $actor->id || $task->handoverItem()->exists())), 403);
            $record = $task->proof()->with(['revisions', 'attachments'])->firstOrFail();
            $receipt = $record->receipts()->where('proof_revision', $record->revisionNumber())->lockForUpdate()->firstOrFail();
            if ($receipt->recipient_statuses !== null) {
                return [$receipt, null, $record, null];
            }
            if (in_array($receipt->status, ['ACCEPTED_BY_PROVIDER', 'DELIVERED'], true)) {
                return [$receipt, null, $record, []];
            }
            abort_if(in_array($receipt->status, ['PROCESSING', 'UNKNOWN'], true), 409, 'Pengiriman sedang diproses atau hasil provider belum pasti. Jangan kirim ulang sebelum rekonsiliasi.');
            if (! Customer::findOrFail($task->customer_id)->documentDeliveryOptions()['receipt_email']) {
                $receipt->update(['status' => 'SKIPPED', 'last_error' => 'Pengiriman bukti pickup melalui email dinonaktifkan untuk customer ini.']);

                return [$receipt, null, $record, []];
            }
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
        if ($values === null) {
            return $this->sendMultiple($user, $taskId);
        }
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

    private function sendMultiple(User $user, int $taskId): PickupReceipt
    {
        [$receipt, $record, $values, $recipients] = DB::transaction(function () use ($user, $taskId): array {
            $actor = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            $task = PickupTask::whereKey($taskId)->lockForUpdate()->firstOrFail();
            abort_unless($actor->canManagePickup() || ($actor->canExecutePickup() && ($task->assigned_staff_id === $actor->id || $task->handoverItem()->exists())), 403);
            $record = $task->proof()->with(['revisions', 'attachments'])->firstOrFail();
            $receipt = $record->receipts()->where('proof_revision', $record->revisionNumber())->lockForUpdate()->firstOrFail();
            if (in_array($receipt->status, ['ACCEPTED_BY_PROVIDER', 'DELIVERED'], true)) {
                return [$receipt, $record, [], []];
            }
            abort_if($receipt->status === 'PROCESSING', 409, 'Pengiriman sedang diproses. Muat ulang untuk memeriksa hasil.');
            abort_if($receipt->status === 'UNKNOWN' && $receipt->recipient_statuses === null, 409, 'Hasil provider belum pasti. Jangan kirim ulang sebelum rekonsiliasi.');
            if (! Customer::findOrFail($task->customer_id)->documentDeliveryOptions()['receipt_email']) {
                $receipt->update(['status' => 'SKIPPED', 'last_error' => 'Pengiriman bukti pickup melalui email dinonaktifkan untuk customer ini.']);

                return [$receipt, $record, [], []];
            }
            $statuses = $receipt->recipient_statuses ?? PickupReceipt::pendingRecipients(filter_var($receipt->recipient, FILTER_VALIDATE_EMAIL) ? [mb_strtolower(trim($receipt->recipient))] : []);
            $recipients = array_keys(array_filter($statuses, fn (array $state): bool => in_array($state['status'], ['PENDING', 'FAILED'], true)));
            abort_if($receipt->status === 'UNKNOWN' && $recipients === [], 409, 'Hasil provider belum pasti. Jangan kirim ulang sebelum rekonsiliasi.');
            if (config('pickup.receipt_channel') !== 'email' || config('mail.default') !== 'smtp') {
                $receipt->update(['status' => 'PENDING_CONFIGURATION', 'last_error' => 'Kanal email/SMTP operasional belum dikonfigurasi.']);

                return [$receipt, $record, [], []];
            }
            if ($statuses === []) {
                $receipt->update(['status' => 'PENDING_RECIPIENT', 'last_error' => 'Kontak POP bukan alamat email valid.']);

                return [$receipt, $record, [], []];
            }
            foreach ($record->attachments as $file) {
                if (! Storage::disk('local')->exists($file->path)) {
                    $receipt->update(['status' => 'FAILED', 'last_error' => 'File bukti tidak tersedia. Pengiriman belum dilakukan.']);

                    return [$receipt, $record, [], []];
                }
            }
            $receipt->update(['status' => 'PROCESSING', 'channel' => 'email', 'recipient_statuses' => $statuses, 'last_error' => null]);

            return [$receipt, $record, $record->effectiveValues(), $recipients];
        }, 3);
        if ($recipients === []) {
            return $receipt;
        }
        foreach ($recipients as $recipient) {
            $attempt = DB::transaction(function () use ($receipt, $recipient, $user): ReceiptAttempt {
                $current = PickupReceipt::whereKey($receipt->id)->lockForUpdate()->firstOrFail();
                $statuses = $current->recipient_statuses;
                $statuses[$recipient] = ['status' => 'PROCESSING'];
                $current->update(['recipient_statuses' => $statuses]);

                return $current->attempts()->create(['actor_id' => $user->id, 'recipient' => $recipient, 'status' => 'PROCESSING']);
            }, 3);
            $status = 'UNKNOWN';
            $messageId = null;
            $error = null;
            try {
                $sent = Mail::to($recipient)->send(new PickupReceiptMail($record, $values, $receipt->proof_revision));
                if ($sent !== null) {
                    $status = 'ACCEPTED_BY_PROVIDER';
                    $messageId = $sent->getMessageId();
                } else {
                    $error = 'Provider tidak mengembalikan konfirmasi penerimaan.';
                }
            } catch (Throwable $exception) {
                report($exception);
                $rejected = $exception instanceof UnexpectedResponseException && $exception->getCode() >= 400 && $exception->getCode() <= 599;
                $status = $rejected ? 'FAILED' : 'UNKNOWN';
                $error = $rejected ? 'Server email menolak pengiriman. Periksa alamat atau konfigurasi sebelum mencoba lagi.' : 'Hasil pengiriman belum pasti. Periksa log/provider sebelum mengirim ulang.';
            }
            DB::transaction(function () use ($receipt, $recipient, $attempt, $status, $messageId, $error): void {
                $current = PickupReceipt::whereKey($receipt->id)->lockForUpdate()->firstOrFail();
                $statuses = $current->recipient_statuses;
                $statuses[$recipient] = ['status' => $status, 'provider_message_id' => $messageId,
                    'accepted_at' => $status === 'ACCEPTED_BY_PROVIDER' ? now()->toIso8601String() : null, 'last_error' => $error];
                $current->update(['recipient_statuses' => $statuses]);
                $attempt->update(['status' => $status, 'provider_message_id' => $messageId, 'error' => $error, 'finished_at' => now()]);
            }, 3);
        }

        return DB::transaction(function () use ($receipt): PickupReceipt {
            $current = PickupReceipt::whereKey($receipt->id)->lockForUpdate()->firstOrFail();
            $states = collect($current->recipient_statuses);
            $accepted = $states->every(fn (array $state): bool => in_array($state['status'], ['ACCEPTED_BY_PROVIDER', 'DELIVERED'], true));
            $current->update(['status' => $accepted ? 'ACCEPTED_BY_PROVIDER' : ($states->contains('status', 'UNKNOWN') ? 'UNKNOWN' : 'FAILED'),
                'provider_message_id' => $states->count() === 1 ? $states->first()['provider_message_id'] ?? null : null,
                'accepted_at' => $accepted ? now() : null,
                'last_error' => $accepted ? null : 'Sebagian email belum terkonfirmasi. Periksa status setiap penerima.']);

            return $current;
        }, 3);
    }
}
