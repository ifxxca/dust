<?php

namespace App\Actions\Pickup;

use App\Models\PickupWhatsappDelivery;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\RateLimiter;

class ThrottleWhatsappDelivery
{
    /** @return array{seconds: int, reason: string}|null */
    public function wait(PickupWhatsappDelivery $delivery): ?array
    {
        $local = now()->timezone('Asia/Jakarta');
        $start = $local->copy()->startOfDay()->addHours((int) config('services.waha.delivery.start_hour', 8));
        $end = $local->copy()->startOfDay()->addHours((int) config('services.waha.delivery.end_hour', 20));
        if ($local->lt($start) || $local->gte($end)) {
            $next = $local->lt($start) ? $start : $start->addDay();

            return ['seconds' => max(1, (int) ceil($local->diffInSeconds($next))), 'reason' => 'Menunggu jam kirim '.$next->format('d-m-Y H:i').' WIB.'];
        }
        $pause = $this->pause($delivery->session);
        if ($pause !== null) {
            return ['seconds' => max(1, $pause['until'] - now()->getTimestamp()), 'reason' => $pause['reason']];
        }
        foreach ($this->quotas($delivery) as $quota) {
            if (RateLimiter::tooManyAttempts($quota['key'], $quota['limit'])) {
                return ['seconds' => max(1, RateLimiter::availableIn($quota['key'])) + random_int(1, 10), 'reason' => 'Menunggu kuota pengiriman '.$quota['label'].'.'];
            }
        }
        $next = max((int) Cache::get($this->key('gap', $delivery->session), 0), (int) Cache::get($this->key('recipient-gap', $delivery->target), 0));
        if ($next > now()->getTimestamp()) {
            return ['seconds' => $next - now()->getTimestamp(), 'reason' => 'Menunggu jeda pengiriman session atau penerima.'];
        }

        return null;
    }

    public function reserve(PickupWhatsappDelivery $delivery): void
    {
        foreach ($this->quotas($delivery) as $quota) {
            RateLimiter::hit($quota['key'], $quota['seconds']);
        }
        $gap = random_int(30, 60);
        Cache::put($this->key('gap', $delivery->session), now()->getTimestamp() + $gap, $gap);
        Cache::put($this->key('recipient-gap', $delivery->target), now()->getTimestamp() + $gap, $gap);
    }

    public function connectionUnavailable(string $session): void
    {
        $this->hold($session, 60, 'Menunggu session WhatsApp dan koneksi WAHA pulih. Belum ada pesan dikirim.');
    }

    public function recordResult(string $session, string $state, ?int $httpStatus, ?int $retryAfter): void
    {
        if ($retryAfter !== null) {
            $this->hold($session, $retryAfter, 'Session menunggu Retry-After dari WAHA.');
        }
        if ($state === 'ACCEPTED') {
            RateLimiter::clear($this->key('failures', $session));
        } elseif ($httpStatus === 429) {
            $this->hold($session, max(30, $retryAfter ?? 60), 'Session dijeda karena batas WAHA. Menunggu Retry-After.');
        } elseif (in_array($httpStatus, [401, 403], true)) {
            $this->hold($session, max(1800, $retryAfter ?? 0), 'Session dijeda 30 menit atau mengikuti Retry-After karena akses ditolak. Periksa WAHA.');
        } elseif ($state === 'UNKNOWN' && RateLimiter::hit($this->key('failures', $session), 3600) >= 3) {
            $this->hold($session, 900, 'Session dijeda 15 menit karena tiga hasil kirim belum pasti. Periksa koneksi dan hasil WhatsApp.');
        }
    }

    /** @return array{until: int, reason: string}|null */
    public function pause(string $session): ?array
    {
        $pause = Cache::get($this->key('pause', $session));

        return is_array($pause) && is_int($pause['until'] ?? null) && is_string($pause['reason'] ?? null) && $pause['until'] > now()->getTimestamp()
            ? ['until' => $pause['until'], 'reason' => $pause['reason']] : null;
    }

    private function hold(string $session, int $seconds, string $reason): void
    {
        $until = max(now()->getTimestamp() + $seconds, $this->pause($session)['until'] ?? 0);
        Cache::put($this->key('pause', $session), ['until' => $until, 'reason' => $reason], $until - now()->getTimestamp());
    }

    /** @return list<array{key: string, limit: int, seconds: int, label: string}> */
    private function quotas(PickupWhatsappDelivery $delivery): array
    {
        $quotas = [];
        foreach (['hourly' => 3600, 'daily' => 86400] as $period => $seconds) {
            $quotas[] = ['key' => $this->key('recipient:'.$period, $delivery->target),
                'limit' => max(1, (int) config('services.waha.delivery.recipient_'.$period.'_limit', $period === 'hourly' ? 8 : 24)),
                'seconds' => $seconds, 'label' => 'penerima '.($period === 'hourly' ? 'per jam' : '24 jam')];
        }

        return $quotas;
    }

    private function key(string $type, string $identity): string
    {
        return 'waha-throttle:'.$type.':'.hash('sha256', $identity);
    }
}
