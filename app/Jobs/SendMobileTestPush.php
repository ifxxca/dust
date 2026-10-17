<?php

namespace App\Jobs;

use App\Actions\Mobile\FcmClient;
use App\Models\MobilePushDevice;
use App\Models\User;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

class SendMobileTestPush implements ShouldQueue
{
    use Queueable;

    public const int STATUS_TTL = 1800;

    public int $tries = 1;

    public int $timeout = 60;

    public bool $failOnTimeout = true;

    public function __construct(public int $adminId, public int $deviceId, public int $recipientId, public int $tokenId, public string $testId) {}

    public static function cacheKey(int $adminId, string $testId): string
    {
        return 'mobile-push-test:'.$adminId.':'.$testId;
    }

    /**
     * Execute the job.
     */
    public function handle(FcmClient $fcm): void
    {
        $key = self::cacheKey($this->adminId, $this->testId);
        $result = Cache::get($key);
        if (! is_array($result) || $result['status'] !== 'queued' || ! Cache::add($key.':claimed', true, self::STATUS_TTL)) {
            return;
        }
        $admin = User::find($this->adminId);
        $device = MobilePushDevice::with(['user', 'personalAccessToken'])->find($this->deviceId);
        $token = $device?->activeMobileToken($device->user);
        if (! config('mobile_push.enabled') || ! $admin?->is_active || $admin->role !== 'admin_supervisor'
            || ! $token || $token->id !== $this->tokenId || $device->user_id !== $this->recipientId) {
            $this->record('skipped');

            return;
        }
        $this->record('attempted');
        try {
            $ttl = max(1, min(300, (int) now()->diffInSeconds($token->expires_at, false),
                (int) now()->diffInSeconds($token->created_at->addMinutes((int) config('sanctum.expiration')), false)));
            $sent = $fcm->sendTest($device->fcm_token, $this->testId, $this->recipientId, $ttl);
            if (! $sent) {
                MobilePushDevice::whereKey($device->id)->where('token_hash', $device->token_hash)
                    ->where('personal_access_token_id', $this->tokenId)->update(['is_active' => false]);
            }
            $this->record($sent ? 'accepted' : 'unregistered');
        } catch (Throwable) {
            $this->record('failed_or_uncertain');
        }
    }

    public function failed(?Throwable $exception): void
    {
        $result = Cache::get(self::cacheKey($this->adminId, $this->testId));
        if (is_array($result) && in_array($result['status'], ['queued', 'attempted'], true)) {
            $this->record('failed_or_uncertain');
        }
    }

    private function record(string $status): void
    {
        $key = self::cacheKey($this->adminId, $this->testId);
        $result = Cache::get($key);
        if (! is_array($result)) {
            return;
        }
        Cache::put($key, [...$result, 'status' => $status, 'updated_at' => now()->toIso8601String()], self::STATUS_TTL);
        Log::info('Admin push test status.', ['actor_id' => $this->adminId, 'device_id' => $this->deviceId, 'test_id' => $this->testId, 'status' => $status]);
    }
}
