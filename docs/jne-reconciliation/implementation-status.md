# Implementation status

Updated 26 October 2026. The safe technical M1–M8 implementation is complete for consolidated UAT. Task-first UI remediation has been applied to the JNE workflows and repeated introductory copy on other operational pages. Operational verification is pending. This continuation did not push, migrate the operational database, change live ownership/finalized POP or enable schedules.

## Task-first UI continuation

See [the UX audit and remediation evidence](ui-ux-audit.md). Monitoring now places search and records first, reconciliation uses compact tables with optional detail, and exception selection opens an accessible decision Sheet. Source contracts and refresh policies use structured fields with advanced JSON. External collection forms reflect OPEN versus COMPLETE and preserve selected reports through navigation. Drafts, scope, reason, version checks and production gates retain their backend contracts.

Existing shadcn, Inertia, Wayfinder and disposable Chromium fixtures were reused. No backend/database/dependency changes were required. Local AGENTS.md records the supplied UI policy; the repository intentionally ignores that local instruction file. Other pre-existing auth/welcome work remains separate.

Verification: 123 frontend tests, 53 focused backend regressions, Chromium staff/Admin/review/collection/policy flows, 25 route checks, mobile setup and handover checks, existing role boundaries, contrast checks, TypeScript web/mobile, frontend lint, PHPStan and production build passed. Implementation and automated verification support UAT readiness; they do not constitute operational acceptance or certify every page/state.

The complete PHP suite also passed: 756 passed, five existing skips, 7,067 assertions. The focused Chromium fixture was rerun after the final form recovery refinement. This remains synthetic verification, with no live JNE retrieval or production writes.

## Milestone states

| Milestone | Implemented | Automated tests | Ready for UAT | Operationally verified / external gate |
|---|---|---|---|---|
| M0 | Discovery and current continuation inventory complete | Actual code/routes/schema inspected | Yes | Historical audit retained |
| M1 | Four-source integrity/recovery and durable APEX batches | Passed PHP/worker/Chromium fixtures | Yes | Pending B1/B2 source acceptance |
| M2 | Canonical AWB, original values, multiple observations and provenance | Passed import/registry/provenance regressions | Yes | Production source extraction gated |
| M3 | Registered codes/aliases, scopes, candidates/conflicts, verified configuration and replay | Passed identity/negative-scope/draft activation tests and real forms | Yes | Pending B3/B4 actual columns/scopes |
| M4 | Existing delivered Sertim reused; Admin correction/closure rules intact | Passed role/audit/late import/reopen/duplicate MySQL and Chromium regressions | Yes | Operational UAT pending; business authority already confirmed |
| M5 | Three-category evidence and audited independent external collection completion | Passed synthetic Vanny 0/3/100, equal-count false positives, late/conflicting/failed evidence | Yes | Pending B6/B7 actual category/completeness contracts |
| M6 | Individual/equivalent-evidence batch review, correction/release and complete audit pagination | Passed role/group/version/atomicity/replay/changed-evidence tests and browser forms | Yes | Actual exception decisions require operator evidence |
| M7 | Configurable verified interval/SLA/priority/source-hours/terminal/backoff policies | Passed legacy/configured/chronology/scheduling regressions and policy draft UI | Yes | Pending B8 semantics; gates/policies default disabled |
| M8 | Actionable filtered confidence, category/observation grain, global failures/Sertim pending and drill-down | Passed backend/frontend/responsive Chromium verification | Yes | Metrics remain unknown/provisional until configured evidence is accepted |

Implemented and ready for UAT does not mean live source semantics are certified. See uat-plan.md and uat-readiness.md.

## Existing components reused

- Laravel report_jobs/report_job_events, source child runs, private jne_reports disk, combiner, import/mapping queues and worker claim/lease/slot conventions.
- Node.js/Playwright Hybrid, APEX and History automation, existing fixture servers and browser test harness.
- jne_report_awbs, globally unique jne_shipments, jne_shipment_observations and jne_shipment_match_events.
- Customer directory, registered shipper aliases, exact finalized/effective processing references and fenced mapping replay.
- Pickup tasks, effective POP/revisions, processing declarations, handover verification/closure history and completed Sertim claims/audits.
- Existing Inertia/React/TypeScript monitoring, report, pickup/handover, customer dashboard and shared UI/Wayfinder conventions.

## New and modified responsibilities

- ManageApexBatches/ApexBatchController and worker checkpoint callbacks preserve saved batches, block uncertain submissions and support audited exact restoration/no-submission attestation.
- ReadJneSourceEvidence, JneSourceContract and JneCustomerCodeAlias preserve nullable code/contract/Hybrid-origin evidence.
- ResolveJneCustomerCodes/JneEvidenceScope/ManageJneEvidenceRules implement exact registered evidence, verified scopes, bounded candidates, immutable revisions, draft verification/disable and audited replay.
- ResolveJneCategories materializes separate category confidence/evidence; BuildJnePickupReconciliation and QueryCashlessReconciliation compare effective POP only with confident identity/category.
- ManageJneCollectionWindow/QueryJneCollectionWindows track independent explicit completeness and late-evidence invalidation.
- ReviewJneExceptions/JneExceptionController support reasoned individual/equivalent batch decisions and safe release, using existing shipment audit.
- ManageJneRefreshPolicy/QueryActiveJneAwbs/QueueScheduledJneReports add optional verified policy selection while preserving uncertainty/concurrency guards.
- Existing monitoring/detail/reconciliation pages plus small configuration/review pages expose original evidence, category/confidence, audit, failures and snapshot freshness.

No new microservice, infrastructure, dependency or Customer Portal was introduced.

## Database changes

The original delivery's four migrations implemented global unique normalized AWBs, candidate/match evidence, Sertim claims/events and the persistent first-close latch. Those were applied locally before this continuation; no production deployment is claimed.

Five new additive continuation migrations remain PENDING in the operational database, verified read-only on 25 October:

| Migration suffix | Change |
|---|---|
| 164204_create_report_job_batches_table | Durable unique job/batch checkpoints, start UUID, private checksum/result and recovery actor/reason |
| 165233_create_jne_evidence_configuration_tables | Source contracts/code aliases, shipper scope/verification, nullable original_customer_code/source_evidence |
| 165910_add_evidence_review_audit_to_jne_mapping_runs | Fenced reapply_all and append-only configuration rule events |
| 171745_add_jne_category_and_collection_evidence | Shipment category/confidence/review fingerprints; unique pickup collection window and immutable attestation events |
| 194118_add_refresh_policy_to_jne_report_profiles | Nullable verified/draft refresh-policy JSON |

All migration filenames start 2026_10_24_. Disposable SQLite and MySQL fixtures exercise schema installation; operational tables were not migrated. Current projections versus immutable ledgers are intentional for uniqueness, current-state queries and historical traceability.

## Automated rules

Exact registered primary codes, verified code aliases and scoped shipper aliases may confirm customers only when their source contract/gate applies. No account/reference is guessed into a customer code. Active uncontested Sertim supports customer/pickup and Cashless evidence; exact finalized references independently establish pickup.

Historical contrary evidence creates conflicts. Fuzzy code/name similarity only produces bounded candidates, with originals unchanged. Scope requires exact configured account and inclusive entry date; missing entry cannot satisfy dated scope.

Configured literal category values or verified Hybrid-origin rules establish category independently. Different categories conflict. Counts require customer MATCHED, pickup MATCHED, actual customer agreement and category MATCHED. Equal totals, uncertain retained pointers and unclassified AWBs never prove reconciliation.

External collection requires ready selected reports, verified required-source contract, cutoff and explicit reasoned Admin attestation. Late required-source data, even an unowned AWB or older-job row, invalidates old completeness to REVIEW. POP/Sertim/report/contract changes also invalidate it. No elapsed timer or Sertim closure declares missing shipments.

Tracking retains snapshot chronology and receipt floors. Verified optional policies provide intervals, priorities/SLA, source hours, distinct consecutive observation terminal confirmation and bounded backoff. Saving policy never activates a schedule.

## Human review and correction

Review unknown codes/unregistered aliases, suspected typos, shared-account ambiguity, contradictory ownership/pickup/category, pending Sertim source, report failures, incomplete external collection and POP mismatches. Batch decisions require equivalent source/context fingerprints and current versions, with at most 100 selected records.

Only active Admin may confirm/correct/release decisions. Contrary active Sertim must first use its audited correction workflow. General review never silently registers a permanent alias. Changed evidence flags a prior reviewed result; explicit release re-evaluates sources. Full rule and shipment decision audit is paginated.

Sertim BR-SERTIM-01–04 remain unchanged: staff denied after finalization/first-close; Admin reason/version audit; handover reopen never reopens scanning; late imports/reconciliation allowed; finalized POP/physical history untouched.

## Verification ledger

- Full regression before final additions: 754 passed, five skipped, 7,055 assertions.
- Final frozen-tree complete PHP suite: 756 passed, five skipped, 7,067 assertions (761 cases total, 185 seconds); no failures/errors.
- Latest focused identity/category/exception/visibility run: 14 passed, 135 assertions.
- Tracking/legacy/category run: 12 passed, 69 assertions.
- Frontend: 89 passed across nine JNE test files.
- Worker: 75 passed, including local Hybrid/APEX Chromium and 6,001-AWB saved-batch resume.
- Chromium responsive fixture passes on disposable SQLite: staff capture, Admin closed-record correction/audit, code draft creation/verification, external OPEN and COMPLETE attestation, equivalent-group ownership review, inactive tracking-policy draft, monitoring/detail/customer scope at 390px and monitoring at 1280px.
- PHPStan, Pint, both TypeScript projects, production build and Git whitespace checks passed.
- Read-only operational check: all six new gates false; all five continuation migrations pending.

Tests use synthetic/disposable environments. The full PHP suite includes disposable MySQL claim concurrency/migration tests. Five pre-existing device/feature-gated tests are skipped; no live JNE operational certification is inferred.

Windows full-suite command uses existing Git OpenSSL config only for the test process:
OPENSSL_CONF=C:/Program Files/Git/usr/ssl/openssl.cnf, then php -d extension=pdo_sqlite -d extension=sqlite3 vendor/bin/pest --compact.

A complete run overlapped a fixture extension and failed because its PHP fixture predated the new Node environment inputs. The focused updated browser fixture passed; the final frozen-tree run supersedes that mixed-version result. No application defect was hidden by suppressing assertions.

Logs: storage/logs/jne-uat-php-tests-final.log, jne-uat-worker-tests.log and jne-uat-build.log. Ignored browser screenshots are under storage/app/private/jne-reconciliation-ui. No operational export or secret is committed.

## Limitations and remaining decisions

B1–B4/B6–B8 remain source-contract/activation gates, with concrete sample/sign-off fields in uat-plan.md. No incremental operator confirmation is required to complete the technical support.

Configured customer codes use original imported standardized report headers. Raw Hybrid originals are retained, and source/type provenance supports explicit category rules; raw-only code headers are not presumed to survive APEX. No National Account routing meaning or terminal/SLA policy is invented.

Initial Sertim supports responsive web/text or keyboard barcode entry; native camera/offline capture is outside this scope. Suggestion work is bounded (100 unique name/code contexts, 5,000-entry catalogs and five candidates); overflow remains unmatched rather than weakening rules.

Private failed-worker recovery files require deliberate retention/cleanup after uncertainty is resolved. Actual production source latency, availability and policy values require UAT. Application/config rollback must retain evidence/audit; destructive down migrations are not ownership repair.

## Commit references

Original delivery, pushed only at the user's separate request: 323c402, 169fd69, 06268f5, 9580a2e, c9c343d, 3136e07, 7a3a35c, 2177512, b48da8e and 6016d67.

This continuation is NOT pushed:

- 2b6a450 — M1 APEX checkpoint/recovery.
- 58a89e2 — M2 source contract/Hybrid provenance.
- cbd5292 — M3 verified code/scoped identity.
- e77e07d — M5 category and external collection attestation.
- 312d13f — M6 equivalent-evidence review/correction.
- 7d47e2c — M7 verified tracking policy.
- 27580b4 — draft activation and late/uncertain evidence safeguards.
- ef8a9c1 — M8 evidence confidence, operational visibility and complete browser workflow verification.

Consolidated UAT documentation is committed separately after the implementation. Refer to this branch's Git log for its documentation commit; no push was performed.

Unrelated pre-existing authentication/welcome UI changes and untracked artifacts remain untouched.
