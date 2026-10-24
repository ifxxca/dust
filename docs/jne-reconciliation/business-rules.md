# Business rules and decision register

Updated 25 October 2026. Generic technical support for unresolved rules is implemented for consolidated UAT. Unknown semantics remain activation gates; no business answer is inferred from time, account, quantity or spelling similarity.

## Established integrity rules

- Preserve original CSVs/cells, original AWBs and historical observations. Normalization is derived evidence.
- One normalized AWB has one registry row; repeated source observations are separate immutable evidence.
- Collection, customer attribution, pickup attribution, category reconciliation, Sertim closure and tracking freshness are independent states.
- Shared accounts and marketplace names do not prove ownership. Code prefixes and equal quantities do not prove ownership or category.
- Exact verified codes/aliases and uncontested authorized AWB evidence may confirm identity. Fuzzy matches only generate candidates.
- Customer matching does not imply pickup matching. Ambiguous/conflicting records remain unresolved.
- Original finalized POP, physical verification and historical closures must not be changed by imports, matching or Sertim corrections.
- A manual decision does not automatically become a permanent rule.
- No missing-shipment decision may be based only on elapsed time or Sertim closure.

## Source and policy decisions for UAT

| ID | Required real-world verification | Implemented technical support | Activation gate |
|---|---|---|---|
| B1 | Confirm four Roberto/Nuralamt cashless/manual outputs, local date/export columns and headerless AWB upload | Existing four-part automation, deduplicated merge, validation, saved source recovery and durable APEX batches | Operational acceptance of actual source contract |
| B2 | Meaning/supplier of National Acc/Cust Y/N and routing of Hybrid special cases | Profile/job Y/N snapshots and current worker parameter selection | No inferred Y/N or new routing policy |
| B3 | Authoritative Retail customer-code column in standardized imported reports; null/incorrect values | Nullable exact header configuration, original code evidence, primary/registered code aliases, candidates | No preselected column; ID_ACCOUNT/NOREF are not substituted |
| B4 | Actual global versus account/date alias scope | Verified exact account and inclusive entry-date constraints plus legacy global aliases | Confirm each real mapping; missing entry date cannot satisfy dated scope |
| B5 | Confirmed Sertim authority/closure rules below | Existing complete responsive web workflow reused | No additional decision required |
| B6 | Authoritative Manual/Cashless/CSS values or Hybrid process classifications, including contradictory origins | Configured literal column/value and Hybrid-origin rules, category projection/evidence/conflicts | No PAYMENT_TYPE/prefix/process-name default is authoritative |
| B7 | Required sources/account/date scope and cutoff for external collection completeness | Independent audited Admin attestation, selected ready reports, required-source config, version/idempotency and invalidation | No automatic timer or first handover close marks external collection complete |
| B8 | Source hours, refresh intervals, SLA, terminal statuses/confirmation, especially RETURNED | Draft/verified policy UI, receipt floors, priority/SLA, distinct chronological terminal confirmation, bounded backoff | Defaults disabled; actual policy values require UAT evidence |

Record verified answers, samples, verifier, time and scope in the UAT package. These gates do not require incremental implementation approval.

## Confirmed BR-SERTIM-01 — correction authority

Only an active Admin may add, replace, revoke or correct Sertim AWB evidence after POP finalization or first handover closure. Pickup Staff and Retail Staff are denied at the backend. If earlier Sertim finalization is introduced, it must use the same authority rule.

Admin correction uses an explicit authorized workflow with a required nonblank reason, current version and idempotent UUID. Preserve original AWB, previous/replacement AWB, customer/pickup, Admin actor/time/reason and affected matching/reconciliation snapshots in immutable events. Normalize and validate the replacement; reject duplicate active claims or flag conflicting evidence.

Re-evaluate only affected old/replacement AWBs transactionally. Never silently update finalized POP, physical verification or historical closure. Existing permissions outside Sertim remain unchanged.

## Confirmed BR-SERTIM-02 — collection closure

The Sertim window closes on the associated handover's first closure. Its persistent latch remains CLOSED after handover reopen. Normal entry/editing is blocked after POP finalization or that first closure; only explicit audited Admin correction remains available.

Before finalization/closure, assigned executing staff use the existing authorized workflow. The initial implementation is append-only capture; replacement/revocation already uses Admin correction.

Closing Sertim does not require Hybrid/APEX completion and does not stop later imports or reconciliation. Any future reopening of the scan window requires a separate explicit business decision.

## Confirmed BR-SERTIM-03 — independent completion

Hybrid collected, APEX completed, import completed, Sertim closed, customer matched, pickup matched, POP reconciled and tracking refreshed remain distinct.

A 17:00 handover closure followed by a 19:00 report may still match existing Sertim evidence and update derived reconciliation, without reopening handover or changing POP.

## Confirmed BR-SERTIM-04 — correction integrity

Exact registered codes/verified aliases and explicit uncontested Sertim may support automatic matching. Shared accounts, marketplace names and fuzzy candidates do not. Conflicting source/customer/pickup/category claims require review.

Every Admin correction preserves original evidence, validates replacements, checks duplicates/conflicts, re-evaluates affected matches, updates derived reconciliation and retains historical audit. It must not change unrelated customers/pickups.

The operator repeated these rules in response to the later category/completeness question. That repetition did not resolve B6 or external B7 and did not reopen any confirmed Sertim decision.

## Configuration, review and activation

- Contracts default to draft/inactive and nullable code/category columns. Definition revisions remain intact; only the latest revision may be activated. Mapping drafts can be verified in place. Activation/disable requires active Admin, reason and version/revision, with an audit and fenced replay.
- Batch review requires equivalent original source/context evidence and current AWB versions. A reviewed customer does not imply a pickup; a selected pickup must belong to that customer and have final POP.
- Contrary active Sertim must first use Sertim correction; general exception review cannot bypass that workflow.
- Category confirmation requires both evidence and category gates. Different verified categories conflict. Counts require confirmed customer, pickup, actual owner agreement and category.
- External completeness requires its gate, finalized POP, active verified required-source contract, ready selected report evidence, explicit scope confirmation, past cutoff and reason.
- New required-scope observations, including unowned AWBs and late rows from older jobs, or changed POP/Sertim/report/contract evidence invalidate old completeness to REVIEW. No scan window is reopened.
- Tracking activation requires its environment gate plus explicit verified policy enablement. Saving a policy does not enable or reschedule an operational profile.
- All six new environment gates default false. No live ownership, POP quantity or schedule was changed for development/tests.

## Scope limits

Initial Sertim uses the existing responsive web pages and text/barcode keyboard entry. Native camera scanning/offline capture is not added. Configured code columns refer to imported standardized report headers; raw Hybrid originals remain stored and their process/checksum origins support explicitly configured category rules. No raw-only header is guessed into standardized APEX output. A future Customer Portal is outside scope.
