# Retail Operations Platform — UI/UX Audit

Pembaruan **11 November 2026**: lihat [audit dan perbaikan konsistensi seluruh kontrol UI](control-consistency-2026-11-11.md). Dokumen di bawah merupakan catatan audit historis 24 Oktober.

Tanggal audit: **24 Oktober 2026**. Snapshot: commit `56dd4db2636bfc4fd702d3d8569230d09bb4eb26` beserta perubahan working copy yang sudah ada sebelum audit. **Tidak ada perbaikan kode aplikasi dalam pekerjaan ini.**

## Penilaian keseluruhan

Fondasi antarmuka sudah baik untuk aplikasi operasional Retail: navigasi mengikuti peran, komponen shadcn/ui digunakan luas, tabel memiliki pagination dan status, dan alur pickup → POP → handover → monitoring dipisahkan menurut tugas pengguna. Dashboard juga sudah memiliki diagram, definisi metrik, waktu pengamatan, dan tautan tindak lanjut. Proyek tidak membutuhkan penggantian tampilan secara menyeluruh.

Namun, konsistensi perilaku belum sebaik konsistensi visualnya. Audit menemukan **14 isu yang dapat ditindaklanjuti: 4 High, 9 Medium, dan 1 Low**. Tidak ditemukan isu Critical dalam cakupan pengujian ini; ini bukan jaminan tidak ada masalah lain. Empat prioritas tertinggi adalah kontras kontrol utama, hilangnya draft customer, pemulihan validasi formulir, dan akses ke formulir verifikasi handover di ponsel.

**Rekomendasi:** pertahankan struktur produk dan komponen yang sudah ada. Perbaiki hambatan tugas dan aksesibilitas terlebih dahulu, kemudian seragamkan perilaku filter, formulir, dan navigasi. Jangan memulai dengan menambah diagram, mengubah semua kartu, atau membangun design system baru.

## Dasar bukti dan tingkat keyakinan

- Inventaris struktural seluruh frontend: **215 file / 48.988 baris**, termasuk 29 file halaman Inertia, 27 primitive UI, 31 file frontend mobile, serta test dan styles. Angka ini bukan jumlah halaman produksi atau pernyataan setiap baris telah diuji secara dinamis.
- Inventaris router: **135 definisi route**, termasuk 63 route GET/HEAD. Banyak di antaranya endpoint data, unduhan, framework, atau autentikasi; bukan 135 halaman.
- Browser Chromium pada aplikasi sebenarnya dengan SQLite dan data sintetis terisolasi: **59 capture dasar**, dilanjutkan pengujian interaksi, validasi, state, tema, dan ukuran layar. Empat peran diuji: Admin/Supervisor, CS, Pickup Staff, Retail Staff.
- Aplikasi yang sebelumnya berada pada port 8000 menolak koneksi saat diperiksa. Bukti visual berasal dari instance audit terisolasi, **bukan hasil observasi transaksi produksi**.
- Browser memakai build yang tersedia. Enam source area JNE memiliki timestamp lebih baru daripada manifest; kesetaraan byte source/build belum dibuktikan. Area tersebut tetap diperiksa dari source dan memerlukan visual sign-off pada build baru; lihat verification.
- Tidak dilakukan pengujian pengguna, sertifikasi WCAG, benchmark produksi, uji screen reader, atau uji perangkat Android fisik. Tidak ada penarikan report eksternal, upload APEX, atau finalisasi handover/POP bisnis selama audit.

Klasifikasi temuan:

| Label | Arti | Penggunaan |
| --- | --- | --- |
| A — Verified defect | Perilaku teramati dan sumber kode mendukung masalah yang spesifik | 10 temuan; ruang lingkup reproduksi disebutkan pada masing-masing isu |
| B — Strong UX concern | Bukti implementasi/perilaku nyata; tingkat gangguan atau solusi terbaik masih membutuhkan validasi operasional | 4 temuan |
| C — Subjective suggestion | Preferensi atau kemungkinan penyempurnaan, bukan defect | Dicatat terpisah di design system review |
| D — Requires user testing | Belum cukup bukti untuk menyimpulkan masalah atau dampaknya | Dicatat terpisah, tidak dihitung sebagai defect |

## Sepuluh prioritas berdasarkan dampak

| Urutan | ID | Severity | Dampak utama |
| --- | --- | --- | --- |
| 1 | [UI-01](findings.md#ui-01) | High | Teks tombol utama pada dark mode memiliki kontras 2,92:1; teks navigasi aktif light mode 4,21:1. Keduanya di bawah 4,5:1 untuk teks normal yang diukur. |
| 2 | [UI-02](findings.md#ui-02) | High | Escape menutup dialog customer dan menghapus draft tanpa konfirmasi. |
| 3 | [UI-03](findings.md#ui-03) | High | Error validasi customer muncul di luar area dialog yang terlihat; fokus tidak menuju error dan pesan tidak dihubungkan ke input. |
| 4 | [UI-04](findings.md#ui-04) | High | Setelah memilih task handover di ponsel, panel verifikasi tetap jauh di bawah daftar 12 task. |
| 5 | [UI-05](findings.md#ui-05) | Medium | Pencarian dan halaman customer hilang setelah reload; konteks tugas berulang sulit dipertahankan. |
| 6 | [UI-06](findings.md#ui-06) | Medium | Bahasa operasional Indonesia bercampur dengan pesan validasi dan pengaturan berbahasa Inggris. |
| 7 | [UI-07](findings.md#ui-07) | Medium | Dashboard meluber horizontal pada simulasi pembesaran teks 200% di lebar 375 px. |
| 8 | [UI-08](findings.md#ui-08) | Medium | Sorting Hasil Pickup bekerja, tetapi arah sorting tidak tersedia melalui `aria-sort`. |
| 9 | [UI-09](findings.md#ui-09) | Medium | Label Customer pada Buat Pickup tidak terkait dengan trigger pemilih customer. |
| 10 | [UI-10](findings.md#ui-10) | Medium | Tidak tersedia pintasan keyboard untuk melewati navigasi panjang menuju konten utama. |

Temuan lain: pilihan tema tidak mengumumkan state terpilih; 404 tidak menyediakan pemulihan di dalam aplikasi; cabang customer lama masih ada di komponen operasi; animasi dialog tidak mengikuti preferensi reduced motion.

## Konsistensi lintas proyek

| Area | Penilaian |
| --- | --- |
| Shell, sidebar, breadcrumbs | Cukup konsisten dan berbasis peran; JNE memiliki pemetaan navigasi/breadcrumb bersama. |
| Header, cards, hierarchy | Pola dasar konsisten. Kepadatan monitoring dan lebar formulir berbeda secara wajar sesuai tugas. Variasi ini tidak otomatis perlu dihapus. |
| Tables, filters, search | Komponen tabel bersama sudah ada. Persistensi filter dan sorting semantics belum konsisten. |
| Forms, dialogs, sheets | Primitive aksesibel digunakan dengan baik, tetapi validasi, proteksi draft, dan asosiasi label belum seragam. |
| Status dan feedback | Domain pickup, shipment, dan run memiliki makna berbeda yang layak dipertahankan. Loading/error/retry terbukti bekerja pada sampel customer. |
| Tema dan responsive | Dark mode tersedia; pasangan warna perlu diperbaiki. Lebar normal 320–1440 px yang disampel tidak menyebabkan overflow dokumen; pembesaran teks dan handover mobile masih bermasalah. |
| Bahasa dan tanggal | Bahasa belum konsisten. Batas hari pickup dan tanggal kalender JNE berbeda dengan penjelasan yang tersedia; perbedaan bisnis ini bukan defect format tanggal. |

## Kepatuhan shadcn/ui

**Selaras secara arsitektur, belum konsisten secara perilaku aksesibilitas.** Proyek menggunakan primitive Radix/shadcn dengan token CSS, Button variants, DialogTitle/Description, Sheet, Sidebar, Table, dan komponen domain di atasnya. Focus trap dan pengembalian fokus Sheet yang diuji bekerja.

shadcn/ui bukan sertifikasi aksesibilitas untuk halaman yang menyusunnya. Error association, state pilihan, sorting, warna token, dan pengamanan draft tetap tanggung jawab aplikasi. Tidak ada alasan untuk mengganti Radix, TanStack Table v9, atau memasang primitive terbaru hanya untuk menyesuaikan contoh dokumentasi.

## Dampak terhadap pekerjaan operasional

- **Pickup Staff:** wizard membedakan hasil kunjungan, jumlah paket, bukti, dan review. Tahap bukti berhasil dibuka pada fixture; pengiriman POP final dan penggunaan kamera/tanda tangan pada perangkat nyata belum diuji.
- **Retail Staff:** perbandingan jumlah POP versus fisik serta discrepancy sudah mendukung tugas penerimaan. Pada ponsel, perpindahan daftar task ke panel verifikasi menjadi hambatan terbesar yang teramati.
- **CS/Admin:** pengelolaan customer dan pencarian berulang terganggu oleh draft yang hilang, error yang tersembunyi, dan konteks filter yang tidak bertahan.
- **Admin laporan/JNE:** halaman permintaan manual, aturan otomatis, run history, AWB, dan rekonsiliasi sudah berbeda tugasnya. Keberhasilan worker eksternal dan semantik seluruh status nyata belum diverifikasi melalui penarikan produksi.
- **Head Retail:** bukan role tersendiri dalam implementasi saat ini. Dashboard Admin/Supervisor menjadi proxy untuk penilaian ringkasan dan tindak lanjut; kesesuaiannya dengan keputusan Head Retail perlu diuji bersama pengguna.

## Quick wins dan urutan refactor

1. Perbaiki pasangan warna primary/foreground dan navigasi aktif; asosiasikan label; umumkan state sort dan pilihan tema.
2. Perbaiki error summary/fokus/asosiasi pesan serta proteksi draft; pertahankan focus trap Radix.
3. Perbaiki perpindahan task → verifikasi pada mobile dan ukuran diagram saat teks diperbesar.
4. Simpan konteks filter/pagination dalam URL pada daftar yang sering dibuka ulang; seragamkan bahasa dan pemulihan 404.
5. Rapikan cabang halaman yang tidak terjangkau, kemudian konsolidasikan pola yang benar-benar berulang memakai komponen yang sudah ada.

Rincian acceptance criteria, effort, dependensi, dan gate pengujian tersedia dalam [roadmap](remediation-roadmap.md). **Belum ada fix yang diterapkan; implementasi menunggu persetujuan rencana remediasi.**

## Dokumen dan bukti

- [Inventaris halaman, workflow, route, dan komponen](page-inventory.md)
- [Temuan lengkap beserta bukti dan lokasi kode](findings.md)
- [Review design system dan shadcn/ui](design-system-review.md)
- [Roadmap remediasi](remediation-roadmap.md)
- [Verifikasi, batasan, screenshot, dan sumber panduan](verification.md)
- [Inventaris sumber terstruktur](evidence/frontend-inventory.json) dan [inventaris route](evidence/routes.json)

![Dashboard operasional pada light mode, menggunakan data sintetis audit](screenshots/dashboard.png)

Screenshot memperlihatkan implementasi yang diaudit, bukan rancangan usulan atau data operasional sebenarnya.
