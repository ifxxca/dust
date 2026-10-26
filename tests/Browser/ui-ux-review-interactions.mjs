import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(path.resolve('workers/jne-report/package.json'));
const { chromium } = require('playwright');
const base = process.env.UI_UX_BASE_URL;
assert(base && ['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const phase = process.env.UI_UX_PHASE ?? 'before';
const root = 'docs/ui-ux-review/evidence';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: 'light', locale: 'id-ID' });
await context.addInitScript(() => localStorage.setItem('appearance', 'light'));
const page = await context.newPage();
const results = [];
async function visit(route) {
    await page.goto(base + route);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
}
async function save(key, detail = {}) {
    await page.waitForLoadState('networkidle');
    const state = await page.evaluate(() => ({
        active: document.activeElement?.id,
        errors: [...document.querySelectorAll('[role=alert],.text-destructive')].filter((e) => e.getClientRects().length && e.textContent.trim()).map((e) => e.textContent.trim()),
        invalid: [...document.querySelectorAll('[aria-invalid=true]')].map((e) => ({ id: e.id, described: !!document.getElementById(e.getAttribute('aria-describedby'))?.textContent.trim() })),
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
    }));
    const screenshot = `${phase}/${key}-interaction-390.png`;
    await page.screenshot({ path: path.join(root, screenshot), animations: 'disabled' });
    results.push({ key, screenshot, viewport: [390, 844], role: key.startsWith('forgot') || key.startsWith('reset') ? 'guest' : 'admin_supervisor', ...state, ...detail });
    await fs.writeFile(path.join(root, `${phase}-interactions.json`), JSON.stringify(results, null, 2));
    console.log(key, JSON.stringify(state));
    return state;
}
async function submit(button) {
    // Bypass native constraint validation only to exercise server error recovery.
    await button.evaluate((e) => e.closest('form').noValidate = true);
    const response = page.waitForResponse((r) => !['GET', 'HEAD'].includes(r.request().method()) && !r.url().includes('_boost'));
    await button.click();
    const status = (await response).status();
    await page.waitForLoadState('networkidle');
    return status;
}
function invalidAfter(state, id) {
    if (phase !== 'after') return;
    assert(state.invalid.some((e) => e.id === id && e.described), `${id}: associated invalid field`);
    assert.equal(state.active, id, 'Focus moves to first invalid control');
}
try {
    await visit('/forgot-password');
    await page.locator('#email').fill('invalid-email');
    const forgotStatus = await submit(page.getByRole('button', { name: 'Kirim tautan atur ulang', exact: true }));
    invalidAfter(await save('forgot-validation', { responseStatus: forgotStatus, nativeValidationBypassed: true }), 'email');

    await visit('/reset-password/audit-invalid?email=audit-admin_supervisor%40example.test');
    await page.locator('#password').fill('StrongPasswordForAudit!2026');
    await page.locator('#password_confirmation').fill('StrongPasswordForAudit!2026');
    const resetStatus = await submit(page.getByRole('button', { name: 'Atur ulang kata sandi', exact: true }));
    invalidAfter(await save('reset-validation', { responseStatus: resetStatus, token: 'invalid fixture token' }), 'email');
    if (phase === 'after') assert(await page.getByRole('link', { name: 'Minta tautan baru', exact: true }).isVisible());

    await visit('/login');
    await page.locator('#email').fill('audit-admin_supervisor@example.test');
    await page.locator('#password').fill('password');
    await page.getByRole('button', { name: 'Masuk ke workspace', exact: true }).click();
    await page.waitForURL((url) => url.pathname !== '/login');

    await visit('/user/confirm-password');
    await page.locator('#password').fill('wrong-password');
    const confirmStatus = await submit(page.getByRole('button', { name: 'Konfirmasi kata sandi', exact: true }));
    invalidAfter(await save('confirm-validation', { responseStatus: confirmStatus }), 'password');
    await page.locator('#password').fill('password');
    await page.getByRole('button', { name: 'Konfirmasi kata sandi', exact: true }).click();
    await page.waitForURL((url) => url.pathname !== '/user/confirm-password');

    await visit('/settings/profile');
    await page.locator('#name').fill('');
    const profileStatus = await submit(page.getByRole('button', { name: /^Simpan/ }).first());
    invalidAfter(await save('profile-validation', { responseStatus: profileStatus, nativeValidationBypassed: true }), 'name');

    await visit('/settings/security');
    await page.locator('#current_password').fill('wrong-password');
    await page.locator('#password').fill('StrongPasswordForAudit!2026');
    await page.locator('#password_confirmation').fill('StrongPasswordForAudit!2026');
    const securityStatus = await submit(page.getByRole('button', { name: /^Simpan/ }).first());
    invalidAfter(await save('security-validation', { responseStatus: securityStatus }), 'current_password');

    await visit('/operations/create');
    await page.getByRole('button', { name: /Buat Pickup|Simpan Pickup/, exact: true }).last().click();
    invalidAfter(await save('create-validation'), 'pickup-customer');

    await visit('/pickup-schedules');
    await page.getByRole('button', { name: 'Tambah Jadwal', exact: true }).click();
    await page.locator('#schedule-address').fill('Draft jadwal audit');
    const scheduleStatus = await submit(page.getByRole('button', { name: 'Simpan Jadwal', exact: true }));
    const scheduleState = await save('schedule-validation', { responseStatus: scheduleStatus, nativeValidationBypassed: true });
    invalidAfter(scheduleState, 'schedule-customer');
    if (phase === 'after') {
        const dismissal = page.waitForEvent('dialog');
        const escape = page.keyboard.press('Escape');
        await (await dismissal).dismiss();
        await escape;
        assert.equal(await page.locator('#schedule-address').inputValue(), 'Draft jadwal audit');
        const discard = page.waitForEvent('dialog');
        const close = page.keyboard.press('Escape');
        await (await discard).accept();
        await close;
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
    }

    await visit('/admin/jne-monitoring/evidence-rules');
    await page.getByRole('button', { name: 'Tambah aturan', exact: true }).click();
    const sheet = page.getByRole('dialog');
    const close = sheet.getByRole('button', { name: 'Tutup', exact: true });
    const box = await close.boundingBox();
    const tabs = [];
    for (let i = 0; i < 18; i++) {
        await page.keyboard.press('Tab');
        tabs.push(await page.evaluate(() => !!document.activeElement.closest('[role=dialog]')));
    }
    await save('sheet-keyboard', { closeTarget: box, focusStayedInside: tabs.every(Boolean) });
    if (phase === 'after') {
        assert(box.width >= 44 && box.height >= 44, '44px close target');
        assert(tabs.every(Boolean), 'Sheet traps keyboard focus');
    }
    await page.keyboard.press('Escape');
    await sheet.waitFor({ state: 'hidden' });
    assert(await page.getByRole('button', { name: 'Tambah aturan', exact: true }).evaluate((e) => e === document.activeElement));
} finally {
    await browser.close();
}
console.log(`Recorded ${results.length} ${phase} interaction states; no successful business writes requested.`);
