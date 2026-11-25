import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(path.resolve('workers/jne-report/package.json'));
const { chromium } = require('playwright');
const base = process.env.UI_UX_BASE_URL;
assert(base && ['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const output = await fs.realpath(process.env.UI_UX_EVIDENCE_DIR);
assert(output.startsWith((await fs.realpath('output')) + path.sep));
const ids = JSON.parse(
    await fs.readFile(process.env.UI_UX_FIXTURE_IDS, 'utf8'),
);
const root = '/admin/shipment-monitoring';
const browser = await chromium.launch({ headless: true });
const checks = [];
try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('appearance', 'light'));
    await page.route('**/*', (route) =>
        new URL(route.request().url()).origin === new URL(base).origin
            ? route.continue()
            : route.abort(),
    );
    const visit = async (route) => {
        const response = await page.goto(base + route);
        assert.equal(response.status(), 200);
        await page.locator('h1').waitFor();
    };
    const rows = () =>
        page.locator(
            'section[aria-label="Daftar resi"] a[translate="no"]:visible',
        );
    const reset = async () => {
        await page.getByRole('link', { name: 'Reset', exact: true }).click();
        await page.waitForURL((url) => url.search === '');
    };
    const submitSearch = async (q) => {
        await page.locator('#q').fill(q);
        await page.locator('form button[type="submit"]').click();
        await page.waitForURL((url) => url.searchParams.get('q') === q);
    };
    const openFilters = async () => {
        await page.locator('#tracking-filter-trigger').click();
        const sheet = page.getByRole('dialog', {
            name: 'Filter resi',
            exact: true,
        });
        await sheet.waitFor();
        return sheet;
    };
    const choose = async (sheet, label, option) => {
        await sheet.getByRole('combobox', { name: label, exact: true }).click();
        await page.getByRole('option', { name: option, exact: true }).click();
    };
    const apply = async (sheet) => {
        await sheet
            .getByRole('button', { name: 'Terapkan filter', exact: true })
            .click();
    };
    await page.goto(base + '/login');
    await page.locator('#email').fill('audit-admin_supervisor@example.test');
    await page.locator('#password').fill('password');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
    await page
        .getByRole('link', { name: 'Monitoring resi', exact: true })
        .first()
        .click();
    await page.waitForURL('**/shipment-monitoring/overview');
    checks.push('sidebar opens overview');
    for (const [name, route] of [
        ['overview', root + '/overview'],
        ['shipments', root],
        ['detail', root + '/' + ids.shipment],
        ['attention', root + '/attention'],
    ]) {
        for (const [width, height] of [
            [1440, 900],
            [1366, 768],
            [820, 1180],
            [390, 844],
        ]) {
            await page.setViewportSize({ width, height });
            await visit(route);
            if (width === 390) {
                const heading = await page.locator('h1').boundingBox();
                assert(
                    heading.width >= 240 && heading.height <= 80,
                    name + ' readable mobile heading',
                );
            }
            assert.equal(
                await page.evaluate(
                    () => document.documentElement.scrollWidth <= innerWidth,
                ),
                true,
                name + ' overflow ' + width,
            );
            await page.screenshot({
                path: path.join(output, `${name}-${width}.png`),
                fullPage: true,
            });
            if (name === 'shipments') {
                await page
                    .getByText('Tanggal Entry AWB', { exact: true })
                    .filter({ visible: true })
                    .first()
                    .waitFor();
                assert.equal(await rows().count(), 20);
                assert((await rows().first().boundingBox()).y < height);
            }
            if (name === 'detail') {
                const information = page.getByRole('region', { name: 'Informasi Resi', exact: true });
                assert.match(await information.innerText(), /Pengirim JNE\s+Pengirim Audit/);
                assert.match(await information.innerText(), /Penerima\s+Penerima Fixture/);
            }
            checks.push(`${name} ${width}x${height}`);
        }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await visit(root);
    let searchRequests = 0;
    const countSearch = (request) => {
        if (new URL(request.url()).pathname === root) searchRequests++;
    };
    page.on('request', countSearch);
    await page.getByRole('textbox', { name: 'Pengirim (report)', exact: true }).fill('Pengirim Audit');
    assert.equal(searchRequests, 0, 'typing shipper does not request a new listing');
    await page.getByRole('button', { name: 'Cari', exact: true }).click();
    await page.waitForURL((url) => url.searchParams.get('shipper') === 'Pengirim Audit');
    await page.locator('form button[type="submit"]:enabled').waitFor();
    page.off('request', countSearch);
    assert.equal(searchRequests, 1, 'one request on explicit search');
    assert(await rows().count() > 0);
    const visibleRows = page.locator('tbody tr');
    for (const text of await visibleRows.allTextContents()) assert(text.includes('Pengirim Audit'));
    await page.screenshot({ path: path.join(output, 'shipper-desktop.png'), fullPage: true });
    await page.getByRole('link', { name: /^Lihat resi/ }).first().click();
    await page.getByRole('link', { name: 'Kembali', exact: true }).click();
    await page.waitForURL((url) => url.pathname === root && url.searchParams.get('shipper') === 'Pengirim Audit');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('textbox', { name: 'Pengirim (report)', exact: true }).waitFor();
    assert.match(await page.locator('section[aria-label="Daftar resi"] ul').innerText(), /Pengirim \(report\): Pengirim Audit/);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(output, 'shipper-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: 'Hapus filter Pengirim: Pengirim Audit', exact: true }).click();
    await page.waitForURL((url) => !url.searchParams.get('shipper'));
    await page.setViewportSize({ width: 1440, height: 900 });
    checks.push('shipper explicit search, visible desktop/mobile names, filtered return and removable chip');
    await visit(root + '/overview');
    await page.getByRole('link', { name: /^Total Resi/ }).click();
    await page.waitForURL((url) => url.pathname === root);
    await page
        .getByRole('navigation', { name: 'Status resi', exact: true })
        .getByRole('button', { name: /^Terkirim/ })
        .click();
    await page.waitForURL(
        (url) => url.searchParams.get('status') === 'DELIVERED',
    );
    assert.equal(await rows().count(), 6);
    assert.match(
        await page
            .getByRole('navigation', { name: 'Status resi', exact: true })
            .innerText(),
        /Semua Resi\s*30/,
    );
    await submitSearch('0101');
    assert.equal(await rows().count(), 2);
    for (const awb of await rows().allTextContents())
        assert(awb.startsWith('0101'));
    let sheet = await openFilters();
    await choose(sheet, 'Keterhubungan customer', 'Customer Belum Terhubung');
    await apply(sheet);
    await page.waitForURL(
        (url) => url.searchParams.get('customer_link') === 'unlinked',
    );
    assert.equal(await rows().count(), 1);
    await page
        .getByRole('button', {
            name: 'Hapus filter Customer belum terhubung',
            exact: true,
        })
        .click();
    await page.waitForURL((url) => !url.searchParams.get('customer_link'));
    await reset();
    checks.push(
        'KPI and status facets, leading zero search, linkage filter/chip/reset',
    );
    await page
        .getByRole('button', { name: 'Halaman berikutnya', exact: true })
        .click();
    await page.waitForURL((url) => url.searchParams.get('page') === '2');
    assert.equal(await rows().count(), 10);
    await page
        .getByRole('link', { name: /^Lihat resi/ })
        .first()
        .click();
    await page.getByRole('link', { name: 'Kembali', exact: true }).click();
    await page.waitForURL(
        (url) => url.pathname === root && url.searchParams.get('page') === '2',
    );
    checks.push('server pagination and filtered return navigation');
    await visit(root + '/' + ids.shipment);
    assert.equal(await page.locator('tbody tr').count(), 2);
    await page
        .getByRole('button', { name: 'Lihat semua bukti', exact: true })
        .click();
    await page.waitForURL((url) => url.searchParams.get('history') === 'all');
    assert.equal(await page.locator('tbody tr').count(), 25);
    await page
        .getByRole('button', { name: 'Halaman berikutnya', exact: true })
        .click();
    await page.waitForURL((url) => url.searchParams.get('page') === '2');
    assert.equal(await page.locator('tbody tr').count(), 3);
    await page
        .getByRole('button', { name: 'Bukti Sumber', exact: true })
        .click();
    await page
        .getByRole('heading', { name: 'Bukti Sumber', exact: true })
        .waitFor();
    assert.match(await page.locator('pre').innerText(), /STATUS_WEB/);
    await page.screenshot({
        path: path.join(output, 'detail-source.png'),
        fullPage: true,
    });
    await page
        .getByRole('button', { name: 'Informasi Teknis', exact: true })
        .click();
    await page.getByText(/Bukti yang datang terlambat/).waitFor();
    assert.equal(await page.locator('form').count(), 0);
    checks.push(
        'snapshot history, unchanged evidence pagination, source provenance and read-only technical detail',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await visit(root);
    sheet = await openFilters();
    await sheet.locator('#tracking-period-from').fill('2026-01-01');
    await sheet.locator('#tracking-period-thru').fill('2026-12-31');
    await choose(sheet, 'Kondisi pembaruan', 'Data belum diperbarui');
    await apply(sheet);
    await page.locator('#freshness_hours-error').waitFor();
    await page.waitForFunction(
        () => document.activeElement?.id === 'freshness_hours',
    );
    assert.equal(
        await sheet.locator('#tracking-period-from').inputValue(),
        '2026-01-01',
    );
    await sheet.locator('#freshness_hours').fill('24');
    await apply(sheet);
    await page.waitForURL(
        (url) => url.searchParams.get('freshness_hours') === '24',
    );
    await sheet.waitFor({ state: 'hidden' });
    assert(await rows().count() > 0);
    for (const text of await page.locator('tbody tr').allTextContents()) {
        assert(text.includes('Data belum diperbarui'), 'stale results display their observation warning');
    }
    await reset();
    await submitSearch('NO_SYNTHETIC_MATCH');
    assert.equal(await rows().count(), 0);
    await page
        .getByText(/Tidak ada resi yang sesuai/)
        .filter({ visible: true })
        .waitFor();
    await reset();
    checks.push(
        'mobile period/freshness validation focus, drafts, empty state and reset',
    );
    await page.locator('#q').fill('A'.repeat(101));
    sheet = await openFilters();
    await apply(sheet);
    await sheet.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.activeElement?.id === 'q');
    await page.locator('#q-error').waitFor();
    await reset();
    await visit(root + '/attention');
    const categories = page.getByRole('navigation', { name: 'Kategori perhatian', exact: true });
    assert(!/Customer belum terhubung|Status tidak dikenal|Data belum diperbarui/i.test(await categories.innerText()));
    await categories.getByRole('button', { name: /^Over SLA/ }).click();
    await page.waitForURL(url => url.searchParams.get('attention') === 'over_sla');
    const attentionRows = page.locator('section[aria-label="Daftar resi perlu perhatian"] ul.divide-y');
    assert.match(await attentionRows.innerText(), /Terlambat 3 hari/);
    await page.getByRole('link', { name: /^Lihat resi/ }).filter({visible:true}).first().click();
    await page.getByRole('region', {name: 'Evaluasi SLA'}).waitFor();
    await page.getByRole('link', {name: 'Kembali',exact:true}).click();
    await page.waitForURL(url => url.pathname.endsWith('/attention') && url.searchParams.get('attention') === 'over_sla');
    await visit(root);
    sheet = await openFilters();
    await choose(sheet, 'Status SLA', 'Over SLA');
    await sheet.locator('#service').fill('REG23');
    await sheet.locator('#overdue_min').fill('3');
    await sheet.locator('#overdue_max').fill('3');
    await apply(sheet);
    await page.waitForURL(url => url.searchParams.get('sla_status') === 'OVER_SLA');
    assert(await rows().count() > 0);
    assert.match(await page.locator('section[aria-label="Daftar resi"] ul').innerText(), /Terlambat 3 hari/);
    checks.push('SLA filters, action-only attention, detail evidence and retained return context');
    await visit(root);
    let release;
    const pending = new Promise((resolve) => {
        release = resolve;
    });
    const failure = async (route) => {
        if (!route.request().headers()['x-inertia']) return route.fallback();
        await pending;
        await route.fulfill({
            status: 503,
            contentType: 'text/plain',
            body: 'Fixture unavailable',
        });
    };
    await page.route('**/admin/shipment-monitoring*', failure);
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
    await page.unroute('**/admin/shipment-monitoring*', failure);
    await page
        .getByRole('button', { name: 'Muat ulang data tersimpan', exact: true })
        .click();
    await page.waitForFunction(
        () => !document.getElementById('tracking-filter-trigger')?.disabled,
    );
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
    checks.push('loading/503 retry and keyboard focus return');
    assert.deepEqual(errors, []);
    await fs.writeFile(
        path.join(output, 'browser-acceptance.json'),
        JSON.stringify({ status: 'PASS', checks, pageErrors: errors }, null, 2),
    );
    console.log(
        JSON.stringify({
            status: 'PASS',
            checks: checks.length,
            pageErrors: errors,
        }),
    );
} catch (error) {
    await fs.writeFile(
        path.join(output, 'browser-acceptance.json'),
        JSON.stringify({ status: 'FAIL', checks, error: error.stack }, null, 2),
    );
    throw error;
} finally {
    await browser.close();
}
