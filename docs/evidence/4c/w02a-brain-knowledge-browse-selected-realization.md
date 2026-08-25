# 4C-F07 — Brain structured knowledge-browse selected realization

> **Status:** `OPERATOR ACCEPTED / SELECTED REALIZATION`
> **Finding:** [Brain structured knowledge-browse finding](w02a-brain-knowledge-browse-finding.md)
> **Global Maximum:** [assessment](w02a-brain-knowledge-browse-global-maximum.md)
> **Selected alternative:** `D — enrich the existing exact Brain revision read with a structured source-bound browse/review projection`.
> **Authority posture:** selected realization Evidence. Product semantics remain Brain-owned; exact wire spelling below is a bounded 4B realization target until GREEN.

## 1. Accepted property

The operator accepted the F07 Global-Maximum candidate:

```text
CURRENT STRUCTURE CONFIRMED
→ Brain remains semantic/source owner
→ BRN-03 GetBrainRevision remains the exact published-revision detail read
→ the exact source-bound human projection becomes structured enough for Knowledge → Domain → Concept browse
→ no new Product operation/domain/Permission/record is admitted
```

The approved P8 UX direction remains unchanged.

## 2. Exact selected wire shape

`BRN-03` will return an exact detail projection distinct from ordinary revision-list/publication summaries:

```text
BrainRevisionDetail
├── brainRevisionId
├── brainDigest
├── sourceRevision
├── availability = AVAILABLE
├── reviewText
└── knowledgeBrowse
    └── domains[]
        ├── domainRef
        ├── label
        └── concepts[]
            ├── conceptRef
            ├── label
            ├── summary
            ├── contentClasses[]
            ├── sections[]
            │   ├── kind
            │   └── text
            └── provenanceRefs[]
```

Exact component names selected for 4B:

```text
BrainRevisionDetail
BrainKnowledgeBrowseProjection
BrainKnowledgeDomainProjection
BrainKnowledgeConceptProjection
BrainKnowledgeSectionProjection
BrainKnowledgeSectionKind
BrainKnowledgeContentClass
```

`BRN-02 ListBrainRevisions` and `BRN-09 PublishBrainRevision` are not widened merely because `BRN-03` needs detail browse truth. They may continue returning the existing `BrainRevision` projection; a consumer that needs knowledge browse resolves the exact revision through `BRN-03`.

## 3. Projection identity law

```text
domainRef
conceptRef
```

are nonblank Brain-issued coordinates scoped to the exact `sourceRevision` projection. They support rendering/local navigation within that disclosed revision but are not new canonical semantic/source identities and are never mutation/decision subjects.

```text
domainRef / conceptRef -X-> canonical Brain source identity
domainRef / conceptRef -X-> BRN-08 decision identity
domainRef / conceptRef -X-> BRN-09 publication identity
```

Canonical semantic IDs remain whatever the Brain source/accepted semantic model defines; this projection does not create another semantic-ID namespace.

## 4. Content-class and section law

`contentClasses` is a non-empty set drawn only from the already-accepted Brain content classes:

```text
SEMANTIC
KNOWLEDGE
EVIDENCE_SPEC
```

It is presentation metadata describing what kinds of canonical Brain content contribute to the human concept projection; it is not primary global navigation.

`sections[].kind` is a closed human-review presentation role:

```text
DEFINITION
BUSINESS_MEANING
CALCULATION
GRAIN
RELATIONSHIPS
BUSINESS_RULES
CAVEATS
VERIFICATION
```

A concept need not contain every section kind. Every emitted section has nonblank human-readable `text`. `provenanceRefs` stays an explicit array and may be empty when the exact source truth has no separately disclosable provenance reference; the frontend must not fabricate one.

## 5. Search / scale law

Current F1 admits no remote Brain catalog/search/pagination operation from F07.

```text
BRN-03 exact structured projection
→ frontend may locally find/filter already-disclosed domains/concepts/sections
```

Local search is presentation over disclosed truth only. Reopen for dedicated list/detail/search/pagination operations only when a real locked consumer proves whole-revision detail is insufficient for response size, latency, independent disclosure or exact concept re-entry.

## 6. Source / security / physical representation law

```text
exact sourceRevision
→ Brain deterministically resolves knowledgeBrowse + reviewText
→ frontend renders
```

Forbidden:

```text
frontend parsing reviewText/HTML into semantic hierarchy
browser Workspace Brain Git reads
physical Git path as human IA
generated projection becoming editable/canonical Brain source
vector/RAG/index becoming concept meaning authority
parallel frontend Brain DTO authority
```

The shape reveals human browse semantics, not the physical Brain-Git folder/file layout.

## 7. Decision/publication law remains unchanged

F07 changes no command subject:

```text
BRN-08 DecideKnowledgeProposal
→ expectedProposalRevision + APPROVE | REJECT

BRN-09 PublishBrainRevision
→ candidateSourceRevision

knowledgeBrowse -X-> decision/publication input
reviewText       -X-> decision/publication input
```

Project adoption remains a separate exact `ProjectBrainBinding` operation/decision.

## 8. RED → GREEN proof plan

```text
1. selected-realization test expects accepted 4A property + BRN-03 detail projection
2. current wire fails because BrainRevisionDetail / knowledgeBrowse do not exist
3. boundedly recompile 4A Brain authority
4. recompile 4B BRN-03 schema + Brain checker
5. preserve 113 fixed Product operations / Brain=11
6. generated/no-parallel-DTO + whole-wire proof
7. rerun W-02A P9 exact trace
8. only if P9 closes: pin approved P8 blob and record W-02A LOCKED, then P10
```

No Product implementation is authorized.