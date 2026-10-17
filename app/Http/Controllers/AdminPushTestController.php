<?php

namespace App\Http\Controllers;

use App\Http\Requests\SendPushTestRequest;
use App\Jobs\SendMobileTestPush;
use App\Models\MobilePushDevice;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;
use Inertia\Response;
use Throwable;

class AdminPushTestController extends Controller
{
    public function page(Request $request): Response
    {
        $this->authorizeAdmin($request);

        return Inertia::render('push-test', ['enabled' => (bool) config('mobile_push.enabled'), 'configured' => $this->configured()]);
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);
        $data = $request->validate(['q' => ['nullable', 'string', 'max:100'], 'page' => ['sometimes', 'integer', 'min:1']]);
        $devices = MobilePushDevice::with(['user:id,name,role,is_active', 'personalAccessToken'])
            ->whereHas('user', fn ($query) => $query->where('role', 'pickup_staff')->where('is_active', true)
                ->when($data['q'] ?? null, fn ($query, $search) => $query->where('name', 'like', '%'.addcslashes($search, '%_\\').'%')))
            ->orderByDesc('updated_at')->orderByDesc('id')->paginate(20);

        return response()->json(['data' => $devices->map(fn (MobilePushDevice $device) => [
            'id' => $device->id, 'staff_name' => $device->user->name, 'device_label' => 'Android · '.substr($device->installation_id, -8),
            'eligible' => $device->activeMobileToken($device->user) !== null, 'updated_at' => $device->updated_at->toIso8601String(),
        ]), 'meta' => ['current_page' => $devices->currentPage(), 'last_page' => $devices->lastPage(), 'total' => $devices->total()]]);
    }

    public function store(SendPushTestRequest $request): JsonResponse
    {
        $deviceId = $request->integer('device_id');
        $id = strtolower($request->string('submission_key')->toString());
        $key = SendMobileTestPush::cacheKey($request->user()->id, $id);
        $existing = Cache::get($key);
        if (is_array($existing)) {
            abort_if($existing['device_id'] !== $deviceId, 409, 'TEST_KEY_CONFLICT: Buat tes baru untuk perangkat yang berbeda.');

            return response()->json(['data' => $existing]);
        }
        abort_unless(config('mobile_push.enabled') && $this->configured(), 409, 'PUSH_NOT_CONFIGURED: Firebase backend belum diaktifkan atau dikonfigurasi.');
        $device = MobilePushDevice::with(['user', 'personalAccessToken'])->findOrFail($deviceId);
        $token = $device->activeMobileToken($device->user);
        abort_unless($token !== null, 409, 'DEVICE_NOT_ELIGIBLE: Login ulang pada akun Pickup Staff dan aktifkan notifikasi di perangkat.');
        $result = ['request_id' => $id, 'device_id' => $deviceId, 'status' => 'queued', 'updated_at' => now()->toIso8601String()];
        if (Cache::add($key, $result, SendMobileTestPush::STATUS_TTL)) {
            try {
                SendMobileTestPush::dispatch($request->user()->id, $deviceId, $device->user_id, $token->id, $id)
                    ->onConnection(config('mobile_push.queue_connection'))->onQueue('mobile-push');
                Log::info('Admin push test queued.', ['actor_id' => $request->user()->id, 'device_id' => $deviceId, 'test_id' => $id]);
            } catch (Throwable) {
                $result['status'] = 'queue_failed';
                Cache::put($key, $result, SendMobileTestPush::STATUS_TTL);
                Log::warning('Admin push test could not be queued.', ['actor_id' => $request->user()->id, 'test_id' => $id]);
            }
        }
        $result = Cache::get($key);
        abort_unless(is_array($result) && $result['device_id'] === $deviceId, 409, 'TEST_KEY_CONFLICT: Periksa tes sebelumnya.');

        return response()->json(['data' => $result], $result['status'] === 'queued' ? 202 : 200);
    }

    public function show(Request $request, string $testId): JsonResponse
    {
        $this->authorizeAdmin($request);
        $result = Cache::get(SendMobileTestPush::cacheKey($request->user()->id, strtolower($testId)));
        abort_unless(is_array($result), 404, 'Hasil tes tidak tersedia atau sudah melewati masa simpan 30 menit. Jangan menganggapnya gagal; periksa perangkat sebelum membuat tes baru.');

        return response()->json(['data' => $result]);
    }

    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()?->is_active && $request->user()->role === 'admin_supervisor', 403);
    }

    private function configured(): bool
    {
        $path = config('mobile_push.credentials');
        $project = config('mobile_push.project_id');

        return is_string($project) && preg_match('/^[a-z0-9-]+$/', $project) === 1 && is_string($path) && is_readable($path);
    }
}
