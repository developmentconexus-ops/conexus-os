# 4C P-01 — Builder Structural Hypotheses

> **Status:** `P7 OPERATOR APPROVED / F14 GREEN / P8 BLOCKED / NOT LOCKED`
> **Block:** `P-01 — Build + Plan/Preview/Code/Diff/Findings/Evidence/assistant`
> **Selected structure:** `A — Preview-first exact-Change workspace`
> **Product implementation authority:** none.

The operator explicitly approved the P-01 direction after authority preflight and F14 adjudication. This P7 record fixes only the leading interaction structure that may be explored later in functional P8 Evidence. It does not authorize P8, final visual design, production components, router/state/cache selection, 4D realization or Product implementation.

---

## 1. Human job

P-01 must let an authorized Builder operator answer, in ordinary Product language:

```text
What am I changing?
What is happening now?
What usable candidate can I inspect?
What exactly changed?
Is there something I must decide?
What proof/finding blocks trust?
What should I ask Conexus about the current Change?
```

The experience is agent-first but not transcript-first. The user's primary subject is an exact Builder Change and the candidate Product being built, not a chat thread, WorkUnit or sandbox.

---

## 2. Accepted authority baseline

### 2.1 Change entry / exact Change

```text
BLD-01 ListChanges
→ current disclosable Changes
→ each carries changeId + authored human intent + owner state

BLD-02 GetChange
→ exact current Change
→ authored human intent
→ exact accepted Baseline pin
→ planningDepth / rigorProfile / owner state

BLD-03 CreateChange
→ one bounded human intent: what must become true
→ exact current Project/Baseline authority
→ no WorkUnit / ActorRun / arbitrary status input
```

Binding human identity law after F14:

```text
changeId = stable exact technical identity / untrusted reference
intent = human Change meaning

intent != authorization
intent != unique key
intent != mutable title/name domain
```

### 2.2 Governed Plan + live progress

```text
BLD-04 GetChangePlan
→ visual Plan projection
→ work items / dependency edges / acceptance links / blockers / unknowns / progress

BLD-05 DecideChangePlanCheckpoint
→ exact current planRevision
→ APPROVE | REJECT only

BLD-06 GetChangeProgress
→ Hub-owned live item/progress truth
```

Binding law:

```text
Plan = visual governed work, not a JSON editor
Hub progress != model narration
worker prose != completion authority
```

### 2.3 Preview / Code / Diff lenses

```text
BLD-10 GetRunPreview
→ controlled candidate Preview
→ ready != verified != live

BLD-08 ListProjectSourceTree
+ BLD-09 GetProjectSourceFile
→ read-only exact sourceRevision inspection

BLD-07 GetChangeDiff
→ exact baseSourceRevision → candidateSourceRevision lineage diff
```

Permission law:

```text
Preview / Change / Plan / progress
→ project.build where mapped

Code / Diff = read-only inspectable lenses
→ project.source.read

visible Code/Diff lens
-X-> source mutation authority
```

### 2.4 Findings / Evidence trust layer

```text
BLD-11 ListChangeFindings
BLD-12 GetFinding
BLD-13 CloseFinding
BLD-14 ListChangeEvidence
BLD-15 GetEvidence
→ exact Change/Finding/Evidence review truth
→ project.review
```

Binding laws:

```text
Findings / Evidence = trust layer
0 Findings != verified
Evidence existence != claim proved
Finding close requires exact current Finding + admitted resolution Evidence
```

### 2.5 Contextual Conexus assistance

```text
BLD-16 AskConexusAboutContext
→ question only = current authorized Project/platform Builder context
→ BLD-16 changeId? = optional exact current Change context
→ provenance-preserving answer
→ project.build only
```

Binding laws:

```text
conversation != Change
conversation != Plan truth
conversation != Progress truth
conversation != verification
question/prompt text != semantic subject authority
changeId possession != project.source.read
changeId possession != project.review
```

### 2.6 Progressive technical execution depth

```text
BLD-17 GetChangeExecutionDetail
→ exact Change
→ subordinate WorkUnit / ActorRun projection
→ technical investigation only
```

`execution detail = progressive disclosure` is binding. WorkUnit/ActorRun mechanics never become the default human navigation model merely because they are inspectable.

---

## 3. Reference Evidence — pattern challenge, not Product authority

Current references were checked during P-01 preflight. They validate task patterns only.

### Replit

Source: `https://docs.replit.com/features/agent/overview`

Useful observed pattern:

```text
plain-language intent
→ reviewable Plan / task structure
→ visible progress
→ Preview while the application takes shape
```

Conexus adaptation: preserve natural-language entry + visible Plan/progress, but owner facts rather than Agent narration define truth.

### Lovable

Source: `https://docs.lovable.dev/features/agent-mode`

Useful observed pattern:

```text
Plan / decision work
!=
Build / implementation work

visible tasks + diffs + implementation detail remain inspectable
```

Conexus adaptation: use progressive inspectability without making task narration or chat the operational owner.

### Codex

Source: `https://openai.com/index/introducing-the-codex-app/`

Useful observed pattern:

```text
direct / supervise agent work
→ durable task context
→ inspect changes / diff
→ technical depth when needed
```

Conexus adaptation: supervision remains centered on exact Change/Plan/Evidence owner truth rather than one coding-agent thread.

No external reference is authority for Conexus labels, routing, Product state or permissions.

---

## 4. Competing structural hypotheses

### A — Preview-first exact-Change workspace

**SELECTED / OPERATOR APPROVED.**

Human mental model:

```text
Project / Build
│
├── Change entry
│   ├── browse Changes by authored human intent
│   └── create Change from “what must become true”
│
└── exact Change workspace
    ├── Change header
    │   ├── intent
    │   ├── owner state
    │   └── Hub-owned progress summary
    │
    ├── primary candidate inspection
    │   ├── Preview = default / dominant lens
    │   ├── Code = read-only inspectable lens
    │   └── Diff = read-only inspectable lens
    │
    ├── governed work
    │   ├── visual Plan
    │   ├── exact checkpoint when required
    │   └── live Hub progress
    │
    ├── review / trust
    │   ├── Findings
    │   └── Evidence
    │
    ├── progressive technical depth
    │   └── execution detail
    │
    └── contextual / retractable Conexus assistant
        ├── Project-level question
        └── exact Change-scoped question through changeId?
```

Why A wins:

1. **Outcome over narration.** The current candidate Product is visually central; the chat helps operate/understand it but does not become the Product.
2. **One exact human subject.** Authored `intent` makes the Change recognizable while `changeId` remains stable machine identity.
3. **Truth is visible outside the transcript.** Plan, owner progress, Findings, Evidence and Preview status remain independently inspectable.
4. **Technical depth is available without becoming root IA.** Code/Diff and execution detail exist for trust/debugging while normal work remains human-first.
5. **Authority boundaries survive the layout.** `project.build`, `project.review` and `project.source.read` can coexist without the browser implying one grants the others.
6. **Responsive viability.** Preview remains the primary region; Plan/review/assistant regions may become sheets or focused views without changing semantic owners.

Critical candidate continuity law:

```text
last-good Preview survives while next candidate builds
```

The Build surface must never replace a usable prior Preview with a false empty/loading state solely because the next candidate is still being produced.

### B — Chat-first split

**REJECTED.**

Candidate shape:

```text
Conexus / Agent conversation | Preview
```

Why rejected as root structure:

- makes the transcript feel like the durable Product/work owner;
- weakens visibility of Hub-owned Plan/progress;
- pushes Findings/Evidence into secondary history;
- encourages the false mental model “agent says done = Change done”;
- scales poorly when Code/Diff/Plan/review must all remain inspectable.

Binding negative:

```text
chat transcript = Product truth = FORBIDDEN
```

The assistant remains contextual and retractable under A.

### C — Engineering control center

**REJECTED.**

Candidate shape:

```text
Plan | Tasks | Agents | Logs
Preview | Code | Diff
Findings | Evidence | Runs
```

Why rejected as root structure:

- exposes internal execution topology before the human needs it;
- makes WorkUnit/ActorRun appear to be Product domains;
- overweights engineering mechanics over the candidate application;
- approaches an IDE/mission-control experience the Product explicitly rejects as primary;
- creates high-density symmetry among facts that have very different authority/importance.

Binding negatives:

```text
second IDE/editor mutation authority = FORBIDDEN
WorkUnit / ActorRun as root IA = REJECTED
```

---

## 5. Selected P7 structural baseline

```text
BUILD
│
├── CHANGES
│   ├── BLD-01 ListChanges
│   │   └── intent is primary human recognition
│   └── BLD-03 CreateChange
│       └── “What do you want to change?” / bounded intent
│
└── EXACT CHANGE
    ├── HEADER
    │   ├── BLD-02 Change intent + owner state
    │   └── BLD-06 current Hub progress
    │
    ├── PRIMARY WORKSPACE
    │   ├── PREVIEW — default / dominant
    │   │   └── BLD-10
    │   ├── CODE — read-only lens
    │   │   └── BLD-08 / BLD-09 + project.source.read
    │   └── DIFF — read-only lens
    │       └── BLD-07 + project.source.read
    │
    ├── PLAN / PROGRESS
    │   ├── BLD-04 visual Plan
    │   ├── BLD-05 exact checkpoint
    │   └── BLD-06 live Hub progress
    │
    ├── REVIEW / TRUST
    │   ├── BLD-11 / BLD-12 Findings
    │   ├── BLD-13 exact Finding closure
    │   └── BLD-14 / BLD-15 Evidence
    │       └── project.review
    │
    ├── TECHNICAL DEPTH
    │   └── BLD-17 execution detail
    │
    └── CONEXUS
        └── BLD-16 contextual / retractable assistant
            ├── Project context
            └── optional exact Change via changeId?
```

No material region above is a new semantic owner. Surface composition cannot grant a missing Permission.

---

## 6. Permission / disclosure baseline

```text
project.build
→ Change browse/detail/create
→ Plan read
→ Progress read
→ Preview
→ contextual Conexus
→ execution-detail read where mapped

project.review
→ Plan decision
→ Findings / Evidence reads
→ exact Finding closure

project.source.read
→ Diff
→ source tree / source file
```

Negative laws:

```text
visible Code/Diff != project.source.read grant
visible Findings/Evidence != project.review grant
visible Plan decision != reviewer eligibility
visible assistant != project.build grant
hidden control != authorization
```

The frontend may condition presentation on returned authority/disclosure but never derives final authorization from visibility.

---

## 7. Client-state classification candidate

P7 fixes only classifications required to prove interaction structure; exact router/cache APIs remain later realization details.

| Candidate state | Class | P7 rule |
| --- | --- | --- |
| exact selected Change | `URL_NAVIGATION` | `changeId = URL_NAVIGATION`; untrusted reference, server revalidates exact Project/Change disclosure |
| Preview / Code / Diff selected lens | `URL_NAVIGATION` | `Preview | Code | Diff lens = URL_NAVIGATION`; re-entry/back-forward is useful and creates no Product truth |
| current Change / Plan / progress / Preview / Findings / Evidence / source data | `SERVER` | exact owner/read projection; browser never becomes durable truth |
| assistant open/close | `EPHEMERAL_UI` | `assistant open/close = EPHEMERAL_UI`; presentation only |
| assistant question | `FORM_DRAFT` | `assistant question draft = FORM_DRAFT`; becomes input only when BLD-16 is submitted |
| Plan checkpoint choice before submit | `FORM_DRAFT` | exact APPROVE/REJECT decision draft; server current-subject validation still decides |
| technical detail expansion | `EPHEMERAL_UI` | progressive disclosure only |

No fifth state class is justified by P-01.

---

## 8. Material truth / failure obligations carried to P8/P9

P7 does not freeze final copy, but P8 must make these distinctions operable if/when authorized:

```text
loading != known-empty != denied != absent/non-disclosable != dependency failure
working != blocked != waiting-for-user != completed
Preview ready != verified != live
last-good Preview != next candidate still building
no Findings != verified
Evidence present != claim proven
Plan current != stale planRevision
source-readable != source-mutable
assistant answer != owner state
```

Stale exact Plan/Finding decisions must not silently win. A failed new Preview load must not erase a still-valid last-good Preview merely for visual convenience.

---

## 9. Explicit forbidden frontend authority

P-01 forbids:

```text
chat transcript = Product truth = FORBIDDEN
second IDE/editor mutation authority = FORBIDDEN
WorkUnit / ActorRun as root IA = REJECTED
generic Change status editor = FORBIDDEN
source mutation from Code lens = FORBIDDEN
frontend-derived verification = FORBIDDEN
frontend-derived Plan progress = FORBIDDEN
frontend-generated Finding closure = FORBIDDEN
assistant answer as Change/Plan mutation = FORBIDDEN
prompt text as exact Change identity = FORBIDDEN
generic context/resource union invented for assistant = FORBIDDEN
```

Code and Diff are inspection lenses only. Product source mutation remains governed Builder execution/Change work, not a direct browser editor command.

---

## 10. P8 gate

```text
F14 = GREEN
P7 = OPERATOR APPROVED
P-01 = NOT LOCKED
P8 = BLOCKED
P11 = LATER ASSEMBLED PRODUCT
P-02+ = NOT OPEN
4D = NOT STARTED
Product implementation = BLOCKED
```

This P7 approval authorizes no HTML creation by itself. The next step after repository verification is an explicit operator gate for functional P8 Evidence.
