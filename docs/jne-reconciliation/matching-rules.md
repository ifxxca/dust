# Matching rules

## Existing confirmed behavior

1. Normalize a shipper name by uppercase and collapsed whitespace, preserving original imported cells.
2. Look up active registered aliases. One active customer may resolve; multiple registered customers remain ambiguous. Retrieval account/profile never selects the owner.
3. Independently associate pickup only through a unique exact reference to a finalized task or effective processing record for that customer.
4. A conflicting new reference/mapping must not silently replace a prior pickup. Existing manual link/unlink decisions survive automatic replay.
5. Store decisions in `jne_shipment_match_events` with previous/current links, actor/method/reason.

M3 retains historical `AMBIGUOUS` and adds `CANDIDATE` and `CONFLICT`. Typo candidates have no assigned customer/pickup. Conflicting verified owners across report observations remain conflicts, including when the conflicting source arrives late.

Identity resolution reads original report rows for the AWB independently of the latest tracking snapshot. Blank shipper/reference fields on a refresh do not erase earlier verified evidence. Historical references must still match the current effective processing reference or finalized task; superseded processing declarations are excluded. Alias replay includes historical source names even when the latest tracking row is sparse.

Category reconciliation counts a collected Sertim AWB only when customer and pickup statuses are both MATCHED and both IDs agree with the active claim. A retained pointer under conflict/ambiguity is not confirmation. Other confidently linked AWBs remain unclassified: neither AWB prefix, account nor equal totals establish Manual/CSS category. A closed Sertim window permits late report matching but does not establish external collection completeness or missing AWBs.

When Sertim supplies identity for an otherwise anonymous marketplace sender, exact current/finalized references must still be checked for that customer. A reference to a different pickup leaves customer identity MATCHED but pickup attribution CONFLICT; neither pickup receives a confirmed category count. The decision event records both the Sertim revision and source/reference pickup IDs. Review details expose these immutable event snapshots and each observation's original sender/account/reference, including older observations.

Candidate generation is bounded: up to 100 unique unknown names per resolution batch, a maximum catalog of 5,000 active registered aliases, names 4–120 folded characters, edit distance at most two (one for shorter names), and at most five customer suggestions. Case/space normalization remains the exact mapping rule; punctuation folding and edit distance are suggestions only. Exceeding the bounds leaves records unmatched rather than making a weaker automatic decision. Names configured as non-identifying marketplace labels are excluded from alias-only ownership and suggestions; explicit uncontested AWB evidence may still resolve them later.

Current candidate details are stored in `jne_shipments.customer_match_candidates`. Match events now retain source-row and registered-alias IDs in `evidence`; original raw source values are unchanged. No customer-code source column, code-prefix rule or code-alias relationship is inferred.

## Target precedence and gates

| Evidence | May confirm automatically? | Gate / constraint |
|---|---|---|
| Authorized explicit AWB pickup/customer claim | Yes, after conflict checks | Sertim write/correction/verification rules B5 |
| Exact registered customer code | Yes | Verified source field B3; conflicting evidence must be surfaced |
| Exact registered code alias | Yes | Explicit registered relationship; never derive suffix/prefix ownership |
| Exact registered shipper alias | Yes within verified scope | Existing global mappings work today; scope changes need B4 |
| Typo/case/punctuation/token similarity | Candidate only | Bounded explainable suggestions; source untouched; no customer/pickup assignment |
| Account/date/location/quantity context | Supporting only | Never sufficient alone; collection completion B7 and category evidence B6 are separate |

Marketplace names such as Shopee International or Tokopedia do not establish Retail identity by themselves. A spelling resemblance must not turn such a name into an owner. Any future permanent mapping must be an explicit scoped decision, separate from a one-AWB correction.

Category confidence must be independent of customer/pickup confidence. A matched reference does not establish Manual/Cashless/CSS. Quantities are comparison results, never matching evidence.

## Implemented explicit AWB evidence (M4)

An active Sertim Cashless claim for the exact normalized AWB may resolve its registered task/customer even when the shipper is a marketplace label. Conflicting registered customer evidence or inconsistent claim ownership produces CONFLICT. Explicit evidence never overrides contradictory verified evidence silently. A conflicting claim against a manual decision flags the decision for review while preserving its linked IDs.

Corrections re-evaluate both removed and replacement AWBs in the same transaction as the evidence/audit write. A revoked Sertim-only link is removed when no other verified evidence supports it. Manual decisions are not silently replaced. Independent aliases/references may still support an old AWB after revocation; such results remain explainable in the audit snapshot. No shipment registry row is invented by a scan before JNE data arrives.

## Configurable identity contracts (implementation-first continuation)

The source-contract/code-alias path is implemented behind `JNE_EVIDENCE_POLICIES_ENABLED=false`. A contract names an exact original CSV header; no default maps ID_ACCOUNT, NOREF or another guessed field to a Retail code. Approved synthetic fixtures use RETAIL_CODE_FIXTURE only. Primary customer codes and explicitly registered active/verified code aliases match exactly after case/whitespace and spreadsheet text-wrapper normalization; originals remain unchanged. Code prefixes/suffixes are never inferred. Similar primary/alias codes, including 400O and 400OB, produce candidates only.

Code, shipper and Sertim evidence are checked for contradictory owners, including historical observations. A verified code does not erase a conflicting verified sender. Scoped code/shipper aliases require the exact configured account and an entry date within inclusive configured bounds; a missing entry date cannot satisfy a dated scope. A scope is a constraint on verified evidence, not account-based ownership. Legacy global alias behavior remains intact. Unverified scoped mappings never confirm ownership.

Admin configuration writes require an active Admin and reason. Contract revisions preserve prior definitions; activation requires the environment gate and explicit verification. Draft mappings can be verified in place without inserting a duplicate. Superseded contract revisions cannot be reactivated; the latest draft must be explicitly verified. Duplicate scoped mappings and stale requests are rejected. Changes retain before/after rule audit and queue the existing bounded/fenced mapping replay; manual shipment links remain protected. Rule registries, configuration audit and full shipment decision audit are paginated.

## Category, collection and human decisions

With the category gate enabled, exact configured original-column values or registered Hybrid source/type classifications may establish a category. Active Sertim is explicit Cashless evidence. Multiple different verified categories produce CONFLICT, independently of customer/pickup decisions. Every classification retains source/contract revision or Sertim revision evidence; no category is inferred from AWB prefix, account, amount or count.

Three category counts require customer MATCHED, pickup MATCHED, actual pickup customer agreement, and category MATCHED. Retained uncertain pointers and unclassified linked AWBs prevent complete reconciliation even when the confirmed total equals POP. POP expectations come from existing effective revisions; no import or review changes their original quantities.

External completeness requires a separately enabled, versioned Admin attestation against a verified contract's required sources. Selected reports must be ready, and scope/cutoff must be explicitly checked. A report finishing or a Sertim window closing does not attest completeness. Source rows arriving after the attestation high-water mark, including an older job or an as-yet-unowned AWB in a required source/account scope, invalidate it to REVIEW. Changed POP/Sertim or report/contract evidence also invalidates it. No elapsed-time rule declares missing AWBs.

Individual and batch review require active Admin, a reason and current versions. Batch members must share the server-generated original evidence/context fingerprint; an account alone is insufficient. A reviewed owner does not imply a pickup: an optional pickup must belong to the chosen customer and have finalized POP. Active contradictory Sertim must first use the audited Sertim correction workflow. Review never silently creates a permanent alias.

Identity review snapshots the current automatic decision. Unchanged replay preserves the reviewed result; changed evidence flags it for review without silently changing its owner/pickup. Category review similarly retains its evidence fingerprint and flags changed contrary classifications. Explicit release records the before/after and re-evaluates original evidence. All affected AWBs and decisions remain in the append-only match ledger.

Code suggestions are also bounded to 100 unique code/scope/time inputs per batch, a total 5,000-entry primary/alias catalog and five customers per suggestion. Exact matches remain available beyond suggestion limits. Configured code extraction currently reads the imported standardized report's original CSV headers; raw Hybrid files remain preserved, while process-level category rules use retained Hybrid origins. Do not configure a raw Hybrid-only header as though it were present in standardized APEX output.
