import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs/promises';
const require = createRequire(path.resolve('workers/jne-report/package.json'));
const { chromium } = require('playwright');
const base = process.env.UI_UX_BASE_URL;
assert(base && ['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const output = path.resolve('output/staff-hybrid-browser-evidence-20261105');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
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
    await page.waitForURL((url) => url.pathname !== '/login');
    for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(base + '/operations/users');
        const trigger = page
            .getByRole('button', { name: /^Akun Hybrid/ })
            .filter({ visible: true })
            .first();
        await trigger.click();
        const dialog = page.getByRole('dialog');
        await dialog.getByLabel('Username Hybrid').fill('fixture-admin');
        const password = dialog.locator('#hybrid_password');
        assert.equal(await password.getAttribute('type'), 'password');
        await password.fill('fixture-only-secret');
        const responsePromise = page.waitForResponse(
            (response) =>
                response.request().method() === 'PATCH' &&
                response.url().endsWith('/hybrid'),
        );
        await dialog
            .getByRole('button', { name: 'Simpan akun Hybrid', exact: true })
            .click();
        const response = await responsePromise;
        assert.equal(response.status(), 200);
        assert(!(await response.text()).includes('fixture-only-secret'));
        await dialog.waitFor({ state: 'hidden' });
        await page
            .getByRole('button', { name: /^Akun Hybrid/ })
            .filter({ visible: true })
            .first()
            .click();
        assert.equal(await dialog.locator('#hybrid_password').inputValue(), '');
        assert.equal(
            await dialog.getByLabel('Username Hybrid').inputValue(),
            'fixture-admin',
        );
        assert.equal(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
            ),
            true,
        );
        await page.screenshot({
            path: path.join(output, `account-${width}.png`),
            fullPage: false,
            animations: 'disabled',
        });
        await page.keyboard.press('Escape');
    }
    assert.deepEqual(errors, []);
    console.log(
        JSON.stringify({
            status: 'PASS',
            viewports: [1440, 390],
            saved: true,
            passwordNotReturned: true,
            pageErrors: errors,
        }),
    );
} finally {
    await browser.close();
}
