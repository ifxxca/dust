# Remediation Roadmap — Proposed, Not Implemented

Tanggal: 24 Oktober 2026. Dokumen ini adalah rencana untuk ditinjau. **Tidak ada implementasi fix, redesign, perubahan route/permission, backend behavior, atau dependency dalam audit.**

## Prinsip dan urutan

Mulai dari akses ke tindakan utama dan perlindungan pekerjaan, lalu konteks tugas berulang, terakhir cleanup source. Pertahankan shell, domain workflow, primitive shadcn/Radix, DataTable, dan helper yang sudah ada. Pengaturan internal APEX/Hybrid tetap berada pada konfigurasi server; perbaikan UI tidak memerlukan menampilkan URL internal.

Effort di bawah adalah estimasi satu engineer yang memahami proyek, termasuk verifikasi terarah. Rentang dapat tumpang tindih; jangan menjumlahkannya menjadi janji tanggal. Pengujian pengguna/perangkat dan review operasional mempunyai waktu kalender terpisah. Semua perubahan baru perlu persetujuan rencana ini.

## Wave 1 — Kontrol utama dan pencegahan kehilangan pekerjaan

| Paket | Isu | Pekerjaan yang diusulkan | Acceptance criteria | Effort |
| --- | --- | --- | --- | --- |
| A. Kontras | UI-01 | Koreksi pasangan warna token/variant primary serta active navigation, tanpa mengganti palet seluruh produk | Kontrol enabled yang diukur ≥4,5:1 untuk teks normal; active nav kedua tema lolos; focus/hover/disabled diperiksa sesuai kriterianya; tidak mengandalkan screenshot mata saja | 0,5–1 hari |
| B. Draft dan validasi | UI-02, UI-03 | CustomerForm/CustomerDialog: dirty guard atau draft retention; hubungan error; ringkasan/fokus setelah submit gagal | Form bersih boleh Escape; draft berubah tidak hilang diam-diam melalui Escape/X/Batal; submit 422 membuka dan membawa pengguna ke masalah; pesan terhubung input; nilai tetap; focus trap dan restore tetap bekerja | 2–3 hari |
| C. Handover mobile | UI-04 | Perjelas transisi task terpilih → verifikasi pada layar sempit, gunakan susunan desktop existing | Session 12+ task: memilih task membuat panel kerja mudah dicapai; task terpilih selalu jelas; kembali ke daftar mempertahankan posisi; dirty quantity tidak terbuang saat pindah; tablet/desktop tidak regresi | 1–2 hari |

**Gate sebelum wave berikutnya:** walkthrough tanpa data bisnis dengan CS dan Retail Staff; regression tests untuk behavior draft/validation dan selected-task flow bila memberikan cakupan bermakna; browser checks keyboard dan viewport. Jangan menjalankan ulang seluruh test suite berkali-kali untuk perubahan kosmetik kecil. Setelah feature checks lolos, lakukan suite penuh sebelum rilis menurut prosedur proyek.

## Wave 2 — Perbaikan aksesibilitas kecil dengan jangkauan luas

| Paket | Isu | Pekerjaan yang diusulkan | Acceptance criteria | Effort |
| --- | --- | --- | --- | --- |
| D. State dan label | UI-08, UI-09, UI-11 | aria-sort pada header terurut; triggerId/label picker; semantik pilihan tema memakai button/group atau ToggleGroup existing | Screen reader/DOM mengetahui arah sort, nama field stabil, dan tema terpilih; keyboard tetap berfungsi; tidak ada dependency baru | 0,5–1 hari gabungan |
| E. Keyboard bypass | UI-10 | Skip link dan target main; kebijakan fokus navigasi halaman | Link muncul saat fokus, melompati sidebar, fokus mendarat pada target yang benar; tidak mencuri fokus saat typing/filter refresh; landmark tetap tersedia | 0,5–1 hari |
| F. Enlargement dan motion | UI-07, UI-14 | Batas responsif donut/legend; reduced-motion pada primitive overlay | Normal 320/375/768/1440 tetap rapi; root text enlargement dan browser zoom diperiksa; container umum tidak meluber; reduce menghilangkan zoom/slide nonesensial tanpa menghilangkan feedback | 1–2 hari |

Paket kecil D dapat berjalan lebih awal bila tidak mengganggu penyelesaian wave 1. Jangan menunda High issues demi penyamaan semua spacing.

## Wave 3 — Konteks dan pemulihan kerja berulang

| Paket | Isu | Pekerjaan yang diusulkan | Acceptance criteria | Effort |
| --- | --- | --- | --- | --- |
| G. Filter yang dapat dipulihkan | UI-05 | Customer dahulu: query/page/status URL; kemudian audit daftar ops/handover/schedule berdasarkan kebutuhan | Reload/back/direct link memulihkan query dan page yang sesuai; perubahan filter reset page dengan sengaja; debounce tidak mengirim state lama sebagai baru; helper Wayfinder existing digunakan | 1–2 hari customer; 1–2 hari tambahan untuk daftar terpilih |
| H. Bahasa bantuan | UI-06 | Review istilah operasional; lokalisasi auth/settings/validation pada kasus yang teramati | Pesan 422 dan pemulihan akun dapat dipahami staf Indonesia; required/optional konsisten; istilah AWB/sumber tidak diubah makna; bahasa dokumen/bagian diperiksa | 1–2 hari + review staf |
| I. Error document recovery | UI-12 | Halaman 404 sederhana dengan jalan kembali aman | HTTP 404 tetap benar; pesan berguna dan dapat diakses; keyboard/link menuju dashboard/daftar; halaman error tidak membuka data/permission yang tidak berhak; jangan mengklaim menangani 500 tanpa test terpisah | 1–2 hari |

Perubahan translation atau error rendering yang menyentuh backend adalah pekerjaan implementasi berikutnya, bukan perubahan yang dilakukan audit. Permission dan business rule yang sudah ada harus dipertahankan.

## Wave 4 — Cleanup terukur dan konsistensi jangka panjang

| Paket | Isu / kebutuhan | Pekerjaan yang diusulkan | Acceptance criteria | Effort |
| --- | --- | --- | --- | --- |
| J. Cabang legacy | UI-13 | Pastikan semua entry point; pisahkan screen operasi yang aktif; hapus cabang customer tak terpakai setelah review | Customer tetap merender halaman aktif; tasks/mine/available/create/detail/users tidak berubah behavior; tidak menghapus test; tidak membuat route/role baru | 2–4 hari bertahap |
| K. Kontrak komponen | Temuan lintas halaman | Terapkan konvensi header/filter/error/empty/status pada komponen existing ketika halaman disentuh | Tidak ada DataTable/framework design system kedua; exception workflow terdokumentasi di komponen yang relevan; state loading/error/empty konsisten maknanya | 1–2 hari awal, lalu incremental |

Tidak perlu memigrasikan seluruh form ke satu library, mengganti semua tabel menjadi generic schema, menghapus semua custom CSS, atau membuat token bisnis yang terlalu abstrak. Gunakan bug nyata sebagai alasan abstraction.

## Gate riset dan perangkat

| Riset | Tugas yang perlu diuji | Kriteria keputusan |
| --- | --- | --- |
| R-01 — POP dan accommodation | Sender yang tidak dapat menggambar tanda tangan; kamera gagal; input dengan motorik terbatas | Kebijakan bukti yang sah dan jalur bantuan jelas sebelum menawarkan alternatif digital |
| R-02 — Head Retail | Temukan backlog/exception, penanggung jawab, dan aksi berikutnya tanpa bantuan | Urutan dashboard diputuskan dari keberhasilan tugas; tidak menambah metrik tanpa keputusan yang dilayani |
| R-03 — Native field app | Keyboard/camera permissions, physical back/rotation, offline/restart, recovered draft, push deep link | Tidak ada pekerjaan hilang atau finalisasi ganda; perangkat dan build dicatat; web results tidak dipakai sebagai pengganti |
| R-04 — Report operations | Kasus live selesai, lama, gagal, parsial, belum diimpor; walkthrough read-only | Admin membedakan menunggu, retry, download, import dan data siap dimonitor; penarikan eksternal hanya pada pengujian terpisah yang diotorisasi |

Audit tidak mempunyai waktu penyelesaian tugas, error rate pengguna, atau hasil eksperimen. Ukuran keberhasilan di atas adalah rancangan evaluasi berikutnya, bukan klaim hasil yang sudah dicapai.

## Quick wins yang dapat disetujui sebagai paket kecil

Kontras primary/active navigation, label CustomerPicker, aria-sort, pressed state tema, dan reduced-motion primitive memiliki cakupan relatif kecil. Paket ini mengurangi risiko lintas halaman tanpa mengubah struktur navigasi. Draft/validation dan handover mobile tetap prioritas karena langsung memengaruhi penyelesaian pekerjaan.

## Definition of done untuk implementasi mendatang

1. Temuan memiliki bukti sebelum/sesudah pada kondisi reproduksi yang sama.
2. Test behavior ditambahkan/diubah hanya bila memberikan regresi bermakna; styling/copy murni tidak memerlukan test yang meniru implementasi.
3. Keyboard, modal close/restore, error recovery, responsive, light/dark dan enlargement diuji sesuai perubahan.
4. Role dan data scope tidak diperluas; tidak ada akses APEX/Hybrid yang terungkap di UI.
5. Cakupan yang belum diuji tetap diberi label; lulus pada satu halaman tidak menjadi klaim seluruh aplikasi lulus aksesibilitas.

**Status rencana: siap ditinjau; belum disetujui dan belum diterapkan.**
