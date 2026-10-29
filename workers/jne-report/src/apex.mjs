import { chromium } from 'playwright';
import {
    access,
    chmod,
    writeFile,
    unlink,
    readFile,
    rename,
    mkdir,
} from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { log, ReportError } from './errors.mjs';
import { readHistory, correlateHistory, csvReady } from './history.mjs';
import { validateCsv } from './csv.mjs';
import { validateReportPeriod } from './limits.mjs';
import { setTimeout as sleep } from 'node:timers/promises';

const navigationError = () =>
    new ReportError(
        'APEX_NAVIGATION',
        'Navigasi JNE gagal setelah percobaan terbatas. Periksa jaringan dan akses JNE.',
    );

export function formatDate(value, format) {
    const [year, month, day] = value.split('-');
    if (format === 'YYYY-MM-DD') return value;
    if (format === 'DD/MM/YYYY') return day + '/' + month + '/' + year;
    if (format === 'DD-MM-YYYY') return day + '-' + month + '-' + year;
    if (format === 'DD-MON-YYYY')
        return (
            day +
            '-' +
            [
                'JAN',
                'FEB',
                'MAR',
                'APR',
                'MAY',
                'JUN',
                'JUL',
                'AUG',
                'SEP',
                'OCT',
                'NOV',
                'DEC',
            ][Number(month) - 1] +
            '-' +
            year
        );
    throw new ReportError(
        'FORM_DATE_FORMAT',
        'Konfirmasi format tanggal halaman 45 dan atur APEX_DATE_FORMAT.',
    );
}

export class ApexClient {
    constructor(config) {
        this.config = config;
    }

    async start() {
        this.browser = await chromium.launch({ headless: true });
        const stored = await access(this.config.sessionPath)
            .then(() => this.config.sessionPath)
            .catch(() => undefined);
        this.context = await this.browser.newContext({
            acceptDownloads: true,
            storageState: stored,
        });
        this.page = await this.context.newPage();
        this.page.setDefaultTimeout(this.config.navigationTimeout);
        this.page.setDefaultNavigationTimeout(this.config.navigationTimeout);
        try {
            const cached = JSON.parse(
                await readFile(this.config.sessionPath + '.apex.json', 'utf8'),
            );
            if (
                cached.origin === new URL(this.config.loginUrl).origin &&
                cached.username === this.config.username &&
                /^[1-9]\d*$/.test(cached.session || '') &&
                /^[A-Za-z0-9_-]+$/.test(cached.appId || '') &&
                (!this.config.appId || cached.appId === this.config.appId) &&
                new URL(cached.endpoint).origin === cached.origin
            ) {
                this.session = cached.session;
                this.appId = cached.appId;
                this.endpoint = cached.endpoint;
            }
        } catch {}
    }

    async close() {
        await this.context?.close().catch(() => {});
        await this.browser?.close().catch(() => {});
        this.browser = null;
        this.session = null;
    }

    async diagnostics() {
        if (!this.page || this.page.isClosed()) return undefined;
        const page = await this.page.evaluate(() => ({
            app_id: document.querySelector('#pFlowId')?.value || null,
            page_id: document.querySelector('#pFlowStepId')?.value || null,
            login_form_visible: Boolean(
                document.querySelector('#P101_USERNAME')?.getClientRects()
                    .length,
            ),
            report_mode_present: Boolean(
                document.querySelector('#P45_PARAM_TYPE'),
            ),
            report_customer_present: Boolean(
                document.querySelector('#P45_CUST'),
            ),
            history_table_count:
                document.querySelectorAll('table.a-IRR-table').length,
            iframe_count: document.querySelectorAll('iframe').length,
        }));
        return { ...page, last_history: this.lastHistory || null };
    }

    async goto(url, waitUntil = 'domcontentloaded') {
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const response = await this.page.goto(url, {
                    waitUntil,
                });
                if (response && [401, 403].includes(response.status()))
                    throw new ReportError(
                        'APEX_ACCESS',
                        'Akses JNE ditolak. Periksa akun atau pembatasan akses.',
                    );
                if (response && response.status() >= 500)
                    throw navigationError();
                return;
            } catch (error) {
                if (
                    error instanceof ReportError &&
                    error.code === 'APEX_ACCESS'
                )
                    throw error;
                if (attempt === 2 || this.page.isClosed())
                    throw navigationError();
                await sleep(500 * (attempt + 1));
            }
        }
    }

    async authenticate() {
        await this.goto(this.config.loginUrl);
        if (await this.page.locator('#P101_USERNAME').isVisible()) {
            if (
                !(await this.page.locator('#P101_PASSWORD').isVisible()) ||
                !(await this.page.locator('#P101_LOGIN').isVisible())
            )
                throw new ReportError(
                    'LOGIN_STRUCTURE',
                    'Kontrol login JNE berubah atau memerlukan interaksi manual.',
                );
            await this.page
                .locator('#P101_USERNAME')
                .fill(this.config.username);
            await this.page
                .locator('#P101_PASSWORD')
                .fill(this.config.password);
            await this.page.locator('#P101_LOGIN').click();
            try {
                await this.page.waitForFunction(() => {
                    const login = document.querySelector('#P101_USERNAME');
                    return !login || login.getClientRects().length === 0;
                });
            } catch {
                throw new ReportError(
                    'LOGIN_REQUIRED',
                    'Login JNE belum berhasil. Periksa kredensial, MFA, CAPTCHA, atau izin akun secara manual.',
                );
            }
        }
        await this.captureSession();
        await this.goto(this.url(45));
        try {
            await this.page
                .locator('#P45_PARAM_TYPE')
                .waitFor({ state: 'visible' });
        } catch {
            throw new ReportError(
                'LOGIN_UNVERIFIED',
                'Sesi JNE belum terverifikasi pada halaman 45. Periksa akses akun.',
            );
        }
        await this.captureSession();
        await this.context.storageState({ path: this.config.sessionPath });
        await chmod(this.config.sessionPath, 0o600);
        const metadataPath = this.config.sessionPath + '.apex.json';
        await writeFile(
            metadataPath + '.tmp',
            JSON.stringify({
                origin: new URL(this.config.loginUrl).origin,
                username: this.config.username,
                session: this.session,
                appId: this.appId,
                endpoint: this.endpoint,
            }),
            { mode: 0o600 },
        );
        await rename(metadataPath + '.tmp', metadataPath);
    }

    async captureSession() {
        const data = await this.page.evaluate(() => ({
            app: document.querySelector('#pFlowId')?.value,
            session: document.querySelector('#pInstance')?.value,
        }));
        const current = new URL(this.page.url());
        const parts = (current.searchParams.get('p') || '').split(':');
        this.appId = this.config.appId || data.app || parts[0];
        this.session = data.session || parts[2];
        this.endpoint =
            this.config.baseUrl ||
            new URL('f', this.config.loginUrl).toString();
        if (
            !/^[A-Za-z0-9_-]+$/.test(this.appId || '') ||
            !/^[1-9]\d*$/.test(this.session || '') ||
            new URL(this.endpoint).origin !==
                new URL(this.config.loginUrl).origin
        )
            throw new ReportError(
                'APEX_SESSION',
                'App ID, endpoint f, atau sesi APEX tidak dapat diverifikasi.',
            );
    }

    url(pageId) {
        const url = new URL(this.endpoint);
        url.search = '';
        url.searchParams.set(
            'p',
            this.appId + ':' + pageId + ':' + this.session,
        );
        return url.toString();
    }

    async open(pageId) {
        if (!this.browser) await this.start();
        if (!this.session) await this.authenticate();
        await this.goto(
            this.url(pageId),
            pageId === 46 ? 'commit' : 'domcontentloaded',
        );
        if (pageId === 46) {
            try {
                await this.page
                    .locator(
                        'table.a-IRR-table, .a-IRR-noDataMsg, #P101_USERNAME',
                    )
                    .first()
                    .waitFor({ state: 'visible' });
            } catch {
                throw new ReportError(
                    'APEX_PAGE',
                    'History JNE belum selesai dimuat.',
                );
            }
        }
        if (await this.page.locator('#P101_USERNAME').isVisible()) {
            await this.authenticate();
            await this.goto(this.url(pageId));
        }
        if (await this.page.locator('#P101_USERNAME').isVisible())
            throw new ReportError(
                'SESSION_EXPIRED',
                'Sesi JNE tetap kedaluwarsa setelah login ulang.',
            );
        if (pageId === 46 && this.config.historyRenderWait)
            await sleep(this.config.historyRenderWait);
        const expected =
            pageId === 45
                ? '#P45_PARAM_TYPE'
                : 'table.a-IRR-table, .a-IRR-noDataMsg';
        try {
            await this.page
                .locator(expected)
                .first()
                .waitFor({ state: 'visible' });
        } catch {
            throw new ReportError(
                'APEX_PAGE',
                'Halaman report JNE tidak dapat diverifikasi. Periksa akses dan kontrol halaman.',
            );
        }
    }

    async history() {
        await this.open(46);
        return readHistory(this.page);
    }

    async setControl(selector, value) {
        this.phase = 'FORM_CONTROL';
        this.activeControl = selector;
        const locator = this.page.locator(selector);
        try {
            await locator.waitFor({ state: 'visible' });
        } catch {
            throw new ReportError(
                'FORM_STRUCTURE',
                'Kontrol form yang dikonfigurasi tidak ditemukan atau tidak unik.',
            );
        }
        if ((await locator.count()) !== 1 || !(await locator.isVisible()))
            throw new ReportError(
                'FORM_STRUCTURE',
                'Kontrol form yang dikonfigurasi tidak ditemukan atau tidak unik.',
            );
        const tag = await locator.evaluate((element) =>
            element.tagName.toLowerCase(),
        );
        if (tag === 'select') {
            if (
                !(await locator
                    .locator('option')
                    .evaluateAll(
                        (options, expected) =>
                            options.some(
                                (option) =>
                                    option.value === expected &&
                                    !option.disabled,
                            ),
                        value,
                    ))
            )
                throw new ReportError(
                    'FORM_OPTION',
                    'Nilai pilihan tidak tersedia pada form JNE. Verifikasi konfigurasi.',
                );
            if ((await locator.inputValue()) === value) return;
            const navigates = await locator.evaluate((element) => {
                const handler = element.getAttribute('onchange') || '';
                return /\blocation(?:\.href)?\s*=|\blocation\.(?:assign|replace)\s*\(|\b(?:apex\.)?submit\s*\(/.test(
                    handler,
                );
            });
            if (navigates) {
                try {
                    await Promise.all([
                        this.page.waitForNavigation({
                            waitUntil: 'domcontentloaded',
                            timeout: this.config.navigationTimeout,
                        }),
                        locator.selectOption(value),
                    ]);
                } catch {
                    throw new ReportError(
                        'FORM_NAVIGATION',
                        'Navigasi setelah perubahan pilihan form JNE tidak selesai. Periksa halaman sebelum Process.',
                    );
                }
            } else {
                await locator.selectOption(value);
            }
        } else if (
            tag === 'fieldset' ||
            (await locator.locator('input[type="radio"]').count())
        ) {
            const radio = locator
                .locator('input[type="radio"]')
                .filter({ visible: true });
            const choices = await radio.evaluateAll((elements) =>
                elements.map((element) => element.value),
            );
            if (!choices.includes(value))
                throw new ReportError(
                    'FORM_OPTION',
                    'Mode parameter tidak tersedia pada form JNE.',
                );
            await radio.nth(choices.indexOf(value)).check();
            return;
        } else {
            await locator.fill(value);
            await locator.blur();
        }
        if (
            selector === '#P45_NA' &&
            (await this.page.locator('#P45_PARAM_TYPE').inputValue()) !== 'P'
        ) {
            await this.setControl('#P45_PARAM_TYPE', 'P');
        }
        if ((await locator.inputValue()) !== value)
            throw new ReportError(
                'FORM_VALUE',
                'Nilai form JNE tidak sesuai setelah pengisian.',
            );
    }

    async prepare(job) {
        await this.open(45);
        const upload = job.report_mode === 'A';
        const expected = {
            '#P45_PARAM_TYPE': job.report_mode,
        };
        await this.setControl('#P45_PARAM_TYPE', job.report_mode);
        if (!upload) {
            const national = job.national_account ?? 'N';
            if (!['Y', 'N'].includes(national)) {
                throw new ReportError(
                    'FORM_VALUE',
                    'National Acc/Cust harus Y atau N.',
                    'FAILED',
                );
            }
            await this.setControl('#P45_NA', national);
            await this.setControl('#P45_PARAM_TYPE', job.report_mode);
            expected['#P45_NA'] = national;
        }
        const reserved = [
            '#P45_PARAM_TYPE',
            '#P45_CUST',
            '#P45_NA',
            '#P45_DATE1',
            '#P45_DATE2',
            '#P45_BLOB_CONTENT',
        ];
        for (const [selector, value] of Object.entries(
            this.config.extraFields,
        )) {
            if (selector === '#P45_NA') continue;
            if (reserved.includes(selector))
                throw new ReportError(
                    'FORM_CONFIG',
                    'Extra fields tidak boleh mengganti kontrol inti report.',
                );
            if (upload && !(await this.page.locator(selector).isVisible()))
                continue;
            if (
                selector === '#P45_BRANCH' &&
                job.national_account === 'Y' &&
                !(await this.page.locator(selector).isVisible())
            ) {
                continue;
            }
            await this.setControl(selector, value);
        }
        if (upload) {
            if (
                !Array.isArray(job.awbs) ||
                job.awbs.length < 1 ||
                job.awbs.length > 6000 ||
                job.awbs.some(
                    (awb) =>
                        typeof awb !== 'string' ||
                        !/^[A-Z0-9_-]{1,100}$/.test(awb),
                ) ||
                !/^(?:hybrid-[a-z]+|active-awbs)-\d+-\d+-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.csv$/.test(
                    job.upload_filename || '',
                )
            ) {
                throw new ReportError(
                    'UPLOAD_PARAMETERS',
                    'Daftar AWB atau identitas file upload APEX tidak valid.',
                    'FAILED',
                );
            }
            const file = this.page.locator('#P45_BLOB_CONTENT');
            await file.waitFor({ state: 'visible' });
            await file.setInputFiles({
                name: job.upload_filename,
                mimeType: 'text/csv',
                buffer: Buffer.from(job.awbs.join('\r\n') + '\r\n'),
            });
            if (
                (await file.evaluate((element) => element.files?.[0]?.name)) !==
                job.upload_filename
            ) {
                throw new ReportError(
                    'UPLOAD_FILE',
                    'File AWB belum terpasang pada form APEX.',
                );
            }
        } else {
            expected['#P45_CUST'] = job.customer_account;
            await this.setControl('#P45_CUST', job.customer_account);
        }
        for (const [selector, date] of upload
            ? []
            : [
                  ['#P45_DATE1', job.date_from],
                  ['#P45_DATE2', job.date_thru],
              ]) {
            const control = this.page.locator(selector);
            const type = await control.getAttribute('type');
            const format =
                type === 'date'
                    ? 'YYYY-MM-DD'
                    : this.config.dateFormat ||
                      (await control.getAttribute('placeholder'));
            expected[selector] = formatDate(date, format);
            await this.setControl(selector, expected[selector]);
        }
        for (const [selector, value] of Object.entries(expected)) {
            const actual = await this.page
                .locator(selector)
                .evaluate(
                    (element) =>
                        element.querySelector('input[type="radio"]:checked')
                            ?.value ?? element.value,
                );
            if (actual !== value)
                throw new ReportError(
                    'FORM_CHANGED',
                    'Parameter inti form berubah sebelum Process. Periksa dynamic actions dan konfigurasi JNE.',
                );
        }
        const invalid = await this.page
            .locator('input:visible, select:visible, textarea:visible')
            .evaluateAll((elements) =>
                elements.some((element) => {
                    if (
                        element.disabled ||
                        element.readOnly ||
                        ['submit', 'button', 'file', 'reset'].includes(
                            element.type,
                        )
                    )
                        return false;
                    const label = [...(element.labels || [])]
                        .map((item) => item.textContent)
                        .join(' ');
                    const required =
                        element.required ||
                        element.getAttribute('aria-required') === 'true' ||
                        /\*|required|wajib/i.test(label) ||
                        /SLA|National Account|Branch/i.test(label);
                    const empty =
                        element.type === 'radio'
                            ? ![
                                  ...document.querySelectorAll(
                                      'input[type="radio"]',
                                  ),
                              ].some(
                                  (input) =>
                                      input.name === element.name &&
                                      input.checked,
                              )
                            : element.type === 'checkbox'
                              ? !element.checked
                              : !element.value?.trim();
                    return (
                        (required && empty) ||
                        (element.willValidate && !element.checkValidity())
                    );
                }),
            );
        if (invalid)
            throw new ReportError(
                'FORM_REQUIRED',
                'Form JNE memerlukan field tambahan atau format yang berbeda. Jalankan inspect dan lengkapi konfigurasi sebelum Process.',
            );
        const button = this.config.processSelector
            ? this.page.locator(this.config.processSelector)
            : this.page.getByRole('button', { name: /^Process$/i });
        if (
            (await button.count()) !== 1 ||
            !(await button.isVisible()) ||
            !(await button.isEnabled())
        )
            throw new ReportError(
                'PROCESS_CONTROL',
                'Tombol Process belum terverifikasi. Atur selector dari DOM halaman 45.',
            );
        return button;
    }

    async retrieve(job, tempDir, progress, signal) {
        this.lastHistory = null;
        this.phase = 'VALIDATING_PARAMETERS';
        validateReportPeriod(job);
        this.phase = 'HISTORY_SNAPSHOT';
        if (!this.config.historyDateFormat)
            throw new ReportError(
                'HISTORY_DATE_FORMAT',
                'Konfirmasi format CREATED_DATE halaman 46 dan atur APEX_HISTORY_DATE_FORMAT.',
                'FAILED',
            );
        const before = await this.history();
        this.phase = 'PREPARING_FORM';
        const button = await this.prepare(job);
        signal.throwIfAborted();
        const submittedAt = Date.now();
        await writeFile(
            path.join(tempDir, 'submission.json'),
            JSON.stringify({
                job_id: job.id,
                submitted_at: submittedAt,
                baseline_ids: before.map((row) => row.id),
            }),
            { mode: 0o600 },
        );
        let accepted = false;
        try {
            this.phase = 'SUBMITTING_REPORT';
            // This is the only Process click. Never retry it, including after a timeout.
            await Promise.all([
                this.page.waitForNavigation({
                    waitUntil: 'domcontentloaded',
                    timeout: this.config.navigationTimeout,
                }),
                button.click(),
            ]);
            if (
                await this.page
                    .locator(
                        '.a-Notification--error:visible, .a-Form-error:visible, .t-Alert--danger:visible, .apex-page-error:visible',
                    )
                    .count()
            )
                throw new ReportError(
                    'FORM_REJECTED',
                    'JNE menolak parameter report. Periksa pesan validasi halaman 45.',
                    'FAILED',
                );
            accepted =
                (await this.page
                    .locator(this.config.successSelector)
                    .filter({ visible: true })
                    .count()) > 0;
        } catch (error) {
            if (error instanceof ReportError) throw error;
            // A response may be lost after JNE accepted the request. Correlate history first.
        }
        await progress('WAITING_REPORT');
        this.phase = 'POLLING_HISTORY';
        const deadline = Date.now() + this.config.reportTimeout;
        let pinnedId = null;
        let upstreamErrorSince = null;
        let upstreamErrorReads = 0;
        while (Date.now() < deadline) {
            signal.throwIfAborted();
            this.phase = 'POLLING_HISTORY';
            try {
                const current = await this.history();
                const row = correlateHistory(
                    before,
                    current,
                    job,
                    submittedAt,
                    this.config,
                    pinnedId,
                    accepted,
                );
                if (row) {
                    pinnedId = row.id;
                    const snapshot = {
                        status: String(row.status).slice(0, 40),
                        download_available: Boolean(row.download),
                        api_error_code:
                            /\bError\s+API\s+([45]\d{2})\b/i.exec(
                                row.error || '',
                            )?.[1] || null,
                    };
                    if (
                        JSON.stringify(snapshot) !==
                        JSON.stringify(this.lastHistory)
                    ) {
                        log('report_history_status', {
                            job_id: job.id,
                            ...snapshot,
                        });
                    }
                    this.lastHistory = snapshot;
                    if (csvReady(row)) {
                        await progress('DOWNLOADING');
                        this.phase = 'DOWNLOADING';
                        return await this.download(
                            row,
                            tempDir,
                            Math.min(
                                this.config.maxFileBytes,
                                job.max_file_kb * 1024,
                            ),
                        );
                    }
                    if (
                        row.status.trim().toUpperCase() === 'ERROR' &&
                        /^Error API 500\.$/.test(row.error.trim()) &&
                        !row.download
                    ) {
                        upstreamErrorSince ??= Date.now();
                        upstreamErrorReads++;
                        if (
                            upstreamErrorReads >= 3 &&
                            Date.now() - upstreamErrorSince >=
                                (this.config.upstreamErrorGrace ?? 60000)
                        ) {
                            throw new ReportError(
                                'APEX_SOURCE_API',
                                `History ${row.filename} tetap Error API 500 setelah konfirmasi berulang; CSV belum tersedia. Process tidak diulang.`,
                            );
                        }
                    } else {
                        upstreamErrorSince = null;
                        upstreamErrorReads = 0;
                    }
                    const noDataMessage = [
                        job.customer_account,
                        formatDate(job.date_from, 'DD-MON-YYYY'),
                        formatDate(job.date_thru, 'DD-MON-YYYY'),
                        'No Data Found',
                    ]
                        .join(' ')
                        .toUpperCase();
                    if (
                        this.config.strictHistoryIdentity &&
                        job.report_mode === 'P' &&
                        row.status.trim().toUpperCase() === 'ERROR' &&
                        row.error.replace(/\s+/g, ' ').trim().toUpperCase() ===
                            noDataMessage
                    ) {
                        throw new ReportError(
                            'APEX_NO_DATA',
                            `History ${row.id} (${row.filename}) mengonfirmasi ${row.error.trim()}.`,
                            'NO_DATA',
                        );
                    }
                }
            } catch (error) {
                signal.throwIfAborted();
                if (
                    !(error instanceof ReportError) ||
                    ![
                        'APEX_NAVIGATION',
                        'APEX_PAGE',
                        'DOWNLOAD_MISSING',
                        'DOWNLOAD_TIMEOUT',
                        'DOWNLOAD_FAILED',
                    ].includes(error.code)
                )
                    throw error;
                log('report_poll_retry', { job_id: job.id, code: error.code });
            }
            await sleep(
                Math.min(
                    this.config.pollInterval,
                    Math.max(0, deadline - Date.now()),
                ),
                undefined,
                { signal },
            );
        }
        throw new ReportError(
            'REPORT_TIMEOUT',
            'Batas waktu menunggu atau mengunduh CSV JNE terlampaui setelah refresh berulang. ' +
                (this.lastHistory
                    ? `Status JNE terakhir: ${this.lastHistory.status}; Download ${this.lastHistory.download_available ? 'tersedia' : 'belum tersedia'}${this.lastHistory.api_error_code ? `; Error API ${this.lastHistory.api_error_code}` : ''}. `
                    : '') +
                'Periksa report yang sama di History; tidak ada pengiriman ulang otomatis.',
        );
    }

    async download(row, tempDir, maxBytes) {
        const currentRows = await readHistory(this.page);
        const current = currentRows.find(
            (candidate) => candidate.id === row.id,
        );
        if (!current || current.download !== row.download)
            throw new ReportError(
                'DOWNLOAD_MISSING',
                'Baris report tidak ditemukan saat download.',
            );
        const match = this.page
            .locator('table.a-IRR-table:visible tr')
            .nth(current.rowIndex);
        const links = match.locator('td[headers] a[href]');
        let target = null;
        for (const link of await links.all()) {
            if ((await link.getAttribute('href')) === row.download) {
                if (target)
                    throw new ReportError(
                        'DOWNLOAD_AMBIGUOUS',
                        'Tautan download report tidak unik.',
                    );
                target = link;
            }
        }
        if (!target)
            throw new ReportError(
                'DOWNLOAD_MISSING',
                'Tautan CSV tidak tersedia.',
            );
        const destination = new URL(row.download, this.page.url());
        if (
            !['http:', 'https:'].includes(destination.protocol) ||
            destination.origin !== new URL(this.config.loginUrl).origin
        )
            throw new ReportError(
                'DOWNLOAD_ORIGIN',
                'Tautan download tidak berada pada origin JNE yang diizinkan.',
            );
        let download;
        try {
            [download] = await Promise.all([
                this.page.waitForEvent('download', {
                    timeout: this.config.downloadTimeout,
                }),
                target.click({ timeout: this.config.downloadTimeout }),
            ]);
        } catch (error) {
            throw new ReportError(
                error.name === 'TimeoutError'
                    ? 'DOWNLOAD_TIMEOUT'
                    : 'DOWNLOAD_FAILED',
                'Unduhan CSV JNE belum berhasil. Refresh History dan coba tautan report yang sama.',
            );
        }
        const filePath = path.join(tempDir, randomUUID() + '.csv');
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            void download.cancel().catch(() => {});
        }, this.config.downloadTimeout);
        try {
            // Bound the saved CSV copy before upload.
            const stream = await download.createReadStream();
            if (!stream)
                throw new ReportError(
                    'DOWNLOAD_FAILED',
                    'JNE tidak memberikan stream CSV.',
                );
            let bytes = 0;
            const { createWriteStream } = await import('node:fs');
            const { pipeline } = await import('node:stream/promises');
            const { Transform } = await import('node:stream');
            await pipeline(
                stream,
                new Transform({
                    transform(chunk, encoding, callback) {
                        bytes += chunk.length;
                        if (bytes > maxBytes) {
                            callback(
                                new ReportError(
                                    'CSV_SIZE',
                                    'CSV melebihi batas ukuran.',
                                ),
                            );
                            return;
                        }
                        callback(null, chunk);
                    },
                }),
                createWriteStream(filePath, { flags: 'wx', mode: 0o600 }),
            );
            if (await download.failure())
                throw new ReportError(
                    'DOWNLOAD_FAILED',
                    'Unduhan CSV JNE gagal.',
                );
            await validateCsv(filePath, maxBytes);
            return filePath;
        } catch (error) {
            await download.cancel().catch(() => {});
            await unlink(filePath).catch(() => {});
            if (timedOut)
                throw new ReportError(
                    'DOWNLOAD_TIMEOUT',
                    'Batas waktu download CSV JNE terlampaui. Periksa History sebelum meminta report baru.',
                );
            if (error instanceof ReportError || error.code) throw error;
            throw new ReportError(
                'DOWNLOAD_FAILED',
                'Stream unduhan CSV JNE terputus. Coba kembali report yang sama.',
            );
        } finally {
            clearTimeout(timer);
        }
    }

    async captureFailure(jobId, code) {
        if (!this.page || this.page.isClosed()) return;
        const directory = path.join(this.config.dataDir, 'failures');
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const base = path.join(
            directory,
            `${jobId}-${Date.now()}-${String(code).replace(/[^A-Z_]/g, '')}`,
        );
        await writeFile(
            base + '.json',
            JSON.stringify({
                job_id: jobId,
                code,
                phase: this.phase,
                control: this.activeControl,
                page: await this.diagnostics(),
            }),
            { mode: 0o600 },
        );
        await this.page
            .screenshot({
                path: base + '.png',
                fullPage: true,
                mask: [this.page.locator('input, textarea')],
            })
            .catch(() => {});
        const html = await this.page.evaluate(() => {
            const documentCopy = document.documentElement.cloneNode(true);
            documentCopy
                .querySelectorAll('script, input, textarea')
                .forEach((element) => element.remove());
            [documentCopy, ...documentCopy.querySelectorAll('*')].forEach(
                (element) => {
                    for (const attribute of Array.from(element.attributes)) {
                        if (
                            ![
                                'id',
                                'class',
                                'headers',
                                'role',
                                'type',
                                'name',
                            ].includes(attribute.name)
                        )
                            element.removeAttribute(attribute.name);
                    }
                },
            );
            return documentCopy.outerHTML;
        });
        await writeFile(base + '.html', html, { mode: 0o600 });
    }
}
