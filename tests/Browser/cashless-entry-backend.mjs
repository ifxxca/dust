import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { HybridClient } from '../../workers/jne-report/src/hybrid.mjs';
import {
    CashlessEntryApi,
    HybridCashlessPage,
    processCashlessBatch,
} from '../../workers/jne-report/src/cashless-entry.mjs';
const require = createRequire(path.resolve('workers/jne-report/package.json'));
const { chromium } = require('playwright');
const apiBase = 'http://127.0.0.1:8019',
    hybridBase = 'http://127.0.0.1:4919';
const output = path.resolve('output/cashless-entry-20261028');
await mkdir(output, { recursive: true });
const directory = await mkdtemp(path.join(os.tmpdir(), 'cashless-backend-'));
const browser = await chromium.launch({ headless: true });
const client = new HybridClient(
    {
        name: 'roberto',
        loginUrl: hybridBase + '/apex/f?p=113:LOGIN_DESKTOP::::::',
        username: 'fixture',
        password: 'fixture',
    },
    {
        outputDir: directory,
        navigationTimeout: 3000,
        downloadTimeout: 3000,
        clock: () => new Date('2026-10-28T08:00:00Z'),
    },
);
let page;
try {
    await client.start();
    await client.context.setExtraHTTPHeaders({ 'x-mock-slug': 'hybrid' });
    await fetch(hybridBase + '/fixture/reset', {
        method: 'POST',
        headers: { 'x-mock-slug': 'hybrid' },
        body: '{}',
    });
    page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
        colorScheme: 'light',
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(apiBase + '/login');
    await page.locator('#email').fill('audit-pickup_staff@example.test');
    await page.locator('#password').fill('password');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
    await page.goto(apiBase + '/handover-cashless?q=AUD-PICKUP-0033');
    await page.getByRole('button', { name: /AUD-PICKUP-0033/ }).click();
    const api = new CashlessEntryApi({
        apiUrl: apiBase,
        token: 'cashless-fixture-token-01234567890123456789',
        workerId: 'hybrid-roberto',
        apiTimeout: 3000,
    });
    const results = [];
    for (const [index, awbs] of [
        ['SLOWOK', 'DUPOK', 'MISSINGOK', 'DATAOK'],
        ['TGSECOND'],
    ].entries()) {
        await page.getByRole('radio', { name: 'PM', exact: true }).click();
        for (const awb of awbs) {
            await page.getByLabel('Scan atau ketik nomor resi').fill(awb);
            await page.getByLabel('Scan atau ketik nomor resi').press('Enter');
        }
        await page
            .getByRole('button', {
                name: 'Simpan Handover Cashless',
                exact: true,
            })
            .click();
        await page
            .getByRole('button', {
                name: 'Segarkan status proses',
                exact: true,
            })
            .waitFor();
        await page
            .getByText('Resi tersimpan (' + (index === 0 ? 4 : 5) + ')', {
                exact: true,
            })
            .waitFor();
        const batch = await api.claim(randomUUID());
        assert(batch);
        assert.deepEqual(
            batch.items.map((item) => item.awb),
            awbs,
        );
        const result = await client.exclusive(() =>
            processCashlessBatch(batch, api, new HybridCashlessPage(client)),
        );
        assert.equal(result.status, index === 0 ? 'PARTIAL' : 'DONE');
        results.push(result);
        await page
            .getByRole('button', {
                name: 'Segarkan status proses',
                exact: true,
            })
            .click();
        await page
            .getByText(
                index === 0 ? 'Selesai dengan pengecualian' : 'Selesai',
                { exact: true },
            )
            .waitFor();
    }
    const state = await (
        await fetch(hybridBase + '/fixture/state', {
            headers: { 'x-mock-slug': 'hybrid' },
        })
    ).json();
    assert.equal(state.news, 2);
    assert.deepEqual(state.approvals, ['HO-015-TEST-1', 'HO-015-TEST-2']);
    await page
        .locator('details')
        .filter({ hasText: 'Batch #1' })
        .locator('summary')
        .click();
    await page.screenshot({ path: output + '/desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
        ),
    );
    await page.screenshot({ path: output + '/mobile.png', fullPage: true });
    assert.deepEqual(errors, []);
    console.log(
        JSON.stringify({
            result: 'passed',
            scope: 'Real capture UI + Laravel HTTP + SQLite + real browser worker through Postman Hybrid simulation',
            batchResults: results.map((result) => result.status),
            hos: state.approvals,
            output,
        }),
    );
} catch (error) {
    if (page)
        await page.screenshot({
            path: output + '/failure.png',
            fullPage: true,
        });
    throw error;
} finally {
    await client.close();
    await browser.close();
    await rm(directory, { recursive: true, force: true });
}
