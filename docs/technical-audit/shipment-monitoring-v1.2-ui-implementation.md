# Shipment Monitoring V1.2 — operations-first UI implementation

Date: 2 November 2026. Repository: `S:/2026/dust`.

## Result and acceptance

| Area | Status |
| --- | --- |
| OVERVIEW | **COMPLETE**, supported metrics; customer linkage summary replaces the unsupported historical trend |
| ALL SHIPMENTS | **COMPLETE** |
| SHIPMENT DETAIL | **COMPLETE**, read-only snapshot/evidence experience |
| ATTENTION QUEUE | **COMPLETE**, evidence-backed review categories only |
| RESPONSIVE UI | **PASS**, desktop, laptop, tablet and mobile acceptance |
| BACKEND REGRESSION | **PASS**, focused monitoring plus pickup/handover/reconciliation suites |
| FRONTEND REGRESSION | **PASS**, TypeScript, unit tests, scoped lint, build and browser acceptance |
| RELEASE STATUS | **NOT DEPLOYED** |

Completion refers to the implemented, verified subset below. It does not establish production readiness, a complete carrier-event feed, verified failed-final classification, or a historical daily trend.

## Existing implementation audit

Reviewed `docs/technical-audit/shipment-monitoring-v1.1-feasibility.md`, the working tree and overlapping diffs before edits. The repository already had:

- `app/Actions/Reports/QueryShipmentMonitoring.php`: literal AWB-prefix search, customer/status/lifecycle/date/freshness filters and row projection.
- `app/Http/Controllers/ShipmentMonitoringController.php`: authenticated Inertia list/detail, bounded pagination, summaries, source evidence and observation history.
- `app/Http/Requests/ShipmentMonitoringRequest.php`: active admin/supervisor authorization and validated filters.
- `resources/js/pages/shipment-monitoring.tsx`, `shipment-monitoring-detail.tsx`, `types/shipment-monitoring.ts`, `lib/shipment-monitoring.ts`, `lib/jne-navigation.ts` and shared sidebar/breadcrumb resolution.
- `JneShipment`, `JneShipmentObservation`, `JneReportAwb`, existing status projection/import logic and customer/pickup relationships. Current snapshot and historical evidence are distinct.
- Existing shadcn/Radix Button, Input, Select, Dialog, Sheet, Table, Badge, Collapsible and feedback primitives; shared CustomerPicker, date fields, header, pagination and SVG operational charts.

V1.1 was functional and integrated. Its remaining UX problem was presenting one technical list as both overview and explorer, repeating missing customer/pickup text on rows, exposing too much filter/timestamp detail above the task, and lacking a separate attention workspace.

Installed versions were checked through Composer/Boost and package metadata: PHP 8.5, Laravel 13.35.0, inertia-laravel 3.5.1, Wayfinder 0.1.21, Pest 5.3.1, Inertia React 3.9.1, React 19, Tailwind 4 and the existing Lucide/Radix stack. `.ai/rules` is absent. No dependency was added.

## Reference interpretation

The supplied image `codex-clipboard-f2e56ab8-2284-44af-9773-96ee0e98a3da.png` was accessible and inspected. Its four connected views guided the header/KPI layout, balanced summary panels, compact shipment explorer, two-column detail, status badges, blue accents, neutral surfaces and attention navigation. The application shell and existing theme preference were retained. Light-theme acceptance screenshots are supplied; dark mode remains supported.

Deliberate adaptations:

1. The mockup's daily status trend and period-over-period increases are not displayed because V1.1 does not establish a complete daily historical cohort. A real customer-linkage summary occupies that panel.
2. The active KPI/tab is labelled “Masih Dipantau”: not yet DELIVERED/CANCELLED. RETURNED, EXCEPTION and UNKNOWN remain in that monitoring group. The initial “Non-terminal” wording was replaced after usability feedback; the underlying classification is unchanged.
3. The failed-final/failed-attempt/no-movement/SLA categories from the picture are omitted. The cancelled KPI means CANCELLED only.
4. No selection checkboxes or bulk menu are added without an existing bulk workflow. Every row has a working detail link.
5. Mobile uses deliberate shipment cards and wrapped controls, rather than a compressed desktop grid. Header titles retain enough width, with actions wrapping below.
6. Search is also available on Overview for a direct AWB lookup. This prioritizes the operational task over literal reproduction of the image.

This is an implementation following the approved design and supported data, not a pixel-perfect reproduction claim.

## Implemented structure and navigation

| View | Route name / path | Main source |
| --- | --- | --- |
| Overview | `shipment-monitoring.overview` — `/admin/shipment-monitoring/overview` | `resources/js/pages/shipment-monitoring-overview.tsx` |
| All Shipments | Existing `shipment-monitoring.index` — `/admin/shipment-monitoring` | `resources/js/pages/shipment-monitoring.tsx` |
| Attention Queue | `shipment-monitoring.attention` — `/admin/shipment-monitoring/attention` | `resources/js/pages/shipment-monitoring-attention.tsx` |
| Detail | Existing `shipment-monitoring.show` — `/admin/shipment-monitoring/{shipment}` | `resources/js/pages/shipment-monitoring-detail.tsx` |

The existing sidebar “Monitoring resi” entry opens Overview. Module navigation links Overview, All Shipments and Attention; breadcrumbs preserve their common parent. Existing list URLs continue to work. Links use generated Wayfinder functions. Detail links carry the list's validated filters and origin page; Back restores the shipment or attention list, including its selected category/page. An allow-listed origin is used rather than accepting an arbitrary return URL.

Authorization remains active `admin_supervisor` only, including the two new views. CS/retail/pickup access was not broadened merely because those roles are part of the eventual operational audience.

### Overview

- Header, period selector, database reload and latest observation indicator.
- Direct AWB search; five linked KPIs using the same date cohort.
- Reused accessible SVG donut: six mutually exclusive normalized statuses, counts and percentages. Its denominator is the total current shipments in the selected cohort. Empty data does not produce fabricated percentages.
- Linked/unlinked customer counts and percentages based on the existing customer relationship.
- Unique attention count, category links and a maximum five-row preview.
- Explanation of snapshot/trend limitations behind secondary disclosure.

“Muat ulang” reloads stored application data. Its accessible name says “Muat ulang data tersimpan”; it does not trigger JNE collection or change schedules. “Pengamatan terbaru” is the maximum current snapshot observation time for the displayed scope, not the browser reload time or a guarantee every source succeeded.

### Explorer and Attention

Search is immediately available, with customer selection on larger screens and a Filter Sheet for secondary criteria. All Shipments has counted status tabs. Applied filters are removable; Reset returns to the unfiltered list/default attention category. Date drafts, validation errors, explicit freshness thresholds, pending controls and recoverable network/server errors are preserved.

Desktop columns are AWB, **Tanggal Entry AWB**, customer, normalized status, source-status update, observation reference and detail action. Attention adds grouped reasons. Mobile cards show the entry date before update/observation clocks. A missing customer is one neutral “Belum Terhubung” badge; pickup relationship details remain on detail. Raw status and receipt metadata are not repeated on every list row.

The entry date comes from the existing latest source's `entry_at`, now included in the bounded row projection and eager-load selection. It is displayed in Asia/Jakarta time. Missing source dates stay null/“Tidak tersedia”; local creation/import/receipt times are not substituted. Detail uses the same “Tanggal Entry AWB” label.

Follow-up verification for this date/wording correction: two source-date backend cases (54 assertions) and 13 relevant frontend tests pass, including date timezone/missing-value display. TypeScript, scoped lint, production build and the 23-checkpoint browser acceptance also pass; refreshed screenshots include the desktop entry column and mobile entry date.

Mobile cards prioritize AWB/status/customer, the two relevant clock labels, attention reasons when applicable, and a 44px detail action. The server returns 20 or 50 rows, never the entire shipment dataset.

The stale attention tab shows “Atur batas” until configured. Selecting it opens the Sheet to enter an explicit threshold; applying without hours returns validation and focuses the field. No default SLA or stale period is assumed.

### Detail

AWB identity, current normalized status, linkage badge and Back navigation lead the page. Information and current-status cards show only available source/customer/pickup data. Service, entry time and source destination are read from existing source fields; missing values remain unavailable. No receiver/COD/weight values are fabricated.

Three content sections provide snapshot history, source evidence and technical interpretation. History defaults to observations which changed current state during processing, with a switch to all retained evidence and pagination of 25. Ordering remains observation time descending, then ID. Older/out-of-order evidence is retained without being used by the frontend to replace current projected status. The page explicitly says this is not a complete courier timeline.

The source section exposes report/source row/checksum, raw source data, source evidence, original observation/status timestamps and provenance. Current source-event, observation and local receipt times remain separate. Detail has no mutation form or action.

## Component reuse and styling

New module components are `shipment-monitoring-ui.tsx` (navigation/header/KPIs/linkage), `shipment-monitoring-table.tsx` (desktop table and mobile cards) and `shipment-monitoring-explorer.tsx` (shared list/attention controls). They compose existing primitives rather than introducing a design framework.

Reused components include DataTablePagination, CustomerPicker, DateRangeFields, FilterSelect, PageHeader, SecondaryDisclosure, ShipmentStatus and OperationalDonut/OperationalPanel. The shared header's title now has a useful flex basis and bounded actions so mobile titles cannot collapse into a few characters per line. Only monitoring currently consumes it.

`resources/css/app.css` adds one scoped `shipment-monitoring-surface` utility. It uses darker neutral secondary text on the pale monitoring surface, with a dark-theme variant. The original muted token measured about 4.49:1 against that surface, slightly below 4.5:1. Global application colors and shell structure are unchanged.

## Backend changes and read contracts

No new REST API, external API, schema, model, policy, job, queue, worker, projection or customer-attribution rule was introduced. The existing controller/request/query action gained the smallest read-only additions required by the UI. Inertia remains the transport; no unrelated Postman workspace or infrastructure setup was needed.

### Request parameters

| Parameter | Semantics |
| --- | --- |
| `q` | Existing literal AWB prefix, trimmed/case-normalized by the query; max 100 characters; SQL wildcard characters escaped; not a newly invented customer-name search |
| `customer_id` | Existing customer ID relationship; no shared-account ownership inference |
| `customer_link` | New `linked` / `unlinked`, using non-null / null `customer_id` |
| `status` | Existing normalized allow-list: DELIVERED, CANCELLED, RETURNED, IN_TRANSIT, EXCEPTION, UNKNOWN |
| `lifecycle` | Existing `active` / `terminal` tracking classification |
| `date_from`, `date_thru` | Entry-AWB operational-day range, inclusive selected dates using 05:00 Asia/Jakarta boundaries |
| `freshness` | Existing `stale` / `unobserved` |
| `freshness_hours` | Explicit integer 1–8760; required for `freshness=stale` or `attention=stale` |
| `attention` | New `all`, `unknown`, `exception`, `unlinked`, `unobserved`, `stale` |
| `per_page`, `page` | Existing 20/50 list sizes and positive page |
| `history` | Existing `changes` / `all`, detail only |
| `back`, `return_page` | New safe return context: `shipments` / `attention` and positive origin page |

Overview deliberately consumes only period and optional freshness hours. List and Attention consume the shared filtering contract. Detail retains its history contract and adds safe origin context.

### Responses

- List/Attention preserve `shipments`, `summary`, `filters`, `selectedCustomer`, `timezone`; row fields from V1.1 remain available. `facets` is additive.
- `summary` describes the fully filtered result. `distribution`, `observed_at`, `unlinked`, `source_missing`, `exception` and unique `attention` are additive scalar/aggregate fields; `failed_final` stays null.
- On All Shipments, `facets` excludes only the selected status/lifecycle/attention scope so status tabs share a stable denominator while retaining AWB/customer/linkage/date/freshness criteria.
- On Attention, `facets` excludes only `attention`, retaining the selected tracking status and lifecycle as well as the other filters. Category counts therefore describe what clicking those tabs can actually return.
- Overview returns one summary and a maximum five projected preview rows.
- Detail retains source/history and adds `context` and a server-generated `returnTo`. Existing source service/destination/entry/raw clocks are exposed additively.

Summary aggregation is one conditional scalar aggregate over current `jne_shipments`. The same base query applies filters; rows are selected/paginated with eager-loaded customer/source/pickup relationships. Existing latest-receipt subqueries are bounded to selected rows. No all-history reconstruction is performed for dashboard statistics.

## Metric support and attention rules

| Metric / category | Definition / boundary |
| --- | --- |
| Total | One current shipment per unique stored AWB in the selected cohort |
| Masih Dipantau | Current tracking status not DELIVERED/CANCELLED; includes RETURNED, EXCEPTION and UNKNOWN |
| Delivered / cancelled / unknown | Exact verified normalized status, without raw FAILED coalescing |
| Distribution | Current-state counts, not daily observations, daily transitions or a historical delivery rate |
| Customer linkage | Existing customer relationship present/absent; absence is data quality, not a delivery failure |
| Delivery attention | Normalized EXCEPTION, labelled “Kendala dilaporkan sumber”; no inferred attempt count or failed-final meaning |
| Unknown attention | UNKNOWN; data-quality review |
| Unlinked attention | Null customer relationship; data-quality review, including terminal shipments when applicable |
| Unobserved attention | Non-terminal with no observation timestamp; source-evidence review |
| Stale attention | Non-terminal, observation strictly older than `now - chosen hours`; null observation handled separately |
| All attention | Union of supported predicates, counted once per shipment; category counts may overlap and must not be summed |

The existing list `freshness=unobserved` filter retains its original semantics. The dedicated queue's missing-source category is explicitly non-terminal. Terminal rows are never marked stale. No delay/SLA decision, no-status-change threshold, failed-final count, complete event timeline, assignment, acknowledgment, closure or WhatsApp workflow is introduced.

## Screenshots and browser evidence

Evidence directory: [shipment-monitoring-v1.2-20261102](S:/2026/dust/output/shipment-monitoring-v1.2-20261102).

The V1.2 fixture extends the existing safe browser-fixture generator with 28 snapshot observations, retained unchanged/late evidence, explicit stale/unobserved rows, and verified display fields. It creates a new SQLite file under `output` and refuses to overwrite existing fixtures. The first attempt hit the source report/AWB unique constraint; it was corrected to create separate report identities and rerun in `browser-v2.sqlite`. No operational record or tracking history was touched.

| View | Desktop | Mobile |
| --- | --- | --- |
| Overview | [1440×900](S:/2026/dust/output/shipment-monitoring-v1.2-20261102/overview-1440.png) | [390×844](S:/2026/dust/output/shipment-monitoring-v1.2-20261102/overview-390.png) |
| All Shipments | [1440×900](S:/2026/dust/output/shipment-monitoring-v1.2-20261102/shipments-1440.png) | [390×844](S:/2026/dust/output/shipment-monitoring-v1.2-20261102/shipments-390.png) |
| Detail | [1440×900](S:/2026/dust/output/shipment-monitoring-v1.2-20261102/detail-1440.png) | [390×844](S:/2026/dust/output/shipment-monitoring-v1.2-20261102/detail-390.png) |
| Attention | [1440×900](S:/2026/dust/output/shipment-monitoring-v1.2-20261102/attention-1440.png) | [390×844](S:/2026/dust/output/shipment-monitoring-v1.2-20261102/attention-390.png) |

The same four views have `-1366.png` laptop and `-820.png` tablet captures. [Source evidence](S:/2026/dust/output/shipment-monitoring-v1.2-20261102/detail-source.png) is captured separately. V1.1 before/after evidence remains in `output/global-ui-ux-f87af83d`; it is not relabelled as a V1.2 baseline.

## Tests and verification

| Check | Result |
| --- | --- |
| Focused backend final | **41 tests / 576 assertions passed**, monitoring V1.1/V1.2, including the extra attention-facet regression |
| Broader backend regression | **73 tests / 909 assertions passed** before that additional facet test: monitoring, HandoverV2, HandoverVerification, PickupExecution, JnePopReconciliation and JneConfiguredReconciliation |
| No unintended mutations | Existing finalized proof/handover/revision and matching-audit invariant test now also reads Overview/Attention; no queued jobs/outbound HTTP from monitoring reads |
| Frontend unit tests | **25 files / 183 tests passed**; KPI query scopes, linkage chips, status transitions between tabs, attention reasons, accessible distribution/empty data and existing date/reset/navigation tests |
| TypeScript | `npm run types:check` passed for web and mobile |
| Scoped lint | Edited monitoring/navigation/header modules and browser scripts passed `npx vp lint … --deny-warnings` |
| Frontend build | `npm run build` passed; existing optional fontaine/plugin-timing advisories only |
| PHP style | `php vendor/bin/pint --dirty --format agent` passed after formatting changed files |
| Scoped PHPStan | Monitoring query/controller/request passed, zero errors |
| V1.2 browser acceptance | `tests/Browser/shipment-monitoring-operations.mjs`: **23 checkpoints**, real sidebar/module/KPI/detail navigation, 16 page/viewport combinations, search/status/customer-linkage/date/freshness/reset, history/source evidence, empty/loading/503 recovery, keyboard focus return, zero JavaScript page errors |
| V1.1 browser compatibility | Updated `tests/Browser/shipment-monitoring.mjs` passes with the current filter Sheet and accessible reload action |
| Existing workflow browser regression | `tests/Browser/ui-ux-remediation.mjs`: **18/18 passed**, including customer drafts/422/keyboard/URL history, mobile handover quantities, sorting, 200% dashboard text, role access, assigned pickup and task-first source setup |

The previous audit's disabled-activation assertion passes when the isolated server explicitly sets `JNE_EVIDENCE_POLICIES_ENABLED=false`, matching its fixture contract. No production flag was changed and no assertion was weakened. Other specialized scripts requiring different reconciliation/category fixtures were not represented as passing merely because this fixture rendered those routes.

The first Artisan test attempt could not load SQLite in its child runner. The successful runs invoke Pest directly with `-d extension=pdo_sqlite -d extension=sqlite3`; no operational database was used. Relevant tests were rerun after behavior changes. Full repository backend/static-analysis suites and native-device tests are not claimed as executed.

### Accessibility and responsive review

Visual review covered the actual four views, deliberate mobile cards, mobile header readability and source detail. Automated acceptance checks document width, first shipment visibility, usable heading bounds and real navigation at 1440×900, 1366×768, 820×1180 and 390×844.

Labels, invalid/error relationships, keyboard actions, visible focus and Sheet/dialog semantics use existing primitives. Field errors open the appropriate surface; a search error closes the Sheet so its invalid search input can receive focus. Active filters and list return state remain inspectable. No native disclosure hides primary criteria.

Focused axe results are stored as `a11y-*.json`. After the local contrast fix, the reviewed monitoring content reports zero violations; donut center labels can remain an incomplete contrast check because the SVG overlaps their background. Their text/background was visually reviewed; this is not treated as automated WCAG certification. Existing whole-application shell landmark findings from the earlier global audit are outside this module refactor. Safari/date-picker, screen-reader and physical touch-device acceptance remain UAT work.

## Performance measurements

The feature test creates **30,000 synthetic current shipments** in isolated in-memory SQLite and measures real authenticated Inertia responses. Final recorded sample in `backend-monitoring-final.txt`:

| View | HTTP time | SQL time | Queries | Rows returned |
| --- | ---: | ---: | ---: | ---: |
| Overview | 25.74 ms | 13.70 ms | 2 | 5 preview rows |
| All Shipments | 29.14 ms | 16.95 ms | 3 | 20 |
| Attention | 47.89 ms | 34.92 ms | 4 | 20 |

These counts are for this simple synthetic distribution without full source/customer/observation history on every benchmark row. Source-backed fixture regression and browser tests exercise eager relations and populated history separately. They do not establish 30,000-row production latency, concurrent capacity or large-history performance.

`EXPLAIN QUERY PLAN` shows the scalar aggregate using a covering scan of existing `jne_dashboard_shipment_metrics`. This is an explicitly measured scan, not a claim that exact aggregates are constant-time/index seeks. The existing order index and bounded relationship loads are retained. Additional conditional facet aggregation is only requested when a status/lifecycle/attention scope needs an independent denominator; empty filter fields do not cause a duplicate aggregate.

No new index, cache, background aggregation job or infrastructure was added without evidence. Before release, compare native MySQL plans and timings on representative source/history cardinalities and concurrent import/read workloads. If that measurement makes synchronous exact counts too costly, a separately reviewed cache/summary strategy will be needed.

## Remaining UAT / release boundaries

1. Verify approved colors/density and all four views with CS/supervisor users under their actual authorized roles. Existing permissions intentionally remain unchanged.
2. Test native MySQL query plans, real data volume/history growth and import concurrency; isolated SQLite figures are not a production performance guarantee.
3. Complete physical tablet/mobile, Safari date entry and assistive-technology testing; review existing shell landmarks separately.
4. Source completeness, failed-final/attempt semantics, daily historical cohorts and SLA/no-movement policies require verified source/business contracts before new metrics can be added.
5. Run the complete backend suite (`php artisan test --compact`) in the configured test environment and close remaining repository-wide static-analysis/target-host deployment blockers recorded in the V1.1 report. Those prior operational gates are not closed by this UI increment.

No migrations were run on operational databases, no schema or queue settings changed, no workers restarted, no source pulls requested, no tracking/reconciliation history rewritten, and no commit, push or deployment performed. Concurrent launcher/worker and unrelated working-tree modifications were preserved.
