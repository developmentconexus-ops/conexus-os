# 4C W-01 — Baseline Visual Review + Contextual Refinement Global-Maximum Preflight

> **Status:** `4C-F03 / OPERATOR ACCEPTED / GREEN`
> **Block:** `W-01` — exact candidate Baseline visual review/refinement only.
> **Inherited authority:** `GF-01 H1-R2 = LOCKED`; `4C-F02 = OPERATOR ACCEPTED / GREEN`.
> **Implementation authority:** none. Product code, W-02, 4D and later implementation stages remain blocked.

## 1. Human need

The operator refined W-01 with a Product-level need inspired by Lavish: an exact Baseline candidate must be reviewable as a rich visual artifact, with contextual selection/conversation and an explicit refinement loop, without allowing HTML, browser state, model memory, Mastra state or review UI to become Project authority.

```text
exact immutable Candidate A
→ deterministic visual projection
→ select section/text/diagram context
→ ask Conexus about that exact candidate/context
→ accumulate proposed refinements without mutation
→ explicitly apply selected human feedback
→ Project/Inception owner produces immutable Candidate B
→ re-render/review
→ approve only the exact reviewed digest
```

Rejected by YAGNI:

```text
editable HTML as Baseline truth
BaselineComment / BaselineThread CRUD
ReviewSession Product owner
annotation durable Product domain
generic collaborative whiteboard domain
implicit mutation on each chat message
model/Mastra memory as authority
```

## 2. Reference / mechanism disposition

### Lavish

Current `kunchenguid/lavish-axi` source was inspected during the preflight. Useful properties retained as Evidence:

```text
portable rich HTML review
selected element / selected text context
conversation beside the artifact
feedback queue before agent action
live re-projection while preserving bounded draft review context
visual diagram feedback without making rendered state canonical
```

Disposition:

```text
ADOPT Lavish directly as Product architecture = REJECT
BUILD a full Conexus review editor now         = REJECT / OVER-SCOPE
ADAPT protected collaboration properties       = ACCEPTED
```

Lavish CLI/file-path/local-server/polling/session mechanics are not Conexus Product authority.

### Mastra

Current Mastra documentation was revalidated. Agent + streaming + RequestContext + bounded thread memory are mechanically suitable for contextual discussion. Structured output may later help shape proposed refinements; Workflow is not required merely for visual symmetry.

Binding law:

```text
Mastra RequestContext -X-> Product authority
Mastra thread/memory   -X-> Baseline truth
model output           -X-> accepted refinement
```

Every deciding candidate/context reference is re-resolved through current Conexus owners. Hub/Project owns authority; Mastra remains cognition/runtime mechanics.

## 3. RED falsifiers

The pre-correction authority had two exact gaps.

### F03-A — exact-candidate refinement

Pre-correction `PRJ-07 RunInceptionInvestigation` accepted only free-form `intent`. No Product carrier bound human review feedback to the exact immutable candidate that was reviewed.

Rejected substitute:

```text
put candidate digest / review transcript inside free-form intent
```

because deciding identity would be hidden in prose.

### F03-B — exact-candidate contextual question

Pre-correction `BLD-16 AskConexusAboutContext` was Builder-owned, required `project.build`, accepted only `question`, and was Project-context-only. The W-01 Baseline reviewer operates under `project.manage`; those Permissions intentionally do not imply each other.

Rejected substitutes:

```text
frontend hides candidate identity inside prompt text
frontend assumes current selected candidate server-side
Baseline reviewer silently acquires project.build
BLD-16 becomes universal assistant authority
```

### Clean RED evidence

```text
Verify #502 = EXPECTED RED
HEAD = 1923f441df6742e1c6249f064313f275610fbfa0
repository tests = 54
PASS = 52
FAIL = 2 exactly: F03-A + F03-B
bootstrap_bytes = 18577
```

All prior repository/GF-01/W-01/F02 properties remained green.

## 4. Global-Maximum correction

The operator accepted the smallest owner-preserving correction.

### 4.1 `PRJ-07` refinement enrichment

```text
ordinary first investigation:
intent
→ Candidate A

explicit refinement:
intent
+ priorCandidateBaselineDigest
+ reviewFeedback
→ new Candidate B
```

Rules:

- `priorCandidateBaselineDigest` and `reviewFeedback` are optional **together**, never independently;
- review feedback is explicit non-blank human input;
- server re-resolves the exact prior candidate inside the current Project;
- Candidate A remains immutable;
- successful refinement produces a new immutable candidate/digest;
- source selection remains server-resolved from already-admitted Project authority.

### 4.2 `PRJ-24 AskConexusAboutBaselineCandidate`

One new Project-owned read/assistant interaction is admitted:

```text
exact Project
+ exact candidateBaselineDigest
+ non-blank question
+ optional generated candidate-local review context
→ candidate-bound contextual answer + provenance
```

Rules:

- owner = Project;
- existing Permission = `project.manage`;
- ingress/principal = existing Control Plane human route;
- read-only: no mutation, approval, grant or hidden state transition;
- optional `projectionAnchor` / selected rendered text are untrusted review context and must be revalidated against the exact candidate;
- HTML/DOM identity never becomes Product identity;
- `BLD-16` remains unchanged under Builder/`project.build`.

## 5. Properties that required no Product expansion

### Visual anchoring

A visual selection remains a generated candidate-local mechanism:

```text
candidateBaselineDigest
+ deterministic projection version
+ generated structural anchor / selected text
→ review context
```

A new candidate is a new review subject. Anchors never silently carry authority across candidates.

### Staleness

Exact candidate digests already provide the required stale boundary. Feedback bound to Candidate A cannot be silently applied as if it described Candidate B.

### Conversation continuity

Local UI/Mastra thread state may preserve conversational convenience, but durable Product review-session/comment state is not required.

## 6. Derived current closure

The correction changes one fixed Product-operation count and no authority vocabulary class:

```text
N_platform                 = 113
Project fixed operations   = 23
ordinary Permissions       = 25
semantic owner classes     = unchanged
principal / ingress classes= unchanged
new durable record classes = 0
candidate immutability     = preserved
approval by exact digest   = preserved
BLD-16 Builder assistant   = unchanged
Technical Ingress          = 3 / Product-count impact 0
```

Chronology remains explicit:

```text
4B-F01 114 → 111
4C-F02 111 → 112
4C-F03 112 → 113
```

## 7. GREEN proof

After operator acceptance, 4A authority, 4B executable wire and affected 4C projections were recompiled through the existing RED contracts.

```text
Verify #518 = SUCCESS
correction-proof HEAD = ded8b7aa1dc86b58222f91f94ca46146f40c5928
repository tests = 54 / 54 GREEN
4A ↔ OAS = 113 ↔ 113
Project schema closure = 23 operations
Technical Ingress = 3 / Product-count impact 0
generated projection = 113 deterministic Product entries
real Kubb 5.0.0 probe = 113 operations / strict TypeScript compile GREEN
Budget Analyzer proving instance = GREEN
whole-4B adversarial + executable proof = GREEN
```

No new Product owner, Permission, trust boundary, review/comment CRUD domain or durable record was introduced.

## 8. Closure / next action

`4C-F03` is **CLOSED / OPERATOR ACCEPTED / GREEN**.

The next bounded work returns to W-01 P8 only:

```text
revise Baseline review portion of the existing lo-fi HTML
→ deterministic visual candidate projection
→ candidate-local selection/context
→ contextual Conexus seam
→ explicit proposed-refinement queue/apply boundary
→ exact candidate approval
→ operator visual/interactive adjudication
```

This next P8 artifact remains HTML/CSS + bounded vanilla JS Evidence only. It is not Product implementation or Mastra/backend proof.

Do not open W-02, 4D, merge PR #57 or implement Product code.