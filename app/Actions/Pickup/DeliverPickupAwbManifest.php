<?php

namespace App\Actions\Pickup;

use App\Jobs\DeliverPickupAwbManifestJob;
use App\Mail\PickupAwbManifestMail;
use App\Models\Customer;
use App\Models\CustomerAwbDeliveryPreference;
use App\Models\PickupAwbDelivery;
use App\Models\PickupAwbManifest;
use App\Models\PickupCustomerReconciliation;
use App\Models\PickupProcessingReconciliation;
use App\Models\PickupTask;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Throwable;

class DeliverPickupAwbManifest
{
    public function __construct(private ReconcilePickupProcessing $reconcile) {}

    public function queue(PickupAwbManifest $manifest): void
    {
        $preference = CustomerAwbDeliveryPreference::where('customer_id', $manifest->snapshot['customer_id'])->first();
        if ($manifest->status !== 'READY' || ! $preference?->enabled || $preference->channel !== 'email' || ! filter_var($preference->recipient, FILTER_VALIDATE_EMAIL)) {
            return;
        }
        $recipient = mb_strtolower(trim($preference->recipient));
        $configured = config('pickup.automation.enabled') && config('pickup.automation.send_enabled') && config('mail.default') === 'smtp';
        $delivery = PickupAwbDelivery::firstOrCreate(['pickup_awb_manifest_id' => $manifest->id, 'channel' => 'email', 'recipient_hash' => hash('sha256', $recipient)], [
            'recipient' => $recipient, 'submission_key' => (string) Str::uuid(), 'preference_revision' => $preference->revision,
            'status' => $configured ? 'READY' : 'AWAITING_CONFIGURATION',
        ]);
        if (in_array($delivery->status, ['READY', 'AWAITING_CONFIGURATION', 'CANCELLED'], true)) {
            $delivery->update(['status' => $configured ? 'READY' : 'AWAITING_CONFIGURATION', 'preference_revision' => $preference->revision]);
            if ($configured) {
                DeliverPickupAwbManifestJob::dispatch($delivery->id)->afterCommit();
            }
        }
    }

    public function handle(int $deliveryId): void
    {
        $peek = PickupAwbDelivery::with('manifest')->findOrFail($deliveryId);
        if ($peek->status !== 'READY') {
            return;
        }
        $this->reconcile->handle($peek->manifest->pickup_task_id);
        $work = DB::transaction(function () use ($deliveryId): ?array {
            $peek = PickupAwbDelivery::with('manifest')->findOrFail($deliveryId);
            Customer::whereKey($peek->manifest->snapshot['customer_id'])->lockForUpdate()->firstOrFail();
            PickupTask::whereKey($peek->manifest->pickup_task_id)->lockForUpdate()->firstOrFail();
            $delivery = PickupAwbDelivery::whereKey($deliveryId)->lockForUpdate()->firstOrFail();
            $manifest = PickupAwbManifest::whereKey($delivery->pickup_awb_manifest_id)->lockForUpdate()->firstOrFail();
            if ($delivery->status !== 'READY') {
                return null;
            }
            $result = PickupProcessingReconciliation::where('pickup_task_id', $manifest->pickup_task_id)->first();
            $group = $manifest->customer_reconciliation_id ? PickupCustomerReconciliation::whereKey($manifest->customer_reconciliation_id)->first() : null;
            $matched = $group ? $group->status === 'DONE' && app(ReconcileCustomerPickupDay::class)->memberIds(PickupTask::findOrFail($manifest->pickup_task_id)) === ($group->evidence['pickup_task_ids'] ?? [])
                && ! PickupProcessingReconciliation::where('customer_reconciliation_id', $group->id)->whereColumn('input_version', '!=', 'evaluated_input_version')->exists()
                : $result?->status === 'DONE' && $result->input_version === $result->evaluated_input_version;
            $preference = CustomerAwbDeliveryPreference::where('customer_id', $manifest->snapshot['customer_id'])->lockForUpdate()->first();
            if ($manifest->status !== 'READY' || ! $matched
                || ! $preference?->enabled || $preference->revision !== $delivery->preference_revision || $preference->channel !== $delivery->channel
                || mb_strtolower(trim($preference->recipient ?? '')) !== $delivery->recipient) {
                $delivery->update(['status' => 'CANCELLED', 'last_error' => 'Revisi dokumen, baseline atau preferensi customer berubah.']);

                return null;
            }
            if (! config('pickup.automation.enabled') || ! config('pickup.automation.send_enabled') || config('mail.default') !== 'smtp') {
                $delivery->update(['status' => 'AWAITING_CONFIGURATION']);

                return null;
            }
            foreach (['xlsx', 'pdf'] as $format) {
                $path = $manifest->getAttribute($format.'_path');
                if (! is_string($path) || ! Storage::disk('local')->exists($path) || ! hash_equals($manifest->checksums[$format] ?? '', hash('sha256', Storage::disk('local')->get($path)))) {
                    $delivery->update(['status' => 'FAILED', 'last_error' => 'Dokumen tidak tersedia atau checksum berubah; pulihkan sebelum mengirim.']);

                    return null;
                }
            }
            $delivery->update(['status' => 'SENDING', 'started_at' => now(), 'last_error' => null]);
            $attempt = DB::table('pickup_awb_delivery_attempts')->insertGetId(['pickup_awb_delivery_id' => $deliveryId, 'status' => 'SENDING', 'started_at' => now()]);

            return ['delivery' => $delivery, 'manifest' => $manifest, 'attempt' => $attempt];
        }, 3);
        if (! $work) {
            return;
        }
        $status = 'UNKNOWN';
        $messageId = null;
        $error = null;
        try {
            $sent = Mail::to($work['delivery']->recipient)->send(new PickupAwbManifestMail($work['manifest'], $work['delivery']->submission_key));
            if ($sent !== null) {
                $status = 'ACCEPTED';
                $messageId = $sent->getMessageId();
            } else {
                $error = 'Provider tidak mengembalikan konfirmasi; periksa hasil sebelum mengirim ulang.';
            }
        } catch (Throwable $exception) {
            report($exception);
            $error = 'Hasil pengiriman belum pasti; periksa provider sebelum mengirim ulang.';
        }
        DB::transaction(function () use ($deliveryId, $work, $status, $messageId, $error): void {
            PickupAwbDelivery::whereKey($deliveryId)->where('status', 'SENDING')->update(['status' => $status, 'provider_message_id' => $messageId, 'last_error' => $error, 'accepted_at' => $status === 'ACCEPTED' ? now() : null]);
            DB::table('pickup_awb_delivery_attempts')->where('id', $work['attempt'])->update(['status' => $status, 'provider_message_id' => $messageId, 'error' => $error, 'finished_at' => now()]);
        });
    }
}
