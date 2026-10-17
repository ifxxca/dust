# Product Requirements Document

# Retail Pickup Mobile V1

**Version:** 1.2 — NO_PACKAGES, pickup manual, dan verifikasi/penutupan Handover mobile disetujui  
**Date:** 14 Oktober 2026  
**Status:** Perubahan kebijakan disetujui owner; UAT/pilot tetap belum selesai  
**Platform:** Android-first  
**Distribution:** Internal APK  
**Primary User:** Pickup Staff  
**Backend:** Retail Pickup Management existing (Laravel)

---

## 1. Product Overview

### 1.1 Background

Retail Pickup Management saat ini sudah menyediakan workflow operasional berbasis web, mencakup:

- Customer dan Pickup Task.
- Assignment dan takeover.
- Pickup Execution.
- Proof of Pickup (POP).
- Handover dan verifikasi Retail.
- Regular Scheduling.
- Monitoring dan riwayat operasional.

Berdasarkan audit repository, alur on-demand hingga Handover Session CLOSED sudah tersedia.

Namun, Pickup Staff bekerja di lapangan sehingga membutuhkan antarmuka yang lebih sesuai untuk penggunaan smartphone, khususnya untuk melihat tugas, mencatat hasil kunjungan, mengambil foto, memperoleh tanda tangan customer, dan menyerahkan paket.

Mobile V1 akan menjadi client tambahan dari sistem existing, bukan sistem operasional baru.

### 1.2 Product Goal

Menyediakan aplikasi Android yang memungkinkan Pickup Staff menjalankan pekerjaan pickup dari awal hingga serah terima paket secara praktis, aman, dan konsisten dengan sistem web.

### 1.3 Success Criteria

Mobile V1 dinyatakan memenuhi tujuan produk apabila:

1. Pickup Staff dapat menjalankan workflow yang menjadi tanggung jawabnya melalui Android tanpa perlu membuka desktop.
2. Data dan status yang ditampilkan konsisten dengan sistem web.
3. Tidak terjadi duplikasi transaksi akibat pengiriman berulang.
4. Foto, signature, dan data POP tersimpan serta dapat diakses sesuai authorization.
5. Draft pekerjaan tidak hilang hanya karena aplikasi ditutup atau koneksi terputus, dalam batasan penyimpanan lokal yang ditentukan.
6. Perubahan ownership atau status task ditangani tanpa merusak data.
7. Workflow utama lulus UAT pada perangkat Android nyata.

Tidak ditetapkan target persentase produktivitas atau SLA baru sebelum tersedia baseline pengukuran.

---

## 2. Product Scope

### 2.1 In Scope

| ID     | Module               | Scope                                                                                                                                        |
| ------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| MOB-01 | Authentication       | Login, logout, informasi akun, pengelolaan sesi                                                                                              |
| MOB-02 | Task Workspace       | Tugas Saya, Tugas Tersedia, pencarian, filter, pagination                                                                                    |
| MOB-03 | Pickup Detail        | Customer, alamat, jadwal, status, petugas, informasi operasional                                                                             |
| MOB-04 | Takeover             | Pengambilan alih task yang memenuhi ketentuan existing                                                                                       |
| MOB-05 | Pickup Execution     | Mulai kunjungan, hasil kunjungan, alasan tanpa paket, task baru untuk kunjungan berikutnya                                                   |
| MOB-06 | Proof of Pickup      | Jumlah paket, foto, signature, catatan, review, finalisasi                                                                                   |
| MOB-07 | Pickup History       | Riwayat tugas, hasil pickup, POP, dan status receipt                                                                                         |
| MOB-08 | Handover             | Kandidat, pembuatan session, perubahan anggota DRAFT, verifikasi tiga kategori, penutupan, status/riwayat session                            |
| MOB-09 | Offline Draft        | Penyimpanan draft lokal dan pemulihan                                                                                                        |
| MOB-10 | Operational Feedback | Loading, validation, error, conflict, dan status pengiriman                                                                                  |
| MOB-11 | Pickup Manual        | Pickup Staff memilih customer existing, mengisi alamat/jadwal/alasan, dan membuat task untuk dirinya sendiri; online-only dan anti-duplikasi |

### 2.2 Out of Scope

Tidak termasuk dalam Mobile V1:

- Customer management.
- Assignment oleh CS.
- Pengelolaan akun dan role Admin.
- Pengelolaan Regular Scheduling.
- Workspace verifikasi Retail Staff.
- Koreksi POP yang hanya diperbolehkan untuk Admin.
- GPS tracking dan route optimization.
- AWB scanning.
- Customer portal.
- Notifikasi umum di luar assignment Firebase yang telah disetujui pada M1.1.
- Offline transaction submission.
- Background synchronization penuh.
- Pengembangan provider WhatsApp.
- Pengembangan ulang business logic backend.

Fitur tersebut dapat dipertimbangkan pada versi berikutnya.

---

## 3. Users & Access

### 3.1 Primary User — Pickup Staff

Pickup Staff menggunakan aplikasi untuk:

- Melihat pekerjaan yang ditugaskan.
- Mengambil alih task yang memenuhi syarat.
- Mengunjungi customer.
- Mencatat hasil kunjungan.
- Membuat dan memfinalisasi POP.
- Menyerahkan paket melalui Handover Session.
- Melihat riwayat pekerjaan.

### 3.2 Access Principles

1. User harus login menggunakan akun operasional yang aktif.
2. Aplikasi hanya menampilkan fitur yang relevan dengan hak akses user.
3. Seluruh mutation tetap divalidasi oleh backend.
4. Menyembunyikan tombol di frontend tidak dianggap sebagai mekanisme authorization.
5. Ownership task diperiksa ulang ketika operasi dilakukan.
6. Perubahan role, akun aktif, dan ownership harus tercermin pada akses berikutnya.
7. Aplikasi tidak memberikan hak baru hanya karena fitur tersedia di mobile.

Mobile V1 tidak memperkenalkan role atau permission bisnis baru.

---

## 4. Primary User Journey

### 4.1 Successful Pickup

1. Pickup Staff login.
2. Membuka Tugas Saya.
3. Memilih pickup yang ditugaskan.
4. Melihat detail customer, alamat, dan jadwal.
5. Memulai kunjungan.
6. Mencatat hasil kunjungan berhasil (`COLLECTED`).
7. Mengisi jumlah paket per kategori.
8. Mengambil foto bukti.
9. Meminta tanda tangan customer sesuai ketentuan existing.
10. Memeriksa ringkasan POP.
11. Melakukan finalisasi POP.
12. Task menjadi `PICKED_UP` sesuai lifecycle backend.
13. Task dapat masuk ke proses handover sesuai eligibility existing.
14. Pickup Staff membuat atau mengelola Handover Session.
15. Melihat status handover dan riwayat.

### 4.2 No Packages

1. Pickup Staff memulai kunjungan.
2. Customer tidak menyerahkan paket.
3. Staff memilih hasil `NO_PACKAGES`.
4. Staff mengisi alasan yang diwajibkan.
5. Hasil kunjungan disimpan.
6. Aplikasi menampilkan status dan tindakan lanjutan yang diizinkan.

**Business rule (disetujui owner 14 Oktober 2026):** hasil `NO_PACKAGES` dengan alasan menyelesaikan Pickup Task sebagai `NO_PACKAGES` (Selesai Tanpa Paket), terpisah dari `PICKED_UP`. Task keluar dari Tugas Saya aktif dan tetap tersedia di Riwayat. Tidak ada POP, receipt pickup berhasil, atau paket untuk handover dari hasil ini.

Kunjungan berikutnya dibuat sebagai task baru yang merujuk task asal. Tidak ada retry kunjungan pada task yang sudah selesai tanpa paket. Retry transport/reconciliation mempertahankan task dan payload/key yang sama, bukan membuat task baru. Pickup Staff tetap tidak boleh cancel.

### 4.2.1 Pickup Manual dan Kunjungan Lanjutan

Owner menyetujui kebijakan ini untuk web dan mobile pada 14 Oktober 2026. User aktif dengan role pickup_staff dapat memilih customer existing, mengisi alamat/jadwal/alasan atau catatan, lalu membuat pickup on-demand yang langsung ditugaskan kepada dirinya sendiri. Customer management dan assignment ke staff lain tidak diberikan. CS/Admin tetap dapat membuat task SCHEDULED untuk assignment existing.

Kunjungan lanjutan dari task NO_PACKAGES menggunakan customer yang sama, jadwal setelah task asal, dan previous_task_id yang terotorisasi. Backend menolak duplikasi customer pada menit jadwal yang sama terhadap task non-CANCELLED, termasuk task regular. Pemeriksaan terikat transaction/customer lock dan berlaku kedua arah dengan scheduler; waktu tersimpan tetap menggunakan timestamp input. Submission key tetap untuk replay/reconciliation; tidak ada offline mutation atau automatic retry dengan key baru.

### 4.3 Takeover

1. Staff membuka Tugas Tersedia.
2. Memilih task yang memenuhi syarat.
3. Melihat informasi task dan konfirmasi takeover.
4. Mengirim permintaan takeover.
5. Backend memvalidasi eligibility, assignee, dan versi task.
6. Jika berhasil, task muncul pada Tugas Saya.
7. Jika konflik, aplikasi menampilkan informasi bahwa task sudah berubah dan meminta refresh.

Takeover tidak boleh dilakukan terhadap task yang sudah memulai eksekusi atau tidak lagi memenuhi syarat existing.

---

## 5. Functional Requirements

### MOB-01 — Authentication

**Objective:** Memberikan akses aman ke aplikasi menggunakan akun existing.

Requirements:

- User dapat login menggunakan kredensial operasional.
- Akun nonaktif tidak dapat menggunakan aplikasi.
- User dapat logout.
- User dapat melihat informasi akun.
- Aplikasi dapat menangani sesi tidak valid atau kedaluwarsa.
- Logout mengakhiri akses sesi/perangkat yang bersangkutan.
- Data autentikasi tidak ditampilkan pada log aplikasi.

Acceptance Criteria:

- Kredensial valid dan akun aktif menghasilkan login berhasil.
- Kredensial salah menghasilkan pesan yang aman dan jelas.
- Akun nonaktif ditolak.
- Request tanpa autentikasi ditolak.
- User tidak memperoleh akses di luar role existing.
- Setelah logout, request menggunakan kredensial sesi yang dicabut tidak berhasil.
- Draft lokal dan data sensitif ditangani secara aman saat logout atau pergantian akun.

### MOB-02 — Task Workspace

**Objective:** Memudahkan staff menemukan pekerjaan yang perlu dilakukan.

Screens:

- Tugas Saya.
- Tugas Tersedia.
- Riwayat Pickup.

Requirements:

- Menampilkan daftar task berdasarkan akses user.
- Menampilkan customer, jadwal, status, dan informasi lokasi.
- Search dan filter menggunakan kemampuan backend existing.
- Mendukung pagination.
- Menampilkan empty state dan error state.
- Menyediakan refresh manual.
- Data diperbarui ketika user kembali ke workspace setelah mutation.

Acceptance Criteria:

- Staff hanya melihat data sesuai authorization.
- Filter dan pagination berfungsi.
- Daftar tidak menduplikasi task ketika halaman berikutnya dimuat.
- Setelah takeover berhasil, task muncul di Tugas Saya.
- Setelah status berubah, daftar menampilkan status terbaru setelah refresh.

### MOB-03 — Pickup Detail

**Objective:** Menampilkan informasi task dan tindakan yang relevan.

Requirements:

- Reference task.
- Customer.
- Kontak.
- Alamat pickup.
- Jadwal.
- Assignee.
- Status.
- Catatan.
- Hasil kunjungan bila tersedia.
- Ringkasan POP bila tersedia.
- Informasi handover bila tersedia dan dapat diakses.

Primary action mengikuti state dan authorization existing.

Acceptance Criteria:

- Detail sesuai data backend.
- Task yang tidak boleh diakses ditolak.
- Action yang tidak eligible tidak ditawarkan sebagai tindakan aktif.
- Jika status berubah saat halaman terbuka, mutation ditangani menggunakan state terbaru dari backend.
- Data POP final ditampilkan read-only bagi staff yang tidak memiliki hak koreksi.

### MOB-04 — Takeover

Requirements:

- Menampilkan kandidat takeover yang eligible.
- Konfirmasi sebelum takeover.
- Menangani perubahan assignee dan versi task.
- Menampilkan hasil takeover.
- Refresh data setelah mutation.

Acceptance Criteria:

- Takeover berhasil hanya jika task masih eligible.
- Dua staff yang melakukan takeover bersamaan tidak sama-sama memperoleh ownership.
- Previous assignee tidak dapat melakukan mutation yang membutuhkan ownership setelah takeover.
- Konflik menghasilkan pesan yang jelas tanpa perubahan UI yang menyesatkan.
- Audit takeover tetap tercatat melalui backend existing.

### MOB-05 — Pickup Execution

Requirements:

- Mulai kunjungan.
- Mencatat hasil `COLLECTED` atau `NO_PACKAGES`.
- Mengisi alasan jika diperlukan.
- Menampilkan pembuatan kunjungan baru setelah NO_PACKAGES sesuai hak akses; cancel tetap hanya pengelola sebelum task terminal.
- Menangani konflik state dan ownership.

Acceptance Criteria:

- Memulai kunjungan tidak menciptakan status task baru di luar lifecycle existing.
- Hasil kunjungan tersimpan dengan benar.
- `NO_PACKAGES` menyelesaikan task dengan hasil tersendiri dan alasan wajib, tanpa POP.
- Kunjungan berikutnya memakai task baru; retry transport tidak menggandakan hasil. Pickup Staff tidak boleh cancel.
- Pengiriman berulang tidak membuat hasil kunjungan ganda yang tidak sah.
- UI membaca ulang state authoritative setelah mutation.

### MOB-06 — Proof of Pickup

**Objective:** Mendukung pencatatan POP melalui wizard mobile.

Wizard terdiri dari:

**Step 1 — Hasil Kunjungan**

- Menampilkan atau mencatat hasil kunjungan.
- Jalur berhasil melanjutkan ke jumlah paket.
- Jalur tanpa paket mengikuti workflow existing.

**Step 2 — Jumlah Paket**

Kategori:

- Manual Hybrid Non-Cashless.
- Cashless Hybrid.
- CSS / Orion.

Total dihitung otomatis.

**Step 3 — Bukti Pickup**

- Foto melalui kamera atau galeri.
- Signature customer.
- Catatan pickup.
- Preview dan penggantian bukti sebelum finalisasi.

Batasan berdasarkan audit existing:

- Maksimal empat foto.
- Maksimal 5 MB per foto.
- Signature PNG maksimal 1 MB.

Ketentuan wajib/tidak wajib dan validasi lain mengikuti backend existing.

**Step 4 — Review & Finalisasi**

- Ringkasan customer dan task.
- Hasil kunjungan.
- Kuantitas per kategori.
- Total paket.
- Foto dan signature.
- Catatan.
- Konfirmasi finalisasi.

Acceptance Criteria:

- Tidak menerima jumlah negatif.
- Total paket sesuai penjumlahan kategori.
- File yang melanggar validasi ditolak dengan pesan jelas.
- Foto dan signature dapat diperiksa sebelum finalisasi.
- Finalisasi hanya dilakukan melalui konfirmasi user.
- Task menjadi `PICKED_UP` hanya setelah finalisasi berhasil.
- Finalisasi tidak menghasilkan POP ganda akibat retry.
- Jika response gagal atau timeout, aplikasi memeriksa status server sebelum menawarkan pengiriman ulang.
- Bukti final tidak dapat dimodifikasi oleh staff yang tidak memiliki permission koreksi.
- Finalisasi POP tidak otomatis dianggap sebagai keberhasilan pengiriman receipt.

### MOB-07 — History & Receipt Status

Requirements:

- Menampilkan riwayat task.
- Menampilkan hasil kunjungan.
- Menampilkan POP final.
- Menampilkan foto/signature sesuai authorization.
- Menampilkan status receipt yang sebenarnya jika tersedia.

Acceptance Criteria:

- Bukti privat tidak dapat dibaca tanpa authorization.
- Riwayat mencerminkan data server.
- Jika receipt belum dikonfigurasi, UI tidak menampilkan status terkirim.
- Jika status receipt tidak diketahui, UI menyatakan kondisi tersebut secara jelas.
- Riwayat koreksi dapat ditampilkan tanpa memberi staff hak melakukan koreksi.

### MOB-08 — Handover Pickup Staff

**Objective:** Memungkinkan Pickup Staff menyerahkan paket melalui workflow existing.

Requirements:

- Melihat kandidat task untuk handover.
- Membuat Handover Session.
- Melihat detail session.
- Mengubah daftar anggota/task saat session masih `DRAFT`, sesuai authorization.
- Melihat status handover.
- Melihat hasil verifikasi dan discrepancy jika diizinkan.
- Melihat riwayat session.
- Pickup Staff aktif dapat memverifikasi jumlah tiga kategori pada item PENDING dan menutup session melalui Actions existing, sesuai persetujuan owner: “Ya, tambahkan verifikasi dan penutupan seperti web”.

Verifikasi dan penutupan memakai authorization, expected_version, validasi jumlah/catatan selisih, dan audit web existing. Perubahan anggota hanya saat DRAFT; penutupan memerlukan semua item diperiksa dan tidak memerlukan review POP. Koreksi/reopen tetap tidak tersedia di mobile. Penutupan tidak menyelesaikan discrepancy secara otomatis. Persetujuan ini memperluas allowlist OD-09; tidak mengubah permission web global.

Acceptance Criteria:

- Task yang tidak eligible tidak dapat ditambahkan.
- Session dapat berisi task lintas petugas sesuai aturan existing.
- Perubahan anggota saat DRAFT mengikuti perilaku penggantian seluruh daftar task pada endpoint existing.
- Session di luar DRAFT tidak dapat diubah melalui operasi DRAFT.
- Konflik versi session ditangani tanpa menimpa perubahan pihak lain.
- Staff dapat melihat status penerimaan sesuai permission.
- Session CLOSED tidak otomatis berarti discrepancy selesai.

### MOB-09 — Offline Draft & Recovery

**Objective:** Mencegah kehilangan input saat koneksi buruk atau aplikasi terinterupsi.

Keputusan produk:

**Offline draft lokal diperbolehkan. Seluruh mutation bisnis tetap memerlukan koneksi online.**

Requirements:

- Draft POP yang belum final dapat disimpan secara lokal.
- Draft dapat dipulihkan setelah aplikasi ditutup atau dibuka kembali.
- Input jumlah paket, catatan, dan referensi bukti lokal dipertahankan selama masih valid.
- Draft terkait dengan akun dan task yang benar.
- Status draft ditampilkan dengan jelas.
- Aplikasi membedakan draft lokal dari data yang sudah tersimpan di server.
- Ketika online kembali, user harus mengonfirmasi pengiriman.
- Sebelum mengirim, aplikasi memeriksa state dan ownership task terbaru.
- Draft yang tidak lagi eligible tidak boleh dipaksa dikirim.
- User dapat membuang draft dengan konfirmasi.

Acceptance Criteria:

- Draft tetap tersedia setelah aplikasi restart normal.
- Foto dan signature yang diperlukan tetap dapat dipulihkan jika penyimpanan lokal berhasil.
- Draft tidak otomatis dikirim ketika koneksi kembali.
- Draft tidak dianggap sebagai POP final.
- Draft akun A tidak dapat dibuka oleh akun B.
- Task yang sudah final atau kehilangan ownership tidak dapat difinalisasi ulang dari draft lama.
- Tidak ada transaksi takeover, start visit, atau finalisasi yang diklaim berhasil secara offline.

**Catatan:** Penyimpanan draft tidak menjamin data bertahan setelah uninstall aplikasi, penghapusan data aplikasi, atau kerusakan perangkat.

### MOB-10 — Operational Feedback

Requirements:

- Loading state.
- Empty state.
- Form validation.
- Success feedback.
- Error feedback.
- Confirmation dialog.
- Conflict handling.
- Indikator koneksi.
- Perlindungan double submission.

Acceptance Criteria:

- User mengetahui apakah data masih draft, sedang dikirim, berhasil, gagal, atau status server belum dapat dipastikan.
- Tombol submit tidak dapat ditekan berulang saat request berlangsung.
- Error validation ditampilkan pada field terkait.
- Konflik authorization/ownership tidak disamarkan sebagai error jaringan biasa.
- Tidak ada success message sebelum keberhasilan dikonfirmasi.
- Setelah timeout mutation, aplikasi tidak langsung mengulang request yang berpotensi membuat transaksi ganda.

---

## 6. UX Requirements

### 6.1 Mobile-First

Aplikasi dirancang untuk smartphone Android dengan penggunaan satu tangan sejauh memungkinkan.

Prinsip:

- Navigasi sederhana.
- Informasi tugas mudah dipindai.
- Tombol utama mudah dijangkau.
- Form tidak terlalu panjang.
- Pickup Execution menggunakan wizard.
- Status pekerjaan jelas.
- Tidak memerlukan tabel desktop untuk workflow utama.
- Foto dan signature mudah diambil serta diperiksa.

### 6.2 Proposed Navigation

Navigasi utama:

1. Tugas Saya.
2. Tugas Tersedia.
3. Handover.
4. Riwayat.
5. Akun.

Navigasi ini adalah usulan struktur produk dan dapat disempurnakan pada tahap UI design tanpa mengubah scope fitur.

### 6.3 Screen Inventory

Minimum screens:

- Login.
- Tugas Saya.
- Tugas Tersedia.
- Detail Pickup.
- Konfirmasi Takeover.
- Pickup Execution Wizard.
- Review POP.
- Detail POP.
- Handover List.
- Create/Edit Handover DRAFT.
- Handover Detail.
- Riwayat Pickup.
- Akun.

---

## 7. Failure & Recovery Scenarios

| Scenario                             | Expected Behavior                                       |
| ------------------------------------ | ------------------------------------------------------- |
| Internet terputus saat mengisi POP   | Draft lokal tetap tersedia                              |
| Internet terputus sebelum submit     | Tidak ada mutation; user dapat mencoba setelah online   |
| Timeout setelah finalisasi dikirim   | Periksa state server sebelum retry                      |
| Aplikasi ditutup saat mengambil foto | Pulihkan draft dan hasil kamera bila berhasil tersimpan |
| Token/sesi kedaluwarsa               | Minta login ulang tanpa mengklaim transaksi berhasil    |
| Task diambil alih petugas lain       | Blokir mutation dan tampilkan state terbaru             |
| Task berubah versi                   | Refresh detail dan tampilkan konflik                    |
| File terlalu besar                   | Tolak file dengan pesan validasi                        |
| Session handover berubah             | Jangan menimpa perubahan pihak lain                     |
| Receipt belum dikonfigurasi          | Tampilkan status sebenarnya, bukan "Terkirim"           |
| Storage perangkat tidak cukup        | Informasikan kegagalan penyimpanan draft/bukti          |

---

## 8. Security & Privacy Requirements

1. Komunikasi dengan backend operasional menggunakan HTTPS.
2. Kredensial mobile harus disimpan dengan perlindungan yang sesuai.
3. File bukti tetap privat dan membutuhkan authorization.
4. Foto, signature, kontak, dan alamat tidak boleh terekspos melalui log publik.
5. Data lokal antar-akun harus terisolasi.
6. Logout harus mencabut akses sesi/perangkat sesuai mekanisme backend.
7. Akun nonaktif harus kehilangan akses ke operasi yang dilindungi.
8. Draft sensitif harus dapat dibersihkan saat logout atau pergantian akun.
9. Hak akses mobile tidak boleh lebih luas dari hak akses existing.
10. APK internal tidak dianggap aman hanya karena tidak dipublikasikan di Play Store.

---

## 9. Non-Functional Requirements

### 9.1 Reliability

- Tidak membuat mutation ganda akibat interaksi user berulang.
- Menangani jaringan tidak stabil.
- Memulihkan draft sesuai batasan yang ditentukan.
- Menampilkan state server yang authoritative.

### 9.2 Performance

- Daftar task mendukung pagination.
- Upload bukti tidak membekukan seluruh antarmuka.
- Indikator loading ditampilkan pada operasi yang membutuhkan waktu.
- Foto diperiksa terhadap batas ukuran sebelum upload.

Target numerik response time belum ditetapkan karena belum tersedia baseline perangkat dan jaringan.

### 9.3 Compatibility

- Android-first.
- APK untuk distribusi internal.
- Dukungan kamera dan input sentuh.
- Orientasi portrait sebagai penggunaan utama.

Versi Android minimum dan daftar perangkat target akan ditentukan sebelum UAT.

### 9.4 Maintainability

- Business rules tetap berasal dari backend existing.
- Tidak ada implementasi domain logic terpisah yang berpotensi menghasilkan keputusan berbeda antara web dan mobile.
- Perubahan UI mobile tidak boleh merusak workflow web.

---

## 10. Product Delivery Milestones

### Mobile M1 — Access & Task Workspace

Deliverables:

- Login/logout.
- Akun.
- Tugas Saya.
- Tugas Tersedia.
- Detail task.
- Search, filter, dan pagination.

Gate:

- Authentication dan authorization lulus pengujian.
- Daftar dan detail sesuai backend.
- APK development dapat digunakan untuk login dan membaca task.

### Mobile M2 — Takeover & Execution

Deliverables:

- Takeover.
- Mulai kunjungan.
- Hasil kunjungan.
- Retry/cancel sesuai hak akses.

Gate:

- Concurrent takeover aman.
- Ownership dipatuhi.
- State transition sesuai backend.
- Tidak ada duplicate mutation.

### Mobile M3 — POP Wizard

Deliverables:

- Input kategori paket.
- Kamera/galeri.
- Signature.
- Draft lokal.
- Review dan finalisasi.
- Detail POP final.

Gate:

- Draft dapat dipulihkan.
- File validation berhasil.
- Finalisasi tidak ganda.
- Task `PICKED_UP` hanya setelah POP final.

### Mobile M4 — Handover & History

Deliverables:

- Kandidat handover.
- Create session.
- Amend anggota saat DRAFT.
- Detail/status session.
- Riwayat pickup dan handover.

Gate:

- Session mengikuti lifecycle existing.
- Perubahan anggota aman terhadap konflik.
- Tidak ada tindakan verifikasi Retail yang diberikan ke Pickup Staff tanpa authorization.

### Mobile M5 — Android UAT & Internal Pilot

Deliverables:

- APK internal.
- Pengujian perangkat nyata.
- UAT operasional.
- Perbaikan bug kritis.
- Panduan penggunaan singkat.

Gate:

- Seluruh critical workflow lulus.
- Tidak ada bug kritis keamanan atau integritas data yang terbuka.
- Recovery dari gangguan koneksi telah diuji.
- Tidak ada regresi pada workflow web.

---

## 11. End-to-End Acceptance Scenarios

Minimum UAT:

**UAT-01 — Login dan Task**

Staff login, membuka Tugas Saya, memilih task, dan melihat informasi yang sesuai backend.

**UAT-02 — Takeover Berhasil**

Staff mengambil task eligible dan memperoleh ownership.

**UAT-03 — Takeover Conflict**

Dua staff mencoba mengambil task yang sama. Hanya satu berhasil.

**UAT-04 — Successful Pickup**

Staff memulai kunjungan, mencatat `COLLECTED`, mengisi POP, mengambil bukti, dan finalisasi. Task menjadi `PICKED_UP`.

**UAT-05 — No Packages**

Staff mencatat `NO_PACKAGES` beserta alasan. Task menjadi Selesai Tanpa Paket, hilang dari daftar aktif dan tampil di Riwayat. Kunjungan berikutnya dibuat sebagai task baru terkait task asal; pengiriman ulang hasil yang sama tidak menggandakan visit/audit. Uji juga pickup manual untuk customer existing/self assignment, penolakan duplikasi manual/regular, serta timeout/restart dengan submission key yang sama.

**UAT-06 — App Restart**

Staff mengisi sebagian POP, menutup aplikasi, lalu membuka kembali. Draft yang tersimpan dapat dipulihkan.

**UAT-07 — Network Timeout**

Request finalisasi mengalami timeout. Aplikasi memeriksa server sebelum mengizinkan retry.

**UAT-08 — Ownership Lost**

Staff kehilangan ownership sebelum submit. Mutation ditolak tanpa membuat POP tidak sah.

**UAT-09 — Handover**

Staff membuat session dengan task eligible, mengubah anggota saat DRAFT, dan melihat status penerimaan.

**UAT-10 — Unauthorized Access**

Staff mencoba mengakses task atau bukti yang tidak diizinkan. Backend menolak akses.

**UAT-11 — Receipt Status**

POP berhasil difinalisasi, tetapi provider receipt belum aktif. Aplikasi tidak menampilkan receipt sebagai terkirim.

**UAT-12 — Web/Mobile Consistency**

Perubahan dari Android terlihat dengan benar di web, dan perubahan dari web tercermin pada Android setelah refresh.

---

## 12. Release Criteria

Mobile V1 boleh memasuki pilot internal apabila:

- Seluruh fitur in-scope yang disepakati telah tersedia.
- UAT critical workflow lulus.
- Pengujian Android nyata selesai.
- Authentication dan private evidence access telah diverifikasi.
- Tidak ada critical/high severity defect terbuka yang mengancam keamanan atau integritas transaksi.
- Draft recovery dan timeout handling telah diuji.
- Backend web tidak mengalami regression.
- APK memiliki identitas versi dan mekanisme distribusi internal yang jelas.
- Terdapat prosedur pelaporan masalah dan rollback versi aplikasi.

Mobile V1 tidak harus menunggu integrasi WhatsApp receipt atau otomatisasi M5 selesai, selama keterbatasan tersebut ditampilkan secara benar dan tidak menghalangi workflow mobile.

---

## 13. Open Decisions

Keputusan berikut belum ditetapkan dalam audit dan perlu diselesaikan sebelum tahap implementasi terkait atau pilot:

| ID    | Decision                                             | Dibutuhkan sebelum          |
| ----- | ---------------------------------------------------- | --------------------------- |
| OD-01 | Versi minimum Android dan perangkat target           | UAT perangkat               |
| OD-02 | Masa berlaku sesi/token mobile                       | Implementasi authentication |
| OD-03 | Prosedur perangkat hilang dan pencabutan akses       | Pilot internal              |
| OD-04 | Masa retensi dan penghapusan draft lokal             | Implementasi offline draft  |
| OD-05 | Perilaku draft ketika user logout atau berganti akun | Implementasi offline draft  |
| OD-06 | Mekanisme distribusi dan pembaruan APK internal      | Pilot internal              |
| OD-07 | Baseline performa pada perangkat dan jaringan target | Performance gate            |

Open decisions ini tidak menghalangi penyusunan PRD, tetapi harus ditutup pada gate yang relevan.

---

## 14. Final Scope Statement

Retail Pickup Mobile V1 merupakan aplikasi Android internal untuk Pickup Staff yang menggunakan business logic Retail Pickup Management existing.

Aplikasi menyediakan task management, takeover, pickup execution, Proof of Pickup, handover dari sisi Pickup Staff, riwayat, dan penyimpanan draft lokal.

Seluruh transaksi bisnis memerlukan koneksi online dan tetap divalidasi oleh backend Laravel.

Mobile V1 tidak menduplikasi business logic. Pickup Staff memperoleh akses mobile ke verifikasi dan penutupan Handover yang sudah diizinkan backend web, berdasarkan persetujuan eksplisit owner pada MOB-08.

**Status dokumen: Baseline implementasi serta perubahan scope tercantum telah disetujui owner. UAT/pilot dan release produksi belum disetujui.**
