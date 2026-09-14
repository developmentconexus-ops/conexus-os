# C-020 — Mastra-native Builder coding harness

> **Status:** CURRENT / OPERATOR RATIFIED / 2026-09-13
> **Scope:** ordinary internal Builder path for the Metal Nobre MVP
> **Execution owner:** `docs/tasks/builder-first-app.md`
> **Status owner:** `docs/roadmap.md`
> **Decision owner:** C-020 in `docs/decisions/index.md`

This reference records the approved technical realization of C-020 after a
PSTACK first-principles review of the current checkout, the exact installed
Mastra stack and the repository's own qualification probes.

It is intentionally narrower than the historical Builder architecture. It does
not rewrite historical Evidence or receipts. For ordinary new Builder work,
this document is the current technical target. Historical Change/Plan/WorkUnit/
ActorRun/CodingSession paths remain transitional legacy until callers migrate.

## 1. Product job

The Builder must behave like a coding harness over one persistent Project:

```text
open Project
→ see the current/last-good application
→ send a natural-language request
→ the agent works on the current Project source
→ successful source changes compile automatically
→ Preview updates
→ continue the same conversation and source
```

The operator does not administer `Change`, `Plan`, `WorkUnit`, `ActorRun`,
`CodingSession`, candidate states, verification stages or manual Preview
preparation in the ordinary path.

The app is ordinary code. The sandbox may be replaced between requests. Durable
conversation, source and Preview survive sandbox replacement.

## 2. PSTACK laws applied

This realization follows:

```text
Experience First
Model the Domain
Subtract Before You Add
Attack the Premise
Redesign From First Principles
Laziness Protocol
Boundary Discipline
Fix Root Causes
Migrate Callers Then Delete Legacy APIs
Sequence Verifiable Units
Prove It Works
```

The key subtraction rule is:

> Conexus implements only what Mastra does not provide and what must remain
> Conexus Product/system authority.

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
                ├── fresh/replaceable Workspace
                └── fresh/replaceable E2B sandbox
```

There is no persistent Conexus `Turn` owner.

A human conversational turn is represented by Mastra messages. A physical
attempt to work on Project source is represented by one Conexus `BuilderRun`.

## 4. Exact Mastra baseline

Current installed/qualified composition:

```text
@mastra/core   1.63.2
@mastra/e2b    0.11.0
@mastra/memory 1.28.1
@mastra/libsql 1.22.2
```

Before writing Mastra integration code, use `.agents/skills/mastra/SKILL.md` and
prefer exact installed docs/source over remote/latest docs.

The repository qualification at
`qualification/4d/mastra-builder-capability/probe.test.mjs` already proves, for
this stack:

- `createCodingAgent()` exposes real filesystem/search/edit/command mechanics;
- `AgentController` owns modes and live Session mechanics;
- persistent Thread/messages survive controller/storage rebind;
- the same Project Thread can bind a different physical Workspace/sandbox;
- Session display state exposes tasks, modified files, active tools, approvals,
  subagents and token usage;
- Build/Plan/Review modes exist as harness mechanics.

### 4.1 Three remaining exact probes

Before the structural refactor depends on them, prove exactly these three
properties against the installed 1.63.2 stack:

1. one shared `AgentController` can serve two Projects with distinct Threads and
   distinct physical Workspaces without cross-Project state bleed;
2. `availableTools`/mode tool policy can make `PLAN` genuinely read-only while
   `BUILD` retains write/edit/execute tools;
3. the live Session event/message surface exposes the stable persisted user
   message ID needed to correlate a `BuilderRun` with its triggering message.

If one of these fails, adapt only the smallest implicated seam. Do not reopen the
whole C-020 architecture.

## 5. Mastra owns mechanics

Mastra owns:

```text
AgentController
createCodingAgent
persistent Thread
Messages / conversation history
live Session
Workspace mechanics
filesystem/search/edit/command tools
tool-call events
message streaming
tasks/display state
mode state and mode tool exposure
```

The target host composition is:

```text
Hub startup
→ initialize persistent Mastra storage/memory
→ construct one shared coding agent
→ construct/init one shared Builder AgentController

BuilderRun
→ create fresh E2B sandbox
→ create Workspace bound to that sandbox
→ create/bind Session to exact Project Thread + Workspace
→ session.sendMessage(real user content)
→ subscribe to native Session events
→ terminate live Session / destroy Workspace and E2B

Controller + Thread storage remain available for subsequent requests.
```

The Controller may be recreated after Hub restart. Thread persistence, not a
process-resident Controller object, is the durable conversation contract.

## 6. Conexus owns authority

Conexus owns only the boundaries Mastra must not decide:

```text
current authenticated Account
Project authorization and isolation
trusted Project → deterministic Thread binding
BuilderRun durable execution facts
idempotency and one-writer admission
working-source compare-and-set
Git result custody and protected-path policy
late-result refusal
model/provider admission identity
physical sandbox identity where material
compiler admission
ArtifactRevision retention
last-good Preview selection
Brain/Data/Capability authorization
```

Mastra IDs, model IDs, tool calls, threads, sessions and sandbox IDs are never
Product principals by themselves.

## 7. Persistent Project Thread

For the MVP there is one deterministic conversation per Project:

```text
resourceId = projectId
threadId   = conexus-builder:<projectId>
```

The browser never chooses or needs the `threadId`.

Server code derives it from the authorized Project.

Do not maintain a second Conexus conversation history, `recentTurns`, assistant
summary ledger or durable observation log.

## 8. BuilderRun

`BuilderRun` is the only new durable execution record for the ordinary path.
Its responsibility is deliberately narrow:

> record one admitted physical Builder execution against an exact Project source
> state and settle its durable result.

Target semantic shape:

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
trigger_message_id      nullable until the real Mastra message ID is observed
sandbox_id              nullable
model_admission_id      nullable/required at claim as implementation dictates
model_provider_id
model_id
failure_code             nullable
created_at
started_at
finished_at
```

No Plan, WorkUnit, ActorRun, CodingSession, Finding or Evidence child hierarchy
is created for ordinary coding chat.

### 8.1 Idempotency

Idempotency binds the same logical request, not only the key:

```text
idempotency_digest = hash(Idempotency-Key)
request_digest     = canonical hash(mode + user content + any future explicitly
                     admitted semantic input)
```

Same key + same request returns the existing run and must not start duplicate
paid work.

Same key + different request fails with an idempotency conflict.

### 8.2 Concurrency

For the internal MVP:

```text
at most one active write-capable BUILD run per Project
```

`PLAN` may remain serialized initially. Do not add a generic scheduling system.

## 9. ProjectWorkingState

Target state is intentionally small:

```text
project_id
working_source_revision
working_version
last_preview_source_revision
last_preview_artifact_revision_id
last_preview_artifact_digest
updated_at
```

BuilderRun tells us which execution is active. Source revision tells us which
code is current. Preview coordinates tell us which compiled app is usable.

The new path does not require:

```text
working_change_id
working_account_id
current_change_id
current_account_id
current_state
preparation_attempt_id
last_preview_change_id
```

Legacy columns may remain temporarily for old callers. New C-020 settlement must
not depend on them.

## 10. Source and Git custody

Mastra edits a Workspace. Mastra does not decide which result becomes Conexus
source authority.

Conexus keeps the current useful protections:

- exact base source;
- one canonical result commit;
- direct-parent/ancestry check;
- no unauthorized Git remote;
- protected-path refusal;
- safe regular-file checks;
- patch/file/byte limits;
- immutable result identity;
- late-result refusal.

### 10.1 Immutable source reachability

The preferred C-020 result ref is source-identity based, not execution-identity
based:

```text
refs/conexus/sources/<sourceRevision> → exact commit <sourceRevision>
```

Flow:

```text
working = A / version N
BuilderRun R edits fresh Workspace
host materializes one canonical commit B
Conexus validates B against A
retain refs/conexus/sources/B → B
PostgreSQL CAS A,N → B,N+1
```

Git retention happens before Project working-state settlement. A stale/late
result may remain as retained immutable Git data, but a failed CAS means it never
becomes Project working source.

A single mutable `refs/conexus/working` is not required if PostgreSQL working
state + immutable source ref gives the complete authority.

## 11. Coding runtime

The current runtime contains valuable mechanics that should be preserved but
made execution-generic.

Target internal interface conceptually resembles:

```text
executeCodingSession({
  projectId,
  executionId,
  mode,
  userContent,
  baseSourceRevision,
  sourceBundle,
  workspace,
  signal,
  observe
})
```

The model prompt must not contain internal legacy IDs such as Change, WorkUnit,
ActorRun or admission tokens.

It receives:

```text
system/coding instructions
+ exact Project Workspace
+ allowed tools/capabilities
+ persistent Project Thread history
+ real current user message
```

`recentTurns` and manually packed prior summaries are deleted from the ordinary
path because the persistent Mastra Thread already owns conversation history.

### 11.1 Canonical result commit

Even though the coding agent can invoke Git commands, the canonical final commit
remains host-controlled:

```text
agent edits Workspace
→ host detects staged/uncommitted diff
→ no diff: RESPONSE_ONLY
→ diff: host creates one canonical result commit and bundle
→ Conexus validates/adopts result
```

This prevents the LLM from deciding Conexus source authority.

## 12. Build and Plan modes

Both modes use the same Project Thread.

### BUILD

Allowed harness capabilities include normal coding tools:

```text
read/list/search/grep/stat
write/edit/create/delete
execute command/process
```

### PLAN

PLAN is read-only:

```text
read/list/search/grep/stat
```

No write/edit/delete/execute capability is available through the coding
Workspace in PLAN mode.

Use native AgentController mode/tool policy after the exact 1.63.2 probe proves
it. Do not build a new `builder.plan` owner for ordinary chat.

## 13. Tasks and live activity

Mastra Session/display state already exposes task/tool/activity facts.

The ordinary UI should project them directly when useful.

Do not create a new durable task/checklist engine for P-01.

Historical Plan/WorkUnit state remains legacy only.

## 14. Streaming and reconnect

Target split:

```text
HISTORY = persistent Mastra Thread/messages
LIVE    = native Mastra Session events
Hub     = thin authenticated Project-scoped adapter
```

The C-020 path does not persist a second event stream.

On browser reconnect:

```text
GET Builder Session
→ persisted messages from Mastra
→ active/latest BuilderRun from Conexus
→ Project working source
→ last-good Preview

live stream
→ only current Session events
```

The existing custom Change observation feed is legacy and should leave the
ordinary path after caller migration.

## 15. Product API boundary

Do not expose the broad Mastra Server/Client resource API directly as the Conexus
Product contract.

Conexus keeps a small security/Product facade:

```text
GET  /api/control/projects/:projectId/builder-session
POST /api/control/projects/:projectId/builder-session/messages
GET  /protocol/projects/:projectId/builder-session/stream
```

The browser knows `projectId`, user content, mode and Idempotency-Key.

The browser does not choose:

```text
threadId
resourceId
Mastra controller/session ID
Git revision
model ID
sandbox ID
BuilderRun base source
```

Those are server-derived from current authority.

## 16. Automatic build and Preview

The ordinary C-020 path does not use `PreviewPreparationCoordinator` or
`CHANGE_CANDIDATE` admission.

Flow:

```text
SOURCE_CHANGED B
→ working source CAS to B
→ compile exact B
```

If compilation succeeds:

```text
retain ArtifactRevision(Project, B)
→ last-good Preview = artifact(B)
→ BuilderRun = SUCCEEDED / SOURCE_CHANGED
```

If compilation fails:

```text
working source remains B
last-good Preview remains previous artifact A
BuilderRun terminal result = SOURCE_CHANGED_BUILD_FAILED
```

The next BUILD request starts from B and can repair it.

`RESPONSE_ONLY` changes neither source nor Preview and creates no empty commit or
compiler invocation.

Compiled means technically executable, not independently verified.

## 17. Compiler

The application compiler must not require Change semantics.

Target correlation:

```text
projectId
executionId
sourceRevision
files
```

During migration, legacy Change callers may pass `executionId = changeId` and
C-020 passes `executionId = builderRunId`.

`executionId` is correlation/provenance only; Project + source revision remains
the application subject.

## 18. Registry / ArtifactRevision

Application artifact admission for C-020 is source/run based, not
Change/Plan/Acceptance based.

Required facts:

```text
current authorized Project build context
BuilderRun belongs to Project
run's admitted/result source matches exact compile source
payload validates against compiler/profile contract
ArtifactRevision identity is Project + source revision + immutable digest
```

BuilderRun is provenance, not artifact identity.

Historical Change-verified retention remains available to legacy callers until
migration completes.

## 19. Project creation

Internal MVP experience:

```text
Create Project
→ Build
→ composer ready
```

Manual Inception/Baseline review is not an ordinary prerequisite for beginning
Builder work.

Do not delete the broader Inception/Baseline architecture in this refactor. Use
the smallest deterministic bootstrap required by current Project contracts.

## 20. Legacy disposition

For ordinary new work:

```text
Change                    FROZEN LEGACY
Plan                      FROZEN LEGACY
WorkUnit                  FROZEN LEGACY
ActorRun                  FROZEN after useful execution invariants move to BuilderRun
CodingSession             DELETE/FREEZE after callers migrate
recentTurns               DELETE
custom conversation state DELETE
custom task/checklist      DELETE from ordinary path
custom Change observation DELETE from ordinary path
PreviewPreparation        LEGACY
CHANGE_CANDIDATE build    LEGACY
sourceChangeId            DELETE from ordinary path
workingChangeId           DELETE from ordinary path
lastPreviewChangeId       DELETE from ordinary path
```

Deletion order is always:

```text
new path
→ migrate callers
→ prove no new legacy writes
→ freeze legacy API
→ delete implementation/schema only when no accepted consumer remains
```

Historical migrations and Evidence remain unchanged.

## 21. Migration discipline

Migration `028_builder_run.sql` was first published in commit `371e006` and was
then modified in `8ebbc8c` while the database was disposable.

Before adding further migrations, normalize discipline:

1. restore `028_builder_run.sql` and its runner digest to the first published
   `371e006` bytes;
2. reset only the disposable local test database if necessary;
3. all further C-020 schema evolution begins in `029_*` forward migrations.

No published migration is edited again after this normalization.

## 22. Verification strategy

Use proof matching the claim.

### Mastra qualification

Prove the three exact remaining assumptions in §4.1.

### Database/store

Prove:

- same Idempotency-Key + same request returns the same BuilderRun;
- same key + different request conflicts;
- one active BUILD run per Project;
- terminal settlement clears active execution honestly;
- ordinary C-020 work creates zero Change rows;
- source/Preview state no longer requires Change coordinates;
- interrupted process state is not falsely reported as success.

### Git custody

Prove:

- exact source bundle from current working source;
- one-commit result;
- protected paths fail closed;
- immutable source ref retained;
- stale settlement cannot replace newer working source.

### Runtime

Prove:

- real Mastra user message ID correlates with BuilderRun;
- persistent Project Thread survives controller/process reconstruction;
- fresh E2B can continue same Project source/thread;
- RESPONSE_ONLY performs no source/build mutation;
- SOURCE_CHANGED uses current working source;
- live Session events are sufficient for P-01 activity.

### Build/Preview

Prove:

- successful source change compiles and advances last-good Preview;
- compile failure leaves attempted source current and previous Preview usable;
- next request repairs failed source;
- retained Preview reopens after restart without needless recompilation.

### Browser acceptance

At minimum:

```text
1. Create/open Project → Build
2. "Crie um contador com Adicionar e Zerar."
3. "Adicione o texto Contagem da equipe abaixo do título."
4. "Como o botão Zerar funciona?" → response-only
5. Reload/restart → same conversation + last-good Preview
6. Continue editing same application
```

No Change IDs or Change chooser appear in the ordinary experience.

## 23. Non-goals

Do not add now:

- persistent Conexus Turn;
- multi-session chooser;
- generic workflow engine;
- new task/plan subsystem;
- duplicate conversation database;
- custom replayable event log;
- direct broad Mastra API exposure to Product clients;
- MCP/RAG/vector search before a concrete need;
- generic app backend platform;
- public SaaS hosting;
- automatic Brain learning;
- mandatory independent model review for ordinary Preview;
- destructive legacy-table deletion before caller migration.

## 24. Reopen triggers

Reopen only the smallest implicated boundary if real evidence proves one of the
following:

- installed Mastra cannot isolate Project Sessions/Workspaces under one shared
  Controller;
- PLAN cannot be made mechanically read-only with the installed harness;
- stable persisted user message identity cannot be correlated safely;
- BuilderRun cannot preserve idempotency/concurrency/restart truth without a
  stronger durable record;
- immutable source custody cannot preserve current protected-path/late-result
  invariants;
- a real business capability requires a new Product semantic owner.

Existing code volume, historical Change schemas or migration history are not
reopen triggers.
