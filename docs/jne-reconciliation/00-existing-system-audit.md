# M0 — Existing system audit

Audited 24 October 2026 against commit `d918714`, before reconciliation changes. This is an extension of the existing application. Read-only MySQL inspection, routes, migrations, actions, controllers, worker code, React pages, and regression tests were used. `.ai/rules` does not exist in this checkout. Unrelated local UI changes and untracked artifacts are outside this work.

## Architecture actually present

- PHP 8.5; Laravel 13.35.0; Inertia Laravel 3.5.1; Pest 5.3.1; Wayfinder 0.1.21. Versions verified with `composer show --direct` and Boost application information.
- React/Inertia v3, TypeScript, Tailwind v4, existing shadcn components and generated Wayfinder routes. Dependency ranges are in `package.json`; no dependency change is needed.
- MySQL is the application database. PHP tests use isolated SQLite; existing concurrency tests create disposable MySQL databases.
- `report_jobs` is the durable work queue for browser collection, distinct from Laravel's `jobs` queue used for imports and mapping runs. Node >=24 and Playwright 1.64.1 are pinned in `workers/jne-report/package.json`.
- `routes/console.php` schedules `jne-reports:queue-due` every minute with overlap protection. An active administrator must configure/enable report profiles. No new schedule should be activated as part of development.

## Implementation matrix

“Existing” means the capability was found, not that all target acceptance criteria are satisfied. “Partial” means a target gap remains.

| Capability | Existing | Partial | Missing | Evidence and recommended action |
|---|:---:|:---:|:---:|---|
| Four Hybrid processes | ✓ | | | `ReportJob::HYBRID_PARTS`, `QueueScheduledJneReports`, `workers/jne-report/src/hybrid.mjs`: Roberto cashless/manual and Nuralamt cashless/manual. Confirm this operational inventory with operator; retain architecture. |
| Independent source run state | ✓ | | | Four child `report_jobs` rows linked by `hybrid_batch_id`; events, lease, attempt and checksum per child. `ReportRunController` and `jne-report-runs.tsx` expose progress. |
| Hybrid export validation | ✓ | | | `ValidateReportCsv`, `ValidateHybridReportCsv`; cashless `Cnote No`/`HO Date`, manual `Cnote no`/`Date`; exact requested local day; preserves leading zeroes and source file. Node validates structure too. |
| Combine/upload format | | ✓ | | `CombineHybridReports` waits for four `SOURCE_SAVED` children with expected types/dates, deduplicates AWBs and writes headerless CRLF AWB lines. File integrity is not rechecked before combination. Confirm format with operator and add stored-output integrity checks. |
| Partial source recovery | ✓ | | | `ManageReportJobs::retryHybridSources` resets only failed, unsaved children before APEX; successful snapshots remain. Expired claims stop for review. Retain and test corruption/missing-file recovery. |
| APEX upload/process/download | | ✓ | | `worker.mjs`, `hybrid-apex.mjs`, `apex.mjs`, `history.mjs`: Upload Connote mode A, batches of 6,000, one Process click per batch, correlated history and bounded polling. Final combined result has exact-AWB validation. Multi-batch intermediate files are temporary, with no durable checkpoint for partially completed APEX batches. Never blindly replay uncertain Process submissions. |
| Account retrieval / National Account | | ✓ | | `JneReportProfile`, `StoreReportJobRequest`, `BulkJneReportProfileRequest`, `QueueScheduledJneReports`, `apex.mjs` persist/snapshot Y/N and set `P45_NA` for parameter mode. Meaning and source of truth for Y/N are unverified; it is not ownership evidence. |
| Scheduler and run history | ✓ | | | Profiles hold source/type, rolling/fixed dates, interval, next/last run, administrator and error. `report_job_events` holds lifecycle. Active/unreviewed failed work blocks duplicate scheduling. Reuse. |
| Immutable original report | ✓ | | | Private `jne_reports` disk, SHA-256, `report_jobs` metadata, `jne_report_awbs.raw_data` with original cell values and source row. Import verifies checksum. Original raw CSV remains stored. |
| Atomic / idempotent import | ✓ | | | `ImportReportAwbs`: transaction, 250-row upserts, unique `(report_job_id, awb)`, duplicate conflict rejection. `ImportJneReportAwbs` records import/projection failure separately. Same stored CSV can be retried without contacting JNE. |
| Unified AWB registry | | ✓ | | `jne_shipments` currently unique on `(customer_account, awb)`, so a changed source account can create a second shipment. Replace with AWB identity with a guarded upgrade; preserve account in every source observation. Do not merge conflicting historical claims silently. |
| Observation history / freshness | | ✓ | | `ProjectJneShipments`, `jne_shipment_observations`: one observation per source row, report-time ordering, older reports retained without replacing current tracking. Latest-source fields currently drive identity too; sparse tracking snapshots can lose useful identity. Distinguish identity evidence from tracking chronology. |
| Customer master / codes | ✓ | | | `customers.customer_code` is a string; `ImportCustomerDirectory` and command import the registered directory and aliases. Leading zeroes retained. Source report customer-code column has not been verified. |
| Registered code aliases | | | ✓ | No code-alias model/table or safe source-column contract found. A suffix or prefix is not a mapping. Do not infer `4000A → 4000`. |
| Registered shipper aliases | | ✓ | | `JneShipperAlias`, `ResolveJneCustomers`, `ImportJneShipperAliases`, `JneShipperAliasController`; exact uppercase/whitespace normalization, active mappings, global ambiguity detection. Profile FK is legacy; current ownership is global. Account/period scoping and mapping revision evidence are absent. |
| Account/customer separation | ✓ | | | Profile ownership was explicitly separated by migration `2026_10_21_075930`; resolver uses shipper aliases, not profile customer or account. Existing shared-account tests protect this. |
| Typo detection | | | ✓ | No candidate generation for `400O`, `Vany Songket`, etc. Add bounded suggestions only after checking exact verified evidence; never rewrite original cells or confirm fuzzy ownership. |
| Separate customer/pickup attribution | ✓ | | | `jne_shipments.customer_match_*` and `match_*` are separate. `MatchJneShipments` requires a resolved customer and unique exact task/effective processing reference on finalized POP. Same date or quantity is not enough. |
| Match decision history | | ✓ | | `jne_shipment_match_events` records previous/current customer and pickup, method, actor, reason. Manual links/unlinks survive automatic replay. Some initial unmatched/customer transitions are not evented; source/mapping IDs are not recorded in match events. |
| POP categories and corrections | ✓ | | | `PickupRecord`, `PickupRecordRevision`, `FinalizePickup`, `CorrectPickupRecord`: `manual_hybrid`, `cashless_hybrid`, `css_orion`; original final POP retained, correction revisions and task/handover events. Reuse unchanged. |
| Handover / processing | ✓ | | | `HandoverSession`, `HandoverItem`, revisions/events, `RecordPackageProcessing`, `QueryPackageProcessing`: receipt baseline, category/system revisions, duplicate reference and stale baseline warnings. Processing success is a declaration, not AWB identity proof. |
| Sertim Cashless AWB evidence | | | ✓ | No per-AWB pickup evidence table, action, endpoint or scanning UI. Handover stores category quantities, not cashless identities. Entry, correction, verification and closure policy require business decisions. |
| POP reconciliation | | ✓ | | `JneMonitoringController::reconciliation`, `jne-reconciliation.tsx`: totals of effective declared successful quantities vs linked AWB count; baseline warnings and explicit explanatory copy. No category attribution, collection completion window or category confidence. Counts alone must not become verified reconciliation. |
| Exception review | | ✓ | | Monitoring filters, alias conflict groups, manual reference match, report review/retry and resumable `JneMappingRun` exist. No general per-evidence exception grouping, one-off ownership override, scoped alias confirmation or Sertim conflict review. Extend existing pages later. |
| Tracking refresh | | ✓ | | `QueryActiveJneAwbs`, unresolved APEX profile and `queueActiveAwbs`: distinct AWB batches, lookback, configurable profile interval, delivered/cancel excluded. RETURNED handling differs from `TERMINAL_STATUSES`; no per-status cadence, stale-priority or terminal confirmation policy. |
| Operational monitoring | | ✓ | | `JneMonitoringController`, `QueryJneCustomerDashboard`, `jne-monitoring.tsx`, `jne-customer-dashboard.tsx`, report pages: tracking/customer summaries and drill-downs. No identity-vs-category reconciliation metrics or collection-window completeness. No customer portal is in scope. |
| Retry/error boundaries | | ✓ | | Node API retries idempotent requests; Process is never automatically repeated; leases/active slots serialize external work. PHP import/mapping jobs have one attempt and manual/resumable retry. Recovery must retain original evidence and distinguish uncertain external work from local deterministic replay. |

## Observed database state (read-only snapshot)

At audit time: 6,900 registry rows and 6,900 distinct AWBs; 6,345 rows marked customer matched; zero pickup matched. This demonstrates that collection/customer identification are in use while pickup linkage is not established by these records. It does not prove customer mappings are business-correct.

Run history contains successful APEX parameter reports, successful combined Hybrid/APEX runs, successful active-AWB refreshes, queued work and attention states across all four Hybrid processes. Existing live worker activity was not stopped or altered. Historical claims of live success in `workers/jne-report/README.md` are background evidence, not a new live validation for this project.

The sampled APEX report has `AWB`, `ID_ACCOUNT`, `SHIPPER_NAME`, `NOREF`, `PAYMENT_TYPE`, date/status fields and many operational fields. No source column has been established as the internal Retail customer code. `PAYMENT_TYPE`, AWB prefixes and account IDs must not be guessed into POP categories.

## Routes and user interfaces inspected

`routes/web.php`: JNE reports, report runs, profiles, aliases, monitoring, customer dashboard, shipment detail and reconciliation; pickup result/detail, corrections, handover verification. `routes/api.php`: five worker POST endpoints under `api/internal/report-jobs`, plus mobile pickup/handover routes. `EnsureReportWorker` enforces dedicated bearer token, source worker ID and per-claim ownership. JNE administrator pages require an active `admin_supervisor` in controllers.

`resources/js/pages/jne-{reports,report-runs,report-awbs,profiles,shipper-aliases,monitoring,shipment,reconciliation,customer-dashboard}.tsx` and supporting `resources/js/components/jne-*` reuse current components/Wayfinder. Pickup/handover workflows use the existing quantity/revision models; no cashless identity interface was found.

## Baseline validation

150 relevant PHP tests passed, 1,217 assertions, before code changes. Files: `CombinedHybridReportTest`, `HybridApexPipelineTest`, `JneReportAwbImportTest`, `JneMonitoringTest`, `JneMonitoringFlowTest`, `JneShipperAliasTest`, `ActiveJneAwbRefreshTest`, `JneReportSchedulingTest`. These include actual local Laravel → Node → Chromium → synthetic Hybrid/APEX fixture coverage. SQLite extensions were enabled on the command line. Worker tests are also being run; final results belong in `implementation-status.md`.

No live JNE submissions, destructive live testing, schedule activation or source/customer/POP mutations were performed for this audit.

## Unresolved operator questions

See [business-rules.md](business-rules.md). The four-process inventory/upload format, National Account semantics, internal-code source field, category evidence, collection completion and Sertim correction/verification authority need confirmation. These are implementation gates, not invitations to infer policy.

M0 discovery is complete. Operational acceptance of external formats is a later gate; no missing requirement is claimed to be implemented solely because a table or page exists.
