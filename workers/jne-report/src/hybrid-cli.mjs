import { parseArgs } from 'node:util';
import {
    HybridClient,
    loadHybridConfig,
    operationalDate,
    validateHybridDate,
} from './hybrid.mjs';
import { log, ReportError } from './errors.mjs';
import { requestHybridService, startHybridService } from './hybrid-service.mjs';

try {
    const { values } = parseArgs({
        options: {
            source: { type: 'string', default: 'all' },
            date: { type: 'string', default: operationalDate() },
            report: { type: 'string', default: 'all' },
            serve: { type: 'boolean', default: false },
            status: { type: 'boolean', default: false },
        },
    });
    const date = validateHybridDate(values.date);
    if (!['all', 'cashless', 'manual'].includes(values.report)) {
        throw new ReportError(
            'HYBRID_REPORT',
            'Report harus all, cashless, atau manual.',
        );
    }
    const config = loadHybridConfig(process.env, values.source);
    if (values.serve && values.status) {
        throw new ReportError('HYBRID_CONFIG', 'Pilih --serve atau --status.');
    }
    const kinds =
        values.report === 'all' ? ['cashless', 'manual'] : [values.report];
    if (values.serve) {
        const service = await startHybridService(config, log);
        const stop = () => {
            void service
                .close()
                .then(() => {
                    process.removeListener('SIGINT', stop);
                    process.removeListener('SIGTERM', stop);
                })
                .catch(() => {
                    process.exitCode = 1;
                });
        };
        process.once('SIGINT', stop);
        process.once('SIGTERM', stop);
    } else {
        const resident = await requestHybridService(config, {
            action: values.status ? 'status' : 'reports',
            sources: config.profiles.map((profile) => profile.name),
            reports: kinds,
            date,
        });
        if (values.status) {
            if (!resident) {
                throw new ReportError(
                    'HYBRID_SERVICE_OFFLINE',
                    'Worker sesi Hybrid belum berjalan. Jalankan npm run hybrid:serve.',
                );
            }
            log('hybrid_service_status', resident);
        } else if (resident) {
            for (const entry of resident.results) {
                if (entry.error) {
                    process.exitCode = 1;
                    log('hybrid_failed', {
                        source: entry.source,
                        report: entry.report,
                        ...entry.error,
                    });
                } else {
                    log('hybrid_downloaded', entry.result);
                }
            }
        } else {
            await Promise.all(
                config.profiles.map(async (profile) => {
                    const client = new HybridClient(profile, config);
                    try {
                        await client.start();
                        for (const kind of kinds) {
                            try {
                                log(
                                    'hybrid_downloaded',
                                    await client.retrieve(kind, date),
                                );
                            } catch (error) {
                                process.exitCode = 1;
                                log('hybrid_failed', {
                                    source: profile.name,
                                    report: kind,
                                    phase: client.phase,
                                    code:
                                        error instanceof ReportError
                                            ? error.code
                                            : 'HYBRID_ERROR',
                                    message:
                                        error instanceof ReportError
                                            ? error.message
                                            : 'Scraping gagal. Periksa akses jaringan dan struktur halaman Hybrid.',
                                });
                            }
                        }
                    } catch (error) {
                        process.exitCode = 1;
                        log('hybrid_failed', {
                            source: profile.name,
                            code:
                                error instanceof ReportError
                                    ? error.code
                                    : 'HYBRID_ERROR',
                            message:
                                error instanceof ReportError
                                    ? error.message
                                    : 'Browser Hybrid gagal dijalankan.',
                        });
                    } finally {
                        await client.close();
                    }
                }),
            );
        }
    }
} catch (error) {
    process.exitCode = 1;
    log('hybrid_failed', {
        code: error instanceof ReportError ? error.code : 'HYBRID_ERROR',
        message:
            error instanceof ReportError
                ? error.message
                : 'Konfigurasi atau browser Hybrid gagal dijalankan.',
    });
}
