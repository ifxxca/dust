<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\PickupSchedule;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class PickupScheduleController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->canManagePickup(), 403);
        $data = $request->validate(['q' => ['nullable', 'string', 'max:100'], 'page' => ['sometimes', 'integer', 'min:1']]);
        $schedules = PickupSchedule::with('customer')->withCount('tasks')->when($data['q'] ?? null, fn ($query, $search) => $query->whereHas('customer', fn ($customers) => $customers->where('name', 'like', '%'.addcslashes($search, '%_\\').'%')))->latest('id')->paginate(20);

        return response()->json(['data' => $schedules->items(), 'meta' => ['current_page' => $schedules->currentPage(), 'last_page' => $schedules->lastPage(), 'generation_policy' => config('pickup.generation_policy')]]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()->canManagePickup(), 403);
        $data = $request->validate($this->rules());
        $schedule = DB::transaction(function () use ($request, $data) {
            $actor = User::whereKey($request->user()->id)->lockForUpdate()->firstOrFail();
            abort_unless($actor->canManagePickup(), 403);
            $customer = Customer::whereKey($data['customer_id'])->lockForUpdate()->firstOrFail();
            if ($data['is_active'] && ! $customer->is_active) {
                throw ValidationException::withMessages(['customer_id' => 'Customer tidak aktif. Jadwal tidak dapat diaktifkan.']);
            }
            if ($data['is_active'] && blank($customer->contact)) {
                throw ValidationException::withMessages(['customer_id' => 'Lengkapi kontak customer sebelum mengaktifkan jadwal pickup.']);
            }

            return PickupSchedule::create([...$data, 'timezone' => config('pickup.timezone'), 'created_by' => $actor->id]);
        }, 3);

        return response()->json(['data' => $schedule->load('customer')], 201);
    }

    public function update(Request $request, PickupSchedule $schedule): JsonResponse
    {
        abort_unless($request->user()->canManagePickup(), 403);
        $data = $request->validate([...$this->rules(), 'expected_version' => ['required', 'integer', 'min:1']]);
        $result = DB::transaction(function () use ($request, $schedule, $data) {
            $actor = User::whereKey($request->user()->id)->lockForUpdate()->firstOrFail();
            abort_unless($actor->canManagePickup(), 403);
            $current = PickupSchedule::whereKey($schedule->id)->lockForUpdate()->firstOrFail();
            abort_if($current->version !== (int) $data['expected_version'], 409, 'SCHEDULE_STALE: Muat ulang jadwal.');
            $customer = Customer::whereKey($data['customer_id'])->lockForUpdate()->firstOrFail();
            if ($data['is_active'] && ! $customer->is_active) {
                throw ValidationException::withMessages(['customer_id' => 'Customer tidak aktif. Jadwal tidak dapat diaktifkan.']);
            }
            if ($data['is_active'] && blank($customer->contact)) {
                throw ValidationException::withMessages(['customer_id' => 'Lengkapi kontak customer sebelum mengaktifkan jadwal pickup.']);
            }
            unset($data['expected_version']);
            $current->update([...$data, 'updated_by' => $actor->id, 'version' => $current->version + 1]);

            return $current;
        }, 3);

        return response()->json(['data' => $result->load('customer')]);
    }

    /** @return array<string, array<int, mixed>> */
    private function rules(): array
    {
        return ['customer_id' => ['required', 'integer', Rule::exists('customers', 'id')], 'pickup_address' => ['required', 'string', 'max:2000'], 'weekdays' => ['required', 'array', 'min:1', 'max:7'], 'weekdays.*' => ['required', 'integer', 'between:1,7', 'distinct'], 'pickup_time' => ['required', 'date_format:H:i'], 'starts_on' => ['required', 'date_format:Y-m-d'], 'ends_on' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:starts_on'], 'notes' => ['nullable', 'string', 'max:5000'], 'is_active' => ['required', 'boolean']];
    }
}
