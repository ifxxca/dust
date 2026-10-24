# Scenario coverage

All new tests use synthetic data. No destructive test or Process submission targets live JNE. Existing tests use SQLite or disposable MySQL and local Chromium fixtures.

| Required scenario | Existing coverage / gap |
|---|---|
| Vanny: 100 CSS + 3 cashless + 0 manual | `JnePopReconciliationTest`: 103 individually linked AWBs, 3 confirmed cashless, 100 unclassified; Manual expectation zero. CSS category and external completion remain gated, never inferred from the total |
| Shared account, several customers | `JneShipperAliasTest`, `HybridApexPipelineTest`: separate alias ownership, real returned accounts, unresolved names stay unresolved |
| Multiple names for one customer | `JneShipperAliasTest`: many aliases, exact normalization, disabled aliases |
| Registered 4000A/4000B aliases | Missing code-alias model/verified source field; no prefix inference permitted |
| 400O instead of 4000 | Candidate-only requirement; code field B3 unresolved |
| Misspelled shipper name | `JneIdentityEvidenceTest`: Vany Songket, Vanny Sngket and punctuation produce bounded candidates without confirmed customer/pickup |
| Marketplace shipper gives no identity | `JneIdentityEvidenceTest`, `SertimCashlessTest`: marketplace aliases alone cannot establish identity; uncontested explicit AWB evidence can |
| Sertim AWB arrives later via Hybrid | `SertimCashlessTest`, `JnePopReconciliationTest`: claims persist before import; late data matches after closure without modifying POP or closure |
| Same AWB in multiple reports | `JneAwbRegistryTest`, import/monitoring tests: one normalized registry AWB across accounts, multiple original rows/observations; guarded upgrade refuses historical duplicates |
| Two customers claim one AWB | `SertimCashlessTest`, `SertimCashlessConcurrencyTest`: duplicate claims rejected, concurrent MySQL writers cannot both win; contradictory registered ownership flagged |
| Import fails halfway | `JneReportAwbImportTest`: DB error rolls back rows; retry from original checksum-verified file |
| Late APEX result | `CombinedHybridReportTest`/worker fixtures: wait for correlated delayed result; source rows retained; no extra Process click |
| Older tracking observation | `JneMonitoringTest`: history retained, current status does not regress by observation order |
| Equal quantity, ambiguous ownership | `JnePopReconciliationTest`: retained ambiguous/wrong-customer pointers excluded; Vanny 103 total links do not prove 100 CSS classifications |
| Alias corrected after match | `JneMonitoringFlowTest`, `JneShipperAliasTest`: resumable reapplication, conflict with old pickup, manual decision retained |

Additional regressions cover Admin-only post-POP/closure correction (API and service), required reasons, optimistic versions and payload replay, before/after audit, transaction rollback including matching, persisted closure across handover reopen and legacy history backfill. A same-customer report reference conflicting with Sertim leaves customer MATCHED but pickup CONFLICT, with both evidence sources visible for review.

`JneRefreshPolicyTest` verifies new/due/fresh selection, interval floors, recently received old observations, explicit manual refresh, pending/failed guards, empty cycles and exact-AWB errors without external calls. `JneConfidenceMonitoringTest` verifies that candidate/conflict/retained ambiguous pointers never count as confirmed ownership and mismatched pickup customers never count as confirmed pickups. Summary denominators follow the applied list filters.

`SertimCashlessBrowserTest` uses the existing Node/Playwright runtime and a disposable SQLite Laravel server. It exercises staff entry, Admin correction/history, reconciliation, monitoring confidence, shipment evidence and customer dashboard filtering at 390px and 1280px. Screenshots remain ignored local artifacts. Native Android smoke testing remains separate and requires its existing emulator opt-in.

## Validation commands

On this host SQLite extensions must be enabled explicitly:

```powershell
php -d extension=pdo_sqlite -d extension=sqlite3 vendor/bin/pest --compact <affected test paths>
php vendor/bin/phpstan analyse --no-progress --error-format=raw
php vendor/bin/pint --dirty --format agent
npm test --prefix workers/jne-report
```

The complete suite was also run successfully on this Windows host with its existing OpenSSL configuration supplied to the test process:

```powershell
$env:OPENSSL_CONF = 'C:/Program Files/Git/usr/ssl/openssl.cnf'
php -d extension=pdo_sqlite -d extension=sqlite3 vendor/bin/pest --compact
```

Result: 732 passed, five skipped, 6,887 assertions. Without that local setting, 13 existing mocked-push tests fail during OpenSSL fixture-key generation. This is a CLI runtime requirement on this host; no repository dependency or system configuration was changed.

When frontend changes are made, also run the relevant frontend test files, `npm run types:check`, the production build and browser verification. See `implementation-status.md` for results. Before release, the operator should rerun the full application suite in the target environment with `php artisan test --compact`; the local pass does not replace environment-specific validation.
