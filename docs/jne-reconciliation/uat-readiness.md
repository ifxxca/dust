# UAT readiness

Prepared 25 October 2026. The safe technical implementation across M1–M8 is ready for consolidated UAT. Operational verification and production readiness are **not established**.

## State distinctions

| State | Result |
|---|---|
| Implemented | Four-source recovery/checkpointing, canonical provenance, configurable exact identity/scopes, reused Sertim, category/completeness workflow, equivalent-evidence review, tracking policy and monitoring |
| Automated verification | 756 PHP tests passed, five pre-existing skips, 7,067 assertions; 89 frontend tests; 75 worker tests; actual Chromium forms; PHPStan, Pint, TypeScript and production build passed |
| Ready for UAT | One consolidated plan in uat-plan.md with real sample checklist, expected/actual fields and rollback criteria |
| Operationally verified | Pending; synthetic fixtures do not certify live Hybrid/APEX semantics or availability |
| Blocked by external source contract | Production activation of B1–B4/B6–B8 meanings; technical configuration/review support is implemented |
| Production ready | Pending operational sign-off, target MySQL/environment validation and separately authorized rollout |

## Five additive continuation migrations

- 2026_10_24_164204_create_report_job_batches_table.php
- 2026_10_24_165233_create_jne_evidence_configuration_tables.php
- 2026_10_24_165910_add_evidence_review_audit_to_jne_mapping_runs.php
- 2026_10_24_171745_add_jne_category_and_collection_evidence.php
- 2026_10_24_194118_add_refresh_policy_to_jne_report_profiles.php

These were exercised in disposable test databases and remain unapplied to the operational database during this continuation. They add current projections plus historical audit deliberately; original import/status/Sertim tables remain the evidence source. No dependency or infrastructure was added.

## Activation defaults

| Environment key | Default | UAT prerequisite |
|---|---|---|
| JNE_APEX_BATCH_CHECKPOINTS_ENABLED | false | Batch migration, compatible worker/API rollout, exact restart/uncertainty acceptance |
| JNE_SOURCE_EVIDENCE_ENABLED | false | Source evidence migration and original-file checksum validation |
| JNE_EVIDENCE_POLICIES_ENABLED | false | Configuration/audit migrations and verified actual source/mapping contracts |
| JNE_CATEGORY_RECONCILIATION_ENABLED | false | Evidence gate plus signed-off literal category/Hybrid-origin rules |
| JNE_COLLECTION_ATTESTATION_ENABLED | false | Evidence gate plus approved required-source/cutoff checklist |
| JNE_TRACKING_POLICIES_ENABLED | false | Policy migration, verified approved profile policy; schedule activation remains separate |

Do not flip these in production as a side effect of testing. No production schedule, ownership, finalized POP or live JNE Process was modified by this continuation. Existing defaults/legacy operational policies remain intact.

## Practical boundaries

- No authoritative code column or National Account routing rule was invented.
- Exact code extraction uses original imported standardized report headers. Raw Hybrid originals are retained; Hybrid process/checksum provenance can support explicit category rules. Do not presume raw-only code headers survive APEX.
- Unknown categories, incomplete collection and unresolved identity remain visible rather than manufactured matches.
- Initial Sertim is responsive web/text or keyboard barcode entry; no new native camera/offline app.
- Batch review is at most 100 explicitly selected equivalent records; pagination permits complete review without hidden truncation.
- Suggestions are bounded; overflow remains unmatched and exact verified rules still work.
- Terminal/SLA/source-hour values are configurable, disabled and unverified until B8 acceptance.
- No Customer Portal, microservice, extra dependency or production schedule activation was introduced.
- Retained failed worker recovery files require deliberate operator retention/cleanup after the uncertainty is resolved.

## Handoff

Use uat-plan.md for one complete operational session. Record all real samples/checksums, approved contracts/scopes/policies, actual results, audit IDs, failures and reviewers. After remediation rerun affected engineering tests, critical UAT cases and target-environment full suite. Preserve raw evidence and append correction history; do not use destructive migration rollback to undo an ownership decision.

Work is committed on codex/jne-reconciliation. This continuation is not pushed. Unrelated pre-existing UI changes and untracked artifacts are preserved.
