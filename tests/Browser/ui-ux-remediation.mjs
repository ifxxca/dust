import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(path.resolve('workers/jne-report/package.json'));
const { chromium } = require('playwright');
const base = process.env.UI_UX_BASE_URL;
assert(
    base && ['localhost', '127.0.0.1'].includes(new URL(base).hostname),
    'Set UI_UX_BASE_URL to an isolated loopback fixture application.',
);
const ids = JSON.parse(
    await fs.readFile(process.env.UI_UX_FIXTURE_IDS, 'utf8'),
);
const evidence = process.env.UI_UX_EVIDENCE_DIR ?? 'output/ui-ux-remediation';
await fs.mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
after(async () => {
    await browser.close();
    await fs.writeFile(
        path.join(evidence, 'browser-results.json'),
        JSON.stringify(results, null, 2),
    );
});

async function visit(page, route) {
    const response = await page.goto(base + route);
    await page.waitForLoadState('networkidle');
    return response;
}
async function login(page, role = 'admin_supervisor') {
    await visit(page, '/login');
    await page.locator('#email').fill(`audit-${role}@example.test`);
    await page.locator('#password').fill('password');
    await page
        .getByRole('button', { name: 'Masuk ke workspace', exact: true })
        .click();
    await page.waitForURL((url) => url.pathname !== '/login');
    await page.waitForLoadState('networkidle');
}
function check(name, run) {
    test(name, async () => {
        const context = await browser.newContext({
            viewport: { width: 1440, height: 1000 },
            reducedMotion: 'reduce',
        });
        await context.addInitScript(() => {
            if (!localStorage.getItem('appearance')) {
                localStorage.setItem('appearance', 'light');
            }
        });
        const page = await context.newPage();
        const pageErrors = [];
        page.on('pageerror', (error) => pageErrors.push(error.message));
        try {
            await login(page);
            const detail = await run(page);
            assert.deepEqual(
                pageErrors,
                [],
                'No unhandled browser JavaScript errors',
            );
            await page.screenshot({
                path: path.join(
                    evidence,
                    name.replaceAll(/[^\w-]+/g, '-') + '.png',
                ),
                fullPage: true,
                animations: 'disabled',
            });
            results.push({ name, status: 'passed', ...detail });
        } catch (error) {
            results.push({ name, status: 'failed', error: error.message });
            await page
                .screenshot({
                    path: path.join(evidence, 'failure.png'),
                    fullPage: true,
                })
                .catch(() => {});
            throw error;
        } finally {
            await context.close();
        }
    });
}
async function textContrast(locator) {
    return locator.evaluate((element) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d');
        const color = (value) => {
            context.clearRect(0, 0, 1, 1);
            context.fillStyle = value;
            context.fillRect(0, 0, 1, 1);
            return [...context.getImageData(0, 0, 1, 1).data].map((v, i) =>
                i === 3 ? v / 255 : v,
            );
        };
        const blend = (fg, bg) =>
            fg
                .slice(0, 3)
                .map((v, i) => v * fg[3] + bg[i] * (1 - fg[3]))
                .concat(1);
        const luminance = (rgb) =>
            rgb
                .slice(0, 3)
                .map((v) => v / 255)
                .map((v) =>
                    v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
                )
                .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
        const ancestors = [];
        for (let node = element; node; node = node.parentElement)
            ancestors.push(color(getComputedStyle(node).backgroundColor));
        let bg = [255, 255, 255, 1];
        for (const c of ancestors.reverse()) bg = blend(c, bg);
        const fg = blend(color(getComputedStyle(element).color), bg);
        const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
        return Number(((hi + 0.05) / (lo + 0.05)).toFixed(2));
    });
}

check('wave 1 contrast primary and active navigation', async (page) => {
    await visit(page, '/dashboard');
    const ratios = {};
    for (const theme of ['light', 'dark']) {
        if (theme === 'dark')
            await page
                .getByRole('button', {
                    name: 'Gunakan tema gelap',
                    exact: true,
                })
                .click();
        await page.waitForTimeout(650);
        const button = page.getByRole('button', {
            name: 'Terapkan',
            exact: true,
        });
        ratios[theme + 'Primary'] = await textContrast(button);
        assert(
            ratios[theme + 'Primary'] >= 4.5,
            `${theme} primary text contrast`,
        );
        await button.hover();
        await page.waitForTimeout(300);
        ratios[theme + 'Hover'] = await textContrast(button);
        assert(
            ratios[theme + 'Hover'] >= 4.5,
            `${theme} primary hover contrast`,
        );
        ratios[theme + 'Navigation'] = await textContrast(
            page
                .locator('a[data-active=true]')
                .filter({ hasText: 'Dashboard' })
                .first(),
        );
        assert(
            ratios[theme + 'Navigation'] >= 4.5,
            `${theme} active navigation contrast`,
        );
    }
    return ratios;
});

check(
    'wave 1 protects dirty customer Escape close and cancel',
    async (page) => {
        await visit(page, '/operations/customers');
        const add = page.getByRole('button', {
            name: 'Tambah Customer',
            exact: true,
        });
        await add.click();
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
        await add.click();
        await page.locator('#customer-name').fill('Draft terlindungi');
        for (const close of [
            () => page.keyboard.press('Escape'),
            () =>
                page
                    .getByRole('button', { name: 'Batal', exact: true })
                    .click(),
            () =>
                page
                    .getByRole('dialog')
                    .getByRole('button', { name: /Close|Tutup/, exact: true })
                    .click(),
        ]) {
            const dialog = page.waitForEvent('dialog');
            const closing = close();
            await (await dialog).dismiss();
            await closing;
            assert.equal(
                await page.locator('#customer-name').inputValue(),
                'Draft terlindungi',
            );
        }
        const dialog = page.waitForEvent('dialog');
        const closing = page.keyboard.press('Escape');
        await (await dialog).accept();
        await closing;
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
        await add.click();
        assert.equal(await page.locator('#customer-name').inputValue(), '');
    },
);

check(
    'wave 1 customer 422 focuses visible invalid field and preserves draft',
    async (page) => {
        await visit(page, '/operations/customers');
        await page
            .getByRole('button', { name: 'Tambah Customer', exact: true })
            .click();
        await page.locator('#customer-name').fill('Draft validasi');
        await page
            .locator('#customer-pickup_address')
            .fill('Alamat fixture tanpa kontak');
        const response = page.waitForResponse(
            (r) =>
                new URL(r.url()).pathname === '/api/v1/customers' &&
                r.request().method() === 'POST',
        );
        await page
            .getByRole('button', { name: 'Simpan Customer', exact: true })
            .click();
        assert.equal((await response).status(), 422);
        await page.locator('#customer-contact:focus').waitFor();
        const field = page.locator('#customer-contact');
        assert.equal(await field.getAttribute('aria-invalid'), 'true');
        assert.equal(
            await field.getAttribute('aria-describedby'),
            'customer-contact-error',
        );
        const bounds = await field.boundingBox();
        assert(
            bounds.y > 0 && bounds.y + bounds.height < 1000,
            'Invalid field is visible in dialog',
        );
        await page.screenshot({
            path: path.join(evidence, 'customer-error-visible.png'),
            fullPage: true,
            animations: 'disabled',
        });
        const heading = page.getByRole('heading', {
            name: 'Tambah Customer',
            exact: true,
        });
        assert(
            (await heading.boundingBox()).y > 0,
            'The dialog header remains visible after validation',
        );
        assert.equal(
            await page.locator('#customer-name').inputValue(),
            'Draft validasi',
        );
        await page.locator('#customer-email').fill('staff@example.test');
        await page.waitForTimeout(80);
        assert.equal(
            await page.evaluate(() => document.activeElement.id),
            'customer-email',
            'Validation recovery does not steal focus while editing another field',
        );
        assert(
            (await heading.boundingBox()).y > 0,
            'The dialog header remains visible when returning to an earlier field',
        );
    },
);

check(
    'wave 1 mobile handover opens selected panel and retains quantities',
    async (page) => {
        await page.setViewportSize({ width: 375, height: 812 });
        await visit(page, `/handover/${ids.session}`);
        const list = page.getByRole('region', {
            name: 'Daftar pickup task dalam session',
            exact: true,
        });
        const tasks = list.locator(
            'button[aria-controls="handover-verification-panel"]',
        );
        assert((await tasks.count()) >= 12);
        await tasks.first().click();
        const panel = page.locator('#handover-verification-panel');
        await page.locator('#handover-verification-panel:focus').waitFor();
        const box = await panel.boundingBox();
        assert(
            box.y >= 60 && box.y < 200,
            'Verification begins below sticky header',
        );
        const input = panel.locator('input[type=number]').first();
        await input.fill('7');
        await page
            .getByRole('button', {
                name: 'Kembali ke daftar task',
                exact: true,
            })
            .click();
        await tasks.nth(1).click();
        await page
            .getByRole('button', {
                name: 'Kembali ke daftar task',
                exact: true,
            })
            .click();
        await tasks.first().click();
        assert.equal(
            await panel.locator('input[type=number]').first().inputValue(),
            '7',
        );
        return { tasks: await tasks.count(), panelTop: box.y };
    },
);

check(
    'wave 2 dashboard supports enlarged text without page overflow',
    async (page) => {
        await page.setViewportSize({ width: 375, height: 812 });
        await visit(page, '/dashboard');
        await page.evaluate(
            () => (document.documentElement.style.fontSize = '200%'),
        );
        await page.waitForTimeout(150);
        const sizes = await page.evaluate(() => ({
            viewport: innerWidth,
            width: document.documentElement.scrollWidth,
        }));
        assert(sizes.width <= sizes.viewport + 1, JSON.stringify(sizes));
        return sizes;
    },
);

check(
    'wave 2 sorting announces the active column and direction',
    async (page) => {
        await visit(page, '/hasil-pickup?monitoring=pickup');
        const sort = page.getByRole('button', {
            name: 'Pickup / Customer',
            exact: true,
        });
        await sort.click();
        await page.waitForURL(
            (url) =>
                url.searchParams.get('sort') === 'customer_name' &&
                url.searchParams.get('direction') === 'desc',
        );
        const header = page.getByRole('columnheader', {
            name: 'Pickup / Customer',
            exact: true,
        });
        assert.equal(await header.getAttribute('aria-sort'), 'descending');
        assert.equal(await page.locator('th[aria-sort]').count(), 1);
        await sort.click();
        await page.waitForURL(
            (url) => url.searchParams.get('direction') === 'asc',
        );
        assert.equal(await header.getAttribute('aria-sort'), 'ascending');
    },
);

check(
    'wave 2 customer picker keyboard label selection and return focus',
    async (page) => {
        await visit(page, '/operations/create');
        const trigger = page.getByRole('combobox', {
            name: 'Customer',
            exact: true,
        });
        await trigger.focus();
        await page.keyboard.press('Enter');
        const dialog = page.getByRole('dialog', {
            name: 'Pilih Customer',
            exact: true,
        });
        await dialog.getByRole('option').first().waitFor();
        const search = dialog.getByRole('combobox');
        await search.press('ArrowDown');
        await search.press('Enter');
        await dialog.waitFor({ state: 'hidden' });
        assert.match(await trigger.innerText(), /Customer Audit/);
        assert(await trigger.evaluate((e) => e === document.activeElement));
    },
);

check('wave 2 skip link bypasses the sidebar', async (page) => {
    await visit(page, '/dashboard');
    await page.keyboard.press('Tab');
    const link = page.getByRole('link', {
        name: 'Lewati navigasi ke konten utama',
        exact: true,
    });
    assert(await link.evaluate((e) => e === document.activeElement));
    await page.keyboard.press('Enter');
    assert.equal(
        await page.evaluate(() => document.activeElement.id),
        'main-content',
    );
});

check(
    'wave 2 theme selection announces and persists the chosen mode',
    async (page) => {
        await visit(page, '/settings/appearance');
        const group = page.getByRole('group', {
            name: 'Tema tampilan',
            exact: true,
        });
        const dark = group.getByRole('button', { name: /^(Dark|Gelap)$/ });
        await dark.click();
        assert.equal(await dark.getAttribute('aria-pressed'), 'true');
        assert.equal(
            await group.locator('button[aria-pressed=true]').count(),
            1,
        );
        await page.reload();
        await page.waitForLoadState('networkidle');
        assert.equal(await dark.getAttribute('aria-pressed'), 'true');
        await page.emulateMedia({ colorScheme: 'dark' });
        const system = group.getByRole('button', { name: /^(System|Sistem)$/ });
        await system.click();
        assert.equal(await system.getAttribute('aria-pressed'), 'true');
        assert(
            await page
                .locator('html')
                .evaluate((e) => e.classList.contains('dark')),
        );
    },
);

check(
    'wave 2 reduced motion overlays preserve keyboard focus trapping and return',
    async (page) => {
        await visit(page, '/operations/customers');
        await page
            .getByRole('button', { name: 'Tambah Customer', exact: true })
            .click();
        const dialog = page.getByRole('dialog');
        const motion = await dialog.evaluate((e) => ({
            reduce: matchMedia('(prefers-reduced-motion: reduce)').matches,
            animation: getComputedStyle(e).animationName,
            transition: getComputedStyle(e).transitionDuration,
        }));
        assert(motion.reduce);
        assert.equal(motion.animation, 'none');
        assert.equal(motion.transition, '0s');
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        await page.setViewportSize({ width: 375, height: 812 });
        const trigger = page.getByRole('button', {
            name: 'Buka atau tutup navigasi',
            exact: true,
        });
        await trigger.click();
        const sheet = page.getByRole('dialog');
        await sheet.waitFor();
        assert.equal(
            await sheet.evaluate((e) => getComputedStyle(e).animationName),
            'none',
        );
        for (let i = 0; i < 12; i++) {
            await page.keyboard.press('Tab');
            assert(
                await sheet.evaluate((e) => e.contains(document.activeElement)),
            );
        }
        await page.keyboard.press('Escape');
        await sheet.waitFor({ state: 'hidden' });
        assert(await trigger.evaluate((e) => e === document.activeElement));
        return motion;
    },
);

check(
    'wave 3 customer URL restores search status pagination and browser history',
    async (page) => {
        await visit(page, '/operations/customers?page=2');
        await page.waitForTimeout(450);
        assert.equal(new URL(page.url()).searchParams.get('page'), '2');
        await page.reload();
        await page.waitForLoadState('networkidle');
        assert.equal(new URL(page.url()).searchParams.get('page'), '2');
        await page
            .getByRole('button', { name: 'Halaman sebelumnya', exact: true })
            .click();
        await page.waitForURL((url) => !url.searchParams.has('page'));
        await page.goBack();
        await page.waitForURL((url) => url.searchParams.get('page') === '2');
        await page.goForward();
        await page.waitForURL((url) => !url.searchParams.has('page'));
        const search = page.getByRole('textbox', {
            name: 'Cari customer',
            exact: true,
        });
        await search.fill('Customer Audit 2');
        await page.waitForURL(
            (url) => url.searchParams.get('q') === 'Customer Audit 2',
        );
        await page.reload();
        await page.waitForLoadState('networkidle');
        assert.equal(await search.inputValue(), 'Customer Audit 2');
        await page
            .getByRole('combobox', {
                name: 'Filter status customer',
                exact: true,
            })
            .click();
        await page
            .getByRole('option', { name: 'Nonaktif', exact: true })
            .click();
        await page.waitForURL(
            (url) => url.searchParams.get('status') === 'inactive',
        );
        await page.goBack();
        await page.waitForURL((url) => !url.searchParams.has('status'));
        assert.equal(await search.inputValue(), 'Customer Audit 2');
        await page.goForward();
        await page.waitForURL(
            (url) => url.searchParams.get('status') === 'inactive',
        );
        assert.equal(await search.inputValue(), 'Customer Audit 2');
        await page
            .getByRole('button', { name: 'Reset Filter', exact: true })
            .click();
        await page.waitForURL((url) => url.search === '');
        assert.equal(await search.inputValue(), '');
        await visit(page, '/operations/customers?page=999');
        await page.waitForURL((url) => url.searchParams.get('page') === '2');
        return {
            restoredSearch: true,
            restoredPage: 2,
            history: true,
            clampedOutOfRangePage: true,
        };
    },
);

check(
    'wave 3 customer validation and settings use Indonesian',
    async (page) => {
        await visit(page, '/operations/customers');
        await page
            .getByRole('button', { name: 'Tambah Customer', exact: true })
            .click();
        await page.locator('#customer-name').fill('Validasi bahasa');
        await page.locator('#customer-pickup_address').fill('Alamat fixture');
        await page
            .getByRole('button', { name: 'Simpan Customer', exact: true })
            .click();
        const error = page.locator('#customer-contact-error');
        await error.waitFor();
        await page.screenshot({
            path: path.join(evidence, 'wave-3-customer-validation-id.png'),
            fullPage: true,
            animations: 'disabled',
        });
        assert.equal(
            await error.innerText(),
            'Isi minimal satu email, nomor telepon, atau kontak utama pickup.',
        );
        // A full document visit leaves only the invalid local form; no record was created.
        await visit(page, '/settings/profile');
        await page
            .getByRole('heading', { name: 'Pengaturan', exact: true })
            .waitFor();
        await page
            .getByRole('button', { name: 'Simpan', exact: true })
            .waitFor();
        await visit(page, '/settings/security');
        if (new URL(page.url()).pathname === '/user/confirm-password') {
            await page.locator('input[name=password]').fill('password');
            await page.locator('[data-test=confirm-password-button]').click();
            await page.waitForURL(
                (url) => url.pathname === '/settings/security',
            );
        }
        await page
            .getByRole('heading', { name: 'Ubah kata sandi', exact: true })
            .waitFor();
    },
);

check(
    'wave 3 password recovery copy and 404 recovery remain usable',
    async (page) => {
        await page.context().clearCookies();
        await visit(page, '/forgot-password');
        await page
            .getByRole('button', {
                name: 'Kirim tautan atur ulang',
                exact: true,
            })
            .waitFor();
        await visit(
            page,
            '/reset-password/INVALID_UI_UX_TOKEN?email=fixture%40example.test',
        );
        await page
            .getByRole('button', { name: 'Atur ulang kata sandi', exact: true })
            .waitFor();
        const response = await visit(page, '/ui-ux-missing-page');
        assert.equal(response.status(), 404);
        await page.screenshot({
            path: path.join(evidence, 'wave-3-404-recovery.png'),
            fullPage: true,
            animations: 'disabled',
        });
        await page
            .getByRole('heading', {
                name: 'Halaman tidak ditemukan',
                exact: true,
            })
            .waitFor();
        const recovery = page.getByRole('link', {
            name: 'Kembali ke dashboard',
            exact: true,
        });
        assert.equal(await recovery.getAttribute('href'), '/dashboard');
        await recovery.click();
        await page.waitForURL((url) => url.pathname === '/login');
        assert.equal(
            await page
                .getByRole('textbox', { name: 'Alamat email', exact: true })
                .count(),
            1,
        );
    },
);

check(
    'wave 4 active admin workspaces retain their routes and rendering',
    async (page) => {
        const routes = [
            '/dashboard',
            '/operations/tasks',
            '/operations/users',
            '/operations/customers',
            '/operations/create',
            '/pickup-schedules',
            '/hasil-pickup?monitoring=pickup',
            '/hasil-pickup?monitoring=processing',
            `/operations/detail/${ids.proof}`,
            '/handover',
            `/handover/${ids.session}`,
            '/discrepancies',
            '/admin/jne-monitoring',
            '/admin/jne-monitoring/customer-dashboard',
            '/admin/jne-monitoring/profiles',
            '/admin/jne-reports',
            '/admin/report-runs',
            `/admin/jne-reports/${ids.report}/awbs`,
            '/admin/jne-monitoring/reconciliation',
            '/admin/jne-shipper-aliases',
            `/admin/jne-monitoring/${ids.shipment}`,
        ];
        for (const route of routes) {
            const response = await visit(page, route);
            assert.equal(response.status(), 200, route);
            assert.equal(await page.locator('main').count(), 1, route);
            assert(
                await page.evaluate(
                    () =>
                        document.documentElement.scrollWidth <= innerWidth + 1,
                ),
                route,
            );
            if (
                [
                    '/admin/jne-monitoring/customer-dashboard',
                    '/admin/jne-monitoring/profiles',
                    '/admin/report-runs',
                    '/admin/jne-monitoring',
                ].includes(route)
            ) {
                await page.screenshot({
                    path: path.join(
                        evidence,
                        'fresh-build-' + route.split('/').at(-1) + '.png',
                    ),
                    fullPage: true,
                    animations: 'disabled',
                });
            }
        }
        return {
            routes: routes.length,
            build: 'fresh',
            externalRetrieval: false,
        };
    },
);

check(
    'wave 4 role access and assigned pickup remain unchanged',
    async (page) => {
        const matrix = [
            [
                'cs',
                [
                    ['/operations/tasks', 200],
                    ['/operations/customers', 200],
                    ['/operations/users', 403],
                    ['/admin/jne-monitoring', 403],
                ],
            ],
            [
                'pickup_staff',
                [
                    ['/operations/mine', 200],
                    ['/operations/available', 200],
                    [`/operations/execute/${ids.execute}`, 200],
                    ['/operations/customers', 403],
                    ['/admin/jne-monitoring', 403],
                ],
            ],
            [
                'retail_staff',
                [
                    ['/dashboard', 200],
                    ['/operations/users', 403],
                    [`/handover/${ids.session}`, 200],
                ],
            ],
        ];
        const statuses = [];
        for (const [role, routes] of matrix) {
            await page.context().clearCookies();
            await login(page, role);
            for (const [route, status] of routes) {
                const response = await visit(page, route);
                assert.equal(response.status(), status, role + ' ' + route);
                statuses.push({ role, route, status });
            }
        }
        return { statuses };
    },
);

check(
    'wave 4 pickup and embedded customer dialogs preserve unsaved drafts',
    async (page) => {
        await visit(page, '/operations/tasks');
        await page
            .getByRole('button', { name: 'Buat Pickup', exact: true })
            .click();
        // The actual field ID is intentionally located by its visible label.
        const field = page.getByRole('textbox', {
            name: 'Alamat Pickup',
            exact: true,
        });
        await field.fill('Draft alamat pickup');
        let confirmation = page.waitForEvent('dialog');
        let closing = page.keyboard.press('Escape');
        await (await confirmation).dismiss();
        await closing;
        assert.equal(await field.inputValue(), 'Draft alamat pickup');
        confirmation = page.waitForEvent('dialog');
        closing = page.keyboard.press('Escape');
        await (await confirmation).accept();
        await closing;
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
        await visit(page, '/operations/create');
        await page
            .getByRole('combobox', { name: 'Customer', exact: true })
            .click();
        await page
            .getByRole('dialog')
            .getByRole('button', { name: 'Tambah Customer', exact: true })
            .click();
        await page.locator('#customer-name').fill('Draft customer di picker');
        confirmation = page.waitForEvent('dialog');
        closing = page.keyboard.press('Escape');
        await (await confirmation).dismiss();
        await closing;
        assert.equal(
            await page.locator('#customer-name').inputValue(),
            'Draft customer di picker',
        );
        confirmation = page.waitForEvent('dialog');
        closing = page
            .getByRole('button', { name: 'Batal', exact: true })
            .click();
        await (await confirmation).accept();
        await closing;
        await page
            .getByRole('dialog', { name: 'Pilih Customer', exact: true })
            .waitFor();
    },
);
