# M7 — pilot blocker closure and final acceptance

Date: 29 October 2026. Repository: S:/2026/dust. Decision: **NO-GO**.

## 1. Executive summary

The cashless PHPStan defect is fixed with one application change: pass the AWBs already checked by the existing validation loop as a list of strings. No permission, quantity, state transition, query, transaction or external retry policy changed.

The approximately 28-second M6 wait is explained by native InnoDB evidence: different report transactions serialize on the same pickup-task primary-key record, holding that lock through projection and category reconciliation. M7 measured a 44.34-second successful locking SELECT at 5,000 AWBs/two workers. Three workers eventually completed in 78.66 seconds, with one InnoDB lock timeout and the existing internal transaction retry. This is a material deadline risk, despite passing integrity assertions. No production lock, timeout, transaction boundary or queue was changed.

Local engineering checks pass except the existing repository-wide Oxfmt/lint gate. Mandatory target-host deadline/supervision acceptance, approved source contracts, signed Android/physical-device acceptance and backup restoration evidence remain missing. These are activation blockers; this report does not permit a pilot to start.

Baseline reports: [remediation results](remediation-results.md), [M1–M5 validation](post-remediation-validation.md), [M6 assessment](pilot-readiness-assessment.md), [M6 evidence](evidence/m6-results.json). M6 performance fixes and historical evidence remain intact.

## 2. Git/source snapshot and preservation

HEAD at entry and during verification: 4ae1fcb81bade35c16ef2c1da517afd2b34631e6. The formerly concurrent cashless work was already committed in this HEAD. There were no tracked modifications at entry; existing untracked audit/UI/output/deck artifacts were preserved. Git status: [before](evidence/m7-git-before.log), [after](evidence/m7-git-after.log). [Files changed since M6 HEAD](evidence/m7-since-m6-files.log) lists 346 committed paths; this is not a list of M7 edits.

Before each edit, the intended file's SHA-256 and exact diff were inspected and its hash checked again. No conflicting edit was detected. [Initial preservation manifest](evidence/m7-preservation-before.json) covers 3,214 pre-existing files. One unrelated, actively locked generated log, output/git-push-20261029/php-full-suite.log, could not be hashed initially; its contents are not certified. [Preservation delta](evidence/m7-preservation-delta.json) records only the following three intentional source changes among the readable originals:

- app/Actions/Pickup/ManageCashlessEntryBatches.php — validated list construction.
- tests/Feature/PilotReportConcurrencyTest.php — two/three-worker datasets, wait-graph sampling and projection replay assertions.
- tests/Feature/pilot-report-worker.php — connection IDs, SQL fingerprints and committed transaction timing.

New documentation/evidence is confined to docs/technical-audit/. No commit, push, deployment, dependency/schema/environment edit, operational queue mutation or real external submission was performed. No existing audit document or raw benchmark was overwritten. Generated build/test caches are not deployment artifacts.

The first gate snapshot has identical before/after hashes for all 1,549 source/config/test files: [before](evidence/m7-source-gates-before.json), [after](evidence/m7-source-gates-after.json). The final full run also passes with identical hashes for all 1,549 files, including the extended harness: [final before](evidence/m7-source-final-before.json), [final after](evidence/m7-source-final-after.json), [stability result](evidence/m7-source-stability.json). The original preservation comparison found no unrelated readable-file changes. The disposable server was shut down successfully after all tests; no hardening_* database remained ([final server check](evidence/m7-disposable-server-final.log)).

## 3. Cashless change status — PASS

Evidence: [ManageCashlessEntryBatches.php:42](../../app/Actions/Pickup/ManageCashlessEntryBatches.php#L42), especially lines 57–64 and the enqueue list<string> contract at line 73. The M6 line-35 error moved to line 61 in the newer committed implementation. Before M7, PHPStan still reported argument.type for pluck('awb')->values()->all(), inferred as array<int,mixed>.

Schema inspection confirmed pickup_cashless_awbs.awb is nullable varchar(100), globally unique. The existing query excludes NULL; the existing loop validates each remaining value as a permitted string. M7 appends that exact validated local value to $awbs and passes the resulting list. This preserves ordering and rejection behavior and avoids a cast, suppression or wider contract. PHPStan's [argument.type diagnostic](https://phpstan.org/error-identifiers/argument.type) concerns compatibility with the declared argument type; no runtime performance claim follows from resolving it.

Existing focused cases cover recorded/new scans, finalization, replay, attempted-batch exclusion, invalid/excess/unfinished POP rejection and correction/authorization boundaries. They are more meaningful than a new test duplicating static type inference. Before and after: **89 passed, 629 assertions** (4,403 / 4,390 ms respectively). These small timing differences are not an optimization result. SQL count, response time and memory before/after this type correction: **Not measured**. It adds no database operation, lock or external action; list construction remains O(n).

## 4. PHPStan and full quality gates

| Check                                   | Status | Current evidence                                                                             |
| --------------------------------------- | ------ | -------------------------------------------------------------------------------------------- |
| Cashless focused tests                  | PASS   | 89 passed / 629 assertions before and after                                                  |
| Full backend, after cashless correction | PASS   | 1,113 passed, 10 skipped, 9,629 assertions, 410,789 ms; stable 1,549-file snapshot           |
| Full backend, final extended harness    | PASS   | 1,113 passed, 11 skipped, 9,629 assertions, 463,567 ms; final stable 1,549-file snapshot     |
| Native overlap regression               | PASS   | Three datasets / 59 assertions / 329,421 ms                                                  |
| PHPStan                                 | PASS   | Zero errors, including after harness changes                                                 |
| PHP Pint                                | PASS   | Repository read-only check and scoped formatting of the three owned PHP files                |
| Web and mobile TypeScript               | PASS   | npm run types:check, both projects                                                           |
| Client Vitest                           | PASS   | 32 files / 247 tests / 5.59 seconds, using the CI command                                    |
| Node worker fixtures                    | PASS   | 118 tests, zero failed/skipped, 65,909.6585 ms                                               |
| Production web build                    | PASS   | npm run build, 26.35 seconds                                                                 |
| Repository npm run check                | FAIL   | 761 pre-existing Oxfmt files after formatting the one new M7 manifest; no unrelated auto-fix |
| Separate type-aware lint                | FAIL   | 16,815 warning diagnostics in 350 files; denyWarnings is enabled                             |

Logs are named m7-backend-full.log, m7-backend-final.log, m7-concurrency-test.log, m7-phpstan-final.log, m7-pint-repository.log, m7-types.log, m7-client-tests.log, m7-worker.log, m7-build.log, m7-format.log, m7-format-final.log and m7-lint.log under [evidence](evidence/).

The final 11 skips are four tests for disabled Fortify two-factor authentication, one opt-in Android device smoke test, three opt-in load datasets and three opt-in overlap datasets. The overlap datasets passed separately; M6 already measured the load datasets. Disabled features and physical-device tests were not relabeled PASS. The first full run had ten skips because the original overlap dataset contained two cases.

Runner correction: an initial unscoped npx vp test run collected Node node:test files under Vitest, producing eight “No test suite found” failures while 228 tests passed. [That attempt](evidence/m7-vitest.log) is retained. The correct existing CI client command subsequently passed all 247 client tests; Node tests passed under their own runner. No test/assertion was removed to obtain these results.

Commands used, with no operational database migrations or workers:

    php vendor/bin/phpstan analyse --no-progress
    php vendor/bin/pint --parallel --test
    php vendor/bin/pint app/Actions/Pickup/ManageCashlessEntryBatches.php tests/Feature/PilotReportConcurrencyTest.php tests/Feature/pilot-report-worker.php --format agent
    php -d extension=pdo_sqlite -d extension=sqlite3 vendor/bin/pest tests/Feature/PickupCashlessCaptureTest.php tests/Feature/CashlessEntryBatchTest.php tests/Feature/CashlessHandoverTest.php --compact --do-not-cache-result
    php -d extension=pdo_sqlite -d extension=sqlite3 vendor/bin/pest --compact --do-not-cache-result
    php -d extension=pdo_sqlite -d extension=sqlite3 vendor/bin/pest tests/Feature/PilotReportConcurrencyTest.php --compact --do-not-cache-result
    npm run types:check
    node node_modules/vitest/vitest.mjs run resources/js resources/mobile/src --config vite.mobile.config.ts --mode development --root .
    npm --prefix workers/jne-report test
    npm run build
    npm run check
    npx vp lint

PHP 8.5.10 / Laravel 13.35.0; disposable MySQL 8.0.30. Tests default to SQLite :memory:; native fixtures require HARDENING_MYSQL_PORT=54182, DB_HOST=127.0.0.1, DB_PORT=54182, DB_USERNAME=root, empty DB_PASSWORD/DB_URL. OPENSSL_CONF points to the installed PHP extras/ssl/openssl.cnf. PILOT_CONCURRENCY=1 only for the explicit overlap run; VALIDATION_LOAD/M6_PROFILE_TAG are unset. The opt-in load workloads are not repeated. Tests isolate mail/push/HTTP and prohibit stray HTTP requests; Node browser tests use local stand-ins.

The native server was started hidden with mysqld.exe --no-defaults --datadir=C:/Users/copol/AppData/Local/Temp/dust-hardening-mysql-c32357914dfe4e4d96e2749c94544fa1/data --port=54182 --bind-address=127.0.0.1 --mysqlx=0 --skip-log-bin --log-error=<same-data-directory>/m7-error.log. SELECT VERSION(), @@port, @@datadir verified the disposable directory. Existing tests create/migrate/drop only their own randomized hardening_* databases there. The configured local dust database on port 3306 was inspected read-only. Scoped Pint was used instead of --dirty to make ownership explicit. Relevant Laravel/testing/Postman guidance and installed framework transaction behavior were inspected; no API contract was altered.

## 5. Lock-wait root cause — PASS for diagnosis

Code: [ProjectJneShipments.php:20](../../app/Actions/Reports/ProjectJneShipments.php#L20) opens the report transaction and locks its report row. [MatchJneShipments.php:158](../../app/Actions/Reports/MatchJneShipments.php#L158) locks candidate pickup tasks in ID order before shipment updates. Shipment chunks and final category resolution lock registry rows within that same transaction (ProjectJneShipments lines 27, 55). Locks release at commit/rollback, not after each chunk.

The fixture preimports distinct reports with the same N AWBs, customer and finalized pickup/day. It directly starts simultaneous PHP action processes; there is no queue scheduling delay in the measured action interval. Each worker locks its own report; contention is on the shared pickup row, followed by the shared shipment state. It is not duplicate dispatch of one report, and therefore same-report job uniqueness alone would not remove this overlap.

The parent samples performance_schema.data_lock_waits joined to data_locks, information_schema.innodb_trx and events_statements_current every approximately 250 ms. It records engine transaction IDs, MySQL connection IDs, transaction/wait starts and ages, lock type/modes/key/index/table, isolation, rows locked/modified and current SQL. Bindings are absent from child fingerprints; parent SQL is confined to synthetic fixtures. [Raw evidence](evidence/m7-concurrency.ndjson), [attempt evidence](evidence/m7-concurrency-attempts.ndjson), [summary](evidence/m7-concurrency-summary.json).

At 5,000/two: connection 92, transaction 1243447, report 1 waits for connection 93, transaction 1243446, report 2. Both transactions started 17:37:20 server local time; wait started 17:37:27. The disputed record is pickup_tasks.PRIMARY key 1; both modes are X,REC_NOT_GAP, type RECORD, under REPEATABLE READ. The completed SELECT took 44,335.74 ms. The blocker committed after 51,729.64 ms. Server local time is UTC+07; application fixture source dates are separate.

Fingerprint: select * from pickup_tasks where id in (?) order by id asc for update. [EXPLAIN](evidence/m7-task-lock-explain.log) gives const access on PRIMARY, estimated one row, no table scan. A new index would not solve this wait. The blocker is sometimes between SQL calls, so a NULL current SQL does not mean its transaction released locks.

This is expected serialization of intersecting mutable business state, amplified by report-length transaction work. No unnecessary lock or inconsistent order was demonstrated in these particular cases. Removing or shortening the task lock without revalidating allocation/review state could change attribution and replay safety. Larger throughput work needs a separate approved integrity design; M7 applies no speculative concurrency correction.

## 6. Concurrency, SQL and transaction evidence

| AWBs / workers | Cohort wall ms | Worker wall ms (index order)      | Committed transaction ms          | Deadlock / lock-timeout delta | Status                                                               |
| -------------- | -------------: | --------------------------------- | --------------------------------- | ----------------------------- | -------------------------------------------------------------------- |
| 1,000 / 2      |       9,211.37 | 9,004.63 / 8,087.92               | 8,996.70 / 8,079.00               | 0 / 0                         | PASS                                                                 |
| 5,000 / 2      |      58,083.09 | 57,768.60 / 51,739.52             | 57,759.32 / 51,729.64             | 0 / 0                         | PASS                                                                 |
| 5,000 / 3      |      78,661.48 | 78,537.85 / 54,128.02 / 67,943.84 | 17,339.63 / 54,118.86 / 67,935.07 | 0 / 1                         | PASS for eventual integrity; FAIL against a 60-second per-job budget |

Three-worker graph: transaction 1250244/connection 99/report 2 holds pickup key 1; transactions 1250243/connection 100/report 3 and 1250242/connection 98/report 1 queue behind it, including a waiter-to-waiter edge. Maximum sampled wait age is 50.51 seconds. InnoDB lock_timeouts increments once. Connection 98 then completes through the existing DB::transaction(..., 3) retry path; its reported committed transaction duration is only the successful final attempt, not its 78.54-second total action time. Failed SQL is not emitted as QueryExecuted, so the failed lock call is excluded from successful-query counts/maxima. Do not interpret that worker's 2,427.25-ms maximum successful SQL call as its longest wait.

Native counters are deltas, not absolute zero claims: the preceding full suite already left lock_deadlocks=9 on this disposable server. No additional deadlock occurred in these overlap cases. This does not prove deadlock freedom for all workflows.

Each successful case asserts all reports PROJECTED, exactly N registry rows and workers × N observations (2,000 / 10,000 / 15,000), all latest pointers on the newest report, replay of the oldest report without another observation/match event, and two DONE reconciliations with identical manifest IDs/event counts. The existing full-suite native worker drills also kill/restart the historical producer, import and projection, expire only isolated leases, verify rollback, explicitly replay stored local data and retain failed-work visibility. Finalized POP, revisions, verification and cashless replay/rollback coverage remains in the suite. External Process/SMTP/FCM is never retried by these drills.

Peak PHP allocations per child: 54,525,952 bytes at 1,000; 144,703,488–146,800,640 at 5,000/two; 180,355,072–195,035,136 at 5,000/three. This is memory_get_peak_usage(true), including application bootstrap, not whole-process RSS or production memory sizing.

The 5,000/two initial-writing worker executed 25,127 successful SQL statements. The five leading per-AWB write families each ran 5,000 times:

| SQL family                      | Cumulative ms |
| ------------------------------- | ------------: |
| Category projection update      |      4,990.46 |
| CATEGORY evidence event insert  |      4,256.12 |
| Customer/pickup matching update |      3,891.59 |
| Latest snapshot update          |      3,770.19 |
| Matching evidence event insert  |      3,557.09 |

These represent actual initial state/evidence writes, unlike the redundant unchanged JSON updates fixed in M6. Historical candidate SELECTs took 2,961.55 ms across ten batches; the full category-source SELECT took 1,716.84 ms; 21 shipment-lock SELECTs took 1,320.41 ms. The waiting older worker executed only 145 successful statements; its pickup lock dominated SQL time. No new per-AWB read regression was demonstrated, and no history/evidence write was removed.

No production concurrency correction was applied, so there is no M7 before/after performance improvement to claim. M6's 46.66-second pair and 28.23-second lock call are historical comparison points, not controlled before/after values: M7 adds wait instrumentation, and host activity/order vary. Cases were run once per dataset. Disjoint-customer scaling, target MySQL 8.4 throughput, actual wide CSV/history and enforced 60-second worker behavior at this volume are **NOT TESTED**. [ImportJneReportAwbs.php:20](../../app/Jobs/ImportJneReportAwbs.php#L20) still declares timeout=60; the direct-action harness allows 180 seconds and does not certify deployment deadlines. Target acceptance must resolve that risk rather than blindly raising a timeout.

## 7. Formatting failure disposition — FAIL

The first repository check reported **762 Oxfmt files**, but its exact manifest includes one newly generated M7 file, evidence/m7-source-gates-before.json. Formatting that owned file leaves **761 pre-existing files**. The numerical resemblance to M6's historical 762 was not proof of an identical failure set. [Initial paths](evidence/m7-format-failures.json), [final paths](evidence/m7-format-failures-final.json), [comparison](evidence/m7-format-comparison.json), [final log](evidence/m7-format-final.log). Pint and TypeScript compilation pass. The separate vp lint failures are warnings promoted by denyWarnings, not TypeScript compiler errors. Counts below describe the final 761 files.

| Oxfmt file type | Count |
| --------------- | ----: |
| .js             |   511 |
| .json           |   140 |
| .mjs            |    40 |
| .md             |    39 |
| .tsx            |    14 |
| .css            |     8 |
| .ts             |     4 |
| .html           |     3 |
| .prettierrc     |     1 |
| .yaml           |     1 |

By root: output 637; docs 90; Retail_Operations_Platform 19; tests 10; workers 4; resources 1. All remaining failures predate M7; no M7-owned path remains in the final failure set. The [lint summary](evidence/m7-lint-summary.json) has 16,815 warning diagnostics across 350 files: output 16,716, workers 97, tests 2. Those JS/MJS files were not changed by M7. vite.config.ts intentionally supplies global fmt settings and lint denyWarnings/typeAware; its existing ignores do not exclude output or these audit artifacts. The observed broad scope is consistent with that configuration. npm run check stops at formatting, so direct lint was necessary to expose the next failure.

Controlled follow-up requiring separate owner approval, as requested by M7: freeze the exact failure manifest; distinguish maintained source from retained historical build/evidence snapshots; preserve originals and checksums; approve a formatting-only change in reviewable batches; rerun type checks, relevant client/worker tests, build and the unmodified broad gate. Lint warnings need their own reviewed disposition without weakening rules. Any artifact-location/formatter-scope proposal needs explicit owner review and preservation analysis; no exclusion or retention change is authorized or applied here. Do not reformat hundreds of historical evidence files as an incidental M7 edit.

Only M7-owned PHP/Markdown/JSON files were formatted. Scoped Pint and Oxfmt checks pass ([owned check](evidence/m7-owned-format-check.log)); the broad check remains FAIL at 761 files. Formatter configuration and unrelated source/evidence were not changed.

## 8. Queue/scheduler acceptance

Read-only evidence: configured local MySQL **8.4.11**, port **3306**, samples on 29 October 10:30–10:32 UTC; [queries](evidence/m7-operational-queries.json), [processes](evidence/m7-local-processes.json), [scheduler registration](evidence/m7-scheduler-registration.log), [recent completed executions](evidence/m7-scheduler-execution.log), [safe controls](evidence/m7-local-controls.json).

| Requirement                                | Status     | Evidence and limit                                                                                                                                                           |
| ------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local queue consumers                      | PASS       | PIDs 25712 default/reconciliation/documents/deliveries; 20556 reconciliation; 21620 documents/deliveries; 21116 mobile-push                                                  |
| Local scheduler execution                  | PASS       | PID 22588; recent DONE entries, including the five-minute recovery command; registration matches routes/console.php                                                          |
| Shared database cache/uniqueness           | PASS       | Database cache/queue configured; native cross-process duplicate-dispatch/recovery tests; empty cache_locks alone is not proof                                                |
| Backlog observation                        | PASS       | Empty at 10:30:51; 121 reconciliation jobs/two reservations at 10:32:07, oldest seven seconds, max attempt one; fresh work, not demonstrated stranding                       |
| Historical 63-job ownership                | NOT TESTED | Old aggregate lacks job IDs/PIDs; later queue emptiness cannot reconstruct every original outcome                                                                            |
| Failed-job visibility/recovery correlation | PASS       | Two retained failure rows; mapping run 3 is COMPLETED, last_id=upper_id=66247, 181 affected; task 741 reevaluated with versions 27/27, no last_error, still correctly REVIEW |
| Interrupted local work recovery            | PASS       | Full native producer/import/projection drills; no operational consume/retry/delete                                                                                           |
| Target-host supervision/restart/alerts     | BLOCKED    | Local processes and test restarts do not prove deployed supervision, alert delivery or scheduler heartbeat monitoring                                                        |
| Target timeout/lease acceptance            | BLOCKED    | Import class 60s, local worker flags 75s, database retry_after default 90s; Windows lacks normal pcntl enforcement; measured overlapping action exceeds 60s                  |

Current reconciliation summary has 847 rows: 336 DONE, 107 PARTIAL, 205 REVIEW, 198 WAITING_DATA, one AWAITING_VERIFICATION; no last_error or input/evaluated-version gap at sampling. Those business states are not automatically repaired.

The local environment changed independently since M6: two Hybrid combined profiles and one APEX unresolved profile are enabled; 57 APEX profiles remain disabled. Latest completed report is 10:26:02 UTC on 29 October. Six NEEDS_ATTENTION reports now exist, not the old two: 633/717/787/795/802 APEX_SOURCE_API and 784 CSV_INVALID. All have no active slot/lease and are NOT_IMPORTED/NOT_PROJECTED. The first five had Admin review; report 802 was unreviewed at the initial sample and retains worker jne-report-1-instance-1. A final read-only check at 10:50:20 UTC confirms report 802 was independently reviewed by Admin 6 at 10:33:30 UTC, with its NEEDS_ATTENTION outcome retained. There were no unreviewed attention/UNKNOWN reports in that final query ([follow-up](evidence/m7-operational-followup.json)). No UNKNOWN row appeared in this report-status sample. Do not repeat a JNE action to clear these states; the operator must inspect saved source/error evidence and choose the existing deliberate recovery workflow.

Two failed jobs are historical evidence: mapping truncation on 27 October, and a task reconciliation deadlock on 28 October. Their original causes were not freshly reproduced against operational data. Later successful processing is documented; neither row was retried or deleted. Laravel database queue reservations do not identify the owning OS PID, so queue-to-process ownership cannot be inferred from aggregates. No monitoring threshold or freshness policy was invented.

Three read-only queries initially used outdated column names and returned 1054; corrected queries used active_key, evaluated_input_version and mapping last_id/upper_id. One wildcard rg read used Windows-incompatible paths and was corrected to directory/glob flags. These inspection errors did not mutate data. No queue restart/clear/retry command or scheduler execution command was run on the operational connection; schedule:list is inspection only.

## 9. Backup/restore acceptance — BLOCKED

No approved database/private-evidence backup artifact or target restore record was supplied. Repository documentation/config searches do not establish whether an external backup service exists. The disposable MySQL target is available, but recreating schema via migrations is not a restore drill.

Operator requirements: provide approved artifact identity/checksum/time and included database/report/evidence files; restore into a fresh isolated target; record representative row/FK/AWB-uniqueness checks, evidence-file checksums, application reads and recovery result; obtain operator acceptance against the actual recovery requirements. No RPO/RTO, retention period or schedule is invented. No restore was attempted over any operational database.

## 10. Android release and physical-device acceptance

| Requirement                                               | Status  | Evidence                                                                                                                                                                                |
| --------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend token/auth and mobile client logic                | PASS    | Full backend plus client tests cover 24-hour tokens, replacement/expiry/revocation, account-scoped encrypted drafts, uncertain submissions, scanner/camera lifecycle and recovery logic |
| Current release assets                                    | FAIL    | Offline verifyReleaseMobileAssets rejects debug/LAN assets at build.gradle:59; negative guard itself PASS                                                                               |
| Approved signed APK/HTTPS origin                          | BLOCKED | Development application ID com.retailpickup.mobile.dev, version 1.2.0/code 16; no committed release signingConfig or approved distribution/origin evidence                              |
| Physical camera/gallery/scanner/Bluetooth                 | BLOCKED | adb devices -l lists no device; fixtures/emulators cannot certify OEM behavior                                                                                                          |
| Release-device network interruption/process death/upgrade | BLOCKED | No physical signed-release acceptance evidence, including retained drafts and uncertain attempts                                                                                        |

The [fresh release guard log](evidence/m7-android-release-guard.log) records:

    $env:ANDROID_HOME='C:/Users/copol/AppData/Local/Android/Sdk'
    ./gradlew.bat verifyReleaseMobileAssets --offline --no-daemon --console=plain

It exits 1 as intended, with no build/distribution/signing operation. [APK metadata](evidence/m7-local-controls.json) finds only debug application and instrumentation APKs; app-debug.apk is 45,532,005 bytes. [Device inventory](evidence/m7-adb-devices.log) is empty. No keys/tokens were read or exposed. Existing mobile offline and uncertain-outcome policies remain unchanged.

## 11. Hybrid/APEX source-contract acceptance

**PASS — synthetic contract and regression coverage. BLOCKED — real operational contract acceptance.**

[ReportJob.php:50](../../app/Models/ReportJob.php#L50) distinguishes Roberto/Nuralamt cashless/manual origins; hybridParts chooses the existing four-source aggregate or explicitly configured server-specific two-source cycle. Existing combination/import tests verify required identities/dates/checksums, duplicate AWB union with retained origin evidence, partial/empty/failure distinctions and late reports. Shared JNE account, customer identity and pickup attribution remain separate; cross-day, conflict/manual decisions, ordered tracking observations and closed-handover preservation remain covered by backend regression. No new completeness threshold or date policy was added.

The local DB still has **zero active verified source contracts** despite enabled evidence/category flags and enabled reporting profiles. Flags, fresh successful downloads and synthetic fixtures do not supply owner sign-off on columns, categories, required sources or date meanings. Follow the existing [business decision register](../jne-reconciliation/business-rules.md) and [UAT plan](../jne-reconciliation/uat-plan.md): provide approved representative source files/checksums, required-source and partial/empty/late semantics, customer-code/account evidence and operational-date versus report-date interpretation, with responsible reviewers. M7 made no live Hybrid/APEX connection or external submission.

## 12. Remaining risks and unchanged scope

- **FAIL:** broad repository formatting/type-aware lint remains red; separate controlled cleanup is required.
- **FAIL/BLOCKED:** three overlapping 5,000-AWB actions exceed the configured 60-second job budget locally; actual target enforcement, report width/history and permitted overlap require acceptance. No production capacity or deadlock-freedom certification is made.
- **BLOCKED:** target process supervision, scheduler/queue heartbeat, backlog/freshness and UNKNOWN/attention alert delivery have no deployed acceptance record.
- **BLOCKED:** approved backup restore, signed HTTPS Android/device run and real Hybrid/APEX contract sign-off are absent.
- **NOT TESTED:** TA-09 remains deferred; PICKUP_RECEIPT_CHANNEL is unset and mailer is log. No SMTP enablement, automatic receipt sending or resend policy was introduced.

Keep the modular monolith, existing transactions/locks, M6 JSON replay fix, source history, AWB uniqueness, conflict/manual decisions, finalized POP/revisions, handover verification/closure, operational 05:00–04:59 Asia/Jakarta boundary, Admin-only corrections and mobile encrypted drafts/uncertain recovery. No additional runtime query, lock or external retry was added by M7's application change. SQL profiling and extra memory are restricted to opt-in tests. No importer streaming rewrite, caching layer, index migration or queue architecture change is justified by this milestone.

## 13. Final pilot decision — NO-GO

Mandatory evidence is unavailable, so CONDITIONAL GO would be misleading. Passing local regressions and eventual action completion do not permit pilot activation while deadline, source, restore, device and operational controls remain unaccepted.

## 14. Smallest next actions

1. Developer/operator: validate the intended report size/history and overlap on the target MySQL/worker runtime against the existing job timeout/lease behavior. Include actual worker termination/recovery at the measured workload. If it cannot fit, obtain approval for a focused projection-work/serialization design with integrity and equivalent benchmarks; do not simply raise timeout or remove locks.
2. Repository owner: approve the controlled formatting/lint disposition in section 7, preserve historical artifacts, and obtain a genuinely green unchanged CI gate against target MySQL 8.4. M7 does not auto-format unrelated files.
3. Operations: provide an approved database/private-evidence backup, complete isolated restore acceptance, and demonstrate deployed supervision/restart, scheduler/queue heartbeat and actionable exception/freshness monitoring.
4. Integration owner: complete the existing source-contract UAT/sign-off and confirm recovery dispositions for retained source exceptions from saved evidence. Report 802 has now been reviewed independently; no automatic external replay is authorized.
5. Mobile/release owner: supply an approved HTTPS target and signing identity, build the signed release, then record physical-device pickup/handover, camera/gallery/scanner, network interruption, process death and upgrade/draft acceptance.

No M8, deployment or new product work is started. Receipt email remains separately deferred. Stop after reviewing this M7 result and the outstanding acceptance evidence.
