# JNE reports and retail shipment monitoring

Status: **M1 LIVE RETRIEVAL PASS; subsequent monitoring stages implemented**.
An unattended live run on 21 October 2026 completed report job #3 for the
previously authorized 13–14 October period: login, page 45 submission, History
correlation, CSV download, private upload, 428 imported AWBs, and monitoring
projection all succeeded. The original job #2 is retained as an older snapshot.
No forced production pickup association was made: real customer/account mapping
must be configured by an Admin. Automatic/manual matching, reconciliation, and
scheduling are covered with fixtures and application tests; no recurring live
JNE schedule was activated during implementation.

This is a worker in the existing Retail Operations repository. Laravel owns
authorization, the `report_jobs` table, lifecycle, and private CSV storage. Node
claims jobs through Laravel's internal API and drives Chromium. No additional
Laravel backend or application database is introduced. Import, tracking history,
reconciliation, and the scheduler run inside the existing Laravel application.

**Install and configure**

From the repository root:

```sh
php artisan migrate --no-interaction
php artisan config:clear --no-interaction
npm run build
cd workers/jne-report
npm ci
npm run install:browser
```

The new migration is
`database/migrations/2026_10_20_062558_create_report_jobs_table.php`. It was applied
to the local application database during implementation. On an existing working
checkout with unrelated pending migrations, apply only this migration using
`php artisan migrate --path=database/migrations/2026_10_20_062558_create_report_jobs_table.php --no-interaction`.
Rolling it back drops report job metadata; retain CSVs and job metadata before
any destructive rollback.

Node 24 or later and the pinned Playwright 1.64.1 are required. Linux hosts may
need `npx playwright install --with-deps chromium` instead of the browser-only
installation command. Chromium runs headless with its default sandbox settings.

Copy the worker `.env.example` to `workers/jne-report/.env`, and configure the
Laravel root `.env`. Generate a random worker token of at least 32 characters
locally; put the same token and worker ID in both files. Do not commit or print
credentials or session state. APEX credentials belong only in the worker's
environment. Restart the worker after configuration changes; rebuild Laravel's
configuration cache if deployment uses cached configuration.

| Laravel environment        | Purpose / default                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `JNE_REPORT_WORKER_TOKEN`  | Required dedicated secret, at least 32 characters                                                |
| `JNE_REPORT_WORKER_ID`     | `jne-report-1`; only this identity is accepted                                                   |
| `JNE_REPORT_LEASE_SECONDS` | `300`; heartbeat renews the claim                                                                |
| `JNE_REPORT_MAX_FILE_KB`   | `20480`; server-side upload limit                                                                |
| `JNE_REPORT_MODE`          | `P`; verify its meaning on the authorized live form                                              |
| `JNE_REPORT_STORAGE_PATH`  | Optional absolute persistent private storage root; defaults to `storage/app/private/jne-reports` |

Keep the report disk outside the public web root. Align PHP `upload_max_filesize`,
`post_max_size`, and the reverse proxy body limit with the configured CSV limit.
The Laravel web process must have persistent read/write access to this directory;
upload and download requests must reach the same filesystem in M1.

| Worker environment                                      | Purpose / default                                                                                                             |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `RETAIL_OPERATIONS_URL`                                 | Laravel root URL, without `/api`; example `http://localhost:8000`                                                             |
| `JNE_REPORT_WORKER_TOKEN`, `JNE_REPORT_WORKER_ID`       | Match Laravel                                                                                                                 |
| `APEX_LOGIN_URL`                                        | Required authorized login URL                                                                                                 |
| `HYBRID_ROBERTO_LOGIN_URL`, `HYBRID_NURALAMT_LOGIN_URL` | Required private Hybrid login URLs; configure only in the ignored `.env.hybrid` file                                          |
| `APEX_USERNAME`, `APEX_PASSWORD`                        | Required JNE credentials                                                                                                      |
| `APEX_BASE_URL`                                         | Optional full same-origin endpoint ending in `/f`; necessary if a friendly login URL does not resolve to the correct endpoint |
| `APEX_APP_ID`                                           | Optional override; otherwise read from the authenticated DOM/URL                                                              |
| `APEX_DATE_FORMAT`                                      | Confirm text date input format; native `type=date` uses `YYYY-MM-DD`                                                          |
| `APEX_HISTORY_DATE_FORMAT`                              | Required confirmed `CREATED_DATE` format                                                                                      |
| `APEX_TIMEZONE`                                         | `Asia/Jakarta`; must match JNE history timestamps                                                                             |
| `APEX_PROCESS_SELECTOR`                                 | Optional unique selector from the actual form; otherwise discover the unique button named Process                             |
| `APEX_SUBMISSION_SUCCESS_SELECTOR`                      | Optional confirmed acceptance marker; defaults to standard APEX success alerts                                                |
| `APEX_EXTRA_FIELDS_JSON`                                | Selector/string-value object for verified SLA, National Account, Branch, or other controls; default `{}`                      |
| `JNE_WORKER_DATA_DIR`                                   | `../../storage/app/private/jne-worker`, relative to the worker directory                                                      |
| `JNE_NAVIGATION_TIMEOUT_MS`                             | `30000`                                                                                                                       |
| `JNE_REPORT_TIMEOUT_MS`                                 | `1200000`                                                                                                                     |
| `JNE_JOB_TIMEOUT_MS`                                    | `1500000`                                                                                                                     |
| `JNE_DOWNLOAD_TIMEOUT_MS`                               | `120000`                                                                                                                      |
| `JNE_API_TIMEOUT_MS`                                    | `60000` per attempt; at most three attempts                                                                                   |
| `JNE_POLL_INTERVAL_MS`                                  | `10000`                                                                                                                       |
| `JNE_CLAIM_INTERVAL_MS`                                 | `5000`                                                                                                                        |
| `JNE_MAX_FILE_BYTES`                                    | `20971520`; the lower worker/server limit applies                                                                             |
| `JNE_CLOCK_SKEW_MS`                                     | `120000`; correlation timestamp tolerance                                                                                     |

Use HTTPS outside local development. Keep the lease longer than three API
timeouts plus retry delay. Session state is saved as `apex-session.json` in the
private worker data directory. POSIX permissions are 0700 for the directory and
0600 for files; on Windows restrict NTFS access to the worker service account.
Temporary job files are removed on success, failure, and graceful shutdown.
Abandoned job directories are removed on startup after acquiring the local
process lock. Session state is retained for normal authentication reuse.

Supported text input date formats: `YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY`,
`DD-MON-YYYY`. Supported history formats: `ISO8601` with explicit timezone,
`YYYY-MM-DD HH:mm:ss`, `DD-MON-YYYY HH:mm:ss`, `DD/MM/YYYY HH:mm:ss`, and the same
three patterns without `:ss` for minute-precision timestamps.
Unsupported formats stop the job for review; verify the actual JNE format before
enabling production work.

Read-only live inspection confirmed the default mode is `A` (Upload Connote).
Selecting `P` (Input Parameter) dynamically renders the account and date controls.
Authentication is verified using the mode control before those dependent fields
exist. Required controls also include `P45_SATURDAY` (Saturday SLA), `P45_HSLA`
(H+), `P45_NA` (National Acc/Cust), and `P45_BRANCH` (Branch). Choose their values
from the authorized form for the intended report; they are not inferred by the
worker. Datepicker format `dd-M-yy` corresponds to `APEX_DATE_FORMAT=DD-MON-YYYY`;
the observed History format is `APEX_HISTORY_DATE_FORMAT="DD-MON-YYYY HH:mm"`.

**Inspect and run a manual live report**

1. Configure authorized JNE credentials locally. Stop any running worker before
   inspection; the inspector and worker share a process lock.
2. From `workers/jne-report`, run `npm run inspect`. It logs in normally, verifies
   access to pages 45 and 46, and emits control metadata, report mode options,
   button labels, and history column names. It never clicks Process and does not
   log credentials, field values, report rows, or session URLs.
3. Check the actual form and History in the authorized environment. Confirm the
   parameter mode, account format, date formats/timezone, required fields,
   Process control, success marker, and validation behavior. Set the environment
   variables above from these observations. Do not guess missing selectors.
4. Start Laravel normally, for example `php artisan serve --no-interaction`
   from the repository root. Existing `composer run dev` also works. Laravel's
   ordinary HTTP process accepts report requests and worker callbacks. No extra
   `queue:work` process is needed for report jobs; existing mobile-push queue
   workers continue independently.
5. Sign in as an active `admin_supervisor`. Open **Administrasi → Penarikan
   Report JNE**, enter the account and period, then click **Tarik Report**.
6. From `workers/jne-report`, run `npm run once` to process at most one claim.
   Use `npm start` for the continuous polling worker. Manage one worker with the
   deployment's existing process manager. Application-managed schedules are
   described below and remain inactive until an Admin explicitly enables one.
7. Watch `Report diminta → Diproses worker → Menunggu JNE → Mengunduh / menyimpan
CSV → Selesai`. Click **Unduh CSV**, confirm the CSV is correct, and compare its
   checksum with the stored job metadata. A completed retrieval says nothing
   about downstream shipment processing, including JNE's `Error On Push`.
8. Exercise an expired session and an invalid parameter in the authorized test
   environment. Verify errors are visible and no duplicate Process is submitted.
   Only after the successful live chain and these checks should M1 be marked PASS.

**Lifecycle, API, and recovery**

The four internal POST endpoints are `/api/internal/report-jobs/claim`,
`/{id}/progress`, `/{id}/upload`, and `/{id}/fail`. All require
`Authorization: Bearer <dedicated-token>` and `X-Worker-ID`. Claim accepts a UUID
`claim_key` and returns a job plus its per-claim `claim_token`; subsequent calls
also require `X-Report-Claim`. No available work returns 204. Ordinary logged-in
users cannot authenticate as workers using their browser session or user token.

Progress accepts only the current state (heartbeat/idempotent retry) or the next
step: `RUNNING → WAITING_REPORT → DOWNLOADING`. The claim changes `QUEUED` to
`RUNNING`. Upload alone changes `DOWNLOADING` to `COMPLETED`, after CSV validation,
private storage, size/MIME metadata, and SHA-256 recording. Repeating an identical
upload returns the existing result; different contents get 409. Failure accepts
`FAILED` or `NEEDS_ATTENTION` and never overwrites a completed result.

Claiming uses a transaction, row locks, and a unique nullable active slot. Only
one job can be active globally in M1. Claim keys make lost claim responses
retryable. Claim tokens are encrypted at rest and excluded from admin payloads.
The worker serializes heartbeats and progress updates, and refreshes the lease.
Read-only navigation and idempotent API requests have bounded retries. Process
has exactly one click per job. If its result is uncertain, history is inspected;
matching requires echoed account/date parameters, or an exact account token in
the filename and a creator matching the authenticated JNE username, together
with a unique new row and a matching timestamp window. Partial account tokens
or a different creator do not qualify. Ambiguous results still stop for review.
Unchanged select values are left intact because JNE onchange navigation can reset
the report mode. Branch/account-type choices are set before account and dates;
inline navigation handlers are awaited before filling dependent controls.

History correlation uses pre-submission IDs, newly observed stable `f01` IDs
when available, timestamps/timezone, optional echoed parameters, and a pinned ID
while polling. The inspected live table does not expose `f01`, so a stable
filename/creation-time/creator tuple identifies each row instead. Duplicate tuples
stop for review. Download revalidates the matched row and its own link rather
than depending on checkbox availability or row order. Header ID `DOWNLOAD` is
recognized even when its visible label is Link.
Multiple candidates stop with `NEEDS_ATTENTION`. A Done report is retrievable
only with its own download link. CSV content is never logged or imported.

Expired claims are marked `NEEDS_ATTENTION` when the next claim is attempted.
The Admin page also offers **Pulihkan klaim kedaluwarsa**. To do this manually:

```sh
php artisan report-jobs:recover --no-interaction
```

Recovery releases expired ownership and records a visible warning; it never
resubmits the report. Late workers cannot update/upload an expired job. Inspect
JNE History before creating another request after a failure, shutdown, timeout,
or ambiguous result. Stop the worker before removing stale/corrupt session state
or investigating a stale process lock. Normal session expiry uses the ordinary
login flow. MFA, CAPTCHA, and access denials require authorized manual action.

**Tests and actual results**

Executed during implementation, with synthetic JNE data only:

- 90 PHP tests passed, 873 assertions: 39 report API/admin tests, two real MySQL
  claim race tests, one actual Laravel API → Node → Chromium → mock APEX → private
  storage → Admin download integration test, plus 48 existing package processing
  and handover regression tests.
- 28 Node tests passed, including real Chromium against the local APEX fixture:
  stable history correlation, timezone parsing, CSV validation, required fields,
  expired sessions, uncertain submission, ambiguous rows, empty history,
  report timeout, upload retry/failure, and graceful cleanup. Follow-up regressions
  cover dynamically rendered parameter controls, minute-precision History,
  missing `f01`, duplicate metadata identities, inaccessible report pages,
  dependent branch choices, full navigation, unchanged options, and strict
  filename-account/creator correlation after an uncertain submission.
  The Laravel/Node/Chromium integration test was rerun after these fixes and
  passed (one test, 13 assertions).
- `npm run types:check`, PHPStan, targeted Vite Plus format/lint checks,
  `vendor/bin/pint --dirty --format agent`, `git diff --check`, and
  `npm run build` passed. The build retains the existing optional-fontaine notice.
- The host's default PHP configuration lacks SQLite drivers. The initial default
  test command failed for that reason; successful runs enabled the bundled
  SQLite extensions explicitly. No application dependency was changed to do so.

From the repository root, reproduce the affected PHP run:

```sh
php -d extension=pdo_sqlite -d extension=sqlite3 vendor/bin/pest --compact tests/Feature/ReportJobTest.php tests/Feature/ReportJobConcurrencyTest.php tests/Feature/JneReportWorkerTest.php tests/Feature/PackageProcessingTest.php tests/Feature/HandoverV2Test.php
npm run types:check
php vendor/bin/phpstan analyse --no-progress --error-format=raw
npm exec -- vp check resources/js/pages/jne-reports.tsx resources/js/components/app-sidebar.tsx workers/jne-report
cd workers/jne-report
npm test
```

The MySQL race tests create and drop randomly named disposable test databases,
following existing project conventions; the configured MySQL test account needs
those permissions. The integration test uses a disposable SQLite database and
private temporary directory, starts a PHP server, and requires Node and the
installed Chromium. None of these tests contacts JNE.

The complete application test suite was not executed. Run
`php artisan test --compact` with the required PHP extensions enabled (or
`php -d extension=pdo_sqlite -d extension=sqlite3 vendor/bin/pest --compact` on
this host) before release.

**Files delivered**

Created:

- `app/Models/ReportJob.php`
- `app/Actions/Reports/ManageReportJobs.php`, `ValidateReportCsv.php`
- `app/Http/Controllers/ReportJobController.php`, `InternalReportJobController.php`
- `app/Http/Requests/StoreReportJobRequest.php`
- `app/Http/Middleware/EnsureReportWorker.php`
- `app/Console/Commands/RecoverReportJobs.php`
- `config/jne-reports.php`
- `database/migrations/2026_10_20_062558_create_report_jobs_table.php`
- `database/factories/ReportJobFactory.php`
- `resources/js/pages/jne-reports.tsx`
- `tests/Feature/ReportJobTest.php`, `ReportJobConcurrencyTest.php`,
  `JneReportWorkerTest.php`, `report-claim-worker.php`
- `workers/jne-report/package.json`, `package-lock.json`, `.env.example`,
  `.gitignore`, `README.md`
- `workers/jne-report/src/{api,apex,config,csv,errors,history,inspect,worker}.mjs`
- `workers/jne-report/test/{apex-fixture,laravel-flow,worker.test}.mjs`

Modified: root `.env.example`, `config/filesystems.php`, `routes/api.php`,
`routes/web.php`, and `resources/js/components/app-sidebar.tsx`. Wayfinder helpers
were regenerated into the existing ignored output directories. Unrelated
uncommitted Pickup, POP, Handover, and UI work was preserved.

The new table includes the requested account/date/mode/parameters, lifecycle,
worker identity/attempts/timestamps/error/file/creator fields, plus claim keys,
encrypted ownership tokens, a unique active slot, lease expiration, and CSV
size/MIME/checksum. No shipment tables were added.

**Limits and M2**

Each parameter report is limited to five calendar days inclusive of both dates
(for example, 13–17 October) and 6,000 CSV data records/AWBs. Admins can request
up to 366 inclusive calendar days at once. Laravel atomically splits the request
into consecutive jobs of at most five days (1–30 becomes 1–5, 6–10, 11–15,
16–20, 21–25, 26–30), with no overlapping or missing dates. The form previews
these periods. The existing worker claims them in order, one at a time, and each
job has its own status and downloadable CSV. The worker still rejects invalid
queued periods before contacting JNE. CSV validation counts parsed records, excluding the
header and empty lines, without importing shipments or deduplicating AWBs.
The parameter form does not provide an independently verified pre-submission
AWB count. The worker checks the downloaded CSV and reports NEEDS_ATTENTION if
it exceeds 6,000 records, without uploading it or repeating Process. Laravel
independently rejects oversized record counts with HTTP 422 before storage or
completion. Request a shorter period after reviewing the failed job/History.
There is no automatic splitting based on AWB count or truncation of CSV contents.

The live mode controls, date formats, required field selectors, History
structure, parameter submission, CSV download, and upload were exercised. The
first submission needed operator correlation review; job #3 subsequently
completed the unattended flow with the final correlation/navigation fixes.
History correlation reads the currently displayed History table; ensure the
unfiltered current report is visible. Hidden/paginated-away rows lead to timeout
or review rather than selection of a different report. Changed headers, unusual
date formats, multiple matching new reports, or unsupported download origins
also require review. There is no automatic retry/resume of report generation
after a crash; only safe HTTP operations and upload are retried.

**AWB import and results (following M1)**

CSV storage now queues `ImportJneReportAwbs` on the existing Laravel default
queue after the storage transaction commits. Run the application's normal
Laravel queue worker (in addition to this Node worker):

```powershell
php artisan queue:work --tries=1 --timeout=60
```

Two additive migrations add import metadata to `report_jobs` and create
`jne_report_awbs`. Apply these migrations before running the updated app. No
additional database, dependencies, scheduler, or shipment tracking tables are
required. In Penarikan Report JNE, use **Lihat / impor AWB** for a completed
report. Existing CSVs can be imported from that page, and failed imports can be
requeued without requesting another report from JNE. For a specific stored CSV:

```powershell
php artisan jne-reports:import-awbs 2
# Optional one-off immediate import, without waiting for a queue worker:
php artisan jne-reports:import-awbs 2 --sync
```

The importer verifies the private file checksum, requires AWB and ID_ACCOUNT,
checks every account against the requested account, and reads optional
STATUS_WEB, STATUS_POD, AWB_CANCEL, SHIPPER_NAME, and CONSIGNEE_NAME fields.
All columns are also retained as private `raw_data` per source record, including
unknown columns and original Excel text prefixes. The CSV file remains unchanged.
UTF-8 CSV, comma/semicolon/tab
delimiters, BOM headers, quoted multiline values, Excel `="text"`, and the JNE
apostrophe prefix on identifiers are supported. Identifiers remain strings;
leading zeros and long values are preserved. AWBs are normalized to uppercase.
CSV logical record numbers are retained as source references.

Identical duplicates within a report are counted and skipped. Conflicting
duplicates reject the complete import; no partial rows are committed. Repeated
or concurrent imports of an imported report are no-ops, backed by a row lock and
a unique report/AWB key. AWBs in separate reports remain separate snapshots;
the monitoring projection below maintains the latest account/AWB state. Import failure has its own
status/error and leaves the completed private CSV available for download.
The Admin-only results page supports prefix AWB search and pagination.

**Monitoring, association, reconciliation, and scheduling**

The additive migration `2026_10_21_061935_add_jne_monitoring.php` enriches source
records and creates `jne_shipments`, `jne_shipment_observations`,
`jne_shipment_match_events`, and `jne_report_profiles`, together with report
review/projection metadata. It has been applied locally. The two preceding
21 October import migrations are also required; on deployment apply the new
migrations before updating long-running workers. No new dependencies are needed.

The **Monitoring AWB JNE** Admin menu provides current status, filters, source
timestamps, per-AWB history, every original CSV column, and matching decisions.
The latest source is selected by TGL_TARIK_REPORT, falling back to request start
or creation time; timestamps are parsed in `JNE_REPORT_SOURCE_TIMEZONE` (default
Asia/Jakarta). Known CSV timestamp formats are strict d-M-Y H:i / H:i:s and
explicit supported ISO formats. Unparseable dates remain null; future report
timestamps beyond the completed report plus five minutes fall back to the
request timestamp. Older imports remain historical and cannot roll back current
status. Equal source timestamps use the newer report ID. Repeated imports do
not create duplicate observations. Rebuilds preserve original source row IDs:

```powershell
php artisan jne-monitoring:rebuild --sync
# Restrict processing to a configured account; omit --sync to use Laravel queue:
php artisan jne-monitoring:rebuild --account=YOUR_ACCOUNT
```

Tracking categories use conservative, explicit matches against source text:
known cancellation flags take priority; DELIVERED TO / DELIVERED identifies
delivery; explicit RETURNED identifies return; known undeliverable values are
exceptions; known transit text is in process. Unmapped text remains UNKNOWN.
POD `Success` or History `Done` alone never establishes delivery. Original
web/POD/cancellation values remain visible, including when a category is unknown.
Summary counts do not assert SLA performance or resolve operational disputes.

In **Customer & pengirim**, maintain names against the existing internal customer
code. Report numbers are configured separately in **Sumber & jadwal**.
Automatic association requires an exact reference match against the pickup
reference or the latest effective processing record's external_reference, that
customer, and a finalized POP. Superseded processing references are excluded.
Shipper aliases identify the customer; pickup association still requires an exact
reference and finalized POP. Names or dates alone never identify a pickup.
Multiple candidates or a conflict with an
existing association require Admin review. An Admin may link/unlink using the
pickup reference with a reason; optimistic versions prevent stale changes, and
every actual decision is audited. Manual decisions are never overwritten by
automatic matching. After updating customer names, rebuild stored CSVs to match
historical sources. Pickup Staff do not scan AWBs.

**Rekonsiliasi pickup** reuses existing processing calculations and compares
effective declared successful quantities with distinct linked AWBs. Missing or
changed Retail/POP baselines are flagged; matching counts do not silently close
discrepancies. Existing pickup/category declarations and verification behavior
remain unchanged. There is no invented allocation of AWBs across categories.

Profiles are disabled by default. Enable a profile explicitly to authorize
recurring report requests. Supported intervals are 1, 6, 12, and 24 hours. Fixed
ranges contain at most 366 inclusive days. Rolling ranges include the last
configured days and entry dates of older nonterminal shipments; when entry dates
are unknown their source report ranges are retained. Overlapping dates are
deduplicated and split into at most five inclusive days. Each cycle is bounded
to 200 jobs; excess work is surfaced as a profile error rather than truncated.

The scheduler locks profiles and advances the next run atomically, with unique
cycle/period keys. Queued/running account reports, pending imports, and
unreviewed failed/uncertain results block another cycle. Review requires an
explicit Admin reason after checking JNE History. It does not retry the old job
or erase its failure. A profile whose managing Admin becomes inactive or loses
the role is disabled. Only the existing Node worker submits Process, once per
claimed job. No external notifications or new infrastructure were introduced.

Run the three existing application processes (or their process-manager equivalents):

```powershell
# Terminal 1 — Laravel CSV import/projection queue:
php artisan queue:work --tries=1 --timeout=60
# Terminal 2 — Laravel application scheduler, including existing pickup schedules:
php artisan schedule:work
# Terminal 3 — Node/Playwright worker:
cd workers/jne-report
npm start
```

Production may use the standard per-minute `php artisan schedule:run` cron
instead of schedule:work. `jne-reports:queue-due` can be run manually to process
due profiles; it honors the same locks, pending-work checks, and review blocks.
Restart long-running workers after deploying code changes. This stage does not
deploy the app, install OS scheduler services, or enable account schedules on
behalf of the Admin.

Additional implementation files: `app/Actions/Reports/{ProjectJneShipments,
MatchJneShipments,QueueScheduledJneReports}.php`,
`app/Http/Controllers/JneMonitoringController.php`,
`app/Console/Commands/{QueueJneReports,RebuildJneMonitoring}.php`, the four new
JNE models/factories, `resources/js/pages/{jne-monitoring,jne-shipment,
jne-profiles,jne-reconciliation}.tsx`, shared JNE navigation, and the monitoring
and scheduling tests. Laravel routes use existing authentication and Admin
authorization; frontend calls use regenerated Wayfinder helpers.

Current-stage validation on 21 October 2026: 179 relevant Laravel tests passed
(including actual MySQL claim races and mocked-JNE Chromium-to-Laravel E2E),
24 frontend tests passed, and 32 Node/Chromium fixture tests passed. PHPStan
reported no errors for the changed backend files; TypeScript, Pint, and the
production frontend build passed. The live database contains 428 unique
shipments and 856 report observations; no imported sources lack raw_data.
Run the affected PHP tests with the existing CLI SQLite extensions when needed:

```powershell
php -d extension=pdo_sqlite -d extension=sqlite3 vendor/bin/pest --compact tests/Feature/JneMonitoringTest.php tests/Feature/JneReportSchedulingTest.php tests/Feature/JneReportAwbImportTest.php tests/Feature/ReportJobTest.php tests/Feature/JneReportWorkerTest.php tests/Feature/PackageProcessingTest.php tests/Feature/HandoverV2Test.php tests/Feature/ReportJobConcurrencyTest.php
npx vp test run resources/js/lib/jne-monitoring.test.tsx resources/js/lib/jne-report-awbs.test.tsx resources/js/lib/jne-report-limits.test.ts
cd workers/jne-report
npm test
```

The full unrelated application suite was not run as part of this stage; use
`php artisan test --compact` for complete project regression checks. Scheduled
live cycles and real pickup association still require an Admin to choose the
correct customer mapping and explicitly enable a profile; fixture tests do not
claim those production business decisions have already been made.

### Customer identity and report sources

The internal `customers.customer_code` is the business identity. One customer
may have many `SHIPPER_NAME` aliases and needs no JNE report number. Aliases
apply globally to imported reports from any source. A report source number is
only the parameter used to request the JNE CSV; the source's label is descriptive
and cannot assign AWB ownership. This supports both one source containing
several customers and one customer appearing in several report sources.

1. Open **Customer & pengirim**, search the customer code, and select a customer.
   Maintain the existing master using **Kelola customer** when needed.
2. Add names under that customer, or use **Impor daftar** with CSV UTF-8 headers
   `SHIPPER_NAME,KODE,NAMA_CUSTOMER` (export only columns A-C from Excel).
   Imports require no report-source selection. Maximum 5 MB / 10,000 data rows.
   Native XLSX upload is not supported. Codes remain strings including leading
   zeros and letters. Codes/names must match an existing active customer;
   unknown codes, Excel errors, mismatched names, invalid UTF-8, and malformed
   records reject the whole file without partial inserts. No customer is invented.
3. Use the **nama ganda di daftar** link to resolve an identical normalized name
   mapped to more than one customer code. Disable incorrect mappings after
   review. Importing again skips duplicates and does not reactivate disabled names.
4. Choose **Perbarui pengelompokan** to reprocess already stored CSVs through the
   existing Laravel queue without another JNE request. New CSVs resolve names
   automatically. Manual pickup decisions remain authoritative; conflicting
   changes to an established pickup/customer association are flagged.
5. In **Sumber & jadwal**, optionally save a report number and descriptive label,
   such as a combined retail source. Sources have no customer-owner selection.
   They can be saved for manual use with scheduling disabled. In **Tarik report**,
   select a saved number or enter the number directly and choose dates.

Only whitespace and case are normalized when matching aliases. Punctuation,
underscores and numeric prefixes are not guessed or fuzzy-matched. A recognized
customer does not imply a matched pickup; an exact reference belonging to that
customer and a finalized POP are still required. Original CSV/source names and
source report-number provenance remain intact. Unknown names remain unassigned.

Migration `2026_10_21_075930_separate_customer_aliases_from_jne_report_sources.php`
makes aliases independent of report profiles and adds descriptive source labels.
Legacy profile/customer fields are retained as historical metadata and are ignored
for ownership. Existing alias/customer pairs are promoted to one global mapping;
if the identical pair existed under several sources, extra rows are retained as
legacy records rather than deleted. Aliases for different customers with the same
name stay ambiguous. A nullable unique mapping key enforces global pair uniqueness.
The migration is forward-only because a report source cannot be reconstructed for
new customer-only mappings; use a forward migration for subsequent schema changes.
No customer master import, source-number correction, schedule activation, or new
live JNE request is performed by this migration.

Customer/source separation verification: 216 relevant Laravel tests passed
(1,618 assertions), including no-source customer alias creation/import, source
labels not assigning ownership, global alias conflicts, and existing report,
queue, private download, claim concurrency, Pickup and Handover regression.
The three frontend suites passed 26 tests. PHPStan, TypeScript, Pint, and the
production build passed. No new live JNE retrieval was run for this change.
The full unrelated application suite remains available via
`php artisan test --compact`.

### Applying a code/name directory workbook

The supplied `list kode.xlsx` was read without modification. Column G-H is the
canonical customer-code/name master; A-C contains shipper aliases. An ignored,
private JSON manifest retains source row numbers, original alias/customer labels,
and the original workbook SHA-256. No spreadsheet parser dependency was added
to Laravel and this does not add a generic XLSX upload endpoint.

`jne-customers:import MANIFEST --actor=EXISTING_ACTIVE_ADMIN_ID` previews the
manifest without data changes. Add `--apply` to persist the previewed directory.
The command requires an active Admin, validates the whole manifest, and performs
writes in one transaction. Existing codes with a different name or inactive
customer are skipped with their aliases and reported rather than overwritten.
Exact existing aliases are retained, including disabled mappings. A repeated
import does not duplicate customers or aliases. All imports produce private
`result.json` and formula-safe `review.csv` files under the local disk's
`jne-imports` directory.

Names in the alias list that disagree with the canonical master (including
`#N/A`) use the master name by the explicit customer code; every such difference
is included in the review file. Identical names belonging to multiple codes
remain ambiguous. Unknown codes are reported and never invent a customer.
New directory-only customers have blank address/contact fields rather than
fabricated pickup details. Their identities can resolve AWB ownership; pickup
creation and regular schedule activation require an actual contact, while the
existing pickup address validation remains required. Scheduled generation skips
a customer without a contact. The customer/name page explains missing details.

Actual local import on 21 October 2026: 187 new customers, 1,665 alias/customer
mappings from 1,895 source alias rows, 230 duplicate rows skipped, 13 canonical
name differences recorded, and 12 ambiguous normalized names retained for review.
The two existing customers were retained, bringing the total to 189. Rebuilding
stored reports #2 and #3 resolved all 428 existing unique AWBs to six customers.
This is customer ownership resolution, not pickup reconciliation. No new live
JNE request or schedule activation was performed. The workbook checksum was
verified unchanged afterward.

Directory import validation: 312 relevant Laravel tests passed (2,148 assertions),
including customer import and existing pickup/scheduling/report regression;
27 frontend tests, PHPStan, TypeScript, Pint, and the production build passed.
Run `php artisan test --compact` for the complete application suite.

The customer/name page distinguishes directory duplicates from stored AWB
ownership problems. Its current-ownership summary has an actionable next step:
continue to shipments when all stored AWBs have recognized customers, request a
report when there are none, or open filtered ambiguous/unmatched AWBs when review
is needed. Duplicate directory names alone do not mean current AWBs are blocked.
The duplicate view groups each name with all candidate customers and does not
present a blind disable action. Corrections remain under each customer's name
list and should only be made after ownership is confirmed from source records.
This page change makes no ownership decisions and does not disable any mappings.
