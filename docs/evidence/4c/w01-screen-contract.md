# 4C W-01 — Locked Screen Contract

> **Status:** `LOCKED / OPERATOR APPROVED` · P9 EXACT TRACE CLOSED · P10 CONSOLIDATED · P11 NOT TRIGGERED SEPARATELY
> **Block:** `W-01` — Projects + source-complete Create Project + Inception + visual candidate/approved Baseline review
> **Locked structure:** H2 cards/grid + focused Create/Inception + C1-R1 visual Baseline review/contextual refinement
> **approved P8 artifact blob = 3d1d475d3ca7ce06ea549da12152cd386ab170a2**
> **Product implementation authority:** none.

The operator approved the complete W-01 structural package after the C1-R1 candidate survived independent Fable challenge with zero material findings and Lead adjudication required zero corrections. The approved HTML remains an immutable P8 Evidence snapshot; its in-artifact `CANDIDATE` label is not rewritten after approval. `LOCKED` authority lives in this Screen Contract and the W-01 structural record, pinned to the exact approved blob above.

W-01 closes the Journey-B entry/outcome experience only. It does not decide Build/Plan visualization, Paved-Road/runtime mechanics, Mastra conversation persistence, review-projection versioning, final visual design, SDK APIs or Product implementation.

---

## 1. Goal / user-flow role

W-01 lets an authorized human complete the following coherent job without frontend-owned Product truth:

```text
browse disclosed Projects
→ open one exact Project
OR create one source-complete Project
→ state Project Inception intent
→ run governed investigation
→ inspect one exact immutable Baseline candidate as human-readable visual meaning
→ ask Conexus about exact candidate-local context
→ optionally queue explicit review feedback
→ explicitly Apply refinements against the exact prior candidate
→ receive a new immutable candidate
→ compare with the current approved Baseline when one exists
→ approve only the exact candidate actually reviewed
```

The Product meaning is Project-owned throughout. Browser fixtures only expose the interaction structure.

---

## 2. Locked structural baseline

```text
WORKSPACE / PROJECTS
heading + Create Project
local name/archive filters
simple Project cards/grid
explicit Open action

CREATE PROJECT
name
sourceBootstrap = NEW | EXISTING_GIT
EXISTING_GIT → repositoryLocator

PROJECT / INCEPTION
required human intent
no source selector

BASELINE REVIEW
human-readable Candidate sections
exact technical identity available as secondary disclosure
candidate-local selectable review context
contextual Conexus panel
local proposed-refinement queue
explicit Apply refinements boundary
exact candidate approval
optional current approved Baseline comparison
```

Locked properties:

1. Project collection uses simple cards/grid with only currently admitted `ProjectSummary` truth;
2. Create Project is a focused source-complete flow, not an inline collection form or generic Repository owner;
3. Inception accepts human business intent while source/context remains server-resolved;
4. Baseline candidate is reviewed visual-first while exact digest/source/runtime identity remains inspectable;
5. candidate-local review selection is generated presentation context, never authority;
6. contextual discussion uses the locked GF-01 assistant seam and `PRJ-24`, not Builder `BLD-16`;
7. proposed refinements remain non-authoritative until explicit Apply;
8. Apply reuses Project/Inception owner `PRJ-07` with exact prior candidate + explicit feedback and produces a new immutable candidate;
9. approval is exact-digest and never optimistic client truth;
10. a Project with no approved Baseline does not receive a fabricated comparison object.

Not locked by W-01:

```text
final brand / typography / spacing / iconography
exact URL spelling
final card component API
final assistant push/overlay/full breakpoint algorithm
Mastra thread/session/memory mechanics
review-projection versioning / stale-anchor implementation
Plan visual grammar
shared Baseline/Plan renderer
final transport/SDK/query-state package APIs
```

---

## 3. Exact vertical authority trace

| W-01 interaction / truth | Class | Exact accepted authority | Permission / current-state condition | Result |
| --- | --- | --- | --- | --- |
| browse Projects in exact Workspace | `PRODUCT_READ` | `PRJ-01 ListProjects` | `project.read` + current Workspace membership/disclosure | server-disclosable `ProjectSummary[]` only |
| local name/archive filtering | `LOCAL_UI` | no Product operation | already-disclosed `PRJ-01` result | local presentation only |
| open a disclosed Project | `NAVIGATION` | disclosed `projectId`; exact route revalidates through owner reads | URL reference is untrusted; server still authorizes | Project navigation only |
| create source-complete Project | `PRODUCT_COMMAND` | `PRJ-03 CreateProject` | `project.create`; exact Workspace; `Idempotency-Key` | one Project + admitted initial grant + exactly one canonical source or fail without half-created success |
| state Project intent | form draft | no Product operation until submit | none | local `FORM_DRAFT` only |
| run first Inception | `PRODUCT_COMMAND` / investigation | `PRJ-07 RunInceptionInvestigation` | `project.manage`; exact Project; `Idempotency-Key`; non-blank `intent` | one exact immutable `ProjectBaselineCandidate` |
| re-enter exact candidate | `PRODUCT_READ` | `PRJ-23 GetProjectBaselineCandidate` | `project.manage`; exact Project + caller-known candidate digest | exact immutable candidate or fail closed |
| select visual candidate context | `LOCAL_UI` / projection | no Product operation | exact currently rendered candidate | candidate-local generated context only |
| ask about exact candidate | `PRODUCT_READ` / assistant interaction | `PRJ-24 AskConexusAboutBaselineCandidate` | `project.manage`; exact Project + candidate digest; optional review context is untrusted/revalidated | contextual answer + provenance; no mutation/approval/grant |
| queue proposed refinement | local draft | no Product operation | none | `FORM_DRAFT` / `EPHEMERAL_UI` only |
| apply explicit refinements | `PRODUCT_COMMAND` / investigation | `PRJ-07 RunInceptionInvestigation` | `project.manage`; exact prior digest + non-blank review feedback together; `Idempotency-Key` | new immutable candidate; prior candidate unchanged |
| inspect current approved Baseline | `PRODUCT_READ` | `PRJ-08 GetApprovedProjectBaseline` | `project.manage` Baseline-management context / exact current disclosure | exact current approved Baseline when present |
| approve exact reviewed candidate | `PRODUCT_COMMAND` / decision | `PRJ-09 ApproveProjectBaselineRevision` | `project.manage`; `EXPLICIT_REVISION`; exact `candidateBaselineDigest` | current approved Baseline changes only after server success |

Core transition law:

```text
Candidate A remains immutable
review/chat/selection -X-> candidate mutation
Apply refinements = explicit PRJ-07 boundary
Candidate A + explicit reviewFeedback → governed investigation → Candidate B
Candidate B review → exact PRJ-09 decision → Approved Baseline
```

---

## 4. Identity and review-context law

```text
projectId = URL_NAVIGATION / server-revalidated Project reference
candidateBaselineDigest = URL_NAVIGATION
candidate / approved Baseline content = SERVER truth
review selection / panel open-close = EPHEMERAL_UI
proposed refinements = FORM_DRAFT
```

Rules:

- `candidateBaselineDigest` is the exact immutable review/re-entry subject, not a browser-owned lifecycle state;
- candidate digest may appear in navigation so refresh/re-entry can resolve `PRJ-23`;
- `projectionAnchor` / selected rendered text are untrusted contextual hints to `PRJ-24`, not candidate identity;
- HTML/DOM state cannot replace the digest or Project identity;
- conversation state may help cognition but cannot decide Baseline truth;
- Mastra thread/run/memory identity must not become Product authority;
- a new candidate is a new review subject; old candidate-local selection state never silently transfers authority.

---

## 5. Client-state ownership

| State | Class | Rule |
| --- | --- | --- |
| disclosed Project collection | `SERVER` projection | cache allowed; never fabricate metadata or authority |
| local Project filter text / selected archive filter | `EPHEMERAL_UI` | filters only current disclosed result |
| Create Project `name`, source mode, locator draft | `FORM_DRAFT` | no committed Project truth before successful `PRJ-03` |
| Inception `intent` | `FORM_DRAFT` | no Inception result before successful `PRJ-07` |
| candidate digest in route | `URL_NAVIGATION` | exact review subject coordinate; server revalidates |
| candidate / approved Baseline | `SERVER` | immutable/current owner truth only |
| selected candidate section/text | `EPHEMERAL_UI` | generated review context only |
| assistant open/collapsed state | `EPHEMERAL_UI` | presentation only |
| assistant composer/question draft | `FORM_DRAFT` | no authority |
| queued refinements | `FORM_DRAFT` | explicit human draft until Apply |
| contextual answer | `SERVER` response/projection | read-only explanation, not Baseline truth |

No fifth client-state class is justified.

---

## 6. Generated transport custody

All W-01 network interaction follows:

```text
accepted 4A Project semantics
→ canonical 4B Product OAS
→ GENERATED transport/type projection
→ W-01 consumer
```

W-01 does not select Kubb or any final SDK/query/cache wrapper. A handwritten screen-local DTO that widens/narrows `PRJ-01/03/07/08/09/23/24` is forbidden.

Local filters, selected review sections, panel open/close and refinement drafts require no synthetic Product endpoint.

---

## 7. Material state / failure / recovery obligations

### Projects collection — `PRJ-01`

Preserve:

```text
loading
!= 200 known-empty []
!= 401 authentication-required
!= 403 current denial
!= 404 Workspace absent/non-disclosable
!= transport/dependency failure
```

A failed Project read cannot be rendered as an empty Workspace.

### Create Project — `PRJ-03`

`Idempotency-Key` is required by the canonical wire. Material outcomes include:

```text
201 source-complete Project
401 / 403 / 404 authority/disclosure failure
409 conflict
422 invalid closed request/source admission input
503 dependency unavailable
```

Failure remains on the create/recovery path. It must never be presented as a half-created successful Project.

### Inception / refinement — `PRJ-07`

Required first-investigation input:

```text
intent = non-blank
```

Refinement additionally requires the all-or-nothing pair:

```text
priorCandidateBaselineDigest
+ reviewFeedback
```

Material failures: `401/403/404/409/422/503`. A failed refinement preserves Candidate A as the exact reviewed subject and keeps the human feedback recoverable as draft; the client does not invent Candidate B.

### Candidate re-entry — `PRJ-23`

`401/403/404` remain distinct from a valid candidate response. A caller-known digest that no longer resolves/discloses must fail closed; the frontend cannot fall back to a cached candidate as authority.

### Contextual candidate explanation — `PRJ-24`

`401/403/404/422` are honest failure classes. A review-context anchor/text mismatch may not mutate anything; exact server-side projection version/mismatch semantics are a 4D carry-forward. The safe P8/P9 law is:

```text
untrusted reviewContext
→ server revalidation
→ bounded explanation OR explicit failure
→ no authority transition
```

### Approved Baseline read — `PRJ-08`

`404` must not cause the frontend to fabricate an approved Baseline. A new Project may truthfully have no approved comparison subject yet.

### Exact approval — `PRJ-09`

Material outcomes include `401/403/404/409/412/422`. `412`/conflict-like currentness failure means the exact reviewed candidate cannot be silently reinterpreted as current approval authority. The UI must keep the decision unresolved and re-resolve current truth.

---

## 8. Authentication / authorization boundary

```text
Keycloak/OIDC authentication
→ Conexus Account/session
→ Workspace membership + exact Project grant
→ exact ordinary Permission / owner current state
```

W-01 presentation does not authorize. In particular:

```text
visible Project card != Project authorization
hidden control != authorization
known candidate digest != authorization
selected rendered section != authority
assistant response != authority
queued refinement != authority
browser says Approved != approved Baseline
```

`PRJ-24` stays under `project.manage`; W-01 must not require `project.build` merely because a contextual assistant is visible. `BLD-16` remains Builder-only for the later Build context.

---

## 9. Responsive / accessibility structural obligations

Locked obligations:

- inherit the GF-01 single adaptive current-scope rail and breadcrumb hierarchy;
- Projects cards reflow without horizontal-scroll dependence;
- each Project retains an explicit keyboard-operable Open action;
- source mode uses semantic labeled controls and conditional locator remains labeled;
- Inception intent is a labeled form control;
- candidate review sections have non-pointer selectable/focusable paths;
- selected review context is identified textually, not by color alone;
- contextual assistant has explicit label, composer and close path;
- proposed refinements remain visibly inspectable before Apply;
- Apply and Approve remain distinct actions in reading/focus order;
- narrow assistant treatment may overlay/use full width but may not remove access to the reviewed candidate or only material action;
- candidate and approved Baseline remain distinguishable programmatically/textually.

Exact pixel breakpoints and production component behavior remain 4D/final-design realization details.

---

## 10. Forbidden frontend authority

W-01 forbids:

```text
ProjectSummary decoration with fabricated release/activity/framework/setup/source-provider facts
global Product search inferred from local Project filtering
frontend-owned source selection during PRJ-07
half-created Project success after failed PRJ-03
editable HTML/DOM as Baseline truth
candidate mutation per chat message
visual anchor / selected text as Product identity
Mastra memory/thread as Baseline authority
BaselineComment / BaselineThread / ReviewSession Product domain
generic candidate CRUD
RejectBaseline command invented by UI
optimistic candidate creation after failed PRJ-07
optimistic exact approval before PRJ-09 success
silently carrying Candidate-A review authority into Candidate B
generic Baseline/Plan review renderer admitted from one consumer
```

---

## 11. P10 bounded interaction-pattern consolidation

Locked W-01 local semantics now include:

```text
sparse-truth Project cards/grid
source-complete Create Project progression
intent-first Inception
exact immutable candidate visual review
candidate-local contextual explanation
non-authoritative review-feedback queue
explicit refinement application → new candidate
exact-digest approval
```

GF-01 and W-01 provide two contextual-assistant usages, but the semantic subjects and Permissions differ (`BLD-16/project.build` later Builder context vs `PRJ-24/project.manage` Baseline candidate context). Fable explicitly found that two instances do not yet prove a shared contextual-explanation Product primitive; a third materially similar consumer is the watch trigger.

The visual-review loop has one real consumer today: Baseline. Plan is materially different because it projects live Hub-owned Plan/checklist truth rather than an immutable candidate.

```text
P10 graduated shared patterns = 0
Plan visual grammar = DEFERRED TO P-01
```

No generic review framework, renderer, hook/store, component API or SDK abstraction graduates from W-01.

---

## 12. P11 trigger disposition

```text
P11 = NOT TRIGGERED SEPARATELY
```

Reason:

- the locked P8 HTML already exercises the bounded interaction questions needed for W-01 adjudication: Projects filtering/opening, source-mode conditional form, Inception progression, candidate-section selection, assistant seam, review-feedback queue, Apply→new-candidate fixture and exact approval fixture;
- duplicating those interactions in a second W-01-only prototype would add no new falsifier;
- the assembled 4C interactive walkthrough remains required later when multiple locked blocks can be exercised as whole Product flows.

The P8 fixture remains Evidence only and proves no backend/auth/runtime behavior.

---

## 13. Deferred / reopen law

W-01 is `READY` as an inherited Journey-B baseline for later blocks.

Carry-forwards that do **not** reopen W-01 by themselves:

```text
candidate-digest discovery for future multi-reviewer/new-device/handoff consumer = DEFERRED until consumer exists
review-projection version + failed-anchor mismatch semantics = 4D realization
Plan visual grammar = P-01
shared Baseline/Plan renderer = forbidden until repeated locked evidence proves it
```

Reopen W-01 only if later Evidence materially falsifies one of:

- sparse truthful Project recognition with current `ProjectSummary`;
- source-complete creation without hidden source authority;
- intent-first Inception over server-resolved source/context;
- immutable candidate lineage and exact re-entry;
- candidate-bound contextual explanation without Builder authority leakage;
- explicit human refinement boundary;
- exact-digest approval;
- accessible/responsive realization.

Do not reopen for visual preference, framework ergonomics or a desire to prebuild reusable primitives.

**Next material block:** `W-02` — Workspace Brain + Connections.
