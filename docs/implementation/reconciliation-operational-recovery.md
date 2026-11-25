# Reconciliation Operational Recovery

Tanggal pemeriksaan: 14 November 2026. Repositori: `S:/2026/dust`.

Pekerjaan lokal yang independen selesai. Engine matching, reconciliation, workspace dan auto-lock tidak diubah. Aktivasi penuh masih tertahan sertifikasi sumber; tidak ada kontrak verified yang dibuat, registry kemampuan diisi, atau worker operasional dijalankan.

## Status akhir

| Pekerjaan | Klasifikasi | Hasil |
|---|---|---|
| Audit migration approval snapshot | COMPLETE | Dua kolom JSON nullable; tidak mengubah jumlah, ownership atau audit existing |
| Migration pada database terisolasi | COMPLETE | Seluruh migration termasuk snapshot berhasil pada database MySQL sementara; upgrade SQLite mempertahankan record lama dan audit |
| Regresi auto-lock dan coverage | COMPLETE | 102 test SQLite lulus; termasuk import, matching, auto-lock, immutable snapshot, koreksi, late evidence, antrean nyata pada DB test dan source UNKNOWN |
| Concurrency MySQL | COMPLETE | MySQL 8.4.11; dua proses menghasilkan satu AUTO_LOCK dan satu manifest; replay kategori paralel tidak menggandakan perubahan |
| Harness concurrency | CODE_DEFECT — diperbaiki | Proses anak sebelumnya tidak menerima capability sintetis dan lokasi CSV test. Perbaikan hanya di harness/fixture test |
| Scheduler dan queue | COMPLETE | 33 test scheduling lulus; registrasi scheduler serta consumer antrean sesuai konfigurasi |
| Launcher existing dan prosedur start | READY_FOR_ACTIVATION | 13 test launcher Windows lulus; pemeriksaan CheckOnly tidak menjalankan service. Status ini bukan izin aktivasi |
| Sertifikasi Hybrid PM/Puman | BLOCKED_EXTERNAL_EVIDENCE | Census empat sampel cocok, tetapi definisi populasi, batas export dan representasi sampai cutoff belum disahkan |
| Sertifikasi APEX | BLOCKED_EXTERNAL_EVIDENCE | History tidak menyediakan total AWB; artifact pembanding dengan scope sesuai mengembalikan 404 pada bukti existing |
| Penyesuaian integrasi Hybrid/APEX | BLOCKED_EXTERNAL_EVIDENCE | Track C mensyaratkan evidence memadai. Syarat belum terpenuhi; source tetap UNKNOWN |
| Migration/kontrak/worker operasional | READY_FOR_ACTIVATION — bersyarat | Prosedur siap, pelaksanaan belum diizinkan dan masih bergantung penyelesaian sertifikasi sumber |

READY_FOR_ACTIVATION berarti langkah existing telah diperiksa dan didokumentasikan, bukan sistem sudah boleh dioperasikan penuh saat ini.

## Track A — bukti lokal

### Migration dan concurrency

Migration: `database/migrations/2026_11_13_025019_add_approval_snapshot_to_pickup_customer_reconciliations.php`.

`ApprovalSnapshotMigrationTest` menguji upgrade dari schema tanpa kolom snapshot pada record rekonsiliasi yang sudah memiliki jumlah, status DONE, revision, lock dan audit. Semua data tersebut tetap sama setelah migration; kedua kolom baru NULL. Sebelum migration, permintaan auto-lock mengembalikan PENDING_SCHEMA tanpa mengubah record.

`AutomaticReconciliationConcurrencyTest` memakai database bernama acak `reconciliation_test_<16 hex>`, terpisah dari database operasional. Seluruh migration dijalankan di database itu. Dua proses disinkronkan sebelum rekonsiliasi; hasilnya satu snapshot AUTO_LOCK, satu manifest, dan jumlah audit sesuai. Dua proses tambahan mengulang resolusi kategori; setiap perubahan hanya dicatat sekali. Database dan file gate test dibersihkan; pemeriksaan INFORMATION_SCHEMA sesudah test tidak menemukan database sementara tersisa.

Kegagalan awal concurrency bukan bukti cacat engine: proses anak boot ulang sehingga konfigurasi capability fixture pada induk tidak ikut terbawa, dan disk laporan menunjuk lokasi default. Perbaikan meneruskan root CSV test, memuat capability sintetis khusus test dan menetapkan waktu fixture induk. Guard APP_ENV=testing serta nama database terisolasi tetap berlaku. Fixture ini bukan sertifikasi source operasional.

File lokal yang berubah:

- `tests/Feature/ApprovalSnapshotMigrationTest.php` — regresi migration dan guard schema.
- `tests/Feature/AutomaticReconciliationConcurrencyTest.php` — lingkungan proses anak dan waktu fixture.
- `tests/Fixtures/reconciliation-lock-worker.php` — capability khusus fixture.
- Dokumen ini.

### Hasil pengujian

- Regresi SQLite: 102 PASS, 0 FAIL. File: ApprovalSnapshotMigrationTest, AutomaticReconciliationWorkspaceTest, PickupProcessingAutomationTest, JneCollectionProofTest, JneSourceCompletenessRecoveryTest, CombinedHybridReportTest, PickupReconciliationQueueTest, HistoricalReconciliationQueueTest.
- Retest migration dan concurrency setelah formatting: 2 PASS, 24 assertion; termasuk concurrency MySQL (18 assertion).
- Scheduling: JneReportSchedulingTest, 33 PASS, 174 assertion.
- Node launcher: 13 PASS, 0 FAIL/SKIP.
- Node collector proof: 6 PASS, 0 FAIL/SKIP; mencakup pagination tanpa total serta History tanpa metadata upstream.
- Total kasus berbeda yang lulus: 136 Laravel dan 19 Node. Retest tidak dihitung sebagai kasus baru.
- Pint lulus untuk tiga file PHP yang disentuh; suite aplikasi penuh belum dijalankan.

SQLite memakai `:memory:`, APP_ENV=testing, config cache test yang terpisah, mail/cache array dan queue sync/fake. Test antrean mengaktifkan driver database hanya di database test. Driver SQLite diaktifkan melalui `php -d extension=pdo_sqlite -d extension=sqlite3`, tanpa mengubah php.ini. E2E Laravel/Chromium dan launcher menggunakan fixture localhost/temporary, bukan service operasional.

### Scheduler dan worker

| Komponen | Konfigurasi existing yang diperiksa |
|---|---|
| Penarikan terjadwal | `jne-reports:queue-due` tiap menit, withoutOverlapping(10) |
| Antrean rekonsiliasi/dokumen | `pickups:queue-automation` tiap menit, withoutOverlapping(2) |
| Recovery | `pickups:queue-automation --recover` tiap lima menit, withoutOverlapping(2) |
| Queue dan cache | Keduanya database; retry_after queue 90 detik |
| Import/fanout | Consumer `default,reconciliation,documents,deliveries` |
| Rekonsiliasi | Consumer `reconciliation` |
| Dokumen/pengiriman | Consumer `documents,deliveries` |
| Notifikasi | Consumer `mobile-push` |
| PHP worker | Timeout launcher 75 detik; timeout job terkait 60–75 detik; memory 256 MB, max-jobs 100, max-time 3600; supervisor melakukan restart |
| Collector APEX | Konfigurasi concurrency 5 dan lease 300 detik |
| Frontend | Manifest build tersedia, file Vite hot tidak ada |

Antrean yang sama dapat dikonsumsi lebih dari satu worker; reservation queue dan penguncian database tetap dipakai. Import/default mengonsumsi antrean reconciliation/documents/deliveries juga tidak membuat antrean baru.

Batasan platform: PHP Windows yang diperiksa tidak memiliki pcntl. Laravel mengaktifkan alarm hard timeout hanya bila pcntl tersedia. Karena itu hubungan nominal timeout 75 < retry_after 90 tidak membuktikan proses macet pasti dihentikan. Rotasi max-time/max-jobs dan restart supervisor berlaku setelah kontrol kembali ke worker. Ini perlu diperhitungkan dalam keputusan operasional; tidak dilakukan perubahan supervisor atau pembuktian fault-injection proses macet pada tugas ini.

Flag operasional yang terbaca: automation=true, auto_lock=true, send_enabled=false. Itu nilai existing, tidak diaktifkan oleh tugas ini. Tidak ada flag auto-lock baru yang dibuat. Pemeriksaan scheduler menggunakan schedule:list, bukan schedule:run; CheckOnly tidak memulai consumer, koleksi atau pengiriman.

## Track B — sumber dan batas bukti

Evidence asli yang dipakai berasal dari verifikasi read-only 13 November 2026:
`storage/app/private/jne-worker/m1-live-source-evidence.json`.
SHA-256 tetap `1e2f7b509199921cb9133d01871d00ef448da3ec86b40b372c016adac61c5580`.

| Sampel | Census UI / CSV live | Artifact tersimpan yang diperiksa ulang |
|---|---:|---|
| Puman manual, 26 Oktober | 588 / 588 | #1298: 588 baris; checksum dan format valid |
| Puman cashless, 26 Oktober | 985 / 985 | #1297: 985 baris; checksum dan format valid |
| PM manual, 12 November | 405 / 405 | #2239: 396 baris; checksum dan format valid, diambil lebih awal |
| PM cashless, 12 November | 664 / 664 | #2238: 659 baris; checksum dan format valid, diambil lebih awal |

Perbedaan 14 AWB pada artifact PM lama dan census live mempunyai cutoff berbeda; tidak dipakai sebagai bukti kegagalan sumber. Census sebelumnya membandingkan himpunan AWB, mengabaikan aggregate cells, serta mencapai halaman terminal tanpa Next. Label pagination asli hanya rentang seperti `1 - 588`, bukan total `of N`.

Census membuktikan UI dan CSV sepakat pada sampel tersebut. Ia belum membuktikan bahwa query UI dan export sama-sama bebas batas populasi tersembunyi. Konfigurasi limit aplikasi 6.000 AWB atau ukuran file worker bukan bukti limit export sumber. Role sumber yang diperiksa tidak menyediakan definisi query/report dan export cap yang dapat disahkan. Sebanyak 12 AWB sebelum 05.00 mendukung kebutuhan tanggal kalender D+1; tidak cukup untuk mengesahkan seluruh semantik Date/HO Date/TGL_ENTRY.

Tidak disyaratkan token SCN tertentu atau menunggu akhir hari. Aturan bisnis tetap boleh selesai pada cutoff koleksi saat itu. Yang belum tersedia adalah bukti sah bahwa report merepresentasikan populasi kategori/account sampai cutoff tersebut; bukti setara dari pemilik sumber dapat digunakan untuk menyelesaikan pemeriksaan.

### Otoritas per kategori

| Kategori | Sumber bukti sesuai aturan existing | Batas sertifikasi saat ini |
|---|---|---|
| Manual Hybrid | Original report manual PM/Puman, provenance child dan AWB unik | Kandidat authoritative ledger kategori; full collection belum tersertifikasi |
| Cashless Hybrid | Scan/Sertim untuk atribusi pickup; hasil HO/report cashless PM/Puman untuk bukti proses | Scan membuktikan anggota pickup, bukan semua populasi upstream; full collection belum tersertifikasi |
| CSS / Orion | Customer report APEX mode P sesuai aturan kategori yang diberikan pengguna | Upload Connote mode A hanya pengayaan subset; mode P belum memiliki bukti completeness yang memenuhi assessor |

Target kuantitas tetap berasal dari POP/handover final. Tidak ada perubahan jumlah untuk memaksakan kecocokan sumber.

### Upstream alternatif yang tersedia

- History APEX: identitas filename/status/link tersedia; total AWB, account dan rentang request sebagai kolom tersendiri tidak tersedia pada evidence asli. Pagination History menghitung report, bukan AWB.
- CSV APEX existing: checksum/kolom TGL_ENTRY/account dapat diperiksa, tetapi tidak menyediakan pembanding jumlah populasi independen dari CSV itu sendiri.
- Artifact customer report untuk account/rentang pembanding Hybrid yang sesuai: History Done, unduhan 404/HTML. Mirror 02/03 pada pemeriksaan existing tidak memiliki artifact yang sama. Tidak disimpulkan APEX tidak kompatibel dengan Hybrid.
- Original Hybrid child, manifest combined dan enrichment tersimpan: tersedia dan berguna untuk provenance/dedup/atribusi, bukan pengganti bukti full population. Semua report existing yang diperiksa belum memiliki collection_evidence.
- Collection attestation existing: mekanisme manual, flag nonaktif; tidak diaktifkan dan tidak dijadikan jalan pintas untuk automatic certification.

Kebutuhan eksternal paling kecil: definisi scope query dan tanggal, export/query limits atau bukti tidak terpotong yang setara, cutoff koleksi yang dapat dipertanggungjawabkan, serta artifact APEX pembanding yang dapat dibaca pada account/periode yang sesuai. Tidak ada tebakan endpoint administratif atau proses report baru yang dijalankan.

## Track C — keputusan perubahan integrasi

Evidence belum memadai. Karena itu `supportsAutomaticCollection()` dan assessor APEX tidak diubah, registry kemampuan tetap kosong dan source tanpa bukti tetap UNKNOWN.

Pembatasan kode existing yang masih relevan:

1. `AssessJneReportCollection` hanya mendukung automatic collection apex:apex dan selalu menahan Hybrid sebagai UNKNOWN. Dukungan Hybrid harus dievaluasi pada kelas existing setelah suatu sumber benar-benar disahkan.
2. Collector APEX membaca TOTALROWS/account/tanggal dari History; metadata tersebut tidak tersedia pada History asli yang diperiksa. Menurunkan syarat atau mengisi total dari CSV akan membuat bukti menjadi sirkular. Penyesuaian producer/assessor ditunda sampai ada bukti upstream sah yang bisa diikat ke artifact.

Keduanya merupakan batas integrasi, bukan alasan membangun matching, workspace atau auto-lock baru. Tidak ditambahkan validator, service, tabel, workflow atau dependensi.

## Prosedur aktivasi existing — belum dijalankan

Preflight tanpa memulai service, dari root repository:

```powershell
.\penarikan.bat queue --check
.\penarikan.bat scheduler --check
.\penarikan.bat apex --check
.\penarikan.bat hybrid --check
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\workers\jne-report\start-local.ps1 -CheckOnly -KeepTunnel
```

Urutan berikut hanya boleh dilaksanakan setelah izin operasional dan gate sumber selesai:

1. Tinjau backup/recovery dan migration status. Terapkan hanya migration snapshot yang sudah diuji, bukan seluruh migration pending tanpa peninjauan:

   ```powershell
   php artisan migrate --path=database/migrations/2026_11_13_025019_add_approval_snapshot_to_pickup_customer_reconciliations.php --force --no-interaction
   ```

2. Sahkan capability serta kontrak existing berdasarkan paket bukti. Review perubahan source integration yang bersyarat; jangan mengaktifkan kontrak dari hasil fixture.
3. Periksa queue/cache database, permission file privat, endpoint/credential worker dan batas runtime Windows. Perubahan konfigurasi/cache/restart memerlukan persetujuan.
4. Pastikan aplikasi web siap dan tidak ada consumer lain yang tidak terinventarisasi. Aktifkan consumer PHP, collector lalu scheduler menggunakan launcher existing. Untuk aktivasi komponen secara terpisah gunakan `start-local.ps1 -Service import`, `-Service reconciliation`, `-Service documents`, `-Service notifications`, `-Service apex`, `-Service hybrid`, dan `-Service scheduler`, masing-masing di terminal terkelola. Jangan mengganti ini dengan queue:work sekali jalan tanpa supervisor.
5. Untuk semua service sekaligus, launcher `start-local.ps1 -KeepTunnel` menghindari perubahan service Cloudflare. `penarikan-start.bat` juga memulai web/Cloudflare; jangan gunakan bila izin hanya untuk worker.
6. Baca status/log; buktikan satu siklus nyata mencapai import/projected, coverage yang sah, satu snapshot otomatis dan audit idempoten. Data atau cakupan tidak lengkap harus tetap pending. Jangan backfill/retry massal untuk membuktikan aktivasi.
7. Pengiriman customer tetap nonaktif sampai ada izin terpisah. Jangan mengubah preferensi/email untuk uji lokal ini.

## Tindakan yang masih memerlukan persetujuan

- Migration pada database operasional.
- Perubahan konfigurasi operasional, aktivasi capability/kontrak verified dan konfigurasi cache.
- Menjalankan/restart worker atau scheduler operasional; aktivasi auto-lock produksi.
- Process/Upload Connote untuk membuat report upstream baru bila artifact pembanding existing tidak dapat dipulihkan.
- Backfill, revalidation/retry massal, pengiriman dokumen/email customer, deploy, commit dan push.

Database operasional tetap tanpa kedua kolom snapshot dan tanpa migration tersebut pada pemeriksaan akhir; kontrak aktif/verified tetap 0. Tidak ada backfill, deploy, aktivasi kontrak, restart worker operasional atau perubahan POP/handover final.
