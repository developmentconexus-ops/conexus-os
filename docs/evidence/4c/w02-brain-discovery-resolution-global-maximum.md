# 4C-F05 — Brain Discovery Human-Resolution Global-Maximum Assessment

> **Status:** `DECISION EVIDENCE / OPERATOR GATE / NO PRODUCT CHANGE YET`
> **Scope:** accepted Journey-D/E bridge from Brain Discovery hypotheses to a human-reviewed KnowledgeProposal.
> **Implementation authority:** none.

This assessment applies the DevelopmentConexus Engineering Method to the F05 root defect before selecting a Product/wire correction.

## 1. Evidence

Accepted Product flow:

```text
machine proposes
→ human interview resolves what cannot be inferred
→ reviewed Brain change proposal
→ human review decision
→ immutable publication
```

Current wire boundary:

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

The current operation set separates read-only Discovery from proposal review/publication correctly, but `BRN-07` exposes a **mechanism-level prerequisite** (`candidateSourceRevision`) as though it were already available to the human caller.

For source-backed/manual proposal flows that coordinate may be valid. For the accepted Discovery flow it skips the Product-semantic step:

```text
exact discovered hypothesis
+ explicit human confirmation/correction
→ Brain-owned candidate proposal source
```

The root cause is therefore **proposal-intake incompleteness for the Discovery consumer**, not a need for a generic Brain editor or another semantic owner.

## 3. Target Invariant

The Global Maximum must let the accepted Discovery consumer reach `KnowledgeProposal` while preserving:

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

**REJECT FOR THE DISCOVERY FLOW / PRESERVE AS POSSIBLE SOURCE-BACKED SUBMISSION.**

This is the current BRN-07 shape. It may remain legitimate when a separately admitted Brain-source workflow already produced an exact candidate revision, but it does not close Journey D/E by itself.

Making it the only path would require the normal W-02A user to understand and create a Brain-Git source coordinate out of band. That hides an accepted Product step behind source mechanics and is a Local Maximum inside the existing request schema.

### B — make BRN-04 automatically create one Brain `candidateSourceRevision` per discovered hypothesis

**REJECT.**

Discovery is intentionally read-only and hypothesis-producing. Materializing canonical candidate source before the human resolves ambiguity would make machine discovery perform part of the reviewed-change authoring step and create potentially many speculative source revisions.

It also still fails to express the human interview/correction that the Product Contract explicitly requires where inference is insufficient.

### C — enrich existing BRN-07 with a Discovery-backed proposal-intake mode

**LEADING / GLOBAL-MAXIMUM CANDIDATE.**

Keep `SubmitKnowledgeProposal` as the one semantic Product job, but make it caller-expressible for both current source-backed and Discovery-backed consumers.

Conceptual modes:

```text
SOURCE_BACKED
exact existing candidateSourceRevision + provenanceRefs
→ submit existing candidate for Brain review

DISCOVERY_BACKED
exact BRN-04 discovery-candidate reference
+ optional explicit human correction/resolution
→ Brain owner revalidates exact discovery context/provenance
→ Brain owner materializes one exact candidate source revision
→ same durable KnowledgeProposal result
```

Properties:

- no new semantic owner;
- no new lifecycle object;
- no extra public operation when the human job is still “submit a KnowledgeProposal”;
- discovery hypothesis remains non-authoritative until the human submits it;
- human correction can be explicit without the browser editing Brain Git;
- `KnowledgeProposal.candidateSourceRevision` remains the durable candidate/source coordinate after submission;
- publication continues through BRN-08/09 rather than submission self-publishing.

Exact request schema/spelling belongs to selected-realization 4B work after operator acceptance. A candidate reference is an untrusted reference; server resolution/mechanism is 4D, not browser authority.

### D — add a separate `ResolveBrainDiscoveryCandidate` operation that returns a candidate source revision, then call BRN-07

**REJECT FOR CURRENT F1 / REOPEN IF A SEPARATE PRE-SUBMISSION ARTIFACT BECOMES A REAL CONSUMER.**

This can be coherent, but today it splits one human job into two Product commands and introduces an intermediate source artifact whose independent lifecycle/consumer has not been proven.

If future UX requires a durable previewable Brain draft that can survive days of editing before proposal submission, this alternative may become correct. Current Evidence does not require it.

### E — reuse Builder Change / Project Git to create the Brain candidate source revision

**REJECT / OWNER INVERSION.**

The string `candidateSourceRevision` also exists in Builder, but there it means Project-Git Change lineage. Workspace Brain source is intentionally independent from Project Git, and Builder does not own Workspace Brain semantic publication.

Shared Git mechanics may later be reused internally; shared semantic authority may not.

### F — create a durable `BrainDraft`, `DiscoverySession`, interview-thread or generic Brain editor domain

**REJECT / YAGNI.**

No independent current lifecycle consumer proves a need for another durable owner/domain between Discovery and KnowledgeProposal. It would create persistence, authorization, recovery and synchronization rules before the accepted journey requires them.

Conversation/LLM mechanics may support human resolution later, but a thread/session is not Brain authority and must not become a second proposal source.

## 6. Global Maximum

Current assessment:

```text
CURRENT STRUCTURE CONFIRMED
→ Brain remains the correct semantic owner
→ current BRN-04 / BRN-05/06 / BRN-08/09 separation remains sound
→ missing property = caller-expressible Discovery-backed proposal intake
→ leading realization = enrich BRN-07 rather than add a new owner/operation
```

This is not chosen because it changes fewer files. It is chosen because the existing `SubmitKnowledgeProposal` operation already owns the exact human semantic job, and the defect is that one current consumer cannot express its input honestly.

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

The leading structure preserves two useful future seams without implementing them prematurely:

```text
source-backed KnowledgeProposal submission remains possible
+
Discovery-backed submission becomes caller-expressible
```

If later Evidence requires durable multi-session draft authoring, richer collaborative Brain editing, or a reusable human-review primitive, those can be admitted from a real second consumer without changing the fundamental Brain owner or proposal/publication model.

## 9. External reference challenge

Official current references support the property rather than the mechanism:

- Microsoft Purview catalog curation workflows explicitly allow collaborative drafting and require final review before publication; rejection leaves content as draft.
- Atlan AI lets humans accept, reject or edit AI-generated suggestions.

Conexus should adapt the **human-correctable suggestion before publication** property while rejecting their workflow/domain structures unless a Conexus consumer proves them necessary.

## 10. Proof Strategy if accepted

A selected-realization RED should require at minimum:

1. Product authority states that BRN-07 supports a Discovery-backed KnowledgeProposal submission bound to exact discovery context;
2. human correction/resolution is caller-expressible and never hidden inside raw `candidateSourceRevision` manufacture;
3. BRN-04 remains read-only and cannot self-create/publish accepted Brain meaning;
4. existing source-backed proposal submission is preserved if still current;
5. successful Discovery-backed BRN-07 returns one durable `KnowledgeProposal` with Brain-owned `candidateSourceRevision` + provenance;
6. `BRN-08` and `BRN-09` remain the only review-decision/publication gates;
7. no new ordinary Permission, owner, principal, durable record class or Project-Builder dependency appears unless a later falsifier proves it;
8. whole Brain/4B wire proof remains green.

## 11. Reopen Triggers

Reopen this assessment if:

- a real consumer needs a durable draft before proposal submission;
- human resolution requires structured semantics that cannot fit the selected proposal-intake contract without hiding meaning;
- collaborative multi-human drafting becomes a current Product requirement;
- Brain source creation is proven to belong to another current owner;
- server-resolvable discovery-candidate references cannot be realized safely without a different Product object/operation;
- 4E composition proves the source-backed and discovery-backed proposal jobs are semantically different operations.

## 12. Operator gate

```text
recommended outcome = CURRENT STRUCTURE CONFIRMED
recommended realization = enrich BRN-07 with Discovery-backed proposal intake
new operation = 0
new owner = 0
new Permission = 0
new durable record class = 0
```

Do not change 4A/4B or draw a fake BRN-04→BRN-07 interaction until the operator accepts, revises or rejects this Global-Maximum candidate.
