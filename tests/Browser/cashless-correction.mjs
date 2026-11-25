import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs/promises';
const require = createRequire(path.resolve('workers/jne-report/package.json'));
const { chromium } = require('playwright');
const base = process.env.UI_UX_BASE_URL;
assert(base && ['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const ids = JSON.parse(await fs.readFile(process.env.UI_UX_FIXTURE_IDS, 'utf8'));
const output = path.resolve('output/cashless-correction-browser-20261105');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', (route) => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
    await page.goto(base + '/login');
    await page.locator('#email').fill('audit-pickup_staff@example.test');
    await page.locator('#password').fill('password');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => url.pathname !== '/login');
    for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(base + '/hasil-cashless/' + ids['cashless_' + width]);
        assert.match(await page.locator('main').innerText(), /4 dari 5 resi berhasil/);
        await page.getByRole('button', { name: 'Ganti resi', exact: true }).click();
        const field = page.getByLabel('Resi pengganti', { exact: true });
        await field.fill('12345');
        await page.getByRole('button', { name: 'Simpan & proses pengganti', exact: true }).click();
        await page.getByRole('alert').filter({ hasText: 'minimal 6 karakter' }).waitFor();
        assert.equal(await field.evaluate((node) => node === document.activeElement), true);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.screenshot({ path: path.join(output, `error-${width}.png`), animations: 'disabled' });
        await field.fill('CMGOOD' + width + '0');
        await page.getByRole('button', { name: 'Simpan & proses pengganti', exact: true }).click();
        await page.getByRole('alert').filter({ hasText: 'sudah tercatat' }).waitFor();
        await field.fill('CMFIXED' + width);
        const request = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes('/koreksi'));
        await page.getByRole('button', { name: 'Simpan & proses pengganti', exact: true }).click();
        assert.equal((await request).status(), 200);
        const next = page.getByRole('button', { name: /^Lihat batch #/ });
        await next.waitFor();
        await page.screenshot({ path: path.join(output, `saved-${width}.png`), animations: 'disabled' });
        await next.click();
        await page.getByRole('heading', { name: /Hasil Cashless/ }).waitFor();
        await page.getByText('CMFIXED' + width, { exact: true }).waitFor();
        assert.match(await page.locator('main').innerText(), /0 dari 1 resi berhasil/);
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ browser: 'passed', widths: [1440, 390], short_code_blocked: true, duplicate_rejected: true, replacement_only: true, javascript_errors: 0 }));
} finally {
    await browser.close();
}
