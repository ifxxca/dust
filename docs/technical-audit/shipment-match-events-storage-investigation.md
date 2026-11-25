# Shipment match-events storage investigation

Date: 29 October 2026. Scope: read-only investigation of the configured local database, plus synthetic reproduction on a separate MySQL instance.

## 1. Executive summary

**The approximately 6.6 GiB file contains millions of live events; it is not demonstrated to be mostly empty allocation.** The initial physical measurement was **7,113,539,584 bytes (6.625 GiB)**. A covering-index count found 7,191,637 rows; the final exact count found **7,293,672 rows at 13:25:28 UTC**. The final filesystem measurement was **7,214,202,880 bytes (6.719 GiB)**. Background application activity continued throughout the investigation.

Repeated automatic CATEGORY history is confirmed in bounded samples. All 180 adjacent pairs in a final sample of the ten newest events for each of 20 shipments had identical full event state/evidence, no category change and no actor. A separate 16-window primary-key sample contained 14,227 CATEGORY events and 450 REFERENCE events; 4,567 CATEGORY entries repeated equivalent states within that sample. This establishes avoidable audit growth, without asserting an exact global duplicate count.

The M6 correction and this table are directly connected: ResolveJneCategories writes method=CATEGORY into jne_shipment_match_events. The current source already compares canonical object keys. Fresh-process tests add no unchanged replay events; restoring only the previous strict-array comparison in an isolated private copy reproduces one redundant event per AWB per pass.

A reconciliation worker predates the fix and remains active. **Stale loaded worker code is LIKELY, not conclusively attributed to a particular live insert.** No operational worker/MySQL restart, queue mutation, data deletion, rebuild, retention change or application correction was performed.

Evidence: [machine-readable investigation](evidence/shipment-match-events-storage.json), [synthetic phase measurements](evidence/shipment-storage-reproduction.ndjson), [final reproduction log](evidence/shipment-storage-reproduction-isolated.log).

## 2. Database and table identification

- Configured database: dust, MySQL **8.4.11**, port **3306**, data directory C:/laragon/data/mysql-8/.
- Verified file: C:/laragon/data/mysql-8/dust/jne_shipment_match_events.ibd.
- InnoDB file-per-table tablespace: ID 651156, name dust/jne_shipment_match_events, SPACE_TYPE=Single, Dynamic row format, 16,384-byte pages. The tablespace FILE_SIZE and ALLOCATED_SIZE both matched the initial filesystem length.
- One unpartitioned table; no partition name. Primary key id; indexed shipment foreign key jne_shipment_id. A unique AWB index on jne_shipments makes events per registry shipment equivalent to events per current AWB identity.
- Event kinds use method, not a separate event_type column. Other columns record previous/current pickup and customer IDs, match/customer-match statuses, actor, reason, created_at and JSON evidence. There is no direct report ID column; relevant source/report/revision references are inside evidence.
- evidence is the only JSON/TEXT-style column: JSON, nullable. There is no TEXT/LONGTEXT column. reason is varchar(500); method/match statuses are varchar(24). Timestamps have no application updated_at.
- PRIMARY plus six nonunique indexes support shipment, previous/current pickup, actor and previous/current customer foreign keys. There is no unique event-state/replay key and no method/created_at index. Shipment deletion has an existing ON DELETE CASCADE; this was not invoked.

SHOW CREATE TABLE, SHOW INDEX, information_schema.TABLES/PARTITIONS/INNODB_TABLESPACES/DATAFILES/TABLESTATS and mysql.innodb_*_stats results are retained in the evidence JSON.

## 3. Physical versus logical storage

| Measurement                                                                  |         Bytes | Interpretation                                                               |
| ---------------------------------------------------------------------------- | ------------: | ---------------------------------------------------------------------------- |
| Initial physical/apparently allocated file                                   | 7,113,539,584 | 6.625 GiB, independently verified by filesystem and tablespace               |
| Intermediate filesystem sample                                               | 7,126,122,496 | Continued physical growth                                                    |
| Final file length, 13:25:27 UTC                                              | 7,214,202,880 | 6.719 GiB; OS apparent length, one second before final row count             |
| Total of 64 visible database .ibd files at intermediate sample, 11:49:09 UTC | 7,685,423,104 | Event file accounts for 92.72% at that sample                                |
| Cached DATA_LENGTH                                                           | 2,494,562,304 | Approximate clustered-index allocation, not verified current logical payload |
| Cached INDEX_LENGTH                                                          |   471,793,664 | Approximate secondary-index allocation, not verified current index size      |
| Cached DATA_FREE                                                             |     6,291,456 | Six MiB; not all reclaimable space or a shrink guarantee                     |
| Cached average row length                                                    |           834 | Engine statistics-derived value, not a measured mean payload                 |

Persistent statistics were last updated at the returned timestamp **2026-10-27 21:49:35**, with estimated 2,988,040 rows, versus more than 7.19 million exact rows. Live approximate table statistics remained similarly low. information_schema_stats_expiry=86400, persistent statistics and automatic recalculation are enabled, and persistent sample pages=20. No setting or statistics were changed.

The cached primary index has 152,256 pages; cached secondary index page counts are 3,237 actor, 7,345 shipment, 4,072 each pickup FK, and 5,034/5,036 customer FKs. These page figures reproduce the cached allocation totals; they do not make those totals fresh.

Subtracting cached data/index/free values from the initial file leaves **4,140,892,160 bytes unclassified by those measurements**. **That is not a reclaimable-space estimate.** Inaccurate/outdated statistics, page occupancy and allocation accounting prevent a defensible current data/index/free decomposition. The sample-based logical field estimate below already exceeds cached DATA_LENGTH.

MySQL documents DATA_LENGTH/INDEX_LENGTH and InnoDB row counts as approximate allocation/statistical values, while FILE_SIZE and ALLOCATED_SIZE describe the apparent and allocated file. See [TABLES metadata definitions](https://dev.mysql.com/doc/refman/8.4/en/information-schema-tables-table.html) and [tablespace file-size definitions](https://dev.mysql.com/doc/refman/8.4/en/innodb-page-compression.html). No inference of recoverable gigabytes is justified from subtraction alone.

## 4. Event counts and growth distribution

Exact covering-index counts were assessed with EXPLAIN first and capped with MAX_EXECUTION_TIME. The narrow actor index supported counting without fetching JSON. The per-shipment distribution used the covering shipment FK index, then sorted only the approximately 30,000 aggregate groups.

| Metric                                          | Measured result |
| ----------------------------------------------- | --------------: |
| Initial exact events                            |       7,191,637 |
| Exact events at distribution statement snapshot |       7,194,207 |
| Later exact events, 13:12:58 UTC                |       7,282,306 |
| Final exact events, 13:25:28 UTC                |       7,293,672 |
| Shipments with events at distribution snapshot  |          30,192 |
| Mean events per shipment/AWB                    |          238.28 |
| Minimum / median                                |           1 / 3 |
| P90 / P95 / P99, nearest rank                   | 830 / 836 / 860 |
| Maximum for one shipment                        |           1,067 |
| Imported source rows at a separate snapshot     |          34,474 |

These statements use separate snapshots; the database was not frozen or globally locked. Auto-increment values, row estimates and ID gaps were not substituted for exact counts.

Sixteen 1,000-ID windows, ranging from ID 13,493 to 7,500,999, returned 14,677 existing events. Distribution in those windows:

| Stored created_at date | Method    | Sample events | Unchanged category-before/after pairs |
| ---------------------- | --------- | ------------: | ------------------------------------: |
| 27 October             | CATEGORY  |        12,000 |                                12,000 |
| 27 October             | REFERENCE |           450 |                                     0 |
| 28 October             | CATEGORY  |           739 |                                   739 |
| 29 October             | CATEGORY  |         1,488 |                                 1,488 |

CATEGORY represents 96.93% of this stratified sample. It is not a random, volume-weighted census. The day-27 windows through IDs around six million show substantial early growth, but do not supply exact daily totals or a measured spike onset. Dates above are stored created_at calendar dates, not operational 05:00–04:59 buckets.

Recent 10,000 events spanned 11:30:14–11:37:15 UTC in one sample; another 2,000-row window spanned only 38 seconds. This shows bursty ongoing production of audit rows, not a stable ingestion/production-capacity rate.

EXPLAIN for a full method GROUP BY showed a wide table scan and temporary aggregation. There is no created_at/method index. Exact whole-table method/day counts and global duplicate detection were deliberately not run against the active database. The exact indexed count took about 1.5 seconds including tool overhead; indexed distribution about 3 seconds including tool overhead. Most bounded payload queries completed in under 1.2 seconds including tool overhead. One tablespace metadata query took about 18 seconds; it was not repeatedly run. Tool elapsed times are not server execution timings.

## 5. JSON payload analysis

The 14,677-row stratified sample measured:

- Mean binary JSON storage: **515.41 bytes**; mean serialized JSON: **478.30 bytes**.
- Approximate mean logical field values: **661.93 bytes/event**, including binary JSON, string lengths and present integer/timestamp values. This excludes engine row/MVCC headers, variable-field prefixes, indexes and page occupancy.
- CATEGORY means near 522 bytes in older windows. The newest 4,999 CATEGORY sample measured about 690 binary bytes on average; maximum 3,237 bytes. A separate recent 2,000-row sample maximum was 2,570 bytes.
- No multi-megabyte evidence object was found in these samples. A full-table maximum is NOT TESTED.

Applying the stratified means to the final exact 7,293,672-event count gives approximately **3.76 GB binary JSON** and **4.83 GB logical field values**, excluding engine/index overhead. These are conditional sample extrapolations, not measured exact active storage or an unbiased confidence interval. Event volume plus per-row/index overhead is consistent with the measured multi-gigabyte file.

The problem demonstrated here is repetition of modest payloads. Removing provenance or truncating evidence to reduce row size is not justified.

## 6. Application write-path map

The event model [JneShipmentMatchEvent.php](../../app/Models/JneShipmentMatchEvent.php) has no custom event-generating boot hook and disables updated_at. Application searches identified six explicit create sites:

| Writer                                                                                             | Trigger/event meaning                                                                   | Replay/change protection                                                                                                                           |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ResolveJneCategories.php:108](../../app/Actions/Reports/ResolveJneCategories.php#L108)            | CATEGORY: category outcome and source evidence                                          | Current lines 103–104 compare category/status and recursively canonicalized object keys; preserve scalar types/list order; review guards at 96–101 |
| [MatchJneShipments.php:310](../../app/Actions/Reports/MatchJneShipments.php#L310)                  | Automatic REFERENCE/CUSTOMER_CODE_DATE/SERTIM/BUCKET_FIFO or deliberate MANUAL decision | Automatic no-change return at 261–262; review/manual/conflict guards; manual row lock and optimistic version at 277–280                            |
| [AllocatePickupAwbBuckets.php:83](../../app/Actions/Pickup/AllocatePickupAwbBuckets.php#L83)       | BUCKET_FIFO ownership allocation                                                        | Transaction locks customer/tasks/registry; only unowned eligible pool rows; removes selected rows from pool; protects locked/review states         |
| [ReconcileCustomerPickupDay.php:134](../../app/Actions/Pickup/ReconcileCustomerPickupDay.php#L134) | BUCKET_FIFO allocation after combined day counts agree                                  | Same transaction; only confirmed rows with NULL pickup owner, suitable unlocked owner and valid baseline                                           |
| [ReviewJneExceptions.php:72](../../app/Actions/Reports/ReviewJneExceptions.php#L72)                | Explicit Admin REVIEW audit                                                             | Authorization, row locks, expected versions and group/evidence validation; identical-looking deliberate decisions are not automatically redundant  |
| [ReviewPickupAwbs.php:67](../../app/Actions/Pickup/ReviewPickupAwbs.php#L67)                       | Admin removes an AWB; exclusion and REVIEW history                                      | Customer/task/shipment locks, version/closure checks and recorded exclusion; ADD delegates to review action                                        |

Flow: stored CSV import -> report AWB rows -> ProjectJneShipments report transaction -> matching -> category resolver -> registry and audit history -> after-commit historical producer -> customer-day reconciliation -> source matching/category reevaluation and eligible allocation. Scheduled pickups:queue-automation and recovery periodically redispatch reconciliation; ReconcilePickupProcessingJob is unique by customer/day while queued/running. Uniqueness does not suppress legitimate later reevaluations.

[ImportReportAwbs.php:19](../../app/Actions/Reports/ImportReportAwbs.php#L19) checks the report's imported state under a transaction; it does not directly create match events. [ProjectJneShipments.php:20](../../app/Actions/Reports/ProjectJneShipments.php#L20) locks the report and intersecting task/shipment state, preserves historical observations, and uses the existing three-attempt internal transaction retry. ReconcilePickupProcessing.evaluate invokes matching/category resolution; therefore unchanged scheduled reevaluation can amplify an incorrect change detector even without another external report.

There are no application event-table update/delete paths in the inspected search. Append-only audit behavior is a convention, not a database prohibition; the shipment FK cascade exists. Tests/factories create synthetic state; normal load/recovery tests guard disposable databases. The local simulation seeder uses explicit SIM_JNE_ACCOUNT/SIM_* markers and is limited to local/testing; its tested rerun behavior is idempotent. Recent 10,000 operational events were associated with neither that seeder account nor SIM_AUTO_ACCOUNT. Historical synthetic contributions outside this sample remain NOT TESTED.

## 7. Repeated events, replay and runtime analysis

The strongest live sample checks adjacent events rather than global hash repetition. For 20 recently active shipments, the newest ten events each were fetched through indexed descending scans. A LAG comparison includes method, previous/current pickup/customer, current statuses, actor, reason and complete JSON evidence, excluding only event ID and created_at. **All 180 adjacent pairs were identical automatic CATEGORY records with unchanged category-before/after.** No intervening recorded decision was skipped in those ten-event histories.

This is distinct from legitimate evidence growth. A new report can add source provenance while category remains unchanged. An Admin can make a required repeated-looking decision. A legitimate A -> B -> A transition can repeat a historical fingerprint. None should be deleted or prohibited by a global UNIQUE(state_hash).

The strict pre-M6 PHP-array comparison treated MySQL JSON object-key order as a difference. [The current comparator](../../app/Actions/Reports/ResolveJneCategories.php#L103) fixes that without sorting lists or relaxing types. Its CATEGORY write targets this exact table, establishing the connection rather than inferring it from the word “category.”

Local runtime observations:

- Dedicated reconciliation PID 20556 started 29 October **12:49:10 +07**, before current category source last-write **15:18:09 +07**.
- Combined queue PID 25712 started **15:50:42 +07**, after that file change.
- Read-only socket mapping associates them with MySQL connections 34/client port 52183 and 20509/client port 57918 respectively.
- Prepared-statement history SQL/digest fields were NULL for the relevant executions; broad per-thread counters cannot attribute a particular CATEGORY insert or prove its loaded PHP class hash.
- No instrumentation consumer, runtime configuration or worker was changed.

Laravel documents that [long-lived queue workers retain loaded code until restarted](https://laravel.com/docs/13.x/queues#queue-workers-and-deployment). Thus stale worker code is a strong operational hypothesis, corroborated by the isolated comparison test, but is classified **LIKELY** until an approved worker recycle/version observation and fresh before/after sampling confirm it. No new current-source replay defect was demonstrated by these synthetic fixtures.

## 8. Controlled synthetic reproduction

Infrastructure: MySQL **8.0.30**, separate native process/port **54182**, data directory containing dust-hardening-mysql-, randomized hardening_storage_* databases. Both parent/children verify port/directory/prefix. Only their own disposable schemas are created/migrated/dropped. The configured port-3306 database is never a test target.

Tests: [ShipmentMatchEventStorageTest.php](../../tests/Feature/ShipmentMatchEventStorageTest.php), [isolated child](../../tests/Feature/shipment-storage-worker.php). Fixtures use a finalized POP/verified handover, unique synthetic AWBs, verified code/category contract, two report identities with the same AWBs, and local CSV storage. Outbound HTTP is prohibited, mail/push disabled, document/reconciliation fanout faked. CSV storage has a unique fake-disk root per test.

Event increments by phase:

| Phase                                                                |    100 AWBs |    1,000 AWBs |    5,000 AWBs |
| -------------------------------------------------------------------- | ----------: | ------------: | ------------: |
| Initial import                                                       |           0 |             0 |             0 |
| Initial projection                                                   |         200 |         2,000 |        10,000 |
| Same report import / same projection                                 |       0 / 0 |         0 / 0 |         0 / 0 |
| Unchanged reconciliation                                             |           0 |             0 |             0 |
| New report with same AWBs                                            |         100 |         1,000 |         5,000 |
| Older report replay                                                  |           0 |             0 |             0 |
| Two actual isolated database queue deliveries                        |           0 |             0 |             0 |
| Customer deactivation / reactivation reconciliation                  |   100 / 100 | 1,000 / 1,000 | 5,000 / 5,000 |
| Injected outer rollback                                              | 0 committed |   0 committed |   0 committed |
| Two overlapping fresh projectors replaying distinct existing reports |           0 |             0 |             0 |
| Old comparison, two category passes                                  |         200 |         2,000 |        10,000 |
| Fresh reconciliation after old comparison                            |           0 |             0 |             0 |

The new report's CATEGORY event is legitimate provenance growth; deactivation/reactivation produces actual matching-state changes. Failed outer transactions preserve customer state/event counts. Overlap preserves current newer-report pointers, two observations per AWB, customer identity and finalized POP quantity. The current-path database queue test asserts one real queued job before each consumption, zero after, no failed job and no additional audit event.

The private legacy fixture is **current source with only its key-order-insensitive comparison replaced by the former strict comparison**, loaded into a separate process; SHA-256 21C669C8C657935C6FFEA6AD458DCEE2AC519C05D5128CCF777EBB8D010136A3. No application file was replaced. This isolates comparison behavior without reverting newer marker/business rules.

Full phase counts, JSON sizes, query counts, duration and committed outer-transaction time are in the reproduction NDJSON; child query/duration counts and rollback preservation are included. Parent phase counts exclude measurement queries. Each child count includes its final event-count SELECT (one measurement statement); child durations include that final measurement as well. Rolled-back trial duration and child transaction durations are not measured. These narrow synthetic cases are not a production capacity benchmark.

Selected 5,000-AWB measurements from the final run (all SQL statements, not SELECT-only counts):

| Phase                                         | SQL statements | Duration (ms) | Committed outer transaction (ms) |
| --------------------------------------------- | -------------: | ------------: | -------------------------------: |
| Initial import                                |             24 |      2,107.28 |                         2,106.90 |
| Initial projection                            |         25,124 |     50,091.66 |                        50,091.47 |
| Same projection                               |            123 |      8,932.21 |                         8,931.91 |
| Unchanged reconciliation                      |            132 |     15,921.82 |                        15,913.61 |
| New report, same AWBs (import and projection) |         15,168 |     28,308.74 |                        28,308.03 |
| Older report replay                           |            123 |     11,143.23 |                        11,143.01 |
| Two actual queue deliveries combined          |            266 |     24,556.13 |                        24,541.30 |
| Legacy comparator, two resolver passes        |         20,015 |     25,815.74 |                     Not measured |

The event-growth comparison isolates the comparator; the legacy resolver and full reconciliation execute different surrounding work, so their durations are not a valid before/after speedup claim. Repeated timing trials and production peak memory were not measured in this storage investigation.

Harness diagnostics are retained separately: the first historical full-class fixture included other older rules, so the test correctly failed before the fixture was narrowed to one comparison. An early queue-fake variant did not actually consume jobs and is labeled provisional, excluded from final results. A subsequent 5,000-row attempt lost its shared fake CSV while a separate category suite reset that shared directory; the final harness uses a unique disk and reruns all sizes. No application failure or assertion suppression is inferred from these harness errors.

Commands:

    php artisan make:test --pest ShipmentMatchEventStorageTest --no-interaction
    php vendor/bin/pint tests/Feature/ShipmentMatchEventStorageTest.php tests/Feature/shipment-storage-worker.php --format agent
    php -d extension=pdo_sqlite -d extension=sqlite3 vendor/bin/pest tests/Feature/ShipmentMatchEventStorageTest.php --compact --do-not-cache-result
    php -d extension=pdo_sqlite -d extension=sqlite3 vendor/bin/pest tests/Feature/JneCategoryEvidenceReplayTest.php --compact --do-not-cache-result
    php vendor/bin/phpstan analyse --no-progress
    .\node_modules\.bin\vp.cmd fmt docs/technical-audit/shipment-match-events-storage-investigation.md docs/technical-audit/evidence/shipment-match-events-storage.json
    .\node_modules\.bin\vp.cmd fmt --check docs/technical-audit/shipment-match-events-storage-investigation.md docs/technical-audit/evidence/shipment-match-events-storage.json
    git diff --check
    git status --short

Environment is process-local: HARDENING_MYSQL_PORT=54182, SHIPMENT_STORAGE_REPRO=1, STORAGE_LEGACY_CATEGORY_FILE=<private temporary clone>, DB_HOST=127.0.0.1, DB_PORT=54182, root/empty password and empty DB_URL; installed PHP extras/ssl/openssl.cnf for OPENSSL_CONF. Final reproduction: **3 passed, 81 assertions, 372,576 ms**. Existing category regressions: **4 passed, 16 assertions, 1,428 ms**. PHPStan: **PASS, zero errors**. Scoped Pint: **PASS**. All 1,549 pre-existing source/config/test files retained their initial hashes, including the three pre-existing M7 modifications. No full unrelated frontend/backend suite is warranted for this read-only investigation and isolated new tests.

## 9. Root cause and explicit answers

| Hypothesis                                                      | Classification | Evidence                                                                                   |
| --------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------ |
| Millions of live audit records explain substantial storage      | CONFIRMED      | More than 7.29 million exact rows; filesystem/tablespace match                             |
| Repeated equivalent automatic CATEGORY records exist            | CONFIRMED      | Adjacent full-state sample; historical windows; isolated strict comparison                 |
| Those repeats dominate the complete historical table            | LIKELY         | CATEGORY is 96.93% of stratified windows; no global method/duplicate census                |
| Stale pre-fix queue worker explains ongoing post-fix repetition | LIKELY         | Worker startup precedes fix, fresh/old process comparison; no live loaded-code fingerprint |
| Current source necessarily duplicates every unchanged replay    | NOT SUPPORTED  | Fresh reproduction and existing M6/M7 regression                                           |
| Very large individual JSON documents are primary cause          | NOT SUPPORTED  | Modest sampled mean/max; full-table maximum not tested                                     |
| Secondary indexes alone explain 6.6 GiB                         | NOT SUPPORTED  | Cached index footprint only about 450 MiB; actual current split unknown                    |
| File is mostly reclaimable/free allocation                      | NOT SUPPORTED  | Millions of live rows; metadata difference cannot prove free space                         |
| Benchmark/seeder accounts explain current recent growth         | NOT SUPPORTED  | Neither marker account in recent 10,000; global historical contribution not tested         |

1. **Why approximately 6.6 GiB?** A large live audit population with hundreds of events for many AWBs, dominated by CATEGORY in bounded samples, plus payload/index/engine overhead. The old comparison reproduces unnecessary multiplicative history. Exact whole-table causal percentages remain unknown.
2. **Active records?** 7,293,672 at 13:25:28 UTC; continuing writes mean this is a dated snapshot.
3. **Mean logical event size?** Approximately 662 bytes of logical fields in the stratified sample, including about 515 bytes binary JSON. Cached 834-byte average is not a measured payload mean.
4. **Data versus indexes/allocation?** Cached 2.495 GB data, 0.472 GB indexes, six MiB free; unreliable for a fresh physical split. Approximately 4.83 GB logical values is an extrapolation, not exact page usage.
5. **Proportional to business changes?** Not universally: consecutive identical automatic events are confirmed. Real state/provenance changes also produce necessary events.
6. **Does unchanged reconciliation add events?** Fresh current fixture: no. Old comparison: one per AWB/pass. Live samples show repeated unchanged automatic events; exact runtime implementation remains unproven.
7. **Imports/retries?** Same import/projection and actual retry add none in fresh cases. A genuinely new report adds evidence and a legitimate CATEGORY audit. Historical replay under old comparison is a demonstrated amplification mechanism.
8. **Bug or expected history?** Both. The already-corrected key-order comparison defect is reproduced; live redundant history is confirmed. A new current-source defect is not proven.
9. **Continued rapid growth?** The active database continued producing duplicates during inspection. A fresh correctly loaded process avoids this amplification in tested cases; genuine new evidence still grows audit history.
10. **Safest prevention?** Obtain approval to gracefully recycle/verify all relevant long-lived workers loading the corrected source, then remeasure adjacent event growth. Do not erase history or invent a unique-state/retention policy.

## 10. Data-integrity implications

Audit events are evidence, not disposable cache. Preserve original rows, source provenance, deliberate Admin decisions and real returns to earlier states. Repeated category checks do not by themselves prove shipment duplication or quantity corruption: AWB identity is separately unique, and the isolated tests retain observation/identity/POP baselines.

Redundant category writes increment shipment versions and increase lock/write/audit costs. They can complicate operator history and optimistic concurrency, even when final business values stay unchanged. The investigation did not demonstrate lost shipments, silent edits to finalized POP, reopened handovers or cross-customer reassignment.

Do not deduplicate all equal fingerprints, category-before=after rows, or actor=NULL events. Those predicates also match legitimate new evidence. Any historical classification/removal requires separately approved audit/retention semantics and verifiable source/history analysis.

## 11. Prioritized recommendations

1. **Operational, approval required:** verify the intended current source hash and gracefully recycle relevant queue workers after checking supervision and current job safety. Do not restart MySQL, interrupt uncertain external actions or blindly retry reports. Record new PIDs/version evidence and compare adjacent CATEGORY history before/after.
2. **Application:** retain the existing canonical-object comparison and strict type/list-order regression. No new application patch is justified until fresh-runtime behavior on an isolated approved representative input is tested. If a fresh process still repeats identical evidence, propose the smallest current-state/provenance guard with regression before implementing it.
3. **Diagnostics:** in a separate approved change, consider worker build/version provenance and a bounded duplicate-growth diagnostic. This investigation does not install monitoring or choose thresholds.
4. **Query/index:** use existing indexed per-shipment history and primary-key windows. Do not add method/date indexes solely to perform this one investigation. Evaluate regular operational query needs on an approved clone before proposing index write/storage costs.
5. **Archival/retention:** discuss only with the business/audit owner after unnecessary growth is controlled. No event deletion, policy duration, archival job or new uniqueness constraint is proposed as an automatic fix.

## 12. Safe storage-reclamation options

**Defensible reclaimable-space estimate: unknown.** Six MiB DATA_FREE and the 4.14 GB metadata residual are not promises of disk recovery. A file-per-table rebuild would not prevent repeated event creation and could reclaim much less than an incorrect subtraction suggests.

The safe next storage step is an approved, restored isolated clone: verify row/source/evidence consistency, obtain fresh statistics there, inspect allocation and measure a compact rebuilt copy under controlled conditions. Record disk headroom, elapsed time, locks, exact event counts and preservation checks. Only then propose a production maintenance operation and its recovery plan for separate approval.

No OPTIMIZE/ALTER/DROP/DELETE/TRUNCATE/REPAIR, ANALYZE, migration, .ibd manipulation, backup/restore or MySQL restart was performed against dust. No reclamation or archival was executed anywhere as part of this investigation.

## 13. Remaining unknowns and preservation

Not established: exact global CATEGORY/duplicate/daily totals; global JSON maximum and exact current logical/index/page allocation; per-live-event PHP class version; full historical synthetic-data contribution; a guaranteed reclaimable byte count; current target production behavior outside these local fixtures.

Sampling is intentionally bounded. Full scans of the multi-gigabyte payload were avoided. Short indexed counts/aggregations were explain-reviewed and time-capped. Read-only SELECT metadata can still consume resources; this report does not claim zero database load.

The repository started at HEAD 4ae1fcb81bade35c16ef2c1da517afd2b34631e6 with the three pre-existing M7 modifications in ManageCashlessEntryBatches.php, PilotReportConcurrencyTest.php and pilot-report-worker.php, plus untracked audit/UI/output artifacts. Those are preserved. New work consists of two isolated test files, this report and storage-investigation evidence. No application file, dependency, schema, credential, environment, retention rule or business policy changed; nothing was committed/pushed/deployed.

Final source preservation, test results and server shutdown are included in the machine-readable evidence. The disposable server was shut down successfully (exit 0), with no hardening_storage_* database remaining. The existing port-3306 MySQL server was not restarted or modified.
