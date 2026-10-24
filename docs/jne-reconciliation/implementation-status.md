# Implementation status

Updated 24 October 2026. Baseline commit: `d918714` on `codex/ui-ux-remediation`. Unrelated work remains untouched; no push is authorized.

| Milestone | Status | Evidence / outstanding gate |
|---|---|---|
| M0 | Complete | Code/schema/routes/worker/UI/test discovery and implementation matrix written |
| M1 | Safe integrity increment implemented and tested; operational acceptance partial | Missing/corrupt originals stop combination; identical authorized reupload restores originals; Admin rechecks without recollection. B1/B2 operator acceptance and durable APEX batch checkpointing unresolved |
| M2 | Registry increment implemented; source contracts partial | Unique normalized AWB registry across accounts; all original report rows/observations preserved; upgrade blocks historical duplicates. Sparse identity handling follows in M3; code/category fields remain unverified |
| M3 | Safe identity increment implemented; code/scope gates remain | Historical exact evidence retained separately from tracking chronology; conflicting owners flagged; typo suggestions stored/displayed without assignment; source/alias IDs audited. Code field and scoped aliases still need B3/B4 |
| M4 | Complete for initial web workflow | BR-SERTIM-01–04 enforced by backend policy/action; assigned staff capture before finalization; Admin-only audited correction/add/revoke; persistent first closure; late import/re-evaluation; pickup and handover UI with paginated audit history |
| M5 | Safe category increment implemented; business gates remain | Effective POP per category; cashless claims compared only with independently confirmed customer/pickup; other AWBs remain unclassified; shortfalls provisional and missing quantity unknown until B6/B7 |
| M6 | Safe review increment implemented; full workflow partial | Historical source and decision evidence exposed; Sertim versus another pickup reference conflicts without losing valid customer identity. Existing alias/report/manual review and replay reused; scoped batch decisions remain gated |
| M7 | Safe due-selection increment implemented; business policy partial | Scheduled per-AWB receipt intervals, configurable status minimums, existing manual override and failure/concurrency gates; observation/receipt/failure exposed separately. SLA and terminal confirmation remain B8 |
| M8 | Safe operational increment implemented; finality metrics gated | Filtered collected/customer/pickup confidence, candidate/conflict review links, strict customer dashboard scope and snapshot diagnostics. Final category/missing/completion metrics still need B6/B7 |

## Validation ledger

- Before code changes: 150 affected PHP tests passed, 1,217 assertions; eight report/import/monitoring/alias/scheduling suites including the local combined Chromium pipeline fixture. No live JNE requests.
- Worker fixture suite: 74 tests passed; real local Chromium against synthetic Hybrid/APEX, no live JNE.
- M1 integrity increment: 16 PHP pipeline tests passed, 382 assertions, including missing/corrupt source recovery without recollection.
- M1 PHPStan and Pint passed. Existing UI exposes file recheck on the report-run page; TypeScript/frontend validation is recorded with the final verification below.
- M1 TypeScript checks and 11 report-flow frontend tests passed.
- M2: 101 affected import/registry/monitoring/refresh/dashboard tests passed, 936 assertions; Pint and PHPStan passed. Includes atomic projection failure/replay and guarded duplicate upgrade. The scoped local migration was subsequently applied as recorded below.
- M3: 89 identity/monitoring/alias/reapplication PHP tests passed, 654 assertions; PHPStan/Pint passed. 33 relevant frontend tests and both TypeScript projects passed. Covers sender typos, sparse refresh, late conflicting ownership, marketplace labels and historical alias correction.
- M4: 19 focused backend tests passed, 121 assertions; disposable MySQL concurrent-claim test passed (one claim wins, one is rejected). 134 affected identity/pickup/handover regression tests passed, 1,089 assertions, before the additional history/rollback cases. PHPStan/Pint/TypeScript and production build passed.
- Chromium exercised actual staff capture and Admin post-closure correction/audit against a disposable SQLite application at 390px and 1280px. One browser test passed, seven PHP assertions plus browser checks; no browser runtime errors. A discovered small-screen overflow was corrected and the test rerun. Synthetic screenshots are under ignored `storage/app/private/jne-reconciliation-ui`.
- Four scoped migrations were applied to the local MySQL database after the 6,900-row/6,900-normalized-AWB preflight passed: registry uniqueness, candidate/event evidence, cashless claim/events, and persistent Sertim closure with history backfill. No report was submitted, schedule enabled, live customer attribution rebuilt or POP quantity changed.
- M5: 49 reconciliation/monitoring/Sertim tests passed, 335 assertions; both TypeScript projects and Pint passed. Vanny 100 CSS + 3 cashless, delayed data/replay, excess/effective POP revision, and retained ambiguous/wrong-customer pickup pointers covered. Production build and actual Chromium reconciliation page at 390px passed with no root overflow or runtime errors.
- M7: 54 refresh/scheduling/monitoring tests passed, 332 assertions; 33 monitoring/detail frontend tests, TypeScript, PHPStan and Pint passed. Fresh/due boundary, status minimums, old snapshot receipt, manual override, pending/failed guards, empty local-only cycle and exact-AWB failure detail covered.
- M6 review increment: 58 Sertim/identity/monitoring/reconciliation tests passed, 395 assertions, including a marketplace AWB with uncontested customer but conflicting pickup references. Source rows and both kinds of evidence are exposed in Admin review; no automatic permanent alias is created.
- M8: 88 affected confidence/dashboard/monitoring/alias tests passed, 882 assertions; three focused confidence tests rerun after fixture cleanup (143 assertions). 36 relevant frontend tests, both TypeScript projects, PHPStan/Pint and production build passed. Expanded real Chromium flow verifies confidence counts, receipt diagnostics, evidence review and dashboard filtering.

## Business decisions and limitations

See `business-rules.md` unresolved B1–B4/B6–B8. Sertim correction and first-close rules are confirmed and implemented; no further approval is needed for them. A local fixture pass does not certify live JNE availability or unverified source/mapping meanings.

The first complete PHP run executed 737 tests: 719 passed, five skipped and 13 existing push-notification tests errored because this Windows PHP could not find its OpenSSL configuration when generating fixture keys. Those two suites then passed (52 tests, 213 assertions) with the existing Git OpenSSL config supplied only to the test process via `OPENSSL_CONF`. No application/test dependency or host-wide configuration was changed. Final complete-run result is recorded below when finished.

## Commit ledger

- `323c402` — M0 discovery, implementation matrix and roadmap.
- `169fd69` — M1 stored Hybrid integrity and safe recovery increment.
- `06268f5` — M2 global AWB registry and guarded uniqueness upgrade.
- `9580a2e` — M3 historical identity evidence and non-authoritative typo candidates.
- `c9c343d` — M4 cashless Sertim, backend authority and audited Admin corrections.
- `3136e07` — M5 verified cashless/category POP comparison and provisional shortfalls.
- `7a3a35c` — M7 conservative per-AWB due selection and refresh diagnostics (independent of gated scoped exception rules).
- `2177512` — M6 source/decision review and conflicting Sertim/report pickup evidence.

Each completed milestone or clearly bounded safe increment is committed separately. Remaining references and final validation will be recorded here as work proceeds.

## Delivery report

### 1. Completed scope

M0 discovery is complete. M4 is complete for the initial responsive web workflow and confirmed BR-SERTIM-01–04. Independently tested increments cover M1 integrity/recovery, M2 canonical registry/provenance, M3 historical identity/candidates, M5 category expectations and cashless reconciliation, M6 evidence review/conflicts, M7 conservative refresh selection and M8 confidence visibility. Other milestone exit criteria remain partial where identified in the table; no blanket PASS is claimed.

### 2. Existing components reused

The Laravel report job/event queue, private report disk, four Hybrid child processes, Node/Playwright worker, APEX validation/download, atomic importer, observations, shipper mappings and resumable mapping runs remain the foundation. Pickup tasks, finalized POP/revisions, handover sessions/items/events, policies, Inertia/React, Wayfinder and installed UI components are reused. No dependency, microservice or additional infrastructure was introduced.

### 3. New and modified components

- Collection: `CombineHybridReports` verifies saved evidence; `ManageReportJobs` restores identical originals and rechecks locally; the existing run page exposes recovery.
- Registry/identity: `ProjectJneShipments`, `ResolveJneCustomers`, `MatchJneShipments` and `SyncJneCustomerMappings` preserve historical evidence and conflicts. `SuggestJneCustomers` and `jne-customer-candidates.tsx` supply candidate-only typo review.
- Sertim: `RecordCashlessAwb`, `ReevaluateJneAwbs`, `PickupCashlessAwb`/events, request/controller and isolated task policy abilities implement transactional capture/correction/history. `CloseSession` persists first closure. `pickup-cashless-awbs.tsx` is integrated into the existing pickup wizard/task detail/handover detail.
- Reconciliation/monitoring: `QueryCashlessReconciliation` and `BuildJnePickupReconciliation` batch effective POP/category results. Existing reconciliation, shipment, alias, monitoring and customer dashboard views expose the separate outcomes. `QueryActiveJneAwbs` and the existing scheduler use receipt-based due selection and existing recovery guards.

### 4. Database changes

Four migrations: global unique normalized `jne_shipments.awb` with guarded duplicate preflight; candidate JSON on shipments plus evidence JSON on match events and source-AWB index; current `pickup_cashless_awbs` claims plus append-only `pickup_cashless_awb_events`; persistent `handover_sessions.sertim_closed_at` with closed/reopened history backfill. Claims use global active-AWB uniqueness, optimistic versions and unique idempotency submissions. Current claim and event history deliberately represent current state versus immutable prior evidence. Foreign keys restrict destructive orphaning.

These four migrations were applied locally after preflight; no production deployment is claimed. Original CSV/source values, finalized POP quantities and physical handover history were preserved.

### 5. Automatic matching rules

Exact active registered sender mappings and uncontested explicit Sertim evidence may confirm customers. Verified customer plus exact effective/finalized references or uncontested Sertim may confirm pickups. All source observations participate in identity resolution independently of latest tracking chronology. Conflicting owners/references are flagged. Existing manual decisions are preserved for explicit review when contradictory evidence appears. Account, counts, code prefixes, marketplaces and fuzzy similarity do not prove identity. Customer code/code-alias automation awaits an authoritative source field; it is not fabricated.

### 6. Human review

Review candidate typos, ambiguous/global aliases, contradictory source ownership, Sertim versus another pickup reference, rejected duplicate claims, unresolved source data, provisional POP shortfalls/excess and failed/uncertain reports. Admin corrects finalized/closed Sertim only through the reasoned, versioned audit flow. A correction never silently saves a permanent alias. Alias registration remains a separate explicit action and existing replay safely re-evaluates affected data. Review UI exposes original observation fields and recorded source/alias/Sertim/reference evidence; complete Sertim event history is paginated.

### 7. Validation

See the validation ledger and final verification. Tests use synthetic data, disposable SQLite/MySQL and local Hybrid/APEX browser fixtures. No destructive testing contacted live JNE. No worker source contract, live schedule or operational customer match was rebuilt to exercise the tests.

### 8. Known limitations

Manual/CSS and non-Sertim category ownership, external collection completion and final missing/reconciled states remain unknown. Durable intermediate APEX multi-batch checkpoints, generic equivalent-evidence batch decisions, scoped alias migration, terminal confirmation and business-specific SLA priorities remain outstanding. Fuzzy review is intentionally bounded (100 unknown names per batch, 5,000 registered aliases, at most five customer candidates). Shipment decision review displays the latest 50 events while all events remain stored. Initial Sertim uses text/barcode keyboard input on responsive web; native camera/offline workflows are not included. External source behavior has fixture evidence, not a fresh live acceptance certification.

### 9. Remaining business decisions

Resolve B1/B2 source/National Account acceptance, B3 authoritative Retail code field, B4 valid alias scopes, B6 category evidence/conflict rules, the external portion of B7 completeness/cutoff, and B8 terminal/SLA policy. Confirmed Sertim closure does not answer B6 or external B7. Until then the application keeps unclassified AWBs and provisional shortfalls visible without declaring missing shipments or complete reconciliation.

### 10. Git delivery

See the commit ledger. Work is on `codex/jne-reconciliation`, committed in bounded increments. No push was performed. Unrelated pre-existing UI edits and untracked artifacts remain untouched.
