<?php

namespace App\Actions\Pickup;

use App\Jobs\DeliverPickupWhatsapp;
use App\Models\Customer;
use App\Models\PickupAwbManifest;
use App\Models\PickupCustomerReconciliation;
use App\Models\PickupProcessingReconciliation;
use App\Models\PickupReceipt;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\PickupWhatsappDelivery;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Throwable;

class ManageWhatsappDelivery
{
    public function __construct(private WahaClient $waha, private ThrottleWhatsappDelivery $throttle) {}

    public function queueReceipt(PickupRecord $record): ?PickupWhatsappDelivery
    {
        if (! $this->waha->installed() || ! $record->finalized_at) {
            return null;
        }
        $task = PickupTask::findOrFail($record->pickup_task_id);
        if (! Customer::findOrFail($task->customer_id)->documentDeliveryOptions()['receipt_whatsapp'] || blank($this->waha->settings()['session'])) {
            return null;
        }
        $receipt = $record->receipts()->where('proof_revision', $record->revisionNumber())->first();
        if ($receipt === null) {
            return null;
        }
        $values = $record->effectiveValues();
        $text = "Bukti Pickup\n".$values['customer_name']."\nBuku: ".$task->reference."\nTanggal: ".$record->picked_up_at->timezone('Asia/Jakarta')->format('d-m-Y H:i')." WIB\nManual: ".$values['manual_hybrid']."\nCashless: ".$values['cashless_hybrid']."\nCSS / Orion: ".$values['css_orion']."\nTotal: ".($values['manual_hybrid'] + $values['cashless_hybrid'] + $values['css_orion']).' paket';
        $parts = [['type' => 'text', 'text' => $text, 'status' => 'PENDING']];
        foreach ($record->attachments as $file) {
            $parts[] = $this->filePart($file->path, $file->mime_type, $file->kind.'-'.$file->id.'.'.pathinfo($file->path, PATHINFO_EXTENSION));
        }

        return $this->queue($task, 'receipt', $receipt->id, $record->revisionNumber(), $parts);
    }

    public function queueManifest(PickupAwbManifest $manifest): ?PickupWhatsappDelivery
    {
        if (! $this->waha->installed() || $manifest->status !== 'READY') {
            return null;
        }
        $task = PickupTask::whereKey($manifest->pickup_task_id)->where('customer_id', $manifest->snapshot['customer_id'])->first();
        if ($task === null) {
            return null;
        }
        if (! Customer::findOrFail($task->customer_id)->documentDeliveryOptions()['recap_whatsapp'] || blank($this->waha->settings()['session'])) {
            return null;
        }
        $parts = [['type' => 'text', 'status' => 'PENDING', 'text' => 'Rekap Resi — '.$manifest->snapshot['customer_name']."\nTanggal pickup: ".$manifest->snapshot['pickup_date']."\nBuku: ".$manifest->snapshot['reference']]];
        foreach (['pdf' => 'application/pdf', 'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'] as $format => $mime) {
            $parts[] = ['type' => 'file', 'path' => $manifest->getAttribute($format.'_path'), 'sha256' => $manifest->checksums[$format] ?? '', 'mimetype' => $mime, 'filename' => $manifest->downloadFilename($format), 'status' => 'PENDING'];
        }

        return $this->queue($task, 'recap', $manifest->id, $manifest->revision, $parts);
    }

    /** @return array<string, mixed> */
    private function filePart(string $path, string $mime, string $filename): array
    {
        return ['type' => 'file', 'path' => $path, 'sha256' => Storage::disk('local')->exists($path) ? hash('sha256', Storage::disk('local')->get($path)) : '', 'mimetype' => $mime, 'filename' => $filename, 'status' => 'PENDING'];
    }

    /** @param list<array<string, mixed>> $parts */
    private function queue(PickupTask $task, string $type, int $documentId, int $revision, array $parts): ?PickupWhatsappDelivery
    {
        $customer = Customer::findOrFail($task->customer_id);
        $options = $customer->documentDeliveryOptions();
        $settings = $this->waha->settings();
        if (! $customer->is_active || ! $options[$type.'_whatsapp'] || blank($settings['session']) || blank($options['whatsapp_target'])) {
            return null;
        }
        $target = $options['whatsapp_target'];
        $delivery = PickupWhatsappDelivery::firstOrCreate(['deduplication_key' => hash('sha256', $type.':'.$documentId.':'.$revision.':'.$target)], [
            'customer_id' => $customer->id, 'pickup_task_id' => $task->id, 'pickup_receipt_id' => $type === 'receipt' ? $documentId : null,
            'pickup_awb_manifest_id' => $type === 'recap' ? $documentId : null, 'session' => $settings['session'],
            'target' => $target, 'target_label' => $options['whatsapp_label'], 'parts' => $parts, 'status' => 'READY',
        ]);
        if (in_array($delivery->status, ['READY', 'WAITING'], true)) {
            DeliverPickupWhatsapp::dispatch($delivery->id)->afterCommit();
        }

        return $delivery;
    }

    private function current(PickupWhatsappDelivery $delivery): bool
    {
        $customer = Customer::find($delivery->customer_id);
        $task = PickupTask::find($delivery->pickup_task_id);
        if (! $customer?->is_active || $task?->customer_id !== $customer->id) {
            return false;
        }
        $options = $customer->documentDeliveryOptions();
        $type = $delivery->pickup_receipt_id !== null ? 'receipt' : 'recap';
        if (! $options[$type.'_whatsapp'] || $options['whatsapp_target'] !== $delivery->target) {
            return false;
        }
        if ($type === 'receipt') {
            $receipt = PickupReceipt::find($delivery->pickup_receipt_id);
            $proof = $task->proof;

            return $receipt !== null && $proof?->finalized_at !== null && $receipt->pickup_record_id === $proof->id && $receipt->proof_revision === $proof->revisionNumber();
        }
        $manifest = PickupAwbManifest::find($delivery->pickup_awb_manifest_id);
        if ($manifest?->status !== 'READY' || $manifest->pickup_task_id !== $task->id || (int) $manifest->snapshot['customer_id'] !== $customer->id) {
            return false;
        }
        $result = PickupProcessingReconciliation::where('pickup_task_id', $task->id)->first();
        $group = $manifest->customer_reconciliation_id ? PickupCustomerReconciliation::find($manifest->customer_reconciliation_id) : null;

        return $group ? $group->status === 'DONE' && $group->post_lock_change === null
            && app(ReconcileCustomerPickupDay::class)->memberIds($task) === ($group->evidence['pickup_task_ids'] ?? [])
            && ! PickupProcessingReconciliation::where('customer_reconciliation_id', $group->id)->whereColumn('input_version', '!=', 'evaluated_input_version')->exists()
            : $result?->status === 'DONE' && $result->input_version === $result->evaluated_input_version;
    }

    public function retry(PickupWhatsappDelivery $delivery): void
    {
        DB::transaction(function () use ($delivery): void {
            $row = PickupWhatsappDelivery::whereKey($delivery->id)->lockForUpdate()->firstOrFail();
            abort_unless($row->status === 'FAILED' && ! collect($row->parts)->contains(fn (array $part): bool => in_array($part['status'], ['SENDING', 'UNKNOWN'], true)), 409, 'Hasil belum pasti atau pengiriman sudah berhasil. Jangan kirim ulang.');
            $row->update(['status' => 'READY', 'last_error' => null, 'parts' => array_map(fn (array $part): array => $part['status'] === 'FAILED' ? [...$part, 'status' => 'PENDING'] : $part, $row->parts)]);
            DeliverPickupWhatsapp::dispatch($row->id)->afterCommit();
        }, 3);
    }

    public function handle(int $id): ?int
    {
        $row = PickupWhatsappDelivery::findOrFail($id);
        if (! in_array($row->status, ['READY', 'WAITING'], true)) {
            return null;
        }
        $lock = Cache::lock('waha-send:'.hash('sha256', $row->session), 75);
        if (! $lock->get()) {
            return 10;
        }
        try {
            $recipientLock = Cache::lock('waha-recipient:'.hash('sha256', $row->target), 75);
            if (! $recipientLock->get()) {
                return 10;
            }
            try {
                return $this->sendNext($row);
            } finally {
                $recipientLock->release();
            }
        } finally {
            $lock->release();
        }
    }

    private function sendNext(PickupWhatsappDelivery $delivery): ?int
    {
        if (! $this->current($delivery)) {
            $delivery->update(['status' => 'CANCELLED', 'last_error' => 'Dokumen, customer, atau tujuan pengiriman telah berubah.']);

            return null;
        }
        if (! Customer::findOrFail($delivery->customer_id)->documentDeliveryOptions()['whatsapp_consent_confirmed']) {
            $delivery->update(['status' => 'WAITING', 'last_error' => 'Menunggu konfirmasi persetujuan tujuan WhatsApp pada customer.']);

            return 3600;
        }
        $wait = $this->throttle->wait($delivery);
        if ($wait !== null) {
            $delivery->update(['status' => 'WAITING', 'last_error' => $wait['reason']]);

            return $wait['seconds'];
        }
        try {
            if (! $this->waha->settings()['enabled'] || ! $this->waha->configured()) {
                $delivery->update(['status' => 'WAITING', 'last_error' => 'Menunggu session WhatsApp terhubung dan pengiriman diaktifkan.']);

                return 60;
            }
            if (! $this->waha->working($delivery->session)) {
                $this->throttle->connectionUnavailable($delivery->session);
                $delivery->update(['status' => 'WAITING', 'last_error' => 'Menunggu session WhatsApp terhubung.']);

                return 60;
            }
            if (str_ends_with($delivery->target, '@g.us') && ! $this->waha->groupExists($delivery->session, $delivery->target)) {
                $delivery->update(['status' => 'FAILED', 'last_error' => 'Grup tidak dapat diakses oleh session pengirim.']);

                return null;
            }
        } catch (Throwable) {
            $this->throttle->connectionUnavailable($delivery->session);
            $delivery->update(['status' => 'WAITING', 'last_error' => 'Koneksi WAHA belum tersedia. Belum ada pengiriman pada percobaan ini.']);

            return 60;
        }
        foreach ($delivery->parts as $part) {
            if ($part['type'] === 'file' && (! is_string($part['path']) || ! Storage::disk('local')->exists($part['path'])
                || Storage::disk('local')->size($part['path']) > 20 * 1024 * 1024
                || ! hash_equals($part['sha256'], hash('sha256', Storage::disk('local')->get($part['path']))))) {
                $delivery->update(['status' => 'FAILED', 'last_error' => 'Lampiran hilang, berubah, atau melebihi 20 MB. Pulihkan dokumen sebelum mencoba ulang.']);

                return null;
            }
        }
        $seenKey = 'waha-seen:'.hash('sha256', $delivery->id.':'.$delivery->session.':'.$delivery->target);
        if (config('services.waha.delivery.send_seen', true) && ($delivery->parts[0]['status'] ?? null) === 'PENDING' && ! Cache::has($seenKey)) {
            try {
                $seen = $this->waha->readChat($delivery->session, $delivery->target);
            } catch (Throwable) {
                $this->throttle->connectionUnavailable($delivery->session);
                $delivery->update(['status' => 'WAITING', 'last_error' => 'Penandaan baca WhatsApp belum selesai. Dokumen belum dikirim.']);

                return 60;
            }
            if (! $seen->successful()) {
                $retryAfter = filled($seen->header('Retry-After')) ? $this->retryAfter($seen->header('Retry-After')) : null;
                $this->throttle->recordResult($delivery->session, 'FAILED', $seen->status(), $retryAfter);
                $pause = $this->throttle->pause($delivery->session);
                if ($pause !== null || ($seen->serverError() && $seen->status() !== 501) || in_array($seen->status(), [408, 425], true)) {
                    if ($pause === null) {
                        $this->throttle->connectionUnavailable($delivery->session);
                    }
                    $delivery->update(['status' => 'WAITING', 'last_error' => 'WAHA belum menerima penandaan baca (HTTP '.$seen->status().'). Dokumen belum dikirim.']);

                    return $pause !== null ? max(1, $pause['until'] - now()->getTimestamp()) : 60;
                }
                $delivery->update(['status' => 'FAILED', 'last_error' => 'WAHA menolak penandaan baca (HTTP '.$seen->status().'). Periksa dukungan read messages; dokumen belum dikirim.']);

                return null;
            }
            if (! is_array($seen->json('ids'))) {
                $this->throttle->connectionUnavailable($delivery->session);
                $delivery->update(['status' => 'WAITING', 'last_error' => 'Respons penandaan baca WAHA belum valid. Dokumen belum dikirim.']);

                return 60;
            }
            Cache::put($seenKey, true, 86400);
        }
        $work = DB::transaction(function () use ($delivery): ?array {
            Customer::whereKey($delivery->customer_id)->lockForUpdate()->firstOrFail();
            PickupTask::whereKey($delivery->pickup_task_id)->lockForUpdate()->firstOrFail();
            $row = PickupWhatsappDelivery::whereKey($delivery->id)->lockForUpdate()->firstOrFail();
            if (! in_array($row->status, ['READY', 'WAITING'], true) || ! $this->current($row)) {
                return null;
            }
            if (! Customer::findOrFail($row->customer_id)->documentDeliveryOptions()['whatsapp_consent_confirmed']) {
                $row->update(['status' => 'WAITING', 'last_error' => 'Persetujuan tujuan WhatsApp belum dikonfirmasi.']);

                return null;
            }
            $parts = $row->parts;
            foreach ($parts as $index => $part) {
                if ($part['status'] === 'PENDING') {
                    $parts[$index]['status'] = 'SENDING';
                    $parts[$index]['attempt_history'][] = ['started_at' => now()->toIso8601String(), 'status' => 'SENDING'];
                    $row->update(['parts' => $parts, 'status' => 'SENDING', 'started_at' => now(), 'attempts' => $row->attempts + 1, 'last_error' => null]);

                    return ['part' => $part, 'index' => $index];
                }
            }

            return null;
        }, 3);
        if ($work === null) {
            return null;
        }
        $state = 'UNKNOWN';
        $messageId = null;
        $error = 'Respons WAHA belum memastikan hasil. Periksa WhatsApp sebelum mencoba ulang.';
        $delay = null;
        $httpStatus = null;
        $retryAfter = null;
        try {
            $part = $work['part'];
            if ($part['type'] === 'file') {
                $bytes = Storage::disk('local')->get($part['path']);
                if (! hash_equals($part['sha256'], hash('sha256', $bytes))) {
                    throw new \RuntimeException('Lampiran berubah sebelum dikirim.');
                }
                $part['data'] = base64_encode($bytes);
            }
            $this->throttle->reserve($delivery);
            $response = $this->waha->send($delivery->session, $delivery->target, $part);
            $httpStatus = $response->status();
            $retryAfter = filled($response->header('Retry-After')) ? $this->retryAfter($response->header('Retry-After')) : null;
            $messageId = $response->json('id');
            if ($response->successful() && is_string($messageId) && $messageId !== '') {
                $state = 'ACCEPTED';
                $error = null;
            } elseif (in_array($response->status(), [400, 401, 403, 404, 422], true)) {
                $state = 'FAILED';
                $error = 'WAHA menolak pengiriman (HTTP '.$response->status().'). Periksa konfigurasi atau tujuan.';
            } elseif ($response->status() === 429) {
                $rejections = (int) ($work['part']['rejections'] ?? 0) + 1;
                $state = $rejections < 3 ? 'PENDING' : 'FAILED';
                $error = 'Batas pengiriman WAHA tercapai.';
                $retryAfter ??= 60 + random_int(0, 10);
                $delay = $state === 'PENDING' ? $retryAfter : null;
            }
        } catch (Throwable) {
            $messageId = null;
        }

        $this->throttle->recordResult($delivery->session, $state, $httpStatus, $retryAfter);
        $nextWait = $this->throttle->wait($delivery);

        return DB::transaction(function () use ($delivery, $work, $state, $messageId, $error, $delay, $nextWait): ?int {
            $row = PickupWhatsappDelivery::whereKey($delivery->id)->lockForUpdate()->firstOrFail();
            $parts = $row->parts;
            $parts[$work['index']] = [...$parts[$work['index']], 'status' => $state, 'message_id' => is_string($messageId) ? $messageId : null];
            $historyIndex = array_key_last($parts[$work['index']]['attempt_history']);
            $parts[$work['index']]['attempt_history'][$historyIndex] = [...$parts[$work['index']]['attempt_history'][$historyIndex],
                'finished_at' => now()->toIso8601String(), 'status' => $state, 'message_id' => is_string($messageId) ? $messageId : null, 'error' => $error];
            if ($state === 'PENDING') {
                $parts[$work['index']]['rejections'] = (int) ($parts[$work['index']]['rejections'] ?? 0) + 1;
            }
            $complete = collect($parts)->every(fn (array $part): bool => $part['status'] === 'ACCEPTED');
            $waiting = ! $complete && $state === 'ACCEPTED' && $nextWait !== null;
            $row->update(['parts' => $parts, 'status' => $complete ? 'ACCEPTED' : ($waiting || $state === 'PENDING' ? 'WAITING' : ($state === 'ACCEPTED' ? 'READY' : $state)),
                'last_error' => $waiting ? $nextWait['reason'] : $error, 'accepted_at' => $complete ? now() : null]);

            return $complete || in_array($state, ['UNKNOWN', 'FAILED'], true) ? null : max($delay ?? 1, $nextWait['seconds'] ?? 1);
        }, 3);
    }

    private function retryAfter(?string $value): int
    {
        try {
            $seconds = is_numeric($value) ? (int) $value : (int) now()->diffInSeconds(CarbonImmutable::parse($value ?? ''), false);
        } catch (Throwable) {
            $seconds = 60;
        }

        return max(30, $seconds) + random_int(0, 10);
    }
}
