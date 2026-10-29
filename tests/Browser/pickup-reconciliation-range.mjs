import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(path.resolve('workers/jne-report/package.json'));
const { chromium } = require('playwright');
const base = process.env.UI_UX_BASE_URL;
assert(
    base &&
        new URL(base).hostname === '127.0.0.1' &&
        new URL(base).port === '8019',
);
const browser = await chromium.launch({ headless: true });
try {
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
    });
    await page.clock.install();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base + '/login');
    await page.locator('#email').fill('audit-admin_supervisor@example.test');
    await page.locator('#password').fill('password');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
    await page.goto(
        base +
            '/rekonsiliasi-resi?date_from=2026-10-01&date_to=2026-10-31&scope=daily',
    );
    await page
        .getByRole('button', { name: /^Lihat rekonsiliasi / })
        .first()
        .waitFor();
    const range = page
        .locator('details')
        .filter({
            has: page
                .locator(':scope > summary')
                .filter({ hasText: '01/10/2026' }),
        })
        .first();
    const requests = [];
    const isList = (request) =>
        request.method() === 'GET' &&
        new URL(request.url()).pathname === '/rekonsiliasi-resi' &&
        request.headers()['x-inertia'];
    page.on('request', (request) => {
        if (isList(request)) requests.push(request.url());
    });
    await range.locator(':scope > summary').click();
    await page.locator('#recon-date-from').fill('2026-10-01');
    await page.locator('#recon-date-to').fill('2026-10-24');
    await page.clock.fastForward(16000);
    assert.equal(
        requests.length,
        0,
        'polling pauses while date fields are open',
    );
    let release;
    const gate = new Promise((resolve) => {
        release = resolve;
    });
    let held = false;
    await page.route('**/rekonsiliasi-resi?**', async (route) => {
        if (
            isList(route.request()) &&
            new URL(route.request().url()).searchParams.get('date_to') ===
                '2026-10-24' &&
            !held
        ) {
            held = true;
            await gate;
        }
        await route.continue();
    });
    const changing = page.waitForRequest(isList);
    await page
        .getByRole('button', { name: 'Terapkan periode', exact: true })
        .click();
    await changing;
    await page
        .getByRole('status')
        .filter({ hasText: 'Memuat rekonsiliasi' })
        .waitFor();
    await page.clock.fastForward(31000);
    assert.equal(
        requests.length,
        1,
        'no background request competes with the delayed filter request',
    );
    const changed = page.waitForResponse(
        (response) =>
            isList(response.request()) &&
            new URL(response.url()).searchParams.get('date_to') ===
                '2026-10-24',
    );
    release();
    const response = await changed;
    assert.equal(response.status(), 200);
    const result = await response.json();
    assert.equal(result.props.filters.date_from, '2026-10-01');
    assert.equal(result.props.filters.date_to, '2026-10-24');
    await page
        .locator('.reconciliation-workspace[aria-busy="false"]')
        .waitFor();
    await page
        .getByText('Tidak ada rekonsiliasi sesuai filter', { exact: true })
        .waitFor();
    const refreshed = page.waitForResponse(
        (response) =>
            isList(response.request()) &&
            new URL(response.url()).searchParams.get('date_to') ===
                '2026-10-24',
    );
    await page.clock.fastForward(16000);
    await refreshed;
    assert(
        requests.every(
            (url) => new URL(url).searchParams.get('date_to') === '2026-10-24',
        ),
    );
    await range.locator(':scope > summary').click();
    await page.locator('#recon-date-to').fill('2026-10-31');
    await page
        .getByRole('button', { name: 'Terapkan periode', exact: true })
        .click();
    await page
        .getByRole('button', { name: /^Lihat rekonsiliasi / })
        .first()
        .waitFor();
    await page.screenshot({
        path: 'output/jne-filter-search-20261027/reconciliation-range-desktop.png',
        fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await range.locator(':scope > summary').click();
    assert.equal(
        await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
    );
    await page.screenshot({
        path: 'output/jne-filter-search-20261027/reconciliation-range-mobile.png',
        fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
        JSON.stringify({
            result: 'passed',
            delayedRequest: true,
            noCompetingPoll: true,
            rangeRetained: true,
            pollingResumes: true,
            mobileOverflow: false,
        }),
    );
} finally {
    await browser.close();
}
