# Pilot readiness assessment — M6

Date: 29 October 2026. Repository: S:/2026/dust. Baseline HEAD: 08c2c075fafffde5b675ce5dd8da54a4e21db0ef.
Evidence follows the existing audit, remediation and M1–M5 reports. Historical reports were preserved.

## Executive decision

**NO-GO — the pilot must not begin yet.** Mandatory signed Android/HTTPS distribution, approved operational source-contract samples, target-host monitoring/restart acceptance and backup restoration evidence are missing. Passing local functional tests cannot substitute for those controls.

M6 confirmed and corrected one narrow defect: MySQL JSON object-key ordering caused unchanged category evidence to be treated as changed. This generated redundant shipment version updates and CATEGORY audit events on report replay and reconciliation. The correction preserves list order, strict scalar types, review hashes, real evidence changes, source observations and all existing history.

At 5,000 AWBs, replay SQL dropped from **10,123 to 123** and reconciliation SQL from **10,133 to 133**, consistently across repeated fixtures. The respective two-run mean action times changed from 19,366.13 to 10,741.87 ms, and 23,791.84 to 17,710.06 ms. These are local synthetic observations, not production latency or throughput promises. First projection and genuine new-report evidence still require their original writes.

The old 63-job/2-reservation snapshot is no longer the current backlog: the first read-only snapshot had **zero jobs**, followed by fresh scheduler-produced work (43 reconciliation jobs, 2 reserved, oldest 29 seconds, attempts at most 1 at 08:47:31 UTC). The two historical failed-job records remain, but their referenced mapping run has completed and the referenced pickup has subsequently been reevaluated. Two reviewed NEEDS_ATTENTION report outcomes remain, with intact original source files. No operational job/report was consumed, cleared, retried, deleted or modified by this investigation.

## Requirement classification

PASS means the stated local check passed, not that an entire deployed subsystem is certified.

| Requirement                                                                              | Status     | Evidence / remaining limit                                                                                                                                                  |
| ---------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repeated 100/1,000/5,000-AWB native profiling                                            | PASS       | Two baseline and two selected final runs; parameterized SQL fingerprints, driver timings, representative plans, outer transaction duration and allocated PHP peak retained. |
| Confirmed replay bottleneck corrected                                                    | PASS       | Failing-before/passing-after regression, strict type/list/nested-object cases, native replay and equivalent query counts.                                                   |
| Expected new-evidence writes preserved                                                   | PASS       | First/second projection SQL unchanged; one shipment per AWB and distinct report observations retained.                                                                      |
| Two concurrent report processors                                                         | PASS       | Native MySQL 8.0.30 two-process runs at 1,000 and 5,000 AWBs; snapshot ordering, repeated reconciliation and manifest identity preserved.                                   |
| Production capacity / wide-history limits                                                | NOT TESTED | No realistic report-width/history-depth distribution, production RSS, percentile load or target-host capacity certification.                                                |
| Terminal polling actual request and database cost                                        | PASS       | Prior real Chromium count plus current native MySQL partial HTTP-kernel requests; polling unchanged.                                                                        |
| Local queue consumers / scheduler heartbeat                                              | PASS       | Read-only process inventory, fresh scheduler completion output, zero/short-lived queue snapshots and shared-cache fixture tests.                                            |
| Target deployment supervision, restart and alert delivery                                | BLOCKED    | Local processes/logs do not establish target-host supervision or alert acceptance. Windows CLI lacks pcntl; timeout enforcement needs target acceptance.                    |
| Historical continuation / killed import and projection recovery                          | PASS       | Isolated actual database queues, lease expiry, duplicate dispatch, rollback and explicit local-CSV recovery.                                                                |
| Failed-job and report-exception diagnosis                                                | PASS       | Safe IDs/classes/statuses and artifact checks recorded below; retained failures remain historical evidence.                                                                 |
| Signed Android pilot APK and approved HTTPS origin                                       | BLOCKED    | Only debug APK found; release signing/identity/distribution not configured/approved in supplied evidence. Current assets fail release guard as intended.                    |
| Current release assets                                                                   | FAIL       | Existing development/LAN assets rejected by verifyReleaseMobileAssets. No release was built or distributed.                                                                 |
| Android auth/drafts/camera/scanner client logic                                          | PASS       | Current backend/mobile-client regression; not physical-device acceptance.                                                                                                   |
| Physical-device, OEM camera/Bluetooth, process-death and weak-network release acceptance | BLOCKED    | adb devices lists no connected device; no fresh physical evidence.                                                                                                          |
| Source/provenance/completeness synthetic contract tests                                  | PASS       | Current PHP and 112 Node stand-in tests; four-source/split-server identity, duplicates, partial/late data and uncertainty preserved.                                        |
| Real Hybrid/APEX source-contract acceptance                                              | BLOCKED    | No approved source sample/sign-off supplied; zero active verified source contracts in inspected local DB. Feature flags are not acceptance evidence.                        |
| Backup configuration and approved artifact                                               | BLOCKED    | No repository backup configuration or approved backup artifact supplied; external backup service cannot be inferred.                                                        |
| Isolated restore drill                                                                   | BLOCKED    | Disposable MySQL exists, but no approved backup to restore. Fresh migrations are not a restore drill.                                                                       |
| Receipt email TA-09                                                                      | NOT TESTED | Still deferred; local receipt_channel unset and mail.default=log. No SMTP enabled or sender added.                                                                          |
| Entire repository quality pipeline                                                       | FAIL       | Pre-existing broad formatting failures remain; final exact gates recorded below.                                                                                            |

## M6.1 — method and performance evidence

Native disposable MySQL **8.0.30**, PHP **8.5.10**, Laravel **13.35.0**, Inertia Laravel **3.5.1**. The configured operational database was inspected read-only and reports MySQL **8.4.11**; no schema or infrastructure there was changed. Native performance/concurrency results below are for 8.0.30, not a claim about 8.4.11.

The benchmark reuses [PostRemediationPerformanceTest.php](../../tests/Feature/PostRemediationPerformanceTest.php). It creates and finally drops only its own randomized hardening_validation_* database on guarded port 54182. Each size uses a narrow manual-category CSV repeated through two reports, N distinct AWBs, QTY=3 ignored for counting, verified synthetic code/date/category contract and one customer-day. Historical invalidation uses a separate customer's N finalized tasks and all bounded 200-task pages.

The test asserts N shipments, 2N source rows, 2N observations, N manifest items, DONE reconciliation and full historical invalidation. No real external requests are permitted.

Instrumentation:

- DB::listen captures executed SQL count, SELECT count, cumulative and maximum client/driver query time. SQL fingerprints collapse placeholder-list length; samples contain synthetic fixtures only. Bindings are not exported directly.
- Each fingerprint records its first application call site. Queries with different IN-list cardinalities can share a fingerprint; its sample EXPLAIN represents the first binding set, not every cardinality. In particular, the projector's 250-AWB chunk read and final full-set locked read share a shape; their cumulative time must not be attributed solely to the small chunk.
- EXPLAIN FORMAT=JSON plans are obtained after the measured phase, with sample bindings. These are optimizer estimates. The separate normalized customer-code EXPLAIN ANALYZE is an actual local execution, not a production plan.
- hrtime measures action wall time. Outer transaction duration is measured separately from nested transaction sums; sums are not represented as lock residence or one transaction duration.
- memory_reset_peak_usage/get_peak_usage(true) records allocated PHP peak, including framework, fixtures and fingerprint instrumentation. It is **not RSS** or incremental action memory. The later partial-request instrumentation loads additional HTTP code between fixture sizes; the final run's approximately 2 MiB difference is not a demonstrated memory improvement/regression from the production correction.
- Two baseline runs and two selected post-fix runs are reported; no p95/p99 inference is made from two samples. Other local processes were present. Do not interpret small timing differences as causal speedups.

Primary raw evidence:

- [baseline-r1](evidence/m6-profile-baseline-r1.ndjson), [baseline-r2](evidence/m6-profile-baseline-r2.ndjson).
- [after-r1](evidence/m6-profile-after-r1.ndjson), [after-r3](evidence/m6-profile-after-r3.ndjson).
- Aggregated metrics and exact run selection: [m6-results.json](evidence/m6-results.json).

An intermediate after-r2 run and poll-diagnostic fixture reached the functional load assertions but failed a new partial-request test with HTTP 409 because the fixture omitted X-Inertia-Version. The installed Inertia protocol correctly rejected the mismatched asset version. The fixture now supplies the current middleware version; poll-verified and after-r3 passed. Those failed attempts are retained but excluded from the two-run comparison. No application assertion or version check was weakened.

### Equivalent before/after action measurements

| Phase                         | AWBs/tasks | Before ms (two runs) | After ms (two runs) | Before → after SQL | SELECTs |
| ----------------------------- | ---------: | -------------------- | ------------------- | ------------------ | ------- |
| import_1                      |        100 | 62.19 / 36.15        | 34.69 / 34.59       | 6 → 6              | 4       |
| projection_1                  |        100 | 585.30 / 584.32      | 560.92 / 545.30     | 541 → 541          | 38      |
| projection_2                  |        100 | 464.96 / 434.86      | 407.51 / 430.79     | 340 → 340          | 37      |
| older_projection_replay       |        100 | 349.16 / 339.91      | 163.38 / 175.66     | 238 → 38           | 37      |
| reconciliation                |        100 | 466.44 / 584.38      | 328.94 / 342.06     | 308 → 108          | 96      |
| historical_producer_all_pages |        100 | 192.93 / 236.81      | 167.56 / 192.10     | 304 → 304          | 104     |
| import_1                      |      1,000 | 305.59 / 300.99      | 311.69 / 320.43     | 8 → 8              | 3       |
| projection_1                  |      1,000 | 5505.09 / 5172.60    | 5253.24 / 5523.46   | 5052 → 5052        | 43      |
| projection_2                  |      1,000 | 4259.34 / 3801.26    | 4019.12 / 4266.15   | 3056 → 3056        | 47      |
| older_projection_replay       |      1,000 | 3325.04 / 2924.53    | 1660.95 / 1751.08   | 2051 → 51          | 47      |
| reconciliation                |      1,000 | 3943.71 / 3736.61    | 2661.73 / 2737.79   | 2109 → 109         | 94      |
| historical_producer_all_pages |      1,000 | 1657.43 / 1702.15    | 1759.25 / 1694.01   | 3020 → 3020        | 1020    |
| import_1                      |      5,000 | 1421.34 / 1436.51    | 1390.10 / 1369.37   | 24 → 24            | 3       |
| projection_1                  |      5,000 | 28144.69 / 28871.21  | 27141.41 / 27201.95 | 25124 → 25124      | 83      |
| projection_2                  |      5,000 | 22734.79 / 21700.88  | 22323.80 / 25753.58 | 15144 → 15144      | 103     |
| older_projection_replay       |      5,000 | 18533.01 / 20199.25  | 10336.09 / 11147.65 | 10123 → 123        | 103     |
| reconciliation                |      5,000 | 23725.80 / 23857.88  | 18564.37 / 16855.74 | 10133 → 133        | 102     |
| historical_producer_all_pages |      5,000 | 8459.86 / 9236.35    | 9111.66 / 9723.16   | 15100 → 15100      | 5100    |

The correction addresses replay writes only. First projection SQL remains 25,124 at 5,000 AWBs; second projection remains 15,144 because a genuinely new source changes category provenance. The second projection's measured mean was 22,217.84 ms before and 24,038.69 ms after; no speedup is claimed there. The narrow fix does not make all 5,000-row processing inexpensive.

At 5,000 rows, outer transaction times for old replay were 18,532.76 / 20,198.83 ms before versus 10,335.82 / 11,147.35 ms after; reconciliation was 23,707.52 / 23,832.05 ms versus 18,558.55 / 16,850.02 ms. The transaction boundaries and existing row-lock queries were not shortened or broadened.

Allocated PHP peaks: first projection 136 MiB baseline versus 136/138 MiB after; replay 174 versus 174/176 MiB; reconciliation 214 versus 214/216 MiB. The local CLI memory_limit is 512M. Pilot host memory/RSS and worker recycling must be accepted separately; Laravel's post-job memory recycling is not an in-job hard limit.

### SQL bottlenecks and expected writes

Confirmed driver-time fingerprints in the 5,000-AWB baseline-r1, with full plans/SQL in the linked raw evidence:

| Phase / SQL shape                                                               |      Calls |       Cumulative ms | Assessment                                                                                                                                                                    |
| ------------------------------------------------------------------------------- | ---------: | ------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First projection: category shipment UPDATE                                      |      5,000 |            1,785.71 | Expected first classification write.                                                                                                                                          |
| First projection: identity/match shipment UPDATE                                |      5,000 |            1,676.14 | Expected first assignment/state evidence.                                                                                                                                     |
| First projection: current tracking UPDATE                                       |      5,000 |            1,551.30 | Expected current projection; older observations still cannot overwrite it.                                                                                                    |
| First projection: CATEGORY audit INSERT                                         |      5,000 |            1,543.80 | Expected initial audit, retained.                                                                                                                                             |
| First projection: matching audit INSERT                                         |      5,000 |            1,437.69 | Expected matching audit, retained.                                                                                                                                            |
| First projection: locked registry SELECT shape (250 and full-set reads grouped) |         21 |            1,287.10 | Largest individual call 1,111.29 ms; retained stable ordering/locks.                                                                                                          |
| Second projection: category-source history SELECT                               |          1 |            2,082.53 | Confirmed expensive read in this fixture; full source history remains required.                                                                                               |
| Old replay: category-source history SELECT                                      |          1 |            1,978.35 | Retained; JSON optimizer plan scans PRIMARY in id order, awb index is an alternative possible key. Estimated approximately 9,892 rows, not an actual row-examination counter. |
| Old replay: CATEGORY audit INSERT + category shipment UPDATE                    | 5,000 each | 1,385.19 + 1,360.96 | Avoidable when only decoded object key order differs; corrected.                                                                                                              |
| Reconciliation: registry SELECT shape                                           |          2 |            1,971.03 | Retained; scope/locking semantics unchanged.                                                                                                                                  |
| Reconciliation: category history SELECT                                         |          1 |            1,920.12 | Retained; measured large IN/history read, not an N+1.                                                                                                                         |
| Reconciliation: CATEGORY INSERT + shipment UPDATE                               | 5,000 each | 1,263.01 + 1,248.92 | Same avoidable replay effect; corrected.                                                                                                                                      |
| Reconciliation: coverage count(distinct awb)                                    |          1 |              963.21 | Retained independent coverage calculation.                                                                                                                                    |

Most first-projection SQL statements are expected per-record state and audit writes, not per-record relationship reads. The history scan, large registry reads and coverage aggregate are measured read costs. High query count alone did not justify rewriting these paths.

Normalized customer lookup still has its known scan. At about 5,001 customers its filter finished in approximately 1.446 / 2.274 ms in the two baseline EXPLAIN ANALYZE runs. No speculative index or normalization change was added.

Historical producer totals remain 15,100 SQL / 5,100 SELECTs across 5,000 tasks and 25 pages. Each record's firstOrCreate plus input-version write is intentional invalidation; the entire producer is not a synchronous HTTP operation. This run supplies no evidence that replacing these state/version writes with a bulk rewrite is worth the integrity/recovery risk.

### Exact targeted correction

[ResolveJneCategories.php:103](../../app/Actions/Reports/ResolveJneCategories.php#L103) previously compared stored category_evidence and recomputed evidence using strict PHP array identity. MySQL may reorder JSON object keys. Identical typed values then produced another version increment and CATEGORY audit record.

The new private orderedObjectKeys helper recursively orders **object keys only** before strict comparison. It preserves list order and scalar type, does not rewrite stored evidence, does not alter the existing review fingerprint function and does not delete earlier duplicate historical events.

[JneCategoryEvidenceReplayTest.php](../../tests/Feature/JneCategoryEvidenceReplayTest.php) reproduced the defect before correction: object-order and nested-order cases failed, while scalar/list-change cases passed. All four now pass. Actual MySQL repeated profiles eliminate the 10,000 replay writes; the native concurrent test also asserts second reconciliation adds no matching events or new manifest.

The helper adds small per-item PHP array normalization work, no additional query or lock. No batching of audit writes, transaction split, new index, cache or queue was introduced.

Larger proposals are **NOT IMPLEMENTED**: targeted bounded history reads/narrower selected fields need equivalence and representative MySQL 8.4 plans; write batching or changing lock/transaction scope requires a separate approved change with failure/replay tests. Retention, provenance and matching rules must remain intact.

### Terminal polling cost

M1–M5's actual Chromium observation saw three successful terminal-detail polls in 15,514.4091 ms. M6 measures the same report,awbs partial HTTP request through the real Laravel HTTP kernel against native MySQL, with current Inertia version, 50-row pagination and terminal COMPLETED/IMPORTED/PROJECTED data:

| Imported rows | SELECTs per request (three requests) | Driver SQL ms      | Kernel request ms     | Response bytes        |
| ------------- | ------------------------------------ | ------------------ | --------------------- | --------------------- |
| 100           | 3 / 3 / 3                            | 2.03 / 2.78 / 2.15 | 46.23 / 11.40 / 9.56  | 10592 / 10592 / 10592 |
| 1,000         | 3 / 3 / 3                            | 2.44 / 2.95 / 3.65 | 9.26 / 9.76 / 9.65    | 11757 / 11757 / 11757 |
| 5,000         | 3 / 3 / 3                            | 9.26 / 9.99 / 8.08 | 19.70 / 16.66 / 14.70 | 11762 / 11762 / 11762 |

These kernel timings exclude TCP/TLS and browser rendering. No live-tab population or host CPU budget was measured. The controller executes report lookup, page count and 50-row page SELECT. Its page query still selects full source rows before mapping response fields; representative wide-row cost is NOT TESTED. Current narrow-fixture cost does not justify changing the five-second polling policy and its ability to pick up recovery/review metadata. No polling change was made.

## M6.1 — concurrent processors and transaction scope

[PilotReportConcurrencyTest.php](../../tests/Feature/PilotReportConcurrencyTest.php) starts two separate PHP projector processes simultaneously against distinct reports containing the same AWBs/customer-day. Both source reports are already imported. This deliberately measures an intersecting workload, not disjoint-customer throughput or exactly the serial first-report fixture.

| AWBs per report | Pair wall ms | Worker durations ms   | Largest worker SQL call ms | Deadlocks / lock timeouts |
| --------------- | -----------: | --------------------- | -------------------------- | ------------------------- |
| 1,000           |     6,318.63 | 6,220.27 / 5,475.96   | 4,611.58 / 74.85           | 0 / 0                     |
| 5,000           |    46,658.53 | 35,257.28 / 46,507.09 | 1,569.15 / 28,230.02       | 0 / 0                     |

Raw evidence: [m6-concurrency.ndjson](evidence/m6-concurrency.ndjson). Counts are differences in native INNODB_METRICS lock_deadlocks/lock_timeouts, both zero before/after in these cases. Serial load row-lock wait counters also did not increase.

Read-only performance_schema.data_locks samples show the second worker waiting on the shared pickup_tasks primary-key row while the first holds it. At 5,000 AWBs the sample includes approximately 5,000 shipment primary record locks and 5,000 gap locks; these aggregate lock entries are not a count of distinct business records. Report rows, shipment/source/FK records also appear. The approximately 28-second blocked call is real contention in this fixture, not evidence of a deadlock.

Both jobs reach PROJECTED; N shipments and 2N observations remain; all current pointers select the newer report; reconciliation returns DONE twice with unchanged manifest IDs and no second matching-event additions. The two-process cases passed 30 assertions. One pair per size is not sufficient to infer production concurrent capacity, and the Windows child action harness does not enforce the deployment worker's 60-second job timeout.

Locks stay inside the existing report/customer-day transaction semantics. Do not increase report concurrency merely because the pair passed: same-customer work serialized, and slow waits consume timeout headroom. Target-host MySQL 8.4, actual report width/history, safe worker timeout/lease relationship and graceful restart need acceptance.

## M6.2 — operational reliability

### Queue, scheduler, cache and recovery

Read-only inspection of configured local MySQL 8.4.11 dust database:

- The first jobs snapshot was empty, compared with 63 reconciliation jobs/2 reservations in M1–M5. Later snapshots showed one unreserved job at 08:46:41 UTC, then 43 reconciliation jobs/2 reservations at 08:47:31 UTC, oldest 29 seconds and attempts at most 1. This is fresh scheduled work, not evidence of an expired/stuck lease. Historical per-job identities were not retained in the earlier aggregate, so the empty snapshot does not by itself prove each old job succeeded.
- Four local worker processes cover combined default/reconciliation/documents/deliveries, dedicated reconciliation, documents/deliveries and mobile-push queues. Their launch timestamps were 29 October 12:49 local; job-class limits remain import/reconciliation/delivery 60s and document render 75s. Local worker flags are 75s (mobile-push 60s), below configured database retry_after=90s.
- The shared cache is database-backed. Its inspected cache_locks table had zero rows; native tests verify cross-process uniqueness rather than inferring it from a configured package.
- schedule:list registers minute generation/report/reconciliation and five-minute reconciliation recovery with existing overlap guards. Existing scheduler stdout records DONE for report dispatch/reconciliation at 08:31/08:32 UTC and recovery at 08:30. This is observed **local execution**, not just registration.
- There is no demonstrated target-host alert delivery for stalled queues, failed jobs, lost scheduler heartbeat or report freshness. Existing reporting leases/NEEDS_ATTENTION and five-minute reconciliation recovery remain useful controls, not a complete monitoring system.
- PHP's Windows CLI has no pcntl timeout/signal handling. Actual target worker process supervision, exit/restart and timeout enforcement must be accepted; a CLI timeout flag alone is not proof on this host.

Current reconciliation snapshot: 846 rows, zero last_error, zero unevaluated input-version gaps; latest evaluation observed on 29 October. These are snapshots, not proof that every business state is DONE.

### Historical failures and attention outcomes

| Record                                                                             | Verified current status                                                                                                                                                                                    | Recovery requirement                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| failed_jobs #1, default, SyncJneCustomerMappings, 27 Oct 08:33:29 stored timestamp | PDOException / SQLSTATE[22001], data too long for customer_match_method. Serialized numeric runId=3; that run is now COMPLETED with last_id=upper_id=66247, affected_count=181, completed 27 Oct 08:37:03. | Historical failure remains evidence. No stranded mapping work established; do not replay the old failed job blindly. Original offending method value/current reproducer not supplied, so root-cause correction is NOT VERIFIED by this milestone. |
| failed_jobs #2, reconciliation, 28 Oct 13:49:21                                    | PDOException / SQLSTATE[40001], driver 1213 deadlock. Numeric taskId=741 now REVIEW, input_version=evaluated_input_version=25, no last_error; evaluated again on 29 Oct.                                   | Current derived evaluation recovered; business REVIEW still needs its existing authorized review workflow. Exhaustive deadlock elimination is not claimed from tested intersections.                                                              |
| report_jobs #633 and #717, created 27 Oct 06:54:40                                 | hybrid/combined NEEDS_ATTENTION; APEX_SOURCE_API; NOT_IMPORTED/NOT_PROJECTED; no active slot/lease; reviewed_by=6 on 27 Oct. Historical worker IDs instance-3 / instance-2.                                | Operator-owned attention outcomes, not active stuck leases. Both retain source artifacts and child SOURCE_SAVED parts. Inspect provider/source evidence before any separately authorized action. No automatic external retry performed.           |

Times above are stored application values; current database NOW and UTC_TIMESTAMP differ by seven hours, so server-local NOW was not used to fabricate exact report ages. The dates establish that these are retained 27/28 October records at a 29 October inspection.

Read-only local stream hashes verified source existence and SHA-256 equality for #633/634/635 and #717/718/719, without outputting report rows or secrets. These are two server-specific cycles, each with its manual/cashless pair; do not label them incomplete merely for having two children. Current code also supports an explicit four-source combined cycle.

Default Laravel database job reservations do not store a process/PID owner, so historical row-to-worker ownership cannot be reconstructed from the old aggregate. Report jobs separately retain their external worker identity and Admin review evidence. Failed jobs are visible through retained DB rows; no new alert/ownership policy was invented.

### Isolated failure drills

The extended [PostRemediationQueueRecoveryTest.php](../../tests/Feature/PostRemediationQueueRecoveryTest.php) and its child fixture exercise actual database queues/shared locks. Focused selection with historical recovery and operational lock-order tests: **13 passed, 127 assertions**, 60,351 ms.

1. Kill historical producer after 50 committed rows; expire only its isolated lease; restart workers and cover all 501 tasks in 200-ID pages. Duplicate dispatch coalesces and one customer-day reconciliation is queued. Exhausted job remains visible.
2. Kill CSV import after its first uncommitted bulk source insert; transaction rollback leaves no source rows; worker failure is recorded; explicit retry from the stored local CSV succeeds.
3. Kill projection after import committed and the first uncommitted shipment update; retain all 250 imported source rows, roll back shipments/observations, mark projection failure on expired lease, and explicitly requeue local processing. It finishes with exactly 250 sources/observations.
4. Existing barrier tests retain optimistic conflicts, authoritative POP/verification baselines, attachment uniqueness, replay and failed-finalization rollback.
5. Native concurrent processors reconcile twice without another manifest or matching events. Existing after-commit rollback/upper-bound/partial-page tests remain passing.

No default/reconciliation/document/delivery operational job was consumed by these drills. Document rendering and external delivery supervision on the target host are BLOCKED; existing local logic and stand-in tests do not certify SMTP/provider acceptance.

## M6.3 — release, source contract and backup acceptance

### Android

[android/app/build.gradle](../../android/app/build.gradle) has the existing production/HTTPS release-assets guard but no committed signingConfig. The only current app APK found under build outputs is app-debug.apk, approximately 45.5 MB, version configuration 1.2.0/code16 with development application ID. Prior emulator reports are historical evidence; they were not relabeled physical acceptance.

Command run offline with the installed cached Gradle 8.14.3/JDK21 and Android SDK:

    ./gradlew.bat verifyReleaseMobileAssets --offline --no-daemon --console=plain

Result: exit 1, expected guard rejection: production assets with an approved HTTPS origin required. **PASS for negative guard enforcement; FAIL for current release-asset readiness.** No dependency download, signing operation, release build, asset replacement, install or distribution occurred. adb devices -l returned an empty device list.

Backend MobileAuthenticationTest covers 24-hour hashed device tokens, same-installation replacement, revocation/expiry, role separation and no web-session fallback. Mobile client suites cover encrypted/account-scoped draft contracts, immutable uncertain attempts, camera listener lifecycle, scanner persistence and network recovery. Camera/gallery/Bluetooth/OEM behavior, process death and signed upgrade with existing drafts remain BLOCKED without a physical release-device run.

[MobileTokenController.php:26](../../app/Http/Controllers/MobileTokenController.php#L26), native SecureSessionStore/MobileLocalStore and existing offline policy remain unchanged. No token, local-data retention or background retry policy changed.

### Hybrid/APEX

The [business decision register](../jne-reconciliation/business-rules.md) and [UAT plan](../jne-reconciliation/uat-plan.md) remain the authoritative source of unaccepted B1–B8 semantics. Technical code supports:

- Four distinguishable Roberto/Nuralamt manual/cashless sources, or the explicitly configured two-part server-specific cycle.
- Exact required-source/date matching and checksum validation before combination; AWB union deduplication and canonical original-source provenance through APEX.
- Partial/failure/empty distinctions; no invented completion timer or count threshold.
- Shared JNE account distinct from customer identity; verified codes/aliases/Sertim separate from pickup attribution; conflicts and manual decisions retained.
- Late report reconciliation independent of handover reopening; chronological current tracking plus retained older snapshots.
- Operational 05:00–04:59 Asia/Jakarta buckets distinct from source/report calendar dates.

Current configured database has 60 report profiles, all disabled: 57 apex/apex, one apex/unresolved, two hybrid/combined. Latest completed report remains 27 October 07:43:36. With all profiles disabled, that timestamp alone is not a freshness incident. Approved source schedule/policy and actual operational samples are required before assigning freshness failure thresholds.

Local evidence/category/category-marker flags are true, but no active verified source-contract row exists. This does not make the flags an approval or prove current markers match every provider report. Owner/operator-approved columns, literal categories, required sources, date semantics, representative checksums and completeness sign-off remain **BLOCKED**. No live Hybrid/APEX session was started or external submission repeated.

### Backup and receipt email

No repository backup configuration, approved database/files backup artifact or target-host restore record was supplied/found in the scoped search. A backup service may exist outside this repository; its existence and restore quality are **BLOCKED**, not asserted absent. The available disposable server cannot establish restore readiness without an approved artifact.

Minimum restore evidence: approved backup identity/checksum and snapshot time, database plus private evidence/report-file scope, restore into a fresh isolated environment, representative record/FK/uniqueness and evidence-file checksum validation, observed completion/recovery results and responsible operator sign-off. No retention duration, RPO/RTO or backup schedule is invented here. Never restore over the operational database.

TA-09 remains deferred. Local receipt_channel is unset and mail.default=log. No SMTP was enabled, no receipt sender introduced and no uncertain external send retried. Deployed email configuration remains unverified.

## Quality verification, commands and preservation

Full isolated backend suite before the later concurrent edits: **PASS — 1,102 total; 1,092 passed, 10 skipped, zero failures, 9,434 assertions, 402,384 ms.** The skips are the existing five feature/device cases plus three opt-in load datasets and two opt-in concurrent-load datasets. Both opt-in groups were executed separately and passed; physical Android was not enabled. Skips are not passes.

M6 snapshot gates: PHPStan zero errors; both TypeScript projects pass; 32 Vitest files/247 tests pass (7.06 s); six Node suites/112 tests pass (61,455.1461 ms). Scoped Pint passes for the seven PHP files changed/new in M6. The broad formatting gate initially saw 763 files because the new M6 manifest was not yet formatted; the final count is back to **762 pre-existing files** after formatting the new documentation. Existing unrelated formatting files are not bulk-changed.

Exact command families, from S:/2026/dust unless stated otherwise:

- composer show laravel/framework; composer show inertiajs/inertia-laravel; PHP version/memory_limit, package/config/source/AGENTS/audit reads with rg/Get-Content. .ai/rules is absent.
- HARDENING_MYSQL_PORT=54182 VALIDATION_LOAD=1 M6_PROFILE_TAG=baseline-r1 / baseline-r2 / after-r1 / after-r3; php -d extension=pdo_sqlite -d extension=sqlite3 vendor/bin/pest tests/Feature/PostRemediationPerformanceTest.php --compact --do-not-cache-result. Each tag run is a separate process.
- Same runner with JneCategoryEvidenceReplayTest.php, JneConfiguredReconciliationTest.php, JneMonitoringTest.php and PostRemediationOperationalFlowTest.php: 37 passed / 275 assertions after the production correction.
- PILOT_CONCURRENCY=1 HARDENING_MYSQL_PORT=54182 with PilotReportConcurrencyTest.php: 2 passed / 30 assertions / 116,075 ms including setup and reconciliation.
- Same runner with PostRemediationQueueRecoveryTest.php, HistoricalReconciliationQueueTest.php and OperationalLockOrderTest.php: 13 passed / 127 assertions.
- Final full Pest runner uses process-only DB_HOST=127.0.0.1, DB_PORT=54182, DB_USERNAME=root, empty password/URL, HARDENING_MYSQL_PORT=54182; VALIDATION_LOAD/PILOT_CONCURRENCY/M6_PROFILE_TAG unset. OPENSSL_CONF points to installed PHP extras/ssl/openssl.cnf. SQLite extensions enabled per process; no .env changed.
- php vendor/bin/phpstan analyse --no-progress --error-format=json; npm run types:check.
- node node_modules/vitest/vitest.mjs run resources/js resources/mobile/src --config vite.mobile.config.ts --mode development --root .
- In workers/jne-report: node --test test/worker.test.mjs test/hybrid-apex.test.mjs test/hybrid-jobs.test.mjs test/hybrid.test.mjs test/cashless-entry.test.mjs test/cashless-entry-api.test.mjs.
- php vendor/bin/pint with only ResolveJneCategories.php and the six changed/new PHP test/child-fixture paths --format agent. --dirty would reformat unrelated existing work and was not used.
- npm run check; scoped formatter for new M6 documentation only; no broad auto-fix.
- php artisan config:show for nonsecret queue/cache/timeouts/receipt/mail/evidence flags; schedule:list --no-interaction.
- Boost database-schema/query for jobs/failed jobs/report statuses, numeric task/run correlations, mapping progress, local source-contract/profile configuration and cache-lock counts. One read-only query used reserved alias sqlstate and returned 1064; corrected to state_code. No mutation resulted.
- Read-only php artisan tinker --execute stream/hash check over the six known report-source artifacts; no CSV cells, credential or token output. Existing commands/tests did not provide this specific operational artifact inspection.
- Read-only process inventory, restricted scheduler completion-log inspection, adb devices -l and offline release guard. No operational worker restart, queue consumption or live provider call.
- git status/HEAD and SHA-256 preservation comparison against [m6-source-before.json](evidence/m6-source-before.json), covering 3,199 pre-existing files.

Production code changed **by M6** only [ResolveJneCategories.php](../../app/Actions/Reports/ResolveJneCategories.php). Existing tests extended: PostRemediationPerformanceTest.php (fingerprints/outer timing/poll measurement), PostRemediationQueueRecoveryTest.php and validation-queue-worker.php (interrupted projection). New tests: JneCategoryEvidenceReplayTest.php, PilotReportConcurrencyTest.php and pilot-report-worker.php. New documentation/evidence is under docs/technical-audit/. No pre-existing audit/M1–M5 report was rewritten.

The preservation comparison found 3,190 of 3,199 baseline files unchanged, nine changed and zero missing. Four changed baseline files are the M6-owned production/test edits listed above. Five others changed concurrently after the full suite: app/Actions/Pickup/FinalizePickup.php, ManageCashlessEntryBatches.php, RecordCashlessHandover.php, app/Console/Commands/CashlessEntries.php and tests/Feature/PickupCashlessCaptureTest.php (observed write times 15:43–15:44 local). M6 did not author, format, revert or overwrite those five files. The existing HEAD remains unchanged.

A focused rerun on the later tree passed **115 tests / 761 assertions**, including the M6 correction, connected flow and affected cashless capture/batch/handover suites. PHPStan on that later tree reports **one error** at ManageCashlessEntryBatches.php:35: enqueue expects list<string>, but the new pluck call is inferred as array<int,mixed>. This belongs to the concurrent change and was left untouched. The earlier whole-suite/zero-error PHPStan results must not be presented as certification of that later tree. A stable-tree full rerun is required after its owner completes the change.

The disposable MySQL 8.0.30 server was shut down after all native checks; only system databases remained, and its retained temporary data directory was not deleted. Operational MySQL 8.4.11 and existing workers were not restarted or modified. No commit, push, deployment, dependency/schema/.env change or receipt-email activation was made by M6.

## Minimum actions before pilot activation

1. Obtain an approved pilot HTTPS server/origin and signing/application identity, build the production assets and signed APK, and record release/upgrade/rollback ownership. Complete physical-device pickup/handover, encrypted-draft recovery, camera/gallery/scanner, process-death and interrupted-network acceptance.
2. Provide approved representative Hybrid/APEX source samples and B1–B8 sign-off for the chosen pilot scope. Verify source identity, code/category columns, required-source completeness and date semantics without inventing thresholds.
3. Supply an approved database/private-evidence backup and perform an isolated restore drill with recorded integrity/checksum results.
4. Demonstrate target-host queue/cache/scheduler supervision, actual timeout/lease enforcement, graceful code adoption/restart, failed-job/UNKNOWN/NEEDS_ATTENTION ownership and alert delivery. The local backlog is not a reason to blindly retry historical failures.
5. Complete the concurrent cashless change, resolve its PHPStan error and the pre-existing repository formatting gate in their owning changes, then run a stable-tree full suite and target MySQL 8.4 CI/acceptance. Retain the focused replay correction and regression protections. Do not enable receipt SMTP as part of pilot activation without its separate acceptance.

These are missing controls/evidence, not authorization to deploy or change infrastructure. The modular monolith, existing matching rules, finalized POP/physical verification, historical evidence and uncertain-action holds should remain. Larger history/transaction/write optimizations require their own approved, measured change.
