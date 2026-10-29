import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig } from './config.mjs';
import { acquireProcessLock } from './worker.mjs';
import { log, ReportError, safeError } from './errors.mjs';

export function poolSize(env = process.env) {
    const size = Number(env.JNE_APEX_CONCURRENCY ?? 5);
    if (!Number.isSafeInteger(size) || size < 1 || size > 20) {
        throw new ReportError(
            'CONFIG_INVALID',
            'Jumlah worker APEX harus 1 sampai 20.',
            'FAILED',
        );
    }
    return size;
}

export async function main() {
    let release;
    try {
        const count = poolSize();
        const config = loadConfig({ ...process.env, JNE_APEX_INSTANCE: '0' });
        if (process.argv.includes('--check')) {
            log('apex_pool_check', {
                instances: count,
                isolated_sessions: true,
            });
            return;
        }
        const lockDir = path.join(config.dataDir, 'pool-supervisor');
        await mkdir(lockDir, { recursive: true, mode: 0o700 });
        release = await acquireProcessLock(lockDir);
        const children = new Map();
        const restarts = new Set();
        let stopping = false;
        let finish;
        const stopped = new Promise((resolve) => {
            finish = resolve;
        });
        const launch = (instance) => {
            if (stopping) return;
            const child = spawn(
                process.execPath,
                [fileURLToPath(new URL('./worker.mjs', import.meta.url))],
                {
                    env: {
                        ...process.env,
                        JNE_APEX_INSTANCE: String(instance),
                    },
                    stdio: ['ignore', 'inherit', 'inherit'],
                    windowsHide: true,
                },
            );
            children.set(instance, child);
            log('apex_instance_started', { instance, pid: child.pid });
            child.once('error', () =>
                log('apex_instance_start_failed', { instance }),
            );
            child.once('close', (code) => {
                children.delete(instance);
                log('apex_instance_exited', { instance, code });
                if (stopping) {
                    if (!children.size) finish();
                    return;
                }
                const timer = setTimeout(() => {
                    restarts.delete(timer);
                    launch(instance);
                }, 5000);
                restarts.add(timer);
            });
        };
        const stop = () => {
            if (stopping) return;
            stopping = true;
            for (const timer of restarts) clearTimeout(timer);
            for (const child of children.values()) child.kill('SIGTERM');
            if (!children.size) finish();
        };
        process.once('SIGINT', stop);
        process.once('SIGTERM', stop);
        try {
            for (let instance = 1; instance <= count; instance++)
                launch(instance);
            log('apex_pool_started', { instances: count });
            await stopped;
        } finally {
            process.removeListener('SIGINT', stop);
            process.removeListener('SIGTERM', stop);
        }
    } catch (error) {
        log('apex_pool_failed', { code: safeError(error).code });
        process.exitCode = 1;
    } finally {
        await release?.();
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
    await main();
