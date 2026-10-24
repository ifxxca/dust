import { randomUUID } from 'node:crypto';
import { fixture } from './hybrid-fixture.mjs';
import { WorkerApi } from '../src/api.mjs';
import { runHybridReportJob } from '../src/hybrid-jobs.mjs';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import { apexUploadFixture } from './apex-upload-fixture.mjs';
import { ApexClient } from '../src/apex.mjs';
import { runJob } from '../src/worker.mjs';

const cleanup = [];
const combined = process.env.JNE_COMBINED_QA === '1';
const site = await fixture(
    { after: (operation) => cleanup.push(operation) },
    { start: false },
);
try {
    await Promise.all(
        ['roberto', 'nuralamt'].map(async (source) => {
            const client = site.newClient({
                name: source,
                username: source === 'roberto' ? 'fixture-user' : 'other-user',
            });
            await client.start();
            const api = new WorkerApi({
                apiUrl: process.env.RETAIL_OPERATIONS_URL,
                token: process.env.JNE_REPORT_WORKER_TOKEN,
                workerId: 'hybrid-' + source,
                apiTimeout: 10000,
            });
            for (let count = 0; count < 2; count++) {
                const job = await api.claim(randomUUID());
                if (!job) {
                    throw new Error('Fixture job was not claimed.');
                }
                const result = await runHybridReportJob(
                    job,
                    api,
                    client,
                    source,
                    () => {},
                );
                if (!result) {
                    throw new Error('Hybrid report did not complete.');
                }
            }
        }),
    );
    if (site.state.logins !== 2 || site.state.downloads.length !== 4) {
        throw new Error('Accounts did not reuse isolated sessions.');
    }
    const apexSite = await apexUploadFixture({
        analytics: Boolean(process.env.JNE_UI_QA_EMAIL),
    });
    cleanup.push(() => apexSite.close());
    const directory = await mkdtemp(
        path.join(os.tmpdir(), 'hybrid-apex-flow-'),
    );
    cleanup.push(() => rm(directory, { recursive: true, force: true }));
    const config = {
        ...apexSite.config(directory),
        apiUrl: process.env.RETAIL_OPERATIONS_URL,
        token: process.env.JNE_REPORT_WORKER_TOKEN,
        workerId: 'jne-report-1',
        apiTimeout: 10000,
        dataDir: directory,
        jobTimeout: 30000,
    };
    const apex = new ApexClient(config);
    cleanup.push(() => apex.close());
    const api = new WorkerApi(config);
    for (let count = 0; count < (combined ? 1 : 4); count++) {
        const job = await api.claim(randomUUID());
        if (
            !job ||
            job.report_mode !== 'A' ||
            !(await runJob(
                job,
                api,
                apex,
                config,
                new AbortController().signal,
            ))
        )
            throw new Error('Hybrid AWBs did not complete through APEX.');
    }
    if (
        apexSite.state.uploads.length !== (combined ? 1 : 4) ||
        apexSite.state.uploads.some(
            (upload) => upload.awbs.join(',') !== '001,002',
        )
    )
        throw new Error('APEX did not receive exactly the Hybrid AWBs.');
    if (await api.claim(randomUUID()))
        throw new Error(
            'Unexpected extra APEX request after the combined cycle.',
        );
    if (process.env.JNE_UI_QA_EMAIL) {
        await verifyUi();
    }
    process.stdout.write('HYBRID_LARAVEL_FIXTURE_OK\n');
} finally {
    for (const operation of cleanup.reverse()) {
        await operation();
    }
}

async function verifyUi() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const directory = process.env.JNE_UI_QA_DIR;
    await mkdir(directory, { recursive: true });
    try {
        await page.goto(process.env.RETAIL_OPERATIONS_URL + '/login');
        const csrf = (await page.context().cookies()).find(
            (cookie) => cookie.name === 'XSRF-TOKEN',
        );
        const login = await page.request.post(
            process.env.RETAIL_OPERATIONS_URL + '/login',
            {
                form: {
                    email: process.env.JNE_UI_QA_EMAIL,
                    password: 'password',
                },
                headers: {
                    'X-XSRF-TOKEN': decodeURIComponent(csrf.value),
                    Accept: 'application/json',
                },
            },
        );
        if (!login.ok()) {
            throw new Error('Test account login failed: ' + login.status());
        }
        await page.goto(
            process.env.RETAIL_OPERATIONS_URL +
                '/admin/jne-monitoring/profiles',
        );
        await page
            .getByRole('heading', { name: 'Pengaturan penarikan', exact: true })
            .waitFor();
        const manual = page.getByRole('article', {
            name: combined ? 'QA Hybrid gabungan' : 'QA nuralamt manual',
            exact: true,
        });
        await manual.getByRole('button', { name: 'Atur', exact: true }).click();
        await page.getByLabel('Frekuensi').fill('17');
        await page
            .getByRole('button', { name: 'Simpan sumber', exact: true })
            .click();
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
        await manual.getByText('17', { exact: true }).waitFor();
        const scheduleToggle = manual.getByRole('checkbox');
        await scheduleToggle.click();
        await manual.getByText('Aktif', { exact: true }).waitFor();
        await scheduleToggle.click();
        await manual.getByText('Nonaktif', { exact: true }).waitFor();
        if (combined) {
            await page
                .getByRole('button', {
                    name: 'Atur Hybrid gabungan',
                    exact: true,
                })
                .click();
            await page
                .getByLabel('Sumber', { exact: true })
                .getAttribute('data-state');
            if (
                (await page.getByLabel('Nomor penarikan JNE').inputValue()) !==
                'HYBRID_GABUNGAN'
            )
                throw new Error(
                    'Combined configuration did not retain its identity.',
                );
            await page.keyboard.press('Escape');
            await page.getByRole('dialog').waitFor({ state: 'hidden' });
        }
        await page
            .getByRole('button', { name: 'Atur resi aktif', exact: true })
            .click();
        await page
            .getByLabel('Batas usia entry resi (hari)', { exact: true })
            .fill('60');
        await page.getByLabel('Frekuensi', { exact: true }).fill('17');
        await page
            .getByRole('button', { name: 'Simpan sumber', exact: true })
            .click();
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
        await page.getByText('Semua account', { exact: true }).waitFor();
        await page
            .getByText('Aturan pembaruan status', {
                exact: true,
            })
            .waitFor();
        await page.getByRole('button', { name: 'Tambah konfigurasi' }).click();
        await page
            .getByLabel('Nama sumber', { exact: true })
            .fill('QA account custom');
        await page.getByLabel('Nomor penarikan JNE').fill('QA-CUSTOM-123');
        await page.getByLabel('Frekuensi').fill('13');
        await page
            .getByRole('button', { name: 'Simpan sumber', exact: true })
            .click();
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
        await page.getByText('QA-CUSTOM-123', { exact: true }).waitFor();
        await page
            .getByRole('button', { name: 'Impor banyak account', exact: true })
            .click();
        const accounts = Array.from(
            { length: 100 },
            (_, i) =>
                `${String(i + 1).padStart(8, '0')}\t${i % 2 ? 'YES' : 'NO'}`,
        ).join('\n');
        await page
            .getByLabel('Daftar account & National Acc/Cust', { exact: true })
            .fill(accounts);
        await page
            .getByRole('button', { name: 'Simpan 100 account', exact: true })
            .click();
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
        const accountRegion = page.getByRole('region', {
            name: 'Account APEX',
            exact: true,
        });
        await page
            .getByLabel('Cari account APEX', { exact: true })
            .fill('00000002');
        await accountRegion.getByText('YES', { exact: true }).waitFor();
        await accountRegion
            .getByRole('button', { name: 'Atur', exact: true })
            .click();
        if (
            (await page
                .getByLabel('National Acc/Cust', { exact: true })
                .textContent()) !== 'YES'
        )
            throw new Error('Imported YES account lost its National flag.');
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
        await page.getByLabel('Cari account APEX', { exact: true }).fill('');
        await accountRegion
            .getByRole('button', { name: 'Berikutnya', exact: true })
            .click();
        await accountRegion.getByText(/Halaman 2 dari 6/).waitFor();
        await accountRegion
            .getByRole('button', { name: 'Sebelumnya', exact: true })
            .click();
        await accountRegion.screenshot({
            path: path.join(directory, 'accounts-desktop.png'),
        });
        const rules = page.getByRole('button', {
            name: /^Aturan pembaruan status/,
        });
        if ((await rules.getAttribute('aria-expanded')) !== 'false')
            throw new Error('Rules must be collapsed initially.');
        await rules.focus();
        await page.keyboard.press('Enter');
        await page.getByText('Terus dipantau', { exact: true }).waitFor();
        await page.screenshot({
            path: path.join(directory, 'rules-expanded.png'),
            fullPage: true,
        });
        await rules.click();
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.evaluate(
            () =>
                new Promise((resolve) =>
                    requestAnimationFrame(() => requestAnimationFrame(resolve)),
                ),
        );
        await page.screenshot({
            path: path.join(directory, 'settings-desktop.png'),
            fullPage: true,
        });
        await page
            .getByRole('region', { name: /^Sumber tersimpan/ })
            .screenshot({
                path: path.join(directory, 'settings-schedules.png'),
            });
        await page
            .getByRole('region', { name: 'Pilih alur penarikan', exact: true })
            .screenshot({ path: path.join(directory, 'settings-flows.png') });
        await page.goto(
            process.env.RETAIL_OPERATIONS_URL + '/admin/jne-monitoring',
        );
        await page
            .getByRole('button', {
                name: 'Perbarui resi aktif sekarang',
                exact: true,
            })
            .waitFor();
        await page.screenshot({
            path: path.join(directory, 'monitoring-desktop.png'),
            fullPage: true,
        });
        await page.getByRole('button', { name: /^Terkirim/ }).click();
        await page.waitForURL(
            (url) => url.searchParams.get('status') === 'DELIVERED',
        );
        await page.getByRole('button', { name: /^Semua pengiriman/ }).click();
        await page.waitForURL((url) => !url.searchParams.get('status'));
        await page.goto(
            process.env.RETAIL_OPERATIONS_URL + '/admin/jne-reports',
        );
        await page
            .getByRole('heading', { name: 'Penarikan Report JNE', exact: true })
            .waitFor();
        const today = await page
            .getByLabel('Tanggal dari', { exact: true })
            .inputValue();
        await page
            .getByRole('button', { name: '7 hari terakhir', exact: true })
            .click();
        await page
            .getByRole('button', {
                name: 'Satu permintaan, 2 bagian report',
                exact: true,
            })
            .waitFor();
        const breakdown = page.getByRole('button', {
            name: 'Satu permintaan, 2 bagian report',
            exact: true,
        });
        await breakdown.focus();
        await page.keyboard.press('Enter');
        if ((await breakdown.getAttribute('aria-expanded')) !== 'true')
            throw new Error('Period breakdown is not keyboard accessible.');
        await page
            .getByRole('button', { name: 'Kemarin', exact: true })
            .click();
        const yesterday = await page
            .getByLabel('Tanggal dari', { exact: true })
            .inputValue();
        if (
            yesterday >= today ||
            (await page
                .getByLabel('Tanggal sampai', { exact: true })
                .inputValue()) !== yesterday
        )
            throw new Error('Yesterday preset selected the wrong period.');
        await page
            .getByRole('button', { name: 'Hari ini', exact: true })
            .click();
        if (
            (await page
                .getByLabel('Tanggal dari', { exact: true })
                .inputValue()) !== today
        )
            throw new Error('Today preset did not reset the period.');
        await page.screenshot({
            path: path.join(directory, 'reports-desktop.png'),
            fullPage: true,
        });
        await page
            .getByRole('button', { name: 'Banyak account', exact: true })
            .click();
        await page
            .getByLabel('Daftar account & National Acc/Cust', { exact: true })
            .fill('11729800\tNO\n80089400\tYES');
        await page
            .getByRole('list', { name: 'Pratinjau account', exact: true })
            .getByText('YES', { exact: true })
            .waitFor();
        if (await page.getByText('Riwayat permintaan', { exact: true }).count())
            throw new Error('Report page still duplicates history.');
        await page.screenshot({
            path: path.join(directory, 'reports-bulk.png'),
            fullPage: true,
        });
        await page.goto(
            process.env.RETAIL_OPERATIONS_URL + '/admin/report-runs',
        );
        await page
            .getByRole('heading', { name: 'Riwayat run report', exact: true })
            .waitFor();
        await page
            .getByRole('button', { name: 'Detail & log', exact: true })
            .first()
            .click();
        await page
            .getByText('CSV tervalidasi dan tersimpan.', { exact: true })
            .waitFor();
        if (combined) {
            await page
                .getByText('Hasil APEX sudah diimpor dan siap dimonitor.', {
                    exact: true,
                })
                .waitFor();
            await page
                .getByText('Empat report sumber', { exact: true })
                .waitFor();
        }
        await page.screenshot({
            path: path.join(directory, 'run-detail.png'),
            fullPage: true,
            animations: 'disabled',
        });
        const developerInfo = page.getByRole('button', {
            name: 'Informasi developer',
            exact: true,
        });
        await developerInfo.focus();
        await page.keyboard.press('Enter');
        await page
            .getByRole('button', { name: 'Salin log developer', exact: true })
            .waitFor();
        if ((await developerInfo.getAttribute('aria-expanded')) !== 'true')
            throw new Error(
                'Developer information is not keyboard accessible.',
            );
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
        await page.getByLabel('Sumber', { exact: true }).click();
        await page
            .getByRole('option', {
                name: combined ? 'Hybrid gabungan' : 'Hybrid NURALAMT',
                exact: true,
            })
            .click();
        await page
            .getByRole('button', { name: 'Terapkan', exact: true })
            .click();
        await page.waitForURL(
            (url) =>
                url.searchParams.get('source') ===
                (combined ? 'hybrid' : 'nuralamt'),
        );
        if ((await page.locator('tbody tr').count()) !== (combined ? 1 : 2)) {
            throw new Error(
                'Source filter did not isolate the two NURALAMT reports.',
            );
        }
        await page.screenshot({
            path: path.join(directory, 'runs-desktop.png'),
            fullPage: true,
        });
        if (combined) {
            await page
                .getByRole('button', { name: 'Tarik sekarang', exact: true })
                .click();
            await page.getByLabel('Konfigurasi', { exact: true }).click();
            await page
                .getByRole('option')
                .filter({ hasText: 'QA Hybrid gabungan' })
                .click();
            await page
                .getByLabel('Tanggal data Hybrid', { exact: true })
                .fill('2026-10-22');
            await page.screenshot({
                path: path.join(directory, 'combined-run-date.png'),
                fullPage: true,
                animations: 'disabled',
            });
            await page.keyboard.press('Escape');
            await page.getByRole('dialog').waitFor({ state: 'hidden' });
        }
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.setViewportSize({ width: 375, height: 812 });
        await page.goto(
            process.env.RETAIL_OPERATIONS_URL +
                '/admin/jne-monitoring/profiles',
        );
        await page
            .getByRole('heading', { name: 'Pengaturan penarikan', exact: true })
            .waitFor();
        if (
            await page.evaluate(
                () => document.documentElement.scrollWidth > innerWidth + 1,
            )
        ) {
            throw new Error('Settings page overflows the mobile viewport.');
        }
        await page.screenshot({
            path: path.join(directory, 'settings-mobile.png'),
            fullPage: true,
        });
        await page.goto(
            process.env.RETAIL_OPERATIONS_URL + '/admin/jne-monitoring',
        );
        await page
            .getByRole('button', {
                name: 'Perbarui resi aktif sekarang',
                exact: true,
            })
            .waitFor();
        if (
            await page.evaluate(
                () => document.documentElement.scrollWidth > innerWidth + 1,
            )
        )
            throw new Error('Monitoring page overflows the mobile viewport.');
        await page.screenshot({
            path: path.join(directory, 'monitoring-mobile.png'),
            fullPage: true,
        });
        await page
            .getByRole('button', { name: 'Detail pengiriman', exact: true })
            .first()
            .click();
        await page.getByRole('dialog').waitFor();
        await page.getByRole('heading', { name: /^AWB / }).waitFor();
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
        await page.goto(
            process.env.RETAIL_OPERATIONS_URL + '/admin/jne-reports',
        );
        await page
            .getByRole('heading', { name: 'Penarikan Report JNE', exact: true })
            .waitFor();
        if (
            await page.evaluate(
                () => document.documentElement.scrollWidth > innerWidth + 1,
            )
        )
            throw new Error('Reports page overflows the mobile viewport.');
        await page.screenshot({
            path: path.join(directory, 'reports-mobile.png'),
            fullPage: true,
        });
        await page
            .getByRole('button', { name: 'Banyak account', exact: true })
            .click();
        await page
            .getByLabel('Daftar account & National Acc/Cust', { exact: true })
            .fill('11729800\tNO\n80089400\tYES');
        if (
            await page.evaluate(
                () => document.documentElement.scrollWidth > innerWidth + 1,
            )
        )
            throw new Error('Bulk report form overflows the mobile viewport.');
        await page.screenshot({
            path: path.join(directory, 'reports-bulk-mobile.png'),
            fullPage: true,
        });
        await page.goto(
            process.env.RETAIL_OPERATIONS_URL + '/admin/report-runs',
        );
        await page
            .getByRole('heading', { name: 'Riwayat run report', exact: true })
            .waitFor();
        if (
            await page.evaluate(
                () => document.documentElement.scrollWidth > innerWidth + 1,
            )
        ) {
            throw new Error('Runs page overflows the mobile viewport.');
        }
        await page.screenshot({
            path: path.join(directory, 'runs-mobile.png'),
            fullPage: true,
        });
        await page.setViewportSize({ width: 812, height: 375 });
        await page.goto(
            process.env.RETAIL_OPERATIONS_URL +
                '/admin/jne-monitoring/profiles',
        );
        await page
            .getByRole('heading', { name: 'Pengaturan penarikan', exact: true })
            .waitFor();
        if (
            await page.evaluate(
                () => document.documentElement.scrollWidth > innerWidth + 1,
            )
        )
            throw new Error('Settings page overflows in landscape.');
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.evaluate(() => {
            document.documentElement.classList.add('dark');
            window.scrollTo(0, 0);
        });
        await page.screenshot({
            path: path.join(directory, 'settings-dark.png'),
            fullPage: true,
        });
        for (const [route, heading, filename] of [
            ['/admin/jne-monitoring', 'Pengiriman JNE', 'monitoring-dark.png'],
            ['/admin/jne-reports', 'Penarikan Report JNE', 'reports-dark.png'],
            ['/admin/report-runs', 'Riwayat run report', 'runs-dark.png'],
        ]) {
            await page.goto(process.env.RETAIL_OPERATIONS_URL + route);
            await page
                .getByRole('heading', { name: heading, exact: true })
                .waitFor();
            await page.evaluate(() => {
                document.documentElement.classList.add('dark');
                window.scrollTo(0, 0);
            });
            await page.screenshot({
                path: path.join(directory, filename),
                fullPage: true,
            });
        }
        await verifyCustomerDashboard(page, directory);
        await verifyOperationalDashboard(page, directory);
        if (errors.length) {
            throw new Error('Browser errors: ' + errors.join('; '));
        }
        process.stdout.write('SCRAPING_UI_QA_OK\n');
    } catch (error) {
        await page.screenshot({
            path: path.join(directory, 'failure.png'),
            fullPage: true,
        });
        throw error;
    } finally {
        await browser.close();
    }
}

async function verifyCustomerDashboard(page, directory) {
    const dashboard =
        process.env.RETAIL_OPERATIONS_URL +
        '/admin/jne-monitoring/customer-dashboard?date_from=2026-10-22&date_thru=2026-10-23';
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(dashboard);
    await page
        .getByRole('heading', { name: 'Dashboard customer', exact: true })
        .waitFor();
    const selectedMenu = page.locator(
        'a[data-sidebar="menu-button"][aria-current="page"]',
    );
    if (
        (await selectedMenu.count()) !== 1 ||
        (await selectedMenu.innerText()) !== 'Dashboard customer'
    )
        throw new Error('Dashboard sidebar does not show one active entry.');
    if (
        await page
            .getByRole('navigation', { name: 'Pengiriman JNE', exact: true })
            .count()
    )
        throw new Error('Duplicate JNE page menu is still present.');
    await page.getByRole('button', { name: /^Server PM 0/ }).click();
    await page
        .getByText('Belum ada kiriman pada pilihan ini', { exact: true })
        .waitFor();
    await page
        .getByRole('button', { name: 'Semua server', exact: true })
        .click();
    await page
        .getByText('Belum ada kiriman pada pilihan ini', { exact: true })
        .waitFor({ state: 'hidden' });
    await page
        .getByRole('button', { name: 'Periksa 7+ hari', exact: true })
        .click();
    await page
        .getByText('Belum ada kiriman pada pilihan ini', { exact: true })
        .waitFor();
    await page.getByRole('button', { name: 'Semua umur', exact: true }).click();
    await page
        .getByText('Belum ada kiriman pada pilihan ini', { exact: true })
        .waitFor({ state: 'hidden' });
    await page
        .getByRole('button', { name: /^Tambun Selatan-Cikarang 1/ })
        .click();
    await page
        .getByText('Tujuan Tambun Selatan-Cikarang', { exact: true })
        .waitFor();
    await page
        .getByRole('button', { name: 'Hapus rincian', exact: true })
        .click();
    await page
        .getByText('Tujuan Tambun Selatan-Cikarang', { exact: true })
        .waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Amount', exact: true }).click();
    await page.getByText('Lihat data harian', { exact: true }).click();
    await page.getByRole('button', { name: /^REG 1/ }).click();
    await page.getByText('Layanan REG', { exact: true }).waitFor();
    await page
        .getByRole('button', { name: 'Hapus rincian', exact: true })
        .click();
    await page
        .getByText('Layanan REG', { exact: true })
        .waitFor({ state: 'hidden' });
    await page.getByLabel('Customer', { exact: true }).click();
    await page
        .getByRole('dialog', { name: 'Pilih Customer', exact: true })
        .waitFor();
    await page
        .getByLabel('Cari customer', { exact: true })
        .fill('QA Dashboard Customer');
    await page.getByRole('option', { name: /QA Dashboard Customer/ }).click();
    await page
        .getByRole('button', { name: 'Terapkan filter', exact: true })
        .click();
    await page.waitForURL(/customer_id=\d+/);
    await page
        .getByRole('button', { name: 'Segarkan data', exact: true })
        .click();
    await page.getByRole('button', { name: /^REG 1/ }).waitFor();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
        path: path.join(directory, 'customer-dashboard-desktop.png'),
        fullPage: true,
    });
    for (const [width, height, filename, dark] of [
        [375, 812, 'customer-dashboard-mobile.png', false],
        [812, 375, 'customer-dashboard-landscape.png', false],
        [1440, 1000, 'customer-dashboard-dark.png', true],
    ]) {
        await page.setViewportSize({ width, height });
        await page.evaluate((isDark) => {
            document.documentElement.classList.toggle('dark', isDark);
            window.scrollTo(0, 0);
        }, dark);
        if (
            await page.evaluate(
                () => document.documentElement.scrollWidth > innerWidth + 1,
            )
        )
            throw new Error('Customer dashboard overflows the viewport.');
        await page.screenshot({
            path: path.join(directory, filename),
            fullPage: true,
        });
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await page
        .getByRole('button', { name: 'Buka atau tutup navigasi', exact: true })
        .click();
    await page.getByRole('link', { name: 'Riwayat run', exact: true }).click();
    await page
        .getByRole('heading', { name: 'Riwayat run report', exact: true })
        .waitFor();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    if (
        await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth + 1,
        )
    )
        throw new Error('Runs breadcrumb overflows the mobile viewport.');
    await page
        .getByRole('button', { name: 'Buka atau tutup navigasi', exact: true })
        .click();
    await page
        .getByRole('link', { name: 'Dashboard customer', exact: true })
        .click();
    await page
        .getByRole('heading', { name: 'Dashboard customer', exact: true })
        .waitFor();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.goto(dashboard + '&mapping=ambiguous');
    await page
        .getByText('Belum ada kiriman pada pilihan ini', { exact: true })
        .waitFor();
    process.stdout.write('CUSTOMER_DASHBOARD_UI_OK\n');
}

async function verifyOperationalDashboard(page, directory) {
    const dashboard =
        process.env.RETAIL_OPERATIONS_URL +
        '/dashboard?date_from=2026-10-10&date_thru=2026-10-23';
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(dashboard);
    await page
        .getByRole('heading', { name: 'Dashboard operasional', exact: true })
        .waitFor();
    await page.evaluate(() =>
        document.documentElement.classList.remove('dark'),
    );
    for (const label of ['Paket', 'Customer', 'Pickup']) {
        const metric = page.getByRole('button', { name: label, exact: true });
        await metric.focus();
        await page.keyboard.press('Enter');
        if ((await metric.getAttribute('aria-pressed')) !== 'true')
            throw new Error('Dashboard chart metric did not change: ' + label);
    }
    await page.getByText('Data aktivitas harian', { exact: true }).click();
    if ((await page.locator('details[open] tbody tr').count()) !== 14)
        throw new Error(
            'Daily dashboard table does not follow the selected period.',
        );
    await page.getByText('Data aktivitas harian', { exact: true }).click();
    await page
        .getByRole('button', { name: 'Buat pickup', exact: true })
        .click();
    await page
        .getByRole('dialog', { name: 'Buat Pickup On-Demand', exact: true })
        .waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page
        .getByRole('button', { name: 'Segarkan data', exact: true })
        .click();
    await page
        .getByRole('button', { name: 'Segarkan data', exact: true })
        .waitFor({ state: 'visible' });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
        path: path.join(directory, 'main-dashboard-desktop.png'),
        fullPage: true,
    });
    for (const [width, height, filename, dark] of [
        [375, 812, 'main-dashboard-mobile.png', false],
        [812, 375, 'main-dashboard-landscape.png', false],
        [1440, 1000, 'main-dashboard-dark.png', true],
    ]) {
        await page.setViewportSize({ width, height });
        await page.evaluate((isDark) => {
            document.documentElement.classList.toggle('dark', isDark);
            window.scrollTo(0, 0);
        }, dark);
        if (
            await page.evaluate(
                () => document.documentElement.scrollWidth > innerWidth + 1,
            )
        )
            throw new Error('Main dashboard overflows the viewport.');
        await page.screenshot({
            path: path.join(directory, filename),
            fullPage: true,
        });
    }
    await page.getByRole('button', { name: '7 hari', exact: true }).click();
    await page.waitForURL(
        (url) => url.searchParams.get('date_from') !== '2026-10-10',
    );
    const from = await page
        .getByLabel('Dari tanggal', { exact: true })
        .inputValue();
    const thru = await page
        .getByLabel('Sampai tanggal', { exact: true })
        .inputValue();
    if ((Date.parse(thru) - Date.parse(from)) / 86400000 !== 6)
        throw new Error('Main dashboard seven-day preset is incorrect.');
    await page.setViewportSize({ width: 375, height: 812 });
    const inputWidth = await page
        .getByLabel('Dari tanggal', { exact: true })
        .evaluate((element) => element.getBoundingClientRect().width);
    if (inputWidth < 250)
        throw new Error('Mobile dashboard date inputs are too narrow to read.');
    await page.evaluate(() => {
        document.documentElement.classList.remove('dark');
        window.scrollTo(0, 0);
    });
    await page.screenshot({
        path: path.join(directory, 'main-dashboard-mobile-top.png'),
    });
    await page.evaluate(
        () => (document.documentElement.style.fontSize = '125%'),
    );
    if (
        await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth + 1,
        )
    )
        throw new Error('Main dashboard overflows with enlarged text.');
    await page.evaluate(() => (document.documentElement.style.fontSize = ''));
    await page.goto(dashboard);
    await page
        .getByRole('link', { name: 'Analisis pengiriman', exact: true })
        .click();
    await page.waitForURL(
        (url) =>
            url.pathname === '/admin/jne-monitoring/customer-dashboard' &&
            url.searchParams.get('date_from') === '2026-10-10',
    );
    await page
        .getByRole('heading', { name: 'Dashboard customer', exact: true })
        .waitFor();
    process.stdout.write('MAIN_DASHBOARD_UI_OK\n');
}
