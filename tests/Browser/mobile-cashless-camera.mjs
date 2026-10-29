import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.resolve('workers/jne-report/package.json'));
const { chromium } = require('playwright');
const front = 'http://127.0.0.1:5174';
const api = 'http://127.0.0.1:8019';
const output = path.resolve('output/mobile-cashless-camera-20261028');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
let inspectedPage;
try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light', reducedMotion: 'reduce' });
    await context.addInitScript(({ api }) => {
        window.cashlessCameraQa = true;
        window.cashlessQaSession = { token: 'isolated-camera-ui-test', user: { id: 7, name: 'Staff QA', role: 'pickup_staff', is_active: true }, environment: api, expiresAt: '2099-01-01', timezone: 'Asia/Jakarta', locked: false };
    }, { api });
    await context.route(front + '/cashless-qa*', (route) => route.fulfill({ contentType: 'text/html', body: '<html lang="id"><head><meta name="viewport" content="width=device-width, initial-scale=1"><script type="module">import RefreshRuntime from "/@react-refresh"; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="/@fs/S:/2026/dust/tests/Fixtures/mobile-cashless.tsx"></script></body></html>' }));
    const awbs = [];
    const book = { id: 71, reference: 'QA-CAMERA-001', customer: 'Customer uji kamera', scheduled_at: '2026-10-28T03:00:00Z', status: 'PICKED_UP', target: 3, saved_count: 0, can_record: true };
    const pageData = (data) => ({ data, current_page: 1, last_page: 1, total: data.length });
    let submitted;
    await context.route(api + '/api/mobile/v1/**', async (route) => {
        const headers = { 'Access-Control-Allow-Origin': front, 'Access-Control-Allow-Headers': 'Accept,Authorization,Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        if (route.request().method() === 'POST') {
            submitted = route.request().postDataJSON();
            awbs.push(...submitted.awbs.map((awb, i) => ({ id: i + 1, awb, created_at: '2026-10-28T03:00:00Z' })));
            return route.fulfill({ headers, json: { data: { pickup_task_id: book.id, saved: submitted.awbs.length, stored_count: awbs.length } } });
        }
        return route.fulfill({ headers, json: { tasks: pageData([book]), selected: new URL(route.request().url()).searchParams.has('task') ? { ...book, saved_count: awbs.length, awbs: pageData(awbs) } : null } });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    inspectedPage = page;
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(front + '/cashless-qa?view=cashless');

    await page.getByRole('button', { name: /QA-CAMERA-001/ }).click();
    await page.getByRole('radio', { name: 'PM', exact: true }).click();
    await page.getByRole('button', { name: 'Scan dengan kamera', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Scan resi Cashless' });
    await dialog.getByRole('button', { name: 'Senter', exact: true }).waitFor();
    await page.evaluate(() => window.cashlessCamera.emit(['TG0001', 'TG0002', 'TG0001']));
    await dialog.getByText('2 resi dalam draft', { exact: true }).waitFor();
    await page.evaluate(() => window.cashlessCamera.emit(['016660047446626']));
    await dialog.getByText('Resi ini termasuk Manual. Gunakan resi Cashless.', { exact: true }).waitFor();
    await page.evaluate(() => window.cashlessCamera.emit(['TG0003']));
    await dialog.getByText('3 resi dalam draft', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Senter', exact: true }).click();
    assert.equal(await dialog.getByRole('button', { name: 'Senter', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('root')).visibility), 'hidden');
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgba(0, 0, 0, 0)');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(output, 'camera-ui.png') });
    await page.evaluate(() => window.dispatchEvent(new Event('mobile-back', { cancelable: true })));
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.cashlessCamera.stops), 1);
    assert.equal(await page.evaluate(() => window.cashlessCamera.torch), false);
    assert.equal(await page.evaluate(() => document.body.classList.contains('cashless-camera-mode')), false);
    await page.getByText('TG0001', { exact: true }).waitFor();
    await page.reload();

    await page.getByText('TG0001', { exact: true }).waitFor();
    await page.evaluate(() => { window.cashlessCamera.permission = 'denied'; });
    await page.getByRole('button', { name: 'Scan dengan kamera', exact: true }).click();
    await dialog.getByRole('button', { name: 'Buka pengaturan kamera', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.cashlessCamera.starts), 0);
    await dialog.getByRole('button', { name: 'Selesai scan', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.evaluate(() => { window.cashlessCamera.permission = 'granted'; });
    await page.getByRole('button', { name: 'Scan dengan kamera', exact: true }).click();
    await dialog.getByRole('button', { name: 'Senter', exact: true }).waitFor();
    await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
    });
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.cashlessCamera.stops), 1);
    await page.evaluate(() => { delete document.hidden; });
    await page.getByRole('button', { name: 'Simpan Handover Cashless', exact: true }).click();
    await page.getByText('3 resi Cashless tersimpan di server.', { exact: true }).waitFor();
    assert.deepEqual(submitted.awbs, ['TG0001', 'TG0002', 'TG0003']);
    assert.equal(submitted.source, 'roberto');
    await page.screenshot({ path: path.join(output, 'camera-saved.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'passed', scope: 'Browser UI with mocked native camera and API; physical camera not tested', tests: 'continuous scans, deduplication, manual rejection, torch, transparent preview, Android back event, background cleanup, permission denial, draft reload, exact saved payload', output }));
} catch (error) {
    if (inspectedPage) {
        await inspectedPage.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
        console.error(await inspectedPage.locator('body').innerText());
        console.error(await inspectedPage.evaluate(() => window.cashlessCamera));
    }
    throw error;
} finally { await browser.close(); }
