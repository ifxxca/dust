import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(path.resolve('workers/jne-report/package.json'));
const { chromium } = require('playwright');
const base = 'http://127.0.0.1:5179';
const fixture = `${base}/@fs/S:/2026/dust/tests/Fixtures/mobile-scan-uat.html`;
const browser = await chromium.launch({ headless: true });
const results = [];
try {
    for (const [width, height, theme] of [
        [375, 812, 'light'],
        [390, 844, 'dark'],
        [812, 375, 'light'],
        [1280, 900, 'dark'],
    ]) {
        const context = await browser.newContext({
            viewport: { width, height },
            colorScheme: theme,
            reducedMotion: 'reduce',
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.route('**/*', (route) =>
            new URL(route.request().url()).origin === base
                ? route.continue()
                : route.abort(),
        );
        await page.goto(fixture);
        const input = page.getByRole('textbox', {
            name: 'Scan atau ketik nomor resi',
            exact: true,
        });
        await input.waitFor();
        await page.getByText('Buku — Total: 0', { exact: false }).waitFor();
        assert.equal(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
            ),
            true,
        );
        if (height > 700) {
            const camera = await page
                .getByRole('button', {
                    name: 'Scan dengan kamera',
                    exact: true,
                })
                .boundingBox();
            assert(
                camera.y + camera.height < height,
                'Aksi scan harus terlihat pada layar awal ponsel',
            );
        }
        await input.fill('TG1234567890');
        await input.press('Enter');
        await page
            .getByRole('button', {
                name: 'Keluarkan TG1234567890',
                exact: true,
            })
            .waitFor();
        assert.equal(
            await page.evaluate(() => window.scanUat.attempts.length),
            0,
        );
        const beforeReload = await page.evaluate(() =>
            JSON.parse(localStorage.getItem('scan-uat:cashless-handover')),
        );
        await page.reload();
        await input.waitFor();
        await page
            .getByRole('button', {
                name: 'Keluarkan TG1234567890',
                exact: true,
            })
            .waitFor();
        const restored = await page.evaluate(() =>
            JSON.parse(localStorage.getItem('scan-uat:cashless-handover')),
        );
        assert.deepEqual(
            restored,
            beforeReload,
            'Draft dan kunci harus pulih setelah proses halaman diulang',
        );
        await input.fill('TG1234567890');
        await input.press('Enter');
        await page
            .getByText('Resi TG1234567890 sudah dipindai.', { exact: true })
            .waitFor();
        await input.fill('SKU123456789');
        await input.press('Enter');
        await page
            .getByText('Format resi tidak dikenali.', { exact: true })
            .waitFor();
        assert.equal(await input.getAttribute('aria-invalid'), 'true');
        assert.equal(
            await input.evaluate((field) => field === document.activeElement),
            true,
        );
        assert.deepEqual(
            await page.evaluate(
                () =>
                    JSON.parse(
                        localStorage.getItem('scan-uat:cashless-handover'),
                    ).scanCounts,
            ),
            { total: 3, duplicate: 1, invalid: 1 },
        );
        await input.fill('');
        await page.getByRole('radio', { name: 'PM', exact: true }).click();
        await page
            .getByText('Kontrol simulasi UAT lokal', { exact: true })
            .click();
        await page
            .getByRole('button', { name: 'Simulasikan offline', exact: true })
            .click();
        await input.fill('AKJNE12345678');
        await input.press('Enter');
        await page
            .getByRole('button', {
                name: 'Keluarkan AKJNE12345678',
                exact: true,
            })
            .waitFor();
        assert.equal(
            await page
                .getByRole('button', {
                    name: 'Simpan Handover Cashless',
                    exact: true,
                })
                .isDisabled(),
            true,
        );
        await page.reload();
        await page
            .getByRole('button', {
                name: 'Keluarkan AKJNE12345678',
                exact: true,
            })
            .waitFor();
        assert.equal(
            await input.isDisabled(),
            false,
            'Draft harus tetap dapat dipindai setelah reload offline',
        );
        await page
            .getByText('Kontrol simulasi UAT lokal', { exact: true })
            .click();
        await page
            .getByRole('button', { name: 'Pulihkan jaringan', exact: true })
            .click();
        await page
            .getByRole('button', {
                name: 'Putus respons berikutnya',
                exact: true,
            })
            .click();
        await page
            .getByRole('button', {
                name: 'Simpan Handover Cashless',
                exact: true,
            })
            .click();
        await page
            .getByText('Hasil penyimpanan belum pasti', { exact: true })
            .waitFor();
        assert.equal(await input.isDisabled(), true);
        const pending = await page.evaluate(() =>
            JSON.parse(localStorage.getItem('scan-uat:cashless-handover')),
        );
        assert.equal(pending.pending, true);
        await page
            .getByRole('button', {
                name: 'Periksa & simpan ulang',
                exact: true,
            })
            .click();
        await page
            .getByText('2 resi Cashless tersimpan di server.', { exact: true })
            .waitFor();
        const attempts = await page.evaluate(() => window.scanUat.attempts);
        assert.equal(attempts.length, 2);
        assert.deepEqual(
            attempts[0],
            attempts[1],
            'Retry harus memakai kunci dan payload identik',
        );
        await page
            .getByText('Buku — Total: 2 · Berhasil: 0 · Diproses: 2', {
                exact: false,
            })
            .waitFor();
        await page
            .getByRole('button', { name: 'Konfirmasi approval', exact: true })
            .click();
        await page
            .getByText('Buku — Total: 2 · Berhasil: 2', { exact: false })
            .waitFor();
        await page.getByText(/2 resi berhasil diproses:/).waitFor();
        const milestones = await page.evaluate(() =>
            JSON.parse(localStorage.getItem('scan-uat:cashless-milestones-41')),
        );
        assert.deepEqual(milestones.success.sort(), [1, 2]);
        await page
            .getByRole('button', { name: 'Simulasikan gagal', exact: true })
            .click();
        await page.getByText(/2 resi gagal atau perlu diperiksa:/).waitFor();
        assert.equal(
            await page.evaluate(() => window.scanUat.attempts.length),
            2,
            'Polling status tidak boleh mengirim ulang resi',
        );
        await page
            .getByText('Riwayat proses resi (50 terbaru)', { exact: true })
            .click();
        await page
            .getByText('Gagal · perlu tindakan', { exact: true })
            .first()
            .waitFor();
        await page.getByText('Umpan balik pemindai', { exact: true }).click();
        await page.getByText('Suara berhasil', { exact: true }).click();
        assert.equal(
            await page
                .getByRole('button', {
                    name: 'Tes suara berhasil',
                    exact: true,
                })
                .isDisabled(),
            true,
        );
        assert.equal(
            await page.evaluate(
                () =>
                    JSON.parse(
                        localStorage.getItem('retail-scanner-feedback-v1'),
                    ).successSound,
            ),
            false,
        );
        assert.equal(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
            ),
            true,
        );
        assert.deepEqual(errors, []);
        results.push({
            width,
            height,
            theme,
            hasil: 'LULUS',
            cakupan:
                'draft, duplikat, validasi, offline, retry idempoten, approval, gagal, riwayat, pengaturan, tata letak',
        });
        await context.close();
    }
    console.log(
        JSON.stringify(
            { jenis: 'Simulasi browser; bukan UAT perangkat fisik', results },
            null,
            2,
        ),
    );
} finally {
    await browser.close();
}
