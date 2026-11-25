# Worker recovery and end-to-end processing efficiency

Date: 29 October 2026. Repository: S:/2026/dust. Scope: authorized local graceful worker recycle, bounded operational observation, source review and isolated native MySQL measurements.

## 1. Executive decision

The authorized local recycle completed successfully through Laravel's shared-cache restart mechanism and the existing parent launchers. All four old PHP queue workers exited; replacements started after the category-comparison correction. No force kill, operational queue clear/retry, MySQL restart or external submission was performed.

**Redundant CATEGORY growth stopped in the observed window while reconciliation continued.** A pre-fix worker process is confirmed; its previously loaded class contents were not directly introspected. Process timing, the earlier isolated old/current comparator experiment and the post-recycle behavior strongly support stale worker code as the cause of continued duplicate generation. This is behavioral operational verification, not a memory-level class fingerprint.

A separate, confirmed reliability issue remains: different customer-day reconciliations can deadlock while locking shipment rows through a broad pickup-or-unowned predicate. This is distinct from the already-explained same-task serialization between report projectors. No data corruption is demonstrated. No application correction is applied in this investigation: changing selection/locking or skipping reevaluation requires stronger integrity proof than a timing improvement alone.

**Pilot activation remains NO-GO** under the unresolved M7 acceptance conditions. Local code adoption is now demonstrated; cross-customer locking, target timeout/lease acceptance, approved source contracts, backup restoration and signed Android/physical-device evidence are not thereby resolved.

Baseline: [storage investigation](shipment-match-events-storage-investigation.md), [M6 readiness](pilot-readiness-assessment.md), [M7 closure](m7-pilot-blocker-closure.md).
Evidence: [operational snapshots](evidence/worker-recycle-operational.json), [workload measurements](evidence/worker-efficiency-workloads.ndjson), [test result](evidence/worker-efficiency-test.log), [derived summary](evidence/worker-efficiency-summary.json).

## 2. Worker topology and safety checks

All listed processes belong to the current local Windows user and run C:/laragon/bin/php/php-8.5.10-Win32-vs17-x64/php.exe, PHP 8.5.10. Installed Laravel is 13.35.0. Each uses the absolute S:/2026/dust/artisan path.

| Service / queues                            | Old PID | Old start (+07) | Parent launcher PID | Replacement PID / start (+07) |
| ------------------------------------------- | ------: | --------------- | ------------------: | ----------------------------- |
| reconciliation                              |   20556 | 12:49:10        |               22456 | 25752 / 20:56:29              |
| default,reconciliation,documents,deliveries |   16108 | 20:36:08        |               22964 | 26484 / 20:56:28              |
| documents,deliveries                        |   21620 | 12:49:10        |               18876 | 24588 / 20:56:28              |
| mobile-push                                 |   21116 | 12:49:10        |               17960 | 17604 / 20:56:27              |

[The launcher](../../workers/jne-report/start-local.ps1#L26) sets the repository working directory, redirects per-service logs and restarts PHP workers after exit 0/12 with a five-second delay (lines 46–56). Parent command lines select only the corresponding service. No new launcher or extra consumer was started. Exact cwd of an already-running PHP process was not independently retrieved from Win32_Process; absolute artisan paths and the verified parent launch code establish the intended repository/cwd.

The combined and dedicated reconciliation consumers can invoke category resolution. Documents/deliveries and mobile-push do not normally invoke it, but share the same default cache restart key and therefore also recycle on queue:restart. Their queues were absent from the final pre-signal backlog sample.

Preconditions verified:

- app.env=local; configured database dust / MySQL 8.4.11 / port 3306.
- queue.default=database, jobs table, retry_after=90 seconds; existing queue flags preserved.
- cache.default=database, prefix laravel-cache-, default database connection. A fresh application process read the same persisted restart timestamp as the read-only database query.
- Parent process ownership and restart loops verified. CLI and workers reference this checkout.
- Latest pre-signal queue contents: 159 reconciliation jobs, two reserved, all ReconcilePickupProcessingJob. These perform internal reconciliation, not provider submission. No report active_slot was held.
- In-flight reconciliation transactions were observed. They were allowed to finish; no lease was expired or transaction interrupted by this action.
- Document/push/provider credentials and raw report evidence were not printed.

Framework evidence: installed RestartCommand writes illuminate:queue:restart using the default cache; Worker checks it between jobs. The installed framework documentation search covered graceful restart, process supervision and timeout/retry_after. The parent launcher, rather than a presumed external supervisor, supplies local restart.

## 3. Graceful execution and source adoption

Executed once:

    php artisan queue:restart --no-interaction

Result: exit 0, "Broadcasting queue restart signal." Signal value changed from 1793176305 to 1793282181 (13:56:21 UTC). All four old PIDs disappeared, then their existing parents spawned the replacements above. New service stderr files were empty at the first verification.

Comparator source remained:

- File: [ResolveJneCategories.php:103](../../app/Actions/Reports/ResolveJneCategories.php#L103).
- SHA-256: DBB7F292FAF3F401A734D17260853DD22EBA607C60FD6BE3822E1873990B0B63.
- Last modification: 08:18:09 UTC / 15:18:09 +07.
- The old dedicated reconciliation process predates it; all replacement processes postdate it.

This establishes release/process identity and subsequent correct observed behavior. No claim is made that a source hash alone proves the loaded PHP class. Long-lived worker source adoption must remain part of future releases; post-job memory exits may also cause normal supervised replacement.

## 4. Bounded event-growth observation

| Window / measure                    | Result                                                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pre-recycle anchor                  | 13:55:22 UTC, max event ID 7,755,896                                                                                                                                     |
| Pre-recycle growth to 13:56:05 UTC  | 798 events / 798 shipments in 43 seconds; all CATEGORY (18.56 events/s during this short window)                                                                         |
| Pre-recycle adjacent equivalence    | 178 identical unchanged automatic CATEGORY pairs / 180 examined (98.89%)                                                                                                 |
| Settled replacement anchor          | 13:56:37 UTC, max event ID 7,757,309                                                                                                                                     |
| Observation through 14:13:35 UTC    | **Zero new events in 1,018 seconds (16 min 58 s)**; therefore zero new CATEGORY or redundant CATEGORY events in that window                                              |
| Natural-processing evidence         | All 847 reconciliation states reevaluated after the settled anchor; zero dirty states / zero last_error at 14:13:36 UTC; new service logs contain continued DONE entries |
| Terminal failed_jobs before / after | 1 default + 4 reconciliation before and after; latest reconciliation failure 13:43:13 UTC, before recycle                                                                |
| Queue snapshots                     | 159 reconciliation / 2 reserved just before signal; 35 / 2 shortly after; empty at one later sample; 26 / 2 at 14:13:36 as scheduler work continued                      |
| Final physical sample               | 7,243,563,008 bytes at 14:15:31 UTC; last file write 13:56:26 UTC; unchanged from the pre-signal physical sample                                                         |

The post-recycle logs sampled at 14:16 show 2,601 DONE entries and 59 failed-attempt entries across the two reconciliation-capable consumers. These are later snapshots than the final 14:13 database observation. The deadlock evidence below establishes a cause for transient failures; individual stdout attempts cannot all be attributed without job IDs. Failed attempts are not silently counted as successful executions. They did not increase the retained terminal failed-job total in the final database snapshot. Exact job/AWB ownership is not encoded by the database queue reservation, and these stdout lines lack job IDs; no exact unique processed-AWB denominator or per-run AWB count is claimed. The aggregate is zero new events across an active processing window, not a global production throughput benchmark.

The pre-recycle adjacent sample used the newest ten complete events for 20 recently active shipments, including all event types. Full-state comparison excludes only event ID/time and includes actor/reason/complete evidence: 178 of 180 adjacent pairs were equivalent unchanged automatic CATEGORY records. This avoids treating a legitimate A → B → A history as an adjacent duplicate.

No full JSON table scan, global duplicate census or exact current total recount was needed. All event-growth queries use the primary-key range after a recorded maximum ID. Zero events after the settled post-recycle anchor means zero new redundant CATEGORY events in that window; it does not classify the table's old duplicate population or promise zero future legitimate history.

The original physical file was 7,243,563,008 bytes before the signal. No storage cleanup or shrink was attempted. The file can remain allocated after redundant writes stop.

## 5. Processing-cost map

| Stage / implementation                                                                                                                                                | Trigger and unit                                                               | Reads / writes                                                                                                                                                                           | Existing early protection and remaining work                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [CSV import](../../app/Actions/Reports/ImportReportAwbs.php#L19)                                                                                                      | Stored completed report; one report                                            | CSV, contract/provenance context; bulk source rows, import status                                                                                                                        | Imported/non-null raw-data guard returns early. Genuine new report must preserve source rows; CSV parsing remains inside the report transaction.                                                                                                                                    |
| [Projection](../../app/Actions/Reports/ProjectJneShipments.php#L20)                                                                                                   | Import job / explicit stored-report rebuild; one report, chunks of 250         | All report source models, candidates, registry and observations; current snapshots and report projection status                                                                          | Observation identity and newer timestamp/report-ID checks prevent duplicate observations/older current overwrite. Same report still rebuilds candidates, locks registry, attempts insertOrIgnore and reruns categories; no blanket PROJECTED return.                                |
| [Matching](../../app/Actions/Reports/MatchJneShipments.php#L41)                                                                                                       | Projection or reconciliation; selected AWBs and their history                  | Source history in 500-AWB batches; aliases, contracts, dates, claims, task/exception state; changed current identity and audit                                                           | Existing no-change return at 261 prevents matching writes. Historical conflicting evidence, shared accounts and manual review cannot be discarded. Candidate computation repeats even when output is unchanged.                                                                     |
| [Category resolution](../../app/Actions/Reports/ResolveJneCategories.php#L28)                                                                                         | Projection / source-refresh reconciliation; selected AWBs                      | All source history for those AWBs, origins, contracts, claims; changed category evidence/current version and CATEGORY audit                                                              | Canonical object-key comparison skips unchanged state. Genuine new source IDs/provenance still create required evidence events. Full history/evidence is reassembled before comparison.                                                                                             |
| Audit creation                                                                                                                                                        | Actual identity, category, allocation or deliberate Admin decision             | Current-state updates plus immutable historical event rows                                                                                                                               | Keep legitimate transitions/provenance. Audit events are not execution logs. A global unique state hash would break valid repeated historical states.                                                                                                                               |
| [Historical invalidation](../../app/Jobs/QueueHistoricalPickupReconciliationsJob.php#L44)                                                                             | Projection after commit for affected customers; mapping/contract/alias changes | At most 200 finalized tasks per page up to captured upper ID; reconciliation input versions, unique continuation jobs                                                                    | Bounded producer, customer-day coalescing and continuation already exist. A repeated projection can still schedule another broad affected-customer history pass; uniqueness suppresses identical pending pages, not every later reevaluation.                                       |
| [Customer-day reconciliation](../../app/Actions/Pickup/ReconcileCustomerPickupDay.php#L33) / [evaluation](../../app/Actions/Pickup/ReconcilePickupProcessing.php#L31) | Input invalidation or due scheduler entry; one customer/day                    | Customer, tasks, POP/handover revisions, selected/current/historical source data, pending/exclusions; grouping and individual snapshots, timing/version bookkeeping, manifest if changed | Source refresh occurs once per group, not once per member. Pending cross-day keys are batched. Hash guards prevent unchanged snapshot-history writes. Complete proof/ownership/coverage evaluation and large model hydration still execute before hashes.                           |
| [Scheduled producer](../../app/Console/Commands/QueuePickupAutomation.php#L43)                                                                                        | Minute schedule, five-minute recovery; at most 200 due tasks                   | Due/missing/dirty states; queue jobs and next evaluation timestamps                                                                                                                      | Customer-day unique key coalesces pending/running jobs. next_evaluation_at makes even unchanged states due again after five minutes; input-version equality alone does not skip evaluation. Existing recovery also protects uncertain delivery status; it was not manually invoked. |
| [Monitoring](../../app/Http/Controllers/JneMonitoringController.php#L36)                                                                                              | Authorized read request                                                        | Current registry, eager-loaded page relations and grouped aggregates                                                                                                                     | Paginated selected fields and shared per-request metric calculation. GET index does not call matching/category resolution or create events. Export lazily reads batches. No new monitoring throughput benchmark is claimed.                                                         |

The modular monolith is adequate for these responsibilities. A new queue system, event bus or service boundary is not required to explain the measured costs.

## 6. Measurement method and test safety

Native MySQL 8.0.30 on **127.0.0.1:54183**, new temporary dust-hardening-mysql-eff-* directory and hardening_eff_* databases. This is a separate process, not the operational MySQL server. Port/prefix/datadir guards exist in parent and children. Migrations and schema cleanup apply only to the fixture databases. Operational schema and configuration are untouched.

The fixture retains finalized POP, verified handover and one customer/day; N unique AWBs have explicit verified customer/date/category evidence. Five distinct report identities eventually observe the same AWBs. New reports add provenance, and an older newly imported report must preserve the newer current pointer. It is a narrow synthetic fixture, not a production-width/history distribution.

Outbound HTTP is blocked, mail/push disabled and document/historical fanout faked. A uniquely rooted local fake disk prevents cross-test CSV interference. Queue scenarios publish and consume a real isolated database reconciliation job while faking document/historical jobs; before/after queue and failed-job assertions prove delivery. The test invokes the scheduled producer action with invalidate=false, not the entire operational scheduler or delivery workflow.

Measurements exclude parent measurement queries. Query listeners count successful SELECT/INSERT/UPDATE/DELETE and other SQL, record client SQL time and statement fingerprints. Performance Schema per-thread statement summary deltas provide rows examined/affected; prepared executions appear under statement/com/Execute. Counts of affected rows are engine counters, not counts of distinct changed AWBs. A separate before/after registry snapshot counts distinct changed shipment rows. One row can be updated more than once in a phase.

Transaction listeners measure committed outer transactions without summing nested savepoints. Global InnoDB row-lock-time differences are per isolated server, valid for serial phases; overlapping worker deltas overlap and must not be summed or attributed as exclusive per-worker wait. Sampled wait edges identify objects; locked SELECT elapsed time is not itself pure lock-wait time.

Peak PHP memory is allocated memory including framework, fixtures, probe state and prior allocations, not RSS or incremental action memory. Queue execution time includes in-process worker command/dispatch overhead. Matching-only accepts preloaded source models; category-only includes its input registry query. These probes identify costs but cannot simply be added as exclusive portions of a full action. Frozen unchanged trials can issue bookkeeping UPDATE statements without changing stored values; the scheduled trials advance time and produce actual bookkeeping writes. No production queue latency or physical Android measurement is implied.

Instrumentation adds overhead; compare these runs with each other. Earlier M6/storage timings used different fixtures/instrumentation and are context, not before/after speedup baselines. Two repeated unchanged trials show observed range, not statistical confidence. First-write/new-evidence/overlap scenarios are single trials per size.

## 7. Benchmark results and SQL bottlenecks

| Scenario                 | 100 AWBs (ms) | 1,000 AWBs (ms) | 5,000 AWBs (ms) |
| ------------------------ | ------------: | --------------: | --------------: |
| first_import             |         52.93 |          349.46 |         1979.72 |
| first_projection         |        794.27 |         7627.96 |        42287.63 |
| initial_reconciliation   |        341.02 |         2321.19 |        14618.33 |
| matching_candidates_only |         71.80 |          587.62 |         2872.95 |
| category_resolution_only |         26.35 |          213.85 |         1457.94 |
| new_evidence_import      |         52.46 |          392.31 |         1709.55 |
| new_evidence_projection  |        624.37 |         5465.41 |        28608.78 |
| late_report_import       |         40.95 |          349.82 |         1783.28 |
| late_report_projection   |        507.83 |         4637.21 |        24968.83 |

Repeated unchanged trials (minimum–maximum ms; spread=(max−min)/mean):

| Scenario                       | AWBs | Duration range (ms) | Spread | SQL counts |
| ------------------------------ | ---: | ------------------- | -----: | ---------- |
| same_import                    |  100 | 2.03–2.21           |  8.49% | 2 / 2      |
| same_projection                |  100 | 136.76–146.49       |  6.87% | 38 / 38    |
| unchanged_reconciliation       |  100 | 275.99–283.72       |  2.76% | 93 / 93    |
| scheduled_queue_reconciliation |  100 | 473.25–498.50       |  5.20% | 110 / 109  |
| same_import                    | 1000 | 2.29–2.61           | 13.18% | 2 / 2      |
| same_projection                | 1000 | 1270.65–1300.48     |  2.32% | 51 / 51    |
| unchanged_reconciliation       | 1000 | 2219.95–2304.36     |  3.73% | 94 / 94    |
| scheduled_queue_reconciliation | 1000 | 3568.19–3693.13     |  3.44% | 111 / 110  |
| same_import                    | 5000 | 13.00–13.38         |  2.90% | 2 / 2      |
| same_projection                | 5000 | 7319.95–8441.09     | 14.23% | 123 / 123  |
| unchanged_reconciliation       | 5000 | 14414.57–14673.00   |  1.78% | 102 / 102  |
| scheduled_queue_reconciliation | 5000 | 21033.00–21452.75   |  1.98% | 119 / 118  |

Selected 5,000-AWB phase detail. S/I/U/D are successful SQL statement counts; affected/examined are Performance Schema rows, not unique business records.

| Phase                            | S / I / U / D          | Rows affected / examined | Changed shipments / match events | Outer transaction ms | Peak allocated MiB |
| -------------------------------- | ---------------------- | ------------------------ | -------------------------------- | -------------------: | -----------------: |
| first_import                     | 3 / 20 / 1 / 0         | 5001 / 3                 | 0 / 0                            |              1979.44 |                102 |
| first_projection                 | 83 / 10040 / 15001 / 0 | 35001 / 56517            | 5000 / 10000                     |             42287.25 |                138 |
| same_projection_1                | 103 / 20 / 0 / 0       | 0 / 45037                | 0 / 0                            |              7319.72 |                198 |
| unchanged_reconciliation_1       | 99 / 0 / 3 / 0         | 0 / 85065                | 0 / 0                            |             14405.52 |                202 |
| new_evidence_projection          | 103 / 5040 / 10001 / 0 | 20001 / 65041            | 5000 / 5000                      |             28608.50 |                216 |
| late_report_projection           | 103 / 5040 / 5001 / 0  | 15001 / 75044            | 5000 / 5000                      |             24968.59 |                236 |
| scheduled_queue_reconciliation_1 | 109 / 2 / 7 / 1        | 7 / 150081               | 0 / 0                            |             21415.66 |                264 |
| scheduled_queue_reconciliation_2 | 109 / 1 / 7 / 1        | 6 / 150081               | 0 / 0                            |             20995.13 |                266 |

At 5,000 AWBs, first projection uses **5.0248 SQL statements/AWB**, versus **0.0246** for unchanged projection and **0.0204** for unchanged reconciliation. Mean unchanged reconciliation costs **2,908.76 ms per 1,000 AWBs**; scheduled queued reevaluation with three source histories costs **4,248.58 ms per 1,000 AWBs**. First projection changes 5,000 shipments and affects 35,001 engine rows (7.0002 per changed AWB including registry, audit, observations and report bookkeeping); new-evidence projection affects 20,001 rows (4.0002/changed AWB), and late evidence 15,001 (3.0002/changed AWB). These are accounting ratios, not claims that every write is avoidable.

Unchanged reconciliation averages 50.84% of new-evidence projection duration in this fixture, but action/history depth differ; this is not an equivalent before/after experiment. The unchanged projection/reconciliation/scheduled scenarios create **zero match events** and zero changed shipment rows. Their redundant event ratio is zero created redundant events/AWB; redundant/total-new-events is **undefined (0/0)**, not an invented percentage. New/late reports legitimately append provenance while older current snapshots stay protected.

Most cumulative first-projection SQL time is five per-AWB write families: matching-state UPDATE (3,297.17 ms), current-observation pointer UPDATE (3,271.93 ms), category UPDATE (3,012.46 ms), identity audit INSERT (2,860.25 ms) and CATEGORY audit INSERT (2,411.46 ms). These represent genuine first-state/evidence writes. Unchanged reconciliation's largest SQL families are two registry reads (1,383.34 ms), category source-history read (643.96 ms) and coverage distinct-count (591.94 ms). Total reported SQL time is 3,619.63 ms of 14,414.57 ms wall time. After three report histories, scheduled reconciliation's full category-history read alone costs 1,856.38 ms; total SQL time is 5,147.65 of 21,452.75 ms. Raw and normalized fingerprints are retained; operational plans were explain-only, with no ANALYZE or new index.

The no-change work is real: selected AWBs/history are hydrated and matched, category evidence reconstructed, dates/eligibility recalculated, coverage and manifest/snapshot hashes built under locks. Zero audit events does not mean zero CPU, reads or bookkeeping writes. The SQL client-time gap includes PHP work, hydration and framework/test instrumentation; it is not a function-level CPU profile.

Same projection still issues insertOrIgnore batches against already-known AWBs. Those statements count as INSERT attempts but change no registry rows in unchanged fixtures. New report observations and evidence events are required; omitting those audit rows or suppressing new source IDs would change the preserved contract. A bulk write preserving every required row is a different proposal and has not been benchmarked or implemented here.

No-change costs and legitimate-evidence costs use the same engine/AWB fixture but different history depth and actions. Ratios are descriptive workload comparisons, not causal optimization gains. New source-history depth also increases later matching/category work.

## 8. Transactions, concurrency and deadlocks

### Same-customer report serialization

| AWBs | Pair wall ms | Worker durations ms | Largest shared-task locking SELECT ms | Sampled wait object |
| ---- | -----------: | ------------------- | ------------------------------------: | ------------------- |
| 100  |      1300.70 | 984.39 / 842.41     |                                518.17 | pickup_tasks        |
| 1000 |      9186.58 | 6614.71 / 8965.99   |                               4445.68 | pickup_tasks        |
| 5000 |     47595.14 | 47359.79 / 38990.08 |                              28881.95 | pickup_tasks        |

At 5,000 AWBs, the shared-task SELECT takes **28,881.95 ms**, corroborated by 28,881 ms of isolated-server InnoDB row-lock wait time during the pair and 71 sampled wait edges on pickup_tasks. Worker outer transactions last 47,355.61 and 38,985.35 ms. All pairs complete and preserve five observations per AWB and the newer report pointer. The isolated server ends with zero deadlocks/timeouts; its four total lock waits/34,305 ms include the separate 100-AWB preview as well as the final run.

Child event/observation/changed-row snapshots are global table differences and can include the other worker's commits; do not sum them as exclusive writes. Per-thread SQL/affected-row counters remain exclusive. A new report's provenance can already be incorporated by its sibling's resolver because both reports are imported before either projection; this is legitimate shared evidence, not duplicated audit. Neither current test nor sampled live behavior establishes universal concurrent safety.

The earlier approximately 28-second M6 wait was an X lock on the shared pickup-task primary key, acquired by MatchJneShipments.candidates while the first report transaction continued through projection/category work. M7 separately measured 44.34 seconds at that call and a three-worker lock timeout followed by existing transaction retry. Those observations and the new sampled edges establish expected serialization made expensive by long transactions; they are not proof that raising a timeout or concurrency is safe.

The minimum safe scope has not been proven smaller than the current report/customer-day transaction. Moving category updates, matching, report readiness or observation insertion to independently committed chunks could expose incomplete snapshots, inconsistent counts or stale customer decisions. No boundary was shortened.

### Cross-customer reconciliation deadlock: CONFIRMED

A read-only operational InnoDB deadlock sample at stored server-local 21:03:36 (+07) shows two different customer/task scopes:

- Both execute the shipment scope at [ReconcileCustomerPickupDay.php:93–100](../../app/Actions/Pickup/ReconcileCustomerPickupDay.php#L93).
- One holds shipment PRIMARY and requests the pickup_task_id/category secondary index; the other holds that secondary index and requests PRIMARY.
- The latter transaction reports **35,362 row locks**, despite a customer-day logical unit. InnoDB rolls back transaction (1).
- Read-only EXPLAIN for the sampled shape selects ref_or_null on jne_shipments_pickup_task_id_category_status_category_index, estimates 13,079 examined rows, and filesorts. The null pickup branch scans beyond one customer's logical scope before all predicates filter it. Estimates are not actual rows-examined measurements.
- Parent worker stdout contains failed attempts and redacted application-log samples identify SQLSTATE[40001] / driver 1213. These are not all terminal failed jobs. At the post-recycle check, failed_jobs remained one default plus four reconciliation records, all predating the restart; all 847 reconciliation states had subsequently evaluated, none dirty and none with last_error at that snapshot.

Existing internal transaction retries and queue backoff allow eventual recovery in the observed snapshot. They do not eliminate the wasted work or prove recovery under every interleaving. No operational queue row was cleared/retried manually and no automatic external action was repeated.

The deadlock is already present in retained pre-signal failure history; its post-recycle observation does not establish that recycling introduced it. A single-customer synthetic fixture cannot reproduce the same cross-customer null-owner distribution. Remediation needs an isolated representative mixed-customer/owned/unowned fixture and query/lock-plan comparison before changing selection or adding indexes.

## 9. Prioritized decisions

| ID / priority                             | Root cause and evidence                                                                                             | Smallest next step / expected benefit                                                                                                                                     | Complexity / integrity risk                                             | Required regression / approval                                                                                                                                                                                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| WR-01 / P1, operationally corrected       | Pre-fix worker plus repeated CATEGORY history; corrected replacements and zero new observed events                  | Retain graceful recycle/version verification in release procedure; prevents stale-code audit amplification                                                                | S / low for verified graceful local procedure                           | Repeat bounded behavioral observation after releases. Current recycle explicitly authorized and complete; target operations acceptance remains separate.                                                                                                           |
| WR-02 / P1, confirmed                     | Cross-customer locking SELECT deadlocks, broad null-owner index scan and 35,362 lock entries                        | Reproduce mixed customers on isolated clone; compare narrowly scoped selection/ordered locking while preserving owned-conflict detection and phantom/ownership protection | M / material if query/locks change                                      | Conflicting ownership, unowned pools, new/late reports, exclusions, finalized baselines, rollback/replay, different-customer interleavings. Approve demonstrated query/lock patch separately; schema changes require approval.                                     |
| WR-03 / P1, measured deadline risk        | One large report transaction plus same-task serialization; retained M6/M7 and current timing                        | Validate actual target timeout/lease and realistic concurrency before activation; avoid an unmeasured concurrency increase                                                | M / high for transaction splitting                                      | Target worker timeout, lease expiration, rollback/replay and interrupted projection. Transaction splitting/architecture change requires separate approval and proof. No timeout increase proposed.                                                                 |
| WR-04 / P2, measured repeated computation | Due scheduling reevaluates unchanged customer/day; low write output but substantial hydrated processing             | Profile and reuse immutable loaded values within a single evaluation first; then evaluate a complete input/dependency signature rather than input_version alone           | S–M for local reuse, L for comprehensive skip / medium to high for skip | Preserve all customer/date/alias/contract/pending/Sertim/POP/handover/source changes, late arrivals, Admin review and A → B → A. No implementation justified without measured microbaseline and equivalence. Dependency-based skip needs separate design approval. |
| WR-05 / P2, evidenced replay fanout       | Projected replay still rebuilds candidates and dispatches affected-customer historical work when automation enabled | Measure producer continuation and dependency revisions on approved representative history; coalesce duplicate invalidations without suppressing new evidence              | M / medium                                                              | Late/out-of-order source, new alias/contract, replay after correction, interrupted continuation, every affected day eventually visited. Broader invalidation policy requires approval.                                                                             |
| WR-06 / P3                                | Streaming importer, caches, new queues, speculative indexes or audit retention                                      | No implementation; current evidence points elsewhere first                                                                                                                | L / unnecessary risk now                                                | Separate evidence and approval before architectural/schema/retention change.                                                                                                                                                                                       |

No new P0 corruption or duplicate external business effect is demonstrated. A serious locking/availability risk can exist without proving corruption.

## 10. Changes, verification and preservation

Operational action: one authorized queue:restart. Application changes: **none**. New test-only files:

- [WorkerProcessingEfficiencyTest.php](../../tests/Feature/WorkerProcessingEfficiencyTest.php).
- [efficiency-processing-worker.php](../../tests/Feature/efficiency-processing-worker.php).
- [processing-efficiency.php](../../tests/Fixtures/processing-efficiency.php).

Final workload result: **3 passed / 141 assertions / 345,410 ms**. Existing category regression: **4 passed / 16 assertions / 1,091 ms**. PHPStan: **PASS, zero errors**. Scoped Pint: **PASS**, only the three newly owned PHP files. Snapshot comparison: **544 pre-existing backend/config/test/rule files checked, zero drift**, including the three pre-existing M7 modifications and the prior storage reproduction tests. Application source is unchanged, so the unrelated full frontend/backend suites were not repeated. The earlier repository-wide lint/format limitation remains documented in M7; this investigation does not claim that gate is fixed.

The disposable server finished with no hardening_eff_* database remaining and was shut down successfully (exit 0); its temporary directory is retained. The operational port-3306 MySQL instance remained running. Report/evidence formatting, local-link verification and git diff --check passed. The final [preservation evidence](evidence/worker-efficiency-preservation.json) retains the initial hashes and zero-drift comparison.

The three initial 100-AWB harness attempts retained an unconsumed queue row: the in-process Worker had a fake manager. They are labeled harness attempts and excluded from final metrics. The final harness explicitly supplies the real manager to the worker while retaining document/historical fakes. The queue-empty assertions remain; no test was weakened. The corrected 100-AWB preview passed before the full three-size run.

Commands (environment variables set only in the test process):

    php artisan queue:restart --no-interaction
    php artisan make:test --pest WorkerProcessingEfficiencyTest --no-interaction
    HARDENING_MYSQL_PORT=54183 WORKER_EFFICIENCY=1
    php -d extension=pdo_sqlite -d extension=sqlite3 vendor/bin/pest tests/Feature/WorkerProcessingEfficiencyTest.php --compact --do-not-cache-result --stop-on-failure
    php vendor/bin/pint tests/Feature/WorkerProcessingEfficiencyTest.php tests/Feature/efficiency-processing-worker.php tests/Fixtures/processing-efficiency.php --format agent
    php vendor/bin/phpstan analyse --no-progress
    git diff --check
    git status --short

The isolated server uses --no-defaults, a new guarded datadir, port 54183 and Performance Schema. Parent/child HTTP is prohibited; SMTP/push are disabled. No MySQL setting on the operational server was modified. Raw operational deadlock records/payloads are not published; only a redacted lock/query summary is retained. An isolated instrumentation query initially referenced EVENT_NAME instead of NAME in setup_instruments; corrected read-only query, no application effect.

HEAD and the pre-existing three M7 edits remain preserved. No reset/stash, commit/push/deploy, operational schema/data cleanup, retention change or uncertainty-policy change was performed.

## 11. Explicit final answers

1. **Stale worker confirmed or suspected?** A worker process predating the fix is confirmed. Stale loaded comparator attribution is strongly supported by the intervention/behavior; direct old-class memory identity is unavailable. Do not call file hashing alone proof.
2. **Did redundant CATEGORY growth stop?** Yes, in the bounded natural-processing window recorded above. This is not an indefinite production guarantee.
3. **Why hundreds of events per shipment?** The earlier isolated strict comparison produced one no-change CATEGORY event per AWB per pass. Repeated scheduled/source reevaluations amplify that defect. Current loaded behavior avoids those events; not every historical event is redundant.
4. **Which stages waste most time?** Full candidate/history/category recomputation and repeated customer-day hydration/eligibility/snapshot work on unchanged data; contention magnifies long report transactions. First-time required writes are expensive but not classified as waste merely by count.
5. **Why expensive unchanged reconciliation?** Output hashes are checked after source/history matching, category reconstruction, two levels of scope evaluation, coverage/manifest hashing and locked model loading. It still updates evaluation bookkeeping.
6. **Can cost fall without weakening correctness?** Potentially through measured in-execution reuse and scoped locking. A complete dependency model is needed before skipping evaluations; late source and changed identity evidence must still invalidate.
7. **Smallest safe optimization?** The completed operational correction was adopting the existing fix through graceful recycle. Next application step is a narrow isolated lock/query or PHP reuse experiment with equivalent-result tests; no additional production patch is yet certified safe.
8. **What needs architectural approval?** Transaction splitting, dependency-based bypass/invalidation redesign, new queue/cache systems, schema/index changes and any archival/retention policy. None was implemented.
9. **Will the event table still grow?** Yes for genuine current-state changes, new source provenance, allocations and deliberate Admin decisions. Already allocated space is not automatically reclaimed.
10. **What remains before pilot activation?** Resolve/accept measured cross-customer locking and target worker deadlines, then close the retained M7 source-contract, backup restoration, target supervision/alerts and Android signed-release/physical-device requirements. Keep SMTP receipt work deferred.

## 12. Remaining limits

Mixed-customer deadlock reproduction/fix is not completed; live locked-class introspection, production-width/history capacity, pure function CPU profiling, production queue latency, exact active/index/reclaimable storage, complete global duplicate history and target-host/device acceptance remain unverified. The synthetic overlap scenario is not a proof that every concurrent path is safe. No previously missing operational evidence is reclassified as PASS merely because local replay tests pass.
