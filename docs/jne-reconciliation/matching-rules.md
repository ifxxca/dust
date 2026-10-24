# Matching rules

## Existing confirmed behavior

1. Normalize a shipper name by uppercase and collapsed whitespace, preserving original imported cells.
2. Look up active registered aliases. One active customer may resolve; multiple registered customers remain ambiguous. Retrieval account/profile never selects the owner.
3. Independently associate pickup only through a unique exact reference to a finalized task or effective processing record for that customer.
4. A conflicting new reference/mapping must not silently replace a prior pickup. Existing manual link/unlink decisions survive automatic replay.
5. Store decisions in `jne_shipment_match_events` with previous/current links, actor/method/reason.

M3 retains historical `AMBIGUOUS` and adds `CANDIDATE` and `CONFLICT`. Typo candidates have no assigned customer/pickup. Conflicting verified owners across report observations remain conflicts, including when the conflicting source arrives late.

Identity resolution reads original report rows for the AWB independently of the latest tracking snapshot. Blank shipper/reference fields on a refresh do not erase earlier verified evidence. Historical references must still match the current effective processing reference or finalized task; superseded processing declarations are excluded. Alias replay includes historical source names even when the latest tracking row is sparse.

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
