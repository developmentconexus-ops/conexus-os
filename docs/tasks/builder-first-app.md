# First Builder-created app — C-020 implementation plan

> **For agentic workers:** execute this task slice-by-slice with TDD and the
> repository's current engineering method. Do not open a new architecture
> program unless a named C-020 reopen trigger fires.
>
> **Goal:** make the ordinary Conexus Builder behave as a simple coding harness:
> open/create Project → converse → agent edits current source → Preview updates →
> continue the same conversation/source.
>
> **Architecture:** Mastra supplies the coding harness it already owns
> (`AgentController`, `createCodingAgent`, Thread/messages, live Session,
> Workspace tools, modes, tasks/display state and events). Conexus wraps it with
> Project authorization, minimal durable `BuilderRun`, Git/source custody,
> working-source CAS, compiler/ArtifactRevision and last-good Preview.
>
> **Tech stack:** Node 24, TypeScript, Fastify, PostgreSQL, Git, Mastra 1.63.2,
> `@mastra/memory` 1.28.1, `@mastra/libsql` 1.22.2, `@mastra/e2b` 0.11.0, E2B,
> React/Vite frontend.
>
> **Spec:** `docs/reference/builder-c020-mastra-native.md`

Current mutable status and exact next action belong only to
[`docs/roadmap.md`](../roadmap.md).

---

## Outcome and boundary

An authenticated operator can:

```text
create/open Project
→ land in Build
→ request an app or edit
→ watch useful live activity
→ use the compiled Preview
→ ask a no-code question
→ reload/restart
→ continue the same conversation and source
```

The demonstration app is interchangeable. Conexus is the Product.

The ordinary path must not require the operator to understand or administer:

```text
Change
Plan
WorkUnit
ActorRun
CodingSession
Finding/Evidence
candidate hashes
manual Preview preparation
```

### Keep the Product outcome

Preserve these already-proved/useful mechanisms instead of rebuilding them:

- current Project Git/source authority;
- E2B sandbox isolation and physical-incarnation guard;
- `createCodingAgent()` coding tools;
- Mastra persistent Thread/Memory composition;
- response-only detection;
- protected-path and one-result-commit custody checks;
- current React/Vite compiler;
- Registry `ArtifactRevision` retention mechanics;
- Keycloak/Conexus authorization;
- working source distinct from last-good Preview;
- last-good Preview preservation after build failure;
- immutable historical receipts/Evidence.

Do not make Brain, Data, SDK/Sankhya, public hosting, Product Agents or legacy
schema deletion prerequisites for the first working Builder cycle.

---

## Internal pilot refactoring

C-020 is ratified. The Mastra-native realization is defined in
[`docs/reference/builder-c020-mastra-native.md`](../reference/builder-c020-mastra-native.md).

The target model is:

```text
Project
├── Mastra persistent Thread / Messages
├── ProjectWorkingState
│   ├── working source revision/version
│   └── last-good Preview coordinates
└── BuilderRun
    └── one durable physical execution record

Hub process
└── shared AgentController + shared createCodingAgent
    └── per BuilderRun: live Session + fresh Workspace + fresh E2B
```

There is no persistent Conexus Turn.

`Change`, `Plan`, `WorkUnit`, `ActorRun`, `CodingSession`, custom recent-turn
packing, Change observation feed and PreviewPreparation are legacy for the
ordinary path. Migrate callers first; delete only after accepted consumers are
gone.

---

## Current checkpoint

Current remote checkpoint before this plan update:

```text
8ebbc8c fix(verification): separate current projections from R1 history
```

Already present/proved:

- Mastra `1.63.2` + Memory/LibSQL composition;
- deterministic Project thread `conexus-builder:<projectId>`;
- Thread survives controller/storage rebind;
- different physical Workspace/sandbox can bind the same Thread;
- `createCodingAgent` exposes real coding tools;
- response-only vs source-change classification exists;
- migration 027 separates working source from last-good Preview;
- migration 028 introduces a first BuilderRun foundation;
- BLD-23/BLD-24 Product contracts exist;
- current verification no longer requires rewriting historical R1 source pins.

Not yet true:

- shared long-lived AgentController host;
- exact PLAN tool restriction proof;
- real Mastra user-message ID correlation;
- BLD-24 dispatch/settlement;
- no-Change source custody;
- no-Change compiler/Registry admission;
- automatic C-020 Preview settlement;
- native Session-event browser stream;
- P-01 frontend on the new API;
- direct Project → Build entry.

---

# Execution plan

Each task is a verifiable slice. Do not combine later slices merely to reduce
commit count. Use focused checks while iterating; run the current candidate
verification graph when a composed slice is ready.

## Task 0 — Freeze the exact Mastra assumptions

**Files**

- Modify: `qualification/4d/mastra-builder-capability/probe.test.mjs`
- Read: `.agents/skills/mastra/SKILL.md`
- Read exact installed docs/source under `node_modules/@mastra/*`

**Produces**

A green, exact-version proof for the only three Mastra behaviors C-020 still
depends on without repository proof.

### Steps

- [ ] Add a probe with one shared `AgentController` serving Project A and Project
  B with deterministic distinct Threads and distinct physical Workspaces.
- [ ] Assert messages/files/session state from A never appear in B.
- [ ] Add `PLAN` and `BUILD` modes using the exact installed mode/tool policy.
- [ ] Assert PLAN exposes read/list/search/stat mechanics but cannot write/edit/
  delete/execute.
- [ ] Assert BUILD exposes the intended coding mechanics.
- [ ] Subscribe to the Session around `sendMessage()` and capture the real
  persisted user message identifier from the exact 1.63.2 event/message API.
- [ ] Destroy/recreate the Controller and verify the captured message ID exists
  in the persisted Project Thread.
- [ ] Run:

```sh
npm test --prefix qualification/4d/mastra-builder-capability
```

**Gate**

If all three pass, no more Mastra architecture research blocks the core.
If one fails, adjust only that seam and record the exact installed behavior in
`docs/reference/builder-c020-mastra-native.md`.

---

## Task 1 — Normalize migration discipline and finish BuilderRun semantics

**Files**

- Restore: `apps/hub/migrations/028_builder_run.sql` to its first published
  `371e006` bytes
- Modify: `scripts/run-hub-migrations.mjs` to restore the matching 028 digest
- Create: `apps/hub/migrations/029_builder_run_execution.sql`
- Modify: `tests/implementation/hub-migration-selection.test.mjs`
- Add/modify focused BuilderRun PostgreSQL tests

**Produces**

A forward-only durable execution ledger and Project working state that no longer
requires Change coordinates for C-020.

### Target BuilderRun semantics

`029` must add/evolve the minimal durable facts required by the spec:

```text
request_digest
trigger_message_id nullable until bound
base_source_revision
base_working_version
model admission coordinates at claim
sandbox_id
terminal timestamps/failure
```

Keep states small:

```text
QUEUED | RUNNING | SUCCEEDED | FAILED | INTERRUPTED
```

Keep result kind separate:

```text
RESPONSE_ONLY | SOURCE_CHANGED | SOURCE_CHANGED_BUILD_FAILED
```

### Steps

- [ ] Restore 028 and runner digest exactly; never edit 028 again.
- [ ] Reset only the disposable local PostgreSQL if its applied 028 checksum no
  longer matches the restored migration.
- [ ] Write failing PostgreSQL tests for same-key/same-request replay and
  same-key/different-request conflict.
- [ ] Add `request_digest`; calculate it over canonical `mode + content` at the
  Hub boundary.
- [ ] Change BuilderRun admission so PostgreSQL locks/reads
  `project_working_state` and records the current source/version atomically.
  The route must not pre-read Preview and pass an expected Git OID.
- [ ] Make `trigger_message_id` nullable until the real persisted Mastra message
  ID is observed and bound.
- [ ] Add narrow SQL functions/store calls for:

```text
create/admit run
claim run
bind message
bind physical sandbox
settle response-only
settle source-changed
settle build success
settle build failure
fail/interruption
read current/latest run
```

- [ ] Relax legacy `project_working_state` constraints so the C-020 working
  source and last-good Preview do not require `working_change_id`,
  `current_change_id`, `last_preview_change_id` or preparation attempt state.
- [ ] Do not drop legacy columns yet.
- [ ] Prove one active write-capable BUILD run per Project.
- [ ] Prove terminal settlement cannot leave an active owner behind.
- [ ] Prove ordinary C-020 admission creates zero `builder.change` rows.

**Focused verification**

```sh
node --test --test-concurrency=1 tests/implementation/hub-migration-selection.test.mjs
# plus the focused BuilderRun/PostgreSQL test file introduced or extended here
```

---

## Task 2 — Make Git custody source-oriented, not Change-oriented

**Files**

- Modify: `apps/hub/src/builder/source.ts`
- Modify/add: focused source/Git custody tests
- Preserve legacy adapters temporarily for Change callers

**Produces**

One execution-generic source interface that preserves the current strong custody
invariants without `changeId`, `sourceChangeId`, `workUnitId` or `actorRunId` in
the C-020 path.

### Target interface

The C-020 core needs conceptual operations equivalent to:

```text
prepareSource(projectId, sourceRevision)
admitResult(projectId, executionId, baseSourceRevision,
            claimedResultRevision, resultBundle)
```

The result is retained under an immutable source-identity ref:

```text
refs/conexus/sources/<resultSourceRevision>
```

### Steps

- [ ] Write a failing test showing a valid BuilderRun result can be admitted
  without creating/reading a Change ref.
- [ ] Preserve exact-base, direct-parent, one-commit, protected-path,
  regular-file, byte-limit and bundle validation from the existing implementation.
- [ ] Materialize source bundles from immutable source identity/main bootstrap,
  not `sourceChangeId`.
- [ ] Retain admitted result under `refs/conexus/sources/<oid>` before database
  working-state settlement.
- [ ] Prove the retained ref resolves to exactly that OID.
- [ ] Prove stale/late PostgreSQL settlement cannot make the retained-but-stale
  source authoritative.
- [ ] Keep a thin legacy adapter for `refs/conexus/changes/*` only while legacy
  Change callers still exist.

---

## Task 3 — Build one native Mastra harness host

**Files**

- Modify: `apps/hub/src/builder/module.ts`
- Modify: `apps/hub/src/builder/runtime.ts`
- Add/split a focused harness-host file only if it materially reduces the
  current `runtime.ts` responsibility
- Modify/add runtime tests

**Produces**

One shared Mastra coding host and one execution-generic coding function reused by
C-020 and temporarily by legacy Change adapters.

### Host lifetime

At Builder module startup:

```text
persistent storage/memory
→ shared createCodingAgent(workspace: undefined)
→ shared AgentController
→ controller.init()
```

Per BuilderRun:

```text
fresh E2B
→ fresh Workspace
→ controller.createSession({
     resourceId: projectId,
     threadId: deterministic Project thread,
     workspace,
     mode
   })
→ native subscribe
→ send real user message
→ destroy per-run Workspace/E2B
```

Do not recreate `createCodingAgent`/AgentController for every ordinary request.
Controller recreation after Hub restart remains supported.

### Runtime input

Replace the C-020 dependency on:

```text
changeId
workUnitId
actorRunId
sourceChangeId
recentTurns
correctionFindings
```

with an execution-generic input containing only Project/execution/source/user
request/runtime facts.

### Steps

- [ ] Write failing test for two sequential BuilderRuns reusing one Controller
  and one Project Thread while using different physical E2B Workspaces.
- [ ] Create the shared coding agent with the existing model, instructions and
  no host-local fallback.
- [ ] Move Workspace injection to Session creation.
- [ ] Use native PLAN/BUILD mode selection from Task 0.
- [ ] Remove `recentTurns` from the ordinary path.
- [ ] Remove legacy Change/WorkUnit/ActorRun identifiers from the model prompt.
- [ ] Send only the real user content plus minimal stable system instructions.
- [ ] Capture/bind the real persisted user message ID to the BuilderRun.
- [ ] Continue using host-controlled final diff detection and canonical result
  commit/bundle creation.
- [ ] Return only:

```text
RESPONSE_ONLY(summary)
SOURCE_CHANGED(resultSourceRevision, resultBundle, summary)
```

plus execution correlation needed by the host.
- [ ] Prove sandbox physical-incarnation guard still fails closed.

---

## Task 4 — Compose BuilderRun dispatch and settlement

**Files**

- Modify: `apps/hub/src/builder/service.ts`
- Modify: `apps/hub/src/builder/store.ts`
- Add/modify focused service/store tests

**Produces**

BLD-24 no longer leaves an orphan `QUEUED` BuilderRun. A message becomes a real
execution and always reaches an honest terminal state.

### Target orchestration

```text
SendBuilderMessage
→ admit BuilderRun
→ dispatch run
→ claim run
→ execute native Mastra/E2B coding session
→ RESPONSE_ONLY
   OR
   admit Git result + CAS working source
→ automatic build if source changed
→ settle Preview/result
→ terminal BuilderRun
```

### Steps

- [ ] Replace `createBuilderRun: store.createBuilderRun()` pass-through with
  actual dispatch.
- [ ] Key in-process active work by `builderRunId`, not Change ID.
- [ ] On restart, mark non-resumable process-local active runs `INTERRUPTED`
  unless exact installed Mastra evidence proves a safe resumable execution.
  Do not invent automatic paid-work replay.
- [ ] Same idempotent replay must not dispatch duplicate model/E2B work.
- [ ] RESPONSE_ONLY settles success without Git source mutation or compile.
- [ ] SOURCE_CHANGED first admits immutable Git source, then compare-and-sets
  Project working source/version.
- [ ] Late/stale result fails settlement and never changes working source.
- [ ] Any unexpected runtime error terminally fails/interupts the run and clears
  active ownership.

---

## Task 5 — Remove Change from compiler/Registry/Preview admission

**Files**

- Modify: `apps/hub/src/builder/application-artifact-runtime.ts`
- Modify: `apps/hub/src/builder/application-build.ts`
- Modify Registry application-artifact adapter/store as required
- Create: `apps/hub/migrations/030_*` only if 029 cannot truthfully contain the
  Registry forward admission without mixing independently testable concerns
- Modify/add Registry/compiler/Preview tests
- Leave `preview-preparation.ts` as legacy until old callers migrate

**Produces**

Exact Project source can compile, retain and become last-good Preview without a
Change/Plan/Acceptance subject.

### Steps

- [ ] Generalize compiler correlation from `changeId` to `executionId`.
- [ ] Keep compiler subject authority as `projectId + sourceRevision`; execution
  ID is correlation/provenance only.
- [ ] Add a C-020 build path that reads exact app files from the admitted source
  revision and does not call `readPreviewSubject(...CHANGE_CANDIDATE...)`.
- [ ] Add Registry admission for exact authorized BuilderRun/result source.
- [ ] Preserve payload shape, template/profile pinning, file/media/hash/size
  validation and immutable `ArtifactRevision` identity.
- [ ] Do not manufacture Change/Plan/change_acceptance to satisfy the old
  Registry function.
- [ ] On compile success, settle:

```text
last_preview_source_revision
last_preview_artifact_revision_id
last_preview_artifact_digest
```

- [ ] On compile failure, keep the newly admitted working source but leave the
  previous Preview coordinates unchanged.
- [ ] Prove the next BuilderRun starts from the failed-build source and can repair
  it.
- [ ] Do not route C-020 through `PreviewPreparationCoordinator`.

---

## Task 6 — Make BLD-23/BLD-24 the real session API

**Files**

- Modify: `apps/hub/src/builder/routes.ts`
- Modify: `apps/hub/src/builder/module.ts`
- Modify: `contracts/api/product/builder-paths.yaml` only where current schemas
  do not match the final C-020 contract
- Modify wire/checker tests together with contract changes

**Produces**

A minimal Project-scoped API that does not leak Mastra or Git mechanics.

### GET session

Return only Product-useful state:

```text
projectId
messages
active/latest BuilderRun summary
mode
working-source status as needed by UI, not raw authority controls
last-good Preview summary
```

Do not expose `threadId` merely because Mastra has one.

### POST message

Input:

```text
content
mode = BUILD | PLAN
Idempotency-Key
```

Server derives:

```text
Account
Project authority
threadId/resourceId
working source/version
model admission
```

The browser never supplies a Git OID, BuilderRun base source, thread ID,
controller/session ID, model ID or sandbox ID.

### Steps

- [ ] Remove route pre-read `readPreviewSubject → expectedSourceRevision`.
- [ ] Calculate canonical request digest and admit the run server-side.
- [ ] Send the actual user content through the Mastra Session.
- [ ] Correlate the persisted real message ID to the BuilderRun.
- [ ] BLD-23 hydrates messages from the Mastra Thread and Preview from
  ProjectWorkingState/Registry truth.
- [ ] Remove `activeTurn`/Change lookup from session hydration.

---

## Task 7 — Replace Change observation with native Session events

**Files**

- Modify: Builder routes/module/runtime event adapter
- Delete or freeze ordinary-path callers of:
  `observation-feed.ts`, `observeChange()` and Change-scoped protocol stream
- Add stream/reconnect tests

**Produces**

```text
history = persistent Mastra messages
live = native Session events
```

### Steps

- [ ] Add one authenticated Project-scoped stream endpoint for the currently
  active Builder Session/run.
- [ ] Adapt native Mastra Session events only enough to make them safe/stable for
  the Conexus web client; do not create a second durable event owner.
- [ ] On reconnect, re-fetch BLD-23 and continue live subscription; do not replay
  a custom Change feed.
- [ ] Preserve useful text/tool/task status without exposing chain-of-thought.
- [ ] Prove reconnect restores persisted history and truthful current run/Preview
  even if live events were missed.

---

## Task 8 — P-01 Builder frontend

**Files**

- Modify: `apps/web/src/features/builder/api.ts`
- Modify: `apps/web/src/features/builder/components/project-build.tsx`
- Modify: `apps/web/src/features/builder/components/builder-conversation.tsx`
- Modify: `apps/web/src/styles.css`
- Modify route/shell only if required by the already-approved P-01 composition

**Produces**

Preview-dominant Builder with continuous chat, Build/Plan and progressive
technical inspection.

### Ordinary layout

```text
┌───────────────────────────────┬──────────────────────┐
│ Preview / Code / Diff         │ Conexus              │
│                               │ persisted messages   │
│ current/last-good app         │ live tool/tasks      │
│                               │ Build | Plan         │
│                               │ composer             │
└───────────────────────────────┴──────────────────────┘
```

### Steps

- [ ] Migrate frontend reads/writes to BLD-23/BLD-24.
- [ ] Remove Change chooser/list as ordinary navigation.
- [ ] Remove permanent Plan/Findings/Evidence/Activity-of-Changes panels.
- [ ] Keep Code/Diff/Details as on-demand inspection.
- [ ] Render Markdown instead of raw `**...**` text.
- [ ] Render native streaming/tool/task activity compactly in conversation.
- [ ] Show honest states:

```text
working
build succeeded
build failed; previous Preview still available
response-only
```

- [ ] Do not show redundant `Abrir Preview` when Preview is already active;
  optional `Nova aba` may remain.
- [ ] Do not add Agent Studio, agent administration or new generic surfaces.

### Browser acceptance

Use a real authenticated browser journey:

```text
1. Open/create Project.
2. "Crie um contador com os botões Adicionar e Zerar."
3. Preview works.
4. "Adicione o texto Contagem da equipe abaixo do título."
5. Existing behavior remains and Preview updates automatically.
6. "Como o botão Zerar funciona?" → answer only, no commit/build.
7. Reload → same conversation + last-good Preview.
8. Continue editing the same app.
```

---

## Task 9 — Project creation lands directly in Build

**Files**

- Modify Project create/open routing and smallest implicated Project bootstrap
- Preserve broader Inception/Baseline infrastructure unless an accepted caller is
  actually removed

**Produces**

```text
Create Project
→ Build
→ composer ready
```

### Steps

- [ ] Determine the smallest deterministic Project source/readiness bootstrap
  already admitted by current Project contracts.
- [ ] Remove manual Inception/Baseline approval as an ordinary Builder entry
  prerequisite.
- [ ] Do not fabricate a model-generated Baseline merely to satisfy old plumbing.
- [ ] Browser-test a brand-new Project from creation through first Builder
  message and Preview.

---

## Task 10 — First real Brain-backed build

Start this task as soon as Tasks 0–9 provide a usable create/open/continue cycle.
Do not wait for complete legacy deletion.

**Goal**

A request such as:

```text
Crie uma calculadora usando nossa regra de comissão dos parceiros.
```

must not repeat the formula in the prompt.

### Boundary

Use the smallest authorized direct Mastra tools first, conceptually:

```text
searchBrain(query)
readBrainItem(itemId)
```

Conexus derives Workspace/Project/current Brain binding and permitted revision
server-side. The model never chooses tenant authority or credentials.

### Proof

- [ ] One accepted real Metal Nobre rule is discovered and used.
- [ ] Provenance/revision is preserved.
- [ ] A follow-up edit keeps the same rule.
- [ ] A missing/ambiguous rule produces an honest gap instead of invention.
- [ ] Do not add MCP/RAG/vector DB unless this simple read path proves
  insufficient.

---

## Task 11 — Legacy caller cleanup

Only after the C-020 path and P-01 work in the browser.

### Steps

- [ ] Prove ordinary BLD-24 creates zero Change rows.
- [ ] Remove frontend callers of `listChanges`, `getChange`, Change Plan,
  Findings/Evidence and `observeChange`.
- [ ] Freeze old Change write APIs from new ordinary use.
- [ ] Remove legacy runtime adapters only after no accepted caller remains.
- [ ] Drop schema/tables only in a separately proved forward migration and only
  after historical/read consumers are gone.

Legacy deletion is cleanup, not a prerequisite for operator testing.

---

# Cross-slice acceptance

The Builder core is ready for operator testing only when all of these are true:

- [ ] One Project has one persisted Mastra Thread.
- [ ] One shared AgentController can serve Projects without bleed.
- [ ] PLAN is mechanically read-only; BUILD can edit/execute.
- [ ] No Conexus Turn table/API/state owner exists.
- [ ] Ordinary requests create BuilderRun, not Change.
- [ ] Idempotent replay does not duplicate paid work.
- [ ] Same key + different content conflicts.
- [ ] Real persisted Mastra user message ID is correlated to BuilderRun.
- [ ] RESPONSE_ONLY creates no source commit/build.
- [ ] Successful edit advances working source.
- [ ] Source custody preserves protected paths and one-commit result invariants.
- [ ] Late result cannot overwrite newer working source.
- [ ] Successful compile advances last-good Preview automatically.
- [ ] Failed compile keeps attempted source for repair and previous Preview
  usable.
- [ ] Restart/reopen restores conversation/source/Preview truth without
  inventing completion or needless recompilation.
- [ ] Change is absent from ordinary API/UI vocabulary.
- [ ] New Project can start Build without manual Inception.
- [ ] P-01 browser journey is reproducible.

---

# Verification commands

Use the smallest applicable leaves while developing. At composed checkpoints,
run at least:

```sh
npm test --prefix qualification/4d/mastra-builder-capability
npm run r1:s2:hub:typecheck
npm run r1:a0:web:typecheck
npm run wire:bundle
npm run wire:builder
npm run wire:bijection
npm run test:repository
npm run verify
```

Add the focused BuilderRun/source/runtime/Registry/browser test commands created
by the corresponding tasks.

`r1:history:foundation-pins` is an explicit historical audit and is not a
current C-020 blocker. Do not rewrite historical receipts/digests to make it
green against current owners.

---

# Throughput / execution rules

- Work automatically within the current internal-pilot grant.
- Prefer deletion/adaptation over a new abstraction.
- Before creating any Conexus mechanism, ask whether Mastra 1.63.2 already owns
  the behavior.
- Keep Product authority outside Mastra even when Mastra supplies mechanics.
- Fix root causes, not endpoint/UI symptoms.
- Do not redesign P-01 while the core path is still Change-dependent.
- Do not stop per file.
- Stop only on a named reopen trigger, missing external authority, or destructive
  non-disposable effect risk.
- Checkpoint on the current analysis branch as appropriate; never merge `main`
  without explicit operator authority.

At the first composed return after Tasks 6–8, report:

```text
exact local startup command
exact browser URL
five-step manual test
Mastra versions actually used
proof ordinary BLD-24 creates zero Change rows
proof reload/restart preserves Thread + last-good Preview
known remaining limitations
```
