# Temuan audit per halaman

26 Oktober 2026 · baseline HEAD e3a0be0 + empat perubahan pengguna yang sudah ada

Audit mengikuti kebijakan **Task-first operational UI** di AGENTS.md dan kebijakan dalam permintaan pengguna; tidak membuat kebijakan baru. Referensi: [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md), ui-ux-pro-max (hasil pencarian tabel shadcn dan focus-not-obscured), primitive Radix shadcn yang sudah terpasang. Frekuensi adalah inferensi dari tugas/peran, bukan telemetry. Tidak ada skor UX numerik.

Penilaian didasarkan pada source saat ini, bukan hanya audit terdahulu. Tidak ditemukan defect Critical dalam cakupan ini. High berarti tugas sering dilakukan terdorong jauh di bawah viewport atau input berisiko hilang. Low pada halaman tanpa perubahan berarti prioritas tindak lanjut rendah, bukan klaim defect. Aksesibilitas disaring melalui label/semantik/fokus/keyboard/kontras; ini bukan sertifikasi WCAG atau studi pengguna.

## Temuan bersama dan urutan perbaikan

- **B1 — High:** tombol tutup Dialog/Sheet hanya sebesar ikon (~16px); Dialog umum tidak membatasi tinggi, scroll tidak dikandung. Perbaiki target 44px, ruang judul, batas viewport, overscroll.
- **M1 — High:** ringkasan monitoring satu kolom mengambil beberapa layar. Search processing y=1270 dan pickup y=1389 pada 390×844. Angka perlu tetap terlihat dengan ringkasan padat, rincian sebelum daftar dipindahkan setelah pencarian.
- **F1/F2 — High:** CreatePickup/schedule menampilkan error tanpa hubungan programatik dan fokus; schedule Escape langsung membuang input.
- **J2/J3 — High:** AWB report dan directory alias berada di bawah panel sukses/penjelasan; search masing-masing y=757/y=773 di 390px. Error dan recovery harus tetap terlihat.
- **A1/S1/J1 — Medium:** association/focus/success pada form akun; nav settings tiga baris; grid counter halaman mendahului form/filter JNE.
- **B2 — Medium:** belum ada scroll-padding untuk header sticky; periksa fokus melalui keyboard.

## P01 — Halaman utama

- **Pengguna / alasan / tugas (1–3):** Publik; menuju halaman masuk.
- **Data esensial (4):** Identitas produk, tautan masuk.
- **Aksi utama / pola (5):** Masuk; Detail / Inspection.
- **Redundansi / tempat konten (6–7):** Tidak ada perubahan terverifikasi; source memiliki perubahan pengguna sebelum audit.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Identity/status, tindakan, error dan informasi sekunder ditinjau; aksi destruktif mempertahankan konfirmasi.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/welcome.tsx](../../resources/js/pages/welcome.tsx); Low, frekuensi sesekali, kompleksitas Low. Dependensi: —.

## P02 — Masuk

- **Pengguna / alasan / tugas (1–3):** Semua peran; memulai sesi kerja.
- **Data esensial (4):** Email, kata sandi, ingat saya, pemulihan akses.
- **Aksi utama / pola (5):** Masuk ke workspace; Form / Wizard.
- **Redundansi / tempat konten (6–7):** Label dan error sudah terhubung; perubahan pengguna dipertahankan.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Input, pending/disabled, inline error dan hasil di source diperiksa; pengiriman eksternal dan finalisasi bukti tidak disimulasikan sebagai sukses.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/auth/login.tsx](../../resources/js/pages/auth/login.tsx); Low, frekuensi awal shift, kompleksitas Low. Dependensi: AuthLayout.

## P03 — Lupa kata sandi

- **Pengguna / alasan / tugas (1–3):** Pengguna kehilangan akses; meminta tautan reset.
- **Data esensial (4):** Email, hasil permintaan, kembali masuk.
- **Aksi utama / pola (5):** Kirim tautan atur ulang; Form / Wizard.
- **Redundansi / tempat konten (6–7):** Error email tidak terkait kontrol; fokus validasi tidak ditangani; status tidak diumumkan.
- **Interaksi / rekomendasi (8):** Hubungkan error melalui aria-invalid/aria-describedby, fokus field invalid, umumkan hasil; pertahankan endpoint dan aturan password..
- **Loading, kosong, error, sukses (9):** Input, pending/disabled, inline error dan hasil di source diperiksa; pengiriman eksternal dan finalisasi bukti tidak disimulasikan sebagai sukses.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/auth/forgot-password.tsx](../../resources/js/pages/auth/forgot-password.tsx); Medium, frekuensi sesekali, kompleksitas Low. Dependensi: InputError; Form.

## P04 — Reset kata sandi

- **Pengguna / alasan / tugas (1–3):** Pemilik tautan reset; mengganti kata sandi.
- **Data esensial (4):** Email token, kata sandi baru dan konfirmasi, error token.
- **Aksi utama / pola (5):** Atur ulang kata sandi; Form / Wizard.
- **Redundansi / tempat konten (6–7):** Error email dan password tidak terkait kontrol; token invalid perlu jalur koreksi terlihat.
- **Interaksi / rekomendasi (8):** Hubungkan error melalui aria-invalid/aria-describedby, fokus field invalid, umumkan hasil; pertahankan endpoint dan aturan password..
- **Loading, kosong, error, sukses (9):** Input, pending/disabled, inline error dan hasil di source diperiksa; pengiriman eksternal dan finalisasi bukti tidak disimulasikan sebagai sukses.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/auth/reset-password.tsx](../../resources/js/pages/auth/reset-password.tsx); Medium, frekuensi sesekali, kompleksitas Low. Dependensi: PasswordInput; Form.

## P05 — Verifikasi email

- **Pengguna / alasan / tugas (1–3):** Pengguna belum terverifikasi (kondisional); mengirim ulang tautan.
- **Data esensial (4):** Status pengiriman, kirim ulang, keluar.
- **Aksi utama / pola (5):** Kirim ulang email verifikasi; Form / Wizard.
- **Redundansi / tempat konten (6–7):** User tidak mengimplementasikan kontrak MustVerifyEmail; fixture tidak menampilkan layar ini. Source menyediakan kirim ulang dan keluar.
- **Interaksi / rekomendasi (8):** Pertahankan batas runtime dicatat.
- **Loading, kosong, error, sukses (9):** Input, pending/disabled, inline error dan hasil di source diperiksa; pengiriman eksternal dan finalisasi bukti tidak disimulasikan sebagai sukses.
- **Desktop/mobile dan efisiensi (10):** Source saja karena route kondisional/nonaktif.
- **Lokasi / prioritas:** [resources/js/pages/auth/verify-email.tsx](../../resources/js/pages/auth/verify-email.tsx); Low, frekuensi kondisional, kompleksitas Low. Dependensi: Fortify; AuthLayout.

## P06 — Konfirmasi kata sandi

- **Pengguna / alasan / tugas (1–3):** Pengguna menuju keamanan; membuka tindakan sensitif.
- **Data esensial (4):** Kata sandi saat ini dan error.
- **Aksi utama / pola (5):** Konfirmasi kata sandi; Form / Wizard.
- **Redundansi / tempat konten (6–7):** Error belum terhubung; fokus error tidak dikembalikan.
- **Interaksi / rekomendasi (8):** Hubungkan error melalui aria-invalid/aria-describedby, fokus field invalid, umumkan hasil; pertahankan endpoint dan aturan password..
- **Loading, kosong, error, sukses (9):** Input, pending/disabled, inline error dan hasil di source diperiksa; pengiriman eksternal dan finalisasi bukti tidak disimulasikan sebagai sukses.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/auth/confirm-password.tsx](../../resources/js/pages/auth/confirm-password.tsx); Medium, frekuensi sesekali, kompleksitas Low. Dependensi: PasswordInput; Form.

## P07 — Registrasi nonaktif

- **Pengguna / alasan / tugas (1–3):** Publik (source fallback); memahami siapa membuat akun.
- **Data esensial (4):** Akun dibuat Admin; kembali masuk.
- **Aksi utama / pola (5):** Kembali ke login; Detail / Inspection.
- **Redundansi / tempat konten (6–7):** Bukan halaman publik aktif; tidak membuka registrasi sebagai perubahan UX.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Identity/status, tindakan, error dan informasi sekunder ditinjau; aksi destruktif mempertahankan konfirmasi.
- **Desktop/mobile dan efisiensi (10):** Source saja karena route kondisional/nonaktif.
- **Lokasi / prioritas:** [resources/js/pages/auth/register.tsx](../../resources/js/pages/auth/register.tsx); Low, frekuensi tidak aktif, kompleksitas Low. Dependensi: Fortify configuration.

## P08 — Dashboard Admin

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; menentukan tindak lanjut periode.
- **Data esensial (4):** Volume, tren, exception, waktu observasi, drill-down.
- **Aksi utama / pola (5):** Buat pickup; filter periode; Dashboard.
- **Redundansi / tempat konten (6–7):** Metrik dan grafik relevan dengan keputusan; tidak ada alasan menyamakan dashboard dengan daftar kerja.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Loading memakai state/skeleton yang tersedia; data kosong tidak diganti angka fiktif; error filter/reload tetap terlihat.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/dashboard.tsx](../../resources/js/pages/dashboard.tsx); Low, frekuensi harian, kompleksitas Low. Dependensi: OperationalOverview; charts.

## P09 — Dashboard CS

- **Pengguna / alasan / tugas (1–3):** CS; memantau jadwal dan membuat pickup.
- **Data esensial (4):** Jadwal, penugasan, kunjungan, periode.
- **Aksi utama / pola (5):** Buat pickup; Dashboard.
- **Redundansi / tempat konten (6–7):** Dispatch role dan cakupan data sudah terpisah; dialog mengikuti perbaikan primitive bersama.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Loading memakai state/skeleton yang tersedia; data kosong tidak diganti angka fiktif; error filter/reload tetap terlihat.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/dashboard.tsx](../../resources/js/pages/dashboard.tsx); Low, frekuensi harian, kompleksitas Low. Dependensi: OperationalOverview; CreatePickupDialog.

## P10 — Dashboard Retail

- **Pengguna / alasan / tugas (1–3):** Retail Staff; menemukan penerimaan yang menunggu.
- **Data esensial (4):** Sesi draft, pending, selisih dan tautan sesi.
- **Aksi utama / pola (5):** Buka sesi penerimaan; Dashboard.
- **Redundansi / tempat konten (6–7):** Angka penerimaan dan sesi langsung relevan; tidak ada panel dokumentasi dominan.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Loading memakai state/skeleton yang tersedia; data kosong tidak diganti angka fiktif; error filter/reload tetap terlihat.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/dashboard.tsx](../../resources/js/pages/dashboard.tsx); Low, frekuensi per shift, kompleksitas Low. Dependensi: RoleDashboard.

## P11 — Dashboard Pickup

- **Pengguna / alasan / tugas (1–3):** Pickup Staff; menemukan tugas berikutnya.
- **Data esensial (4):** Tugas, status, jadwal dan alamat.
- **Aksi utama / pola (5):** Buka tugas; Dashboard.
- **Redundansi / tempat konten (6–7):** Ringkasan mengikuti peran; tugas saya tetap tujuan navigasi utama.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Loading memakai state/skeleton yang tersedia; data kosong tidak diganti angka fiktif; error filter/reload tetap terlihat.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/dashboard.tsx](../../resources/js/pages/dashboard.tsx); Low, frekuensi per shift, kompleksitas Low. Dependensi: RoleDashboard.

## P12 — Master customer

- **Pengguna / alasan / tugas (1–3):** CS; Admin/Supervisor; mencari dan memelihara customer.
- **Data esensial (4):** Kode, nama, kontak, alamat, status aktif.
- **Aksi utama / pola (5):** Tambah Customer; cari; edit; Data List / Management.
- **Redundansi / tempat konten (6–7):** Search y=240 pada 390px; daftar dan dialog sudah mempunyai recovery dan draft guard.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Loading/empty/error/retry, pencarian, pagination dan aksi konteks di source diperiksa; screenshot menggunakan data fixture yang tersedia.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/customers.tsx](../../resources/js/pages/customers.tsx); Low, frekuensi harian, kompleksitas Low. Dependensi: CustomerDataTable; CustomerDialog.

## P13 — Operasional Pickup

- **Pengguna / alasan / tugas (1–3):** CS; Admin/Supervisor; menugaskan dan menelusuri pickup.
- **Data esensial (4):** Referensi, customer, status, jadwal, petugas.
- **Aksi utama / pola (5):** Buat pickup; tugaskan; cari; Data List / Management.
- **Redundansi / tempat konten (6–7):** Judul, aksi dan filter sudah mendahului daftar; tidak ada temuan layout baru pada baseline.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Loading/empty/error/retry, pencarian, pagination dan aksi konteks di source diperiksa; screenshot menggunakan data fixture yang tersedia.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/operations.tsx](../../resources/js/pages/operations.tsx); Low, frekuensi berulang per shift, kompleksitas Low. Dependensi: PickupOperationalList; BulkPickupAssignment.

## P14 — Tugas Saya

- **Pengguna / alasan / tugas (1–3):** Pickup Staff; Retail Staff; Admin; membuka pekerjaan yang ditangani.
- **Data esensial (4):** Customer, alamat, jadwal, status, tugas berikutnya.
- **Aksi utama / pola (5):** Buka tugas; lanjutkan pickup; Operational Workspace.
- **Redundansi / tempat konten (6–7):** Prioritas tugas dan identitas tersedia; layar tidak dipaksa menjadi tabel desktop pada ponsel.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Status terkini, pending/lock, outcome, error/versi dan recovery ditinjau; finalisasi operasional tidak dikirim pada capture baseline.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/operations.tsx](../../resources/js/pages/operations.tsx); Low, frekuensi setiap pickup, kompleksitas Low. Dependensi: PickupOperationalList.

## P15 — Tugas tersedia

- **Pengguna / alasan / tugas (1–3):** Pickup Staff; Retail Staff; Admin; memeriksa kandidat pengambilalihan.
- **Data esensial (4):** Customer, petugas saat ini, jadwal, status.
- **Aksi utama / pola (5):** Periksa; ambil alih sesuai kapabilitas; Operational Workspace.
- **Redundansi / tempat konten (6–7):** Kapabilitas dan konfirmasi pengambilalihan dipertahankan; bukan perluasan hak akses.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Status terkini, pending/lock, outcome, error/versi dan recovery ditinjau; finalisasi operasional tidak dikirim pada capture baseline.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/operations.tsx](../../resources/js/pages/operations.tsx); Low, frekuensi harian, kompleksitas Low. Dependensi: PickupOperationalList; takeover dialog.

## P16 — Riwayat Pickup

- **Pengguna / alasan / tugas (1–3):** Pickup Staff; Retail Staff; Admin; mencari pekerjaan sebelumnya.
- **Data esensial (4):** Customer, hasil akhir, waktu, bukti.
- **Aksi utama / pola (5):** Filter; buka detail; Data List / Management.
- **Redundansi / tempat konten (6–7):** Riwayat terpisah dari tugas berjalan; filter dan detail dipertahankan.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Loading/empty/error/retry, pencarian, pagination dan aksi konteks di source diperiksa; screenshot menggunakan data fixture yang tersedia.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/operations.tsx](../../resources/js/pages/operations.tsx); Low, frekuensi harian, kompleksitas Low. Dependensi: PickupOperationalList.

## P17 — Buat Pickup

- **Pengguna / alasan / tugas (1–3):** CS; Admin; Pickup Staff; membuat pickup on-demand.
- **Data esensial (4):** Customer, alamat, jadwal, catatan, kunci submission.
- **Aksi utama / pola (5):** Buat pickup; Form / Wizard.
- **Redundansi / tempat konten (6–7):** Header formulir mengulang tugas; error field tidak terhubung dan respons 422 tidak memfokuskan kontrol.
- **Interaksi / rekomendasi (8):** Singkat header berulang dan perbaiki fokus/asosiasi validasi tanpa mengubah submission key atau recovery uncertain..
- **Loading, kosong, error, sukses (9):** Input, pending/disabled, inline error dan hasil di source diperiksa; pengiriman eksternal dan finalisasi bukti tidak disimulasikan sebagai sukses.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/operations.tsx](../../resources/js/pages/operations.tsx); High, frekuensi berulang per shift, kompleksitas Medium. Dependensi: CreatePickup; CustomerPicker.

## P18 — Detail Pickup

- **Pengguna / alasan / tugas (1–3):** Peran yang diizinkan policy view; memeriksa dan melanjutkan lifecycle task.
- **Data esensial (4):** Status, assignment, alamat, waktu, hasil/bukti.
- **Aksi utama / pola (5):** Mulai/lanjutkan; tugaskan; lihat POP; Detail / Inspection.
- **Redundansi / tempat konten (6–7):** Aksi mengikuti can.*; bukti dan audit tetap tersedia. Tidak ditemukan perubahan aman yang diperlukan pada surface utama.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Identity/status, tindakan, error dan informasi sekunder ditinjau; aksi destruktif mempertahankan konfirmasi.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/operations.tsx](../../resources/js/pages/operations.tsx); Low, frekuensi setiap pickup, kompleksitas Low. Dependensi: PickupDetail; lifecycle dialogs.

## P19 — Pengguna

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; mengelola akun, role, status.
- **Data esensial (4):** Nama, email, role, aktif.
- **Aksi utama / pola (5):** Tambah Pengguna; edit; Settings / Administration.
- **Redundansi / tempat konten (6–7):** Daftar dan editor sudah ringkas; tidak mengubah otorisasi melalui penyederhanaan UI.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Identity/status, tindakan, error dan informasi sekunder ditinjau; aksi destruktif mempertahankan konfirmasi.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/operations.tsx](../../resources/js/pages/operations.tsx); Low, frekuensi berkala, kompleksitas Low. Dependensi: User editor; DataTable.

## P20 — Eksekusi Pickup / POP

- **Pengguna / alasan / tugas (1–3):** Petugas yang ditugaskan; mencatat outcome, jumlah, bukti, finalisasi.
- **Data esensial (4):** Versi task, outcome, tiga kategori, foto, tanda tangan.
- **Aksi utama / pola (5):** Simpan kunjungan; lanjut; finalisasi; Form / Wizard.
- **Redundansi / tempat konten (6–7):** Empat langkah bermakna, guard draft dan konflik sudah ada; jumlah dan bukti wajib tidak boleh dihilangkan.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Input, pending/disabled, inline error dan hasil di source diperiksa; pengiriman eksternal dan finalisasi bukti tidak disimulasikan sebagai sukses.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/pickup-wizard.tsx](../../resources/js/pages/pickup-wizard.tsx); Low, frekuensi setiap pickup, kompleksitas Low. Dependensi: SignaturePad; PickupCashlessAwbs.

## P21 — Jadwal Regular

- **Pengguna / alasan / tugas (1–3):** CS; Admin/Supervisor; mencari dan mengubah jadwal.
- **Data esensial (4):** Customer, hari/waktu, periode, status, generation policy.
- **Aksi utama / pola (5):** Tambah Jadwal; cari; ubah; Data List / Management.
- **Redundansi / tempat konten (6–7):** Pesan scheduler mendahului pencarian; dialog menghapus draft saat Escape tanpa konfirmasi; error tidak terasosiasi.
- **Interaksi / rekomendasi (8):** Prioritaskan pencarian; ringkas status scheduler dengan rincian kontekstual; lindungi draft dialog dan asosiasikan error..
- **Loading, kosong, error, sukses (9):** Loading/empty/error/retry, pencarian, pagination dan aksi konteks di source diperiksa; screenshot menggunakan data fixture yang tersedia.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/pickup-schedules.tsx](../../resources/js/pages/pickup-schedules.tsx); High, frekuensi harian, kompleksitas Medium. Dependensi: Dialog; useHttp; Customer select.

## P22 — Monitoring pemrosesan

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; mencari paket belum diproses dan memeriksa hasil.
- **Data esensial (4):** Penerimaan, konfirmasi eksternal, deklarasi manual, backlog, kategori.
- **Aksi utama / pola (5):** Cari; buka detail pemrosesan; Monitoring / Exception Review.
- **Redundansi / tempat konten (6–7):** Search y=1270 pada 390px; empat kartu satu kolom dan tabel ringkasan mendahului daftar.
- **Interaksi / rekomendasi (8):** Ringkasan padat dua kolom di ponsel; pencarian mendahului rincian kategori/antrean; seluruh angka tetap dapat diperiksa..
- **Loading, kosong, error, sukses (9):** Data/empty/filter, exception visible, freshness, detail dan recovery ditinjau; tidak mengubah matching untuk membuat tampilan bersih.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/pickup-results.tsx](../../resources/js/pages/pickup-results.tsx); High, frekuensi berulang per shift, kompleksitas Medium. Dependensi: MonitoringMetric; ProcessingMetrics; processing list.

## P23 — Monitoring hasil pickup

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; menemukan pickup dan exception serah terima.
- **Data esensial (4):** Jadwal, kunjungan, POP, handover, pending, antrean lintas hari.
- **Aksi utama / pola (5):** Cari; detail cepat; filter antrean; Monitoring / Exception Review.
- **Redundansi / tempat konten (6–7):** Search y=1389 pada 390px; lima kartu satu kolom dan antrean mendahului pekerjaan pencarian.
- **Interaksi / rekomendasi (8):** Ringkasan padat dua kolom di ponsel; pencarian mendahului rincian kategori/antrean; seluruh angka tetap dapat diperiksa..
- **Loading, kosong, error, sukses (9):** Data/empty/filter, exception visible, freshness, detail dan recovery ditinjau; tidak mengubah matching untuk membuat tampilan bersih.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/pickup-results.tsx](../../resources/js/pages/pickup-results.tsx); High, frekuensi berulang per shift, kompleksitas Medium. Dependensi: MonitoringMetric; PickupPrimaryMetrics.

## P24 — Detail Hasil Pickup

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; menindaklanjuti hasil dan pemrosesan.
- **Data esensial (4):** Identitas, status, tindakan berikutnya, POP, handover, receipt.
- **Aksi utama / pola (5):** Tindakan kontekstual; tab hasil; Detail / Inspection.
- **Redundansi / tempat konten (6–7):** Tab memiliki keyboard roving focus dan label; audit/processing terpisah; tidak ada perubahan layout utama yang dibenarkan.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Identity/status, tindakan, error dan informasi sekunder ditinjau; aksi destruktif mempertahankan konfirmasi.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/pickup-result-detail.tsx](../../resources/js/pages/pickup-result-detail.tsx); Low, frekuensi harian, kompleksitas Low. Dependensi: PickupResultActions; processing drawer.

## P25 — Daftar Handover

- **Pengguna / alasan / tugas (1–3):** Pickup; Retail; Admin sesuai kapabilitas; membuat/menemukan sesi serah terima.
- **Data esensial (4):** Referensi, petugas, status, pending, jumlah.
- **Aksi utama / pola (5):** Buat Handover Session; filter; Data List / Management.
- **Redundansi / tempat konten (6–7):** Daftar dan navigasi status terarah; pertahankan full-task selection dan guard penutupan.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Loading/empty/error/retry, pencarian, pagination dan aksi konteks di source diperiksa; screenshot menggunakan data fixture yang tersedia.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/handover.tsx](../../resources/js/pages/handover.tsx); Low, frekuensi harian, kompleksitas Low. Dependensi: HandoverSessionList.

## P26 — Riwayat Handover

- **Pengguna / alasan / tugas (1–3):** Retail; Pickup; Admin sesuai kapabilitas; menelusuri sesi selesai.
- **Data esensial (4):** Sesi, status akhir, waktu, selisih.
- **Aksi utama / pola (5):** Cari; buka sesi; Data List / Management.
- **Redundansi / tempat konten (6–7):** Riwayat berbeda tujuan dari verifikasi aktif; tidak mengganti filter default bisnis.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Loading/empty/error/retry, pencarian, pagination dan aksi konteks di source diperiksa; screenshot menggunakan data fixture yang tersedia.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/handover.tsx](../../resources/js/pages/handover.tsx); Low, frekuensi harian, kompleksitas Low. Dependensi: HandoverSessionList.

## P27 — Verifikasi Handover

- **Pengguna / alasan / tugas (1–3):** Retail; Pickup; Admin sesuai kapabilitas; membandingkan jumlah fisik dan pop.
- **Data esensial (4):** Tiga kategori terpisah, delta, alasan selisih, verifier, versi.
- **Aksi utama / pola (5):** Pilih task; verifikasi; tutup sesuai guard; Operational Workspace.
- **Redundansi / tempat konten (6–7):** Form di bawah daftar pada ponsel sudah discroll saat memilih task; penghitungan independen tetap penting.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Status terkini, pending/lock, outcome, error/versi dan recovery ditinjau; finalisasi operasional tidak dikirim pada capture baseline.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/handover.tsx](../../resources/js/pages/handover.tsx); Low, frekuensi setiap serah terima, kompleksitas Low. Dependensi: HandoverSessionDetail; VerificationForm.

## P28 — Monitoring Selisih

- **Pengguna / alasan / tugas (1–3):** Peran canExecutePickup; menelusuri selisih per kategori.
- **Data esensial (4):** POP, fisik, delta, catatan, kebutuhan tinjau ulang.
- **Aksi utama / pola (5):** Cari; filter; buka sesi/task; Monitoring / Exception Review.
- **Redundansi / tempat konten (6–7):** Filter esensial dan catatan kontekstual sudah ada; critical discrepancy tetap terlihat.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Data/empty/filter, exception visible, freshness, detail dan recovery ditinjau; tidak mengubah matching untuk membuat tampilan bersih.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/discrepancies.tsx](../../resources/js/pages/discrepancies.tsx); Low, frekuensi harian, kompleksitas Low. Dependensi: HandoverNavigation; discrepancy dialog.

## P29 — Dashboard customer

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; menganalisis customer dan periode.
- **Data esensial (4):** Customer, tanggal kirim, volume, amount, cakupan data, tren.
- **Aksi utama / pola (5):** Pilih customer/periode; drill-down; Dashboard.
- **Redundansi / tempat konten (6–7):** Filter menjelaskan basis tanggal yang menentukan arti angka; bukan paragraf berlebih untuk dihapus.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Loading memakai state/skeleton yang tersedia; data kosong tidak diganti angka fiktif; error filter/reload tetap terlihat.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/jne-customer-dashboard.tsx](../../resources/js/pages/jne-customer-dashboard.tsx); Low, frekuensi harian, kompleksitas Low. Dependensi: CustomerPicker; CustomerDashboardCharts.

## P30 — Pengiriman JNE

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; mencari awb dan status pengiriman.
- **Data esensial (4):** Nomor AWB, identitas, status, snapshot/freshness, exception.
- **Aksi utama / pola (5):** Cari; detail cepat; tarik report; Monitoring / Exception Review.
- **Redundansi / tempat konten (6–7):** Pencarian dan kepastian identitas tampil awal; diagnostik telah berada dalam disclosure.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Data/empty/filter, exception visible, freshness, detail dan recovery ditinjau; tidak mengubah matching untuk membuat tampilan bersih.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/jne-monitoring.tsx](../../resources/js/pages/jne-monitoring.tsx); Low, frekuensi berulang per shift, kompleksitas Low. Dependensi: ShipmentFilters; ShipmentTable; Sheet.

## P31 — Detail AWB

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; memeriksa bukti dan hubungan pickup.
- **Data esensial (4):** AWB, status, source, customer, matching dan alasan.
- **Aksi utama / pola (5):** Periksa sumber; cocokkan pickup sesuai policy; Detail / Inspection.
- **Redundansi / tempat konten (6–7):** Source evidence dan keputusan memiliki jejak; formulir berada setelah identitas untuk mencegah keputusan tanpa bukti.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Identity/status, tindakan, error dan informasi sekunder ditinjau; aksi destruktif mempertahankan konfirmasi.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/jne-shipment.tsx](../../resources/js/pages/jne-shipment.tsx); Low, frekuensi harian, kompleksitas Low. Dependensi: JneSourceEvidence; match form.

## P32 — Rekonsiliasi POP & AWB

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; meninjau baseline kategori dan kelengkapan koleksi.
- **Data esensial (4):** POP, Retail, baseline, linked AWB, completeness, review state.
- **Aksi utama / pola (5):** Cari pickup; buka koleksi; Monitoring / Exception Review.
- **Redundansi / tempat konten (6–7):** Ketentuan sudah disclosure; tidak menyembunyikan perbedaan kategori atau menebak kecocokan.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Data/empty/filter, exception visible, freshness, detail dan recovery ditinjau; tidak mengubah matching untuk membuat tampilan bersih.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/jne-reconciliation.tsx](../../resources/js/pages/jne-reconciliation.tsx); Low, frekuensi harian, kompleksitas Low. Dependensi: category table; collection links.

## P33 — Pengaturan penarikan

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; mengelola sumber dan jadwal report.
- **Data esensial (4):** Sumber, account, interval, enabled, observed state.
- **Aksi utama / pola (5):** Tambah konfigurasi; edit; jalankan sesuai aturan; Settings / Administration.
- **Redundansi / tempat konten (6–7):** Pencarian account di bawah ringkasan adalah bagian sekunder APEX; alur konfigurasi aktif sudah mendahuluinya.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Identity/status, tindakan, error dan informasi sekunder ditinjau; aksi destruktif mempertahankan konfirmasi.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/jne-profiles.tsx](../../resources/js/pages/jne-profiles.tsx); Low, frekuensi berkala, kompleksitas Low. Dependensi: JnePullSettings; JneApexAccounts; source editor.

## P34 — Penarikan Report

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; meminta report untuk akun dan tanggal.
- **Data esensial (4):** Account, national flag, periode, batas/pecahan, validation.
- **Aksi utama / pola (5):** Kirim permintaan report; Form / Wizard.
- **Redundansi / tempat konten (6–7):** Empat kartu rencana mendahului input dan mengambil ruang; bukan keputusan dashboard.
- **Interaksi / rekomendasi (8):** Ganti empat kartu halaman dengan ringkasan padat berlabel; lingkup counter tetap eksplisit..
- **Loading, kosong, error, sukses (9):** Input, pending/disabled, inline error dan hasil di source diperiksa; pengiriman eksternal dan finalisasi bukti tidak disimulasikan sebagai sukses.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/jne-reports.tsx](../../resources/js/pages/jne-reports.tsx); Medium, frekuensi harian, kompleksitas Low. Dependensi: JneWorkspaceMetrics.

## P35 — Riwayat run

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; menemukan run gagal/berjalan dan memulihkan.
- **Data esensial (4):** Account, source, status, freshness, error, log/recovery.
- **Aksi utama / pola (5):** Cari/filter; detail & log; recovery; Monitoring / Exception Review.
- **Redundansi / tempat konten (6–7):** Empat kartu statistik halaman mendahului pencarian; counter bukan agregat semua run.
- **Interaksi / rekomendasi (8):** Ganti empat kartu halaman dengan ringkasan padat berlabel; lingkup counter tetap eksplisit..
- **Loading, kosong, error, sukses (9):** Data/empty/filter, exception visible, freshness, detail dan recovery ditinjau; tidak mengubah matching untuk membuat tampilan bersih.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/jne-report-runs.tsx](../../resources/js/pages/jne-report-runs.tsx); Medium, frekuensi harian, kompleksitas Low. Dependensi: JneWorkspaceMetrics; RunDialog.

## P36 — AWB dalam report

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; mencari dan memeriksa snapshot awb.
- **Data esensial (4):** Identitas report, status pipeline, AWB sumber, error/import.
- **Aksi utama / pola (5):** Cari AWB; unduh sumber; ulang proses jika gagal; Detail / Inspection.
- **Redundansi / tempat konten (6–7):** Panel pipeline besar menempatkan search y=757 di ponsel; penjelasan sukses rutin mendominasi.
- **Interaksi / rekomendasi (8):** Pertahankan status/error/aksi recovery terlihat; pindahkan penjelasan dan rincian impor rutin ke disclosure; cari AWB tetap awal..
- **Loading, kosong, error, sukses (9):** Identity/status, tindakan, error dan informasi sekunder ditinjau; aksi destruktif mempertahankan konfirmasi.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/jne-report-awbs.tsx](../../resources/js/pages/jne-report-awbs.tsx); High, frekuensi harian, kompleksitas Medium. Dependensi: reportStage; Card; error fields.

## P37 — Customer & nama pengirim

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; mencari customer lalu memperbaiki alias.
- **Data esensial (4):** Kode, nama, aliases, konflik, penerapan, kepastian pemilik.
- **Aksi utama / pola (5):** Cari customer; tambah/edit alias; impor; Data List / Management.
- **Redundansi / tempat konten (6–7):** Panel penjelasan penerapan dan ownership mendorong search y=773; keadaan berhasil kosong berulang.
- **Interaksi / rekomendasi (8):** Tampilkan daftar pencarian lebih awal; terapkan disclosure untuk riwayat penerapan; exception pemilik dan retry gagal tetap terlihat..
- **Loading, kosong, error, sukses (9):** Loading/empty/error/retry, pencarian, pagination dan aksi konteks di source diperiksa; screenshot menggunakan data fixture yang tersedia.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/jne-shipper-aliases.tsx](../../resources/js/pages/jne-shipper-aliases.tsx); High, frekuensi berkala, kompleksitas Medium. Dependensi: directory; mapping runs; import dialog.

## P38 — Aturan bukti JNE

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; mengelola draft, verifikasi, aktivasi aturan.
- **Data esensial (4):** Jenis, scope, customer, masa berlaku, alasan, bukti.
- **Aksi utama / pola (5):** Tambah aturan; periksa; aktifkan/nonaktifkan; Settings / Administration.
- **Redundansi / tempat konten (6–7):** Editor sudah Sheet; aktivasi menuntut alasan, versi dan bukti; tidak boleh dilipat menjadi auto-toggle.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Identity/status, tindakan, error dan informasi sekunder ditinjau; aksi destruktif mempertahankan konfirmasi.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/jne-evidence-rules.tsx](../../resources/js/pages/jne-evidence-rules.tsx); Low, frekuensi berkala, kompleksitas Low. Dependensi: Sheet; SourceContractFields.

## P39 — Pemeriksaan exception

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; memutuskan customer/pickup/kategori berdasarkan bukti.
- **Data esensial (4):** AWB, kandidat, sumber, group key, versi, alasan.
- **Aksi utama / pola (5):** Cari; pilih kelompok/individu; keputusan di Sheet; Monitoring / Exception Review.
- **Redundansi / tempat konten (6–7):** Tabel dan aksi sesuai konteks; technical evidence pada disclosure; selection/focus return sudah ada.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Data/empty/filter, exception visible, freshness, detail dan recovery ditinjau; tidak mengubah matching untuk membuat tampilan bersih.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/jne-exceptions.tsx](../../resources/js/pages/jne-exceptions.tsx); Low, frekuensi harian, kompleksitas Low. Dependensi: JneCustomerCandidates; review Sheet.

## P40 — Koleksi eksternal

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; mengesahkan lingkup koleksi report.
- **Data esensial (4):** Pickup, status, kontrak, report, cutoff/timezone, alasan.
- **Aksi utama / pola (5):** Pilih report; sahkan status; Form / Wizard.
- **Redundansi / tempat konten (6–7):** Form sudah terstruktur dan errors visible; larangan complete tanpa kontrak/report bukan hambatan UX untuk dihapus.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Input, pending/disabled, inline error dan hasil di source diperiksa; pengiriman eksternal dan finalisasi bukti tidak disimulasikan sebagai sukses.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/jne-collection-window.tsx](../../resources/js/pages/jne-collection-window.tsx); Low, frekuensi per pemeriksaan, kompleksitas Low. Dependensi: collection form; contract evidence.

## P41 — Kebijakan tracking

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; menyimpan kebijakan refresh terverifikasi.
- **Data esensial (4):** Interval/status, jadwal, flag aktivasi, bukti, versi.
- **Aksi utama / pola (5):** Atur pemantauan bila kosong; simpan kebijakan; Settings / Administration.
- **Redundansi / tempat konten (6–7):** Recovery konfigurasi kosong sudah tersedia; aturan dan audit disclosure; fixture tidak memiliki profile tracking khusus.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Identity/status, tindakan, error dan informasi sekunder ditinjau; aksi destruktif mempertahankan konfirmasi.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/jne-refresh-policy.tsx](../../resources/js/pages/jne-refresh-policy.tsx); Low, frekuensi berkala, kompleksitas Low. Dependensi: JneRefreshPolicyFields.

## P42 — Tes Notifikasi

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; menguji perangkat penerima yang dipilih.
- **Data esensial (4):** Perangkat eligible, konfigurasi, isi pesan, hasil pengiriman.
- **Aksi utama / pola (5):** Pilih perangkat; kirim pesan uji; Settings / Administration.
- **Redundansi / tempat konten (6–7):** Pagination overflow pada 320px: tombol Berikutnya berakhir di x=338. Diagnostik adalah tujuan layar; actionable konfigurasi tetap terlihat. Fixture tanpa perangkat.
- **Interaksi / rekomendasi (8):** Bungkus pagination pada layar sempit tanpa memotong tombol atau menyembunyikan data..
- **Loading, kosong, error, sukses (9):** Identity/status, tindakan, error dan informasi sekunder ditinjau; aksi destruktif mempertahankan konfirmasi.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/push-test.tsx](../../resources/js/pages/push-test.tsx); Medium, frekuensi sesekali, kompleksitas Low. Dependensi: device list; pagination.

## P43 — Profil

- **Pengguna / alasan / tugas (1–3):** Pengguna login; memperbarui nama/email.
- **Data esensial (4):** Nama, email, status verifikasi, simpan, penghapusan aman.
- **Aksi utama / pola (5):** Simpan profil; Settings / Administration.
- **Redundansi / tempat konten (6–7):** Nav tiga baris dan deskripsi global mendorong form; error tanpa asosiasi; simpan tanpa feedback lokal.
- **Interaksi / rekomendasi (8):** Gunakan navigasi ringkas pada mobile, aria-current pada tujuan aktif, hilangkan deskripsi global berulang. Hubungkan error melalui aria-invalid/aria-describedby, fokus field invalid, umumkan hasil; pertahankan endpoint dan aturan password..
- **Loading, kosong, error, sukses (9):** Identity/status, tindakan, error dan informasi sekunder ditinjau; aksi destruktif mempertahankan konfirmasi.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/settings/profile.tsx](../../resources/js/pages/settings/profile.tsx); Medium, frekuensi sesekali, kompleksitas Low. Dependensi: SettingsLayout; Form; DeleteUser.

## P44 — Keamanan

- **Pengguna / alasan / tugas (1–3):** Pengguna melalui konfirmasi password; mengubah kata sandi.
- **Data esensial (4):** Password saat ini, baru, konfirmasi, kebijakan password.
- **Aksi utama / pola (5):** Simpan kata sandi; Settings / Administration.
- **Redundansi / tempat konten (6–7):** Nav mengambil ruang; tiga error belum terhubung ke field; sukses tidak diumumkan.
- **Interaksi / rekomendasi (8):** Gunakan navigasi ringkas pada mobile, aria-current pada tujuan aktif, hilangkan deskripsi global berulang. Hubungkan error melalui aria-invalid/aria-describedby, fokus field invalid, umumkan hasil; pertahankan endpoint dan aturan password..
- **Loading, kosong, error, sukses (9):** Identity/status, tindakan, error dan informasi sekunder ditinjau; aksi destruktif mempertahankan konfirmasi.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/settings/security.tsx](../../resources/js/pages/settings/security.tsx); Medium, frekuensi sesekali, kompleksitas Low. Dependensi: SettingsLayout; PasswordInput.

## P45 — Tampilan

- **Pengguna / alasan / tugas (1–3):** Pengguna verified; memilih tema.
- **Data esensial (4):** Terang, gelap, sistem dan state terpilih.
- **Aksi utama / pola (5):** Pilih tema; Settings / Administration.
- **Redundansi / tempat konten (6–7):** Pilihan sederhana didahului navigasi vertikal besar pada ponsel; active link tanpa aria-current.
- **Interaksi / rekomendasi (8):** Gunakan navigasi ringkas pada mobile, aria-current pada tujuan aktif, hilangkan deskripsi global berulang..
- **Loading, kosong, error, sukses (9):** Identity/status, tindakan, error dan informasi sekunder ditinjau; aksi destruktif mempertahankan konfirmasi.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/settings/appearance.tsx](../../resources/js/pages/settings/appearance.tsx); Medium, frekuensi sesekali, kompleksitas Low. Dependensi: SettingsLayout; AppearanceTabs.

## P46 — Halaman tidak ditemukan

- **Pengguna / alasan / tugas (1–3):** Publik atau login; pulih dari tautan salah.
- **Data esensial (4):** Status 404, kembali dashboard/utama.
- **Aksi utama / pola (5):** Kembali ke dashboard; halaman utama; Detail / Inspection.
- **Redundansi / tempat konten (6–7):** Recovery terlihat dan API 404 tetap JSON; tidak ditemukan dead end pada layar error ini.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Identity/status, tindakan, error dan informasi sekunder ditinjau; aksi destruktif mempertahankan konfirmasi.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/errors/not-found.tsx](../../resources/js/pages/errors/not-found.tsx); Low, frekuensi saat error, kompleksitas Low. Dependensi: Button; error responder.

## P47 — Mobile: boot/session/login

- **Pengguna / alasan / tugas (1–3):** Pickup Staff; masuk dan memulihkan sesi aman.
- **Data esensial (4):** Email/password, error, jaringan, draft tersimpan.
- **Aksi utama / pola (5):** Masuk; Form / Wizard.
- **Redundansi / tempat konten (6–7):** Label/error recovery ada; secure storage bergantung bridge Android. Perubahan visual tidak dibenarkan hanya dari source.
- **Interaksi / rekomendasi (8):** Pertahankan device UAT.
- **Loading, kosong, error, sukses (9):** Recovery source dan tests mobile yang sudah ada diperiksa; bridge/session/camera/push belum dieksekusi pada perangkat.
- **Desktop/mobile dan efisiensi (10):** Audit source saja; jangan menandai sebagai improved atau lolos device test.
- **Lokasi / prioritas:** [resources/mobile/src/app.tsx](../../resources/mobile/src/app.tsx); Low, frekuensi awal shift, kompleksitas Low. Dependensi: secure-session; api.

## P48 — Mobile: beranda

- **Pengguna / alasan / tugas (1–3):** Pickup Staff; membuka pekerjaan berikutnya.
- **Data esensial (4):** Tugas pertama, jadwal, shortcut pickup/handover.
- **Aksi utama / pola (5):** Buka tugas; Dashboard.
- **Redundansi / tempat konten (6–7):** Tiga tugas awal dibatasi eksplisit; tidak mengubahnya menjadi daftar seluruh tugas pada beranda.
- **Interaksi / rekomendasi (8):** Pertahankan device UAT.
- **Loading, kosong, error, sukses (9):** Recovery source dan tests mobile yang sudah ada diperiksa; bridge/session/camera/push belum dieksekusi pada perangkat.
- **Desktop/mobile dan efisiensi (10):** Audit source saja; jangan menandai sebagai improved atau lolos device test.
- **Lokasi / prioritas:** [resources/mobile/src/app.tsx](../../resources/mobile/src/app.tsx); Low, frekuensi per shift, kompleksitas Low. Dependensi: TaskCard; ModuleMenu.

## P49 — Mobile: modul

- **Pengguna / alasan / tugas (1–3):** Pickup Staff; memilih modul yang tersedia.
- **Data esensial (4):** Pickup, handover, modul nonaktif.
- **Aksi utama / pola (5):** Pickup; Handover; Operational Workspace.
- **Redundansi / tempat konten (6–7):** Modul Segera Hadir bukan halaman implementasi aktif; tidak menambah fitur.
- **Interaksi / rekomendasi (8):** Pertahankan device UAT.
- **Loading, kosong, error, sukses (9):** Recovery source dan tests mobile yang sudah ada diperiksa; bridge/session/camera/push belum dieksekusi pada perangkat.
- **Desktop/mobile dan efisiensi (10):** Audit source saja; jangan menandai sebagai improved atau lolos device test.
- **Lokasi / prioritas:** [resources/mobile/src/workspace-ui.tsx](../../resources/mobile/src/workspace-ui.tsx); Low, frekuensi harian, kompleksitas Low. Dependensi: BottomNavigation; ModuleMenu.

## P50 — Mobile: tugas/tersedia/riwayat

- **Pengguna / alasan / tugas (1–3):** Pickup Staff; mencari tugas berdasarkan lifecycle.
- **Data esensial (4):** Customer, alamat, referensi, status, pagination.
- **Aksi utama / pola (5):** Cari; filter; buka task; Data List / Management.
- **Redundansi / tempat konten (6–7):** Search mendahului daftar; filter lanjutan disclosure, outcome/final terpisah.
- **Interaksi / rekomendasi (8):** Pertahankan device UAT.
- **Loading, kosong, error, sukses (9):** Recovery source dan tests mobile yang sudah ada diperiksa; bridge/session/camera/push belum dieksekusi pada perangkat.
- **Desktop/mobile dan efisiensi (10):** Audit source saja; jangan menandai sebagai improved atau lolos device test.
- **Lokasi / prioritas:** [resources/mobile/src/app.tsx](../../resources/mobile/src/app.tsx); Low, frekuensi setiap pickup, kompleksitas Low. Dependensi: TaskCard; filters.

## P51 — Mobile: detail/private proof

- **Pengguna / alasan / tugas (1–3):** Pickup Staff; memeriksa tugas dan pop privat.
- **Data esensial (4):** Task, alamat, kontak, assignment, proof.
- **Aksi utama / pola (5):** Kerjakan; lihat POP; Detail / Inspection.
- **Redundansi / tempat konten (6–7):** Bukti privat dipulihkan melalui sesi; perangkat perlu membuktikan akses berakhir setelah logout.
- **Interaksi / rekomendasi (8):** Pertahankan device UAT.
- **Loading, kosong, error, sukses (9):** Recovery source dan tests mobile yang sudah ada diperiksa; bridge/session/camera/push belum dieksekusi pada perangkat.
- **Desktop/mobile dan efisiensi (10):** Audit source saja; jangan menandai sebagai improved atau lolos device test.
- **Lokasi / prioritas:** [resources/mobile/src/workspace-ui.tsx](../../resources/mobile/src/workspace-ui.tsx); Low, frekuensi setiap pickup, kompleksitas Low. Dependensi: TaskSummary; PrivateProof.

## P52 — Mobile: hasil kunjungan

- **Pengguna / alasan / tugas (1–3):** Pickup Staff; mencatat outcome dan reason.
- **Data esensial (4):** Versi, pilihan hasil, reason, lock/recovery.
- **Aksi utama / pola (5):** Mulai; simpan hasil; periksa hasil tidak pasti; Operational Workspace.
- **Redundansi / tempat konten (6–7):** State uncertain dan retry input sama dipisah; tidak menyembunyikan peringatan untuk mengurangi teks.
- **Interaksi / rekomendasi (8):** Pertahankan device UAT.
- **Loading, kosong, error, sukses (9):** Recovery source dan tests mobile yang sudah ada diperiksa; bridge/session/camera/push belum dieksekusi pada perangkat.
- **Desktop/mobile dan efisiensi (10):** Audit source saja; jangan menandai sebagai improved atau lolos device test.
- **Lokasi / prioritas:** [resources/mobile/src/execution-panel.tsx](../../resources/mobile/src/execution-panel.tsx); Low, frekuensi setiap pickup, kompleksitas Low. Dependensi: ExecutionPanel; local-store.

## P53 — Mobile: POP/foto/signature/review

- **Pengguna / alasan / tugas (1–3):** Pickup Staff; menyusun dan memfinalisasi pop.
- **Data esensial (4):** Tiga jumlah, foto, tanda tangan, review, draft status.
- **Aksi utama / pola (5):** Lanjut; simpan; finalisasi; Form / Wizard.
- **Redundansi / tempat konten (6–7):** Stepper, draft saved/blocked/uncertain dan validasi ada; kamera/signature memerlukan device.
- **Interaksi / rekomendasi (8):** Pertahankan device UAT.
- **Loading, kosong, error, sukses (9):** Recovery source dan tests mobile yang sudah ada diperiksa; bridge/session/camera/push belum dieksekusi pada perangkat.
- **Desktop/mobile dan efisiensi (10):** Audit source saja; jangan menandai sebagai improved atau lolos device test.
- **Lokasi / prioritas:** [resources/mobile/src/proof-panel.tsx](../../resources/mobile/src/proof-panel.tsx); Low, frekuensi setiap pickup, kompleksitas Low. Dependensi: PhotoGallery; signature; proof-draft.

## P54 — Mobile: pemulihan draft

- **Pengguna / alasan / tugas (1–3):** Pickup Staff; melanjutkan draft tanpa kehilangan bukti.
- **Data esensial (4):** Task ID, updated time, editing/sending/uncertain/blocked.
- **Aksi utama / pola (5):** Lanjutkan draft; periksa hasil; Operational Workspace.
- **Redundansi / tempat konten (6–7):** Status tekstual dan instruksi recovery terkait risiko riil; bukan kartu dokumentasi yang dapat dihapus.
- **Interaksi / rekomendasi (8):** Pertahankan device UAT.
- **Loading, kosong, error, sukses (9):** Recovery source dan tests mobile yang sudah ada diperiksa; bridge/session/camera/push belum dieksekusi pada perangkat.
- **Desktop/mobile dan efisiensi (10):** Audit source saja; jangan menandai sebagai improved atau lolos device test.
- **Lokasi / prioritas:** [resources/mobile/src/draft-list.tsx](../../resources/mobile/src/draft-list.tsx); Low, frekuensi saat gangguan, kompleksitas Low. Dependensi: local-store; proof-draft.

## P55 — Mobile: pickup manual

- **Pengguna / alasan / tugas (1–3):** Pickup Staff; membuat kunjungan manual online.
- **Data esensial (4):** Customer existing, alamat, jadwal, notes, submission key.
- **Aksi utama / pola (5):** Buat; periksa hasil; kirim ulang sama; Form / Wizard.
- **Redundansi / tempat konten (6–7):** Ketidakpastian memblokir edit demi idempotensi; bukan interaksi berlebih untuk dihapus.
- **Interaksi / rekomendasi (8):** Pertahankan device UAT.
- **Loading, kosong, error, sukses (9):** Recovery source dan tests mobile yang sudah ada diperiksa; bridge/session/camera/push belum dieksekusi pada perangkat.
- **Desktop/mobile dan efisiensi (10):** Audit source saja; jangan menandai sebagai improved atau lolos device test.
- **Lokasi / prioritas:** [resources/mobile/src/manual-pickup.tsx](../../resources/mobile/src/manual-pickup.tsx); Low, frekuensi harian, kompleksitas Low. Dependensi: ManualPickup; recovery storage.

## P56 — Mobile: handover

- **Pengguna / alasan / tugas (1–3):** Pickup Staff berwenang; membuat dan memverifikasi serah terima.
- **Data esensial (4):** Candidates, versi, jumlah fisik independen, selisih, close guard.
- **Aksi utama / pola (5):** Pilih task; verifikasi; tutup; Operational Workspace.
- **Redundansi / tempat konten (6–7):** Recovery pending dan dirty navigation ada; finalisasi fisik butuh perangkat dan UAT operasional.
- **Interaksi / rekomendasi (8):** Pertahankan device UAT.
- **Loading, kosong, error, sukses (9):** Recovery source dan tests mobile yang sudah ada diperiksa; bridge/session/camera/push belum dieksekusi pada perangkat.
- **Desktop/mobile dan efisiensi (10):** Audit source saja; jangan menandai sebagai improved atau lolos device test.
- **Lokasi / prioritas:** [resources/mobile/src/handover-panel.tsx](../../resources/mobile/src/handover-panel.tsx); Low, frekuensi setiap handover, kompleksitas Low. Dependensi: HandoverPanel; handover storage.

## P57 — Mobile: notifikasi

- **Pengguna / alasan / tugas (1–3):** Pickup Staff; membuka assignment yang diterima.
- **Data esensial (4):** Assignment diterima dalam sesi, keterbatasan retensi.
- **Aksi utama / pola (5):** Buka tugas; Monitoring / Exception Review.
- **Redundansi / tempat konten (6–7):** Batas retensi adalah informasi esensial karena daftar bukan inbox durable; tidak dihapus sebagai redundant.
- **Interaksi / rekomendasi (8):** Pertahankan device UAT.
- **Loading, kosong, error, sukses (9):** Recovery source dan tests mobile yang sudah ada diperiksa; bridge/session/camera/push belum dieksekusi pada perangkat.
- **Desktop/mobile dan efisiensi (10):** Audit source saja; jangan menandai sebagai improved atau lolos device test.
- **Lokasi / prioritas:** [resources/mobile/src/app.tsx](../../resources/mobile/src/app.tsx); Low, frekuensi per event, kompleksitas Low. Dependensi: push; app session.

## P58 — Mobile: akun

- **Pengguna / alasan / tugas (1–3):** Pickup Staff; mengelola sesi dan izin notifikasi.
- **Data esensial (4):** Identitas, akses notifikasi, logout/lock, diagnostics disclosure.
- **Aksi utama / pola (5):** Aktifkan notifikasi; keluar/kunci; Settings / Administration.
- **Redundansi / tempat konten (6–7):** Diagnostik sudah disclosure; logout dan local lock memiliki konsekuensi draft yang perlu dipertahankan.
- **Interaksi / rekomendasi (8):** Pertahankan device UAT.
- **Loading, kosong, error, sukses (9):** Recovery source dan tests mobile yang sudah ada diperiksa; bridge/session/camera/push belum dieksekusi pada perangkat.
- **Desktop/mobile dan efisiensi (10):** Audit source saja; jangan menandai sebagai improved atau lolos device test.
- **Lokasi / prioritas:** [resources/mobile/src/app.tsx](../../resources/mobile/src/app.tsx); Low, frekuensi sesekali, kompleksitas Low. Dependensi: secure-session; push.

