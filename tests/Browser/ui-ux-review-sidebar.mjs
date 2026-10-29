import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(path.resolve('workers/jne-report/package.json'));
const { chromium } = require('playwright');
const base = process.env.UI_UX_BASE_URL;
assert(base && ['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const phase = process.env.UI_UX_PHASE ?? 'before';
const browser = await chromium.launch();
const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    reducedMotion: 'reduce',
});
await page.addInitScript(() => localStorage.setItem('appearance', 'light'));
const records = [];
try {
    await page.goto(base + '/login');
    await page.locator('#email').fill('audit-admin_supervisor@example.test');
    await page.locator('#password').fill('password');
    await page
        .getByRole('button', { name: 'Masuk ke workspace', exact: true })
        .click();
    await page.waitForURL((url) => url.pathname !== '/login');
    for (const width of [390, 320]) {
        await page.setViewportSize({
            width,
            height: width === 390 ? 844 : 740,
        });
        await page.goto(base + '/operations/customers');
        await page.waitForLoadState('networkidle');
        const trigger = page.getByRole('button', {
            name: 'Buka atau tutup navigasi',
            exact: true,
        });
        await trigger.click();
        const sidebar = page.getByRole('dialog');
        await sidebar.waitFor();
        const closeTarget = await page
            .locator('[data-mobile=true] > button')
            .last()
            .boundingBox();
        const screenshot = `${phase}/mobile-sidebar-${width}.png`;
        await page.screenshot({
            path: `docs/ui-ux-review/evidence/${screenshot}`,
            animations: 'disabled',
        });
        for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
        const hiddenTooltips = await page
            .locator('[data-slot=tooltip-content][hidden]')
            .count();
        await page.keyboard.press('Escape');
        const closed = await sidebar
            .waitFor({ state: 'hidden', timeout: 1500 })
            .then(
                () => true,
                () => false,
            );
        records.push({
            width,
            role: 'admin_supervisor',
            screenshot,
            closeTarget,
            hiddenTooltips,
            closedWithOneEscape: closed,
        });
        if (phase === 'after') {
            assert(closeTarget.width >= 44 && closeTarget.height >= 44);
            assert.equal(
                hiddenTooltips,
                0,
                'No hidden tooltip layer in the mobile menu',
            );
            assert(closed, 'Escape closes navigation after keyboard traversal');
            await page.waitForFunction(
                (element) => element === document.activeElement,
                await trigger.elementHandle(),
                { timeout: 2000 },
            );
            assert(await trigger.evaluate((e) => e === document.activeElement));
            records[records.length - 1].focusReturned = true;
        }
        if (!closed) await page.keyboard.press('Escape');
    }
} finally {
    await fs.writeFile(
        `docs/ui-ux-review/evidence/${phase}-sidebar.json`,
        JSON.stringify(records, null, 2),
    );
    await browser.close();
}
console.log(`${phase}: ${records.length} mobile navigation states verified.`);
