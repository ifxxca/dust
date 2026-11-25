import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
const require = createRequire(path.resolve('workers/jne-report/package.json'));
const { chromium } = require('playwright');
const { Code128Reader } = require('@zxing/library');
const output = path.resolve('output', `retail-pwa-${Date.now()}`);
await fs.mkdir(output, { recursive: true });
const database = path.join(output, 'retail-pwa.sqlite');
const env = { ...process.env, RETAIL_PWA_TEST_DB: database };
const phpArgs = ['-d', 'extension=pdo_sqlite', '-d', 'extension=sqlite3'];
const fixture = 'tests/Fixtures/retail-pwa.php';
const seeded = spawnSync('php', [...phpArgs, fixture], {
    env,
    encoding: 'utf8',
    windowsHide: true,
});
assert.equal(seeded.status, 0, seeded.stderr + seeded.stdout);
const data = JSON.parse(seeded.stdout);
const server = spawn(
    'php',
    [...phpArgs, '-S', '127.0.0.1:8027', '-t', 'public', fixture],
    { env, stdio: 'ignore', windowsHide: true },
);
const base = 'http://127.0.0.1:8027';
let browser;
let testPage;
const results = [];
const screenshots = [];
async function capture(page, name, label, fullPage = true) {
    const file = `${name}.png`;
    await page.screenshot({ path: path.join(output, file), fullPage });
    screenshots.push({ file, label });
}
async function checkWorkLayout(page, label) {
    for (const [width, height] of [
        [320, 568],
        [375, 812],
        [430, 932],
        [844, 390],
        [1440, 900],
    ]) {
        await page.setViewportSize({ width, height });
        assert(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
            ),
            `${label}: overflow ${width}`,
        );
    }
    await page.setViewportSize({ width: 390, height: 844 });
}
try {
    for (let attempt = 0; attempt < 60; attempt++) {
        try {
            const response = await fetch(base + '/m');
            if (response.ok) break;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    testPage = page;
    page.setDefaultTimeout(15_000);
    const errors = [];
    const customerQueries = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
        const url = new URL(request.url());
        if (url.pathname === '/m/api/v1/customers')
            customerQueries.push(url.searchParams.get('q'));
    });
    await page.goto(base + '/m');
    await page.getByLabel('Email operasional').waitFor();
    await capture(page, '01-login', 'Login operasional');
    await page.getByLabel('Email operasional').fill('pwa-staff@example.test');
    await page.getByLabel('Password', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: 'Masuk', exact: true }).click();
    await page.locator('#email[aria-invalid="true"]').waitFor();
    await page.getByLabel('Password', { exact: true }).fill('password');
    await page.getByRole('button', { name: 'Masuk', exact: true }).click();
    const nav = page.getByRole('navigation', { name: 'Navigasi utama' });
    await nav.waitFor();
    assert.deepEqual(await nav.getByRole('button').allTextContents(), [
        'Beranda',
        'Pickup',
        'Handover',
        'Scan AWB',
        'Laporan',
        'Profil',
    ]);
    results.push(
        'Login, inline validation, cookie session, dan navigasi 6 tujuan',
    );
    const cookies = await context.cookies();
    assert(
        cookies.some(
            (cookie) => cookie.httpOnly && cookie.name !== 'XSRF-TOKEN',
        ),
    );
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await nav.waitFor();
    await page.waitForFunction(
        () => navigator.serviceWorker.controller !== null,
    );
    for (const [width, height] of [
        [320, 568],
        [375, 812],
        [390, 844],
        [430, 932],
        [844, 390],
    ]) {
        await page.setViewportSize({ width, height });
        assert(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
            ),
            `Overflow ${width}`,
        );
        for (const button of await nav.getByRole('button').all()) {
            const rect = await button.boundingBox();
            assert(
                rect &&
                    rect.height >= 44 &&
                    rect.width >= 44 &&
                    rect.y + rect.height <= height + 1,
            );
        }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: /Customer UAT PWA/ }).waitFor();
    await capture(page, '02-beranda', 'Beranda pada viewport 390 × 844');
    await page.setViewportSize({ width: 320, height: 568 });
    await capture(
        page,
        '02a-beranda-kecil',
        'Beranda pada viewport 320 × 568',
        false,
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await capture(
        page,
        '02b-beranda-desktop',
        'Beranda pada viewport 1440 × 900',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    results.push(
        'Layout 320/375/390/430 dan landscape; target sentuh navigasi minimal 44px',
    );
    await nav.getByRole('button', { name: 'Pickup', exact: true }).click();
    await page.getByRole('button', { name: /Customer UAT PWA/ }).waitFor();
    await checkWorkLayout(page, 'Daftar pickup');
    await capture(page, '03-pickup', 'Daftar tugas pickup');
    const pickupTabs = page.getByRole('navigation', {
        name: 'Pickup workspace',
    });
    const manualButton = page.getByRole('button', {
        name: 'Buat Pickup Manual',
        exact: true,
    });
    for (const tab of ['Tugas Saya', 'Tersedia', 'Riwayat']) {
        await pickupTabs
            .getByRole('button', { name: tab, exact: true })
            .click();
        await manualButton.waitFor({ state: 'visible' });
        await manualButton.click();
        await page
            .getByRole('region', { name: 'Buat Pickup Manual' })
            .waitFor();
        await page
            .getByRole('button', { name: 'Kembali ke Tugas', exact: true })
            .click();
    }
    // Fixture respons hanya untuk memeriksa presentasi kepemilikan tugas;
    // otorisasi dan transaksi pengambilalihan diuji oleh suite backend.
    const sourceTask = await page.evaluate(async (id) => {
        const response = await fetch(`/m/api/v1/pickup-tasks/${id}`, {
            headers: { Accept: 'application/json' },
        });
        return (await response.json()).data;
    }, data.task);
    const availableTasks = [
        {
            ...sourceTask,
            id: 1000001,
            reference: 'PWA-UNASSIGNED',
            customer: {
                ...sourceTask.customer,
                name: 'Pickup belum ditugaskan',
            },
            assigned_staff: null,
            status: 'SCHEDULED',
            can: { take_over: true, execute: false },
        },
        {
            ...sourceTask,
            id: 1000002,
            reference: 'PWA-TAKEOVER',
            customer: { ...sourceTask.customer, name: 'Pickup petugas lain' },
            assigned_staff: { id: data.other, name: 'Petugas Kedua' },
            can: { take_over: true, execute: false },
        },
    ];
    const availablePattern = /\/m\/api\/v1\/pickup-tasks\/([^/?]+)(?:\?|$)/;
    const availableHandler = async (route) => {
        const url = new URL(route.request().url());
        const id = url.pathname.split('/').at(-1);
        if (id === 'takeover-candidates') {
            return route.fulfill({
                json: {
                    data: availableTasks,
                    meta: {
                        current_page: 1,
                        last_page: 1,
                        per_page: 20,
                        total: 2,
                    },
                },
            });
        }
        const task = availableTasks.find((item) => String(item.id) === id);
        if (task) return route.fulfill({ json: { data: task } });
        return route.continue();
    };
    await page.route(availablePattern, availableHandler);
    await pickupTabs
        .getByRole('button', { name: 'Tersedia', exact: true })
        .click();
    const unassignedCard = page.getByRole('button', {
        name: /Pickup belum ditugaskan/,
    });
    const takeoverCard = page.getByRole('button', {
        name: /Pickup petugas lain/,
    });
    await unassignedCard.waitFor();
    assert.match(
        await unassignedCard.innerText(),
        /Belum ditugaskan[\s\S]*Ambil Tugas/,
    );
    assert.match(
        await takeoverCard.innerText(),
        /Petugas: Petugas Kedua[\s\S]*Ambil Alih Tugas/,
    );
    await checkWorkLayout(page, 'Tugas tersedia dan pengambilalihan');
    await page.setViewportSize({ width: 430, height: 932 });
    await capture(
        page,
        '03c-tugas-tersedia',
        'Tugas belum ditugaskan dan tugas petugas lain',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [name, action, message] of [
        ['Pickup belum ditugaskan', 'Ambil Tugas', 'Ambil PCK-1000001?'],
        [
            'Pickup petugas lain',
            'Ambil Alih Tugas',
            'Ambil alih PCK-1000002 dari Petugas Kedua?',
        ],
    ]) {
        await page.getByRole('button', { name: new RegExp(name) }).click();
        await page.getByRole('button', { name: action, exact: true }).click();
        const confirmation = page.getByRole('dialog', {
            name: `${action}?`,
            exact: true,
        });
        await confirmation.waitFor();
        await page.waitForFunction(
            () =>
                document.activeElement?.closest('[role="dialog"]') &&
                document.activeElement?.textContent?.trim() === 'Batal',
        );
        assert((await confirmation.innerText()).includes(message));
        await confirmation
            .getByRole('button', { name: action, exact: true })
            .waitFor();
        if (action === 'Ambil Alih Tugas') {
            await checkWorkLayout(page, 'Konfirmasi ambil alih');
            await capture(
                page,
                '03d-ambil-alih',
                'Konfirmasi pengambilalihan dengan petugas sebelumnya',
            );
        }
        await confirmation
            .getByRole('button', { name: 'Batal', exact: true })
            .click();
        await confirmation.waitFor({ state: 'hidden' });
        await page.waitForFunction(
            (label) =>
                document.activeElement?.tagName === 'BUTTON' &&
                document.activeElement?.textContent?.trim() === label,
            action,
        );
        await page
            .getByRole('button', { name: 'Kembali', exact: true })
            .click();
        await pickupTabs.waitFor();
    }
    await page.unroute(availablePattern, availableHandler);
    await pickupTabs
        .getByRole('button', { name: 'Tugas Saya', exact: true })
        .click();
    await page.getByRole('button', { name: /Customer UAT PWA/ }).waitFor();
    results.push(
        'Aksi pickup manual tersedia pada tiga tab; ambil tugas dan ambil alih memiliki konteks kepemilikan dan konfirmasi berbeda (fixture respons UI)',
    );
    await page
        .getByRole('button', { name: 'Filter & Urutan', exact: true })
        .click();
    await page
        .getByLabel('Jenis pickup', { exact: true })
        .selectOption('on_demand');
    await page.getByLabel('Jenis pickup', { exact: true }).selectOption('');
    await page.getByRole('button', { name: /Customer UAT PWA/ }).waitFor();
    await capture(
        page,
        '03a-filter-pickup',
        'Filter pickup menggunakan kontrol bersama',
    );
    await page
        .getByRole('button', { name: 'Tutup Filter', exact: true })
        .click();
    await page.getByRole('button', { name: /Customer UAT PWA/ }).click();
    const extra = page
        .locator('summary[data-slot="disclosure-summary"]')
        .filter({ hasText: 'Informasi tambahan' });
    await extra.focus();
    await extra.press('Enter');
    await page.getByText('Referensi', { exact: true }).waitFor();
    await capture(
        page,
        '03b-detail-pickup',
        'Disclosure detail pickup terbuka melalui keyboard',
    );
    await extra.press('Space');
    await page
        .getByRole('button', { name: 'Kerjakan Pickup', exact: true })
        .click();
    await page
        .getByRole('button', { name: 'Mulai Pickup', exact: true })
        .click();
    await page
        .getByRole('radio', { name: 'Paket berhasil diambil', exact: true })
        .click();
    await page
        .getByRole('button', { name: 'Simpan Hasil Kunjungan', exact: true })
        .click();
    await page
        .getByLabel('Manual Hybrid Non-Cashless', { exact: true })
        .fill('1');
    await page
        .getByRole('button', { name: 'Lanjut ke Foto', exact: true })
        .click();
    await page
        .getByRole('button', { name: 'Tambah Foto', exact: true })
        .click();
    const choosing = page.waitForEvent('filechooser');
    await page
        .getByRole('button', { name: 'Pilih dari Galeri', exact: true })
        .click();
    await (
        await choosing
    ).setFiles({
        name: 'evidence.png',
        mimeType: 'image/png',
        buffer: await fs.readFile('resources/mobile/pwa/icon-512.png'),
    });
    await page
        .getByRole('button', { name: 'Preview Foto 1', exact: true })
        .waitFor();
    await capture(page, '04-foto', 'Foto bukti fixture pada wizard pickup');
    await page
        .getByRole('button', { name: 'Lanjut ke Tanda Tangan', exact: true })
        .click();
    const surface = await page
        .getByLabel('Area tanda tangan customer')
        .boundingBox();
    assert(surface);
    await page.mouse.move(surface.x + 20, surface.y + 55);
    await page.mouse.down();
    await page.mouse.move(surface.x + 160, surface.y + 85, { steps: 15 });
    await page.mouse.move(surface.x + 90, surface.y + 115, { steps: 8 });
    await page.mouse.up();
    await checkWorkLayout(page, 'Tanda tangan');
    await capture(page, '05-tanda-tangan', 'Tanda tangan customer');
    const notesToggle = page.getByRole('button', {
        name: 'Catatan pickup (opsional)',
        exact: true,
    });
    assert.equal(await notesToggle.getAttribute('aria-expanded'), 'false');
    await notesToggle.focus();
    await notesToggle.press('Enter');
    const notes = page.getByLabel('Catatan pickup (opsional)', { exact: true });
    await notes.fill('Catatan fixture UAT');
    await capture(
        page,
        '05a-catatan-terbuka',
        'Catatan pickup dibuka melalui keyboard',
    );
    await notesToggle.click();
    await notes.waitFor({ state: 'hidden' });
    await notesToggle.click();
    assert.equal(await notes.inputValue(), 'Catatan fixture UAT');
    await notesToggle.click();
    await page.getByRole('button', { name: 'Review POP', exact: true }).click();
    await capture(page, '06-review-pop', 'Review Proof of Pickup');
    let proofWrites = 0;
    await page.route(
        `${base}/m/api/v1/pickup-tasks/${data.task}/proof`,
        async (route) => {
            proofWrites++;
            const response = await route.fetch();
            assert.equal(response.status(), 201);
            await route.abort('failed');
        },
    );
    await page
        .getByRole('button', { name: 'Selesaikan Pickup', exact: true })
        .click();
    await page
        .getByRole('button', { name: 'Ya, Selesaikan Pickup', exact: true })
        .click();
    await page
        .getByText('POP telah dikonfirmasi server.', { exact: true })
        .waitFor();
    await page
        .getByText(
            'Hasil pengiriman belum dapat dipastikan. Data dan bukti tetap tersimpan. Pilih Periksa Hasil POP.',
            { exact: true },
        )
        .waitFor({ state: 'hidden' });
    assert.equal(proofWrites, 1);
    const finalized = await (
        await context.request.get(`${base}/m/api/v1/pickup-tasks/${data.task}`)
    ).json();
    assert.equal(finalized.data.proof.attachments.length, 2);
    results.push(
        'Wizard pickup, foto, tanda tangan, dan POP; respons hilang dipulihkan tanpa duplikasi kirim',
    );
    await page.getByRole('button', { name: 'Kembali', exact: true }).click();
    await page.getByRole('button', { name: 'Kembali', exact: true }).click();
    await nav.getByRole('button', { name: 'Laporan', exact: true }).click();
    await page.getByRole('heading', { name: 'Riwayat pickup saya' }).waitFor();
    await page.getByRole('button', { name: /Buku Cashless PWA/ }).waitFor();
    await capture(page, '07-laporan', 'Laporan dan riwayat pribadi');
    await checkWorkLayout(page, 'Laporan');
    await nav.getByRole('button', { name: 'Handover', exact: true }).click();
    await page
        .getByRole('button', { name: 'Buat Handover', exact: true })
        .waitFor();
    await capture(page, '08-handover', 'Halaman handover');
    await checkWorkLayout(page, 'Handover');
    results.push(
        'Laporan pribadi dan halaman handover menggunakan backend asli',
    );
    await nav.getByRole('button', { name: 'Scan AWB', exact: true }).click();
    await page.getByRole('button', { name: /Buku Cashless PWA/ }).click();
    const awb = page.getByRole('textbox', {
        name: 'Scan atau ketik nomor resi',
        exact: true,
    });
    await awb.fill('TG1234567890');
    await awb.press('Enter');
    await page
        .getByRole('button', { name: 'Keluarkan TG1234567890', exact: true })
        .waitFor();
    await awb.fill('TG1234567890');
    await awb.press('Enter');
    await page
        .getByText(/sudah.*(dipindai|terdaftar|draft)|duplikat/i)
        .first()
        .waitFor();
    assert.equal(
        await page
            .getByRole('button', {
                name: 'Keluarkan TG1234567890',
                exact: true,
            })
            .count(),
        1,
    );
    await page
        .getByRole('button', { name: 'Scan dengan kamera', exact: true })
        .click();
    await page
        .getByText(/Izin kamera ditolak|Kamera belum dapat dibuka/)
        .waitFor();
    await page
        .getByRole('button', { name: 'Tutup kamera', exact: true })
        .click();
    results.push(
        'AWB valid, duplikat ditolak, izin kamera gagal memiliki jalur pemulihan',
    );
    const cameraAwb = 'TG1234567891';
    const symbols = cameraAwb
        .split('')
        .map((character) => character.charCodeAt(0) - 32);
    const checksum =
        (104 +
            symbols.reduce(
                (sum, symbol, index) => sum + symbol * (index + 1),
                0,
            )) %
        103;
    const bars = [104, ...symbols, checksum, 106].map((symbol) =>
        Array.from(Code128Reader.CODE_PATTERNS[symbol]),
    );
    await page.evaluate((patterns) => {
        window.retailStoppedTracks = 0;
        Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
            configurable: true,
            value: async () => {
                const canvas = document.createElement('canvas');
                canvas.width = 960;
                canvas.height = 540;
                const drawing = canvas.getContext('2d');
                drawing.fillStyle = 'white';
                drawing.fillRect(0, 0, 960, 540);
                const size =
                    patterns.flat().reduce((sum, width) => sum + width, 0) * 3;
                let x = Math.floor((960 - size) / 2);
                for (const pattern of patterns) {
                    let black = true;
                    for (const width of pattern) {
                        if (black) {
                            drawing.fillStyle = 'black';
                            drawing.fillRect(x, 150, width * 3, 230);
                        }
                        x += width * 3;
                        black = !black;
                    }
                }
                const stream = canvas.captureStream(5);
                for (const track of stream.getTracks()) {
                    const stop = track.stop.bind(track);
                    track.stop = () => {
                        window.retailStoppedTracks++;
                        stop();
                    };
                }
                return stream;
            },
        });
    }, bars);
    await page
        .getByRole('button', { name: 'Scan dengan kamera', exact: true })
        .click();
    await page.getByText(cameraAwb, { exact: true }).first().waitFor();
    await capture(
        page,
        '09-kamera',
        'Pemindaian Code 128 dari kamera sintetis',
        false,
    );
    await page
        .getByRole('button', { name: 'Tutup kamera', exact: true })
        .click();
    await page
        .getByRole('button', { name: `Keluarkan ${cameraAwb}`, exact: true })
        .waitFor();
    assert.equal(
        await page
            .getByRole('button', {
                name: `Keluarkan ${cameraAwb}`,
                exact: true,
            })
            .count(),
        1,
    );
    assert((await page.evaluate(() => window.retailStoppedTracks)) >= 1);
    await checkWorkLayout(page, 'Scan AWB');
    await capture(
        page,
        '10-scan-awb',
        'Draft AWB setelah input manual dan pemindaian',
    );
    results.push(
        'Decoder kamera membaca Code 128 dari stream sintetis, menolak frame duplikat, dan menghentikan track',
    );
    await context.setOffline(true);
    await page.getByText('Tidak ada koneksi', { exact: true }).waitFor();
    await capture(
        page,
        '11-offline',
        'Draft tetap terlihat saat koneksi terputus',
    );
    await context.setOffline(false);
    await page
        .getByText('Tidak ada koneksi', { exact: true })
        .waitFor({ state: 'hidden' });
    assert.equal(
        await page
            .getByRole('button', {
                name: 'Keluarkan TG1234567890',
                exact: true,
            })
            .count(),
        1,
    );
    results.push(
        'Gangguan jaringan mempertahankan draft di memori tanpa pengiriman otomatis',
    );
    await fs.writeFile(path.join(output, 'worker-update'), 'fixture-only');
    await page.evaluate(async () =>
        (await navigator.serviceWorker.getRegistration()).update(),
    );
    await page.getByText('Versi baru tersedia.', { exact: true }).waitFor();
    page.once('dialog', (dialog) => dialog.dismiss());
    await page
        .getByRole('button', { name: 'Muat versi baru', exact: true })
        .click();
    assert.equal(
        await page
            .getByRole('button', {
                name: 'Keluarkan TG1234567890',
                exact: true,
            })
            .count(),
        1,
    );
    results.push(
        'Pembaruan PWA menunggu persetujuan dan tidak menghapus draft secara otomatis',
    );
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Kembali', exact: true }).click();
    await nav.getByRole('button', { name: 'Profil', exact: true }).click();
    await page.getByText('Pasang di Home Screen', { exact: true }).click();
    await page
        .getByText('Tekan Bagikan, lalu Tambahkan ke Layar Utama.', {
            exact: true,
        })
        .waitFor();
    await capture(
        page,
        '12-profil-instalasi',
        'Profil dan panduan pemasangan iPhone',
    );
    await page.getByRole('button', { name: 'Keluar', exact: true }).click();
    await page.getByRole('button', { name: 'Masuk', exact: true }).waitFor();
    page.once('dialog', (dialog) => dialog.accept());
    await page
        .getByRole('button', { name: 'Muat versi baru', exact: true })
        .click();
    await page.waitForEvent('load');
    await page.getByRole('button', { name: 'Masuk', exact: true }).waitFor();
    const cached = await page.evaluate(async () => {
        const values = [];
        for (const name of await caches.keys())
            if (name.startsWith('retail-shell-')) {
                for (const request of await (await caches.open(name)).keys())
                    values.push(new URL(request.url).pathname);
            }
        return values;
    });
    assert(
        cached.length > 4 &&
            cached.every((value) => value.startsWith('/retail/')),
    );
    assert(!cached.some((value) => /api|login|evidence/.test(value)));
    assert.deepEqual(
        await page.evaluate(() =>
            Object.keys(localStorage).filter(
                (key) => !key.startsWith('retail-scanner-feedback'),
            ),
        ),
        [],
    );
    results.push(
        'Logout, panduan instalasi, dan cache hanya berisi aset publik',
    );
    await page.getByLabel('Email operasional').fill('pwa-other@example.test');
    await page.getByLabel('Password', { exact: true }).fill('password');
    await page.getByRole('button', { name: 'Masuk', exact: true }).click();
    await nav.waitFor();
    await nav.getByRole('button', { name: 'Scan AWB', exact: true }).click();
    await page
        .getByText('Tidak ada buku pickup sesuai pencarian.', { exact: true })
        .waitFor();
    assert.equal(
        await page
            .getByRole('button', {
                name: 'Keluarkan TG1234567890',
                exact: true,
            })
            .count(),
        0,
    );
    await page.evaluate(async () => {
        const token = document.cookie
            .split('; ')
            .find((cookie) => cookie.startsWith('XSRF-TOKEN='))
            .slice(11);
        await fetch('/logout', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json',
                'X-XSRF-TOKEN': decodeURIComponent(token),
            },
        });
        document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.getByRole('button', { name: 'Masuk', exact: true }).waitFor();
    results.push(
        'Pergantian akun tidak mewarisi draft; sesi berakhir saat foreground kembali ke login',
    );
    for (const [email, canCreate] of [
        ['pwa-supervisor@example.test', true],
        ['pwa-retail@example.test', false],
    ]) {
        await page.getByLabel('Email operasional').fill(email);
        await page.getByLabel('Password', { exact: true }).fill('password');
        await page.getByRole('button', { name: 'Masuk', exact: true }).click();
        await nav.waitFor();
        await nav.getByRole('button', { name: 'Pickup', exact: true }).click();
        await pickupTabs.waitFor();
        if (canCreate) {
            await manualButton.waitFor();
            await capture(
                page,
                '13-supervisor-pickup',
                'Aksi buat pickup tersedia untuk Supervisor',
            );
            await manualButton.click();
            await page
                .getByRole('region', { name: 'Buat Pickup Manual' })
                .waitFor();
            const customerTrigger = page.locator('#manual-customer');
            await customerTrigger.waitFor();
            await checkWorkLayout(page, 'Form pickup dengan combobox customer');
            assert.equal(customerQueries.length, 0);
            await capture(
                page,
                '13a-form-pickup-ringkas',
                'Form pickup tanpa daftar seluruh customer',
            );
            await customerTrigger.click();
            const customerDialog = page.getByRole('dialog', {
                name: 'Pilih Customer',
                exact: true,
            });
            const customerSearch = customerDialog.getByRole('combobox', {
                name: 'Cari customer',
                exact: true,
            });
            await customerDialog
                .getByText('Ketik minimal 2 karakter untuk mencari customer.', {
                    exact: true,
                })
                .waitFor();
            await customerSearch.fill('C');
            await page.waitForTimeout(350);
            assert.equal(customerQueries.length, 0);
            await customerSearch.fill('zz-no-customer-uat');
            await customerDialog
                .getByText('Customer tidak ditemukan. Periksa nama.', {
                    exact: true,
                })
                .waitFor();
            const failCustomerSearch = (route) =>
                route.fulfill({
                    status: 503,
                    json: { message: 'Fixture pencarian gagal' },
                });
            await page.route('**/m/api/v1/customers?*', failCustomerSearch);
            await customerSearch.fill('gagal');
            await customerDialog.getByRole('alert').waitFor();
            await page.unroute('**/m/api/v1/customers?*', failCustomerSearch);
            const customerResponse = page.waitForResponse(
                (response) =>
                    new URL(response.url()).pathname ===
                        '/m/api/v1/customers' &&
                    new URL(response.url()).searchParams.get('q') ===
                        'Customer',
            );
            await customerSearch.fill('Customer');
            const matchingCustomer = (await (await customerResponse).json())
                .data[0];
            await customerDialog
                .getByRole('option', { name: /Customer UAT PWA/ })
                .waitFor();
            await checkWorkLayout(page, 'Pencarian customer di dialog');
            await capture(
                page,
                '13b-pencarian-customer',
                'Combobox customer dengan hasil pencarian server',
            );
            await customerSearch.press('ArrowDown');
            await customerSearch.press('Enter');
            await customerDialog.waitFor({ state: 'hidden' });
            assert.match(await customerTrigger.innerText(), /Customer UAT PWA/);
            assert.equal(
                await page
                    .getByLabel('Alamat Pickup', { exact: true })
                    .inputValue(),
                matchingCustomer.pickup_address,
            );
            await customerTrigger.click();
            await customerSearch.fill('batal-pilih-customer');
            await customerSearch.press('Escape');
            await customerDialog.waitFor({ state: 'hidden' });
            assert.equal(
                await page
                    .getByLabel('Alamat Pickup', { exact: true })
                    .inputValue(),
                matchingCustomer.pickup_address,
            );
            await page
                .getByLabel('Jadwal', { exact: false })
                .fill('2026-11-17T09:00');
            await page
                .getByLabel('Alasan / Catatan (wajib)', { exact: true })
                .fill('Pickup dibuat Supervisor melalui PWA');
            await checkWorkLayout(page, 'Form pickup Supervisor');
            const createdResponse = page.waitForResponse(
                (response) =>
                    new URL(response.url()).pathname ===
                        '/m/api/v1/pickup-tasks' &&
                    response.request().method() === 'POST',
            );
            await page
                .getByRole('button', { name: 'Buat Pickup', exact: true })
                .click();
            const response = await createdResponse;
            assert.equal(response.status(), 201);
            const created = (await response.json()).data;
            assert.equal(created.status, 'SCHEDULED');
            assert.equal(created.assigned_staff, null);
            assert.equal(created.can.execute, false);
            await page
                .getByRole('heading', { name: 'Detail Pickup', exact: true })
                .waitFor();
            assert.equal(
                await page
                    .getByRole('button', {
                        name: 'Kerjakan Pickup',
                        exact: true,
                    })
                    .count(),
                0,
            );
            await capture(
                page,
                '14-supervisor-pickup-dibuat',
                'Pickup Supervisor tersimpan dan menunggu penugasan',
            );
            await page
                .getByRole('button', { name: 'Kembali', exact: true })
                .click();
        } else {
            assert.equal(await manualButton.count(), 0);
        }
        await nav.getByRole('button', { name: 'Profil', exact: true }).click();
        await page.getByRole('button', { name: 'Keluar', exact: true }).click();
        await page
            .getByRole('button', { name: 'Masuk', exact: true })
            .waitFor();
    }
    results.push(
        'Supervisor membuat pickup manual melalui cookie dan CSRF backend nyata; hasil SCHEDULED tanpa penugasan atau izin eksekusi. Tombol tetap tersembunyi untuk Retail',
    );
    results.push(
        'Combobox customer tidak meminta daftar awal atau kueri satu karakter; hasil kosong dan kegagalan dapat dipulihkan, pemilihan keyboard mengisi alamat, pembatalan mempertahankan pilihan',
    );
    await context.setOffline(true);
    await page.reload();
    await page.getByRole('button', { name: 'Masuk', exact: true }).waitFor();
    await page.getByText('Tidak ada koneksi', { exact: true }).waitFor();
    results.push(
        'Application shell dapat dibuka offline tanpa data pengguna tersimpan',
    );
    assert.deepEqual(errors, []);
    await fs.writeFile(
        path.join(output, 'results.json'),
        JSON.stringify(
            {
                fixture: data,
                results,
                errors,
                screenshots,
                physicalDevices: 'BELUM DIUJI',
                webkit: 'BELUM DIUJI: runtime tidak tersedia',
            },
            null,
            2,
        ),
    );
    console.log(
        JSON.stringify({ output, results, errors, screenshots }, null, 2),
    );
    await context.close();
} catch (error) {
    if (testPage && !testPage.isClosed())
        await fs.writeFile(
            path.join(output, 'failure.txt'),
            await testPage.locator('body').innerText(),
        );
    throw error;
} finally {
    await browser?.close();
    server.kill();
}
