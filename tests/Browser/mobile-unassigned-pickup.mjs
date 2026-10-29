import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(path.resolve('workers/jne-report/package.json'));
const { chromium } = require('playwright');
const front = 'http://127.0.0.1:5174', api = 'http://127.0.0.1:8019';
const output = path.resolve('output/unassigned-pickup-20261029');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    let task = { id: 71, reference: 'ADMIN-UNASSIGNED', customer: { id: 1, name: 'Customer Admin' }, pickup_address: 'Alamat pickup', scheduled_at: '2026-10-29T03:00:00Z',
        pickup_type: 'on_demand', status: 'SCHEDULED', version: 1, assigned_staff: null, can: { take_over: true, execute: false } };
    await context.addInitScript(({ task, api }) => {
        window.cashlessQaSession = { token: 'qa-claim-only', user: { id: 7, name: 'Staff QA', role: 'pickup_staff', is_active: true }, environment: api, expiresAt: '2099-01-01', timezone: 'Asia/Jakarta', locked: false };
        window.cashlessQaTask = task;
    }, { task, api });
    await context.route(front + '/cashless-qa*', (route) => route.fulfill({ contentType: 'text/html', body: '<html lang="id"><head><meta name="viewport" content="width=device-width, initial-scale=1"><script type="module">import RefreshRuntime from "/@react-refresh"; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="/@fs/S:/2026/dust/tests/Fixtures/mobile-cashless.tsx"></script></body></html>' }));
    let claims = 0;
    await context.route(api + '/api/mobile/v1/**', async (route) => {
        const headers = { 'Access-Control-Allow-Origin': front, 'Access-Control-Allow-Headers': 'Accept,Authorization,Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        if (route.request().method() === 'POST') {
            assert(new URL(route.request().url()).pathname.endsWith('/71/takeover'));
            assert.deepEqual(route.request().postDataJSON(), { expected_version: 1, expected_assigned_staff_id: null, reason: null });
            claims++;
            task = { ...task, status: 'ASSIGNED', version: 2, assigned_staff: { id: 7, name: 'Staff QA' }, execution_started_at: null, can: { take_over: false, execute: true }, visits: [], events: [{ action: 'assigned', actor_id: 7, task_version: 2 }] };
        }
        return route.fulfill({ status: 200, headers, json: { data: task } });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(front + '/cashless-qa?view=execution');
    await page.getByRole('button', { name: 'Ambil Tugas', exact: true }).click();
    await page.getByRole('button', { name: 'Konfirmasi Operasi', exact: true }).click();
    await page.getByText('Tugas berhasil diambil.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Mulai Pickup', exact: true }).waitFor();
    assert.equal(claims, 1);
    assert.equal(await page.getByRole('button', { name: 'Ambil Tugas', exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.endsWith(':task-71-operation')).length), 0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    await page.screenshot({ path: output + '/claimed-mobile.png' });
    console.log(JSON.stringify({ result: 'passed', scope: 'Unassigned mobile claim sends explicit null owner, confirms assignment audit and clears recovery without starting a visit', output }));
} finally { await browser.close(); }
