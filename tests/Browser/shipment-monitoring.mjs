import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(path.resolve('workers/jne-report/package.json'));
const { chromium } = require('playwright');
const base = process.env.UI_UX_BASE_URL;
assert(base && ['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const browser = await chromium.launch({ headless: true });
try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', (route) => {
        const url = new URL(route.request().url());
        return url.origin === new URL(base).origin
            ? route.continue()
            : route.abort();
    });
    await page.goto(base + '/login');
    await page.locator('#email').fill('audit-admin_supervisor@example.test');
    await page.locator('#password').fill('password');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
    await page.goto(base + '/admin/shipment-monitoring');
    for (const [width, height] of [
        [1440, 900],
        [1366, 768],
        [390, 844],
    ]) {
        await page.setViewportSize({ width, height });
        assert.equal(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
            ),
            true,
        );
        assert.equal(await page.locator('tbody tr').count(), 20);
        assert.equal(
            await page
                .locator('tbody tr')
                .first()
                .evaluate(
                    (row) => row.getBoundingClientRect().top < innerHeight,
                ),
            true,
        );
    }
    await page.locator('#q').fill('0101');
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL((url) => url.searchParams.get('q') === '0101');
    assert.equal(await page.locator('tbody tr').count(), 8);
    for (const awb of await page.locator('tbody a[translate="no"]').allTextContents())
        assert(awb.startsWith('0101'));
    await page.getByRole('link', { name: 'Reset', exact: true }).click();
    await page.waitForURL((url) => url.search === '');
    await page.locator('#tracking-filter-trigger').click();
    const sheet = page.getByRole('dialog', {
        name: 'Filter resi',
        exact: true,
    });
    await sheet.waitFor();
    await sheet.locator('#tracking-period-from').fill('2026-01-01');
    await sheet.locator('#tracking-period-thru').fill('2026-12-31');
    await sheet
        .getByRole('combobox', { name: 'Kondisi pembaruan', exact: true })
        .click();
    await page
        .getByRole('option', { name: 'Data belum diperbarui', exact: true })
        .click();
    await sheet
        .getByRole('button', { name: 'Terapkan filter', exact: true })
        .click();
    await page.locator('#freshness_hours-error').waitFor({ state: 'visible' });
    await page.waitForFunction(
        () => document.activeElement?.id === 'freshness_hours',
    );
    assert.equal(
        await sheet.locator('#tracking-period-from').inputValue(),
        '2026-01-01',
    );
    assert.equal(
        await sheet.locator('#freshness_hours-error').textContent(),
        'Pilih batas usia data (jam) untuk mencari data yang melewati batas.',
    );
    await sheet.locator('#freshness_hours').fill('6');
    await sheet
        .getByRole('button', { name: 'Terapkan filter', exact: true })
        .click();
    await page.waitForURL(
        (url) =>
            url.searchParams.get('freshness_hours') === '6' &&
            url.searchParams.get('date_from') === '2026-01-01',
    );
    await sheet.waitFor({ state: 'hidden' });
    assert.equal(await page.locator('[aria-invalid="true"]').count(), 0);
    await page
        .getByRole('button', {
            name: 'Hapus filter Data belum diperbarui',
            exact: true,
        })
        .click();
    await page.waitForURL(
        (url) => url.searchParams.get('freshness') !== 'stale',
    );
    assert.equal(new URL(page.url()).searchParams.get('freshness_hours'), '6');
    await page.getByRole('button', { name: /^Hapus filter Periode:/ }).click();
    await page.waitForURL(
        (url) =>
            !url.searchParams.get('date_from') &&
            !url.searchParams.get('date_thru'),
    );

    await page.getByRole('link', { name: 'Reset', exact: true }).click();
    await page.waitForURL((url) => url.search === '');
    await page
        .getByRole('button', { name: 'Halaman berikutnya', exact: true })
        .click();
    await page.waitForURL((url) => url.searchParams.get('page') === '2');
    assert.equal(await page.locator('tbody tr').count(), 10);
    await page
        .getByRole('link', { name: /^Lihat resi/ })
        .first()
        .click();
    await page
        .getByRole('heading', {
            name: 'Riwayat pengamatan report',
            exact: true,
        })
        .waitFor();
    assert.equal(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
    );
    assert.equal(await page.locator('form').count(), 0);
    await page.goto(base + '/admin/shipment-monitoring');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('#tracking-filter-trigger').click();
    await page
        .getByRole('combobox', { name: 'Status pengiriman', exact: true })
        .click();
    await page.getByRole('option', { name: 'Terkirim', exact: true }).click();
    await page
        .getByRole('dialog', { name: 'Filter resi', exact: true })
        .getByRole('button', { name: 'Terapkan filter', exact: true })
        .click();
    await page.waitForURL(
        (url) => url.searchParams.get('status') === 'DELIVERED',
    );
    assert((await page.locator('tbody tr').count()) > 0);
    for (const row of await page.locator('tbody tr').allTextContents()) {
        assert(row.includes('Terkirim'));
    }
    await page
        .getByRole('button', { name: 'Hapus filter Terkirim', exact: true })
        .click();
    await page.waitForURL((url) => !url.searchParams.get('status'));
    await page.locator('#q').fill('NO_SYNTHETIC_MATCH');
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(
        (url) => url.searchParams.get('q') === 'NO_SYNTHETIC_MATCH',
    );
    assert.equal(await page.locator('tbody a').count(), 0);
    await page.getByRole('link', { name: 'Reset', exact: true }).click();
    await page.waitForURL((url) => url.search === '');
    let release;
    const pending = new Promise((resolve) => {
        release = resolve;
    });
    const failReload = async (route) => {
        if (!route.request().headers()['x-inertia']) return route.fallback();
        await pending;
        await route.fulfill({
            status: 503,
            contentType: 'text/plain',
            body: 'Fixture unavailable',
        });
    };
    await page.route('**/admin/shipment-monitoring*', failReload);
    await page
        .getByRole('button', { name: 'Muat ulang data tersimpan', exact: true })
        .click();
    await page
        .getByRole('status')
        .filter({ hasText: 'Memuat resi…' })
        .first()
        .waitFor();
    assert.equal(
        await page.locator('form button[type="submit"]').isDisabled(),
        true,
    );
    release();
    await page
        .getByRole('alert')
        .filter({ hasText: 'Daftar belum dapat dimuat' })
        .waitFor();
    await page.unroute('**/admin/shipment-monitoring*', failReload);
    await page
        .getByRole('button', { name: 'Muat ulang data tersimpan', exact: true })
        .click();
    await page
        .getByRole('alert')
        .filter({ hasText: 'Daftar belum dapat dimuat' })
        .waitFor({ state: 'hidden' });
    assert.equal(await page.locator('tbody tr').count(), 20);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => {
        const trigger = document.getElementById('tracking-filter-trigger');
        return trigger?.textContent?.trim() === 'Filter' && !trigger.disabled;
    });
    await page.locator('#tracking-filter-trigger').focus();
    await page.keyboard.press('Enter');
    await page
        .getByRole('dialog', { name: 'Filter resi', exact: true })
        .waitFor();
    await page.keyboard.press('Escape');
    await page
        .getByRole('dialog', { name: 'Filter resi', exact: true })
        .waitFor({ state: 'hidden' });
    assert.equal(
        await page
            .locator('#tracking-filter-trigger')
            .evaluate((el) => el === document.activeElement),
        true,
    );
    assert.deepEqual(errors, []);
    console.log(
        'PASS: isolated shipment monitoring three viewports, search/status/reset, date/freshness validation, chips, pagination, read-only detail, empty/loading/503 recovery and keyboard focus return; zero browser errors.',
    );
} finally {
    await browser.close();
}
