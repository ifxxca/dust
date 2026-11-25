<?php

namespace App\Actions\Monitoring;

use Carbon\CarbonImmutable;
use Throwable;

class QueryServerHeartbeats
{
    /** @param list<array<string, mixed>> $observations
     * @param  list<array<string, mixed>>  $workers
     * @return list<array<string, mixed>>
     */
    public function handle(array $observations, array $workers): array
    {
        $hosts = [];
        foreach ($observations as $observation) {
            $metrics = $observation['host_metrics'] ?? null;
            if (! is_array($metrics) || ! is_string($metrics['host'] ?? null) || preg_match('/^[a-f0-9]{8}$/D', $metrics['host']) !== 1) {
                continue;
            }
            try {
                $date = CarbonImmutable::parse($metrics['observed_at'] ?? 'invalid');
            } catch (Throwable) {
                continue;
            }
            if ($date->isFuture() || (isset($hosts[$metrics['host']]) && $hosts[$metrics['host']]['observed_at'] >= $date->toIso8601String())) {
                continue;
            }
            $age = (int) $date->diffInSeconds(now());
            $stale = $age > config('control-center.fresh_seconds');
            $total = $this->number($metrics['memory_total_bytes'] ?? null);
            $free = $this->number($metrics['memory_free_bytes'] ?? null, $total ?? PHP_INT_MAX);
            $disk = $this->number($metrics['disk_total_bytes'] ?? null);
            $diskFree = $this->number($metrics['disk_free_bytes'] ?? null, $disk ?? PHP_INT_MAX);
            $cpu = $this->number($metrics['cpu_percent'] ?? null, 100);
            $memory = $total > 0 && $free !== null ? round(100 * (1 - $free / $total), 1) : null;
            $diskUsed = $disk > 0 && $diskFree !== null ? round(100 * (1 - $diskFree / $disk), 1) : null;
            $warnings = [];
            foreach (['CPU' => $cpu, 'RAM' => $memory, 'Disk' => $diskUsed] as $label => $value) {
                if (! $stale && $value !== null && $value >= 90) {
                    $warnings[] = $label.' terpakai ≥90%';
                }
            }
            $history = [];
            foreach (array_slice(is_array($metrics['history'] ?? null) ? $metrics['history'] : [], -40) as $sample) {
                if (! is_array($sample) || ! is_string($sample['observed_at'] ?? null)) {
                    continue;
                }
                try {
                    $at = CarbonImmutable::parse($sample['observed_at']);
                } catch (Throwable) {
                    continue;
                }
                if ($at->betweenIncluded($date->subMinutes(15), $date)) {
                    $history[] = ['observed_at' => $at->toIso8601String(), 'cpu_percent' => $this->number($sample['cpu_percent'] ?? null, 100), 'memory_percent' => $this->number($sample['memory_percent'] ?? null, 100)];
                }
            }
            $hosts[$metrics['host']] = [
                'host' => $metrics['host'], 'state' => $stale ? 'STALE' : ($warnings === [] ? 'HEALTHY' : 'DEGRADED'),
                'observed_at' => $date->toIso8601String(), 'age_seconds' => $age, 'stale' => $stale,
                'platform' => in_array($metrics['platform'] ?? null, ['win32', 'linux', 'darwin', 'freebsd', 'openbsd'], true) ? $metrics['platform'] : null,
                'cpu_percent' => $cpu, 'cpu_count' => $this->number($metrics['cpu_count'] ?? null, 4096),
                'memory_total_bytes' => $total, 'memory_free_bytes' => $free, 'memory_percent' => $memory,
                'disk_total_bytes' => $disk, 'disk_free_bytes' => $diskFree, 'disk_percent' => $diskUsed,
                'uptime_seconds' => $this->number($metrics['uptime_seconds'] ?? null), 'history' => $history, 'warnings' => $warnings,
                'workers_online' => count(array_filter($workers, fn (array $worker): bool => ($worker['host'] ?? null) === $metrics['host'] && ! $worker['stale'] && in_array($worker['state'], ['BUSY', 'IDLE'], true))),
            ];
        }

        ksort($hosts);

        return array_values($hosts);
    }

    private function number(mixed $value, float|int $maximum = PHP_INT_MAX): float|int|null
    {
        return (is_int($value) || is_float($value)) && is_finite((float) $value) && $value >= 0 && $value <= $maximum ? $value : null;
    }
}
