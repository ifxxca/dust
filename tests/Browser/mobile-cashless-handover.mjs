import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.resolve('workers/jne-report/package.json'));
const { chromium } = require('playwright');
const api = 'http://127.0.0.1:8019';
const front = 'http://127.0.0.1:5174';
const output = path.resolve('output/mobile-cashless-20261028');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light', reducedMotion: 'reduce' });
    const auth = await context.request.post(api + '/api/mobile/v1/auth/tokens', { data: { email: 'audit-pickup_staff@example.test', password: 'password', device_id: '36993e4c-dbd0-4770-b962-55f20dc58149', device_name: 'Isolated Cashless UI QA' } });
    assert.equal(auth.status(), 201);
    const login = await auth.json();
    await context.addInitScript((session) => { window.cashlessQaSession = session; }, { token: login.data.token, user: login.data.user, environment: api, expiresAt: login.data.expires_at, timezone: 'Asia/Jakarta', locked: false });
    await context.route(front + '/cashless-qa*', (route) => route.fulfill({ contentType: 'text/html', body: '<html lang="id"><head><meta name="viewport" content="width=device-width, initial-scale=1"><script type="module">import RefreshRuntime from "/@react-refresh"; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="/@fs/S:/2026/dust/tests/Fixtures/mobile-cashless.tsx"></script></body></html>' }));
    let loseReply = false;
    const submitted = [];
    await context.route(api + '/api/mobile/v1/**', async (route) => {
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': front, 'Access-Control-Allow-Headers': 'Accept,Authorization,Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' } });
        const response = await route.fetch();
        if (route.request().method() === 'POST' && route.request().url().includes('/cashless-handovers/')) {
            submitted.push(route.request().postDataJSON());
            if (loseReply) { loseReply = false; assert.equal(response.status(), 200); return route.abort('failed'); }
        }
        return route.fulfill({ response, headers: { ...response.headers(), 'Access-Control-Allow-Origin': front } });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(front + '/cashless-qa?view=cashless');

    await page.getByRole('button', { name: /AUD-PICKUP-0032/ }).click();
    const scan = page.getByLabel('Scan atau ketik nomor resi');
    await scan.waitFor();
    await page.getByRole('radio', { name: 'Puman', exact: true }).click();
    const prefix = `TGMOBILE${Date.now()}`;
    await scan.fill(prefix + '1'); await scan.press('Enter');
    await page.getByText(prefix + '1', { exact: true }).waitFor();
    await scan.fill(prefix + '1'); await scan.press('Enter');
    await page.getByText(`Resi ${prefix}1 sudah ada pada buku atau daftar ini.`, { exact: true }).waitFor();
    await scan.fill('');
    await page.reload();

    await page.getByText(prefix + '1', { exact: true }).waitFor();
    await scan.fill(prefix + '2'); await page.getByRole('button', { name: 'Tambah', exact: true }).click();
    await page.getByText(prefix + '2', { exact: true }).waitFor();
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Simpan Handover Cashless', exact: true }).waitFor({ state: 'visible' });
    assert.equal(await page.getByRole('button', { name: 'Simpan Handover Cashless', exact: true }).isDisabled(), true);
    await context.setOffline(false);
    await scan.fill(prefix + '3');
    await page.screenshot({ path: path.join(output, 'mobile-scan.png'), fullPage: true });
    loseReply = true;
    await page.getByRole('button', { name: 'Simpan Handover Cashless', exact: true }).click();
    await page.getByText('Hasil penyimpanan belum pasti', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Periksa & simpan ulang', exact: true }).waitFor({ state: 'visible' });
    assert.equal(await scan.isDisabled(), true);
    await page.reload();

    await page.getByRole('button', { name: 'Periksa & simpan ulang', exact: true }).click();
    await page.getByText('3 resi Cashless tersimpan di server.', { exact: true }).waitFor();
    assert.equal(submitted.length, 2);
    assert.deepEqual(submitted[0], submitted[1], 'Lost reply retries use the identical immutable payload.');
    assert.equal(submitted[0].source, 'nuralamt');
    for (const number of ['1', '2', '3']) await page.getByText(prefix + number, { exact: true }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(output, 'mobile-saved.png'), fullPage: true });
    await page.getByRole('button', { name: 'Kembali', exact: true }).click();
    await page.getByRole('heading', { name: 'Pilih buku pickup saya', exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'passed', tests: 'native module, scanner, manual input, duplicates, durable draft, offline save disabled, lost-response retry after reload, back navigation, mobile layout', submitted: submitted.length, savedUnique: 3, output }));
    await context.request.delete(api + '/api/mobile/v1/auth/token', { headers: { Authorization: `Bearer ${login.data.token}` } });
} finally { await browser.close(); }
