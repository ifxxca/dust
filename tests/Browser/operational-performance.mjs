import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(path.resolve('workers/jne-report/package.json'));
const { chromium } = require('playwright');
const base = process.env.UI_UX_BASE_URL;
assert(
    base &&
        new URL(base).hostname === '127.0.0.1' &&
        new URL(base).port === '8037',
);
const output = await fs.realpath('output/unified-operational-performance');
const browser = await chromium.launch({ headless: true });
const checks = [];
const errors = [];
let page;
try {
    page = await browser.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('appearance', 'light'));
    await page.route('**/*', (route) =>
        new URL(route.request().url()).origin === base
            ? route.continue()
            : route.abort(),
    );
    const visit = async (query = '') => {
        const response = await page.goto(
            base + '/admin/operational-performance' + query,
        );
        assert.equal(response.status(), 200);
        await page
            .getByRole('heading', {
                name: 'Operational Performance',
                exact: true,
            })
            .waitFor();
    };
    await page.goto(base + '/login');
    await page.locator('#email').fill('audit-admin_supervisor@example.test');
    await page.locator('#password').fill('password');
    await page.locator('button[type=submit]').click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
    await page
        .getByRole('link', { name: 'Operational Performance', exact: true })
        .first()
        .click();
    await page.waitForURL('**/admin/operational-performance');
    checks.push('sidebar reaches one unified performance route');
    for (const [width, height] of [
        [1440, 900],
        [1366, 768],
        [390, 844],
    ]) {
        await page.setViewportSize({ width, height });
        await visit();
        assert(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
            ),
            `page overflow ${width}`,
        );
        assert(
            (await page.locator('#period').boundingBox()).y < height,
            'period immediately discoverable',
        );
        for (const id of ['sla', 'customers', 'exceptions', 'follow-up'])
            assert.equal(await page.locator('#' + id).count(), 1);
        assert.equal(await page.getByText('ERP', { exact: true }).count(), 0);
        assert.equal(
            await page.getByText('Batch Time', { exact: true }).count(),
            0,
        );
        const chart = page.getByRole('group', {
            name: 'Volume AWB harian dan delivered saat ini',
            exact: true,
        });
        const chartBounds = await chart.boundingBox();
        assert(
            chartBounds.x >= 0 && chartBounds.x + chartBounds.width <= width,
            'weekly chart fits viewport',
        );
        const populatedDay = chart.getByRole('link', {
            name: /30 AWB, 5 delivered/,
        });
        assert.equal(await populatedDay.count(), 1);
        const dayBounds = await populatedDay.boundingBox();
        assert(
            dayBounds.x >= chartBounds.x &&
                dayBounds.x + dayBounds.width <=
                    chartBounds.x + chartBounds.width,
            'populated day visible without scrolling chart',
        );
        await page.screenshot({
            path: path.join(output, `performance-${width}.png`),
            fullPage: true,
        });
        await page.screenshot({
            path: path.join(output, `performance-viewport-${width}.png`),
        });
        checks.push(
            `layout ${width}x${height}, primary filter, all sections, no horizontal page overflow`,
        );
        await page
            .getByRole('button', {
                name: 'Definisi & batasan SLA',
                exact: true,
            })
            .click();
        const definition = page.getByRole('dialog', {
            name: 'Definisi & batasan SLA',
            exact: true,
        });
        await definition.waitFor();
        await definition
            .getByRole('cell', { name: 'YES <19:00', exact: true })
            .waitFor();
        await definition
            .getByRole('cell', { name: 'YES >19:00', exact: true })
            .waitFor();
        const dialogBounds = await definition.boundingBox();
        assert(
            dialogBounds.x >= 0 && dialogBounds.x + dialogBounds.width <= width,
            'definition dialog fits viewport',
        );
        await page.keyboard.press('Escape');
        await definition.waitFor({ state: 'hidden' });
        assert.equal(
            await page
                .getByRole('button', {
                    name: 'Definisi & batasan SLA',
                    exact: true,
                })
                .evaluate((element) => element === document.activeElement),
            true,
        );
        checks.push(
            `SLA definitions accessible with escape and focus return at ${width}px`,
        );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [days, from] of [
        [31, '2026-10-05'],
        [92, '2026-08-05'],
    ]) {
        await visit(`?period=custom&date_from=${from}&date_thru=2026-11-04`);
        const chart = page.getByRole('group', {
            name: 'Volume AWB harian dan delivered saat ini',
            exact: true,
        });
        assert.equal(await chart.getByRole('link').count(), days);
        assert(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
            ),
            `custom ${days} days does not overflow page`,
        );
        if (days === 31) {
            assert(
                (await chart.boundingBox()).width <= 390,
                '31 daily bars fit mobile chart',
            );
        } else {
            assert(
                await chart.evaluate(
                    (element) =>
                        element.parentElement.scrollWidth >
                        element.parentElement.clientWidth,
                ),
                '92-day chart scrolls locally',
            );
            await page
                .getByText('Geser grafik untuk melihat seluruh periode.', {
                    exact: true,
                })
                .waitFor();
        }
        checks.push(
            `custom ${days}-day chart retains every daily drilldown without page overflow on mobile`,
        );
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await visit();
    await page.getByRole('combobox', { name: 'Outlet', exact: true }).click();
    await page
        .getByRole('option', {
            name: 'CGK537 JAKARTA AGEN PURI MANSION',
            exact: true,
        })
        .click();
    await page.waitForURL(
        (url) =>
            url.searchParams.get('outlet') ===
            'CGK537 JAKARTA AGEN PURI MANSION',
    );
    await page
        .getByRole('link', { name: 'Total AWB: 15 AWB', exact: true })
        .waitFor();
    checks.push('outlet auto applies to KPI cohort');
    await page
        .getByRole('link', { name: 'Total AWB: 15 AWB', exact: true })
        .click();
    await page.waitForURL(
        (url) => url.pathname === '/admin/shipment-monitoring',
    );
    assert.equal(
        new URL(page.url()).searchParams.get('outlet'),
        'CGK537 JAKARTA AGEN PURI MANSION',
    );
    await page.locator('h1').waitFor();
    checks.push('KPI drilldown retains period and source outlet');
    await visit(
        '?outlet=' + encodeURIComponent('CGK537 JAKARTA AGEN PURI MANSION'),
    );
    await page
        .getByRole('group', {
            name: 'Volume AWB harian dan delivered saat ini',
            exact: true,
        })
        .getByRole('link', { name: /15 AWB, 2 delivered/ })
        .click();
    await page.waitForURL(
        (url) => url.pathname === '/admin/shipment-monitoring',
    );
    assert.equal(
        new URL(page.url()).searchParams.get('date_from'),
        '2026-11-03',
    );
    assert.equal(
        new URL(page.url()).searchParams.get('date_thru'),
        '2026-11-03',
    );
    assert.equal(
        new URL(page.url()).searchParams.get('outlet'),
        'CGK537 JAKARTA AGEN PURI MANSION',
    );
    checks.push(
        'daily chart drilldown scopes operational day and preserves outlet',
    );
    await visit();
    await page.locator('#customer_id').click();
    await page.getByRole('dialog').waitFor();
    await page
        .getByRole('combobox', { name: 'Cari customer', exact: true })
        .fill('AUD0001');
    await page.getByRole('option').filter({ hasText: 'AUD0001' }).click();
    await page.waitForURL((url) => !!url.searchParams.get('customer_id'));
    await page.getByRole('link', { name: /Total AWB: [0-9]+ AWB/ }).waitFor();
    checks.push('customer picker auto applies verified ownership filter');
    await visit();
    await page.getByRole('combobox', { name: 'Periode', exact: true }).click();
    await page.getByRole('option', { name: 'Custom', exact: true }).click();
    await page.locator('#date_from').fill('2026-01-01');
    await page.locator('#date_thru').fill('2026-11-03');
    await page
        .getByRole('button', { name: 'Tampilkan periode', exact: true })
        .click();
    await page
        .getByText('Pilih maksimal 92 hari operasional.', { exact: true })
        .waitFor();
    await page.waitForFunction(() => document.activeElement.id === 'date_thru');
    checks.push('invalid custom range shows inline error and focuses field');
    await page.locator('#date_from').fill('2026-11-02');
    await page.locator('#date_thru').fill('2026-11-03');
    await page
        .getByRole('button', { name: 'Tampilkan periode', exact: true })
        .click();
    await page.waitForURL(
        (url) => url.searchParams.get('date_from') === '2026-11-02',
    );
    checks.push('custom range applies together');
    await visit('?period=custom&date_from=2020-01-01&date_thru=2020-01-02');
    await page
        .getByText('Tidak ada AWB dengan tanggal entry pada filter ini.', {
            exact: false,
        })
        .waitFor();
    assert.equal(
        await page.getByLabel('SLA On Time Success belum tersedia').innerText(),
        '—',
    );
    await page.screenshot({
        path: path.join(output, 'performance-empty.png'),
        fullPage: true,
    });
    checks.push('empty cohort and unavailable SLA are distinct from zero');
    await visit();
    let release;
    const gate = new Promise((resolve) => {
        release = resolve;
    });
    await page.route('**/admin/operational-performance*', async (route) => {
        if (!route.request().headers()['x-inertia']) return route.continue();
        await gate;
        await route.fulfill({
            status: 503,
            contentType: 'text/plain',
            body: 'Synthetic isolated failure',
        });
    });
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page
        .getByRole('status')
        .filter({ hasText: 'Memuat performance…' })
        .waitFor();
    checks.push('loading status and disabled refresh preserve visible metrics');
    release();
    await page
        .getByRole('alert')
        .filter({ hasText: 'Data belum dapat dimuat.' })
        .waitFor();
    assert(await page.getByRole('link', { name: /Total AWB:/ }).count());
    await page.screenshot({
        path: path.join(output, 'performance-error.png'),
        fullPage: true,
    });
    await page.unroute('**/admin/operational-performance*');
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.waitForResponse(
        (response) =>
            response.url().includes('/admin/operational-performance') &&
            response.status() === 200,
    );
    await page
        .getByRole('alert')
        .filter({ hasText: 'Data belum dapat dimuat.' })
        .waitFor({ state: 'hidden' });
    checks.push('503 error recovery retries without hiding prior cohort');
    await page.getByRole('link', { name: 'Follow-up', exact: true }).click();
    await page.locator('#follow-up a[translate=no]:visible').first().click();
    await page.waitForURL((url) =>
        /^\/admin\/shipment-monitoring\/\d+$/.test(url.pathname),
    );
    checks.push('followup opens existing AWB detail');
    await visit();
    for (const width of [1440, 390]) {
        await page.setViewportSize({
            width,
            height: width === 390 ? 844 : 900,
        });
        const noteButton = page
            .locator(
                '#follow-up button[aria-label^="Catatan follow-up"]:visible',
            )
            .first();
        const label = await noteButton.getAttribute('aria-label');
        await noteButton.click();
        const note = page.getByRole('dialog', {
            name: label.replace('Catatan follow-up ', 'Follow-up '),
            exact: true,
        });
        await note.waitFor();
        for (const field of [
            'Catatan follow-up',
            'Status follow-up',
            'Penanggung jawab',
            'Follow-up terakhir',
        ])
            await note.getByText(field, { exact: true }).waitFor();
        assert.equal(await note.locator('input, textarea, select').count(), 0);
        assert.equal(
            await note.getByRole('button', { name: /Simpan|Selesai/i }).count(),
            0,
        );
        await page.keyboard.press('Escape');
        await note.waitFor({ state: 'hidden' });
        assert.equal(
            await noteButton.evaluate(
                (element) => element === document.activeElement,
            ),
            true,
        );
        checks.push(
            `read-only follow-up details preserve field distinction and keyboard focus at ${width}px`,
        );
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await visit();
    await page.evaluate(() => {
        localStorage.setItem('appearance', 'dark');
        document.documentElement.classList.add('dark');
    });
    await page.screenshot({
        path: path.join(output, 'performance-dark-1440.png'),
        fullPage: true,
        animations: 'disabled',
    });
    const contrasts = await page
        .locator('#overview [data-slot=card]')
        .evaluateAll((cards) => {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 1;
            const context = canvas.getContext('2d');
            const rgba = (color) => {
                context.clearRect(0, 0, 1, 1);
                context.fillStyle = color;
                context.fillRect(0, 0, 1, 1);
                return [...context.getImageData(0, 0, 1, 1).data];
            };
            const luminance = (rgb) =>
                rgb
                    .slice(0, 3)
                    .map((channel) => {
                        const normalized = channel / 255;
                        return normalized <= 0.04045
                            ? normalized / 12.92
                            : ((normalized + 0.055) / 1.055) ** 2.4;
                    })
                    .reduce(
                        (total, channel, index) =>
                            total + channel * [0.2126, 0.7152, 0.0722][index],
                        0,
                    );
            return cards.map((card) => {
                const background = rgba(getComputedStyle(card).backgroundColor);
                return [
                    ...card.querySelectorAll(
                        '[data-slot=card-title], [data-slot=card-content] .text-3xl',
                    ),
                ].map((element) => {
                    const foreground = rgba(getComputedStyle(element).color);
                    const alpha = foreground[3] / 255;
                    const composite = foreground.map(
                        (channel, index) =>
                            channel * alpha + background[index] * (1 - alpha),
                    );
                    const values = [
                        luminance(background),
                        luminance(composite),
                    ].sort((a, b) => a - b);
                    return (values[1] + 0.05) / (values[0] + 0.05);
                });
            });
        });
    assert(
        contrasts.flat().every((ratio) => ratio >= 4.5),
        'dark KPI labels and values meet 4.5:1 contrast',
    );
    await page.evaluate(() => {
        localStorage.setItem('appearance', 'light');
        document.documentElement.classList.remove('dark');
    });
    checks.push(
        'dark appearance retains layout with KPI labels and values at least 4.5:1 contrast',
    );
    await page.locator('#period').focus();
    await page.keyboard.press('Enter');
    await page.getByRole('option', { name: 'Daily', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.activeElement.id === 'period');
    checks.push('filter keyboard open escape and focus return');
    assert.deepEqual(errors, []);
    await fs.writeFile(
        path.join(output, 'browser-acceptance.json'),
        JSON.stringify({ status: 'PASS', checks, pageErrors: errors }, null, 2),
    );
    console.log(
        JSON.stringify({
            status: 'PASS',
            pass: checks.length,
            fail: 0,
            skip: 0,
            pageErrors: errors,
        }),
    );
} catch (error) {
    if (page) {
        await fs.writeFile(
            path.join(output, 'browser-failure.txt'),
            await page.locator('body').innerText(),
        );
        await page.screenshot({
            path: path.join(output, 'browser-failure.png'),
            fullPage: true,
        });
    }
    await fs.writeFile(
        path.join(output, 'browser-acceptance.json'),
        JSON.stringify({ status: 'FAIL', checks, error: error.stack }, null, 2),
    );
    throw error;
} finally {
    await browser.close();
}
