# Business rules and decision register

## Established requirements

- An account is a retrieval parameter, not ownership evidence; accounts can be shared.
- AWB collection, customer attribution, pickup attribution, category reconciliation and tracking freshness are separate facts.
- Registered exact mappings may confirm identity; code prefix similarity and fuzzy similarity may only suggest candidates.
- Preserve original cells and files. Derived normalization/candidates never overwrite source evidence.
- Repeated observations must not create another shipment for the same normalized AWB.
- Equal quantities do not prove identity, pickup association or category.
- Do not label a quantity missing before its relevant collection window is complete.
- Keep finalized POP/handover quantity corrections in existing authorized revision workflows.
- A new manual decision does not automatically become a reusable alias rule.
- Do not infer category from existing AWB server prefix classification. `JneAwbSource` is an analytics grouping, not a verified POP category rule.

## Decisions needed from operator

| ID | Minimum decision | Evidence currently in code | Work gated |
|---|---|---|---|
| B1 | Confirm Roberto cashless/manual and Nuralamt cashless/manual, local day, export columns and headerless AWB upload requirements | `ReportJob::HYBRID_PARTS`, `ValidateHybridReportCsv`, `hybrid.mjs`, `hybrid-apex.mjs`; fixtures exercise this contract | Operational acceptance of M1; no change to those meanings until confirmed |
| B2 | Define National Acc/Cust YES/NO, authoritative supplier and Hybrid special-case routing | Profiles/jobs snapshot Y/N; parameter-mode worker sets `P45_NA`; no verified business definition | New automatic National Account/routing policy |
| B3 | Name the authoritative internal customer-code field in each source, including unknown/empty/incorrect code handling | APEX raw headers include `ID_ACCOUNT`, `NOREF`, `SHIPPER_NAME`; none is verified as Retail code | Exact code/code-alias auto-attribution; never reinterpret account or reference |
| B4 | Confirm which aliases are globally valid versus scoped by account, customer code, date or context, including marketplace names | Current registered aliases are global and duplicate names are ambiguous | Scoped reusable alias rules and migration of existing mappings |
| B5 | Identify staff allowed to enter/verify/correct Sertim AWBs, especially late entries and closed handovers; specify accepted scan format | Existing task ownership, active role checks, revision/event history protect POP/handover quantities | Production Sertim write workflow and claims/correction policy |
| B6 | Define authoritative Manual/Cashless/CSS category evidence and conflicts (including AWB appearing in two Hybrid process types) | Hybrid child type provides source context; APEX raw `PAYMENT_TYPE` and AWB prefixes are not approved category rules | Confirmed per-AWB category and category reconciliation |
| B7 | Define required collection sources and closure/cutoff per pickup/day, delay/grace period and reopen behavior | Four-source batch completion only proves that batch completed, not all shipments for a pickup were collected | Confirmed missing quantities and reconciliation completion |
| B8 | Confirm source availability, status terminality (especially RETURNED), terminal confirmation and SLA-risk definitions | Classifier has conservative statuses; active-refresh and terminal constants differ on RETURNED | Business-specific tracking priority/terminal policy |

Questions were presented to the operator during discovery. No answer is assumed from elapsed time. Existing configured behavior remains the starting point while safe technical work proceeds. Resolve decisions here with the supplied answer, date and scope before implementing dependent policy.
