import { createHash } from 'node:crypto';
import {
    mkdir,
    readdir,
    stat,
    unlink,
    writeFile,
    rename,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHostSampler } from './host-telemetry.mjs';

let monitor;

export function createOperationsMonitor({
    directory,
    identity,
    runtime,
    interval = 15000,
    clock = () => new Date(),
}) {
    const file = path.join(
        directory,
        'workers',
        createHash('sha256').update(identity).digest('hex') + '.json',
    );
    const state = {
        identity,
        runtime,
        pid: process.pid,
        state: 'IDLE',
        queue: null,
        connection: null,
        timeout: null,
        job: null,
        job_id: null,
        failovers: [],
        integrations: {},
    };
    const active = new Map();
    const started = new Map();
    const safeHost = (host) =>
        /^dash-ccc\d+\.jne\.co\.id$/.test(host ?? '') ? host : null;
    const integration = (source, health, endpoint = null) => {
        if (!['apex', 'roberto', 'nuralamt'].includes(source)) return;
        state.integrations[source] = {
            state: health,
            endpoint: safeHost(endpoint),
            observed_at: clock().toISOString(),
        };
    };
    let writing = Promise.resolve();
    let initialized = false;
    const sampleHost = createHostSampler(directory, { clock });
    const flush = () => {
        const snapshot = {
            ...state,
            observed_at: clock().toISOString(),
        };
        writing = writing
            .then(async () => {
                await mkdir(path.dirname(file), {
                    recursive: true,
                    mode: 0o700,
                });
                snapshot.host_metrics = await sampleHost();
                if (!initialized) {
                    initialized = true;
                    const files = (await readdir(path.dirname(file)))
                        .filter((name) => /^[a-f0-9]{64}\.json$/.test(name))
                        .slice(0, 512);
                    const dates = await Promise.all(
                        files.map(async (name) => ({
                            name,
                            time: (
                                await stat(path.join(path.dirname(file), name))
                            ).mtimeMs,
                        })),
                    );
                    dates.sort((a, b) => b.time - a.time);
                    await Promise.allSettled(
                        dates
                            .slice(127)
                            .map(({ name }) =>
                                unlink(path.join(path.dirname(file), name)),
                            ),
                    );
                }
                await writeFile(file + '.tmp', JSON.stringify(snapshot), {
                    mode: 0o600,
                });
                await rename(file + '.tmp', file);
            })
            .catch(() => {});
        return writing;
    };
    const timer = setInterval(() => {
        void flush();
    }, interval);
    timer.unref();
    void flush();
    return {
        observe(event, fields = {}) {
            if (event === 'apex_endpoint_authenticated') {
                integration('apex', 'HEALTHY', fields.host);
                void flush();
                return;
            }
            if (
                [
                    'hybrid_session_active',
                    'hybrid_session_failed',
                    'hybrid_session_waiting',
                ].includes(event)
            ) {
                integration(
                    fields.source,
                    event === 'hybrid_session_active'
                        ? 'HEALTHY'
                        : event === 'hybrid_session_failed'
                          ? 'UNHEALTHY'
                          : 'PAUSED',
                );
                void flush();
                return;
            }
            if (
                ['hybrid_job_started', 'cashless_batch_started'].includes(event)
            ) {
                const id = fields.job_id ?? fields.batch_id;
                if (!Number.isSafeInteger(id)) return;
                const key = (fields.job_id ? 'report:' : 'cashless:') + id;
                if (!started.has(key)) started.set(key, clock().toISOString());
                active.set(
                    (fields.job_id ? 'report:' : 'cashless:') + id,
                    fields.job_id ? 'Hybrid report' : 'Cashless entry',
                );
                state.state = 'BUSY';
                state.job = [...active.values()].join(', ');
                state.job_id = [...active.keys()].join(', ');
            } else if (
                [
                    'hybrid_job_handed_to_apex',
                    'hybrid_job_failed',
                    'hybrid_job_failure_unconfirmed',
                    'cashless_batch_finished',
                    'cashless_account_failed',
                ].includes(event)
            ) {
                started.delete(
                    (fields.job_id ? 'report:' : 'cashless:') +
                        (fields.job_id ?? fields.batch_id),
                );
                active.delete(
                    (fields.job_id ? 'report:' : 'cashless:') +
                        (fields.job_id ?? fields.batch_id),
                );
                state.state = active.size ? 'BUSY' : 'IDLE';
                state.job = active.size
                    ? [...active.values()].join(', ')
                    : null;
                state.job_id = active.size
                    ? [...active.keys()].join(', ')
                    : null;
            } else if (
                event === 'job_progress' &&
                Number.isSafeInteger(fields.job_id)
            ) {
                state.state = 'BUSY';
                state.job = 'Report APEX';
                state.job_id = String(fields.job_id);
            } else if (
                [
                    'job_completed',
                    'job_no_data',
                    'job_failed',
                    'job_failure_unconfirmed',
                ].includes(event)
            ) {
                state.state = 'IDLE';
                state.job = null;
                state.job_id = null;
                if (['job_completed', 'job_no_data'].includes(event)) {
                    integration(
                        'apex',
                        'HEALTHY',
                        state.integrations.apex?.endpoint,
                    );
                } else if (
                    [
                        'APEX_NAVIGATION',
                        'APEX_PAGE',
                        'APEX_SESSION',
                        'APEX_ENDPOINTS_UNAVAILABLE',
                        'LOGIN_UNVERIFIED',
                        'SESSION_EXPIRED',
                    ].includes(fields.code)
                ) {
                    integration(
                        'apex',
                        'UNHEALTHY',
                        state.integrations.apex?.endpoint,
                    );
                }
            } else if (
                event === 'claim_failed' ||
                event === 'worker_start_failed'
            ) {
                state.state = 'UNHEALTHY';
            } else if (event === 'worker_poll_idle') {
                state.state = 'IDLE';
            } else if (event === 'apex_endpoint_failover') {
                state.failovers.push({
                    observed_at: clock().toISOString(),
                    from: safeHost(fields.from_host),
                    to: safeHost(fields.to_host),
                });
                state.failovers = state.failovers.slice(-20);
            } else {
                return;
            }
            if (runtime === 'Node Hybrid') {
                state.active_jobs = active.size;
                state.job_started_at = [...started.values()].sort()[0] ?? null;
            }
            if (state.state !== 'BUSY') state.job_started_at = null;
            void flush();
        },
        async close() {
            clearInterval(timer);
            state.state = 'STOPPED';
            state.job = null;
            state.job_id = null;
            await flush();
        },
        flush,
    };
}

export function startOperationsMonitor(runtime, identity) {
    try {
        if (process.env.CONTROL_CENTER_ENABLED === 'false') return;
        monitor = createOperationsMonitor({
            directory:
                process.env.CONTROL_CENTER_PATH ||
                fileURLToPath(
                    new URL(
                        '../../../storage/app/private/operations-telemetry/',
                        import.meta.url,
                    ),
                ),
            identity:
                identity +
                ':' +
                createHash('sha256')
                    .update(os.hostname())
                    .digest('hex')
                    .slice(0, 8) +
                ':' +
                process.pid,
            runtime,
        });
    } catch {
        monitor = null;
    }
}

export function observeOperation(event, fields) {
    try {
        monitor?.observe(event, fields);
    } catch {}
}

export async function stopOperationsMonitor() {
    try {
        await monitor?.close();
    } catch {}
    monitor = null;
}
