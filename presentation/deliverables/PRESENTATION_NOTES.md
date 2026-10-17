# Catatan Presentasi Retail Operations Platform

Tanggal tinjauan: 15 Oktober 2026. Bahasa: Indonesia. Audiens: manajemen cabang JNE, supervisor operasional, IT, dan pengambil keputusan internal. Format: 18 slide, 16:9, teks, tabel, dan diagram dapat diedit di PowerPoint.

## Narasi dan sumber per slide

| Slide | Isi dan tujuan                                                       | Sumber utama dalam repository                                         |
| ----- | -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1     | Pengenalan platform dengan fokus Pickup Management                   | `docs/PRD_MOBILE_V1.md` §1–2; Implementation Plan §16–23              |
| 2     | Kebutuhan koordinasi, pekerjaan lapangan, serah terima, dan riwayat  | PRD Mobile §1; `docs/prd.md`                                          |
| 3     | Visi satu platform untuk CS/Admin, Pickup Staff, Retail/Supervisor   | `routes/web.php`, `routes/api.php`, mobile `app.tsx`                  |
| 4     | Cakupan kemampuan web dan Android                                    | Routes; Implementation Plan §17,19,21,22                              |
| 5     | Alur tugas hingga handover, termasuk cabang Tanpa Paket              | `RecordPickupVisit`, `FinalizePickup`, `CreatePickupTask`, PRD §4     |
| 6     | Pembuatan, assignment tunggal/massal, dan pemantauan web             | `create-pickup.tsx`, `bulk-pickup-assignment.tsx`, daftar pickup      |
| 7     | Beranda, Tugas Saya, Tersedia, Riwayat dan batas notifikasi          | Mobile `app.tsx`, `push.ts`; Implementation Plan §16,19,23            |
| 8     | Eksekusi terpandu dan tugas terminal Tanpa Paket                     | Mobile `execution-panel.tsx`, `manual-pickup.tsx`; Plan §17           |
| 9     | Kuantitas, foto opsional, tanda tangan wajib dan finalisasi POP      | `FinalizePickupRequest.php`, `FinalizePickup.php`, `proof-panel.tsx`  |
| 10    | DRAFT, verifikasi kategori, penutupan dan selisih                    | `VerifyItem.php`, `CloseSession.php`, `handover-panel.tsx`; Plan §19  |
| 11    | Monitoring harian dan audit tugas hingga handover                    | `OperationalDashboardController.php`, task/session events             |
| 12    | Arsitektur Laravel, React/Inertia, React/Capacitor, database dan FCM | Composer, package.json, routes, mobile bootstrap, assignment push job |
| 13    | Klasifikasi bukti implementasi, batas UAT dan kesiapan pilot         | Plan §17–23, Technical Design baseline/addendum, kode saat ini        |
| 14    | Manfaat bisnis yang diharapkan                                       | PRD §1.2–1.3 dan kemampuan aktual; belum merupakan dampak terukur     |
| 15    | Reporting, cashless HO, AWB, portal dan fleet/ERP                    | Brief pengguna §7; PRD Mobile §2.2                                    |
| 16    | Konsep/PoC satu pickup, satu cashless HO via JNE Hybrid              | Konsep dalam brief pengguna §7; belum integrasi produksi              |
| 17    | UAT, kesiapan rilis, pilot terbatas, evaluasi                        | PRD UAT-01–12; remaining gates Plan §19–23                            |
| 18    | Ringkasan dan diskusi keputusan berikutnya                           | PRD dan remaining gates terbaru                                       |

Path Implementation Plan: `docs/mobile/IMPLEMENTATION_PLAN.md`. Path Technical Design: `docs/mobile/TECHNICAL_DESIGN.md`. Kelas backend berada di `app/Actions`, request di `app/Http/Requests`, dan mobile di `resources/mobile/src`. Sumber dan penjelasan tambahan tersedia pada speaker notes setiap slide.

## Dasar klasifikasi dan keterbatasan fakta

- **Terverifikasi teknis** berarti kode telah diperiksa dan bukti pengujian otomatis/emulator sudah tercatat dalam repository. Ini bukan sertifikasi produksi atau pengujian ulang pada pekerjaan presentasi ini.
- **Implementasi tersedia, UAT belum selesai** mencakup perluasan customer web, assignment massal, dan tes push Admin. Manual browser UAT belum tercatat selesai. FCM tersedia tetapi delivery nyata pada APK terbaru belum terverifikasi.
- **Rencana/konsep** mencakup modul roadmap dan cashless HO. Nama Cashless Hybrid pada POP hanya kategori jumlah yang sudah tersedia, bukan bukti integrasi JNE Hybrid.
- Catatan terbaru §23 mencatat full Laravel 299 PASS/5 SKIP, mobile client 44 PASS dan debug build 1.0.9/code10. Angka historis ini tidak dimasukkan ke slide sebagai hasil pengujian baru. Emulator evidence dari versi sebelumnya tidak otomatis membuktikan perilaku seluruh perangkat pada build terbaru.
- Tidak ada suite dijalankan ulang, migrasi dijalankan, data bisnis dibuat, konfigurasi aplikasi diubah, APK dipasang, atau deployment dilakukan untuk presentasi ini. Pemeriksaan runtime terbatas pada `composer show --direct` dan `php artisan route:list` yang bersifat baca saja.
- PHP package terpasang dikonfirmasi termasuk Laravel 13.35.0, Inertia PHP 3.5.1 dan Sanctum 4.3.3. Slide arsitektur sengaja tidak memuat rincian versi untuk audiens nonteknis.
- Manfaat bisnis adalah hipotesis yang perlu diukur melalui baseline dan pilot. Tidak ada klaim persentase, penghematan, SLA, adopsi, atau statistik produksi.
- Belum siap pilot: UAT perangkat fisik/fleet, signing, HTTPS, distribusi/pembaruan, dukungan dan persetujuan rilis masih terbuka. Tidak ada jadwal roadmap atau tanggal pilot yang dijanjikan.

## Perbedaan dokumentasi dan implementasi

1. Bagian baseline lama masih menyebut Sanctum/native belum tersedia, NO_PACKAGES mempertahankan ASSIGNED/retry, dan mobile tidak dapat verify/close. Composer, routes, kode dan addendum terbaru membuktikan implementasi sudah berkembang. Slide memakai aturan terbaru dan slide 13 mengungkap perubahan baseline ini.
2. Kebijakan terbaru menjadikan NO_PACKAGES tugas terminal dengan alasan wajib. Kunjungan berikutnya adalah tugas baru terkait asal. Tidak ada POP/receipt pickup berhasil/handover untuk hasil ini.
3. Verifikasi dan penutupan mobile tersedia sesuai persetujuan owner. Backend tidak membatasi verifikasi hanya pada Retail Staff. Presentasi tidak mengklaim pemisahan hak Retail-only yang tidak ada di kode.
4. PRD MOB-08 memuat frasa penutupan tidak memerlukan review POP, tetapi `CloseSession` menolak penutupan saat `needsReview()` benar. Presentasi mengikuti kode dan tidak menyatakan bahwa close selalu tersedia setelah input jumlah saja.
5. Plan §16 menyebut logo JNE tidak ada, sedangkan kini `resources/mobile/src/jne-logo.svg` tersedia. Otorisasi/provenance aset merek belum dikonfirmasi. Presentasi tidak menggunakan logo JNE terpisah atau membuat logo pengganti.

## Visual dan daftar aset

Screenshot berasal dari artefak pengujian yang sudah tersedia, bukan tangkapan produksi atau UI yang dihasilkan. Plan §16,17,19 mengidentifikasi screenshot native sebagai fixture/emulator meskipun sebagian nama berkas sumber memakai kata `mockup`. Nama, alamat, nomor telepon, jumlah paket dan sesi pada gambar merupakan data fixture sintetis. Tampilan adalah snapshot pengujian terdahulu dan bukan klaim screenshot build terbaru. Label data uji terlihat pada slide. Crop hanya membuang status bar atau area luar, tanpa mengubah isi layar.

Folder `assets/` memuat:

- `mobile-detail.png`: detail pickup untuk cover.
- `mobile-home.png` dan `mobile-tasks.png`: ruang kerja Android.
- `mobile-no-packages.png`: hasil Selesai Tanpa Paket.
- `mobile-quantities.png` dan `mobile-review.png`: jumlah dan review POP.
- `mobile-verification.png` dan `mobile-closed.png`: verifikasi serta sesi ditutup dengan selisih.
- `web-create.png`: formulir pembuatan pickup tanpa data pelanggan.
- `pickup-workflow.png`: pratinjau diagram alur slide 5.
- `system-architecture.png`: pratinjau diagram arsitektur slide 12.
- `cashless-concept.png`: pratinjau konsep cashless slide 16.
- `asset-manifest.json`: pemetaan gambar ke sumber asli dan keterangan pemrosesan.

Ketiga diagram tetap berupa shapes, teks dan connector native dalam PPTX. PNG diagram hanya salinan untuk penggunaan ulang. Tidak ada unggahan source, screenshot, data pelanggan atau informasi proyek ke layanan gambar eksternal. Tidak ada generated UI yang disamarkan sebagai fitur bekerja.

## Pemeriksaan hasil

Paket PPTX, ukuran 16:9, font Arial, 18 slide, tiga tabel native, serta kemampuan import ulang diperiksa menggunakan validator presentasi. Semua slide dirender dan diperiksa untuk keterbacaan, clipping, arah connector, dan konsistensi. File dibuka dalam Microsoft PowerPoint untuk pemeriksaan kompatibilitas dan ekspor PDF. PDF mempertahankan teks yang dapat dicari dan bukan kumpulan gambar slide.

Ekspor PDF bawaan generator terkendala modul font `#standard-fonts/Helvetica`; PDF final menggunakan ekspor Microsoft PowerPoint. Tidak ada keterbatasan ekspor yang menghalangi penggunaan file final. Tidak ada credential, private key, token, URL backend internal, atau data pelanggan produksi dalam konten presentasi dan catatan.
