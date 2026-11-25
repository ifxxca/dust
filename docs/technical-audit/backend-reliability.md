# Backend reliability and data integrity

## Strengths to preserve

Domain Actions re-read actors and lock operational rows; controller/UI capabilities are not the only enforcement. TakeOverTask.php:20 checks expected version and expected owner before assignment, and eligibility forbids takeover once execution begins. AssignPickupTasks validates the entire locked selection before writes. FinalizePickup has a per-task proof and submission replay check, capture-hash comparison and evidence-file compensation on exceptions. These are useful safeguards.

Initial POP quantities, appended POP revisions, warehouse verification baselines and AWB evidence are separate records. CorrectPickupRecord and CorrectVerification create auditable revisions rather than replacing initial values. CloseSession rejects pending items, stale POP baselines and unexplained discrepancy. AmendSession retains sertim_closed_at when reopening warehouse verification, preserving the closed collection window.

RecordCashlessAwb checks active Admin role for correction, requires a reason and expected version for edited evidence, rejects conflicting global AWB claims and records before/after effects. RecordCashlessHandover is additive collection with assignment, closure and reconciliation-lock guards, not a permission to edit existing finalized evidence. Adding evidence after POP finalization is explicitly exercised by current tests; it must not be confused with changing the finalized quantity or correcting an existing AWB.

The operational date is centralized in PickupResultPeriod.php:10–26 as Asia/Jakarta, subtracting five hours to derive the business date. Reporting source calendar filters are not automatically operational-day filters; changing all dates to the same boundary would alter business semantics.

## Workflow integrity matrix

| Workflow | Existing guard | Remaining assessment |
|---|---|---|
| Assignment / takeover | locked actor/task, expected owner/version, terminal/execution guards, events | Existing sequential conflict tests passed; real MySQL interleavings not run |
| POP finalization | task lock, unique proof/submission, capture hash, visit prerequisite, file cleanup | Preserve; lock-order issue with nested cashless capture is TA-07 |
| Handover creation / membership | sorted locked tasks, unique membership, atomic rejection, submission key | No double-membership defect established; repeated reads TA-02 |
| Retail verification / closure | session/item/task locks, version, POP revision baseline, discrepancy notes | No silent baseline rewrite found; reverse lock ordering with POP correction needs MySQL regression |
| Admin POP / AWB corrections | active Admin checks, reason, revisions/events, stale versions | No confirmed correction authorization bypass |
| Additive cashless submission | normalized distinct AWBs; unique active evidence; payload hash; replay bound to actor/task | No duplicate business effects found in tested replays |
| Cashless external batch | lane lock, ownership token/hash, event replay hashes, UNKNOWN hold | Deliberately blocks uncertain resend; do not weaken to “retry everything” |
| Report import / projection | checksum, unique report/AWB, transaction, unique observation/source, newer-snapshot guard | Strong local test evidence; long transaction/history risks TA-06 |
| Customer identity / matching | exact codes/verified aliases, scopes, candidate-only fuzzy results, conflict states, decision history | Preserve independent identity/account/source/pickup evidence |
| Late reports | retained source observations and independent reconciliation | Tested late data invalidation does not rewrite finalized POP |
| Manifest delivery | immutable snapshot/hash, revalidation before send, uncertain-send guard | Sender recovery exists for manifests; receipt path differs (TA-09) |

CreateSession same-key replay checks actor and returns the existing session rather than accepting a new membership payload. The mobile client freezes submission attempts. No changed-payload membership corruption was demonstrated; a stronger explicit payload hash could be considered only if the contract later requires it, not as an invented business rule.

## Actionable concerns

- TA-07: customer/task and session/task lock-order inversions create plausible deadlock cycles. Transactions preserve atomicity, and several paths retry, so this is a reliability risk rather than proof of business corruption.
- TA-05: global invalidation performs per-pickup reads and updates in the caller. Queue uniqueness limits execution but not the HTTP/transaction producer cost.
- TA-08: unexpected import/scheduler failures discard the original exception. Safe user messages should remain, with private correlated diagnostics added later.
- TA-09: receipt SMTP runs after POP commit but before its HTTP acknowledgment, with no stale receipt PROCESSING recovery.
- TA-10: QUEUED processing states need an aged-work check before asserting enqueue/crash recovery is complete.

Detailed scenarios, minimum fixes, effort and regression cases are in findings.md. No locking, exception-handling, service extraction or transaction changes were implemented.

## Architecture judgment

Controllers generally delegate mutations to Actions and use Form Requests or explicit validated allowlists. Inline validation is not itself a defect. Models contain focused relationships, effective-revision projection and capability helpers. Guarded=['id'] is broad, but reviewed HTTP mutation boundaries restrict fields; it is not evidence of a mass-assignment exploit.

The monolith's shared database transactions are valuable for closely coupled pickup, proof and handover rules. Do not replace them with asynchronous cross-service transactions, introduce blanket eager loading or split the matcher into generic strategy layers as part of this roadmap. Fix demonstrated call-path issues in small steps with existing business tests.

