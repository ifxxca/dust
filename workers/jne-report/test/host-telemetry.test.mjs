import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHostSampler, readHostMetrics } from '../src/host-telemetry.mjs';

test('host CPU is a measured delta and an event cannot renew its observation timestamp', async () => {
    let now = new Date('2026-11-06T08:00:00Z');
    let total = 1000,
        idle = 400,
        fail = false;
    const sample = createHostSampler('fixture', {
        clock: () => now,
        read: async () => {
            if (fail) throw new Error('OS unavailable');
            return {
                host: 'abcd1234',
                cpu_times: { total, idle },
                memory_total_bytes: 1000,
                memory_free_bytes: 250,
            };
        },
    });
    const first = await sample();
    assert.equal(first.cpu_percent, null);
    now = new Date(now.getTime() + 5000);
    assert.equal((await sample()).observed_at, first.observed_at);
    now = new Date(now.getTime() + 10000);
    total = 2000;
    idle = 1100;
    const second = await sample();
    assert.equal(second.cpu_percent, 30);
    assert.equal(second.history.at(-1).memory_percent, 75);
    assert.equal('cpu_times' in second, false);
    now = new Date(now.getTime() + 15000);
    fail = true;
    assert.equal((await sample()).observed_at, second.observed_at);
    fail = false;
    total = 1;
    idle = 1;
    assert.equal((await sample()).cpu_percent, null);
    for (let index = 0; index < 60; index++) {
        now = new Date(now.getTime() + 15000);
        total += 1000;
        idle += 500;
        await sample();
    }
    assert.equal((await sample()).history.length, 40);
});

test('native host measurements use OS memory uptime and the actual telemetry volume', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'host-metrics-'));
    try {
        const metrics = await readHostMetrics(directory);
        assert.match(metrics.host, /^[a-f0-9]{8}$/);
        assert.ok(metrics.cpu_count > 0);
        assert.ok(metrics.memory_total_bytes > 0);
        assert.ok(metrics.memory_free_bytes <= metrics.memory_total_bytes);
        assert.ok(metrics.uptime_seconds >= 0);
        if (metrics.disk_total_bytes !== null)
            assert.ok(metrics.disk_total_bytes >= metrics.disk_free_bytes);
    } finally {
        await rm(directory, { recursive: true });
    }
});
