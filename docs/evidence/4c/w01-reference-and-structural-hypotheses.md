# 4C W-01 — Reference Study and Structural Hypotheses

> **Status:** `CANDIDATE EVIDENCE / W-01 4C-6 → 4C-7F / OPERATOR-REVISED / NOT LOCKED`
> **Block:** `W-01` — Projects + source-complete create / Inception / visual candidate+approved Baseline
> **Inherited authority:** `GF-01 H1-R2 = LOCKED`; `4C-F02 = OPERATOR ACCEPTED / GREEN`; `4C-F03 = OPERATOR ACCEPTED / GREEN`.
> **Implementation authority:** none.

This record derives only the W-01 structural candidate. The operator has already approved the Projects cards/grid, focused Project creation/source bootstrap and Inception structure. `4C-F03` reopened only the Baseline-review portion after direct human Evidence established the need for a rich visual candidate, contextual discussion and explicit refinement boundary. No Product implementation, final visual design, SDK/runtime choice or generic review domain is admitted here.

## 1. Exact human job

```text
Workspace Projects
→ find/open an existing disclosed Project
OR create one source-complete Project
→ enter exact Project Inception
→ state current business intent
→ run governed investigation over already-admitted source/context
→ inspect exact immutable candidate as a human-readable visual projection
→ select candidate-local context and ask Conexus about that exact candidate
→ accumulate proposed refinements without mutating authority
→ explicitly apply feedback when refinement is desired
→ receive a new exact immutable candidate
→ compare against current approved Baseline when one exists
→ approve only the exact candidate digest actually reviewed
```

Current operation trace:

```text
PRJ-01 browse disclosed Projects
PRJ-03 source-complete Project creation
PRJ-07 Inception from human intent + optional exact-candidate refinement feedback
PRJ-23 durable exact candidate Baseline review/re-entry
PRJ-24 exact candidate-bound contextual explanation
PRJ-08 current approved Baseline read
PRJ-09 exact candidate digest approval
```

Compact journey shorthand used by this block:

```text
PRJ-03 → PRJ-07 → PRJ-23 / PRJ-24 / PRJ-08 → PRJ-09
```

## 2. Authority facts that constrain structure

The current `ProjectSummary` carries exactly:

```text
ProjectSummary = projectId + workspaceId + name + archived
```

Therefore W-01 has no authority to decorate the collection with release state, recent activity, framework/runtime, setup progress, source provider, ownership metadata or other inferred metadata. A card is presentation only; it does not create a richer Project summary model.

Current creation truth:

```text
sourceBootstrap.mode = NEW | EXISTING_GIT
EXISTING_GIT → repositoryLocator
```

Current Inception/refinement truth:

```text
intent = required non-blank human input
source choice = already admitted / server-resolved
optional refinement = priorCandidateBaselineDigest + reviewFeedback together
Candidate A remains immutable
successful refinement → new immutable Candidate B
```

Current Baseline truth:

```text
candidate = exact unapproved ProjectBaselineCandidate
approved  = exact current ApprovedBaseline
candidateBaselineDigest != approved baselineDigest by semantic role
```

Current contextual-review truth:

```text
PRJ-24 subject = exact Project + candidateBaselineDigest
question = required non-blank human input
optional reviewContext = generated candidate-local presentation context only
answer = read-only + provenance
```

The browser may use the exact candidate digest as `URL_NAVIGATION` so refresh/re-entry can resolve `PRJ-23`. Generated visual anchors, selected rendered text, HTML/DOM state, local refinement drafts and conversational memory never become candidate or Project authority.

## 3. Bounded reference + human Evidence

For the Projects collection, direct operator Evidence prefers the simple GF-01-style cards/grid while preserving only `ProjectSummary` truth.

For Baseline review, Lavish was evaluated as a reference for collaboration properties, not as Conexus architecture. The useful properties are:

```text
rich portable visual artifact
precise selected-context discussion
conversation beside the artifact
feedback queue before agent action
live re-projection after the canonical source changes
```

Rejected as Conexus Product authority:

```text
HTML/DOM as canonical truth
file-path session identity
local CLI/server/polling as Product boundary
review/comment/session CRUD
browser edit mutates Baseline
```

Mastra Agent/streaming/thread mechanics are viable future cognition/runtime mechanisms, but P8 must not claim them as implemented or authoritative.

## 4. Project collection hypotheses

### H2 — simple Project cards/grid — **LEADING / CANDIDATE**

```text
cards/grid = LEADING / CANDIDATE
```

Structure:

```text
Projects heading + Create Project
local name filter
All | Active | Archived local view filter

┌──────────────────────────┐  ┌──────────────────────────┐
│ Project name      Active │  │ Project name    Archived │
│                     Open │  │                     Open │
└──────────────────────────┘  └──────────────────────────┘
```

Why leading:
- matches direct operator recognition preference;
- gives each Project a simple spatial target without implying a richer comparison model;
- contains only name, derived Active/Archived presentation and navigation;
- keeps `Create Project` distinct from browsing existing Projects;
- reflows from two columns to one without horizontal scrolling;
- YAGNI forbids filler fields.

Local name/archive filtering remains `LOCAL_UI` over the disclosed `PRJ-01` result, never Product/global search.

### H1 — compact structured Project list

```text
structured list = REJECTED AS LEADING
```

Authority-safe and scale-efficient, but not the operator-preferred current presentation. It remains a fallback only if later scale Evidence falsifies cards.

### H3 — dense Project table

```text
dense table = REJECTED AS LEADING
```

Only `name` and `archived` are materially displayable now; table chrome would imply a richer comparison model for no information gain.

## 5. Create / Inception / Baseline composition hypotheses

### C1-R1 — visual Baseline review + contextual refinement — **LEADING / CANDIDATE**

This refines the earlier C1 only at the Baseline-review step. Projects, focused Create Project and Inception remain operator-approved.

```text
Workspace / Projects
→ focused Create Project
   name
   source: NEW | EXISTING_GIT
   EXISTING_GIT → repositoryLocator
→ PRJ-03 success
→ exact Project / Inception
   intent
→ PRJ-07
→ exact Candidate Baseline review
   human-readable visual sections
   generated candidate-local review anchors
   exact candidate identity available but secondary to human content
   optional current approved Baseline as comparison truth
→ select a candidate section/text
→ contextual Conexus panel over exact Candidate via PRJ-24
   explanation only
   proposed refinement can be queued locally
→ explicit Apply refinements
   priorCandidateBaselineDigest + reviewFeedback → PRJ-07
   Candidate A remains immutable
   new Candidate B is rendered/reviewed
→ PRJ-23 on refresh/re-entry
→ PRJ-09 approve exact reviewed candidate
```

Structural sketch only:

```text
┌───────────────────────────────────────────────────────────────┐
│ Baseline candidate                                           │
│ Confirm what Conexus understood before building.             │
│                                                               │
│ Objective                                                     │
│ [human-readable candidate section]                    Ask →   │
│                                                               │
│ Users                                                         │
│ [human-readable candidate section]                    Ask →   │
│                                                               │
│ Constraints                                                   │
│ [human-readable candidate section]                    Ask →   │
│                                                               │
│ Technical identity ▸ digest / sourceRevision / profile        │
│                                                               │
│ [Approve exact candidate]                                     │
├──────────────────────────────────────────────┬────────────────┤
│ proposed refinements (when any)              │ Conexus panel  │
│ [Apply refinements]                          │ exact context   │
└──────────────────────────────────────────────┴────────────────┘
```

Why leading:
- centers the human decision — “is this what we are building?” — instead of hashes;
- preserves exact digest/source/runtime identity without making technical fields the primary reading order;
- reuses the locked GF-01 contextual-assistant seam rather than inventing another global chat IA;
- visual selection is generated presentation context and cannot mutate authority;
- conversation remains read-only until the human explicitly queues/refines;
- one explicit Apply boundary makes Candidate A → Candidate B lineage inspectable;
- no `RejectProjectBaselineCandidate`, direct Baseline editing, comment/thread owner or hidden workflow is required.

### C1 — focused create → Project Inception → exact Baseline review

The original C1 remains the accepted journey backbone. `C1-R1` supersedes only its Baseline-review presentation/interaction details after `4C-F03`.

### C2 — one long modal/drawer for create + Inception + approval

**REJECTED AS LEADING.** It compresses a durable journey into transient overlay state and pressures the client to own progression state.

### C3 — inline Inception inside Workspace Projects collection

**REJECTED AS LEADING.** It mixes Workspace browsing with Project-owned semantic investigation.

### C4 — Project card shows setup/progress/release/activity metadata

**REJECTED.** No current `PRJ-01` truth exposes those fields.

### C5 — direct visual editing of candidate source

**REJECTED.** Rendered HTML/DOM is a projection. Direct editing would bypass Inception ownership, exact candidate lineage and the explicit refinement boundary.

### C6 — durable Baseline comments/threads/review session

**REJECTED / YAGNI.** The current human job is closed by local/cognitive draft state + explicit feedback application + immutable regenerated candidate. No independent durable lifecycle consumer exists.

## 6. Authority-feasibility recheck

| Material interaction | Class | Exact authority | State ownership |
| --- | --- | --- | --- |
| load Projects | `PRODUCT_READ` | `PRJ-01` | `SERVER` projection/cache only |
| local name/archive filtering | `LOCAL_UI` | no Product operation | `EPHEMERAL_UI` |
| open Project | `NAVIGATION` | exact disclosed projectId reference | `URL_NAVIGATION` |
| start Create Project | navigation/form | no Product operation until submit | `FORM_DRAFT` |
| create NEW / EXISTING_GIT Project | `PRODUCT_COMMAND` | `PRJ-03` | committed truth = `SERVER`; draft = `FORM_DRAFT` |
| state Inception intent | form | no Product operation until submit | `FORM_DRAFT` |
| run first Inception | `PRODUCT_COMMAND` / proof | `PRJ-07` | result = `SERVER` |
| open candidate by digest | navigation + `PRODUCT_READ` | `PRJ-23` | digest = `URL_NAVIGATION`; candidate = `SERVER` |
| select visual candidate context | `LOCAL_UI` | no Product operation | generated/ephemeral candidate-local presentation context |
| ask about exact candidate | `PRODUCT_READ` / assistant interaction | `PRJ-24` | candidate/answer = `SERVER`; panel draft/history may be local/cognitive |
| queue proposed refinement | `LOCAL_UI` / form draft | no Product operation | `FORM_DRAFT` / `EPHEMERAL_UI` |
| apply explicit feedback | `PRODUCT_COMMAND` / proof | `PRJ-07` with exact prior candidate + feedback | new candidate = `SERVER`; prior candidate immutable |
| read current approved Baseline | `PRODUCT_READ` | `PRJ-08` | `SERVER` |
| approve candidate | `PRODUCT_COMMAND` / decision | `PRJ-09` | `SERVER`; never optimistic client truth |

Material negative laws:

```text
hidden/disabled != authorization
browser candidate cache != Baseline authority
CreateProject failure -X-> half-created Project success
Project card -X-> fabricated setup/release/activity/framework truth
local filter -X-> global Product search
candidate visual projection -X-> editable Baseline authority
chat message -X-> Candidate mutation
visual anchor / selected text -X-> Product identity
Mastra/local memory -X-> Baseline truth
candidate review -X-> candidate/comment/thread CRUD domain
```

## 7. Responsive / accessibility hypothesis

The locked GF-01 single rail remains unchanged.

- desktop Projects grid: two columns; narrow: one column;
- Project cards retain explicit Open actions;
- Create/source controls and Inception intent remain labeled;
- Baseline candidate sections are ordinary keyboard-focusable/selectable review targets, never pointer-only truth;
- contextual assistant uses the existing GF-01 cooperation seam: side panel/push where space permits, overlay/full-width at narrow viewports;
- selected context must be named in text, not color-only;
- panel has explicit close and composer labels;
- proposed refinements remain visible before Apply;
- technical candidate identity is inspectable but secondary to the human-readable specification;
- candidate vs approved truth remains programmatically/textually distinguishable.

## 8. Current decision boundary

```text
H2 simple cards/grid                  = OPERATOR APPROVED / preserved
Create/source bootstrap structure     = OPERATOR APPROVED / preserved
Inception structure                   = OPERATOR APPROVED / preserved
C1 Journey-B backbone                 = preserved
C1-R1 visual Baseline review          = LEADING / CANDIDATE
operator W-01 LOCKED                  = NOT YET
```

Next proof is the revised bounded HTML/CSS + vanilla-JS P8 artifact changing only the Baseline-review portion. Only operator visual/interactive adjudication may set W-01 `LOCKED`.