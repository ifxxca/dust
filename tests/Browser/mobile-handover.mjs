import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(path.resolve('workers/jne-report/package.json'));
const { chromium } = require('playwright');
const api = 'http://127.0.0.1:8019';
const front = 'http://127.0.0.1:5176';
const output = path.resolve('output/mobile-handover-20261106');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
let context;
let token;
try {
    context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        reducedMotion: 'reduce',
    });
    const login = await context.request.post(
        api + '/api/mobile/v1/auth/tokens',
        {
            data: {
                email: 'audit-pickup_staff@example.test',
                password: 'password',
                device_id: '4a275630-0f92-4ffc-857e-21b341f68bf6',
                device_name: 'Isolated Handover QA',
            },
        },
    );
    assert.equal(login.status(), 201);
    const account = (await login.json()).data;
    token = account.token;
    await context.addInitScript(
        (session) => {
            window.handoverQaSession = session;
        },
        {
            token,
            user: account.user,
            environment: api,
            expiresAt: account.expires_at,
            timezone: 'Asia/Jakarta',
            locked: false,
        },
    );
    await context.route(front + '/handover-qa', (route) =>
        route.fulfill({
            contentType: 'text/html',
            body: '<html lang="id"><head><meta name="viewport" content="width=device-width, initial-scale=1"><script type="module">import RefreshRuntime from "/@react-refresh"; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="/@fs/S:/2026/dust/tests/Fixtures/mobile-handover.tsx"></script></body></html>',
        }),
    );
    let loseVerificationReply = false;
    let verificationRequests = 0;
    await context.route(api + '/api/mobile/v1/**', async (route) => {
        if (route.request().method() === 'OPTIONS')
            return route.fulfill({
                status: 204,
                headers: {
                    'Access-Control-Allow-Origin': front,
                    'Access-Control-Allow-Headers':
                        'Accept,Authorization,Content-Type',
                    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
                },
            });
        const response = await route.fetch();
        if (
            route.request().method() === 'POST' &&
            route.request().url().endsWith('/verification')
        ) {
            verificationRequests++;
            if (loseVerificationReply) {
                loseVerificationReply = false;
                assert.equal(response.status(), 200);
                return route.abort('failed');
            }
        }
        await route.fulfill({
            response,
            headers: {
                ...response.headers(),
                'Access-Control-Allow-Origin': front,
            },
        });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(front + '/handover-qa');
    await page
        .getByRole('button', { name: 'Buat Handover', exact: true })
        .click();
    await page.locator('.handover-candidate input').nth(0).check();
    await page.locator('.handover-candidate input').nth(1).check();
    await page
        .getByRole('button', { name: 'Review Handover', exact: true })
        .click();
    const createdResponse = page.waitForResponse(
        (response) =>
            response.url() === api + '/api/mobile/v1/handovers' &&
            response.request().method() === 'POST',
    );
    await page
        .getByRole('button', { name: 'Buat Session Handover', exact: true })
        .click();
    const created = (await (await createdResponse).json()).data;
    assert.equal(created.can.verify, true);
    assert.equal(created.items.length, 2);
    await page
        .getByRole('button', { name: 'Mulai Verifikasi Paket', exact: true })
        .click();
    const fields = ['manual_hybrid', 'cashless_hybrid', 'css_orion'];
    for (const field of fields)
        await page
            .locator('#verify-' + field)
            .fill(String(created.items[0].pickup[field]));
    await page
        .getByRole('button', { name: 'Simpan Verifikasi', exact: true })
        .click();
    await page
        .getByRole('button', { name: 'Lanjutkan Verifikasi', exact: true })
        .waitFor();
    assert.equal(
        await page
            .locator('form[aria-label="Verifikasi Pickup Handover"]')
            .count(),
        0,
        'successful verification leaves its form',
    );
    await page.screenshot({
        path: path.join(output, 'next-pickup.png'),
        fullPage: true,
    });
    await page
        .getByRole('button', { name: 'Lanjutkan Verifikasi', exact: true })
        .click();
    for (const field of fields)
        await page
            .locator('#verify-' + field)
            .fill(
                String(
                    created.items[1].pickup[field] +
                        (field === 'manual_hybrid' ? 1 : 0),
                ),
            );
    await page
        .getByRole('button', { name: 'Simpan Verifikasi', exact: true })
        .click();
    await page.locator('#error-discrepancy').waitFor();
    assert.equal(
        verificationRequests,
        1,
        'missing discrepancy reason blocks submission',
    );
    await page
        .locator('#verify-discrepancy')
        .fill('Hitung fisik fixture: satu paket manual lebih.');
    loseVerificationReply = true;
    await page
        .getByRole('button', { name: 'Simpan Verifikasi', exact: true })
        .click();
    await page
        .getByRole('button', { name: 'Periksa Hasil Handover', exact: true })
        .waitFor();
    await page.reload();
    await page
        .getByRole('button', { name: 'Periksa Hasil Handover', exact: true })
        .click();
    await page
        .getByRole('button', { name: 'Tutup Session Handover', exact: true })
        .waitFor();
    assert.equal(
        verificationRequests,
        2,
        'lost response recovery reads result without duplicate mutation',
    );
    await page
        .getByRole('button', { name: 'Tutup Session Handover', exact: true })
        .click();
    await page
        .getByRole('button', { name: 'Ya, Tutup Session', exact: true })
        .click();
    await page
        .getByRole('heading', { name: 'Session berhasil ditutup', exact: true })
        .waitFor();
    const result = await context.request.get(
        api + '/api/mobile/v1/handovers/' + created.id,
        { headers: { Authorization: `Bearer ${token}` } },
    );
    const closed = (await result.json()).data;
    assert.equal(closed.status, 'CLOSED');
    assert.equal(closed.closed_by, account.user.id);
    assert.equal(closed.items[0].status, 'VERIFIED');
    assert.equal(closed.items[1].status, 'DISCREPANCY');
    assert.equal(
        closed.events.filter((event) => event.action === 'item_verified')
            .length,
        2,
    );
    for (const width of [390, 375]) {
        await page.setViewportSize({ width, height: 844 });
        assert(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
            ),
        );
        await page.screenshot({
            path: path.join(output, `closed-${width}.png`),
            fullPage: true,
        });
    }
    assert.deepEqual(errors, []);
    console.log(
        JSON.stringify({
            result: 'passed',
            role: account.user.role,
            session: created.id,
            checks: [
                'create to direct verification',
                'continue next pickup',
                'mandatory discrepancy reason',
                'lost response recovery after reload',
                'closure and audit actor',
                '390/375 layout',
            ],
            verificationRequests,
        }),
    );
} finally {
    if (context && token)
        await context.request
            .delete(api + '/api/mobile/v1/auth/token', {
                headers: { Authorization: `Bearer ${token}` },
            })
            .catch(() => {});
    await browser.close();
}
