<?php

namespace App\Http\Controllers;

use App\Actions\Pickup\ExtractPickupAwbDetails;
use App\Actions\Pickup\QueryCustomerPortal;
use App\Http\Requests\CustomerPortalRequest;
use App\Models\Customer;
use App\Models\JneShipment;
use App\Models\PickupAttachment;
use App\Models\PickupAwbManifest;
use App\Models\PickupCustomerReconciliation;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rules\Password;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;

class CustomerPortalController extends Controller
{
    public function __construct(private QueryCustomerPortal $query) {}

    private function customer(Request $request): ?Customer
    {
        $user = $request->user();
        abort_unless($user?->is_active && in_array($user->role, ['admin_supervisor', 'customer'], true), 403);
        if ($user->role === 'customer') {
            abort_unless($user->hasVerifiedEmail(), 403, 'Verifikasi alamat email terlebih dahulu.');
            abort_unless($user->customer_id, 403, 'Akun belum dihubungkan ke customer. Hubungi admin.');
            abort_if($request->filled('customer_id') && $request->integer('customer_id') !== (int) $user->customer_id, 404);
            $customer = Customer::whereKey($user->customer_id)->where('is_active', true)->first();
            abort_unless($customer, 403, 'Akses customer tidak aktif. Hubungi admin.');

            return $customer;
        }

        return $request->filled('customer_id') ? Customer::findOrFail($request->integer('customer_id')) : null;
    }

    public function dashboard(CustomerPortalRequest $request): Response
    {
        return $this->page($request, 'dashboard');
    }

    public function monitoring(CustomerPortalRequest $request): Response
    {
        return $this->page($request, 'monitoring');
    }

    public function history(CustomerPortalRequest $request): Response
    {
        return $this->page($request, 'history');
    }

    private function page(CustomerPortalRequest $request, string $section): Response
    {
        $customer = $this->customer($request);
        $filters = $this->query->filters($request->validated());

        return Inertia::render('customer-portal-'.$section, ['section' => $section, 'customer' => $customer?->only(['id', 'name', 'customer_code']), 'filters' => $filters,
            'summary' => $customer && $section === 'dashboard' ? $this->query->summary($customer, $filters) : null,
            'shipments' => $customer && $section === 'monitoring' ? $this->query->monitoring($customer, $filters) : null,
            'pickups' => $customer && $section === 'history' ? $this->query->history($customer, $filters) : null,
            'isAdmin' => $request->user()->role === 'admin_supervisor']);
    }

    public function shipment(CustomerPortalRequest $request, JneShipment $shipment): JsonResponse
    {
        $customer = $this->customer($request);
        abort_unless($customer && $shipment->customer_id === $customer->id && $shipment->customer_match_status === 'MATCHED', 404);
        $source = $shipment->latestSource;
        $row = $this->query->shipments($customer)->where('s.id', $shipment->id)->select('r.picked_up_at')->selectRaw($this->query->amountSql().' AS amount_cents')->first();
        $pickup = $shipment->pickup_task_id ? PickupTask::whereKey($shipment->pickup_task_id)->where('customer_id', $customer->id)->first(['id', 'reference']) : null;
        $details = app(ExtractPickupAwbDetails::class)->handle($source, $shipment->category_status === 'MATCHED' ? $shipment->category : null);

        return response()->json(['awb' => $shipment->awb, 'shipper' => $source?->shipper_name, 'consignee' => $source?->consignee_name,
            'address' => $details['consignee_address'], 'district' => $details['consignee_district'],
            'category' => $shipment->category, 'weight_grams' => $source?->weight_grams, 'quantity' => $source?->quantity,
            'delivered_at' => $source?->delivered_at, 'status_at' => $source?->source_status_at?->toIso8601String(),
            'history' => $this->query->shipmentHistory($shipment),
            'status' => $shipment->tracking_status, 'status_text' => $source?->status_web, 'entry_at' => $source?->entry_at?->toIso8601String(),
            'picked_up_at' => $row?->picked_up_at,
            'observed_at' => $shipment->last_observed_at?->toIso8601String(), 'service' => $source?->service, 'destination' => $source === null ? null : ($source->destination_name ?? $source->destination),
            'amount_cents' => $row?->amount_cents === null ? null : (int) $row->amount_cents, 'pickup' => $pickup]);
    }

    public function pickup(CustomerPortalRequest $request, PickupTask $task): JsonResponse
    {
        $customer = $this->customer($request);
        abort_unless($customer && $task->customer_id === $customer->id && $task->proof?->finalized_at, 404);
        $task->loadMissing(['assignedStaff:id,name', 'proof.revisions', 'proof.attachments', 'handoverItem.revisions', 'processingReconciliation']);
        $group = PickupCustomerReconciliation::where('customer_id', $customer->id)->whereKey($task->processingReconciliation?->customer_reconciliation_id)->first();
        $manifests = PickupAwbManifest::where('status', 'READY')->where(function ($q) use ($task, $group): void {
            $q->where('pickup_task_id', $task->id);
            if ($group) {
                $q->orWhere('customer_reconciliation_id', $group->id);
            }
        })->where('snapshot->customer_id', $customer->id)->orderByDesc('revision')->limit(5)->get(['id', 'revision', 'created_at']);

        return response()->json(['pickup' => $this->query->pickupRow($task, $this->query->pickupAmounts($customer, [$task->id])[$task->id] ?? null),
            'shipments' => $this->query->monitoring($customer, $this->query->filters([]), $task->id), 'manifests' => $manifests,
            'attachments' => $task->proof->attachments->map->only(['id', 'kind']), 'notes' => $task->proof->effectiveValues()['notes'] ?? null]);
    }

    public function download(CustomerPortalRequest $request, PickupAwbManifest $manifest, string $format): StreamedResponse
    {
        $customer = $this->customer($request);
        abort_unless($customer && (int) ($manifest->snapshot['customer_id'] ?? 0) === $customer->id
            && PickupTask::whereKey($manifest->pickup_task_id)->where('customer_id', $customer->id)->exists(), 404);
        abort_unless($manifest->status === 'READY' && in_array($format, ['pdf', 'xlsx'], true), 404);
        $path = $manifest->getAttribute($format.'_path');
        abort_unless(is_string($path) && Storage::disk('local')->exists($path), 404);
        abort_unless(hash_equals($manifest->checksums[$format] ?? '', hash('sha256', Storage::disk('local')->get($path))), 409, 'Dokumen perlu diperiksa ulang. Hubungi admin.');

        return Storage::disk('local')->download($path, $manifest->downloadFilename($format), ['Cache-Control' => 'private, no-store']);
    }

    public function attachment(CustomerPortalRequest $request, PickupAttachment $attachment): BinaryFileResponse
    {
        $customer = $this->customer($request);
        $proof = PickupRecord::findOrFail($attachment->pickup_record_id);
        abort_unless($customer && $proof->finalized_at && PickupTask::whereKey($proof->pickup_task_id)->where('customer_id', $customer->id)->exists(), 404);
        abort_unless(Storage::disk('local')->exists($attachment->path), 404);

        return response()->file(Storage::disk('local')->path($attachment->path), ['Content-Type' => $attachment->mime_type, 'Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff']);
    }

    public function accounts(Request $request): Response
    {
        abort_unless($request->user()?->role === 'admin_supervisor' && $request->user()->is_active, 403);
        $request->validate(['customer_id' => ['nullable', 'integer', 'min:1']]);
        $customer = $request->filled('customer_id') ? Customer::findOrFail($request->integer('customer_id')) : null;
        $ready = Schema::hasColumn('users', 'customer_id');

        return Inertia::render('customer-portal-accounts', ['customer' => $customer?->only(['id', 'name', 'customer_code']), 'ready' => $ready,
            'accounts' => $ready && $customer ? User::where('role', 'customer')->where('customer_id', $customer->id)->orderBy('name')->get(['id', 'name', 'email', 'is_active', 'email_verified_at']) : []]);
    }

    public function storeAccount(Request $request): RedirectResponse
    {
        abort_unless($request->user()?->role === 'admin_supervisor' && $request->user()->is_active, 403);
        abort_unless(Schema::hasColumn('users', 'customer_id'), 409, 'Akses customer belum diaktifkan. Hubungi pengelola sistem.');
        $data = $request->validate(['customer_id' => ['required', 'integer', 'exists:customers,id'], 'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'lowercase', 'max:255', 'unique:users,email'], 'password' => ['required', 'confirmed', Password::defaults()]]);
        abort_unless(Customer::whereKey($data['customer_id'])->where('is_active', true)->exists(), 422, 'Customer tidak aktif.');
        $user = User::create([...array_diff_key($data, ['password_confirmation' => true]), 'role' => 'customer', 'is_active' => true]);
        Log::info('Customer portal account created', ['actor_id' => $request->user()->id, 'user_id' => $user->id, 'customer_id' => $user->customer_id]);

        return back()->with('success', 'Akun dibuat. Customer perlu memverifikasi email setelah login.');
    }

    public function updateAccount(Request $request, User $user): RedirectResponse
    {
        abort_unless($request->user()?->role === 'admin_supervisor' && $request->user()->is_active, 403);
        abort_unless($user->role === 'customer', 404);
        $data = $request->validate(['is_active' => ['required', 'boolean']]);
        $user->update($data);
        Log::info('Customer portal access changed', ['actor_id' => $request->user()->id, 'user_id' => $user->id, 'is_active' => $user->is_active]);

        return back()->with('success', 'Akses portal diperbarui.');
    }
}
