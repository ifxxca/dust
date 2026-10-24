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

    retrieve(kind, date) {
        return this.exclusive(() => this.retrieveReport(kind, date));
    }

    async retrieveReport(kind, date) {
        validateHybridDate(date);
        if (!Object.hasOwn(reports, kind)) {
            throw new ReportError(
                'HYBRID_REPORT',
                'Jenis laporan harus cashless atau manual.',
            );
        }
        for (let attempt = 0; attempt < 3; attempt++) {
            assertSessionWindow(this.clock());
            if (!this.session || this.needsDailyLogin()) {
                await this.authenticate();
            }
            try {
                const result = await this.download(kind, date);
                await this.saveSession();
                return result;
            } catch (error) {
                if (error.code === 'HYBRID_SESSION_EXPIRED' && attempt < 2) {
                    this.session = null;
                    continue;
                }
                const transient =
                    error.name === 'TimeoutError' ||
                    error.code === 'HYBRID_DOWNLOAD_TRANSIENT' ||
                    /ERR_CONNECTION_RESET|ERR_TIMED_OUT|ECONNRESET|ETIMEDOUT/.test(
                        error.message || '',
                    );
                if (transient && attempt < 2) {
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
                    throw new ReportError(
                        'HYBRID_DOWNLOAD_TIMEOUT',
                        'Pembacaan report Hybrid gagal setelah tiga percobaan. Periksa koneksi dan ketersediaan unduhan.',
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
        await thru.fill(displayDate);
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
        this.phase = 'download_csv';
        await actions.click();
        await this.page
            .getByRole('menuitem', { name: 'Download', exact: true })
            .click();
        const csv = this.page
            .getByRole('dialog')
            .getByRole('link', { name: 'CSV', exact: true });
        const downloadUrl = new URL(
            await csv.getAttribute('href'),
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
        const response = await this.context.request.get(
            downloadUrl.toString(),
            {
                timeout: this.config.downloadTimeout,
                maxRedirects: 0,
            },
        );
        try {
            if (response.status() >= 500 || response.status() === 429) {
                throw new ReportError(
                    'HYBRID_DOWNLOAD_TRANSIENT',
                    'Server Hybrid sementara belum menyediakan unduhan.',
                );
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
            const bytes = await response.body();
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
            return {
                source: this.profile.name,
                report: kind,
                date,
                ...summary,
                file,
            };
        } finally {
            await response.dispose();
        }
    }
}
