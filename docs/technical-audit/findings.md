# Consolidated findings

Audit date: 29 October 2026 (Asia/Bangkok). Scope: current working tree, including pre-existing uncommitted work. Application code was not changed.

There are **13 findings: 11 Medium, 1 Low and 1 Informational**. No Critical or High issue was established by this audit. Confidence: 2 Confirmed, 9 Strong evidence, 2 Potential. “Confirmed” identifies exactly what was demonstrated (a query access path or failed quality check); it does not imply production impact was measured. P1 means high-value work, not High severity.

| ID | Area | Severity | Confidence | Location | Problem | Impact | Minimal Fix | Priority |
|---|---|---|---|---|---|---|---|---|
| [TA-01](#ta-01) | Database | Medium | Confirmed | [app/Actions/Reports/ResolveJneCustomerCodes.php:55](../../app/Actions/Reports/ResolveJneCustomerCodes.php#L55) | Normalized customer-code lookup bypasses the existing ordinary index | Each exact lookup batch can inspect the customer table; growth compounds with historical import matching. | First measure the exact lookup separately from suggestions. | P2; Optimize when volume increases |
| [TA-02](#ta-02) | Database / handover | Medium | Strong evidence | [app/Actions/Handover/CreateSession.php:25](../../app/Actions/Handover/CreateSession.php#L25) | Handover creation performs per-task relationship reads | More database round trips and longer task-lock duration during a frequent bulk workflow. | Batch-read the required proof IDs and existing memberships after acquiring task locks in stable order. | P1; Fix before production/pilot |
| [TA-03](#ta-03) | Database / reconciliation | Medium | Strong evidence | [app/Actions/Pickup/PickupAwbEligibility.php:21](../../app/Actions/Pickup/PickupAwbEligibility.php#L21) | Cross-day AWB eligibility adds one existence query per shipment | Cross-day reconciliation can hold customer/task locks across many unnecessary round trips. | Fetch the applicable processed pending task/shipment/date keys once per evaluation and reuse a scoped lookup. | P1; Fix before production/pilot |
| [TA-04](#ta-04) | Database / projection | Medium | Strong evidence | [app/Actions/Reports/ProjectJneShipments.php:22](../../app/Actions/Reports/ProjectJneShipments.php#L22) | Projection omits entry_at and falls back to a lazy latestSource read | Avoidable reads in the import transaction and reliance on fallback semantics. | Include the source date actually required by the matcher; retain a batched fallback only for genuinely missing dates. | P1; Fix before production/pilot |
| [TA-05](#ta-05) | Backend / invalidation | Medium | Strong evidence | [app/Observers/PickupAutomationObserver.php:26](../../app/Observers/PickupAutomationObserver.php#L26) | Global evidence changes synchronously fan out over historical pickups | Interactive latency, large callback lists and extra write/lock pressure as history grows. | Move broad invalidation to a bounded producer job and coalesce customer-day keys. | P1; Fix before production/pilot |
| [TA-06](#ta-06) | Imports / memory | Medium | Strong evidence | [app/Actions/Reports/ImportReportAwbs.php:19](../../app/Actions/Reports/ImportReportAwbs.php#L19) | Import/projection chunks writes after loading full report and history | At 10×/100× retained history, matching and provenance work can dominate a small new import; 60-second PHP job limits may become relevant. | Profile first. | P2; Optimize when volume increases |
| [TA-07](#ta-07) | Concurrency | Medium | Strong evidence | [app/Actions/Pickup/FinalizePickup.php:25](../../app/Actions/Pickup/FinalizePickup.php#L25) | POP capture and reconciliation acquire customer/task locks in opposite order | A deadlock victim rolls back, potentially returning an error for a valid POP submission. | Define and apply one lock order across the intersecting actions, starting with a narrow customer/task finalization fix. | P1; Fix before production/pilot |
| [TA-08](#ta-08) | Observability / jobs | Medium | Strong evidence | [app/Jobs/ImportJneReportAwbs.php:34](../../app/Jobs/ImportJneReportAwbs.php#L34) | Import and scheduled-report exceptions lose diagnostic context | Operators can see that work failed but engineers may be unable to distinguish schema, storage, malformed input and programming errors. | Report unexpected exceptions with report/job/profile ID and phase; keep credentials, raw CSV and tokens out of structured fields. | P1; Fix before production/pilot |
| [TA-09](#ta-09) | Receipt reliability | Medium | Strong evidence | [app/Http/Controllers/ProofOfPickupController.php:21](../../app/Http/Controllers/ProofOfPickupController.php#L21) | POP request waits for SMTP and a killed sender has no receipt lease recovery | User sees uncertain POP completion despite committed proof; receipt requires manual investigation. | Queue receipt sending after commit with bounded transport timeouts and an explicit stale-processing-to-UNKNOWN recovery path. | P1; Fix before production/pilot |
| [TA-10](#ta-10) | Queue recovery | Medium | Potential | [app/Actions/Reports/ManageReportJobs.php:257](../../app/Actions/Reports/ManageReportJobs.php#L257) | After-commit enqueue failure can strand report processing as QUEUED | One profile may stop producing new report cycles until manual repair. | Initially alert on old QUEUED work. | P2; Monitor only |
| [TA-11](#ta-11) | Testing / CI | Medium | Confirmed | [database/factories/CashlessEntryAlertFactory.php:23](../../database/factories/CashlessEntryAlertFactory.php#L23) | Current quality checks are not fully green and client tests are not a CI step | PHPStan blocks the declared CI gate; stale assertions obscure real regressions. | Resolve factory typing through an accurately typed lookup/helper, normalize snapshot setup, make the client test exercise the disclosure, and explicitly run the scoped web/mobile client suite in CI. | P1; Fix now |
| [TA-12](#ta-12) | Frontend polling | Low | Strong evidence | [resources/js/pages/jne-report-awbs.tsx:73](../../resources/js/pages/jne-report-awbs.tsx#L73) | Completed report-detail pages continue polling their AWB page | Small avoidable load per open foreground tab; aggregate impact depends on simultaneous users. | If measured material, poll while work is active and stop/reduce at stable terminal state, retaining manual refresh and relevant recovery metadata updates.. | P3; Optimize when volume increases |
| [TA-13](#ta-13) | Production readiness | Informational | Potential | [bootstrap/app.php:21](../../bootstrap/app.php#L21) | Production operational controls are not established by repository evidence | Unverified detection/recovery capability. | Inventory existing controls first; fill demonstrated gaps with queue/business-age metrics and runbooks. | P2; Monitor only |

<a id="ta-01"></a>

## TA-01 — Normalized customer-code lookup bypasses the existing ordinary index

**Medium · Confirmed · P2 · Optimize when volume increases**

1. **Exact evidence:** [app/Actions/Reports/ResolveJneCustomerCodes.php:55](../../app/Actions/Reports/ResolveJneCustomerCodes.php#L55).
2. **Code behavior:** Exact master-code resolution applies UPPER(TRIM(customer_code)) inside each 500-code query. The unique customer_code index is an ordinary column index.
3. **Why problematic:** A safe EXPLAIN of that query shape on the attached MySQL database returned type=ALL, key=null, estimated rows=1082. This confirms the access path, not a slow endpoint or production capacity problem. The separate bounded suggestion catalog deliberately reads multiple customers and is not the same defect.
4. **Reproduce or verify:** Run EXPLAIN SELECT id,name,customer_code FROM customers WHERE UPPER(TRIM(customer_code)) IN ('AUDIT_NONEXISTENT_CODE') AND is_active=1. Compare with representative real batches and collation/legacy-code cases on a sanitized replica.
5. **Impact:** Each exact lookup batch can inspect the customer table; growth compounds with historical import matching. At the observed catalog size this may be inexpensive.
6. **Minimal recommendation:** First measure the exact lookup separately from suggestions. If material, use a canonically normalized indexed value or an equivalent collation-safe comparison after proving identical matching for legacy whitespace/case. Do not drop normalization or add a generic is_active index.
7. **Effort:** S for profiling; M if data normalization/schema work is justified.
8. **Regression coverage:** Exact mixed-case and whitespace codes, aliases, inactive customers, shared accounts and conflicting owners; compare query plans after any later change.


<a id="ta-02"></a>

## TA-02 — Handover creation performs per-task relationship reads

**Medium · Strong evidence · P1 · Fix before production/pilot**

1. **Exact evidence:** [app/Actions/Handover/CreateSession.php:25](../../app/Actions/Handover/CreateSession.php#L25); [app/Actions/Handover/CreateSession.php:28](../../app/Actions/Handover/CreateSession.php#L28); [app/Actions/Handover/CreateSession.php:33](../../app/Actions/Handover/CreateSession.php#L33); [app/Actions/Handover/AmendSession.php:35](../../app/Actions/Handover/AmendSession.php#L35).
2. **Code behavior:** CreateSession loads locked tasks without proof/membership preloads. For each valid task it queries membership, calls proof()->exists(), then lazily reads task->proof to obtain its ID. AmendSession has the same proof existence/property pattern for added members.
3. **Why problematic:** For N valid new members the creation path has approximately 3N relationship SELECTs in addition to fixed reads and necessary item/event writes. No with() handles these reads. This is a directly traceable N+1 implementation; an SQL-count trace was not collected.
4. **Reproduce or verify:** In an isolated database compare creation with 1, 10 and 100 eligible tasks using a query listener, separating SELECTs from INSERTs. Repeat amendment with many added members.
5. **Impact:** More database round trips and longer task-lock duration during a frequent bulk workflow. Request validation caps membership at 100, so this is bounded rather than an unbounded list defect.
6. **Minimal recommendation:** Batch-read the required proof IDs and existing memberships after acquiring task locks in stable order. Preserve membership uniqueness, task locks, replay semantics and all-or-nothing validation; do not merely remove locking.
7. **Effort:** S.
8. **Regression coverage:** SELECT-count growth, mixed ineligible batch rollback, duplicate membership, same-key replay, simultaneous create/amend on the same task.


<a id="ta-03"></a>

## TA-03 — Cross-day AWB eligibility adds one existence query per shipment

**Medium · Strong evidence · P1 · Fix before production/pilot**

1. **Exact evidence:** [app/Actions/Pickup/PickupAwbEligibility.php:21](../../app/Actions/Pickup/PickupAwbEligibility.php#L21); [app/Actions/Pickup/PickupAwbEligibility.php:29](../../app/Actions/Pickup/PickupAwbEligibility.php#L29); [app/Actions/Pickup/ReconcilePickupProcessing.php:110](../../app/Actions/Pickup/ReconcilePickupProcessing.php#L110); [app/Actions/Pickup/ReconcileCustomerPickupDay.php:104](../../app/Actions/Pickup/ReconcileCustomerPickupDay.php#L104).
2. **Code behavior:** allowed() returns immediately for same-day evidence, but otherwise queries PickupPendingItem for a PROCESSED matching task/shipment/date. Reconciliation invokes it from shipment filters.
3. **Why problematic:** Eager-loaded proof and latestSource already prevent ordinary relationship N+1 here. They do not satisfy an explicit exists() call. K cross-day candidate shipments add approximately K SELECTs, potentially in both individual and customer-day evaluation. Same-day shipments do not incur those pending lookups.
4. **Reproduce or verify:** Trace reconciliation with 1/50/500 processed pending shipments and compare with a same-day control cohort. Record pending-existence SELECTs, transaction time and lock waits.
5. **Impact:** Cross-day reconciliation can hold customer/task locks across many unnecessary round trips. No runtime timing or broad customer-day throughput claim is made.
6. **Minimal recommendation:** Fetch the applicable processed pending task/shipment/date keys once per evaluation and reuse a scoped lookup. Keep the processing-date and status requirements exactly intact.
7. **Effort:** S–M.
8. **Regression coverage:** Constant pending-lookup count, cross-day eligible/ineligible dates, wrong customer/task, unresolved pending, preserved finalized quantities and locked ownership.


<a id="ta-04"></a>

## TA-04 — Projection omits entry_at and falls back to a lazy latestSource read

**Medium · Strong evidence · P1 · Fix before production/pilot**

1. **Exact evidence:** [app/Actions/Reports/ProjectJneShipments.php:22](../../app/Actions/Reports/ProjectJneShipments.php#L22); [app/Actions/Reports/ProjectJneShipments.php:26](../../app/Actions/Reports/ProjectJneShipments.php#L26); [app/Actions/Reports/MatchJneShipments.php:240](../../app/Actions/Reports/MatchJneShipments.php#L240).
2. **Code behavior:** Projection selects source fields without entry_at and eager-loads only pickup on registry shipments. The automatic matcher reads source->entry_at, then shipment->latestSource->entry_at when considering a new pickup link.
3. **Why problematic:** In this caller, even a source whose database row has entry_at presents it as absent. A fresh model can then issue one lazy latestSource SELECT for each shipment reaching the allocation branch. Existing correctly linked or unresolved rows may never enter that branch. Other callers often supply complete source rows.
4. **Reproduce or verify:** Project a report with multiple newly matchable pickups and populated source entry dates; capture latestSource SELECTs. Repeat with older snapshots and existing links. No new dynamic N+1 trace was performed in this audit.
5. **Impact:** Avoidable reads in the import transaction and reliance on fallback semantics. No wrong pickup assignment has been demonstrated; the tracking freshness guard remains effective.
6. **Minimal recommendation:** Include the source date actually required by the matcher; retain a batched fallback only for genuinely missing dates. Verify old-report handling before changing fallback selection.
7. **Effort:** S.
8. **Regression coverage:** Projection SELECT growth, missing entry dates, out-of-order snapshots, multi-source date conflict, same-day boundaries, existing manual/locked decisions.


<a id="ta-05"></a>

## TA-05 — Global evidence changes synchronously fan out over historical pickups

**Medium · Strong evidence · P1 · Fix before production/pilot**

1. **Exact evidence:** [app/Observers/PickupAutomationObserver.php:26](../../app/Observers/PickupAutomationObserver.php#L26); [app/Actions/Pickup/QueuePickupReconciliations.php:21](../../app/Actions/Pickup/QueuePickupReconciliations.php#L21); [app/Jobs/ReconcilePickupProcessingJob.php:28](../../app/Jobs/ReconcilePickupProcessingJob.php#L28); [app/Actions/Reports/ProjectJneShipments.php:54](../../app/Actions/Reports/ProjectJneShipments.php#L54).
2. **Code behavior:** When automation is enabled, saving a source contract or alias without a task ID loads all finalized task IDs. QueuePickupReconciliations loops over them, reads/creates reconciliation rows, updates versions and schedules an after-commit dispatch per task. Job construction also queries task/proof. Import projection similarly selects all finalized pickups for matched customers, without a date bound.
3. **Why problematic:** Queue uniqueness by customer-day coalesces actual execution but does not eliminate this producer-side O(T) work or per-task database reads. An alias/settings request can therefore do substantial historical work before returning.
4. **Reproduce or verify:** On an isolated seeded dataset compare alias-save and import producer query count at 100/1000/10000 finalized pickups, automation on/off. Count dispatch attempts versus unique jobs actually enqueued.
5. **Impact:** Interactive latency, large callback lists and extra write/lock pressure as history grows. Workload incidence is unknown; this is not a measured production outage.
6. **Minimal recommendation:** Move broad invalidation to a bounded producer job and coalesce customer-day keys. Narrow impacted cohorts only when evidence proves the scope; do not omit old pickups merely to make the request faster.
7. **Effort:** M.
8. **Regression coverage:** All affected historical cohorts eventually invalidated; no missed member/input versions; duplicate invalidations coalesce; disabled automation stays inert; producer retries are safe.


<a id="ta-06"></a>

## TA-06 — Import/projection chunks writes after loading full report and history

**Medium · Strong evidence · P2 · Optimize when volume increases**

1. **Exact evidence:** [app/Actions/Reports/ImportReportAwbs.php:19](../../app/Actions/Reports/ImportReportAwbs.php#L19); [app/Actions/Reports/ImportReportAwbs.php:76](../../app/Actions/Reports/ImportReportAwbs.php#L76); [app/Actions/Reports/ProjectJneShipments.php:22](../../app/Actions/Reports/ProjectJneShipments.php#L22); [app/Actions/Reports/MatchJneShipments.php:43](../../app/Actions/Reports/MatchJneShipments.php#L43); [app/Actions/Reports/ReadJneSourceEvidence.php:16](../../app/Actions/Reports/ReadJneSourceEvidence.php#L16).
2. **Code behavior:** The importer accumulates every unique normalized row and raw JSON before 250-row upserts. Projection get() loads the whole report before Collection::chunk(). Matching reads all historical report rows for those AWBs, including raw_data. Bulk APEX provenance can scan all SOURCE_SAVED Hybrid jobs in 100-row lazy batches.
3. **Why problematic:** Chunked writes and a temporary stream do not bound the PHP row/history collections or transaction lifetime. Direct APEX reports have a 6000-row cap; Hybrid-derived combined reports use the file-byte cap instead, and historical observations can grow without that per-report bound.
4. **Reproduce or verify:** Measure peak RSS, report/source/history counts, transaction duration and lock waits on representative sanitized report sizes and repeated snapshots. Stress existing 6001-AWB local worker fixtures separately from PHP projection; a worker test does not establish importer memory safety.
5. **Impact:** At 10×/100× retained history, matching and provenance work can dominate a small new import; 60-second PHP job limits may become relevant. No OOM or timeout was reproduced.
6. **Minimal recommendation:** Profile first. Consider bounded/staged import and AWB-group projection while preserving atomic validation, conflicting-duplicate detection and cross-source identity decisions. Index source provenance by AWB only if the scan is measured as material.
7. **Effort:** M–L; keep separate from small query fixes.
8. **Regression coverage:** Identical/conflicting duplicate AWBs across chunk boundaries, full rollback on late invalid CSV row, checksum mismatch, provenance retention, retry without duplicate observations, peak-memory regression on representative data.


<a id="ta-07"></a>

## TA-07 — POP capture and reconciliation acquire customer/task locks in opposite order

**Medium · Strong evidence · P1 · Fix before production/pilot**

1. **Exact evidence:** [app/Actions/Pickup/FinalizePickup.php:25](../../app/Actions/Pickup/FinalizePickup.php#L25); [app/Actions/Pickup/FinalizePickup.php:50](../../app/Actions/Pickup/FinalizePickup.php#L50); [app/Actions/Pickup/RecordCashlessHandover.php:43](../../app/Actions/Pickup/RecordCashlessHandover.php#L43); [app/Actions/Pickup/ReconcileCustomerPickupDay.php:37](../../app/Actions/Pickup/ReconcileCustomerPickupDay.php#L37); [app/Actions/Pickup/ReconcileCustomerPickupDay.php:49](../../app/Actions/Pickup/ReconcileCustomerPickupDay.php#L49); [app/Actions/Pickup/CorrectPickupRecord.php:18](../../app/Actions/Pickup/CorrectPickupRecord.php#L18); [app/Actions/Handover/VerifyItem.php:21](../../app/Actions/Handover/VerifyItem.php#L21).
2. **Code behavior:** FinalizePickup locks the task, then its nested cashless capture acquires the customer lock. Customer-day reconciliation acquires customer before task. POP correction also takes task before session/item, while verification takes session/item before task.
3. **Why problematic:** Two different actors/workers can form a wait cycle. For example A holds task T in finalization and waits for customer C; B holds C in reconciliation of another pickup for that day and waits for T. A's outer finalization transaction has no multi-attempt retry. Other paths do retry, which reduces but does not remove user-visible failure risk.
4. **Reproduce or verify:** Use barrier-coordinated MySQL sessions in a disposable database to interleave these acquisitions. Include a day with an already finalized sibling pickup and a task currently finalizing cashless capture. The audit did not run database-creation/deletion concurrency tests.
5. **Impact:** A deadlock victim rolls back, potentially returning an error for a valid POP submission. Database corruption/lost-update behavior has not been demonstrated. Existing idempotency and rollback protections must remain.
6. **Minimal recommendation:** Define and apply one lock order across the intersecting actions, starting with a narrow customer/task finalization fix. Retry only database-safe transaction bodies; avoid blindly retrying file storage or external effects.
7. **Effort:** M.
8. **Regression coverage:** Deterministic MySQL finalization/reconciliation and correction/verification interleavings; one final proof, correct submission replay, no orphan evidence and preserved revision baselines.


<a id="ta-08"></a>

## TA-08 — Import and scheduled-report exceptions lose diagnostic context

**Medium · Strong evidence · P1 · Fix before production/pilot**

1. **Exact evidence:** [app/Jobs/ImportJneReportAwbs.php:34](../../app/Jobs/ImportJneReportAwbs.php#L34); [app/Jobs/ImportJneReportAwbs.php:41](../../app/Jobs/ImportJneReportAwbs.php#L41); [app/Actions/Reports/QueueScheduledJneReports.php:24](../../app/Actions/Reports/QueueScheduledJneReports.php#L24).
2. **Code behavior:** Broad Throwable handlers store generic user-facing failure text and return without report($exception), structured exception context, or rethrowing. An import/projection failure caught this way can finish normally from the queue's perspective.
3. **Why problematic:** Business status is visible as FAILED, so this is not an assertion that all failures are invisible. The originating stack/type/cause is lost in these paths, and failed_jobs alone is an incomplete health signal.
4. **Reproduce or verify:** Inject a local storage/database exception through the existing importer/projector service boundary and assert both sanitized business failure status and a private structured diagnostic event. Do not make a real external report request.
5. **Impact:** Operators can see that work failed but engineers may be unable to distinguish schema, storage, malformed input and programming errors. Mean recovery time increases.
6. **Minimal recommendation:** Report unexpected exceptions with report/job/profile ID and phase; keep credentials, raw CSV and tokens out of structured fields. Preserve existing safe user text and deliberate business failure states.
7. **Effort:** S.
8. **Regression coverage:** Importer and projector unexpected failures emit one diagnostic; known validation errors retain field messages; queue completion/failed-job semantics are intentional; logs omit secrets.


<a id="ta-09"></a>

## TA-09 — POP request waits for SMTP and a killed sender has no receipt lease recovery

**Medium · Strong evidence · P1 · Fix before production/pilot**

1. **Exact evidence:** [app/Http/Controllers/ProofOfPickupController.php:21](../../app/Http/Controllers/ProofOfPickupController.php#L21); [app/Actions/Pickup/SendPickupReceipt.php:46](../../app/Actions/Pickup/SendPickupReceipt.php#L46); [app/Actions/Pickup/SendPickupReceipt.php:55](../../app/Actions/Pickup/SendPickupReceipt.php#L55); [config/mail.php:48](../../config/mail.php#L48); [app/Console/Commands/QueuePickupAutomation.php:32](../../app/Console/Commands/QueuePickupAutomation.php#L32).
2. **Code behavior:** With the email receipt channel and SMTP configured, proof submission calls the mail sender inline after POP commits. The sender commits PROCESSING before external delivery. Exceptions become UNKNOWN, but process termination skips that handler. Scheduled recovery handles manifest SENDING and rendering states, not PickupReceipt PROCESSING. SMTP timeout is left to the underlying transport default.
3. **Why problematic:** A slow SMTP exchange delays a successful POP acknowledgment; a process killed after PROCESSING is committed can leave the receipt blocked indefinitely. This does not roll back finalized POP, and the code correctly avoids automatic resend of uncertain delivery.
4. **Reproduce or verify:** With a local mail fixture, delay SMTP past the mobile 30-second request bound; terminate only the isolated sender after PROCESSING commits. Inspect submission recovery and receipt state. No SMTP interaction or kill test was performed here.
5. **Impact:** User sees uncertain POP completion despite committed proof; receipt requires manual investigation. Risk is conditional on the email channel being enabled, not established for the deployed environment.
6. **Minimal recommendation:** Queue receipt sending after commit with bounded transport timeouts and an explicit stale-processing-to-UNKNOWN recovery path. Keep existing delivery uncertainty and duplicate-send protection; never reset stale sends directly to retryable.
7. **Effort:** M.
8. **Regression coverage:** Slow mail, worker death after claim, accepted-but-response-lost mail, no duplicate resend, POP submission lookup/replay remains successful, stale receipt becomes actionable UNKNOWN.


<a id="ta-10"></a>

## TA-10 — After-commit enqueue failure can strand report processing as QUEUED

**Medium · Potential · P2 · Monitor only**

1. **Exact evidence:** [app/Actions/Reports/ManageReportJobs.php:257](../../app/Actions/Reports/ManageReportJobs.php#L257); [app/Actions/Reports/QueueScheduledJneReports.php:65](../../app/Actions/Reports/QueueScheduledJneReports.php#L65); [app/Actions/Reports/ManageReportJobs.php:289](../../app/Actions/Reports/ManageReportJobs.php#L289).
2. **Code behavior:** enqueueImport persists QUEUED statuses and dispatches after commit. The scheduler blocks later cycles behind QUEUED import/projection work. recoverExpired targets external jobs with active_slot and expired leases; enqueueImport returns early for QUEUED.
3. **Why problematic:** If queue publication fails after the state transaction commits, or an undelivered queue message is lost, a completed CSV may remain QUEUED without a runnable import. The failure window depends on queue connection and crash behavior; no orphan was observed.
4. **Reproduce or verify:** Fault-inject queue publication failure after transaction commit in a disposable environment; compare report row, actual pending message and recovery route behavior. Inspect an aged-QUEUED metric before changing anything.
5. **Impact:** One profile may stop producing new report cycles until manual repair. The default database queue reduces some failure modes but is not an atomic guarantee for an after-commit callback.
6. **Minimal recommendation:** Initially alert on old QUEUED work. If reproduced, add a bounded, idempotent recovery path that verifies/republishes missing work from the retained CSV; consider an outbox only if operational evidence warrants it.
7. **Effort:** S for measurement; M for tested recovery.
8. **Regression coverage:** Lost publication, duplicate recovery jobs, crash after import but before projection, intact checksum, no new external scraping and no duplicate observations.


<a id="ta-11"></a>

## TA-11 — Current quality checks are not fully green and client tests are not a CI step

**Medium · Confirmed · P1 · Fix now**

1. **Exact evidence:** [database/factories/CashlessEntryAlertFactory.php:23](../../database/factories/CashlessEntryAlertFactory.php#L23); [tests/Feature/CashlessHandoverTest.php:46](../../tests/Feature/CashlessHandoverTest.php#L46); [resources/js/lib/jne-monitoring.test.tsx:162](../../resources/js/lib/jne-monitoring.test.tsx#L162); [resources/js/pages/jne-shipment.tsx:204](../../resources/js/pages/jne-shipment.tsx#L204); [.github/workflows/tests.yml:60](../../.github/workflows/tests.yml#L60); [composer.json:65](../../composer.json#L65).
2. **Code behavior:** PHPStan reports one property.notFound error in the alert factory's findOrFail union. Selected backend tests pass 121/122; the failing raw-attribute comparison gains cashless_capture_hash=null only after refresh. Client tests pass 245/246; the failing static render expects help inside a conditionally closed editor. CI runs worker tests and composer ci:check; that script runs JS checks/types and PHP tests, but no client Vitest command.
3. **Why problematic:** These are demonstrated verification failures, not demonstrated POP mutation or loss of manual matching. The CI omission lets a failing client assertion persist. Existing tests should be repaired around observable guarantees, not removed or satisfied by restoring redundant UI text.
4. **Reproduce or verify:** Repeat the exact commands in verification.md. Refresh both baseline and final POP snapshots consistently; separately exercise opening the matching editor. Review the complete CI script expansion.
5. **Impact:** PHPStan blocks the declared CI gate; stale assertions obscure real regressions. Client/mobile test results are not enforced by the workflow currently reviewed.
6. **Minimal recommendation:** Resolve factory typing through an accurately typed lookup/helper, normalize snapshot setup, make the client test exercise the disclosure, and explicitly run the scoped web/mobile client suite in CI. No fixes were made.
7. **Effort:** S.
8. **Regression coverage:** Rerun the three failing checks; client disclosure interaction and preserved source fields; POP values and revisions remain unchanged after additive cashless evidence.


<a id="ta-12"></a>

## TA-12 — Completed report-detail pages continue polling their AWB page

**Low · Strong evidence · P3 · Optimize when volume increases**

1. **Exact evidence:** [resources/js/pages/jne-report-awbs.tsx:73](../../resources/js/pages/jne-report-awbs.tsx#L73); [resources/js/pages/jne-shipper-aliases.tsx:102](../../resources/js/pages/jne-shipper-aliases.tsx#L102); [resources/js/pages/jne-monitoring.tsx:80](../../resources/js/pages/jne-monitoring.tsx#L80).
2. **Code behavior:** Report AWB detail unconditionally polls report and awbs every five seconds, including terminal projected reports. Alias mapping pages also poll at five seconds. Monitoring has a better explicit 30-second, hidden-tab pause and editing/loading stop pattern.
3. **Why problematic:** Terminal report detail often has no changing data, so repeated list requests add avoidable read traffic. This is not a rerender loop or evidence that all polling is excessive; other users may legitimately update some report metadata.
4. **Reproduce or verify:** Observe network traffic on an immutable projected report and on an active import; measure request/response size and whether user-visible state can change. No browser/network profiling was performed.
5. **Impact:** Small avoidable load per open foreground tab; aggregate impact depends on simultaneous users. Inertia background throttling limits hidden-tab cost.
6. **Minimal recommendation:** If measured material, poll while work is active and stop/reduce at stable terminal state, retaining manual refresh and relevant recovery metadata updates.
7. **Effort:** S.
8. **Regression coverage:** Active import transitions remain visible; terminal pages stop unnecessary list fetches; failures/retries and manual refresh still work; component unmount clears polling.


<a id="ta-13"></a>

## TA-13 — Production operational controls are not established by repository evidence

**Informational · Potential · P2 · Monitor only**

1. **Exact evidence:** [bootstrap/app.php:21](../../bootstrap/app.php#L21); [routes/console.php:7](../../routes/console.php#L7); [app/Providers/AppServiceProvider.php:46](../../app/Providers/AppServiceProvider.php#L46); [config/queue.php:40](../../config/queue.php#L40); [.github/workflows/tests.yml:14](../../.github/workflows/tests.yml#L14).
2. **Code behavior:** The repository provides /up, failed-job storage, business failure states, local worker launch/restart scripts and scheduler overlap locks. It does not provide evidence of deployed queue-age alerts, scheduler heartbeat alerts, slow-query telemetry, restore drills or measured device rollout acceptance.
3. **Why problematic:** A boot health route and installed packages do not prove that every queue has a live consumer, that source reports are fresh, or that evidence files and encryption keys can be restored. External infrastructure may provide these controls; its absence here is not proof they do not exist.
4. **Reproduce or verify:** Review deployment configuration and dashboards with the operator. Demonstrate alerts for stopped consumers/scheduler, aged report/cashless UNKNOWN work, failed rendering, stale snapshots, storage capacity and database wait time. Restore a sanitized backup plus private files and keys in isolation.
5. **Impact:** Unverified detection/recovery capability. No current silent production failure or backup deficiency was confirmed.
6. **Minimal recommendation:** Inventory existing controls first; fill demonstrated gaps with queue/business-age metrics and runbooks. Establish HTTPS/signing/device and restore evidence before pilot approval.
7. **Effort:** S for evidence collection; M for gaps that actually exist.
8. **Regression coverage:** Stopped-worker/scheduler alert drill, redacted import failure diagnostic, timed isolated restore, release-origin guard and physical Android interruption tests.

