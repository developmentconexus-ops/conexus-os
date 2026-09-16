# C-020 — Mastra-native Builder coding harness

> **Status:** CURRENT / OPERATOR RATIFIED / 2026-09-14
> **Scope:** ordinary internal Builder path for the Metal Nobre MVP
> **Execution owner:** `docs/tasks/builder-first-app.md`
> **Status owner:** `docs/roadmap.md`
> **Decision owner:** C-020 in `docs/decisions/index.md`

This is the current technical authority for the ordinary internal Builder.
It supersedes conflicting Change-centric implementation wording in older
Builder references and locked Product evidence without rewriting historical
receipts or historical proof.

The operator-approved rule is:

> **Use Mastra natively for coding-harness mechanics. Conexus implements only
> the authority and durable Product truth that Mastra must not own.**

---

## 1. Product job

The Builder must feel like a normal coding agent over one persistent Project:

```text
open/create Project
→ Build
→ see the current/last-good app
→ send a natural-language request
→ agent works on current Project source
→ successful source changes compile automatically
→ Preview updates automatically
→ continue the same conversation and source
```

The operator does not administer `Change`, `Plan`, `WorkUnit`, `ActorRun`,
`CodingSession`, candidate states, hashes, manual Preview preparation or
infrastructure choices in the ordinary path.

The minimum experience we must prove before widening scope is:

```text
request 1 creates/changes app
→ request 2 starts from request-1 source
→ response-only request changes no source
→ reload/restart preserves conversation + source + last-good Preview
→ request 3 continues normally
```

---

## 2. PSTACK / Poteto laws

```text
Experience First
Model the Domain
Subtract Before Add
Attack the Premise
Redesign From First Principles
Laziness Protocol
Boundary Discipline
Fix Root Causes
Migrate Callers Then Delete Legacy APIs
Sequence Verifiable Units
Prove It Works
```

Consequences:

- reuse Mastra primitives before creating Conexus machinery;
- preserve useful existing Git/E2B/compiler/Registry/security mechanics;
- do not preserve accidental legacy abstractions merely because code exists;
- do not add Brain, Sankhya, generic tasks, workflow engines or new platform
  surfaces before the basic Builder loop is real;
- current implementation green tests do not substitute for the exact Product
  journey they claim to prove.

---

## 3. Final domain model

```text
HUB PROCESS
│
├── Conexus authority
│   ├── Account / Workspace / Project authorization
│   ├── BuilderRun
│   ├── ProjectWorkingState
│   ├── Git/source custody
│   ├── compiler / ArtifactRevision
│   └── last-good Preview
│
└── Mastra coding harness
    └── shared AgentController
        └── shared createCodingAgent
            ├── Project A persistent Thread
            ├── Project B persistent Thread
            └── per BuilderRun
                ├── live Session
                ├── fresh Workspace
                └── fresh E2B sandbox
```

There is no persistent Conexus `Turn`.

```text
human conversational turn = Mastra messages
physical coding execution = Conexus BuilderRun
current code              = ProjectWorkingState.working_source_revision
usable compiled app       = ProjectWorkingState last-good Preview coordinates
```

---

## 4. Exact Mastra baseline and accepted use

Installed/qualified stack:

```text
@mastra/core   1.63.2
@mastra/e2b    0.11.0
@mastra/memory 1.28.1
@mastra/libsql 1.22.2
```

Use `.agents/skills/mastra/SKILL.md` and the exact installed package/source
before remote/latest documentation.

The current qualification proves:

- one shared `AgentController` can isolate multiple Projects;
- each Project can have its own deterministic persistent Thread;
- different physical Workspaces can bind the same persistent Project Thread;
- PLAN/BUILD tool exposure is enforceable with `availableTools`;
- the persisted user message is stored as `role=signal`, `type=user` with a
  stable ID and can be recovered from the Thread;
- user `message_start` is not emitted by the live subscription; assistant/tool
  activity is the relevant live stream;
- Controller recreation does not erase persisted Thread history.

### 4.1 Lifetime

Target lifecycle:

```text
Hub startup
→ create persistent Memory/storage
→ create one coding agent
→ create/init one shared AgentController

BuilderRun
→ fresh E2B
→ fresh Workspace
→ create Session(resourceId=Project, scope=builder:<runId>, threadId=Project Thread)
→ switch BUILD/PLAN mode
→ subscribe to native live events
→ send user message
→ finish
→ controller.deleteSession(resourceId, scope)
→ destroy E2B/Workspace

Controller stays alive
Thread/messages stay persisted
```

Use native `AgentController.deleteSession()` to release live Session state.
Do not build a custom Session registry.

### 4.2 Conversation projection

Product conversation must normalize stored Mastra facts as:

```text
role=signal + type=user → user
role=assistant          → assistant
intentional displayable system text → system
other internal signal/task rows      → not a chat message
```

Return messages in chronological order.
Do not create a second Conexus conversation store or `recentTurns` summary layer.

### 4.3 Native tasks

Mastra can provide task signals, but the current MVP does not require a durable
task UI. Do not add task machinery merely because the framework supports it.
Reopen only when a real Product interaction needs it.

---

## 5. Mastra owns mechanics

Mastra owns:

```text
AgentController
createCodingAgent
persistent Thread/messages
live Session
Workspace/filesystem/search/edit/command mechanics
mode/tool exposure
assistant/tool live events
```

Mastra does **not** own:

```text
Project authorization
working source authority
Git result admission
BuilderRun durability/idempotency
last-good Preview
ArtifactRevision identity
Brain/Data/Capability authorization
```

The browser never chooses a Mastra Thread, Controller, Session, model or
Workspace identity.

---

## 6. BuilderRun

`BuilderRun` is the only durable ordinary execution record.

Required semantic facts:

```text
builder_run_id
project_id
account_id
idempotency_digest
request_digest
mode                    BUILD | PLAN
base_source_revision
base_working_version
state                   QUEUED | RUNNING | SUCCEEDED | FAILED | INTERRUPTED
result_kind             null | RESPONSE_ONLY | SOURCE_CHANGED | SOURCE_CHANGED_BUILD_FAILED
result_source_revision  nullable
trigger_message_id      nullable until real Mastra user-message ID is bound
sandbox_id              nullable
model admission/provider/model coordinates where required
failure_code            nullable
created_at / started_at / finished_at
```

Laws:

- same idempotency key + same request returns the same run;
- same key + different semantic request conflicts;
- at most one active write-capable BUILD run per Project for the MVP;
- claim revalidates current authorization and exact source/version;
- PLAN can only settle as `RESPONSE_ONLY`;
- terminal state must tell the truth after failure/restart.

No ordinary Plan/WorkUnit/ActorRun/CodingSession/Finding/Evidence hierarchy is
created beneath BuilderRun.

---

## 7. ProjectWorkingState

Target semantic owner:

```text
project_id
working_source_revision
working_version
last_preview_source_revision
last_preview_artifact_revision_id
last_preview_artifact_digest
updated_at
```

Legacy Change-related columns may remain physically until accepted callers are
migrated, but the C-020 path must not depend on them.

Working source and Preview are deliberately separate:

```text
build success:
working=B
last-good Preview=B

build failure after source admission:
working=B
last-good Preview=previous good source/artifact
```

The next BUILD request always starts from `working_source_revision`, including a
failed-build source that needs repair.

---

## 8. Source and Git custody

Mastra edits files; Conexus decides what becomes authoritative Project source.

### 8.1 Immutable source identity

C-020 source reachability is source-oriented:

```text
refs/conexus/sources/<sourceRevision> → exact commit <sourceRevision>
```

The Project's original canonical source may still be reachable by
`refs/heads/main`. Builder edits do not need to move `main`.

To prepare exact source `S`:

```text
if refs/conexus/sources/S exists and resolves exactly to S
    bundle that ref
else if refs/heads/main resolves exactly to S
    bundle main
else
    refuse
```

### 8.2 Result admission

For base `A` and result `B`:

```text
prove A is exact admitted source
→ import result bundle into isolated inspection ref
→ prove claimed B
→ prove exactly one commit after A
→ prove B parent == A
→ validate changed files and bounded patch
→ retain refs/conexus/sources/B = B
→ only then PostgreSQL CAS working A/versionN → B/versionN+1
```

A stale result may remain immutable Git data, but failed CAS means it never
becomes working authority.

### 8.3 Current app mutation boundary

For the fixed `REACT_VITE_V1` internal MVP, ordinary Builder source mutation is
bounded to:

```text
app/**
```

The agent may edit files created by a previous BuilderRun under `app/**`.
Do not require those generated-by-Builder app files to have existed in the
original static ownership manifest.

Continue to refuse platform/generated/protected paths, unsafe entries,
symlinks/submodules, invalid ancestry, multi-commit results and size ceilings.
Legacy Change custody may preserve its historical ownership semantics behind a
legacy adapter.

### 8.4 Source inspection authority

Code/Diff reads may disclose only exact authorized Project source revisions.
For C-020, current admission includes:

```text
ProjectWorkingState.working_source_revision
ProjectWorkingState.last_preview_source_revision
latest relevant BuilderRun.base_source_revision
latest relevant BuilderRun.result_source_revision
```

Legacy source-read admission may remain as fallback for historical callers.
Arbitrary reachable Git OIDs are never enough for disclosure authority.

---

## 9. BUILD and PLAN

Same Project Thread, different native Mastra mode/tool exposure.

### BUILD

```text
read/list/search/grep/stat
write/edit/create/delete
execute command/process
```

The fixed app starter may be materialized only in BUILD when required.

### PLAN

```text
read/list/search/grep/stat
```

PLAN is read-only end-to-end:

- no write/edit/delete/execute Mastra tools;
- no host-side starter materialization;
- no source commit;
- no compiler invocation;
- settlement = `RESPONSE_ONLY` only.

Do not create a `builder.plan` owner for ordinary chat.

---

## 10. Coding runtime

Ordinary runtime input is execution-generic:

```text
projectId
accountId
executionId
mode
userContent
baseSourceRevision
sourceBundle
signal/live observer
bind message/sandbox callbacks
```

The ordinary model prompt must not contain Change/WorkUnit/ActorRun/admission
identities.

Stable coding instructions are shared by the shared agent and must include:

```text
work only in the exact Session Workspace
ordinary app edits live under app/**
use fixed REACT_VITE_V1 stack
no dependency/package installation
no platform/generated mutation
no credentials/network authority
```

Host-controlled result creation remains:

```text
agent edits Workspace
→ host git add/diff
→ no diff: RESPONSE_ONLY
→ diff: host creates one canonical result commit + bundle
→ Conexus admits exact result
```

The LLM never decides source authority.

---

## 11. Streaming and reconnect

```text
HISTORY = persistent Mastra Thread/messages
LIVE    = native Mastra Session.displayState snapshots
EVENT   = display_state_changed
Hub     = thin authenticated Project/run safe projection
```

Conexus subscribes to `display_state_changed`, emits one safe snapshot from
`Session.displayState.get()` after subscribing, and replaces the current live
view on each subsequent snapshot. The projection does not expose raw tool
arguments/results, shell output, credentials, provider metadata or unsafe
paths. No custom event protocol, replay log or live buffer is created for
C-020.

Reconnect:

```text
GET Builder Session
→ persisted Product-normalized messages
→ latest BuilderRun summary
→ working source
→ last-good Preview

live endpoint
→ only currently available Session activity
```

Missed live events do not corrupt durable truth; reload comes from Thread +
BuilderRun + ProjectWorkingState.

---

## 12. Product API

Ordinary Product surface is Project-scoped:

```text
GET  /api/control/projects/:projectId/builder-session
POST /api/control/projects/:projectId/builder-session/messages
POST /api/control/projects/:projectId/builder-session/preview
GET  /api/control/projects/:projectId/builder-session/runs/:builderRunId/stream
```

### GET session

Product-useful response:

```text
projectId
messages
latestBuilderRun
mode
preview:
  workingSourceRevision
  lastGoodSourceRevision
  lastGoodArtifactRevisionId
  lastGoodArtifactDigest
```

Do not expose Thread/controller/session/model/sandbox identities.

### POST message

Browser supplies only:

```text
content
mode BUILD | PLAN
Idempotency-Key
```

Server resolves Account, Project authority, Thread, working source/version and
model admission.

### POST Preview

Ordinary Preview launch must be server-resolved from the authorized Project's
last-good Preview coordinates.

The browser must not select Preview authority by echoing:

```text
builderRunId
sourceRevision
artifactRevisionId
artifactDigest
```

These are already server truth.

MAR may temporarily retain legacy internal correlation fields; do not redesign
MAR merely to rename them during this MVP correction.

---

## 13. Compiler / Registry / Preview

Compiler subject:

```text
projectId
executionId      # correlation/provenance only
sourceRevision   # exact source subject
files
```

Registry application identity remains Project + exact source + immutable
artifact revision/digest.

Ordinary C-020 does not use `PreviewPreparationCoordinator` or require an
independent verification state before internal Preview.

Flow:

```text
SOURCE_CHANGED B
→ admit working source B
→ compile exact B
→ retain ArtifactRevision(Project,B)
→ update last-good Preview coordinates
```

Compile failure keeps B as working source and preserves previous Preview.

### 13.1 P-01 Preview UX

If a last-good Preview exists, opening Build automatically establishes the
preview route/grant and renders the app.

The primary surface is the app itself, not source/artifact coordinates or an
`Abrir Preview` prerequisite.

A secondary `Nova aba` action may remain.
Technical identities live under `Detalhes`.

### 13.2 Diff UX

The primary Diff represents the latest code-changing BuilderRun:

```text
BuilderRun.base_source_revision
→ BuilderRun.result_source_revision
```

Do not use working source vs last-good Preview as the primary diff because those
are intentionally equal after a successful build.

For `RESPONSE_ONLY`, show that the request produced no source change.

---

## 14. Project creation

Internal MVP:

```text
Create Project
→ deterministic canonical source bootstrap
→ ProjectWorkingState initialized
→ Build opens
→ composer ready
```

Manual Inception/Baseline approval is not an ordinary Builder-entry prerequisite.
Do not delete broader Inception/Baseline capabilities during this correction.

---

## 15. Brain boundary

Brain is **not** part of the core Builder acceptance gate.

The ordinary coding runtime must not pre-query Brain on every message or append
custom retrieved business text to every prompt.

The first real Brain-backed build is a later slice, after the core
create/open/continue journey is accepted.

Target Brain interaction is agent-initiated through narrow Mastra tools such as:

```text
searchBrain(query)
readBrainItem(itemId)
```

Conexus derives Project/Workspace/Brain binding, admitted revision and provenance
server-side. The model never chooses tenant authority or credentials.

No MCP/RAG/vector database is introduced unless direct authorized tools prove
insufficient.

---

## 16. Legacy disposition

For ordinary new Builder work:

```text
Change                    FROZEN LEGACY
Plan                      FROZEN LEGACY
WorkUnit                  FROZEN LEGACY
ActorRun                  FROZEN LEGACY after useful invariants migrate
CodingSession             FROZEN/DELETE after callers migrate
recentTurns               DELETE ordinary path
custom conversation state DELETE ordinary path
custom durable Change feed DELETE ordinary path
PreviewPreparation        LEGACY
CHANGE_CANDIDATE build    LEGACY
sourceChangeId            LEGACY only
workingChangeId           LEGACY only
lastPreviewChangeId       LEGACY only
```

Order:

```text
new path works
→ callers migrate
→ prove zero new ordinary legacy writes
→ freeze APIs
→ delete implementation/schema only when no accepted consumer remains
```

Historical migrations, receipts and Evidence are not rewritten.

Older Change-centric wording in `docs/reference/builder-and-harness.md` and the
mechanism portions of locked P-01 evidence are historical where they conflict
with this C-020 owner. Preserve the accepted P-01 human job/layout; do not revive
Change merely because historical UI evidence mentions it.

---

## 17. Migration discipline

Published migrations are immutable.

Current C-020 sequence already includes 028–036. Further schema correction uses
new forward migrations only. The next planned migration for C-020 source-read
admission is 037; do not edit 030–036 to make current tests pass.

---

## 18. Verification strategy

Proof must match the claim.

Required focused facts before operator UX testing:

```text
real Git A→B→C continuity with main unchanged
second run can edit app/** created by first run
stale result cannot overwrite newer working source
C-020 source reads admit working/Preview/latest-run source only
shared Controller + per-run Session deletion preserves Thread
signal/user Mastra message projects as Product user
PLAN produces zero source/build mutation
bodyless server-resolved Preview launch
automatic Preview rendering
latest-run Diff base→result
ordinary Builder creates zero Change rows
```

The mocked Playwright Builder test is a UI/contract test, not a composed live
Product proof.

Do not rebuild the old R1/R2/RB stage choreography as current mandatory gates.
Historical audits remain explicitly invokable.

Reuse existing live model/E2B and compiler proof harnesses where possible; do not
invent a second live-testing framework.

Final acceptance requires one real local composed Product journey through the
actual Hub/Web/PostgreSQL/Mastra/model/E2B/Git/compiler/Registry/Preview stack.

---

## 19. Slice governance

Implementation is now review-gated by slices.

`docs/tasks/builder-first-app.md` owns the slice definitions.
`docs/roadmap.md` owns which slice is currently authorized.

Rules:

```text
one explicit slice handoff
→ Codex implements only that slice
→ focused tests + diff + commit
→ STOP
→ GPT reviews against C-020 and the slice acceptance
→ operator/GPT explicitly authorize next slice
```

Do not continue automatically into a later slice because the current one is
green.

A slice may fix local implementation detail without reopening architecture.
Architecture reopens only on the triggers below.

---

## 20. Non-goals

Do not add now:

- persistent Conexus Turn;
- Change in ordinary Builder execution;
- generic workflow/task engine;
- multi-session chooser;
- direct broad Mastra API exposure to browser;
- stack selection UI;
- moving `refs/heads/main` on every Builder edit;
- MAR redesign;
- destructive legacy-schema deletion;
- Brain RAG/vector/MCP infrastructure;
- Sankhya capability work before core Builder acceptance;
- mandatory independent AI review for ordinary internal Preview.

---

## 21. Reopen triggers

Reopen only the smallest implicated boundary if real evidence proves:

- installed Mastra cannot isolate Projects under the shared Controller;
- native Session lifecycle cannot be released without losing required Thread
  continuity;
- PLAN cannot be made end-to-end read-only;
- stable persisted user-message identity cannot be correlated safely;
- BuilderRun cannot preserve required idempotency/concurrency/restart truth;
- immutable source custody cannot support real A→B→C while preserving protected
  paths and late-result refusal;
- a real business capability cannot fit the existing Product authority boundary.

Existing code volume, historical Change schemas and migration history are not
reopen triggers.
