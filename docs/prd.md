# Retail Pickup Management V1.1

Versi: 1.1 — revisi untuk review dan konfirmasi bisnis  
Tanggal: 12 Oktober 2026  
Konteks: operasional pickup retail JNE  
Sumber utama: Product Requirements Document — Retail Pickup Management V1.0 sebelum revisi.  
Deliverable: review, log revisi, PRD lengkap, dan asesmen kesiapan M1; tanpa kode aplikasi.

Dokumen ini merupakan PRD tunggal versi 1.1 yang menggantikan V1.0. Pengulangan judul dan teks teknis percakapan di awal sumber dihapus dari penyajian V1.1 karena bukan requirement.

| Label     | Definisi dan penggunaan                                                                                           |
| --------- | ----------------------------------------------------------------------------------------------------------------- |
| CONFIRMED | Kebutuhan bisnis yang secara eksplisit ditetapkan dalam sumber atau baseline revisi.                              |
| PROPOSED  | Rekomendasi yang belum disetujui. Tidak menjadi kebijakan operasional hanya karena dicantumkan dalam dokumen ini. |
| OPEN      | Keputusan operasional yang masih membutuhkan konfirmasi bisnis.                                                   |

Acceptance criteria, rancangan data, dan milestone yang merujuk PROPOSED berlaku **setelah rekomendasi terkait disetujui**. Menuliskan pengujian tidak mengubah label keputusan. Persetujuan dicatat dengan owner, tanggal, pilihan, dan ID terdampak.

# Deliverable A — PRD Review Summary

| Finding                                                | Existing Behavior                                                                                                                  | Recommended Revision                                                                                                                        | Impact                                            | Priority |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | -------- |
| Klasifikasi handover tidak konsisten                   | FR-HO-001/002/004/008 dan BR-013 menetapkan creator, satu petugas, satu sesi, dan penyerahan penuh; sebagian muncul sebagai usulan | Pertahankan pengelompokan dan pemeriksaan per task; turunkan pembatasan ke PROPOSED dan keputusan ke OPEN                                   | M4, relasi task–item, AC-007/008                  | P1       |
| Empat foto dianggap kebijakan permanen                 | FR-PP-003, BR-006, AC-006 menolak foto kelima sebagai aturan bisnis                                                                | Pertahankan dukungan empat foto existing; usulkan batas UI sementara yang sama; batas permanen OPEN                                         | M3, validasi lampiran                             | P1       |
| Kunjungan gagal tidak mempunyai hasil yang jelas       | OQ-05 mencampur cancel, reschedule, dan pickup gagal                                                                               | Bedakan sukses, attempt tanpa paket, dan cancel sebelum eksekusi; evaluasi outcome versus status terminal                                   | M2–M3; tidak menghambat M1 dasar                  | P1       |
| Immutability berpotensi menutup koreksi sah            | FR-PP-008/FR-RV-008 melarang edit biasa; mekanisme koreksi belum jelas                                                             | Original tetap; usulkan revisi tertaut dengan actor, waktu, alasan, dan perubahan; otoritas tetap OPEN                                      | M3–M4, history dan audit                          | P1       |
| Penutupan dapat dianggap penyelesaian selisih          | CLOSED dapat mengandung discrepancy, tetapi tindak lanjut belum ditetapkan                                                         | Tegaskan CLOSED berarti pemeriksaan selesai; tidak menyatakan selisih resolved                                                              | M4/M6, BR-011/012                                 | P1       |
| Identitas customer bercampur alamat operasional        | Data customer menyebut alamat pickup tanpa membedakan master dan task                                                              | Identitas master, alamat/kontak task, snapshot historis; multi-address bukan dependency bawaan                                              | M1, FR-CU-003                                     | P1       |
| Milestone handover tidak menghasilkan kemampuan usable | M3 berhenti saat mulai verifikasi; M4 baru memberi hasil                                                                           | Gabungkan session dan verifikasi dalam M4; pisahkan M2 outcome dan M3 bukti sebagai batas analisis dalam satu iterasi bila efisien          | Pengiriman solo developer lebih kecil dan berguna | P1       |
| Terlalu banyak keputusan menjadi dependency awal       | Cancel dan kegagalan masuk M1; M5 bergantung M1–M4                                                                                 | M1 hanya customer, create, assign, list/detail; M5 hanya butuh task dan aturan schedule                                                     | Pengembangan awal dapat dimulai                   | P1       |
| Rekomendasi teknis diberi label bisnis                 | Semua NFR PROPOSED termasuk stack yang sudah ditetapkan; beberapa pembatasan UI disebut CONFIRMED                                  | Pisahkan baseline stack/security dari teknik implementasi dan target yang belum diketahui                                                   | Kejelasan kontrak dan biaya implementasi          | P2       |
| Akses berpotensi berkembang terlalu luas               | Scope outlet/multi-role belum diputuskan                                                                                           | Matriks operasi sederhana; enforcement backend tetap wajib; hindari permission builder dan hierarki enterprise                              | M1 dan kesiapan production                        | P1       |
| Pengambilalihan task oleh petugas                      | Petugas hanya melihat tugas sendiri; reassign berpusat pada CS                                                                     | CONFIRMED melalui klarifikasi: petugas boleh langsung mengambil alih task petugas lain tanpa persetujuan CS; batas eligibility tetap OPEN   | M1, assignment, workspace dan audit               | P1       |
| Receipt untuk customer                                 | Belum tercakup sebagai kebutuhan                                                                                                   | CONFIRMED melalui klarifikasi: setelah pickup berhasil, customer menerima receipt jumlah paket dan bukti pickup melalui WhatsApp atau email | M3, kontak customer dan status pengiriman         | P1       |
| Migrasi/NFR menjadi beban desain dini                  | 23 OQ bercampur tanpa gate yang terarah                                                                                            | Kelompok A–E, tambah keputusan handover yang sebelumnya tersembunyi; bedakan gate milestone dan gate production                             | Tidak semua OQ perlu dijawab sebelum M1           | P1       |

P1: memengaruhi kebenaran workflow/integritas atau gate pengembangan. P2: penyederhanaan dan kejelasan implementasi.

# Deliverable B — Revision Decision Log

Log berikut mencatat **perubahan dokumen**, bukan persetujuan rekomendasi produk.

| Kelompok                                  | ID / area                                                  | Revisi dan alasan                                                                                                                                                   | AC / BR terkait                        | Milestone          |
| ----------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------ |
| Dipertahankan                             | FR-CU-001; FR-SC-001–005; FR-PU-001–004/007; FR-WS-001–004 | Master customer, dua jenis pickup, assignment, status existing, workspace dan history tetap                                                                         | AC-001/002/016/020; BR-001/014         | M1–M6 sesuai fitur |
| Dipertahankan                             | FR-PP-001/002/004–006                                      | Kategori, total, bukti, signature, dan finalisasi pickup sukses tetap                                                                                               | AC-003–005/015/018; BR-002–005/007/008 | M3                 |
| Dipertahankan                             | FR-HO-003/005/006; FR-RV-001–007; FR-MO-001–003            | Rincian task/customer, status sesi, verifikasi kategori, catatan selisih dan close tetap                                                                            | AC-007/009–015/020; BR-009–012         | M4/M6              |
| Diperjelas                                | FR-PP-003, BR-006                                          | Notes dan kemampuan foto tetap CONFIRMED; empat foto adalah fakta interface ERP. Batas V1 sementara PROPOSED, batas permanen OPEN                                   | AC-006 bersyarat; OQ-08                | M3                 |
| Diperjelas                                | FR-PP-004, BR-005                                          | Signature bagian alur normal CONFIRMED; kewajiban tanpa pengecualian tidak dikonfirmasi                                                                             | AC-005/023; OQ-07/09                   | M3                 |
| Diperjelas                                | FR-CU-003; NFR-001/002                                     | Snapshot tetap usulan; stack/modular monolith/REST yang ditetapkan diberi label CONFIRMED, detail teknis terpisah                                                   | AC-019; OQ-03                          | M1/M6              |
| Diturunkan                                | FR-HO-001: CONFIRMED → PROPOSED                            | Sistem harus menyediakan sesi; Retail sebagai satu-satunya creator belum disetujui                                                                                  | AC-007; OQ-11                          | M4                 |
| Diturunkan sebagian                       | FR-HO-002                                                  | Banyak task/customer CONFIRMED; satu petugas saja PROPOSED                                                                                                          | AC-007; OQ-26                          | M4                 |
| Diturunkan                                | FR-HO-004: CONFIRMED → PROPOSED                            | Eksklusivitas task lintas sesi bergantung keputusan partial handover; double submit teknis tetap dicegah                                                            | AC-008; OQ-25                          | M4                 |
| Diturunkan                                | FR-HO-008, BR-013: CONFIRMED → PROPOSED                    | Penyerahan penuh dan pengecualian partial handover belum sah sebagai baseline bisnis                                                                                | AC-008/024; OQ-24/25                   | M4                 |
| Diperjelas                                | FR-HO-007, P-04                                            | Lock membership tetap PROPOSED, bukan batasan bisnis otomatis                                                                                                       | AC-024; OQ-27                          | M4                 |
| Tetap usulan / pertanyaan                 | FR-PP-008, FR-RV-008, BR-015/016                           | Immutability biasa PROPOSED; koreksi dan reopen OPEN. Melindungi original berbeda dari melarang seluruh koreksi                                                     | AC-015/022; OQ-10/13                   | M3/M4              |
| Baru diusulkan                            | FR-PU-008/009; FR-PP-009; FR-RV-009                        | Outcome attempt terpisah, cancel sebelum eksekusi, koreksi tertaut tanpa approval bertingkat                                                                        | AC-021–023; BR-019–021                 | M2–M4              |
| Diperjelas / baru                         | BR-019/020 CONFIRMED; BR-021 PROPOSED                      | Pisahkan bukti dari kunjungan tanpa paket; koreksi sah wajib mempertahankan original dan konteks perubahan; metode revisi minimal masih usulan                      | AC-021/022                             | M2–M4              |
| Pertanyaan bisnis tambahan                | OQ-24–28                                                   | Partial, keikutsertaan sesi, satu petugas, lock, dan alamat saat eksekusi sebelumnya tersembunyi dalam asumsi                                                       | AC-019/024; BR-013                     | M1–M4              |
| Dikonfirmasi melalui klarifikasi lanjutan | FR-PU-010, FR-WS-006, BR-022                               | Petugas boleh langsung mengambil alih task petugas lain tanpa approval CS. Batas status/waktu/scope belum diputuskan; hak recording mengikuti assignment terbaru    | AC-016/025; OQ-29                      | M1                 |
| Dikonfirmasi melalui klarifikasi lanjutan | FR-NT-001/002, BR-023                                      | Receipt customer dikirim setelah pickup berhasil, berisi jumlah paket dan bukti pickup, melalui WhatsApp atau email. Bukan konfirmasi saat task dibuat/diambil alih | AC-026; OQ-30                          | M3                 |
| Baru diusulkan untuk klarifikasi lanjutan | FR-NT-003–005, BR-024                                      | Pengiriman terlacak, retry aman, data receipt sesuai versi pickup; kegagalan kirim tidak menghapus pickup sukses; distribusi revisi mengikuti policy                | AC-027; OQ-30/31                       | M3                 |
| Diubah urutannya                          | M1–M6                                                      | Scope kecil; handover/verifikasi bersama; schedule tidak menunggu dashboard; milestone tidak menjadikan asumsi sebagai policy                                       | Bagian 18–19                           | Semua              |

Rekomendasi lama FR-CU-002/004, FR-SC-006, FR-PU-005/006, FR-WS-005, FR-PP-007/008, FR-RV-008, FR-MO-004–006 tetap PROPOSED. Semua 23 ID OQ lama dipertahankan; isinya diperjelas dan dipindahkan ke gate yang relevan. Tidak ada keputusan OPEN yang dinyatakan otomatis disetujui.

Keputusan bisnis yang perlu konfirmasi mencakup field/access M1; outcome attempt, total nol, foto/signature dan koreksi pickup M2–M3; ownership/membership/partial serta koreksi retail M4; aturan recurring M5; dan migrasi, retention, perangkat, keamanan serta cutover sebelum production. Rincian ada di bagian 19.

# Deliverable C — Product Requirements Document V1.1

## 1. Executive Summary

CONFIRMED. Retail Pickup Management adalah aplikasi standalone untuk operasional pickup dari pembuatan atau penjadwalan task oleh CS, assignment petugas, kunjungan dan pengambilan paket, Proof of Pickup, pengembalian ke retail, pengelompokan Handover Session, hingga pemeriksaan fisik dan penutupan sesi.

Regular / Scheduled Pickup dan On-Demand Pickup menggunakan workflow eksekusi dan handover yang sama. Petugas dapat mengumpulkan paket dari beberapa customer sebelum kembali ke retail. Retail memeriksa setiap task/customer dan kategori secara independen. Jumlah pickup dan retail disimpan terpisah. Selisih kategori menghasilkan DISCREPANCY dengan catatan wajib; CLOSED tidak berarti selisih resolved.

Kategori tetap persis: **Manual Hybrid (Non-Cashless)**, **Cashless Hybrid**, **CSS / Orion**. Total otomatis merupakan penjumlahan ketiganya.

CONFIRMED. Proof of Pickup mencakup informasi customer, petugas, waktu pickup, jumlah kategori, notes, foto dan signature customer/pengirim. Form Generate Pickup ERP mendukung sampai empat foto. PROPOSED: pertahankan batas interface empat foto untuk kompatibilitas awal. OPEN: batas bisnis permanen, minimum foto, dan pengecualian signature.

CONFIRMED. Stack: Laravel, REST API, relational database, React, shadcn/ui; modular monolith, mobile-responsive, authentication dan authorization operasional sederhana; implementasi incremental. Tidak diperlukan ERP baru, microservices, ataupun infrastruktur tambahan tanpa kebutuhan nyata.

CONFIRMED melalui klarifikasi lanjutan: petugas boleh langsung mengambil alih task petugas lain tanpa persetujuan CS. Setelah pickup berhasil, customer menerima receipt jumlah paket dan bukti pickup melalui WhatsApp atau email. Batas pengambilalihan dan rincian pengiriman tetap OPEN; kedua fitur tidak mengganti workflow pickup dan verifikasi retail.

PROPOSED. Pengiriman bertahap dimulai dengan customer dan task on-demand. Milestone awal dapat dipakai untuk validasi internal, tetapi belum menyelesaikan seluruh workflow atau siap cutover production.

## 2. Problem Statement

CONFIRMED. Pickup berada di ERP; bisnis membutuhkan aplikasi terpisah yang fokus pada operasional pickup dan menjadi pemilik data pickup baru setelah cutover.

| Kebutuhan                                 | Implikasi                                                               |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| CS mengatur dua jenis pickup              | Satu workflow eksekusi, bukan dua sistem pencatatan                     |
| Petugas mengunjungi beberapa customer     | Pengelompokan handover dengan identitas setiap task tetap jelas         |
| Retail menghitung fisik per kategori      | Dua set jumlah: pickup dan retail                                       |
| Bukti harus dapat dipercaya               | Original tidak ditimpa diam-diam; koreksi sah dapat ditelusuri          |
| Kunjungan tidak selalu menghasilkan paket | Hasil attempt dibedakan dari sukses dan cancel sebelum berangkat        |
| Pengembangan oleh satu developer          | Kemampuan bisnis kecil, dependency terbatas, keputusan sesuai milestone |

OPEN. Volume, tingkat discrepancy, performa ERP, dan durasi kerja belum terukur. Tidak ditetapkan klaim peningkatan numerik tanpa baseline.

## 3. Product Goals

### 3.1 Tujuan produk

CONFIRMED: CS membuat/menjadwalkan dan assign task; petugas melihat tugas dan merekam bukti melalui mobile; beberapa pickup dikelompokkan; retail memeriksa setiap kategori; discrepancy terdokumentasi tanpa mengganti bukti asli; supervisor menelusuri aktivitas dan hasil.

PROPOSED: hasil kunjungan tanpa paket tercatat secara terpisah, tanpa memaksa bukti pickup sukses. Otoritas dan tindakan lanjutnya OPEN.

### 3.2 Indikator keberhasilan

| Indikator — PROPOSED        | Definisi                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| Kelengkapan Proof of Pickup | Proporsi pickup sukses yang memenuhi aturan bukti yang telah disetujui                              |
| Pickup menunggu pemeriksaan | Task PICKED_UP yang belum mempunyai pemeriksaan retail lengkap sesuai model handover yang disetujui |
| Waktu tunggu verifikasi     | Waktu verifikasi dikurangi waktu pickup; granularity mengikuti task/penyerahan yang disetujui       |
| Tingkat discrepancy         | Item hasil pemeriksaan DISCREPANCY / seluruh item yang diperiksa pada basis tanggal yang sama       |
| Ketertelusuran              | Task, bukti, sesi, verifikasi, actor dan waktu dapat dihubungkan                                    |
| Integritas                  | Tidak ada duplikasi teknis submission/occurrence; tidak ada perubahan bukti tanpa jejak             |

OPEN OQ-23: target dan basis tanggal laporan. Indikator tidak mengharuskan dashboard sebelum transaksi inti berfungsi; tidak menyamakan task dengan item bila partial kemudian disetujui.

## 4. Scope and Non-Goals

### 4.1 Scope V1

CONFIRMED: customer dasar, akun dan akses operasional sederhana, on-demand, recurring schedule dan generation tanpa duplikasi, assignment, workspace petugas, Proof of Pickup, grouping handover, verifikasi per task/customer/kategori, catatan discrepancy, history/monitoring, web dan mobile-responsive.

CONFIRMED tambahan: direct task takeover oleh petugas serta receipt jumlah paket/bukti kepada customer setelah pickup berhasil melalui WhatsApp atau email. Receipt tidak mencakup hasil retail yang belum terjadi.

PROPOSED: batas empat foto existing dipertahankan pada interface awal; satu konteks operasional tanpa hierarki organisasi; koreksi minimal tertaut bila disetujui; hasil attempt terpisah. OPEN: partial handover, scope outlet, dan otoritas operasi khusus. Belum diputuskan bukan berarti dikeluarkan secara permanen.

### 4.2 Non-goals V1

CONFIRMED: tidak ada AWB scanning, package-level shipment tracking, integrasi tracking JNE, live GPS, route optimization, fleet/warehouse/inventory, finance/settlement, approval kompleks, advanced CRM, AI automation, atau hierarki enterprise multi-company.

PROPOSED: tidak membangun modul dispute/resolution lengkap, offline synchronization, permission builder, multi-address management khusus, dan integrasi ERP otomatis. Pengelolaan selisih di luar aplikasi memerlukan konfirmasi owner operasional. Partial handover adalah OPEN OQ-24, **bukan non-goal yang sudah dikonfirmasi**.

## 5. Stakeholders and User Roles

### 5.1 Stakeholder

Pemilik bisnis/pimpinan operasional mengonfirmasi kebijakan; CS mengatur customer, permintaan dan assignment; petugas menjalankan pickup; retail memeriksa fisik; supervisor/admin mengawasi dan mengelola akses/master esensial; developer membangun dan menguji incremental. Penanggung jawab keputusan bukan otomatis approver setiap transaksi.

### 5.2 Capability dan akses minimum

**CONFIRMED — pembaruan izin oleh pengguna:** Admin/Supervisor dapat menjalankan seluruh kemampuan yang tersedia, termasuk kemampuan CS dan staff. Pickup Staff dan Retail Staff tetap dua nilai role, tetapi permission operasionalnya sama. Pada M1 keduanya dapat menerima assignment, melihat task sendiri, menemukan kandidat dan langsung takeover task ASSIGNED yang belum mulai. Saat M4 tersedia, orang yang melakukan pickup boleh juga melakukan verifikasi retail; pencatatan jumlah retail tetap terpisah dari bukti pickup asli. Tidak ada permission builder atau multi-role. Akses tidak melewati validasi state, akun aktif, audit, atau perlindungan bukti. Pembaruan ini menggantikan pembatasan role pada tabel sebelumnya; fitur M4 tidak diimplementasikan di M1.

| Role             | Capability CONFIRMED                                                                      | Batas akses PROPOSED                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| CS               | Customer operasional, membuat/menjadwalkan task, assign, monitoring                       | Create/edit customer dan task sesuai scope; reassign/cancel hanya jika policy disetujui; tidak mengubah bukti final      |
| Pickup Staff     | Kemampuan pickup dan retail yang sama dengan Retail Staff, sesuai milestone yang tersedia | Task sendiri dan kandidat eligible pada M1; boleh memverifikasi pickup sendiri pada M4; bukti asli tetap terlindungi     |
| Retail Staff     | Kemampuan pickup dan retail yang sama dengan Pickup Staff, sesuai milestone yang tersedia | Task sendiri dan kandidat eligible pada M1; create session mengikuti OQ-11; bukti pickup dan pemeriksaan retail terpisah |
| Supervisor/Admin | Seluruh kemampuan operasional yang tersedia, customer dan manajemen akun                  | Tetap mengikuti validasi, lifecycle dan audit; hak akses tidak menciptakan fitur koreksi/reopen yang belum disepakati    |

CONFIRMED: backend melindungi data sensitif dan mencegah operasi tanpa wewenang. PROPOSED: role tetap dan pemeriksaan role/assignment/entity pada setiap operasi; tanpa builder, hierarki kompleks atau approval matrix. OPEN OQ-01/02: scope operasional, multi-role, dan owner pengelolaan customer/jadwal. Scope belum pasti tidak membenarkan akses seluruh outlet.

## 6. Current vs Proposed Business Process

| Area                  | Current yang diketahui                                              | Target V1 dan klasifikasi                                             |
| --------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Platform              | Pickup di ERP                                                       | CONFIRMED: aplikasi standalone                                        |
| Generate Pickup       | Tiga kategori, total, customer, notes, signature, sampai empat foto | CONFIRMED: kemampuan tersebut dipertahankan; batas permanen foto OPEN |
| Dua jenis task        | Detail existing belum tersedia                                      | CONFIRMED: regular dan on-demand berbagi workflow                     |
| Kunjungan tanpa paket | Tidak dijelaskan sumber                                             | OPEN: hasil dan tindak lanjut; usulan pencatatan attempt terpisah     |
| Pengembalian          | Detail existing belum tersedia                                      | CONFIRMED: Handover Session untuk beberapa task/customer              |
| Pemeriksaan retail    | Detail existing belum tersedia                                      | CONFIRMED: jumlah per kategori/task terpisah dari pickup              |
| Koreksi               | Policy existing belum diketahui                                     | CONFIRMED: original terjaga; mekanisme/otoritas OPEN                  |
| Kepemilikan data      | Modul dalam ERP                                                     | CONFIRMED: aplikasi baru owner pickup baru setelah cutover            |

Tidak diasumsikan kemampuan ERP lainnya. Tidak ditambahkan approval sebelum pickup atau close.

## 7. End-to-End Business Flow

### 7.1 Alur sukses — CONFIRMED

| Langkah | Actor                                                | Aktivitas / hasil                                                                                                       |
| ------: | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
|       1 | CS / sistem untuk jadwal                             | Buat atau hasilkan task regular/on-demand                                                                               |
|       2 | CS                                                   | Assign petugas                                                                                                          |
|      2a | Petugas, jika diperlukan                             | Ambil alih langsung task petugas lain tanpa approval CS; assignment berpindah sesuai eligibility yang disepakati        |
|       3 | Petugas                                              | Kunjungi customer sesuai alamat task                                                                                    |
|       4 | Petugas                                              | Ambil paket                                                                                                             |
|       5 | Petugas                                              | Catat jumlah per kategori, waktu, notes dan foto                                                                        |
|       6 | Customer/pengirim                                    | Berikan signature pickup                                                                                                |
|       7 | Petugas                                              | Finalisasi bukti sukses; task PICKED_UP                                                                                 |
|      7a | Sistem / actor pengiriman sesuai rancangan disetujui | Kirim receipt jumlah paket dan bukti pickup kepada customer melalui WhatsApp atau email; pemicu setelah pickup berhasil |
|       8 | Petugas                                              | Dapat melanjutkan pickup customer lain                                                                                  |
|       9 | Petugas                                              | Kembali ke retail dan siapkan daftar pickup                                                                             |
|      10 | Actor yang diotorisasi, OPEN OQ-11                   | Kelompokkan task ke Handover Session                                                                                    |
|      11 | Retail                                               | Hitung fisik setiap task/customer dan kategori                                                                          |
|      12 | Sistem / retail                                      | Bandingkan; VERIFIED atau DISCREPANCY, catatan wajib bila berbeda                                                       |
|      13 | Retail                                               | Close setelah seluruh item diperiksa dan selisih terdokumentasi                                                         |

Creator sesi, pembatasan satu petugas, membership dan penyerahan penuh bukan bagian CONFIRMED pada langkah 10.

### 7.2 Cabang operasional

| Kejadian                      | Pemisahan yang harus dijaga                                      | Keputusan                                |
| ----------------------------- | ---------------------------------------------------------------- | ---------------------------------------- |
| Paket berhasil dikumpulkan    | Proof of Pickup sukses; retail kemudian memeriksa                | Alur baseline CONFIRMED                  |
| Sudah berkunjung, tanpa paket | Attempt, bukan sukses dan bukan otomatis cancel sebelum eksekusi | OQ-05/06: outcome, retry, penutupan task |
| Dibatalkan sebelum eksekusi   | CANCELLED dengan konteks pembatalan; bukan bukti kunjungan       | OQ-04: actor, alasan, batas waktu        |

Kunjungan gagal tidak menghasilkan signature fiktif, PICKED_UP fiktif, atau kandidat handover tanpa paket. Bukti attempt bila dibutuhkan berbeda dari Proof of Pickup sukses. Reschedule/retry tidak otomatis menghapus attempt sebelumnya.

## 8. Functional Requirements

Label dalam setiap baris berlaku pada requirement tersebut. Data minimum dan validasi usulan di bawah tabel bukan keputusan bisnis tambahan yang otomatis CONFIRMED.

### 8.1 Customer Management

Tujuan: identitas customer yang dapat digunakan kembali dan tujuan pickup yang dapat dilaksanakan. Actor: CS, Supervisor/Admin sesuai akses. Alur: cari → pilih/buat customer → tentukan alamat/kontak untuk task.

| ID        | Label     | Requirement                                                                                                                 |
| --------- | --------- | --------------------------------------------------------------------------------------------------------------------------- |
| FR-CU-001 | CONFIRMED | Master customer tersedia untuk task dan regular schedule.                                                                   |
| FR-CU-002 | PROPOSED  | Create, edit, search dan deactivate customer; history tidak dihapus.                                                        |
| FR-CU-003 | PROPOSED  | Task menyimpan snapshot nama/identitas yang relevan, alamat pickup dan kontak agar perubahan master tidak mengubah history. |
| FR-CU-004 | PROPOSED  | Peringatan kemungkinan duplikat; nama sama tidak otomatis ditolak.                                                          |

Data minimum PROPOSED: ID internal, nama customer; alamat pickup yang bisa digunakan pada task; nama kontak, nomor WhatsApp dan/atau email jika tersedia; notes opsional. Kode referensi opsional. Master dapat memiliki alamat default sederhana; alamat task dapat berbeda jika disetujui. Tidak perlu entitas multi-address khusus untuk membuat task pertama. M1 dapat membuat draft customer/task tanpa kedua kanal sekaligus; M3 membutuhkan tujuan receipt yang dapat digunakan sesuai OQ-30 dan mencatat tujuan aktual pengiriman agar perubahan master tidak memindahkan riwayat receipt.

OPEN OQ-03/28: field wajib, kebutuhan beberapa alamat, hak perubahan alamat task, dan konfirmasi tujuan jika berubah setelah assignment. Validasi PROPOSED: nama/alamat task tidak kosong; customer aktif untuk task baru; deactivate tidak menghapus history. AC: customer dapat dicari/dipakai; perubahan master tidak merusak snapshot historis bila FR-CU-003 disetujui. Dependency: akses dasar M1; keputusan multi-address lanjutan tidak otomatis memblokir M1 dengan satu alamat per task.

### 8.2 Pickup Scheduling

Actor: CS/sistem. Alur: tentukan customer, hari, waktu → aktifkan → generate occurrence → assign. Data: customer, hari minggu, waktu dan active flag; timezone, tanggal efektif, default staff PROPOSED.

| ID        | Label     | Requirement                                                                     |
| --------- | --------- | ------------------------------------------------------------------------------- |
| FR-SC-001 | CONFIRMED | Jadwal recurring berdasarkan customer, hari dan waktu.                          |
| FR-SC-002 | CONFIRMED | Edit dan deactivate jadwal.                                                     |
| FR-SC-003 | CONFIRMED | Generate Pickup Task sesuai occurrence.                                         |
| FR-SC-004 | CONFIRMED | Cegah duplicate task generation.                                                |
| FR-SC-005 | CONFIRMED | Task hasil generation dapat di-assign.                                          |
| FR-SC-006 | PROPOSED  | Generation otomatis dan tindakan Generate CS menggunakan idempotency yang sama. |

PROPOSED: minimal satu hari, waktu valid, identitas occurrence stabil; perubahan schedule tidak menghapus generated task. AC: hanya occurrence sesuai jadwal; retry tidak menggandakan; inactive tidak generate; existing task tetap terlacak. Dependency minimum: customer/task M1 dan OQ-15–17; bukan handover atau dashboard. Scheduler Laravel dapat digunakan tanpa mewajibkan queue tambahan.

### 8.3 Pickup Task Management

Actor: CS, petugas untuk membaca, supervisor untuk monitoring. Data minimum: reference, jenis pickup, customer, alamat/kontak task, tanggal/waktu, assigned staff bila ada, status, notes, creator/timestamp; schedule reference/occurrence hanya untuk regular.

| ID        | Label     | Requirement                                                                                                                                            |
| --------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR-PU-001 | CONFIRMED | CS membuat on-demand dengan customer dan waktu pickup.                                                                                                 |
| FR-PU-002 | CONFIRMED | CS assign task kepada petugas.                                                                                                                         |
| FR-PU-003 | CONFIRMED | Task list, detail dan status tersedia.                                                                                                                 |
| FR-PU-004 | CONFIRMED | Status existing SCHEDULED, ASSIGNED, PICKED_UP dan CANCELLED dipertahankan.                                                                            |
| FR-PU-005 | PROPOSED  | CS mengubah detail/waktu dan reassign sebelum PICKED_UP sesuai batas eksekusi yang disetujui.                                                          |
| FR-PU-006 | PROPOSED  | CS cancel dengan alasan wajib sebelum eksekusi; kewenangan dan tindakan setelah attempt diputuskan terpisah.                                           |
| FR-PU-007 | CONFIRMED | Regular/on-demand menggunakan recording dan handover yang sama.                                                                                        |
| FR-PU-008 | PROPOSED  | Catat attempt tanpa paket terpisah: task, petugas, waktu, outcome/reason dan notes relevan.                                                            |
| FR-PU-009 | PROPOSED  | Bedakan pembatalan sebelum eksekusi dari attempt tanpa paket dalam detail/history dan tindakan lanjut.                                                 |
| FR-PU-010 | CONFIRMED | Petugas boleh langsung mengambil alih task petugas lain tanpa approval CS; assignment diperbarui. Batas status/waktu/scope pengambilalihan OPEN OQ-29. |

OPEN OQ-05: apakah diperlukan status tambahan; FR-PU-008/009 tidak otomatis memperkenalkan FAILED/UNSUCCESSFUL. PROPOSED: backend menolak customer/waktu tidak valid, assignment nonaktif dan recording pada CANCELLED. AC: create → assign → list/detail; perubahan assignment tercatat bila fitur itu disetujui; attempt tidak mengubah task menjadi sukses. Dependency M1 hanya customer, akun/access, waktu; cabang execution di M2.

### 8.4 Pickup Staff Workspace

Actor: petugas. Alur: daftar sendiri → detail alamat/kontak → outcome/recording → history → persiapan handover. Data/hubungan bukti dan hasil retail ditambahkan ketika milestone terkait tersedia.

| ID        | Label                                  | Requirement                                                                                                                                                                             |
| --------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-WS-001 | CONFIRMED                              | Petugas melihat assigned tasks miliknya.                                                                                                                                                |
| FR-WS-002 | CONFIRMED                              | Petugas membuka detail dan Pickup Recording.                                                                                                                                            |
| FR-WS-003 | CONFIRMED                              | History pickup miliknya tersedia.                                                                                                                                                       |
| FR-WS-004 | CONFIRMED                              | Petugas menyiapkan pickup untuk diserahkan ke retail.                                                                                                                                   |
| FR-WS-005 | PROPOSED                               | Filter tanggal/status dan urutan waktu terjadwal.                                                                                                                                       |
| FR-WS-006 | CONFIRMED kebutuhan; tampilan PROPOSED | Petugas dapat menemukan dan mengambil alih task petugas lain yang eligible dalam scope akses. PROPOSED: daftar Pickup Tersedia untuk Diambil Alih dengan informasi operasional minimum. |

Backend memeriksa akses/assignment; hak submit tidak bergantung pada tombol frontend. Akses task petugas lain untuk daftar/detail takeover yang diotorisasi berbeda dari hak recording. Sebelum takeover berhasil, petugas baru tidak boleh submit pickup task tersebut. AC: operasi lintas petugas tanpa hak ditolak; takeover eligible mengubah assignment; petugas lama tidak bisa submit sesudah perpindahan; hasil gagal tidak ditampilkan sukses; status pickup dan retail terpisah. M1 menyediakan daftar/detail/takeover, M2–M3 outcome/recording, M4 preparation.

PROPOSED: task ASSIGNED yang belum mulai dieksekusi dapat diambil alih oleh petugas aktif dalam scope yang sama; tampilkan konfirmasi, catat petugas lama/baru, actor, timestamp dan alasan, serta tampilkan assignment terbaru pada kedua workspace. Perpindahan dilakukan atomik: dua petugas yang mengambil task sama bersamaan tidak keduanya mendapat sukses; request stale ditolak dan diminta memuat ulang. Tidak perlu approval CS, antrian permohonan, status task baru, atau permission builder. OPEN OQ-29: eligibility termasuk task sudah attempted/sedang berjalan, batas data daftar, kewajiban alasan dan pemberitahuan kepada petugas lama. Tidak otomatis memberi hak mengubah bukti final atau assignment historis pickup sukses.

### 8.5 Proof of Pickup

Actor: petugas assigned; customer/pengirim memberikan signature. Alur sukses: quantity → notes/foto → signature → review → finalisasi. Data CONFIRMED: task, informasi customer, petugas, pickup timestamp, tiga kategori, total otomatis, special notes, photo evidence dan signature.

| ID        | Label                             | Requirement                                                                                                                                    |
| --------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-PP-001 | CONFIRMED                         | Tiga jumlah kategori sebagai integer nonnegatif; kategori tidak diubah.                                                                        |
| FR-PP-002 | CONFIRMED                         | Total otomatis dari tiga kategori.                                                                                                             |
| FR-PP-003 | CONFIRMED dengan rincian terpisah | Notes dan foto tersedia; ERP mendukung sampai empat foto. PROPOSED: interface awal tetap maksimum empat. OPEN: maksimum permanen/minimum foto. |
| FR-PP-004 | CONFIRMED                         | Signature customer/pengirim bagian Proof of Pickup alur normal; pengecualian OPEN.                                                             |
| FR-PP-005 | CONFIRMED                         | Foto dan signature disimpan aman.                                                                                                              |
| FR-PP-006 | CONFIRMED                         | Finalisasi pickup sukses menyimpan recording dan menandai PICKED_UP.                                                                           |
| FR-PP-007 | PROPOSED                          | Satu hasil final logis per task; retry tidak membuat transaksi ganda. Revisi tertaut bukan pickup baru.                                        |
| FR-PP-008 | PROPOSED                          | Original final tidak diedit/dihapus melalui form biasa; koreksi memakai jalur terotorisasi setelah policy disetujui.                           |
| FR-PP-009 | PROPOSED                          | Koreksi final sebagai revisi tertaut yang menjaga original dan konteks perubahan sesuai bagian 16.2.                                           |

Validasi: integer ≥0 dan total otomatis CONFIRMED. PROPOSED: setiap kategori eksplisit, backend menghitung ulang total; submit hanya oleh petugas berhak pada task eligible; bukti wajib yang gagal tersimpan menggagalkan finalisasi. OPEN: total nol, minimum/format/ukuran foto, exception signature dan actor koreksi. Signature pada alur normal dipertahankan; tidak diasumsikan wajib tanpa pengecualian.

AC: 10/8/7 →25; original tidak berubah saat retail memeriksa; bukti aman; retry tanpa duplikasi jika FR-PP-007 disetujui; AC foto kelima bersyarat. Attempt tanpa paket tidak dipaksa memakai form finalisasi sukses. Dependency: M1, outcome M2, storage aman; bukan handover/schedule.

### 8.6 Handover Session

Tujuan CONFIRMED: kelompok task pickup yang kembali ke retail, dengan identitas tiap task/customer tetap tersedia. Actor verifikasi: retail; creator session OPEN. Alur: draft → pilih eligible pickup → verifikasi → close.

| ID        | Label              | Requirement                                                                                                                       |
| --------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| FR-HO-001 | PROPOSED           | Retail membuat session; creator/owner wajib dikonfirmasi OQ-11. Kebutuhan adanya session tetap CONFIRMED.                         |
| FR-HO-002 | CONFIRMED sebagian | Session memuat beberapa completed pickup/customer. PROPOSED: hanya satu petugas per session.                                      |
| FR-HO-003 | CONFIRMED          | Tampilkan customer, kategori, total per item dan total session.                                                                   |
| FR-HO-004 | PROPOSED           | Task hanya ikut satu session selama asosiasi berlaku jika penyerahan penuh disetujui; tidak menghalangi partial secara diam-diam. |
| FR-HO-005 | CONFIRMED          | Status session DRAFT, IN_VERIFICATION, CLOSED dan timestamps.                                                                     |
| FR-HO-006 | CONFIRMED          | Close setelah semua item diperiksa: VERIFIED atau DISCREPANCY dengan catatan yang diperlukan.                                     |
| FR-HO-007 | PROPOSED           | Membership dapat diubah di draft, dikunci ketika verifikasi dimulai; exception perubahan OPEN.                                    |
| FR-HO-008 | PROPOSED           | Penyerahan penuh satu task dalam satu session; pengecualian partial dari V1 membutuhkan persetujuan OQ-24.                        |

PROPOSED: hanya pickup sukses dengan bukti valid eligible; session kosong tidak memulai verifikasi; cegah duplikasi teknis item. AC CONFIRMED: task A=10, B=15, C=8 ditampilkan terpisah dengan pickup total 33; pending menghalangi close; discrepancy tercatat tetap terlihat setelah close. AC penolakan petugas lain/task lintas sesi/lock bersyarat policy. Dependency: pickup sukses dan keputusan handover M4; session dan verifikasi dikirim bersama.

### 8.7 Retail Verification

Actor: Retail Staff. Data: item/task/customer, tiga retail quantities, total, catatan discrepancy, verifier dan waktu. Alur: hitung fisik → input → bandingkan → notes bila berbeda → submit.

| ID        | Label     | Requirement                                                                                         |
| --------- | --------- | --------------------------------------------------------------------------------------------------- |
| FR-RV-001 | CONFIRMED | Input fisik per task/customer dan kategori.                                                         |
| FR-RV-002 | CONFIRMED | Retail quantities independen dari pickup quantities.                                                |
| FR-RV-003 | CONFIRMED | Bandingkan setiap kategori.                                                                         |
| FR-RV-004 | CONFIRMED | Semua cocok → VERIFIED; perbedaan kategori apa pun → DISCREPANCY.                                   |
| FR-RV-005 | CONFIRMED | Discrepancy notes wajib.                                                                            |
| FR-RV-006 | CONFIRMED | Simpan verifier dan timestamp.                                                                      |
| FR-RV-007 | CONFIRMED | Hasil per item ditampilkan tanpa mengubah original Proof of Pickup.                                 |
| FR-RV-008 | PROPOSED  | Hasil submitted tidak diedit melalui form biasa; koreksi memakai mekanisme terpisah yang disetujui. |
| FR-RV-009 | PROPOSED  | Koreksi retail berupa revisi tertaut; recalculation hasil dan penanganan sesi mengikuti OQ-13.      |

Validasi: quantity integer ≥0; discrepancy membutuhkan catatan bermakna. PROPOSED: input eksplisit saat IN_VERIFICATION, field awal kosong, delta = retail − pickup. AC: 10/8/7 versus 10/7/7 discrepancy; 10/8/7 versus 11/7/7 tetap discrepancy meski total sama; notes kosong ditolak; original tidak berubah. Jika partial disetujui, baseline pembanding dan agregasi harus ditetapkan OQ-24 sebelum acceptance final, tidak diasumsikan membandingkan setiap bagian terhadap keseluruhan task. Dependency M4: session dan policy verifikasi; tidak memerlukan modul dispute.

### 8.8 Pickup History and Monitoring

Actor sesuai akses. Alur: filter/list → detail task → bukti, attempt, session dan hasil retail. Data: reference, customer snapshot bila disetujui, staff, status terpisah, kedua set quantities, notes, waktu dan jejak perubahan.

| ID        | Label     | Requirement                                                                    |
| --------- | --------- | ------------------------------------------------------------------------------ |
| FR-MO-001 | CONFIRMED | Progress dan history pickup.                                                   |
| FR-MO-002 | CONFIRMED | Hubungan task, Proof of Pickup dan handover.                                   |
| FR-MO-003 | CONFIRMED | Supervisor memantau discrepancy.                                               |
| FR-MO-004 | PROPOSED  | Filter tanggal, customer, staff, jenis, task/verification status.              |
| FR-MO-005 | PROPOSED  | Dashboard ringkas antrean task, menunggu handover, sesi aktif dan discrepancy. |
| FR-MO-006 | PROPOSED  | Timeline actor/timestamp, termasuk koreksi yang disetujui.                     |

AC: PICKED_UP bukan VERIFIED; CLOSED dengan discrepancy tetap ditemukan; task customer sama tidak dilebur; history mengikuti authorization. Detail transaksi dasar tersedia sejak fiturnya dikirim, sementara dashboard/filter lengkap M6. Tidak menunggu M6 untuk menyimpan actor, waktu dan data historis.

PROPOSED: history menampilkan perpindahan assignment serta receipt/reference versi, kanal, tujuan yang aksesnya dibatasi, waktu dan status kirim/tindak lanjut. Receipt sukses bukan status retail VERIFIED; gagal kirim bukan pickup UNSUCCESSFUL.

### 8.9 Customer Pickup Receipt

Tujuan: customer menerima konfirmasi setelah pickup berhasil. Actor penerima: customer/pengirim pada kontak yang ditetapkan; pengiriman otomatis atau tindakan kirim terotorisasi merupakan rincian implementasi yang belum diputuskan. Receipt adalah bukti pickup, bukan bukti penerimaan/verifikasi retail atau invoice.

| ID        | Label     | Requirement                                                                                                                                                                                                              |
| --------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR-NT-001 | CONFIRMED | Setiap pickup berhasil mempunyai konfirmasi/receipt kepada customer melalui WhatsApp atau email, setelah Proof of Pickup berhasil difinalisasi. Tidak dipicu hanya oleh create task, takeover, atau attempt tanpa paket. |
| FR-NT-002 | CONFIRMED | Receipt memuat jumlah paket dan bukti pickup yang sesuai dengan pickup berhasil terkait. Detail format, distribusi bukti dan field tambahan ditetapkan sebelum pengiriman operasional.                                   |
| FR-NT-003 | PROPOSED  | Pengiriman otomatis setelah finalisasi; simpan kanal, tujuan, waktu attempt, versi/reference pickup, status pengiriman dan kegagalan; kirim ulang terotorisasi bila perlu.                                               |
| FR-NT-004 | PROPOSED  | Kegagalan receipt tidak membatalkan pickup sukses atau membuat Proof of Pickup ganda; tampilkan perlu tindak lanjut dan retry yang menghindari pesan duplikat.                                                           |
| FR-NT-005 | PROPOSED  | Receipt mengacu versi bukti yang dikirim; koreksi pickup tidak diam-diam mengganti receipt lama. Pengiriman revisi mengikuti OQ-31.                                                                                      |

PROPOSED isi minimum: reference pickup, customer, petugas, waktu, nama kategori lengkap dan jumlah masing-masing, total, serta bukti melalui tautan terbatas atau lampiran yang disetujui. Jangan otomatis mendistribusikan seluruh foto, signature atau notes internal. Pilihan isi/bukti dan akses penerima harus disepakati OQ-30. Jika memakai tautan, akses customer dibatasi pada receipt/bukti terkait tanpa akses dashboard/API operasional; login staff tidak menjadi syarat implisit customer membuka receipt.

OPEN OQ-30: WhatsApp saja, email saja, pilihan salah satu, atau keduanya; sumber kontak, validasi nomor/email, otomatis/manual, sender/provider/template, format dan akses bukti, retry, serta definisi sent/delivered. Kebutuhan “WhatsApp atau email” tidak berarti dua kanal wajib tersedia sekaligus. PROPOSED: satu kanal yang disepakati dahulu untuk mengurangi dependency; bukan mengganti requirement receipt dengan copy manual tanpa persetujuan.

Kontak pengiriman yang dapat digunakan diperlukan sebelum receipt dikirim. OPEN: kontak tidak tersedia/tidak valid, tidak ada kanal yang bisa dipakai, atau provider gagal—apakah finalisasi tetap boleh, siapa menindaklanjuti dan kapan. Draft customer/task M1 tidak otomatis membutuhkan kedua field kontak. Status “sent” tidak boleh dianggap “delivered/read” tanpa bukti yang tersedia. Tidak memilih layanan eksternal, biaya, credential, queue atau infrastruktur baru dalam PRD ini. Dependency M3: hasil pickup sukses, kontak/kanal dan akses bukti; bukan handover/M4 atau ERP.

## 9. Business Rules

| ID     | Label                                       | Rule                                                                                                                                                                           |
| ------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| BR-001 | CONFIRMED                                   | Regular/on-demand berbagi recording dan handover.                                                                                                                              |
| BR-002 | CONFIRMED                                   | Kategori persis Manual Hybrid (Non-Cashless), Cashless Hybrid, CSS / Orion.                                                                                                    |
| BR-003 | CONFIRMED                                   | Quantity integer ≥0; nol satu kategori boleh.                                                                                                                                  |
| BR-004 | CONFIRMED                                   | Total = jumlah tiga kategori; tidak diinput manual.                                                                                                                            |
| BR-005 | CONFIRMED                                   | Signature customer/pengirim merupakan bukti pickup; exception OPEN.                                                                                                            |
| BR-006 | CONFIRMED fakta existing; PROPOSED batas V1 | ERP mendukung sampai empat foto. Pertahankan batas interface awal; batas bisnis permanen OPEN.                                                                                 |
| BR-007 | CONFIRMED                                   | Pickup completed tidak berarti retail verified.                                                                                                                                |
| BR-008 | CONFIRMED                                   | Retail quantities tidak menggantikan pickup quantities.                                                                                                                        |
| BR-009 | CONFIRMED                                   | Perbedaan satu kategori cukup untuk DISCREPANCY; total sama tidak membatalkannya.                                                                                              |
| BR-010 | CONFIRMED                                   | Discrepancy membutuhkan notes.                                                                                                                                                 |
| BR-011 | CONFIRMED                                   | Close setelah seluruh item diperiksa dan selisih didokumentasikan.                                                                                                             |
| BR-012 | CONFIRMED                                   | CLOSED bukan discrepancy resolved.                                                                                                                                             |
| BR-013 | PROPOSED                                    | Satu task diserahkan penuh dalam satu session; partial bukan keputusan final.                                                                                                  |
| BR-014 | CONFIRMED                                   | Generation occurrence bebas duplikasi.                                                                                                                                         |
| BR-015 | PROPOSED                                    | Form normal tidak mengedit final pickup/verification; koreksi tertaut bila disetujui.                                                                                          |
| BR-016 | PROPOSED                                    | Tidak hard-delete transaksi final; retention terpisah diputuskan sebelum production.                                                                                           |
| BR-017 | PROPOSED                                    | Reassignment/perubahan waktu sebelum PICKED_UP; perubahan setelah attempt mengikuti policy.                                                                                    |
| BR-018 | PROPOSED                                    | Cancel sebelum eksekusi dengan alasan; actor/batas eksekusi OPEN.                                                                                                              |
| BR-019 | CONFIRMED baseline revisi                   | Attempt tanpa paket dibedakan dari sukses dan pembatalan sebelum eksekusi; tidak dipaksa menjadi Proof of Pickup sukses.                                                       |
| BR-020 | CONFIRMED baseline revisi                   | Koreksi terotorisasi mempertahankan original dan mencatat actor, timestamp, alasan serta perubahan relevan; tidak overwrite evidence diam-diam.                                |
| BR-021 | PROPOSED                                    | Revisi tertaut dipakai untuk koreksi; perubahan nilai bukan penyelesaian selisih fisik.                                                                                        |
| BR-022 | CONFIRMED                                   | Petugas boleh langsung mengambil alih task petugas lain tanpa approval CS; eligibility/scope tetap mengikuti keputusan OQ-29.                                                  |
| BR-023 | CONFIRMED                                   | Receipt jumlah paket dan bukti kepada customer dikirim setelah pickup berhasil melalui WhatsApp atau email; bukan hasil retail verification.                                   |
| BR-024 | PROPOSED                                    | Takeover/receipt tidak mengubah bukti historis; kegagalan kirim tidak membatalkan pickup berhasil; receipt revisi tertaut ke versi dan tidak menghilangkan receipt sebelumnya. |

OPEN: total semua kategori nol (OQ-06), kebijakan koreksi (OQ-10/13), partial dan relasi sesi (OQ-24–27). Tidak ada aturan baru tentang penanggung jawab kehilangan atau kompensasi.

## 10. Pickup and Handover Lifecycles

Nama status existing dipertahankan sebagai CONFIRMED. Detail transisi/aktor adalah PROPOSED kecuali finalisasi sukses dan aturan close baseline.

### 10.1 Pickup Task

| Dari                 | Ke                   | Actor / kondisi                                                                                  |
| -------------------- | -------------------- | ------------------------------------------------------------------------------------------------ |
| Create               | SCHEDULED            | CS; belum assign                                                                                 |
| Create / SCHEDULED   | ASSIGNED             | CS; assigned petugas valid                                                                       |
| ASSIGNED             | ASSIGNED / SCHEDULED | Reassign/unassign jika disetujui; audit perubahan                                                |
| ASSIGNED             | ASSIGNED             | Petugas langsung takeover tanpa approval CS; status tetap, assignment berubah; eligibility OQ-29 |
| SCHEDULED / ASSIGNED | CANCELLED            | Sebelum eksekusi sesuai OQ-04; bukan label otomatis untuk attempt                                |
| ASSIGNED             | PICKED_UP            | Petugas berhak; bukti sukses valid dan tersimpan                                                 |

PROPOSED: PICKED_UP/CANCELLED terminal melalui workflow biasa. Tidak ada status perjalanan tambahan; handover tidak mengganti status task PICKED_UP. Koreksi bukan otomatis transisi balik.

### 10.2 Alternatif minimum untuk attempt tanpa paket — OPEN OQ-05

| Alternatif                            | Cara kerja PROPOSED                                                                                  | Konsekuensi operasional                                                                                                                                                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A — status existing + outcome attempt | Catat attempt tanpa paket terpisah; task tetap ASSIGNED sampai retry atau tindakan CS yang disetujui | Tidak perlu status baru; cocok bila task boleh dicoba ulang. Daftar harus membedakan belum dikunjungi versus sudah attempted. Task gagal yang tidak akan diulang membutuhkan keputusan penutupan agar tidak terus menumpuk. |
| B — satu status terminal UNSUCCESSFUL | Catat attempt dan reason; akhiri task tanpa Proof of Pickup sukses                                   | Cocok bila satu kunjungan mengakhiri task. Retry perlu task baru atau transisi yang disetujui, relasi riwayat dan cara menghitung monitoring. Tidak perlu menambah FAILED sekaligus.                                        |

Rekomendasi PROPOSED: A bila operasional mempertahankan task untuk retry; B bila kegagalan mengakhiri pekerjaan. Pemilihan memerlukan keputusan apakah task mewakili permintaan atau satu kunjungan. Kedua alternatif mencegah sukses fiktif dan tidak masuk handover tanpa paket. Reason contoh: lokasi tutup, customer tidak tersedia, paket belum siap, customer membatalkan di lokasi, tidak ada paket. Daftar final dan tindakan lanjut OPEN; pembatalan di lokasi adalah attempt, bukan otomatis CANCELLED sebelum eksekusi.

M2 terblokir untuk finalisasi cabang outcome sampai diputuskan, M3 terpengaruh terutama total nol; M1 create/assign/list/detail tidak terblokir oleh pilihan status ini.

### 10.3 Handover Session

| Dari            | Ke              | Kondisi                                                     |
| --------------- | --------------- | ----------------------------------------------------------- |
| Create          | DRAFT           | Creator sesuai OQ-11; informasi petugas mengikuti OQ-26     |
| DRAFT           | IN_VERIFICATION | PROPOSED: minimal satu item eligible dan membership valid   |
| IN_VERIFICATION | CLOSED          | CONFIRMED: semua item diperiksa; discrepancy memiliki notes |

PROPOSED: lock membership mulai pemeriksaan dan CLOSED read-only melalui workflow biasa. OPEN: correction/reopen; tidak menyimpulkan reopen pasti dilarang atau pasti tersedia. CLOSED tetap dapat mempunyai discrepancy.

### 10.4 Handover Item

PENDING (belum diperiksa) → VERIFIED jika semua kategori cocok; atau → DISCREPANCY jika ada beda dan notes. Tidak ada status RESOLVED yang otomatis ditambahkan. Hasil menggambarkan pemeriksaan jumlah, bukan keputusan tanggung jawab. Koreksi hasil final mempertahankan hasil sebelumnya dan memerlukan policy OQ-13.

## 11. Data and Domain Model

Seluruh bentuk penyimpanan berikut PROPOSED, bukan schema, migration, atau constraint database final. Batas domain utama dipertahankan: task, bukti pickup, dan handover/verifikasi.

### 11.1 Entitas minimum

| Entity                          | Tanggung jawab/data                                                                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| User                            | Login, role operasional sederhana, aktif/nonaktif                                                                                            |
| Customer                        | Identitas master, kontak/default alamat bila dipakai; bukan history task                                                                     |
| PickupTask                      | Reference, jenis, waktu, customer, alamat/kontak operasional, assignment, status, snapshot yang disetujui                                    |
| PickupSchedule                  | Customer, hari/waktu, timezone, active, occurrence; baru M5                                                                                  |
| PickupRecord                    | Bukti sukses: quantities, total turunan, notes, customer, petugas, waktu pickup/submit                                                       |
| HandoverSession                 | Pengelompokan dan status, creator, verifier/closer dan waktu; staff scope masih OPEN                                                         |
| HandoverItem                    | Hubungan session–task dan retail quantities, hasil, notes, verifier/waktu                                                                    |
| PickupEvent                     | Jejak aktivitas sederhana; bukan event sourcing                                                                                              |
| PickupReceipt / delivery record | PROPOSED: reference/versi pickup, kanal, tujuan, status/waktu attempt dan error; hanya metadata minimum, bukan notification platform generik |

### 11.2 Struktur tambahan minimum

PROPOSED: PickupAttachment untuk foto/signature, reference private file, jenis, ukuran, uploader dan waktu. Catatan attempt dapat berupa record sederhana terkait task sesuai OQ-05. Koreksi dapat berupa revisi tertaut dengan before/after, actor, waktu, reason dan target; tidak perlu mesin audit generik atau approval module.

Tidak diperlukan entitas Shipment, AWB, Package, Fleet, Inventory, organisasi enterprise atau modul alamat khusus.

### 11.3 Relationship dan keputusan cardinality

| Relationship             | Rancangan minimum / batas keputusan                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Customer → task/schedule | Satu customer dapat mempunyai banyak task/schedule                                                                                       |
| Schedule → task          | Banyak occurrence; schedule nullable untuk on-demand                                                                                     |
| User → assigned task     | Banyak task; assignment kosong sebelum assign                                                                                            |
| Task → PickupRecord      | Usulan satu hasil final logis; koreksi dapat mempunyai revisi, bukan banyak pickup independen                                            |
| Record → attachment      | Banyak file; batas empat foto sementara dan signature normal, exception OPEN                                                             |
| Session → item           | Banyak item; customer sama tetap dipisah menurut task                                                                                    |
| Task → item              | Jika full-only + one-session disetujui: 0..1 asosiasi aktif; jika partial disetujui: dapat banyak penyerahan dengan alokasi per kategori |
| Staff → session          | Jika one-staff disetujui: satu staff pada session; jika mixed: asal staff pada task/item tetap terlacak                                  |
| Verifier → hasil         | Banyak hasil pemeriksaan terkait actor                                                                                                   |

### 11.4 Konsekuensi asumsi handover

| Keputusan OPEN        | Konsekuensi jika disetujui                                        | Konsekuensi alternatif                                                                                              |
| --------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Full-only OQ-24       | Satu pemeriksaan terhadap jumlah keseluruhan task lebih sederhana | Partial membutuhkan jumlah bagian diserahkan per kategori, sisa dan agregasi; definisi discrepancy harus disepakati |
| One-session OQ-25     | Uniqueness task–sesi aktif mungkin sesuai                         | Multi-session membutuhkan referensi bagian/attempt dan pencegahan hitung ganda; tidak cukup unique global task      |
| One-staff OQ-26       | Staff dapat menjadi konteks session                               | Mixed staff membutuhkan asal pada item; tidak mengubah identitas task/customer                                      |
| Creator OQ-11         | Access create mengikuti role terpilih                             | Tidak mengubah kewajiban retail melakukan verifikasi                                                                |
| Membership lock OQ-27 | Rincian pemeriksaan stabil                                        | Edit setelah mulai membutuhkan jejak tambah/lepas dan larangan melepas hasil diperiksa secara diam-diam             |

Jangan menetapkan unique constraint global task–handover, mandatory satu staff di session, atau partial allocation sebelum keputusan terkait disetujui. Constraint teknis kemudian mengikuti bisnis; tidak sebaliknya.

### 11.5 Integritas dan auditability

CONFIRMED: total dan perbandingan kategori konsisten; original bukti tidak diganti; setiap koreksi sah dapat ditelusuri; generation tidak duplikat; close tidak melewati pemeriksaan.

PROPOSED: reference unik, referential integrity, transaksi sesuai operasi, pencegahan double submit dan stale updates, snapshot historis; log biasa untuk create/edit/assign/cancel/generate/submit/session membership/verify/close/correct. Timestamp server dibedakan dari waktu kejadian bila perlu. Tidak ada event sourcing, CQRS atau abstractions audit tambahan.

## 12. UI / UX Requirements

CONFIRMED: React dan shadcn/ui, mobile-responsive, navigasi/status sederhana, input wajib minimal dan komponen reusable. Pemilihan drawer/modal atau canvas signature adalah PROPOSED, bukan kebijakan bisnis.

| Milestone | Layar minimum PROPOSED                                                                                                                                     |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1        | Login; customer search/create; create on-demand; task list/detail; assignment; My Pickup Tasks/detail mobile; daftar task eligible dan tindakan Ambil Alih |
| M2        | Task outcome/attempt dan reason sesuai policy                                                                                                              |
| M3        | Pickup Recording tiga kategori; notes/foto; signature; review; hasil bukti; status receipt dan retry terotorisasi; receipt customer                        |
| M4        | Handover preparation/list/detail; verification per task/customer/kategori; notes; close                                                                    |
| M5        | Schedule hari/waktu, aktif/nonaktif, status generation                                                                                                     |
| M6        | Dashboard ringkas, filters dan history terhubung                                                                                                           |

PROPOSED: keyboard numerik, label kategori lengkap, total readonly, pending state saat submit, input tetap saat request gagal selama halaman aktif, review sebelum finalisasi, peringatan kehilangan signature, delta/teks selain warna, retail inputs kosong agar mendorong hitung fisik. Tampilkan pickup total dan retail total terpisah. Attempt tanpa paket tidak membuka alur signature sukses secara wajib. Dukungan draft lintas reload/offline OPEN; jangan menjanjikan penyimpanan yang tidak tersedia.

## 13. Non-Functional Requirements

| ID      | Label                                   | Requirement                                                                                                                                                |
| ------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-001 | CONFIRMED baseline; rincian PROPOSED    | Modular monolith, Laravel dan relational database. Pembagian modul Customer/Scheduling/Pickup/Handover/Monitoring mengikuti domain tanpa layanan terpisah. |
| NFR-002 | CONFIRMED baseline                      | REST API dengan validation dan authorization backend; frontend React/shadcn/ui.                                                                            |
| NFR-003 | PROPOSED                                | Transaksi yang sesuai menjaga finalisasi, verification, koreksi sah dan close konsisten.                                                                   |
| NFR-004 | PROPOSED                                | Concurrency control mencegah duplicate occurrence/submission dan perubahan bersamaan; membership constraints mengikuti OQ-24–27.                           |
| NFR-005 | PROPOSED                                | Retry tidak menciptakan transaksi ganda.                                                                                                                   |
| NFR-006 | PROPOSED                                | Pagination list; monitoring tidak memuat seluruh history sekaligus.                                                                                        |
| NFR-007 | CONFIRMED responsif; pengujian PROPOSED | Mobile recording/foto/signature diuji pada perangkat/browser yang disepakati.                                                                              |
| NFR-008 | PROPOSED                                | Label/error jelas, status bukan warna saja, target sentuh memadai.                                                                                         |
| NFR-009 | PROPOSED                                | Konvensi proyek dan versi terpasang; dependency tambahan hanya bila disetujui.                                                                             |
| NFR-010 | PROPOSED                                | Log aplikasi, kegagalan generation/upload, backup database dan files.                                                                                      |
| NFR-011 | PROPOSED                                | Restore database dan attachments diuji sebelum production.                                                                                                 |
| NFR-012 | PROPOSED                                | Timestamp konsisten dan timezone operasional eksplisit.                                                                                                    |
| NFR-013 | PROPOSED                                | Error validation/access/stale/retry konsisten dan dapat ditangani UI.                                                                                      |

OPEN OQ-18–20: volume, concurrency, latency, availability, RPO/RTO, kapasitas bukti, retention dan perangkat. Target numerik tidak dibuat-buat. M1 tidak menunggu penentuan SLA final; validasi NFR production dilakukan sebelum rilis produksi. Tidak ada dependency PWA, queue, distributed services atau optimasi skala hipotetis.

## 14. Security and Audit Requirements

### 14.1 Authentication dan authorization

CONFIRMED: authentication dan kontrol akses operasional, backend melindungi data/operasi sensitif. PROPOSED: akun Admin-managed tanpa registrasi publik, role tetap, akses assignment/entity, akun nonaktif tidak menjalankan operasi baru, HTTPS, perlindungan request sesuai mekanisme login. Mekanisme login mengikuti kebutuhan web/mobile yang ada tanpa mengganti stack.

M1 tetap membutuhkan pemeriksaan akses API, bukan sekadar hidden button. Hak koreksi atau reopen tidak melekat otomatis pada role Supervisor/Admin. Scope outlet dan multi-role OPEN; tidak membuat permission builder untuk menjawabnya.

Takeover yang diotorisasi membolehkan petugas melihat data minimum task eligible petugas lain dan mengambil assignment tanpa approval CS. Ini tidak membuka akses seluruh customer/history/bukti task lain. Receipt customer didistribusikan hanya ke tujuan yang benar dengan akses bukti terbatas; nomor/email, link/token akses dan error layanan tidak boleh dibocorkan ke pengguna yang tidak berhak. Pilihan kontrol akses receipt OPEN OQ-30; tautan publik permanen untuk semua bukti bukan default.

### 14.2 Foto dan signature

CONFIRMED: bukti aman. PROPOSED: storage private, akses view/download terotorisasi atau temporary access tervalidasi, validasi isi/jenis/ukuran/jumlah file, nama file dari sistem, cleanup temporary uploads. Jangan menyimpan credential/token atau isi signature di application logs. File gagal tersimpan tidak ditampilkan tersedia.

OPEN: format/ukuran/minimum foto OQ-08; retention/access historis OQ-20. Empat slot existing tetap didukung; batas sementara tidak diubah tanpa persetujuan.

### 14.3 Audit minimum

CONFIRMED baseline revisi: koreksi authorized menyimpan original, actor, timestamp, reason dan perubahan relevan. PROPOSED: audit append-only untuk pengguna operasional; actor dari authentication, timestamp server; jejak transaksi utama dan master deactivation tetap tersedia. Tidak diperlukan audit engine generik. Notes discrepancy tidak otomatis menentukan kesalahan petugas atau kewajiban finansial.

## 15. ERP Migration Considerations

### 15.1 Inventarisasi

PROPOSED: gunakan export/dokumentasi atau akses ERP yang diotorisasi secara terpisah. Inventarisasi customer dan alamat/kontak, petugas/mapping akun, jadwal, task terbuka, history pickup, quantities/kategori, notes, references, foto/signature, dan data handover jika ada. Catat aturan existing yang belum jelas; jangan mengasumsikan akses database/API ERP.

### 15.2 Data historis

OPEN OQ-21: ERP sebagai archive, import read-only legacy, atau kombinasi. PROPOSED: master esensial tersedia sebelum cutover; import mencatat source/legacy reference; records tidak lengkap ditandai legacy, tidak dibuatkan signature/foto/verification fiktif. Invalid quantity/total/mapping masuk exception yang direview, bukan diperbaiki diam-diam.

### 15.3 Cutover

CONFIRMED: aplikasi baru menjadi owner data pickup baru setelah cutover yang disepakati. OPEN OQ-22: waktu/cakupan, task berjalan, rollback. PROPOSED: rehearsal, validasi master/user/perangkat/schedule, satu owner system per task, hentikan creation/generation ERP pada scope dialihkan, rekonsiliasi jumlah/assignment/bukti, pantau exception awal. Task berjalan selesai di ERP atau dipindahkan terkontrol sesuai keputusan.

### 15.4 Hindari dual-write

PROPOSED: jangan mengubah transaksi aktif yang sama di dua sistem; schedule yang dialihkan tidak generate ganda. Integrasi kelak mengikuti owner dan identifier yang jelas, tetapi bukan syarat M1 atau V1. Rollback membutuhkan rekonsiliasi transaksi setelah cutover. Migrasi bukan dependency prototipe/internal M1.

## 16. Edge Cases and Exception Handling

### 16.1 Skenario operasional

| Kasus                                                                 | Penanganan / klasifikasi                                                                                  | Gate                            |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Lokasi tutup/customer tidak tersedia/paket belum siap/tidak ada paket | OPEN: catat attempt tanpa sukses; pilih alternatif lifecycle dan tindak lanjut                            | M2–M3                           |
| Customer membatalkan di lokasi                                        | Attempt sudah terjadi; tidak otomatis disamakan dengan cancel sebelum eksekusi                            | M2                              |
| Cancel sebelum berangkat                                              | PROPOSED: CANCELLED dengan actor/reason sesuai OQ-04                                                      | M2 bila fitur cancel disertakan |
| Semua quantity nol                                                    | OPEN OQ-06: outcome tanpa paket atau aturan khusus; jangan otomatis PICKED_UP                             | M2–M3                           |
| Signature ditolak/tidak bisa diberikan                                | OPEN OQ-07: jalur exception; tidak ada signature pengganti/fiktif                                         | M3                              |
| Foto kelima                                                           | Jika batas sementara disetujui: tolak tanpa menghilangkan empat foto valid; bukan policy permanen         | M3                              |
| Assignment berubah saat form terbuka                                  | PROPOSED: validasi ulang, tolak actor yang tidak lagi berhak, tampilkan state terbaru                     | Milestone reassign              |
| Dua petugas mengambil alih task bersamaan                             | PROPOSED: hanya satu perpindahan berhasil dari assignment yang sama; request stale memuat ulang           | M1                              |
| Takeover task sudah berjalan/attempted/PICKED_UP                      | OPEN OQ-29; rekomendasi batasi sebelum eksekusi, tanpa mengubah bukti historis                            | M1–M3                           |
| Receipt gagal atau kontak tidak valid                                 | OPEN OQ-30; PROPOSED: hasil pickup tetap, status pengiriman/error tercatat dan tindak lanjut terotorisasi | M3                              |
| Retry receipt atau pickup dikoreksi                                   | PROPOSED: cegah duplicate send teknis; revisi receipt mengikuti OQ-31 dan tidak menghapus versi lama      | M3                              |
| Timeout/double tap                                                    | PROPOSED: hasil tersimpan dapat ditemukan; retry tidak menggandakan                                       | M3–M5 sesuai operasi            |
| Upload gagal                                                          | PROPOSED: finalisasi tidak berhasil bila bukti wajib belum tersimpan                                      | M3                              |
| Task sama dipilih dua session                                         | OPEN model bisnis; cegah duplikasi teknis; exclusive hanya bila OQ-25 disetujui                           | M4                              |
| Partial fisik diserahkan                                              | OPEN OQ-24: jangan dianggap selesai penuh atau hilang; alokasi/sisa harus diputuskan                      | M4                              |
| Dua petugas dalam session                                             | OPEN OQ-26; tidak ditolak sebagai baseline CONFIRMED                                                      | M4                              |
| Customer sama mempunyai dua task                                      | CONFIRMED: verifikasi task terpisah; bukan satu baris gabungan customer                                   | M4                              |
| Retail lebih/kurang, atau total sama kategori beda                    | CONFIRMED: DISCREPANCY dan notes                                                                          | M4                              |
| PENDING saat close                                                    | CONFIRMED: close ditolak                                                                                  | M4                              |
| Dua verifier memperbarui hasil                                        | PROPOSED: jangan silent overwrite; tampilkan conflict/hasil terkini                                       | M4                              |
| Salah input / salah customer                                          | Mekanisme koreksi bagian 16.2; original terjaga                                                           | M3–M4                           |
| Paket hilang sebelum handover                                         | OPEN tindakan/owner; jangan membuat status/financial liability baru                                       | M4                              |
| Koneksi terputus                                                      | PROPOSED: pending/gagal jujur; offline bukan janji V1                                                     | M2–M3; production               |
| Jadwal overlap/libur/job terlambat                                    | OPEN OQ-15/16; generation ulang tidak boleh duplikat                                                      | M5                              |
| Customer/petugas nonaktif dengan task aktif                           | PROPOSED: history tetap; penanganan task aktif dikonfirmasi, tidak otomatis delete                        | Sebelum operasi deactivation    |

### 16.2 Koreksi dan integritas

Empat operasi dibedakan secara eksplisit:

| Operasi                                     | Kebutuhan dan strategi minimum                                                                                                                                                              | Keputusan yang belum disetujui                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Koreksi draft sebelum submit                | PROPOSED: pengguna berhak mengubah input belum final dan review ulang. Jika draft disimpan, catat perubahan yang diperlukan; tidak mengklaim bukti final sudah ada                          | Batas draft, kebutuhan persistence; tidak perlu approval bertingkat                                                       |
| Koreksi final pickup: jumlah/customer salah | CONFIRMED: original termasuk informasi customer/bukti tetap tersimpan. PROPOSED: revisi tertaut berisi perubahan, actor, waktu, reason; tampilkan original dan nilai efektif yang disetujui | OQ-10/28: siapa, kapan, field apa, perlu konfirmasi ulang customer/signature atau tidak, pengaruh pada pemeriksaan retail |
| Koreksi verification: retail salah input    | CONFIRMED: hasil awal tetap. PROPOSED: revisi retail tertaut dan hitung ulang hasil terhadap versi pickup yang jelas                                                                        | OQ-13: otoritas, batas sebelum/sesudah close dan validasi dampak                                                          |
| Menyelesaikan selisih fisik sebenarnya      | Bukan koreksi angka agar terlihat cocok. DISCREPANCY dan notes tetap merupakan hasil pemeriksaan; catatan tindak lanjut tidak otomatis resolved                                             | OQ-14: owner/proses di luar aplikasi atau kebutuhan minimum; tidak membangun dispute module                               |

PROPOSED minimal correction strategy: gunakan satu pola revisi tertaut pada record target, original readonly melalui form normal; simpan before/after relevan, actor, server timestamp, reason dan reference; tampilkan riwayat serta versi yang dipakai untuk pemeriksaan. Tidak ada multi-level approval otomatis, event sourcing, atau transaksi pickup baru untuk sekadar memperbaiki input.

Jika koreksi pickup memengaruhi jumlah/customer setelah retail memeriksa, hasil pemeriksaan lama **tidak boleh ditulis ulang diam-diam**. Policy harus menentukan perlunya review retail dan baseline versi terbaru; UI mempertahankan hasil awal beserta alasan review. Jika kesalahan ditemukan setelah CLOSED, usulan default adalah koreksi tertaut pada sesi tertutup tanpa reopen otomatis. OPEN OQ-13 tetap menentukan apakah reopen diperlukan dan siapa berhak; bila disetujui, event close awal dan seluruh revisi harus tetap terlihat.

Sebelum policy disetujui, pengembangan happy path/draft dapat berjalan. Jalur koreksi final tidak boleh diluncurkan atau dilakukan melalui edit data langsung tanpa otorisasi/jejak. Untuk release yang dipakai operasional, business harus memilih mekanisme koreksi minimal atau penanganan exception sementara yang dapat ditelusuri; ketiadaan tombol koreksi bukan persetujuan larangan koreksi permanen.

## 17. Acceptance Criteria

AC existing dipertahankan ID-nya. AC bersyarat tidak digunakan untuk memaksakan policy PROPOSED. Kata “koreksi authorized” berarti otoritas telah ditetapkan.

| ID     | Skenario / hasil yang diterima                                                                                                                                                                                                       | Traceability                      | Penerapan                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- | ------------------------------------------------- |
| AC-001 | CS membuat on-demand dan assign; petugas terkait melihat task/detail                                                                                                                                                                 | FR-PU-001/002, FR-WS-001          | M1                                                |
| AC-002 | Generate occurrence berulang → satu task                                                                                                                                                                                             | FR-SC-003/004, BR-014             | M5                                                |
| AC-003 | Quantity negatif/pecahan ditolak UI/API                                                                                                                                                                                              | FR-PP-001, BR-003                 | M3                                                |
| AC-004 | 10/8/7 → total 25; nilai client total tidak mengubah hasil backend                                                                                                                                                                   | FR-PP-002, BR-004                 | M3; teknik backend PROPOSED                       |
| AC-005 | Pickup sukses dengan bukti sesuai aturan disetujui → record/attachments tersedia, PICKED_UP                                                                                                                                          | FR-PP-004–006                     | M3; exception signature OQ-07                     |
| AC-006 | Empat foto didukung; jika batas UI sementara empat disetujui, foto kelima ditolak tanpa menghapus foto valid                                                                                                                         | FR-PP-003, BR-006                 | M3; penolakan bersyarat OQ-08                     |
| AC-007 | Tiga task total 10/15/8 → rincian tiap task/customer/kategori dan pickup session total 33                                                                                                                                            | FR-HO-002/003                     | M4; creator/staff mengikuti policy                |
| AC-008 | Keikutsertaan task lintas sesi mengikuti OQ-24/25; full-only + exclusive → penambahan kedua ditolak                                                                                                                                  | FR-HO-004/008, BR-013             | M4; partial membutuhkan AC alokasi yang disetujui |
| AC-009 | Semua kategori cocok → VERIFIED, verifier/waktu tersedia                                                                                                                                                                             | FR-RV-003/004/006                 | M4                                                |
| AC-010 | 10/8/7 versus 10/7/7 → DISCREPANCY; delta Cashless −1 bila delta diterapkan                                                                                                                                                          | FR-RV-003–005                     | M4                                                |
| AC-011 | 10/8/7 versus 11/7/7 → DISCREPANCY meski total sama                                                                                                                                                                                  | FR-RV-003/004, BR-009             | M4                                                |
| AC-012 | Discrepancy tanpa notes bermakna → ditolak                                                                                                                                                                                           | FR-RV-005, BR-010                 | M4                                                |
| AC-013 | Ada PENDING → close ditolak                                                                                                                                                                                                          | FR-HO-006, BR-011                 | M4                                                |
| AC-014 | Semua item diperiksa dan discrepancy tercatat → close boleh; discrepancy tetap terlihat, bukan resolved                                                                                                                              | FR-HO-006, FR-MO-003, BR-012      | M4/M6                                             |
| AC-015 | Retail verification/koreksi sah tidak mengganti original pickup quantities/customer/signature/foto                                                                                                                                   | FR-RV-002/007, BR-008/020         | M4                                                |
| AC-016 | Akses/recording task petugas lain tanpa hak ditolak; daftar/detail takeover eligible hanya sesuai scope, recording baru boleh setelah assignment berpindah                                                                           | FR-WS-001/006, FR-PU-010, NFR-002 | M1                                                |
| AC-017 | Retry finalisasi sesudah timeout tidak menggandakan hasil logis                                                                                                                                                                      | FR-PP-007, NFR-005                | M3; PROPOSED                                      |
| AC-018 | Pengguna tanpa hak tidak dapat melihat/download bukti                                                                                                                                                                                | FR-PP-005                         | M3                                                |
| AC-019 | Master berubah; history tetap memakai snapshot task yang sesuai                                                                                                                                                                      | FR-CU-003                         | M1/M6; PROPOSED                                   |
| AC-020 | History menghubungkan task/bukti/session/verification dan actor/waktu sesuai akses                                                                                                                                                   | FR-MO-001–006                     | Bertahap; lengkap M6                              |
| AC-021 | Kunjungan tanpa paket dicatat sebagai attempt sesuai policy, tanpa Proof of Pickup sukses/PICKED_UP fiktif; cancel sebelum eksekusi terpisah                                                                                         | FR-PU-008/009, BR-019             | M2–M3; metode OQ-05/06                            |
| AC-022 | Koreksi authorized menyimpan original, actor, waktu, reason, perubahan; perbedaan fisik tidak dihapus melalui koreksi kosmetik                                                                                                       | BR-020/021, FR-PP-009, FR-RV-009  | M3–M4; mekanisme OQ-10/13                         |
| AC-023 | Signature tidak tersedia atau total nol mengikuti keputusan bisnis; tanpa exception disetujui tidak ada finalisasi sukses palsu                                                                                                      | FR-PP-004/006, BR-019             | M3; OQ-06/07                                      |
| AC-024 | Creator, eligibility, membership, partial dan mixed-staff mengikuti policy yang disetujui; tidak ada double-count/pelepasan hasil final diam-diam                                                                                    | FR-HO-001/002/004/007/008         | M4; OQ-11/24–27                                   |
| AC-025 | Petugas mengambil alih task eligible tanpa approval CS; assignment berubah, workspace lama/baru sesuai; actor/waktu dan asal assignment terlacak; concurrent/stale takeover tidak memberi dua sukses dan submit petugas lama ditolak | FR-PU-010, FR-WS-006, BR-022      | M1; eligibility OQ-29, safeguards PROPOSED        |
| AC-026 | Pickup sukses final memicu receipt WhatsApp atau email ke customer yang ditetapkan, dengan jumlah kategori/total dan bukti sesuai pickup; create/takeover/attempt tanpa paket tidak memicu receipt sukses                            | FR-NT-001/002, BR-023             | M3; format/kanal/pengiriman OQ-30                 |
| AC-027 | Receipt gagal/retry tidak menggandakan pickup; status kirim jujur dan akses bukti terbatas; koreksi menjaga versi receipt awal dan mengikuti aturan revisi                                                                           | FR-NT-003–005, BR-024             | M3; PROPOSED, OQ-30/31                            |

PROPOSED release gate: AC relevan lulus, policy blocking pada scope release disetujui, UAT dan kesiapan production selesai. UAT M1 tidak membutuhkan seluruh AC M2–M6. M4 merupakan alur on-demand lengkap; V1 dengan regular membutuhkan M5, dan monitoring lengkap M6.

## 18. Implementation Milestones

Seluruh rencana milestone PROPOSED. Pengujian yang ditulis di sini adalah spesifikasi fungsional, bukan kode test. DoD setiap milestone: UI/API dalam scope berfungsi, validation/authorization backend dan jejak tindakan tersedia, pengujian terkait serta regression terdampak lulus, walkthrough dengan pengguna relevan, error tidak memberi false success. Tidak perlu mengulang seluruh suite tanpa perubahan/risiko yang relevan.

M2 dan M3 dipertahankan sebagai batas kebutuhan agar outcome tidak tertukar dengan bukti. Untuk solo developer, **direkomendasikan satu iterasi implementasi M2–M3 dengan dua checkpoint**: outcome dan bukti. M2 sendiri tidak boleh menjanjikan pickup sukses final tanpa M3. Tidak dibutuhkan API/layer arsitektur tambahan hanya untuk memisahkannya.

### M1 — Customer and Pickup Task

- **Tujuan bisnis:** CS memberi pekerjaan on-demand yang jelas; petugas melihat tujuan dan dapat langsung mengambil alih task eligible petugas lain.
- **Scope minimum:** login, akun/petugas aktif dan role sederhana; customer search/create minimum; alamat/kontak task; create on-demand, assign, list/detail; daftar/detail sendiri mobile serta daftar takeover dan tindakan Ambil Alih tanpa approval CS. PROPOSED snapshot dan audit create/assign/takeover sederhana.
- **User stories:** CS memilih/membuat customer, waktu dan assign; petugas membuka tugas sendiri; petugas lain menemukan task eligible dan langsung mengambil alih tanpa menunggu CS.
- **Acceptance criteria:** AC-001/016/025; customer/waktu/alamat valid; staff aktif; SCHEDULED sebelum assign, ASSIGNED sesudah assign; takeover mengubah assignment tanpa status baru; AC-019 bila snapshot disetujui.
- **DoD:** create → assign → detail → takeover berfungsi; backend menjaga scope/eligibility; actor/waktu/petugas lama–baru terlacak; perpindahan bersamaan tidak menghasilkan dua pemilik; pengujian terkait dan walkthrough CS–petugas selesai.
- **Functional tests:** customer/task valid; field minimum invalid dan staff nonaktif ditolak; daftar takeover sesuai scope; takeover tanpa approval CS; workspace kedua petugas diperbarui; concurrent/stale takeover aman; recording oleh non-assignee ditolak saat M3 tersedia; snapshot bila diterapkan.
- **Exclusions:** cancel/reschedule/reassignment oleh CS jika policy belum disetujui; execution outcomes, bukti, signature/foto/receipt, handover, recurring, dashboard, multi-address module, migrasi production. Direct takeover tetap termasuk M1.
- **Blocking decisions:** field/alamat OQ-03/28, access/scope OQ-01/02, timezone OQ-15a, serta eligibility/batas takeover OQ-29. Build internal dapat memakai default PROPOSED tertulis; operasional perlu konfirmasi. Approval CS untuk takeover sudah diputuskan tidak diperlukan.

### M2 — Pickup Execution

- **Tujuan bisnis:** petugas mencatat hasil kunjungan dan membedakan kunjungan tanpa paket dari sukses serta pembatalan awal.
- **Scope minimum:** workspace/detail lanjutan, waktu/actor attempt, outcome/reason sesuai OQ-05; jalur sukses menuju recording M3; tindakan cancel/retry hanya setelah policy disetujui.
- **User stories:** petugas melaporkan lokasi tutup/paket belum siap; CS melihat attempt dan melakukan tindak lanjut yang diizinkan; petugas dengan paket menuju bukti sukses.
- **Acceptance criteria:** AC-021; OQ-05 diterapkan konsisten; unsuccessful tidak menghasilkan PICKED_UP; cancellation awal dapat dibedakan; M2 tanpa M3 hanya checkpoint internal untuk sukses.
- **DoD:** outcome tidak kehilangan actor/waktu/reason; status dan list sesuai alternatif terpilih; M1 tetap berfungsi; pengujian cabang dan walkthrough petugas/CS lulus.
- **Functional tests:** lokasi tutup, customer tidak tersedia, paket belum siap, pembatalan di lokasi dan tidak ada paket; tidak ada record sukses otomatis; cancel sebelum eksekusi terpisah; retry menjaga attempt awal; unauthorized outcome ditolak.
- **Exclusions:** status perjalanan/GPS, route planning, automatic reschedule, signature untuk attempt tanpa paket, bukti sukses final sebelum M3.
- **Blocking decisions:** OQ-05 lifecycle/penutupan/retry; OQ-04 jika cancel disertakan; OQ-06 klasifikasi tanpa paket. Tidak menunggu handover atau schedule.

### M3 — Proof of Pickup

- **Tujuan bisnis:** bukti pickup sukses lengkap, aman dan terlacak; customer menerima receipt jumlah paket dan bukti sesudah pickup berhasil.
- **Scope minimum:** tiga quantities, total otomatis, customer/staff/waktu, notes, foto existing, signature, review, finalisasi, detail bukti; receipt melalui WhatsApp atau email sesuai kanal yang disepakati; status pengiriman/tindak lanjut minimum; koreksi jika disetujui.
- **User stories:** petugas merekam bukti; customer menandatangani dan menerima receipt setelah sukses; CS/supervisor melihat hasil/status kirim sesuai hak; actor authorized mengoreksi tanpa menghilangkan original.
- **Acceptance criteria:** AC-003–006/017/018/022/023/026/027 sesuai policy; finalisasi sukses → PICKED_UP; receipt jumlah/bukti sesuai versi pickup; create/takeover/unsuccessful tidak memicu receipt sukses.
- **DoD:** recording/files dan receipt ke kontak uji yang diotorisasi bekerja, pengiriman gagal terlihat, retry aman, original terlindungi; provider/kanal dan akses bukti disetujui; pengujian terkait/regression lulus. Pengujian tidak mengirim pesan ke customer nyata tanpa otorisasi.
- **Functional tests:** quantities/total, foto/signature, zero-total/exception, upload gagal, retry; petugas lama setelah takeover ditolak; koreksi menyimpan original/reason; pickup sukses memicu receipt pada kanal terpilih; kontak invalid/provider gagal/retry tidak menggandakan pickup; akses receipt customer terbatas; receipt revisi sesuai policy. Uji pengiriman menggunakan test double/sandbox atau penerima uji yang diotorisasi.
- **Exclusions:** AWB/package records, offline sync, handover, dispute module, multi-level approval.
- **Blocking decisions:** OQ-06–10 finalisasi/exception/koreksi; OQ-30 kanal/kontak/pengiriman/akses receipt dan OQ-31 revisi receipt. Happy path/draft dapat dibangun sebelum provider dipilih; M3 lengkap tidak dianggap selesai tanpa receipt yang disepakati. Tidak menunggu M4 dan tidak mewajibkan dua kanal sekaligus.

### M4 — Handover and Retail Verification

- **Tujuan bisnis:** menyelesaikan pengembalian pickup sampai penerimaan fisik per task/kategori dan close yang benar.
- **Scope minimum:** preparation, session draft dengan beberapa task/customer, detail kategori/total, retail quantities terpisah, VERIFIED/DISCREPANCY, notes, verifier/time, close; membership/creator sesuai policy; koreksi retail minimum bila disetujui.
- **User stories:** petugas menyiapkan daftar; creator berhak mengelompokkan; retail memeriksa tiap task/kategori dan mencatat selisih; retail close setelah lengkap; supervisor melihat discrepancy termasuk CLOSED.
- **Acceptance criteria:** AC-007–015/022/024; CLOSED tidak resolved; partial/mixed-staff diuji sesuai keputusan, tidak diasumsikan dilarang.
- **DoD:** alur on-demand CS → pickup/bukti → handover → verifikasi → CLOSED berjalan untuk matched dan discrepancy; original terjaga; concurrency tidak overwrite; UAT CS/petugas/retail dan pengujian terdampak lulus.
- **Functional tests:** tiga task total 33; dua task customer sama tetap terpisah; category matched/kurang/lebih; total sama kategori beda; notes kosong ditolak; PENDING menghalangi close; discrepancy terdokumentasi boleh close; submit bersamaan ditangani; correction/reopen mengikuti policy; eligibility/duplicate/partial/staff/membership sesuai keputusan.
- **Exclusions:** resolution/dispute module, liability/finance, approval matrix, reopen otomatis, constraints full-only yang belum disetujui.
- **Blocking decisions:** OQ-11–14/24–27 dan penanganan paket hilang yang relevan. Jika partial disetujui, tambah scope alokasi minimum melalui change review sebelum membangun constraint; tidak langsung memperluas menjadi shipment tracking.

### M5 — Regular Scheduling

- **Tujuan bisnis:** task regular dibuat otomatis tanpa duplikasi dan memakai workflow yang sama.
- **Scope minimum:** schedule customer/hari/waktu, aktif/nonaktif, edit, auto generation, occurrence identity, assignment; manual Generate hanya jika disetujui.
- **User stories:** CS menentukan schedule, mengubah/menonaktifkan, melihat task hasilnya; petugas menjalankan generated task seperti on-demand.
- **Acceptance criteria:** AC-002; schedule inactive tidak generate; retry/concurrent generation tidak duplikat; perubahan tidak merusak history; integrasi workflow berlaku ketika M2–M4 tersedia.
- **DoD:** basic schedule dan job bekerja, kegagalan terdeteksi, occurrence sesuai aturan yang disetujui, affected tests lulus; integrasi sampai retail diuji bila M4 tersedia.
- **Functional tests:** hari/waktu benar; repeat/concurrent job menghasilkan satu occurrence; inactive; edit schedule; cancelled occurrence tidak digenerate ulang kecuali policy; late job/holiday/overlap mengikuti pilihan sederhana yang disetujui; generated task dapat diassign.
- **Exclusions:** exception calendar kompleks, auto-dispatch, workload/route optimization, default staff wajib, dashboard sebagai dependency.
- **Blocking decisions:** OQ-15–17, snapshot alamat schedule/task yang relevan. Dependency teknis customer/task M1, bukan harus seluruh M2–M4 selesai. Aturan libur/catch-up minimum diperlukan; UI exception lanjutan dapat ditunda.

### M6 — Monitoring and History

- **Tujuan bisnis:** operasional menelusuri pekerjaan dan discrepancy tanpa membaca transaksi satu per satu.
- **Scope minimum:** dashboard ringkas, filter, history pickup/handover, dua set quantities, versi koreksi bila tersedia, discrepancy monitoring, actor/time.
- **User stories:** CS melihat kebutuhan assignment; retail melihat menunggu pemeriksaan; supervisor menelusuri selisih/riwayat termasuk sesi closed.
- **Acceptance criteria:** AC-014/019/020; angka sesuai detail dan basis tanggal; attempt bukan sukses; CLOSED dengan selisih tetap terlihat; scope akses terjaga.
- **DoD:** ringkasan/filter konsisten, pagination dan volume representatif diuji, perbandingan detail/summary serta UAT lulus; tidak menciptakan audit baru karena data dasar seharusnya sudah dicatat.
- **Functional tests:** filter customer/staff/type/date/status; waiting berbeda verified; discrepancy pada closed; snapshot/versi original; akses lintas scope ditolak; summary sesuai contoh dan granularity; history actor/waktu/bukti tersedia.
- **Exclusions:** BI/report builder, predictive analytics, ERP integration, discrepancy resolution, SLA baru yang belum disetujui.
- **Blocking decisions:** OQ-23 basis tanggal/definisi metrik; OQ-18 target volume untuk performance. Tidak menunggu target numerik KPI untuk membuat history sederhana; M5 hanya diperlukan untuk filter/data regular, bukan history on-demand.

## 19. Open Questions and Assumptions

### 19.1 Baseline yang dikonfirmasi

Dua jenis pickup; workflow bersama; petugas dapat beberapa customer; tiga kategori persis dan total otomatis; informasi customer/staff/waktu, notes/foto/signature pickup; retail quantity terpisah dan per task/kategori; discrepancy notes; original tidak silent-overwrite; close setelah pemeriksaan lengkap; CLOSED dapat tetap discrepancy; tanpa AWB/package-level tracking; stack dan akses operasional sederhana.

CONFIRMED tambahan dari klarifikasi pengguna: staff langsung mengambil alih task staff lain tanpa approval CS; setiap pickup berhasil dikonfirmasi ke customer melalui WhatsApp atau email sebagai receipt jumlah paket dan bukti pickup. Pemicu receipt setelah sukses sudah diputuskan; kanal/format/policy kegagalan belum diputuskan.

**Tidak termasuk baseline CONFIRMED:** full-only, task satu session, satu staff per session, retail satu-satunya creator, lock membership, larangan koreksi/reopen, signature tanpa exception, maksimum empat foto permanen, maupun PWA/offline. Semuanya tetap usulan/pertanyaan di bawah.

### 19.2 Rekomendasi yang belum disetujui

| Ref  | PROPOSED                                                                                                                                            |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-01 | Satu hasil final logis per task; original terlindungi; koreksi tertaut bila authorized                                                              |
| P-02 | Satu petugas per session untuk versi awal bila bisnis menyetujui                                                                                    |
| P-03 | Retail membuat sesi; preparation oleh petugas                                                                                                       |
| P-04 | Membership dikunci mulai verification                                                                                                               |
| P-05 | Snapshot identitas/alamat/kontak task; default alamat sederhana tanpa modul multi-address                                                           |
| P-06 | Cancel sebelum eksekusi dengan alasan; attempt mempunyai konteks terpisah                                                                           |
| P-07 | Retail input awal kosong, delta per kategori                                                                                                        |
| P-08 | Tidak ada offline sync atau full discrepancy-resolution module dalam implementasi awal                                                              |
| P-09 | Audit biasa, transactions/retry safeguards; constraint membership setelah business disetujui                                                        |
| P-10 | Pertahankan maksimum interface empat foto sementara                                                                                                 |
| P-11 | M2–M3 satu iterasi dengan dua checkpoint; M4 session/verifikasi dikirim bersama                                                                     |
| P-12 | Koreksi setelah close tertaut tanpa reopen otomatis; business tetap memutuskan                                                                      |
| P-13 | Takeover dibatasi task ASSIGNED sebelum eksekusi, dalam scope yang sama; perpindahan atomik dan audit petugas lama/baru; eligibility belum approved |
| P-14 | Receipt otomatis, satu kanal awal yang disepakati, akses bukti terbatas; kegagalan pengiriman ditindaklanjuti tanpa membatalkan pickup sukses       |

### 19.3 Keputusan menurut gate

Semua baris berikut OPEN. “Default” selalu **PROPOSED**, bukan keputusan approved. Kolom “Blokir sekarang” mengacu **M1 termasuk direct takeover**, bukan seluruh V1. “Ya untuk operasional; tidak untuk build asumsi” berarti development internal dapat memakai asumsi tertulis, tetapi implementasi tidak boleh dianggap telah memvalidasi policy. OQ-01–28 sumber revisi tetap dipertahankan; klarifikasi lanjutan menambahkan OQ-29–31.

#### A. Required before M1 — hanya keputusan langsung customer/task/assignment/akses

| ID                    | Keputusan diperlukan                                                                                                                                                                                 | Milestone           | Suggested default — PROPOSED                                                                                                          | Blokir sekarang?                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| OQ-01                 | Scope retail/outlet dan batas data/pengguna awal                                                                                                                                                     | M1; production      | Satu konteks operasional yang disetujui, tanpa multi-company                                                                          | Ya untuk operasional; tidak untuk internal build terbatas                       |
| OQ-02                 | Role dasar, pengelola customer/akun; multi-role sekarang diperlukan? Owner schedule dikonfirmasi saat M5                                                                                             | M1/M5               | CS customer/task; Admin akun; petugas task sendiri; retail verifikasi; supervisor read/monitor; satu role awal bila memadai           | Ya untuk otorisasi operasional; build memakai matriks sementara                 |
| OQ-03                 | Field wajib customer/task, kontak wajib atau opsional; perlu beberapa alamat tersimpan atau cukup alamat tiap task?                                                                                  | M1                  | Nama customer dan alamat task wajib; kontak bila tersedia; satu alamat per task, tanpa modul multi-address                            | Ya untuk kontrak data operasional; build dengan field minimum                   |
| OQ-15a (bagian OQ-15) | Timezone input/display waktu task manual                                                                                                                                                             | M1                  | Satu timezone retail dikonfirmasi; jangan otomatis memakai timezone perangkat developer                                               | Ya untuk waktu operasional; dapat dikonfigurasi saat internal build             |
| OQ-28a                | Dari mana alamat task awal dan siapa boleh mengisinya sebelum assign?                                                                                                                                | M1                  | CS menyalin default atau memasukkan alamat task; simpan snapshot                                                                      | Ya bila tujuan pickup belum dapat diidentifikasi; build dengan satu alamat task |
| OQ-29                 | Status/waktu/scope task yang boleh langsung diambil alih; apakah task attempted/sedang berjalan eligible; alasan wajib dan pemberitahuan petugas lama? Approval CS tidak diperlukan, sudah CONFIRMED | M1; integrasi M2–M3 | ASSIGNED sebelum eksekusi dalam scope yang sama; audit petugas lama/baru; alasan dan konfirmasi tindakan; tidak mengubah pickup final | Ya untuk release takeover; internal build dapat memakai batas PROPOSED          |

Keputusan multi-outlet/multi-role/multi-address lanjutan tidak harus dirancang seluruhnya sebelum M1. Yang perlu ditetapkan adalah konteks dan hak penggunaan awal serta data untuk tujuan pickup.

#### B. Required before M2–M3

| ID                    | Keputusan diperlukan                                                                                                                                                                                                                                          | Milestone                              | Suggested default — PROPOSED                                                                                                                      | Blokir sekarang?                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| OQ-04                 | Siapa cancel/reschedule/reassign melalui CS; kapan eksekusi mulai; reason dan tindakan setelah attempt? Hak direct takeover petugas telah CONFIRMED, batasnya OQ-29                                                                                           | M2 / fitur edit terkait                | CS sebelum eksekusi dengan reason; pasca-attempt diputuskan terpisah                                                                              | Tidak; kebijakan direct takeover M1 ditangani OQ-29 |
| OQ-05                 | Task mewakili request atau satu kunjungan; outcome tanpa paket; retry atau penutupan; apakah UNSUCCESSFUL diperlukan?                                                                                                                                         | M2                                     | Alternatif A jika task dicoba ulang, B jika satu kunjungan mengakhiri task                                                                        | Tidak; menghambat finalisasi outcome M2             |
| OQ-06                 | Total nol: attempt tanpa paket atau kasus bisnis lain; boleh sukses atau tidak?                                                                                                                                                                               | M2–M3                                  | Tanpa paket → attempt, bukan sukses                                                                                                               | Tidak; menghambat jalur zero-total                  |
| OQ-07                 | Exception signature ketika customer tidak mampu/menolak/tidak hadir; bukti dan otoritas apa?                                                                                                                                                                  | M3                                     | Signature normal; exception tidak dibuatkan bukti pengganti fiktif; policy ditetapkan bisnis                                                      | Tidak; menghambat acceptance exception M3           |
| OQ-08                 | Foto wajib/minimum, batas permanen, format/ukuran; apakah limit interface empat dipertahankan sementara?                                                                                                                                                      | M3                                     | Empat slot/batas sementara existing; minimum dan file limit ditentukan, tanpa angka baru yang dibuat-buat                                         | Tidak; menghambat kontrak bukti M3                  |
| OQ-09                 | Nama penandatangan dan hubungan dengan customer diperlukan?                                                                                                                                                                                                   | M3                                     | Nama penandatangan sederhana bila dibutuhkan; jangan tambah identifikasi kompleks                                                                 | Tidak; keputusan field signature                    |
| OQ-10                 | Siapa/kapan/field apa dapat mengoreksi pickup final; pengaruh salah customer/jumlah/signature dan baseline verifikasi?                                                                                                                                        | M3; integrasi M4                       | Original readonly, koreksi tertaut authorized dengan reason/actor/waktu; tanpa approval bertingkat                                                | Tidak; gate koreksi dan penggunaan operasional M3   |
| OQ-28b (bagian OQ-28) | Alamat/kontak berubah setelah assign atau customer salah ketika sudah dikunjungi: siapa konfirmasi tujuan dan koreksi?                                                                                                                                        | M2–M3                                  | Perubahan sebelum final terekam; petugas diberi perubahan; pasca-final mengikuti OQ-10                                                            | Tidak; jangan membuka edit alamat tanpa policy      |
| OQ-30                 | Receipt sesudah sukses: kanal WhatsApp/email atau pilihan salah satu, sumber/validasi kontak, otomatis/manual, sender/provider/template, isi/format/akses bukti, delivery status/retry; kontak tidak tersedia/invalid dan provider gagal ditangani bagaimana? | M3; konfigurasi production             | Satu kanal awal disetujui, kirim otomatis, akses bukti terbatas, status jujur; failed-send tidak membatalkan pickup, actor berhak menindaklanjuti | Tidak untuk M1; menghambat receipt M3 lengkap       |
| OQ-31                 | Pickup/customer/jumlah dikoreksi sesudah receipt: kapan/siapa mengirim revisi, ke kontak mana, bukti/versi apa, dan bagaimana menandai receipt lama?                                                                                                          | M3; integrasi M4 bila koreksi kemudian | Simpan versi awal; receipt revisi jelas terkait original setelah koreksi authorized; tidak silent-replace atau resend otomatis tanpa policy       | Tidak untuk M1; gate correction/receipt operasional |

#### C. Required before M4

| ID    | Keputusan diperlukan                                                                              | Milestone | Suggested default — PROPOSED                                                                                           | Blokir sekarang? |
| ----- | ------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------- |
| OQ-11 | Siapa creator/owner sesi; petugas boleh menyimpan draft sendiri?                                  | M4        | Retail create; petugas preparation list                                                                                | Tidak            |
| OQ-12 | Draft salah/ditinggalkan; pelepasan item dan penanganan paket hilang sebelum retail               | M4        | Draft dapat dibetulkan dengan jejak; jangan delete bukti atau menganggap paket diterima; owner kehilangan perlu bisnis | Tidak            |
| OQ-13 | Correction retail sebelum/sesudah close, hak reopen, baseline versi, review bila pickup dikoreksi | M4        | Revisi tertaut, original hasil/close tetap, tidak reopen otomatis                                                      | Tidak            |
| OQ-14 | Owner dan tindak lanjut discrepancy; cukup di luar aplikasi untuk V1?                             | M4        | Notes dan monitoring; follow-up operasional di luar aplikasi bila disetujui, tanpa klaim resolved                      | Tidak            |
| OQ-24 | Full-only atau partial handover; jika partial, jumlah bagian/sisa dan aturan perbandingan         | M4        | Full-only V1 jika sesuai operasional                                                                                   | Tidak            |
| OQ-25 | Task hanya satu sesi atau dapat beberapa penyerahan/sesi; kapan asosiasi aktif berakhir?          | M4        | Satu sesi aktif jika full-only; jangan global uniqueness sebelum approval                                              | Tidak            |
| OQ-26 | Sesi hanya satu staff atau boleh mixed-staff?                                                     | M4        | Satu staff awal bila disetujui                                                                                         | Tidak            |
| OQ-27 | Membership lock saat verification; aturan tambah/lepas setelah mulai                              | M4        | Lock saat mulai; perubahan luar draft harus eksplisit dan tercatat                                                     | Tidak            |

#### D. Required before M5

| ID                    | Keputusan diperlukan                                                             | Milestone | Suggested default — PROPOSED                                                                                                       | Blokir sekarang? |
| --------------------- | -------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| OQ-15b (bagian OQ-15) | Jam/frekuensi/horizon generation dan perlakuan occurrence terlewat/catch-up      | M5        | Generation sederhana dengan occurrence key stabil; jendela sesuai jam operasional yang dikonfirmasi                                | Tidak            |
| OQ-16                 | Libur/customer tutup, schedule overlap, perubahan schedule, occurrence CANCELLED | M5        | Basic hari/waktu; exception dikelola CS sesuai policy; edit tidak menghapus task; cancelled occurrence tidak dibuat ulang otomatis | Tidak            |
| OQ-17                 | Default petugas schedule diperlukan?                                             | M5        | Generated task dapat diassign CS; default staff opsional                                                                           | Tidak            |

Basic scheduling dapat dibangun tanpa exception calendar kompleks. Namun keputusan minimum tentang occurrence libur/terlewat tidak boleh diganti asumsi generator yang diam-diam menghilangkan atau menggandakan pekerjaan.

#### E. Required before Production

| ID    | Keputusan diperlukan                                                                                                              | Milestone / gate                        | Suggested default — PROPOSED                                                                                    | Blokir sekarang?                                        |
| ----- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| OQ-18 | Volume/concurrency, latency/availability, RPO/RTO; perangkat/browser operasional; siapa menerima validasi security sebelum rilis? | NFR; production                         | Uji volume/perangkat representatif dan akses sensitif; target bisnis sebelum production, tanpa angka spekulatif | Tidak                                                   |
| OQ-19 | Kualitas koneksi menuntut PWA/offline atau online-responsive memadai?                                                             | M2–M3 uji lapangan; production          | Online-responsive, error/retry jelas; evaluasi offline terpisah berdasarkan bukti                               | Tidak; bila offline wajib, scope release perlu ditinjau |
| OQ-20 | Retention data/foto/signature/audit, deletion/access historis, backup dan restore                                                 | Production                              | Backup database+bukti dan restore diuji; durasi/otoritas diatur bisnis                                          | Tidak                                                   |
| OQ-21 | Export/mapping/kualitas ERP; master dan history mana dipindah; archive/import?                                                    | Migrasi; production                     | Master esensial; history archive atau read-only berdasarkan kebutuhan yang disetujui                            | Tidak                                                   |
| OQ-22 | Task berjalan, waktu/cakupan cutover, owner, rekonsiliasi/rollback                                                                | Cutover; production                     | Satu owner system per transaksi, hentikan generation ganda                                                      | Tidak                                                   |
| OQ-23 | Target keberhasilan dan basis tanggal/denominator laporan                                                                         | M6 untuk definisi; rollout untuk target | Basis tanggal eksplisit per indikator; target setelah baseline                                                  | Tidak; definisi memblokir laporan M6 yang terkait       |

OQ-23 ditempatkan pada gate akhir karena target rollout bukan prasyarat transaksi. Definisi laporan tetap perlu sebelum laporan M6 dinyatakan benar. Gate E tidak menunda keamanan backend dasar yang sudah wajib M1.

### 19.4 Tata kelola keputusan minimum

PROPOSED: satu daftar keputusan sederhana berisi ID, owner operasional yang ditunjuk, pilihan, tanggal, alasan, requirement/AC/BR/milestone terdampak. Tidak membangun decision-management application. Jika default disetujui, update label hanya untuk cakupan yang disetujui; misalnya “empat foto pada V1 awal” tidak mengonfirmasi limit bisnis selamanya.

Pekerjaan independen tetap berjalan. Saat gate milestone belum diputuskan, tahan fitur yang bergantung padanya dan kerjakan bagian yang sudah jelas; jangan memperluas blocker ke seluruh proyek.

# Deliverable D — M1 Readiness Assessment

**Status: READY WITH ASSUMPTIONS** untuk mulai pengembangan internal M1 minimum. Status ini bukan persetujuan default operasional, kesiapan production, ataupun izin mulai coding pada tugas revisi dokumen ini.

| Area                                                   | Penilaian                                                                                                                                                                                                                                                      |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sudah CONFIRMED                                        | Authentication/access sederhana, customer master, CS create/assign, list/detail, petugas melihat tugas sendiri dan langsung takeover task petugas lain tanpa approval CS, mobile-responsive dan stack yang ditetapkan                                          |
| Keputusan yang benar-benar menjadi gate operasional M1 | Scope/hak akun OQ-01/02, field/alamat OQ-03/28a, timezone OQ-15a, eligibility/scope/batas takeover OQ-29                                                                                                                                                       |
| Asumsi build minimum PROPOSED                          | Satu konteks terbatas; matriks role; nama dan satu alamat task; kontak bila tersedia, snapshot; timezone configurable; customer/staff aktif; takeover ASSIGNED sebelum eksekusi dengan audit dan perpindahan atomik                                            |
| Dapat ditunda                                          | Cancel/reschedule/reassign oleh CS bila tidak dikirim; unsuccessful/status baru; total nol; signature/foto/receipt dan pilihan kanal/provider OQ-30/31; koreksi final; handover; recurring; dashboard/KPI; migrasi/production. Hak direct takeover termasuk M1 |

Asumsi build tidak boleh dijadikan alasan membuka akses seluruh outlet atau menampilkan waktu operasional tanpa timezone. Bila bisnis menolak default field/access, sesuaikan kontrak M1 sebelum pemakaian; tidak perlu menjawab seluruh pertanyaan M2–M6 dan production untuk memulai M1.

**Workflow end-to-end terkecil M1:** Admin menyiapkan akun → CS memilih/membuat customer → create on-demand dengan alamat/waktu → assign staff A → staff A melihat detail. Cabang takeover: staff B membuka daftar task eligible → langsung Ambil Alih tanpa approval CS → assignment berpindah ke B, task tetap ASSIGNED → B melihat detail untuk eksekusi dan A tidak lagi berhak merekamnya. Workflow berakhir pada task yang dapat dilaksanakan; bukti/receipt sesudah sukses tersedia M3.

**Acceptance criteria M1:**

1. Akun berhak dapat login; akses tanpa authentication ditolak.
2. CS dapat memilih/membuat customer dan membuat task valid; field minimum/alamat/waktu tidak valid ditolak backend sesuai kontrak sementara yang dinyatakan.
3. Assignment hanya kepada petugas aktif; status sebelum/sesudah assign konsisten.
4. Petugas melihat tugas sendiri dan daftar/detail takeover sesuai scope; akses/recording task petugas lain tanpa hak ditolak. Takeover eligible tanpa approval CS berhasil, assignment diperbarui, request bersamaan/stale tidak memberi dua sukses (AC-001/016/025).
5. Alamat, customer, waktu/timezone, kontak tersedia dan notes yang dilihat petugas sesuai task CS.
6. Creator, waktu create/assignment/takeover dan petugas lama–baru dapat ditelusuri; snapshot tidak berubah akibat edit master bila FR-CU-003 diterapkan.
7. Error create/assign tidak menghasilkan false success atau task ganda melalui retry jika safeguard terkait disetujui.
8. Pengujian fungsional M1 dan walkthrough CS–petugas lulus; acceptance M2–M6 tidak dijadikan gate M1.

**Kesimpulan kesiapan:** READY WITH ASSUMPTIONS untuk build internal M1 termasuk takeover; konfirmasi keputusan A termasuk OQ-29 sebelum penggunaan operasional. Receipt setelah sukses merupakan scope M3, tidak memblokir customer → task → assign → takeover/detail pada M1. Hand-over, unsuccessful, scheduling exceptions dan migration production tetap bukan prasyarat M1. Tidak ada aplikasi, migration, API implementation, test code, integrasi layanan, atau pesan customer nyata yang dibuat/dikirim dalam revisi ini.
