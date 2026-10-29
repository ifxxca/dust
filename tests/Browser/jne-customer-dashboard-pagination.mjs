import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(path.resolve('workers/jne-report/package.json'));
const { chromium } = require('playwright');
const base = process.env.UI_UX_BASE_URL;
assert(base && new URL(base).hostname === '127.0.0.1' && new URL(base).port === '8019');
const browser = await chromium.launch({ headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base + '/login');
    await page.locator('#email').fill('audit-admin_supervisor@example.test');
    await page.locator('#password').fill('password');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
    await page.goto(base + '/admin/jne-monitoring/customer-dashboard?date_from=2026-10-01&date_thru=2026-10-31');
    await page.getByRole('heading', { name: 'Dashboard customer', exact: true }).waitFor();
    await page.getByText('Total resi', { exact: true }).waitFor();
    const responsePromise = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith('/customer-dashboard') && new URL(response.url()).searchParams.get('page') === '2');
    await page.getByRole('button', { name: 'Halaman 2', exact: true }).click();
    const response = await responsePromise;
    assert.equal(response.status(), 200);
    assert.equal(response.request().headers()['x-inertia-partial-data'], 'shipments');
    const props = (await response.json()).props;
    assert.equal(props.shipments.current_page, 2);
    assert.equal(props.shipments.total, 30);
    assert.equal(props.summary, undefined);
    assert.equal(props.daily, undefined);
    assert.equal(props.services, undefined);
    await page.getByText('Total resi', { exact: true }).waitFor();
    await page.screenshot({ path: 'output/jne-filter-search-20261027/customer-dashboard-pagination-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: 'output/jne-filter-search-20261027/customer-dashboard-pagination-mobile.png', fullPage: true });
    assert.deepEqual(errors, []);
    process.stdout.write(JSON.stringify({ result: 'passed', partialProps: Object.keys(props), mobileOverflow: false, pageErrors: errors }) + '\n');
} finally {
    await browser.close();
}
