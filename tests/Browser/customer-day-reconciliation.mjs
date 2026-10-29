import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(path.resolve('workers/jne-report/package.json'));
const { chromium } = require('playwright');
const base = 'http://127.0.0.1:8019';
const output = path.resolve('output/customer-day-reconciliation-20261028');
const ids = JSON.parse(await fs.readFile(path.join(output, process.env.CUSTOMER_DAY_FIXTURE ?? 'fixture2.sqlite.ids.json'), 'utf8'));
const browser = await chromium.launch({ headless: true });
let inspected;
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    inspected = page;
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base + '/login');
    await page.locator('#email').fill('audit-admin_supervisor@example.test');
    await page.locator('#password').fill('password');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
    await page.goto(base + '/rekonsiliasi-resi?date_from=2026-10-01&date_to=2026-10-31&scope=daily&q=4000');
    await page.getByRole('button', { name: 'Lihat rekonsiliasi Vanny' }).click();
    await page.getByRole('tab', { name: 'Buku pickup', exact: true }).waitFor();
    await page.getByText('2 pickup', { exact: false }).first().waitFor();
    await page.screenshot({ path: path.join(output, 'customer-day-desktop.png'), fullPage: true });
    const response = await page.request.get(base + '/hasil-pickup/' + ids.customer_day_anchor + '/automation?view=customer_day');
    assert.equal(response.status(), 200);
    const group = await response.json();
    assert.equal(group.reconciliation.status, 'DONE');
    assert.equal(group.reconciliation.categories.manual_hybrid.expected, 4);
    assert.equal(group.reconciliation.categories.manual_hybrid.confirmed, 4);
    assert.equal(group.shipments.total, 4);
    assert.equal(group.manifests.total, 1);
    await page.getByRole('tab', { name: 'Buku pickup', exact: true }).click();
    const buttons = page.getByRole('button', { name: 'Periksa buku', exact: true });
    assert.equal(await buttons.count(), 2);
    await buttons.nth(1).click();
    await page.getByRole('button', { name: 'Kembali ke gabungan customer', exact: true }).waitFor();
    await page.getByRole('tab', { name: 'Atur resi', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Kembali ke gabungan customer', exact: true }).click();
    await page.getByRole('tab', { name: 'Buku pickup', exact: true }).waitFor();
    await page.getByRole('tab', { name: 'Bukti & AWB', exact: true }).click();
    await page.getByText('000MANUAL1', { exact: true }).waitFor();
    await page.getByText('000MANUAL4', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Tutup detail rekonsiliasi', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Lihat detail', exact: true }).click();
    await page.getByRole('tab', { name: 'Buku pickup', exact: true }).click();
    await page.getByRole('button', { name: 'Periksa buku', exact: true }).first().waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(output, 'customer-day-mobile.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'passed', dailyRows: 1, books: 2, awbs: 4, manifests: 1, memberNavigation: true, mobileOverflow: false, output }));
} catch (error) {
    if (inspected) {
        await inspected.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
        console.error(await inspected.locator('body').innerText());
    }
    throw error;
} finally { await browser.close(); }
