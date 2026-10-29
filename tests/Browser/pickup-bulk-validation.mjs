import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(path.resolve('workers/jne-report/package.json'));
const { chromium } = require('playwright');
const base = process.env.UI_UX_BASE_URL;
assert(base && new URL(base).hostname === '127.0.0.1' && new URL(base).port === '8019');
const browser = await chromium.launch({ headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.clock.install();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base + '/login');
    await page.locator('#email').fill('audit-admin_supervisor@example.test');
    await page.locator('#password').fill('password');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
    await page.goto(base + '/rekonsiliasi-resi?date_from=2026-10-01&date_to=2026-10-31&date_basis=pickup&scope=daily');
    const trigger = page.getByRole('button', { name: 'Validasi massal', exact: true });
    await trigger.click();
    assert.equal(await page.getByRole('menuitem', { name: 'Validasi pilihan (0)', exact: true }).getAttribute('aria-disabled'), 'true');
    await page.keyboard.press('Escape');
    await page.getByRole('checkbox', { name: /^Pilih pickup / }).filter({ visible: true }).first().click();
    await trigger.click();
    const selectedResponse = page.waitForResponse((response) => response.url().endsWith('/rekonsiliasi-resi/validate') && response.request().method() === 'POST');
    await page.getByRole('menuitem', { name: 'Validasi pilihan (1)', exact: true }).click();
    const selected = await selectedResponse;
    assert.equal(selected.status(), 202);
    assert.equal((await selected.json()).queued_count, 1);
    assert.equal(selected.request().postDataJSON().selected_ids.length, 1);
    await page.getByRole('status').filter({ hasText: '1 pickup diantrekan' }).waitFor();
    await trigger.click();
    const allResponse = page.waitForResponse((response) => response.url().endsWith('/rekonsiliasi-resi/validate') && response.request().method() === 'POST');
    await page.getByRole('menuitem', { name: /^Validasi semua hasil filter/ }).click();
    const all = await allResponse;
    assert.equal(all.status(), 202);
    assert((await all.json()).queued_count > 1);
    assert.equal(all.request().postDataJSON().selected_ids, undefined);
    await page.getByRole('status').filter({ hasText: 'pickup diantrekan' }).waitFor();
    await page.screenshot({ path: 'output/jne-filter-search-20261027/bulk-validation-desktop.png', fullPage: true });
    let detailRequests = 0;
    const isDetail = (url) => /\/hasil-pickup\/\d+\/automation(?:\?|$)/.test(url);
    page.on('request', (request) => { if (isDetail(request.url()) && request.method() === 'GET') detailRequests++; });
    await page.getByRole('button', { name: /^Lihat rekonsiliasi / }).first().click();
    try {
        await page.getByRole('tab', { name: 'Ringkasan', exact: true }).waitFor({ timeout: 5000 });
    } catch (failure) {
        process.stdout.write(JSON.stringify({ url: page.url(), errors, body: (await page.locator('body').innerText()).slice(-2500) }) + '\n');
        throw failure;
    }
    const refreshed = page.waitForResponse((response) => isDetail(response.url()) && response.request().method() === 'GET');
    await page.clock.fastForward(16000);
    await refreshed;
    assert(detailRequests >= 2);
    await page.getByRole('tab', { name: 'Atur resi', exact: true }).click();
    await page.getByLabel('Alasan dan bukti koreksi', { exact: true }).fill('Draf koreksi tetap tersimpan.');
    const beforeEditingWait = detailRequests;
    await page.clock.fastForward(31000);
    assert.equal(detailRequests, beforeEditingWait);
    assert.equal(await page.getByLabel('Alasan dan bukti koreksi', { exact: true }).inputValue(), 'Draf koreksi tetap tersimpan.');
    await page.getByRole('button', { name: 'Tutup detail rekonsiliasi', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await trigger.click();
    await page.getByRole('menuitem', { name: /^Validasi semua hasil filter/ }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: 'output/jne-filter-search-20261027/bulk-validation-mobile.png', fullPage: true });
    assert.deepEqual(errors, []);
    process.stdout.write(JSON.stringify({ result: 'passed', selected: 1, all: (await all.json()).queued_count, detailAutoRefresh: true, editingDraftPreserved: true, mobileOverflow: false, pageErrors: errors }) + '\n');
} finally {
    await browser.close();
}
