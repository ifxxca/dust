import {
    mkdir,
    mkdtemp,
    rm,
    open,
    readFile,
    unlink,
    readdir,
    chmod,
} from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { loadConfig } from './config.mjs';
import { WorkerApi } from './api.mjs';
import { ApexClient } from './apex.mjs';
import { retrieveHybridApex } from './hybrid-apex.mjs';
import { log, ReportError, safeError } from './errors.mjs';

export async function runJob(job, api, apex, config, shutdownSignal) {
    if (job.status !== 'RUNNING') return;
    const controller = new AbortController();
    const shutdown = () =>
        controller.abort(
            new ReportError(
                'WORKER_STOPPED',
                'Worker dihentikan. Periksa History JNE sebelum membuat permintaan baru.',
            ),
        );
    shutdownSignal?.addEventListener('abort', shutdown, { once: true });
    if (shutdownSignal?.aborted) shutdown();
    const timeout = setTimeout(
        () =>
            controller.abort(
                new ReportError(
                    'JOB_TIMEOUT',
                    'Batas waktu worker terlampaui. Periksa History JNE sebelum membuat permintaan baru.',
                ),
            ),
        config.jobTimeout,
    );
    const cancelBrowser = () => {
        void apex.close();
    };
    controller.signal.addEventListener('abort', cancelBrowser, { once: true });
    let status = 'RUNNING';
    let pending = Promise.resolve();
    const progress = (nextStatus = null) => {
        const operation = pending.then(async () => {
            controller.signal.throwIfAborted();
            const next = nextStatus || status;
            await api.progress(job, next);
            status = next;
            if (nextStatus) log('job_progress', { job_id: job.id, status });
        });
        pending = operation.catch((error) => {
            controller.abort(error);
        });
        return operation;
    };
    const heartbeat = setInterval(
        () => {
            void progress().catch(() => {});
        },
        Math.max(1000, Math.min(30000, (job.lease_seconds * 1000) / 3)),
    );
    let tempDir;
    let completed = false;
    try {
        tempDir = await mkdtemp(
            path.join(config.dataDir, 'job-' + job.id + '-'),
        );
        controller.signal.throwIfAborted();
        const filePath =
            job.report_mode === 'A'
                ? await retrieveHybridApex(
                      job,
                      apex,
                      tempDir,
                      progress,
                      controller.signal,
                      Math.min(config.maxFileBytes, job.max_file_kb * 1024),
                  )
                : await apex.retrieve(
                      job,
                      tempDir,
                      progress,
                      controller.signal,
                  );
        clearInterval(heartbeat);
        await pending;
        controller.signal.throwIfAborted();
        await progress('DOWNLOADING');
        const result = await api.upload(job, filePath);
        if (result?.status !== 'COMPLETED')
            throw new ReportError(
                'UPLOAD_UNCONFIRMED',
                'Laravel belum mengonfirmasi penyimpanan CSV. Periksa job sebelum meminta report baru.',
            );
        completed = true;
        log('job_completed', { job_id: job.id });
    } catch (error) {
        const safe = safeError(
            controller.signal.aborted ? controller.signal.reason : error,
        );
        if (apex.captureFailure)
            await apex.captureFailure(job.id, safe.code).catch(() => {});
        clearInterval(heartbeat);
        await pending;
        try {
            await api.fail(job, safe);
            log('job_failed', {
                job_id: job.id,
                status: safe.status,
                code: safe.code,
                phase: apex.phase,
                control: apex.activeControl,
                error_type: error?.name,
            });
        } catch {
            log('job_failure_unconfirmed', {
                job_id: job.id,
                code: safe.code,
                recovery: 'report-jobs:recover',
            });
        }
        await apex.close();
    } finally {
        clearInterval(heartbeat);
        clearTimeout(timeout);
        shutdownSignal?.removeEventListener('abort', shutdown);
        controller.signal.removeEventListener('abort', cancelBrowser);
        if (tempDir && path.dirname(tempDir) === config.dataDir)
            await rm(tempDir, { recursive: true, force: true });
    }
    return completed;
}

export async function acquireProcessLock(dataDir) {
    const lockPath = path.join(dataDir, 'worker.lock');
    let handle;
    try {
        handle = await open(lockPath, 'wx', 0o600);
    } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const pid = Number(await readFile(lockPath, 'utf8'));
        if (!Number.isSafeInteger(pid) || pid < 1)
            throw new ReportError(
                'WORKER_LOCK',
                'Periksa file worker.lock secara manual sebelum menjalankan worker lain.',
                'FAILED',
            );
        try {
            process.kill(pid, 0);
            throw new ReportError(
                'WORKER_ACTIVE',
                'Worker lain masih aktif pada direktori sesi ini.',
                'FAILED',
            );
        } catch (probe) {
            if (probe.code !== 'ESRCH') throw probe;
        }
        await unlink(lockPath);
        handle = await open(lockPath, 'wx', 0o600);
    }
    await handle.writeFile(String(process.pid));
    return async () => {
        await handle.close();
        await unlink(lockPath);
    };
}

export async function main() {
    let release;
    let apex;
    try {
        process.umask(0o077);
        const config = loadConfig();
        await mkdir(config.dataDir, { recursive: true, mode: 0o700 });
        await chmod(config.dataDir, 0o700);
        release = await acquireProcessLock(config.dataDir);
        for (const entry of await readdir(config.dataDir, {
            withFileTypes: true,
        })) {
            if (entry.isDirectory() && /^job-\d+-/.test(entry.name)) {
                const stale = path.join(config.dataDir, entry.name);
                if (path.dirname(stale) === config.dataDir)
                    await rm(stale, { recursive: true, force: true });
            }
        }
        const api = new WorkerApi(config);
        apex = new ApexClient(config);
        const shutdown = new AbortController();
        const stop = () => shutdown.abort();
        process.once('SIGINT', stop);
        process.once('SIGTERM', stop);
        log('worker_started', { worker_id: config.workerId });
        try {
            while (!shutdown.signal.aborted) {
                let job;
                try {
                    job = await api.claim(randomUUID());
                } catch (error) {
                    log('claim_failed', { code: safeError(error).code });
                    if (process.argv.includes('--once')) {
                        process.exitCode = 1;
                        break;
                    }
                }
                if (job) {
                    const completed = await runJob(
                        job,
                        api,
                        apex,
                        config,
                        shutdown.signal,
                    );
                    if (process.argv.includes('--once') && !completed)
                        process.exitCode = 1;
                }
                if (process.argv.includes('--once')) break;
                await sleep(config.claimInterval, undefined, {
                    signal: shutdown.signal,
                }).catch(() => {});
            }
        } finally {
            process.removeListener('SIGINT', stop);
            process.removeListener('SIGTERM', stop);
        }
    } catch (error) {
        log('worker_start_failed', { code: safeError(error).code });
        process.exitCode = 1;
    } finally {
        await apex?.close();
        await release?.();
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
    await main();
