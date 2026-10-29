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
const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    colorScheme: 'light',
    locale: 'id-ID',
});
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
    if (key.endsWith('validation')) {
        await page
            .locator(
                'form [role="alert"]:visible, form .text-red-600:visible, form .text-destructive:visible',
            )
            .first()
            .waitFor();
        await page.evaluate(
            () =>
                new Promise((resolve) =>
                    requestAnimationFrame(() => requestAnimationFrame(resolve)),
                ),
        );
    }
    const state = await page.evaluate(() => ({
        active: document.activeElement?.id,
        errors: [
            ...document.querySelectorAll(
                '[role=alert],.text-destructive,.text-red-600',
            ),
        ]
            .filter((e) => e.getClientRects().length && e.textContent.trim())
            .map((e) => e.textContent.trim()),
        invalid: [...document.querySelectorAll('[aria-invalid=true]')].map(
            (e) => ({
                id: e.id,
                described: !!document
                    .getElementById(e.getAttribute('aria-describedby'))
                    ?.textContent.trim(),
            }),
        ),
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
    }));
    const screenshot = `${phase}/${key}-interaction-390.png`;
    await page.screenshot({
        path: path.join(root, screenshot),
        animations: 'disabled',
    });
    results.push({
        key,
        screenshot,
        viewport: [390, 844],
        role:
            key.startsWith('forgot') || key.startsWith('reset')
                ? 'guest'
                : 'admin_supervisor',
        ...state,
        ...detail,
    });
    await fs.writeFile(
        path.join(root, `${phase}-interactions.json`),
        JSON.stringify(results, null, 2),
    );
    console.log(key, JSON.stringify(state));
    return state;
}
async function submit(button) {
    // Bypass native constraint validation only to exercise server error recovery.
    await button.evaluate((e) => (e.closest('form').noValidate = true));
    const response = page.waitForResponse(
        (r) =>
            !['GET', 'HEAD'].includes(r.request().method()) &&
            !r.url().includes('_boost'),
    );
    await button.click();
    const status = (await response).status();
    await page.waitForLoadState('networkidle');
    return status;
}
function invalidAfter(state, id) {
    if (phase !== 'after') return;
    assert(
        state.invalid.some((e) => e.id === id && e.described),
        `${id}: associated invalid field`,
    );
    assert.equal(state.active, id, 'Focus moves to first invalid control');
}
try {
    await visit('/forgot-password');
    await page.locator('#email').fill('invalid-email');
    const forgotStatus = await submit(
        page.getByRole('button', {
            name: 'Kirim tautan atur ulang',
            exact: true,
        }),
    );
    invalidAfter(
        await save('forgot-validation', {
            responseStatus: forgotStatus,
            nativeValidationBypassed: true,
        }),
        'email',
    );

    await visit(
        '/reset-password/audit-invalid?email=audit-admin_supervisor%40example.test',
    );
    await page.locator('#password').fill('StrongPasswordForAudit!2026');
    await page
        .locator('#password_confirmation')
        .fill('StrongPasswordForAudit!2026');
    const resetStatus = await submit(
        page.getByRole('button', {
            name: 'Atur ulang kata sandi',
            exact: true,
        }),
    );
    invalidAfter(
        await save('reset-validation', {
            responseStatus: resetStatus,
            token: 'invalid fixture token',
        }),
        'email',
    );
    if (phase === 'after')
        assert(
            await page
                .getByRole('link', { name: 'Minta tautan baru', exact: true })
                .isVisible(),
        );

    await visit('/login');
    await page.locator('#email').fill('audit-admin_supervisor@example.test');
    await page.locator('#password').fill('password');
    await page
        .getByRole('button', { name: 'Masuk ke workspace', exact: true })
        .click();
    await page.waitForURL((url) => url.pathname !== '/login');

    await visit('/user/confirm-password');
    await page.locator('#password').fill('wrong-password');
    const confirmStatus = await submit(
        page.getByRole('button', {
            name: 'Konfirmasi kata sandi',
            exact: true,
        }),
    );
    invalidAfter(
        await save('confirm-validation', { responseStatus: confirmStatus }),
        'password',
    );
    await page.locator('#password').fill('password');
    await page
        .getByRole('button', { name: 'Konfirmasi kata sandi', exact: true })
        .click();
    await page.waitForURL((url) => url.pathname !== '/user/confirm-password');

    await visit('/settings/profile');
    await page.locator('#name').fill('');
    const profileStatus = await submit(
        page.getByRole('button', { name: /^Simpan/ }).first(),
    );
    invalidAfter(
        await save('profile-validation', {
            responseStatus: profileStatus,
            nativeValidationBypassed: true,
        }),
        'name',
    );

    await visit('/settings/security');
    await page.locator('#current_password').fill('wrong-password');
    await page.locator('#password').fill('StrongPasswordForAudit!2026');
    await page
        .locator('#password_confirmation')
        .fill('StrongPasswordForAudit!2026');
    const securityStatus = await submit(
        page.getByRole('button', { name: /^Simpan/ }).first(),
    );
    invalidAfter(
        await save('security-validation', { responseStatus: securityStatus }),
        'current_password',
    );

    await visit('/operations/create');
    await page.locator('#pickup-address').fill('Alamat fixture untuk validasi');
    await page.locator('#pickup-scheduled').fill('2026-10-26T14:00');
    await page
        .getByRole('button', { name: /Buat Pickup|Simpan Pickup/, exact: true })
        .last()
        .click();
    invalidAfter(await save('create-validation'), 'pickup-customer');

    await visit('/pickup-schedules');
    await page
        .getByRole('button', { name: 'Tambah Jadwal', exact: true })
        .click();
    await page.locator('#schedule-address').fill('Draft jadwal audit');
    const scheduleStatus = await submit(
        page.getByRole('button', { name: 'Simpan Jadwal', exact: true }),
    );
    const scheduleCloseTarget = await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Tutup', exact: true })
        .boundingBox();
    const scheduleState = await save('schedule-validation', {
        responseStatus: scheduleStatus,
        nativeValidationBypassed: true,
        closeTarget: scheduleCloseTarget,
    });
    invalidAfter(scheduleState, 'schedule-customer');
    if (phase === 'after') {
        assert(
            scheduleCloseTarget.width >= 44 && scheduleCloseTarget.height >= 44,
            'Dialog close target',
        );
        const dismissal = page.waitForEvent('dialog');
        const escape = page.keyboard.press('Escape');
        await (await dismissal).dismiss();
        await escape;
        assert.equal(
            await page.locator('#schedule-address').inputValue(),
            'Draft jadwal audit',
        );
        const discard = page.waitForEvent('dialog');
        const close = page.keyboard.press('Escape');
        await (await discard).accept();
        await close;
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
    }

    await visit('/admin/jne-monitoring/evidence-rules');
    await page
        .getByRole('button', { name: 'Tambah aturan', exact: true })
        .click();
    const sheet = page.getByRole('dialog');
    const close = sheet.getByRole('button', { name: 'Tutup', exact: true });
    const box = await close.boundingBox();
    const tabs = [];
    for (let i = 0; i < 18; i++) {
        await page.keyboard.press('Tab');
        tabs.push(
            await page.evaluate(
                () => !!document.activeElement.closest('[role=dialog]'),
            ),
        );
    }
    await save('sheet-keyboard', {
        closeTarget: box,
        focusStayedInside: tabs.every(Boolean),
    });
    if (phase === 'after') {
        assert(box.width >= 44 && box.height >= 44, '44px close target');
        assert(tabs.every(Boolean), 'Sheet traps keyboard focus');
    }
    await page.keyboard.press('Escape');
    await sheet.waitFor({ state: 'hidden' });
    assert(
        await page
            .getByRole('button', { name: 'Tambah aturan', exact: true })
            .evaluate((e) => e === document.activeElement),
    );

    if (phase === 'after') {
        for (const mode of ['processing', 'pickup']) {
            await visit(`/hasil-pickup?monitoring=${mode}`);
            const search = page.locator(
                `#${mode === 'processing' ? 'processing' : 'pickup'}-search`,
            );
            const searchBox = await search.boundingBox();
            const firstRecord = await page
                .locator('tbody tr:visible')
                .first()
                .boundingBox();
            assert(
                searchBox.y + searchBox.height < 844,
                'Search fits in the initial mobile viewport',
            );
            assert(
                firstRecord.y < 844,
                'Working records begin in the initial 390px mobile viewport',
            );
            await save(`monitoring-${mode}-records`, {
                searchTop: searchBox.y,
                firstRecordTop: firstRecord.y,
            });
            await search.fill('AUD-PICKUP-0002');
            await page
                .getByRole('button', { name: 'Cari', exact: true })
                .click();
            await page.waitForURL(
                (url) => url.searchParams.get('q') === 'AUD-PICKUP-0002',
            );
            await page.waitForLoadState('networkidle');
            assert.equal(await search.inputValue(), 'AUD-PICKUP-0002');
        }
        await visit('/hasil-pickup');
        const disclosure = page
            .locator('summary')
            .filter({ hasText: 'Rincian monitoring' });
        await disclosure.focus();
        await page.keyboard.press('Enter');
        const help = page.getByRole('button', {
            name: 'Bantuan Metrik',
            exact: true,
        });
        await help.click();
        const dialog = page.getByRole('dialog', {
            name: 'Bantuan Metrik',
            exact: true,
        });
        await dialog.waitFor();
        assert((await dialog.boundingBox()).height <= 844);
        await save('monitoring-help-keyboard');
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        assert(await help.evaluate((e) => e === document.activeElement));

        await page.setViewportSize({ width: 1366, height: 768 });
        await visit('/operations/tasks');
        const bulk = page.getByRole('button', {
            name: 'Tugaskan Massal',
            exact: true,
        });
        assert.equal(
            await bulk.count(),
            0,
            'No disabled bulk toolbar before selection',
        );
        await page
            .getByRole('checkbox', {
                name: /Pilih tugas belum ditugaskan di halaman ini/,
            })
            .click();
        await bulk.waitFor();
        assert(await bulk.isEnabled());
        const selected = page.getByText(/Assignment Massal ·/).first();
        const countBeforePaging = await selected.innerText();
        const next = page.getByRole('button', {
            name: 'Halaman berikutnya',
            exact: true,
        });
        if (await next.isEnabled()) {
            const response = page.waitForResponse(
                (r) =>
                    r.url().includes('/api/v1/pickup-tasks?') &&
                    new URL(r.url()).searchParams.get('page') === '2',
            );
            await next.click();
            await response;
            await page.waitForLoadState('networkidle');
            assert.equal(
                await selected.innerText(),
                countBeforePaging,
                'Bulk selection survives pagination',
            );
        }
        await page
            .getByRole('button', { name: 'Hapus Pilihan', exact: true })
            .click();
        await bulk.waitFor({ state: 'hidden' });
        await page.setViewportSize({ width: 390, height: 844 });
        await save('pickup-bulk-context', {
            selectionRetainedAcrossPages: true,
            clearRestoresContext: true,
        });

        const dateLayouts = [];
        for (const [route, fromSelector, toSelector] of [
            ['/operations/tasks', '#date-from', '#date-to'],
            ['/handover', '#handover-from', '#handover-to'],
            [
                '/discrepancies',
                '#discrepancy-from',
                '[aria-label="Tanggal pemeriksaan selesai"]',
            ],
        ]) {
            await visit(route);
            const from = page.locator(fromSelector);
            const to = page.locator(toSelector);
            await from.fill('2026-10-01');
            await to.fill('2026-10-26');
            await page.waitForLoadState('networkidle');
            for (const width of [390, 320]) {
                await page.setViewportSize({
                    width,
                    height: width === 390 ? 844 : 740,
                });
                const first = await from.boundingBox();
                const last = await to.boundingBox();
                assert(
                    first.width >= 145 && last.width >= 145,
                    'Dates remain readable',
                );
                assert.equal(await from.inputValue(), '2026-10-01');
                assert.equal(await to.inputValue(), '2026-10-26');
                assert(
                    width === 390
                        ? Math.abs(first.y - last.y) < 1
                        : last.y > first.y,
                    'Date layout adapts without hiding a control',
                );
                dateLayouts.push({
                    route,
                    width,
                    from: first,
                    to: last,
                    valuesPreserved: true,
                });
            }
            await page.setViewportSize({ width: 390, height: 844 });
        }
        await save('operational-date-layouts', { dateLayouts });
    }
} catch (error) {
    console.error(
        JSON.stringify({
            url: page.url(),
            headings: await page
                .locator('h1,h2')
                .allTextContents()
                .catch(() => []),
            alerts: await page
                .locator('[role=alert]')
                .allTextContents()
                .catch(() => []),
        }),
    );
    throw error;
} finally {
    await browser.close();
}
console.log(
    `Recorded ${results.length} ${phase} interaction states; no successful business writes requested.`,
);
