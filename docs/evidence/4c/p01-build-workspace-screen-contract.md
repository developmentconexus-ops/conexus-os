# P-01 — Project Build workspace Screen Contract

> **Status:** `LOCKED / OPERATOR APPROVED`
> **Method:** Frontend Product Experience Planning Method v2.2
> **P9:** `P9 EXACT TRACE CLOSED`
> **P10:** `P10 CONSOLIDATED`
> **P11:** `P11 LATER ASSEMBLED PRODUCT`
> **Final operator-approved P8:** `docs/evidence/4c/p01-build-workspace-functional-wireframe.html`
> **Exact artifact identity:** `approved final P8 artifact blob = 3f9d30f7e6fa0de814f0be20b7583b4e98aca7c8`
> **Bounded upstream correction:** `4C-F15 / BLD-10 GetBuildPreview`
> **Whole-wire lock proof:** final P-01 lock Verify; any material failure reopens the smallest affected owner before this lock may be claimed complete.

---

## 1. Locked human job

```text
enter Project → Build
→ see the current Project application immediately
→ converse with Conexus in the right sidebar
→ optionally reason in Plan mode without creating mutation work
→ state a Build instruction when something must change
→ Conexus/Builder creates exact durable Change work behind the interaction
→ keep the current / last-good application inspectable while candidate work progresses
→ inspect Code / Diff or governed Plan / Findings / Evidence / execution detail only when needed
```

Binding structural baseline:

```text
Build → current Project application immediately
Conexus chat = right sidebar
no active Change required
no Change chooser
Preview = default / dominant application lens
Code / Diff = read-only inspectable lenses
Plan / Findings / Evidence / Details = on-demand inspection
simple by default + inspectable by design
```

The user enters Build to build the application, not to administer internal Builder records. `Change` remains durable work truth but is not the root navigation object.

---

## 2. P9 — exact authority and interaction trace

### 2.1 Global / Project shell

P-01 inherits the already-locked GF-01 single adaptive rail and Project context. It does not create a second Builder shell or new Project IA.

```text
Workspace / Project context = existing GF-01 shell
Build route = URL_NAVIGATION
Project route = URL_NAVIGATION
```

### 2.2 Default Build entry — current Project application

```text
BLD-10 GetBuildPreview without changeId → CURRENT_PROJECT
Permission = project.build
subject owner = Builder / MAR Preview projection
server resolves = current canonical Project source
subjectDigest = exact server-resolved current Project source Preview subject
```

The browser does not select `sourceRevision`, derive “current” from latest Change, or substitute active Release serving state.

Binding laws:

```text
CURRENT_PROJECT != CHANGE_CANDIDATE
current Project source != active Release
Build Preview != Published App serving state
current != candidate
ready != verified != live
live = false on BLD-10
```

### 2.3 Build instruction — durable Change begins behind the conversation

```text
Build composer / BUILD mode
→ authored nonblank human instruction
→ BLD-03 CreateChange
→ Permission = project.build
→ exact Change established
→ Build instruction → exact Change.intent
→ changeId remains exact durable technical identity
```

The chat is the human interaction surface; `bld.change` is the durable work subject.

```text
chat = human interaction surface
Change = durable work truth
```

### 2.4 Candidate Preview after Change exists

```text
BLD-10 GetBuildPreview with optional exact changeId → CHANGE_CANDIDATE
Permission = project.build
changeId = untrusted exact Change reference
server re-resolves Project containment/current disclosure
subjectDigest = exact Change candidate Preview subject
```

The current / last-good application stays inspectable while candidate work is in progress.

### 2.5 Plan mode in the composer

Before a Change exists:

```text
Plan mode before Change = BLD-16 Project-context conversational reasoning
Plan mode before Change != BLD-04 durable ChangePlan
question only
→ project.build
→ current authorized Project/platform Builder context
→ read-only contextual guidance
→ no Change mutation
```

A conversational plan may help the human decide what to ask for, but it is not durable Builder Plan truth.

After a Change exists:

```text
BLD-04 GetChangePlan
→ project.build
→ exact current Change Plan projection

BLD-05 DecideChangePlanCheckpoint
→ project.review
→ exact Plan revision + current reviewer eligibility
```

### 2.6 Hub-owned progress

```text
BLD-06 GetChangeProgress
→ project.build
→ exact Change / Plan progress truth
```

```text
Hub progress != model narration
conversation != Progress truth
```

### 2.7 Code / Diff lenses

```text
BLD-07 GetChangeDiff
BLD-08 ListProjectSourceTree
BLD-09 GetProjectSourceFile
→ project.source.read
→ exact immutable/current source coordinates
→ read-only inspection
```

```text
visible Code/Diff != project.source.read grant
source-readable != source-mutable
```

Build can make these lenses discoverable without deriving or elevating source Permission in the browser.

### 2.8 Findings / Evidence / checkpoint review

```text
BLD-05 DecideChangePlanCheckpoint
BLD-11 ListChangeFindings
BLD-12 GetFinding
BLD-13 CloseFinding
BLD-14 ListChangeEvidence
BLD-15 GetEvidence
→ project.review
→ exact current review subject + server-resolved eligibility/disclosure
```

```text
visible Findings/Evidence != project.review grant
visible Plan decision != reviewer eligibility
no Findings != verified
Evidence present != claim proven
```

### 2.9 Contextual Conexus assistance

```text
BLD-16 AskConexusAboutContext
question only
→ Project-level Builder context

question + optional changeId
→ exact server-resolved current Change context

Permission = project.build
```

The optional Change reference does not acquire source, review or runtime authority.

```text
conversation != Change
conversation != Plan truth
conversation != Progress truth
conversation != verification
assistant answer != owner state
assistant answer -X-> Change / Plan / progress / verification truth
```

### 2.10 Execution detail

```text
BLD-17 GetChangeExecutionDetail
→ project.build
→ exact subordinate WorkUnit / ActorRun projection
→ progressive disclosure only
```

WorkUnit / ActorRun mechanics never become root IA or generic runtime-control surfaces.

---

## 3. Permission separation

This separation is binding across all P-01 surfaces:

```text
project.build != project.review != project.source.read
```

| Human job | Exact operations | Permission |
| --- | --- | --- |
| Current / candidate Build Preview | `BLD-10` | `project.build` |
| Create / inspect Change, Plan read, progress, assistant, execution detail | `BLD-01..04`, `BLD-06`, `BLD-16`, `BLD-17` | `project.build` |
| Code / Diff | `BLD-07..09` | `project.source.read` |
| Plan checkpoint / Findings / Evidence | `BLD-05`, `BLD-11..15` | `project.review` |

A visible tab, button, assistant reference or existing `changeId` never implies the other Permission families.

---

## 4. Client-state classification

```text
current/candidate Preview = SERVER
active Change after create = SERVER
Change intent / Plan / progress / Findings / Evidence / execution detail = SERVER
source tree / file / diff = SERVER
assistant response = SERVER read response; never mutation authority
composer draft/chat fixture = EPHEMERAL_UI
lens/inspector open state = EPHEMERAL_UI
Project route = URL_NAVIGATION
```

The P8 transcript is deliberately disposable local Evidence:

```text
Builder chat transcript in P8 = EPHEMERAL_UI fixture
durable Builder conversation/thread persistence = NOT ADMITTED
```

No `BuilderThread`, `BuildSession`, conversation memory owner, transcript persistence or generic AI-workspace record is introduced by P-01.

---

## 5. Material state distinctions

```text
loading != known-empty != denied != absent/non-disclosable != dependency failure
working != blocked != waiting-for-user != completed
current != candidate
ready != verified != live
```

Additional laws:

```text
last-good Preview survives while next candidate builds
candidate ready != verification
verification != Release
Release != live serving
```

P-01 must not flatten these into one spinner, one generic error, one “done” state or model narration.

---

## 6. P10 — consolidation

Existing graduated shared vocabulary before P-01:

```text
context-preserving exact-subject panel
```

P-01 instantiates that already-graduated pattern for on-demand Plan / Findings / Evidence / Details inspection while the application/Change context remains visible. It does not graduate a second generic panel abstraction.

```text
P10 new graduated shared patterns = 0
existing graduated patterns remain = 1
P11 = LATER ASSEMBLED PRODUCT
```

The following are intentionally single-instance P-01 composition, not shared production abstractions:

```text
app-first Builder + right-side chat = single-instance
Build/Plan composer = single-instance
Preview / Code / Diff lens group = P-01 composition
```

Do not invent generic `AIBuilder`, `AgenticWorkspace`, `BuildSessionStore`, `ThreadOwner`, universal IDE shell, cross-owner DTO or shared frontend authority layer from this lock.

---

## 7. Forbidden / not admitted

```text
Change chooser as root = FORBIDDEN
current app from latest Change = FORBIDDEN
current app from active Release = FORBIDDEN
browser-owned current app from source = FORBIDDEN
caller-selected sourceRevision for CURRENT_PROJECT Preview = FORBIDDEN
chat transcript as Product/Builder truth = FORBIDDEN
assistant answer as Plan/progress/verification authority = FORBIDDEN
source mutation in Code/Diff = FORBIDDEN
source permission elevation = FORBIDDEN
review permission elevation = FORBIDDEN
generic Change status editor = FORBIDDEN
WorkUnit / ActorRun root navigation = FORBIDDEN
generic AI Builder/session owner = NOT ADMITTED
durable Builder conversation/thread persistence = NOT ADMITTED
P11 early assembly = FORBIDDEN
```

---

## 8. Locked result and reopen law

P-01 is locked to the operator-approved human experience and exact authority trace above. A later phase may reopen only the smallest affected owner if a material falsifier proves this experience cannot be implemented truthfully.

The lock does **not** authorize:

```text
P-02 opening
P11 assembly
4D start
Product implementation
PR #57 merge
```

Exact next routing after this lock:

```text
P-01 = LOCKED / OPERATOR APPROVED / P9/P10 CLOSED
P-02 = NEXT / NOT OPEN
```
