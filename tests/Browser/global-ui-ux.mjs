import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(path.resolve('workers/jne-report/package.json'));
const { chromium } = require('playwright');
const base = process.env.UI_UX_BASE_URL;
assert(base && ['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const phase = process.env.UI_UX_PHASE ?? 'after';
assert(['before', 'after'].includes(phase));
const output = await fs.realpath(process.env.UI_UX_EVIDENCE_DIR);
assert(output.startsWith((await fs.realpath('output')) + path.sep));
const ids = JSON.parse(
    await fs.readFile(process.env.UI_UX_FIXTURE_IDS, 'utf8'),
);
const routes = [
    ['dashboard', '/dashboard'],
    ['shipment-monitoring', '/admin/shipment-monitoring'],
    ['shipment-detail', '/admin/shipment-monitoring/' + ids.shipment],
    ['customer-dashboard', '/admin/jne-monitoring/customer-dashboard'],
    ['shipment-registry', '/admin/jne-monitoring'],
    ['report-awbs', '/admin/jne-reports/' + ids.report + '/awbs'],
    ['reconciliation', '/admin/jne-monitoring/reconciliation'],
];
const browser = await chromium.launch({ headless: true });
const results = [];
try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', (route) =>
        new URL(route.request().url()).origin === new URL(base).origin
            ? route.continue()
            : route.abort(),
    );
    await page.goto(base + '/login');
    await page.locator('#email').fill('audit-admin_supervisor@example.test');
    await page.locator('#password').fill('password');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
    for (const [name, route] of routes.filter(
        ([name]) =>
            !process.env.UI_UX_ROUTE || name === process.env.UI_UX_ROUTE,
    )) {
        for (const [width, height] of [
            [1440, 900],
            [1366, 768],
            [390, 844],
        ]) {
            await page.setViewportSize({ width, height });
            const response = await page.goto(base + route);
            assert.equal(response.status(), 200);
            await page.locator('h1').waitFor();
            await page.screenshot({
                path: path.join(output, `${phase}-${name}-${width}.png`),
                fullPage: true,
            });
            const overflow = await page.evaluate(
                () => document.documentElement.scrollWidth > innerWidth,
            );
            results.push({
                name,
                width,
                height,
                overflow,
                status: response.status(),
            });
            if (phase === 'after')
                assert.equal(overflow, false, name + ' overflow at ' + width);
        }
    }
    if (phase === 'after' && !process.env.UI_UX_ROUTE) {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(base + '/admin/jne-monitoring');
        await page
            .getByRole('button', { name: 'Filter lanjutan', exact: true })
            .click();
        const sheet = page.getByRole('dialog', {
            name: 'Filter lanjutan',
            exact: true,
        });
        await sheet.locator('#jne-date-from').fill('2026-01-01');
        await sheet.locator('#jne-date-thru').fill('2026-12-31');
        await page.keyboard.press('Escape');
        await sheet.waitFor({ state: 'hidden' });
        await page
            .getByRole('button', { name: 'Filter lanjutan', exact: true })
            .click();
        assert.equal(
            await sheet.locator('#jne-date-from').inputValue(),
            '2026-01-01',
        );
        await sheet
            .getByRole('button', {
                name: 'Terapkan filter lanjutan',
                exact: true,
            })
            .click();
        await page.waitForURL(
            (url) =>
                url.searchParams.get('date_from') === '2026-01-01' &&
                url.searchParams.get('date_thru') === '2026-12-31',
        );
        await page
            .getByRole('button', {
                name: 'Hapus filter AWB mulai: 2026-01-01',
                exact: true,
            })
            .waitFor();
        await page
            .getByRole('button', { name: 'Reset filter', exact: true })
            .click();
        await page.waitForURL(
            (url) =>
                !url.searchParams.get('date_from') &&
                !url.searchParams.get('date_thru'),
        );
    }
    assert.deepEqual(errors, []);
    console.log(
        JSON.stringify({
            phase,
            captures: results.length,
            browserErrors: errors,
            results,
        }),
    );
} finally {
    await browser.close();
    await fs.writeFile(
        path.join(
            output,
            phase +
                (process.env.UI_UX_ROUTE ? '-' + process.env.UI_UX_ROUTE : '') +
                '-acceptance.json',
        ),
        JSON.stringify(results, null, 2),
    );
}
