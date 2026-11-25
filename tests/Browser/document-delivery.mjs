import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(path.resolve('workers/jne-report/package.json'));
const { chromium } = require('playwright');
const base = process.env.UI_UX_BASE_URL;
assert(base && new URL(base).hostname === '127.0.0.1');
const output = path.resolve('output/waha');
const browser = await chromium.launch();
const results = [];
try {
    for (const width of [1440, 390]) {
        const context = await browser.newContext({
            viewport: { width, height: 900 },
            colorScheme: width === 390 ? 'dark' : 'light',
        });
        await context.addInitScript(
            (appearance) => localStorage.setItem('appearance', appearance),
            width === 390 ? 'dark' : 'light',
        );
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.route('**/*', (route) =>
            new URL(route.request().url()).origin === new URL(base).origin
                ? route.continue()
                : route.abort(),
        );
        await page.goto(base + '/login');
        await page
            .locator('#email')
            .fill('audit-admin_supervisor@example.test');
        await page.locator('#password').fill('password');
        await page
            .getByRole('button', { name: 'Masuk ke workspace', exact: true })
            .click();
        await page.waitForURL((url) => url.pathname !== '/login');
        await page.goto(base + '/settings/document-delivery');
        await page
            .getByRole('heading', { name: 'Pengiriman dokumen', exact: true })
            .waitFor();
        assert.equal(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
            true,
        );
        await page.screenshot({
            path: path.join(output, `settings-${width}.png`),
            fullPage: true,
        });
        await page.goto(base + '/operations/customers');
        await page
            .getByRole('button', { name: 'Tambah Customer', exact: true })
            .click();
        const dialog = page.getByRole('dialog');
        await dialog.locator('#customer-name').fill(`WAHA UI Test ${width}`);
        await dialog
            .locator('#customer-pickup_address')
            .fill('Alamat simulasi pengiriman dokumen');
        await dialog
            .getByRole('checkbox', {
                name: 'Bukti pickup melalui WhatsApp',
                exact: true,
            })
            .check();
        await dialog
            .getByRole('checkbox', {
                name: 'Rekap resi melalui WhatsApp',
                exact: true,
            })
            .check();
        await dialog.getByLabel('Nomor WhatsApp', { exact: true }).fill('123');
        await dialog
            .getByRole('button', { name: 'Simpan Customer', exact: true })
            .click();
        await dialog.locator('#customer-wa-target-error').waitFor();
        await page.waitForFunction(
            () => document.activeElement?.id === 'customer-wa-target',
        );
        assert.equal(
            await page.evaluate(() => document.activeElement?.id),
            'customer-wa-target',
        );
        await dialog
            .getByLabel('Nomor WhatsApp', { exact: true })
            .fill('0812 3456 789');
        await dialog.locator('#customer-wa-consent').check();
        await dialog
            .getByLabel('Nomor WhatsApp', { exact: true })
            .fill('0812 3456 780');
        assert.equal(
            await dialog.locator('#customer-wa-consent').isChecked(),
            false,
        );
        await dialog
            .getByLabel('Nomor WhatsApp', { exact: true })
            .fill('0812 3456 789');
        await dialog
            .getByRole('button', { name: 'Simpan Customer', exact: true })
            .click();
        await dialog.locator('#customer-wa-consent-error').waitFor();
        await page.waitForFunction(
            () => document.activeElement?.id === 'customer-wa-consent',
        );
        assert.equal(
            await page.evaluate(() => document.activeElement?.id),
            'customer-wa-consent',
        );
        await dialog.locator('#customer-wa-consent').check();
        assert.equal(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
            true,
        );
        const dialogBounds = await dialog.boundingBox();
        const headerBounds = await dialog
            .getByRole('heading', { name: 'Tambah Customer', exact: true })
            .boundingBox();
        assert(
            headerBounds.y >= dialogBounds.y &&
                headerBounds.y < dialogBounds.y + dialogBounds.height,
        );
        await dialog
            .locator('[aria-labelledby="customer-document-heading"]')
            .evaluate((element) => element.scrollIntoView({ block: 'start' }));
        await page.screenshot({
            path: path.join(output, `customer-contact-${width}.png`),
            fullPage: false,
        });
        const saved = page.waitForResponse(
            (response) =>
                response.url().endsWith('/api/v1/customers') &&
                response.request().method() === 'POST',
        );
        await dialog
            .getByRole('button', { name: 'Simpan Customer', exact: true })
            .click();
        const response = await saved;
        assert.equal(response.status(), 201);
        assert.equal(
            (await response.json()).data.document_delivery_settings
                .whatsapp_target,
            '628123456789@c.us',
        );
        await dialog.waitFor({ state: 'hidden' });
        assert.deepEqual(errors, []);
        results.push({
            width,
            saveStatus: response.status(),
            validationFocus: true,
            pageErrors: errors,
        });
        await context.close();
    }
    await fs.writeFile(
        path.join(output, 'browser-results.json'),
        JSON.stringify(results, null, 2),
    );
    console.log(JSON.stringify({ status: 'PASS', results }));
} finally {
    await browser.close();
}
