# Audit konsistensi kontrol UI — 11 November 2026

Permintaan: seluruh UI perlu mengikuti preferensi operasional pengguna, terutama menghindari disclosure berupa segitiga kecil dan teks samar, kontrol form yang dirakit berbeda-beda, serta instruksi berulang di area kerja.

## Cakupan

Inventaris AST mencakup 180 file TSX aplikasi: 160 file web, termasuk 43 halaman Inertia, dan 20 file UI mobile/shared workspace. Layout, navigasi, komponen operasional, formulir, dan pengaturan termasuk cakupan. File route hasil generate, primitive UI, unit test, dependency, dan artefak build dipisahkan dari inventaris halaman. Template Blade diperiksa untuk pola kontrol yang sama; tidak ditemukan details/summary/select/textarea pada template tersebut. Email dan PDF bukan sasaran perombakan visual ini.

Pemeriksaan browser memakai Chromium dan database SQLite fixture terisolasi. Tidak ada pengujian tulis pada data operasional, penarikan laporan eksternal, atau deployment. Screenshot merupakan data sintetis.

## Temuan dan perbaikan

| Temuan                      | Sebelum                                                                                               | Perbaikan                                                                                                                                                                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Disclosure tersebar         | 74 pasangan details/summary pada 37 file; ukuran, marker, padding, warna, dan indikator tidak seragam | Migrasi ke Disclosure/DisclosureSummary bersama: baris sentuh minimal 44 px, fokus terlihat, chevron kanan, konten terpisah, dan token tema. Dua trigger yang sudah memiliki indikator memakai varian plain tanpa chevron ganda. |
| Select visual tidak seragam | 28 select terlihat menggunakan kelas lokal                                                            | NativeSelect bersama dengan ruang khusus chevron, fokus, disabled, dan validasi. Picker pilihan tetap mengikuti platform; props, option value, dan onChange tetap digunakan.                                                     |
| Checkbox                    | 15 checkbox dengan styling per halaman atau tanpa styling                                             | NativeCheckbox dengan ukuran dan fokus seragam. Label diberi target sentuh minimal 44 px bila belum tersedia. Kontrak checked, disabled, dan onChange dipertahankan.                                                             |
| Textarea                    | 17 textarea ditulis langsung                                                                          | Memakai Textarea proyek yang sudah tersedia; label, ref, batas panjang, value, dan handler tetap diteruskan.                                                                                                                     |
| Filter pickup mobile        | Nama aksesibel pilihan tidak tegas; status menampilkan kode backend                                   | Nama kontrol dibuat eksplisit. Label status memakai pemetaan operasional yang sudah ada; value backend tetap sama.                                                                                                               |
| Laporan pada lebar 320 px   | Tombol sumber “Retail PM / Puman” meluber hingga sekitar 333 px                                       | Grup sumber mengikuti lebar kontainer; label boleh membungkus dan padding menyesuaikan breakpoint.                                                                                                                               |
| Override CSS disclosure     | Aturan khusus mobile dapat menghasilkan indikator tambahan dan perbedaan antar-platform               | Aturan lama dihapus; penampilan ditangani komponen bersama.                                                                                                                                                                      |
| Regresi di masa depan       | Tidak ada pemeriksaan konvensi kontrol bersama                                                        | ui-conventions.test.ts memeriksa seluruh sumber UI dan menolak details/summary/textarea/select visual serta checkbox mentah di luar primitive. Dijalankan pula oleh test:mobile.                                                 |

Perbaikan mencakup 51 file aplikasi yang sudah ada, tiga primitive bersama, dan pengujian. SecondaryDisclosure berbasis Radix yang sebelumnya tersedia tetap dipakai untuk panel sederhana. Disclosure berbasis HTML native dipakai saat kode lama membutuhkan HTMLDetailsElement, open, ref, atau onToggle; API DOM tersebut dipertahankan.

Satu select sr-only pada adapter hasil kunjungan tetap tersembunyi dan tidak termasuk kontrol visual. Satu pilihan radio perangkat notifikasi sudah memiliki label serta baris sentuh besar. Keduanya bukan disclosure mentah yang terlihat seperti contoh keluhan.

## Verifikasi

- Unit frontend web: 394 tes lulus pada 29 file.
- Unit mobile/shared: 317 tes lulus pada 20 file. Sebagian tes shared juga terdapat dalam run web; dua angka ini tidak dijumlahkan sebagai tes unik.
- TypeScript web dan mobile: lulus.
- Lint perubahan aplikasi: lulus. Primitive UI mengikuti pengecualian lint/format proyek yang sudah ada.
- Build web, PWA, dan frontend Android: lulus. Peringatan ukuran chunk PWA dan optional font fallback tooling masih ada; tidak ada dependency baru.
- Browser PWA: 11 kelompok skenario lulus, termasuk penggunaan filter, membuka disclosure dengan keyboard, menjaga isi catatan ketika panel ditutup, foto, tanda tangan, POP, AWB, pemulihan jaringan, sesi, isolasi akun, dan update PWA. Kamera menggunakan stream sintetis.
- Browser web: 212 tampilan dari 53 kasus halaman/peran/dialog pada lebar 320, 390, 768, dan 1366 px lulus pemeriksaan overflow, label kontrol terlihat, serta ketiadaan error JavaScript. Empat respons 404 merupakan kasus halaman tidak ditemukan yang disengaja; 208 respons lainnya 200. Fixture tidak menghasilkan kegagalan pembukaan kasus.
- Tema dan interaksi: delapan sampel light/dark pada kebijakan tracking, detail shipment, collection, dan editor bukti lulus. Disclosure dibuka dengan Enter dan ditutup dengan Space; select di editor bukti menerima perubahan nilai. Ini bukan pengujian kontras numerik atau semua kombinasi data.

Perintah utama:

```text
npm run test:mobile
node node_modules/vite-plus/bin/vp test run resources/js/lib
npm run types:check
npm run build
npm run build:mobile
node tests/Browser/retail-pwa.mjs
node tests/Browser/ui-ux-review.mjs
```

Untuk ui-ux-review.mjs, gunakan fixture tests/Fixtures/ui-ux-browser.php dan server tests/Fixtures/ui-ux-browser-server.php. APP_ENV harus testing, database baru harus berada di output, dan UI_UX_BASE_URL harus loopback. Set UI_UX_FIXTURE_IDS, UI_UX_EVIDENCE_DIR, serta UI_UX_PHASE=after. Control Center menggunakan direktori telemetry fixture tersendiri di output. Jangan menjalankannya terhadap environment operasional.

## Bukti dan batas verifikasi

- Inventaris sebelum dan snapshot sumber: output/ui-consistency-audit/inventory-before.json dan subdirektori before.
- Daftar migrasi: output/ui-consistency-audit/migration.json.
- Bukti web: output/ui-consistency-audit/browser-1794397446871/after-results.json dan subdirektori after.
- Bukti tema/interaksi: output/ui-consistency-audit/browser-1794397446871/theme-interactions.json dan screenshot light-/dark-.
- Bukti PWA: output/retail-pwa-1794398269912/results.json beserta screenshot.
- Run awal web menemukan overflow laporan; initial-results.json dan reports-320-before-fix.png disimpan terpisah dari hasil ulang.

Pemeriksaan otomatis nama kontrol dan overflow tidak setara sertifikasi aksesibilitas atau pengujian semua kombinasi data. Tema gelap dan interaksi panel disampel terpisah. State seperti kegagalan layanan eksternal, daftar device FCM nyata, izin kamera fisik, VoiceOver/TalkBack, dan seluruh variasi role/data memerlukan UAT yang sesuai. iPhone Safari/PWA dan APK Android fisik belum diuji. Dialog konfirmasi sistem untuk proteksi draft dan picker sistem tetap mengikuti platform; alur pengaman tersebut tidak dihapus hanya untuk menyamakan tampilan.

## Aturan UI berikutnya

Gunakan kontrol bersama dari components/ui atau SecondaryDisclosure. Jangan menambahkan details/summary, select visual, checkbox, atau textarea mentah pada halaman. Judul dan tindakan kerja utama harus terlihat lebih dahulu; bantuan, metadata teknis, dan audit diletakkan di panel yang jelas. Error yang bisa ditindaklanjuti tetap terlihat. Setiap perubahan kontrol harus mempertahankan label, keyboard, nilai form, recovery, otorisasi, dan aturan bisnisnya.

## Matriks halaman dan state browser

Setiap baris diperiksa pada empat viewport di atas. Hasil menilai render, overflow, label kontrol terlihat, dan error JavaScript; bukan penyelesaian semua transaksi pada halaman tersebut.

| Kasus                   | Route fixture                                                             | Peran            | Hasil               |
| ----------------------- | ------------------------------------------------------------------------- | ---------------- | ------------------- |
| welcome                 | /                                                                         | Publik           | Lulus               |
| login                   | /login                                                                    | Publik           | Lulus               |
| forgot-password         | /forgot-password                                                          | Publik           | Lulus               |
| reset-password          | /reset-password/audit-invalid?email=audit-admin_supervisor%40example.test | Publik           | Lulus               |
| dashboard-admin         | /dashboard                                                                | admin_supervisor | Lulus               |
| dashboard-cs            | /dashboard                                                                | cs               | Lulus               |
| dashboard-retail        | /dashboard                                                                | retail_staff     | Lulus               |
| dashboard-pickup        | /dashboard                                                                | pickup_staff     | Lulus               |
| it-control-center       | /admin/it-control-center                                                  | admin_supervisor | Lulus               |
| operational-performance | /admin/operational-performance                                            | admin_supervisor | Lulus               |
| tracking-workspace      | /admin/shipment-monitoring                                                | admin_supervisor | Lulus               |
| tracking-overview       | /admin/shipment-monitoring/overview                                       | admin_supervisor | Lulus               |
| tracking-attention      | /admin/shipment-monitoring/attention                                      | admin_supervisor | Lulus               |
| tracking-detail         | /admin/shipment-monitoring/1                                              | admin_supervisor | Lulus               |
| customers               | /operations/customers                                                     | admin_supervisor | Lulus               |
| tasks                   | /operations/tasks                                                         | admin_supervisor | Lulus               |
| mine                    | /operations/mine                                                          | pickup_staff     | Lulus               |
| available               | /operations/available                                                     | pickup_staff     | Lulus               |
| pickup-history          | /operations/mine?history=1                                                | pickup_staff     | Lulus               |
| create-pickup           | /operations/create                                                        | cs               | Lulus               |
| task-detail             | /operations/detail/3                                                      | admin_supervisor | Lulus               |
| users                   | /operations/users                                                         | admin_supervisor | Lulus               |
| pickup-wizard           | /operations/execute/2                                                     | pickup_staff     | Lulus               |
| schedules               | /pickup-schedules                                                         | admin_supervisor | Lulus               |
| results-processing      | /hasil-pickup                                                             | admin_supervisor | Lulus               |
| results-pickup          | /hasil-pickup?monitoring=pickup                                           | admin_supervisor | Lulus               |
| result-detail           | /hasil-pickup/3                                                           | admin_supervisor | Lulus               |
| handovers               | /handover                                                                 | admin_supervisor | Lulus               |
| handover-history        | /handover?history=1                                                       | retail_staff     | Lulus               |
| handover-detail         | /handover/1                                                               | retail_staff     | Lulus               |
| discrepancies           | /discrepancies                                                            | admin_supervisor | Lulus               |
| customer-dashboard      | /admin/jne-monitoring/customer-dashboard                                  | admin_supervisor | Lulus               |
| shipments               | /admin/jne-monitoring                                                     | admin_supervisor | Lulus               |
| shipment-detail         | /admin/jne-monitoring/1                                                   | admin_supervisor | Lulus               |
| reconciliation          | /admin/jne-monitoring/reconciliation                                      | admin_supervisor | Lulus               |
| profiles                | /admin/jne-monitoring/profiles                                            | admin_supervisor | Lulus               |
| reports                 | /admin/jne-reports                                                        | admin_supervisor | Lulus               |
| report-runs             | /admin/report-runs                                                        | admin_supervisor | Lulus               |
| report-awbs             | /admin/jne-reports/1/awbs                                                 | admin_supervisor | Lulus               |
| shipper-aliases         | /admin/jne-shipper-aliases                                                | admin_supervisor | Lulus               |
| evidence-rules          | /admin/jne-monitoring/evidence-rules                                      | admin_supervisor | Lulus               |
| exceptions              | /admin/jne-monitoring/exceptions                                          | admin_supervisor | Lulus               |
| collection-window       | /admin/jne-monitoring/collections/3                                       | admin_supervisor | Lulus               |
| refresh-policy          | /admin/jne-monitoring/refresh-policies                                    | admin_supervisor | Lulus               |
| push-test               | /admin/push-test                                                          | admin_supervisor | Lulus               |
| profile                 | /settings/profile                                                         | admin_supervisor | Lulus               |
| security                | /settings/security                                                        | admin_supervisor | Lulus               |
| appearance              | /settings/appearance                                                      | admin_supervisor | Lulus               |
| confirm-password        | /user/confirm-password                                                    | admin_supervisor | Lulus               |
| not-found               | /ui-ux-review-missing-page                                                | Publik           | 404 yang diharapkan |
| customer-dialog         | /operations/customers                                                     | admin_supervisor | Lulus               |
| schedule-dialog         | /pickup-schedules                                                         | admin_supervisor | Lulus               |
| evidence-sheet          | /admin/jne-monitoring/evidence-rules                                      | admin_supervisor | Lulus               |
