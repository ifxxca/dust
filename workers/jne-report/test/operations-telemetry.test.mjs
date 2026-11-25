import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createOperationsMonitor } from '../src/operations-telemetry.mjs';

test('process heartbeat records only safe lifecycle fields and exact concurrent activity', async () => {
    const directory = await mkdtemp(
        path.join(os.tmpdir(), 'operations-monitor-'),
    );
    const monitor = createOperationsMonitor({
        directory,
        identity: 'fixture-node',
        runtime: 'Node Hybrid',
        interval: 60000,
        clock: () => new Date('2026-11-06T03:00:00Z'),
    });
    try {
        monitor.observe('cashless_batch_started', {
            batch_id: 7,
            password: 'PRIVATE_TEST',
        });
        monitor.observe('hybrid_job_started', {
            job_id: 8,
            token: 'PRIVATE_TEST',
        });
        monitor.observe('cashless_batch_finished', { batch_id: 7 });
        await monitor.flush();
        const filename = (await readdir(path.join(directory, 'workers'))).find(
            (name) => name.endsWith('.json'),
        );
        const snapshot = () =>
            readFile(path.join(directory, 'workers', filename), 'utf8').then(
                JSON.parse,
            );
        assert.equal((await snapshot()).state, 'BUSY');
        assert.equal((await snapshot()).job_id, 'report:8');
        assert.equal((await snapshot()).active_jobs, 1);
        assert.equal((await snapshot()).job_started_at, '2026-11-06T03:00:00.000Z');
        assert.ok(!JSON.stringify(await snapshot()).includes('PRIVATE_TEST'));
        monitor.observe('hybrid_job_handed_to_apex', { job_id: 8 });
        await monitor.flush();
        assert.equal((await snapshot()).state, 'IDLE');
        assert.equal((await snapshot()).job_started_at, null);
        assert.equal((await snapshot()).active_jobs, 0);
        monitor.observe('apex_endpoint_failover', {
            from_host: 'dash-ccc01.jne.co.id',
            to_host: 'dash-ccc02.jne.co.id',
        });
        await monitor.flush();
        assert.equal(
            (await snapshot()).failovers[0].to,
            'dash-ccc02.jne.co.id',
        );
        await monitor.close();
        assert.equal((await snapshot()).state, 'STOPPED');
    } finally {
        await monitor.close();
        await rm(directory, { recursive: true, force: true });
    }
});

test('storage failures never reject business lifecycle observations', async () => {
    const directory = await mkdtemp(
        path.join(os.tmpdir(), 'operations-monitor-'),
    );
    const blocked = path.join(directory, 'not-a-directory');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(blocked, 'fixture');
    const monitor = createOperationsMonitor({
        directory: blocked,
        identity: 'fixture-node',
        runtime: 'Node APEX',
    });
    monitor.observe('job_progress', { job_id: 1 });
    await monitor.flush();
    await monitor.close();
    await rm(directory, { recursive: true, force: true });
});

test('session evidence is source specific and heartbeat cannot renew a past connection check', async () => {
    const directory = await mkdtemp(
        path.join(os.tmpdir(), 'operations-monitor-'),
    );
    let time = new Date('2026-11-06T03:00:00Z');
    const monitor = createOperationsMonitor({
        directory,
        identity: 'sessions',
        runtime: 'Node Hybrid',
        interval: 60000,
        clock: () => time,
    });
    try {
        const snapshot = async () => {
            await monitor.flush();
            const filename = (
                await readdir(path.join(directory, 'workers'))
            ).find((name) => name.endsWith('.json'));
            return JSON.parse(
                await readFile(
                    path.join(directory, 'workers', filename),
                    'utf8',
                ),
            );
        };
        monitor.observe('hybrid_session_active', {
            source: 'roberto',
            password: 'PRIVATE_TEST',
        });
        monitor.observe('hybrid_session_failed', {
            source: 'nuralamt',
            message: 'PRIVATE_TEST',
        });
        monitor.observe('hybrid_session_active', { source: 'untrusted' });
        assert.equal((await snapshot()).integrations.roberto.state, 'HEALTHY');
        assert.equal(
            (await snapshot()).integrations.nuralamt.state,
            'UNHEALTHY',
        );
        time = new Date('2026-11-06T03:20:00Z');
        const later = await snapshot();
        assert.equal(later.observed_at, time.toISOString());
        assert.equal(
            later.integrations.roberto.observed_at,
            '2026-11-06T03:00:00.000Z',
        );
        assert.equal(later.integrations.untrusted, undefined);
        assert.ok(!JSON.stringify(later).includes('PRIVATE_TEST'));
        monitor.observe('hybrid_session_active', { source: 'nuralamt' });
        assert.equal((await snapshot()).integrations.nuralamt.state, 'HEALTHY');
        monitor.observe('hybrid_session_waiting', { source: 'roberto' });
        assert.equal((await snapshot()).integrations.roberto.state, 'PAUSED');
    } finally {
        await monitor.close();
        await rm(directory, { recursive: true, force: true });
    }
});

test('apex session failures and recovery are independent of form errors and reject untrusted hosts', async () => {
    const directory = await mkdtemp(
        path.join(os.tmpdir(), 'operations-monitor-'),
    );
    const monitor = createOperationsMonitor({
        directory,
        identity: 'apex-session',
        runtime: 'Node APEX',
        interval: 60000,
    });
    try {
        const snapshot = async () => {
            await monitor.flush();
            const filename = (
                await readdir(path.join(directory, 'workers'))
            ).find((name) => name.endsWith('.json'));
            return JSON.parse(
                await readFile(
                    path.join(directory, 'workers', filename),
                    'utf8',
                ),
            );
        };
        monitor.observe('apex_endpoint_authenticated', {
            host: 'dash-ccc02.jne.co.id',
            token: 'PRIVATE_TEST',
        });
        assert.equal((await snapshot()).integrations.apex.state, 'HEALTHY');
        monitor.observe('job_failed', { code: 'FORM_VALUE', job_id: 1 });
        assert.equal((await snapshot()).state, 'IDLE');
        assert.equal((await snapshot()).integrations.apex.state, 'HEALTHY');
        monitor.observe('job_failed', {
            code: 'APEX_ENDPOINTS_UNAVAILABLE',
            job_id: 2,
        });
        assert.equal((await snapshot()).integrations.apex.state, 'UNHEALTHY');
        monitor.observe('job_completed', { job_id: 3 });
        assert.equal((await snapshot()).integrations.apex.state, 'HEALTHY');
        monitor.observe('apex_endpoint_authenticated', {
            host: 'https://PRIVATE_TEST@untrusted.test/session',
        });
        const result = await snapshot();
        assert.equal(result.integrations.apex.endpoint, null);
        assert.ok(!JSON.stringify(result).includes('PRIVATE_TEST'));
    } finally {
        await monitor.close();
        await rm(directory, { recursive: true, force: true });
    }
});
