# Scenario coverage

All new tests use synthetic data. No destructive test or Process submission targets live JNE. Existing tests use SQLite or disposable MySQL and local Chromium fixtures.

| Required scenario | Existing coverage / gap |
|---|---|
| Vanny: 100 CSS + 3 cashless + 0 manual | Pending category/Sertim/window rules; must assert individual confident links, not only 103 |
| Shared account, several customers | `JneShipperAliasTest`, `HybridApexPipelineTest`: separate alias ownership, real returned accounts, unresolved names stay unresolved |
| Multiple names for one customer | `JneShipperAliasTest`: many aliases, exact normalization, disabled aliases |
| Registered 4000A/4000B aliases | Missing code-alias model/verified source field; no prefix inference permitted |
| 400O instead of 4000 | Candidate-only requirement; code field B3 unresolved |
| Misspelled shipper name | Candidate-only requirement; must never confirm based on similarity |
| Marketplace shipper gives no identity | Unknown sender path exists; explicit marketplace/Sertim regression needed once claim rules verified |
| Sertim AWB arrives later via Hybrid | Gated by B5; source/pickup evidence must persist independently |
| Same AWB in multiple reports | Import/monitoring tests retain source rows and observations; account/AWB registry key currently permits duplicates across accounts |
| Two customers claim one AWB | Alias ambiguity tested; explicit AWB claim conflicts require Sertim |
| Import fails halfway | `JneReportAwbImportTest`: DB error rolls back rows; retry from original checksum-verified file |
| Late APEX result | `CombinedHybridReportTest`/worker fixtures: wait for correlated delayed result; source rows retained; no extra Process click |
| Older tracking observation | `JneMonitoringTest`: history retained, current status does not regress by observation order |
| Equal quantity, ambiguous ownership | `JnePopReconciliationTest`: retained ambiguous/wrong-customer pointers excluded; Vanny 103 total links do not prove 100 CSS classifications |
| Alias corrected after match | `JneMonitoringFlowTest`, `JneShipperAliasTest`: resumable reapplication, conflict with old pickup, manual decision retained |

## Validation commands

On this host SQLite extensions must be enabled explicitly:

```powershell
php -d extension=pdo_sqlite -d extension=sqlite3 vendor/bin/pest --compact <affected test paths>
php vendor/bin/phpstan analyse --no-progress --error-format=raw
php vendor/bin/pint --dirty --format agent
npm test --prefix workers/jne-report
```

When frontend changes are made, also run the relevant frontend test files, `npm run types:check`, the production build and browser verification. See `implementation-status.md` for commands actually executed and their results. Ask the operator to run the full application suite before release; a targeted pass is not a full-suite result.
