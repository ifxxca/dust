import os from 'node:os';
import { createHash } from 'node:crypto';
import { statfs } from 'node:fs/promises';

export async function readHostMetrics(directory) {
    const cpus = os.cpus();
    const times = cpus.reduce(
        (sum, cpu) => ({
            total:
                sum.total + Object.values(cpu.times).reduce((a, b) => a + b, 0),
            idle: sum.idle + cpu.times.idle,
        }),
        { total: 0, idle: 0 },
    );
    const disk = await statfs(directory).catch(() => null);
    return {
        host: createHash('sha256')
            .update(os.hostname())
            .digest('hex')
            .slice(0, 8),
        platform: os.platform(),
        cpu_count: cpus.length,
        cpu_times: times,
        memory_total_bytes: os.totalmem(),
        memory_free_bytes: os.freemem(),
        disk_total_bytes: disk ? disk.blocks * disk.bsize : null,
        disk_free_bytes: disk ? disk.bavail * disk.bsize : null,
        uptime_seconds: Math.floor(os.uptime()),
    };
}

export function createHostSampler(
    directory,
    { clock = () => new Date(), read = readHostMetrics } = {},
) {
    let previous;
    let snapshot;
    let history = [];
    return async () => {
        const now = clock();
        if (
            snapshot &&
            now.getTime() - Date.parse(snapshot.observed_at) < 10000
        )
            return snapshot;
        try {
            const current = await read(directory);
            const total = previous
                ? current.cpu_times.total - previous.cpu_times.total
                : 0;
            const idle = previous
                ? current.cpu_times.idle - previous.cpu_times.idle
                : 0;
            const cpu =
                previous?.host === current.host &&
                total > 0 &&
                idle >= 0 &&
                idle <= total
                    ? Math.round(1000 * (1 - idle / total)) / 10
                    : null;
            const { cpu_times, ...metrics } = current;
            const memory =
                current.memory_total_bytes > 0
                    ? Math.round(
                          1000 *
                              (1 -
                                  current.memory_free_bytes /
                                      current.memory_total_bytes),
                      ) / 10
                    : null;
            const observed = now.toISOString();
            history = [
                ...history,
                {
                    observed_at: observed,
                    cpu_percent: cpu,
                    memory_percent: memory,
                },
            ].slice(-40);
            snapshot = {
                ...metrics,
                cpu_percent: cpu,
                observed_at: observed,
                history,
            };
            previous = current;
        } catch {
            // A failed observation keeps its old timestamp; it cannot renew the host heartbeat.
        }
        return snapshot ?? null;
    };
}
