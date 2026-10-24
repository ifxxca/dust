import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { HybridClient, validateHybridDate } from './hybrid.mjs';
import { sessionClock } from './hybrid-session.mjs';
import { acquireProcessLock } from './worker.mjs';
import { ReportError } from './errors.mjs';
import { WorkerApi } from './api.mjs';
import { randomUUID } from 'node:crypto';
import { runHybridReportJob } from './hybrid-jobs.mjs';

function servicePaths(config) {
    const directory = path.resolve(
        config.sessionDir || path.join(config.outputDir, '.sessions'),
        'service',
    );
    const identity = createHash('sha256')
        .update(directory)
        .digest('hex')
        .slice(0, 20);
    return {
        directory,
        token: path.join(directory, 'token'),
        address:
            process.platform === 'win32'
                ? '\\\\.\\pipe\\dust-hybrid-' + identity
                : path.join(os.tmpdir(), 'dust-hybrid-' + identity + '.sock'),
    };
}

export function hybridFailure(error) {
    return {
        code: error instanceof ReportError ? error.code : 'HYBRID_ERROR',
        message:
            error instanceof ReportError
                ? error.message
                : 'Scraping gagal. Periksa akses jaringan dan struktur halaman Hybrid.',
    };
}

export async function requestHybridService(config, request) {
    const paths = servicePaths(config);
    let token;
    try {
        token = await readFile(paths.token, 'utf8');
    } catch (error) {
        if (error.code === 'ENOENT') {
            return null;
        }
        throw error;
    }
    return new Promise((resolve, reject) => {
        const socket = net.createConnection(paths.address);
        let data = '';
        let done = false;
        const finish = (error, result) => {
            if (done) {
                return;
            }
            done = true;
            socket.destroy();
            if (error) {
                reject(error);
            } else {
                resolve(result);
            }
        };
        socket.setTimeout(config.serviceTimeout || 600000);
        socket.once('connect', () =>
            socket.write(JSON.stringify({ ...request, token }) + '\n'),
        );
        socket.once('timeout', () =>
            finish(
                new ReportError(
                    'HYBRID_SERVICE_TIMEOUT',
                    'Worker masih sibuk atau tidak merespons. Periksa log worker sebelum mengulang.',
                ),
            ),
        );
        socket.once('error', (error) => {
            if (['ENOENT', 'ECONNREFUSED'].includes(error.code)) {
                finish(null, null);
            } else {
                finish(
                    new ReportError(
                        'HYBRID_SERVICE',
                        'Koneksi ke worker Hybrid gagal.',
                    ),
                );
            }
        });
        socket.on('data', (chunk) => {
            data += chunk.toString();
            if (data.length > 1048576) {
                finish(
                    new ReportError(
                        'HYBRID_SERVICE',
                        'Respons worker Hybrid terlalu besar.',
                    ),
                );
            } else if (data.includes('\n')) {
                try {
                    const result = JSON.parse(data.split('\n')[0]);
                    if (result.error) {
                        finish(
                            new ReportError(
                                result.error.code,
                                result.error.message,
                            ),
                        );
                    } else {
                        finish(null, result);
                    }
                } catch {
                    finish(
                        new ReportError(
                            'HYBRID_SERVICE',
                            'Respons worker Hybrid tidak valid.',
                        ),
                    );
                }
            }
        });
        socket.once('end', () => {
            if (!done) {
                finish(
                    new ReportError(
                        'HYBRID_SERVICE',
                        'Worker berhenti sebelum menyelesaikan permintaan.',
                    ),
                );
            }
        });
    });
}

export async function startHybridService(config, emit = () => {}) {
    const paths = servicePaths(config);
    await mkdir(paths.directory, { recursive: true, mode: 0o700 });
    const release = await acquireProcessLock(paths.directory);
    const slots = new Map(
        config.profiles.map((profile) => [
            profile.name,
            {
                client: new HybridClient(profile, config),
                lastRefresh: 0,
                nextAttempt: 0,
                maintenance: null,
                status: 'starting',
                api: config.api
                    ? new WorkerApi({
                          ...config.api,
                          workerId: 'hybrid-' + profile.name,
                      })
                    : null,
                polling: null,
            },
        ]),
    );
    const token = randomBytes(32).toString('hex');
    const clock = config.clock || (() => new Date());
    let stopping = false;
    let inflight = 0;
    let timer;
    let pollTimer;
    const sockets = new Set();

    const execute = async (request) => {
        if (request.action === 'status') {
            return {
                service: 'hybrid',
                sources: [...slots.keys()],
                browsers: slots.size,
            };
        }
        if (
            stopping ||
            request.action !== 'reports' ||
            !Array.isArray(request.sources) ||
            !request.sources.length ||
            request.sources.length > slots.size ||
            new Set(request.sources).size !== request.sources.length ||
            request.sources.some((name) => !slots.has(name)) ||
            !Array.isArray(request.reports) ||
            !request.reports.length ||
            request.reports.length > 2 ||
            new Set(request.reports).size !== request.reports.length ||
            request.reports.some(
                (kind) => !['cashless', 'manual'].includes(kind),
            )
        ) {
            throw new ReportError(
                'HYBRID_SERVICE_REQUEST',
                'Permintaan atau sumber worker Hybrid tidak valid.',
            );
        }
        const date = validateHybridDate(request.date);
        if (inflight >= 8) {
            throw new ReportError(
                'HYBRID_SERVICE_BUSY',
                'Antrean worker Hybrid penuh. Coba setelah proses lain selesai.',
            );
        }
        inflight++;
        try {
            const groups = await Promise.all(
                request.sources.map(async (source) => {
                    const slot = slots.get(source);
                    const results = [];
                    for (const kind of request.reports) {
                        try {
                            const result = await slot.client.retrieve(
                                kind,
                                date,
                            );
                            slot.lastRefresh = clock().getTime();
                            results.push({ result });
                        } catch (error) {
                            results.push({
                                source,
                                report: kind,
                                error: hybridFailure(error),
                            });
                        }
                    }
                    return results;
                }),
            );
            return { results: groups.flat() };
        } finally {
            inflight--;
        }
    };

    const maintain = async () => {
        if (stopping) {
            return;
        }
        await Promise.all(
            [...slots].map(async ([source, slot]) => {
                if (slot.maintenance) {
                    await slot.maintenance;
                    return;
                }
                if (sessionClock(clock()).paused) {
                    if (slot.status !== 'waiting_midnight') {
                        emit('hybrid_session_waiting', {
                            source,
                            resume: '00:30 WIB',
                        });
                    }
                    slot.status = 'waiting_midnight';
                    return;
                }
                if (clock().getTime() < slot.nextAttempt) {
                    return;
                }
                if (
                    !slot.client.needsDailyLogin() &&
                    clock().getTime() - slot.lastRefresh <
                        (config.keepAliveInterval || 300000)
                ) {
                    return;
                }
                slot.maintenance = slot.client
                    .refreshSession()
                    .then((result) => {
                        slot.lastRefresh = clock().getTime();
                        slot.status = 'active';
                        slot.nextAttempt = 0;
                        emit('hybrid_session_active', result);
                    })
                    .catch((error) => {
                        const failure = hybridFailure(error);
                        if (slot.status !== failure.code) {
                            emit('hybrid_session_failed', {
                                source,
                                ...failure,
                            });
                        }
                        slot.status = failure.code;
                        slot.nextAttempt =
                            clock().getTime() +
                            (config.keepAliveInterval || 300000);
                    });
                await slot.maintenance;
                slot.maintenance = null;
            }),
        );
    };

    const poll = async () => {
        if (stopping || sessionClock(clock()).paused) {
            return;
        }
        await Promise.all(
            [...slots].map(async ([source, slot]) => {
                if (!slot.api || slot.polling) {
                    return;
                }
                slot.polling = (async () => {
                    try {
                        const job = await slot.api.claim(randomUUID());
                        if (job) {
                            await runHybridReportJob(
                                job,
                                slot.api,
                                slot.client,
                                source,
                                emit,
                            );
                            slot.lastRefresh = clock().getTime();
                        }
                    } catch (error) {
                        emit('hybrid_claim_failed', {
                            source,
                            ...hybridFailure(error),
                        });
                    }
                })();
                await slot.polling;
                slot.polling = null;
            }),
        );
    };

    const server = net.createServer((socket) => {
        sockets.add(socket);
        socket.once('close', () => sockets.delete(socket));
        socket.on('error', () => {});
        let data = '';
        let received = false;
        socket.setTimeout(10000, () => socket.destroy());
        socket.on('data', (chunk) => {
            if (received) {
                return;
            }
            data += chunk.toString();
            if (data.length > 8192) {
                socket.destroy();
                return;
            }
            if (!data.includes('\n')) {
                return;
            }
            received = true;
            socket.setTimeout(0);
            void (async () => {
                try {
                    const request = JSON.parse(data.split('\n')[0]);
                    if (request.token !== token) {
                        throw new ReportError(
                            'HYBRID_SERVICE_AUTH',
                            'Akses worker Hybrid ditolak.',
                        );
                    }
                    socket.end(JSON.stringify(await execute(request)) + '\n');
                } catch (error) {
                    socket.end(
                        JSON.stringify({ error: hybridFailure(error) }) + '\n',
                    );
                }
            })();
        });
    });

    const close = async () => {
        if (stopping) {
            return;
        }
        stopping = true;
        clearInterval(timer);
        clearInterval(pollTimer);
        await Promise.allSettled(
            [...slots.values()].map((slot) => slot.polling),
        );
        const closed = server.listening
            ? new Promise((resolve) => server.close(resolve))
            : Promise.resolve();
        await Promise.allSettled(
            [...slots.values()].map((slot) => slot.client.close()),
        );
        for (const socket of sockets) {
            socket.destroy();
        }
        await closed;
        if (process.platform !== 'win32') {
            await unlink(paths.address).catch(() => {});
        }
        await release();
    };

    try {
        const started = await Promise.allSettled(
            [...slots.values()].map((slot) => slot.client.start()),
        );
        const failed = started.find((result) => result.status === 'rejected');
        if (failed) {
            throw failed.reason;
        }
        if (process.platform !== 'win32') {
            await unlink(paths.address).catch(() => {});
        }
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(paths.address, resolve);
        });
        if (process.platform !== 'win32') {
            await chmod(paths.address, 0o600);
        }
        await writeFile(paths.token, token, { mode: 0o600 });
        timer = setInterval(() => {
            void maintain();
        }, 15000);
        void maintain();
        pollTimer = setInterval(() => {
            void poll();
        }, 5000);
        void poll();
        emit('hybrid_service_started', {
            sources: [...slots.keys()],
            keep_alive_seconds: (config.keepAliveInterval || 300000) / 1000,
            daily_login: '00:30 WIB',
            laravel_queue: Boolean(config.api),
        });
        return { close, maintain, execute };
    } catch (error) {
        await close();
        throw error;
    }
}
