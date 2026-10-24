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
| M6 | Partial | Existing alias/report/manual reference review; full evidence exception workflow pending |
| M7 | Safe due-selection increment implemented; business policy partial | Scheduled per-AWB receipt intervals, configurable status minimums, existing manual override and failure/concurrency gates; observation/receipt/failure exposed separately. SLA and terminal confirmation remain B8 |
| M8 | Partial | Existing monitoring/dashboard; category/exception confidence metrics pending |

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

## Business decisions and limitations

See `business-rules.md` B1–B8. Questions were sent during discovery. No business interpretation has been invented. A local fixture pass does not certify live JNE availability, source meaning, mapping correctness or finalized-record correction authority. The complete application suite has not been run for this project yet.

## Commit ledger

- `323c402` — M0 discovery, implementation matrix and roadmap.
- `169fd69` — M1 stored Hybrid integrity and safe recovery increment.
- `06268f5` — M2 global AWB registry and guarded uniqueness upgrade.
- `9580a2e` — M3 historical identity evidence and non-authoritative typo candidates.
- `c9c343d` — M4 cashless Sertim, backend authority and audited Admin corrections.

Each completed milestone or clearly bounded safe increment is committed separately. Remaining references and final validation will be recorded here as work proceeds.
