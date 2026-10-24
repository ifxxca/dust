import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.env.RETAIL_OPERATIONS_URL;
assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);
const browser = await chromium.launch({ headless: true });
const errors = [];
const artifacts = process.env.SERTIM_UI_ARTIFACT_DIR;
await mkdir(artifacts, { recursive: true });
async function login(email, width = 1280) {
    const context = await browser.newContext({
        viewport: { width, height: 900 },
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base + '/login');
    await page.getByLabel('Alamat email').fill(email);
    await page
        .getByLabel('Kata sandi', { exact: true })
        .fill('SertimFixture123!');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.endsWith('/login'));
    return { context, page };
}
try {
    const staff = await login('sertim-staff@example.test', 390);
    await staff.page.goto(
        base + '/operations/execute/' + process.env.SERTIM_UI_TASK,
    );
    await staff.page.getByLabel('AWB cashless', { exact: true }).waitFor();
    await staff.page
        .getByLabel('AWB cashless', { exact: true })
        .fill('sertim001');
    await staff.page
        .getByRole('button', { name: 'Catat AWB', exact: true })
        .click();
    await staff.page.getByRole('cell', { name: /SERTIM001/ }).waitFor();
    assert.equal(
        await staff.page
            .getByRole('button', { name: 'Tambah bukti lewat koreksi Admin' })
            .count(),
        0,
    );
    await staff.page.screenshot({
        path: path.join(artifacts, 'sertim-staff-390.png'),
        fullPage: true,
    });
    await staff.context.close();

    const admin = await login('sertim-admin@example.test');
    await admin.page.goto(
        base + '/operations/detail/' + process.env.SERTIM_UI_CLOSED_TASK,
    );
    const row = admin.page.getByRole('row').filter({ hasText: 'CLOSED001' });
    await row.getByRole('button', { name: 'Koreksi', exact: true }).click();
    await admin.page
        .getByRole('dialog')
        .getByLabel('AWB yang benar')
        .fill('CLOSED002');
    await admin.page
        .getByRole('dialog')
        .getByLabel('Alasan koreksi')
        .fill('Original label checked in UI fixture');
    await admin.page
        .getByRole('button', { name: 'Simpan koreksi & periksa ulang' })
        .click();
    await admin.page.getByRole('dialog').waitFor({ state: 'hidden' });
    const corrected = admin.page
        .getByRole('row')
        .filter({ hasText: 'CLOSED002' });
    await corrected.getByRole('button', { name: /Riwayat/ }).click();
    await admin.page
        .getByRole('dialog')
        .getByText('Original label checked in UI fixture', { exact: true })
        .waitFor();
    await admin.page.screenshot({
        path: path.join(artifacts, 'sertim-admin-audit-1280.png'),
        fullPage: true,
    });
    await admin.page.keyboard.press('Escape');
    await admin.page.getByRole('dialog').waitFor({ state: 'hidden' });
    await admin.page.setViewportSize({ width: 390, height: 844 });
    await admin.page
        .getByText('Sertim Cashless', { exact: true })
        .scrollIntoViewIfNeeded();
    await admin.page.screenshot({
        path: path.join(artifacts, 'sertim-admin-390.png'),
    });
    assert.ok(
        await admin.page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        JSON.stringify(
            await admin.page.evaluate(() =>
                [
                    ...document.querySelectorAll(
                        'main, [data-slot="card"], table',
                    ),
                ]
                    .map((element) => ({
                        tag: element.tagName,
                        className: element.className,
                        width: element.getBoundingClientRect().width,
                        right: element.getBoundingClientRect().right,
                    }))
                    .filter((element) => element.right > window.innerWidth),
            ),
        ),
    );
    await admin.page.screenshot({
        path: path.join(artifacts, 'sertim-admin-390.png'),
    });
    assert.deepEqual(errors, []);
    await admin.page.goto(base + '/admin/jne-monitoring/reconciliation');
    await admin.page
        .getByRole('heading', { name: 'Rekonsiliasi POP & AWB' })
        .waitFor();
    await admin.page
        .getByRole('cell', { name: 'CSS / Orion', exact: true })
        .waitFor();
    await admin.page.screenshot({
        path: path.join(artifacts, 'pop-reconciliation-390.png'),
        fullPage: true,
    });
    assert.ok(
        await admin.page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
    );
    await admin.page.goto(base + '/admin/jne-monitoring');
    const confidence = admin.page.getByRole('region', {
        name: 'Kepastian identitas AWB',
    });
    await confidence
        .getByText(/1 AWB memiliki customer terkonfirmasi/)
        .waitFor();
    await confidence.getByText(/1 AWB memiliki pickup terkonfirmasi/).waitFor();
    await admin.page
        .getByRole('button', { name: 'Detail pengiriman', exact: true })
        .click();
    await admin.page
        .getByRole('dialog')
        .getByText('Report terakhir diterima', { exact: true })
        .waitFor();
    await admin.page.getByRole('dialog').evaluate(async (element) => {
        await Promise.all(
            element
                .getAnimations({ subtree: true })
                .map((animation) => animation.finished),
        );
    });
    await admin.page.screenshot({
        path: path.join(artifacts, 'shipment-evidence-390.png'),
    });
    await admin.page
        .getByRole('link', { name: /Lihat riwayat & detail lengkap/ })
        .click();
    await admin.page
        .getByRole('heading', { name: 'AWB SERTIM001', exact: true })
        .waitFor();
    await admin.page
        .getByText('Riwayat keputusan pencocokan', { exact: true })
        .click();
    await admin.page.getByText(/Sertim #/).waitFor();
    await admin.page.goto(base + '/admin/jne-monitoring/customer-dashboard');
    await admin.page.getByLabel('Pemetaan customer').selectOption('candidate');
    await admin.page
        .getByRole('button', { name: 'Terapkan filter', exact: true })
        .click();
    await admin.page
        .getByText('Belum ada kiriman pada pilihan ini', { exact: true })
        .waitFor();
    await admin.page.screenshot({
        path: path.join(artifacts, 'customer-confidence-390.png'),
        fullPage: true,
    });
    assert.ok(
        await admin.page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
    );
    assert.deepEqual(errors, []);
    process.stdout.write('SERTIM_CHROMIUM_UI_OK\n');
} finally {
    await browser.close();
}
