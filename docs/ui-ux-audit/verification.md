# Verification, Evidence, and Limitations

Tanggal audit: **24 Oktober 2026**, zona waktu operasional aplikasi Asia/Jakarta. Audit dijalankan dari `S:/2026/dust` pada working copy yang tersedia. Ini audit source dan browser dengan data sintetis; bukan usability study, penetration test, load test, atau sertifikasi WCAG.

## Integritas dan ruang lingkup

- Commit HEAD saat audit: `56dd4db2636bfc4fd702d3d8569230d09bb4eb26`.
- Empat file aplikasi sudah berubah sebelum audit: `password-input.tsx`, `auth-simple-layout.tsx`, `auth/login.tsx`, dan `welcome.tsx`. Audit menilai versi working copy tersebut dan tidak mengembalikan/mengubahnya.
- **284 file sumber** dalam baseline frontend, routes, dan controllers dibandingkan kembali menggunakan SHA-256: **0 berubah, 0 hilang**. Lihat [source-integrity.json](evidence/source-integrity.json) dan [baseline](evidence/source-baseline.json).
- Output pekerjaan berada di `docs/ui-ux-audit/`; script audit, fixture SQLite, dan file sementara berada di `output/ui-ux-audit/`. Tidak ada dependency, route, permission, migration aplikasi, atau backend logic yang diubah.
- Tidak menjalankan git commit/push untuk dokumen audit ini.
- Tidak menjalankan seluruh test suite aplikasi karena tidak ada perubahan behavior aplikasi. Browser interaction checks dan source review bukan pengganti regression suite untuk implementasi mendatang.
- Webserver sementara khusus audit sudah dihentikan setelah pengujian; tidak ada listener audit yang tertinggal pada port yang dipakai.

## Skill dan referensi yang benar-benar dibaca

Kedua skill yang diminta tersedia dan digunakan. Tidak ada skill yang dipalsukan atau dianggap terpasang hanya dari namanya.

| Skill / bahan | Lokasi atau sumber | Cara dipakai |
| --- | --- | --- |
| web-design-guidelines | `C:/Users/copol/.codex/skills/web-design-guidelines/SKILL.md` | SKILL.md dibaca; sumber pedoman terbaru di-fetch untuk audit; temuan memiliki indeks ringkas file:line |
| Vercel Web Interface Guidelines | [command.md](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) | Dasar audit labels, keyboard, forms, URL state, feedback, responsive, contrast, motion dan recovery; tidak disalin penuh ke laporan |
| ui-ux-pro-max | `C:/Users/copol/.codex/skills/ui-ux-pro-max/SKILL.md` | SKILL.md dibaca; kategori prioritas dan kontrak pencarian diterapkan pada masalah spesifik |
| UI/UX supporting references | Skill directory: `references/quick-reference.md`, `references/pro-rules.md` | Semua kategori quick-reference dan pro-rules diperiksa; rekomendasi native/mobile dipisahkan dari persyaratan web |
| UI/UX targeted search | Script lokal skill; query `error summary validation` domain ux, `focus not obscured` domain ux, `keyboard table filtering` stack shadcn | Hasil relevan diverifikasi sebelum digunakan; tidak menghasilkan design direction baru karena ini audit, bukan redesign |
| Supporting project skills | shadcn, Tailwind CSS development, Inertia React development, agent-browser | Referensi composition/forms/styling/base-vs-Radix/icons dan konvensi frontend membantu menilai versi aktual; CLI agent-browser tidak tersedia, sehingga fallback yang sudah terpasang digunakan |

Tidak menganggap semua rekomendasi skill sebagai persyaratan WCAG. Misalnya ukuran target native 44/48 berbeda dari minimum AA web 24 CSS px beserta pengecualiannya. Preferensi estetika diberi label C, bukan defect objektif.

Referensi primer tambahan yang diperiksa:

- [W3C Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html): teks normal 4,5:1; kategori large text dan pengecualian diperhitungkan.
- [W3C Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html): 24×24 CSS px dengan pengecualian spacing, equivalent, inline dan lainnya.
- [W3C Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html): lebar ekuivalen 320 CSS px dan pengecualian konten dua dimensi.
- [W3C Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html): perubahan yang perlu diumumkan tidak selalu sama dengan semua perubahan isi daftar.
- [Inertia v3 manual visits](https://inertiajs.com/docs/v3/the-basics/manual-visits): state preservation dan navigation; dibaca melalui dokumentasi versi yang relevan, bukan asumsi Axios/v2.

## Lingkungan browser dan data

Browser automation tersedia melalui **Playwright 1.64.1** yang sudah merupakan dependency worker proyek. Tidak ada instalasi browser tooling/dependency baru. Chromium headless digunakan dengan reduced-motion preference; tema light ditetapkan untuk baseline. Tema gelap juga diuji melalui tombol asli aplikasi, bukan hanya mengubah class.

Aplikasi pada **localhost port 8000** tidak dapat dijangkau saat dicoba (`ERR_CONNECTION_REFUSED`). Ini tidak dinyatakan sebagai defect produk. Untuk tetap memeriksa route nyata, audit menjalankan instance PHP lokal sementara pada loopback dengan:

- Source dan build aplikasi yang ada.
- Database SQLite terpisah di `output/ui-ux-audit/fixture-complete.sqlite`.
- Environment proses terisolasi, session cookie audit, queue sync, dan cache array.
- Empat akun fixture untuk Admin/Supervisor, CS, Pickup Staff dan Retail Staff. Password fixture tidak dipublikasikan sebagai kredensial aplikasi sebenarnya.
- 28 customer sintetis, termasuk nama panjang; 34 task dengan beberapa status; 12 POP final fixture dalam handover berisi 12 task; contoh pending verification dan selisih; 30 shipment dengan beberapa status/prefix; dua report job; satu profile disabled; jadwal dan alias contoh.

Data dibuat melalui factory/seeding pada database audit terpisah. Tidak ada seeding database bisnis atau perubahan pengguna produksi. Data fixture menunjukkan state UI, bukan kebenaran metrik/amount/tujuan bisnis. Screenshot hanya memuat data sintetis.

### Batas kesetaraan source dan build

Audit tidak menjalankan ulang build agar artefak aplikasi tidak berubah. Manifest build yang tersedia bertimestamp 24 Oktober 2026 pukul 01.18 waktu mesin. Enam file source memiliki timestamp sekitar 17.48: `jne-customer-overview.tsx`, `jne-pull-settings.tsx`, `jne-run-list.tsx`, `jne-run-state.tsx`, `jne-shipment-summary.tsx`, dan `pages/jne-customer-dashboard.tsx`. Lima file pertama berada di `resources/js/components/`.

Timestamp tidak membuktikan isi bundle berbeda, tetapi kesetaraan byte antara source dan bundle untuk area tersebut belum ditetapkan. Source tetap masuk audit; screenshot JNE adalah tampilan bundle yang benar-benar tersedia. Visual sign-off customer analytics, pull settings, run list/state, dan shipment summary perlu diulang terhadap build baru yang disetujui. Jangan menganggap screenshot sebagai bukti setiap perubahan source terbaru sudah tampil. Lihat [build-parity.json](evidence/build-parity.json).

## Viewport dan tema

| Kondisi | Cakupan | Hasil yang dapat disimpulkan |
| --- | --- | --- |
| Desktop 1440×1000 | Seluruh keluarga halaman bisnis, auth dasar, settings, role variants | Render/capture dasar; tidak berarti seluruh mutation dan branch lulus |
| Mobile 375×812 | Dashboard, task/create, user/customer, jadwal, hasil, handover list/detail, shipment, report/settings/history, dialog | Tidak ada overflow dokumen pada ukuran teks normal yang disampel; handover selection memiliki masalah jarak ke panel |
| Tablet 768×1024 | Dashboard, operasi, hasil, handover, shipment | Tidak ada overflow dokumen pada sampel normal; tidak mencakup semua tablet/orientasi |
| Narrow 320×768 | Dashboard, operasi, handover detail, shipment | Tidak ada overflow dokumen pada ukuran teks normal pada empat sampel |
| Landscape 812×375 | Operasional pickup | Dokumen tidak meluber pada sampel; keyboard virtual tidak disimulasikan |
| Light/dark | Enam capture dark berbasis class serta actual header theme toggle pada dashboard | Actual toggle memastikan class dan color-scheme dark; hasil kontras menggunakan state ini setelah transisi selesai |
| Teks diperbesar 200% | Root font-size pada dashboard 375 px | Overflow terukur akibat donut; bukan pengganti browser zoom 200/400% atau seluruh pengujian Reflow |
| Reduced motion | Dialog dengan media preference reduce | Computed animation masih enter 0,2 s; UI-14 |

Tabel yang menggulir horizontal di container sendiri tidak dihitung otomatis sebagai kegagalan layout. Pengukuran overflow dokumen membandingkan scrollWidth dengan innerWidth, bukan penilaian semua teks terpotong atau seluruh tabel dapat dipakai.

## Matriks pengujian state dan interaksi

| Yang diperiksa | Metode / state | Hasil / bukti | Batasan |
| --- | --- | --- | --- |
| Default routes | Navigasi dan screenshot route nyata dengan auth fixture | 59 record dasar, 0 console/page-error event dalam run dasar | Bukan bukti backend/worker tidak mempunyai error lain |
| Role navigation | Login empat role; admin, CS, pickup, retail screens | Sidebar lebih ringkas sesuai role; admin JNE pages terpisah | Tidak melakukan full permission/security test atau seluruh kombinasi role/task |
| Customer search | Query Customer Audit 2, reload | Search bekerja; reload menghapus filter, UI-05 | Back/forward seluruh daftar lain belum diuji |
| Pagination | Customer 28 data, pindah halaman | Pagination bekerja; konteks page tidak masuk URL | Tidak benchmark ratusan ribu row atau 100+ account nyata |
| Long content | Nama customer sangat panjang; alamat/detail, table states | Layout teramati pada desktop/mobile tanpa overflow dokumen normal | Tidak menguji seluruh format AWB/alamat/lang seluruh sistem |
| Loading | GET customer sengaja ditunda oleh browser route gate | Skeleton/loading tertangkap | Latensi **diinjeksi**; bukan pengukuran kecepatan server aktual |
| Error dan recovery | Respons GET customer sengaja diganti HTTP 500, lalu injeksi dilepas dan Muat Ulang | Alert/error/retry muncul dan pemulihan berhasil | Error **diinjeksi**, bukan bug backend yang ditemukan |
| Validasi form | Submit customer nama/alamat tanpa kanal kontak | HTTP 422 asli aplikasi fixture; field invalid, error/fokus/scroll UI-03 | Tidak ada customer baru yang berhasil disimpan dari percobaan invalid |
| Draft close | Isi customer lalu Escape dan buka ulang | Draft kosong tanpa konfirmasi, UI-02 | Browser reproduction pada customer, dialog pickup serupa hanya source review |
| Customer picker | Buka combobox pada Buat Pickup | Dialog bernama, data/page tersedia; asosiasi label caller kurang, UI-09 | Tidak membuat task dari picker |
| Shipment filtered/empty | Status DELIVERED dan query yang sengaja tidak ada | Filtered rows dan empty state tertangkap | Tidak menguji semua kombinasi service/server/date |
| Sorting | Hasil Pickup monitoring=pickup, klik header customer | URL sort/direction berubah; TH tanpa aria-sort, UI-08 | Tidak menyimpulkan urutan backend salah |
| Sheet keyboard | Shipment quick detail, 12 Tab, Escape, tunggu hidden | Focus trap dan return ke action trigger lulus | Bukan screen-reader audit dan bukan semua overlay |
| Dialog states | Customer mobile/desktop, customer picker, report run Detail & log | Named title/description; log fixture tersedia | Semua editor schedule/user/profile belum dibuka dalam tiap error state |
| Handover mobile | Session 12 task, pilih pertama | Panel verification top 1.997,5 px, scrollY 0; UI-04 | Tidak mengirim verify/close/reopen |
| Theme | Actual header light/dark toggle; Appearance controls | Tema berubah; kontras dan selected semantics UI-01/UI-11 | Tidak mengukur semua status/hover/focus themes |
| Keyboard bypass | Tab pertama dashboard dan inspeksi shell | Tidak ada skip link; main landmark tersedia, UI-10 | Tidak diberi label WCAG failure otomatis |
| POP flow | Pickup staff task fixture: outcome, simpan kunjungan, jumlah 2, ke bukti | Sampai tahap photo/signature berhasil; bukti screenshot | Tidak menggambar tanda tangan, upload file, review final, atau mengirim POP |
| Security confirmation | Password confirmation akun fixture | Gate berhasil dilewati, form security dirender | Password/profile tidak diubah; tidak menghapus akun |
| Reset form | Token audit invalid | Form dirender | Tidak meminta email reset atau membuktikan token valid |
| 404 | Route audit yang sengaja tidak ada | Default 404 tanpa app recovery, UI-12 | Bukan tautan menu rusak atau bukti error 500 sama |

## Pengukuran kontras dan batasnya

Pengukuran membaca computed style setelah menunggu sekitar 600 ms dan state navigasi/transisi selesai. Warna OKLCH diselesaikan ke sRGB melalui canvas; background solid ancestor dikompositkan, lalu relative luminance dihitung. Ukuran/font weight dipakai untuk membedakan teks normal dan large text.

Sampel temuan menggunakan tombol **enabled**, teks 14 px dan latar solid. Dark primary white-on-blue terukur 2,92:1; active light sidebar 4,21:1. Elemen anak/parent dengan label sama tidak dihitung sebagai isu tambahan. Elemen tersembunyi/gradient dan hasil transisi yang belum stabil tidak dijadikan dasar finding. Ini bukan scanner WCAG lengkap: belum memeriksa seluruh opacity/gradient/pseudo-element, non-text contrast, focus indicator, image text atau setiap state halaman.

Screenshot mendukung konteks visual; angka rasio berasal dari computed colors, bukan warna yang ditebak dari screenshot hasil resize.

## Bukti terstruktur

| File | Isi |
| --- | --- |
| [routes.json](evidence/routes.json) | Seluruh 135 route definitions dari Artisan, termasuk method/name/middleware |
| [frontend-inventory.json](evidence/frontend-inventory.json) | 215 file; import/tag/control/line dan kandidat state; bukan daftar defect otomatis |
| [browser-results.json](evidence/browser-results.json) | 59 baseline records: URL, viewport, headings, dialog/label candidates, overflow, screenshot dan error events |
| [interaction-results.json](evidence/interaction-results.json) | 23 record termasuk live-app unavailable, validation, loading/error injection, draft, filters, focus, contrast, 404 |
| [follow-up-results.json](evidence/follow-up-results.json) | Security, reset preview, appearance semantics, mobile dialog, 320 px, text enlargement, keyboard/picker; juga catatan interruption harness |
| [extra-results.json](evidence/extra-results.json) | POP yang dilanjutkan dari state tersimpan hingga bukti dan reduced-motion computed style |
| [source-baseline.json](evidence/source-baseline.json) | Hash sumber sebelum audit |
| [source-integrity.json](evidence/source-integrity.json) | Perbandingan 284 hash, source unchanged, status git snapshot |
| [build-parity.json](evidence/build-parity.json) | Metadata timestamp enam source area JNE versus manifest; risiko source/build parity, bukan defect aplikasi yang disimpulkan |
| [document-validation.json](evidence/document-validation.json) | Pemeriksaan enam dokumen, tautan lokal, batas nomor baris, ID temuan dan jumlah screenshot |

Kendala harness yang dibedakan dari defect aplikasi: percobaan awal menggunakan locator login yang tidak sesuai label Indonesia, konfigurasi cwd webserver awal, write ulang JSON yang sempat terkunci setelah 59 capture tersimpan, dan locator POP yang mengasumsikan task masih di langkah awal. Setup/locator dikoreksi; tahap POP dilanjutkan pada run extra. Catatan interruption disimpan sebagai transparansi, **tidak dipakai sebagai bukti app crash**. Screenshot setup/interruption yang menyesatkan dipindahkan ke output sementara, bukan galeri hasil aplikasi.

## Screenshot representatif

Tersedia **97 PNG** dalam [screenshots](screenshots/). Sebagian berupa full-page screenshot yang jauh lebih tinggi daripada viewport; ukuran viewport ada di JSON. Pilihan berikut mencakup keluarga tugas dan state utama. Gambar adalah aplikasi aktual dengan fixture, bukan mockup.

| Bukti | Screenshot |
| --- | --- |
| Dashboard desktop / actual dark / mobile | [Desktop](screenshots/dashboard.png), [Dark](screenshots/dashboard-actual-dark.png), [Mobile](screenshots/dashboard-mobile.png) |
| Pickup task / create / staff | [Daftar](screenshots/pickup-operations.png), [Form](screenshots/pickup-create.png), [Tugas petugas](screenshots/staff-tasks.png) |
| POP | [Langkah jumlah](screenshots/pop-quantity-resumed.png), [Bukti](screenshots/pop-evidence-step.png) |
| Hasil pickup / detail | [Monitoring](screenshots/pickup-results.png), [Detail](screenshots/pickup-result-detail.png), [Sorting](screenshots/pickup-sorted.png) |
| Handover / discrepancies | [Desktop](screenshots/handover-detail.png), [Mobile selection](screenshots/handover-mobile-selection.png), [Selisih](screenshots/discrepancies.png) |
| Customer state | [Default](screenshots/customers.png), [Dialog](screenshots/customer-dialog.png), [422](screenshots/customer-server-validation.png), [Draft setelah Escape](screenshots/customer-draft-after-escape.png) |
| Loading / error / retry | [Loading](screenshots/customer-loading.png), [Injected error](screenshots/customer-error.png), [Recovered](screenshots/customer-error-recovered.png) |
| JNE shipment | [Daftar](screenshots/shipments.png), [Filtered](screenshots/shipments-filtered.png), [Empty](screenshots/shipments-empty.png), [Sheet](screenshots/shipment-sheet.png), [Detail](screenshots/shipment-detail.png) |
| Customer analytics / reconciliation | [Dashboard customer](screenshots/customer-dashboard.png), [Rekonsiliasi](screenshots/reconciliation.png) |
| Report operations | [Tarik manual](screenshots/report-request.png), [Aturan otomatis](screenshots/report-settings.png), [Riwayat](screenshots/report-history.png), [Log](screenshots/report-run-dialog.png), [AWB](screenshots/report-awbs.png) |
| Administration / settings | [Pengguna](screenshots/admin-users.png), [Alias](screenshots/shipper-aliases.png), [Security](screenshots/settings-security.png), [Theme state](screenshots/appearance-selected-state.png) |
| Responsive / keyboard / recovery | [320 px](screenshots/dashboard-320.png), [Tablet](screenshots/pickup-operations-tablet.png), [Landscape](screenshots/pickup-landscape.png), [Text enlargement](screenshots/text-zoom-overflow-detail.png), [Keyboard](screenshots/keyboard-first-tab.png), [404](screenshots/not-found.png) |

## Belum diverifikasi dan risiko tersisa

1. **Pengguna nyata:** tidak ada waktu tugas, wawancara, error-rate, pengamatan shift, atau uji pemahaman istilah. Penilaian workflow berbasis tugas dan evidence UI, bukan hasil studi pengguna.
2. **Assistive technology:** tidak menjalankan NVDA/JAWS/VoiceOver/TalkBack. Relasi DOM/state yang kurang adalah evidence; pengalaman semua screen reader belum dibuktikan.
3. **Perangkat:** tidak ada Android fisik/Capacitor runtime, kamera, GPS, native keyboard, safe-area perangkat, back/rotation, permission atau push delivery yang diverifikasi.
4. **Offline/recovery:** implementasi source dan test files ada, tetapi tidak dilakukan putus jaringan/restart device untuk membuktikan draft recovery native.
5. **Integrasi report:** tidak login ke sistem eksternal, menarik Hybrid/APEX, upload gabungan AWB, mengunduh report live, menjalankan scheduler atau menguji session keepalive/relogin. Audit tidak membuktikan atau menyangkal keberhasilan pipeline tersebut.
6. **Data bisnis:** fixture tidak memvalidasi mapping tujuan, nilai uang, reconciliation accuracy, histori shipment, prefix classification seluruh resi, atau kelengkapan semua account produksi.
7. **Skala/performance:** tidak ada benchmark latency, Core Web Vitals, volume tinggi, ratusan account, report panjang, atau concurrency operator. Adanya pagination bukan jaminan performa produksi.
8. **State coverage:** tidak semua form mempunyai submit invalid/valid, setiap permission, confirmation, loading, empty, conflict dan failure. Matriks di atas membatasi klaim pada state yang benar-benar diperiksa.
9. **Browser/zoom:** Chromium saja; belum Safari/Firefox, browser zoom 400%, OS high contrast/forced colors, localization panjang, atau semua orientasi.
10. **Future features:** Customer Portal, self-service publik, tracking pelanggan, dan official JNE API AWB generation tidak diuji sebagai fitur yang telah tersedia.
11. **Build parity:** enam area source JNE lebih baru secara timestamp daripada manifest existing; pemeriksaan source sudah dilakukan, visual sign-off terhadap build baru belum dilakukan.

Temuan harus direproduksi kembali pada environment yang akan dirilis setelah remediation. Jangan mengubah label “belum diverifikasi” menjadi “lulus” hanya karena source memiliki test atau komponen shadcn.
