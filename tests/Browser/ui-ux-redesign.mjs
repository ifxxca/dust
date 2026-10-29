import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(path.resolve('workers/jne-report/package.json'));
const { chromium } = require('playwright');
const base = process.env.UI_UX_BASE_URL;
assert(base && ['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const phase = process.env.UI_UX_PHASE ?? 'before';
const root = 'docs/ui-ux-phase2/evidence';
const browser = await chromium.launch({ headless: true });
const outputs = [];
const payloads = {};
const clean = (value) =>
    JSON.parse(
        JSON.stringify(value, (key, item) => {
            if (key === 'observed_at' && typeof item === 'string')
                return '[request timestamp]';
            if (
                typeof item === 'string' &&
                item.startsWith('http://127.0.0.1:')
            ) {
                const url = new URL(item);
                return url.pathname + url.search;
            }
            return item;
        }),
    );
try {
    for (const role of [
        'admin_supervisor',
        'cs',
        'pickup_staff',
        'retail_staff',
    ]) {
        const context = await browser.newContext({
            viewport: { width: 1366, height: 768 },
            deviceScaleFactor: 1,
            colorScheme: 'light',
            locale: 'id-ID',
            timezoneId: 'Asia/Jakarta',
            reducedMotion: 'reduce',
        });
        await context.addInitScript(() =>
            localStorage.setItem('appearance', 'light'),
        );
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(base + '/login');
        await page.locator('#email').fill('audit-' + role + '@example.test');
        await page.locator('#password').fill('password');
        await page
            .getByRole('button', { name: 'Masuk ke workspace', exact: true })
            .click();
        await page.waitForURL((url) => url.pathname === '/dashboard');
        await page.waitForLoadState('networkidle');
        for (const route of role === 'admin_supervisor'
            ? [
                  '/dashboard',
                  '/admin/jne-monitoring/customer-dashboard',
                  '/admin/jne-shipper-aliases',
              ]
            : ['/dashboard']) {
            await page.setViewportSize({ width: 1366, height: 768 });
            await page.goto(base + route);
            await page.waitForLoadState('networkidle');
            await page.evaluate(() => document.fonts.ready);
            const props = await page
                .locator('script[data-page]')
                .evaluate((element) => JSON.parse(element.textContent).props);
            payloads[role + route] = clean(
                route === '/dashboard'
                    ? (props.overview ??
                          Object.fromEntries(
                              [
                                  'operationalDate',
                                  'timezone',
                                  'stats',
                                  'trends',
                                  'recent',
                                  'attention',
                                  'nextTasks',
                                  'retail',
                              ].map((key) => [key, props[key]]),
                          ))
                    : Object.fromEntries(
                          (route === '/admin/jne-shipper-aliases'
                              ? [
                                    'filters',
                                    'stats',
                                    'ownership',
                                    'directory',
                                    'aliases',
                                    'mappingRuns',
                                    'mappingPagination',
                                    'selectedCustomer',
                                    'conflictGroups',
                                ]
                              : [
                                    'filters',
                                    'selectedCustomer',
                                    'summary',
                                    'daily',
                                    'destinations',
                                    'services',
                                    'statuses',
                                    'shipments',
                                    'servers',
                                    'ages',
                                    'comparison',
                                    'selectedDestination',
                                ]
                          ).map((key) => [key, props[key]]),
                      ),
            );
            if (phase === 'after' && props.overview) {
                const queue = page.getByRole('region', {
                    name: /Perlu tindak lanjut/,
                });
                assert.equal(
                    await queue.locator('a[href^="/hasil-pickup/"]').count(),
                    props.overview.attention.length,
                );
                for (const row of props.overview.attention) {
                    assert(
                        await queue
                            .getByRole('link', {
                                name: new RegExp(row.reference),
                            })
                            .isVisible(),
                    );
                }
                const bounds = await queue.boundingBox();
                assert(
                    bounds.y < 400,
                    'Exception queue belongs in the first desktop viewport',
                );
                assert.equal(
                    await page.locator('main svg[role=img]').count(),
                    1,
                );
                for (const metric of ['Paket', 'Customer', 'Pickup']) {
                    const control = page.getByRole('button', {
                        name: metric,
                        exact: true,
                    });
                    await control.click();
                    assert.equal(
                        await control.getAttribute('aria-pressed'),
                        'true',
                    );
                }
                for (const label of [
                    'Dasar data & periode',
                    'Rincian pickup & perbandingan periode',
                    'Customer & petugas',
                    ...(props.overview.tracking
                        ? ['Snapshot pengiriman JNE']
                        : []),
                    'Aktivitas terbaru (' + props.overview.recent.length + ')',
                ]) {
                    const button = page.getByRole('button', {
                        name: label,
                        exact: true,
                    });
                    await button.focus();
                    await page.keyboard.press('Enter');
                    assert.equal(
                        await button.getAttribute('aria-expanded'),
                        'true',
                    );
                }
                const staffLinks = page.locator('main a[href*="staff_id="]');
                assert.equal(
                    await staffLinks.count(),
                    props.overview.team.length,
                );
                if (props.overview.team.length) {
                    const target = new URL(
                        await staffLinks.first().getAttribute('href'),
                        base,
                    );
                    assert.equal(
                        target.searchParams.get('date_from'),
                        props.overview.filters.date_from,
                    );
                    assert.equal(
                        target.searchParams.get('date_to'),
                        props.overview.filters.date_thru,
                    );
                }
                const daily = page.getByText('Data aktivitas harian', {
                    exact: true,
                });
                await daily.click();
                assert.equal(
                    await daily.locator('..').locator('tbody tr').count(),
                    props.overview.daily.length,
                );
                assert.match(
                    await page.locator('main').innerText(),
                    /05.00–04.59/,
                );
            }
            if (phase === 'after' && route === '/admin/jne-shipper-aliases') {
                for (const run of props.mappingRuns.filter(
                    (run) => run.status !== 'COMPLETED',
                )) {
                    const status = page
                        .getByRole('status')
                        .filter({ hasText: '#' + run.id + ' ·' });
                    assert(
                        await status.isVisible(),
                        'Active sync feedback remains visible',
                    );
                    if (run.status === 'FAILED')
                        assert(
                            await status
                                .getByRole('button', {
                                    name: 'Ulangi penerapan',
                                })
                                .isVisible(),
                        );
                }
                const search = page.getByRole('textbox', {
                    name: 'Cari kode atau nama customer',
                    exact: true,
                });
                assert(
                    (await search.boundingBox()).y < 700,
                    'Customer lookup stays in first desktop viewport even with sync failures',
                );
                await page
                    .getByText('Penerapan nama pengirim & riwayat', {
                        exact: true,
                    })
                    .click();
            }
            if (
                phase === 'after' &&
                route === '/admin/jne-monitoring/customer-dashboard'
            ) {
                await page
                    .getByText('Rincian volume, status & perbandingan', {
                        exact: true,
                    })
                    .click();
                assert(
                    await page
                        .getByRole('heading', {
                            name: 'Amount & awalan server',
                            exact: true,
                        })
                        .isVisible(),
                );
                assert(
                    await page
                        .getByText('Berat kiriman', { exact: true })
                        .isVisible(),
                );
                assert(
                    await page
                        .getByRole('button', {
                            name: 'Periksa 7+ hari',
                            exact: true,
                        })
                        .isVisible(),
                );
            }
            if (
                phase === 'after' &&
                route === '/dashboard' &&
                !props.overview
            ) {
                const work = page
                    .locator(
                        'main a[href^="' +
                            (role === 'retail_staff'
                                ? '/handover/'
                                : '/operations/detail/') +
                            '"]',
                    )
                    .first();
                if (await work.count())
                    assert(
                        (await work.boundingBox()).y < 400,
                        'Current work precedes summaries',
                    );
                const summary = page.getByText(
                    role === 'retail_staff'
                        ? 'Ringkasan handover'
                        : 'Ringkasan & tren',
                    { exact: true },
                );
                await summary.focus();
                await page.keyboard.press('Enter');
                assert.equal(
                    await summary.locator('..').getAttribute('open'),
                    '',
                );
            }
            const name =
                role +
                (route === '/dashboard'
                    ? '-dashboard'
                    : route === '/admin/jne-shipper-aliases'
                      ? '-sender-names'
                      : '-customer-analytics');
            for (const width of [1366, 390]) {
                await page.setViewportSize({
                    width,
                    height: width === 1366 ? 768 : 844,
                });
                await page.evaluate(() => scrollTo(0, 0));
                await page.screenshot({
                    path: path.join(
                        root,
                        phase,
                        name + '-expanded-' + width + '.png',
                    ),
                    fullPage: true,
                    animations: 'disabled',
                });
                assert.equal(
                    await page.evaluate(
                        () =>
                            document.documentElement.scrollWidth >
                            innerWidth + 1,
                    ),
                    false,
                );
            }
            outputs.push({
                role,
                route,
                status: 'passed',
                errors: [...errors],
            });
            assert.equal(errors.length, 0, errors.join('\n'));
            if (
                phase === 'after' &&
                route === '/admin/jne-monitoring/customer-dashboard'
            ) {
                await page.setViewportSize({ width: 1366, height: 768 });
                await page
                    .getByRole('button', { name: /^Server PM\s*\d+/ })
                    .click();
                await page.waitForURL(
                    (url) => url.searchParams.get('server') === 'pm',
                );
                await page.waitForLoadState('networkidle');
                assert.equal(
                    await page.locator('#dashboard-from').inputValue(),
                    props.filters.date_from,
                );
                assert.equal(
                    await page.locator('#dashboard-thru').inputValue(),
                    props.filters.date_thru,
                );
                await page
                    .getByRole('button', {
                        name: 'Periksa 7+ hari',
                        exact: true,
                    })
                    .click();
                await page.waitForURL(
                    (url) => url.searchParams.get('age') === '7_plus',
                );
                await page.waitForLoadState('networkidle');
                await page
                    .getByRole('button', { name: 'Amount', exact: true })
                    .click();
                assert.equal(
                    await page
                        .getByRole('button', { name: 'Amount', exact: true })
                        .getAttribute('aria-pressed'),
                    'true',
                );
                outputs.push({
                    role,
                    status: 'passed',
                    flow: 'server filter; retained dates; age drill-down; amount metric',
                });
            }
        }
        if (phase === 'after' && ['admin_supervisor', 'cs'].includes(role)) {
            await page.setViewportSize({ width: 1366, height: 768 });
            await page.goto(
                base + '/dashboard?date_from=2099-01-01&date_thru=2099-01-02',
            );
            await page.waitForLoadState('networkidle');
            assert(
                await page
                    .getByText('Tidak ada tindak lanjut pada periode ini.', {
                        exact: true,
                    })
                    .isVisible(),
            );
            await page
                .getByRole('button', {
                    name: 'Rincian pickup & perbandingan periode',
                    exact: true,
                })
                .click();
            assert(
                await page
                    .getByText(/Rasio pickup berhasil: Tidak tersedia/)
                    .isVisible(),
            );
            await page.screenshot({
                path: path.join(root, phase, role + '-empty.png'),
                fullPage: true,
            });
            await page
                .getByRole('button', { name: 'Hari ini', exact: true })
                .click();
            await page.waitForURL(
                (url) =>
                    url.searchParams.get('date_from') ===
                        url.searchParams.get('date_thru') &&
                    url.searchParams.get('date_from') !== '2099-01-01',
            );
            await page.waitForLoadState('networkidle');
            await page
                .getByRole('button', { name: 'Buat pickup', exact: true })
                .click();
            assert(await page.getByRole('dialog').isVisible());
            await page.keyboard.press('Escape');
            await page.route('**/dashboard*', (route) => route.abort('failed'));
            await page
                .getByRole('button', { name: 'Segarkan data', exact: true })
                .click();
            await page
                .getByRole('alert')
                .filter({ hasText: 'Data gagal diperbarui' })
                .waitFor();
            await page.screenshot({
                path: path.join(root, phase, role + '-refresh-error.png'),
            });
            await page.unroute('**/dashboard*');
            outputs.push({
                role,
                status: 'passed',
                flow: 'empty period; null rate; date preset; create dialog; recoverable refresh failure',
            });
        }
        await context.close();
    }
    if (phase === 'after') {
        const before = JSON.parse(
            await fs.readFile(path.join(root, 'before-payloads.json'), 'utf8'),
        );
        assert.deepEqual(
            payloads,
            clean(before),
            'Business data and date semantics must remain identical',
        );
    }
} finally {
    await browser.close();
    await fs.writeFile(
        path.join(root, phase + '-payloads.json'),
        JSON.stringify(payloads, null, 2),
    );
    await fs.writeFile(
        path.join(root, phase + '-product-checks.json'),
        JSON.stringify(outputs, null, 2),
    );
}
console.log(phase + ': ' + outputs.length + ' product checks passed.');
