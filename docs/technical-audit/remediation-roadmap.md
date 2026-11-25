# Remediation roadmap

Audit-only proposal. No item below has been implemented. Findings define severity/confidence; roadmap priority orders value and dependencies. Effort S = a focused change; M = several coordinated paths/tests; L = substantial data/processing work. Estimates are planning bands, not delivery commitments.

## P0 — Immediate

No Critical or High defect was established that justifies an emergency correctness/security rewrite. Do not infer that all production risks have been excluded. Preserve the current work and review the P1 items before a pilot decision.

## P1 — High Value

| Item | Effort | Expected benefit | Behavior-change risk | Dependencies | Suggested verification |
|---|---|---|---|---|---|
| TA-11: restore quality gates and add explicit client CI execution | S | Reliable regression signal; remove demonstrated PHPStan and stale assertion failures | Low if test setup/disclosure is corrected without changing operational rules | None | PHPStan, selected failing PHP/client tests, both TS projects; disposable full PHP suite |
| TA-08: preserve unexpected exception context | S | Diagnose import/projection/scheduler failure with job/phase correlation | Low; keep safe user messages and business states | Logging redaction conventions | Inject local failure; assert private diagnostic and unchanged public error; no tokens/raw CSV |
| TA-02/03/04: batch handover and eligibility reads; select projection entry date | S–M in three isolated changes | Fewer round trips and shorter lock residence in known per-record paths | Low–Medium; date fallback/locking must retain semantics | Add targeted SELECT-growth coverage before each change | 1/10/100 tasks, same-day versus cross-day shipments, late snapshot and locked/manual decisions |
| TA-07: normalize intersecting lock order | M | Reduce valid request deadlock failures | Medium; do not add unbounded locks or retry file/external work blindly | Disposable MySQL concurrency harness | Barrier-controlled finalization/reconciliation and correction/verification; no partial proof/membership |
| TA-05: bound broad invalidation producer | M | Keep alias/settings requests responsive as history grows | Medium; missed invalidation would affect derived correctness | Decide evidence-based affected cohort; retain input-version recovery | Large historical dataset, all impacted customer-days eventually reevaluated, dedup and retries |
| TA-09: decouple receipt SMTP and recover uncertain stale send | M | Return successful POP promptly; receipt sender death becomes actionable | Medium; duplicate external send must stay blocked | Local SMTP failure fixture; confirm email channel is used | Slow/accepted-but-lost response and killed sender; UNKNOWN recovery with no automatic resend |

These are high-value engineering changes, not evidence that each endpoint is presently slow. If receipt email is not enabled, validate and schedule TA-09 before enabling it rather than treat it as an active incident.

## P2 — Incremental Optimization

| Item | Effort | Expected benefit | Behavior-change risk | Dependencies | Suggested verification |
|---|---|---|---|---|---|
| TA-01: profile exact code lookup then preserve semantics with an indexable representation if needed | S measurement / M implementation | Avoid customer-table scan on exact lookup batches | Medium if normalization/collation changes; low for measurement | Representative codes and legacy whitespace/case data | EXPLAIN plus match-equivalence suite; do not index every filtered column |
| TA-06: profile report/history memory, transaction time and provenance scan | S measurement / M–L only if justified | Predict import headroom and reduce measured bottleneck | High for streaming rewrite due atomic validation/history conflicts | Sanitized representative reports; first apply TA-03/04 | Peak RSS and lock waits; duplicate conflicts spanning chunks, retry/rollback invariants |
| TA-10: measure old QUEUED work and prove recovery window | S / M if reproduced | Detect stranded imports without scraping again | Low for alert; Medium for recovery | Queue topology and publication failure injection | Missing-publication and duplicate-recovery drills; source checksum/observation count unchanged |
| TA-13: establish production operations evidence | S inventory / M to fill real gaps | Trustworthy detection/recovery and pilot readiness | Low; policy values require operational owner | Deployment/monitoring/backup owners; approved device matrix | Queue/scheduler stop alert, freshness/UNKNOWN alert, isolated restore, physical mobile interruption tests |

If measurements show bounded low cost, record it and stop. Small requests with 1000 customers do not justify a new search platform, partitioning, caching hierarchy or extra database abstraction.

## P3 — Optional

| Item | Effort | Expected benefit | Behavior-change risk | Dependencies | Suggested verification |
|---|---|---|---|---|---|
| TA-12: reduce terminal report-detail polling after measurement | S | Lower idle read traffic | Low–Medium; preserve recovery metadata updates/manual refresh | Observe real tab use and active-state transitions | No missed active import transition; terminal fetch count drops |
| Existing index redundancy / retention candidates (observations, not new findings) | S analysis; later work separately scoped | Potentially lower write/storage cost | Medium–High if constraints/evidence are removed | Query/index usage, approved evidence retention policy | Restore drill, FK and unique constraints, representative query plans |
| Large controller/matcher decomposition | No current implementation recommendation | Unproven benefit | Medium due coupled business evidence rules | Concrete maintenance defect first | Preserve exact behavior; no rewrite solely for line count |

## Five highest-value improvements

1. Restore the current quality gates and explicitly run client/mobile tests in CI (TA-11).
2. Add redacted, correlated exception reporting (TA-08).
3. Remove the three evidenced per-record read paths in separate small changes (TA-02/03/04).
4. Resolve intersecting lock-order cycles with MySQL concurrency tests (TA-07).
5. Move broad historical invalidation to bounded/coalesced producer work (TA-05).

Receipt recovery is an additional pilot gate when SMTP receipts are enabled. Measure exact-code scan cost and import memory before larger optimization. After each authorized change, use the narrow regression set; run the complete suite in disposable CI once the batch is ready. No commits, dependency changes, schema changes or deployment are authorized by this audit.

