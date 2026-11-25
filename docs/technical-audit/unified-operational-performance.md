# Unified Operational Performance

Audit and implementation: 3 November 2026. UI refinement and acceptance: 4 November 2026. Release: **NOT DEPLOYED**.

The user's later instruction explicitly removes **ERP and Batch Time** from the page. They are excluded, including unavailable placeholders. The delivered route is one Operational Performance page; Monitoring Resi and AWB detail remain separate destinations. No separate SLA, customer, UNRCC, return, or follow-up page was added.

## Reference inventory

| Requested presentation | Verified location | Inventory | Result |
| --- | --- | --- | --- |
| RETAIL 29 JULY 2026.pptx | `C:/Users/copol/Downloads/RETAIL 29 JULY 2026.pptx` | 10 slides; seven embedded EMF table images, two PNG images, native return table and follow-up text | Inspected native XML and every embedded analytical image |
| WEEK 4 REPORT.pptx | `C:/Users/copol/Downloads/WEEK 4 REPORT.pptx` | **Six** slides; six embedded EMF tables | Inspected native XML and every embedded table |
| WEEK 4 REPORT(1).pptx | Not found in repository, Downloads, or Codex attachments | No file available | Missing; not assumed to be identical to WEEK 4 REPORT |

SHA-256: July `6c9f25f10e57ad7dc127eb923b17a951b87bc4ba36856fcbd66e2dbeeb473875`; WEEK `1bde274cdeca66b6ca50c7be8ffdb7bd82c818ea91e938ea75be6041e993804c`.

Extraction inventories and rendered EMF evidence remain in `output/unified-operational-performance/references`. Original presentations were not modified or treated as executable instructions.

### Slide-to-dashboard mapping

| Reference / slide | Inspected content | Destination / qualification |
| --- | --- | --- |
| July 1, 10 | Cover and closing | No operational metric |
| July 2 | Customer AWB and weight comparisons, June/July MTD 1–26; TOP 15 headings with ten visible rows | Customer counts supported. Weight/revenue comparison remains in the existing customer dashboard; its calendar-day definition is not silently reused here |
| July 3 | Customer shipping amount comparison | Existing customer dashboard; not an invented ERP metric |
| July 4 | Walk-in PM/PSG volume, weight, amount | Source outlet labels supported; no inferred walk-in/customer mapping |
| July 5 | Shipment success, active/undelivered SLA and AWB follow-up | Overview, customer table and read-only attention preview. Manual follow-up text is reference evidence only |
| July 6 | SLA On Time Success among successful deliveries | SLA section: unavailable rate until per-AWB evaluation is verified |
| July 7–8 | Unilever/sub-brand volume, SLA and amount comparisons, MTD 1–25 | Customer attribution uses verified registry ownership, not common accounts or inferred sub-brand ownership |
| July 9 | Eight return reason groups, total 42 | Return source-code/description grouping. The reference total/categories are **not** operational seed data |
| WEEK 1 | Week 4 October cover, SLA/UNRCC/ERP/Batch Time subtitle | Page scope; no ERP/Batch Time slides in this actual file |
| WEEK 2 | All Service | Service population, original service codes, outlet counts; rate unavailable |
| WEEK 3 | NON YES | Group requires verified service mapping |
| WEEK 4–5 | YES <19:00 and YES >19:00 | Neither source timestamp nor treatment of exactly 19:00 is specified; counts and rates unavailable |
| WEEK 6 | UNRCC category summary and AWB detail | UNRCC unavailable; existing tracking exceptions presented separately |

Reference inconsistencies matter:

- WEEK cover says Week 4 October, slide headings say **1–6 October 2026**, embedded tables show **19–25 October**. The embedded period was read independently of the headings.
- WEEK All Service Kedaung shows ON SLA 4,716, OVER SLA 68 and TOTAL 99.12%. `4,716 / 4,784` is approximately 98.58%, not 99.12%. The displayed total is consistent with an arithmetic average of the displayed daily percentages. That is an inference, not a verified workbook formula. The dashboard does not adopt it.
- WEEK UNRCC summary shows CLOSED 24; its detail image contains two rows dated 22 October while the summary shows one for that day. No reconciliation is invented.
- July captions mix MTD 1–26 and MTD 1–25. Slide 5 success total 13,329 differs from the slide 2 July customer load 13,331 and slide 7 sub-brand total 13,473. These are not silently treated as identical populations.

## Repository and data audit

Installed backend: PHP 8.5.10, Laravel 13.35.0, Inertia Laravel 3.5.1, Wayfinder 0.1.21, Pest 5.3.1. Frontend declares React 19, Inertia React 3, Tailwind 4 and Radix-based shadcn components. Operational MySQL version was inspected read-only: 8.4.11. Isolated performance server: MySQL 8.0.30.

Relevant existing implementation:

- `QueryShipmentMonitoring`, `ShipmentMonitoringController`, `ShipmentMonitoringRequest` and V1.1/V1.2 audit documents provide registry filtering, attention categories, source dates, conservative tracking lifecycle and existing drill-downs.
- `jne_shipments` is the unique-AWB read model. `latest_report_awb_id` selects one source row; observations are not joined into the analytics population. Historical, duplicate and late observations therefore cannot multiply counts.
- `ProjectJneShipments::classify` distinguishes DELIVERED, CANCELLED, RETURNED, IN_TRANSIT, EXCEPTION and UNKNOWN. General FAILED text is not treated as a return.
- `ResolveJneCustomers`, `ResolveJneCustomerCodes`, `MatchJneShipments`, verified aliases and manual review preserve customer evidence. A shared JNE account does not prove ownership. Only `customer_match_status=MATCHED` with a customer ID is attributed by this dashboard.
- Hybrid/APEX import retains raw fields and provenance. `ImportReportAwbs` extracts `entry_at` from TGL_ENTRY, separate from source observation/report receipt timestamps. `ExtractJneAwbMetrics` provides service, ETD and delivered timestamps, but no approved SLA calculation.
- Existing customer analytics use calendar-day cohorts and a different terminal baseline. Their formulas are not reused for the operational-day dashboard. This page follows Monitoring Resi's conservative terminal set.
- Read-only source inspection found original outlet labels in `ZONE_USER_ENTRI`, including CGK537 Jakarta Agen Puri Mansion and CGK945 Jakarta Puman Grup Kembangan. No outlet master, source contract or Kedaung mapping was found. Labels are preserved rather than translated into inferred outlet IDs.
- Raw SLA values include negative integers, zero and positive integers. **No active verified `jne_source_contracts` rows** were present. There is no verified interpretation of SLA sign, ETD deadline, YES cutoff timestamp, cutoff equality, holidays, or historical effective dates.
- `IREG_CODE` and `RECEIVED/REASON` are retained as raw source code/description, alongside STATUS_WEB and STATUS_POD. They are not mapped to UNRCC or a fabricated return taxonomy. Missing reasons stay missing.
- Pickup processing records have record/revision timestamps; pending-item `processed_at` is a manual review action timestamp. Report imports, audit timestamps, email acceptance and these manual timestamps do not establish the report's package batch semantics. ERP/Batch Time were subsequently removed by the user.
- There is no existing persisted manual AWB follow-up state, note, owner, or actor/time history. Pickup follow-up tasks and shipment/customer matching notes are different records and are not reused as shipment follow-up notes.

## Source-to-metric feasibility matrix

| Metric | Classification | Verified source / formula | Implementation |
| --- | --- | --- | --- |
| Total AWB | READY | Count unique registry rows in selected entry cohort | KPI, daily, service, outlet and customer aggregates |
| Delivered | READY | Current projected tracking status DELIVERED | Counts and exact drill-down |
| Active / non-terminal | READY | Status not in Monitoring Resi terminal set: DELIVERED, CANCELLED | Includes RETURNED conservatively, explicitly explained; overlaps return count |
| Return count | READY | Current projected status RETURNED | Count, customer/outlet comparison and AWB drill-down |
| Return reason analysis | PARTIAL | Raw IREG_CODE, RECEIVED/REASON, STATUS_WEB, STATUS_POD on RETURNED population | Source-preserving grouped counts; blank reasons not inferred |
| Tracking exceptions | READY | Current projected status EXCEPTION | Count, grouped source descriptions and exact drill-down |
| UNRCC | BLOCKED | No verified category source or mapping | Explicit unavailable state; never equated with EXCEPTION or cancellation |
| Customer performance | PARTIAL | MATCHED customer ID; unresolved ownership grouped separately | Counts, returns, attention and pagination; SLA unavailable |
| Outlet performance | PARTIAL | Exact source ZONE_USER_ENTRI label | Filters and counts; no master reconciliation, invented outlet, or SLA rate |
| All Service | READY for volume | All rows of filtered current cohort | Verified total only |
| NON YES / YES groups | BLOCKED | Codes such as REG23, CTC23, YES23, CTCYES23, YES* exist, but no approved group map | Original service counts shown; unknown codes never assigned to NON YES |
| ON SLA / OVER SLA | BLOCKED | No per-AWB verified evaluation or deadline | Null payload and dash in UI |
| SLA On Time Success | BLOCKED | July rate structure exists, but live SLA evaluations absent | Null payload and dash, including empty populations |
| Daily SLA trend | BLOCKED | No verified daily SLA numerator/denominator | Clearly labelled daily AWB volume/current-delivered chart instead |
| AWBs needing review | READY | Existing Monitoring Resi attention predicate, counted once | Operational KPI and bounded preview |
| Manual follow-up | BLOCKED for persistence / PARTIAL read-only | No note/state/owner/audit model or approved transition rights | Read-only candidate worklist and existing AWB details |
| ERP | BLOCKED in original audit; OUT OF SCOPE after user correction | No verified source or definition | Omitted entirely |
| Batch Time | BLOCKED in original audit; OUT OF SCOPE after user correction | No verified report time-window/package timestamp semantics | Omitted entirely |

## Formulas and population contract

The current cohort is `jne_shipments` joined to its single latest source, with `entry_at >= start(date_from)` and `< start(date_thru + 1 day)`. `start` reuses `PickupResultPeriod`: 05:00 Asia/Jakarta, stored/compared in UTC. Daily SQL grouping adds two hours to UTC before taking the date, equivalent to Jakarta minus the five-hour operational cutoff.

Presets are Daily = current operational day, Weekly = seven operational days ending today, Monthly = operational month to date, Custom = inclusive selected operational dates, maximum 92 days. Before 05:00 Jakarta, today is the preceding operational date. A customer filter also requires MATCHED attribution. An outlet filter matches the trimmed exact source label. Unknown outlets remain in the unfiltered population.

`attention` is the existing Monitoring Resi union: UNKNOWN or EXCEPTION, customer ID missing, or non-terminal with no last observation. There is no assumed stale threshold or SLA. Delivered/unlinked AWBs can require attribution review. This is not a count of saved manual follow-up records.

Unresolved attribution includes a null customer ID or non-MATCHED customer status. The selected-customer population excludes ambiguous/conflicting ownership even if a stored candidate ID remains present. It does not rerun matching or alter decisions.

Undated AWBs cannot be assigned to a period. Their separately labelled count uses the same customer/outlet scope across undated registry rows, outside the selected entry-date cohort. No report import timestamp is substituted. The last-observation marker is the maximum registry observation timestamp within the current cohort, not a promise that every AWB or source job is current.

No unverified business percentage is calculated. The July source's On Time Success is consistent with `12,786 on-time successful / 13,127 successful = 97.40%`; its shipment-success percentage uses `13,127 successful / 13,329 total = 98.48%`. These are distinct reference denominators and **are not live dashboard formulas**. A verified live SLA contract must additionally define eligible rows and missing evaluations before either rate can be enabled. Empty/unavailable denominators return null, not 0%.

The reason bars are graphical proportions of each exact source group count to all selected AWBs with that same projected status. The daily chart normalizes visual height to the maximum daily total; its accessible labels expose actual AWB counts. Neither is labelled as an SLA percentage.

## HTTP contracts and authorization

`GET /admin/operational-performance`, named `operational-performance`, returns Inertia component `operational-performance`. Authentication plus the existing active `admin_supervisor` role is required; guests redirect to login, inactive and other existing roles receive 403. No permission was invented for other roles.

Validated query: `period=daily|weekly|monthly|custom`, `date_from`, `date_thru` in Y-m-d, existing `customer_id`, exact `outlet` label (maximum 255 characters), `customer_page` positive bounded integer. Invalid input returns the normal Laravel/Inertia validation response, or JSON 422 when requested. Custom dates are applied together; other filters apply immediately. The browser focuses the invalid date after loading finishes.

Page props: `performance`, `filters`, `selectedCustomer`, `timezone`. Performance contains `summary`, `customers` (data/current_page/last_page/total), daily counts, services/outlets, outlet options, grouped exception/return rows, attention preview, truncation indicators and concise limitation messages. Unavailable SLA/UNRCC fields and manual follow-up fields are null.

Existing Monitoring Resi GET routes accept additive, optional drill-down filters: `attribution=matched|unresolved`, `outlet`, `source_service`, `source_code`, `source_reason`, `source_web`, `source_pod`. They preserve the period/customer population and exact source grouping. An explicitly empty source field matches missing data; an absent field does not filter. Code `0` remains a valid code. These fields survive client normalization, pagination, status changes and detail return links and appear as removable filter chips. Query values are bound, original source text is escaped by React, and Wayfinder generates route URLs.

Refresh is a read-only page visit. There are no analytics POST/PUT endpoints, source pulls, tracking projections, reconciliation jobs, note writes or automatic follow-up closures.

## Query design and performance

One CTE projects only the bounded current entry cohort, original outlet/reason fields and verified customer attribution. SQL UNION ALL branches produce the summary, grouped customer/service/outlet/day counts, reason distributions, ten attention rows and outlet options. MySQL `NO_MERGE` hints materialize the common population once across branches. PHP receives bounded aggregate/preview rows rather than historical source models. The separate undated count is server-side. No schema, index, dependency, worker, queue, Redis or Kafka change was added.

Limits: 92 days; 15 customer groups per page; 20 displayed service/outlet groups, each fetched with one overflow row; 15 reason groups plus overflow; 10 attention AWBs; 100 outlet options plus overflow. Truncated previews are disclosed and never change the executive totals.

Relevant existing indexes include unique registry AWB, `jne_dashboard_shipment_metrics`, customer ID, source entry date, and `jne_dashboard_source_metrics`. Native EXPLAIN JSON is retained with measurements. The MySQL hint strategy was checked against the [official derived-table/CTE materialization documentation](https://dev.mysql.com/doc/refman/8.0/en/derived-table-optimization.html).

Native fixtures use their own MySQL process on **127.0.0.1:54185**, a guarded temporary `dust-performance-mysql-*` data directory, and `performance_unified_20261103`. They contain 30,000 unique AWBs, 60,000 source rows, 60,000 observations, 12 customers, four outlets and 128 extra synthetic source fields per raw payload. They do not copy operational records. The first small-payload measurement understated JSON cost. Wider payloads exposed repeated parsing at roughly 10–15 seconds and motivated the shared CTE. Final exact measurements are in the evidence JSON; multi-second latency on this wide fixture remains a release-performance concern. These are sequential single-request measurements, not a 20-user load test, and SQLite timing is not used to claim production MySQL capacity.

| Final wide-payload measurement | HTTP | SQL | Queries |
| --- | ---: | ---: | ---: |
| Customer + outlet, 2,500 matching AWBs | 5,817.02 ms | 5,728.21 ms | 4, including customer validation/selection |
| All 30,000 AWBs | 5,597.42 ms | 5,585.17 ms | 2 |

The undated counter accounts for approximately 1.68–2.21 seconds in this run; the shared aggregate takes approximately 3.37–4.04 seconds. Investigate these costs and production hardware/cold-cache behavior before a performance release claim. [Measured plans and timings](evidence/unified-operational-performance/query-performance.json).

## UI acceptance and screenshots

Experienced supervisors need the filtered AWB population, current delivery/exception counts and quick investigation. The page places title and Monitoring Resi action first, compact global filters next, section anchors, six verified KPI cards, three compact unavailable SLA indicators, service/outlet/daily analysis, customer performance, separate exception/return analysis and a bounded follow-up preview.

Customer, outlet and follow-up rows use compact mobile summaries. Weekly and up-to-31-day charts fit the available width; longer custom charts scroll locally with a visible hint, preserving every daily drill-down without page overflow. Major sections remain visible, not nested behind tabs/disclosure controls. Existing shadcn Button, Card, Badge, Alert, Table, Select, Skeleton, Dialog and CustomerPicker components are reused. Keyboard filtering, validation focus, loading, empty, unavailable, recoverable network/server errors and retained prior results are covered.

Acceptance after UI refinement: **23 PASS / 0 FAIL / 0 SKIP**, zero page exceptions. All requested sizes were independently checked: 1440×900, 1366×768 and 390×844. Screenshots use isolated synthetic fixtures, not live metrics:

- [1440 desktop](evidence/unified-operational-performance/performance-1440.png)
- [1366 desktop](evidence/unified-operational-performance/performance-1366.png)
- [390 mobile](evidence/unified-operational-performance/performance-390.png)
- [Desktop first viewport](evidence/unified-operational-performance/performance-viewport-1440.png)
- [Mobile first viewport](evidence/unified-operational-performance/performance-viewport-390.png)
- [Dark appearance](evidence/unified-operational-performance/performance-dark-1440.png)
- [Empty population](evidence/unified-operational-performance/performance-empty.png)
- [Recoverable 503](evidence/unified-operational-performance/performance-error.png)
- [Acceptance checks](evidence/unified-operational-performance/browser-acceptance.json)

### UI refinement — 4 November 2026

Following the user's UI feedback, the page now uses a compact filter toolbar (one row on wide desktops, two columns on mobile), six linked KPI cards with one primary emphasis, a fixed-height daily chart with readable axes, concise service/reason bars, compact customer/outlet comparisons and a read-only follow-up table. SLA limitations and report-group definitions remain available through a contextual dialog; empty SLA columns no longer dominate customer/outlet tables. Follow-up note/state/owner/date fields are available in a read-only dialog, separately from carrier status. No business formula, permission, backend query or persisted data was changed by this refinement. ERP and Batch Time remain omitted.

Acceptance additionally exercises SLA dialog sizing, Escape and focus restoration at all three sizes; 31- and 92-day custom charts on mobile; date-scoped chart drill-down retaining outlet; read-only follow-up dialogs on desktop/mobile; and dark KPI label/value contrast of at least 4.5:1. Desktop, mobile and dark screenshots were visually inspected. Transition animations are disabled when capturing dark appearance so evidence shows settled colors.

Fresh frontend verification: **193 PASS / 0 FAIL / 0 SKIP** across 26 files (9.43 s), **23 PASS / 0 FAIL / 0 SKIP** browser checks, both TypeScript configurations, scoped lint, production build and `git diff --check` PASS. Backend suites and native MySQL measurements were not rerun for this frontend-only refinement; their earlier results and release blockers below remain unchanged. Final logs are `output/unified-operational-performance/{frontend,browser,types,lint,build}-redesign.log`.

## Changed files and verification

New implementation:

- `app/Actions/Reports/QueryOperationalPerformance.php`
- `app/Http/Controllers/OperationalPerformanceController.php`
- `app/Http/Requests/OperationalPerformanceRequest.php`
- `resources/js/pages/operational-performance.tsx`
- `resources/js/components/operational-performance-content.tsx`
- `resources/js/lib/operational-performance.ts`
- `resources/js/types/operational-performance.ts`
- `tests/Feature/OperationalPerformanceTest.php`
- `resources/js/lib/operational-performance.test.tsx`
- `tests/Browser/operational-performance.mjs`
- `tests/Fixtures/operational-performance.php`
- This audit and its evidence directory.

Integration additions preserve the previously uncommitted Monitoring work: `routes/web.php`, `resources/js/lib/jne-navigation.ts`, `app/Actions/Reports/QueryShipmentMonitoring.php`, `app/Http/Requests/ShipmentMonitoringRequest.php`, `resources/js/lib/shipment-monitoring.ts`. Generated Wayfinder output is regenerated using the existing generator and Vite plugin. No other pre-existing dirty work was reset, stashed, committed or reformatted.

Guidance used: Laravel best practices, Inertia React, Wayfinder, Tailwind, testing best practices, UI/UX Pro Max, shadcn, Web Interface Guidelines, presentation inspection, browser automation and Postman API Engineer. The internal Inertia contract is tested at the authenticated request boundary; no external Postman workspace, mock or collection was published. Existing package dependencies remain unchanged.

Verification commands use the existing dependencies. On this host the default PHP CLI lacks enabled SQLite extensions, so SQLite runs explicitly enable `pdo_sqlite` and `sqlite3`; this changes only the command, not the operational PHP configuration. Full-suite diagnostics disable compact PAO rendering to retain individual failure messages.

| Requested coverage | Actual coverage / limitation |
| --- | --- |
| Period, outlet, customer | Operational 05:00 boundaries, preset dates before cutoff, custom bounds, intersected global filters, unresolved ownership |
| SLA correctness, YES boundary, zero denominator | Null/unavailable contract tested with numeric source SLA, ETD/delivery data, 18:59:59 / 19:00:00 / 19:00:01 Jakarta and empty populations. Live SLA formulas remain blocked |
| Unknown services and missing timestamps | Raw unknown/missing service counts, missing entry exclusion, no import fallback |
| Duplicate observations | One latest projected AWB despite duplicate/late source evidence |
| UNRCC categorization | Unavailable UNRCC stays distinct from tracking exceptions; no unsupported category results invented |
| Return grouping | Exact codes/descriptions, missing reason, code 0, FAILED excluded, source-group drill-down |
| ERP and Batch Time | Excluded following the user's explicit scope correction |
| Follow-up state/audit | No persistence implemented. Read-only fields stay null and no automatic tracking-based closure is inferred |
| Drill-down and authorization | Exact global/source filters, client retention/removal, existing active-admin permissions, guest/inactive rejection |
| Responsive and states | Three target viewports, mobile summaries, loading, empty, unavailable, invalid-date focus, recoverable 503 and keyboard focus return |
| Non-mutation and scale | POP/handover/current-state/history snapshots unchanged, no queued jobs/outbound HTTP, bounded previews, paginated facets and native MySQL measurement |

Raw logs are under `output/unified-operational-performance`; the final evidence summary below distinguishes scoped success from full-suite failures.

### Final verification results

| Check | PASS | FAIL | SKIP | Result |
| --- | ---: | ---: | ---: | --- |
| Final dashboard + existing Monitoring Resi feature tests, isolated SQLite | 69 | 0 | 1 | PASS; 927 assertions, 12.147 s. Native-only performance case skipped here |
| Final dashboard functional tests, isolated native MySQL | 26 | 0 | 0 | PASS; 297 assertions, 13.447 s; performance case explicitly excluded from this functional run |
| Final wide-payload native MySQL measurement | 1 | 0 | 0 | PASS; 37 assertions, 98.766 s including fixture construction |
| Full backend suite | 1,202 | 16 | 32 | **FAIL**; 10,659 assertions, 713.17 s; 3 assertion failures and 13 errors |
| Frontend source suite | 193 | 0 | 0 | PASS; 26 test files |
| Dashboard browser acceptance after UI refinement | 23 | 0 | 0 | PASS; zero page exceptions |

The full run was collected before the final extra facet-pagination case was added; that case passes in both final functional runs. No failed full-suite test was deleted, skipped by a new condition, or weakened. Its failures remain release blockers:

- Admin push worker and twelve mobile-assignment push cases error because the host OpenSSL test-key setup cannot export a valid key (`openssl_pkey_export(): Cannot get key from parameter 1`). These authentication/push files were not changed.
- Hybrid/APEX pending-conversion test expects a session `errors` key that the response does not contain.
- Pickup customer email flow fails an exact string assertion.
- Existing Sertim browser test times out looking for a native `summary` control labelled `Koleksi & tracking`; this task does not change that existing control or test.

The first full-suite attempt was interrupted for diagnostics after compact output provided no progress. The completed diagnostic run above is the reported full-suite result. No assertion result is inferred from the interrupted run. The first plain `php artisan test` attempt also lacked SQLite drivers; final commands enabled them explicitly.

TypeScript main/mobile checks, both scoped lint runs, production build, scoped `pint --dirty --format agent`, and `git diff --check` pass. The build reports the existing optional fontaine optimization notice; no dependency was installed. Scoped formatting preserved other uncommitted work. [Structured test results and failure details](evidence/unified-operational-performance/test-results.json).

### Final status

- REFERENCE AUDIT: **PARTIAL** (two actual files inspected; WEEK 4 REPORT(1) missing).
- SLA: **PARTIAL** (verified population/service/outlet/daily counts; live SLA calculations blocked).
- CUSTOMER PERFORMANCE: **PARTIAL** (verified attribution/counts/returns/attention; SLA unavailable).
- UNRCC: **BLOCKED** (tracking exceptions are supported separately).
- RETURN ANALYSIS: **PARTIAL** (verified return status and raw descriptions; canonical reason completeness unverified).
- ERP and BATCH TIME: **OMITTED at the user's explicit request**.
- AWB FOLLOW-UP: **PARTIAL**, read-only; persistence blocked by missing rights/state/audit decisions.
- UI ACCEPTANCE: **PASS**.
- BACKEND TESTS: **FAIL overall**; final scoped SQLite/MySQL tests pass.
- FRONTEND TESTS: **PASS**.
- RELEASE: **NOT DEPLOYED**.

## Remaining UAT and release blockers

1. Obtain the missing WEEK 4 REPORT(1) source and reconcile presentation date/total discrepancies with the report owner.
2. Approve SLA source semantics, service-code grouping, exact cutoff timestamp/timezone/equality, deadline/holiday policy, eligible numerator/denominator and incomplete-evaluation treatment before enabling SLA rates or trends.
3. Supply a verified UNRCC category source and lifecycle; carrier exceptions/cancellations cannot substitute for UNRCC cases.
4. Verify outlet/source coverage beyond the observed two source labels, customer ownership coverage and the meaning/completeness of return code/description fields. No Kedaung or shared-account ownership is inferred.
5. Before manual follow-up persistence, approve access rights, states/transitions, assignment, note ownership and immutable actor/timestamp history. Tracking changes must not close manual cases.
6. Resolve full-suite failures, review native MySQL latency on operationally representative hardware/volumes and perform owner UAT. Concurrent 20-user readiness has not been established.
7. No operational migrations, record mutations, worker restarts, production queue changes, commits, pushes or deployment were performed by this implementation. Read-only operational inspection was limited to schema, versions and aggregate/source-column availability. Test fixtures and pre-existing concurrency tests use isolated databases.
