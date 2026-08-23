# 4C-F05 — Brain Discovery Human-Resolution Global-Maximum Assessment

> **Status:** `OPERATOR ACCEPTED / CURRENT STRUCTURE CONFIRMED / SELECTED REALIZATION` 
> **Scope:** accepted Journey-D/E bridge from Brain Discovery hypotheses to a human-reviewed KnowledgeProposal.
> **Implementation authority:** none.

This assessment applies the DevelopmentConexus Engineering Method to the F05 root defect before selecting a Product/wire correction. The operator accepted the Global-Maximum outcome and selected realization: preserve Brain ownership and enrich existing `BRN-07 SubmitKnowledgeProposal` with a Discovery-backed proposal-intake form rather than add a new operation or owner.

## 1. Evidence

Accepted Product flow:

```text
machine proposes
→ human interview resolves what cannot be inferred
→ reviewed Brain change proposal
→ human review decision
→ immutable publication
```

Pre-correction wire boundary:

```text
BRN-04
→ candidateRef + hypothesis + provenanceRefs

BRN-07
← candidateSourceRevision + provenanceRefs
```

Current semantic owners:

```text
Workspace Brain Git → canonical Brain source
Brain owner         → meaning / validation / proposal / publication / health
Project Git         → Project source only
Builder             → Project Change/source evolution only
```

The missing bridge is therefore not evidence that Brain ownership is wrong. It is evidence that the current human-facing proposal intake begins after a source coordinate the accepted Discovery journey cannot itself produce.

## 2. Root Cause

The current operation set separates read-only Discovery from proposal review/publication correctly, but pre-correction `BRN-07` exposes a **mechanism-level prerequisite** (`candidateSourceRevision`) as though it were already available to the human caller.

For source-backed/manual proposal flows that coordinate remains valid. For the accepted Discovery flow it skips the Product-semantic step:

```text
exact discovered hypothesis
+ explicit human confirmation/correction
→ Brain-owned candidate proposal source
```

The root cause is therefore **proposal-intake incompleteness for the Discovery consumer**, not a need for a generic Brain editor or another semantic owner.

## 3. Target Invariant

The accepted realization must let the Discovery consumer reach `KnowledgeProposal` while preserving:

```text
exact discovery provenance
human resolution is explicit
machine hypothesis != reviewed proposal
Brain owner creates/validates candidate Brain source
Workspace Brain source != Project Git
proposal != publication
no browser-authored hidden Git authority
no generic draft/workflow owner without an independent lifecycle consumer
```

## 4. Constraints

Preserve:

- `BRN-04` as read-only Discovery/investigation;
- `BRN-05/06` as durable proposal reads;
- `BRN-08` as exact proposal review decision;
- `BRN-09` as publication of an exact reviewed candidate source revision;
- `brain.discover`, `brain.propose`, `brain.review`, `brain.publish` separation;
- no direct model publication;
- no Project-Builder ownership of Workspace Brain;
- no generic document/editor subsystem merely for authoring symmetry.

## 5. Credible Alternatives

### A — require the browser human to provide a pre-existing `candidateSourceRevision`

**REJECT FOR THE DISCOVERY FLOW / PRESERVE AS SOURCE-BACKED SUBMISSION.**

This may remain legitimate when a separately admitted Brain-source workflow already produced an exact candidate revision, but it does not close Journey D/E by itself.

### B — make BRN-04 automatically create one Brain `candidateSourceRevision` per discovered hypothesis

**REJECT.**

Discovery remains read-only and hypothesis-producing. Materializing candidate source before the human resolves ambiguity would let machine discovery perform part of reviewed-change authoring.

### C — enrich existing BRN-07 with a Discovery-backed proposal-intake form

**OPERATOR ACCEPTED / SELECTED GLOBAL MAXIMUM.**

Keep `SubmitKnowledgeProposal` as the one semantic Product job and make it caller-expressible for both current source-backed and Discovery-backed consumers.

Selected semantic forms:

```text
SOURCE_BACKED
exact existing candidateSourceRevision + provenanceRefs
→ submit existing candidate for Brain review

DISCOVERY_BACKED
exact discoveryCandidateRef
+ explicit non-blank humanResolution
→ Brain owner revalidates exact discovery candidate + provenance
→ Brain owner materializes one exact candidate source revision
→ same durable KnowledgeProposal result
```

Properties:

- two input forms are mutually exclusive;
- Discovery-backed browser input does not supply provenance or `candidateSourceRevision`; Brain re-resolves provenance from the exact discovery candidate and materializes source authority itself;
- no new semantic owner;
- no new lifecycle object;
- no extra public operation when the human job remains “submit a KnowledgeProposal”;
- discovery hypothesis remains non-authoritative until the human submits it;
- `KnowledgeProposal.candidateSourceRevision` remains the durable candidate/source coordinate after submission;
- publication continues through `BRN-08` and `BRN-09` rather than submission self-publishing.

### D — add a separate `ResolveBrainDiscoveryCandidate` operation

**REJECT FOR CURRENT F1 / REOPEN IF A SEPARATE PRE-SUBMISSION ARTIFACT BECOMES A REAL CONSUMER.**

Today it would split one human job into two Product commands and introduce an intermediate source artifact whose independent lifecycle/consumer is not proven.

### E — reuse Builder Change / Project Git

**REJECT / OWNER INVERSION.**

Workspace Brain source is intentionally independent from Project Git, and Builder does not own Workspace Brain semantic publication.

### F — create a durable `BrainDraft`, `DiscoverySession`, interview-thread or generic Brain editor domain

**REJECT / YAGNI.**

No independent current lifecycle consumer proves another durable owner/domain between Discovery and KnowledgeProposal.

## 6. Global Maximum

Accepted outcome:

```text
CURRENT STRUCTURE CONFIRMED
→ Brain remains the correct semantic owner
→ current BRN-04 / BRN-05/06 / BRN-08/09 separation remains sound
→ missing property = caller-expressible Discovery-backed proposal intake
→ selected realization = enrich BRN-07; no new owner/operation
```

This was not selected because it changes fewer files. The existing `SubmitKnowledgeProposal` operation already owns the exact human semantic job; one current consumer simply could not express its input honestly.

## 7. Essential vs Accidental Complexity

Essential now:

- bind human resolution to an exact Discovery hypothesis/provenance context;
- let Brain owner create the exact candidate source under its own authority;
- preserve durable KnowledgeProposal review/publication boundaries.

Accidental now:

- raw Brain Git revision creation as ordinary UI work;
- one operation merely to turn a discovery candidate into an intermediate draft with no independent consumer;
- durable interview/session domain;
- generic Brain document editor;
- Project Builder reuse across the owner boundary.

## 8. YAGNI / Future Cost

The accepted structure preserves two useful seams without implementing future capability prematurely:

```text
source-backed KnowledgeProposal submission remains possible
+
Discovery-backed submission is caller-expressible
```

If later Evidence requires durable multi-session draft authoring, richer collaborative Brain editing, or a reusable human-review primitive, those can be admitted from a real consumer without changing the fundamental Brain owner or proposal/publication model.

## 9. External reference challenge

Official current references support the property rather than the mechanism:

- Microsoft Purview catalog curation workflows allow collaborative drafting and require final review before publication;
- Atlan AI lets humans accept, reject or edit AI-generated suggestions.

Conexus adapts the **human-correctable suggestion before publication** property while rejecting their workflow/domain structures unless a Conexus consumer proves them necessary.

## 10. Selected-realization proof strategy

The selected-realization RED/GREEN must prove at minimum:

1. Product authority states that `BRN-07` supports a Discovery-backed KnowledgeProposal submission bound to exact discovery context;
2. human resolution is caller-expressible and never hidden inside raw `candidateSourceRevision` manufacture;
3. `BRN-04` remains read-only and cannot self-create/publish accepted Brain meaning;
4. existing source-backed proposal submission is preserved;
5. successful Discovery-backed `BRN-07` returns the same durable `KnowledgeProposal` with Brain-owned `candidateSourceRevision` + provenance;
6. `BRN-08` and `BRN-09` remain the review-decision/publication gates;
7. no new ordinary Permission, owner, principal, durable record class or Project-Builder dependency appears;
8. whole Brain/4B wire proof remains green.

## 11. Reopen Triggers

Reopen this assessment if:

- a real consumer needs a durable draft before proposal submission;
- human resolution requires structured semantics that cannot fit the selected proposal-intake contract without hiding meaning;
- collaborative multi-human drafting becomes a current Product requirement;
- Brain source creation is proven to belong to another current owner;
- server-resolvable discovery-candidate references cannot be realized safely without a different Product object/operation;
- 4E composition proves source-backed and discovery-backed proposal jobs are semantically different operations.

## 12. Decision record

```text
operator decision = ACCEPT GLOBAL-MAXIMUM CANDIDATE
outcome = CURRENT STRUCTURE CONFIRMED
selected realization = enrich BRN-07 with Discovery-backed proposal intake
new operation = 0
new owner = 0
new Permission = 0
new durable record class = 0
```

Product implementation remains blocked. This acceptance authorizes only the bounded 4A→4B semantic/wire recompile and its proof before W-02A structural HTML proceeds.
