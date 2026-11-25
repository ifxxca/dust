# Verification record

## Scope, preservation and environment

Audit date: **29 October 2026, Asia/Bangkok**. Repository: S:/2026/dust. HEAD before and after: **08c2c075fafffde5b675ce5dd8da54a4e21db0ef**. The original working tree contained extensive pre-existing modified and untracked development; no clean-tree assumption was made. No checkout, stash, reset, commit or push was performed.

[evidence/working-tree-before.txt](evidence/working-tree-before.txt) and [evidence/working-tree-after.txt](evidence/working-tree-after.txt) capture full porcelain status, diff numstat and HEAD. SHA-256 comparison of **3157 pre-existing tracked and non-ignored untracked files** outside this audit directory found **0 changed, 0 added, 0 removed**. See [source-integrity.json](evidence/source-integrity.json) and [source-before.json](evidence/source-before.json). The only new deliverable area is docs/technical-audit/.

Ignored runtime caches, temporary test storage, generated build outputs and secret/environment files are outside that hash claim. Tests may create normal ignored cache/temp artifacts. No application source, environment/credential file, dependency manifest/lockfile or migration was edited. Database access outside isolated tests was metadata/read-only EXPLAIN only. No application data was exported into the audit.

The project has no .ai/rules directory; therefore no index/glob/keyword rule files existed to read. AGENTS.md and supplied project rules were applied. Domain skills read: laravel-best-practices, testing-best-practices (including isolation/review guidance), inertia-react-development, fortify-development, Postman api-engineer/api-simulation, and UI reference skills ui-ux-pro-max, web-design-guidelines and shadcn. No skill instruction was used to modify behavior or publish anything.

Boost was initially unavailable, then became available. application_info confirmed PHP 8.5/Laravel 13.35/MySQL. Composer direct versions and actual installed JS package manifests were also inspected; declared ranges were not substituted for installed versions. No package installation or advisory database download was performed.

## Commands and read-only tools executed

Commands below ran from the repository root unless a working directory is stated. Inventory reads were batched using PowerShell Get-Content/Get-ChildItem/Test-Path and rg/rg --files, including bounded Select-Object slices. Some initial probes used nonexistent generic filenames, a Bash-style brace expansion/glob or an invalid PowerShell pipeline form; those read-only probes failed, were corrected, and had no mutation effect.

| Command / tool | Result |
|---|---|
| Get-Location; git status --short / --porcelain=v1; git diff --numstat; git rev-parse HEAD | Baseline and final evidence captured |
| rg --files over app, routes, config, bootstrap, migrations, tests, mobile, Android, docs and CI | Major modules and prior reports inventoried |
| Get-Content AGENTS.md; Test-Path .ai/rules; attempted .ai/rules/index.md | .ai/rules absent; no generated rules |
| composer show --direct; composer.json/package.json/worker package manifests | Installed PHP versions verified; no install/update |
| php --ini; php -m; Get-Command php | PHP 8.5.10 at C:/laragon/bin/php/php-8.5.10-Win32-vs17-x64/php.exe; default CLI lacks SQLite modules |
| Test-Path ext/php_pdo_sqlite.dll and ext/php_sqlite3.dll; php -d extension=pdo_sqlite -d extension=sqlite3 -m | Existing SQLite drivers available; activated only for individual test invocations, no php.ini edit |
| php artisan route:list --except-vendor --json | 151 non-vendor routes; retained in evidence/routes.json |
| node -p installed package version JSON | Node 24.21.0; React 19.3.0; Inertia React 3.9.1; TypeScript 5.9.3; Vite 8.3.4; Vitest 4.1.11 |
| Boost application_info, database_schema(summary=true), focused database_schema | MySQL metadata and indexes verified, evidence/schema-indexes.json |
| Boost search_docs scoped to laravel/framework | Locking/queue timeout/retry/eager-loading documentation consulted; no implementation changes |
| Boost search_docs scoped to inertiajs/inertia-laravel | Partial closure evaluation and polling/background behavior consulted |
| Boost database_query: information_schema.TABLES TABLE_ROWS | Approximate metadata only, no exact business-count claim |
| Boost database_query: two EXPLAIN statements | Retained in evidence/query-plans.json; no queries executed for timing |
| git ls-files --cached --others --exclude-standard + Get-FileHash -Algorithm SHA256 | Before/after preserved-file comparison; 3157 equal files |
| Read referenced source lines and validate anchors | 53 finding references exist; evidence/source-excerpts.json |

No artisan scheduler/worker/import/scraping command was run against the application database. route:list boots the app for route inspection; it does not run the registered dev commands.

## Safe backend test execution

Before execution, phpunit.xml and tests/Pest.php/TestCase.php were inspected. Test config selects SQLite :memory:, array cache/session/mail, sync queue, disabled pickup automation/sending and evidence/category feature gates by default. No cached bootstrap configuration was present; no inherited DB environment variable names were listed. The selected tests were checked for outbound calls, database setup, process execution and required fakes. Tests that enable automation use fake queues/storage where required. No production worker consumes these in-memory test records.

Initial command:

```powershell
php vendor/bin/pest tests/Feature/PickupResultTest.php tests/Feature/MobileExecutionTest.php tests/Feature/JneConfidenceMonitoringTest.php tests/Feature/CashlessEntryBatchTest.php tests/Feature/CustomerPickupDayReconciliationTest.php --compact --do-not-cache-result
```

Result: **57 setup errors, zero assertions**, “could not find driver” for SQLite. This was an environment setup limitation, not a business test failure. The same command was rerun with already-installed drivers:

```powershell
php -d extension=pdo_sqlite -d extension=sqlite3 vendor/bin/pest tests/Feature/PickupResultTest.php tests/Feature/MobileExecutionTest.php tests/Feature/JneConfidenceMonitoringTest.php tests/Feature/CashlessEntryBatchTest.php tests/Feature/CustomerPickupDayReconciliationTest.php --compact --do-not-cache-result

php -d extension=pdo_sqlite -d extension=sqlite3 vendor/bin/pest tests/Feature/JneMonitoringTest.php tests/Feature/JneConfiguredReconciliationTest.php tests/Feature/CashlessHandoverTest.php tests/Feature/SplitHybridReportTest.php --compact --do-not-cache-result

php -d extension=pdo_sqlite -d extension=sqlite3 vendor/bin/pest tests/Unit --compact --do-not-cache-result
```

| Selection | Pass | Fail | Assertions |
|---|---:|---:|---:|
| First five Feature files | 57 | 0 | 773 |
| Next four Feature files | 64 | 1 | 493 reported |
| Unit directory | 2 | 0 | 4 |

The one Feature failure is CashlessHandoverTest.php:46. The factory-created baseline lacks an unselected DB-default cashless_capture_hash key; the refreshed row contains that key with null. This is a snapshot-shape discrepancy. It does not prove the endpoint changed a finalized POP business value. No test was edited or deleted.

The full PHP suite and MySQL concurrency tests were **not run**. PickupTakeoverConcurrencyTest.php and ReportJobConcurrencyTest.php explicitly create/drop isolated databases and run migrations. This audit's prohibition on destructive database commands takes priority; a future disposable CI run can exercise them.

## Static and client checks

```powershell
npm run types:check
php vendor/bin/phpstan analyse --no-progress --error-format=table
node node_modules/vitest/vitest.mjs run resources/js resources/mobile/src --config vite.mobile.config.ts --mode development --root .
```

- TypeScript passed for both web and mobile projects.
- PHPStan returned one property.notFound error at database/factories/CashlessEntryAlertFactory.php:23: findOrFail accepts scalar/list input in its inferred type, yielding model-or-collection and an unresolved created_by property.
- Scoped Vitest returned **245 passed, 1 failed**, 32 files. Jne-monitoring.test.tsx:162 expects help copy rendered in the initial static output, while jne-shipment.tsx:204 gates the editor containing that copy behind editingPickup. The rendered source fields still satisfy preceding assertions; no manual-match backend defect is implied.

An initial unscoped Vitest command used the same config/root but omitted resources/js and resources/mobile/src filters. It also discovered six Node node:test worker files, yielding six “No test suite found” collection failures. Its client results were likewise 245/246. A later interrupt targeted the already-finishing session; it returned the completed failed result. The corrected scoped run is the authoritative client count. These runner-discovery errors are not counted as application failures.

The existing mobile Vite config was used because it supplies the shared alias and API constant without the web Wayfinder generation plugin. No verification config/script was added to application source. No npm build, formatting/fix command or route generation was run. PHP files were not edited, so Pint was not run.

## Worker integration tests

The api-simulation skill was consulted. Existing tests already provide real loopback HTTP/Chromium stand-ins; no Postman workspace initialization, mock publication or new proxy was necessary for this audit. The specific selected test files and fixtures were inspected first. They bind 127.0.0.1, use fixture credentials/data and temporary directories, and do not load real account environment configuration.

Working directory: S:/2026/dust/workers/jne-report.

```powershell
node --test test/cashless-entry-api.test.mjs

node --test test/worker.test.mjs test/hybrid-apex.test.mjs test/hybrid-jobs.test.mjs test/hybrid.test.mjs test/cashless-entry.test.mjs test/cashless-entry-api.test.mjs
```

First smoke run: 2/2 passed. Full selected run: **112/112 passed**, zero skipped/cancelled. The smoke cases are included in the 112, not additive. Tests validate lost acknowledgment identity, uncertain side-effect holds, batches/history correlation, large local fixtures and no duplicate external Process. See evidence/checks.json for final command result and summary.

No real Hybrid/APEX scraping, external cashless submission, FCM notification or SMTP send occurred.

## Profiling evidence and limits

[evidence/query-plans.json](evidence/query-plans.json) contains exact SQL and observed plans:
- newest-first global shipment page uses jne_shipment_list_order, Backward index scan, estimated rows=20;
- UPPER(TRIM(customer_code)) exact lookup uses ALL, no key, estimated rows=1082.

These plans support index-access conclusions only. They are not measured execution time, query count, throughput or production-scale proof. No EXPLAIN ANALYZE, load benchmark, RSS trace, slow-query capture, lock-wait/deadlock trace, bundle analysis or browser render/network profile was performed.

No new N+1 was runtime-confirmed. TA-02/03/04 are Strong evidence from traced call paths, not merely naming conventions. TA-10 enqueue loss and TA-13 deployed-control gaps remain Potential. The receipt kill/SMTP and lock-order scenarios are explicit verification recipes, not claimed reproductions.

## Documentation consistency and completion

All ten requested Markdown deliverables were created. The findings register is canonical for IDs, confidence, severity and priority; domain reports explain the same issues and positive evidence. Main source links resolve relative to the repository and include exact line anchors. Final validation found 81 resolving local links, 13 finding detail sections with all eight required parts, and 53 valid source anchors. Classifications and before/after working-tree preservation were checked. See evidence/document-validation.json.

This audit inspected the major customer, pickup, proof, handover, cashless, report, identity, reconciliation, tracking, dashboard, frontend, Android, test and runtime paths. It is a comprehensive repository review with selected safe checks, not exhaustive execution of every endpoint or certification of production operations. Source hashes show preserved pre-existing work. Remediation has not started.

