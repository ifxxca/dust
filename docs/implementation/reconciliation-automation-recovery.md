# Pemulihan otomatisasi rekonsiliasi — M1

Tanggal: 13 November 2026. Repositori: S:/2026/dust.

Referensi: [audit awal](../audits/reconciliation-current-logic-audit.md). Laporan ini menggantikan hasil putaran M1 sebelumnya (163 test).

**Status M1 setelah verifikasi live: BLOCKED/PARTIAL. Empat ekspor asli berhasil dicocokkan dengan census UI dan 12 AWB dini hari diperiksa, tetapi limit ekspor independen, populasi sumber dan cutoff/snapshot belum terbukti. Tidak ada capability verified atau kontrak operasional yang diaktifkan.**

| Milestone | Status | Gate |
|---|---|---|
| M1 Source Completeness | BLOCKED/PARTIAL | Bukti populasi, export limit, tanggal dan snapshot/cutoff sumber asli |
| M2 Auto-Lock | NOT_STARTED | Gate M1 belum terpenuhi |
| M3 Runtime Recovery | NOT_STARTED | Tidak mengubah scheduler/worker aktif |
| M4 Exception Classification | NOT_STARTED | Aturan bisnis existing dipertahankan |
| M5 Cherry-Picking UX | NOT_STARTED | Tidak ada perubahan frontend |
| M6 Regression | NOT_STARTED | Hanya regresi terkait M1 dijalankan |
| M7 Rollout Readiness | NOT_STARTED | Belum ada aktivasi/rollout |

## Verifikasi live sumber asli — 13 November 2026

Putaran ini memakai konfigurasi akun existing untuk akses sumber asli. Endpoint bukan localhost/fixture; halaman Oracle APEX asli, data report, serta respons server diperiksa. Lingkungan diperlakukan sebagai **operasional dengan izin terbatas pada login dan report read-only**. Tidak ada Process APEX, upload, Approve, pengiriman job, atau penulisan database operasional.

Agent-browser tidak tersedia. Browser terhubung tidak memiliki tab/sesi existing. Pemeriksaan dilanjutkan melalui request HTTP report terotorisasi dengan cookie hanya dalam memori, memakai form/action/protokol yang benar-benar diterbitkan sumber. Sesi worker tersimpan tidak ditimpa; password tidak diganti. Native request LOGIN, VIEW dan operasi IR read/reset digunakan; bukan menjalankan collector/queue massal.

### Akses dan scope

| Sumber | Endpoint | Hasil akses |
|---|---|---|
| Hybrid PM | 10.20.10.250:8081, aplikasi 113 | Login dan report manual/cashless terbaca |
| Hybrid Puman | 10.20.10.253:8081, aplikasi 113 | Login dan report manual/cashless terbaca |
| APEX 01 | dash-ccc01.jne.co.id, aplikasi 105 | Login, parameter mode P, History, unduh artifact existing terbaca |
| APEX 02 | dash-ccc02.jne.co.id, aplikasi 105 | Login dan History terbaca |
| APEX 03 | dash-ccc03.jne.co.id, aplikasi 105 | Login dan History terbaca |
| APEX 04 | dash-ccc04.jne.co.id, aplikasi 105 | Endpoint merespons; login belum terverifikasi, tidak diulang dengan tebakan kredensial |

Hybrid memakai scope **seluruh user** pada masing-masing server, tanggal kalender dan filter jenis report yang sudah diperiksa setelah Reset. Account APEX dicatat memakai alias, bukan identitas customer: `APEX_P_EXISTING_01` untuk sampel yang dapat diunduh dan `HYBRID_MANUAL_ACCOUNT` untuk pembanding dengan account yang sama seperti enrichment manual Puman.

### Ekspor Hybrid dan census independen dari file CSV

Tanggal 26 Oktober dipakai untuk Puman dan kasus kosong/gagal PM. Tanggal 12 November dipakai sebagai sampel PM yang berisi data.

| Sumber | Kategori | Kalender sumber | CSV / AWB unik | Census UI terminal | Selisih set UI–CSV |
|---|---|---|---:|---:|---:|
| Puman | Manual | 2026-10-26 | 588 / 588 | 588 | 0 |
| Puman | Cashless | 2026-10-26 | 985 / 985 | 985 | 0 |
| PM | Manual | 2026-11-12 | 405 / 405 | 405 | 0 |
| PM | Cashless | 2026-11-12 | 664 / 664 | 664 | 0 |

Sesudah reset, tanggal/user/filter form dibaca kembali. Pagination asli berupa `1 - 50` atau `1 - 15`, **tanpa total N**. Ukuran halaman uji dibesarkan secara terbatas menjadi 1.000 melalui protokol IR yang terlihat pada client resmi. Keempat sampel berakhir pada halaman terminal tanpa Next. Sel aggregate/Count dikecualikan; semua AWB dan checksum set dibandingkan dengan seluruh CSV, bukan hanya jumlahnya. Setelah pemeriksaan, tampilan IR di-reset kembali.

Kedua ekspor PM tanggal 26 Oktober mengembalikan HTTP 200 berisi **ORA-22275**, bukan CSV sah. Report cashless menampilkan No data found; report manual tidak menyediakan marker kosong yang cukup jelas. Kedua respons **tidak** dianggap sukses nol baris, tidak disulap menjadi bukti FULL, dan checksum respons gagal tetap dicatat.

Client report menunjukkan widget generasi 5.0 dan `maxRowCount=1000000` untuk empat report Hybrid; History APEX menunjukkan `100000`. Ini bukti pengaturan yang teramati, **bukan** konfigurasi limit ekspor yang terverifikasi. Dokumentasi [Oracle tentang atribut pagination](https://docs.oracle.com/database/apex-5.1/HTMDB/editing-interactive-reports-in-component-view.htm) membahas Maximum Row Count sebagai batas query/penghitungan pagination. Bantuan IR yang tersedia hanya bantuan generik; tidak membuka SQL report, konfigurasi export cap, SCN atau snapshot sumber. Tidak ada link App Builder/report definition yang tersedia pada akses ini. Tidak dilakukan penebakan URL admin atau akses sumber di luar hak akun.

### Verifikasi tanggal dan boundary asli

- Seluruh 588 manual dan 985 cashless Puman ditemukan pada artifact enrichment tersimpan #1296 yang checksum-nya sah. TGL_ENTRY untuk 1.573 AWB tersebut sama-sama kalender 26 Oktober.
- PM 12 November memiliki **7 manual dan 5 cashless sebelum 05.00**. Seluruh 12 AWB ditemukan pada enrichment #2237 dengan TGL_ENTRY sebelum 05.00 tanggal 12 November: menurut aturan bisnis, bucket operasionalnya **11 November**. Ini mendukung kebutuhan kalender D+1 pada bucket yang melintasi midnight.
- Enrichment #2237 tersimpan lebih awal dan berisi 1.055 AWB; sampel live PM sekarang berisi 1.069. Sebanyak 14 AWB baru tidak dipaksakan cocok ke artifact lama. Tidak disimpulkan bahwa perubahan itu kesalahan sumber atau bukti ketidakcocokan; cutoff kedua koleksi berbeda.
- Kesesuaian tanggal pada sampel bukan pembuktian umum bahwa HO Date, Date dan TGL_ENTRY selalu identik, atau bahwa timezone/finalitas intraday sumber sudah disahkan. Tidak ada token snapshot/as-of/SCN dari sumber yang mengikat count dan export ke cutoff aplikasi.

### Pembanding APEX dengan scope yang benar

Satu customer report P existing milik akun terotorisasi berhasil diunduh dari APEX 01: **3 AWB, 180 kolom, satu account, TGL_ENTRY 12 November**. Scope account-nya berbeda dari account manual Hybrid; sampel ini tidak dipakai untuk menyimpulkan APEX kompatibel/tidak kompatibel dengan populasi Hybrid.

Pencarian terarah setelah reset History menemukan **26 artifact** untuk account manual Hybrid yang sama. Salah satunya mencakup **26–28 Oktober**, sehingga dapat menjadi pembanding yang sah dengan menyaring TGL_ENTRY 26 Oktober. Tetapi:

1. History menyatakan **Done** dan menyediakan Link.
2. Link artifact tersebut mengembalikan **HTTP 404 / HTML**, bukan CSV.
3. Pencarian nama artifact persis pada APEX 02 dan 03 tidak menemukan artifact yang sama; tidak digunakan URL download tebakan lintas origin.
4. Tidak dilakukan Process untuk membuat pengganti, sesuai batas izin tugas.

Jadi perbandingan set account/tanggal yang benar **belum bisa diselesaikan**. Tidak disimpulkan bahwa APEX tidak mencakup Manual/Cashless. Perbandingan historis lintas account/rentang dari putaran sebelumnya tidak digunakan sebagai bukti ketidakkompatibelan.

History asli pada ketiga endpoint yang terautentikasi tidak memiliki total AWB, account request atau tanggal request sebagai kolom tersendiri. Angka pagination History adalah jumlah **record report**, bukan jumlah AWB sumber. Identitas pada filename tetap dipakai untuk memilih artifact yang tepat, tetapi tidak menjadi bukti total/export/cutoff.

### Matriks pembuktian

VERIFIED pada census sampel berarti set UI/CSV sampel cocok. Kolom berikut menilai kemampuan sumber secara umum yang dibutuhkan untuk automatic full coverage, sehingga tidak dinaikkan hanya dari keberhasilan sampel.

| Source | Category | Population Proven | Export Proven | Date Proven | Cutoff Proven | Result |
|---|---|---|---|---|---|---|
| Hybrid PM | Manual | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | NOT_VERIFIED | INCONCLUSIVE |
| Hybrid PM | Cashless | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | NOT_VERIFIED | INCONCLUSIVE |
| Hybrid Puman | Manual | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | NOT_VERIFIED | INCONCLUSIVE |
| Hybrid Puman | Cashless | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | NOT_VERIFIED | INCONCLUSIVE |
| APEX 01 | Manual | NOT_VERIFIED | NOT_VERIFIED | INCONCLUSIVE | NOT_VERIFIED | NOT_VERIFIED |
| APEX 01 | Cashless | NOT_VERIFIED | NOT_VERIFIED | INCONCLUSIVE | NOT_VERIFIED | NOT_VERIFIED |
| APEX 01 | CSS / Orion | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | NOT_VERIFIED | INCONCLUSIVE |

Blocker tepatnya: konfigurasi limit ekspor/definisi populasi di sisi sumber belum tersedia pada role ini; tidak ada upstream count di luar engine report yang mengesahkan seluruh populasi; belum ada jaminan snapshot/cutoff intraday; artifact APEX pembanding yang sesuai tidak lagi dapat diunduh. Fallback konservatif tetap menahan UNKNOWN/pending, bukan mengesahkan FULL setelah timeout atau semata-mata menunggu pergantian hari.

### Evidence, perubahan lokal dan hasil retest

Evidence yang direduksi datanya disimpan pada `storage/app/private/jne-worker/m1-live-source-evidence.json` (ignored/private), SHA-256 **1e2f7b509199921cb9133d01871d00ef448da3ec86b40b372c016adac61c5580**. Isinya hanya origin, alias scope, tanggal, hitungan, checksum file/set, referensi History/resource yang di-hash, matriks dan audit jenis request. Tidak menyimpan CSV mentah, AWB individual, nama/alamat/telepon customer, password, cookie, username atau URL session. Pemeriksaan email/secret/account/filename terhadap evidence lulus.

Harness HTTP sementara dan ringkasan akses juga berada pada direktori private worker; bukan entry point aplikasi/worker baru dan tidak ditambahkan sebagai dependency atau service.

Tidak ada perubahan kode produksi pada putaran live ini. Guard M1 ternyata menahan struktur sumber asli secara benar. Regresi dari struktur asli yang disanitasi ditambahkan pada:

- `workers/jne-report/test/hybrid-fixture.mjs` dan `hybrid.test.mjs`: pagination tanpa total dan sel aggregate tidak berubah menjadi total upstream.
- `workers/jne-report/test/apex-fixture.cjs` dan `worker.test.mjs`: History tanpa account/date/total tidak mengisi proof dari nilai request.
- `tests/Feature/JneCollectionProofTest.php`: range-only pagination tetap tidak memenuhi full export proof.

**Retest akhir putaran live: 199 test Laravel PASS (1.469 assertion) dan 192 Node PASS; 0 FAIL / 0 SKIP.** Database test SQLite terisolasi, automation/email disabled, browser E2E fixture hanya localhost. Pint dan diff whitespace check lulus. Ini 391 kasus terpilih; bukan klaim suite aplikasi penuh atau UAT seluruh sumber selesai.

### Syarat melanjutkan gate M1

Pemilik sumber perlu menyediakan export cap/definisi report serta jaminan cutoff/snapshot atau mekanisme konservatif yang benar-benar terbukti. Artifact APEX pada account/tanggal yang sesuai harus dipulihkan atau disediakan lewat prosedur terotorisasi; membuat report baru melalui Process belum termasuk izin tugas ini. Baru setelah bukti tersebut memadai, siapkan capability dan draft kontrak untuk review terpisah. Tidak ada capability verified/kontrak aktif dibuat dari hasil sampel ini; tabel kontrak pada database terhubung masih kosong saat diperiksa ulang.

**M1 tetap PARTIAL dan M2 belum melewati gate.** Tidak ada data operasional, finalized POP/handover, ownership atau audit historis yang diubah. Tidak ada migrasi, penarikan massal, email, deploy, commit, atau push.

## Root cause dan keputusan sumber

Download sukses, checksum dan jumlah yang cocok dengan POP tidak membuktikan seluruh populasi sumber. CSV utuh tetap dapat berupa subset atau export terpotong. Baseline M1 sebelumnya masih dapat menganggap APEX mode P FULL hanya berdasarkan kontrak verified dan kesiapan job. Celah itu ditutup.

Peran sumber dipisahkan pada keputusan coverage:

- **Coverage:** membuktikan seluruh populasi/account/kategori/tanggal/cutoff yang diwajibkan.
- **Matching:** menyediakan identitas customer/pickup menurut engine existing.
- **Enrichment:** mengayakan AWB input; Upload Connote tetap SUBSET_COLLECTION.

### Investigasi Hybrid

Collector membuka cashless halaman 57 dengan **HO Date**, manual halaman 40 dengan **Date**. User dipilih semua; filter marketplace/service/merchant atau connote/services/payment/shipper/disc diperiksa. IR di-reset; link CSV diverifikasi terhadap aplikasi, halaman dan sesi yang sama. Body download selesai sebelum validasi struktur, tanggal dan ukuran; kegagalan HTTP/Oracle tetap ditangani mekanisme existing.

Backend memvalidasi child, tanggal, checksum file dan union AWB sebelum enrichment. Itu membuktikan file diterima utuh, belum seluruh populasi upstream.

Belum tersedia bukti sumber asli untuk export cap/limit SQL, konsistensi snapshot total-versus-CSV, cakupan kredensial, atau kesetaraan HO Date/Date dengan TGL_ENTRY. **Hybrid full collection belum terbukti.**

### Evaluasi alternatif APEX

History mengorelasikan artifact, parameter dan link; download menunggu stream tuntas. Mode P adalah kandidat coverage source, bukan otomatis authoritative.

SELECT pada database terhubung, hanya artifact COMPLETED/IMPORTED/PROJECTED:

| Jenis | Baris bukti | AWB unik | Account |
|---|---:|---:|---:|
| APEX customer mode P | 15.299 | 15.299 | 36 |
| Hybrid combined mode A | 89.788 | 39.509 | 24 |
| APEX unresolved mode A | 63.116 | 7.757 | 44 |

Perbandingan lama seluruh artifact tersimpan menemukan 0 overlap pada AWB+account. Karena account/rentang/cutoff tidak dikendalikan, angka ini **tidak digunakan sebagai bukti ketidakkompatibelan atau pembuktian cakupan**. Hasil verifikasi live dan pembanding account yang benar dijelaskan di atas.

Jumlah kontrak sumber pada SELECT putaran ini masih **0**. Satu query pembanding tambahan dengan join tanggal/cutoff dihentikan karena lambat; hasilnya tidak dipakai.

Belum ada bukti total populasi/export cap pada History asli. Collector baru membaca TOTAL_ROWS hanya jika kolom benar-benar tersedia; tanpa itu total tetap null, bukan jumlah CSV.

**Authoritative source yang dipilih: belum ada yang sah diaktifkan. APEX full-date tidak menggantikan seluruh manual/cashless Hybrid.**

## Arsitektur akhir lokal

Alur: observasi sumber → upload CSV+bukti opsional → validasi worker/source/claim/JSON → backend menghitung checksum dan baris → penyimpanan satu job → import/projection existing → pemeriksaan export, capability, kontrak, account, tanggal/cutoff, kategori dan representasi AWB → FULL hanya jika seluruh gate lolos.

Tidak ada tabel, migration, dependency atau state machine baru. Bukti disimpan pada report_jobs.parameters existing.

### Bukti per artifact

collection_evidence versi 1 membawa:

- Protocol hybrid_ir_total_v1 atau apex_history_total_v1 dan origin tanpa session URL.
- before/after: tanggal, scope, filter bersih, label total mentah, marker kosong Hybrid atau identitas History APEX.
- synthesized: penanda fallback header sintetis setelah Oracle error kosong.

Endpoint membatasi ukuran dan field JSON. Flag FULL_COLLECTION dari collector ditolak. Ownership/claim dan transaksi existing mengikat bukti pada file/job yang sama. Tidak membawa password/cookie/HTML/session URL.

AssessJneCollectionProof menghitung ulang:

1. Total upstream harus pasti, sama sebelum/sesudah dan sama dengan jumlah seluruh baris CSV yang dihitung backend.
2. Hybrid menerima range pasti “1 - n of N”; angka ambigu/more than tidak ditebak. Ukuran halaman pertama tidak menjadi total.
3. Export beberapa halaman dapat cocok dengan N; **bukan** klaim seluruh halaman telah ditelusuri satu per satu.
4. Marker kosong dibedakan dari header sintetis; fallback sintetis tidak membuktikan FULL.
5. Scope tanggal/account/user/filter dan identitas History konsisten.
6. Isi file tersimpan dibaca untuk memeriksa SHA-256 aktual.
7. Replay tidak mengganti bukti. Urutan key JSON boleh berubah seperti pada MySQL; nilai dan tipe tetap dibandingkan.

Pembacaan total setelah download masih membaca halaman yang sama; bukan query/snapshot database independen. Kesamaan total juga tidak membuktikan tidak ada pergantian baris dengan jumlah tetap. Karena itu **export_verified bukan sertifikasi full Hybrid atau finalitas intraday**.

CSV legacy sah tetap bisa diimpor tanpa metadata baru. Kekurangan bukti menahan coverage. Manifest parent Hybrid membawa penilaian export child dan tetap UNKNOWN untuk full collection.

### Gate capability independen

collection_capabilities pada config/jne-reports.php **kosong secara default dan tetap kosong pada working tree ini**. Ini registry hasil review bukti eksternal dalam konfigurasi kode; collector dan checkbox verified kontrak tidak dapat menambah entry.

Entry terikat source:type:account dan wajib membawa checksum paket verifikasi eksternal, origins, kategori populasi, export limit, semantik TGL_ENTRY dan cutoff collection_started_at. Tidak ada entry produksi atau fixture di konfigurasi aplikasi. Fixture memasang capability sintetik hanya dalam proses test.

Calon jalur full yang didukung sekarang adalah APEX mode P dengan capability yang disahkan. Hybrid tetap belum didukung untuk full activation walaupun count export cocok; semantik tanggal, snapshot dan cakupan gabungannya belum terbukti.

Kontrak automatic full-date ditolak saat source/account requirement belum disahkan. Draft dan kontrak matching/attestation existing tetap memakai aturan sebelumnya. Capability hanya Orion tidak dapat mengesahkan POP Manual/Cashless.

### Penilaian report dan pickup

APEX full membutuhkan COMPLETED/IMPORTED/PROJECTED, mode P, account non-national eksplisit, kontrak aktif verified, proof artifact, origin disahkan, hitungan row/import/evidence konsisten dan tidak mencapai export cap. National scope tidak diasumsikan setara account biasa.

Mode A, unresolved dan daftar AWB tetap subset. Keberhasilan enrichment tidak mengubah Hybrid menjadi full.

Latest attempt tetap mengendalikan penilaian; artifact eligible lama tidak menggantikan attempt terbaru yang gagal/pending/subset. Diagnostics menyertakan latest attempted/successful/eligible, kontrak/revisi, account, tanggal, checksum, observasi export dan capability. Seluruh kategori POP efektif dan seluruh AWB terikat harus terwakili.

## Cutoff dan late evidence

Keputusan pengguna dipertahankan: **boleh selesai pada hari yang sama berdasarkan cutoff koleksi; bukti terlambat tetap diperiksa setelah lock**. Hari operasional 05.00 sampai sebelum 05.00 WIB berikutnya.

Cutoff memakai started_at, atau created_at konservatif untuk data lama; dibatasi akhir bucket. Selesai download bukan timestamp snapshot upstream. Cutoff harus mencakup pickup dan bukti yang diketahui; masa depan/entry setelah cutoff tidak diloloskan.

Setelah midnight, kalender D+1 wajib walaupun belum ada AWB dini hari diketahui. Seluruh tanggal/account wajib dan AWB terikat diperiksa. Penanganan late evidence/snapshot immutable existing tidak diubah dan ikut regresi. Finalitas intraday source asli belum disahkan.

## Perubahan file

| File | Perubahan |
|---|---|
| app/Actions/Reports/AssessJneCollectionProof.php | Validator bukti, export assessment, hash isi file dan capability gate |
| app/Actions/Reports/AssessJneReportCollection.php | Kontrak saja tidak cukup; proof/capability/account/count wajib |
| app/Actions/Pickup/AssessPickupReportCoverage.php | Cakupan kategori POP efektif, reuse diagnostics tanpa query tambahan per kategori |
| app/Actions/Reports/ManageJneEvidenceRules.php | Tolak aktivasi kemampuan source/account yang belum disahkan |
| app/Actions/Reports/ManageReportJobs.php | Bukti dalam transaksi existing, replay immutable dan toleran urutan key JSON |
| app/Http/Controllers/InternalReportJobController.php | Bukti upload opsional, bounded dan tervalidasi |
| app/Actions/Reports/CombineHybridReports.php | Penilaian export child pada manifest UNKNOWN |
| config/jne-reports.php | Registry kosong, tanpa perubahan env/flag |
| workers/jne-report/src/hybrid.mjs | Readback setelah reset, observasi scope/total sebelum/sesudah |
| workers/jne-report/src/hybrid-jobs.mjs, src/api.mjs | Meneruskan bukti bersama file |
| workers/jne-report/src/apex.mjs, src/worker.mjs | Observasi History/total opsional mode P |
| tests/Feature/JneCollectionProofTest.php | 26 kasus tambahan termasuk jalur HTTP upload–import–projection–coverage |
| tests/Feature/JneSourceCompletenessRecoveryTest.php | Fixture mengikuti gate baru, guard existing dipertahankan |
| tests/Fixtures/pickup-automation.php | Capability/proof sintetik eksplisit hanya pada test |
| tests/Feature/PickupCodeDateMatchingTest.php | Ekspektasi legacy lock tanpa coverage dikoreksi; 17 AWB tetap MATCHED |
| workers/jne-report/test/hybrid-fixture.mjs, hybrid.test.mjs, apex-fixture.cjs, worker.test.mjs | Fixture IR/History lokal dan enam test tambahan |
| Dokumen ini | Hasil dan prosedur pembuktian eksternal |

QueryReconciliationWorkspace dari putaran sebelumnya tetap memakai assessor yang sama; tidak ada perubahan tambahan UI. Banyak perubahan working tree sudah ada sebelum tugas ini dan tidak direset/commit.

## Test, review dan retest

Putaran lokal sebelum verifikasi live: **198 test Laravel PASS, 190 test worker Node PASS; 0 FAIL / 0 SKIP**. Total 388 kasus saat itu. Hasil terbaru putaran live adalah **199 Laravel + 192 Node = 391 PASS**, seperti bagian verifikasi live di atas.

Laravel: 1.464 assertion, sekitar 28 detik, pada 14 file:
JneCollectionProofTest, JneSourceCompletenessRecoveryTest, JneConfiguredIdentityTest, JneConfiguredReconciliationTest, JneSourceEvidenceTest, HybridApexPipelineTest, ReconciliationWorkspaceTest, AutomaticReconciliationWorkspaceTest, PickupProcessingAutomationTest, JneShipperCodePrefixTest, JneCategoryEvidenceReplayTest, CombinedHybridReportTest, SplitHybridReportTest, PickupCodeDateMatchingTest.

Node: node --test test/*.test.mjs, 190 kasus, sekitar 90 detik. Sesudah fixture label terpisah diperbaiki agar menyerupai markup Oracle, subset Hybrid/jobs diuji ulang: 39 PASS, 0 FAIL/SKIP.

| Matriks M1 | Bukti test |
|---|---|
| Full/truncated Hybrid export | Count upstream vs CSV, ukuran halaman berbeda, range mustahil/unknown, filter tersisa |
| Missing/failed child | Combined/split/pipeline memeriksa komposisi, checksum, readiness dan kegagalan |
| Zero rows | Marker asli dibedakan dari bukti kosong tidak sah/header sintetis |
| Full/subset APEX | Full bersyarat dengan capability/proof fixture; A/list tetap subset |
| Account/shared account | Account bukan identitas customer; origin/scope/national/kategori salah ditahan |
| Date/cutoff | Midnight memerlukan D+1; timestamp/freshness invalid ditolak |
| Replay/late/conflict | Import/upload idempoten, proof immutable, latest attempt, snapshot/late discrepancy existing |
| Missing contract/capability | Tidak full, aktivasi ditolak |

Satu test lama awalnya gagal karena mengharapkan lock/manifest ketika coverage=false dan kontrak tidak ada. Itu bertentangan dengan acceptance M1. Test sekarang memastikan 17 AWB dan jumlah tetap cocok, tetapi lock/manifests ditahan dan customer-day WAITING_DATA. Kode lock tidak diubah untuk memenuhi assertion.

Review juga menemukan urutan key JSON MySQL dapat menyebabkan penolakan replay identik; perbandingan dibetulkan dan diuji dengan urutan key berbeda.

Isolasi: APP_ENV testing, SQLite in-memory, config cache path test tidak ada, mail/cache array, queue sync/fake, automation/email disabled. Driver SQLite diaktifkan hanya pada proses PHP melalui opsi -d, tanpa php.ini. E2E existing memakai Laravel/Chromium localhost dan database temporary; tanpa credential operasional.

PHP diformat memakai Pint hanya untuk file M1. git diff --check tidak menemukan whitespace error. Prettier tidak tersedia; tidak ada dependency dipasang. Suite aplikasi penuh, concurrency MySQL dan UAT sumber asli belum diklaim lulus.

## Prosedur verifikasi eksternal — hasil pelaksanaan sebagian dijelaskan di atas

Login, report read-only, Reset dan download sudah diizinkan serta dijalankan pada putaran ini. Process, upload, perubahan konfigurasi sumber, aktivasi kontrak dan backfill tetap memerlukan izin terpisah. Butir yang memerlukan bukti admin sumber masih menjadi blocker.

1. Tentukan account, endpoint, D, cutoff bersama dan timezone server. Sertakan manual/cashless/Orion, hari kosong dan sampel setelah midnight. Catat versi aplikasi/report.
2. Ambil report PM/Puman manual/cashless dengan semua user; periksa form, saved IR/search/filter setelah Reset. Simpan scope dan total sumber yang benar-benar terlihat.
3. Gunakan hari lebih dari satu halaman. Simpan CSV asli, SHA-256, jumlah seluruh baris dan AWB unik; cocokkan total upstream independen, cek duplikasi dan baris awal/akhir.
4. Dapatkan bukti export cap serta batas SQL/report dari pemilik sistem atau konfigurasi report yang sah. Uji di bawah/dekat/melewati batas. Jika limit tidak diketahui, jangan klaim full hanya karena count cocok.
5. Verifikasi arti HO Date/Date/TGL_ENTRY: input vs handover, timezone, scope user/account, perpindahan D+1. Bandingkan AWB yang sama lintas sumber. Source harus menjamin populasi sampai cutoff intraday.
6. Buktikan konsistensi count/export dengan artifact immutable/server snapshot atau query upstream independen yang disahkan. Total UI sama dua kali tidak cukup. Tanpa bukti ini Hybrid tetap bukan full coverage source.
7. Ambil APEX P pada account/rentang/cutoff sebanding; simpan identitas History, total upstream bila ada, CSV/checksum, account, entry dan kategori. Bila total tidak disediakan, cari bukti upstream sah; jangan mengarang TOTAL_ROWS.
8. Bandingkan set seluruh AWB per account/tanggal/kategori; jelaskan setiap AWB hilang/asing. Uji setiap mirror APEX yang hendak dipercaya; aplikasi/URL serupa tidak membuktikan backend identik.
9. Simpan paket bukti yang direduksi datanya beserta checksum dan keputusan reviewer tentang populasi/origin/kategori/limit/tanggal/cutoff. Baru setelah lolos review, siapkan capability/kontrak sebagai perubahan terpisah; aktivasi produksi tetap membutuhkan izin.
10. Jalankan ulang matriks M1 dan validasi artifact asli pada test terisolasi. Fixture sintetik tidak digunakan sebagai bukti produksi.

## Acceptance dan kesiapan

| Kriteria | Hasil |
|---|---|
| Full coverage asli untuk semua required source/category | BLOCKED: belum ada source tersertifikasi |
| Hybrid tidak dipalsukan full | PASS lokal; export/enrichment bukan full coverage |
| APEX authoritative hanya jika terbukti | PASS lokal; capability+contract+artifact proof wajib |
| Date/cutoff/readiness/representation | PASS pada regresi terisolasi |
| Pending/failed/subset/truncation tidak full | PASS pada matriks M1 |
| Aktivasi hanya untuk kemampuan disahkan | PASS lokal; registry produksi kosong |
| Traceability/idempotency | PASS pada endpoint/assessor/manifest |
| Regresi terkait yang diketahui | 391 kasus terpilih lulus; suite penuh/UAT seluruh sumber belum dijalankan |
| Aman mulai M2 | **Belum melewati gate M1** |

Tidak ada perubahan data operasional, POP/handover final, ownership, audit historis atau snapshot. Verifikasi live hanya memakai login/report read-only yang diizinkan; tidak ada Process/upload, migration operasional, aktivasi kontrak, backfill, collector massal, email, restart, deploy, commit atau push.

Untuk pemeriksaan suite aplikasi penuh berikutnya, jalankan php artisan test --compact hanya setelah memastikan environment/database test terisolasi dan config cache operasional tidak terpakai.
