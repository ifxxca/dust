# Audit UX JNE — 25 Oktober 2026

**Kesimpulan: keluhan tentang tampilan terlalu penuh didukung bukti browser.** Hierarki halaman, alur tindakan, dan bahasa operasional perlu diperbaiki. Mengurangi paragraf saja belum menyelesaikan masalah.

Audit awal 25 Oktober bersifat read-only. Remediasi 26 Oktober dicatat di bagian akhir. Status lolos tes engineering pada milestone sebelumnya tidak membuktikan kemudahan penggunaan. Ada **10 temuan prioritas: 3 High dan 7 Medium**. Prioritas adalah penilaian dampak UX, bukan klaim hasil studi pengguna atau sepuluh kegagalan backend.

## Dua skill yang digunakan

- UI/UX Pro Max: C:/Users/copol/.codex/skills/ui-ux-pro-max/SKILL.md; referensi content-priority, visual-hierarchy, primary-action dan progressive-disclosure. Pencarian terfokus error-summary/focus diperiksa; pencarian progressive-disclosure tidak menghasilkan hasil database yang relevan, sehingga aturan di referensi tertulis skill menjadi sumbernya.
- Web Design Guidelines: C:/Users/copol/.codex/skills/web-design-guidelines/SKILL.md; [pedoman terbaru](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) diambil untuk audit. Dipakai untuk memeriksa hierarki heading, label, hubungan error dengan field, state navigasi dan pemulihan.

Nama kedua sudah dikonfirmasi pengguna sebagai Web Design Guidelines. Tidak ada skill Concept Design yang diklaim telah tersedia. Komponen shadcn yang sudah terpasang diperiksa sebagai pendukung; tidak disarankan memasang primitive/dependency baru.

## Cakupan dan metode

- Snapshot kode: HEAD 75787b6 pada codex/jne-reconciliation. Empat perubahan auth/welcome yang sudah ada tidak disentuh.
- Tujuh halaman JNE diperiksa: monitoring, exception, aturan bukti, rekonsiliasi POP, koleksi eksternal, kebijakan tracking dan detail AWB.
- Browser aktual melalui Codex in-app browser; tampilan desktop 1213 × 884 dan ponsel 390 × 844, tema gelap yang sudah aktif. Tidak membuktikan seluruh tema/browser/perangkat.
- Fixture existing tests/Fixtures/ui-ux-browser.php digunakan tanpa perubahan, pada SQLite baru terisolasi: 4 akun sintetis, 28 customer, 34 pickup dan 30 shipment.
- Tidak mengubah data operasional, kepemilikan, POP, jadwal, aturan produksi atau file aplikasi. Tidak melakukan penarikan Hybrid/APEX. Interaksi berupa navigasi, pemilihan lokal, pencarian, dan validasi JSON yang ditolak sebelum penyimpanan.
- Environment fixture membuka gate evidence/category/collection hanya untuk melihat UI. Ini bukan aktivasi operasional atau verifikasi makna bisnis.
- Dua navigasi in-app perlu dilanjutkan dengan navigasi halaman penuh; satu console error dynamic-import teramati. Masalah sementara ini tidak dihitung sebagai defect produk tanpa reproduksi di lingkungan lain.

## Temuan prioritas

| ID | Prioritas | Bukti dan lokasi | Dampak | Arah perbaikan |
|---|---|---|---|---|
| JUX-01 | High | Monitoring desktop: judul y=458, pencarian y=1099, tabel y=1268. Mobile: judul y=630, pencarian y=1656, AWB pertama y=1858. resources/js/pages/jne-monitoring.tsx:144, :163, :209, :265. Detail AWB juga menaruh disclosure audit kosong sebelum judul: jne-shipment.tsx:132 | Pekerjaan utama berada di bawah beberapa blok ringkasan, penjelasan dan pengaturan. Halaman daftar terasa seperti laporan sistem | Judul dan pencarian/daftar lebih dahulu; ringkasan singkat relevan pada filter; pengaturan dan audit sebagai detail lanjutan |
| JUX-02 | High | Memilih kelompok pada exception mengubah heading menjadi 2 AWB, tetapi kontrol keputusan masih y=1438 pada viewport tinggi 844. Tidak ada aria-pressed/data-state atau penanda pilihan pada tombol kelompok. jne-exceptions.tsx:114, :176 | Setelah memilih, pengguna tidak mendapat arah tindakan berikutnya di area yang terlihat | Tampilkan jumlah/pilihan secara lokal dan panel keputusan dekat pilihan, drawer atau action bar; fokus/scroll diarahkan dengan wajar |
| JUX-03 | High | Detail AWB menampilkan kalimat umum “Pickup Staff tidak perlu memindai AWB.” jne-shipment.tsx:340 | Instruksi bisa dipahami berlaku pula pada Cashless, padahal alur Sertim perlu pencatatan identitas AWB. Ini temuan ambiguitas instruksi, bukan bukti staff benar-benar melewatkan pencatatan | Bedakan kewajiban pencatatan Cashless dari tidak perlunya memindai setiap paket CSS/Orion. Tampilkan instruksi pada konteks tugas yang relevan |
| JUX-04 | Medium | Aturan bukti secara default membuka editor JSON dengan customer_code_column, category_values, hybrid_categories dan collection_requirements. jne-evidence-rules.tsx:262. Kebijakan tracking juga diedit sebagai JSON: jne-refresh-policy.tsx:45, :109 | Admin operasional harus memahami struktur implementasi untuk mengatur aturan bisnis; helper text panjang mencoba menutup kekurangan interaksi | Gunakan field terstruktur, pilihan dan pratinjau aturan. JSON menjadi mode lanjutan khusus kebutuhan teknis |
| JUX-05 | Medium | Exception menampilkan tiga status UNMATCHED berurutan tanpa label dimensi. Rekonsiliasi menampilkan UNCONFIGURED. Pada detail, “Kategori” dipakai untuk kategori POP dan kolom yang sebenarnya menampilkan tracking_status. jne-exceptions.tsx:128; jne-reconciliation.tsx:193; jne-shipment.tsx:166, :491, :511 | Pengguna harus menerjemahkan enum dan menebak apakah status menyangkut customer, pickup, kategori paket atau pengiriman | Label dimensi dan istilah operasional konsisten. Pisahkan Kategori POP dari Status pengiriman; internal enum cukup pada detail teknis |
| JUX-06 | Medium | Rekonsiliasi mobile: pencarian y=639 dan tabel y=739 setelah paragraf pengantar serta blok Syarat perbandingan. jne-reconciliation.tsx:90, :96, :148 | Membaca aturan menjadi langkah berulang sebelum memeriksa selisih. Penjelasan juga berulang per pickup/baris | Tampilkan hasil, selisih dan status bukti terlebih dahulu. Penjelasan umum dalam bantuan; catatan per baris hanya saat diperlukan |
| JUX-07 | Medium | Koleksi meminta ID laporan dipisahkan koma sekaligus menyediakan checkbox laporan. Saat memilih OPEN, field kontrak/laporan/cutoff dan pernyataan kelengkapan tetap muncul. Dengan kontrak kosong, form pengesahan tetap ditampilkan tanpa jalan langsung menyiapkannya. jne-collection-window.tsx:107, :122, :153, :195 | Beban input dan field yang tidak relevan menimbulkan pertanyaan tentang apa yang sebenarnya wajib untuk tindakan ini | Pilih laporan lewat daftar berlabel; tampilkan field sesuai keputusan; jika prasyarat belum tersedia, jelaskan satu hambatan beserta tindakan menuju pengaturan |
| JUX-08 | Medium | JSON tidak valid menghasilkan role=alert, tetapi textarea tidak memiliki aria-invalid/aria-describedby dan fokus tidak kembali ke field. Pesan berada di akhir form. jne-evidence-rules.tsx:170, :266, :423; pola serupa di form baru lainnya | Pesan ada, tetapi pemulihan mengandalkan pencarian visual; hubungan field/error kurang jelas | Pertahankan alert, tambah pesan terkait di dekat field dan fokus error pertama/ringkasan yang dapat diakses. Ini bukan audit screen reader atau sertifikasi WCAG |
| JUX-09 | Medium | Tiga tautan pengaturan/review disisipkan sebelum judul monitoring. Halaman evidence/exceptions/collections/refresh tidak tercakup pemetaan jneNavigation/jneBreadcrumbs sehingga header mobile kembali menjadi Retail Pickup. jne-monitoring.tsx:150; lib/jne-navigation.ts:16, :60 | Jalur kerja terpecah; konteks lokasi hilang pada halaman baru dan tautan pengaturan bersaing dengan tugas harian | Kelompokkan navigasi JNE mengikuti tugas, lengkapi active state/breadcrumb, letakkan pengaturan di area sekunder |
| JUX-10 | Medium | Saat pencarian exception menghasilkan nol record, seluruh form “Keputusan untuk 0 AWB” tetap tampil. Saat profile tracking belum ada, instruksi meminta membuat konfigurasi tetapi tidak menyediakan tautan langsung; teks Jadwal: Nonaktif juga tidak membedakan belum dikonfigurasi. jne-exceptions.tsx:166; jne-refresh-policy.tsx:81 | UI memberi kontrol tanpa objek kerja dan pesan tanpa langkah pemulihan langsung | Empty state ringkas dengan aksi reset/buat konfigurasi. Form keputusan muncul sesudah ada pilihan; bedakan belum diatur dari nonaktif |

## Bukti browser

Koordinat di atas adalah posisi elemen pada viewport pengamatan, bukan waktu tugas atau penilaian semua resolusi. Monitoring diukur saat scroll awal nol. Setelah memilih batch, browser bergerak 45 px dan panel keputusan masih di luar viewport. Tidak ditemukan overflow dokumen pada dua ukuran monitoring yang diukur; hal itu tidak membuktikan alur mudah dipakai.

| Bukti | File |
|---|---|
| Monitoring desktop | [Screenshot](../../output/jne-ux-audit-20261025-monitoring-desktop.png) |
| Monitoring mobile | [Screenshot](../../output/jne-ux-audit-20261025-monitoring-mobile.png) |
| Exception mobile | [Screenshot](../../output/jne-ux-audit-20261025-exceptions-mobile.png) |
| Aturan bukti/JSON mobile | [Screenshot](../../output/jne-ux-audit-20261025-evidence-mobile.png) |
| Rekonsiliasi mobile | [Screenshot](../../output/jne-ux-audit-20261025-reconciliation-mobile.png) |
| Koleksi pada pilihan OPEN | [Screenshot](../../output/jne-ux-audit-20261025-collection-mobile.png) |
| Tracking belum dikonfigurasi | [Screenshot](../../output/jne-ux-audit-20261025-refresh-empty-mobile.png) |
| Detail shipment | [Screenshot](../../output/jne-ux-audit-20261025-shipment-mobile.png) |
| Exception kosong | [Screenshot](../../output/jne-ux-audit-20261025-exceptions-empty-mobile.png) |

Screenshot dan database fixture berada di output yang diabaikan Git; tidak mengandung transaksi pelanggan sebenarnya.

## Prioritas desain sebelum remediasi

| Tugas | Tampilan utama yang dibutuhkan | Detail saat diminta |
|---|---|---|
| Memantau pengiriman | Cari AWB, daftar status, masalah yang perlu ditindaklanjuti | Asal report, histori status, refresh policy dan audit |
| Memeriksa exception | Penyebab, bukti ringkas, kandidat dan tindakan untuk AWB terpilih | Nilai sumber asli, jejak keputusan dan konfigurasi mapping |
| Merekonsiliasi pickup | Customer/pickup, Manual–Cashless–CSS, jumlah terkonfirmasi dan selisih | Penjelasan keyakinan, sumber dan pengesahan koleksi |
| Menyiapkan aturan | Daftar mapping dan field aturan yang dapat diisi | Revisi, audit, scope kompleks dan JSON lanjutan |

Urutan remediasi yang disarankan:

1. Pulihkan hierarki monitoring/detail dan perjelas instruksi Cashless.
2. Perbaiki pemilihan exception, panel tindakan dan pemulihan error.
3. Sederhanakan rekonsiliasi serta formulir koleksi sesuai keputusan.
4. Bentuk pengaturan terstruktur, empty state dan navigasi yang konsisten.

Perbaikan tidak boleh menghapus alasan/audit, menyamakan jumlah dengan identitas, menyatukan closure Sertim dengan kelengkapan report, atau mengaktifkan kebijakan yang belum diverifikasi. Informasi lengkap tetap tersedia melalui detail yang sesuai konteks.

## Batas kesimpulan

Audit awal ini merupakan pemeriksaan source dan browser, bukan studi pengguna nyata, sertifikasi aksesibilitas, benchmark performa, ataupun UAT sumber JNE. Pada audit 25 Oktober tidak dilakukan submit keputusan bisnis, finalisasi POP/handover, aktivasi aturan, penarikan report, perubahan aplikasi atau commit/push. Audit lama di docs/ui-ux-audit tidak diubah.

## Remediasi — 26 Oktober 2026

Kebijakan pengguna menjadi standar seluruh halaman baru/revisi: judul dan tindakan utama, pencarian/filter, area kerja, feedback relevan, kemudian detail saat diminta. Hapus pengantar berulang dan kartu instruksional; gunakan tabel ringkas, label jelas, validasi dekat kontrol dan pemulihan keyboard. Penjelasan bisnis tidak boleh menggantikan struktur interaksi. Catatan yang sama ditambahkan ke AGENTS.md lokal yang memang diabaikan Git oleh proyek.

### Content and Interaction Audit

| Halaman / pengguna utama | Tugas dan data utama / tindakan sering | Exception yang dipertahankan | Informasi sekunder |
|---|---|---|---|
| Monitoring JNE / Admin | Cari AWB, customer dan status; buka detail | Konflik/kandidat/belum dikenali yang memiliki jumlah positif; kegagalan report muncul sebagai tautan badge di header | Koleksi, tracking, gate dan pengaturan |
| Exception / Admin | Periksa AWB dengan bukti setara; konfirmasi atau cabut keputusan | Dimensi customer/pickup/kategori terpisah; versi dan reason tetap dikirim | Kandidat, sumber asli dan ketentuan review |
| Rekonsiliasi / Admin | Cari pickup; bandingkan Manual, Cashless, CSS/Orion | Shortfall sementara dibedakan dari missing setelah pengesahan; konflik tetap tampak | Syarat perbandingan, baseline, Sertim dan verifikasi fisik |
| Aturan bukti / Admin | Cari aturan, tambah alias/kontrak, aktif/nonaktif | Draft, gate, scope, alasan dan versi tetap wajib sesuai backend | Form melalui Sheet; mapping kategori, JSON dan audit melalui disclosure |
| Koleksi eksternal / Admin | Pilih kontrak/laporan/cutoff dan sahkan; buka kembali dengan alasan | Tanpa kontrak memiliki CTA pengaturan; gate nonaktif tetap memblokir submit | Definisi kontrak dan riwayat pengesahan |
| Kebijakan tracking / Admin | Isi interval per status dan simpan draft | Aktivasi gate, konfirmasi terminal, SLA, retry dan validasi tidak dihilangkan | Terminal/prioritas, jam sumber, JSON, audit |
| Detail AWB / Admin | Periksa resi, status, customer dan pickup; review keputusan | Kategori POP dan status pengiriman memiliki label berbeda | Audit lengkap ditempatkan setelah area kerja |
| Customer / CS, Admin | Cari kode/nama/kontak; tambah/edit | Validasi, error jaringan dan retry dipertahankan | Nama pengirim dan detail customer |
| Operasional pickup / role yang berwenang | Temukan task, tugaskan atau jalankan; buat pickup | Status, izin, histori dan validasi dipertahankan | Pengantar umum dihapus; waktu operasional tetap tersedia |
| Handover dan Selisih / role yang berwenang | Cari session/selisih, verifikasi dan tindak lanjut | Kuantitas, pemilihan, audit dan closure tetap sama | Pengantar yang mengulang judul dihapus |
| Jadwal, report, dashboard / role yang berwenang | Kelola jadwal, tarik/periksa report, pilih pekerjaan | Jadwal, data freshness dan status tetap tersedia | Pengantar berulang dihapus; metrik dashboard yang relevan tetap digunakan |

Auth/welcome/password-input memiliki perubahan terpisah sebelum pekerjaan ini dan tidak diubah atau dimasukkan ke commit remediasi. Wizard POP, hasil pickup dan komponen yang sudah berorientasi tugas digunakan kembali. Pemeriksaan rute tidak berarti seluruh kemungkinan state di setiap halaman sudah diuji pengguna.

### Perbaikan terhadap temuan

| ID | Implementasi |
|---|---|
| JUX-01 | Judul dan pencarian monitoring lebih dahulu. Kartu KPI diganti satu filter status dengan jumlah; koleksi/tracking setelah daftar. Audit detail AWB dipindahkan ke bawah. |
| JUX-02 | Tabel exception memiliki kolom dimensi, penanda pilihan, tombol kelompok dan Sheet keputusan langsung. Fokus kembali ke pemicu atau pencarian jika baris selesai. |
| JUX-03 | Instruksi membedakan pencatatan Cashless melalui Sertim dari tidak wajibnya memindai setiap CSS/Orion. |
| JUX-04 | Field kolom sumber, kategori, mapping Hybrid dan interval tracking terstruktur; JSON lanjutan tetap tersedia. Nilai nullable tetap kosong sampai operator menetapkannya. |
| JUX-05 | Dimensi dan status exception diberi label operasional; kategori POP dan status pengiriman dibedakan; koleksi tidak lagi menampilkan UNCONFIGURED sebagai label utama. |
| JUX-06 | Ketentuan rekonsiliasi dan detail baseline menjadi disclosure; pencarian dan tabel didahulukan. |
| JUX-07 | OPEN hanya meminta alasan. COMPLETE menampilkan bukti yang diperlukan; pilihan laporan bertahan ketika pencarian/pagination berubah dan dapat dibatalkan per ID. Input ID manual yang redundan dihapus. |
| JUX-08 | Error dihubungkan ke field; fokus membuka bagian yang memuat error. Perbaikan JSON tidak menutup editor yang sedang dipakai. Mapping sumber duplikat pada form terstruktur tidak dapat disubmit atau menimpa mapping pertama. |
| JUX-09 | Halaman exception/koleksi mengikuti navigasi pengiriman; aturan dan kebijakan mengikuti pengaturan, dengan breadcrumb masing-masing. |
| JUX-10 | Tidak ada form keputusan untuk daftar kosong; profil/kontrak yang belum tersedia memiliki CTA langsung dan status “Belum diatur”. |

### Bukti otomatis dan visual

- Frontend: 123 tes dalam 18 file lulus, termasuk pilihan status, identitas terpisah dan navigasi empat halaman tambahan.
- Regresi backend terarah: 53 tes / 352 assertions lulus untuk Sertim, evidence, identitas, exception, kategori, koleksi serta UI/pickup.
- Suite PHP lengkap: 756 lulus, 5 skip yang sudah ada, 7.067 assertions; verifikasi Chromium terarah diulang setelah penyempurnaan terakhir.
- Chromium Sertim/review: alur staf, koreksi Admin, aturan draft/aktivasi sintetis, JSON invalid/pemulihan, mapping duplikat, payload kontrak terstruktur, laporan terpilih setelah pencarian, OPEN/COMPLETE, exception Sheet dan draft tracking diuji melalui Laravel asli pada SQLite disposable.
- Browser workspace: 25 rute merender tanpa overflow; handover mobile dan batas akses role yang ada lulus. Empty setup, mode draft dan kembalinya fokus diuji pada 390 dan 1280 px.
- Pemeriksaan kontras komponen primer/navigasi yang sudah ada lulus pada tema terang dan gelap; ini tidak mengklaim audit kontras setiap kombinasi state.
- TypeScript web/mobile, lint/format frontend, PHPStan dan build produksi lulus. Tidak ada perubahan PHP, dependency, migrasi atau endpoint pada remediasi ini.

Artefak fixture berada di storage/app/private/jne-reconciliation-ui dan output/task-first-ui-8e1c79e18a2f4a868dfe6d0ebb12199a, keduanya tidak dimasukkan ke Git. Screenshot desktop/mobile diperiksa terpisah. Fixture 390×844 memperlihatkan pencarian sekitar y=245 dan AWB pertama sekitar y=553; desktop 1280×844 sekitar y=165 dan y=414. Fixture ini berbeda dari audit awal, sehingga angka tersebut merupakan bukti keterjangkauan viewport, bukan benchmark peningkatan performa.

Semua penyimpanan selama tes hanya menggunakan data sintetis/disposable. Tidak ada penarikan JNE, aktivasi produksi, perubahan ownership nyata, finalized POP atau jadwal operasional. Remediasi siap untuk evaluasi operator; kemudahan penggunaan nyata dan semantik sumber JNE masih memerlukan UAT.
