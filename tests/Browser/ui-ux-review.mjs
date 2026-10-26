import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';

// Run against tests/Fixtures/ui-ux-browser.php, never the operational database.
const require = createRequire(path.resolve('workers/jne-report/package.json'));
const { chromium } = require('playwright');
const base = process.env.UI_UX_BASE_URL;
assert(base && ['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const phase = process.env.UI_UX_PHASE ?? 'before';
assert(['before', 'after'].includes(phase));
const root = 'docs/ui-ux-review/evidence';
const ids = JSON.parse(
    await fs.readFile(process.env.UI_UX_FIXTURE_IDS, 'utf8'),
);
await fs.mkdir(path.join(root, phase), { recursive: true });
const admin = 'admin_supervisor';
const cases = [
    ['welcome', '/', null],
    ['login', '/login', null],
    ['forgot-password', '/forgot-password', null],
    [
        'reset-password',
        '/reset-password/audit-invalid?email=audit-admin_supervisor%40example.test',
        null,
    ],
    ['dashboard-admin', '/dashboard', admin],
    ['dashboard-cs', '/dashboard', 'cs'],
    ['dashboard-retail', '/dashboard', 'retail_staff'],
    ['dashboard-pickup', '/dashboard', 'pickup_staff'],
    [
        'customers',
        '/operations/customers',
        admin,
        '[aria-label="Cari customer"]',
    ],
    ['tasks', '/operations/tasks', admin],
    ['mine', '/operations/mine', 'pickup_staff'],
    ['available', '/operations/available', 'pickup_staff'],
    ['pickup-history', '/operations/mine?history=1', 'pickup_staff'],
    ['create-pickup', '/operations/create', 'cs'],
    ['task-detail', `/operations/detail/${ids.proof}`, admin],
    ['users', '/operations/users', admin],
    ['pickup-wizard', `/operations/execute/${ids.execute}`, 'pickup_staff'],
    [
        'schedules',
        '/pickup-schedules',
        admin,
        '[aria-label="Cari jadwal customer"]',
    ],
    ['results-processing', '/hasil-pickup', admin],
    ['results-pickup', '/hasil-pickup?monitoring=pickup', admin],
    ['result-detail', `/hasil-pickup/${ids.proof}`, admin],
    ['handovers', '/handover', admin],
    ['handover-history', '/handover?history=1', 'retail_staff'],
    ['handover-detail', `/handover/${ids.session}`, 'retail_staff'],
    ['discrepancies', '/discrepancies', admin],
    ['customer-dashboard', '/admin/jne-monitoring/customer-dashboard', admin],
    ['shipments', '/admin/jne-monitoring', admin],
    ['shipment-detail', `/admin/jne-monitoring/${ids.shipment}`, admin],
    ['reconciliation', '/admin/jne-monitoring/reconciliation', admin],
    ['profiles', '/admin/jne-monitoring/profiles', admin],
    ['reports', '/admin/jne-reports', admin],
    ['report-runs', '/admin/report-runs', admin],
    [
        'report-awbs',
        `/admin/jne-reports/${ids.report}/awbs`,
        admin,
        '#awb-search',
    ],
    [
        'shipper-aliases',
        '/admin/jne-shipper-aliases',
        admin,
        '[aria-label="Cari kode atau nama customer"]',
    ],
    ['evidence-rules', '/admin/jne-monitoring/evidence-rules', admin],
    ['exceptions', '/admin/jne-monitoring/exceptions', admin],
    [
        'collection-window',
        `/admin/jne-monitoring/collections/${ids.proof}`,
        admin,
    ],
    ['refresh-policy', '/admin/jne-monitoring/refresh-policies', admin],
    ['push-test', '/admin/push-test', admin],
    ['profile', '/settings/profile', admin],
    ['security', '/settings/security', admin],
    ['appearance', '/settings/appearance', admin],
    ['confirm-password', '/user/confirm-password', admin],
    ['not-found', '/ui-ux-review-missing-page', null],
    [
        'customer-dialog',
        '/operations/customers',
        admin,
        '#customer-name',
        'Tambah Customer',
    ],
    ['schedule-dialog', '/pickup-schedules', admin, undefined, 'Tambah Jadwal'],
    [
        'evidence-sheet',
        '/admin/jne-monitoring/evidence-rules',
        admin,
        undefined,
        'Tambah aturan',
    ],
];
const viewports = [
    { width: 1366, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 320, height: 740 },
];
const selectedKeys = new Set(
    (process.env.UI_UX_CASES ?? '').split(',').filter(Boolean),
);
const selectedCases = selectedKeys.size
    ? cases.filter(([key]) => selectedKeys.has(key))
    : cases;
const browser = await chromium.launch({ headless: true });
const results = selectedKeys.size
    ? JSON.parse(
          await fs.readFile(path.join(root, `${phase}-results.json`), 'utf8'),
      ).filter((r) => !selectedKeys.has(r.key))
    : [];
const failures = [];
async function settle(page) {
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
}
async function login(context, role) {
    const page = await context.newPage();
    await page.goto(base + '/login');
    await page.locator('#email').fill(`audit-${role}@example.test`);
    await page.locator('#password').fill('password');
    await page
        .getByRole('button', { name: 'Masuk ke workspace', exact: true })
        .click();
    await page.waitForURL((url) => url.pathname !== '/login');
    await settle(page);
    // Confirm once per context so the security page is compared in the same state.
    await page.goto(base + '/user/confirm-password');
    await page.locator('#password').fill('password');
    await page
        .getByRole('button', { name: 'Konfirmasi kata sandi', exact: true })
        .click();
    await page.waitForURL((url) => url.pathname !== '/user/confirm-password');
    await settle(page);
    await page.close();
}
try {
    const contexts = new Map();
    for (const role of [null, admin, 'cs', 'retail_staff', 'pickup_staff']) {
        const context = await browser.newContext({
            viewport: viewports[0],
            deviceScaleFactor: 1,
            reducedMotion: 'reduce',
            colorScheme: 'light',
            locale: 'id-ID',
            timezoneId: 'Asia/Jakarta',
        });
        await context.addInitScript(() =>
            localStorage.setItem('appearance', 'light'),
        );
        if (role) await login(context, role);
        contexts.set(role, context);
    }
    for (const [key, route, role, target, open] of selectedCases) {
        for (const viewport of viewports) {
            const page = await contexts.get(role).newPage();
            const errors = [];
            page.on('pageerror', (error) => errors.push(error.message));
            try {
                await page.setViewportSize(viewport);
                const response = await page.goto(base + route);
                await settle(page);
                if (open) {
                    await page
                        .getByRole('button', { name: open, exact: true })
                        .click();
                    await page.getByRole('dialog').waitFor();
                }
                await page.evaluate(() => window.scrollTo(0, 0));
                const metrics = await page.evaluate((selector) => {
                    const visible = (e) =>
                        e.getClientRects().length &&
                        getComputedStyle(e).visibility !== 'hidden' &&
                        !e.closest('[aria-hidden="true"],[inert]');
                    const main =
                        document.querySelector('main') ?? document.body;
                    const first = (sel) =>
                        [...main.querySelectorAll(sel)].find(visible);
                    const rect = (e) =>
                        e
                            ? {
                                  top: Math.round(
                                      e.getBoundingClientRect().top,
                                  ),
                                  height: Math.round(
                                      e.getBoundingClientRect().height,
                                  ),
                              }
                            : null;
                    const name = (e) =>
                        e.getAttribute('aria-label') ||
                        e.labels?.[0]?.textContent?.trim() ||
                        (e.getAttribute('aria-labelledby') ?? '')
                            .split(' ')
                            .map(
                                (id) =>
                                    document.getElementById(id)?.textContent ??
                                    '',
                            )
                            .join(' ')
                            .trim() ||
                        e.textContent?.trim();
                    return {
                        url: location.pathname + location.search,
                        zoom: devicePixelRatio,
                        theme: document.documentElement.className,
                        overflow:
                            document.documentElement.scrollWidth >
                            innerWidth + 1,
                        title: rect(first('h1')),
                        search: rect(
                            selector
                                ? document.querySelector(selector)
                                : first(
                                      'input[type=search],input[placeholder*="Cari"],input[aria-label*="Cari"]',
                                  ),
                        ),
                        workingArea: rect(
                            first(
                                'tbody tr, [data-slot="table-body"] tr, form, [role=tabpanel]',
                            ),
                        ),
                        unnamedControls: [
                            ...main.querySelectorAll(
                                'button,input:not([type=hidden]),select,textarea',
                            ),
                        ]
                            .filter(visible)
                            .filter((e) => !name(e))
                            .map((e) => ({
                                tag: e.tagName,
                                id: e.id,
                                type: e.getAttribute('type'),
                            })),
                        headings: [...main.querySelectorAll('h1,h2,h3')]
                            .filter(visible)
                            .map((e) => e.textContent.trim()),
                        alerts: [...document.querySelectorAll('[role=alert]')]
                            .filter(visible)
                            .map((e) => e.textContent.trim()),
                    };
                }, target);
                const filename = `${key}-${viewport.width}.png`;
                await page.screenshot({
                    path: path.join(root, phase, filename),
                    animations: 'disabled',
                });
                results.push({
                    key,
                    role,
                    route,
                    viewport,
                    status: response.status(),
                    screenshot: `${phase}/${filename}`,
                    ...metrics,
                    errors: [...errors],
                });
                await fs.writeFile(
                    path.join(root, `${phase}-results.json`),
                    JSON.stringify(results, null, 2),
                );
                console.log(
                    `${phase} ${key} ${viewport.width}: ${response.status()} overflow=${metrics.overflow} unnamed=${metrics.unnamedControls.length}`,
                );
            } catch (error) {
                failures.push({ key, route, error: error.stack });
                console.error(`${key}: ${error.message}`);
            } finally {
                await page.close();
            }
        }
    }
} finally {
    await browser.close();
    await fs.writeFile(
        path.join(root, `${phase}-failures.json`),
        JSON.stringify(failures, null, 2),
    );
}
assert.equal(failures.length, 0, JSON.stringify(failures));
assert(results.length === cases.length * viewports.length);
if (phase === 'after') {
    assert(
        results.every((r) => r.errors.length === 0),
        'Unhandled browser errors',
    );
    assert(
        results.every((r) => !r.overflow),
        'Page-level horizontal overflow',
    );
    assert(
        results.every((r) => r.unnamedControls.length === 0),
        'Visible controls have accessible labels',
    );
}
console.log(`Captured ${results.length} comparable ${phase} states.`);
