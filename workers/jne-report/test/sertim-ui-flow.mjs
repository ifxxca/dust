import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
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
    await admin.page.evaluate(() => window.scrollTo(0, 0));
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
    await admin.page.evaluate(() => window.scrollTo(0, 0));
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
    await admin.page.evaluate(() => window.scrollTo(0, 0));
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
    await admin.page.evaluate(() => window.scrollTo(0, 0));
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
    await confidence.getByText(/1 AWB customer terkonfirmasi/).waitFor();
    await confidence.getByText(/1 AWB pickup terkonfirmasi/).waitFor();
    const searchPosition = await admin.page
        .getByLabel('Cari AWB', { exact: true })
        .boundingBox();
    assert.ok(
        searchPosition && searchPosition.y < 400,
        'Search must be reachable before operational summaries',
    );
    await admin.page
        .locator('summary')
        .filter({ hasText: /^Koleksi & tracking/ })
        .click();
    await admin.page
        .getByRole('region', {
            name: 'Tindak lanjut koleksi dan rekonsiliasi',
            exact: true,
        })
        .waitFor();
    await admin.page
        .locator('summary')
        .filter({ hasText: /^Koleksi & tracking/ })
        .click();
    await admin.page.setViewportSize({ width: 1280, height: 900 });
    await admin.page.evaluate(() => window.scrollTo(0, 0));
    await admin.page.screenshot({
        path: path.join(artifacts, 'operations-monitoring-1280.png'),
        fullPage: true,
    });
    assert.ok(
        await admin.page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
    );
    await admin.page.setViewportSize({ width: 390, height: 844 });
    await admin.page
        .getByRole('listitem')
        .filter({ hasText: 'SERTIM001' })
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
    await admin.page.evaluate(() => window.scrollTo(0, 0));
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
    await admin.page.evaluate(() => window.scrollTo(0, 0));
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
    await admin.page.goto(base + '/admin/jne-monitoring/evidence-rules');
    await admin.page
        .getByRole('heading', { name: 'Aturan bukti JNE', exact: true })
        .waitFor();
    await admin.page
        .getByRole('button', { name: 'Tambah aturan', exact: true })
        .click();
    assert.equal(
        await admin.page
            .getByLabel('Kolom kode customer', { exact: true })
            .inputValue(),
        '',
    );
    assert.equal(
        await admin.page
            .getByLabel('Definisi kolom dan aturan terverifikasi', {
                exact: true,
            })
            .isVisible(),
        false,
    );
    await admin.page
        .getByRole('dialog')
        .locator('summary')
        .filter({ hasText: 'Definisi JSON lanjutan' })
        .click();
    await admin.page
        .getByLabel('Definisi kolom dan aturan terverifikasi', { exact: true })
        .fill('{');
    await admin.page
        .getByLabel('Alasan dan referensi verifikasi', { exact: true })
        .fill('Synthetic invalid JSON recovery');
    await admin.page
        .getByRole('button', { name: 'Simpan aturan', exact: true })
        .click();
    assert.equal(
        await admin.page
            .getByLabel('Definisi kolom dan aturan terverifikasi', {
                exact: true,
            })
            .getAttribute('aria-invalid'),
        'true',
    );
    await admin.page.waitForFunction(
        () => document.activeElement?.id === 'evidence-definition',
        { timeout: 3000 },
    );
    assert.equal(
        await admin.page.evaluate(() => document.activeElement?.id),
        'evidence-definition',
    );
    assert.ok(
        await admin.page.locator('#evidence-definition-error').isVisible(),
    );
    await admin.page
        .getByLabel('Definisi kolom dan aturan terverifikasi', { exact: true })
        .fill(
            JSON.stringify({
                customer_code_column: null,
                category_column: null,
                category_values: {},
                hybrid_categories: {},
                collection_requirements: [],
            }),
        );
    assert.ok(
        await admin.page
            .getByLabel('Definisi kolom dan aturan terverifikasi', {
                exact: true,
            })
            .isVisible(),
    );
    await admin.page
        .getByLabel('Kolom kode customer', { exact: true })
        .fill('CUSTOMER_FIXTURE');
    await admin.page
        .getByLabel('Kolom kategori', { exact: true })
        .fill('CATEGORY_FIXTURE');
    await admin.page
        .getByRole('dialog')
        .locator('summary')
        .filter({ hasText: 'Pemetaan kategori' })
        .click();
    await admin.page
        .getByRole('button', { name: 'Tambah nilai sumber', exact: true })
        .click();
    await admin.page
        .getByLabel('Nilai kategori sumber 1', { exact: true })
        .fill('CSS_FIXTURE');
    await admin.page
        .getByLabel('Kategori POP 1', { exact: true })
        .selectOption('css_orion');
    await admin.page
        .getByRole('button', { name: 'Tambah nilai sumber', exact: true })
        .click();
    await admin.page
        .getByLabel('Nilai kategori sumber 2', { exact: true })
        .fill('CSS_FIXTURE');
    await admin.page
        .getByLabel('Kategori POP 2', { exact: true })
        .selectOption('cashless_hybrid');
    assert.equal(
        await admin.page
            .getByLabel('Nilai kategori sumber 2', { exact: true })
            .evaluate((input) => input.checkValidity()),
        false,
    );
    await admin.page
        .getByRole('button', { name: 'Hapus pemetaan 2', exact: true })
        .click();
    assert.equal(
        await admin.page
            .getByLabel('Nilai kategori sumber 1', { exact: true })
            .evaluate((input) => input.checkValidity()),
        true,
    );
    await admin.page
        .getByLabel('roberto:cashless', { exact: true })
        .selectOption('cashless_hybrid');
    await admin.page
        .getByLabel('Alasan dan referensi verifikasi', { exact: true })
        .fill('Synthetic structured contract draft');
    const contractRequest = admin.page.waitForRequest(
        (request) =>
            request.method() === 'POST' &&
            request.url().endsWith('/evidence-rules'),
    );
    await admin.page
        .getByRole('button', { name: 'Simpan aturan', exact: true })
        .click();
    const contractPayload = (await contractRequest).postDataJSON();
    assert.equal(contractPayload.verified, false);
    assert.deepEqual(contractPayload.definition, {
        customer_code_column: 'CUSTOMER_FIXTURE',
        category_column: 'CATEGORY_FIXTURE',
        category_values: { CSS_FIXTURE: 'css_orion' },
        hybrid_categories: { 'roberto:cashless': 'cashless_hybrid' },
        collection_requirements: [],
    });
    await admin.page.getByRole('dialog').waitFor({ state: 'hidden' });
    await admin.page
        .getByRole('button', { name: 'Tambah aturan', exact: true })
        .click();
    await admin.page
        .getByRole('dialog')
        .locator('summary')
        .filter({ hasText: 'Definisi JSON lanjutan' })
        .click();
    await admin.page
        .getByLabel('Definisi kolom dan aturan terverifikasi', { exact: true })
        .fill('{');
    await admin.page
        .getByLabel('Jenis aturan', { exact: true })
        .selectOption('code_alias');
    await admin.page
        .getByLabel('Customer pemilik', { exact: true })
        .selectOption(process.env.SERTIM_UI_CUSTOMER);
    await admin.page
        .getByLabel('Kode alias persis', { exact: true })
        .fill('4000A');
    await admin.page
        .getByLabel('Alasan dan referensi verifikasi', { exact: true })
        .fill('Synthetic browser verified code alias');
    await admin.page
        .getByRole('checkbox', { name: /^Verifikasi dan aktifkan/ })
        .check();
    await admin.page
        .getByRole('button', { name: 'Simpan aturan', exact: true })
        .click();
    await admin.page
        .locator('summary')
        .filter({ hasText: /Alias kode.*4000A.*Aktif terverifikasi/ })
        .waitFor();
    await admin.page
        .getByRole('button', { name: 'Tambah aturan', exact: true })
        .click();
    await admin.page
        .getByLabel('Jenis aturan', { exact: true })
        .selectOption('code_alias');
    await admin.page
        .getByLabel('Customer pemilik', { exact: true })
        .selectOption(process.env.SERTIM_UI_CUSTOMER);
    await admin.page
        .getByLabel('Kode alias persis', { exact: true })
        .fill('4000B');
    await admin.page
        .getByLabel('Alasan dan referensi verifikasi', { exact: true })
        .fill('Synthetic browser alias draft');
    await admin.page
        .getByRole('checkbox', { name: /^Verifikasi dan aktifkan/ })
        .uncheck();
    await admin.page
        .getByRole('button', { name: 'Simpan aturan', exact: true })
        .click();
    const draft = admin.page.locator('details').filter({
        has: admin.page
            .locator('summary')
            .filter({ hasText: /Alias kode.*4000B/ }),
    });
    await draft.locator('summary').click();
    await draft
        .getByRole('button', {
            name: 'Pilih untuk diverifikasi dan diaktifkan',
            exact: true,
        })
        .click();
    await admin.page
        .getByLabel('Alasan perubahan aturan', { exact: true })
        .fill('Synthetic original draft verified');
    await admin.page
        .getByRole('button', {
            name: 'Verifikasi, aktifkan dan evaluasi ulang',
            exact: true,
        })
        .click();
    await admin.page
        .locator('summary')
        .filter({ hasText: /Alias kode.*4000B.*Aktif terverifikasi/ })
        .waitFor();
    await admin.page.getByRole('dialog').waitFor({ state: 'hidden' });
    await admin.page.evaluate(() => window.scrollTo(0, 0));
    await admin.page.screenshot({
        path: path.join(artifacts, 'evidence-rules-390.png'),
        fullPage: true,
    });
    assert.ok(
        await admin.page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
    );
    assert.deepEqual(errors, []);
    await admin.page.goto(
        base +
            '/admin/jne-monitoring/collections/' +
            process.env.SERTIM_UI_CLOSED_TASK,
    );
    await admin.page
        .getByRole('heading', { name: /Koleksi eksternal/ })
        .waitFor();
    await admin.page
        .getByLabel('Keputusan', { exact: true })
        .selectOption('OPEN');
    assert.equal(
        await admin.page
            .getByLabel('Kontrak sumber terverifikasi', { exact: true })
            .count(),
        0,
    );
    assert.equal(
        await admin.page.getByLabel(/Cutoff yang diperiksa/).count(),
        0,
    );
    await admin.page
        .getByLabel('Alasan dan cakupan bukti', { exact: true })
        .fill('Synthetic browser external review');
    await admin.page
        .getByRole('button', { name: 'Simpan pengesahan', exact: true })
        .click();
    await admin.page
        .locator('summary')
        .filter({ hasText: 'Riwayat pengesahan' })
        .click();
    await admin.page
        .locator('summary')
        .filter({ hasText: 'Synthetic browser external review' })
        .waitFor();
    await admin.page
        .getByLabel('Keputusan', { exact: true })
        .selectOption('COMPLETE');
    await admin.page
        .getByLabel('Kontrak sumber terverifikasi', { exact: true })
        .selectOption(process.env.SERTIM_UI_COLLECTION_CONTRACT);
    await admin.page
        .getByRole('checkbox', {
            name: new RegExp(
                '^#' + process.env.SERTIM_UI_REPORT + ' apex/apex',
            ),
        })
        .check();
    await admin.page.getByLabel('Cari laporan', { exact: true }).fill('apex');
    await admin.page.getByRole('button', { name: 'Cari', exact: true }).click();
    await admin.page
        .getByRole('button', {
            name: 'Hapus laporan #' + process.env.SERTIM_UI_REPORT,
            exact: true,
        })
        .waitFor();
    assert.equal(
        await admin.page
            .getByLabel('Kontrak sumber terverifikasi', { exact: true })
            .inputValue(),
        process.env.SERTIM_UI_COLLECTION_CONTRACT,
    );
    await admin.page
        .getByLabel(/Cutoff yang diperiksa/)
        .fill(new Date(Date.now() - 86400000).toISOString().slice(0, 16));
    await admin.page
        .getByLabel('Alasan dan cakupan bukti', { exact: true })
        .fill('Synthetic browser full source scope attested');
    await admin.page
        .getByRole('checkbox', { name: /^Saya telah memeriksa seluruh sumber/ })
        .check();
    await admin.page
        .getByRole('button', { name: 'Simpan pengesahan', exact: true })
        .click();
    await admin.page
        .locator('summary')
        .filter({ hasText: 'Synthetic browser full source scope attested' })
        .waitFor();
    await admin.page.evaluate(() => window.scrollTo(0, 0));
    await admin.page.screenshot({
        path: path.join(artifacts, 'collection-review-390.png'),
        fullPage: true,
    });
    assert.ok(
        await admin.page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
    );
    assert.deepEqual(errors, []);
    await admin.page.goto(
        base + '/admin/jne-monitoring/exceptions?q=REVIEWUI1',
    );
    await admin.page
        .getByRole('heading', {
            name: 'Pemeriksaan exception JNE',
            exact: true,
        })
        .waitFor();
    await admin.page
        .getByRole('button', { name: 'Pilih kelompok (1 AWB)', exact: true })
        .click();
    await admin.page
        .getByRole('dialog', {
            name: 'Keputusan untuk 1 AWB terpilih',
            exact: true,
        })
        .waitFor();
    const decision = await admin.page
        .getByRole('heading', {
            name: 'Keputusan untuk 1 AWB terpilih',
            exact: true,
        })
        .boundingBox();
    assert.ok(
        decision && decision.y >= 0 && decision.y < 200,
        'Selection opens an immediately visible decision panel',
    );
    await admin.page
        .getByLabel('Customer yang dikonfirmasi', { exact: true })
        .selectOption(process.env.SERTIM_UI_CUSTOMER);
    await admin.page
        .getByLabel('Alasan dan referensi bukti review', { exact: true })
        .fill('Synthetic browser ownership decision');
    await admin.page
        .getByRole('button', { name: 'Simpan keputusan', exact: true })
        .click();
    await admin.page
        .getByText('0 AWB memerlukan pemeriksaan', { exact: false })
        .waitFor();
    await admin.page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(
        await admin.page
            .getByRole('heading', { name: /Keputusan untuk 0 AWB/ })
            .count(),
        0,
    );
    await admin.page.evaluate(() => window.scrollTo(0, 0));
    await admin.page.screenshot({
        path: path.join(artifacts, 'exception-review-390.png'),
        fullPage: true,
    });
    assert.deepEqual(errors, []);
    await admin.page.goto(base + '/admin/jne-monitoring/refresh-policies');
    await admin.page
        .getByRole('heading', {
            name: 'Kebijakan pembaruan tracking',
            exact: true,
        })
        .waitFor();
    assert.equal(
        await admin.page
            .getByLabel('Definisi kebijakan', { exact: true })
            .isVisible(),
        false,
    );
    await admin.page.getByLabel('Dalam proses', { exact: true }).fill('90');
    await admin.page
        .getByLabel('Alasan dan bukti kebijakan', { exact: true })
        .fill('Synthetic browser inactive tracking draft');
    const trackingRequest = admin.page.waitForRequest(
        (request) =>
            request.method() === 'POST' &&
            request.url().includes('/refresh-policies/'),
    );
    await admin.page
        .getByRole('button', { name: 'Simpan kebijakan', exact: true })
        .click();
    const trackingPayload = (await trackingRequest).postDataJSON();
    assert.equal(trackingPayload.definition.enabled, false);
    assert.equal(trackingPayload.definition.intervals.IN_TRANSIT, 90);
    assert.deepEqual(trackingPayload.definition.terminal_statuses, []);
    await admin.page
        .locator('summary')
        .filter({ hasText: 'Audit kebijakan' })
        .click();
    await admin.page
        .locator('summary')
        .filter({ hasText: 'Synthetic browser inactive tracking draft' })
        .waitFor();
    await admin.page.evaluate(() => window.scrollTo(0, 0));
    await admin.page.screenshot({
        path: path.join(artifacts, 'refresh-policy-390.png'),
        fullPage: true,
    });
    assert.ok(
        await admin.page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
    );
    await admin.page.goto(base + '/admin/jne-monitoring');
    const positions = [];
    for (const width of [390, 1280]) {
        await admin.page.setViewportSize({ width, height: 844 });
        await admin.page.evaluate(() => window.scrollTo(0, 0));
        const taskSearch = await admin.page
            .getByLabel('Cari AWB', { exact: true })
            .boundingBox();
        assert.ok(taskSearch && taskSearch.y < 400);
        const records = admin.page.getByRole('region', {
            name: 'Monitoring AWB',
            exact: true,
        });
        const firstAwb = await (
            width < 768
                ? records.getByRole('listitem').first()
                : records.getByRole('row').nth(1)
        ).boundingBox();
        assert.ok(
            firstAwb && firstAwb.y < 844,
            'First AWB must be visible without scrolling',
        );
        positions.push({ width, searchY: taskSearch.y, firstAwbY: firstAwb.y });
        await admin.page.evaluate(() => window.scrollTo(0, 0));
        await admin.page.screenshot({
            path: path.join(
                artifacts,
                'task-first-monitoring-' + width + '.png',
            ),
        });
        await admin.page.goto(base + '/admin/jne-monitoring/reconciliation');
        const reconciliationSearch = await admin.page
            .getByLabel('Referensi / customer', { exact: true })
            .boundingBox();
        assert.ok(reconciliationSearch && reconciliationSearch.y < 400);
        await admin.page.evaluate(() => window.scrollTo(0, 0));
        await admin.page.screenshot({
            path: path.join(
                artifacts,
                'task-first-reconciliation-' + width + '.png',
            ),
        });
        assert.ok(
            await admin.page.evaluate(
                () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
        );
        await admin.page.goto(base + '/admin/jne-monitoring');
    }
    assert.deepEqual(errors, []);
    await writeFile(
        path.join(artifacts, 'task-first-positions.json'),
        JSON.stringify(positions, null, 2),
    );
    process.stdout.write('SERTIM_CHROMIUM_UI_OK\n');
} finally {
    await browser.close();
}
