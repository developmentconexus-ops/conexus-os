# 4C-F06 — Brain Review-Content Inspectability Finding

> **Status:** `OPEN / MATERIAL FINDING / GLOBAL-MAXIMUM DECISION REQUIRED / NOT YET ADMITTED`
> **Exposed by:** W-02A reference/structural derivation after F05 closed Discovery-backed proposal intake.
> **Implementation authority:** none.

## 1. Human falsifier

Accepted Brain Product authority requires humans to inspect current Workspace Brain meaning, immutable revisions and proposals before deciding/publishing them.

Current exact wire exposes:

```text
BRN-03 BrainRevision
→ brainRevisionId
→ brainDigest
→ sourceRevision
→ availability

BRN-06 KnowledgeProposal
→ proposalId
→ proposalRevision
→ candidateSourceRevision
→ provenanceRefs
→ hypothesisState
→ reviewState
```

Those coordinates prove identity/provenance/state, but they do not expose the human-readable semantic/knowledge/evidence-spec content represented by the exact Brain source revision.

A reviewer who enters/re-enters an exact proposal cannot truthfully answer:

```text
what meaning is being proposed?
what exact content am I approving/rejecting?
how does this candidate differ from the currently published meaning?
```

from the admitted Brain reads alone.

## 2. Root defect

The Brain owner and proposal/publication lifecycle are structurally correct, but the current detail projections stop at source coordinates rather than making the exact source-bound meaning inspectable to the human consumer.

The defect is not “missing textarea”. It is:

```text
human review/inspection is accepted Product work
+ canonical Brain source is Workspace Brain Git / exact source revision
+ browser has only opaque source coordinates
→ frontend would need to invent source access or presentation authority
```

## 3. Target invariant

For every disclosable exact published Brain revision or KnowledgeProposal under review:

```text
human can inspect the meaning/content represented by the exact source revision
+ inspected content is bound to that exact revision/candidate
+ canonical Workspace Brain source remains authority
+ generated/read projection never becomes publication authority
+ re-entry does not depend on browser-local state
+ Project Builder / Project Git are not reused as Workspace Brain source authority
```

The human-readable projection must not:

```text
be inferred from IDs alone
require direct credentialed Git access in the browser
become a generic Brain editor/CRUD owner
self-publish
hide candidate identity
```

## 4. Current substitutes are insufficient

### Opaque source/digest coordinates

Necessary for exact identity; insufficient for human review.

### Discovery hypothesis text

Useful before proposal submission, but not durable proposal/revision content. After re-entry, BRN-06 must stand on its own.

### Browser-local copy of Discovery text

Rejected as authority/re-entry strategy. Reload/new device/reviewer would lose it, and it may differ from the Brain-owned candidate source actually materialized by BRN-07.

### Project Builder source reads

Wrong owner. Builder `BLD-08/09` read Project Git, while Workspace Brain Git is independently canonical.

## 5. Decision boundary

This finding does **not** preselect:

```text
reviewText
raw Git files
Brain source-tree API
new read operation
new projection DTO
generic review framework
Brain editor
```

The bounded Global-Maximum assessment is:

```text
docs/evidence/4c/w02-brain-review-content-global-maximum.md
```

Finding existence alone creates no Product or wire authority.

## 6. Proof posture

Before operator decision, the current-state falsifier should prove:

```text
accepted Brain human review/inspection need exists
BRN-03/06 exact identity/provenance remains intact
current BRN-03/06 lack human-readable source-bound content
no frontend/Builder/Git workaround is silently admitted
Global-Maximum alternatives are compared before a schema change
```

After operator acceptance of an exact outcome, derive a new selected-realization RED before modifying 4A/4B.