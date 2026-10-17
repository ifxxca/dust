<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreCustomerRequest;
use App\Http\Requests\UpdateCustomerRequest;
use App\Http\Resources\CustomerResource;
use App\Models\Customer;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class CustomerController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        abort_unless($request->user()->is_active && in_array($request->user()->role, ['cs', 'admin_supervisor', 'pickup_staff'], true), 403);
        $data = $request->validate(['q' => ['nullable', 'string', 'max:100'], 'page' => ['sometimes', 'integer', 'min:1'], 'active_only' => ['sometimes', 'boolean'], 'is_active' => ['sometimes', 'boolean']]);
        $activeOnly = $request->user()->role === 'pickup_staff' || $request->boolean('active_only');

        return CustomerResource::collection(Customer::query()
            ->when($activeOnly, fn ($query) => $query->where('is_active', true))
            ->when(array_key_exists('is_active', $data), fn ($query) => $query->where('is_active', $request->boolean('is_active')))
            ->when($data['q'] ?? null, function ($query, $search): void {
                $value = '%'.addcslashes($search, '%_\\').'%';
                $query->where(function ($match) use ($value): void {
                    $match->where('name', 'like', $value)->orWhere('customer_code', 'like', $value)->orWhere('email', 'like', $value)->orWhere('phone', 'like', $value)->orWhere('contact', 'like', $value)->orWhere('pickup_address', 'like', $value);
                });
            })
            ->orderBy('name')->orderBy('id')->paginate(20));
    }

    public function store(StoreCustomerRequest $request): CustomerResource
    {
        $data = $request->safe()->only(['name', 'pickup_address', 'contact', 'customer_code', 'email', 'phone', 'latitude', 'longitude', 'is_active']);
        try {
            $customer = DB::transaction(function () use ($request, $data): Customer {
                $actor = User::whereKey($request->user()->id)->lockForUpdate()->firstOrFail();
                abort_unless($actor->canManagePickup(), 403);

                return Customer::create([...$data, 'contact' => $data['contact'] ?? $data['email'] ?? $data['phone'], 'customer_code' => $data['customer_code'] ?? 'CUST-'.Str::ulid(), 'created_by' => $actor->id])->refresh();
            }, 3);
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages(['customer_code' => 'Kode customer sudah digunakan.']);
        }

        return new CustomerResource($customer);
    }

    public function update(UpdateCustomerRequest $request, Customer $customer): CustomerResource
    {
        $data = $request->safe()->only(['name', 'pickup_address', 'contact', 'customer_code', 'email', 'phone', 'latitude', 'longitude', 'is_active']);
        abort_if($data === [], 422, 'Isi perubahan customer yang ingin disimpan.');
        try {
            $updated = DB::transaction(function () use ($request, $customer, $data): Customer {
                $actor = User::whereKey($request->user()->id)->lockForUpdate()->firstOrFail();
                abort_unless($actor->canManagePickup(), 403);
                $current = Customer::whereKey($customer->id)->lockForUpdate()->firstOrFail();
                abort_if($current->version !== $request->integer('expected_version'), 409, 'CUSTOMER_STALE: Data customer berubah. Muat ulang sebelum menyimpan.');
                if (array_key_exists('contact', $data) && $data['contact'] === null) {
                    $email = array_key_exists('email', $data) ? $data['email'] : $current->email;
                    $phone = array_key_exists('phone', $data) ? $data['phone'] : $current->phone;
                    $data['contact'] = $email ?: $phone;
                    if (blank($data['contact'])) {
                        throw ValidationException::withMessages(['contact' => 'Isi kontak pickup, email, atau nomor telepon.']);
                    }
                }
                $current->update([...$data, 'updated_by' => $actor->id, 'version' => $current->version + 1]);
                Log::info('Customer updated', ['actor_id' => $actor->id, 'customer_id' => $current->id, 'version' => $current->version, 'is_active' => $current->is_active]);

                return $current;
            }, 3);
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages(['customer_code' => 'Kode customer sudah digunakan.']);
        }

        return new CustomerResource($updated);
    }
}
