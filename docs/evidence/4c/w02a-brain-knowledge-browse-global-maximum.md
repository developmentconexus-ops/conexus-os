# 4C-F07 — Brain knowledge-browse Global-Maximum assessment

> **Status:** `DECISION EVIDENCE / OPERATOR GATE / NOT PRODUCT AUTHORITY`
> **Finding:** [Brain structured knowledge-browse finding](w02a-brain-knowledge-browse-finding.md)
> **Question:** what is the smallest real owner/shape that lets the approved `Knowledge → Domain → Concept` experience consume exact Brain truth without frontend semantic invention?

## 1. Evidence

Repository authority already establishes:

```text
one canonical Workspace Brain
namespaces/domains organize content
SEMANTIC | KNOWLEDGE | EVIDENCE_SPEC are canonical Brain content classes
BRN-03 = exact immutable Brain revision detail read
BRN-03 reviewText = deterministic human-readable projection of exact sourceRevision
Brain != vector/RAG/index/memory
Project adoption = separate exact Brain revision binding
```

P9 established that `reviewText` alone is not a structured domain/concept browse contract.

External current references support the property, not the mechanism:

- mature catalogs expose business terms/categories/domains as structured discoverable objects rather than requiring a client to reconstruct business meaning from prose;
- mature ontology products expose standardized structured views of ontology concepts.

Those observations are Evidence only and do not create Conexus authority.

## 2. Target invariant

```text
exact sourceRevision
→ Brain-owned deterministic structured human browse/review projection
→ Domain/namespace → business concept → human-readable detail
→ frontend renders/searches already-disclosed projection

projection -X-> canonical Brain source
projection -X-> decision identity
projection -X-> physical Git topology
```

## 3. Credible alternatives

### A — frontend parses reviewText / rendered DOM

**REJECT.**

The browser would infer headings, domains, concepts or semantic sections from presentation prose/markup. That makes generated client interpretation a second semantic owner and creates unstable identity/re-entry behavior.

### B — browser reads Workspace Brain Git directly

**REJECT.**

This violates the accepted source/security boundary, leaks physical representation into Product UX and bypasses the Brain owner/read surface.

### C — reuse AnalyticQuery / vector-RAG search as Brain catalog authority

**REJECT.**

`BRN-12 RunAnalyticQuery` is a Project-bound governed analytical read over business data using admitted semantic IDs; it is not Workspace Brain catalog inspection. A retrieval/vector index is explicitly non-authoritative. Reusing either would invert regimes/owners.

### D — enrich the existing exact Brain revision read with a structured source-bound browse/review projection

**LEADING GLOBAL-MAXIMUM CANDIDATE.**

Preserve `BRN-03 GetBrainRevision` as the exact published-revision detail read and enrich the returned Brain-owned projection so the caller can render the approved knowledge hierarchy without parsing prose.

Required property-level shape, exact wire spelling deferred until selected realization:

```text
BrainRevision
→ exact identity/digest/sourceRevision/availability
→ existing human review content preserved
→ structured source-bound browse/review projection
   → business domain/namespace grouping
   → business concept recognition/coordinates
   → human-readable concept sections/details
   → optional content-class presentation metadata where useful
```

Laws:

```text
same exact sourceRevision binds the projection
frontend may perform local find/filter only over already-disclosed projection
projection coordinates/labels never replace canonical Brain semantic/source identity
physical Brain-Git paths are not exposed as the human IA
BRN-08 / BRN-09 decision subjects remain unchanged
```

Why this leads:

- the existing semantic owner is correct;
- the existing exact detail read already returns the full human review content for the revision;
- the proved missing capability is structured presentation/read shape, not a new command;
- it preserves the current 113-operation / Brain=11 topology;
- it avoids premature pagination/search Product APIs until a real scale consumer falsifies one-read sufficiency.

### E — add dedicated Brain knowledge list/detail/search operations now

**DEFER / REJECT FOR CURRENT F1.**

A future large-Brain or independent concept deep-link/partial-fetch consumer may justify exact list/detail/search operations. Current Evidence does not yet prove pagination, remote search, independently addressable concept retrieval or response-size failure. Adding those operations now would encode speculative scale mechanics into Product authority.

Reopen trigger:

```text
real locked consumer proves whole-revision structured projection is insufficient for scale, latency, independent disclosure or exact concept re-entry
```

### F — generic cross-owner ReviewProjection Product domain

**REJECT / DEFER.**

Baseline and Brain both have human review projections, but their owners, identities and lifecycle semantics differ. Repeated visual similarity does not justify a universal Product owner/domain. Shared mechanism may become a 4D implementation seam only after repeated locked consumers prove it.

## 4. Local maximum vs Global Maximum

Local textual minimum:

```text
add a few HTML anchors / parse markdown
```

fails because it preserves the frontend-authority defect.

Local architecture maximum:

```text
create a full Brain catalog/search API family now
```

fails YAGNI because current scale/partial-fetch needs are unproved.

Global Maximum for current evidence:

```text
CURRENT STRUCTURE CONFIRMED
→ Brain remains owner
→ BRN-03 remains exact revision detail read
→ strengthen the exact source-bound human projection from prose-only to structured browse/review truth
→ no new Product operation/domain yet
```

## 5. Complexity / future-cost assessment

### Essential complexity

- exact revision/source binding;
- domain/concept organization sufficient for the approved human mental model;
- human-readable concept detail;
- semantic/source authority remains server/Brain-owned;
- search/filter does not invent hidden truth.

### Accidental complexity to avoid now

- generic knowledge query language;
- universal catalog service;
- remote search/pagination before scale proof;
- Brain file browser/editor;
- cross-owner generic review framework;
- physical Git-folder authority;
- vector/RAG truth source.

## 6. Proof strategy if accepted

```text
operator accepts D
→ derive exact structured projection wire shape
→ selected-realization RED proving current BRN-03 is insufficient
→ bounded 4A semantic-property recompile if needed
→ bounded 4B BRN-03 schema/checker recompile
→ generated/whole-wire proof
→ GREEN
→ rerun W-02A P9 exact trace
→ if trace closes, pin approved P8 blob and complete W-02A LOCK/P9/P10
```

No Product implementation is admitted.

## 7. Operator gate

```text
LEADING GLOBAL-MAXIMUM CANDIDATE = D
```

Operator disposition required:

```text
ACCEPT GLOBAL-MAXIMUM CANDIDATE
| REVISE
| REJECT
```
