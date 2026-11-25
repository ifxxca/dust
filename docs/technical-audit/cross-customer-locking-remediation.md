# Cross-customer locking remediation and reconciliation efficiency

Date: 29 October 2026. Repository: S:/2026/dust. HEAD at entry: 4ae1fcb81bade35c16ef2c1da517afd2b34631e6.

## 1. Executive summary

**The broad cross-customer locking cause is FIXED & VERIFIED in the tested code. Overall technical readiness is PARTIALLY RESOLVED.** Two coordinated query-scope changes preserve current locking reads and existing transactions while avoiding the global OR/NULL-owner scan. Baseline tests demonstrate 28,142 unrelated locked shipment records and eight controlled native deadlocks. The final full-action test identifies zero unrelated records, and repeated corrected scope cycles add zero deadlocks.

All relevant focused/native tests and the full backend suite pass. Unchanged reconciliation is locally faster at 5,000 AWBs, with four additional SELECTs and more examined rows explicitly recorded below. No speculative cache, input-version skip, new index or transaction split was introduced. Operational adoption and target timeout/lease acceptance remain open; no pilot GO is issued.

Scope is the confirmed cross-customer locking defect and narrowly measured reconciliation cost. The prior worker recovery and canonical category comparison are preserved. No operational database, queue, worker, infrastructure, source contract, retention policy or business quantity was modified by this task.

Baseline: [worker recovery review](worker-recycle-efficiency-review.md), [M6 assessment](pilot-readiness-assessment.md), [M7 blocker closure](m7-pilot-blocker-closure.md).

## 2. Isolated reproduction

A new native **MySQL 8.4.11** instance was initialized in a new temporary dust-hardening-mysql-lock-* directory, bound to **127.0.0.1:54184**, with MySQL X disabled. It is separate from the existing operational server. Parent/child guards verify port, directory prefix and randomized hardening_lock_* schema names before test work. Schema creation/migrations/deletion occur only in those disposable schemas.

The representative fixture has:

- Three distinct customers and a shared JNE account; two current finalized pickups/verified handovers per customer.
- 21 owned shipments and 2,000 unowned customer-attributed shipments per customer, including an explicit cashless claim and an excluded pool row.
- 100 unowned rows with ambiguous customer identity.
- Older conflicting source evidence, processed through the real projector without replacing the newer current report pointer.
- 24,000 historical owned shipments on another task outside the current day, to make index distribution substantially different from a tiny all-unowned fixture.
- **30,163 total registry rows**, verified contracts, raw source evidence, current report identities and intentional conflict/review outcomes. Excess pool quantities do not trigger matching solely because quantities happen to agree.

Initial control population was 6,163 rows; the larger population validates that the result is not inferred only from a tiny fixture. Test identities are synthetic. Published graphs contain query/lock summaries, not operational AWBs or physical record dumps.

The first harness preview had an incorrectly constructed contract active_key and paused in a nested allocator rather than the intended direct customer-day query. It is retained as a harness preview, excluded from baseline conclusions. The corrected fixture uses JneSourceContract::key and identifies the immediate application call frame.

Evidence: [scope snapshots/plans](evidence/cross-lock-scope.ndjson), [cycle runs/graphs](evidence/cross-lock-cycle.ndjson), [failing original test](evidence/cross-lock-representative-baseline.log), [failing cycle test](evidence/cross-lock-cycle-baseline.log). The zero-unrelated-lock and zero-deadlock assertions were not relaxed.

## 3. Original failure mechanism and lock order

The operational graph retained in [worker evidence](evidence/worker-recycle-operational.json) showed PRIMARY → pickup/category secondary index versus secondary index → PRIMARY acquisition, including 35,362 lock entries. The local reproduction independently demonstrates the same broad-scope failure mechanism; its selected access path is not identical to that operational plan.

The original OR scope combined:

    pickup_task_id IN (current members)
    OR (pickup_task_id IS NULL
        AND customer_id = current customer
        AND latest source belongs to the operational day
        AND not excluded for these members)

At REPEATABLE READ, the locking read can lock scanned index records beyond rows finally returned. Ordering the output by id does not itself guarantee that filtering and index acquisition stay inside that customer. In the representative fixture, the original customer-day query chose a PRIMARY index scan: all **30,163 identifiable shipment records** were locked, including **28,142 belonging outside the selected customer**. In the 6,163-row control it locked 4,142 unrelated records.

Controlled cycle tests first retain different required pool-row locks, then execute the actual captured customer-day scope SQL for A/B and A/B/C, twice each, using the existing three-attempt transaction behavior. The broad scope reaches the other transaction's retained row, creating a cycle. **Eight native deadlocks** were recorded; transactions required up to three attempts. The native zero-deadlock assertion fails before correction, even though existing retries allow workers to finish. The graph identifies mutually waiting shipment PRIMARY records.

This is a reproduction of the defect mechanism, not a claim that the fixture recreated the operational secondary-index graph byte-for-byte. The operational EXPLAIN used ref_or_null on the pickup/category index and filesort; the local larger fixture chose PRIMARY instead. Both show why logical customer/day predicates alone do not bound physical locks.

A first patch to ReconcileCustomerPickupDay alone removed the controlled scope cycle but failed the full-action unrelated-lock test. The earlier scope in ReconcilePickupProcessing had already acquired those locks. That failing intermediate result is retained in [intermediate test](evidence/cross-lock-after.log). The final correction addresses both intersecting scopes.

## 4. Query plans and measured locks

| Trial                        | Population | Identifiable PRIMARY shipment records | Unrelated customer records | All shipment index/gap/table entries | Captured day-scope SQL ms |
| ---------------------------- | ---------: | ------------------------------------: | -------------------------: | -----------------------------------: | ------------------------: |
| baseline                     |       6163 |                                  6163 |                       4142 |                                10512 |                     24.27 |
| baseline-representative      |      30163 |                                 30163 |                      28142 |                                34703 |                     38.62 |
| after-lock-patch             |      30163 |                                 30163 |                      28142 |                                34703 |                     18.71 |
| after-coordinated-lock-patch |      30163 |                                  2021 |                          0 |                                 6189 |                     19.22 |
| final                        |      30163 |                                  2021 |                          0 |                                 6189 |                     18.60 |

Final vs representative baseline: **30,163 → 2,021 identifiable shipment records (93.30% fewer)**, **28,142 → 0 identified unrelated customer records**, and **34,703 → 6,189 total shipment lock entries**. The intended final evidence set is 2,020 rows: 21 owned plus 1,999 pool rows after one exclusion. Index scans can lock a filtered row too; physical locks and returned evidence counts are different quantities.

The original fixture plan chooses PRIMARY/index access for the OR. The final day-owned branch uses the existing pickup index; the pool explicitly uses customer_id ref access and retains its date/exclusion checks. Individual evaluation uses narrow customer/AWB index reads for ID discovery and a PRIMARY lookup for final database-ordered hydration. The first partial patch still retained 28,142 unrelated records; it was not accepted as a fix. Scope-holder wall time includes the intentional pause and EXPLAIN instrumentation, so it is not presented as pure transaction latency. Separate serial outer-transaction timing appears below.

Controlled current-scope interleavings: baseline **8 deadlocks / up to 3 transaction attempts**; final **0 new deadlocks / 1 attempt** in each of four repeated two/three-customer cases. Mean pair wall time was 661.31 ms before and 594.13 ms in the final run, including process startup/barriers; this small finite difference is not a throughput result. Both use current locking reads and unchanged transaction retry configuration. After-run SHOW ENGINE INNODB STATUS can retain the historical baseline graph even when the new deadlock counter delta is zero; the summary flags this explicitly.

Actual rows examined by each held scope statement were not separately measured; EXPLAIN estimates are not substituted. Serial action-level engine rows examined are measured below. Scope result equivalence is asserted by exact expected evidence IDs, not an invented returned-row profiler count.

Plans are EXPLAIN FORMAT=JSON, not EXPLAIN ANALYZE, for captured synthetic queries. Actual record-lock counts come from Performance Schema while the transaction is held. Index/gap/pseudo-record entries are retained separately; they are not interchangeable with distinct shipment rows. This report does not call a table-level IX intention lock an exclusive table lock.

The held full-action lock measurements target customer A. Mixed-action and controlled scope tests exercise all three customers separately. Identifiable record counts exclude gap-only, pseudo-record and unavailable LOCK_DATA entries; zero identified unrelated records is evidence for these tested snapshots, not a universal lock-footprint guarantee.

MySQL's [locks-set documentation](https://dev.mysql.com/doc/refman/8.4/en/innodb-locks-set.html) explains scanned index-record and foreign-key-check locks. Its [locking-read documentation](https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html) distinguishes current locking reads from snapshot reads. The measured fixture, rather than a generic documentation rule, establishes the extent here.

## 5. Correctness invariants and race analysis

Required invariants were established before accepting the correction:

1. Keep every owned member shipment, including contradictory customer evidence that requires review. Do not filter owned rows by customer.
2. Include relevant NULL-owner pool candidates for this customer/day, subject to the original exclusions and source/date conditions. Unknown/shared-account identity alone is not ownership evidence.
3. In individual evaluation, retain the source-selected AWB branch as well as historical-source date membership; conflicting attribution must remain visible.
4. Keep the original finalized POP/handover baselines, eligibility/category/customer checks, pending/cashless rules and Admin authorization.
5. Retain required source observations, legitimate audit events, version checks, rollback and replay semantics.
6. Maintain current locking reads and the existing outer customer/task transaction. A snapshot-only ID lookup followed by locking was rejected.
7. Preserve database ordering in individual AWB snapshots; do not substitute PHP byte ordering for database collation.

The corrected discovery reads all use FOR UPDATE, rather than nonlocking pluck followed by later locking. Relevant row locks are retained through final evaluation and commit. The customer row and member task locks still serialize their normal workflows. The customer-index pool scan retains range/gap protection for that customer; it does not replace it with SKIP LOCKED or a global state cache.

A row discovered by any branch cannot change ownership while its transaction holds that row lock. The individual final read is also a current locking read of the deduplicated IDs. It preserves database AWB sorting and fresh protected state; it is not a potentially stale consistent read.

New evidence not yet committed when a customer/day transaction runs must still be processed by existing after-commit invalidation or later reevaluation. Customer/task/FK and selected row locks can delay the writer; the correction does not promise that a transaction includes data committed only after it ends. It does preserve late-data processing.

The ownership race test starts a real explicit manual ownership action after reconciliation has locked a required unowned row. Performance Schema must show that writer waiting on the shipment. After release, the decision commits and a reconciliation replay preserves the correct customer/task. This tests the discovery/locking window rather than simply comparing final counts.

Not every historical/future mutator interleaving is proven safe. Existing manual/review paths have their own lock ordering, version and authorization rules. This patch is not a universal lock-order redesign.

## 6. Alternatives evaluated

| Alternative                                                            | Decision                   | Reason / race implications                                                                                                                                            |
| ---------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remove FOR UPDATE, SKIP LOCKED, change isolation or raise lock timeout | Rejected                   | Can omit required evidence, weaken integrity or mask contention.                                                                                                      |
| Discover IDs using an ordinary snapshot read                           | Rejected                   | Can miss current candidates or use an older snapshot.                                                                                                                 |
| Force PRIMARY on the original OR query                                 | Rejected                   | The representative baseline already demonstrates broad PRIMARY locking; sorting alone is insufficient.                                                                |
| Only add customer_id to the entire original predicate                  | Rejected                   | Would hide contradictory customer evidence on already owned rows.                                                                                                     |
| Patch customer-day aggregate only                                      | Tested, insufficient       | Controlled scope cycle improved but individual evaluation retained unrelated locks; full-action assertion still failed.                                               |
| Separate current locking reads using existing selective indexes        | Implemented in both scopes | Preserves branch membership and current-read protection; avoids the global NULL-owner/OR scan. Costs a bounded number of extra statements.                            |
| New composite index or transaction redesign                            | Deferred                   | No schema change is authorized; existing indexes demonstrate a code-only correction. Further same-customer/history lock reduction requires its own evidence/approval. |

## 7. Applied patch

Production changes are limited to:

- [ReconcileCustomerPickupDay.php](../../app/Actions/Pickup/ReconcileCustomerPickupDay.php): separate owned member rows and customer/day NULL-owner pool rows, lock both, merge by model key and restore ascending numeric ID order before loading existing relationships.
- [ReconcilePickupProcessing.php](../../app/Actions/Pickup/ReconcilePickupProcessing.php): gather IDs through separate current locking reads for owned, customer/historical-day and source-AWB branches; deduplicate; then perform the original ordered, eager-loaded current read by PRIMARY IDs.

MySQL-only hints use existing jne_shipments_customer_id_foreign, jne_shipments_awb_unique and PRIMARY indexes. Other database drivers retain their grammar/planner behavior; no SQLite hint names are assumed. No new index, migration or dependency was added.

The customer/task locks and original transaction attempt count remain. The same exclusions, ownership filters, source dates, audit logic, snapshot hashes, manifest construction and business decisions remain downstream. The additional statements are explicit costs, not concealed behind caching.

No controllers, routes, API contracts, mobile UI, evidence retention or external retry policy changed. The existing canonical category evidence comparator is untouched.

## 8. Mixed-customer and integrity regression

| Check                                                    | Result                                                                                                          |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Original full-action scope                               | Fails before correction: 28,142 unrelated records on 30,163-row fixture                                         |
| Original controlled cycles                               | Fails before correction: 8 native deadlocks, up to 3 attempts                                                   |
| Final native scope/cycles/mixed/race/queue/loading suite | **8 passed, 104 assertions, 194,237 ms**                                                                        |
| Real-action mixed matrix                                 | 13 overlapping cases; all workers successful, zero new deadlocks; source ordering and frozen quantities checked |
| Required-row ownership race                              | Writer waits on shipment PRIMARY, then commits correct ownership; replay preserves it                           |
| Equivalent efficiency fixtures                           | **3 passed / 6,130 assertions before and after**, 143,027 / 129,107 ms including setup                          |
| Focused existing business regression                     | **179 passed, 1,198 assertions, 24,525 ms**                                                                     |
| Full backend with disposable native port available       | **1,116 passed, 25 skipped, 9,640 assertions, 462,737 ms**                                                      |
| PHPStan / scoped Pint                                    | PASS; zero PHPStan errors                                                                                       |

Native opt-in scenarios are executed separately even though full-suite opt-in flags are unset. Full-suite skipped cases are not claimed verified by that run. The compact JSON result emits a skip count rather than a per-skip reason list; relevant new MySQL/performance cases have explicit port/opt-in guards and separate successful logs. Other optional/browser/load prerequisites remain outside this acceptance.

Evidence: [final native log](evidence/cross-lock-final-native.log), [mixed actions](evidence/cross-lock-mixed-actions.json), [ownership race](evidence/cross-lock-ownership-race.json), [focused regression](evidence/cross-lock-focused-regression.log), [full backend](evidence/cross-lock-full-backend.log), [final PHPStan](evidence/cross-lock-phpstan-final.log).

The real-action matrix covers A/B and A/B/C reconciliation, repeated same-customer/day evaluation, another customer's report projection, same-customer projection, explicit assignment of another customer's unowned row and late conflicting source evidence. Repeated cases run twice. It asserts successful workers, deadlock differences, exact ownership, older snapshot protection and unchanged POP/handover/cashless evidence.

The held-scope test asserts the exact expected member/pool evidence IDs, including owned conflicting rows and exclusion of the intentionally excluded candidate. Aggregate totals alone are not its acceptance signal.

The controlled cycle test isolates the actual captured scope reads; the full-action and race tests independently ensure that earlier paths do not retain broad locks and that necessary rows remain protected. Neither finite success nor existing retry behavior proves universal deadlock freedom.

## 9. Worker timeout, queue lease and recovery

Read-only local configuration remains database queue retry_after=90 seconds. Relevant queue worker flags are --timeout=75, while reconciliation/import jobs declare 60 seconds; reconciliation allows four tries with backoff [15,60,180]. The existing local launcher restarts exit 0/12 workers. No operational setting or worker was changed for this task.

The isolated real-queue drill uses a **two-second fixture lease** and --timeout=1 to make the failure mode observable without a long operational experiment:

- First worker reserves the job and pauses inside its uncommitted reconciliation transaction.
- On this Windows PHP host, the process remains active beyond its timeout; pcntl is unavailable.
- After the fixture lease expires naturally, a second worker reserves the same queue row at attempt 2 while the first is still active. Unique dispatch locking does not prevent overlapping delivery after a queue reservation expires.
- Only the isolated child is terminated; its transaction is rolled back and the second worker completes.
- Queue drains, failed_jobs remains zero, and explicit internal replay produces no new match events.

Evidence: [lease result](evidence/cross-lock-queue-lease.json), [lease test](evidence/cross-lock-queue-lease.log). The experiment does not change a production reservation or claim a real 90-second duplicate occurred.

**The 90-second lease is not certified safe on this host merely because measured trials finish sooner.** A stalled Windows worker is not bounded by pcntl timeout enforcement. Target-host supervision must enforce a known job deadline, and retry_after must exceed that proven deadline with operational margin. Worst-case retries, database lock waits, file work and termination behavior must be included. No replacement numeric values are prescribed from two synthetic samples.

Current measured unchanged action duration reaches 11.73 seconds before and 10.75 seconds after; the deliberately paused queue job exceeds its one-second fixture timeout. These are not worst-case job limits. Maximum target-host execution/termination latency is NOT MEASURED.

Existing M7 three-worker results included a 78.66-second pair and a lock timeout/internal retry; the present patch does not eliminate all same-task serialization. Do not increase concurrency or timeout to hide that risk.

## 10. Equivalent no-change measurements

Native measurements below use the same **MySQL 8.4.11** instance, fixture generator, PHP process settings and 100/1,000/5,000-AWB inputs before and after. Each steady-state reconciliation is repeated twice after an initial warm evaluation. Earlier 8.0.30 results are context, not the before/after denominator.

| AWBs | Before wall ms (two trials) | After wall ms (two trials) | Mean change | SQL before → after | Engine rows examined before → after |  Peak MiB |
| ---- | --------------------------- | -------------------------- | ----------: | ------------------ | ----------------------------------- | --------: |
| 100  | 282.93 / 283.32             | 275.04 / 290.25            |      -0.17% | 93 → 97            | 1565 → 1965                         |   60 → 60 |
| 1000 | 2305.34 / 2563.31           | 2162.60 / 2215.39          |     -10.08% | 94 → 98            | 16065 → 20065                       |   86 → 86 |
| 5000 | 11730.44 / 11580.86         | 10076.75 / 10749.17        |     -10.66% | 102 → 106          | 85065 → 105065                      | 198 → 198 |

At 5,000 AWBs, mean wall time decreases from **11,655.65 to 10,412.96 ms (10.66%)**. The before/after ranges do not overlap in these two trials; only two measurements were taken, so no percentile/capacity or statistical-confidence claim follows. The 100-AWB mean is effectively unchanged; report the small-case variation rather than a universal improvement.

| 5,000-AWB metric                             | Before                | After                 |
| -------------------------------------------- | --------------------- | --------------------- |
| Committed outer transaction ms               | 11,721.64 / 11,556.65 | 10,068.31 / 10,743.25 |
| Reported client SQL ms                       | 1,074.42 / 1,162.06   | 972.53 / 1,023.16     |
| SELECT / INSERT / UPDATE / DELETE statements | 99 / 0 / 3 / 0        | 103 / 0 / 3 / 0       |
| Engine affected rows                         | 0 / 0                 | 0 / 0                 |
| Changed shipment rows                        | 0 / 0                 | 0 / 0                 |
| Match audit events generated                 | 0 / 0                 | 0 / 0                 |
| Serial InnoDB row-lock wait ms               | 0 / 0                 | 0 / 0                 |
| Peak allocated PHP memory                    | 198 MiB               | 198 MiB               |

The **+4 SELECTs and +20,000 examined rows** are the cost of selective, current locking discovery; they are not hidden. Fewer statement calls were not the acceptance goal. The old combined predicates did more expensive work per examined row; this experiment establishes the resulting timing difference, not a pure optimizer/CPU attribution. Serial lock waits were zero on both sides and therefore did not improve; cross-customer cycle elimination is a separate contention result.

The preloaded same-day microprobe was 1,055.53 ms before and 876.26 ms after at 5,000 rows despite that class being unchanged. That variation, assertion overhead and different warm state do not justify claiming an eligibility optimization. No extra model cache or loadMissing guard was added. The existing method's missing-relation and 05:00-boundary behavior now has explicit regression coverage.

Raw repeated measurements: [efficiency NDJSON](evidence/cross-lock-efficiency.ndjson); [derived evidence](evidence/cross-lock-results.json). Each phase retains SQL categories, rows examined/affected, changed rows, transaction time, lock wait, memory and events.

Method: DB query listeners count statements/client SQL time; Performance Schema per-thread deltas count engine affected/examined rows; a registry snapshot counts changed shipments; outer transaction listeners avoid double-counting savepoints. Peak PHP is allocated memory including framework/fixtures/probe, not RSS. Serial lock-wait differences are isolated-server counters. Test setup, measurement queries and migration cost are outside the measured action.

The host also runs ordinary local processes; CPU affinity and exclusive-host load were not controlled. Timing improvements are repeated local observations, not a proven 10.66% causal gain in every deployment. The directly sampled lock footprint and deadlock-counter differences provide stronger correctness evidence than small timing differences.

The same-day preloaded microprobe includes assertion overhead. It is diagnostic rather than a pure function CPU profile. No additional eligibility cache or global input_version skip was implemented: the locking correction already provides measured benefit, and further short-circuiting would require complete source/alias/contract/ownership/baseline dependencies.

Source history matching, category reconstruction, coverage, eligibility and snapshot/manifest hashes still execute on unchanged reevaluation. Avoiding all of this by checking input_version alone would miss valid delayed or changed evidence. Genuine first-state and provenance writes are not classified as waste just by SQL count.

## 11. Verification, commands and preservation

Full backend source gate: **894 files hashed before the run, zero drift afterward**. Initial preservation manifest covers **888 pre-existing source/config/test/frontend/Android/rule files**; only ReconcilePickupProcessing.php and ReconcileCustomerPickupDay.php changed. The three pre-existing M7 edits are unchanged. See [preservation result](evidence/cross-lock-preservation.json) and [full-gate hashes](evidence/cross-lock-full-source-before.json).

New test files are CrossCustomerLockingTest.php, CrossCustomerEfficiencyTest.php, CrossCustomerQueueLeaseTest.php, PickupAwbEligibilityLoadingTest.php, cross-customer-worker.php and tests/Fixtures/cross-customer-locking.php. No additional application helper layer was introduced.

The disposable server had no hardening_* schema remaining and shut down with exit 0; its temporary directory is retained. [Shutdown record](evidence/cross-lock-disposable-final.log). The operational server was neither stopped nor restarted. Existing local workers were inspected read-only; no restart signal was sent for this later patch. PHPStan and scoped formatting pass. The repository-wide frontend lint/format gate was not rerun or repaired; the retained M7 failure is not claimed fixed.

Representative commands:

    composer show laravel/framework --no-ansi
    php artisan config:show queue.connections.database --no-interaction
    $env:CROSS_LOCKING='1'
    $env:HARDENING_MYSQL_PORT='54184'
    $env:CROSS_LOCK_TAG='baseline'
    $env:OPENSSL_CONF='C:/laragon/bin/php/php-8.5.10-Win32-vs17-x64/extras/ssl/openssl.cnf'
    php -d extension=pdo_sqlite -d extension=sqlite3 vendor/bin/pest tests/Feature/CrossCustomerLockingTest.php --compact --do-not-cache-result
    php -d extension=pdo_sqlite -d extension=sqlite3 vendor/bin/pest tests/Feature/CrossCustomerQueueLeaseTest.php --compact --do-not-cache-result
    php -d extension=pdo_sqlite -d extension=sqlite3 vendor/bin/pest tests/Feature/CrossCustomerEfficiencyTest.php --compact --do-not-cache-result
    php vendor/bin/phpstan analyse --no-progress
    php vendor/bin/pint app/Actions/Pickup/ReconcileCustomerPickupDay.php app/Actions/Pickup/ReconcilePickupProcessing.php tests/Feature/CrossCustomerLockingTest.php tests/Feature/CrossCustomerQueueLeaseTest.php tests/Feature/CrossCustomerEfficiencyTest.php tests/Feature/PickupAwbEligibilityLoadingTest.php tests/Feature/cross-customer-worker.php tests/Fixtures/cross-customer-locking.php --format agent
    git diff --check
    git status --short

Performance repeats use CROSS_LOCK_TAG=after-coordinated-lock-patch; final native acceptance uses CROSS_LOCK_TAG=final. The full backend command runs in a fresh shell with HARDENING_MYSQL_PORT=54184 and the same OPENSSL_CONF, without CROSS_LOCKING or other opt-in workload flags:

    php -d extension=pdo_sqlite -d extension=sqlite3 vendor/bin/pest --compact --do-not-cache-result

Environment overrides apply only to test processes. The configured operational MySQL connection is never used for concurrency/load tests. The new native server is initialized with --no-defaults and a new datadir; no existing server is restarted. Only test children are terminated for recovery drills.

Harness-only corrections are retained: invalid contract key/early callback preview; one mixed-action final assertion needed qualified customer_id after joining tables. All completed application-action assertions preceding that diagnostic query were preserved, and the corrected matrix was rerun. No test assertion was removed to obtain a pass.

The three pre-existing M7 modifications in ManageCashlessEntryBatches.php, PilotReportConcurrencyTest.php and pilot-report-worker.php remain. No unrelated file was reset/stashed/overwritten or formatted. New reports/evidence and test files are confined to existing documentation/test directories.

## 12. Remaining risks and operational adoption

- A successful correction of this broad cross-customer scan is not proof of universal lock-order safety, especially for all manual/review/cashless intersections.
- Customer-index scans can still lock other rows/history for the same customer; the requirement measured here is elimination of unrelated customer record locks in the tested scope. Fine-grained composite indexing needs separate approval.
- Query hints rely on existing migration-defined MySQL indexes; verify these names on the target deployment before rollout.
- Existing transactions remain large and source history continues to grow. Wider reports, hot customers, three-worker contention and long retries need target workload acceptance.
- Windows worker timeouts/lease safety remain a pilot blocker until a real enforced deadline is demonstrated.
- No operational worker recycle, cache restart signal or deployment was performed in this task. New source must be adopted through the approved release/recycle procedure and observed afterward. The previous worker-recovery result is not proof that workers loaded this later patch.
- Retained M7 backup restoration, approved source contracts, target supervision/alerting and Android signed-release/physical-device requirements remain. SMTP receipts stay deferred.

## 13. Explicit final recommendation

1. **Cause:** overlapping broad locking scans of the owned-or-NULL-owner shipment predicate. The individual evaluator acquired unrelated locks before aggregation; changing aggregation alone was insufficient.
2. **Reproduced?** The broad-scope cross-customer failure mechanism was reproduced with eight native deadlocks. The fixture PRIMARY/PRIMARY graph differs from the retained operational PRIMARY/secondary graph; both support the scan/lock-cycle root cause, not an exact-plan replay claim.
3. **Correction:** two selective current-read scope rewrites in the existing reconciliation actions, using existing MySQL indexes and preserving final ordering/transactions.
4. **Locked rows:** identifiable PRIMARY records **30,163 → 2,021** for customer A; unrelated customer records **28,142 → 0**. Gap/index entries are reported separately.
5. **Transaction/waits:** repeated 5,000-AWB outer transactions decrease from 11.56–11.72 s to 10.07–10.74 s locally. Serial lock waits remain zero on both sides; controlled cycle deadlocks disappear in tested cases. Same-task report contention remains a separate limit.
6. **Ownership/attribution:** exact evidence sets, shared-account ownership, late conflicts, required-row writer blocking, frozen quantities, cashless evidence and replay assertions pass. This is tested preservation, not a claim covering every possible interleaving.
7. **Lease safe?** **Not certified.** The Windows worker exceeded its timeout and overlapping delivery was demonstrated with a scaled fixture lease. The operational 90-second lease is unchanged and requires a proven target hard deadline.
8. **Cheaper unchanged reconciliation?** Observed 5,000-AWB mean **11.66 → 10.41 s**, with unchanged memory/audits and **+4 SQL / +20,000 examined rows**. Small-case gains are not universal; no further speculative optimization was implemented.
9. **Remaining risks:** operational code adoption, enforced worker deadlines/leases, other lock intersections and larger/history-heavy/hot-customer loads; retained source-contract, restore, monitoring and Android acceptance.
10. **Blocker status:** **PARTIALLY RESOLVED overall**. The tested broad-scan code defect is corrected; runtime rollout/deadline acceptance and pilot prerequisites remain open.

No pilot GO is issued. Review and adopt only the verified small patch; do not expand this work into a transaction redesign, new queue architecture, speculative cache or evidence cleanup.
