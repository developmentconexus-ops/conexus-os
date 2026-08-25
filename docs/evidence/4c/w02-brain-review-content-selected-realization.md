# 4C-F06 — Brain Review-Content Selected Realization

> **Status:** OPERATOR ACCEPTED / SELECTED REALIZATION
> **Owner:** Brain
> **Scope:** exact human-readable review content on existing BRN-03 / BRN-06 detail reads.
> **Product implementation:** BLOCKED.

## Accepted Global Maximum

The operator accepted the F06 Global-Maximum conclusion:

```text
CURRENT STRUCTURE CONFIRMED
→ Brain remains semantic/source owner
→ BRN-03 GetBrainRevision remains the published-revision detail read
→ BRN-06 GetKnowledgeProposal remains the proposal detail read
→ no new Product operation/domain
→ exact source-bound human review content must be caller-readable
```

## Selected wire realization to falsify

The smallest sustainable exact wire shape is one nonblank `reviewText` property on the existing canonical detail schemas:

```text
BrainRevision
  sourceRevision
  + reviewText

KnowledgeProposal
  candidateSourceRevision
  + reviewText
```

`reviewText` means:

- deterministic Brain-owned human-readable projection of the exact named source revision;
- read-only and reconstructible on refresh/re-entry;
- sufficient for the current human inspection/review job without browser Git access;
- presentation content, not canonical authored Brain source;
- not a new Product identity, revision, digest, proposal subject or authorization token;
- not an editor, source tree, file API, comment/session/thread domain or mutation surface.

The exact rendering grammar, rich visual layout, generated anchors and projection compiler are not selected by this field. Those remain 4C interaction / 4D mechanism questions after the property is proved.

## Decision identity remains unchanged

```text
BRN-08 DecideKnowledgeProposal
→ binds expectedProposalRevision + APPROVE|REJECT

BRN-09 PublishBrainRevision
→ binds exact candidateSourceRevision

reviewText -X-> decision identity
reviewText -X-> source authority
DOM / generated anchor -X-> Brain authority
```

## Why not a structured generic document now

No current consumer requires a second Product-level section/anchor/document ontology. A single human-readable projection preserves the exact reviewed meaning while leaving the canonical structured Brain source authoritative.

If P8 proves that current review work cannot be done honestly without structured source-bound sections/diffs, reopen this realization at the smallest F06 wire property. Do not create a generic cross-owner ReviewProjection domain preemptively.

## Proof route

```text
operator acceptance
→ selected-realization RED
→ 4A Brain semantics recompile
→ 4B BRN-03/BRN-06 schema recompile
→ Brain wire checker + whole-wire/codegen proof
→ GREEN
→ bounded FP0/P3/P5 rebaseline only where F06 changes coverage/surface truth
→ resume W-02A P7/P8
```

Preserve:

```text
N_platform = 113
Brain operations = 11
ordinary Permissions = 25
new owner = 0
new durable record class = 0
```
