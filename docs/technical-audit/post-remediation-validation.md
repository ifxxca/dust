# Post-remediation validation — M1–M5

Date: 29 October 2026. Repository: S:/2026/dust. HEAD: 08c2c075fafffde5b675ce5dd8da54a4e21db0ef.
Baseline: existing audit and remediation-results.md, followed by verification against current source. These earlier reports remain historical records.

## Executive summary

The focused remediation survives connected operational, native MySQL volume, forced-worker-interruption and browser checks. A mobile monitoring placement defect was corrected by moving existing secondary summaries below the working table, putting search first and reducing filter spacing. Browser fixtures were brought into line with the current inline/nested disclosures without weakening their original viewport, role or evidence assertions. No backend business implementation, schema, dependency, credentials, retention policy or external-action retry policy changed in this validation.

**The entire quality pipeline is not green.** The final full backend suite passed: 1,087 passed, 8 skipped, no failures, 9,403 assertions, 392,666 ms. The initial and final repository formatting checks both reported 762 files; this pre-existing broad formatting problem was not bulk-fixed. Production readiness cannot be established from a local workspace.

A limited pilot is **BLOCKED pending target-environment operational acceptance**, rather than rejected on the basis of a new demonstrated corruption defect. Obtain queue/restart and scheduler evidence, a restore drill, approved source-contract samples and release/physical-device acceptance. Keep SMTP receipts disabled until the separate uncertainty/recovery prerequisite is satisfied.

## Milestones

| Milestone                 | Status  | Evidence and limit                                                                                                                                                                                                                   |
| ------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1 — quality gates        | FAIL    | Full backend regression, browser, PHPStan, both TypeScript projects, 247 client tests and 112 worker tests pass. Unchanged 762-file formatting failure prevents a green overall gate.                                                |
| M2 — operational flow     | PASS    | New connected HTTP/action flow: 1 test, 32 assertions. Related scenario selection: 171 tests, 1,039 assertions. Synthetic/local only.                                                                                                |
| M3 — measurement          | PASS    | Native disposable MySQL 8.0.30 at 100/1,000/5,000 rows; 3 load cases/30 assertions and 9 query-growth cases/36 assertions. Measurement milestone passes; production capacity is NOT TESTED.                                          |
| M4 — recovery/concurrency | PASS    | Two real database-queue interruption/restart cases, 29 assertions; existing barrier-controlled MySQL lock, replay, rollback and worker-uncertainty tests included in full regression. Distributed deployment behavior is NOT TESTED. |
| M5 — pilot readiness      | BLOCKED | Local read-only configuration/backlog inventory completed. Deployed consumers, alerts, backup restore and physical release-device evidence unavailable.                                                                              |

## M1 — regression results

| Check                                      | Result                                                                                                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Initial full backend run                   | FAIL: 1,089 total; 1,083 passed, 1 failed, 5 skipped; 9,336 assertions; 336,053 ms. Sole failure: retained browser visibility acceptance.                                |
| Final full backend run                     | PASS: 1,095 total; 1,087 passed, 8 skipped; 9,403 assertions; 392,666 ms; no failures. Includes native MySQL concurrency and real worker interruption.                   |
| Browser after targeted correction          | PASS: 1 test, 7 assertions; 19,193 ms before adding the polling measurement. Original search y < 400 and first AWB y < 844 retained.                                     |
| PHPStan                                    | PASS: zero errors; final rerun.                                                                                                                                          |
| Web and mobile TypeScript                  | PASS: tsc --noEmit and tsc --noEmit -p tsconfig.mobile.json.                                                                                                             |
| Vitest                                     | PASS: 32 files, 247 tests; final rerun 7.33 seconds.                                                                                                                     |
| Node worker fixtures                       | PASS: six existing suites, 112 tests, zero skipped; 56,793.1749 ms. Includes local HTTP/browser stand-ins, uncertain acknowledgment and duplicate submission protection. |
| Pint                                       | PASS: only the six PHP files touched in this validation.                                                                                                                 |
| Production web build                       | PASS: existing installed dependencies; final build 11.06 seconds. Optional font fallback warning remains; no package installed.                                          |
| Broad npm run check                        | FAIL: initial and final 762 formatting files; unchanged. Scoped changed-file lint/format passes; no unrelated auto-format.                                               |
| Remote CI / Android device instrumentation | NOT TESTED in this validation. CI explicitly includes both client trees and worker fixtures; local execution is not remote CI evidence.                                  |

SQLite tests use in-memory or explicitly created temporary file databases. The full runner's existing MySQL create/drop tests were redirected only to the independently started disposable server on 127.0.0.1:54182. New native tests verify its dust-hardening-mysql- data-directory marker and own randomized database prefixes. No operational database was migrated or reset.

The eight full-run skips comprise the same five baseline feature/device skips plus three opt-in load datasets. The latter were executed separately on MySQL and passed; physical Android smoke was intentionally not enabled. Disabled Fortify feature tests remain skipped by the existing feature guard. Skips are not counted as passes.

### Confirmed defect and minimal fixes

The mobile search was initially y=637 at 390px width, failing the retained y<400 assertion. Existing summary/identity/metrics content preceded the working area. The final focused browser output measured search y=273 / first AWB y=841 at 390px, and y=181 / 584 at 1280px. Touch-control sizes, filtering, authorization, correction workflow and table data remain intact. A first row beginning at 841 is only partial first-viewport visibility; it is not proof the whole row fits.

Exact changed application files:

- [jne-monitoring.tsx](../../resources/js/pages/jne-monitoring.tsx): filters precede the table; existing summary, identity and metrics widgets follow the table.
- [jne-shipment-filters.tsx](../../resources/js/components/jne-shipment-filters.tsx): search precedes category toggles in DOM/keyboard order; smaller vertical gaps, unchanged control minimum heights.
- [sertim-ui-flow.mjs](../../workers/jne-report/test/sertim-ui-flow.mjs): current accessible search label, inline AWB expansion, nested evidence/matching disclosures and current table region name. Evidence and accessibility assertions retained; added measured position messages and terminal polling observation.

The UI changes follow the existing task-first policy and existing components; no new dashboard or visual design system was introduced. Existing JSX/client tests and real Chromium actions cover these changes. Guidance consulted: [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md).

Additional changed test files:

- [HandoverQueryGrowthTest.php](../../tests/Feature/HandoverQueryGrowthTest.php): optional engine/count/time/memory metrics; existing six-SELECT budget preserved.
- [PickupEligibilityQueryTest.php](../../tests/Feature/PickupEligibilityQueryTest.php): opt-in larger fixtures and batch-size-derived budget; normal 1/50/500 cases unchanged.
- New [PostRemediationOperationalFlowTest.php](../../tests/Feature/PostRemediationOperationalFlowTest.php).
- New [PostRemediationPerformanceTest.php](../../tests/Feature/PostRemediationPerformanceTest.php).
- New [PostRemediationQueueRecoveryTest.php](../../tests/Feature/PostRemediationQueueRecoveryTest.php) and its guarded [validation-queue-worker.php](../../tests/Feature/validation-queue-worker.php) child-process fixture.

Initial new-test failures were fixture defects: a generic collection used modelKeys(), the child importer initially received the configured disk path instead of Storage::fake's path, and failed-job storage initially referenced SQLite instead of the dedicated MySQL database. Those were corrected in the fixtures. They are not presented as production defects.

## M2 — end-to-end scenario matrix

All PASS entries mean automated synthetic regression evidence, not live JNE acceptance. The 171-case selection overlaps the full suite and is not an additional independent test count.

| #   | Scenario                                                                                                                                       | Status | Verifiable coverage                                                                                                                                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Customer → assignment → execution/visit → finalized POP → cashless evidence → verified/closed handover → late import → matching/reconciliation | PASS   | PostRemediationOperationalFlowTest: two customers/tasks, shared session, eight distinct AWBs, category baseline, closed-record attribute equality.                                                                   |
| 2   | Exact identity while multiple customers share a JNE account                                                                                    | PASS   | Same connected test uses SHARED_VALIDATION and deliberately misleading shipper names; each customer's four AWBs remain correctly attributed. JneMonitoringTest:128 rejects missing/duplicate/wrong-customer guesses. |
| 3   | Customer-code typo and alias review                                                                                                            | PASS   | PickupCodeDateMatchingTest:64; PickupAwbReviewTest:67 preserves raw source and excludes another claimant.                                                                                                            |
| 4   | Duplicate AWBs and repeated report import/projection                                                                                           | PASS   | JneMonitoringTest:45,75; PickupProcessingAutomationTest:40; new connected/load tests assert one shipment, distinct historical observations and unchanged manifest counts.                                            |
| 5   | Conflicting identity, category or retained pickup attribution                                                                                  | PASS   | JneConfiguredReconciliationTest:79,87; JneMonitoringTest:247; SertimCashlessTest:75,217.                                                                                                                             |
| 6   | Empty or partial reports do not invent completeness                                                                                            | PASS   | PickupProcessingAutomationTest:40,124,139; category/source attestation remains separate from equal counts.                                                                                                           |
| 7   | Late data reconciles after closure without changing POP/retail history                                                                         | PASS   | New connected test advances past Jakarta midnight, imports twice and reconciles twice; SertimCashlessTest:147.                                                                                                       |
| 8   | Older snapshots remain historical and cannot replace newer current state                                                                       | PASS   | JneMonitoringTest:62,237; new load test replays first report after second and retains 2N observations.                                                                                                               |
| 9   | Operational 04:59/05:00 boundary versus source entry date                                                                                      | PASS   | CustomerPickupDayReconciliationTest:105; PickupCodeDateMatchingTest:74; PickupAwbReviewTest:53,98. UTC import time is not substituted for a missing entry date (JneMonitoringTest:201).                              |
| 10  | Closed/finalized records permit only authorized Admin evidence corrections                                                                     | PASS   | SertimCashlessTest:98,113,179; real Chromium exercises staff exclusion, correction reason, before/after audit, unchanged CLOSED session and POP value.                                                               |
| 11  | POP replay, AWB uniqueness and partial-write rollback                                                                                          | PASS   | PickupCashlessCaptureTest:24,56,104; CashlessHandoverTest:51,68; OperationalLockOrderTest finalization replay/attachment uniqueness.                                                                                 |
| 12  | Customer-day/category reconciliation and multiple books                                                                                        | PASS   | CustomerPickupDayReconciliationTest:43,72; PickupProcessingAutomationTest:75. A quantity/QTY value is not an AWB count.                                                                                              |
| 13  | Uncertain external outcome and network acknowledgment loss                                                                                     | PASS   | Existing 112 Node fixture cases and mobile client suites retain uncertainty holds; no new automatic send/retry added. Live JNE is NOT TESTED.                                                                        |
| 14  | Mobile offline drafts/account isolation/recovery                                                                                               | PASS   | Existing scoped mobile Vitest suites included in 247 cases and backend MobileExecutionTest. Physical process-death/camera/Bluetooth/OEM acceptance is NOT TESTED in this run.                                        |
| 15  | Monitoring and report evidence visible through actual UI                                                                                       | PASS   | SertimCashlessBrowserTest and updated fixture retain source row/report/status evidence, current nested matching audit, desktop/mobile overflow and primary-task placement assertions.                                |

The connected test explicitly checks persisted finalized proof attributes and session version after replay/late import. It uses Http::preventStrayRequests, fake storage and queues. No SMTP, FCM, Hybrid scrape or JNE Process is invoked.

## M3 — measured performance

Machine-readable values and exact lookup SQL: [post-validation-performance.json](evidence/post-validation-performance.json).
One serial run per fixture on native MySQL 8.0.30; no repeated percentile distribution, representative wide report or production row-count extrapolation. Fixture generation/migration is outside each measured action.

Method: DB::listen counts executed SQL and SELECTs; hrtime measures action duration; memory_reset_peak_usage/get_peak_usage(true) records allocated PHP peak. Transaction begin/commit listeners sum transaction durations, including nested scopes, so sums can exceed wall time. Memory includes framework and retained fixture/test state and is **not RSS or incremental action memory**. No live HTTP latency, concurrent throughput or production worker throughput was measured.

| Phase                         | AWBs per report | SELECTs / all SQL | Duration ms | Peak allocated MiB | Transaction sum ms |
| ----------------------------- | --------------: | ----------------: | ----------: | -----------------: | -----------------: |
| Import first CSV              |             100 |             4 / 6 |       54.52 |                 56 |              52.34 |
| Import first CSV              |           1,000 |             3 / 8 |      335.88 |                 64 |             335.75 |
| Import first CSV              |           5,000 |            3 / 24 |    1,445.95 |                 92 |           1,445.82 |
| First projection              |             100 |          38 / 541 |      731.35 |                 58 |             726.78 |
| First projection              |           1,000 |        43 / 5,052 |    5,971.92 |                 74 |           5,971.70 |
| First projection              |           5,000 |       83 / 25,124 |   31,032.02 |                134 |          31,031.79 |
| Second projection, same AWBs  |             100 |          37 / 340 |      377.04 |                 58 |             376.85 |
| Second projection, same AWBs  |           1,000 |        47 / 3,056 |    4,020.08 |                 80 |           4,019.91 |
| Second projection, same AWBs  |           5,000 |      103 / 15,144 |   23,686.45 |                170 |          23,686.14 |
| Older projection replay       |             100 |          37 / 238 |      285.15 |                 58 |             284.99 |
| Older projection replay       |           1,000 |        47 / 2,051 |    3,044.47 |                 82 |           3,044.28 |
| Older projection replay       |           5,000 |      103 / 10,123 |   20,738.33 |                172 |          20,737.95 |
| Customer-day reconciliation   |             100 |          96 / 308 |      422.21 |                 58 |             765.41 |
| Customer-day reconciliation   |           1,000 |        94 / 2,109 |    4,330.17 |                 88 |           8,150.33 |
| Customer-day reconciliation   |           5,000 |      102 / 10,133 |   26,636.10 |                212 |          50,715.24 |
| All historical producer pages |       100 tasks |         104 / 304 |      172.63 |                 60 |                  0 |
| All historical producer pages |     1,000 tasks |     1,020 / 3,020 |    1,850.55 |                 88 |                  0 |
| All historical producer pages |     5,000 tasks |    5,100 / 15,100 |    9,969.62 |                212 |                  0 |

Each report contains N distinct manual-category AWBs, repeated across two reports; QTY=3 is deliberately not multiplied into AWB counts. Assertions require N shipments, 2N source rows, 2N observations, N manifest items and DONE reconciliation. The older replay does not add observations. Historical invalidation uses a separate customer's N finalized tasks in 200-ID pages; the table totals all pages, not one interactive request or real queue throughput.

First projection's pending-key lookup was one SELECT at every size. Remaining SQL includes per-record writes and history work; absence of that N+1 does not mean all work is constant. At 5,000 rows the maximum driver-reported query durations were 1,111.02 ms for first projection and 2,243.29 ms for reconciliation. A subsequent performance-schema digest probe did not attribute these prepared statements reliably; the slow SQL fingerprint is **NOT TESTED**. Do not infer a missing index or change semantics from these numbers alone. Further profiling is justified before increasing report concurrency.

### Targeted query-growth protection

| Operation                     |                     Size |                Addressed SELECTs |       All SQL |        Action duration ms |
| ----------------------------- | -----------------------: | -------------------------------: | ------------: | ------------------------: |
| Handover create               |       1 / 10 / 100 tasks |       6 / 6 / 6 business SELECTs | 12 / 18 / 108 |       9.48 / 7.93 / 47.60 |
| Handover amend                |       1 / 10 / 100 tasks |       6 / 6 / 6 business SELECTs |  9 / 18 / 108 |       6.19 / 8.80 / 78.39 |
| Cross-day pending eligibility | 100 / 1,000 / 5,000 AWBs | 2 / 3 / 11 pending-table SELECTs |  21 / 21 / 29 | 79.31 / 589.09 / 3,121.35 |

Pending lookup budget is 1 + ceil(N/500), rather than an existence read per shipment. Total SELECTs for this reconciliation fixture were 18 / 18 / 26. Handover budget is business-table reads inside actions, not HTTP validation/resource overhead; the first create also included cold metadata queries. The actual API permits at most 100 selected tasks. Invalid 1,000/5,000-task handovers were not benchmarked. No blanket relationship eager-loading was added.

The original pre-remediation code was not restored over the dirty working tree. Thus this validation supplies post-remediation growth protection, not a fabricated same-machine before/after benchmark. Previous remediation's SQLite/mixed-category numbers are not equivalent to this MySQL/manual-category fixture.

| Metric                                                    | Before this validation                              | After                                                   | Result                                           |
| --------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------ |
| Search / first AWB at 390px                               | Search 637; initial later first-row measurement 861 | 273 / 841                                               | Retained browser placement assertions pass       |
| Addressed handover / pending SELECT growth                | Remediation already present                         | 6 reads through 100; pending bounded by 500-key batches | Verified, no backend rewrite                     |
| Native import/projection duration and PHP allocation      | Not measured with equivalent fixture                | Table above                                             | Baseline established; not a before/after speedup |
| Real endpoint response time / RSS / production throughput | Not measured                                        | Not measured                                            | Remains required for stronger capacity claims    |

### Customer-code plan and locks

At 101 / 1,001 / 5,001 customer rows, EXPLAIN ANALYZE of the actual normalized lookup shape showed a table scan; filter completion was approximately 0.066 / 0.333 / 1.628 ms. Full code-resolution actions used 7 SELECTs and took 15.31 / 87.53 / 550 ms for 100 / 1,000 / 5,000 source records. The table scan is real, but does not explain all resolver cost. No normalization change or index migration is justified solely by this scan's small observed cost.

Global Innodb_row_lock_waits and Innodb_row_lock_time did not increase during each serial load case (existing values 38 and 526 ms). Innodb_deadlocks was not returned by that status query; zero deadlocks is not claimed from it. Controlled concurrent intersections are assessed separately below.

### Terminal report polling

The detail source retains usePoll(5000, {only: ['report','awbs']}) even for imported/projected terminal reports. The final real Chromium run observed **three HTTP 200 partial responses in 15,514.4091 ms**, each requesting report,awbs, for a COMPLETED/IMPORTED/PROJECTED fixture. This confirms foreground terminal polling; it does not measure avoidable database cost or real tab population. No polling behavior was changed: reviewed/recovery metadata can still change, and one local tab does not establish deployment cost. Exact browser measurements are retained in evidence/post-validation-checks.json.

## M4 — queue, cache locks and failure recovery

[PostRemediationQueueRecoveryTest.php](../../tests/Feature/PostRemediationQueueRecoveryTest.php) uses actual Laravel database queues, native MySQL cache locks and separate PHP processes. It is not Queue::fake coverage.

- Three identical historical dispatch attempts produce one pending unique job. The child is killed after 50 committed reconciliation-state inserts. The test expires only its own reserved lease, restarts workers and processes the remaining 200-task pages. All 501 records are eventually invalidated; shared customer-day reconciliation coalesces to one queued job. An exhausted producer is retained in failed_jobs.
- The import child is killed after its first source-row INSERT inside the transaction. No imported source rows commit. On lease expiry the single-attempt import records FAILED and a failed job; explicit requeue of the already-downloaded local CSV completes import/projection with 250 source rows and 250 observations. This is **not** an automatic external scrape or shipment submission retry.
- Existing HistoricalReconciliationQueueTest:69,90,113,128 covers after-commit rollback, interrupted pages, upper-bound capture and duplicate-page recovery.
- OperationalLockOrderTest tests three native two-process barriers: POP finalization intersection, POP correction and handover verification/correction. It retains optimistic conflict outcomes, proof/attachment uniqueness, replay and failed-finalization rollback.
- The 112 Node fixtures retain local submission versus final external processing distinctions, lost acknowledgment holds and no blind external replay. ReportPipelineDiagnosticsTest verifies safe failure context and no exception-message/credential leakage.

Limits: worker termination and database-queue lease expiry are controlled fixtures, not deployment rolling-restart proof. Redis/Cloud/distributed cache, queue publication loss between commit and dispatch, and every production contention pattern are NOT TESTED. Failed producer recovery still requires operational visibility; no new outbox or automatic external retry was introduced.

## M5 — non-destructive operational inventory

Read-only snapshot from the existing configured database; not evidence from a verified production deployment:

| Control                      | Local evidence                                                                                                                            | Status / remaining evidence                                                                                                                                |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Queue/cache                  | queue.default=database; cache.default=database. 63 reconciliation jobs, 2 reserved; failed_jobs=2.                                        | PASS inventory; consumer health/backlog age alert/restart drill BLOCKED. No jobs consumed from this database.                                              |
| Report outcomes              | QUEUED=0; UNKNOWN=0; NEEDS_ATTENTION=2, oldest created 2026-10-27 06:54:40. Latest completed_at 2026-10-27 07:43:36, stored DB timestamp. | PASS inventory; investigate two review items. No new recovery policy inferred from zero queued work.                                                       |
| Scheduler                    | schedule:list registers minute pickup generation, report dispatch and reconciliation, plus five-minute reconciliation recovery.           | PASS registration; actual heartbeat/failure alert delivery BLOCKED.                                                                                        |
| Report freshness             | Timestamp queried without account/report contents.                                                                                        | BLOCKED freshness acceptance; timezone/source schedule/approved policy required, no invented threshold.                                                    |
| POP receipt email            | pickup.receipt_channel unset; mail.default=log.                                                                                           | PASS local disabled channel; deployed configuration unknown. SMTP stale/uncertain sender recovery NOT TESTED; do not enable implicitly.                    |
| Backup/restore               | No deployed backup or restore-drill artifact supplied.                                                                                    | BLOCKED. Restore disposable copy plus evidence/files; do not test destructive restoration on operational DB.                                               |
| Android release              | Prior APKs/emulator reports exist; mobile TS/client tests pass now.                                                                       | Physical release-device, camera/scanner, process-death/network and target-server acceptance NOT TESTED now. Debug APK existence is not release acceptance. |
| Operational source contracts | Existing audit/UAT docs describe disabled/verified-contract gates and approved evidence needs.                                            | Live Hybrid/APEX/report semantics and four-source completeness BLOCKED without approved samples; no real scraping performed.                               |

The backlog counts are observations, not a diagnosis that workers are stranded. No reserved job was cleared, resubmitted or retried. Earlier emulator documentation is acknowledged, not counted as a fresh device test.

## Commands and reproducibility

All commands ran from S:/2026/dust unless noted. Version checks, audit/docs/AGENTS reads and source inspection used composer show, package.json, rg and Get-Content. .ai/rules is absent. Skill guidance for Laravel, testing, Postman simulation and scoped UI work was read; existing loopback fixtures were sufficient and no Postman workspace or published mock was created.

Process-only environment for isolated full/native tests: DB_HOST=127.0.0.1, DB_PORT=54182, DB_USERNAME=root, DB_PASSWORD empty, DB_URL empty; HARDENING_MYSQL_PORT=54182. OPENSSL_CONF points at the installed PHP extras/ssl/openssl.cnf for synthetic key fixtures. These are not .env changes.

- php -d extension=pdo_sqlite -d extension=sqlite3 vendor/bin/pest --compact --do-not-cache-result
- Same runner with tests/Feature/PostRemediationOperationalFlowTest.php and the twelve mapped scenario files: 171 passes.
- VALIDATION_LOAD=1 HARDENING_MYSQL_PORT=54182 with tests/Feature/PostRemediationPerformanceTest.php: 3 passes, 30 assertions, 182,015 ms.
- Dedicated hardening_metrics_20261029 database on port 54182; HARDENING_METRICS=1 VALIDATION_LOAD=1, run HandoverQueryGrowthTest.php and PickupEligibilityQueryTest.php: 9 passes, 36 assertions, 24,580 ms.
- Same runner with PostRemediationQueueRecoveryTest.php: final focused 2 passes, 29 assertions, 27,133 ms.
- Same runner with SertimCashlessBrowserTest.php: final full result includes updated fixture/poll measurement.
- php vendor/bin/phpstan analyse --no-progress --error-format=json
- npm run types:check
- node node_modules/vitest/vitest.mjs run resources/js resources/mobile/src --config vite.mobile.config.ts --mode development --root .
- In workers/jne-report: node --test test/worker.test.mjs test/hybrid-apex.test.mjs test/hybrid-jobs.test.mjs test/hybrid.test.mjs test/cashless-entry.test.mjs test/cashless-entry-api.test.mjs
- php vendor/bin/pint plus the six changed/new PHP paths --format agent. Intentionally scoped instead of --dirty because --dirty also includes unrelated pre-existing work.
- node node_modules/vite-plus/bin/vp fmt plus the three changed TSX/MJS paths and new validation documentation; no global auto-fix.
- npm run build; npm run check.
- php artisan config:show for pickup.receipt_channel, queue.default, cache.default and mail.default; php artisan schedule:list --no-interaction; route/source inspection.
- Boost database-query: aggregate report statuses/freshness, jobs by queue/reservation and failed_jobs count. Read-only; no credential/report contents printed.
- git status --short, HEAD and SHA-256 preservation comparison.

Final combined changed-source/document check passed formatting for all seven TSX/MJS/Markdown/JSON files and JavaScript lint for the three applicable files. All 14 Markdown links resolved (including the external guideline link, checked separately). A prior documentation-only vp check invocation reported no JavaScript files to lint after formatting passed; the combined invocation supplies applicable JavaScript paths. This runner-scope error was not an application lint defect.

## Preservation, outstanding risks and decision

The pre-validation 3,191-file SHA-256 manifest is [post-validation-source-before.json](evidence/post-validation-source-before.json). Final comparison verified 3,186 unchanged files, exactly the five listed pre-existing source/test files changed, and zero missing files. Four new PHP fixture/test files and this report/evidence were added. The working tree already contained extensive unrelated work (356 porcelain entries at the final snapshot); no unrelated file was rewritten. HEAD is unchanged; no commits/push/deploy, dependency/schema/.env edits or real external operations. Ignored build/browser outputs are local verification artifacts. The dedicated metrics database was removed and the disposable MySQL server shut down after all tests; process and listening-port checks confirm shutdown. Its temporary data directory was retained; a prior automatic approval review rejected recursive deletion, so no alternative deletion route was attempted. Final check and preservation details are in [post-validation-checks.json](evidence/post-validation-checks.json).

The architecture remains adequate for the tested functional scenarios, with no evidence supporting a rewrite. Measured 5,000-row projection/reconciliation transactions and evidence growth warrant representative profiling before increasing concurrency or report sizes. Do not remove history, replace matching rules, stream imports, change normalization or suppress polling simply to lower synthetic numbers.

Smallest next actions:

1. Resolve the unrelated repository formatting gate in its owning change; rerun remote CI against the target MySQL version (local 8.0.30 differs from CI service 8.4).
2. Inspect the two NEEDS_ATTENTION records and demonstrate target consumers, scheduler heartbeat, safe restart and failed-job visibility using approved operational procedures.
3. Produce a backup-and-restore drill plus target Android release/physical-device acceptance and approved source-contract samples.
4. Profile representative wide files, actual endpoint latency, RSS, prepared slow-query fingerprints and transaction contention. Current measurements justify investigation, not an architecture rewrite.
5. Keep receipt email disabled until its dedicated SMTP failure/uncertainty acceptance is implemented and verified.

No business policies, finalized quantities, provenance, snapshot ordering, AWB ownership or uncertainty/retry behavior were intentionally changed. Relevant synthetic regressions verify those boundaries; they do not replace live operational acceptance.
