<?php

namespace App\Http\Controllers;

use App\Actions\Pickup\ManageUserHybridAccount;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class OperationalUserController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->role === 'admin_supervisor', 403);
        $data = $request->validate(['q' => ['nullable', 'string', 'max:100'], 'page' => ['sometimes', 'integer', 'min:1']]);
        $users = User::query()->when($data['q'] ?? null, fn ($query, $search) => $query->where('name', 'like', addcslashes($search, '%_\\').'%'))
            ->select(['id', 'name', 'email', 'role', 'is_active', 'hybrid_username'])
            ->selectRaw('hybrid_password IS NOT NULL as hybrid_configured')
            ->orderBy('name')->orderBy('id')->paginate(20);

        return response()->json(['data' => $users->getCollection()->map(fn (User $user): array => [...$user->only(['id', 'name', 'email', 'role', 'is_active', 'hybrid_username']), 'hybrid_configured' => (bool) $user->hybrid_configured]), 'meta' => ['current_page' => $users->currentPage(), 'last_page' => $users->lastPage(), 'total' => $users->total()]]);
    }

    public function hybrid(Request $request, User $user, ManageUserHybridAccount $accounts): JsonResponse
    {
        abort_unless($request->user()->role === 'admin_supervisor', 403);
        $this->validateKeys($request, ['hybrid_username', 'hybrid_password', 'remove']);
        $data = $request->validate(['remove' => ['sometimes', 'boolean'],
            'hybrid_username' => ['required_unless:remove,true', 'nullable', 'string', 'max:100', 'regex:/^[A-Za-z0-9_.@-]+$/D'],
            'hybrid_password' => ['nullable', 'string', 'max:255']]);
        $result = $accounts->handle($request->user(), $user, $data);

        return response()->json(['data' => ['id' => $result->id, 'hybrid_username' => $result->hybrid_username, 'hybrid_configured' => $result->hybrid_password !== null], 'meta' => []]);
    }

    public function staff(Request $request): JsonResponse
    {
        abort_unless($request->user()->canManagePickup(), 403);

        return response()->json(['data' => User::whereIn('role', User::PICKUP_ROLES)->where('is_active', true)->orderBy('name')->get(['id', 'name']), 'meta' => []]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()->role === 'admin_supervisor', 403);
        $this->validateKeys($request, ['name', 'email', 'password', 'password_confirmation', 'role', 'is_active']);
        $data = $request->validate(['name' => ['required', 'string', 'max:255'], 'email' => ['required', 'email', 'lowercase', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', Password::defaults(), 'confirmed'],
            'role' => ['required', Rule::in(User::ROLES)], 'is_active' => ['required', 'boolean']]);
        try {
            $user = User::create(Arr::except($data, ['password_confirmation']));
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages(['email' => 'Email sudah digunakan.']);
        }
        Log::info('Operational account created', ['actor_id' => $request->user()->id, 'user_id' => $user->id]);

        return response()->json(['data' => $user->only(['id', 'name', 'email', 'role', 'is_active']), 'meta' => []], 201);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        abort_unless($request->user()->role === 'admin_supervisor', 403);
        $this->validateKeys($request, ['role', 'is_active']);
        $data = $request->validate(['role' => ['sometimes', 'required', Rule::in(User::ROLES)], 'is_active' => ['sometimes', 'required', 'boolean']]);
        abort_if($data === [], 422, 'Pilih role atau status aktif.');
        abort_if($user->id === $request->user()->id, 409, 'Anda tidak dapat mengubah akses akun sendiri.');
        $updated = DB::transaction(function () use ($user, $data, $request) {
            $locked = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            $losesOwnership = ($data['is_active'] ?? $locked->is_active) === false || ! in_array($data['role'] ?? $locked->role, User::PICKUP_ROLES, true);
            abort_if($losesOwnership && PickupTask::where('assigned_staff_id', $locked->id)->where('status', 'ASSIGNED')->exists(), 409, 'USER_HAS_ASSIGNED_TASKS: Alihkan tugas sebelum mengubah akses petugas.');
            $previous = $locked->only(['role', 'is_active']);
            $locked->update($data);
            Log::info('Operational account updated', ['actor_id' => $request->user()->id, 'user_id' => $locked->id, 'previous' => $previous, 'new' => $data]);

            return $locked;
        });

        return response()->json(['data' => $updated->only(['id', 'name', 'email', 'role', 'is_active']), 'meta' => []]);
    }

    /** @param list<string> $allowed */
    private function validateKeys(Request $request, array $allowed): void
    {
        $unknown = array_diff(array_keys($request->all()), [...$allowed, '_token']);
        if ($unknown !== []) {
            throw ValidationException::withMessages(array_fill_keys($unknown, 'Field tidak diizinkan.'));
        }
    }
}
