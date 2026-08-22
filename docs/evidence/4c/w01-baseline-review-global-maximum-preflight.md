# 4C W-01 — Baseline Visual Review + Contextual Refinement Global-Maximum Preflight

> **Status:** `4C-F03 / OPEN / OPERATOR-AUTHORIZED PREFLIGHT / EXPECTED RED`
> **Block:** `W-01` — exact candidate Baseline review only. Projects collection, source-complete create and Inception structure remain operator-approved.
> **Inherited authority:** `GF-01 H1-R2 = LOCKED`; `4C-F02 = OPERATOR ACCEPTED / GREEN`.
> **Implementation authority:** none. Product code, 4D and later 4C blocks remain blocked.

## 1. Human need

The operator refined W-01 with a Product-level need inspired by Lavish: an exact Baseline candidate should be reviewable as a rich visual artifact, with contextual selection/conversation and an explicit refinement loop, without allowing the browser, HTML, model memory or review UI to become Project authority.

Required human job:

```text
exact immutable candidate Baseline
→ inspect a visual projection
→ select a section/text/diagram context
→ ask Conexus questions about that exact context
→ accumulate proposed refinements without mutating authority
→ explicitly apply selected feedback
→ produce a new exact immutable candidate when meaning changes
→ review again
→ approve only the exact candidate actually reviewed
```

Not required and currently rejected by YAGNI:

```text
editable HTML as Baseline truth
BaselineComment CRUD
BaselineThread owner
annotation/session durable Product domain
generic collaborative whiteboard domain
model memory as review authority
implicit mutation on each chat message
```

## 2. Current accepted authority

Current Project wire closes:

```text
PRJ-07 RunInceptionInvestigation
  request = intent only
  result  = exact ProjectBaselineCandidate

PRJ-23 GetProjectBaselineCandidate
  subject = exact Project + candidateBaselineDigest
  result  = candidateBaselineDigest + sourceRevision + sourceText + applicationRuntimeProfile

PRJ-09 ApproveProjectBaselineRevision
  request = exact candidateBaselineDigest
  result  = ApprovedBaseline
```

Candidate immutability and digest-bound approval are already strong enough to keep HTML/browser state from becoming Baseline authority.

Current contextual assistant authority is different:

```text
BLD-16 AskConexusAboutContext
  owner      = Builder
  Permission = project.build
  request    = question only
```

The accepted Permission contract explicitly separates `project.manage` (Inception/Baseline administration and exact candidate review) from `project.build`; neither implies the other.

GF-01 already locks only the **contextual assistant frame seam**. Opening the panel is LOCAL_UI and does not invoke `BLD-16`; the exact downstream surface must admit any real contextual question.

## 3. Reference: Lavish properties

Current official `kunchenguid/lavish-axi` source was inspected at the 2026-08-22 preflight. `package.json` on `main` reports `lavish-axi 0.1.56`, MIT, Node >=22.

Useful observed properties:

```text
agent-generated portable HTML artifact
sandboxed review rendering
selected-element / selected-text annotation
conversation without leaving the artifact
feedback queue before agent action
live reload preserving bounded unsent review context
native feedback controls / explicit queue action
Mermaid visual editing returns feedback; source remains agent-owned
```

Mechanics not adopted as Conexus architecture by reference:

```text
CLI as Product boundary
canonical file-path session identity
local Express server authority
agent polling protocol
Lavish session as Product truth
third-party share service
HTML/DOM as canonical Project meaning
```

Disposition:

```text
ADOPT Lavish directly as Product architecture = REJECT
BUILD a full Conexus visual-review editor now    = REJECT / OVER-SCOPE
ADAPT protected collaboration properties         = LEADING
```

Lavish is Evidence/mechanism reference only.

## 4. Mastra realization boundary

Current Mastra documentation was revalidated for this preflight.

Useful primitives:

```text
Agent          → open-ended contextual discussion/tool use
streaming      → live assistant response UX
RequestContext → runtime correlation/context carriage
thread memory  → conversational continuity
structured output → bounded machine-readable proposed refinements when useful
Workflow       → only if a deterministic multi-step subflow later proves necessary
```

Binding Conexus law remains:

```text
Mastra RequestContext -X-> Product authority
Mastra thread/memory   -X-> Baseline truth
model output           -X-> accepted refinement
```

Every deciding candidate/context reference must be re-resolved through current Conexus owners/tools. Hub/Project owns current authority; Mastra remains cognition/runtime mechanics.

## 5. Falsifier results

### F03-A — exact-candidate refinement is not caller-expressible — RED

Current `PRJ-07` accepts only `intent`. No current Product request binds a refinement instruction to both:

```text
exact prior candidateBaselineDigest
+ explicit human review feedback
```

Encoding a digest or review transcript into free-form `intent` would hide deciding identity inside prose and is rejected.

This means the Product cannot yet prove:

```text
Candidate A reviewed
+ feedback specifically about A
→ governed investigation
→ Candidate B
```

without losing exact candidate lineage.

### F03-B — exact-candidate contextual question under Baseline authority is not caller-expressible — RED

`BLD-16` accepts only `question`, belongs to Builder, and requires `project.build`.

The real W-01 consumer is a Baseline reviewer under `project.manage`. Therefore these are invalid substitutes:

```text
frontend inserts candidate identity into question prose
frontend assumes current selected candidate server-side
Baseline reviewer silently acquires project.build
BLD-16 becomes a global assistant owner by UI convenience
```

Current Product authority has no exact candidate-bound contextual-question operation usable by the Baseline-management consumer.

### F03-C — visual selection anchor requires no new Product owner — GREEN / 4C MECHANISM

A review selection can remain GENERATED and candidate-local:

```text
candidateBaselineDigest
+ deterministic projection version
+ exact selected text/range or generated structural anchor
→ review context reference
```

Because a candidate is immutable, the projection may deterministically recreate the same candidate-local anchor on reload. A new candidate produces a new review subject; anchors are never silently carried forward as authority.

No `BaselineSection`, `Annotation`, `Comment` or durable review record class is justified.

### F03-D — stale review behavior is preservable — GREEN WITH F03-A CARRIER

Existing candidate immutability and exact digest identity already distinguish Candidate A from Candidate B. Once refinement input is explicitly bound to the reviewed candidate, stale/mismatched feedback can fail closed instead of being reinterpreted against another candidate.

### F03-E — Mastra live conversation is mechanically viable without authority transfer — GREEN

Agent + streaming + RequestContext + bounded thread memory are sufficient mechanics for live contextual discussion. Current authority must still be fetched/revalidated through Conexus tools; memory is convenience only.

### F03-F — review/comment CRUD domain is unnecessary — GREEN / REJECT EXPANSION

The current human need is satisfied by:

```text
local draft conversation/selection state
+ explicit feedback application
+ immutable regenerated candidate
```

No separate review lifecycle owner has a current independent consumer.

### F03-G — Lavish mechanism choice — ADAPT LEADING

Direct Lavish reuse would import file-path/local-server/polling/session assumptions that do not match Conexus Hub-owned multi-user Product authority. Rebuilding all Lavish features would violate YAGNI. Preserve the proven collaboration properties and derive the smallest Conexus-native realization later.

## 6. Alternatives / Global-Maximum adjudication

### A — reuse `BLD-16` unchanged

**REJECT.** Candidate identity is implicit and `project.build` is a distinct authority from Baseline administration.

### B — let frontend compose candidate context into prompt text

**REJECT.** DOM/current-screen context becomes hidden deciding authority and cannot be mechanically revalidated.

### C — create Baseline comment/thread/session CRUD

**REJECT.** New lifecycle/owner/durable state without a current independent consumer.

### D — enrich Inception refinement + admit the smallest candidate-bound contextual read

**LEADING.** Preserve existing owners and immutable-candidate model:

```text
refinement:
  existing PRJ-07 remains the investigation owner
  add exact prior-candidate reference + bounded review feedback carrier

conversation:
  exact candidate-bound read/assistant interaction
  Project/Baseline consumer authority
  no mutation, no approval, no new grant
```

The exact wire shape and whether the contextual read is one new Project operation remain operator decisions after RED. No correction is admitted by this preflight.

## 7. Smallest possible authority impact if the leading correction is accepted

Likely bounded impact:

```text
semantic owner                 = Project unchanged
ordinary Permission            = project.manage unchanged
principal / ingress            = unchanged
new durable record class       = 0
PRJ-07 meaning                 = enriched refinement input only
candidate immutability         = unchanged
approval by exact digest       = unchanged
possible new Product read      = +1 candidate-bound contextual query
```

If one new exact Product read is required, the derived census would be recomputed rather than targeted; current 112/22 counts remain authority until operator acceptance and recompile.

## 8. RED proof contract

Repository falsifiers must fail only on:

```text
F03-A exact-candidate-bound refinement carrier missing
F03-B exact-candidate-bound contextual question for Baseline-management authority missing
```

All existing 4A/4B/GF-01/W-01 source-bootstrap/Inception/candidate-read proofs must remain green.

## 9. Decision boundary

Current preflight conclusion:

```text
Lavish premise                     = ADAPT / KEEP
visual candidate projection        = 4C GENERATED/LOCAL-UI mechanism candidate
Mastra live conversation           = viable mechanism, not authority
exact-candidate refinement         = PRODUCT GAP / F03-A
exact-candidate contextual question= PRODUCT GAP / F03-B
```

Next action after clean RED:

```text
operator decides whether to admit the bounded F03 correction
→ if accepted: reopen only exact Project/4A+4B rows, RED→GREEN, recompile affected 4C
→ if rejected: derive another bounded alternative
```

Do not open W-02, 4D, implement Product code, or generalize a reusable visual-review framework before this finding is adjudicated.
