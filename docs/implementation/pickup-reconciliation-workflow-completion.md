# Penyederhanaan workflow rekonsiliasi pickup

Tanggal: 14 November 2026. Audit working tree sebelum perubahan.

## Pemetaan existing

| Fitur | Klasifikasi awal | Bukti / keputusan |
|---|---|---|
| Buku Pickup / POP final | EXISTING_WORKING | FinalizePickup dan revisi efektif; jumlah final dipertahankan |
| Handover / Sertim | EXISTING_WORKING | Verifikasi gudang, prerequisite cashless, batas collection window dan hak Admin existing |
| Collector Hybrid/APEX | EXISTING_WORKING | Collector, batching, scheduler dan retry existing; sertifikasi full collection tetap blocker aktivasi terpisah |
| Import / projection / matching | EXISTING_WORKING | ImportReportAwbs, ProjectJneShipments, MatchJneShipments, ResolveJneCustomerCodes |
| Rekonsiliasi customer/hari | EXISTING_WORKING | ReconcileCustomerPickupDay, bucket 05.00–04.59 WIB, jumlah AWB unik per kategori |
| Workspace V2 / kandidat | EXISTING_NEEDS_FIX | Kandidat global tersedia, tetapi belum ada mode eksplisit hanya AWB tanpa alokasi; pencarian belum mencakup penerima/customer |
| Batch selection / preview / Add / Take Out | EXISTING_WORKING | Selection maksimal 100, preview hash/version, apply transaksi dan audit existing |
| Reassign dalam satu transaksi | MISSING | API hanya ADD/REMOVE/CONFIRM; memindahkan buku memerlukan dua keputusan terpisah |
| Status quantity vs finalisasi | EXISTING_NEEDS_FIX | Quantity discrepancy dan label kategori bergantung coverage; shortage/excess dapat tersembunyi saat menunggu sumber |
| Ringkasan alokasi global dan tabel kerja | EXISTING_NEEDS_FIX | Registry AWB global ada; ringkasan allocated/unassigned dan kolom target/allocated/difference belum tersedia |
| Audit / auto-lock / immutable snapshot | EXISTING_WORKING | Regresi lokal dan concurrency MySQL pada laporan operational recovery |
| Manifest PDF/XLSX | EXISTING_WORKING | Snapshot, content hash, revision dan job rendering existing |
| Email customer | EXISTING_WORKING | DeliverPickupAwbManifest, preferensi customer, flag pengiriman, SMTP, dedup dan revalidasi sebelum send |
| WhatsApp | MISSING | Tidak ada channel delivery otomatis aktif yang dapat digunakan; email existing memenuhi channel yang tersedia. Tidak membangun provider WhatsApp baru |

Referensi: audit existing, automation recovery dan operational recovery di direktori docs. Tidak ada pembangunan ulang engine, collector, workspace atau source certification.

## Gap yang ditangani

1. Unassigned Pool eksplisit dan pencarian bukti yang memadai, memakai registry AWB existing.
2. Status quantity terpisah dari guard finalisasi; shortage/excess tetap dapat diperiksa ketika coverage pending.
3. Batch reassign atomik dengan preview, permission, version, pemeriksaan buku asal dan audit Add/Remove existing.
4. Ringkasan canonical AWB global dan tabel customer/hari yang menampilkan target, alokasi dan selisih.

## Hasil implementasi lokal — COMPLETE

- `QueryPickupAutomation` menghitung pool dari registry canonical `jne_shipments`, satu baris per AWB. Contoh regresi 1.000 AWB: 30 terikat ke Vanny, 900 ke buku lain, 70 unassigned; hasilnya 1.000/930/70, bukan menganggap 970 semuanya belum terikat.
- Scope pool ditulis eksplisit: tanggal operasional dan kategori, lintas customer. Pencarian customer/petugas/status hanya memfilter tabel customer/hari. `allocation_summary` mengikuti seluruh filter tabel dan menghitung customer/hari serta jumlah buku, sehingga grouping dua pickup tidak disamarkan sebagai satu buku.
- Tabel menampilkan target, alokasi valid, selisih, status jumlah dan status finalisasi terpisah. `QueryCustomerPickupDays` membaca keberadaan snapshot, bukan menyamakan status kuantitas DONE dengan immutable lock. Schema lama tetap dapat dibaca dan ditandai belum difinalisasi.
- `QueryReconciliationWorkspace` menampilkan SHORTAGE/EXCESS walau coverage belum lengkap. MATCHED tetap tidak eligible untuk lock/delivery jika source coverage, atribusi, baseline, versi, atau guard lain belum sah. Guard auto-lock dan assessor sumber tidak dilonggarkan.
- `ReconciliationWorkspaceController` menambah mode Unassigned Pool dan mencari AWB/pengirim/penerima/customer/kode/account. Pencarian eksplisit lewat tombol, bukan request per huruf; literal `%`/`_` di-escape lintas SQLite/MySQL. Daftar terikat hanya memuat pemilik yang benar dan sorting penerima existing dipertahankan.
- `ManageReconciliationWorkspace::change()` menambah REASSIGN pada transaksi existing, dengan customer locks berurutan, versi asal/tujuan/AWB, preview hash, permission Admin, pemeriksaan snapshot/bucket/Sertim dan audit REMOVE+ADD existing. Semua perubahan rollback jika satu item gagal. Batch Take Out dapat mencakup beberapa buku dalam satu customer/hari; data report tidak dihapus.
- Workspace existing menyediakan tombol AWB terikat, Unassigned Pool dan pencarian lintas buku; batch selection/preview/konfirmasi tetap maksimal 100. Tidak membuat halaman, engine, collector, scheduler, service atau migration baru. Drawer mobile tidak menggandakan tombol pintas saat filter AWB sudah terbuka.

Matching, kandidat berbukti, pipeline import/projection, auto-lock, dokumen dan delivery yang sudah tersedia digunakan kembali. Candidate ranking tidak diubah menjadi pencocokan berdasarkan jumlah. Hanya Admin tetap dapat melakukan koreksi; resi Sertim bertentangan ditolak dan diarahkan ke koreksi Sertim existing. POP/handover final tetap sama.

## Verifikasi

| Pemeriksaan | Hasil |
|---|---|
| Pest, 13 file terkait pada SQLite `:memory:` | **210 lulus, 1.476 assertions** |
| Concurrency MySQL, database acak terisolasi | **1 lulus, 33 assertions** |
| Vitest, dua file frontend | **9 lulus** |
| Browser Chromium fixture, 1440×960 dan mobile 390×844 | **7 pemeriksaan lulus, 0 page error**, 6 screenshot |
| TypeScript web dan mobile | Lulus `npm run types:check` |
| Lint frontend pada file yang berubah | Lulus |
| Build web dan PWA | Lulus; warning existing font optional/chunk size, tanpa perubahan dependency |
| Pint PHP terkait, diff whitespace | Lulus |

Suite backend: `PickupReconciliationWorkflowTest`, `ReconciliationWorkspaceTest`, `PickupAutomationMonitoringTest`, `AutomaticReconciliationWorkspaceTest`, `CustomerPickupDayReconciliationTest`, `PickupProcessingAutomationTest`, `JneCollectionProofTest`, `JneSourceCompletenessRecoveryTest`, `PickupAwbManifestTest`, `PickupCustomerEmailFlowTest`, `SertimCashlessTest`, `CashlessHandoverLockTest`, `ApprovalSnapshotMigrationTest`. MySQL terpisah menggunakan `AutomaticReconciliationConcurrencyTest`.

Regresi membuktikan matching otomatis; pool global dan batas 05.00 WIB; shortage/excess tetap terlihat; batch Add/Take Out/Reassign; audit dan permission; source/target stale ditolak; rollback seluruh batch; auto-lock setelah koreksi; pending tidak membuat manifest/email; coverage baru memicu evaluasi; import berulang idempoten; bukti terlambat tidak mengganti snapshot diam-diam; perubahan material mengikuti review existing; Sertim/handover tetap terjaga.

Concurrency MySQL menjalankan dua proses untuk satu bucket sehingga hanya satu snapshot otomatis dibuat, replay kategori tidak menghasilkan audit berulang, dan dua Admin yang memilih AWB sama untuk target berbeda menghasilkan satu berhasil/satu konflik, satu pemilik dan satu audit ADD. Database MySQL test sudah dibuang; SELECT akhir tidak menemukan `reconciliation_test_<16 hex>` tersisa.

Beberapa fixture lama diselaraskan dengan guard existing: report harus dikoleksi sesudah pickup terakhir, source subset bukan bukti full collection, resi dummy harus lolos format cashless, dan manifest setelah material change berstatus REVIEW. Ekspektasi diselaraskan tanpa menurunkan aturan produksi. Batas query main monitoring menjadi 11 query konstan pada fixture (tambahan dua agregat dan pemeriksaan schema); tidak memuat model/bukti setiap AWB untuk ringkasan global. Ini bukan benchmark kapasitas produksi.

Command test menggunakan `APP_ENV=testing`, SQLite `:memory:`, config-cache terpisah yang tidak ada, mailer array, cache array, dan `PICKUP_FLOW_SMTP_TO` kosong. PHP memerlukan `-d extension=pdo_sqlite -d extension=sqlite3` pada mesin ini. Tidak ada SMTP asli selama pengujian.

## Alur end-to-end yang terbukti

`PickupCustomerEmailFlowTest` membuat customer dan pickup melalui API existing, menjalankan mulai/kunjungan, menyimpan POP **20 manual + 30 cashless**, mencatat 30 scan, menyiapkan hasil sukses cashless dummy, memverifikasi dan menutup handover, lalu memasukkan CSV dummy melalui queue database pengujian.

Queue existing melakukan import → projection/matching → coverage fixture tersertifikasi sintetis → rekonsiliasi → snapshot otomatis → manifest 50 AWB → PDF/XLSX → delivery melalui **array transport**. Bukti pickup dan rekap menghasilkan tepat dua pesan lokal. Replay delivery tetap satu attempt dan tidak menggandakan pesan. Tidak ada input ke Hybrid/APEX asli dan tidak ada email customer nyata.

Hasil sukses entry cashless dan full-collection proof pada alur ini adalah **fixture pengujian**, bukan sertifikasi sumber nyata atau pembuktian browser JNE. Jalur coverage UNKNOWN dan ketidakcocokan diuji terpisah untuk tetap pending.

## Screenshot dan batas pemeriksaan UI

Artifact: `output/reconciliation-workflow-20261114/`.

- `desktop-allocation-pool.png`: pool global, ringkasan tabel dan kolom target/alokasi/selisih.
- `desktop-overview.png`: drawer quantity/finalization dan akses pool.
- `desktop-awb-detail.png`: klik AWB membuka detail pengiriman.
- `mobile-overview.png`, `mobile-investigation.png`, `mobile-awb-detail.png`: layout 390 px tanpa overflow horizontal.
- `browser-results.json`: daftar pemeriksaan, `errors: []`; `web-build.log`: hasil build web terakhir.

CLI agent-browser tidak tersedia; pemeriksaan memakai suite Chromium/Playwright existing dan database SQLite baru di output. Mode `RECONCILIATION_QA_READ_ONLY=1` menguji navigasi/investigasi, explicit search, loading/empty/error/recovery, keyboard focus dan snapshot immutable, tanpa membuka koreksi atau menjalankan worker operasional. Batch write/reassign/auto-lock ulang diuji melalui HTTP/backend dan concurrency MySQL, bukan diklaim sebagai browser E2E.

Snapshot screenshot dibuat oleh fixture dengan capability sintetis di proses seeding. Server browser sengaja tidak diberi registry capability operasional: badge sumber terkini dapat terlihat belum lengkap sementara snapshot historis tetap terkunci. Ini tidak menyatakan sumber produksi tersertifikasi.

## Blocker aktivasi operasional — terpisah dari pekerjaan lokal

Pemeriksaan read-only akhir pada database operasional:

- **0 kontrak aktif sekaligus verified** (`active_key IS NOT NULL AND verified_at IS NOT NULL`).
- Kolom `approval_snapshot`/`post_lock_change` belum tersedia; migration snapshot existing belum diterapkan.
- Bukti full collection nyata Hybrid/APEX belum memenuhi persyaratan pada laporan operational recovery. Tidak ada kontrak/capability verified yang dibuat dari asumsi atau fixture; UNKNOWN dipertahankan.

Tindakan terkecil sebelum operasional: sahkan bukti sumber yang otoritatif, tinjau integrasi/capability existing sesuai bukti, terapkan migration snapshot existing setelah izin, lalu aktifkan konfigurasi/worker existing setelah izin. Flag pengiriman dan preferensi customer juga harus sah sebelum delivery nyata. Prosedur activation existing ada pada `reconciliation-operational-recovery.md`.

WhatsApp otomatis belum memiliki transport existing; tidak ditambahkan provider baru. Email existing tersedia dan telah diuji secara lokal. Tidak menjalankan migration produksi, backfill, worker/scheduler operasional, deploy, pengiriman customer, commit atau push. Build lokal dan server fixture terisolasi sudah berhenti; proses PHP yang tersisa hanya Boost MCP.
