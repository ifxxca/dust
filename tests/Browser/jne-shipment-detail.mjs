import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(path.resolve('workers/jne-report/package.json'));
const { chromium } = require('playwright');
const base = process.env.UI_UX_BASE_URL;
assert(base && ['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const browser = await chromium.launch({ headless: true });
try {
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1100 },
        permissions: ['clipboard-read', 'clipboard-write'],
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base + '/login');
    await page.locator('#email').fill('audit-admin_supervisor@example.test');
    await page.locator('#password').fill('password');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
    await page.goto(base + '/admin/jne-monitoring/1');
    await page
        .getByRole('heading', { name: 'Informasi pengiriman', exact: true })
        .waitFor();
    await page
        .getByRole('heading', { name: 'Timeline status', exact: true })
        .waitFor();
    assert.equal(
        await page
            .locator('ol[aria-label="Timeline observasi report"] > li')
            .count(),
        1,
    );
    await page
        .getByRole('button', { name: 'Salin nomor resi', exact: true })
        .click();
    assert.equal(
        await page.evaluate(() => navigator.clipboard.readText()),
        '0101000000000000',
    );
    await page.screenshot({
        path: 'output/jne-filter-search-20261027/detail-desktop.png',
        fullPage: true,
    });
    const technical = page
        .locator('details')
        .filter({
            has: page
                .locator(':scope > summary')
                .filter({ hasText: 'Detail teknis & audit' }),
        })
        .first();
    assert.equal(await technical.getAttribute('open'), null);
    assert.equal(await page.locator('#pickup-reference').count(), 0);
    await technical.locator(':scope > summary').click();
    const raw = technical
        .locator('details')
        .filter({
            has: page
                .locator(':scope > summary')
                .filter({ hasText: /^Seluruh kolom CSV sumber/ }),
        })
        .first();
    assert.equal(await raw.getAttribute('open'), null);
    await raw.locator(':scope > summary').click();
    await raw.getByText('SHIPPER_NAME', { exact: true }).waitFor();
    await technical.locator(':scope > summary').click();
    await page
        .getByRole('button', { name: /^(Hubungkan pickup|Ubah pickup)$/ })
        .click();
    await page.locator('#pickup-reference').fill('PICKUP-NOT-REGISTERED');
    await page
        .locator('#match-reason')
        .fill('Fixture validation retains the decision draft.');
    await page
        .getByRole('button', { name: 'Simpan keputusan', exact: true })
        .click();
    await page.locator('#pickup-reference[aria-invalid="true"]').waitFor();
    assert.equal(await technical.getAttribute('open'), null);
    await page.waitForFunction(
        () => document.activeElement?.id === 'pickup-reference',
    );
    assert.equal(
        await page.locator('#match-reason').inputValue(),
        'Fixture validation retains the decision draft.',
    );
    await page
        .getByRole('button', { name: 'Tutup koreksi', exact: true })
        .click();
    await page
        .getByRole('button', { name: /^(Hubungkan pickup|Ubah pickup)$/ })
        .click();
    assert.equal(
        await page.locator('#match-reason').inputValue(),
        'Fixture validation retains the decision draft.',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + '/admin/jne-monitoring/1');
    await page
        .getByRole('heading', { name: 'Informasi pengiriman', exact: true })
        .waitFor();
    const pickupAction = page.getByRole('button', {
        name: /^(Hubungkan pickup|Ubah pickup)$/,
    });
    const pickupActionBounds = await pickupAction.boundingBox();
    assert(
        pickupActionBounds &&
            pickupActionBounds.y + pickupActionBounds.height < 844,
    );
    assert.equal(
        await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
    );
    await page.screenshot({
        path: 'output/jne-filter-search-20261027/detail-mobile.png',
        fullPage: false,
    });
    await page
        .getByRole('heading', { name: 'Pencocokan pickup', exact: true })
        .scrollIntoViewIfNeeded();
    await page.screenshot({
        path: 'output/jne-filter-search-20261027/detail-mobile-matching.png',
        fullPage: false,
    });
    assert.deepEqual(errors, []);
    console.log(
        JSON.stringify({
            passed: true,
            checks: [
                'actual timeline observations only',
                'copy AWB',
                'technical and correction disclosures closed by default',
                'raw source remains available',
                'validation focus and preserved draft',
                'mobile layout',
            ],
            screenshots: [
                'detail-desktop.png',
                'detail-mobile.png',
                'detail-mobile-matching.png',
            ],
        }),
    );
} finally {
    await browser.close();
}
