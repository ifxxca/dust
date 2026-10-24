# Matching rules

## Existing confirmed behavior

1. Normalize a shipper name by uppercase and collapsed whitespace, preserving original imported cells.
2. Look up active registered aliases. One active customer may resolve; multiple registered customers remain ambiguous. Retrieval account/profile never selects the owner.
3. Independently associate pickup only through a unique exact reference to a finalized task or effective processing record for that customer.
4. A conflicting new reference/mapping must not silently replace a prior pickup. Existing manual link/unlink decisions survive automatic replay.
5. Store decisions in `jne_shipment_match_events` with previous/current links, actor/method/reason.

Current storage uses `MATCHED`, `UNMATCHED`, `AMBIGUOUS`. Target candidate/conflict distinctions must be introduced without reinterpreting historical ambiguous records as confirmed matches.

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
