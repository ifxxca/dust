# IT Control Center V1 remediation — 6 November 2026

This section is the current acceptance record. The earlier implementation notes below are historical; their combined health rules, seven-section UI, and original queue-verification claim are superseded by this audit.

## Verified root cause

The database queue aggregate used the unquoted alias `delayed`. On the connected **MySQL 8.4.11** server, executing that SELECT read-only reproduced **SQLSTATE 42000 / driver error 1064**, at `as delayed`. The old per-source catch discarded the exception and returned null, so queue measurements became UNKNOWN without an actionable explanation. SQLite feature tests accepted that alias, which explains why the earlier regression checks missed this engine-specific defect.

The query now uses non-keyword aliases (`pending_count`, `reserved_count`, `delayed_count`). The actual application query subsequently succeeded on MySQL. No queue, database, worker, retry or job configuration was changed.

Audit evidence:

- Monitoring runtime: default queue connection `database`, database driver `mysql`, queue DB connection inherits the application default `mysql`, table `jobs`, `retry_after=90`, failed provider `database-uuids` / `mysql.failed_jobs`. Configuration was not cached at audit time.
- Schema inspection confirmed all referenced columns. Existing indexes: `jobs(queue)` and `failed_jobs(connection, queue, failed_at)`; no migration was needed.
- Successful SELECTs on both sources establish read permission for the audit connection; permission failure was not the reproduced cause. No grants were changed or requested.
- The server's session `max_execution_time` was 0 and lock-wait timeout 50 seconds. The failing query returned syntax error, rather than timing out. The corrected queue SELECT carries a **1,000 ms MySQL optimizer budget**, scoped to that SELECT; it changes no session/global settings. Connection establishment and non-MySQL timeouts remain infrastructure concerns.
- Read-only EXPLAIN of the corrected aggregate chose `jobs_queue_index`, index scan, estimated 276 rows at that observation. Exact queue aggregation still scales with live backlog; this is not a constant-cost claim or production load benchmark.
- Saved live snapshot `output/it-control-center-v1-live.json`, observed 03:28 UTC / 10:28 UTC+07, records queue collection **6.9 ms**, snapshot **234.7 ms**, and no unavailable sources. Queue contents changed naturally between observations; the monitoring task did not process or clear jobs.
- Workers now emit an allowlisted queue-settings snapshot on normal lifecycle events. The UI compares it with the monitoring runtime, using only connection/table/driver/retry/cache-state metadata. Legacy processes without that evidence remain NOT VERIFIED. API fallback heartbeats do not prove the remote host or its queue configuration.

## Health model and thresholds

| Dimension | Rule | Rationale |
| --- | --- | --- |
| Runtime | BUSY/IDLE heartbeat <=120 seconds is online. Missing, future or stale evidence is UNKNOWN. STOPPED requires an explicit event. | Allows 10–15 second heartbeat intervals and ordinary jitter, without claiming an unobserved process is dead. Long PHP jobs without intermediate heartbeat can legitimately become UNKNOWN. |
| Runtime aggregate | All required queue/instance slots observed healthy = HEALTHY; partial required coverage = DEGRADED; explicit fresh fault/stopped evidence with no healthy dependency = UNHEALTHY. | Required runtime coverage is distinct from optional integration readiness. These are observed processes, not configured maximum capacity. |
| Readiness | Session check <=660 seconds, attached to a fresh non-stopped worker. Missing/expired evidence = UNKNOWN, displayed NOT VERIFIED. Mixed verified success/failure = DEGRADED. | Two 300-second keepalive cycles plus 60 seconds tolerance. A heartbeat never renews a session check. |
| Execution | Latest terminal result in the retained 24-hour sample is HEALTHY or NEEDS_ATTENTION; no sufficient result = UNKNOWN. Recent failure/attention count and historical last failure remain visible after a later success. | A successful worker heartbeat says nothing about its business outcome. NEEDS_ATTENTION requests review; it does not prove an active incident or a shared root cause. |
| Scheduler | Registered cron's next execution +120 seconds grace, using its own configured timezone. SKIPPED is not failure. Runtime coverage and task outcome are separate. | Frequency-aware freshness avoids treating five-minute tasks as stale after two minutes. Background launch is not completion; completion comes from its background-finished event. |
| Queue retry | Warn when observed worker timeout >= retry_after; show expired reservations independently. | A reservation can become eligible while the first process still runs. No settings are changed automatically. Job-specific overrides remain a verification gap. |
| Percentiles | At least five retained duration samples. | Avoid a percentile claim from one or two events. Retained samples do not establish complete throughput. |

Web request success and the database SELECT 1 probe verify only those runtime paths. Optional SMTP/FCM/cashless/session evidence no longer degrades a healthy worker. A job exception no longer marks a responding PHP/Node worker unhealthy: failed execution evidence is retained separately. Infrastructure services remain UNKNOWN where there is no host-wide health collector.

## The 73 reported “error events”

The captured 24-hour retained snapshot reproduced 73 evidence rows, not 73 proven incidents:

| Evidence | Rows | Interpretation |
| --- | ---: | --- |
| Application DeadlockException events | 6 | Sanitized DB_DEADLOCK evidence. Existing records lack reliable job/attempt correlation; a shared fingerprint groups them without asserting one unique incident. |
| NURALAMT report failures | 30 | 16 cashless +14 manual failed/attention report records with HYBRID_ERROR evidence. The generic code does not establish whether session, browser, network or application logic caused them. |
| Combined Hybrid source failures | 16 | HYBRID_SOURCE_FAILED parent report evidence. It may relate to child report failures; it must not be added as independent proven incidents. |
| Cashless records with failure evidence | 2 | One API_REJECTED and one generic failure; sensitive messages remain redacted. |
| Reconciliation / compilation attention | 19 | Six pickup and 13 customer/day records. Business status alone is not proof of a thrown exception. These are now BUSINESS_ATTENTION evidence. |
| Failed-job table rows in 24 hours | 0 | Independently queried; distinct from the records above. |

Thus the saved snapshot contains **6 exception events, 48 failed domain-run records, 19 business attention records, 0 sampled failed PHP attempts, and 0 failed-job rows**. These categories overlap conceptually across pipeline stages and are not an incident total. New records carry event IDs, exception type, a hash of exception type/code/source location, and available report/job/attempt correlation. Duplicate event IDs are removed; repeated observations are grouped by component, fingerprint, correlation and evidence kind, with occurrence count, attempt list and first/last timestamps. Exact unique incidents stay UNKNOWN. Old metadata cannot be retroactively reconstructed.

Later snapshots may differ because the source data and retained ID window continue to change. A follow-up read-only categorization of the latest 100 report IDs still found generic NURALAMT failures and combined upstream-source failures; it did not reveal a verified root cause. Detailed remote-worker/session investigation is a separate live-access task, not grounds to restart or reconfigure a service here.

## Dashboard and minimal instrumentation

Experienced administrators need to identify an issue, inspect its evidence and reach the affected job quickly. The existing page now has exactly **Overview, Workers & Queues, Integrations, Job Runs, Errors**. Overview puts source failures, expired reservations, timeout risks and execution/readiness problems before service inventory. Scheduler and performance remain available under Job Runs. Existing refresh, optional 30-second polling, local search, pagination, authorization, no-store responses and historical worker records are preserved.

Health badges have independent evidence timestamps. Process IDs, host fingerprints, configuration comparisons, fingerprints and verbose rationale use disclosures. Tables retain headings, keyboard scrolling, touch targets and responsive containment. Unknown measurements remain distinct from measured zero. Failed-job-source failure cannot erase readable live queue metrics, and queue-source failure cannot erase independently readable failed-job counts. Secondary database queue failures are isolated; a partial result is not presented as a complete global queue total.

Implemented additions:

- Local storage-volume disk free/total and current PHP process memory; 1-minute load average only where the OS exposes it. Scope and timestamp are explicit. Neither is represented as host CPU percentage or host RAM usage.
- One read-only lookup of a dedicated monitoring cache key. Success verifies the selected cache read path only. No cache writes, lock acquisition/release or business-key inspection.
- Allowlisted CLI command start/finish, duration and exit code; no arguments, command output, credentials or imported payloads. Last observed command metadata only, not a complete historical command ledger.
- Existing PHP/Node lifecycle hooks retain job duration, retries and observable starts. API fallback has no invented start time, host or elapsed duration. Hybrid native telemetry retains concurrent active jobs. Per-queue concurrency is a fresh process count, not exclusive allocated capacity; a process can subscribe to multiple queues.
- Scheduler next expected UTC instant plus its registration timezone, independently displayed in WIB (UTC+07). Exact missed counts remain UNKNOWN because policy skips, maintenance and collector downtime are not a complete execution ledger.

No new package, schema migration, expensive business-path monitoring query, business-rule change or active integration probe was introduced. Writes are limited to private observability files; operational data was not modified by monitoring.

## Verification

**Final verification: 173 backend tests / 1,454 assertions PASS; 6 frontend tests PASS; 70 Node tests PASS; 10 browser acceptance checks PASS; web/mobile TypeScript PASS; scoped frontend lint/format PASS; scoped PHPStan zero errors; scoped Pint applied; production build PASS.** Evidence is in `output/it-control-center-v1-*` artifacts. The full repository suite was not run. Coverage includes queue failure/recovery and partial failure, NULL versus zero, current/stale workers, connection-specific concurrency and timeout risk, healthy worker with reconciliation failure, optional unverified session, error-event deduplication, redaction/authorization, command lifecycle, scheduler timezone and background completion.

- Backend regression command: isolated SQLite memory database, Control Center + ReportPipelineDiagnostics + ReportJob + PickupAutomationMonitoring + PickupProcessingAutomation + JneReportAwbImport. Log: `output/it-control-center-v1-php.log`.
- Scoped PHPStan: monitoring actions/provider/controller; zero errors after correcting the source types and scheduler DateTimeZone handling. No ignores/baseline changes.
- Scoped Pint with `--dirty --format agent`; no unrelated directories formatted. Frontend type/lint checks and production bundle built locally.
- Browser fixture database: `output/it-control-center-v1-20261106.sqlite`, private fixture telemetry separate from application telemetry. Ten acceptance checks across 1440/768/390/375 px, no page overflow or page errors, local filtering, section persistence, scheduler disclosure and keyboard evidence controls. Screenshots/results: `output/it-control-center-v1/`.
- Overview automated WCAG A/AA audit: zero violations. Two shared navigation/avatar contrast checks were inconclusive; this is not a claim of complete accessibility certification.
- Existing worker/telemetry regression tests use local fixtures. Postman CLI cannot execute `postman status` (unknown command); no Postman collection run or workspace publication is claimed. Existing HTTP feature tests verify API telemetry isolation and unchanged worker responses.

## Remaining infrastructure verification

Host CPU percentage/RAM, all-host disk coverage, infrastructure agents, distributed lock correctness/contention, cache write availability, SMTP/FCM delivery, exact active incident resolution, old event correlation, per-job timeout overrides, complete CLI history, scheduler missed counts, unobserved worker capacity, metrics continuity and multi-host telemetry transport remain unverified. Install/configure no agents or shared volumes without operational review. New native hooks take effect when processes load code normally; **no operational restart was performed or authorized**.

No commit, push, deployment, queue clearing, retrying or worker/service restart was performed. Concurrent application work remains in place. Run the full repository suite separately with `php artisan test --compact` before release.

---

# Historical implementation notes (superseded where they conflict above)

# IT Control Center — audit dan acceptance

Tanggal: 6 November 2026. Repository: `S:/2026/dust`.

## Hasil dan kontrak

Satu halaman Inertia React, `GET /admin/it-control-center`, nama route `it-control-center`, menu Administrasi. Akses mengikuti kontrol yang sudah dipakai `AdminPushTestController`: user aktif dengan role `admin_supervisor`. Tidak ada role IT baru. Respons `private, no-store`, throttle 30 request/menit. Tidak ada endpoint POST, retry, restart, force-unlock, cancel, atau hapus antrean.

Halaman memisahkan pengamatan saat ini, hasil operasi historis, konfigurasi terdaftar, dan metrik yang belum tersedia. UNKNOWN bukan nol dan bukan STOPPED. Snapshot bukan jaminan availability end-to-end.

## 1. Inventory sistem dan proses

Audit mencakup seluruh `app/Jobs`, `app/Console/Commands`, provider/observer, `routes/console.php`, konfigurasi queue/cache/logging/mail/push/report/pickup, model telemetry, launcher Windows, dan worker Node. Versi diperiksa: PHP 8.5.12, Laravel 13.35.0, Inertia 3, React 19.2, Tailwind 4, Node 24.21, Playwright worker 1.64.1. Tidak ada Horizon, Telescope, Prometheus, atau supervisor Linux yang aktif dan terverifikasi dalam audit ini.

| Komponen / tujuan | Runtime, pemicu, frekuensi | Queue / proses | Bukti, waktu sukses/gagal, durasi | Gap / risiko / cakupan |
| --- | --- | --- | --- | --- |
| Web / UI / API | PHP Laravel + Inertia; request | `web`, HTTP | Respons halaman berhasil dan query metadata saat snapshot; `/up` terdaftar | Bukan uptime eksternal, SLO, atau request latency global; PARTIAL |
| Database | MySQL pada workspace; SQLite hanya acceptance terisolasi | koneksi aplikasi + koneksi queue/failed yang dikonfigurasi | Query baca aktual; waktu penyusunan snapshot | Tidak mengukur replication, lock graph, CPU, RAM, pool; PARTIAL |
| Cache / lock | Database default; registry juga menyediakan file/array/redis/memcached/dynamodb/failover | mutex scheduler, unique jobs, cache test push | Konfigurasi dan pemakaian kode | Tidak ada health collector atau stale-lock classifier; UNAVAILABLE |
| PHP queue import | Laravel queue worker, polling 3 s | `default,reconciliation,documents,deliveries`; timeout 75 s, tries 1 | jobs/failed_jobs; lifecycle baru: heartbeat, ID job, attempt, durasi | Worker lama perlu memuat provider; proses sukses bukan bukti hasil bisnis; PARTIAL |
| PHP rekonsiliasi | Worker polling 3 s; event POP/handover/mapping dan scheduler | `reconciliation`; launcher timeout 75 s, tries 4 | customer-day dan pickup reconciliation state, evaluated_at, last_error; lifecycle | Waktu evaluasi bisnis bukan waktu start proses; PARTIAL |
| PHP dokumen / email | Worker polling 3 s | `documents,deliveries`; timeout 75 s, tries 4 pada launcher | manifest status, delivery attempts/status, accepted_at | ACCEPTED bukan delivered; provider outcome UNKNOWN tidak diulang; PARTIAL |
| PHP notifikasi | Worker polling 2 s | database `mobile-push`; timeout 60 s, tries 1 | mobile_push_deliveries, cashless_entry_alert_deliveries; lifecycle | FCM accepted tidak membuktikan banner/HP menerima; PARTIAL |
| Scheduler | `schedule:work`, evaluasi per menit | proses scheduler | Empat event terdaftar; starting/finished/failed/skipped baru | Registration bukan observed execution; missed UNKNOWN; PARTIAL |
| APEX CCC | Pool Node, default 5 browser/proses dengan sesi terpisah; claim berkala | `apex-pool.mjs` → `worker.mjs`; app-level report queue | report_jobs + report_job_events + batch checkpoints; start/end/error/attempt/lease; heartbeat Node baru | Pool bukan Laravel jobs. Menunggu hasil dapat tanpa batas; tidak membuktikan remote sehat; PARTIAL |
| APEX failover | Login endpoints CCC01–04; pre-submit failover | worker APEX | Origin History yang tersimpan + event failover hostname-only baru | Tidak failover/resubmit setelah Process. Endpoint terpilih sekarang UNKNOWN; PARTIAL |
| Hybrid PM / manual + cashless collector | Browser resident `roberto`; keep-alive 300 s, login harian 00:30 WIB; report atas permintaan/profile | Node Hybrid | report_jobs source roberto; source saved/failed, timestamps | Health jaringan real-time tidak diprobe; PARTIAL |
| Hybrid Puman / manual + cashless collector | Browser resident `nuralamt`; frekuensi sama | Node Hybrid | report_jobs source nuralamt; source saved/failed | Kegagalan satu sumber tidak membuktikan semua browser mati; PARTIAL |
| Cashless entry / approve batch | POP final → batch; personal account; maksimum 5 slot dan satu lane per account | Node Hybrid + `cashless-pool.mjs` | cashless_entry_batches/items/events, lease_until, approved_at; aggregate activity heartbeat baru | Bukan queue Laravel. UNKNOWN external mutation tetap ditahan; akun tidak diserialisasi; PARTIAL |
| Report gabungan Hybrid → APEX | Dua sumber satu server/tanggal → file AWB gabungan | app-level queue `report_jobs` | COLLECTING_SOURCES → WAITING_APEX → RUNNING / WAITING_REPORT / DOWNLOADING → COMPLETED | Status sumber, import dan projection terpisah; PARTIAL |
| CSV import / dedup | CSV tersimpan → ImportJneReportAwbs | default; 60 s / tries 1 | import_status, imported_at, imported_awb_count, duplicate_awb_count, import_error | Durasi import historis tidak punya start sendiri; PARTIAL |
| Tracking projection / category / matching | Setelah import; projector atau rebuild | default, job import yang sama | projection_status/error; jne_mapping_runs untuk reapply nama/customer | Subtahap internal tidak diinventarisasi sebagai event palsu; durasi masing-masing UNKNOWN; PARTIAL |
| Customer mapping reapply | Alias/master berubah atau admin meminta reapply; chunk 200 | SyncJneCustomerMappings, default; 60 s / tries 1 | jne_mapping_runs status, completed_at, affected_count, last/upper ID | Data pengirim mentah tidak dikirim ke Control Center; PARTIAL |
| Rekonsiliasi / kompilasi customer-day | POP final, bukti sumber, correction, handover; queue due tiap menit | ReconcilePickupProcessingJob, reconciliation; 60 s / tries 4 | pickup_processing_reconciliations + pickup_customer_reconciliations | Perlu diperiksa / menunggu bukti bukan otomatis kegagalan worker; PARTIAL |
| Antrean bulk / historis rekonsiliasi | Admin atau projection mengantrekan kumpulan pickup | QueueBulkPickupReconciliationsJob / QueueHistoricalPickupReconciliationsJob, default; 60 s / tries 3 | jobs/failed_jobs + lifecycle dan hasil rekonsiliasi | Tidak ada run table terpisah untuk setiap dispatch historis; PARTIAL |
| Manifest AWB | Rekonsiliasi selesai → render XLSX/PDF | RenderPickupAwbManifestJob, documents; 75 s / tries 4 | pickup_awb_manifests status, render_attempts, last_error | Tidak membaca snapshot penerima / file untuk monitoring; PARTIAL |
| Email rekap kiriman | Manifest READY dan preferensi enabled → delivery | DeliverPickupAwbManifestJob, deliveries; 60 s / tries 1 | pickup_awb_deliveries dan attempts; started_at/accepted_at/last_error | Tidak menghubungi SMTP dari monitoring; PARTIAL |
| Email bukti pickup | Aksi kirim POP, sinkron dalam SendPickupReceipt | request PHP, bukan queue wajib | pickup_receipts + receipt_attempts, accepted_at / last_error | ACCEPTED_BY_PROVIDER bukan bukti dibaca. Tidak ada start historis khusus; PARTIAL |
| Push penugasan / cashless / test | Observer assignment, alert batch, atau tes admin | SendPickupAssignmentPush / SendCashlessEntryAlertPush / SendMobileTestPush; database mobile-push, 60 s / tries 1 | delivery tables + cache status tes, lifecycle | Status tes cache tidak dipindai global; raw token tidak dibaca; PARTIAL |
| Impor master / alamat / pickup history | CLI operator, tidak terjadwal | PHP commands, sinkron | Result CLI / data master / backup privat | Belum ada execution ledger terpusat untuk CLI manual; UNAVAILABLE |
| Maintenance / rebuild / backfill / recover | CLI operator dan beberapa aksi admin | PHP commands; sebagian dispatch default | Domain run records jika tersedia, framework log | Tidak dieksekusi oleh halaman ini; hasil command manual historis UNKNOWN; PARTIAL |
| Infrastructure / supervisor / browser resources | Windows launcher; Linux belum tersedia | OS process tree, browser children | Snapshot proses Windows dibaca sekali saat audit | Tidak ada dashboard CPU/RAM/disk/browser memory. Tidak ada health Linux terverifikasi; UNAVAILABLE |

Sepuluh job aplikasi terinventarisasi seluruhnya pada tabel di atas. Command aplikasi yang ditemukan:

`jne-reports:import-awbs`, `app:create-operational-admin`, `cashless:entries`, `customers:sync-addresses`, `pickup:complete-no-packages`, `pickup:mail-test`, `pickup-history:import`, `jne-reports:backfill-metrics`, `jne-monitoring:classify`, `mobile:revoke-device`, `pickups:generate`, `jne-customers:import`, `jne-reports:retry-source-failures`, `jne-monitoring:rebuild`, `report-jobs:recover`, `pickups:reconcile-buckets`, `pickups:queue-automation`, `jne-reports:queue-range`, `jne-reports:queue-due`. Jumlah hasil enumerasi: **19 command aplikasi**, ditambah command closure `inspire`; command vendor/framework tidak diperlakukan sebagai proses operasional baru.

Launcher Windows memiliki delapan layanan: web, scheduler, import, reconciliation, documents, notifications, apex, hybrid. PHP queue recycle setelah 100 job atau 3.600 s; launcher mengulang sesudah exit dengan jeda 5/30 s. `DevCommands` juga mendaftarkan worker dev (reconciliation 60 s, documents 75 s, deliveries 60 s, mobile-push 60 s). Ini konfigurasi, bukan bukti proses-proses tersebut sedang hidup.

Queue connections terdaftar: sync, database, beanstalkd, sqs, redis, deferred, background, failover. Database adalah default workspace teramati. Connection failover mengacu database/deferred. Connection lain belum dibuktikan dipakai; kredensialnya tidak dibaca atau ditampilkan. Tidak ada infrastruktur baru ditambahkan.

## 2. Sumber telemetry

- Queue: `jobs` tanpa payload, konfigurasi database retry_after, `failed_jobs` tanpa payload dan maksimum 512 karakter exception hanya untuk klasifikasi internal.
- Report: `report_jobs`, stage/import/projection, row/duplicate counts, attempt, lease, created/started/completed/imported/updated timestamps. `report_job_events`/`report_job_batches` ditemukan sebagai bukti rinci; halaman tidak memindai seluruh event/batch historis.
- Cashless: batch metadata; item/event/lane tables terinventarisasi. AWB, HO detail, evidence JSON dan identitas account tidak dimuat halaman.
- Mapping, reconciliation, manifests, deliveries, receipts dan push: select kolom metadata eksplisit, tidak memuat penerima, email, snapshot, raw_data, claim token atau password.
- Log aplikasi: default stack; Laravel exception reporting dan sanitized ReportPipelineFailure logs. Log Node stdout/stderr serta file launcher tersedia. Tidak ada log-file viewer mentah yang dapat membocorkan PII/SQL; error yang ditangkap pipeline sekarang ikut telemetry aman.
- Endpoint `/up` ditemukan pada bootstrap. Halaman tidak melakukan HTTP self-probe ataupun probe eksternal.
- Telemetry baru: file privat `storage/app/private/operations-telemetry/{workers,schedules,errors}`. `CONTROL_CENTER_PATH` dapat menunjuk volume observability bersama, sama untuk PHP dan Node; `CONTROL_CENTER_ENABLED=false` mematikan writer.

## 3. Cakupan halaman / matriks acceptance

| Area | Implementasi | Cakupan |
| --- | --- | --- |
| Overview | Jumlah health dengan UNKNOWN terpisah, worker teramati, queue siap/reserved/failed 24 jam, report aktif, diagnostik dalam sampel, waktu snapshot | PARTIAL |
| Service health | 17 komponen, bukti web/DB saat request; last success/failure yang tersimpan; coverage | PARTIAL |
| Worker | Heartbeat/lifecycle PHP dan Node, ID aman, job aktif, BUSY/IDLE/UNHEALTHY/STOPPED/UNKNOWN; expected APEX slots sesuai config | PARTIAL secara operasional; lifecycle lokal teruji |
| Queue database | Siap, reserved, delayed, failed 24 jam, retry, umur tertua, retry_after, timeout teramati, expired reservation | VERIFIED untuk database; driver lain UNAVAILABLE |
| Scheduler | Empat registry + cron/timezone/overlap; starting/finished/failed/skipped, exit code, durasi, last success/failure | PARTIAL; aktivasi scheduler lama belum dibuktikan |
| Integrasi | Hasil operasi APEX/PM/Puman, error, operation duration, source freshness, report backlog, failover baru, historical hostname | PARTIAL; live external health UNKNOWN |
| Pipeline | Metadata report/import/projection/cashless/mapping/reconciliation/customer-day/dokumen/email/push serta attempt handler PHP, ID korelasi, error aman, lease/retry/duplicate | PARTIAL; tidak ada timing subfase yang tidak tercatat |
| Diagnostics | Maksimum 100 catatan, 24 jam di dalam sampel, failed jobs / failures / exceptions / deadlock / timeout / attempt | PARTIAL; bukan seluruh log historis |
| Performance | Sampel lifecycle PHP, nearest-rank P50/P95 minimal 5 sampel, first-attempt queue wait, failure ratio dalam sampel | PARTIAL; throughput dan trend backlog Not Instrumented |

## 4. Metodologi worker

PHP menggunakan event framework `Looping`, `JobProcessing`, `JobProcessed`, `JobExceptionOccurred`, `WorkerStopping`. Heartbeat idle dibatasi sekali per 10 s. Job start/end ditulis segera; sync/deferred/background jobs tidak diklaim sebagai daemon queue. Queue yang dikonfigurasi dipertahankan ketika worker sedang mengerjakan salah satu queue. `PROCESSED` berarti handler kembali; bukan bukti hasil bisnis sukses (handler bisa menangkap error).

Node menggunakan heartbeat 15 s (timer unref), lifecycle run APEX dan activity set untuk beberapa report/cashless concurrent di proses Hybrid. Satu job selesai tidak mengubah Hybrid menjadi IDLE ketika job lain masih aktif. APEX poll idle mengembalikan state setelah gangguan claim; gagal API tidak otomatis dinyatakan sukses. Instance APEX dihitung dari `ReportJob::apexWorkerSlots()`; slot tanpa heartbeat ditampilkan UNKNOWN.

Freshness maksimum 120 s. Heartbeat stale tanpa event penghentian menjadi UNKNOWN. STOPPED baru hanya berasal dari lifecycle berhenti normal, tidak disimpulkan dari antrean kosong. Setelah 120 s, record dengan event STOPPED masuk riwayat penghentian (maksimum 20 ditampilkan, jumlah mengacu record yang masih tersimpan), tidak menambah jumlah worker UNKNOWN. Jika tidak ada worker pengganti yang teramati, slot/queue yang diharapkan tetap UNKNOWN. Data attempt historis tetap dipakai pada sampel durasi dan diagnostik. Crash, kill paksa, mesin terputus dan PID tanpa event berhenti tidak dipindahkan ke riwayat seolah-olah berhenti normal. ID menyertakan runtime/worker, hash host dan PID; tidak menampilkan hostname asli. Status ini terbatas pada process records yang masih disimpan; bukan jumlah penuh kapasitas supervisor.

File di tiap kategori dibatasi 128 (writer memangkas file lama saat menambah identitas), pembacaan dibatasi 512 directory entries dan 128 records, file maksimum 64 KiB; 30 attempt terakhir per worker dan 20 exception per process. Snapshot me-memoize pembacaan per kategori dalam satu request. Race writer lintas proses dapat meninggalkan sedikit file ekstra; reader tetap memiliki batas keras. PHP menggunakan flock nonblocking; Node atomic rename. File invalid atau terkunci dilewati, tidak dianggap sehat.

Seluruh kegagalan instrumentation ditangkap tanpa memanggil reporter kembali. Writer tidak menggunakan database atau queue operasional, sehingga kegagalan DB tidak menambah transaksi monitoring/deadlock dan tidak ada per-AWB logging baru.

## 5. Queue dan scheduler semantics

`pending`: reserved_at NULL dan available_at <= sekarang. `delayed`: reserved_at NULL dan available_at > sekarang. `reserved`: reserved_at tidak NULL, termasuk reservation kedaluwarsa yang belum direbut kembali; tidak sekaligus dihitung pending. `retries`: jobs yang masih tersimpan dengan attempts > 1, bukan total retry historis. `failed`: failed_jobs connection database, queue terdaftar/teramati, failed_at 24 jam terakhir, arsip terpisah dari jobs. Kegagalan baca/driver unsupported menghasilkan null/UNKNOWN.

Oldest pending menggunakan created_at hanya pada job yang sudah siap. Reservation berisiko bila reserved_at + retry_after <= waktu snapshot. Timeout ditampilkan dari worker options yang teramati; konfigurasi launcher tidak dianggap runtime fakta. Nilai >= retry_after diberi risiko duplicate execution; setting tidak diubah.

Empat jadwal aktual:

| Command | Cron | Guard |
| --- | --- | --- |
| pickups:generate | `* * * * *` | withoutOverlapping + generation policy today/catchup_7_days |
| jne-reports:queue-due | `* * * * *` | withoutOverlapping(10) |
| pickups:queue-automation | `* * * * *` | withoutOverlapping(2), automation enabled di command |
| pickups:queue-automation --recover | `*/5 * * * *` | withoutOverlapping(2) |

Timezone schedule mengikuti konfigurasi runtime (workspace app timezone UTC), ditampilkan bersama cron. Timestamp sumber dinormalisasi UTC untuk urutan lintas runtime dan ditampilkan WIB. Aturan bucket bisnis 05:00–04:59 tidak disentuh. Missed executions UNKNOWN karena `when`, overlap, maintenance, runtime yang belum diinstrumentasi, dan kondisi command dapat melewati jadwal secara sah. Finished exitCode != 0 dicatat FAILED; skipped tidak menimpa last success/failure atau mengarang last start. Background scheduled task belum digunakan; jika ditambah kelak perlu acceptance lifecycle terpisah.

## 6. Integrasi dan pipeline

Tidak ada perubahan autentikasi, failover, retry, polling JNE, HO, submit atau approval. Tidak ada probe server JNE/SMTP/FCM. Report parent Hybrid dan queue Laravel dipisahkan. `COLLECTING_SOURCES` dan `WAITING_APEX` adalah nama status aktual, bukan label buatan.

Sukses historis tidak menghasilkan HEALTHY pada integrasi. Durasi report adalah waktu operasi tercatat, termasuk menunggu report, bukan latency request. Source freshness adalah completed_at pada sumber tersimpan dalam sampel; bukan tanggal seluruh dataset lengkap. Endpoint historis berasal dari `parameters.apex_history.origin`, hanya hostname JNE yang diizinkan. Endpoint selection saat ini tetap UNKNOWN. Event failover menyimpan maksimum 20 perpindahan per process, hostnames saja, tanpa URL/session/query.

Active report lama diprioritaskan sebelum 100 ID terbaru, digabung unik berdasarkan ID hingga maksimum 100 report. Tahap aktif diprioritaskan dalam tampilan 100 pipeline gabungan agar report macet tidak hilang karena ada ID baru. Import/projection adalah tahap terpisah pada report yang sama, bukan duplicate run; duplicate_awb_count ditampilkan apa adanya. Tidak menjumlahkan ulang hasil source/parent sebagai volume AWB unik global.

Untuk sumber selain report, start/end hanya ditampilkan jika field tersedia. created_at pada mapping/cashless adalah awal record/batch (dapat mencakup waktu antre), bukan klaim waktu browser mulai. Projection/evaluation tanpa start memiliki durasi UNKNOWN. Rekonsiliasi business waiting tidak disamakan dengan job failure. UNKNOWN/PARTIAL/NEEDS_ATTENTION ditampilkan ATTENTION, bukan keberhasilan atau kepastian gagal.

## 7. Diagnostik dan redaksi

Tidak mengirim payload serialized job, raw CSV, JSON evidence, claim key/token, cookies, auth headers, akun Hybrid, receiver, shipper, email atau message error mentah. Klasifikasi error memakai allowlist code; database deadlock dari SQLSTATE/code, timeout dari tipe/kode. Pesan diganti ringkasan aman. Exception class dan report ID yang tersedia dipertahankan sebagai korelasi. Stack/SQL/bindings tidak ditampilkan. `ReportPipelineFailure` ikut writer supaya error yang sudah ditangkap importer/projector tidak hilang dari monitoring.

Pencarian diagnostik/pipeline bersifat lokal pada maksimum 100 records yang sudah disanitasi. Tidak ada query per huruf atau pencarian mentah ke log. Paging 20 baris; tabel lain juga paging ketika melebihi 20 baris. Snapshot diperbarui manual; opsi 30 detik tidak aktif secara default, berhenti polling saat tab tersembunyi dan tidak menumpuk request. Data lama dipertahankan saat refresh gagal, dengan pesan pemulihan.

## 8. Query performance

- Semua tabel domain menggunakan primary-key `ORDER BY id DESC LIMIT 100` dan kolom eksplisit. Tidak membaca jne_shipments, jne_report_awbs, raw payload atau historical reconciliation event collections.
- Report active query memakai status index dan LIMIT 100; satu query tambahan untuk stage aktif. Backlog report memakai index status/source. Queue live aggregate hanya jobs, sesuai indeks queue.
- Failed counter memiliki filter connection + known queue + failed_at >= 24 jam, sesuai indeks `failed_jobs_connection_queue_failed_at_index`. Detail exception dibatasi 50 ID terbaru dan prefix 512 karakter, lalu disanitasi.
- Hostname historical APEX memakai JSON scalar extraction pada maksimum 100 report, tidak memuat array AWB dari parameters.
- Test menjaga request < 35 SQL queries walaupun ada >100 report fixture. Tidak ada job tambahan untuk menghitung metrik. Global cache tidak diperlukan; file telemetry dibaca sekali per request/kategori.
- EXPLAIN MySQL audit untuk active backlog memilih `report_jobs_status_id_index`, range, estimasi 8 rows pada snapshot audit. GROUP BY menggunakan temporary table kecil. Ini bukti plan metadata saat audit, bukan benchmark load produksi.
- Durasi snapshot aktual ditampilkan sendiri (tidak mencakup network/render). Biaya hitungan queue tetap mengikuti ukuran backlog aktif; tidak mengklaim konstan pada antrean jutaan record. Tidak ada throughput/trend chart yang dibuat dari sampel tidak lengkap.

## 9. Pengujian dan screenshot

Semua fixture browser memakai database SQLite baru di output, queue/mail/HTTP diisolasi. Tidak menjalankan penarikan JNE, input resi, approval, email, push produksi atau perubahan rekonsiliasi bisnis.

Backend: `ItControlCenterTest` mencakup auth/role/inactive/guest, readonly method, queue count boundary, payload redaction, fresh/busy/idle/stale/stopped/unknown, timeout/retry, event worker sebenarnya, scheduler exit code + last-run/success/failure, integration failure/recovery/failover, import duplicates dan projection error, safe caught DB error, insufficient percentile samples, storage failure isolation, bounded query/source scans, serta old active reports. Regression mencakup ReportPipelineDiagnostics, JneReportAwbImport, PickupAutomationMonitoring, PickupProcessingAutomation, PickupAwbManifest, PickupReceiptDelivery.

Perintah backend membutuhkan extension SQLite untuk DB test; manifest test juga membutuhkan extension zip. Rerun dengan `php -d extension=pdo_sqlite -d extension=sqlite3 -d extension=zip vendor/bin/pest ... --compact`; tidak mengubah php.ini atau dependency. OpenSSL memakai konfigurasi lokal yang tersedia pada proses test saja.

Hasil acceptance awal: **89 backend tests / 644 assertions lulus**, termasuk 17 test Control Center; **4 test frontend lulus**; **68 test Node worker/pool/telemetry lulus** (dua test telemetry juga dijalankan ulang dan lulus). TypeScript web/mobile, lint scoped, Pint dirty, dan production build lulus. Frontend mencakup UNKNOWN vs measured zero, state labels, escaping, bounded local search dan missing evidence. Node mencakup heartbeat, concurrent activity, failover field allowlist, failure-safe storage dan regression worker/pool. Lihat log `output/it-control-center-*.log`. Suite penuh repository belum dijalankan.

Browser acceptance pada 1440, 768, 390, 375 px: seluruh tujuh bagian, tidak ada page overflow, tidak ada pageerror, local search tidak mengirim request, refresh/hash deep-link. Light/dark dan reduced motion diperiksa. Tabel lebar memakai scroll region berlabel, bukan overflow halaman. Semua screenshot adalah **fixture**, bukan health produksi:

- `output/it-control-center/1440-layanan.png`
- `output/it-control-center/1440-workers.png`
- `output/it-control-center/375-workers.png`
- `output/it-control-center/1440-diagnostics-dark.png`
- `output/it-control-center/browser-results.json`

**Bukti proses nyata:** audit read-only Windows mengamati empat PHP queue worker, scheduler, lima child APEX, pool supervisor dan Hybrid resident. Itu snapshot OS sekali, tidak dipalsukan sebagai collector runtime dashboard. Acceptance terisolasi menjalankan PHP queue worker PID 19580 pada queue kosong khusus fixture: Get-Process hidup + heartbeat IDLE, kemudian exit normal 0 + event STOPPED. Bukti di `output/it-control-center-worker-observation.json` dan `...-worker-stopped.json`. Tidak ada worker operasional yang direstart. BUSY diuji melalui framework lifecycle database job terisolasi; tidak mengklaim semua daemon produksi sudah memuat instrumentasi baru.

## 10. Linux activation / release blockers

### Pemeriksaan lanjutan runtime Windows — 6 November 2026, sekitar 09:10 WIB

Worker import PID 26104 teramati BUSY dan worker mobile-push PID 24544 teramati IDLE melalui heartbeat yang cocok dengan proses OS yang sedang hidup. Scheduler mencatat `jne-reports:queue-due`, `pickups:queue-automation`, dan `pickups:queue-automation --recover` SUCCESS; `pickups:generate` SKIPPED, bukan kegagalan. Semua bukti muncul dari runtime yang memuat kode secara normal, tanpa restart operasional oleh fitur ini.

Retensi telah mencapai 128 record worker karena recycle normal. Perbaikan lanjutan memisahkan event penghentian lama dari monitor worker saat ini; riwayat tersebut sebelumnya memperbesar jumlah UNKNOWN. Acceptance tambahan memakai 60 worker historis, worker pengganti aktif, dan proses stale tanpa bukti berhenti; sampel attempt tetap dipertahankan. Tes terfokus terbaru: 18 backend tests / 164 assertions dan 5 frontend tests lulus. APEX/Hybrid yang masih memakai proses lama tetap UNKNOWN untuk heartbeat; observasi OS bukan bukti job BUSY/IDLE atau kesehatan JNE.

### Koreksi penilaian UNKNOWN — 6 November 2026, sekitar 09:40 WIB

Sebagian baris layanan sebelumnya selalu mengembalikan UNKNOWN meskipun dependency queue sudah mempunyai heartbeat. Kini CSV import, mapping, reconciliation, documents dan agregat PHP queues memakai cakupan **queue masing-masing**, bukan sembarang worker PHP. Tidak ada heartbeat tetap UNKNOWN; worker sehat dengan cakupan sebagian menjadi DEGRADED; semua dependency tercakup dapat HEALTHY untuk **kesiapan runtime**, bukan jaminan setiap job berhasil. Kegagalan operasi terbaru yang masih fresh menurunkan health. SMTP/FCM tetap DEGRADED ketika hanya kesiapan worker yang terbukti, karena tidak ada pemeriksaan provider/end-device. Kesiapan akun cashless individual tidak disimpulkan dari heartbeat Hybrid umum.

Scheduler kini membandingkan event terakhir dengan **cron berikutnya + 120 detik**, termasuk task setiap lima menit. SUCCESS/RUNNING/SKIPPED hanya berlaku selama jendela tersebut. Event kedaluwarsa/future menjadi UNKNOWN dengan last_state terpisah; SKIPPED by policy bukan kegagalan. Scheduler HEALTHY memerlukan bukti yang masih berlaku untuk semua task terdaftar, sementara kegagalan/cakupan sebagian menjadi DEGRADED.

Node menyimpan pemeriksaan sesi per sumber secara terpisah di heartbeat: APEX authenticated/CSV completed/no-data yang terverifikasi, Hybrid session active/failed/waiting. Timestamp pemeriksaan **tidak diperbarui heartbeat 15 detik**. Bukti koneksi berlaku 660 detik (dua siklus keepalive Hybrid 300 detik + toleransi), dan hanya dipakai jika proses juga memiliki heartbeat fresh serta belum STOPPED. Multi-instance dengan hasil campuran DEGRADED; host di-allowlist; password, session/token, raw error dan AWB tidak ditulis. FORM_VALUE tidak otomatis dianggap koneksi putus. APEX service HEALTHY juga memerlukan heartbeat sehat untuk semua instance yang dikonfigurasi. Tidak ada probe atau request eksternal tambahan dari halaman monitoring.

UI menampilkan alasan health dan waktu bukti. Infrastruktur/cache/CLI yang belum memiliki pengukuran tetap UNKNOWN/UNAVAILABLE secara eksplisit. Snapshot OS read-only sekitar 09:36 WIB menunjukkan pool APEX dan Hybrid yang dimulai 5 November, sebelum hook Node baru. Jalur heartbeat API di bawah mengatasi observasi BUSY/IDLE tanpa restart proses tersebut.

Validasi koreksi: **22 backend tests / 200 assertions, 6 frontend tests, 68 Node tests lulus**; types web/mobile, lint scoped, Pint dirty dan production build lulus. Browser acceptance **8 checks** pada 1440/768/390/375 px lulus tanpa overflow atau pageerror, memakai database fixture terisolasi. Log build/browser: `output/it-control-center-unknown-build.log`, `output/it-control-center-unknown-browser.log`. Bukti live semua Node belum diverifikasi; coverage tetap PARTIAL.

### Aktivasi tanpa restart melalui heartbeat API terautentikasi

Worker lama sudah melakukan claim/progress/upload/fail ke Laravel. Sesudah autentikasi worker, validasi dan pemeriksaan kepemilikan oleh controller berhasil, middleware merekam **respons yang berhasil**, bukan membaca status job historis untuk menebak proses hidup. Claim 204 = IDLE; respons aktif terkonfirmasi = BUSY dengan ID job; completion/NO_DATA = IDLE; kegagalan terkonfirmasi = UNHEALTHY. Respons 401/403/422 atau kepemilikan salah tidak membuat heartbeat. Hook tidak mengubah status/body/header API, konfigurasi queue, lease, autentikasi, atau proses bisnis.

Pencatatan hanya menulis allowlist metadata ke private telemetry; claim token, akun/password, payload, file/checksum, nama customer dan AWB tidak disalin. Pembacaan state sebelumnya menggunakan satu hashed record maksimal 64 KiB, bukan memindai seluruh worker pada setiap request; IDLE dibatasi satu write per 10 detik. Kegagalan telemetry tidak mengubah respons worker. Native APEX heartbeat yang fresh menggantikan fallback API pada daftar worker supaya tidak dihitung dua kali. CSV/source upload tervalidasi dan NO_DATA terverifikasi dapat menjadi bukti operasi integrasi; claim ulang idempotent atas job COMPLETED lama **tidak** memperbarui bukti koneksi. Claim/progress saja juga tidak memperbarui bukti sesi.

**Bukti live sesudah perubahan:** tujuh identitas API fresh terbaca dari request worker yang memang sudah berjalan: lima slot APEX serta `hybrid-roberto` dan `hybrid-nuralamt`. Observasi pertama menunjukkan empat APEX BUSY/satu IDLE dan dua Hybrid IDLE; observasi berikutnya kelima APEX BUSY saat instance ketiga mengambil job, dua Hybrid tetap IDLE. Bukti aman di `output/it-control-center-unknown-runtime.json` memuat state/timestamp/ID korelasi dan snapshot OS. Tidak ada restart atau mutasi operational records oleh monitoring. Permintaan izin restart sebelumnya tidak lagi diperlukan untuk mengaktifkan deteksi ini.

Validasi akhir API/health: **138 backend tests / 1.263 assertions lulus**, mencakup Control Center (28 test), report worker API, dan cashless batches; frontend 6, Node 68, types/lint/build serta browser 8 checks lulus. Log terfokus: `output/it-control-center-unknown-php-focused.log`. Pemeriksaan tambahan dengan `HybridApexPipelineTest` menghasilkan **143/144 lulus**: tes lama `a pending APEX conversion blocks duplicate schedules and an APEX failure remains available for review` gagal pada ekspektasi bahwa NEEDS_ATTENTION memblokir penarikan berikutnya (baris 118). Reproduksi satu tes tersebut tetap gagal dengan telemetry disabled (default phpunit), sehingga bukan akibat pencatatan worker API; aturan/test bisnis itu tidak diubah oleh pekerjaan ini. Log tambahan: `output/it-control-center-unknown-php.log`. Coverage global tetap PARTIAL karena belum ada infrastruktur/provider/end-device telemetry dan belum ada verifikasi deployment Linux, bukan karena fallback API belum aktif. Postman CLI yang tersedia tidak mendukung `status`; pembuktian kontrak menggunakan HTTP feature tests lokal, bukan klaim collection run Postman.

1. Deploy kode lewat prosedur normal; halaman ini belum dideploy. Tidak ada migration atau perubahan settings queue yang dibutuhkan oleh fitur ini.
2. Provider dan Node module native perlu dimuat oleh proses runtime baru untuk hook lokal penuh. Fallback API terautentikasi sudah mengamati APEX/Hybrid lama tanpa restart. Rolling reload/restart operasional tetap langkah release terpisah yang **belum dilakukan**. PHP yang recycle sendiri dapat mulai mengirim telemetry setelah memuat kode, bukan karena dipicu dashboard.
3. PHP, scheduler dan Node harus mengarah ke CONTROL_CENTER_PATH yang sama, writable oleh account runtime, readable hanya oleh aplikasi/IT. Default file 0600/directory 0700 mengasumsikan account OS sama. Untuk multi-host perlu volume bersama dan permission/ACL yang ditinjau, atau collector terpusat berikutnya. Host tanpa volume tidak terlihat dan tetap UNKNOWN.
4. Verifikasi supervisor/systemd process inventory, expected instances, graceful exit/recycle, lease timing, signal/kill, clock synchronization, retention dan permission di Linux sebelum menandai WORKER MONITORING VERIFIED untuk deployment.
5. Uji scheduler normal, skip by policy/overlap dan nonzero exit di lingkungan deployment. Missed tetap UNKNOWN sampai mempunyai continuity model yang reliabel.
6. Verifikasi Node APEX/Hybrid heartbeat dan failover pada runtime deployment dengan kontrak/sandbox resmi; halaman tidak memulai probe atau transaksi eksternal untuk membuktikannya.
7. CPU/RAM/disk, uptime eksternal, SMTP/FCM end-to-end delivery, request latency, exact per-stage reconciliation duration, historical CLI execution ledger, sustained throughput dan backlog trends belum diinstrumentasi. Gap ini tidak menghambat pemakaian subset baca yang sudah teruji, tetapi menghambat klaim full observability.

Tidak melakukan reset/stash/commit/push/deploy, restart worker produksi, perubahan queue settings, dependency baru atau mutasi operational records. Git dirty awal berasal dari pekerjaan lain dan dipertahankan. Pint hanya memformat file terkait yang dilaporkan formatter.

## Acceptance

```text
SYSTEM INVENTORY: COMPLETE (repository scope; infrastructure deployment unavailable)
SERVICE HEALTH: PARTIAL
WORKER MONITORING: PARTIAL
QUEUE MONITORING: VERIFIED (database only)
SCHEDULER MONITORING: PARTIAL
INTEGRATIONS: PARTIAL
PIPELINES: PARTIAL
DIAGNOSTICS: PARTIAL
TESTING: FAIL (1 existing Hybrid regression in extended checks; 138 focused backend tests and frontend/Node/browser checks PASS)
RELEASE: NOT DEPLOYED
```
