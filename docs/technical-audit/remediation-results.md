# Technical audit remediation results

Date: 29 October 2026. Repository: S:/2026/dust. Baseline HEAD: `08c2c075fafffde5b675ce5dd8da54a4e21db0ef`.

## Executive summary

Seven findings received targeted corrections: TA-11, TA-08, TA-02, TA-03, TA-04, TA-07 and TA-05. Focused regression tests verify the reported quality failures, redacted diagnostics, bounded relationship reads, real MySQL lock interleavings and historical invalidation recovery. The existing Laravel modular monolith, external-action uncertainty handling and evidence model remain in place. No dependency, schema, environment-file, credential, retention or production data changes were made. No commit, push or deployment occurred.

**The entire repository quality pipeline is not green.** The requested PHPStan, TypeScript and client test gates pass, but the broader `npm run check` reports formatting issues in 761 files, primarily existing documentation, generated output and unrelated work. These files were preserved; no ignore rules or assertions were weakened. The initial full backend run exposed additional fixture/environment failures; a corrected final run is recorded below. The retained browser layout acceptance failure remains visible; the candidate test passes in the final focused run.

The query measurements below are local regression evidence, not production throughput certification. Receipt SMTP remains a prerequisite before enabling that currently disabled local channel. Deployed operations and physical-device acceptance still require evidence.

## Finding disposition

| Finding | Status                                                                     | Outcome / limitation                                                                                                                                                                                                                                |
| ------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TA-11   | **FIXED & VERIFIED** for the reported defects                              | Accurate factory model typing, fresh persisted POP snapshot, open/closed disclosure assertions, explicit web/mobile client CI step. PHPStan, both TS projects and 247 client tests pass. Unrelated repository-wide formatting gate remains failing. |
| TA-08   | **FIXED & VERIFIED**                                                       | Unexpected import, projection, terminal worker and scheduled profile failures retain private phase/ID/class/source-frame diagnostics; public states/messages stay compatible. Failure-injection and secret-exclusion assertions pass.               |
| TA-02   | **FIXED & VERIFIED**                                                       | Create/amend batch proof IDs and membership IDs after sorted task locks. Business-table SELECTs remain 6 at 1/10/100 tasks; membership outcomes preserved.                                                                                          |
| TA-03   | **FIXED & VERIFIED**                                                       | Scoped processed-pending key lookup replaces repeated cross-day existence reads in both reconciliation callers. Two pending-item SELECTs at 1/50/500 shipments in the measured path.                                                                |
| TA-04   | **FIXED & VERIFIED**                                                       | Projection selects entry_at and batches only genuinely missing-date fallbacks; current source relation advances with the current snapshot. No new per-record source-date reads in measured fixtures.                                                |
| TA-07   | **FIXED & VERIFIED** for tested intersections                              | Customer-before-task cashless finalization; session-before-task-before-item correction/verification. Three barrier-controlled native MySQL scenarios plus native replay/rollback checks pass. Exhaustive production contention is not claimed.      |
| TA-05   | **FIXED & VERIFIED**                                                       | Historical evidence invalidation queues bounded 200-task pages after commit; duplicate customer-day jobs coalesce. All 501 scoped records reached; partial-page retry and transaction rollback tested.                                              |
| TA-09   | **DEFERRED**                                                               | Local receipt_channel is unset and mail.default is log. No unused sender subsystem added. Actual deployed receipt configuration and SMTP uncertainty/recovery must be verified before enabling email.                                               |
| TA-01   | **MEASURED, NO CHANGE NEEDED** at observed local scale                     | Real normalized lookup scans 1,082 customers; one EXPLAIN ANALYZE completed its filter at about 0.639 ms. No migration justified by this small sample. Larger datasets/legacy-normalization equivalence remain prerequisites for an index change.   |
| TA-06   | **MEASURED, NO CHANGE NEEDED** to importer architecture from this evidence | Two-report synthetic SQLite measurements at 100/1,000 rows per report recorded below. Evidence/retry/older snapshot assertions pass. Representative wide reports and production memory/lock measurements remain outstanding.                        |
| TA-10   | **MEASURED, NO CHANGE NEEDED** to recovery behavior for inspected sample   | Zero QUEUED report jobs in the current database snapshot. This does not disprove an enqueue-loss window. No automatic replay of uncertain work added.                                                                                               |
| TA-12   | **DEFERRED**                                                               | Confirmed unconditional 5-second detail poll in source. Browser traffic/tab counts not measured; terminal review/recovery metadata may still change. Polling unchanged pending representative measurements.                                         |
| TA-13   | **BLOCKED** for deployed readiness certification                           | Repository/local controls inventoried; production queue health, heartbeat, freshness, backup restore, restarts and physical Android release acceptance cannot be established from this workspace.                                                   |

The original audit remains a historical baseline; its statements that remediation had not started describe that audit's date/state. This document is the current remediation disposition.

## Implementation and regression evidence

### TA-11: restore the reported quality signals

[CashlessEntryAlertFactory](../../database/factories/CashlessEntryAlertFactory.php#L23) uses a single-model query before reading created_by. No ignore annotation or baseline suppression was added. CashlessHandoverTest refreshes the baseline before taking persisted attributes, including the database-default nullable cashless_capture_hash; its full unchanged-record assertion remains.

The shipment disclosure client test checks both closed and open states, preserving raw-field assertions and verifying that help is exposed only with the editor. Application UI code is unchanged. [CI](../../.github/workflows/tests.yml#L62) runs both client source trees explicitly using the same passing local Vitest invocation. The workflow was inspected, not executed remotely.

Full-suite follow-up corrected three additional test fixtures: PickupOperationalListTest now distinguishes its one same-day unassigned candidate from three candidates across all dates and asserts their exact IDs; JneBulkAccountsTest registers its test-worker identity; ScrapingSettingsTest uses distinct customer accounts for a test intended to demonstrate source concurrency. The existing account-level serialization rule is preserved. The browser fixture's exact search label was updated to the current accessible label, while its original y < 400 placement assertion remains intact and failing. No UI layout was changed and that failure is not hidden. A later obsolete detail-dialog text expectation was also observed during diagnostic exploration; completing that browser acceptance review is deferred.

### TA-08: private failure context without sensitive exception payloads

[ReportPipelineFailure](../../app/Actions/Reports/ReportPipelineFailure.php) emits one structured error with operation phase, report job ID or profile ID, exception/previous-exception class, file/line and at most 15 argument-free stack frames. Arbitrary exception messages, SQL bindings, tokens, CSV and report values are deliberately excluded. A source location/class is retained instead of trusting message redaction heuristics.

[ImportJneReportAwbs](../../app/Jobs/ImportJneReportAwbs.php#L36) uses it for import/projection and failed-worker hooks; [QueueScheduledJneReports](../../app/Actions/Reports/QueueScheduledJneReports.php#L25) uses profile correlation. Known CSV validation errors retain existing field messages. Tests inject nested exceptions containing token/password/raw_csv markers and assert their absence from logs and public errors. No retry count or FAILED/UNKNOWN/NEEDS_ATTENTION policy was changed.

### TA-02: handover reads

[CreateSession](../../app/Actions/Handover/CreateSession.php#L29) and [AmendSession](../../app/Actions/Handover/AmendSession.php#L32) fetch only proof IDs and membership session IDs in batches. Tasks still lock in ascending ID order; membership locks are acquired after tasks in ascending task order. Unique membership constraints, submission replay checks, DRAFT-only amendment and finalized-task requirements remain.

The six-case query test asserts actual member identities/counts as well as a SELECT ceiling. Writes/events remain proportional to selected tasks; the change removes repeated relationship reads, not required evidence writes. Only ID maps are added to memory; full proof/revision history is not loaded.

### TA-03: cross-day eligibility

[PickupAwbEligibility::processedKeys](../../app/Actions/Pickup/PickupAwbEligibility.php#L27) prepares an evaluation-local map of task/shipment/processing-date keys. It queries only owned, dated, cross-day candidates with PROCESSED pending evidence, in shipment-ID batches of 500. Both single-task and customer-day reconciliation reuse that map. The existing direct allowed() fallback remains for other callers.

Same-day approval, Jakarta operational-date conversion, manual decisions, ownership and missing-date exclusion remain. Beyond 500 relevant shipments, batch reads grow with the number of 500-ID batches, not one SELECT per shipment. Memory grows with required processed keys; this is bounded per query, not a claim of constant total evaluation memory.

### TA-04: snapshot projection

[ProjectJneShipments](../../app/Actions/Reports/ProjectJneShipments.php#L23) includes entry_at in its existing source select. Only missing-date candidates load latestSource in a batch. Advancing the current snapshot also advances the in-memory source relation, preventing an already loaded older source date from being reused as the new current date. Older observations do not replace current snapshot fields.

Complete/missing-date fixtures at 1/10/100 AWBs, repeated projection, older-observation and existing matching/provenance suites were exercised. Observation uniqueness and customer/pickup attribution rules were not rewritten.

### TA-07: intersecting lock order

The coordinated order for the addressed paths is actor (when applicable), then customer or handover session as the existing workflow requires, then task(s), then membership/cashless evidence. No new global customer/session lock was introduced.

- [FinalizePickup](../../app/Actions/Pickup/FinalizePickup.php#L26) acquires the customer lock before its task when cashless capture is requested. Previously the nested cashless action acquired that customer after the task. File storage remains in the existing non-retrying outer transaction.
- [CorrectPickupRecord](../../app/Actions/Pickup/CorrectPickupRecord.php#L19) discovers and locks the session before the task, then locks/rechecks membership. Concurrent membership movement produces a safe 409 before revisions/receipts are written.
- [VerifyItem](../../app/Actions/Handover/VerifyItem.php#L21) and [CorrectVerification](../../app/Actions/Handover/CorrectVerification.php#L22) discover the task ID inside the already locked session, lock the task, then lock the item. Existing version, closed-session and role checks remain.

This adds a small fixed discovery SELECT in those coordinated paths. Existing customer/task/session/item locks are reordered, with membership locked explicitly on POP correction; lock scope stays confined to the affected records. The trade-off is fixed discovery work to avoid an observed lock-order cycle. No external action or file operation was moved into a newly retrying transaction.

Native MySQL 8.0.30 ran in a new temporary datadir on 127.0.0.1:54182. Test setup checks the datadir marker before creating randomized hardening_test_* databases. Before correction, the POP-correction/verification scenario acquired the verifier actor lock twice, demonstrating a deadlock-triggered transaction retry. After correction, that path acquires it once. Three controlled scenarios pass: cashless POP versus customer-day reconciliation, POP correction versus initial verification, and POP correction versus verification correction. Tests also verify native POP replay, duplicate-AWB rollback, preserved quantities/revisions and unique membership.

This verifies these interleavings on MySQL 8.0.30, not all possible schedules, production deadlock rates or CI's MySQL 8.4 behavior. The additional guarded test skips unless an explicitly provisioned disposable MySQL port is supplied; no operational database fallback is allowed.

### TA-05: bounded historical invalidation

[PickupAutomationObserver](../../app/Observers/PickupAutomationObserver.php#L31) retains immediate local invalidation when a task is known. Global evidence changes publish one unique historical producer after commit. Projection scopes the producer to customers actually associated with affected AWBs. Alias/global changes retain the original broad finalized history scope because narrowing it without matching evidence could miss reevaluations.

[QueueHistoricalPickupReconciliationsJob](../../app/Jobs/QueueHistoricalPickupReconciliationsJob.php) captures an upper task ID after evidence commits, traverses finalized records by increasing ID in pages of at most 200 and dispatches a continuation only after its page succeeds. Projection customer lists are distinct, sorted and split into groups of 200. New/finalizing task changes retain their own observer path. Queued producers coalesce; uniqueness releases when processing starts so a later evidence change can queue a fresh pass. Producer suppression expires after 60 seconds (one producer timeout) to avoid an indefinite lock following publication failure; delayed duplicate pages remain safe internal work. The existing customer-day reconciliation uniqueness is unchanged.

[QueuePickupReconciliations](../../app/Actions/Pickup/QueuePickupReconciliations.php) still invalidates every member's input_version, but prepares proof/day data once and dispatches one reconciliation job per customer-day. The optional precomputed day key avoids repeated constructor reads and retains compatibility with existing queued jobs.

Callbacks defer unique-lock acquisition until commit, so a rolled-back change neither publishes work nor strands its producer lock. Tests verify 200/400/501-record progress, scoped exclusion, one queued shared-day job, replay, partial-page failure/retry, rollback followed by a valid change, duplicate publication, expiring producer suppression, commit-time upper-bound capture and a real database-queue import-to-DONE/manifest flow.

Retries may increment internal input_version again; they do not create duplicate AWBs, finalized POP or manifests. A failed page restarts from its previous cursor, so interrupted records are revisited. Exhausted jobs remain visible through the existing failed_jobs mechanism; operators must inspect/retry failed producers. A durable outbox was not introduced, and process death between commit and queue publication remains an architectural recovery caveat. Async database/Redis workers are required; a sync connection cannot remove producer work from HTTP execution. Local queue.default is database.

## Before/after technical evidence

Measurements exclude fixture creation unless noted. Query tests use SQLite :memory: and Laravel query logging. SELECT categories are explicit; they are not total request query counts. Baselines were run before their corresponding implementation change.

| Metric / fixture                                                    |                                                      Before |                  After | Result                                                                                                 |
| ------------------------------------------------------------------- | ----------------------------------------------------------: | ---------------------: | ------------------------------------------------------------------------------------------------------ |
| TA-02 create, 10 / 100 tasks, business reads                        |                                            34 / 304 SELECTs |                  6 / 6 | Per-task reads removed                                                                                 |
| TA-02 amend, 10 / 100 tasks, business reads                         |                                            33 / 303 SELECTs |                  6 / 6 | Per-task reads removed                                                                                 |
| TA-02 create/amend, 1 task                                          | Initial create included cold schema discovery; warm amend 6 | 6 / 6 business SELECTs | Final invariant measured; cold metadata is excluded from assertions                                    |
| TA-03 single-task cross-day evaluation, 1 / 50 / 500 shipments      |                           2 / 51 / 501 pending-item SELECTs |              2 / 2 / 2 | One batch plus existing fixed pending read                                                             |
| TA-04 new-registry projection, 1 / 10 / 100 sources, complete dates |                     1 / 10 / 100 source-ID fallback SELECTs |              0 / 0 / 0 | Existing selected date prevents lazy reads                                                             |
| TA-04 same new-registry fixture, missing dates                      |                                                1 / 10 / 100 |              0 / 0 / 0 | New rows have no latest source to fetch; existing dated registry fallback is batch-loaded where needed |
| TA-05 alias update, 100 / 501 historical pickups                    |                             307 / 1,506 interactive SELECTs |                  3 / 1 | Cold metadata explains the first final fixture's extra reads; each is <=4                              |
| TA-07 correction/initial-verification interleaving                  |                    Verifier actor locked twice due to retry |                   Once | Observed deadlock cycle removed for controlled schedule                                                |
| HTTP response duration, all addressed endpoints                     |                                                Not measured |           Not measured | No latency claim                                                                                       |
| Before/after peak memory of query fixes                             |                                                Not measured |           Not measured | No memory-reduction claim                                                                              |

The baseline TA-02 1-task create observed 13 total SELECTs including cold SQLite metadata; it is not compared against the final business-table-only figure. Ten/100-task baseline fixtures were warm and contain the relevant business reads. Measurements establish SELECT growth and semantic assertions, not universal endpoint speed.

### Import/history measurement (TA-06)

[ReportImportMeasurementTest](../../tests/Feature/ReportImportMeasurementTest.php) generates local CSVs with narrow synthetic rows, imports/projects two reports containing the same AWBs, then checks idempotent retry and an older projection. No external report is requested. Automated pickup sending is disabled; report storage is fake. Metrics cover the two complete fixture-helper import/projection calls, including CSV creation/storage and report creation, excluding initial customer/task/contract setup.

| Local instrumented metric                              |              2 × 100 rows |            2 × 1,000 rows |
| ------------------------------------------------------ | ------------------------: | ------------------------: |
| Combined elapsed duration                              |                 553.65 ms |               5,385.59 ms |
| Peak PHP allocated memory for test process             | 71,303,168 bytes (68 MiB) | 81,788,928 bytes (78 MiB) |
| SQL queries / SELECTs                                  |                  481 / 69 |                4,116 / 86 |
| Sum of instrumented transaction intervals              |                  543.8 ms |                5,361.8 ms |
| Retained source rows / observations / unique shipments |           200 / 200 / 100 |     2,000 / 2,000 / 1,000 |
| Duplicate count within each synthetic report           |                         0 |                         0 |

Transaction events measure application transaction intervals inside the RefreshDatabase test transaction; they are not production commit latency or lock-hold measurements. Memory includes framework/test process allocations, is not RSS, and is not a before/after importer comparison. These single local runs do not establish a production limit or justify streaming/retention changes. Existing conflicting-duplicate and provenance tests provide correctness evidence beyond this deliberately non-conflicting repeated-AWB fixture.

### Customer code, queue and polling measurements

The exact normalized resolver query selects id/name/customer_code for active customers, using UPPER(TRIM(customer_code)). Read-only EXPLAIN ANALYZE for synthetic lookup values on the current database reports a scan of 1,082 rows and filter actual time 0.601..0.639 ms. A direct customer_code IN control uses the unique index, actual time 0.0368..0.040 ms. The control lacks normalization and is **not** a semantically equivalent replacement. One local warm sample is insufficient to justify changing legacy whitespace/case behavior or schema.

Current report-job aggregate: 52 COMPLETED/IMPORTED/PROJECTED; 112 SOURCE_SAVED/NOT_IMPORTED; 2 NEEDS_ATTENTION; 2 NO_DATA; **0 QUEUED**. Earliest/latest timestamps in this sample are 27 October 2026. SOURCE_SAVED child snapshots are not mislabeled stranded imports. The jobs table contains 12 reconciliation jobs and failed_jobs contains 2 rows. No payload, customer data or exception contents were exported, and no operational queue was consumed. This snapshot cannot prove worker health or rule out future publication loss.

[jne-report-awbs.tsx](../../resources/js/pages/jne-report-awbs.tsx#L73) configures usePoll(5000) regardless of terminal stage. Twelve ticks per foreground minute per continuously active tab is an arithmetic scenario, not measured browser traffic; Inertia visibility/network behavior and open tab counts were not profiled. Review/recovery changes can still affect terminal report props, so no speculative poll suppression was made.

## Exact changed files

Application, factory, CI and existing regression files changed relative to the remediation-start hashes:

- [app/Actions/Pickup/PickupAwbEligibility.php](../../app/Actions/Pickup/PickupAwbEligibility.php)
- [app/Actions/Pickup/QueuePickupReconciliations.php](../../app/Actions/Pickup/QueuePickupReconciliations.php)
- [app/Actions/Pickup/ReconcileCustomerPickupDay.php](../../app/Actions/Pickup/ReconcileCustomerPickupDay.php)
- [app/Actions/Pickup/ReconcilePickupProcessing.php](../../app/Actions/Pickup/ReconcilePickupProcessing.php)
- [app/Jobs/ReconcilePickupProcessingJob.php](../../app/Jobs/ReconcilePickupProcessingJob.php)
- [app/Observers/PickupAutomationObserver.php](../../app/Observers/PickupAutomationObserver.php)
- [database/factories/CashlessEntryAlertFactory.php](../../database/factories/CashlessEntryAlertFactory.php)
- [tests/Feature/CashlessHandoverTest.php](../../tests/Feature/CashlessHandoverTest.php)
- [tests/Feature/PickupReconciliationQueueTest.php](../../tests/Feature/PickupReconciliationQueueTest.php)
- [.github/workflows/tests.yml](../../.github/workflows/tests.yml)
- [app/Actions/Handover/AmendSession.php](../../app/Actions/Handover/AmendSession.php)
- [app/Actions/Handover/CorrectVerification.php](../../app/Actions/Handover/CorrectVerification.php)
- [app/Actions/Handover/CreateSession.php](../../app/Actions/Handover/CreateSession.php)
- [app/Actions/Handover/VerifyItem.php](../../app/Actions/Handover/VerifyItem.php)
- [app/Actions/Pickup/CorrectPickupRecord.php](../../app/Actions/Pickup/CorrectPickupRecord.php)
- [app/Actions/Pickup/FinalizePickup.php](../../app/Actions/Pickup/FinalizePickup.php)
- [app/Actions/Reports/ProjectJneShipments.php](../../app/Actions/Reports/ProjectJneShipments.php)
- [app/Actions/Reports/QueueScheduledJneReports.php](../../app/Actions/Reports/QueueScheduledJneReports.php)
- [app/Jobs/ImportJneReportAwbs.php](../../app/Jobs/ImportJneReportAwbs.php)
- [resources/js/lib/jne-monitoring.test.tsx](../../resources/js/lib/jne-monitoring.test.tsx)

- [tests/Feature/PickupOperationalListTest.php](../../tests/Feature/PickupOperationalListTest.php)
- [tests/Feature/JneBulkAccountsTest.php](../../tests/Feature/JneBulkAccountsTest.php)
- [tests/Feature/ScrapingSettingsTest.php](../../tests/Feature/ScrapingSettingsTest.php)
- [workers/jne-report/test/sertim-ui-flow.mjs](../../workers/jne-report/test/sertim-ui-flow.mjs)

New implementation and tests:

- [app/Actions/Reports/ReportPipelineFailure.php](../../app/Actions/Reports/ReportPipelineFailure.php)
- [app/Jobs/QueueHistoricalPickupReconciliationsJob.php](../../app/Jobs/QueueHistoricalPickupReconciliationsJob.php)
- [tests/Feature/HandoverQueryGrowthTest.php](../../tests/Feature/HandoverQueryGrowthTest.php)
- [tests/Feature/HistoricalReconciliationQueueTest.php](../../tests/Feature/HistoricalReconciliationQueueTest.php)
- [tests/Feature/operational-lock-worker.php](../../tests/Feature/operational-lock-worker.php)
- [tests/Feature/OperationalLockOrderTest.php](../../tests/Feature/OperationalLockOrderTest.php)
- [tests/Feature/PickupEligibilityQueryTest.php](../../tests/Feature/PickupEligibilityQueryTest.php)
- [tests/Feature/ReportImportMeasurementTest.php](../../tests/Feature/ReportImportMeasurementTest.php)
- [tests/Feature/ReportPipelineDiagnosticsTest.php](../../tests/Feature/ReportPipelineDiagnosticsTest.php)
- [tests/Feature/ShipmentProjectionQueryTest.php](../../tests/Feature/ShipmentProjectionQueryTest.php)

Documentation added: this report; evidence/remediation-source-before.json; evidence/remediation-preservation.json; evidence/remediation-checks.json. Historical audit reports were preserved.

## Commands and check results

Commands ran from the repository root unless specified. Read-only inventory included Get-Content, rg/rg --files, git status/rev-parse, package versions, safe config:show values and schedule:list. Some probes used nonexistent generic filenames or Windows wildcard paths and were corrected without source mutation.

| Command / check                                                                                                                                 | Result                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| composer show --direct; installed JS manifests                                                                                                  | Versions confirmed; no install/update                                                                                                                                                                                                           |
| Boost search_docs (framework locking/queue/after-commit); existing skill guidance                                                               | Consulted before API-dependent changes                                                                                                                                                                                                          |
| Baseline focused CashlessHandoverTest                                                                                                           | 1 failure: missing persisted nullable hash key                                                                                                                                                                                                  |
| Baseline jne-monitoring client test                                                                                                             | 14 passed, 1 stale closed-disclosure assertion failed                                                                                                                                                                                           |
| Baseline PHPStan                                                                                                                                | 1 factory property typing error                                                                                                                                                                                                                 |
| php -d extension=pdo_sqlite -d extension=sqlite3 vendor/bin/pest CashlessHandoverTest.php CashlessEntryAlertTest.php (full relative test paths) | 42 passed, 186 assertions after TA-11                                                                                                                                                                                                           |
| Focused handover/reconciliation/projection suites                                                                                               | Passed; metric assertions fail on the old corresponding paths                                                                                                                                                                                   |
| HARDENING_METRICS=1 Pest five query/import test files                                                                                           | 21 passed, 108 assertions at that run; exact measurements above                                                                                                                                                                                 |
| Focused diagnostics/historical/queue tests after failure-hook addition                                                                          | 14 passed, 101 assertions                                                                                                                                                                                                                       |
| HARDENING_MYSQL_PORT=54182 Pest OperationalLockOrderTest.php                                                                                    | Final 3 passed, 37 assertions, including native replay/rollback                                                                                                                                                                                 |
| Focused operational suite (lock order, cashless, mobile proof, pickup result, retail handover)                                                  | 64 passed, 565 assertions before added native replay assertions                                                                                                                                                                                 |
| php vendor/bin/phpstan analyse --no-progress --memory-limit=1G                                                                                  | Pass, 0 errors                                                                                                                                                                                                                                  |
| npm run types:check                                                                                                                             | Pass, web and mobile                                                                                                                                                                                                                            |
| node node_modules/vitest/vitest.mjs run resources/js resources/mobile/src --config vite.mobile.config.ts --mode development --root .            | 32 files, 247 tests pass                                                                                                                                                                                                                        |
| node node_modules/vite-plus/bin/vp fmt resources/js/lib/jne-monitoring.test.tsx .github/workflows/tests.yml                                     | Pass; only supported matched client file formatted                                                                                                                                                                                              |
| node node_modules/vite-plus/bin/vp check resources/js/lib/jne-monitoring.test.tsx                                                               | Pass, no lint/format warnings                                                                                                                                                                                                                   |
| npm run check                                                                                                                                   | Fails repository-wide formatting in 761 files; no broad auto-fix performed                                                                                                                                                                      |
| php vendor/bin/pint --format agent followed by explicit touched PHP paths                                                                       | Applied to task-owned edits only; avoids formatting extensive unrelated dirty files                                                                                                                                                             |
| Full isolated Pest suite                                                                                                                        | Last broad run: 1,088 tests, 1,081 passed, 2 failed, 0 errors, 5 skipped, 9,326 assertions, 411,669 ms. It loaded the candidate test before its final correction; that test passes in the final focused run. Browser placement remains failing. |
| Node worker suites                                                                                                                              | 112/112 passed, zero skipped/cancelled; loopback HTTP/Chromium fixtures only, 100,466.2232 ms.                                                                                                                                                  |
| Remote CI, build/release/deploy, physical Android                                                                                               | Not executed                                                                                                                                                                                                                                    |

New application classes and Pest test files were generated with Artisan make:class/make:job/make:test --pest --no-interaction before editing; the child-process helper was added alongside the existing helper convention. There were intermediate, corrected test harness issues: cold SQLite schema-query accounting, a Queue::pushed collection item shape assumption, and the old import test expecting reconciliation publication before the new default-queue producer stage. Assertions now exercise the completed pipeline; no final outcome assertion was removed. Two new producer typing errors were resolved using typed selected model IDs, not suppressed.

The disposable native MySQL initialization initially failed because output files were created inside its empty datadir; a separate new temp root with a clean data subdirectory succeeded. No existing database directory was initialized or modified. All CREATE/DROP/migration test operations were confined to that newly provisioned server or test SQLite files. Full-suite environment explicitly routes MySQL host/port/root credentials to the disposable instance; no environment file was edited. The new concurrency harness adds its own datadir guard.

## Full-suite follow-up and unresolved acceptance

The first complete isolated backend run reported 1,086 tests: 1,064 passed, 3 failed, 14 errored, 5 skipped, 9,257 assertions, 479,010 ms. Thirteen errors were local OpenSSL key-generation fixture failures; selecting the already installed openssl.cnf through the test process's OPENSSL_CONF resolved them. The push test files then passed 52/52 with 213 assertions, with mocked FCM/OAuth and no production credentials.

The remaining worker-identity error and shared-account/operational-summary fixture mismatches were corrected as described under TA-11. The last broad run loaded test definitions before the final candidate-ID assertion correction: 1,088 total, 1,081 passed, 2 failed, 0 errors, 5 skipped, 9,326 assertions, 411,669 ms. Its two failures were the then-loaded candidate-ID assertion and the retained browser placement check. A subsequent focused run of historical, diagnostic, operational-list and bulk-account tests passed 18/18 with 150 assertions. Final verification after all these edits passed 38 focused tests with 243 assertions, including the corrected candidate IDs, all addressed query regressions, diagnostics and queue producer behavior. The expanded historical job suite then passed 7/7 with 46 assertions, including duplicate pages after suppression expiry.

**DEFERRED — existing browser acceptance mismatch:** SertimCashlessBrowserTest reaches the current search control using the corrected accessible label, then its retained desktop search-placement requirement (y < 400) fails against the existing page. Updating production layout would exceed the no-UI-redesign scope. Diagnostic exploration also reached an obsolete detail-dialog text locator after the placement check. This browser acceptance needs a separate scoped review; neither assertion was removed from the final fixture. The reported remediation paths' focused PHP/client tests pass, but the complete suite must not be described as green.

The full-run skips include the opt-in Android device test and feature-gated authentication tests. The new native lock tests ran on the disposable server rather than being silently treated as SQLite concurrency evidence.

## Preservation and deviations

The initial tree was already extensively modified/untracked. A SHA-256 baseline captured **3,177** pre-existing tracked/non-ignored files before remediation edits. Final comparison: 24 intended pre-existing files changed, 3,153 unrelated files retained identical hashes, zero removals. Fourteen files were added (implementation/tests plus four audit artifacts). Final comparison and exact affected hashes are in [remediation-preservation.json](evidence/remediation-preservation.json); no pre-existing files were removed. Ignored runtime/test artifacts and environment/secret files are outside that manifest. The baseline is [remediation-source-before.json](evidence/remediation-source-before.json).

No reset, stash, checkout, commit, push or dependency/schema change was used. The isolated MySQL process was shut down through its explicit local port after tests; the operational MySQL processes were left alone. Automatic approval review rejected deletion of the two disposable MySQL directories under Windows Temp as "blocked by policy". They remain on disk; no alternative deletion method was attempted. Pint was scoped to the task's PHP paths instead of --dirty because --dirty would also reformat unrelated user work. Documentation/model/controller decomposition, generic data layers and UI changes were avoided. Additional test-fixture corrections were discovered by the full run after the sequential implementation phases; they were kept separate from application behavior. Native MySQL was provisioned locally because Docker's daemon was unavailable; tested server version differs from CI's MySQL 8.4. SMTP work was intentionally deferred under the user's disabled-channel branch. Measurement-only findings did not become speculative rewrites.

## Operational readiness and remaining verification

| Control                   | Evidence observed                                                                           | Still required before a deployed readiness claim                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Queue consumers/backlog   | Local database queue configuration; 12 reconciliation rows; local worker processes observed | Owner confirms default/reconciliation/documents/delivery consumers, shared unique-lock cache, oldest-job age and failed producer visibility |
| Scheduler                 | Minute generation/report/reconciliation schedules and five-minute recovery registered       | Prove scheduler heartbeat and stop/failure alert delivery                                                                                   |
| Report freshness          | Snapshot job statuses and source timestamps retained                                        | Owner-defined freshness expectations; verify stale-source and partial-run visibility                                                        |
| UNKNOWN / NEEDS_ATTENTION | Existing uncertainty holds unchanged; 2 NEEDS_ATTENTION sampled report jobs                 | Review deployed backlog with owners; no automatic external resend                                                                           |
| Database backup/restore   | No deployed backup evidence supplied                                                        | Isolated restore drill and documented recovery evidence                                                                                     |
| Worker restart            | Durable queues and retry configuration in source                                            | Deployment restart behavior, long-running worker adoption of this code and recovery drill                                                   |
| Android                   | Client tests/TS and existing backend mobile tests                                           | Release APK, physical scanner/camera/network/process-death acceptance; opt-in native suite not enabled                                      |
| SMTP receipt              | Local channel unset, mailer log                                                             | Verify deployed config; implement/test queued commit-safe sender and stale uncertainty recovery before email is enabled                     |

The smallest next action is a staged deployment acceptance check: confirm default and reconciliation consumers/shared cache are healthy, then run one local-only report-to-reconciliation fixture through those deployed queues. Backup/restore and physical Android acceptance remain separate pilot evidence requirements; no single check certifies overall readiness.

## Final engineering review

1. **Applicable P1 findings:** TA-11/08/02/03/04/07/05 were implemented with relevant local verification. TA-09 is explicitly deferred because local email is disabled and deployed configuration is unknown. The unrelated repository-wide formatting gate is still failing.
2. **Improved queries:** handover proof/membership reads, scoped cross-day processed-pending reads, projection source-date fallbacks, and synchronous historical invalidation reads. Required per-record writes remain.
3. **Added overhead:** fixed discovery SELECTs and explicit membership locking on POP correction; scalar maps for selected tasks/processed keys; bounded producer queue messages and delayed reevaluation. No broad new locks; no total-memory reduction claimed.
4. **POP/handover/cashless/reconciliation semantics:** retained, with regressions for quantities, revision history, finalization replay, closed-session permissions, scoped membership and cross-day outcomes. Deferred invalidation timing now requires workers; final business outcomes remain equivalent in tested flows.
5. **Provenance/identity/order:** unchanged matching and identity rules, append-only source/observation behavior and older-snapshot protection; existing suites exercised.
6. **Retries/uncertainty:** no external retry automation added. Historical producers retry derived internal invalidation only; existing UNKNOWN holds remain.
7. **Relevant checks:** focused PHP, PHPStan, both TS and 247 clients pass. Entire repository formatting gate fails on unrelated existing files. The full backend run retains a separate browser acceptance failure; skipped native Android acceptance remains explicit.
8. **Production workload unknowns:** endpoint latency, concurrent MySQL 8.4 lock behavior, wide/max-size CSV RSS and lock duration, queue-age distributions, actual poll traffic, backup restoration and physical Android release behavior.
9. **Engineering outcome:** smaller reads, bounded interactive fanout and safer lock ordering/diagnostics within the existing architecture. No schema, dependency, policy or UI redesign was needed.
10. **Pilot prerequisite:** verify deployed queue/cache/restart operation and run the acceptance flow; obtain missing backup/device evidence. Enable receipt email only after its separate reliability work is complete.
