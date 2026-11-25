<?php

namespace App\Http\Controllers;

use App\Actions\Pickup\DeliverPickupAwbManifest;
use App\Actions\Pickup\ManageWhatsappDelivery;
use App\Actions\Pickup\SendPickupReceipt;
use App\Actions\Pickup\ThrottleWhatsappDelivery;
use App\Actions\Pickup\WahaClient;
use App\Models\Customer;
use App\Models\PickupAwbManifest;
use App\Models\PickupTask;
use App\Models\PickupWhatsappDelivery;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use Throwable;

class DocumentDeliveryController extends Controller
{
    public function edit(Request $request, WahaClient $waha): Response
    {
        abort_unless($request->user()?->is_active && $request->user()->role === 'admin_supervisor', 403);
        $error = null;
        $sessions = [];
        try {
            if ($waha->configured()) {
                $sessions = $waha->sessions();
            }
        } catch (Throwable) {
            $error = 'WAHA belum dapat dihubungi. Periksa koneksi dan API key.';
        }

        return Inertia::render('settings/document-delivery', ['ready' => $waha->installed(), 'configured' => $waha->configured(),
            'settings' => $waha->settings(), 'sessions' => $sessions, 'connectionError' => $error,
            'limits' => config('services.waha.delivery'),
            'pause' => app(ThrottleWhatsappDelivery::class)->pause($waha->settings()['session'] ?? '')]);
    }

    public function update(Request $request, WahaClient $waha): RedirectResponse
    {
        abort_unless($request->user()?->is_active && $request->user()->role === 'admin_supervisor', 403);
        abort_unless($waha->installed(), 409, 'Migration pengiriman dokumen belum diaktifkan.');
        $data = $request->validate(['session' => ['nullable', 'string', 'max:100', 'regex:/^[a-zA-Z0-9_-]+$/'], 'enabled' => ['required', 'boolean'], 'expected_version' => ['required', 'integer', 'min:0']]);
        if ($data['enabled']) {
            try {
                $valid = filled($data['session'] ?? null) && $waha->working($data['session']);
            } catch (Throwable) {
                $valid = false;
            }
            if (! $valid) {
                throw ValidationException::withMessages(['session' => 'Pilih session WAHA yang sudah terhubung (WORKING).']);
            }
        }
        DB::transaction(function () use ($data): void {
            DB::table('document_delivery_settings')->insertOrIgnore(['id' => 1, 'enabled' => false, 'version' => 0, 'created_at' => now(), 'updated_at' => now()]);
            $row = DB::table('document_delivery_settings')->where('id', 1)->lockForUpdate()->first();
            abort_if($row->version !== $data['expected_version'], 409, 'Pengaturan berubah. Muat ulang sebelum menyimpan.');
            DB::table('document_delivery_settings')->where('id', 1)->update(['session' => $data['session'] ?? null, 'enabled' => $data['enabled'], 'version' => $row->version + 1, 'updated_at' => now()]);
        }, 3);

        return back()->with('success', 'Pengaturan pengiriman dokumen disimpan.');
    }

    public function groups(Request $request, WahaClient $waha): JsonResponse
    {
        abort_unless($request->user()?->is_active && $request->user()->canManagePickup(), 403);
        $data = $request->validate(['page' => ['nullable', 'integer', 'min:1', 'max:10000']]);
        $session = $waha->settings()['session'];
        abort_unless($session !== null && $session !== '', 422, 'Pilih session pengiriman pada Pengaturan terlebih dahulu.');
        try {
            $rows = $waha->groups($session, $data['page'] ?? 1);
        } catch (Throwable) {
            abort(503, 'Daftar grup belum dapat dimuat. Periksa koneksi WAHA.');
        }

        return response()->json(['data' => $rows, 'has_more' => count($rows) === 30]);
    }

    /** @return Builder<PickupAwbManifest> */
    private function manifests(PickupTask $task): Builder
    {
        $groupId = $task->processingReconciliation?->customer_reconciliation_id;

        return PickupAwbManifest::where('snapshot->customer_id', $task->customer_id)->where(function (Builder $query) use ($task, $groupId): void {
            $query->where('pickup_task_id', $task->id);
            if ($groupId) {
                $query->orWhere('customer_reconciliation_id', $groupId);
            }
        });
    }

    public function history(Request $request, PickupTask $task, WahaClient $waha): JsonResponse
    {
        abort_unless($request->user()?->is_active && $request->user()->can('view', $task), 404);
        $page = $request->validate(['page' => ['nullable', 'integer', 'min:1']]);
        if (! $waha->installed()) {
            return response()->json(['ready' => false, 'deliveries' => null, 'can_send' => false]);
        }
        $rows = PickupWhatsappDelivery::where('customer_id', $task->customer_id)->where(fn (Builder $query) => $query->where('pickup_task_id', $task->id)->orWhereIn('pickup_awb_manifest_id', $this->manifests($task)->select('id')))
            ->latest('id')->paginate(10, ['*'], 'page', $page['page'] ?? 1)->through(fn (PickupWhatsappDelivery $row): array => $row->summary());

        return response()->json(['ready' => true, 'deliveries' => $rows, 'can_send' => $request->user()->canManagePickup(),
            'receipt' => $task->proof?->receipt?->only(['status', 'recipient_statuses', 'last_error']),
            'email_recap' => $this->manifests($task)->with('deliveries')->latest('id')->first()?->deliveries->map->only(['channel', 'recipient', 'status', 'last_error', 'accepted_at']),
        ]);
    }

    public function send(Request $request, PickupTask $task, ManageWhatsappDelivery $whatsapp): JsonResponse
    {
        abort_unless($request->user()?->is_active && $request->user()->canManagePickup(), 403);
        abort_unless(app(WahaClient::class)->installed(), 409, 'Pengiriman WhatsApp belum diaktifkan.');
        $data = $request->validate(['document' => ['required', 'in:receipt,recap']]);
        $customer = Customer::findOrFail($task->customer_id);
        $options = $customer->documentDeliveryOptions();
        abort_unless($customer->is_active, 422, 'Customer tidak aktif.');
        abort_unless($options[$data['document'].'_email'] || $options[$data['document'].'_whatsapp'], 422, 'Pilih channel pengiriman pada customer terlebih dahulu.');
        if ($options[$data['document'].'_whatsapp']) {
            abort_if(blank(app(WahaClient::class)->settings()['session']) || blank($options['whatsapp_target']), 422, 'Session atau tujuan WhatsApp belum dipilih.');
        }
        if ($data['document'] === 'receipt') {
            abort_unless($task->proof?->finalized_at !== null, 422, 'POP belum final.');
            $whatsapp->queueReceipt($task->proof);
            if (Customer::findOrFail($task->customer_id)->documentDeliveryOptions()['receipt_email']) {
                app(SendPickupReceipt::class)->handle($request->user(), $task->id);
            }
        } else {
            $manifest = $this->manifests($task)->where('status', 'READY')->latest('id')->first();
            abort_unless($manifest !== null, 422, 'Rekap dokumen belum siap.');
            app(DeliverPickupAwbManifest::class)->queue($manifest);
        }

        return response()->json(['message' => 'Permintaan diproses sesuai pilihan channel customer. Pengiriman yang sudah berhasil tidak diulang.'], 202);
    }

    public function retry(Request $request, PickupTask $task, PickupWhatsappDelivery $delivery, ManageWhatsappDelivery $whatsapp): JsonResponse
    {
        abort_unless($request->user()?->is_active && $request->user()->canManagePickup(), 403);
        abort_unless($delivery->pickup_task_id === $task->id && $delivery->customer_id === $task->customer_id, 404);
        $whatsapp->retry($delivery);

        return response()->json(['message' => 'Bagian pengiriman yang gagal diantrekan ulang.'], 202);
    }
}
