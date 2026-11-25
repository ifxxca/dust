# Retail Operations Platform — technical audit

**29 October 2026 · current working tree at HEAD 08c2c075fafffde5b675ce5dd8da54a4e21db0ef plus extensive existing uncommitted work. Audit only; application behavior was not changed.**

The architecture is a reasonable Laravel modular monolith with separate web, Android and browser-worker clients. Evidence separation, stale-state guards, snapshot ordering, unique constraints and operational revisions are substantial strengths. A rewrite is not justified. Production capacity and release readiness remain unproven because representative load, deployed operations controls and physical-device acceptance were outside this audit.

The register contains **13 findings: 11 Medium, 1 Low, 1 Informational; 2 Confirmed, 9 Strong evidence, 2 Potential**. No Critical or High issue was established. “Confirmed” is limited to an observed query plan and failing checks, not production impact. Three N+1/read-amplification patterns are strongly evidenced; none was newly demonstrated through an SQL-count trace.

## Results for review

| Deliverable | Content |
|---|---|
| [Architecture inventory](architecture-inventory.md) | Verified packages, modules, runtime and boundaries |
| [Database performance](database-performance.md) | N+1 register, live schema/index comparison, safe EXPLAIN and growth scenarios |
| [Backend reliability](backend-reliability.md) | Locks, transactions, authorization, finalized/closed records and integrity |
| [Jobs and integrations](jobs-integrations.md) | Hybrid/APEX/source/import/projection/reconciliation/tracking and uncertainty |
| [Frontend and mobile](frontend-mobile.md) | Payload/polling patterns, native persistence, scanner/session lifecycle and limits |
| [Security and testing](security-testing.md) | Access boundaries, coverage, safe executed checks and operational gaps |
| [Findings](findings.md) | Canonical IDs, severity/confidence, code locations, reproductions and minimal fixes |
| [Remediation roadmap](remediation-roadmap.md) | P0–P3, effort/benefit/change risk/dependencies and verification |
| [Verification](verification.md) | Exact main commands, results, scope limitations and before/after integrity evidence |

After enabling already-installed SQLite drivers for test processes, selected backend checks passed **121/122** tests. Two pure Unit tests also passed. Client checks passed **245/246**; local worker integration checks passed **112/112**. Web/mobile TypeScript passed. PHPStan reported one factory typing error. The two failed assertions concern a newly materialized null database attribute and help text behind a closed editor; they do not demonstrate POP quantity mutation or overwritten manual decisions. The full suite was not run because its MySQL concurrency tests create/drop databases.

## Engineering scorecard

Scores assess reviewed engineering safeguards and local regression evidence, **not production performance or availability**. 1 = substantial demonstrated gaps, 3 = useful safeguards with material remaining verification, 5 = comprehensive evidence for the reviewed scope. Unmeasured efficiency is left unrated. These are qualitative review judgments, not benchmark-derived grades.

| Dimension | Rating | Evidence and scope |
|---|---|---|
| Database efficiency | Not assessed | Two access plans and static workloads reviewed; no representative latency/RSS/lock profiling |
| N+1 protection | 3/5 | Pickup-list query-growth test passes; explicit batching common; TA-02/03/04 remain |
| Backend maintainability | 4/5 | Cohesive domain Actions, shared queries/resources, validated writes; broad invalidation/catches need attention |
| Data integrity | 4/5 | Unique AWB/proof/membership/revision keys; snapshots, audit and replay tests; selected suite only |
| Concurrency safety | 3/5 | Actor/task locks and optimistic versions; TA-07 lock inversion; MySQL interleavings not executed |
| Queue reliability | 3/5 | Named queues, uniqueness/backoff, after-commit and recovery states; TA-09/10 and deployment unknowns |
| Integration robustness | 4/5 | 112 local fixture passes for provenance, history identity, uncertainty and retry; live provider acceptance not certified |
| Frontend efficiency | Not assessed | Good pagination/partial props/cancellation; no measured bundle/render/payload cost |
| Mobile reliability | 3/5 | Durable scoped encrypted drafts, frozen attempts, scanner teardown tests; device kill/network/signing gates unverified |
| Security | 3/5 | Active roles, token scopes, Admin corrections, private evidence and export escaping; no production config/advisory assessment |
| Testing | 3/5 | Strong domain scenarios and passing isolated checks; TA-11 gate failures and client CI omission |
| Observability | 2/5 | Durable business states and worker logs; lost Laravel exception causes; deployed alert/restore evidence absent from review |

## Final evaluation

**1. What is already implemented well and should remain unchanged?** Keep the modular monolith, explicit actor checks, task/session versions and locking, finalized POP revisions, verified baselines, Sertim closure timestamp, AWB uniqueness, separate source observations and conflict-aware identity matching. Preserve server pagination, partial props, bounded CSV export and encrypted native storage.

**2. What is actually inefficient or dangerous?** The normalized-code lookup was observed to scan the catalog. Handover construction, cross-day eligibility and projection fallback have clear per-record SELECT paths. Historical invalidation runs synchronously before queued work. Lock-order inversions can cause rolled-back requests; swallowed causes obstruct diagnosis. Inline SMTP can delay POP acknowledgment and strand a killed sender. The latter failure scenarios need controlled reproduction; no corruption incident was established.

**3. Which N+1 problems are confirmed, and which suspected?** No new N+1 was runtime-confirmed. TA-02/03/04 have strong code evidence with defined branch conditions and symbolic growth. The existing pickup-results protection test passed. Dashboard aggregate, eager-loaded handover lists and shipment rows were not labeled N+1 merely for having several queries.

**4. Five highest-value improvements?** Restore quality gates/client CI; report unexpected exceptions safely; remove the three scoped per-record reads; align intersecting lock order; bound historical invalidation. See the roadmap for independent changes and conditional SMTP work.

**5. What can be improved safely without changing business behavior?** Accurate test setup/disclosure tests, redacted diagnostics, selecting required source fields, batched proof/pending-key reads and bounded equivalent invalidation. Locking/date/queue changes need targeted concurrency and late-data tests even when behavior is intended to remain identical.

**6. What should not be refactored now?** Do not split services, introduce CQRS/event sourcing/repositories, blanket eager-load relationships, remove evidence history, change matching heuristics, replace operational day rules, unlock closed collections or alter the offline policy. Do not stream away cross-source conflict checks solely to lower memory.

**7. Is the architecture adequate for actual workload?** Its boundaries fit the implemented workflows and attached database scale. Sustained operational volume, user concurrency and worker capacity were not established, so adequacy under actual peak workload cannot be certified. There is no evidence requiring an architecture migration.

**8. What runtime measurements remain?** Endpoint p50/p95 and query counts; real report size/history depth and peak RSS; transaction/lock/deadlock telemetry; queue age by queue and source-lane freshness; representative filtered EXPLAIN plans; payload/bundle/render cost; SMTP behavior; physical Android process-death, poor-network, scanner and logout recovery; deployed alert and isolated restore drills.

No findings were implemented. Review the prioritized plan before separately authorizing any remediation.

