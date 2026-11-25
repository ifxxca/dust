# Reconciliation Workspace V2 — Automation First, audit, dan UAT

Revisi Automation First: 13 November 2026. Repository: `S:/2026/dust`.

## 1. Audit arsitektur sebelum perubahan

Ringkasan audit disampaikan di chat sebelum perubahan struktur. Mesin rekonsiliasi dipertahankan; tidak ada aplikasi, registry AWB, atau tabel audit baru.

| Area | Fondasi yang ditemukan | Perubahan / keputusan |
| --- | --- | --- |
| Unit rekonsiliasi | `ReconcileCustomerPickupDay` menggabungkan customer per hari retail; buku tetap memiliki hasil individu | Workspace mengikuti kelompok yang sama; tidak memecah atau mengubah jumlah buku |
| Baseline | POP efektif termasuk revisi; verifikasi gudang dan `needsReview()` | Eligibility memeriksa baseline terkini dan membandingkannya dengan hasil hitung |
| Atribusi | `MatchJneShipments`, kode customer, alias, tanggal, account scope, event pencocokan | Tetap digunakan; account bersama tidak otomatis menjadi identitas customer |
| Registry AWB | `jne_shipments` unik, dengan sumber dan observasi terpisah | Daftar investigasi membaca registry yang sama |
| Kategori | `ResolveJneCategories`, penanda Manual/Cashless/CSS-Orion dan bukti kategori | Tidak mengubah klasifikasi atau jumlah final lewat cherry-picking |
| Koreksi | `ReviewPickupAwbs` dan `ReviewJneExceptions`, versi optimistis, alasan, event | Batch ADD/REMOVE/CONFIRM memakai layanan tersebut; perhitungan ditunda sampai seluruh batch selesai |
| Sertim Cashless | Klaim AWB mencegah atribusi yang bertentangan | Kandidat konflik ditampilkan; mutasi tetap ditolak sampai koreksi Sertim yang sah |
| Kelengkapan | `AssessPickupReportCoverage` dan `QueryJneCollectionWindows` | Keputusan evaluator lama dipakai; panel baru menjelaskan report, kontrak, status, checksum, subset AWB, dan gap |
| Lifecycle lama | Jumlah sesuai dapat membentuk `DONE`/lock tanpa cakupan sumber; snapshot V2 masih meminta persetujuan manual | Snapshot kini otomatis, atomik, idempoten; cakupan sumber wajib sebelum lock dan dokumen |
| Dokumen | Manifest berversi, snapshot, checksum unduhan, render queue, delivery queue | Dipertahankan; bukti pasca-lock yang memerlukan review menahan dokumen baru dan pengiriman lanjutan |
| Preferensi customer | Versi preferensi, recipient, alasan perubahan, audit | Dipertahankan; tidak diaktifkan otomatis |
| Worker | Job rekonsiliasi unik per customer/hari dan transaksi | Dipertahankan; tidak menambahkan worker atau mekanisme retry baru |
| Otorisasi | Detail/koreksi rekonsiliasi hanya Admin aktif | Semua endpoint workspace mempertahankan pembatasan tersebut |

## 2. Gap dan struktur yang ditambahkan

Gap awal: pencarian terbatas pada kandidat belum terikat; tabel AWB minim; kelengkapan hanya memiliki pesan umum; auto-lock belum menyimpan snapshot sistem dan masih terpisah dari persetujuan manual; perubahan bukti setelah persetujuan belum mempunyai penanda tersendiri.

Implementasi menambahkan:

- `QueryReconciliationWorkspace`: read model investigasi, kategori, eligibility, kelengkapan, selisih, dokumen, dan riwayat.
- `ManageReconciliationWorkspace`: preview dan penerapan batch melalui koreksi lama, lock, serta reopen resmi.
- `ReconciliationWorkspaceController`: enam endpoint di namespace route `reconciliation-workspace`.
- Tiga komponen React: workspace, investigasi AWB, dan drawer bukti.
- Dua kolom JSON nullable pada **tabel gabungan yang sudah ada**: `approval_snapshot` dan `post_lock_change`.
- Audit tetap pada `pickup_customer_reconciliation_events`, `pickup_awb_review_events`, dan `jne_shipment_match_events`.

Dua kolom tersebut diperlukan karena `locked_at` lama tidak menyimpan persetujuan reviewer dan hasil hitung lama memang diperbarui worker. Tidak ada tabel duplikat.

**Migrasi belum diterapkan ke database produksi.** Migrasi baru:
`database/migrations/2026_11_13_025019_add_approval_snapshot_to_pickup_customer_reconciliations.php`.
Auto-lock menunggu jika kolom belum tersedia, dan UI menunjukkan prasyarat migrasi. Migrasi hanya dijalankan dalam database pengujian terisolasi (SQLite dan database MySQL baru dengan nama acak `reconciliation_test_*`, yang dihapus setelah pengujian). Tidak ada deploy, commit, push, atau perubahan `.env` dalam tugas ini.

## 3. Lifecycle dan eligibility

Alur utama: **impor → pencocokan aturan terverifikasi → hitung customer/hari/kategori → pembuktian sumber → AUTO_LOCK → snapshot/audit → dokumen**. `WAITING_SOURCE` menunjukkan penantian normal; `PROCESSING_FAILED` menunjukkan kegagalan pemrosesan; `IN_REVIEW` menunjukkan pengecualian; `LOCKED` dengan `approval.mode=AUTOMATIC` ditampilkan sebagai Terkunci otomatis. Status hasil hitung lama tetap tersedia sebagai `calculation_status`.

VERIFIED memerlukan:

1. Hasil gabungan terkini, anggota dan input sesuai, serta status perhitungan DONE.
2. Baseline POP final dan gudang sah, revisi tidak menunggu review, customer aktif, dan jumlah per kategori konsisten.
3. Kelengkapan sumber dari evaluator yang ada terbukti untuk seluruh buku.
4. Atribusi customer/pickup dan kategori konsisten.
5. Tidak ada review terbuka atau barang pending yang memblokir.

Lock otomatis memeriksa revisi kelompok serta versi input dan sumber terkini, memakai jalur transaksi snapshot yang sama dengan lock manual. Aktor audit adalah Sistem (`id=null`, `mode=AUTOMATIC`, event `AUTO_LOCK`); tidak memerlukan persetujuan manusia. Endpoint lock manual tetap membatasi Admin aktif, alasan, revisi, fingerprint, dan token sumber untuk kompatibilitas, tetapi bukan aksi utama UI. Transaksi mengunci customer, kelompok, buku, hasil, dan AWB; perubahan sumber sejak peninjauan ditolak. Pengiriman berstatus SENDING/UNKNOWN menahan keputusan yang berpotensi bertentangan.

Snapshot otomatis/manual menyimpan customer, tanggal retail, referensi buku, baseline, kategori, AWB dan referensi sumber, pengecualian, bukti cakupan, reviewer, waktu, alasan, versi, dan fingerprint. Snapshot tidak ditimpa oleh kalkulasi berikutnya.

Reopen resmi memerlukan versi dan alasan, menyimpan persetujuan lama ke audit, lalu membuka **hasil rekonsiliasi** untuk review. POP final, jumlah handover, dan sesi handover tertutup tidak dibuka atau diubah.

## 4. Investigasi dan cherry-picking

- Daftar default **Perlu tindakan** menyembunyikan AWB yang sudah terverifikasi. Daftar seluruh bucket, kandidat sumber, AWB dikeluarkan, dan snapshot tetap tersedia sebagai tampilan sekunder.
- Rekomendasi dibatasi pada bukti terkait bucket dan diurutkan berdasarkan AWB scan/Sertim, referensi pickup persis, lalu identitas customer terverifikasi pada hari operasional yang sama. Kesamaan jumlah tidak dipakai sebagai bukti identitas.
- Tabel menampilkan AWB, pengirim report, dan penerima; urutan biasa berdasarkan penerima A–Z sebelum pagination. Rekomendasi mendahulukan peringkat bukti, lalu penerima.
- Filter server: AWB/pengirim, account, kategori, sumber, report, status pencocokan, dan hari retail kandidat.
- Hasil 30 AWB per halaman; pencarian dilakukan melalui tombol/submit, bukan setiap huruf.
- Kandidat boleh berasal dari customer lain, termasuk yang sudah terikat, agar konflik dapat diperiksa.
- Pencarian tanggal terdekat tidak memberikan izin memindahkan AWB lintas hari. Jalur pending lama tetap digunakan untuk pengecualian yang tercatat.
- Pilihan bertahan antarhalaman/filter, maksimal 100 AWB; tidak ada penyimpanan saat checkbox dipilih.
- Preview menunjukkan customer sebelum/sesudah, pickup tujuan, kategori, dampak ikatan, referensi report/baris, konflik, dan kebutuhan review ulang.
- Preview memiliki hash. Apply memeriksa ulang alasan, target, revisi kelompok, versi buku/AWB, sumber, dan hash preview.
- ADD memasukkan AWB belum terikat; REMOVE mengeluarkan asosiasi tanpa menghapus sumber; CONFIRM mengonfirmasi atribusi yang sudah berada pada target.
- Pemindahan dari pickup lain harus melalui koreksi asal yang diaudit. Sertim yang bertentangan tidak dapat dilewati.
- Seluruh batch atomik; satu konflik menggagalkan batch. Koreksi sah menyelesaikan penanda review dan langsung menghitung ulang; bila semua syarat terpenuhi, snapshot dikunci otomatis tanpa langkah persetujuan kedua.

Drawer AWB memuat identitas, metode/penjelasan pencocokan, kandidat dari logika yang tersedia, report/baris sumber, tanggal input/import, dan riwayat atribusi berhalaman. Tidak ada confidence score buatan atau raw JSON besar pada tampilan utama.

## 5. Kelengkapan sumber dan selisih

Status cakupan: COMPLETE, INCOMPLETE, PENDING, FAILED, UNKNOWN. COMPLETE berasal dari evaluator kontrak/pengesahan lama, bukan sekadar status import berhasil.

Panel menunjukkan kebutuhan kontrak yang terdaftar, tanggal, percobaan/import sukses terakhir, status import/proyeksi, jumlah baris, jumlah AWB bucket dalam report, checksum, serta alasan pemblokir. Requirement kontrak bukan otomatis bukti bahwa semua customer pada account tersebut adalah customer yang sedang ditinjau.

Report AWB terpilih/Upload Connote dijelaskan sebagai subset yang tidak membuktikan cakupan harian penuh, meskipun seluruh AWB di dalamnya cocok. Requirement belum terkonfigurasi tetap UNKNOWN. Data target/observasi yang belum tersedia ditampilkan `—`, bukan nol buatan.

Selisih kategori menampilkan kekurangan/kelebihan terkonfirmasi setelah cakupan sumber terbukti. Penantian sumber normal tidak dimasukkan sebagai pengecualian operator. Case customer belum dikenal, atribusi ambigu, kategori belum sah, bukti konflik, AWB batal, dan sumber belum siap dikelompokkan dengan contoh AWB terkait yang dapat dibuka langsung. Hasil lama yang inputnya berubah diberi label perlu hitung ulang. Atribusi/kategori belum konsisten, source incomplete, input belum dihitung, pending, dan perubahan pasca-lock tetap terlihat sebagai pemblokir. AWB canonical unik; duplikasi baris report tidak dibuat menjadi paket tambahan.

## 6. Perubahan setelah lock

Import Hybrid/APEX tetap berjalan. Perhitungan berikutnya membandingkan fingerprint material dengan snapshot. Penantian/kegagalan report terbaru saja tidak membuktikan bahwa hasil terkunci bertentangan; status sumber tetap ditampilkan terpisah. Perubahan yang berdampak menghasilkan event POST_LOCK dan penanda review; perubahan yang sama tidak membuat event berulang.

UI juga dapat mendeteksi perbedaan bukti hidup saat dibuka sebelum worker selesai mencatat event. Snapshot persetujuan tetap utuh. Jika bukti kembali identik secara material dengan snapshot dan seluruh syarat/kelengkapan kembali terbukti, sistem mencatat POST_LOCK_RESOLVED dan menghapus penanda perhatian otomatis. Jika hasil perlu diubah, Admin harus membuka koreksi resmi; snapshot lama tetap tersimpan.

Perubahan tracking biasa yang tidak mengubah atribusi, kategori, atau validitas AWB tidak dianggap selisih paket. Versi/sumber sebelum lock diperiksa otomatis dalam transaksi; keputusan manual yang memakai token stale tetap ditolak.

## 7. Dokumen dan pengiriman customer

Dokumen dan pengiriman ditampilkan sebagai dua bagian terpisah, termasuk versi, waktu, status, unduhan, tujuan, percobaan, serta kegagalan. Preferensi customer dan flag pengiriman eksternal dipertahankan.

**Aturan Automation First:** engine membuat manifest dari snapshot otomatis setelah baseline, kelengkapan, atribusi, kategori, dan versi sah. Tidak menunggu persetujuan reviewer. Metadata dokumen yang telah dikunci bersumber dari snapshot tersimpan; pembaruan nama penerima pada report tidak menghasilkan versi dokumen baru secara diam-diam.

Sesudah ada lock dan penanda perubahan yang memerlukan review, engine menahan pembuatan versi manifest baru dan delivery worker menolak pengiriman lanjutan. Dokumen/snapshot lama tetap disimpan. Tidak ada email atau notifikasi eksternal yang dikirim selama pengujian.

## 8. UI dan performa

Tujuh bagian: Ringkasan, Kategori, AWB perlu tindakan, Selisih, Bukti sumber, Dokumen, Riwayat & lock.

Desktop menggunakan workspace lebar dengan tabel dan kolom bukti opsional. Mobile menggunakan selector bagian, kartu AWB, serta bottom sheet. Screenshot diperiksa dan navigasi mobile yang semula rapat sudah diperbaiki. Label kontrol, fokus, konfirmasi, error/loading/empty state, dan target sentuh diperiksa.

Metadata report dikumpulkan secara batch. Query daftar AWB tetap terbatas terhadap jumlah baris yang ditampilkan. Snapshot lengkap tidak dikirim dalam payload ringkasan/riwayat: daftar snapshot dilihat lewat pagination. Membuka workspace atau drawer tidak memanggil kalkulasi/mutasi rekonsiliasi.

## 9. Hasil pengujian sebelum revisi Automation First (riwayat)

- Pest: **94 pengujian terkait**, termasuk **28 pengujian workspace**, lulus pada SQLite terisolasi. Cakupan: jumlah cocok/sumber tidak lengkap, unknown, kurang/lebih, kategori/atribusi ambigu, shared account, preview/batch, duplikasi pilihan, versi/sumber berubah, batas tanggal, otorisasi, audit, lock/reopen, snapshot tetap, post-lock, penahanan delivery, pagination dan query count.
- Browser: **8 alur lulus**, termasuk loading/error recovery, pencarian eksplisit, pemilihan antarhalaman, preview konflik, drawer bukti, persetujuan, snapshot readonly, dan mobile 390px. Hasil akhir di `output/reconciliation-workspace-20261113/browser-results.json`. Pengujian memakai database fixture baru dan server localhost sementara, bukan database produksi.
- Frontend: **4 pengujian unit lulus** untuk pesan konflik/validasi, respons tak terbaca/network, dan perbedaan unknown dengan nol. TypeScript web/mobile, lint TS/TSX yang diubah, formatter PHP, dan build web/PWA **lulus**.
- Ini bukan uji beban produksi atau uji multiproses MySQL. Perlindungan versi/source token diuji melalui perubahan yang bersaing; transaksi dan row lock mengikuti pola aplikasi. Infrastruktur/worker produksi tidak direstart.

Reproduksi backend dengan ekstensi CLI yang dipakai:

```powershell
php -d extension=pdo_sqlite -d extension=sqlite3 vendor/bin/pest tests/Feature/ReconciliationWorkspaceTest.php --compact
```

Fixture browser: set `APP_ENV=testing`, `UI_UX_DATABASE` ke **file SQLite baru di dalam output project**, lalu jalankan `tests/Fixtures/reconciliation-workspace.php`. Set `RECONCILIATION_QA_IDS` ke berkas `.sqlite.ids.json` hasil fixture, kemudian jalankan `node tests/Browser/reconciliation-workspace.mjs`. Runner membatasi origin localhost, menjalankan server SQLite sementara, dan menghentikannya setelah selesai.

## 10. Keputusan bisnis yang masih diperlukan

1. **Exception lock** dengan selisih diakui belum diimplementasikan; perlu otorisasi bisnis eksplisit.
2. **Disputed / investigasi lanjutan sebagai status baru** belum diaktifkan karena kebijakan izin dan penyelesaiannya belum tersedia. Aksi koreksi yang ada tetap dapat digunakan oleh Admin.
3. **Akses staff selain Admin** belum diperluas. Perlu matriks izin terpisah jika staff retail/pickup akan diberi akses investigasi.
4. **Kebijakan Automation First sudah ditetapkan**: persetujuan reviewer bukan prasyarat normal. Baseline, cakupan, atribusi, kategori, versi, dan ketiadaan pemblokir adalah prasyarat otomatis.
5. Penerapan migrasi dan deploy hanya setelah izin terpisah.

## 11. Checklist UAT operasional

- [ ] Buka customer dengan dua pickup sehari: baseline gabungan benar, referensi buku dan rincian kategori dapat ditelusuri.
- [ ] Jumlah cocok tetapi source UNKNOWN/INCOMPLETE: tidak ada label VERIFIED dan lock ditolak.
- [ ] Tinjau report Upload Connote: alasan subset terlihat walaupun AWB yang ditemukan semuanya cocok.
- [ ] Cari AWB berbeda customer/shared account: atribusi asal tetap; konflik dan bukti dapat dibaca.
- [ ] Pilih AWB dari beberapa halaman/filter, tinjau semua pilihan, batalkan preview: tidak ada mutasi.
- [ ] Terapkan ADD/REMOVE/CONFIRM yang sah dengan alasan; event mencatat aktor, sumber, sebelum/sesudah dan versi.
- [ ] Coba AWB sudah terikat, Sertim berbeda, tanggal luar bucket, atau versi stale: ditolak atomik.
- [ ] Catat/selesaikan pending melalui editor buku lama; tidak mengubah jumlah POP/gudang final.
- [ ] Hasil lengkap otomatis menghasilkan satu AUTO_LOCK dengan aktor Sistem; tidak ada tombol persetujuan sebagai langkah wajib. Request stale dan pekerjaan bersamaan tidak menimpa snapshot.
- [ ] Impor setelah lock tetap berlangsung. Delivered/observasi ulang dan penantian report baru tidak menghasilkan POST_LOCK; tambahan AWB/konflik identitas, kategori, baseline, atau pembatalan menghasilkan POST_LOCK sekali per keadaan material. Snapshot lama tetap, dokumen menjadi REVIEW dan pengiriman tertahan.
- [ ] Reopen resmi dengan alasan; persetujuan lama tersedia pada audit dan sesi handover tetap tertutup.
- [ ] Periksa unduhan versi lama dan riwayat email tanpa mengaktifkan pengiriman customer.
- [ ] Periksa desktop dan HP: pencarian, pemilihan, drawer, keyboard/fokus, serta error/loading/empty state.
- [ ] Jalankan seluruh suite `php artisan test --compact` di lingkungan pengujian sebelum persetujuan deploy.

Referensi audit antarmuka: [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md), skill UI/UX Pro Max, dan komponen shadcn yang sudah terpasang.


## 12. Hasil revisi Automation First

Audit dilakukan sebelum perubahan. Pencocokan `MatchJneShipments`, klasifikasi `ResolveJneCategories`, alokasi bucket, batas retail 05.00–04.59, larangan backlog, Sertim, baseline efektif, dan izin Admin tetap dipakai. Tidak ada worker, queue, registry, atau mekanisme retry kedua.

- `ReconcileCustomerPickupDay` menahan kelompok pada WAITING_DATA ketika jumlah cocok tetapi cakupan belum terbukti. Lock otomatis dan snapshot menggunakan `ManageReconciliationWorkspace::lock`, setelah pembacaan versi/evidence terkini di bawah row lock customer/kelompok/buku/AWB. Job unik per customer/hari tetap dipakai; dua worker bersamaan diserialkan oleh transaksi database.
- `pickup.automation.auto_lock` default **true**. `pickup.automation.enabled` tetap menjadi gerbang antrean/scheduler yang sudah ada. Tidak mengubah konfigurasi runtime/worker produksi. Pengujian jalur manual lama secara eksplisit menonaktifkan auto-lock pada konfigurasi pengujian.
- Report lengkap baru, termasuk nol baris, mengantrekan ulang customer/hari dalam rentang tanggal terkait lewat job historical yang sudah ada, berhalaman 200 buku dan deduplikasi yang sama. Pemeriksaan berkala yang sudah ada tetap menjadi pemulihan jika invalidasi bertepatan dengan job aktif. Tidak menambah notifikasi operator untuk penantian normal.
- Cakupan lengkap boleh membuktikan nol AWB pada satu buku; kesamaan jumlah gabungan tetap wajib. Report subset dan kontrak belum terverifikasi tetap tidak cukup.
- Snapshot dan metadata penerima dokumen dipertahankan setelah lock. Material fingerprint membandingkan anggota, baseline/jumlah, identitas, kategori, status pencocokan, dan pembatalan; mengabaikan pergantian report ID, versi observasi, dan progres Delivered. Konflik material dicatat pada POST_LOCK tanpa menimpa snapshot. Konflik yang pulih sepenuhnya ditutup lewat POST_LOCK_RESOLVED; kegagalan renderer atau pengiriman yang terpisah tetap dipertahankan. Render yang sedang berjalan tidak dapat mengembalikan dokumen REVIEW menjadi READY.
- Koreksi valid di workspace maupun editor buku melanjutkan evaluasi otomatis. Reopen resmi tetap membutuhkan izin, alasan, dan revisi terkini; snapshot sebelumnya tetap berada dalam audit.
- UI: ringkasan inti empat nilai, pengecualian hanya saat relevan, penantian sumber terpisah dari kegagalan, daftar AWB bermasalah default, rekomendasi berbukti, snapshot/riwayat, dan drawer bukti. Penguncian manual dihapus dari alur utama.

Validasi revisi: **154 pengujian backend lulus**, termasuk pengujian dua proses pada **MySQL terisolasi** (satu snapshot dan satu manifest), rollback atomik saat penyimpanan snapshot gagal, versi stale, koreksi langsung auto-lock, ketidaklengkapan/kegagalan sumber, impor berulang, dan bukti terlambat. **4 pengujian frontend lulus**; pemeriksaan TypeScript web/mobile dan lint lulus. **7 alur browser desktop/mobile lulus** pada fixture SQLite, termasuk tidak ada persetujuan wajib, daftar pengecualian, pencarian eksplisit/error recovery, sumber AWB, snapshot readonly, koreksi antarhalaman yang otomatis mengunci ulang, dan layar mobile 390px.

Tidak menjalankan migrasi produksi, deploy, commit, push, pengiriman email/customer, atau restart worker dalam revisi ini. Jalankan seluruh suite `php artisan test --compact` di lingkungan pengujian sebelum rilis.
