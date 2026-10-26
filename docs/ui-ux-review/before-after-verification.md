# Verifikasi sebelum / sesudah

26 Oktober 2026. Evidence dari aplikasi nyata dengan data sintetis terisolasi, bukan transaksi produksi. Semua pasangan memakai route, role, dataset, UI state, viewport, browser zoom 100%, DPR 1 dan tema terang yang sama. Viewport: **1366×768, 768×1024, 390×844, 320×740**. 188 capture dasar sebelum dan 188 sesudah, ditambah 8 pasangan validasi/keyboard, 2 pasangan menu mobile, serta 4 pasangan halaman verifikasi email dan 2 pasangan success (verifikasi email/reset) kondisional. Screenshot adalah viewport, bukan bukti setiap baris di bawah fold terlihat.

Before utama berasal dari source e3a0be0 beserta empat perubahan pengguna yang sudah ada. P08/P09/P29 mempunyai baseline khusus Q1 pada 50a4ff3 dengan SSR aktif, sebelum koreksi title SVG; pasangan viewport/role/dataset/state/theme tetap sama. Capture error awal yang belum menunggu render dibuang dari perbandingan dan diganti dengan rebuild frontend asli; snapshot source yang direvisi dipulihkan dan dibangun kembali. Pengukuran error pada file akhir menunggu pesan tampil dan dua animation frame. Server Vite development yang sudah ada menjadi aktif pada akhir pekerjaan; full matrix akhir dan perbandingan chart memakai SSR development, sementara production build diverifikasi terpisah. Tidak menghentikan atau mengubah konfigurasi server pengguna. Untuk rapid validation/keyboard dan regresi akhir, bootstrap tests/Fixtures/ui-ux-browser-server.php memakai hot-file privat yang tidak ada sehingga Laravel membaca manifest build. Konfigurasi aplikasi pengguna tetap sama; tanpa bundle SSR production, bootstrap ini mengikuti fallback CSR normal. Menu mobile memiliki baseline khusus sebelum koreksi B3; tidak dicampur sebagai capture baru dari commit lama. Verifikasi email mempunyai baseline khusus pada 0638cfc sebelum koreksi status sukses; flag verified akun fixture diubah sementara dan dipulihkan pada kedua fase, dengan mail array. Baseline success reset diambil sebelum koreksi warna terakhir (warna lama tetap sama sejak baseline umum); token reset fixture diisolasi dan dipulihkan untuk request yang sebanding. Jam server tidak dibekukan; teks freshness yang dihasilkan request dapat berbeda, sementara record fixture dan state bisnis tetap sama.

## Indikator utama

| Indikator pada 390×844 | Sebelum | Sesudah | Makna yang diverifikasi |
| --- | --- | --- | --- |
| Search Monitoring pemrosesan | y=1270 | y=339 | Pencarian berada dalam viewport tanpa scroll awal |
| Search Monitoring hasil pickup | y=1389 | y=339 | Pencarian berada dalam viewport tanpa scroll awal |
| Search AWB dalam report | y=757 | y=439 | Pencarian berada dalam viewport tanpa scroll awal |
| Search Customer & nama pengirim | y=773 | y=645 | Pencarian berada dalam viewport tanpa scroll awal |
| Search Jadwal Regular | y=310 | y=172 | Pencarian berada dalam viewport tanpa scroll awal |
| Baris kerja pertama pemrosesan | Di bawah pencarian yang sudah berada di luar viewport | y=768 | Awal record berada dalam viewport 390px; tidak berarti seluruh tabel/aksi sekaligus terlihat |
| Baris kerja pertama pickup | Di bawah pencarian yang sudah berada di luar viewport | y=814 | Awal record berada dalam viewport 390px; tidak berarti seluruh tabel/aksi sekaligus terlihat |
| Overflow halaman pada 320px | Report request dan push test overflow | Tidak ada pada seluruh capture | Kontrol tidak terpotong oleh lebar halaman |
| Tutup menu setelah Tab, 390/320px | Escape gagal pada kedua capture B3 | Satu Escape; fokus kembali ke trigger | Tidak ada hidden tooltip layer yang mengambil Escape |
| Target tutup | Dialog/Sheet 16px; close menu tersembunyi | 44×44px | Geometry dan keyboard, bukan pembesaran ikon saja |

Kontras teks status reset pada 390px berubah dari 3,22:1 menjadi 4.95:1; tema gelap juga melewati 4,5:1. [Success reset sebelum](evidence/before/forgot-success-390.png) / [sesudah](evidence/after/forgot-success-390.png); rasio dihitung dari warna ter-render, termasuk konversi CSS OKLCH melalui canvas dan background ancestors.

Search umum masih memerlukan input dan satu aktivasi Cari seperti sebelumnya; pengurangan yang dibuktikan adalah scroll awal, bukan durasi kerja pengguna. Bantuan/ringkasan tambahan dan rincian kategori memerlukan satu pembukaan disclosure; exception penting dan recovery gagal tetap tampil.

## P03 — Lupa kata sandi

- **Masalah awal:** Error email tidak terkait kontrol; fokus validasi tidak ditangani; status tidak diumumkan dan success text hanya 3,22:1 pada latar terang.
- **Perubahan:** Error email terasosiasi dan difokuskan; status pengiriman memiliki live semantics dan warna yang lolos kontras terang/gelap; tidak membuka keyboard ponsel saat halaman dimuat.
- **Bukti setara:**

| Lebar | Sebelum | Sesudah |
| --- | --- | --- |
| 1366px | [Screenshot](evidence/before/forgot-password-1366.png) | [Screenshot](evidence/after/forgot-password-1366.png) |
| 768px | [Screenshot](evidence/before/forgot-password-768.png) | [Screenshot](evidence/after/forgot-password-768.png) |
| 390px | [Screenshot](evidence/before/forgot-password-390.png) | [Screenshot](evidence/after/forgot-password-390.png) |
| 320px | [Screenshot](evidence/before/forgot-password-320.png) | [Screenshot](evidence/after/forgot-password-320.png) |

**Recovery validasi:** [sebelum](evidence/before/forgot-validation-interaction-390.png) / [sesudah](evidence/after/forgot-validation-interaction-390.png); fokus sesudah: `email`, invalid control mempunyai deskripsi error. Untuk form web autentikasi, 302 adalah redirect validasi dengan session errors; untuk useHttp operasional, responsnya 422. Native validation sengaja dilewati hanya pada pengujian negative submit yang dicatat.

**Hasil terverifikasi:** Label/fokus, keyboard dan kontrol diuji sesuai workflow; tidak memakai skor visual. Tidak ada overflow halaman atau error JavaScript pada keempat ukuran.

**Keterbatasan:** Success UI memakai mail array; request nyata ke provider email dan delivery tidak diuji.

## P04 — Reset kata sandi

- **Masalah awal:** Error email dan password tidak terkait kontrol; token invalid perlu jalur koreksi terlihat.
- **Perubahan:** Error email/password terasosiasi dan difokuskan; tautan meminta reset baru menyediakan recovery token invalid.
- **Bukti setara:**

| Lebar | Sebelum | Sesudah |
| --- | --- | --- |
| 1366px | [Screenshot](evidence/before/reset-password-1366.png) | [Screenshot](evidence/after/reset-password-1366.png) |
| 768px | [Screenshot](evidence/before/reset-password-768.png) | [Screenshot](evidence/after/reset-password-768.png) |
| 390px | [Screenshot](evidence/before/reset-password-390.png) | [Screenshot](evidence/after/reset-password-390.png) |
| 320px | [Screenshot](evidence/before/reset-password-320.png) | [Screenshot](evidence/after/reset-password-320.png) |

**Recovery validasi:** [sebelum](evidence/before/reset-validation-interaction-390.png) / [sesudah](evidence/after/reset-validation-interaction-390.png); fokus sesudah: `email`, invalid control mempunyai deskripsi error. Untuk form web autentikasi, 302 adalah redirect validasi dengan session errors; untuk useHttp operasional, responsnya 422. Native validation sengaja dilewati hanya pada pengujian negative submit yang dicatat.

**Hasil terverifikasi:** Label/fokus, keyboard dan kontrol diuji sesuai workflow; tidak memakai skor visual. Tidak ada overflow halaman atau error JavaScript pada keempat ukuran.

**Keterbatasan:** Browser memakai token invalid; valid reset/email diuji backend dengan test doubles.

## P05 — Verifikasi email

- **Masalah awal:** Status kirim ulang sukses tampil tanpa semantic status; warna sukses perlu kontras AA normal text; baseline kondisional dikonfirmasi dengan akun fixture sementara unverified.
- **Perubahan:** Status sukses kirim ulang sekarang mempunyai role=status dan warna dengan kontras memadai pada tema terang/gelap; pesan, button pending, logout dan kontrak verifikasi tetap sama.
- **Bukti setara:**

| Lebar | Sebelum | Sesudah |
| --- | --- | --- |
| 1366px | [Screenshot](evidence/before/verify-email-1366.png) | [Screenshot](evidence/after/verify-email-1366.png) |
| 768px | [Screenshot](evidence/before/verify-email-768.png) | [Screenshot](evidence/after/verify-email-768.png) |
| 390px | [Screenshot](evidence/before/verify-email-390.png) | [Screenshot](evidence/after/verify-email-390.png) |
| 320px | [Screenshot](evidence/before/verify-email-320.png) | [Screenshot](evidence/after/verify-email-320.png) |

**Hasil terverifikasi:** Request kirim ulang berhasil pada mail array; status sukses visible pada kedua fase, role=status berubah dari false menjadi true. Button pending dan logout tetap tersedia. Lihat pasangan success dan JSON conditional. Tidak ada overflow halaman atau error JavaScript pada keempat ukuran.

**Keterbatasan:** Capture kondisional memakai account admin sementara unverified pada fixture yang sama, lalu dipulihkan. Mail array, bukan delivery email nyata. Baseline khusus diambil pada 0638cfc sebelum koreksi status ini.

## P06 — Konfirmasi kata sandi

- **Masalah awal:** Error belum terhubung; fokus error tidak dikembalikan.
- **Perubahan:** Error terkait password dan fokus kembali; pesan penolakan sekarang berbahasa Indonesia.
- **Bukti setara:**

| Lebar | Sebelum | Sesudah |
| --- | --- | --- |
| 1366px | [Screenshot](evidence/before/confirm-password-1366.png) | [Screenshot](evidence/after/confirm-password-1366.png) |
| 768px | [Screenshot](evidence/before/confirm-password-768.png) | [Screenshot](evidence/after/confirm-password-768.png) |
| 390px | [Screenshot](evidence/before/confirm-password-390.png) | [Screenshot](evidence/after/confirm-password-390.png) |
| 320px | [Screenshot](evidence/before/confirm-password-320.png) | [Screenshot](evidence/after/confirm-password-320.png) |

**Recovery validasi:** [sebelum](evidence/before/confirm-validation-interaction-390.png) / [sesudah](evidence/after/confirm-validation-interaction-390.png); fokus sesudah: `password`, invalid control mempunyai deskripsi error. Untuk form web autentikasi, 302 adalah redirect validasi dengan session errors; untuk useHttp operasional, responsnya 422. Native validation sengaja dilewati hanya pada pengujian negative submit yang dicatat.

**Hasil terverifikasi:** Label/fokus, keyboard dan kontrol diuji sesuai workflow; tidak memakai skor visual. Tidak ada overflow halaman atau error JavaScript pada keempat ukuran.

**Keterbatasan:** Tidak mewakili uji penetrasi; gate dan pesan penolakan diverifikasi.

## P08 — Dashboard Admin

- **Masalah awal:** Metrik dan grafik relevan dengan keputusan; tidak ada alasan menyamakan dashboard dengan daftar kerja. SSR React menghasilkan title SVG kosong karena beberapa child text; browser melaporkan hydration mismatch dan meregenerasi chart.
- **Perubahan:** Judul grafik SVG dijadikan satu string; HTML server sekarang berisi label dan nilai yang sama dengan client, tanpa hydration mismatch. Seluruh data, tooltip, pilihan metrik dan tabel alternatif dipertahankan.
- **Bukti setara:**

| Lebar | Sebelum | Sesudah |
| --- | --- | --- |
| 1366px | [Screenshot](evidence/before/dashboard-admin-1366.png) | [Screenshot](evidence/after/dashboard-admin-1366.png) |
| 768px | [Screenshot](evidence/before/dashboard-admin-768.png) | [Screenshot](evidence/after/dashboard-admin-768.png) |
| 390px | [Screenshot](evidence/before/dashboard-admin-390.png) | [Screenshot](evidence/after/dashboard-admin-390.png) |
| 320px | [Screenshot](evidence/before/dashboard-admin-320.png) | [Screenshot](evidence/after/dashboard-admin-320.png) |

**Hasil terverifikasi:** Tiga regresi renderer gagal sebelum Q1 karena title kosong dan lulus sesudahnya. Browser tidak lagi melaporkan hydration mismatch; label, jumlah, tooltip dan pilihan metrik tetap tersedia. Tidak ada overflow halaman atau error JavaScript pada keempat ukuran.

**Keterbatasan:** Baseline khusus SSR pada 50a4ff3 sebelum Q1; screenshot sendiri tidak membuktikan label server. Tiga test renderer dan browser error log melengkapi evidence.

## P09 — Dashboard CS

- **Masalah awal:** Dispatch role dan cakupan data sudah terpisah; dialog mengikuti perbaikan primitive bersama. SSR React menghasilkan title SVG kosong karena beberapa child text; browser melaporkan hydration mismatch dan meregenerasi chart.
- **Perubahan:** Judul grafik SVG dijadikan satu string; HTML server sekarang berisi label dan nilai yang sama dengan client, tanpa hydration mismatch. Seluruh data, tooltip, pilihan metrik dan tabel alternatif dipertahankan.
- **Bukti setara:**

| Lebar | Sebelum | Sesudah |
| --- | --- | --- |
| 1366px | [Screenshot](evidence/before/dashboard-cs-1366.png) | [Screenshot](evidence/after/dashboard-cs-1366.png) |
| 768px | [Screenshot](evidence/before/dashboard-cs-768.png) | [Screenshot](evidence/after/dashboard-cs-768.png) |
| 390px | [Screenshot](evidence/before/dashboard-cs-390.png) | [Screenshot](evidence/after/dashboard-cs-390.png) |
| 320px | [Screenshot](evidence/before/dashboard-cs-320.png) | [Screenshot](evidence/after/dashboard-cs-320.png) |

**Hasil terverifikasi:** Tiga regresi renderer gagal sebelum Q1 karena title kosong dan lulus sesudahnya. Browser tidak lagi melaporkan hydration mismatch; label, jumlah, tooltip dan pilihan metrik tetap tersedia. Tidak ada overflow halaman atau error JavaScript pada keempat ukuran.

**Keterbatasan:** SSR aktif pada perbandingan Q1; tidak mengklaim pengurangan interaksi atau perubahan angka dashboard.

## P10 — Dashboard Retail

- **Masalah awal:** Empat ringkasan satu kolom pada ponsel mendorong sesi penerimaan dan tombol verifikasi ke bawah; semua angka tetap relevan.
- **Perubahan:** Ringkasan mobile menjadi dua kolom; semua jumlah dipertahankan; sesi pending dan tombol Verifikasi masuk viewport 390px.
- **Bukti setara:**

| Lebar | Sebelum | Sesudah |
| --- | --- | --- |
| 1366px | [Screenshot](evidence/before/dashboard-retail-1366.png) | [Screenshot](evidence/after/dashboard-retail-1366.png) |
| 768px | [Screenshot](evidence/before/dashboard-retail-768.png) | [Screenshot](evidence/after/dashboard-retail-768.png) |
| 390px | [Screenshot](evidence/before/dashboard-retail-390.png) | [Screenshot](evidence/after/dashboard-retail-390.png) |
| 320px | [Screenshot](evidence/before/dashboard-retail-320.png) | [Screenshot](evidence/after/dashboard-retail-320.png) |

**Hasil terverifikasi:** Empat ringkasan berubah dari empat menjadi dua baris pada 390px. Sesi HO-0001 dan tombol Verifikasi sekarang terlihat dalam viewport; jumlah 0/1/6/6 tetap sama. Tidak ada overflow halaman atau error JavaScript pada keempat ukuran.

**Keterbatasan:** Fixture satu sesi aktif; tidak mewakili seluruh volume produksi atau studi waktu pengguna.

## P11 — Dashboard Pickup

- **Masalah awal:** Empat ringkasan satu kolom memperpanjang akses menuju pekerjaan; tren dan exception tetap diperlukan. Sparkline juga mempunyai title kosong/mismatch pada SSR karena beberapa child text.
- **Perubahan:** Label Sparkline juga menjadi satu string untuk mencegah title kosong/mismatch saat SSR. Ringkasan mobile dua kolom; jumlah, delta, sparkline dan exception tetap utuh sehingga bagian pekerjaan lebih awal.
- **Bukti setara:**

| Lebar | Sebelum | Sesudah |
| --- | --- | --- |
| 1366px | [Screenshot](evidence/before/dashboard-pickup-1366.png) | [Screenshot](evidence/after/dashboard-pickup-1366.png) |
| 768px | [Screenshot](evidence/before/dashboard-pickup-768.png) | [Screenshot](evidence/after/dashboard-pickup-768.png) |
| 390px | [Screenshot](evidence/before/dashboard-pickup-390.png) | [Screenshot](evidence/after/dashboard-pickup-390.png) |
| 320px | [Screenshot](evidence/before/dashboard-pickup-320.png) | [Screenshot](evidence/after/dashboard-pickup-320.png) |

**Tambahan SSR Sparkline:** [baseline error](evidence/before-sparkline-ssr.json) mencatat error pada empat viewport sesudah perubahan density. Screenshot after di atas memakai source dengan title satu string; HTML renderer dan browser diverifikasi tanpa mismatch.

**Hasil terverifikasi:** Empat ringkasan mobile menjadi dua baris; seluruh angka, delta dan sparkline tetap terlihat. Exception dipertahankan; tidak mengklaim seluruh daftar kerja tanpa scroll. Tidak ada overflow halaman atau error JavaScript pada keempat ukuran.

**Keterbatasan:** Exception esensial tetap terlihat; daftar kerja dapat tetap memerlukan scroll, terutama pada 320px.

## P12 — Master customer

- **Masalah awal:** Search y=240 pada 390px; daftar dan dialog sudah mempunyai recovery dan draft guard. Target tutup overlay hanya 16px; dialog/Sheet perlu target dan containment yang layak.
- **Perubahan:** Dialog customer mewarisi target tutup 44px, batas viewport dan scroll containment; keyboard/draft guard existing tetap lolos. Navigasi mobile dapat ditutup dengan satu Escape.
- **Bukti setara:**

| Lebar | Sebelum | Sesudah |
| --- | --- | --- |
| 1366px | [Screenshot](evidence/before/customer-dialog-1366.png) | [Screenshot](evidence/after/customer-dialog-1366.png) |
| 768px | [Screenshot](evidence/before/customer-dialog-768.png) | [Screenshot](evidence/after/customer-dialog-768.png) |
| 390px | [Screenshot](evidence/before/customer-dialog-390.png) | [Screenshot](evidence/after/customer-dialog-390.png) |
| 320px | [Screenshot](evidence/before/customer-dialog-320.png) | [Screenshot](evidence/after/customer-dialog-320.png) |

**Hasil terverifikasi:** Search y=310 → 317. Tidak ada overflow halaman atau error JavaScript pada keempat ukuran.

**Keterbatasan:** Tidak menambah customer valid di aplikasi operasional; negative submit, lookup, dialog dan navigation diuji pada fixture.

## P13 — Operasional Pickup

- **Masalah awal:** Lima kartu ringkasan mendahului pencarian; toolbar penugasan tampil tanpa pilihan; tanggal bertumpuk pada 390px.
- **Perubahan:** Filter mendahului ringkasan padat lima jumlah; toolbar bulk muncul saat ada pilihan. Tanggal berpasangan pada 390px, stack pada 320px; semua kontrol dan seleksi lintas halaman tetap tersedia.
- **Bukti setara:**

| Lebar | Sebelum | Sesudah |
| --- | --- | --- |
| 1366px | [Screenshot](evidence/before/tasks-1366.png) | [Screenshot](evidence/after/tasks-1366.png) |
| 768px | [Screenshot](evidence/before/tasks-768.png) | [Screenshot](evidence/after/tasks-768.png) |
| 390px | [Screenshot](evidence/before/tasks-390.png) | [Screenshot](evidence/after/tasks-390.png) |
| 320px | [Screenshot](evidence/before/tasks-320.png) | [Screenshot](evidence/after/tasks-320.png) |

**Hasil terverifikasi:** Pencarian mendahului ringkasan; toolbar tidak muncul saat nol pilihan, muncul setelah checkbox dipilih, mempertahankan seleksi saat pagination dan hilang setelah clear. Tidak mengirim assignment. Input tanggal 390px masing-masing 156×44px dan satu baris; 320px bertumpuk. Tidak ada overflow halaman atau error JavaScript pada keempat ukuran.

**Keterbatasan:** Pada 390px awal daftar terlihat, record lengkap masih memerlukan scroll. Bulk diuji pilih/pagination/clear tanpa mengirim assignment nyata.

## P14 — Tugas Saya

- **Masalah awal:** Ringkasan tugas dan spacing memperpanjang halaman; pasangan tanggal bertumpuk walau 390px menyediakan ruang yang cukup.
- **Perubahan:** Ringkasan tugas lebih ringkas, spacing daftar dipadatkan, tanggal adaptif tanpa menghilangkan filter atau jadwal berikutnya.
- **Bukti setara:**

| Lebar | Sebelum | Sesudah |
| --- | --- | --- |
| 1366px | [Screenshot](evidence/before/mine-1366.png) | [Screenshot](evidence/after/mine-1366.png) |
| 768px | [Screenshot](evidence/before/mine-768.png) | [Screenshot](evidence/after/mine-768.png) |
| 390px | [Screenshot](evidence/before/mine-390.png) | [Screenshot](evidence/after/mine-390.png) |
| 320px | [Screenshot](evidence/before/mine-320.png) | [Screenshot](evidence/after/mine-320.png) |

**Hasil terverifikasi:** Ringkasan tetap menampilkan jumlah hari ini dan jadwal berikutnya. Spacing dan pasangan tanggal lebih ringkas pada 390px; semua field, tab dan aksi tetap terlihat. Tidak ada overflow halaman atau error JavaScript pada keempat ukuran.

**Keterbatasan:** Semua konteks tugas dan filter tetap terlihat; record dapat tetap di bawah viewport pada ponsel sempit.

## P15 — Tugas tersedia

- **Masalah awal:** Filter tanggal menambah satu baris pada 390px; tugas kandidat dan konfirmasi pengambilalihan harus tetap tersedia.
- **Perubahan:** Spacing dan pasangan tanggal dipadatkan pada 390px; seluruh kandidat, filter dan kapabilitas pengambilalihan dipertahankan.
- **Bukti setara:**

| Lebar | Sebelum | Sesudah |
| --- | --- | --- |
| 1366px | [Screenshot](evidence/before/available-1366.png) | [Screenshot](evidence/after/available-1366.png) |
| 768px | [Screenshot](evidence/before/available-768.png) | [Screenshot](evidence/after/available-768.png) |
| 390px | [Screenshot](evidence/before/available-390.png) | [Screenshot](evidence/after/available-390.png) |
| 320px | [Screenshot](evidence/before/available-320.png) | [Screenshot](evidence/after/available-320.png) |

**Hasil terverifikasi:** Pasangan tanggal menjadi satu baris pada 390px tanpa memotong kontrol; 320px kembali bertumpuk. Kandidat dan aksi berbasis kapabilitas tetap tersedia. Tidak ada overflow halaman atau error JavaScript pada keempat ukuran.

**Keterbatasan:** Tidak mengirim pengambilalihan nyata; policy dan transisi diuji backend.

## P16 — Riwayat Pickup

- **Masalah awal:** Filter tanggal bertumpuk pada 390px dan spacing menunda daftar; hasil akhir dan bukti tetap esensial.
- **Perubahan:** Spacing dan pasangan tanggal dipadatkan pada 390px; hasil akhir, bukti dan seluruh filter tetap tersedia.
- **Bukti setara:**

| Lebar | Sebelum | Sesudah |
| --- | --- | --- |
| 1366px | [Screenshot](evidence/before/pickup-history-1366.png) | [Screenshot](evidence/after/pickup-history-1366.png) |
| 768px | [Screenshot](evidence/before/pickup-history-768.png) | [Screenshot](evidence/after/pickup-history-768.png) |
| 390px | [Screenshot](evidence/before/pickup-history-390.png) | [Screenshot](evidence/after/pickup-history-390.png) |
| 320px | [Screenshot](evidence/before/pickup-history-320.png) | [Screenshot](evidence/after/pickup-history-320.png) |

**Hasil terverifikasi:** Filter tanggal satu baris pada 390px dan dua pada 320px; tidak ada kontrol yang dihilangkan. Daftar hasil tetap memakai mode riwayat. Tidak ada overflow halaman atau error JavaScript pada keempat ukuran.

**Keterbatasan:** Pada 320px tanggal tetap bertumpuk demi keterbacaan; tidak menjanjikan seluruh record tanpa scroll.

## P17 — Buat Pickup

- **Masalah awal:** Header formulir mengulang tugas; error field tidak terhubung dan respons 422 tidak memfokuskan kontrol.
- **Perubahan:** Header berulang dihapus; error customer/alamat/jadwal/catatan terkait kontrol dan fokus; submission key/recovery dipertahankan.
- **Bukti setara:**

| Lebar | Sebelum | Sesudah |
| --- | --- | --- |
| 1366px | [Screenshot](evidence/before/create-pickup-1366.png) | [Screenshot](evidence/after/create-pickup-1366.png) |
| 768px | [Screenshot](evidence/before/create-pickup-768.png) | [Screenshot](evidence/after/create-pickup-768.png) |
| 390px | [Screenshot](evidence/before/create-pickup-390.png) | [Screenshot](evidence/after/create-pickup-390.png) |
| 320px | [Screenshot](evidence/before/create-pickup-320.png) | [Screenshot](evidence/after/create-pickup-320.png) |

**Recovery validasi:** [sebelum](evidence/before/create-validation-interaction-390.png) / [sesudah](evidence/after/create-validation-interaction-390.png); fokus sesudah: `pickup-customer`, invalid control mempunyai deskripsi error. Untuk form web autentikasi, 302 adalah redirect validasi dengan session errors; untuk useHttp operasional, responsnya 422. Native validation sengaja dilewati hanya pada pengujian negative submit yang dicatat.

**Hasil terverifikasi:** Label/fokus, keyboard dan kontrol diuji sesuai workflow; tidak memakai skor visual. Tidak ada overflow halaman atau error JavaScript pada keempat ukuran.

**Keterbatasan:** Validasi dan lookup diuji; tidak menciptakan transaksi operasional nyata.

## P21 — Jadwal Regular

- **Masalah awal:** Pesan scheduler mendahului pencarian; dialog menghapus draft saat Escape tanpa konfirmasi; error tidak terasosiasi.
- **Perubahan:** Pencarian mendahului penjelasan scheduler; label dan error inline; Escape/close menanyakan pembuangan hanya jika draft berubah.
- **Bukti setara:**

| Lebar | Sebelum | Sesudah |
| --- | --- | --- |
| 1366px | [Screenshot](evidence/before/schedules-1366.png) | [Screenshot](evidence/after/schedules-1366.png) |
| 768px | [Screenshot](evidence/before/schedules-768.png) | [Screenshot](evidence/after/schedules-768.png) |
| 390px | [Screenshot](evidence/before/schedules-390.png) | [Screenshot](evidence/after/schedules-390.png) |
| 320px | [Screenshot](evidence/before/schedules-320.png) | [Screenshot](evidence/after/schedules-320.png) |

**Recovery validasi:** [sebelum](evidence/before/schedule-validation-interaction-390.png) / [sesudah](evidence/after/schedule-validation-interaction-390.png); fokus sesudah: `schedule-customer`, invalid control mempunyai deskripsi error. Untuk form web autentikasi, 302 adalah redirect validasi dengan session errors; untuk useHttp operasional, responsnya 422. Native validation sengaja dilewati hanya pada pengujian negative submit yang dicatat.

**Hasil terverifikasi:** Search y=310 → 172. Tidak ada overflow halaman atau error JavaScript pada keempat ukuran.

**Keterbatasan:** Negative submit dan draft recovery diuji; generasi jadwal/worker live tidak dijalankan.

## P22 — Monitoring pemrosesan

- **Masalah awal:** Search y=1270 pada 390px; empat kartu satu kolom dan tabel ringkasan mendahului daftar.
- **Perubahan:** Search dipindah ke awal, ringkasan padat, kategori disclosure, bantuan kontekstual. Manual dan konfirmasi eksternal tetap terpisah; null ditulis Belum tersedia.
- **Bukti setara:**

| Lebar | Sebelum | Sesudah |
| --- | --- | --- |
| 1366px | [Screenshot](evidence/before/results-processing-1366.png) | [Screenshot](evidence/after/results-processing-1366.png) |
| 768px | [Screenshot](evidence/before/results-processing-768.png) | [Screenshot](evidence/after/results-processing-768.png) |
| 390px | [Screenshot](evidence/before/results-processing-390.png) | [Screenshot](evidence/after/results-processing-390.png) |
| 320px | [Screenshot](evidence/before/results-processing-320.png) | [Screenshot](evidence/after/results-processing-320.png) |

**Hasil terverifikasi:** Search y=1270 → 339. Tidak ada overflow halaman atau error JavaScript pada keempat ukuran.

**Keterbatasan:** Tabel lebar tetap memakai scroll lokal. Konfirmasi eksternal yang belum tersedia tidak diganti angka nol.

## P23 — Monitoring hasil pickup

- **Masalah awal:** Search y=1389 pada 390px; lima kartu satu kolom dan antrean mendahului pekerjaan pencarian.
- **Perubahan:** Search di awal; metrik dan antrean exception padat; semua filter antrean tetap terlihat. Rincian bantuan berada dalam disclosure.
- **Bukti setara:**

| Lebar | Sebelum | Sesudah |
| --- | --- | --- |
| 1366px | [Screenshot](evidence/before/results-pickup-1366.png) | [Screenshot](evidence/after/results-pickup-1366.png) |
| 768px | [Screenshot](evidence/before/results-pickup-768.png) | [Screenshot](evidence/after/results-pickup-768.png) |
| 390px | [Screenshot](evidence/before/results-pickup-390.png) | [Screenshot](evidence/after/results-pickup-390.png) |
| 320px | [Screenshot](evidence/before/results-pickup-320.png) | [Screenshot](evidence/after/results-pickup-320.png) |

**Hasil terverifikasi:** Search y=1389 → 339. Tidak ada overflow halaman atau error JavaScript pada keempat ukuran.

**Keterbatasan:** Pada 320px record dapat memerlukan scroll karena konteks esensial. Pencarian dan filter tetap dapat diakses. Pengurangan waktu tugas belum diukur dengan pengguna.

## P25 — Daftar Handover

- **Masalah awal:** Tanggal mulai/selesai bertumpuk pada 390px sehingga daftar sesi turun; full-task selection dan guard penutupan perlu dipertahankan.
- **Perubahan:** Tanggal mulai/selesai berada satu baris pada 390px dan bertumpuk pada 320px. Filter status, petugas, konteks tanggal dan seleksi tetap sama.
- **Bukti setara:**

| Lebar | Sebelum | Sesudah |
| --- | --- | --- |
| 1366px | [Screenshot](evidence/before/handovers-1366.png) | [Screenshot](evidence/after/handovers-1366.png) |
| 768px | [Screenshot](evidence/before/handovers-768.png) | [Screenshot](evidence/after/handovers-768.png) |
| 390px | [Screenshot](evidence/before/handovers-390.png) | [Screenshot](evidence/after/handovers-390.png) |
| 320px | [Screenshot](evidence/before/handovers-320.png) | [Screenshot](evidence/after/handovers-320.png) |

**Hasil terverifikasi:** Tanggal 390px masing-masing 156×44px dan satu baris; pada 320px masing-masing 254×44px dan bertumpuk. Isi tanggal tetap sama setelah perubahan viewport. Tidak ada overflow halaman atau error JavaScript pada keempat ukuran.

**Keterbatasan:** Tidak membuat atau menutup sesi nyata; seleksi mobile dan validasi diuji pada fixture serta backend.

## P26 — Riwayat Handover

- **Masalah awal:** Pasangan tanggal bertumpuk pada 390px; konteks riwayat dan default filter tetap diperlukan.
- **Perubahan:** Pasangan tanggal adaptif memperpendek area filter pada 390px tanpa mengubah mode riwayat, default atau nilai filter.
- **Bukti setara:**

| Lebar | Sebelum | Sesudah |
| --- | --- | --- |
| 1366px | [Screenshot](evidence/before/handover-history-1366.png) | [Screenshot](evidence/after/handover-history-1366.png) |
| 768px | [Screenshot](evidence/before/handover-history-768.png) | [Screenshot](evidence/after/handover-history-768.png) |
| 390px | [Screenshot](evidence/before/handover-history-390.png) | [Screenshot](evidence/after/handover-history-390.png) |
| 320px | [Screenshot](evidence/before/handover-history-320.png) | [Screenshot](evidence/after/handover-history-320.png) |

**Hasil terverifikasi:** State kosong dan filter riwayat terlihat tanpa overflow. Tanggal satu baris pada 390px dan bertumpuk pada 320px; mode dan kontrol dipertahankan. Tidak ada overflow halaman atau error JavaScript pada keempat ukuran.

**Keterbatasan:** Fixture riwayat kosong; state empty dan kontrol dicapture, perilaku data selesai dilindungi tests backend.

## P27 — Verifikasi Handover

- **Masalah awal:** Identitas pembuat menjadi kartu kelima dan mengulang tanggal header; kartu tinggi menunda daftar verifikasi.
- **Perubahan:** Empat jumlah dipadatkan; pembuat menjadi metadata, tanggal tetap pada header; daftar kandidat lebih awal. Jumlah, selisih dan guard tetap sama.
- **Bukti setara:**

| Lebar | Sebelum | Sesudah |
| --- | --- | --- |
| 1366px | [Screenshot](evidence/before/handover-detail-1366.png) | [Screenshot](evidence/after/handover-detail-1366.png) |
| 768px | [Screenshot](evidence/before/handover-detail-768.png) | [Screenshot](evidence/after/handover-detail-768.png) |
| 390px | [Screenshot](evidence/before/handover-detail-390.png) | [Screenshot](evidence/after/handover-detail-390.png) |
| 320px | [Screenshot](evidence/before/handover-detail-320.png) | [Screenshot](evidence/after/handover-detail-320.png) |

**Hasil terverifikasi:** Kartu pembuat/tanggal yang berulang menjadi metadata teks; jumlah 12 task, 108 paket, 6/12 verifikasi dan 6 discrepancy tetap sama. Lebih banyak kandidat terlihat pada viewport 390px. Tidak ada overflow halaman atau error JavaScript pada keempat ukuran.

**Keterbatasan:** Tidak mengirim jumlah fisik atau finalisasi nyata; perbandingan independent dan guard diuji backend.

## P28 — Monitoring Selisih

- **Masalah awal:** Tanggal mulai/selesai bertumpuk pada 390px; filter kategori/status dan konteks selisih tetap esensial.
- **Perubahan:** Tanggal berpasangan bila cukup lebar; semua filter kategori/status, catatan dan konteks pemeriksaan tetap tersedia.
- **Bukti setara:**

| Lebar | Sebelum | Sesudah |
| --- | --- | --- |
| 1366px | [Screenshot](evidence/before/discrepancies-1366.png) | [Screenshot](evidence/after/discrepancies-1366.png) |
| 768px | [Screenshot](evidence/before/discrepancies-768.png) | [Screenshot](evidence/after/discrepancies-768.png) |
| 390px | [Screenshot](evidence/before/discrepancies-390.png) | [Screenshot](evidence/after/discrepancies-390.png) |
| 320px | [Screenshot](evidence/before/discrepancies-320.png) | [Screenshot](evidence/after/discrepancies-320.png) |

**Hasil terverifikasi:** Tanggal 390px masing-masing 158×44px dan satu baris; pada 320px 254×44px dan bertumpuk. Nilai dipertahankan; filter kategori/status serta konteks pemeriksaan tetap terlihat. Tidak ada overflow halaman atau error JavaScript pada keempat ukuran.

**Keterbatasan:** Tanggal pemeriksaan dan ketentuan selisih tetap terlihat; penyelesaian selisih nyata tidak dilakukan.

## P29 — Dashboard customer

- **Masalah awal:** Filter menjelaskan basis tanggal yang menentukan arti angka; bukan paragraf berlebih untuk dihapus. SSR React menghasilkan title SVG kosong karena beberapa child text; browser melaporkan hydration mismatch dan meregenerasi chart.
- **Perubahan:** Judul grafik SVG dijadikan satu string; HTML server sekarang berisi label dan nilai yang sama dengan client, tanpa hydration mismatch. Seluruh data, tooltip, pilihan metrik dan tabel alternatif dipertahankan.
- **Bukti setara:**

| Lebar | Sebelum | Sesudah |
| --- | --- | --- |
| 1366px | [Screenshot](evidence/before/customer-dashboard-1366.png) | [Screenshot](evidence/after/customer-dashboard-1366.png) |
| 768px | [Screenshot](evidence/before/customer-dashboard-768.png) | [Screenshot](evidence/after/customer-dashboard-768.png) |
| 390px | [Screenshot](evidence/before/customer-dashboard-390.png) | [Screenshot](evidence/after/customer-dashboard-390.png) |
| 320px | [Screenshot](evidence/before/customer-dashboard-320.png) | [Screenshot](evidence/after/customer-dashboard-320.png) |

**Hasil terverifikasi:** Tiga regresi renderer gagal sebelum Q1 karena title kosong dan lulus sesudahnya. Browser tidak lagi melaporkan hydration mismatch; label, jumlah, tooltip dan pilihan metrik tetap tersedia. Tidak ada overflow halaman atau error JavaScript pada keempat ukuran.

**Keterbatasan:** SSR aktif pada perbandingan Q1; tabel harian dan null amount tidak diubah. Browser Chromium, bukan sertifikasi pembaca layar.

## P34 — Penarikan Report

- **Masalah awal:** Empat kartu rencana mendahului input dan mengambil ruang; bukan keputusan dashboard.
- **Perubahan:** Input account/periode mendahului rencana; counter rencana dekat tombol kirim; kontrol dapat membungkus pada 320px; error terkait field.
- **Bukti setara:**

| Lebar | Sebelum | Sesudah |
| --- | --- | --- |
| 1366px | [Screenshot](evidence/before/reports-1366.png) | [Screenshot](evidence/after/reports-1366.png) |
| 768px | [Screenshot](evidence/before/reports-768.png) | [Screenshot](evidence/after/reports-768.png) |
| 390px | [Screenshot](evidence/before/reports-390.png) | [Screenshot](evidence/after/reports-390.png) |
| 320px | [Screenshot](evidence/before/reports-320.png) | [Screenshot](evidence/after/reports-320.png) |

**Hasil terverifikasi:** Awal form/working area y=533 → 277. Tidak ada overflow halaman atau error JavaScript pada keempat ukuran.

**Keterbatasan:** Tidak menarik report eksternal; pengiriman dan batas bisnis diuji backend.

## P35 — Riwayat run

- **Masalah awal:** Empat kartu statistik halaman mendahului pencarian; counter bukan agregat semua run.
- **Perubahan:** Counter per halaman menjadi ringkasan padat berlabel; filter lebih awal; scope, log dan recovery tetap tersedia.
- **Bukti setara:**

| Lebar | Sebelum | Sesudah |
| --- | --- | --- |
| 1366px | [Screenshot](evidence/before/report-runs-1366.png) | [Screenshot](evidence/after/report-runs-1366.png) |
| 768px | [Screenshot](evidence/before/report-runs-768.png) | [Screenshot](evidence/after/report-runs-768.png) |
| 390px | [Screenshot](evidence/before/report-runs-390.png) | [Screenshot](evidence/after/report-runs-390.png) |
| 320px | [Screenshot](evidence/before/report-runs-320.png) | [Screenshot](evidence/after/report-runs-320.png) |

**Hasil terverifikasi:** Search y=587 → 513. Tidak ada overflow halaman atau error JavaScript pada keempat ukuran.

**Keterbatasan:** Tidak menjalankan recovery ke provider live. Counter tetap hanya run pada halaman.

## P36 — AWB dalam report

- **Masalah awal:** Panel pipeline besar menempatkan search y=757 di ponsel; penjelasan sukses rutin mendominasi.
- **Perubahan:** Status, error, unduhan dan retry tetap terlihat; penjelasan pipeline dan rincian impor rutin masuk disclosure; pencarian dan AWB lebih awal.
- **Bukti setara:**

| Lebar | Sebelum | Sesudah |
| --- | --- | --- |
| 1366px | [Screenshot](evidence/before/report-awbs-1366.png) | [Screenshot](evidence/after/report-awbs-1366.png) |
| 768px | [Screenshot](evidence/before/report-awbs-768.png) | [Screenshot](evidence/after/report-awbs-768.png) |
| 390px | [Screenshot](evidence/before/report-awbs-390.png) | [Screenshot](evidence/after/report-awbs-390.png) |
| 320px | [Screenshot](evidence/before/report-awbs-320.png) | [Screenshot](evidence/after/report-awbs-320.png) |

**Hasil terverifikasi:** Search y=757 → 439. Tidak ada overflow halaman atau error JavaScript pada keempat ukuran.

**Keterbatasan:** Tabel snapshot tetap scroll lokal; import/projection live tidak dijalankan.

## P37 — Customer & nama pengirim

- **Masalah awal:** Panel penjelasan penerapan dan ownership mendorong search y=773; keadaan berhasil kosong berulang.
- **Perubahan:** Riwayat penerapan menjadi disclosure; run pending/gagal dibuka otomatis; exception pemilik dan tombol Periksa AWB tetap terlihat.
- **Bukti setara:**

| Lebar | Sebelum | Sesudah |
| --- | --- | --- |
| 1366px | [Screenshot](evidence/before/shipper-aliases-1366.png) | [Screenshot](evidence/after/shipper-aliases-1366.png) |
| 768px | [Screenshot](evidence/before/shipper-aliases-768.png) | [Screenshot](evidence/after/shipper-aliases-768.png) |
| 390px | [Screenshot](evidence/before/shipper-aliases-390.png) | [Screenshot](evidence/after/shipper-aliases-390.png) |
| 320px | [Screenshot](evidence/before/shipper-aliases-320.png) | [Screenshot](evidence/after/shipper-aliases-320.png) |

**Hasil terverifikasi:** Search y=773 → 645. Tidak ada overflow halaman atau error JavaScript pada keempat ukuran.

**Keterbatasan:** Tidak mengubah kepemilikan atau mensinkronkan alias ke data produksi.

## P38 — Aturan bukti JNE

- **Masalah awal:** Editor sudah Sheet; aktivasi menuntut alasan, versi dan bukti; tidak boleh dilipat menjadi auto-toggle. Target tutup overlay hanya 16px; dialog/Sheet perlu target dan containment yang layak.
- **Perubahan:** Sheet editor memiliki target tutup 44px dan ruang judul; keyboard trap dan focus return diverifikasi. Aturan/aktivasi tidak diubah.
- **Bukti setara:**

| Lebar | Sebelum | Sesudah |
| --- | --- | --- |
| 1366px | [Screenshot](evidence/before/evidence-sheet-1366.png) | [Screenshot](evidence/after/evidence-sheet-1366.png) |
| 768px | [Screenshot](evidence/before/evidence-sheet-768.png) | [Screenshot](evidence/after/evidence-sheet-768.png) |
| 390px | [Screenshot](evidence/before/evidence-sheet-390.png) | [Screenshot](evidence/after/evidence-sheet-390.png) |
| 320px | [Screenshot](evidence/before/evidence-sheet-320.png) | [Screenshot](evidence/after/evidence-sheet-320.png) |

**Hasil terverifikasi:** Search y=212 → null. Tidak ada overflow halaman atau error JavaScript pada keempat ukuran.

**Keterbatasan:** Fixture mode draft; aktivasi produksi dan keputusan pencocokan tidak dilakukan.

## P42 — Tes Notifikasi

- **Masalah awal:** Pagination overflow pada 320px: tombol Berikutnya berakhir di x=338. Diagnostik adalah tujuan layar; actionable konfigurasi tetap terlihat. Fixture tanpa perangkat.
- **Perubahan:** Pagination membungkus pada 320px sehingga tombol tetap di dalam halaman.
- **Bukti setara:**

| Lebar | Sebelum | Sesudah |
| --- | --- | --- |
| 1366px | [Screenshot](evidence/before/push-test-1366.png) | [Screenshot](evidence/after/push-test-1366.png) |
| 768px | [Screenshot](evidence/before/push-test-768.png) | [Screenshot](evidence/after/push-test-768.png) |
| 390px | [Screenshot](evidence/before/push-test-390.png) | [Screenshot](evidence/after/push-test-390.png) |
| 320px | [Screenshot](evidence/before/push-test-320.png) | [Screenshot](evidence/after/push-test-320.png) |

**Hasil terverifikasi:** Search y=317 → 317. Tidak ada overflow halaman atau error JavaScript pada keempat ukuran.

**Keterbatasan:** Fixture tanpa perangkat; FCM/hardware tidak diuji live.

## P43 — Profil

- **Masalah awal:** Nav tiga baris dan deskripsi global mendorong form; error tanpa asosiasi; simpan tanpa feedback lokal.
- **Perubahan:** Navigasi akun mendatar pada ponsel; active link memiliki aria-current; field error terkait dan fokus; label simpan spesifik dan feedback sukses.
- **Bukti setara:**

| Lebar | Sebelum | Sesudah |
| --- | --- | --- |
| 1366px | [Screenshot](evidence/before/profile-1366.png) | [Screenshot](evidence/after/profile-1366.png) |
| 768px | [Screenshot](evidence/before/profile-768.png) | [Screenshot](evidence/after/profile-768.png) |
| 390px | [Screenshot](evidence/before/profile-390.png) | [Screenshot](evidence/after/profile-390.png) |
| 320px | [Screenshot](evidence/before/profile-320.png) | [Screenshot](evidence/after/profile-320.png) |

**Recovery validasi:** [sebelum](evidence/before/profile-validation-interaction-390.png) / [sesudah](evidence/after/profile-validation-interaction-390.png); fokus sesudah: `name`, invalid control mempunyai deskripsi error. Untuk form web autentikasi, 302 adalah redirect validasi dengan session errors; untuk useHttp operasional, responsnya 422. Native validation sengaja dilewati hanya pada pengujian negative submit yang dicatat.

**Hasil terverifikasi:** Awal form/working area y=393 → 270. Tidak ada overflow halaman atau error JavaScript pada keempat ukuran.

**Keterbatasan:** Error recovery diverifikasi di browser; keberhasilan update diuji backend. Tidak menghapus akun fixture.

## P44 — Keamanan

- **Masalah awal:** Nav mengambil ruang; tiga error belum terhubung ke field; sukses tidak diumumkan.
- **Perubahan:** Navigasi akun ringkas; tiga field memiliki asosiasi error/fokus; feedback menyimpan/sukses. Aturan dan password confirmation tetap sama.
- **Bukti setara:**

| Lebar | Sebelum | Sesudah |
| --- | --- | --- |
| 1366px | [Screenshot](evidence/before/security-1366.png) | [Screenshot](evidence/after/security-1366.png) |
| 768px | [Screenshot](evidence/before/security-768.png) | [Screenshot](evidence/after/security-768.png) |
| 390px | [Screenshot](evidence/before/security-390.png) | [Screenshot](evidence/after/security-390.png) |
| 320px | [Screenshot](evidence/before/security-320.png) | [Screenshot](evidence/after/security-320.png) |

**Recovery validasi:** [sebelum](evidence/before/security-validation-interaction-390.png) / [sesudah](evidence/after/security-validation-interaction-390.png); fokus sesudah: `current_password`, invalid control mempunyai deskripsi error. Untuk form web autentikasi, 302 adalah redirect validasi dengan session errors; untuk useHttp operasional, responsnya 422. Native validation sengaja dilewati hanya pada pengujian negative submit yang dicatat.

**Hasil terverifikasi:** Awal form/working area y=413 → 290. Tidak ada overflow halaman atau error JavaScript pada keempat ukuran.

**Keterbatasan:** Error recovery diverifikasi di browser; penggantian password valid diuji backend.

## P45 — Tampilan

- **Masalah awal:** Pilihan sederhana didahului navigasi vertikal besar pada ponsel; active link tanpa aria-current.
- **Perubahan:** Navigasi ringkas dengan aria-current; pilihan tema dan persistensi tetap sama.
- **Bukti setara:**

| Lebar | Sebelum | Sesudah |
| --- | --- | --- |
| 1366px | [Screenshot](evidence/before/appearance-1366.png) | [Screenshot](evidence/after/appearance-1366.png) |
| 768px | [Screenshot](evidence/before/appearance-768.png) | [Screenshot](evidence/after/appearance-768.png) |
| 390px | [Screenshot](evidence/before/appearance-390.png) | [Screenshot](evidence/after/appearance-390.png) |
| 320px | [Screenshot](evidence/before/appearance-320.png) | [Screenshot](evidence/after/appearance-320.png) |

**Hasil terverifikasi:** Awal form/working area y=— → —. Tidak ada overflow halaman atau error JavaScript pada keempat ukuran.

**Keterbatasan:** Chromium/tema saja; tidak mengklaim seluruh kombinasi browser/OS.

## Cakupan tambahan dan batas

- Sparkline pickup: [baseline SSR tambahan](evidence/before-sparkline-ssr.json) direkam sesudah perubahan density O2, sebelum perbaikan title Q1. Ini melengkapi baseline layout asli P11 dan tidak menambah hitungan improved.
- Q1: [diagnosis HTML server sebelum](evidence/ssr-title-diagnosis.log); source regresi resources/js/lib/dashboard-chart-rendering.test.tsx. [React title reference](https://react.dev/reference/react-dom/components/title) mendukung satu string child. Versi React terpasang dipakai untuk reproduksi langsung; tidak menonaktifkan SSR atau menyembunyikan warning.
- Verifikasi email kondisional: [sebelum](evidence/before-conditional.json) / [sesudah](evidence/after-conditional.json), [success sebelum](evidence/before/verify-email-success-390.png) / [sesudah](evidence/after/verify-email-success-390.png). Message visible tetap sama; status semantics diuji DOM, bukan ditebak dari gambar.
- [Register capture sebelum](evidence/before-results.json), [sesudah](evidence/after-results.json), [pasangan perbaikan](evidence/comparisons.json).
- [Interaksi sebelum](evidence/before-interactions.json), [sesudah](evidence/after-interactions.json): validasi/fokus, schedule draft retain/discard, Sheet trap/return, filter URL monitoring, bantuan dengan keyboard, seleksi bulk lintas halaman/clear serta tanggal adaptif dan nilai yang dipertahankan.
- [Menu mobile sebelum](evidence/before-sidebar.json), [sesudah](evidence/after-sidebar.json): target tutup, hidden tooltip, Escape, focus return.
- [17 flow regresi](evidence/regression/browser-results.json): customer draft/422/pagination/history, lookup keyboard, skip link, tema/contrast terang-gelap, reduced motion, role access dan workspace rendering.
- [17 flow SSR tambahan](evidence/browser-ssr-results.json) dan [log SSR](evidence/browser-ssr-regression.log) disimpan terpisah dari regresi production client assets. Browser Chromium; tidak ada klaim sertifikasi WCAG, semua browser, pembaca layar nyata, kamera/perizinan/push Android atau outcome provider eksternal. Validasi native diperlukan untuk 12 surface mobile yang sudah diaudit source. Halaman verify-email dicapture terpisah dengan flag unverified sementara yang dipulihkan; register adalah fallback nonaktif.

## Mengulang verifikasi

Gunakan SQLite sintetis dari tests/Fixtures/ui-ux-browser.php pada APP_ENV=testing dan nama file .sqlite baru di output; fixture menolak overwrite. Server loopback harus memakai database itu melalui php -d extension=pdo_sqlite -d extension=sqlite3 -S 127.0.0.1:8765 -t public tests/Fixtures/ui-ux-browser-server.php dari root project; SESSION_COOKIE terpisah, CACHE_STORE=array, QUEUE_CONNECTION=sync dan MAIL_MAILER=array. Jangan menjalankan capture terhadap database operasional. Node 24 dan Playwright yang sudah terpasang pada workers/jne-report dipakai tanpa dependency baru.

Set UI_UX_BASE_URL, UI_UX_FIXTURE_IDS (file .sqlite.ids.json yang dihasilkan fixture) dan UI_UX_PHASE=before atau after. Jalankan node tests/Browser/ui-ux-review.mjs untuk empat viewport, ui-ux-review-interactions.mjs untuk recovery/keyboard, ui-ux-review-sidebar.mjs untuk menu mobile, serta ui-ux-review-conditional.mjs untuk verifikasi email/success reset. Capture kondisional memulihkan flag verified dan token reset akun sintetis pada finally. Jalankan node --test tests/Browser/ui-ux-remediation.mjs dengan UI_UX_EVIDENCE_DIR terpisah untuk 17 flow. Setiap phase menulis ulang evidence phase tersebut; simpan baseline dahulu. Tanggal/record dan theme harus sama saat membuat perbandingan baru.
