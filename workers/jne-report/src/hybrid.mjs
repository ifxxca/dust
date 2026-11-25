import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { formatDate } from './apex.mjs';
import { parseCsv } from './csv.mjs';
import { log, ReportError } from './errors.mjs';
import { acquireProcessLock } from './worker.mjs';
import {
    assertSessionWindow,
    readSession,
    sessionClock,
    sessionDirectory,
    writeSession,
} from './hybrid-session.mjs';

const sources = ['roberto', 'nuralamt'];

const reports = {
    cashless: { page: '57', dateColumn: 'HO Date', awbColumn: 'Cnote No' },
    manual: { page: '40', dateColumn: 'Date', awbColumn: 'Cnote no' },
};

export async function readHybridCollectionScope(page, kind, date) {
    const displayDate = formatDate(date, 'DD-MON-YYYY');
    return page.evaluate(({ kind, date, displayDate }) => {
        const control = (name) => {
            const labels = [...document.querySelectorAll('label')].filter((label) => label.textContent.trim().toLowerCase().startsWith(name.toLowerCase()));
            if (labels.length !== 1) return null;
            return labels[0].control || labels[0].querySelector('input,select');
        };
        const value = (name) => control(name)?.value?.trim() ?? null;
        const selected = (name) => control(name)?.selectedOptions?.[0]?.textContent?.trim() ?? null;
        const regions = [...document.querySelectorAll('.t-IRR-region')].filter((region) => region.getClientRects().length);
        const region = regions.length === 1 ? regions[0] : null;
        const labels = region ? [...region.querySelectorAll('.a-IRR-pagination-label')].filter((label) => label.getClientRects().length) : [];
        const totals = [...new Set(labels.map((label) => label.textContent.trim()))];
        const empty = !!region?.querySelector('.a-IRR-noDataMsg')?.getClientRects().length
            && !region?.querySelector('.a-IRR-table td');
        const clear = !!region && !region.querySelector('.a-IRR-controls-item--filter')
            && !region.querySelector('.a-IRR-search-field')?.value
            && !document.querySelector('.a-Form-error,.t-Alert--danger');
        const userAll = ['< ALL >', '<ALL USERS>'].includes(selected('User Id'));
        const otherClear = kind === 'cashless'
            ? ['Marketplace', 'Service', 'Merchant'].every((name) => value(name) === '')
            : ['Shipper / Cust Id', 'Disc#'].every((name) => value(name) === '')
                && selected('Connote') === 'ALL' && selected('Services') === '< ALL >' && selected('Payment Type') === '< ALL >';
        return {
            date_from: value('Date From')?.toUpperCase() === displayDate ? date : value('Date From'),
            date_thru: value('Date Thru')?.toUpperCase() === displayDate ? date : value('Date Thru'),
            scope: userAll ? 'ALL_USERS' : null,
            filters_clear: clear && userAll && otherClear,
            total_label: empty ? 'No data found.' : totals.length === 1 ? totals[0] : null,
            empty,
        };
    }, { kind, date, displayDate });
}

export function operationalDate(now = new Date()) {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Jakarta',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        })
            .formatToParts(now)
            .map(({ type, value }) => [type, value]),
    );
    return `${parts.year}-${parts.month}-${parts.day}`;
}

export function validateHybridDate(date) {
    if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date
    ) {
        throw new ReportError(
            'HYBRID_DATE',
            'Tanggal harus valid dengan format YYYY-MM-DD.',
        );
    }
    return date;
}

export function loadHybridConfig(env = process.env, selected = 'all') {
    const names = selected === 'all' ? sources : [selected];
    if (names.some((name) => !sources.includes(name))) {
        throw new ReportError(
            'HYBRID_SOURCE',
            'Sumber harus all, roberto, atau nuralamt.',
        );
    }
    const profiles = names.map((name) => {
        const prefix = 'HYBRID_' + name.toUpperCase();
        const loginUrl = env[prefix + '_LOGIN_URL']?.trim();
        if (
            !loginUrl ||
            !env[prefix + '_USERNAME']?.trim() ||
            !env[prefix + '_PASSWORD']
        ) {
            throw new ReportError(
                'HYBRID_CONFIG',
                'Isi URL login, username, dan password untuk ' + name + '.',
            );
        }
        let parsedUrl;
        try {
            parsedUrl = new URL(loginUrl);
        } catch {
            throw new ReportError(
                'HYBRID_CONFIG',
                'URL login tidak valid untuk ' + name + '.',
            );
        }
        if (
            !['http:', 'https:'].includes(parsedUrl.protocol) ||
            parsedUrl.username ||
            parsedUrl.password
        ) {
            throw new ReportError(
                'HYBRID_CONFIG',
                'URL login harus HTTP(S) tanpa kredensial untuk ' + name + '.',
            );
        }
        return {
            name,
            loginUrl: parsedUrl.toString(),
            username: env[prefix + '_USERNAME'].trim(),
            password: env[prefix + '_PASSWORD'],
        };
    });
    return {
        profiles,
        outputDir: path.resolve(
            env.HYBRID_OUTPUT_DIR ||
                fileURLToPath(
                    new URL(
                        '../../../storage/app/private/jne-worker/hybrid',
                        import.meta.url,
                    ),
                ),
        ),
        navigationTimeout: 30000,
        downloadTimeout: 120000,
        maxFileBytes: 20971520,
        keepAliveInterval: 300000,
        cashlessEntryEnabled: env.CASHLESS_ENTRY_ENABLED === 'true',
        cashlessPerUserAccounts: env.CASHLESS_PER_USER_ACCOUNTS === 'true',
        api: hybridApiConfig(env),
    };
}

function hybridApiConfig(env) {
    if (!env.RETAIL_OPERATIONS_URL && !env.JNE_REPORT_WORKER_TOKEN) {
        return null;
    }
    const url = new URL(env.RETAIL_OPERATIONS_URL || 'http://localhost:8000');
    if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        !env.JNE_REPORT_WORKER_TOKEN ||
        env.JNE_REPORT_WORKER_TOKEN.length < 32
    ) {
        throw new ReportError(
            'HYBRID_CONFIG',
            'Isi RETAIL_OPERATIONS_URL dan JNE_REPORT_WORKER_TOKEN yang valid untuk antrean Laravel.',
        );
    }
    return {
        apiUrl: url.toString().replace(/\/$/, ''),
        token: env.JNE_REPORT_WORKER_TOKEN,
        apiTimeout: 60000,
    };
}

export function validateHybridCsv(bytes, kind, date, maxBytes = 20971520) {
    const report = reports[kind];
    if (!report || !bytes.length || bytes.length > maxBytes) {
        throw new ReportError(
            'HYBRID_CSV',
            'Jenis laporan atau ukuran CSV tidak valid.',
        );
    }
    const text = bytes.toString('utf8').replace(/^\uFEFF/, '');
    const rows = parseCsv(text, ',');
    const headers = rows?.[0] || [];
    const dateIndex = headers.indexOf(report.dateColumn);
    const awbIndex = headers.indexOf(report.awbColumn);
    if (
        text.includes('\0') ||
        dateIndex < 0 ||
        awbIndex < 0 ||
        new Set(headers).size !== headers.length ||
        !rows.every((row) => row.length === headers.length)
    ) {
        throw new ReportError(
            'HYBRID_CSV',
            'Struktur CSV tidak sesuai laporan Hybrid.',
        );
    }
    const expected = formatDate(validateHybridDate(date), 'DD-MON-YYYY');
    if (
        rows
            .slice(1)
            .some(
                (row) =>
                    !row[awbIndex]?.trim() ||
                    !row[dateIndex].toUpperCase().startsWith(expected + ' '),
            )
    ) {
        throw new ReportError(
            'HYBRID_CSV_DATE',
            'CSV berisi AWB kosong atau tanggal di luar hari yang diminta.',
        );
    }
    return { rows: rows.length - 1, bytes: bytes.length };
}

export class HybridClient {
    constructor(profile, config) {
        this.profile = profile;
        this.config = config;
        this.clock = config.clock || (() => new Date());
        this.pending = Promise.resolve();
    }

    async start() {
        const directory = sessionDirectory(this.profile, this.config);
        await mkdir(directory, { recursive: true, mode: 0o700 });
        this.release = await acquireProcessLock(directory);
        this.sessionFile = path.join(directory, 'session.json');
        try {
            const stored = await readSession(this.sessionFile, this.profile);
            this.browser = await chromium.launch({ headless: true });
            this.context = await this.browser.newContext({
                storageState: stored?.storage,
            });
            this.page = await this.context.newPage();
            this.page.setDefaultTimeout(this.config.navigationTimeout);
            this.page.setDefaultNavigationTimeout(
                this.config.navigationTimeout,
            );
            this.session = stored?.session;
            this.authenticatedAt = stored?.authenticatedAt;
        } catch (error) {
            await this.close();
            throw error;
        }
    }

    async close() {
        this.closing = true;
        await this.pending;
        try {
            await this.browser?.close();
        } finally {
            await this.release?.();
            this.release = null;
            this.browser = null;
        }
    }

    exclusive(operation) {
        if (this.closing) {
            return Promise.reject(
                new ReportError(
                    'HYBRID_STOPPED',
                    'Worker Hybrid sedang dihentikan.',
                ),
            );
        }
        const result = this.pending.then(operation);
        this.pending = result.catch(() => {});
        return result;
    }

    needsDailyLogin() {
        return (
            !this.authenticatedAt ||
            sessionClock(new Date(this.authenticatedAt)).date !==
                sessionClock(this.clock()).date
        );
    }

    async saveSession() {
        if (!this.session) {
            return;
        }
        await writeSession(this.sessionFile, {
            version: 1,
            origin: new URL(this.profile.loginUrl).origin,
            username: this.profile.username,
            session: this.session,
            authenticatedAt: this.authenticatedAt,
            storage: await this.context.storageState(),
        });
    }

    sessionUrl(page) {
        const url = new URL(this.profile.loginUrl);
        url.searchParams.set('p', `113:${page}:${this.session}::NO:::`);
        return url;
    }

    refreshSession() {
        return this.exclusive(async () => {
            assertSessionWindow(this.clock());
            if (!this.session || this.needsDailyLogin()) {
                await this.authenticate();
                return { source: this.profile.name, action: 'login' };
            }
            this.phase = 'keep_alive';
            const response = await this.page.goto(
                this.sessionUrl('1').toString(),
                { waitUntil: 'domcontentloaded' },
            );
            if (
                await this.page
                    .getByRole('textbox', { name: 'Username', exact: true })
                    .isVisible()
            ) {
                await this.authenticate();
                return { source: this.profile.name, action: 'login' };
            }
            const session = await this.page.locator('#pInstance').inputValue();
            if (
                !response?.ok() ||
                session !== this.session ||
                new URL(this.page.url()).origin !==
                    new URL(this.profile.loginUrl).origin
            ) {
                throw new ReportError(
                    'HYBRID_KEEPALIVE',
                    'Refresh sesi Hybrid tidak dapat diverifikasi.',
                );
            }
            await this.saveSession();
            return { source: this.profile.name, action: 'refresh' };
        });
    }

    async authenticate() {
        assertSessionWindow(this.clock());
        this.phase = 'login';
        this.session = null;
        await this.context.clearCookies();
        await this.page.goto(this.profile.loginUrl, {
            waitUntil: 'domcontentloaded',
        });
        const username = this.page.getByRole('textbox', {
            name: 'Username',
            exact: true,
        });
        await username.fill(this.profile.username);
        await this.page
            .getByRole('textbox', { name: 'Password', exact: true })
            .fill(this.profile.password);
        await this.page
            .getByRole('button', { name: 'Login', exact: true })
            .click();
        try {
            await username.waitFor({ state: 'hidden' });
        } catch {
            throw new ReportError(
                'HYBRID_LOGIN',
                'Login Hybrid gagal. Periksa akun dan akses jaringan.',
            );
        }
        const session = await this.page.evaluate(() => ({
            app: document.getElementById('pFlowId')?.value,
            session: document.getElementById('pInstance')?.value,
        }));
        if (
            session.app !== '113' ||
            !/^[1-9]\d*$/.test(session.session || '') ||
            new URL(this.page.url()).origin !==
                new URL(this.profile.loginUrl).origin
        ) {
            throw new ReportError(
                'HYBRID_SESSION',
                'Sesi aplikasi Hybrid tidak dapat diverifikasi.',
            );
        }
        this.session = session.session;
        this.authenticatedAt = this.clock().toISOString();
        await this.saveSession();
    }

    retrieve(kind, date, options = {}) {
        return this.exclusive(async () => {
            let httpFailure;
            const response = (reply) => {
                if (
                    !options.automaticRetry ||
                    reply.status() < 400 ||
                    !['document', 'xhr', 'fetch'].includes(
                        reply.request().resourceType(),
                    ) ||
                    new URL(reply.url()).origin !==
                        new URL(this.profile.loginUrl).origin
                )
                    return;
                httpFailure = new ReportError(
                    'UPSTREAM_HTTP',
                    'Server Hybrid menolak permintaan report.',
                );
                httpFailure.httpStatus = reply.status();
                httpFailure.retryAfter = reply.headers()['retry-after'] ?? null;
            };
            if (options.automaticRetry) this.page.on('response', response);
            try {
                return await this.retrieveReport(kind, date, options);
            } catch (error) {
                throw httpFailure ?? error;
            } finally {
                if (options.automaticRetry) this.page.off('response', response);
            }
        });
    }

    async retrieveReport(kind, date, options = {}) {
        validateHybridDate(date);
        if (!Object.hasOwn(reports, kind)) {
            throw new ReportError(
                'HYBRID_REPORT',
                'Jenis laporan harus cashless atau manual.',
            );
        }
        const attempts = options.automaticRetry ? 1 : 3;
        for (let attempt = 0; attempt < attempts; attempt++) {
            assertSessionWindow(this.clock());
            if (!this.session || this.needsDailyLogin()) {
                await this.authenticate();
            }
            try {
                const result = await this.download(kind, date);
                await this.saveSession();
                return result;
            } catch (error) {
                if (error.code === 'HYBRID_SESSION_EXPIRED')
                    this.session = null;
                if (
                    error.code === 'HYBRID_SESSION_EXPIRED' &&
                    attempt < attempts - 1
                ) {
                    this.session = null;
                    continue;
                }
                if (
                    error.code === 'HYBRID_FILTER' &&
                    this.phase === 'view_report' &&
                    attempt < attempts - 1
                ) {
                    log('hybrid_filter_retry', {
                        source: this.profile.name,
                        attempt: attempt + 2,
                    });
                    continue;
                }
                const transient =
                    error.name === 'TimeoutError' ||
                    error.code === 'HYBRID_DOWNLOAD_TRANSIENT' ||
                    /ERR_CONNECTION_RESET|ERR_TIMED_OUT|ECONNRESET|ETIMEDOUT/.test(
                        error.message || '',
                    );
                if (transient && attempt < attempts - 1) {
                    log('hybrid_read_retry', {
                        source: this.profile.name,
                        phase: this.phase,
                        attempt: attempt + 2,
                        code: error.code || error.name,
                    });
                    await sleep(1000);
                    continue;
                }
                if (transient) {
                    if (options.automaticRetry && error instanceof ReportError)
                        throw error;
                    throw new ReportError(
                        'HYBRID_DOWNLOAD_TIMEOUT',
                        {
                            open_download_menu: 'Batas waktu membuka menu unduhan Hybrid terlampaui.',
                            prepare_csv: 'Batas waktu menunggu tautan CSV Hybrid terlampaui.',
                            download_csv: 'Batas waktu mengunduh isi CSV Hybrid terlampaui.',
                        }[this.phase] || 'Pembacaan report Hybrid terhenti. Periksa koneksi dan ketersediaan unduhan.',
                    );
                }
                throw error;
            }
        }
    }

    async download(kind, date) {
        this.phase = 'open_report';
        const report = reports[kind];
        const url = new URL(this.profile.loginUrl);
        url.searchParams.set('p', `113:${report.page}:${this.session}::NO:::`);
        await this.page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
        if (
            await this.page
                .getByRole('textbox', { name: 'Username', exact: true })
                .isVisible()
        ) {
            throw new ReportError(
                'HYBRID_SESSION_EXPIRED',
                'Sesi Hybrid kedaluwarsa.',
            );
        }
        const from = this.page.getByRole('textbox', { name: /^Date From/ });
        const thru = this.page.getByRole('textbox', { name: /^Date Thru/ });
        await from.waitFor();
        const actions = this.page.getByRole('button', { name: /^Actions/ });
        this.phase = 'set_filters';
        await this.page
            .getByRole('combobox', { name: /^User Id/i })
            .selectOption({
                label: kind === 'manual' ? '<ALL USERS>' : '< ALL >',
            });
        const displayDate = formatDate(date, 'DD-MON-YYYY');
        if (kind === 'cashless') {
            for (const name of ['Marketplace', 'Service']) {
                await this.page
                    .getByRole('textbox', { name, exact: true })
                    .fill('');
            }
            if (
                await this.page
                    .getByRole('textbox', { name: 'Merchant', exact: true })
                    .inputValue()
            ) {
                throw new ReportError(
                    'HYBRID_FILTER',
                    'Hapus filter Merchant sebelum mengambil seluruh data.',
                );
            }
        } else {
            for (const name of ['Connote', 'Services', 'Payment Type']) {
                await this.page
                    .getByRole('combobox', { name, exact: true })
                    .selectOption({
                        label: name === 'Connote' ? 'ALL' : '< ALL >',
                    });
            }
            await this.page
                .getByRole('textbox', {
                    name: 'Shipper / Cust Id',
                    exact: true,
                })
                .fill('');
            if (
                await this.page
                    .getByRole('textbox', { name: 'Disc#', exact: true })
                    .inputValue()
            ) {
                throw new ReportError(
                    'HYBRID_FILTER',
                    'Hapus filter Disc# sebelum mengambil seluruh data.',
                );
            }
        }
        await from.fill(displayDate);
        await from.press('Tab');
        await thru.fill(displayDate);
        await thru.press('Tab');
        this.phase = 'view_report';
        await Promise.all([
            this.page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            this.page
                .getByRole('button', { name: 'View', exact: true })
                .click(),
        ]);
        const actualFrom = (await from.inputValue()).trim().toUpperCase();
        const actualThru = (await thru.inputValue()).trim().toUpperCase();
        if (actualFrom !== displayDate || actualThru !== displayDate) {
            throw new ReportError(
                'HYBRID_FILTER',
                `Filter tanggal tidak diterapkan. Diminta ${displayDate}; terbaca ${actualFrom || '(kosong)'} – ${actualThru || '(kosong)'}.`,
            );
        }
        this.phase = 'reset_report';
        await actions.click();
        await this.page
            .getByRole('menuitem', { name: 'Reset', exact: true })
            .click();
        const dialog = this.page.getByRole('dialog');
        await Promise.all([
            this.page
                .waitForResponse(
                    (response) =>
                        response.request().method() === 'POST' &&
                        new URL(response.url()).origin === url.origin,
                )
                .then((response) => response.finished()),
            dialog.getByRole('button', { name: 'Apply', exact: true }).click(),
        ]);
        await dialog.waitFor({ state: 'hidden' });
        const collectionBefore = await readHybridCollectionScope(this.page, kind, date);
        if (collectionBefore.date_from !== date || collectionBefore.date_thru !== date || collectionBefore.scope !== 'ALL_USERS') {
            throw new ReportError('HYBRID_FILTER', 'Tanggal atau user scope berubah setelah reset report.');
        }
        const emptyEvidence = await this.page
            .locator('.t-IRR-region')
            .evaluateAll((regions) => {
                if (regions.length !== 1) return null;
                const region = regions[0];
                const marker = region.querySelector('.a-IRR-noDataMsg');
                if (
                    !marker?.getClientRects().length ||
                    region.querySelector('.a-IRR-table td') ||
                    region.querySelector('.a-IRR-controls-item--filter') ||
                    region.querySelector('.a-IRR-search-field')?.value ||
                    document.querySelector('.a-Form-error,.t-Alert--danger')
                ) {
                    return null;
                }
                return region.outerHTML;
            });
        this.phase = 'open_download_menu';
        await actions.click();
        this.phase = 'prepare_csv';
        await this.page
            .getByRole('menuitem', { name: 'Download', exact: true })
            .click({ timeout: this.config.downloadTimeout });
        const csv = this.page
            .getByRole('dialog')
            .getByRole('link', { name: 'CSV', exact: true });
        await csv.waitFor({ state: 'visible', timeout: this.config.downloadTimeout });
        const downloadUrl = new URL(
            await csv.getAttribute('href', { timeout: this.config.downloadTimeout }),
            this.page.url(),
        );
        const parts = (downloadUrl.searchParams.get('p') || '').split(':');
        if (
            downloadUrl.origin !== url.origin ||
            downloadUrl.pathname !== url.pathname ||
            parts[0] !== '113' ||
            parts[1] !== report.page ||
            parts[2] !== this.session ||
            !/^IR\[.+\]_CSV$/.test(parts[3] || '')
        ) {
            throw new ReportError(
                'HYBRID_DOWNLOAD_URL',
                'Tautan unduhan tidak sesuai sesi laporan.',
            );
        }
        this.phase = 'download_csv';
        const response = await this.context.request.get(
            downloadUrl.toString(),
            {
                timeout: this.config.downloadTimeout,
                maxRedirects: 0,
                maxRetries: 0,
            },
        );
        try {
            if (response.status() >= 500 || response.status() === 429) {
                const error = new ReportError(
                    'HYBRID_DOWNLOAD_TRANSIENT',
                    'Server Hybrid sementara belum menyediakan unduhan.',
                );
                error.httpStatus = response.status();
                error.retryAfter = response.headers()['retry-after'] ?? null;
                throw error;
            }
            if (
                !response.ok() ||
                !/^text\/csv\b/i.test(response.headers()['content-type'] || '')
            ) {
                throw new ReportError(
                    'HYBRID_DOWNLOAD',
                    'Server tidak mengembalikan CSV.',
                );
            }
            const downloadedBytes = await response.body();
            const oracleCode = downloadedBytes
                .toString('utf8')
                .match(/^\s*<div class="a-Form-error">(ORA-\d{5}):/i)?.[1];
            let bytes = downloadedBytes;
            if (oracleCode) {
                if (oracleCode !== 'ORA-22275' || !emptyEvidence) {
                    throw new ReportError(
                        'HYBRID_SOURCE_ORACLE',
                        `Server Hybrid gagal mengekspor CSV (${oracleCode}). Hasil tidak disimpan; periksa report pada server sumber.`,
                    );
                }
                const dates = [
                    await from.inputValue(),
                    await thru.inputValue(),
                ];
                if (
                    dates.some(
                        (value) => value.trim().toUpperCase() !== displayDate,
                    )
                ) {
                    throw new ReportError(
                        'HYBRID_FILTER',
                        'Tanggal berubah setelah reset report. Hasil kosong belum dapat dikonfirmasi.',
                    );
                }
                bytes = Buffer.from(
                    `${report.awbColumn},${report.dateColumn}\r\n`,
                );
            }
            const summary = validateHybridCsv(
                bytes,
                kind,
                date,
                this.config.maxFileBytes,
            );
            const directory = path.join(
                this.config.outputDir,
                this.profile.name,
                date,
                randomUUID(),
            );
            await mkdir(directory, { recursive: true, mode: 0o700 });
            const file = path.join(directory, `${kind}-${date}.csv`);
            await writeFile(file, bytes, { mode: 0o600, flag: 'wx' });
            if (oracleCode) {
                await writeFile(
                    path.join(directory, 'empty-report-evidence.json'),
                    JSON.stringify({
                        source: this.profile.name,
                        report: kind,
                        date,
                        observedAt: this.clock().toISOString(),
                        reason: oracleCode,
                        reportHtml: emptyEvidence,
                        exportResponse: downloadedBytes.toString('utf8'),
                    }),
                    { mode: 0o600, flag: 'wx' },
                );
                log('hybrid_empty_report_verified', {
                    source: this.profile.name,
                    report: kind,
                    date,
                    reason: oracleCode,
                });
            }
            return {
                source: this.profile.name,
                report: kind,
                date,
                ...summary,
                file,
                collectionEvidence: {
                    version: 1, protocol: 'hybrid_ir_total_v1', origin: url.origin,
                    before: collectionBefore,
                    after: await readHybridCollectionScope(this.page, kind, date),
                    synthesized: !!oracleCode,
                },
            };
        } finally {
            await response.dispose();
        }
    }
}
