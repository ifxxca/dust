# Consolidated JNE reconciliation UAT plan

Prepared 25 October 2026. Technical implementation and synthetic verification are separate from operational acceptance. Actual-results fields below are intentionally unfilled. Do not mark operational PASS from fixtures.

## Environment and participants

Use a disposable UAT MySQL database, private report disk, test users for Admin/Pickup/Retail and an isolated worker/browser session. Apply the five continuation migrations after the original baseline; keep all profiles disabled and all new policy gates false initially. Back up the database/private report evidence before any controlled run.

Assign an operator familiar with Hybrid/APEX, a Retail reviewer and an Admin responsible for mappings. Confirm sanitized samples retain AWB leading zeros, source headers, account sharing, dates and relationships needed to test. Never reuse customer credentials or private exports in committed fixtures.

First exercise saved report imports/history exports. Arrange any controlled external collection with the operator and preserve its exact job/batch IDs. Never repeat an uncertain APEX Process submission. No destructive source-system testing is part of UAT.

## Required real samples

| Sample | Required contents / purpose | Received reference and checksum | Verified by / date |
|---|---|---|---|
| H1–H4 | All four actual Roberto/Nuralamt cashless/manual exports for one operational day, including an empty output where applicable and AWB overlaps | Pending | Pending |
| H5 | Staggered arrival/failed child and a corrected original export, without altering successful children | Pending | Pending |
| A1 | Standardized APEX upload result for the merged headerless AWB set; include multiple batches if available | Pending | Pending |
| A2 | Account retrieval exports for known Y and N National Acc/Cust cases, including a Hybrid special-case customer | Pending | Pending |
| A3 | Shared-account report with independently verified Retail ownership for at least two customers | Pending | Pending |
| I1 | Registered customer 4000 and verified 4000A/4000B relationships, multiple sender/dropship names, typo/unknown codes and marketplace names | Pending | Pending |
| P1 | Finalized Buku Pickup with 0 Manual, 3 Cashless, 100 CSS/Orion and independently identifiable AWBs; retain any discrepancy rather than forcing 103 | Pending | Pending |
| S1 | Cashless labels/Sertim claims, finalized POP, handover close/reopen and a legitimate Admin correction example | Pending | Pending |
| C1 | Operator evidence defining all required sources/account/date scope and cutoff for one pickup, including late data | Pending | Pending |
| T1 | Chronological active, exception, delivered/cancelled/returned reports, duplicate times, delayed older snapshots and a failed refresh | Pending | Pending |

## Business contract sign-off

| ID | Confirm and record | Required acceptance artifact | Actual result / verifier |
|---|---|---|---|
| B1 | The four actual processes, header/date semantics, export schema and headerless one-AWB-per-line APEX upload | Annotated H1–H4 plus expected deduplicated AWB set | Pending |
| B2 | Meaning/source of Y/N for each account and Hybrid special-case routing | Account/routing decision record with operator authority; no inferred default | Pending |
| B3 | Exact authoritative Retail-code column in each imported standardized report, normalization/null/error behavior | Annotated source header/cells and independent Retail mapping; do not substitute account ID | Pending |
| B4 | Each real code/shipper alias and global/account/date scope | Verified mapping list including known negative/out-of-scope cases | Pending |
| B6 | Literal category values or Hybrid-origin rules and contradictory-origin handling | Independent category evidence for Manual/Cashless/CSS; marketplace/account/prefix/count alone rejected | Pending |
| B7 | Required source/account/date scope, cutoff and authorized completeness attestation | Approved source contract and report checklist; separate from Sertim close | Pending |
| B8 | Source availability, intervals, priority/SLA and terminal statuses/confirmation | Approved policy values, expected due/terminal examples, especially RETURNED | Pending |

BR-SERTIM-01–04 are already confirmed. Test their enforcement; no further business approval is requested for those rules.

## Acceptance scenarios

For each case record exact input/sample, job/batch/AWB/pickup IDs, screenshots or audit IDs, expected versus actual, PASS/FAIL, operator and time.

| Case | Procedure | Expected result / PASS criterion | Actual result / evidence | PASS/FAIL |
|---|---|---|---|---|
| A1 Four-source collection | Complete children at different times; fail/recover one | No merge before all validated originals; successful child evidence retained | Pending | Pending |
| A2 Headerless merge | Compare merged upload against H1–H4 union | Exactly one normalized AWB per line, no header/duplicates, source origins/checksums retained | Pending | Pending |
| A3 APEX result/restart | Save batch one, interrupt batch two, resume using History output | SAVED batch reused without new Process; uncertain STARTED blocked until audited restore/no-submission evidence | Pending | Pending |
| A4 Import safety | Repeat same final report; inject a disposable halfway failure and retry | Atomic recovery; one canonical AWB, multiple distinct observations only as appropriate; raw values unchanged | Pending | Pending |
| B1 Exact identity | Verify real source contract; import primary code, code aliases and sender aliases | Verified exact mappings resolve customer with explanation; pickup stays independent | Pending | Pending |
| B2 Shared account | Import two customers on one account | Account never assigns the entire report to one customer | Pending | Pending |
| B3 Typos/marketplace | Import 400O, misspelled names, unknown suffix and marketplace sender | Useful candidates/unknown states; no silent correction or ownership from fuzzy/prefix/account | Pending | Pending |
| B4 Scope/conflict | Use wrong account, absent/out-of-period date and contradictory exact evidence | Scoped rule does not match outside scope; conflict stays unresolved | Pending | Pending |
| C1 Staff capture | Assigned executing Pickup Staff records cashless labels before finalization | Normalized unique claim; original entry and audit; no shipment invented before source arrives | Pending | Pending |
| C2 Finalized/closed denial | Staff attempts add/replace/revoke after POP finalization and after close through HTTP/service | Denied by backend; other task/handover permissions unchanged | Pending | Pending |
| C3 Admin correction | Admin changes label with required reason/current version; try duplicate/foreign-task claim | Valid correction audited with before/after and affected results; invalid conflict rejected atomically | Pending | Pending |
| C4 Reopen/late data | Reopen handover, attempt scan; import late source and reconcile | Scan window remains closed; late import/reconciliation allowed; POP/physical closure history unchanged | Pending | Pending |
| D1 0/3/100 | Attribute each AWB using genuine customer/pickup/category evidence | Correct three category counts; total equality alone cannot reconcile | Pending | Pending |
| D2 Category conflict | Put same AWB in differently classified verified processes | Category conflict visible; no fabricated match to complete counts | Pending | Pending |
| D3 Completeness | Select required ready reports, approved contract/cutoff and explicit Admin attestation | Missing/final reconciliation only after valid completeness plus confident evidence; failed/incomplete/stale evidence rejected | Pending | Pending |
| D4 Late evidence | Add a late report row from an older job or an unowned AWB in required scope | Prior completeness becomes REVIEW; safe subsequent re-attestation; no POP rewrite | Pending | Pending |
| D5 Excess/uncertain identity | Equal totals with unresolved retained pointers; then excess/shortfall | Uncertain identity blocks reconciliation; provisional versus confirmed missing is explicit | Pending | Pending |
| E1 Review/batch | Select equivalent records; then mixed/stale records | Active Admin/reason/version required; mixed/stale batch fails atomically; audit includes affected AWBs | Pending | Pending |
| E2 Rule correction | Verify draft alias, correct/disable mapping, replay; release reviewed decision | No duplicate draft; superseded contract rejected; original evidence retained; affected decisions reevaluated safely | Pending | Pending |
| F1 Tracking policy | Save inactive draft, verify approved policy in UAT, inspect due list before running | Saving never enables schedule; active/new/priority/SLA list follows approved values and interval floors | Pending | Pending |
| F2 Chronology/terminal | Import duplicate times, old snapshot and terminal transitions | Older status never replaces newer; duplicates/old terminal totals do not confirm terminality | Pending | Pending |
| F3 Availability/failure | Exercise outside-source hours, unreviewed failure and later reviewed recovery | No aggressive polling or duplicate uncertain Process; bounded backoff; errors/freshness visible | Pending | Pending |
| G1 Monitoring/scope | Inspect filter, customer dashboard, report drill-down and mobile/desktop views | Confidence distinct from count; customer-scoped data requires confirmed owner; global metrics labeled; no overflow/errors | Pending | Pending |

## Activation sequence in isolated UAT

1. Apply migrations with schedules/workers disabled. Check uniqueness, original files and audit retention.
2. Enable source provenance/checkpoints only in UAT and run A cases.
3. Register contracts/aliases as drafts. Fill B1–B4/B6–B8 sign-off with real evidence; then verify only corresponding UAT rules.
4. Enable evidence/category/collection gates in UAT. Run C/D/E with frozen expected POP and handover snapshots; verify exact before/after database/audit evidence.
5. Save inactive tracking policy; inspect expected due list. Enable only verified UAT policy after B8; test F with controlled scheduling and source availability.
6. Run G and target-environment complete automated suite. Leave all production flags/profiles unchanged.

## Release and rollback criteria

Implementation readiness is not production readiness. Release requires all critical cases PASS, all semantics signed off, complete target-environment tests, operational source agreement, approved backup/recovery and a separately authorized rollout.

On failure disable the relevant new gate/policy/profile in UAT and stop its worker gracefully. Preserve original reports, report_job_batches, STARTED uncertainty, source/match/configuration/collection audits and private recovery files. Do not blindly replay APEX. Reverse a wrong decision using reasoned correction/release/revision; never repair by editing finalized POP.

Prefer application/config rollback while retaining additive evidence tables. Migration down removes history/projections and is not an operational repair procedure. Any database restoration must use the tested backup and account for imports/audits received afterward. Existing operational workflows must remain functional with all new gates false.

## Overall result

UAT environment: Pending
Operator / Admin reviewers: Pending
Run date and sample checksum manifest: Pending
Critical failures and remediation references: Pending
Operational acceptance: NOT RUN
Production rollout authorization: NOT REQUESTED / NOT PERFORMED
