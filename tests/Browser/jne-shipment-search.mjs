import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(path.resolve('workers/jne-report/package.json'));
const { chromium } = require('playwright');
const base = process.env.UI_UX_BASE_URL;
assert(base && ['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const route = '/admin/jne-monitoring';
const browser = await chromium.launch({ headless: true });
try {
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1050 },
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base + '/login');
    await page.locator('#email').fill('audit-admin_supervisor@example.test');
    await page.locator('#password').fill('password');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
    await page.clock.install();
    await page.goto(base + route);
    const search = page.locator('#jne-awb-search');
    await search.waitFor();
    const requests = [];
    page.on('request', (request) => {
        if (
            new URL(request.url()).pathname === route &&
            request.headers()['x-inertia']
        ) {
            requests.push(request);
        }
    });
    await search.pressSequentially('0101', { delay: 35 });
    await page.clock.fastForward(31000);
    assert.equal(
        requests.length,
        0,
        'Typing pauses polling and does not search the server.',
    );
    await page.getByRole('radio', { name: 'Manual', exact: true }).click();
    assert.equal(
        requests.length,
        0,
        'Category changes are staged with the other filters.',
    );
    await page
        .getByText('Perubahan belum diterapkan', { exact: true })
        .waitFor();
    const submitted = page.waitForResponse(
        (response) =>
            new URL(response.url()).pathname === route &&
            response.request().headers()['x-inertia'],
    );
    await search.press('Enter');
    const data = await (await submitted).json();
    assert.equal(
        requests.length,
        1,
        'Enter sends one combined search request.',
    );
    assert.equal(data.props.filters.category, 'manual_hybrid');
    assert.equal(data.props.filters.q, '0101');
    assert(data.props.shipments.data.length > 0);
    assert(
        data.props.shipments.data.every(
            (row) =>
                row.category === 'manual_hybrid' && row.awb.startsWith('0101'),
        ),
    );
    await page.waitForURL(
        (url) => url.searchParams.get('category') === 'manual_hybrid',
    );
    await search.waitFor({ state: 'visible' });
    await page
        .getByRole('button', { name: 'Terapkan filter', exact: true })
        .waitFor();
    for (const [label, category] of [
        ['Cashless', 'cashless_hybrid'],
        ['CSS / Orion', 'css_orion'],
    ]) {
        await search.fill('');
        await page.getByRole('radio', { name: label, exact: true }).click();
        const result = page.waitForResponse(
            (response) =>
                new URL(response.url()).pathname === route &&
                response.request().headers()['x-inertia'],
        );
        await page
            .getByRole('button', { name: 'Terapkan filter', exact: true })
            .click();
        const payload = await (await result).json();
        assert.equal(payload.props.shipments.total, 10);
        assert(
            payload.props.shipments.data.every(
                (row) => row.category === category,
            ),
        );
        await page.waitForURL(
            (url) => url.searchParams.get('category') === category,
        );
    }
    await page
        .getByRole('button', { name: 'Reset filter', exact: true })
        .click();
    await page.waitForURL((url) => !url.searchParams.get('category'));
    assert.equal(await search.inputValue(), '');
    await page.screenshot({
        path: 'output/jne-filter-search-20261027/desktop.png',
        fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await search.fill('Cikarang');
    const before = requests.length;
    await page.clock.fastForward(31000);
    assert.equal(
        requests.length,
        before,
        'Typing on mobile also pauses polling.',
    );
    assert.equal(
        await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
    );
    await page.screenshot({
        path: 'output/jne-filter-search-20261027/mobile.png',
        fullPage: false,
    });
    await page
        .getByRole('heading', { name: 'Pengiriman JNE', exact: true })
        .click();
    const polled = page.waitForResponse(
        (response) =>
            new URL(response.url()).pathname === route &&
            response.request().headers()['x-inertia'],
    );
    await page.clock.fastForward(31000);
    await polled;
    assert.equal(
        await search.inputValue(),
        'Cikarang',
        'Polling preserves the unfinished search draft.',
    );
    assert.deepEqual(errors, []);
    console.log(
        JSON.stringify({
            passed: true,
            checks: [
                'no request per keystroke',
                'polling paused while editing',
                'single combined submit',
                'all three category results',
                'reset filters',
                'mobile layout',
                'polling preserves drafts',
            ],
            screenshots: ['desktop.png', 'mobile.png'],
        }),
    );
} finally {
    await browser.close();
}
