# 4C-F06 — Brain Review-Content Global-Maximum Assessment

> **Status:** `DECISION EVIDENCE / OPERATOR GATE / NOT PRODUCT AUTHORITY`
> **Scope:** exact human inspectability of published Brain revisions and KnowledgeProposals.
> **Implementation authority:** none.

This assessment applies the DevelopmentConexus Engineering Method before any 4A/4B correction.

## 1. Evidence

Accepted Product/Permission semantics require `brain.read`/`brain.review` consumers to inspect current Brain/revisions/proposals and decide exact proposal subjects.

Current canonical detail reads carry exact identity/provenance coordinates but no human-readable source-bound content:

```text
BRN-03 GetBrainRevision
→ BrainRevision { brainRevisionId, brainDigest, sourceRevision, availability }

BRN-06 GetKnowledgeProposal
→ KnowledgeProposal { proposalId, proposalRevision, candidateSourceRevision, provenanceRefs, hypothesisState, reviewState }
```

Workspace Brain Git is canonical published source and is intentionally independent from Project Git.

Current external reference Evidence supports the property rather than a Conexus mechanism:

- Microsoft Purview publication workflows allow broad drafting/collaboration but require final review before publication;
- Atlan AI suggestions remain human-reviewable/editable before application and distinguish draft/verified content.

Neither reference decides Conexus API shape.

## 2. Root Cause

The Brain lifecycle correctly owns source, proposal, review, publication and health, but its Product read model exposes only **coordinates about content**, not an inspectable projection of the exact meaning those coordinates represent.

A raw ID/source SHA is machine identity, not a human review surface.

## 3. Target Invariant

```text
exact Brain source revision
→ Brain-owned deterministic human-readable read projection
→ human inspects the exact meaning
→ proposal decision/publication still names existing exact authority subject
```

Required properties:

- source-bound: projection derives from the exact `sourceRevision` / `candidateSourceRevision`;
- read-only: projection cannot mutate source or publish;
- durable re-entry: BRN-03/06 alone can reconstruct what the human is reviewing;
- owner-preserving: Workspace Brain remains semantic/source owner;
- presentation-only: projection/rendering/anchor mechanics never become Brain identity;
- browser does not need raw Git credentials or Project Builder authority.

## 4. Constraints

Preserve:

```text
BRN-01 current publication pointer
BRN-02/03 immutable revision history/detail
BRN-05/06 proposal list/detail
BRN-07 proposal intake
BRN-08 exact proposal decision
BRN-09 publication
Brain Git as canonical authored source
Artifact Registry immutable artifact identity
no live Project inheritance
no memory/RAG/editor authority
```

No operation or abstraction should be added merely for screen symmetry.

## 5. Credible Alternatives

### A — show only IDs/digests/source revisions

**REJECT.**

Smallest diff, but it fails the accepted human job. A reviewer cannot inspect meaning from opaque coordinates.

### B — browser reads Workspace Brain Git directly

**REJECT.**

This introduces browser Git/credential/source-access authority, couples Product UX to repository mechanics and bypasses Brain disclosure semantics.

### C — reuse Builder `BLD-08/09` Project-source reads

**REJECT / OWNER INVERSION.**

Builder reads Project Git. Workspace Brain Git is deliberately independent and Brain-owned.

### D — add generic Brain source-tree/file browse/edit operations

**REJECT FOR CURRENT F1 / OVERBROAD.**

The current human need is to inspect exact meaning for revision/proposal review, not operate a Brain IDE. A generic source browser/editor adds file/path/source mechanics, authorization surface and likely mutation semantics without a current independent consumer.

A later real Brain-source authoring/editing workflow can reopen this decision.

### E — enrich the existing exact detail reads with a Brain-owned human review projection

**LEADING GLOBAL-MAXIMUM CANDIDATE.**

Keep `BRN-03` and `BRN-06` as the semantic detail reads and make each sufficient for its accepted human job by carrying a deterministic read-only review projection derived from its exact source revision.

Conceptually:

```text
BRN-03 exact published revision
→ identity/digest/sourceRevision
+ exact source-bound human review projection

BRN-06 exact KnowledgeProposal
→ proposal/current review/provenance/candidateSourceRevision
+ exact source-bound human review projection
```

The projection:

- is generated/resolved by Brain from the exact source revision;
- is human-readable, not raw browser Git access;
- is not canonical authored source;
- is not decision identity; BRN-08 still binds `proposalRevision`, BRN-09 still binds exact candidate source revision;
- can later be rendered by 4C/4D without its DOM/anchors becoming Product authority.

This reuses the correct existing reads rather than adding a screen-shaped operation.

### F — create a generic shared ReviewProjection Product domain because Baseline also has visual review

**DEFER / DO NOT GENERALIZE YET.**

Baseline and Brain now share a property class — canonical exact content must be human-reviewable — but their owners, decision subjects and source shapes remain different. That is enough to record a possible 4D interaction/projection primitive, not enough to create a cross-domain Product owner/API.

A later Plan/third real consumer may prove a reusable mechanism; Product authority stays owner-specific.

## 6. Global Maximum

Current assessment:

```text
CURRENT STRUCTURE CONFIRMED
→ Brain remains the semantic/source owner
→ BRN-03 and BRN-06 remain the correct exact detail reads
→ missing property = exact source-bound human review content/projection
→ no new Product operation/domain is currently justified
```

Leading realization if operator accepted:

```text
existing Brain revision/proposal detail reads
+ Brain-owned deterministic human-readable review projection
```

The exact wire spelling/shape must be selected in the post-decision realization RED; finding existence alone does not authorize a field or DTO.

## 7. Essential vs Accidental Complexity

Essential now:

- human can read what they are reviewing;
- projection is tied to exact source identity;
- proposal re-entry remains truthful;
- Brain retains source/meaning authority.

Accidental now:

- raw Git browsing in ordinary Product UX;
- generic Brain IDE/editor;
- duplicate Project-source read API under Brain;
- generic cross-owner review Product domain;
- authoring/mutation machinery merely because content is visible.

## 8. YAGNI / Future Cost

Enriching existing detail reads removes the known human-review defect while keeping future options open.

If later Brain authoring requires multi-file source exploration/editing, or repeated consumers prove a shared review-projection mechanism, those can be added without replacing Brain ownership or proposal/revision identities.

## 9. Structural interaction consequence

If accepted, W-02A may honestly derive:

```text
Brain overview
→ current published revision + health
→ inspect exact human-readable published meaning

Discovery
→ hypothesis + provenance
→ explicit human resolution
→ durable proposal

Proposal review
→ exact proposal identity/state/provenance
→ inspect exact human-readable candidate meaning
→ APPROVE | REJECT
→ publication remains separate
```

Without this property, any P8 Brain review UI would be decorative or frontend-invented.

## 10. Reopen triggers

Reopen if:

- exact Brain content cannot be projected human-readably without a dedicated source-browse operation;
- source size/structure makes an inline detail projection operationally unsustainable;
- a real editing/authoring consumer requires mutation before proposal submission;
- review must compare exact semantic diffs that cannot be derived from the accepted detail projection;
- another owner is proven to be the true source of reviewed content;
- repeated locked consumers prove a genuinely shared cross-domain projection mechanism.

## 11. Operator decision

```text
ACCEPT GLOBAL-MAXIMUM CANDIDATE
→ keep Brain owner + BRN-03/06 detail reads
→ admit exact source-bound human review projection on those reads
→ derive selected-realization RED and exact wire next

REVISE
→ change owner, interaction invariant or alternative disposition

REJECT
→ finding remains unresolved; W-02A cannot produce an honest review wireframe
```
