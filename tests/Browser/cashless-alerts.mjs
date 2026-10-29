import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(path.resolve('workers/jne-report/package.json'));
const { chromium } = require('playwright');
const api = 'http://127.0.0.1:8019', front = 'http://127.0.0.1:5174';
const output = path.resolve('output/pickup-review-notifications-20261028');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(api + '/login');
    await page.locator('#email').fill('audit-pickup_staff@example.test');
    await page.locator('#password').fill('password');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
    await page.getByRole('button', { name: /^Notifikasi pickup/ }).click();
    const notice = page.getByRole('button', { name: /Cashless selesai dengan pengecualian/ });
    await notice.waitFor();
    await page.getByRole('dialog').evaluate(async (element) => {
        await Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => {})));
    });
    await page.screenshot({ path: output + '/web.png' });
    await notice.click();
    await page.waitForURL((url) => url.pathname.startsWith('/hasil-cashless/'));
    await page.getByRole('heading', { name: /Resi dengan pengecualian/ }).waitFor();

    const auth = await context.request.post(api + '/api/mobile/v1/auth/tokens', { data: {
        email: 'audit-pickup_staff@example.test', password: 'password',
        device_id: '36993e4c-dbd0-4770-b962-55f20dc58149', device_name: 'Isolated Cashless Alerts QA',
    } });
    assert.equal(auth.status(), 201);
    const { data } = await auth.json();
    const feedResponse = await context.request.get(api + '/api/mobile/v1/notifications', { headers: { Authorization: `Bearer ${data.token}`, Accept: 'application/json' } });
    assert.equal(feedResponse.status(), 200);
    const feed = await feedResponse.json();
    const sample = feed.data.find((item) => item.batch_id === 1);
    assert(sample);
    let unread = true, rejectRead = true;
    await context.addInitScript((session) => { window.cashlessQaSession = session; }, {
        token: data.token, user: data.user, environment: api, expiresAt: data.expires_at, timezone: 'Asia/Jakarta', locked: false,
    });
    await context.route(front + '/cashless-qa*', (route) => route.fulfill({ contentType: 'text/html', body:
        '<html lang="id"><head><meta name="viewport" content="width=device-width, initial-scale=1"><script type="module">import RefreshRuntime from "/@react-refresh"; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="/@fs/S:/2026/dust/tests/Fixtures/mobile-cashless.tsx"></script></body></html>' }));
    await context.route(api + '/api/mobile/v1/**', async (route) => {
        const headers = { 'Access-Control-Allow-Origin': front, 'Access-Control-Allow-Headers': 'Accept,Authorization,Content-Type',
            'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS' };
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        if (['/api/mobile/v1/notifications', '/api/mobile/v1/notifications/read'].includes(new URL(route.request().url()).pathname)) {
            if (route.request().method() === 'PATCH') {
                if (rejectRead) return route.fulfill({ status: 500, headers, json: { message: 'QA read failed' } });
                unread = false;
                return route.fulfill({ status: 200, headers, json: { ok: true } });
            }
            const unreadOnly = new URL(route.request().url()).searchParams.get('unread_only') === '1';
            return route.fulfill({ status: 200, headers, json: { data: unreadOnly && !unread ? [] : [{ ...sample, read: !unread }], meta: { last_page: 1, unread_count: unread ? 1 : 0 } } });
        }
        const response = await route.fetch();
        return route.fulfill({ response, headers: { ...response.headers(), ...headers } });
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(front + '/cashless-qa?view=alerts');
    await page.getByRole('button', { name: /Cashless selesai dengan pengecualian/ }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const contrast = await page.locator('.notification-card').evaluate((node) => {
        const canvas = document.createElement('canvas'); const context = canvas.getContext('2d');
        const luminance = (color) => { context.fillStyle = color; context.fillRect(0, 0, 1, 1); const values = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map((v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return values[0] * .2126 + values[1] * .7152 + values[2] * .0722; };
        const bg = luminance(getComputedStyle(node).backgroundColor);
        return ['.notification-title', '.notification-message'].map((selector) => { const text = luminance(getComputedStyle(node.querySelector(selector)).color); return (Math.max(bg, text) + .05) / (Math.min(bg, text) + .05); });
    });
    assert(contrast.every((ratio) => ratio >= 4.5));
    await page.screenshot({ path: output + '/notifications-mobile.png' });
    await page.getByRole('button', { name: 'Tandai dibaca', exact: true }).click();
    await page.getByRole('alert').waitFor();
    // Failed read-state updates must never prevent opening the actual result.
    await page.getByRole('button', { name: /Cashless selesai dengan pengecualian/ }).click();
    await page.getByRole('heading', { name: /Resi dengan pengecualian/ }).waitFor();
    await page.getByRole('heading', { name: 'Hasil Cashless · Batch #1' }).waitFor();
    await page.screenshot({ path: output + '/mobile-detail.png' });
    await page.getByRole('button', { name: 'Kembali ke notifikasi', exact: true }).click();
    rejectRead = false;
    await page.getByRole('button', { name: 'Tandai dibaca', exact: true }).click();
    await page.getByText('Semua notifikasi sudah dibaca', { exact: true }).waitFor();
    await page.reload();
    await page.getByText('Semua notifikasi sudah dibaca', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Semua', exact: true }).click();
    await page.getByRole('button', { name: /Cashless selesai dengan pengecualian/ }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Tandai dibaca', exact: true }).count(), 0);
    await page.setViewportSize({ width: 320, height: 720 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: output + '/notifications-mobile-320.png' });
    const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const admin = await adminContext.newPage();
    admin.on('pageerror', (error) => errors.push(error.message));
    await admin.goto(api + '/login');
    await admin.locator('#email').fill('audit-admin_supervisor@example.test');
    await admin.locator('#password').fill('password');
    await admin.locator('button[type="submit"]').click();
    await admin.waitForURL((url) => !url.pathname.startsWith('/login'));
    const scanResponse = await adminContext.request.get(api + `/hasil-pickup/${sample.task_id}/quick?view=cashless`, { headers: { Accept: 'application/json' } });
    assert.equal(scanResponse.status(), 200);
    const scanned = await scanResponse.json();
    await admin.goto(api + '/hasil-pickup?monitoring=pickup&date_from=2026-10-01&date_to=2026-10-31&date_basis=pickup&scope=daily&q=' + encodeURIComponent(sample.reference));
    await admin.getByRole('button', { name: `Detail Cepat ${sample.reference}`, exact: true }).filter({ visible: true }).click();
    const drawer = admin.getByRole('dialog');
    await drawer.getByRole('button', { name: 'Resi scan', exact: true }).click();
    const scans = drawer.getByRole('region', { name: 'Resi scan cashless', exact: true });
    await scans.waitFor();
    assert.equal(await admin.getByRole('dialog').count(), 1, 'Scanned resi remain in the existing pickup drawer');
    if (scanned.awbs.total) {
        await scans.getByText(scanned.awbs.data[0].awb, { exact: true }).waitFor();
        assert.equal(await scans.getByRole('listitem').count(), scanned.awbs.data.length);
        for (const item of scanned.awbs.data) {
            assert(await scans.getByLabel(`Status ${item.awb}`, { exact: true }).innerText());
        }
    } else {
        await scans.getByText('Belum ada resi scan pada pickup ini.', { exact: true }).waitFor();
    }
    await drawer.evaluate(async (element) => { await Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => {}))); });
    await admin.screenshot({ path: output + '/monitoring-scan-awbs.png' });
    await admin.setViewportSize({ width: 390, height: 844 });
    assert(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await admin.screenshot({ path: output + '/monitoring-scan-awbs-mobile.png' });
    await drawer.getByRole('button', { name: 'Ringkasan', exact: true }).click();
    await drawer.getByRole('heading', { name: 'Kunjungan', exact: true }).waitFor();
    await drawer.getByRole('button', { name: 'Tutup', exact: true }).click();
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'passed', scope: 'Mobile notification contrast, read/dismiss recovery and immediate detail navigation; web scanned AWB dialog against isolated Laravel API', output }));
} finally {
    await browser.close();
}
