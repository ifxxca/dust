import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(path.resolve('workers/jne-report/package.json'));
const { chromium } = require('playwright');
const base = process.env.REPORT_FORM_BASE_URL;
assert(base && ['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const evidence = 'output/report-form-browser-20261105';
await fs.mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
    for (const width of [1440, 390]) {
        const context = await browser.newContext({
            viewport: { width, height: 960 },
            reducedMotion: 'reduce',
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(base + '/login');
        await page
            .locator('#email')
            .fill('audit-admin_supervisor@example.test');
        await page.locator('#password').fill('password');
        await page
            .getByRole('button', { name: 'Masuk ke workspace', exact: true })
            .click();
        await page.waitForURL((url) => url.pathname !== '/login');
        await page.goto(base + '/admin/jne-reports');
        await page
            .getByRole('button', { name: 'Tarik report APEX', exact: true })
            .waitFor();
        await page.locator('#customer_account').click();
        const search = page.getByRole('combobox', {
            name: 'Cari nomor atau nama penarikan',
            exact: true,
        });
        await search.fill('fixture audit');
        await page.getByRole('option', { name: /AUDIT001/ }).waitFor();
        assert.equal(await page.getByRole('option').count(), 1);
        await page.screenshot({
            path: `${evidence}/account-search-${width}.png`,
        });
        await search.press('ArrowDown');
        await search.press('Enter');
        assert.match(
            await page.locator('#customer_account').textContent(),
            /AUDIT001/,
        );
        await page.locator('#customer_account').click();
        await search.fill('NEW987654');
        await page
            .getByRole('option', { name: /Gunakan nomor NEW987654/ })
            .waitFor();
        await search.press('Enter');
        assert.match(
            await page.locator('#customer_account').textContent(),
            /NEW987654/,
        );
        await page
            .getByRole('radio', { name: 'Retail PM / Puman', exact: true })
            .click();
        assert.equal(await page.locator('#customer_account').count(), 0);
        await page.locator('#retail-server').click();
        await page.getByRole('option', { name: 'Puman', exact: true }).click();
        await page.locator('#date_from').fill('2026-10-31');
        await page.locator('#date_thru').fill('2026-11-02');
        assert.match(
            await page.getByRole('status').textContent(),
            /1 server · 3 hari · 6 report sumber/,
        );
        assert.equal(await page.locator('input[type="date"]').count(), 2);
        assert.equal(
            await page.evaluate(
                () => document.documentElement.scrollWidth > innerWidth,
            ),
            false,
        );
        await page.screenshot({
            path: `${evidence}/retail-${width}.png`,
            fullPage: true,
        });
        const submission = page.waitForRequest(
            (request) =>
                request.method() === 'POST' &&
                new URL(request.url()).pathname === '/admin/jne-reports',
        );
        await page
            .getByRole('button', { name: 'Tarik report retail', exact: true })
            .click();
        const request = await submission;
        assert.deepEqual(request.postDataJSON(), {
            source: 'hybrid',
            retail_server: 'HYBRID_PUMAN',
            date_from: '2026-10-31',
            date_thru: '2026-11-02',
        });
        await page.waitForURL((url) => url.pathname === '/admin/report-runs');
        assert.equal(new URL(page.url()).searchParams.get('source'), 'hybrid');
        assert.deepEqual(errors, []);
        results.push({
            width,
            search: 'name and new account, keyboard selection',
            retail: 'Puman, 3 days, 6 source reports',
            submission: 'correct payload and redirect',
            overflow: false,
            browserErrors: 0,
        });
        await context.close();
    }
    console.log(JSON.stringify(results));
    await fs.writeFile(
        `${evidence}/results.json`,
        JSON.stringify(results, null, 2),
    );
} finally {
    await browser.close();
}
