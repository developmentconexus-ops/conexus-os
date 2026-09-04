# Budget Analyzer — First-Vertical Product Semantic Contract

> **Status:** OPERATOR APPROVED / 4A-BUDGET-01 CLOSED / INDEPENDENT REVIEW ADJUDICATED / 4A RATIFICATION PENDING
> **Product:** Analisador Inteligente de Orçamentos — Sankhya
> **Purpose:** close the smallest real business semantic/result inventory required to instantiate the 4A Project-defined Query grammar without copying Mitra's implementation fragmentation.
> **Not authorized:** OpenAPI, SQL, schema, sync implementation, frontend, runtime or Product code.

This contract is the operator-approved **Product/Brain semantic decision** for the first Budget Analyzer vertical. It deliberately uses Mitra only as benchmark Evidence. No Mitra query, table, heuristic or function count becomes Conexus authority by observation.

The accepted Product meaning is intentionally separated from the initial Sankhya source mapping. A later real-source proof may correct a source field/type mapping without silently redefining the Product concept.

---

## 1. Decision question

> What is the smallest useful and truth-preserving first Budget Analyzer result set that is sufficiently exact for 4A to derive the first Project-defined Product operations, while refusing unsupported margin/conversion/probability semantics?

The first vertical remains read-only analytics.

---

## 2. Evidence we have — not authority

The Mitra benchmark/source study established useful historical Evidence against a real Sankhya environment:

```text
candidate Budget population evidence
→ CODTIPOPER IN (14, 714)
→ TGFTOP.ORCAMENTO='S' was unreliable in that source

candidate pending evidence
→ PENDENTE='S'
→ no derivative relation in TGFVAR

historical benchmark snapshot
→ 187 pending budgets
→ R$ 6,283,878 pending value

margin
→ VLRCUS was not usable as cost in 94.8% of sampled items
→ margin feature was correctly cancelled

aging benchmark
→ Mitra used days since DTALTER
→ Mitra used bands <=3, <=7, <=30, >30

Mitra implementation
→ 28 analytical server functions
→ seller/customer/aging/month cross-filters
```

The benchmark also used a heuristic factor approximately `1.00 / 0.45 / 0.20 / 0.05` by aging band. That factor has no accepted Conexus business authority and is **not** imported by this contract.

These facts formulate and falsify the Conexus Product contract. They do not settle Product meaning by themselves.

---

## 3. Accepted F1 semantic boundary

### 3.1 Dataset grain

One analytical Budget entity represents **one exact Sankhya budget/order header** under the admitted source/Connection scope.

Conceptually:

```text
Budget grain
= exact source-qualified Budget document identity
```

The canonical source identity and field mapping are proven later against the real Sankhya Connection; 4A does not select physical mirror columns.

### 3.2 Budget semantic and initial source mapping

Accepted Product meaning:

> A document is a Budget only when the current published Brain semantic definition admits that source document into the Budget population.

The initial Sankhya mapping Evidence is:

```text
CODTIPOPER ∈ {14, 714}
```

This is **not** the Product definition of Budget. It is an initial source binding hypothesis that must survive real-source validation for the bound Sankhya Connection. If the exact operation codes differ while the accepted Budget meaning remains intact, the smallest correction is to the Brain/source mapping rather than to Product authority.

`TGFTOP.ORCAMENTO='S'` is not accepted as authority merely because a field is named like a business concept.

### 3.3 Pending Budget semantic and initial source mapping

Accepted Product meaning:

> A Pending Budget is an admitted Budget whose current authoritative source state says it remains pending and for which no current admitted conversion/derivative relation establishes conversion.

The initial Sankhya mapping Evidence is:

```text
PENDENTE = 'S'
AND no admitted derivative relation in TGFVAR
```

This mapping must survive real-source proof. The exact derivative topology is a source/Brain proof obligation; unknown or ambiguous derivation must not be silently classified as pending or converted.

### 3.4 Time coordinate

Every age/time-derived result is bound to an explicit **`as_of` source/reconciliation coordinate** carried with that admitted response or page.

For F1:

```text
as_of
= exact source/reconciliation coordinate of that analytical result

as_of
!= arbitrary caller-selected historical query coordinate
```

The caller cannot request unconstrained historical reconstruction merely by supplying an old timestamp or coordinate. Historical snapshot/query capability would be a separate Product decision and is not admitted in F1.

F1 also does **not** promise that separate `AnalyzePendingBudgets` and `ListPendingBudgets` calls, or separate drilldown pages, remain pinned to one retained snapshot. Each response/page carries its own system-resolved coordinate. If the coordinate changes, that difference must remain visible; consumers must not represent mixed-coordinate data as one coherent snapshot.

This keeps result truth explicit without inventing temporal retention or caller-controlled historical selection.

### 3.5 Budget age

Accepted Product meaning:

```text
budget_age_days
= calendar-day difference between the canonical Budget business date and as_of
```

The exact Sankhya field that supplies the canonical Budget business date is fixed by the published Brain mapping after real-source proof. 4A does not guess `DTNEG` or another field by name.

`DTALTER` is **not** the F1 Budget-age authority. A technical or administrative update must not make an old Budget analytically young. Last-change time may remain observable provenance/detail, but `days_since_last_change` is not admitted as an F1 Product metric.

A future-dated canonical Budget business date producing `budget_age_days < 0` is **not** clamped to zero and is not assigned to any accepted aging band. The affected record/result must remain truthfully excluded with `PARTIAL` coverage when it can be isolated, or become `UNVERIFIED / INDETERMINATE` when correct coverage cannot be established. A later business requirement for future-dated Budgets must reopen only this semantic item before adding a new band or rule.

### 3.6 Aging bands

The accepted F1 semantic bands are:

```text
AGE_0_3
AGE_4_7
AGE_8_30
AGE_31_PLUS
```

These are neutral analytical bands, not probability claims.

The Mitra label `Janela de ouro` is **not** canonical business truth. 4C may later choose a user-facing label only if it does not imply unsupported probability or business policy.

### 3.7 Source qualification

Seller, customer, company and Budget identities remain source-qualified.

If one Connection credential can technically see multiple companies, that does **not** authorize ambient all-company analysis. The exact ProjectConnectionBinding/source scope decides what is admitted.

### 3.8 Monetary unit and human dimension presentation

Every admitted response/page that returns a monetary value carries one exact ISO 4217 `currencyCode` applying to every monetary value in that response/page. A result scope containing multiple currencies is not aggregated in F1: without a separately accepted grouping or conversion semantic it fails closed through the applicable `UNSUPPORTED` / `INDETERMINATE` truth state and returns no business values.

The historical Mitra benchmark's `R$` is Evidence only. It does not authorize the frontend to hardcode BRL.

Every returned seller/customer aggregate member and drilldown row carries both:

```text
stable source-qualified seller/customer ID
+ owner-issued non-empty seller/customer name
```

The ID remains filter/trace authority; the name is the required human presentation. If the current source/Brain projection cannot resolve that presentation, existing degraded truth/coverage semantics apply. The browser does not invent a name or perform an undisclosed directory join.

---

## 4. Supported first Product-visible results

The accepted minimum useful result inventory is:

### R1 — Pending summary

```text
pending_budget_count
pending_budget_value
currency_code
as_of
freshness / coverage / provenance state
```

No zero is returned for unknown/partial/unverified source state.

### R2 — Pending by seller

Per exact seller identity:

```text
budget_count
budget_value
average_budget_age_days
seller identity + required human name
```

### R3 — Pending by customer

Per exact customer identity:

```text
budget_count
budget_value
average_budget_age_days
customer identity + required human name
```

### R4 — Pending by aging band

Per accepted band:

```text
budget_count
budget_value
```

### R5 — Pending by month

Per admitted calendar month of the canonical Budget business date:

```text
budget_count
budget_value
```

The exact source field used for the canonical business date must be fixed by the published Brain mapping before implementation. 4A does not silently choose a Sankhya field by field-name intuition.

### R6 — Pending Budget drilldown

A pageable/read-only list sufficient to inspect the Budgets behind aggregate results, with exact source-qualified identifiers and the minimum accepted business fields such as:

```text
Budget identity
canonical Budget business date
last-change time/date as provenance where useful
budget_age_days
value
currency code for the response/page
seller identity + required human name
customer identity + required human name
source/company identity where admitted
current pending/derivation evidence state
```

4C decides presentation. 4B decides exact wire. 4D decides SQL/read-model mechanics.

---

## 5. Deliberately unsupported/deferred results

### 5.1 Margin

```text
margin = UNSUPPORTED_F1
```

Reason: benchmark Evidence found the apparent source-cost field unreliable in 94.8% of sampled items. A future margin result requires a real current cost semantic source and Brain publication; it may not be estimated from `VLRCUS` by convenience.

### 5.2 Heuristic conversion probability / opportunity score

```text
Mitra FATOR aging heuristic = REJECT_F1_AS_AUTHORITY
```

The observed `1.00 / 0.45 / 0.20 / 0.05` weighting is not a verified business probability model. Conexus must not label it "chance of conversion", expected revenue or intelligence score without Evidence and owner acceptance.

### 5.3 Actual conversion rate/value

```text
conversion metrics = DEFER / UNSUPPORTED until exact derivative semantics are proved
```

Reason: it is not enough to know that a `TGFVAR` row exists. Correct conversion may require proving one-to-many derivations, partial conversion, cancellations/returns, relevant operation types, time attribution and value semantics.

If conversion is later explicitly required, the smallest owning semantic item must reopen before that metric or operation is admitted. It must not be guessed from source topology.

---

## 6. Product operation reduction

Mitra's 28 analytical server functions are an implementation artifact, not 28 Product meanings.

The accepted Conexus operation surface is exactly **two** Project-defined registered `Query` operations.

### `AnalyzePendingBudgets`

One coherent analytical read that returns the closed R1–R5 snapshot under the admitted F1 filters.

Accepted filter dimensions may include only the closed semantic set required by this vertical:

```text
seller
customer
aging band
calendar month
source/company where explicitly admitted
```

The operation does **not** admit caller-defined arbitrary metrics, arbitrary dimensions, arbitrary `groupBy`, SQL or source fields. It is not a disguised generic analytics executor.

Conceptually:

```text
AnalyzePendingBudgets
→ R1 summary
+ R2 by seller
+ R3 by customer
+ R4 by aging band
+ R5 by month
+ as_of/freshness/coverage/provenance
```

Cross-filter presentation belongs to 4C. Exact input/output wire belongs to 4B.

### `ListPendingBudgets`

One pageable drilldown read for R6 under the same accepted semantic filters and source scope.

Each response/page is bound to its own system-resolved analytical coordinate and discloses that coordinate. F1 does not promise cross-call or cross-page snapshot pinning; if a refresh changes the coordinate, the Product must expose the change rather than silently treating mixed-coordinate pages as one coherent snapshot. The caller cannot select or replay an arbitrary historical `as_of`.

No third `GetBudgetDetail` operation is admitted until a real later interaction proves the list representation insufficient.

Therefore:

```text
N_budget = 2
```

This count is closed for the 4A candidate and remains subject only to the normal 4A adversarial proof/ratification gate, not to further semantic preference.

---

## 7. Published-App authorization

The first Budget Analyzer is read-only. Accepted F1 authorization is:

```text
Published App role admin  → AnalyzePendingBudgets + ListPendingBudgets
Published App role member → AnalyzePendingBudgets + ListPendingBudgets
```

Control Plane Project administration does not imply either app role. App roles do not imply Control Plane authority.

No Product Agent, MAR job caller or DEDICATED caller is admitted to these two Product operations merely to exercise infrastructure.

The internal governed sync that prepares the read model is a Release-pinned job and is not a Published-App business operation.

---

## 8. Required truth states

Both operations must preserve at least these semantic states where reachable:

```text
SUPPORTED_CURRENT
SUPPORTED_STALE
PARTIAL
UNVERIFIED / INDETERMINATE
UNSUPPORTED
DEPENDENCY_UNAVAILABLE
```

Exact code spelling belongs to 4B.

Rules:

```text
unknown != zero
partial != complete
stale != current
read-model result != source proof
empty current result != failed source
changed result coordinate != same analytical snapshot
negative Budget age != AGE_0_3
```

The Product must expose material `as_of`, freshness, coverage and provenance rather than treating request time as data time.

---

## 9. Accepted 3O proof-boundary projection

3O is already closed and is **not reopened** by this semantic decision.

The accepted first-vertical result inventory projected into downstream proof is:

```text
R1 summary
R2 seller distribution
R3 customer distribution
R4 aging distribution
R5 monthly trend
R6 drilldown
```

Any later concrete implementation/proof stage consuming this contract must preserve the accepted 3O falsification boundary by:

- binding every result to exact Brain semantic IDs/source mappings;
- proving the Budget and Pending population against real Sankhya at one common comparison coordinate;
- proving the canonical Budget business-date mapping used by age and month semantics;
- covering distinct transformation-rule classes rather than merely result count;
- including a deterministic negative control such as excluded non-Budget operation type, derivative converted Budget, wrong seller/customer scope, wrong aging boundary or future-dated Budget age;
- returning INDETERMINATE/UNSUPPORTED rather than fabricating truth when the source coordinate or semantic mapping is insufficient.

A correction to a Sankhya mapping should remain a mapping/proof correction unless Evidence genuinely falsifies the accepted Product semantic meaning.

---

## 10. Operator decision record

Operator approval was explicit on **2026-08-21**. The independent 4A review later narrowed two ambiguous edges without changing the approved Product focus, result set or operation count: no retained cross-call snapshot guarantee is admitted in F1, and negative Budget age is not silently clamped/banded.

The accepted F1 contract is:

```text
Product focus             = pending-budget intelligence
Budget semantic           = Brain-admitted Budget document
Initial Sankhya mapping   = CODTIPOPER {14,714} as Evidence; real-source validation required
Pending semantic          = admitted Budget currently pending with no admitted conversion relation proving otherwise
Initial pending mapping   = PENDENTE='S' + candidate TGFVAR topology as Evidence; real-source validation required
Time coordinate           = system-resolved source/reconciliation as_of per response/page; disclosed, not arbitrary historical query input
Snapshot coherence        = no retained cross-call/page pinning promised in F1; coordinate changes remain visible
Budget age                = as_of - canonical Budget business date; negative values are not clamped/banded
Age bands                 = 0–3 / 4–7 / 8–30 / 31+
Supported results         = summary + seller + customer + aging + month + drilldown
Monetary unit             = one required ISO 4217 currencyCode per value-bearing response/page; no implicit cross-currency aggregation
Human dimensions         = stable seller/customer IDs + required owner-issued non-empty names
Margin                    = unsupported
Heuristic probability     = rejected
Conversion metric         = deferred until separately proved and admitted
Product operations        = AnalyzePendingBudgets + ListPendingBudgets
N_budget                   = 2
App roles                  = admin + member read access
Product Agent/MAR/DEDICATED= not admitted for these operations in F1
```

The operator explicitly accepted the bounded 4C findings `4C-F39` and `4C-F40` on **2026-08-26**. This closes monetary-unit and seller/customer presentation truth without changing `N_budget`, caller classes, Permissions, owners or result families.

### Reopen triggers

Reopen only the smallest owning item if material Evidence establishes that:

- the accepted Product concept of Budget or Pending Budget is itself wrong, rather than merely a Sankhya binding code/field being wrong;
- the Pending derivative semantics are materially incomplete or false;
- the canonical Budget business-date semantic needs a different Product meaning, not merely a different source field mapping;
- the age-band boundaries do not reflect desired Product meaning, including a real requirement to classify future-dated Budgets;
- a real first-vertical consumer requires cross-call snapshot pinning/history or detail not expressible through the two admitted Queries;
- correct conversion semantics are proved and explicitly proposed for admission.

A source-code/field mapping correction alone does not manufacture a new Product operation or automatically reopen 4A.

---

## 11. Future Product direction — recorded, not admitted into current platform-planning scope

The operator recorded a credible later evolution of the Budget Analyzer: all admitted Budgets, exact line items, table/quoted/promotional value comparison, explicit savings and a read-only intelligent analysis using complementary relations already configured in the application's Product catalog. Alternative-product optimization by margin/turnover and Sankhya write-back remain later questions.

This direction is intentionally **not** a current 4A/4B/4C expansion. The Budget Analyzer remains the locked two-Query proving instance. Exact application UX, additional Project operations, Connector/SDK mechanics and runtime realization are reconsidered only when the platform program reaches the owning stage or a separately authorized Product-app cycle.
