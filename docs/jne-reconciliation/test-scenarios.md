# Scenario coverage

Updated 25 October 2026. All engineering scenarios use synthetic data and disposable SQLite/MySQL/local Hybrid/APEX browser fixtures. No destructive test or Process submission targets live JNE.

## Required business scenarios

| # | Scenario | Positive and false-positive protection | Executable evidence |
|---|---|---|---|
| 1 | Vanny 100 CSS + 3 Cashless + 0 Manual | Separate customer/pickup/category confidence; requires explicit completeness; equal counts with uncertain pointers stay REVIEW | JneConfiguredReconciliationTest, JnePopReconciliationTest |
| 2 | Account shared by customers | Verified code/alias/Sertim evidence resolves individually; account-only row has no owner | JneConfiguredIdentityTest, JneShipperAliasTest |
| 3 | Multiple sender names | Registered aliases resolve; conflicting owners across reports remain conflict | JneIdentityEvidenceTest, JneShipperAliasTest |
| 4 | Registered 4000A/4000B | Exact verified aliases match 4000 customer; 4000C prefix alone does not | JneConfiguredIdentityTest |
| 5 | 400O/400OB typo | Candidate suggestions only, originals unchanged | JneConfiguredIdentityTest |
| 6 | Misspelled shipper | Bounded candidates, no confirmed ownership/pickup | JneIdentityEvidenceTest, jne-customer-candidates.test.tsx |
| 7 | Marketplace identity absent | Tokopedia/Shopee alone do not resolve; uncontested explicit Sertim may | SertimCashlessTest, JneConfiguredIdentityTest |
| 8 | Sertim before delayed Hybrid | No registry shipment invented by scan; late source matches after close | SertimCashlessTest |
| 9 | Same AWB in multiple reports | One canonical registry row across accounts; source rows/observations retained | JneAwbRegistryTest, JneSourceEvidenceTest |
| 10 | Two customer claims | Global active-AWB uniqueness and transactional rollback; contradictory source evidence flagged | SertimCashlessConcurrencyTest, SertimCashlessTest, JneConfiguredIdentityTest |
| 11 | Halfway import failure | Atomic import/retry, checksum idempotency and no duplicate AWBs | JneReportAwbImportTest |
| 12 | APEX arrives late | Saved successful sources retained; exact-set final import; old/unknown later source invalidates completeness | CombinedHybridReportTest, HybridApexPipelineTest, ApexBatchRecoveryTest, JneConfiguredReconciliationTest |
| 13 | Older tracking refresh | Newer status retained; receipt distinguished; duplicate times do not confirm terminal status | JneRefreshPolicyTest, JneConfiguredRefreshPolicyTest, JneMonitoringTest |
| 14 | Equal POP counts, ambiguous identity | Uncertain/wrong-owner pointers excluded and final reconciliation blocked | JnePopReconciliationTest, JneConfiguredReconciliationTest, JneOperationalVisibilityTest |
| 15 | Corrected alias after matching | Fenced replay; contrary historical evidence and reviewed result flagged; sources unchanged | JneIdentityEvidenceTest, JneExceptionReviewTest, JneConfiguredIdentityTest |

## Additional implementation acceptance

- Durable APEX: stable start UUID, exact AWB/checksum validation, saved-batch reuse, uncertain replay blocked, active Admin reasoned restore/no-submission review. Node restart fixture uses 6,001 AWBs and avoids repeating batch one.
- Verified configuration: activation disabled by default, nullable code column, draft verification in place, stale version rejection, superseded contract blocked, account/date scope with missing/invalid entry date.
- Category/collection: configured literal and Hybrid-origin evidence, conflicting process categories, required report completeness, failed reports/roles/versions/request UUIDs, late rows from older jobs and new unowned required-scope AWBs.
- Sertim: staff correction after final POP denied, Retail after closure denied, Admin reason/audit permitted, normal closed entry denied, late import/reconciliation allowed, duplicate/foreign claim rejected, reopen latch persistent and finalized POP unchanged.
- Exception review: mixed/stale/unauthorized batches fail atomically, equivalent decisions audited, unchanged replay preserved, changed evidence conflicts, category override and explicit release do not rewrite source cells or create aliases.
- Tracking: configured status intervals/receipt floors, new/risk ordering, source hours, bounded failure backoff, no uncertain external retry, consecutive distinct terminal observations and transition reset.
- Visibility: applied shipment filters, multiple source observations versus AWB grain, strict actual customer/pickup agreement, nullable unconfigured categories, separately labeled global failures/pending Sertim and policy gates.
- Actual Chromium: existing staff pickup, Admin correction/audit, verified/draft alias forms, external OPEN/COMPLETE attestation, equivalent review, inactive tracking draft, detail/customer scope and responsive 390/1280 views.

## Verification commands

On this Windows host run PHP with SQLite extensions enabled. The complete suite also uses its existing Git OpenSSL configuration only for the process.

- php -d extension=pdo_sqlite -d extension=sqlite3 vendor/bin/pest --compact [affected paths]
- Set process OPENSSL_CONF to C:/Program Files/Git/usr/ssl/openssl.cnf; then run the same command without paths for the complete suite.
- php vendor/bin/pint --dirty --format agent
- php vendor/bin/phpstan analyse --no-progress --memory-limit=1G
- npm exec -- vp test run [JNE frontend test paths]
- npm run types:check
- npm run build
- npm test --prefix workers/jne-report
- php -d extension=pdo_sqlite -d extension=sqlite3 vendor/bin/pest --compact tests/Feature/SertimCashlessBrowserTest.php

Current results and exact commit references are in implementation-status.md. The final frozen full suite supersedes an earlier run that overlapped a browser-fixture extension. Five pre-existing opt-in device/disabled-feature cases are skipped, never presented as passed.

Final engineering result: 756 PHP tests passed, five skipped, 7,067 assertions; 89 JNE frontend tests and 75 worker tests passed. PHPStan, Pint, both TypeScript projects, production build and complete responsive Chromium fixture passed. All six new operational gates remain false and the five continuation migrations remain pending.

Run php artisan test --compact in the target UAT/release environment as well. Real report samples, source semantics, policy decisions and operator acceptance belong to uat-plan.md; fixtures establish engineering behavior, not operational certification.
