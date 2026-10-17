<?php

namespace App\Http\Controllers;

use App\Http\Requests\MobileLoginRequest;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class MobileTokenController extends Controller
{
    public function store(MobileLoginRequest $request): JsonResponse
    {
        $data = $request->validated();
        $result = DB::transaction(function () use ($data): array {
            $user = User::where('email', strtolower($data['email']))->lockForUpdate()->first();
            if (! $user || ! Hash::check($data['password'], $user->password) || ! $user->is_active) {
                throw ValidationException::withMessages(['email' => 'Email atau password tidak sesuai, atau akun tidak aktif.']);
            }
            abort_unless($user->canExecutePickup(), 403, 'Akun belum memiliki akses operasional mobile.');
            $prefix = 'mobile:'.strtolower($data['device_id']).':';
            $user->tokens()->where('name', 'like', $prefix.'%')->delete();
            $expiresAt = now()->addHours(24);
            $abilities = $user->role === 'pickup_staff'
                ? ['mobile:read', 'mobile:execute', 'mobile:handover']
                : ['mobile:read', 'mobile:handover'];
            $token = $user->createToken($prefix.$data['device_name'], $abilities, $expiresAt);

            return ['token' => $token->plainTextToken, 'token_type' => 'Bearer', 'expires_at' => $expiresAt->toIso8601String(),
                'user' => $user->only(['id', 'name', 'role', 'is_active'])];
        }, 3);

        return response()->json(['data' => $result, 'meta' => ['operational_timezone' => config('pickup.timezone')]], 201)
            ->header('Cache-Control', 'no-store');
    }

    public function destroy(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['data' => null, 'meta' => new \stdClass])->header('Cache-Control', 'no-store');
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['data' => $request->user()->only(['id', 'name', 'role', 'is_active']),
            'meta' => ['operational_timezone' => config('pickup.timezone')]])->header('Cache-Control', 'no-store');
    }
}
