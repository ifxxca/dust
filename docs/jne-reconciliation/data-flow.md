# Data flow and evidence boundaries

## Current implementation-first flow — 25 October 2026

The continuation below supersedes older partial-delivery statements. New technical paths are gated off by default.

1. Four Hybrid children retain original CSVs/checksums and exact AWB membership. Merge produces a deduplicated headerless CRLF file. Optional durable APEX checkpoints distinguish PLANNED, uncertain STARTED and validated SAVED batches. Resume reuses saved results; only audited Admin evidence resolves uncertain submissions.
2. Final standardized import preserves raw cells/provenance and projects one canonical AWB plus independent status observations. Optional source contracts name exact original standardized CSV headers; no account-to-code transformation is guessed. Hybrid process/checksum origins remain attached.
3. Historical code/alias/shipper/Sertim evidence resolves customer separately from exact finalized pickup references. Configured category evidence is a separate projection; candidates/conflicts never become confirmed to balance quantities.
4. Existing Sertim authorization and first-close latch remain enforced. Late import/review never reopens handover or updates finalized POP.
5. External collection attestation records a verified required-source contract, selected ready reports, cutoff, Admin scope check, source high-water mark and POP/Sertim fingerprints. New required-scope evidence or changed snapshots invalidate completeness to REVIEW. Reconciliation always rechecks current confidence and effective POP.
6. Human review writes existing match events with actor/reason, original decision and before/after affected AWB. Batches require equivalent source/context fingerprint and current versions. Permanent mapping registration is separate. Changed evidence flags reviewed identity; explicit release re-evaluates sources.
7. Tracking remains a separate unresolved-report profile. Verified optional policy selects due/priority/SLA/terminal-confirmation behavior while receipt floors, source slots, leases, idempotent batches and uncertainty review remain. Older snapshots never regress newer status.

| Admin session/CSRF route | Current contract |
|---|---|
| GET/POST /admin/jne-monitoring/collections/{pickupTask} | Active Admin; version, UUID, reason, OPEN/COMPLETE. COMPLETE requires verified contract, ready report IDs, past cutoff and explicit scope attestation. Identical requests replay; altered/stale submissions conflict |
| GET/POST /admin/jne-monitoring/exceptions | Active Admin; max 100 ID/version pairs, equivalent server group key, reason and CONFIRM/RELEASE. Optional customer/finalized pickup/category decisions; contrary Sertim rejected |
| POST /admin/jne-monitoring/evidence-rules/activate | Active Admin; kind/id/version/reason and gate. Verifies existing draft; rejects superseded contract; audited fenced replay |
| GET /admin/jne-monitoring/refresh-policies; POST /admin/jne-monitoring/refresh-policies/{profile} | Active Admin; current profile version, validated definition, verification and reason. Saves policy/audit without enabling schedule |

Laravel feature tests are executable HTTP/service contracts; disposable Chromium exercises actual forms. Invalid, unauthorized and stale/disabled decisions return 422, 403 and 409. Original files/observations and audit remain. Existing local contracts suffice; no Postman workspace, external publication or additional infrastructure was added.

```mermaid
flowchart TD
    P[Report profile / administrator request] --> H[Hybrid combined parent run]
    H --> R1[Roberto cashless child]
    H --> R2[Roberto manual child]
    H --> N1[Nuralamt cashless child]
    H --> N2[Nuralamt manual child]
    R1 & R2 & N1 & N2 --> S[Private original CSV + checksum per child]
    S --> C[Wait for four validated outputs / deduplicate AWB upload list]
    C --> A[APEX Upload Connote / correlated history / download]
    P --> Q[APEX account parameter report]
    Q --> F[Private standardized CSV + report job]
    A --> F
    F --> I[Checksum + schema + exact request validation]
    I --> RAW[jne_report_awbs: original raw cells and row]
    RAW --> O[jne_shipment_observations: source history]
    O --> REG[jne_shipments: current registry projection]
    RAW --> ID[Verified customer evidence / unresolved candidates]
    ID --> PK[Independent pickup reference / explicit Sertim evidence]
    PK --> REC[Compare effective POP category expectations]
    REG --> T[Separate scheduled tracking refresh by AWB]
    T --> A
    ID & PK & REC --> EX[Existing monitoring / review / audit history]
```

Current tables are retained. Raw CSV and `raw_data` are evidence, report rows/observations preserve each import, and the registry is a derived current view. Customer and pickup decisions belong to separate status fields/events. A tracking snapshot is an observation at a stated time; it is not a real-time feed.

M2 adds a unique `jne_shipments.awb` constraint. The old account/AWB index remains useful for account filtering, but account no longer participates in registry identity. `customer_account` on the registry is the latest observed account; every original account remains on its `jne_report_awbs` source. The upgrade first checks normalized duplicate AWBs and refuses to merge/delete them; only after that guard does it normalize the derived registry identifier and add uniqueness. Original source cells are untouched. Rollback removes the new constraint and does not recreate duplicate shipments.

Hybrid outputs may finish at different times. The parent waits; saved children survive another child's failure. Safe local import/projection replay reuses stored data. Unknown external Process outcomes remain attention states and are not blindly resubmitted. Multi-batch APEX intermediate recovery is not currently durable and remains an explicit limitation.

Sertim evidence now participates in registry matching and the existing reconciliation page shows effective POP expectations for all three categories. Only uncontested collected AWBs matched to both the claim customer and pickup count as confirmed cashless. Manual/CSS classification and external collection completion remain gated by `business-rules.md`.

`BuildJnePickupReconciliation` batches the category view using `QueryCashlessReconciliation`; it excludes retained ambiguous or wrong-customer pickup pointers from confirmed counts. Other confidently linked AWBs remain unclassified. Expected quantity uses the latest authorized POP revision without changing the original. `shortfall_quantity` is provisional, `missing_quantity` remains null, and `reconciled`/`collection_complete` remain false while the external completeness rule is unknown. Sertim closure is displayed separately.

Scheduled tracking selection now uses `QueryActiveJneAwbs::due`: never-observed active AWBs are eligible immediately; a received observation delays automatic refresh by at least the profile interval. Status minimums in `jne-reports.refresh_minimum_minutes` may lengthen that interval with `JNE_REFRESH_IN_TRANSIT_MINUTES`, `JNE_REFRESH_EXCEPTION_MINUTES`, `JNE_REFRESH_UNKNOWN_MINUTES`, and `JNE_REFRESH_RETURNED_MINUTES`. Default zero falls back to the profile; no policy polls faster than the profile or five minutes. Admin's existing explicit refresh bypasses only this freshness delay. Existing lookback, delivered/cancel exclusions, finite batches, source slots, uncertain-worker review and 15-minute scheduling backoff remain enforced.

Receipt time is `max(jne_shipment_observations.created_at)`, the successful local projection receipt, separate from source `observed_at`. A recently received old snapshot can delay polling without making its status newer. Replay does not create another observation or reset the receipt clock. Details expose `last_report_received_at` and the latest exact-AWB unresolved-refresh attempt, including collection/import/projection errors. This is a report snapshot, not real-time tracking or guaranteed external completeness.

Monitoring now publishes `identitySummary` using the applied list filters: collected, confident customer, confident pickup, candidate, conflict, ambiguous and unmatched counts. A pickup counts only when both statuses are MATCHED and its customer agrees. The existing customer dashboard applies the same confidence requirement to customer-selected data and reports candidate/conflict records under review; a retained customer pointer alone is insufficient. The alias directory includes those statuses in its review summary. No Customer Portal or new customer-facing access path was added.

## Sertim API contract (M4)

Extend the existing authenticated web API under `/api/v1/pickup-tasks/{task}/cashless-awbs`:

- GET: existing task-view policy; paginated evidence, audit events, current matching outcome and capability flags. No access through a guessed task ID outside the policy.
- GET `/{evidence}/history`: complete paginated audit history restricted to evidence belonging to the authorized task; no silent truncation of the historical ledger.
- POST: one `awb` string and UUID `submission_key`; only the assigned executing operator before POP finalization and first handover closure. A duplicate active AWB claim is rejected. Never changes POP quantities.
- POST `/corrections`: an active Admin, required nonblank `reason`, UUID `submission_key`, optional `evidence_id`, required `expected_version` for existing evidence, and replacement `awb` (null revokes an existing claim). Omitting evidence ID adds late evidence explicitly. Same request/key/actor can replay without another event; a reused key with a different payload or actor is a conflict.
- JSON requests require existing session/CSRF protections. Invalid input returns 422; unauthorized changes 403; stale evidence or idempotency-key conflicts 409; a claim belonging to another task is not corrected through this task. Active AWB uniqueness is enforced in MySQL as well as validation.
- Current claims are a projection. Original AWB and append-only events preserve prior values, owner/pickup, actor/time/reason and before/after derived match/reconciliation snapshots. Revocation clears the active claim without deleting history. Re-evaluation and correction are transactional; no external JNE call occurs.
- Mobile exposure requires the existing mobile execution token scope; it must not broaden pickup/handover role permissions. The initial web workflow and backend are implemented first; mobile UI support must be explicitly verified before claiming it.

Existing Laravel feature tests are the executable contract. No Postman workspace, external publication, additional service or test dependency is introduced for these internal endpoints.

M4 storage: `pickup_cashless_awbs` holds the current claim, immutable original AWB and optimistic version. `pickup_cashless_awb_events` is the append-only decision ledger with original/replacement inputs, actor, reason, request hash/key and derived outcome snapshots. The current claim is deliberately materialized for uniqueness and efficient joins; events preserve history. Revocation makes the current AWB null instead of deleting either table's evidence. `handover_sessions.sertim_closed_at` records the first close independently of later reopen/current closure fields. Upgrade backfills it from original close events, including reopened sessions.

## Durable APEX batch recovery contract

Opt-in flag `JNE_APEX_BATCH_CHECKPOINTS_ENABLED` defaults false until the migration and worker rollout are accepted in UAT. Worker POST `/api/internal/report-jobs/{job}/batches/{number}` uses the existing bearer, worker identity, claim token and live lease. A UUID `start_key` begins a batch idempotently; a different key cannot repeat a STARTED batch. A SAVED batch returns its private CSV as base64 plus checksum to the authorized worker; it is reused without calling APEX. A multipart `file` saves the exact batch's validated AWB set idempotently. Unexpected AWBs or different saved results are rejected.

Admin POST `/admin/report-runs/{job}/apex-recovery` requires a reason. Selecting an uncertain batch either uploads its exact History APEX CSV or explicitly confirms it was never submitted. An empty batch selection resumes from durable checkpoints only after all uncertain batches are resolved. Review and resume are recorded in report events with actor/reason; original saved results remain. Recovery never infers an external Process outcome from a timeout. Worker failures retain private `recovery-job-*` files rather than deleting potentially useful downloads; review/restore them before manual cleanup. Source-child outputs and final import remain separate from these intermediate checkpoints.

Admin `/admin/jne-monitoring/evidence-rules` extends current monitoring with draft/verified source contracts, registered code aliases and scoped shipper aliases. POST creates an immutable contract revision or a mapping with an explicit verification decision; POST `/disable` requires kind/id/version/reason. Policy activation is unavailable when the environment gate is off. Active changes queue a fenced `JneMappingRun.reapply_all` pass; no external JNE call, POP change or automatic alias creation follows a shipment correction. `jne_evidence_rule_events` records actor/reason and before/after configuration. Existing session/CSRF and active Admin authorization apply; invalid/stale/unauthorized writes return 422/409/403 respectively. Existing Laravel feature tests and disposable Chromium forms are the executable contracts.
