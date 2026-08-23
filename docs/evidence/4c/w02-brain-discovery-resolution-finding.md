# 4C-F05 — Brain Discovery Human-Resolution Finding

> **Status:** `OPEN / MATERIAL FINDING / SOLUTION-NEUTRAL`
> **Exposed by:** W-02A Brain authority-to-interaction derivation after F04 returned W-02 to structural study.
> **Implicated owner to test:** Brain Product semantic proposal/discovery boundary; do not assume a new operation or owner.
> **Implementation authority:** none.

## 1. Accepted human falsifier

The current Product Contract requires Brain Discovery to remain machine-propose / human-decide:

```text
source dictionary/catalog + directed profiling
→ candidate semantic mappings
→ provenance/hypothesis state
→ machine proposes
→ human interview resolves what cannot be inferred
→ reviewed Brain change proposal
→ published authority only after human Brain decision
```

The current executable wire exposes:

```text
BRN-04 StartBrainDiscovery
request  = projectId
response = candidates[] {
  candidateRef
  hypothesis
  provenanceRefs
}

BRN-07 SubmitKnowledgeProposal
request = {
  candidateSourceRevision
  provenanceRefs
}
```

There is no current browser-caller input that expresses the accepted **human resolution** between the discovery hypothesis and the reviewed Brain proposal.

## 2. Why this is material

`BRN-07` is a current Control Plane human Product command with `brain.propose`. An accepted Product interaction may not depend on an undocumented hidden step that the frontend, operator or implementation must invent locally.

The current gap cannot be repaired honestly by having the browser:

```text
invent candidateSourceRevision
infer Brain source changes from candidateRef
write Workspace Brain Git through Project Builder authority
silently treat a machine hypothesis as reviewed meaning
```

The same string name `candidateSourceRevision` appearing in Builder does not authorize reuse: Builder candidate source is Project-Git/Change authority, while Workspace Brain Git and Brain semantic meaning have a different owner.

## 3. Target invariant

A valid W-02A realization must preserve all of:

```text
machine discovery output remains hypothesis/provenance input
human can explicitly resolve/confirm/correct the relevant discovery meaning
human resolution is bound to exact discovery context rather than hidden free-floating prose
Brain owner remains the semantic/source-publication authority
reviewed proposal receives an exact candidate source revision under Brain authority
proposal review remains separate from publication
machine confidence never self-publishes
frontend never becomes Brain source authority
Project Builder / Project Git never silently owns Workspace Brain meaning
```

The human-resolution step must be caller-expressible without requiring the ordinary browser user to manufacture a raw Git revision coordinate that only an internal/source mechanism can truthfully create.

## 4. Current evidence boundaries

Current repository authority establishes:

- Workspace Brain Git is canonical published source and is distinct from Project Git;
- Brain owner owns semantic meaning/validation/publication/health;
- `BrainDiscoveryCandidate.candidateRef` currently exists only as a wire-level discovery-candidate reference; no accepted contract makes it a published Brain revision or KnowledgeProposal by itself;
- `KnowledgeProposal` is durable after submission and carries `candidateSourceRevision`, provenance, hypothesis/review state;
- `BRN-08` decides one exact current proposal revision;
- `BRN-09` publishes one exact reviewed candidate source revision;
- no generic Brain editor, discovery-session owner, model self-publish path or second Brain authority is currently admitted.

## 5. External Evidence

Current official reference products support the same broad governance property without determining Conexus semantics:

- Microsoft Purview catalog curation allows broader drafting but requires final review before publication; rejected publication leaves the content in draft.
- Atlan AI exposes AI-generated suggestions for human accept/reject/edit rather than making model output authoritative automatically.

These sources support the need to preserve **suggestion → human resolution/review → publication**. They do not authorize Purview workflows, Atlan requests, a generic draft object or any particular Conexus endpoint.

## 6. What this finding does not decide

This finding does **not** decide whether the Global Maximum is:

```text
out-of-band Brain Git source submission
BRN-04 enrichment
BRN-07 enrichment
new ResolveBrainDiscovery operation
Builder reuse
new BrainDraft / DiscoverySession owner
another structure
```

It also does not select the exact human-resolution payload shape, final Brain source format, HTML presentation, Mastra mechanism, Git mechanism or persistence mechanism.

## 7. Proof boundary

Before any Product/wire correction:

```text
accepted human-resolution journey exists
+ BRN-04 exposes hypothesis/provenance candidates
+ BRN-07 currently requires pre-existing candidateSourceRevision
+ no accepted caller-expressible human-resolution bridge exists
```

must remain demonstrable.

A later selected realization must then receive its own RED before authority changes.

## 8. Decision route

```text
finding
→ Root Cause
→ Target Invariant
→ Credible Alternatives
→ Global Maximum / YAGNI / owner check
→ operator gate
→ only then selected-realization RED + bounded recompile
```

Do not draw a Brain interaction that fabricates the missing bridge while F05 is unresolved.
