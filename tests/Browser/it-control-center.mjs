import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(path.resolve('workers/jne-report/package.json'));
const { chromium } = require('playwright');
const base = process.env.UI_UX_BASE_URL;
assert(base && new URL(base).origin === 'http://127.0.0.1:8137');
const output = path.resolve('output/it-control-center-ui');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
const checks = [];
const page = await browser.newPage({ reducedMotion: 'reduce' });
page.on('pageerror', (error) => errors.push(error.message));
await page.route('**/*', (route) =>
    new URL(route.request().url()).origin === base
        ? route.continue()
        : route.abort(),
);
try {
    await page.goto(base + '/login');
    await page.locator('#email').fill('audit-admin_supervisor@example.test');
    await page.locator('#password').fill('password');
    await page.locator('button[type=submit]').click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
    await page
        .getByRole('link', { name: 'IT Control Center', exact: true })
        .click();
    await page.waitForURL('**/admin/it-control-center');
    await page
        .getByRole('heading', { name: 'IT Control Center', exact: true })
        .waitFor();
    checks.push('admin navigation reaches centralized read-only page');
    assert.equal(await page.getByRole('radio').count(), 5);
    const evidence = page.getByRole('button', {name: 'Bukti & detail: Web application', exact: true});
    await evidence.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('dialog').waitFor();
    assert((await page.getByRole('dialog').innerText()).includes('Runtime health'));
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({state: 'hidden'});
    assert(await evidence.evaluate((element) => element === document.activeElement));
    checks.push('five sections and keyboard-operable evidence sheet restores focus');
    const serviceSearch = page.getByLabel('Cari layanan', {exact: true});
    const navigationRequests = [];
    const watchServiceRequests = (request) => { if (request.isNavigationRequest() || request.url().includes('it-control-center')) navigationRequests.push(request.url()); };
    page.on('request', watchServiceRequests);
    await serviceSearch.fill('CSV import');
    assert.equal(await page.getByRole('region', {name: /^Tabel Layanan sistem,/}).locator('tbody tr').count(), 1);
    await serviceSearch.fill('no-such-service');
    assert((await page.getByRole('region', {name: /^Tabel Layanan sistem,/}).innerText()).includes('Tidak ada layanan yang cocok'));
    await serviceSearch.fill('');
    page.off('request', watchServiceRequests);
    assert.equal(navigationRequests.length, 0);
    await page.getByLabel('Status layanan', {exact: true}).click();
    await page.getByRole('option', {name: 'Runtime sehat', exact: true}).click();
    const filtered = page.getByRole('region', {name: /^Tabel Layanan sistem,/});
    assert(!(await filtered.innerText()).includes('Node APEX'));
    await page.getByLabel('Status layanan', {exact: true}).click();
    await page.getByRole('option', {name: 'Semua status', exact: true}).click();
    checks.push('service search and runtime filter are local and recover from empty results');
    const sections = [
        'Overview',
        'Workers & Queues',
        'Integrations',
        'Job Runs',
        'Errors',
    ];
    for (const [width, height] of [
        [1440, 1000],
        [768, 1024],
        [390, 844],
        [375, 812],
        [812, 375],
    ]) {
        await page.setViewportSize({ width, height });
        for (const section of sections) {
            await page
                .getByRole('radio', { name: section, exact: true })
                .click();
            if (section === 'Overview' && width < 768) {
                assert(await page.getByRole('list', {name: 'Daftar layanan', exact: true}).isVisible());
                const mobileService = page.getByRole('list', {name: 'Daftar layanan', exact: true}).locator('li').first();
                const body = await mobileService.innerText();
                assert(body.includes('Runtime') && body.includes('Readiness') && body.includes('Execution'));
                await mobileService.getByRole('button', {name: /^Bukti & detail:/}).click();
                await page.getByRole('dialog').waitFor();
                assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
                await page.keyboard.press('Escape');
            }
            if (section === 'Workers & Queues') {
                const history = page
                    .locator('details')
                    .filter({
                        has: page.getByText(/^Riwayat worker berhenti/),
                    });
                await history.locator('summary').click();
                await page
                    .getByRole('heading', {
                        name: 'Event penghentian worker',
                        exact: true,
                    })
                    .waitFor();
                assert((await history.innerText()).includes('fixture-retired'));
                assert(
                    !(
                        await page
                            .getByRole('region', { name: /^Tabel Worker,/ })
                            .innerText()
                    ).includes('fixture-retired'),
                );
            }
            assert(
                await page.evaluate(
                    () => document.documentElement.scrollWidth <= innerWidth,
                ),
                `overflow ${width} ${section}`,
            );
            assert(
                !(await page.locator('body').innerText()).includes(
                    'PRIVATE_DIAGNOSTIC_SECRET',
                ),
            );
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.screenshot({
                path: path.join(
                    output,
                    `${width}-${section === 'Workers & Queues' ? 'workers' : section.toLowerCase()}.png`,
                ),
                fullPage: true,
            });
        }
        checks.push(`all sections usable without page overflow at ${width}px`);
    }
    await page.getByRole('radio', { name: 'Job Runs', exact: true }).click();
    await page.locator('summary').filter({hasText: 'Scheduler · expected / actual'}).click();
    await page.getByRole('heading', {name: 'Scheduler', exact: true}).waitFor();
    assert((await page.getByRole('region', {name: /^Tabel Scheduler,/}).innerText()).includes('Berikutnya (WIB)'));
    checks.push('scheduler remains available inside Job Runs with explicit display timezone');
    await page.getByRole('radio', { name: 'Errors', exact: true }).click();
    const requests = [];
    const collect = (request) => {
        if (
            request.isNavigationRequest() ||
            request.url().includes('it-control-center')
        )
            requests.push(request.url());
    };
    page.on('request', collect);
    await page
        .getByLabel('Cari diagnostik', { exact: true })
        .fill('FORM_VALUE');
    await page.waitForTimeout(200);
    page.off('request', collect);
    assert.equal(requests.length, 0);
    assert(
        (
            await page
                .getByRole('region', { name: /Tabel Diagnostik,/ })
                .innerText()
        ).includes('FORM_VALUE'),
    );
    assert(
        !(
            await page
                .getByRole('region', { name: /Tabel Diagnostik,/ })
                .innerText()
        ).includes('TIMEOUT'),
    );
    checks.push(
        'diagnostic search filters locally without per-keystroke requests',
    );
    await page.getByRole('button', { name: 'Segarkan', exact: true }).click();
    await page.getByRole('button', { name: 'Segarkan', exact: true }).waitFor();
    assert.equal(new URL(page.url()).hash, '#diagnostics');
    checks.push('refresh preserves section and previous browser history state');
    await page.reload();
    await page.getByLabel('Cari diagnostik', { exact: true }).waitFor();
    checks.push('hash deep link survives reload');
    await page.getByRole('radio', {name: 'Overview', exact: true}).click();
    await page.setViewportSize({width: 375, height: 812});
    await page.evaluate(() => {document.documentElement.style.fontSize = '32px';});
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({path: path.join(output, '375-overview-large-text.png'), fullPage: true});
    await page.evaluate(() => {document.documentElement.style.fontSize = '';});
    checks.push('200 percent root text size preserves mobile page containment');
    await page.getByRole('radio', { name: 'Errors', exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => {
        document.documentElement.classList.add('dark');
        document.documentElement.style.colorScheme = 'dark';
    });
    await page.waitForTimeout(200);
    const colors = await page.evaluate(() =>
        Object.fromEntries(
            ['body', 'table', 'td', '[data-slot="badge"]', 'button'].map(
                (selector) => {
                    const element = document.querySelector(selector);
                    const styles = getComputedStyle(element);
                    return [
                        selector,
                        {
                            color: styles.color,
                            background: styles.backgroundColor,
                            foreground: styles.getPropertyValue('--foreground'),
                            theme: styles.getPropertyValue(
                                '--color-foreground',
                            ),
                            secondary: styles.getPropertyValue(
                                '--secondary-foreground',
                            ),
                        },
                    ];
                },
            ),
        ),
    );
    await fs.writeFile(
        path.join(output, 'dark-colors.json'),
        JSON.stringify(colors, null, 2),
    );
    await page.screenshot({
        path: path.join(output, '1440-diagnostics-dark.png'),
        fullPage: true,
    });
    await page
        .getByRole('radio', { name: 'Workers & Queues', exact: true })
        .click();
    await page.screenshot({
        path: path.join(output, '1440-workers-dark.png'),
        fullPage: true,
    });
    assert.equal(errors.length, 0, errors.join('\n'));
    await fs.writeFile(
        path.join(output, 'browser-results.json'),
        JSON.stringify({ checks, errors }, null, 2),
    );
    console.log(JSON.stringify({ passed: checks.length, checks, errors }));
} finally {
    await browser.close();
}
