import { randomUUID } from 'node:crypto';
import { WorkerApi } from './api.mjs';
import { ReportError } from './errors.mjs';
import { parseCsv } from './csv.mjs';
import { setTimeout as sleep } from 'node:timers/promises';

export function cashlessOutcome(message, awb) {
    if (message === 'Data connote berhasil disimpan') return 'ACCEPTED';
    if (/^Connote pernah di HO dg nomor\s*:\s*HO-[A-Z0-9-]+$/i.test(message))
        return 'PREVIOUSLY_ENTERED';
    if (message === `Connote ${awb} sudah dientry di orion`)
        return 'ORION_REJECTED';
    if (message === `Connote ${awb} tidak ditemukan.`) return 'NOT_FOUND';
    if (message === 'Nomor resi melebihi batas input Hybrid (16 karakter).')
        return 'INVALID';
    if (
        [
            'Destinasi tidak lengkap',
            'Lengkapi data terlebih dahulu',
            'Destinasi tidak tersedia, lengkapi data terlebih dahulu',
            'Goods Value tidak boleh 0',
        ].includes(message)
    )
        return 'NEEDS_DATA';
    return 'UNKNOWN';
}

export class CashlessEntryApi extends WorkerApi {
    constructor(config) {
        super({
            ...config,
            apiBasePath: '/api/internal/cashless-entries/',
            claimHeader: 'X-Cashless-Claim',
        });
    }
    checkpoint(batch, type, evidence = {}) {
        const payload = { event_key: randomUUID(), type, ...evidence };
        return this.request(
            `${batch.id}/checkpoint`,
            () => payload,
            batch.claim_token,
        );
    }
}

function assertHo(value) {
    if (!/^HO-[A-Z0-9-]{1,60}$/.test(value || '')) {
        throw new ReportError(
            'CASHLESS_HO',
            'Nomor HO tidak dapat diverifikasi.',
        );
    }
    return value;
}

export class HybridCashlessPage {
    constructor(client) {
        this.client = client;
    }
    async protectMutations() {
        this.mutations = new Set();
        this.guard = async (route) => {
            const request = route.request();
            const body = request.postData() || '';
            const fields = new URLSearchParams(body);
            const names = fields.getAll('p_arg_names');
            const command = fields.get('p_request') || fields.get('request');
            const mutation =
                request.method() === 'POST' &&
                (['NEW', 'APPROVE'].includes(command) ||
                    (names.includes('P80_CNOTE') &&
                        names.includes('P80_DATE') &&
                        names.includes('P80_NO')));
            if (!mutation) return route.continue();
            if (
                new URL(request.url()).origin !==
                new URL(this.client.profile.loginUrl).origin
            )
                return route.abort('blockedbyclient');
            if (this.mutations.has(body)) return route.abort('blockedbyclient');
            this.mutations.add(body);
            try {
                const response = await route.fetch({
                    maxRetries: 0,
                    maxRedirects: 0,
                    timeout: this.client.config.navigationTimeout,
                });
                await route.fulfill({ response });
            } catch {
                await route.abort('failed').catch(() => {});
            }
        };
        await this.page.route('**/*', this.guard);
    }
    async close() {
        if (this.guard) {
            await this.page
                .goto('about:blank', { waitUntil: 'commit' })
                .catch(() => {});
            await this.page.unroute('**/*', this.guard);
        }
    }
    async openExistingHo(ho, confirmApproval = false) {
        assertHo(ho);
        if (!this.client.session || this.client.needsDailyLogin())
            throw new ReportError(
                'CASHLESS_SESSION',
                'Sesi HO sebelumnya tidak tersedia; periksa HO sebelum melanjutkan.',
            );
        this.page = this.client.page;
        await this.protectMutations();
        await this.page.goto(this.client.sessionUrl('80').toString(), {
            waitUntil: 'domcontentloaded',
        });
        await this.assertCurrentHo(ho);
        if (confirmApproval) {
            await this.readApprovalProof(ho);
            return;
        }
        if (
            !(await this.page
                .getByRole('button', { name: 'Approve', exact: true })
                .isVisible())
        )
            throw new ReportError(
                'CASHLESS_APPROVAL',
                'HO tidak lagi menunggu approval; periksa bukti tanpa mengulang.',
            );
    }
    async newHo(freshSession = false) {
        const client = this.client;
        if (freshSession || !client.session || client.needsDailyLogin())
            await client.authenticate();
        this.page = client.page;
        await this.protectMutations();
        await this.page.goto(client.sessionUrl('80').toString(), {
            waitUntil: 'domcontentloaded',
        });
        if (
            await this.page
                .getByRole('textbox', { name: 'Username', exact: true })
                .isVisible()
        ) {
            await client.authenticate();
            await this.page.goto(client.sessionUrl('80').toString(), {
                waitUntil: 'domcontentloaded',
            });
        }
        await this.page.locator('#P80_NO').waitFor();
        await this.assertPageIdentity();
        if (client.lastCashlessNewAt)
            await sleep(
                Math.max(0, 1100 - (Date.now() - client.lastCashlessNewAt)),
            );
        await Promise.all([
            this.page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            this.page.getByRole('button', { name: 'New', exact: true }).click(),
        ]);
        const ho = assertHo(await this.page.locator('#P80_NO').inputValue());
        client.lastCashlessNewAt = Date.now();
        if (ho === client.lastCashlessHo)
            throw new ReportError(
                'CASHLESS_NEW',
                'Nomor HO batch sebelumnya terpakai lagi.',
            );
        if (
            (await this.page
                .locator('[id="Connote Reports"] .a-IRR-table td')
                .count()) ||
            (await this.page.locator('#P80_CNOTE').inputValue()) ||
            (await this.page.locator('#P80_ERR').inputValue())
        ) {
            throw new ReportError(
                'CASHLESS_NEW',
                'HO baru tidak dalam keadaan kosong.',
            );
        }
        client.lastCashlessHo = ho;
        await this.page.evaluate(() => {
            window.__cashlessRefresh = 0;
            window.apex
                .jQuery(document)
                .on('apexafterrefresh.cashless', (event) => {
                    if (event.target.id === 'Connote Reports')
                        window.__cashlessRefresh++;
                });
        });
        return ho;
    }
    async scan(ho, awb) {
        await this.assertCurrentHo(ho);
        const scan = this.page.locator('#P80_CNOTE');
        const max = Number(await scan.getAttribute('maxlength'));
        if (max !== 16)
            throw new ReportError(
                'CASHLESS_FORM',
                'Batas input Hybrid berubah; periksa kontrak halaman.',
            );
        if (awb.length > max)
            return {
                message:
                    'Nomor resi melebihi batas input Hybrid (16 karakter).',
                elapsed_ms: 0,
            };
        const plugin = await this.page.evaluate(
            () =>
                window.apex?.da?.gEventList
                    ?.find(
                        (event) =>
                            event.triggeringElement === 'P80_CNOTE' &&
                            event.bindEventType === 'keypress',
                    )
                    ?.actionList?.find(
                        (action) =>
                            action.action === 'NATIVE_EXECUTE_PLSQL_CODE',
                    )?.ajaxIdentifier,
        );
        if (typeof plugin !== 'string' || !plugin)
            throw new ReportError(
                'CASHLESS_FORM',
                'Aksi Scan Connote tidak dikenali.',
            );
        const revision = await this.page.evaluate(
            () => window.__cashlessRefresh,
        );
        await scan.fill(awb);
        const started = Date.now();
        const reply = this.page.waitForResponse(
            (response) => {
                const request = response.request();
                const fields = new URLSearchParams(request.postData() || '');
                const names = fields.getAll('p_arg_names');
                const values = fields.getAll('p_arg_values');
                return (
                    request.method() === 'POST' &&
                    new URL(request.url()).origin ===
                        new URL(this.page.url()).origin &&
                    fields.get('p_request') === `PLUGIN=${plugin}` &&
                    values[names.indexOf('P80_CNOTE')] === awb &&
                    values[names.indexOf('P80_NO')] === ho
                );
            },
            { timeout: this.client.config.navigationTimeout },
        );
        const [response] = await Promise.all([reply, scan.press('Enter')]);
        if (!response.ok())
            throw new ReportError(
                'CASHLESS_RESPONSE',
                'Server belum mengonfirmasi hasil input.',
            );
        const body = await response.json();
        const message = body.item?.find((item) => item.id === 'P80_ERR')?.value;
        if (typeof message !== 'string' || message.length > 1000)
            throw new ReportError(
                'CASHLESS_RESPONSE',
                'Respons input Hybrid tidak dikenali.',
            );
        await this.page.waitForFunction(
            (previous) => window.__cashlessRefresh > previous,
            revision,
            { timeout: this.client.config.navigationTimeout },
        );
        if ((await this.page.locator('#P80_ERR').inputValue()) !== message)
            throw new ReportError(
                'CASHLESS_RESPONSE',
                'Respons dan status halaman berbeda.',
            );
        await this.assertCurrentHo(ho);
        return { message, elapsed_ms: Date.now() - started };
    }
    async assertCurrentHo(ho) {
        await this.assertPageIdentity();
        if ((await this.page.locator('#P80_NO').inputValue()) !== ho)
            throw new ReportError('CASHLESS_HO', 'Nomor HO aktif berubah.');
    }
    async assertPageIdentity() {
        if (
            new URL(this.page.url()).origin !==
                new URL(this.client.profile.loginUrl).origin ||
            (await this.page.locator('#pFlowId').inputValue()) !== '113' ||
            (await this.page.locator('#pInstance').inputValue()) !==
                this.client.session
        ) {
            throw new ReportError(
                'CASHLESS_SESSION',
                'Halaman tidak sesuai server atau sesi batch.',
            );
        }
    }
    async verifiedAwbs(ho) {
        await this.assertCurrentHo(ho);
        await this.page.evaluate(() => {
            const region = document.getElementById('Connote Reports');
            if (!region) throw new Error('Report region missing');
            if (
                region.querySelector('.a-IRR-controls-item--filter') ||
                region.querySelector('.a-IRR-search-field')?.value
            )
                throw new Error('Report has active filters');
        });
        await this.page
            .locator('[id="Connote Reports_actions_button"]')
            .click();
        await this.page
            .getByRole('menuitem', { name: 'Download', exact: true })
            .click();
        const csv = this.page
            .getByRole('dialog')
            .getByRole('link', { name: 'CSV', exact: true });
        const url = new URL(await csv.getAttribute('href'), this.page.url());
        const parts = (url.searchParams.get('p') || '').split(':');
        if (
            url.origin !== new URL(this.page.url()).origin ||
            url.pathname !== new URL(this.page.url()).pathname ||
            parts[0] !== '113' ||
            parts[1] !== '80' ||
            parts[2] !== this.client.session ||
            !(parts[3] === 'CSV' || /^IR\[.+\]_CSV$/.test(parts[3] || ''))
        ) {
            throw new ReportError(
                'CASHLESS_CSV',
                'Tautan bukti HO tidak sesuai halaman dan sesi.',
            );
        }
        const response = await this.client.context.request.get(url.toString(), {
            timeout: this.client.config.downloadTimeout,
            maxRedirects: 0,
        });
        const bytes = await response.body();
        if (
            !response.ok() ||
            bytes.length > 1048576 ||
            !/csv|plain|octet-stream/i.test(
                response.headers()['content-type'] || '',
            )
        )
            throw new ReportError(
                'CASHLESS_CSV',
                'Ekspor bukti HO tidak valid.',
            );
        const rows = parseCsv(
            bytes.toString('utf8').replace(/^\uFEFF/, ''),
            ',',
        );
        if (!rows?.length || rows.length > 501)
            throw new ReportError(
                'CASHLESS_CSV',
                'Jumlah baris bukti HO tidak valid.',
            );
        const columns = rows[0].map((text) =>
            text.trim().toLowerCase().replace(/[.#]/g, '').replace(/\s+/g, ' '),
        );
        const index = columns.findIndex((text) =>
            /^(cnote no|connote|connote no|cnote)$/.test(text),
        );
        const hoIndex = columns.findIndex((text) =>
            /^(ho no|ho number|handover no)$/.test(text),
        );
        if (index < 0)
            throw new ReportError(
                'CASHLESS_CSV',
                'Kolom resi dalam bukti HO tidak dikenali.',
            );
        const awbs = rows
            .slice(1)
            .map((row) => row[index]?.trim().replace(/^'/, ''));
        if (
            awbs.some((awb) => !awb || !/^[A-Z0-9_-]{1,16}$/.test(awb)) ||
            new Set(awbs).size !== awbs.length ||
            (hoIndex >= 0 &&
                rows.slice(1).some((row) => row[hoIndex]?.trim() !== ho))
        )
            throw new ReportError('CASHLESS_CSV', 'Isi bukti HO tidak sesuai.');
        await this.page.keyboard.press('Escape');
        await csv.waitFor({ state: 'hidden' });
        return awbs;
    }
    async approve(ho) {
        await this.assertCurrentHo(ho);
        await Promise.all([
            this.page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            this.page
                .getByRole('button', { name: 'Approve', exact: true })
                .click(),
        ]);
        return this.readApprovalProof(ho);
    }
    async readApprovalProof(ho) {
        await this.assertCurrentHo(ho);
        const printAvailable = await this.page
            .getByRole('button', { name: 'Print', exact: true })
            .isVisible();
        const approve = this.page.getByRole('button', {
            name: 'Approve',
            exact: true,
        });
        const approveAvailable =
            (await approve.isVisible()) && (await approve.isEnabled());
        if (
            !printAvailable ||
            approveAvailable ||
            (await this.page
                .locator('.t-Alert--danger,.a-Notification--error')
                .count())
        ) {
            throw new ReportError(
                'CASHLESS_APPROVAL_UNKNOWN',
                'Hasil approval belum dapat dibuktikan.',
            );
        }
        return { print_available: true, approve_available: false };
    }
}

export async function processCashlessBatch(batch, api, adapter) {
    const checkpoint = (type, data = {}) => api.checkpoint(batch, type, data);
    let heartbeatError;
    const heartbeat = setInterval(
        () => {
            void checkpoint('heartbeat').catch((error) => {
                heartbeatError = error;
            });
        },
        Math.max(1000, Math.min(30000, (batch.lease_seconds * 1000) / 3)),
    );
    const alive = () => {
        if (heartbeatError) throw heartbeatError;
    };
    try {
        const confirmApproval = batch.status === 'CONFIRMING';
        const resume = batch.status === 'VERIFYING' || confirmApproval;
        if (
            !Array.isArray(batch.items) ||
            !batch.items.length ||
            (resume
                ? !batch.ho_number ||
                  !batch.items.some((item) => item.status === 'ACCEPTED') ||
                  batch.items.some(
                      (item) =>
                          ![
                              'ACCEPTED',
                              'PREVIOUSLY_ENTERED',
                              'ORION_REJECTED',
                              'NOT_FOUND',
                              'NEEDS_DATA',
                              'INVALID',
                          ].includes(item.status),
                  )
                : batch.status !== 'CLAIMED' ||
                  batch.ho_number ||
                  batch.items.some((item) => item.status !== 'PENDING'))
        )
            throw new ReportError(
                'CASHLESS_BATCH',
                'Batch tidak siap untuk HO baru.',
            );
        let ho;
        const accepted = resume
            ? batch.items
                  .filter((item) => item.status === 'ACCEPTED')
                  .map((item) => item.awb)
            : [];
        if (resume) {
            ho = batch.ho_number;
            await adapter.openExistingHo(ho, confirmApproval);
        } else {
            await checkpoint('creating');
            ho = await adapter.newHo(batch.fresh_session_required === true);
            alive();
            await checkpoint('created', { ho_number: ho });
        }
        for (const item of resume ? [] : batch.items) {
            alive();
            const identity = { ho_number: ho, item_id: item.id, awb: item.awb };
            await checkpoint('scan-start', identity);
            const result = await adapter.scan(ho, item.awb);
            const outcome = cashlessOutcome(result.message, item.awb);
            await checkpoint('scan-result', {
                ...identity,
                ...result,
                outcome,
            });
            if (outcome === 'UNKNOWN') return { status: 'UNKNOWN' };
            if (outcome === 'ACCEPTED') accepted.push(item.awb);
        }
        alive();
        if (!accepted.length)
            return await checkpoint('empty', { ho_number: ho });
        const verified = await adapter.verifiedAwbs(ho);
        if (
            JSON.stringify([...verified].sort()) !==
            JSON.stringify([...accepted].sort())
        )
            throw new ReportError(
                'CASHLESS_CONTENT',
                'Isi HO tidak sesuai daftar resi berhasil.',
            );
        if (confirmApproval) {
            const proof = await adapter.readApprovalProof(ho);
            alive();
            return await checkpoint('approved', { ho_number: ho, ...proof });
        }
        await checkpoint('approval-start', {
            ho_number: ho,
            verified_awbs: verified,
        });
        alive();
        const proof = await adapter.approve(ho);
        alive();
        return await checkpoint('approved', { ho_number: ho, ...proof });
    } catch (error) {
        const message =
            error instanceof ReportError
                ? `${error.code}: ${error.message}`
                : 'CASHLESS_UNKNOWN: Hasil input atau approval belum pasti. Periksa HO sebelum mengulang.';
        await checkpoint('hold', { message }).catch(() => {});
        return { status: 'UNKNOWN', error: message };
    } finally {
        clearInterval(heartbeat);
        await adapter.close?.();
    }
}

export async function runCashlessEntry(
    client,
    config,
    source,
    emit = () => {},
) {
    const api = new CashlessEntryApi({
        ...config.api,
        workerId: `hybrid-${source}`,
    });
    if (client.profile.name !== source)
        throw new ReportError(
            'CASHLESS_SOURCE',
            'Sesi worker tidak sesuai server tujuan.',
        );
    return client.exclusive(async () => {
        const batch = await api.claim(randomUUID());
        if (!batch) return false;
        if (batch.source !== source) {
            await api.checkpoint(batch, 'hold', {
                message: 'CASHLESS_SOURCE: Server batch berbeda dari worker.',
            });
            return true;
        }
        const result = await processCashlessBatch(
            batch,
            api,
            new HybridCashlessPage(client),
        );
        emit('cashless_batch_finished', {
            batch_id: batch.id,
            source,
            status: result.status,
        });
        return true;
    });
}
