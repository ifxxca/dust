<?php

namespace App\Actions\Mobile;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class FcmClient
{
    /** @param array<string, string> $data */
    public function send(string $token, array $data, int $ttl): bool
    {
        return $this->deliver($token, $data, $ttl, 'Pickup baru ditugaskan',
            'Anda memiliki tugas pickup baru. Ketuk untuk melihat detail tugas.', 'pickup-assigned-'.$data['event_id']);
    }

    public function sendTest(string $token, string $testId, int $recipientId, int $ttl): bool
    {
        return $this->deliver($token, ['type' => 'push_test', 'test_id' => $testId, 'recipient_id' => (string) $recipientId], $ttl,
            'Tes notifikasi Retail Operations', 'Ini adalah notifikasi uji dari Admin. Tidak ada perubahan pada tugas pickup.', 'push-test-'.$testId);
    }

    /** @param array<string, string> $data */
    private function deliver(string $token, array $data, int $ttl, string $title, string $body, string $tag): bool
    {
        $project = config('mobile_push.project_id');
        if (! is_string($project) || ! preg_match('/^[a-z0-9-]+$/', $project)) {
            throw new RuntimeException('FCM project is not configured.');
        }
        $response = Http::withToken($this->accessToken())->connectTimeout(5)->timeout(15)
            ->post('https://fcm.googleapis.com/v1/projects/'.$project.'/messages:send', ['message' => [
                'token' => $token,
                'notification' => ['title' => $title, 'body' => $body],
                'data' => $data,
                'android' => ['priority' => 'HIGH', 'ttl' => $ttl.'s', 'notification' => [
                    'channel_id' => 'pickup_assignments', 'tag' => $tag,
                ]],
            ]]);
        if ($response->successful()) {
            return true;
        }
        $details = $response->json('error.details', []);
        if (is_array($details)) {
            foreach ($details as $detail) {
                if (is_array($detail) && ($detail['errorCode'] ?? null) === 'UNREGISTERED') {
                    return false;
                }
            }
        }
        throw new RuntimeException('FCM send failed with HTTP '.$response->status().'.');
    }

    private function accessToken(): string
    {
        $path = config('mobile_push.credentials');
        if (! is_string($path) || ! is_readable($path)) {
            throw new RuntimeException('FCM credentials file is not available.');
        }
        $contents = file_get_contents($path);
        if ($contents === false) {
            throw new RuntimeException('FCM credentials file cannot be read.');
        }
        $credentials = json_decode($contents, true, flags: JSON_THROW_ON_ERROR);
        if (empty($credentials['client_email']) || empty($credentials['private_key']) || ($credentials['project_id'] ?? null) !== config('mobile_push.project_id')) {
            throw new RuntimeException('FCM credentials do not match the configured project.');
        }

        return Cache::remember('fcm-oauth:'.hash('sha256', $credentials['client_email'].$credentials['private_key']), 3000, function () use ($credentials): string {
            $encode = fn (string $value): string => rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
            $header = $encode(json_encode(['alg' => 'RS256', 'typ' => 'JWT'], JSON_THROW_ON_ERROR));
            $claims = $encode(json_encode(['iss' => $credentials['client_email'], 'scope' => 'https://www.googleapis.com/auth/firebase.messaging',
                'aud' => 'https://oauth2.googleapis.com/token', 'iat' => now()->timestamp, 'exp' => now()->addHour()->timestamp], JSON_THROW_ON_ERROR));
            $unsigned = $header.'.'.$claims;
            if (! openssl_sign($unsigned, $signature, $credentials['private_key'], OPENSSL_ALGO_SHA256)) {
                throw new RuntimeException('FCM credentials cannot sign the OAuth assertion.');
            }
            $response = Http::asForm()->connectTimeout(5)->timeout(15)->post('https://oauth2.googleapis.com/token', [
                'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion' => $unsigned.'.'.$encode($signature),
            ]);
            $accessToken = $response->json('access_token');
            if (! $response->successful() || ! is_string($accessToken) || $accessToken === '') {
                throw new RuntimeException('FCM OAuth authorization failed.');
            }

            return $accessToken;
        });
    }
}
