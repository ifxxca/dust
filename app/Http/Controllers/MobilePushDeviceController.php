<?php

namespace App\Http\Controllers;

use App\Models\MobilePushDevice;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MobilePushDeviceController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate(['installation_id' => ['required', 'uuid'], 'fcm_token' => ['required', 'string', 'min:20', 'max:4096', 'regex:/^[A-Za-z0-9_:\-]+$/']]);
        $token = $request->user()->currentAccessToken();
        $installation = strtolower($data['installation_id']);
        abort_unless(str_starts_with($token->name, 'mobile:'.$installation.':'), 403);
        DB::transaction(function () use ($request, $token, $installation, $data): void {
            $request->user()->newQuery()->whereKey($request->user()->id)->lockForUpdate()->firstOrFail();
            abort_unless($request->user()->tokens()->whereKey($token->id)->exists(), 401);
            $hash = hash('sha256', $data['fcm_token']);
            abort_if(MobilePushDevice::where('token_hash', $hash)->where('installation_id', '!=', $installation)->exists(), 409, 'Token push telah terdaftar pada instalasi lain.');
            MobilePushDevice::updateOrCreate(['installation_id' => $installation], [
                'user_id' => $request->user()->id, 'personal_access_token_id' => $token->id,
                'fcm_token' => $data['fcm_token'], 'token_hash' => $hash, 'is_active' => true,
            ]);
        });

        return response()->json(['data' => ['registered' => true], 'meta' => new \stdClass]);
    }
}
