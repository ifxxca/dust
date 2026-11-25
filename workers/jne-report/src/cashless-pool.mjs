import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { HybridClient } from './hybrid.mjs';
import {
    CashlessEntryApi,
    HybridCashlessPage,
    processCashlessBatch,
} from './cashless-entry.mjs';
import { ReportError } from './errors.mjs';

export function createCashlessPool(
    config,
    reportSlots,
    emit = () => {},
    dependencies = {},
) {
    const Client = dependencies.Client || HybridClient;
    const Api = dependencies.Api || CashlessEntryApi;
    const processBatch = dependencies.processBatch || processCashlessBatch;
    const profile = config.profiles.find((item) => item.name === 'roberto');
    const slots = Array.from({ length: 5 }, (_, index) => ({
        api: new Api({
            ...config.api,
            workerId: `cashless-roberto-${index + 1}`,
        }),
        pending: null,
    }));
    let stopping = false;
    const execute = async (slot) => {
        const batch = await slot.api.claim(randomUUID());
        if (!batch) return;
        emit('cashless_batch_started', { batch_id: batch.id });
        let client;
        let owned = false;
        try {
            const account = batch.hybrid_account;
            if (
                batch.source !== 'roberto' ||
                !account ||
                !Number.isSafeInteger(account.user_id) ||
                account.user_id < 1 ||
                !Number.isSafeInteger(account.version) ||
                account.version < 1 ||
                typeof account.username !== 'string' ||
                !account.username ||
                typeof account.password !== 'string' ||
                !account.password
            ) {
                throw new ReportError(
                    'CASHLESS_ACCOUNT',
                    'Akun Hybrid petugas belum siap. Hubungi admin.',
                );
            }
            const shared = reportSlots.get('roberto')?.client;
            if (
                shared &&
                shared.profile.username.toLowerCase() ===
                    account.username.toLowerCase()
            ) {
                if (shared.profile.password !== account.password)
                    throw new ReportError(
                        'CASHLESS_ACCOUNT',
                        'Kredensial akun penarikan tidak sesuai. Periksa pengaturan akun petugas.',
                    );
                client = shared;
            } else {
                client = new Client(
                    {
                        ...profile,
                        username: account.username,
                        password: account.password,
                    },
                    {
                        ...config,
                        sessionDir: path.join(
                            config.sessionDir ||
                                path.join(config.outputDir, '.sessions'),
                            'cashless',
                            `user-${account.user_id}`,
                            `v-${account.version}`,
                        ),
                    },
                );
                owned = true;
                await client.start();
            }
            const result = await client.exclusive(() =>
                processBatch(batch, slot.api, new HybridCashlessPage(client)),
            );
            emit('cashless_batch_finished', {
                batch_id: batch.id,
                source: batch.source,
                status: result.status,
            });
        } catch (error) {
            await slot.api
                .checkpoint(batch, 'hold', {
                    message:
                        error instanceof ReportError
                            ? `${error.code}: ${error.message}`
                            : 'CASHLESS_ACCOUNT: Sesi Hybrid petugas belum dapat diproses. Periksa koneksi dan akun.',
                })
                .catch(() => {});
            emit('cashless_account_failed', {
                batch_id: batch.id,
                code:
                    error instanceof ReportError
                        ? error.code
                        : 'CASHLESS_ACCOUNT',
            });
        } finally {
            if (owned) await client?.close();
            if (batch.hybrid_account) batch.hybrid_account.password = '';
        }
    };
    return {
        poll() {
            if (stopping || !profile || !config.api) return;
            for (const slot of slots) {
                if (!slot.pending)
                    slot.pending = execute(slot)
                        .catch(() =>
                            emit('cashless_claim_failed', {
                                source: 'roberto',
                            }),
                        )
                        .finally(() => {
                            slot.pending = null;
                        });
            }
        },
        async close() {
            stopping = true;
            await Promise.allSettled(slots.map((slot) => slot.pending));
        },
    };
}
