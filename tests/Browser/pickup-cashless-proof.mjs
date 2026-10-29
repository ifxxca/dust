import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(path.resolve('workers/jne-report/package.json'));
const { chromium } = require('playwright');
const front = 'http://127.0.0.1:5174', api = 'http://127.0.0.1:8019';
const output = path.resolve('output/pickup-review-notifications-20261028');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
let page;
try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await context.addInitScript(({ api }) => {
        window.scanBeeps = 0;
        const NativeAudio = window.AudioContext;
        window.AudioContext = class extends NativeAudio {
            createOscillator() { window.scanBeeps++; return super.createOscillator(); }
        };
        window.cashlessCameraQa = true;
        window.cashlessQaSession = { token: 'qa-ui-only', user: { id: 7, name: 'Staff QA', role: 'pickup_staff', is_active: true }, environment: api, expiresAt: '2099-01-01', timezone: 'Asia/Jakarta', locked: false };
        window.cashlessQaTask = { id: 71, reference: 'QA-POP-CASHLESS', customer: { id: 1, name: 'Customer QA' }, pickup_address: 'QA', status: 'ASSIGNED', version: 3, pickup_type: 'on_demand', scheduled_at: '2026-10-28T01:00:00Z', execution_started_at: '2026-10-28T01:00:00Z', assigned_staff: { id: 7, name: 'Staff QA' }, can: { execute: true, take_over: false }, cashless_awbs: [], visits: [{ id: 7, staff_id: 7, outcome: 'COLLECTED', reason: null, notes: null }] };
    }, { api });
    await context.route(front + '/cashless-qa*', (route) => route.fulfill({ contentType: 'text/html', body:
        '<html lang="id"><head><meta name="viewport" content="width=device-width, initial-scale=1"><script type="module">import RefreshRuntime from "/@react-refresh"; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="/@fs/S:/2026/dust/tests/Fixtures/mobile-cashless.tsx"></script></body></html>' }));
    let externalWork = 0;
    await context.route(api + '/api/mobile/v1/**', (route) => { externalWork++; return route.abort(); });
    page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(front + '/cashless-qa?view=proof');
    await page.getByRole('button', { name: 'Scan / catat resi' }).click();
    const input = page.getByLabel('Scan atau ketik nomor resi cashless');
    for (const viewport of [{ width: 320, height: 360 }, { width: 390, height: 400 }, { width: 565, height: 650 }]) {
        await page.setViewportSize(viewport);
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const rect = await page.getByRole('dialog').boundingBox();
        assert(rect.x >= 0 && rect.x + rect.width <= viewport.width, 'Dialog stays inside viewport horizontally');
        assert(rect.y >= 0 && rect.y + rect.height <= viewport.height, 'Dialog fits the remaining keyboard viewport: ' + JSON.stringify({ rect, viewport, styles: await page.getByRole('dialog').evaluate((node) => { const s = getComputedStyle(node); return { maxHeight: s.maxHeight, minHeight: s.minHeight, height: s.height, variable: s.getPropertyValue('--mobile-viewport-height') }; }) }));
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await input.fill(' tgpop1 '); await input.press('Enter');
    await page.getByText('TGPOP1 ditambahkan.', { exact: true }).waitFor();
    await input.fill('TGPOP1'); await input.press('Enter');
    await page.getByText(/TGPOP1 sudah ada/).waitFor();
    assert.equal(await page.evaluate(() => window.scanBeeps), 2, 'Duplicate input produces the two-tone error sound');
    await input.fill('016660047446626'); await input.press('Enter');
    await page.getByText('Resi ini termasuk Manual. Gunakan resi Cashless.').waitFor();
    await input.fill('CMPOP2'); await page.getByRole('button', { name: 'Tambah', exact: true }).click();
    await page.getByText('CMPOP2 ditambahkan.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Hapus TGPOP1' }).click();
    await page.getByRole('button', { name: 'Scan dengan kamera' }).click();
    const camera = page.getByRole('dialog', { name: 'Scan resi Cashless' });
    await camera.getByRole('button', { name: 'Selesai scan', exact: true }).waitFor();
    await page.evaluate(() => window.cashlessCamera.emit(['TGPOP3', 'TGPOP3', 'CMPOP4']));
    await camera.getByText('3 resi dalam draft', { exact: true }).waitFor();
    await camera.getByRole('button', { name: 'Selesai scan', exact: true }).click();
    await page.getByLabel('3 resi cashless', { exact: true }).waitFor();
    assert.equal(await page.getByRole('radio', { name: 'PM', exact: true }).count(), 0);
    assert.equal(await page.getByRole('radio', { name: 'Puman', exact: true }).count(), 0);
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Scan / catat resi' }).click();
    await input.fill('TGPOP5'); await input.press('Enter');
    await page.getByText('TGPOP5 ditambahkan.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Selesai mencatat' }).click();
    await context.setOffline(false);
    await page.reload();
    await page.getByLabel('4 resi cashless', { exact: true }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: output + '/mobile-pop.png' });
    await page.getByRole('button', { name: 'Scan / catat resi' }).click();
    assert.equal(await page.getByRole('list', { name: 'Daftar resi cashless' }).getByRole('listitem').count(), 4);
    await page.screenshot({ path: output + '/mobile-awbs.png' });
    await page.getByRole('button', { name: 'Selesai mencatat' }).click();
    await page.evaluate(() => { window.cashlessStorageQa.delay = 500; window.cashlessStorageQa.writes = 0; });
    await page.getByRole('button', { name: 'Tambah Manual Hybrid Non-Cashless', exact: true }).evaluate(async (button) => {
        for (let i = 0; i < 10; i++) { button.click(); await new Promise(requestAnimationFrame); }
    });
    assert.equal(await page.getByLabel('Manual Hybrid Non-Cashless', { exact: true }).inputValue(), '10');
    assert.equal(await page.getByRole('button', { name: 'Simpan Ulang Draft' }).count(), 0);
    await page.getByText('Tersimpan di perangkat', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.cashlessStorageQa.writes), 1, 'A burst of ten changes creates one durable draft write');
    await page.getByRole('button', { name: /Tanda tangan Wajib/i }).click();
    const canvas = page.getByLabel('Area tanda tangan customer');
    await canvas.scrollIntoViewIfNeeded();
    assert.equal(await canvas.evaluate((node) => getComputedStyle(node).touchAction), 'none', 'Touch drawing must not be taken over by page scrolling');
    const draw = async (x) => {
        const rect = await canvas.boundingBox();
        await page.mouse.move(rect.x + x, rect.y + 40);
        await page.mouse.down();
        await page.mouse.move(rect.x + x + 30, rect.y + 80, { steps: 5 });
        await page.mouse.up();
    };
    await page.getByText('Tersimpan di perangkat', { exact: true }).waitFor();
    await page.evaluate(() => { window.cashlessStorageQa.writes = 0; });
    const touch = await context.newCDPSession(page);
    const rect = await canvas.boundingBox();
    await canvas.evaluate((node) => {
        window.signatureEvents = { down: 0, up: 0, cancel: 0, move: 0 };
        for (const [event, key] of [['pointerdown', 'down'], ['pointerup', 'up'], ['pointercancel', 'cancel'], ['pointermove', 'move']]) node.addEventListener(event, () => window.signatureEvents[key]++);
    });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rect.x + 15, y: rect.y + 70 }] });
    await page.waitForTimeout(600);
    for (let index = 0; index <= 100; index++) {
        await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: rect.x + 15 + (rect.width - 30) * index / 100, y: rect.y + 70 + Math.sin(index / 8) * 30 }] });
        await page.waitForTimeout(8);
    }
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.equal(await page.evaluate(() => window.signatureEvents.cancel), 0, 'A held continuous touch must reach pointerup without cancellation');
    assert.equal(await page.evaluate(() => window.signatureEvents.up), 1);
    assert((await page.evaluate(() => window.signatureEvents.move)) > 70);
    await draw(100);
    await draw(180);
    const review = page.getByRole('button', { name: 'Review POP', exact: true });
    await review.waitFor();
    await page.waitForTimeout(700);
    assert.equal(await page.evaluate(() => window.cashlessStorageQa.signatures), 0, 'Drawing does not persist a signature');
    assert.equal(await page.evaluate(() => window.cashlessStorageQa.writes), 0, 'Drawing performs no draft writes');
    const ink = await canvas.evaluate((surface) => {
        const context = surface.getContext('2d');
        return [20, 100, 180].map((x) => {
            const start = Math.floor(x * 600 / surface.getBoundingClientRect().width);
            const data = context.getImageData(start, 0, 65, 220).data;
            return data.some((value, index) => index % 4 === 3 && value > 14);
        });
    });
    assert.deepEqual(ink, [true, true, true], 'All strokes survive drawing during a slow save');
    await page.getByLabel('Catatan pickup (opsional)').fill('Jumlah dan tanda tangan tetap utuh');
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await page.waitForFunction(() => Object.values(localStorage).some((value) => { try { return JSON.parse(value).notes === 'Jumlah dan tanda tangan tetap utuh'; } catch { return false; } }));
    assert.equal(await page.evaluate(() => window.cashlessStorageQa.signatures), 0, 'Background draft flush does not save the signature before Review');
    await page.evaluate(() => { window.cashlessStorageQa.failWrites = true; });
    await review.click();
    await page.getByText('Tanda tangan belum dapat disimpan. Goresan tetap tersedia; tekan Review POP untuk mencoba lagi.', { exact: true }).waitFor();
    assert.equal(await page.getByText('Ringkasan POP', { exact: true }).count(), 0, 'Failed persistence keeps the user on the drawing step');
    await page.evaluate(() => { window.cashlessStorageQa.failWrites = false; });
    await review.click();
    await page.getByText('Ringkasan POP', { exact: true }).waitFor();
    await page.getByText('Tersimpan di perangkat', { exact: true }).waitFor();
    assert.equal(await page.getByText('QA storage unavailable', { exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => window.cashlessStorageQa.signatures), 2, 'Only explicit Review attempts write signature evidence');
    await page.getByRole('button', { name: 'Ubah Bukti', exact: true }).click();
    await page.getByText('Tersimpan di perangkat', { exact: true }).waitFor();
    await page.screenshot({ path: output + '/mobile-signature.png' });
    await page.reload();
    await page.getByLabel('Catatan pickup (opsional)').waitFor();
    assert.equal(await page.getByLabel('Catatan pickup (opsional)').inputValue(), 'Jumlah dan tanda tangan tetap utuh');
    await page.waitForFunction(() => {
        const button = [...document.querySelectorAll('button')].find((node) => node.textContent.trim() === 'Review POP');
        return button && !button.disabled;
    });
    assert.deepEqual(await canvas.evaluate((surface) => {
        const context = surface.getContext('2d');
        return [20, 100, 180].map((x) => {
            const start = Math.floor(x * 600 / surface.getBoundingClientRect().width);
            return context.getImageData(start, 0, 65, 220).data.some((value, index) => index % 4 === 3 && value > 14);
        });
    }), [true, true, true], 'Reload restores every stroke from the persisted signature');
    await page.getByRole('button', { name: /Jumlah Wajib/ }).click();
    assert.equal(await page.getByLabel('Manual Hybrid Non-Cashless', { exact: true }).inputValue(), '10');
    assert.equal(await page.getByLabel('4 resi cashless', { exact: true }).count(), 1);
    await page.evaluate(() => { window.cashlessStorageQa.delay = 300; });
    await page.getByRole('button', { name: /Tanda tangan Sudah diisi/i }).click();
    await draw(240);
    await page.waitForTimeout(700);
    assert.equal(await page.evaluate(() => window.cashlessStorageQa.signatures), 0, 'An edited signature is not saved until Review');
    await page.getByText('Kelola draft', { exact: true }).click();
    await page.getByRole('button', { name: 'Buang Draft', exact: true }).click();
    await page.getByRole('button', { name: 'Konfirmasi Buang Draft', exact: true }).click();
    await page.getByRole('button', { name: 'Buat Draft POP', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.endsWith(':pop-71') || key.includes(':evidence-')).length), 0, 'Discard drains pending writes without resurrecting the draft');
    await page.getByRole('button', { name: 'Buat Draft POP', exact: true }).click();
    await page.getByLabel('0 resi cashless', { exact: true }).waitFor();
    assert.equal(externalWork, 0);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'passed', scope: 'Held continuous touch, no signature writes until Review, failed Review recovery, signature reload, responsive dialog, coalesced quantity writes, offline scan and discard; no API work before final POP', output }));
} catch (error) {
    if (page) await page.screenshot({ path: output + '/failure.png' });
    throw error;
} finally { await browser.close(); }
