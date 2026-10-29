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
- **O1–O4 — Medium/High:** visual pass terakhir mengonfirmasi ringkasan role/pickup terlalu tinggi, toolbar bulk tanpa pilihan, pasangan tanggal bertumpuk pada 390px, dan metadata pembuat handover sebagai kartu kelima. Temuan baseline ini dilacak per halaman di bawah; seluruh data dan filter tetap diperlukan.
- **B2 — Medium:** belum ada scroll-padding untuk header sticky; periksa fokus melalui keyboard.

## P01 — Halaman utama

- **Pengguna / alasan / tugas (1–3):** Publik; menuju halaman masuk.
- **Data esensial (4):** Identitas produk, tautan masuk.
- **Aksi utama / pola (5):** Masuk; Detail / Inspection.
- **Redundansi / tempat konten (6–7):** Tidak ada perubahan terverifikasi; source memiliki perubahan pengguna sebelum audit.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Halaman publik statis; tidak mempunyai loading/empty data atau submit. Jalur masuk tetap tersedia; source pengguna dipertahankan.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/welcome.tsx](../../resources/js/pages/welcome.tsx); Low, frekuensi sesekali, kompleksitas Low. Dependensi: —.

## P02 — Masuk

- **Pengguna / alasan / tugas (1–3):** Semua peran; memulai sesi kerja.
- **Data esensial (4):** Email, kata sandi, ingat saya, pemulihan akses.
- **Aksi utama / pola (5):** Masuk ke workspace; Form / Wizard.
- **Redundansi / tempat konten (6–7):** Label dan error sudah terhubung; perubahan pengguna dipertahankan.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Form menonaktifkan submit dan menampilkan spinner saat pending; email/password error inline; sukses berpindah ke tujuan sesi. Login empat peran dipakai dalam capture.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/auth/login.tsx](../../resources/js/pages/auth/login.tsx); Low, frekuensi awal shift, kompleksitas Low. Dependensi: AuthLayout.

## P03 — Lupa kata sandi

- **Pengguna / alasan / tugas (1–3):** Pengguna kehilangan akses; meminta tautan reset.
- **Data esensial (4):** Email, hasil permintaan, kembali masuk.
- **Aksi utama / pola (5):** Kirim tautan atur ulang; Form / Wizard.
- **Redundansi / tempat konten (6–7):** Error email tidak terkait kontrol; fokus validasi tidak ditangani; status tidak diumumkan dan success text hanya 3,22:1 pada latar terang.
- **Interaksi / rekomendasi (8):** Hubungkan error melalui aria-invalid/aria-describedby, fokus field invalid, umumkan hasil; pertahankan endpoint dan aturan password..
- **Loading, kosong, error, sukses (9):** Pending menonaktifkan kirim; error email difokuskan dan terasosiasi. Status pengiriman diumumkan; email nyata tidak dikirim dalam audit.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/auth/forgot-password.tsx](../../resources/js/pages/auth/forgot-password.tsx); Medium, frekuensi sesekali, kompleksitas Low. Dependensi: InputError; Form.

## P04 — Reset kata sandi

- **Pengguna / alasan / tugas (1–3):** Pemilik tautan reset; mengganti kata sandi.
- **Data esensial (4):** Email token, kata sandi baru dan konfirmasi, error token.
- **Aksi utama / pola (5):** Atur ulang kata sandi; Form / Wizard.
- **Redundansi / tempat konten (6–7):** Error email dan password tidak terkait kontrol; token invalid perlu jalur koreksi terlihat.
- **Interaksi / rekomendasi (8):** Hubungkan error melalui aria-invalid/aria-describedby, fokus field invalid, umumkan hasil; pertahankan endpoint dan aturan password..
- **Loading, kosong, error, sukses (9):** Pending/disabled dan tiga field error tersedia; token invalid diuji di browser. Tautan meminta ulang adalah recovery; reset valid dilindungi test backend.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/auth/reset-password.tsx](../../resources/js/pages/auth/reset-password.tsx); Medium, frekuensi sesekali, kompleksitas Low. Dependensi: PasswordInput; Form.

## P05 — Verifikasi email

- **Pengguna / alasan / tugas (1–3):** Pengguna belum terverifikasi (kondisional); mengirim ulang tautan.
- **Data esensial (4):** Status pengiriman, kirim ulang, keluar.
- **Aksi utama / pola (5):** Kirim ulang email verifikasi; Form / Wizard.
- **Redundansi / tempat konten (6–7):** Status kirim ulang sukses tampil tanpa semantic status; warna sukses perlu kontras AA normal text; baseline kondisional dikonfirmasi dengan akun fixture sementara unverified.
- **Interaksi / rekomendasi (8):** Umumkan status kirim ulang dengan role=status dan gunakan warna status yang lolos kontras pada tema terang/gelap; pertahankan pending dan logout..
- **Loading, kosong, error, sukses (9):** Pending menonaktifkan kirim ulang; status verification-link-sent muncul setelah request. Akun fixture dibuat sementara unverified untuk capture, lalu dipulihkan; mail memakai array driver.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/auth/verify-email.tsx](../../resources/js/pages/auth/verify-email.tsx); Medium, frekuensi kondisional, kompleksitas Low. Dependensi: Fortify; AuthLayout.

## P06 — Konfirmasi kata sandi

- **Pengguna / alasan / tugas (1–3):** Pengguna menuju keamanan; membuka tindakan sensitif.
- **Data esensial (4):** Kata sandi saat ini dan error.
- **Aksi utama / pola (5):** Konfirmasi kata sandi; Form / Wizard.
- **Redundansi / tempat konten (6–7):** Error belum terhubung; fokus error tidak dikembalikan.
- **Interaksi / rekomendasi (8):** Hubungkan error melalui aria-invalid/aria-describedby, fokus field invalid, umumkan hasil; pertahankan endpoint dan aturan password..
- **Loading, kosong, error, sukses (9):** Pending/disabled, penolakan password inline dan fokus diuji; sukses membuka tindakan sensitif melalui contract yang sama.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/auth/confirm-password.tsx](../../resources/js/pages/auth/confirm-password.tsx); Medium, frekuensi sesekali, kompleksitas Low. Dependensi: PasswordInput; Form.

## P07 — Registrasi nonaktif

- **Pengguna / alasan / tugas (1–3):** Publik (source fallback); memahami siapa membuat akun.
- **Data esensial (4):** Akun dibuat Admin; kembali masuk.
- **Aksi utama / pola (5):** Kembali ke login; Detail / Inspection.
- **Redundansi / tempat konten (6–7):** Bukan halaman publik aktif; tidak membuka registrasi sebagai perubahan UX.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Fallback statis tanpa submit/empty/loading; tidak ada route registrasi aktif. Kembali login adalah recovery yang tersedia.
- **Desktop/mobile dan efisiensi (10):** Source saja karena route nonaktif.
- **Lokasi / prioritas:** [resources/js/pages/auth/register.tsx](../../resources/js/pages/auth/register.tsx); Low, frekuensi tidak aktif, kompleksitas Low. Dependensi: Fortify configuration.

## P08 — Dashboard Admin

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; menentukan tindak lanjut periode.
- **Data esensial (4):** Volume, tren, exception, waktu observasi, drill-down.
- **Aksi utama / pola (5):** Buat pickup; filter periode; Dashboard.
- **Redundansi / tempat konten (6–7):** Metrik dan grafik relevan dengan keputusan; tidak ada alasan menyamakan dashboard dengan daftar kerja. SSR React menghasilkan title SVG kosong karena beberapa child text; browser melaporkan hydration mismatch dan meregenerasi chart.
- **Interaksi / rekomendasi (8):** Jadikan title SVG satu string agar label grafik tersedia di HTML server dan cocok dengan client. Pertahankan seluruh nilai, grafik, tooltip, tabel alternatif dan interaksi fokus..
- **Loading, kosong, error, sukses (9):** Data periode, cakupan observasi dan drill-down dipertahankan; filter/loading dan kondisi kosong dilihat pada source overview. Capture bukan bukti refresh integrasi live.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/dashboard.tsx](../../resources/js/pages/dashboard.tsx); High, frekuensi harian, kompleksitas Low. Dependensi: OperationalOverview; charts.

## P09 — Dashboard CS

- **Pengguna / alasan / tugas (1–3):** CS; memantau jadwal dan membuat pickup.
- **Data esensial (4):** Jadwal, penugasan, kunjungan, periode.
- **Aksi utama / pola (5):** Buat pickup; Dashboard.
- **Redundansi / tempat konten (6–7):** Dispatch role dan cakupan data sudah terpisah; dialog mengikuti perbaikan primitive bersama. SSR React menghasilkan title SVG kosong karena beberapa child text; browser melaporkan hydration mismatch dan meregenerasi chart.
- **Interaksi / rekomendasi (8):** Jadikan title SVG satu string agar label grafik tersedia di HTML server dan cocok dengan client. Pertahankan seluruh nilai, grafik, tooltip, tabel alternatif dan interaksi fokus..
- **Loading, kosong, error, sukses (9):** Overview memakai data khusus role dan periode; jalur buat pickup serta state dialog pending/error tetap tersedia. Tidak menjalankan transaksi valid untuk capture.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/dashboard.tsx](../../resources/js/pages/dashboard.tsx); High, frekuensi harian, kompleksitas Low. Dependensi: OperationalOverview; CreatePickupDialog.

## P10 — Dashboard Retail

- **Pengguna / alasan / tugas (1–3):** Retail Staff; menemukan penerimaan yang menunggu.
- **Data esensial (4):** Sesi draft, pending, selisih dan tautan sesi.
- **Aksi utama / pola (5):** Buka sesi penerimaan; Dashboard.
- **Redundansi / tempat konten (6–7):** Empat ringkasan satu kolom pada ponsel mendorong sesi penerimaan dan tombol verifikasi ke bawah; semua angka tetap relevan.
- **Interaksi / rekomendasi (8):** Dua kolom ringkasan pada mobile; semua angka, delta/tren dan exception tetap tersedia; tampilkan pekerjaan berikutnya lebih awal..
- **Loading, kosong, error, sukses (9):** Refresh memiliki pending/disabled dan error terlihat; ringkasan serta daftar sesi kosong/berisi dibedakan. Fixture menampilkan sesi menunggu verifikasi.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/dashboard.tsx](../../resources/js/pages/dashboard.tsx); Medium, frekuensi per shift, kompleksitas Low. Dependensi: RoleDashboard.

## P11 — Dashboard Pickup

- **Pengguna / alasan / tugas (1–3):** Pickup Staff; menemukan tugas berikutnya.
- **Data esensial (4):** Tugas, status, jadwal dan alamat.
- **Aksi utama / pola (5):** Buka tugas; Dashboard.
- **Redundansi / tempat konten (6–7):** Empat ringkasan satu kolom memperpanjang akses menuju pekerjaan; tren dan exception tetap diperlukan. Sparkline juga mempunyai title kosong/mismatch pada SSR karena beberapa child text.
- **Interaksi / rekomendasi (8):** Dua kolom ringkasan pada mobile; semua angka, delta/tren dan exception tetap tersedia; tampilkan pekerjaan berikutnya lebih awal. Jadikan title SVG satu string agar label grafik tersedia di HTML server dan cocok dengan client. Pertahankan seluruh nilai, grafik, tooltip, tabel alternatif dan interaksi fokus..
- **Loading, kosong, error, sukses (9):** Refresh pending/error, tugas aktif dan kunjungan tanpa paket dipisahkan. Ringkasan nol tidak mengganti status unavailable; exception tetap terlihat.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/dashboard.tsx](../../resources/js/pages/dashboard.tsx); High, frekuensi per shift, kompleksitas Low. Dependensi: RoleDashboard.

## P12 — Master customer

- **Pengguna / alasan / tugas (1–3):** CS; Admin/Supervisor; mencari dan memelihara customer.
- **Data esensial (4):** Kode, nama, kontak, alamat, status aktif.
- **Aksi utama / pola (5):** Tambah Customer; cari; edit; Data List / Management.
- **Redundansi / tempat konten (6–7):** Search y=240 pada 390px; daftar dan dialog sudah mempunyai recovery dan draft guard. Target tutup overlay hanya 16px; dialog/Sheet perlu target dan containment yang layak.
- **Interaksi / rekomendasi (8):** Target tutup 44×44px, ruang judul dan scroll containment; pertahankan focus trap, focus return serta dirty-close existing..
- **Loading, kosong, error, sukses (9):** Daftar memiliki loading/error/retry dan empty yang dapat dipulihkan lewat filter. Dialog 422 mempertahankan draft, fokus invalid dan dirty-close diuji; sukses tulis tidak dikirim ke data operasional.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/customers.tsx](../../resources/js/pages/customers.tsx); Medium, frekuensi harian, kompleksitas Low. Dependensi: CustomerDataTable; CustomerDialog.

## P13 — Operasional Pickup

- **Pengguna / alasan / tugas (1–3):** CS; Admin/Supervisor; Pickup/Retail pada scope yang diizinkan; menugaskan dan menelusuri pickup.
- **Data esensial (4):** Referensi, customer, status, jadwal, petugas.
- **Aksi utama / pola (5):** Buat pickup; tugaskan; cari; Data List / Management.
- **Redundansi / tempat konten (6–7):** Lima kartu ringkasan mendahului pencarian; toolbar penugasan tampil tanpa pilihan; tanggal bertumpuk pada 390px.
- **Interaksi / rekomendasi (8):** Utamakan search/filter; padatkan ringkasan tanpa mengurangi angka; toolbar bulk hanya saat ada pilihan. Pasangkan tanggal bila lebar cukup, stack pada 320px..
- **Loading, kosong, error, sukses (9):** Loading skeleton, error/retry, empty dan pagination berasal dari PickupOperationalList. Bulk nol pilihan/pilih/lintas halaman/clear diuji tanpa menugaskan task.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/operations.tsx](../../resources/js/pages/operations.tsx); High, frekuensi berulang per shift, kompleksitas Low. Dependensi: PickupOperationalList; BulkPickupAssignment.

## P14 — Tugas Saya

- **Pengguna / alasan / tugas (1–3):** Pickup Staff; Retail Staff; Admin; membuka pekerjaan yang ditangani.
- **Data esensial (4):** Customer, alamat, jadwal, status, tugas berikutnya.
- **Aksi utama / pola (5):** Buka tugas; lanjutkan pickup; Operational Workspace.
- **Redundansi / tempat konten (6–7):** Ringkasan tugas dan spacing memperpanjang halaman; pasangan tanggal bertumpuk walau 390px menyediakan ruang yang cukup.
- **Interaksi / rekomendasi (8):** Utamakan search/filter; padatkan ringkasan tanpa mengurangi angka; toolbar bulk hanya saat ada pilihan. Pasangkan tanggal bila lebar cukup, stack pada 320px..
- **Loading, kosong, error, sukses (9):** Loading/error dan tidak ada tugas berbeda dari tab riwayat. Jumlah terjadwal dan jadwal aktif berikutnya tetap ada; pemulihan daftar memakai reload/filter.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/operations.tsx](../../resources/js/pages/operations.tsx); Medium, frekuensi setiap pickup, kompleksitas Low. Dependensi: PickupOperationalList.

## P15 — Tugas tersedia

- **Pengguna / alasan / tugas (1–3):** Pickup Staff; Retail Staff; Admin; memeriksa kandidat pengambilalihan.
- **Data esensial (4):** Customer, petugas saat ini, jadwal, status.
- **Aksi utama / pola (5):** Periksa; ambil alih sesuai kapabilitas; Operational Workspace.
- **Redundansi / tempat konten (6–7):** Filter tanggal menambah satu baris pada 390px; tugas kandidat dan konfirmasi pengambilalihan harus tetap tersedia.
- **Interaksi / rekomendasi (8):** Utamakan search/filter; padatkan ringkasan tanpa mengurangi angka; toolbar bulk hanya saat ada pilihan. Pasangkan tanggal bila lebar cukup, stack pada 320px..
- **Loading, kosong, error, sukses (9):** State loading/error/empty daftar tetap sama; takeover mengikuti can.* dan konfirmasi existing. Tidak mengirim pengambilalihan nyata.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/operations.tsx](../../resources/js/pages/operations.tsx); Medium, frekuensi harian, kompleksitas Low. Dependensi: PickupOperationalList; takeover dialog.

## P16 — Riwayat Pickup

- **Pengguna / alasan / tugas (1–3):** Pickup Staff; Retail Staff; Admin; mencari pekerjaan sebelumnya.
- **Data esensial (4):** Customer, hasil akhir, waktu, bukti.
- **Aksi utama / pola (5):** Filter; buka detail; Data List / Management.
- **Redundansi / tempat konten (6–7):** Filter tanggal bertumpuk pada 390px dan spacing menunda daftar; hasil akhir dan bukti tetap esensial.
- **Interaksi / rekomendasi (8):** Utamakan search/filter; padatkan ringkasan tanpa mengurangi angka; toolbar bulk hanya saat ada pilihan. Pasangkan tanggal bila lebar cukup, stack pada 320px..
- **Loading, kosong, error, sukses (9):** History mengubah scope hasil, bukan sekadar label. Loading/error/empty/filter/pagination tetap tersedia; detail bukti tidak dihilangkan.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/operations.tsx](../../resources/js/pages/operations.tsx); Medium, frekuensi harian, kompleksitas Low. Dependensi: PickupOperationalList.

## P17 — Buat Pickup

- **Pengguna / alasan / tugas (1–3):** CS; Admin; Pickup Staff; membuat pickup on-demand.
- **Data esensial (4):** Customer, alamat, jadwal, catatan, kunci submission.
- **Aksi utama / pola (5):** Buat pickup; Form / Wizard.
- **Redundansi / tempat konten (6–7):** Header formulir mengulang tugas; error field tidak terhubung dan respons 422 tidak memfokuskan kontrol.
- **Interaksi / rekomendasi (8):** Singkat header berulang dan perbaiki fokus/asosiasi validasi tanpa mengubah submission key atau recovery uncertain..
- **Loading, kosong, error, sukses (9):** Missing customer diuji di browser dengan field lain terisi. Pending, 422, submission key dan hasil uncertain ditinjau; tidak mengirim pickup valid nyata.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/operations.tsx](../../resources/js/pages/operations.tsx); High, frekuensi berulang per shift, kompleksitas Medium. Dependensi: CreatePickup; CustomerPicker.

## P18 — Detail Pickup

- **Pengguna / alasan / tugas (1–3):** Peran yang diizinkan policy view; memeriksa dan melanjutkan lifecycle task.
- **Data esensial (4):** Status, assignment, alamat, waktu, hasil/bukti.
- **Aksi utama / pola (5):** Mulai/lanjutkan; tugaskan; lihat POP; Detail / Inspection.
- **Redundansi / tempat konten (6–7):** Aksi mengikuti can.*; bukti dan audit tetap tersedia. Tidak ditemukan perubahan aman yang diperlukan pada surface utama.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Loader/error dan data task dipisahkan; aksi lifecycle mengikuti kapabilitas. Pending, konflik dan cancel/retry ditangani dalam dialog terkait; POP privat tetap tersedia.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/operations.tsx](../../resources/js/pages/operations.tsx); Low, frekuensi setiap pickup, kompleksitas Low. Dependensi: PickupDetail; lifecycle dialogs.

## P19 — Pengguna

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; mengelola akun, role, status.
- **Data esensial (4):** Nama, email, role, aktif.
- **Aksi utama / pola (5):** Tambah Pengguna; edit; Settings / Administration.
- **Redundansi / tempat konten (6–7):** Daftar dan editor sudah ringkas; tidak mengubah otorisasi melalui penyederhanaan UI.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Daftar/editor memisahkan loading/error/empty, pending simpan dan validasi. Aktif/nonaktif serta role tetap di bawah izin Admin; perubahan akun nyata tidak dilakukan.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/operations.tsx](../../resources/js/pages/operations.tsx); Low, frekuensi berkala, kompleksitas Low. Dependensi: User editor; DataTable.

## P20 — Eksekusi Pickup / POP

- **Pengguna / alasan / tugas (1–3):** Petugas yang ditugaskan; mencatat outcome, jumlah, bukti, finalisasi.
- **Data esensial (4):** Versi task, outcome, tiga kategori, foto, tanda tangan.
- **Aksi utama / pola (5):** Simpan kunjungan; lanjut; finalisasi; Form / Wizard.
- **Redundansi / tempat konten (6–7):** Empat langkah bermakna, guard draft dan konflik sudah ada; jumlah dan bukti wajib tidak boleh dihilangkan.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Loading dan error task terlihat. Outcome/reason, jumlah, foto/tanda tangan, review dan konflik versi memiliki validasi/recovery; draft guard dan finalisasi dipertahankan.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/pickup-wizard.tsx](../../resources/js/pages/pickup-wizard.tsx); Low, frekuensi setiap pickup, kompleksitas Low. Dependensi: SignaturePad; PickupCashlessAwbs.

## P21 — Jadwal Regular

- **Pengguna / alasan / tugas (1–3):** CS; Admin/Supervisor; mencari dan mengubah jadwal.
- **Data esensial (4):** Customer, hari/waktu, periode, status, generation policy.
- **Aksi utama / pola (5):** Tambah Jadwal; cari; ubah; Data List / Management.
- **Redundansi / tempat konten (6–7):** Pesan scheduler mendahului pencarian; dialog menghapus draft saat Escape tanpa konfirmasi; error tidak terasosiasi.
- **Interaksi / rekomendasi (8):** Prioritaskan pencarian; ringkas status scheduler dengan rincian kontekstual; lindungi draft dialog dan asosiasikan error..
- **Loading, kosong, error, sukses (9):** Daftar mempunyai loading/error/Belum ada jadwal; dialog pending/422 dan fokus customer/hari/tanggal diuji. Draft dapat dipertahankan saat close dibatalkan atau dibuang secara eksplisit.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/pickup-schedules.tsx](../../resources/js/pages/pickup-schedules.tsx); High, frekuensi harian, kompleksitas Medium. Dependensi: Dialog; useHttp; Customer select.

## P22 — Monitoring pemrosesan

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; mencari paket belum diproses dan memeriksa hasil.
- **Data esensial (4):** Penerimaan, konfirmasi eksternal, deklarasi manual, backlog, kategori.
- **Aksi utama / pola (5):** Cari; buka detail pemrosesan; Monitoring / Exception Review.
- **Redundansi / tempat konten (6–7):** Search y=1270 pada 390px; empat kartu satu kolom dan tabel ringkasan mendahului daftar.
- **Interaksi / rekomendasi (8):** Ringkasan padat dua kolom di ponsel; pencarian mendahului rincian kategori/antrean; seluruh angka tetap dapat diperiksa..
- **Loading, kosong, error, sukses (9):** Null, konfirmasi eksternal dan deklarasi manual dibedakan. Pending/filter/error/retry tetap tersedia; filter URL, baris pertama dan bantuan keyboard diuji.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/pickup-results.tsx](../../resources/js/pages/pickup-results.tsx); High, frekuensi berulang per shift, kompleksitas Medium. Dependensi: MonitoringMetric; ProcessingMetrics; processing list.

## P23 — Monitoring hasil pickup

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; menemukan pickup dan exception serah terima.
- **Data esensial (4):** Jadwal, kunjungan, POP, handover, pending, antrean lintas hari.
- **Aksi utama / pola (5):** Cari; detail cepat; filter antrean; Monitoring / Exception Review.
- **Redundansi / tempat konten (6–7):** Search y=1389 pada 390px; lima kartu satu kolom dan antrean mendahului pekerjaan pencarian.
- **Interaksi / rekomendasi (8):** Ringkasan padat dua kolom di ponsel; pencarian mendahului rincian kategori/antrean; seluruh angka tetap dapat diperiksa..
- **Loading, kosong, error, sukses (9):** POP, pending handover dan antrean lintas hari tetap berbeda. Search/filter URL, detail/empty/retry dan freshness ditinjau; peringatan operasional tetap terlihat.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/pickup-results.tsx](../../resources/js/pages/pickup-results.tsx); High, frekuensi berulang per shift, kompleksitas Medium. Dependensi: MonitoringMetric; PickupPrimaryMetrics.

## P24 — Detail Hasil Pickup

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; menindaklanjuti hasil dan pemrosesan.
- **Data esensial (4):** Identitas, status, tindakan berikutnya, POP, handover, receipt.
- **Aksi utama / pola (5):** Tindakan kontekstual; tab hasil; Detail / Inspection.
- **Redundansi / tempat konten (6–7):** Tab memiliki keyboard roving focus dan label; audit/processing terpisah; tidak ada perubahan layout utama yang dibenarkan.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Identitas dan status mendahului tab hasil/processing/history. Pending dan konflik tindakan berada di dialog terkait; private source dan recovery tetap tersedia.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/pickup-result-detail.tsx](../../resources/js/pages/pickup-result-detail.tsx); Low, frekuensi harian, kompleksitas Low. Dependensi: PickupResultActions; processing drawer.

## P25 — Daftar Handover

- **Pengguna / alasan / tugas (1–3):** Pickup; Retail; Admin sesuai kapabilitas; membuat/menemukan sesi serah terima.
- **Data esensial (4):** Referensi, petugas, status, pending, jumlah.
- **Aksi utama / pola (5):** Buat Handover Session; filter; Data List / Management.
- **Redundansi / tempat konten (6–7):** Tanggal mulai/selesai bertumpuk pada 390px sehingga daftar sesi turun; full-task selection dan guard penutupan perlu dipertahankan.
- **Interaksi / rekomendasi (8):** Tanggal berpasangan pada 390px bila tiap input cukup lebar; stack pada 320px. Pertahankan semua filter, nilai, reset dan konteks tanggal..
- **Loading, kosong, error, sukses (9):** Daftar memisahkan loading/error/empty dari pagination; form membuat sesi memiliki validasi dan selection. State aktif fixture, filter tanggal dan mobile selection diuji.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/handover.tsx](../../resources/js/pages/handover.tsx); Medium, frekuensi harian, kompleksitas Low. Dependensi: HandoverSessionList.

## P26 — Riwayat Handover

- **Pengguna / alasan / tugas (1–3):** Retail; Pickup; Admin sesuai kapabilitas; menelusuri sesi selesai.
- **Data esensial (4):** Sesi, status akhir, waktu, selisih.
- **Aksi utama / pola (5):** Cari; buka sesi; Data List / Management.
- **Redundansi / tempat konten (6–7):** Pasangan tanggal bertumpuk pada 390px; konteks riwayat dan default filter tetap diperlukan.
- **Interaksi / rekomendasi (8):** Tanggal berpasangan pada 390px bila tiap input cukup lebar; stack pada 320px. Pertahankan semua filter, nilai, reset dan konteks tanggal..
- **Loading, kosong, error, sukses (9):** Fixture tidak mempunyai sesi selesai, sehingga empty history dan semua filter dicapture. Loading/error tetap terpisah; bukan menganggap kosong sebagai kegagalan.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/handover.tsx](../../resources/js/pages/handover.tsx); Medium, frekuensi harian, kompleksitas Low. Dependensi: HandoverSessionList.

## P27 — Verifikasi Handover

- **Pengguna / alasan / tugas (1–3):** Retail; Pickup; Admin sesuai kapabilitas; membandingkan jumlah fisik dan pop.
- **Data esensial (4):** Tiga kategori terpisah, delta, alasan selisih, verifier, versi.
- **Aksi utama / pola (5):** Pilih task; verifikasi; tutup sesuai guard; Operational Workspace.
- **Redundansi / tempat konten (6–7):** Identitas pembuat menjadi kartu kelima dan mengulang tanggal header; kartu tinggi menunda daftar verifikasi.
- **Interaksi / rekomendasi (8):** Padatkan empat jumlah; letakkan pembuat sebagai metadata dan gunakan tanggal header yang sudah ada; pertahankan perbandingan fisik/POP dan guard finalisasi..
- **Loading, kosong, error, sukses (9):** Pending verifikasi, jumlah independen, alasan selisih dan close guard tetap tersedia. Memilih task pada mobile membuka panel terkait dan mempertahankan jumlah.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/handover.tsx](../../resources/js/pages/handover.tsx); Medium, frekuensi setiap serah terima, kompleksitas Low. Dependensi: HandoverSessionDetail; VerificationForm.

## P28 — Monitoring Selisih

- **Pengguna / alasan / tugas (1–3):** Peran canExecutePickup; menelusuri selisih per kategori.
- **Data esensial (4):** POP, fisik, delta, catatan, kebutuhan tinjau ulang.
- **Aksi utama / pola (5):** Cari; filter; buka sesi/task; Monitoring / Exception Review.
- **Redundansi / tempat konten (6–7):** Tanggal mulai/selesai bertumpuk pada 390px; filter kategori/status dan konteks selisih tetap esensial.
- **Interaksi / rekomendasi (8):** Tanggal berpasangan pada 390px bila tiap input cukup lebar; stack pada 320px. Pertahankan semua filter, nilai, reset dan konteks tanggal..
- **Loading, kosong, error, sukses (9):** Loading/error/retry dan Tidak ada selisih pada filter ini dibedakan. Catatan serta revisi state sesi tetap terlihat; tanggal/filter tidak menyelesaikan discrepancy.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/discrepancies.tsx](../../resources/js/pages/discrepancies.tsx); Medium, frekuensi harian, kompleksitas Low. Dependensi: HandoverNavigation; discrepancy dialog.

## P29 — Dashboard customer

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; menganalisis customer dan periode.
- **Data esensial (4):** Customer, tanggal kirim, volume, amount, cakupan data, tren.
- **Aksi utama / pola (5):** Pilih customer/periode; drill-down; Dashboard.
- **Redundansi / tempat konten (6–7):** Filter menjelaskan basis tanggal yang menentukan arti angka; bukan paragraf berlebih untuk dihapus. SSR React menghasilkan title SVG kosong karena beberapa child text; browser melaporkan hydration mismatch dan meregenerasi chart.
- **Interaksi / rekomendasi (8):** Jadikan title SVG satu string agar label grafik tersedia di HTML server dan cocok dengan client. Pertahankan seluruh nilai, grafik, tooltip, tabel alternatif dan interaksi fokus..
- **Loading, kosong, error, sukses (9):** Filter memiliki pending dan validation error; tanpa customer/hasil memakai state yang sesuai. Basis tanggal dan cakupan memengaruhi arti data, sehingga dipertahankan.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/jne-customer-dashboard.tsx](../../resources/js/pages/jne-customer-dashboard.tsx); High, frekuensi harian, kompleksitas Low. Dependensi: CustomerPicker; CustomerDashboardCharts.

## P30 — Pengiriman JNE

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; mencari awb dan status pengiriman.
- **Data esensial (4):** Nomor AWB, identitas, status, snapshot/freshness, exception.
- **Aksi utama / pola (5):** Cari; detail cepat; tarik report; Monitoring / Exception Review.
- **Redundansi / tempat konten (6–7):** Pencarian dan kepastian identitas tampil awal; diagnostik telah berada dalam disclosure.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Status filter/empty, source unavailable dan kegagalan monitoring tidak disamakan dengan nol. Retry/kembali ke daftar serta detail cepat ditinjau; kegagalan API disimulasikan dalam browser test.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/jne-monitoring.tsx](../../resources/js/pages/jne-monitoring.tsx); Low, frekuensi berulang per shift, kompleksitas Low. Dependensi: ShipmentFilters; ShipmentTable; Sheet.

## P31 — Detail AWB

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; memeriksa bukti dan hubungan pickup.
- **Data esensial (4):** AWB, status, source, customer, matching dan alasan.
- **Aksi utama / pola (5):** Periksa sumber; cocokkan pickup sesuai policy; Detail / Inspection.
- **Redundansi / tempat konten (6–7):** Source evidence dan keputusan memiliki jejak; formulir berada setelah identitas untuk mencegah keputusan tanpa bukti.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Snapshot kosong, bukti sumber dan ambiguity dipisahkan; input matching memiliki validasi dan pending. Tidak membuat keputusan matching nyata saat capture.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/jne-shipment.tsx](../../resources/js/pages/jne-shipment.tsx); Low, frekuensi harian, kompleksitas Low. Dependensi: JneSourceEvidence; match form.

## P32 — Rekonsiliasi POP & AWB

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; meninjau baseline kategori dan kelengkapan koleksi.
- **Data esensial (4):** POP, Retail, baseline, linked AWB, completeness, review state.
- **Aksi utama / pola (5):** Cari pickup; buka koleksi; Monitoring / Exception Review.
- **Redundansi / tempat konten (6–7):** Ketentuan sudah disclosure; tidak menyembunyikan perbedaan kategori atau menebak kecocokan.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Baseline kategori, incomplete collection dan state review ditinjau sebagai informasi esensial; pencarian/empty/pagination tidak mengubah angka POP atau linked AWB.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/jne-reconciliation.tsx](../../resources/js/pages/jne-reconciliation.tsx); Low, frekuensi harian, kompleksitas Low. Dependensi: category table; collection links.

## P33 — Pengaturan penarikan

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; mengelola sumber dan jadwal report.
- **Data esensial (4):** Sumber, account, interval, enabled, observed state.
- **Aksi utama / pola (5):** Tambah konfigurasi; edit; jalankan sesuai aturan; Settings / Administration.
- **Redundansi / tempat konten (6–7):** Pencarian account di bawah ringkasan adalah bagian sekunder APEX; alur konfigurasi aktif sudah mendahuluinya.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Konfigurasi sumber dan account punya empty/setup state serta pending simpan; last_error tetap terlihat. Browser test memastikan setup/empty masih actionable; provider tidak dijalankan.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/jne-profiles.tsx](../../resources/js/pages/jne-profiles.tsx); Low, frekuensi berkala, kompleksitas Low. Dependensi: JnePullSettings; JneApexAccounts; source editor.

## P34 — Penarikan Report

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; meminta report untuk akun dan tanggal.
- **Data esensial (4):** Account, national flag, periode, batas/pecahan, validation.
- **Aksi utama / pola (5):** Kirim permintaan report; Form / Wizard.
- **Redundansi / tempat konten (6–7):** Empat kartu rencana mendahului input dan mengambil ruang; bukan keputusan dashboard.
- **Interaksi / rekomendasi (8):** Ganti empat kartu halaman dengan ringkasan padat berlabel; lingkup counter tetap eksplisit..
- **Loading, kosong, error, sukses (9):** Account/periode memiliki error terkait field; pending mencegah pengiriman berulang. Rencana/batas dan hasil request tetap tersedia; pull ke provider tidak dijalankan.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/jne-reports.tsx](../../resources/js/pages/jne-reports.tsx); Medium, frekuensi harian, kompleksitas Low. Dependensi: JneWorkspaceMetrics.

## P35 — Riwayat run

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; menemukan run gagal/berjalan dan memulihkan.
- **Data esensial (4):** Account, source, status, freshness, error, log/recovery.
- **Aksi utama / pola (5):** Cari/filter; detail & log; recovery; Monitoring / Exception Review.
- **Redundansi / tempat konten (6–7):** Empat kartu statistik halaman mendahului pencarian; counter bukan agregat semua run.
- **Interaksi / rekomendasi (8):** Ganti empat kartu halaman dengan ringkasan padat berlabel; lingkup counter tetap eksplisit..
- **Loading, kosong, error, sukses (9):** Pending/running/success/failed, import/projection error dan recovery tetap terpisah. State rutin dapat ringkas; kegagalan dan retry tetap terlihat.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/jne-report-runs.tsx](../../resources/js/pages/jne-report-runs.tsx); Medium, frekuensi harian, kompleksitas Low. Dependensi: JneWorkspaceMetrics; RunDialog.

## P36 — AWB dalam report

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; mencari dan memeriksa snapshot awb.
- **Data esensial (4):** Identitas report, status pipeline, AWB sumber, error/import.
- **Aksi utama / pola (5):** Cari AWB; unduh sumber; ulang proses jika gagal; Detail / Inspection.
- **Redundansi / tempat konten (6–7):** Panel pipeline besar menempatkan search y=757 di ponsel; penjelasan sukses rutin mendominasi.
- **Interaksi / rekomendasi (8):** Pertahankan status/error/aksi recovery terlihat; pindahkan penjelasan dan rincian impor rutin ke disclosure; cari AWB tetap awal..
- **Loading, kosong, error, sukses (9):** Run source/import/projection punya status berbeda; failed/pending recovery tetap terlihat. Empty/filter AWB dan local table scroll ditinjau; unduhan tidak dihapus.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/jne-report-awbs.tsx](../../resources/js/pages/jne-report-awbs.tsx); High, frekuensi harian, kompleksitas Medium. Dependensi: reportStage; Card; error fields.

## P37 — Customer & nama pengirim

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; mencari customer lalu memperbaiki alias.
- **Data esensial (4):** Kode, nama, aliases, konflik, penerapan, kepastian pemilik.
- **Aksi utama / pola (5):** Cari customer; tambah/edit alias; impor; Data List / Management.
- **Redundansi / tempat konten (6–7):** Panel penjelasan penerapan dan ownership mendorong search y=773; keadaan berhasil kosong berulang.
- **Interaksi / rekomendasi (8):** Tampilkan daftar pencarian lebih awal; terapkan disclosure untuk riwayat penerapan; exception pemilik dan retry gagal tetap terlihat..
- **Loading, kosong, error, sukses (9):** Direktori customer, empty/filter dan konflik owner tetap terpisah. Pending/failed application otomatis membuka rincian; validasi alias/import dan retry tetap tersedia.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/jne-shipper-aliases.tsx](../../resources/js/pages/jne-shipper-aliases.tsx); High, frekuensi berkala, kompleksitas Medium. Dependensi: directory; mapping runs; import dialog.

## P38 — Aturan bukti JNE

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; mengelola draft, verifikasi, aktivasi aturan.
- **Data esensial (4):** Jenis, scope, customer, masa berlaku, alasan, bukti.
- **Aksi utama / pola (5):** Tambah aturan; periksa; aktifkan/nonaktifkan; Settings / Administration.
- **Redundansi / tempat konten (6–7):** Editor sudah Sheet; aktivasi menuntut alasan, versi dan bukti; tidak boleh dilipat menjadi auto-toggle. Target tutup overlay hanya 16px; dialog/Sheet perlu target dan containment yang layak.
- **Interaksi / rekomendasi (8):** Target tutup 44×44px, ruang judul dan scroll containment; pertahankan focus trap, focus return serta dirty-close existing..
- **Loading, kosong, error, sukses (9):** Aturan draft/aktif dan form create/activation dibedakan; field validation dan dirty-close tersedia. Sheet Tab/Escape/focus return diuji tanpa mengaktifkan aturan.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/jne-evidence-rules.tsx](../../resources/js/pages/jne-evidence-rules.tsx); Medium, frekuensi berkala, kompleksitas Low. Dependensi: Sheet; SourceContractFields.

## P39 — Pemeriksaan exception

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; memutuskan customer/pickup/kategori berdasarkan bukti.
- **Data esensial (4):** AWB, kandidat, sumber, group key, versi, alasan.
- **Aksi utama / pola (5):** Cari; pilih kelompok/individu; keputusan di Sheet; Monitoring / Exception Review.
- **Redundansi / tempat konten (6–7):** Tabel dan aksi sesuai konteks; technical evidence pada disclosure; selection/focus return sudah ada.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Antrean evidence, source error dan review state dipertahankan; kandidat ambigu memerlukan bukti. Empty/filter dan form error dilihat di source; keputusan tidak disubmit saat capture.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/jne-exceptions.tsx](../../resources/js/pages/jne-exceptions.tsx); Low, frekuensi harian, kompleksitas Low. Dependensi: JneCustomerCandidates; review Sheet.

## P40 — Koleksi eksternal

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; mengesahkan lingkup koleksi report.
- **Data esensial (4):** Pickup, status, kontrak, report, cutoff/timezone, alasan.
- **Aksi utama / pola (5):** Pilih report; sahkan status; Form / Wizard.
- **Redundansi / tempat konten (6–7):** Form sudah terstruktur dan errors visible; larangan complete tanpa kontrak/report bukan hambatan UX untuk dihapus.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Belum ada kontrak, incomplete/open dan closed collection berbeda. Form status/scope/cutoff/alasan memiliki validation/focus; empty/open dan kegagalan diuji pada fixture/fakes.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/jne-collection-window.tsx](../../resources/js/pages/jne-collection-window.tsx); Low, frekuensi per pemeriksaan, kompleksitas Low. Dependensi: collection form; contract evidence.

## P41 — Kebijakan tracking

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; menyimpan kebijakan refresh terverifikasi.
- **Data esensial (4):** Interval/status, jadwal, flag aktivasi, bukti, versi.
- **Aksi utama / pola (5):** Atur pemantauan bila kosong; simpan kebijakan; Settings / Administration.
- **Redundansi / tempat konten (6–7):** Recovery konfigurasi kosong sudah tersedia; aturan dan audit disclosure; fixture tidak memiliki profile tracking khusus.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Empty policy memberi aksi setup; pending/disabled dan field errors tetap ada pada editor. Browser test memeriksa empty/mobile; tidak mengubah jadwal provider live.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/jne-refresh-policy.tsx](../../resources/js/pages/jne-refresh-policy.tsx); Low, frekuensi berkala, kompleksitas Low. Dependensi: JneRefreshPolicyFields.

## P42 — Tes Notifikasi

- **Pengguna / alasan / tugas (1–3):** Admin/Supervisor; menguji perangkat penerima yang dipilih.
- **Data esensial (4):** Perangkat eligible, konfigurasi, isi pesan, hasil pengiriman.
- **Aksi utama / pola (5):** Pilih perangkat; kirim pesan uji; Settings / Administration.
- **Redundansi / tempat konten (6–7):** Pagination overflow pada 320px: tombol Berikutnya berakhir di x=338. Diagnostik adalah tujuan layar; actionable konfigurasi tetap terlihat. Fixture tanpa perangkat.
- **Interaksi / rekomendasi (8):** Bungkus pagination pada layar sempit tanpa memotong tombol atau menyembunyikan data..
- **Loading, kosong, error, sukses (9):** Loading/listError, tidak ada perangkat, konfigurasi invalid dan hasil tidak pasti dipisah. Fixture tanpa perangkat; tidak mengirim FCM nyata atau menyembunyikan failure.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/push-test.tsx](../../resources/js/pages/push-test.tsx); Medium, frekuensi sesekali, kompleksitas Low. Dependensi: device list; pagination.

## P43 — Profil

- **Pengguna / alasan / tugas (1–3):** Pengguna login; memperbarui nama/email.
- **Data esensial (4):** Nama, email, status verifikasi, simpan, penghapusan aman.
- **Aksi utama / pola (5):** Simpan profil; Settings / Administration.
- **Redundansi / tempat konten (6–7):** Nav tiga baris dan deskripsi global mendorong form; error tanpa asosiasi; simpan tanpa feedback lokal.
- **Interaksi / rekomendasi (8):** Gunakan navigasi ringkas pada mobile, aria-current pada tujuan aktif, hilangkan deskripsi global berulang. Hubungkan error melalui aria-invalid/aria-describedby, fokus field invalid, umumkan hasil; pertahankan endpoint dan aturan password..
- **Loading, kosong, error, sukses (9):** Pending/disabled, error nama difokuskan dan draft dipertahankan; success live status tersedia. Hapus akun tetap dialog aman; tidak dieksekusi di browser fixture.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/settings/profile.tsx](../../resources/js/pages/settings/profile.tsx); Medium, frekuensi sesekali, kompleksitas Low. Dependensi: SettingsLayout; Form; DeleteUser.

## P44 — Keamanan

- **Pengguna / alasan / tugas (1–3):** Pengguna melalui konfirmasi password; mengubah kata sandi.
- **Data esensial (4):** Password saat ini, baru, konfirmasi, kebijakan password.
- **Aksi utama / pola (5):** Simpan kata sandi; Settings / Administration.
- **Redundansi / tempat konten (6–7):** Nav mengambil ruang; tiga error belum terhubung ke field; sukses tidak diumumkan.
- **Interaksi / rekomendasi (8):** Gunakan navigasi ringkas pada mobile, aria-current pada tujuan aktif, hilangkan deskripsi global berulang. Hubungkan error melalui aria-invalid/aria-describedby, fokus field invalid, umumkan hasil; pertahankan endpoint dan aturan password..
- **Loading, kosong, error, sukses (9):** Pending/disabled, current password invalid, fokus/error dan recentlySuccessful tersedia; gate confirmation tidak diubah. Reset field sensitif mengikuti behavior existing.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/settings/security.tsx](../../resources/js/pages/settings/security.tsx); Medium, frekuensi sesekali, kompleksitas Low. Dependensi: SettingsLayout; PasswordInput.

## P45 — Tampilan

- **Pengguna / alasan / tugas (1–3):** Pengguna verified; memilih tema.
- **Data esensial (4):** Terang, gelap, sistem dan state terpilih.
- **Aksi utama / pola (5):** Pilih tema; Settings / Administration.
- **Redundansi / tempat konten (6–7):** Pilihan sederhana didahului navigasi vertikal besar pada ponsel; active link tanpa aria-current.
- **Interaksi / rekomendasi (8):** Gunakan navigasi ringkas pada mobile, aria-current pada tujuan aktif, hilangkan deskripsi global berulang..
- **Loading, kosong, error, sukses (9):** Tiga tema memakai state terpilih dan persistensi; tidak ada submit/loading/empty data. Keyboard dan pilihan tema diuji; tidak ada klaim semua browser/OS.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/settings/appearance.tsx](../../resources/js/pages/settings/appearance.tsx); Medium, frekuensi sesekali, kompleksitas Low. Dependensi: SettingsLayout; AppearanceTabs.

## P46 — Halaman tidak ditemukan

- **Pengguna / alasan / tugas (1–3):** Publik atau login; pulih dari tautan salah.
- **Data esensial (4):** Status 404, kembali dashboard/utama.
- **Aksi utama / pola (5):** Kembali ke dashboard; halaman utama; Detail / Inspection.
- **Redundansi / tempat konten (6–7):** Recovery terlihat dan API 404 tetap JSON; tidak ditemukan dead end pada layar error ini.
- **Interaksi / rekomendasi (8):** Pertahankan.
- **Loading, kosong, error, sukses (9):** Error 404 adalah state utama, bukan empty list; tautan kembali tersedia. Browser memeriksa recovery, sedangkan API 404 tetap JSON.
- **Desktop/mobile dan efisiensi (10):** Baseline dan after memakai empat ukuran yang sama; lihat before-after-verification untuk pengukuran objektif dan keterbatasan tiap perubahan.
- **Lokasi / prioritas:** [resources/js/pages/errors/not-found.tsx](../../resources/js/pages/errors/not-found.tsx); Low, frekuensi saat error, kompleksitas Low. Dependensi: Button; error responder.

## P47 — Mobile: boot/session/login

- **Pengguna / alasan / tugas (1–3):** Pickup Staff; masuk dan memulihkan sesi aman.
- **Data esensial (4):** Email/password, error, jaringan, draft tersimpan.
- **Aksi utama / pola (5):** Masuk; Form / Wizard.
- **Redundansi / tempat konten (6–7):** Label/error recovery ada; secure storage bergantung bridge Android. Perubahan visual tidak dibenarkan hanya dari source.
- **Interaksi / rekomendasi (8):** Pertahankan device UAT.
- **Loading, kosong, error, sukses (9):** Boot/restore, jaringan dan gagal masuk memiliki recovery source; sesi aman bergantung secure bridge. Belum diuji pada perangkat fisik.
- **Desktop/mobile dan efisiensi (10):** Audit source saja; jangan menandai sebagai improved atau lolos device test.
- **Lokasi / prioritas:** [resources/mobile/src/app.tsx](../../resources/mobile/src/app.tsx); Low, frekuensi awal shift, kompleksitas Low. Dependensi: secure-session; api.

## P48 — Mobile: beranda

- **Pengguna / alasan / tugas (1–3):** Pickup Staff; membuka pekerjaan berikutnya.
- **Data esensial (4):** Tugas pertama, jadwal, shortcut pickup/handover.
- **Aksi utama / pola (5):** Buka tugas; Dashboard.
- **Redundansi / tempat konten (6–7):** Tiga tugas awal dibatasi eksplisit; tidak mengubahnya menjadi daftar seluruh tugas pada beranda.
- **Interaksi / rekomendasi (8):** Pertahankan device UAT.
- **Loading, kosong, error, sukses (9):** Tugas awal terbatas, status sesi dan shortcut ditinjau; empty/loading/error bersumber dari app state. Logic/build tersedia, device rendering belum tersedia.
- **Desktop/mobile dan efisiensi (10):** Audit source saja; jangan menandai sebagai improved atau lolos device test.
- **Lokasi / prioritas:** [resources/mobile/src/app.tsx](../../resources/mobile/src/app.tsx); Low, frekuensi per shift, kompleksitas Low. Dependensi: TaskCard; ModuleMenu.

## P49 — Mobile: modul

- **Pengguna / alasan / tugas (1–3):** Pickup Staff; memilih modul yang tersedia.
- **Data esensial (4):** Pickup, handover, modul nonaktif.
- **Aksi utama / pola (5):** Pickup; Handover; Operational Workspace.
- **Redundansi / tempat konten (6–7):** Modul Segera Hadir bukan halaman implementasi aktif; tidak menambah fitur.
- **Interaksi / rekomendasi (8):** Pertahankan device UAT.
- **Loading, kosong, error, sukses (9):** Modul aktif dan Segera Hadir berbeda; modul yang belum tersedia tidak diperlakukan sebagai route aktif. Tidak ada business submit pada menu.
- **Desktop/mobile dan efisiensi (10):** Audit source saja; jangan menandai sebagai improved atau lolos device test.
- **Lokasi / prioritas:** [resources/mobile/src/workspace-ui.tsx](../../resources/mobile/src/workspace-ui.tsx); Low, frekuensi harian, kompleksitas Low. Dependensi: BottomNavigation; ModuleMenu.

## P50 — Mobile: tugas/tersedia/riwayat

- **Pengguna / alasan / tugas (1–3):** Pickup Staff; mencari tugas berdasarkan lifecycle.
- **Data esensial (4):** Customer, alamat, referensi, status, pagination.
- **Aksi utama / pola (5):** Cari; filter; buka task; Data List / Management.
- **Redundansi / tempat konten (6–7):** Search mendahului daftar; filter lanjutan disclosure, outcome/final terpisah.
- **Interaksi / rekomendasi (8):** Pertahankan device UAT.
- **Loading, kosong, error, sukses (9):** Loading, empty, filter/pagination dan error berada pada list/tab state. Scope mine/available/history tetap berbeda; belum ada screenshot perangkat.
- **Desktop/mobile dan efisiensi (10):** Audit source saja; jangan menandai sebagai improved atau lolos device test.
- **Lokasi / prioritas:** [resources/mobile/src/app.tsx](../../resources/mobile/src/app.tsx); Low, frekuensi setiap pickup, kompleksitas Low. Dependensi: TaskCard; filters.

## P51 — Mobile: detail/private proof

- **Pengguna / alasan / tugas (1–3):** Pickup Staff; memeriksa tugas dan pop privat.
- **Data esensial (4):** Task, alamat, kontak, assignment, proof.
- **Aksi utama / pola (5):** Kerjakan; lihat POP; Detail / Inspection.
- **Redundansi / tempat konten (6–7):** Bukti privat dipulihkan melalui sesi; perangkat perlu membuktikan akses berakhir setelah logout.
- **Interaksi / rekomendasi (8):** Pertahankan device UAT.
- **Loading, kosong, error, sukses (9):** Task/private proof memerlukan sesi; error akses bukan tidak ada foto. Expiry/logout dan bridge memerlukan UAT perangkat.
- **Desktop/mobile dan efisiensi (10):** Audit source saja; jangan menandai sebagai improved atau lolos device test.
- **Lokasi / prioritas:** [resources/mobile/src/workspace-ui.tsx](../../resources/mobile/src/workspace-ui.tsx); Low, frekuensi setiap pickup, kompleksitas Low. Dependensi: TaskSummary; PrivateProof.

## P52 — Mobile: hasil kunjungan

- **Pengguna / alasan / tugas (1–3):** Pickup Staff; mencatat outcome dan reason.
- **Data esensial (4):** Versi, pilihan hasil, reason, lock/recovery.
- **Aksi utama / pola (5):** Mulai; simpan hasil; periksa hasil tidak pasti; Operational Workspace.
- **Redundansi / tempat konten (6–7):** State uncertain dan retry input sama dipisah; tidak menyembunyikan peringatan untuk mengurangi teks.
- **Interaksi / rekomendasi (8):** Pertahankan device UAT.
- **Loading, kosong, error, sukses (9):** Editing/sending/blocked/uncertain dan konflik versi mempertahankan input/recovery. Source dan test execution diperiksa; hasil fisik tidak difinalisasi.
- **Desktop/mobile dan efisiensi (10):** Audit source saja; jangan menandai sebagai improved atau lolos device test.
- **Lokasi / prioritas:** [resources/mobile/src/execution-panel.tsx](../../resources/mobile/src/execution-panel.tsx); Low, frekuensi setiap pickup, kompleksitas Low. Dependensi: ExecutionPanel; local-store.

## P53 — Mobile: POP/foto/signature/review

- **Pengguna / alasan / tugas (1–3):** Pickup Staff; menyusun dan memfinalisasi pop.
- **Data esensial (4):** Tiga jumlah, foto, tanda tangan, review, draft status.
- **Aksi utama / pola (5):** Lanjut; simpan; finalisasi; Form / Wizard.
- **Redundansi / tempat konten (6–7):** Stepper, draft saved/blocked/uncertain dan validasi ada; kamera/signature memerlukan device.
- **Interaksi / rekomendasi (8):** Pertahankan device UAT.
- **Loading, kosong, error, sukses (9):** Draft, validation, photo/signature missing, sending/uncertain dan final review ditinjau. Logic photo/signature diuji; kamera/touch nyata belum diuji.
- **Desktop/mobile dan efisiensi (10):** Audit source saja; jangan menandai sebagai improved atau lolos device test.
- **Lokasi / prioritas:** [resources/mobile/src/proof-panel.tsx](../../resources/mobile/src/proof-panel.tsx); Low, frekuensi setiap pickup, kompleksitas Low. Dependensi: PhotoGallery; signature; proof-draft.

## P54 — Mobile: pemulihan draft

- **Pengguna / alasan / tugas (1–3):** Pickup Staff; melanjutkan draft tanpa kehilangan bukti.
- **Data esensial (4):** Task ID, updated time, editing/sending/uncertain/blocked.
- **Aksi utama / pola (5):** Lanjutkan draft; periksa hasil; Operational Workspace.
- **Redundansi / tempat konten (6–7):** Status tekstual dan instruksi recovery terkait risiko riil; bukan kartu dokumentasi yang dapat dihapus.
- **Interaksi / rekomendasi (8):** Pertahankan device UAT.
- **Loading, kosong, error, sukses (9):** Draft editing/sending/uncertain/blocked memakai recovery berbeda; data tersimpan dan updated time tetap terlihat. Restart/offline di perangkat belum diuji.
- **Desktop/mobile dan efisiensi (10):** Audit source saja; jangan menandai sebagai improved atau lolos device test.
- **Lokasi / prioritas:** [resources/mobile/src/draft-list.tsx](../../resources/mobile/src/draft-list.tsx); Low, frekuensi saat gangguan, kompleksitas Low. Dependensi: local-store; proof-draft.

## P55 — Mobile: pickup manual

- **Pengguna / alasan / tugas (1–3):** Pickup Staff; membuat kunjungan manual online.
- **Data esensial (4):** Customer existing, alamat, jadwal, notes, submission key.
- **Aksi utama / pola (5):** Buat; periksa hasil; kirim ulang sama; Form / Wizard.
- **Redundansi / tempat konten (6–7):** Ketidakpastian memblokir edit demi idempotensi; bukan interaksi berlebih untuk dihapus.
- **Interaksi / rekomendasi (8):** Pertahankan device UAT.
- **Loading, kosong, error, sukses (9):** Pending/uncertain melindungi submission key dan input yang sama; error lookup tidak menciptakan customer baru. Logic recovery diuji, transaksi live tidak dikirim.
- **Desktop/mobile dan efisiensi (10):** Audit source saja; jangan menandai sebagai improved atau lolos device test.
- **Lokasi / prioritas:** [resources/mobile/src/manual-pickup.tsx](../../resources/mobile/src/manual-pickup.tsx); Low, frekuensi harian, kompleksitas Low. Dependensi: ManualPickup; recovery storage.

## P56 — Mobile: handover

- **Pengguna / alasan / tugas (1–3):** Pickup Staff berwenang; membuat dan memverifikasi serah terima.
- **Data esensial (4):** Candidates, versi, jumlah fisik independen, selisih, close guard.
- **Aksi utama / pola (5):** Pilih task; verifikasi; tutup; Operational Workspace.
- **Redundansi / tempat konten (6–7):** Recovery pending dan dirty navigation ada; finalisasi fisik butuh perangkat dan UAT operasional.
- **Interaksi / rekomendasi (8):** Pertahankan device UAT.
- **Loading, kosong, error, sukses (9):** Candidate/version, pending recovery, independent counts dan dirty navigation ditinjau; finalisasi fisik/bridge belum diuji di perangkat.
- **Desktop/mobile dan efisiensi (10):** Audit source saja; jangan menandai sebagai improved atau lolos device test.
- **Lokasi / prioritas:** [resources/mobile/src/handover-panel.tsx](../../resources/mobile/src/handover-panel.tsx); Low, frekuensi setiap handover, kompleksitas Low. Dependensi: HandoverPanel; handover storage.

## P57 — Mobile: notifikasi

- **Pengguna / alasan / tugas (1–3):** Pickup Staff; membuka assignment yang diterima.
- **Data esensial (4):** Assignment diterima dalam sesi, keterbatasan retensi.
- **Aksi utama / pola (5):** Buka tugas; Monitoring / Exception Review.
- **Redundansi / tempat konten (6–7):** Batas retensi adalah informasi esensial karena daftar bukan inbox durable; tidak dihapus sebagai redundant.
- **Interaksi / rekomendasi (8):** Pertahankan device UAT.
- **Loading, kosong, error, sukses (9):** Daftar assignment hanya dalam sesi dan batas retensi eksplisit; empty bukan bukti tidak pernah menerima push. Delivery/hardware belum diuji.
- **Desktop/mobile dan efisiensi (10):** Audit source saja; jangan menandai sebagai improved atau lolos device test.
- **Lokasi / prioritas:** [resources/mobile/src/app.tsx](../../resources/mobile/src/app.tsx); Low, frekuensi per event, kompleksitas Low. Dependensi: push; app session.

## P58 — Mobile: akun

- **Pengguna / alasan / tugas (1–3):** Pickup Staff; mengelola sesi dan izin notifikasi.
- **Data esensial (4):** Identitas, akses notifikasi, logout/lock, diagnostics disclosure.
- **Aksi utama / pola (5):** Aktifkan notifikasi; keluar/kunci; Settings / Administration.
- **Redundansi / tempat konten (6–7):** Diagnostik sudah disclosure; logout dan local lock memiliki konsekuensi draft yang perlu dipertahankan.
- **Interaksi / rekomendasi (8):** Pertahankan device UAT.
- **Loading, kosong, error, sukses (9):** Notification permission, logout/local lock dan diagnostics disclosure memiliki konsekuensi sesi/draft. Source ditinjau; OS permission/secure bridge belum diuji.
- **Desktop/mobile dan efisiensi (10):** Audit source saja; jangan menandai sebagai improved atau lolos device test.
- **Lokasi / prioritas:** [resources/mobile/src/app.tsx](../../resources/mobile/src/app.tsx); Low, frekuensi sesekali, kompleksitas Low. Dependensi: secure-session; push.


## Hasil verifikasi akhir

Seluruh 58 surface diaudit individual; **31 surface diverifikasi membaik** (29 perubahan langsung dan 2 workflow tertanam), **27 sengaja tidak diubah**. Tidak menghitung semua halaman sebagai improved hanya karena primitive bersama berubah. 148 definisi route, 67 GET/HEAD, tersimpan di [router aktual](evidence/routes.json); endpoint data dan unduhan tidak disamakan dengan halaman.

Temuan tambahan dari quality gate: **B3 — navigasi mobile**. Pada 390px dan 320px, hidden tooltip masih terpasang dan Escape gagal menutup menu setelah traversal keyboard; tombol tutup tidak terlihat. Source: resources/js/components/ui/sidebar.tsx:194 dan :524. Tooltip kini hanya dipasang saat sidebar desktop berupa ikon; tombol tutup 44px terlihat; kedua ukuran lolos satu Escape dan focus return. [Bukti sebelum](evidence/before-sidebar.json) / [sesudah](evidence/after-sidebar.json).

[Penyelesaian per halaman dan keterbatasan](implementation-results.md), [pasangan evidence dan hasil](before-after-verification.md), [quality gates](evidence/checks.json). Native dan fallback registrasi tidak diberi klaim runtime yang belum terbukti; verifikasi email mempunyai capture kondisional tersendiri.
