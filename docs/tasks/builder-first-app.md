# First Builder-created app — C-020 slice implementation plan

> **Status:** CURRENT EXECUTION PLAN / OPERATOR REVIEW-GATED
> **Goal:** make the ordinary Builder behave like a simple coding agent over one persistent Project, then prove it with the real composed stack.
> **Architecture:** `docs/reference/builder-c020-mastra-native.md`
> **Status / grant owner:** `docs/roadmap.md`
> **Reviewed implementation baseline:** `a62a5704a2c5bebb26144fa93dd83f1e7c4574f4`

This plan supersedes the previous Task 0–11 execution queue as the current
implementation ordering. Prior work and tests remain useful evidence, but no
previous task number is treated as accepted merely because code exists.

The operator explicitly changed execution governance on 2026-09-14:

```text
plan all slices now
→ authorize one slice
→ Codex implements only that slice
→ Codex stops with evidence
→ GPT reviews against C-020 + slice contract
→ next slice requires explicit authorization
```

Codex must not continue automatically across slice boundaries.

---

## 1. Product outcome

The Builder is ready for operator UX testing only when this real journey works:

```text
create/open Project
→ Build
→ ask for an app
→ actual Preview appears automatically
→ ask for a second edit
→ second edit starts from first edit's source
→ ask a no-code question
→ no source/build mutation
→ reload/restart
→ same conversation + source + last-good Preview
→ continue editing
```

The ordinary path must create `BuilderRun`, not `Change`.

The operator must not administer:

```text
Change
Plan
WorkUnit
ActorRun
CodingSession
candidate hashes
manual Preview preparation
```

---

## 2. Global constraints

Every slice inherits these constraints:

- exact Mastra stack: `@mastra/core 1.63.2`, `@mastra/e2b 0.11.0`, `@mastra/memory 1.28.1`, `@mastra/libsql 1.22.2`;
- use `.agents/skills/mastra/SKILL.md` and exact installed source before guessing Mastra behavior;
- PSTACK/Poteto: subtract before add, fix root cause, reuse native Mastra, preserve Product authority outside framework;
- `BuilderRun` remains the only new durable ordinary execution record;
- one persistent deterministic Project Thread; no Conexus Turn;
- shared `AgentController` + shared `createCodingAgent`;
- fresh Session/Workspace/E2B per BuilderRun;
- host-controlled canonical result commit;
- immutable C-020 source refs `refs/conexus/sources/<oid>`;
- `working source != last-good Preview` is allowed and required after failed build;
- no new ordinary `builder.change` row;
- no edit to published migrations 028–036; schema changes are forward-only;
- no new Brain/Sankhya work before the core composed journey is accepted;
- historical R1/R2/RB audits remain explicit, not current mandatory stage choreography;
- do not modify `.audit/` or preserved untracked build directories;
- do not merge `main` without explicit operator authority.

### Review protocol

At the end of every authorized slice Codex must stop and return:

```text
HEAD
files changed
exact behavior implemented
focused tests run + result
npm/typecheck/wire checks relevant to the slice
known limitations
explicit statement that next slice was NOT started
```

GPT then reviews the actual Git diff before the next slice is authorized.

---

# Slice 0 — Planning / authority reconciliation

**State:** COMPLETE by GPT / documentation-only

**Purpose:** remove the previous auto-continue ambiguity and establish one
current architecture owner, one slice execution owner and one mutable status
owner.

**Owners:**

```text
docs/reference/builder-c020-mastra-native.md  architecture/spec
docs/tasks/builder-first-app.md               slice plan
docs/roadmap.md                               status/grant/next action
docs/decisions/index.md                       C-020 decision identity
```

Historical `builder-and-harness.md` and locked P-01 mechanism wording remain
historical where they conflict with C-020. Their accepted Product experience
intent remains valid.

**Exit:** Slice 1 may be planned and sent separately. No code is authorized by
Slice 0 itself.

---

# Slice 1 — Source continuity: real A → B → C

## Goal

Make C-020 source custody genuinely source-native so the second and third
Builder requests continue from the exact current working source.

This slice changes **Git/source mechanics only**. It does not change Product API,
Mastra session UX, Preview UI or Brain.

## Current defect

Current ordinary code retains results under `refs/conexus/sources/<oid>` but
still reaches legacy Change-oriented helpers underneath. `prepareSource()` can
fall back to a Project bundle path that requires `refs/heads/main` to equal the
requested source. After `A → B`, working source is B while main can remain A,
so the next run can fail to materialize B.

The legacy ownership rule can also reject later edits to an `app/**` file that
was created by the previous BuilderRun because that file did not exist in the
original static ownership manifest.

## Files

Primary:

- `apps/hub/src/builder/source.ts`
- `apps/hub/src/builder/service.ts` only if call signatures need adaptation
- `tests/implementation/builder-working-source-runtime.test.mjs`

No database migration in this slice.

## Target interface

The ordinary C-020 path must use execution/source vocabulary only, conceptually:

```ts
prepareProjectSource({
  projectId,
  executionId,
  sourceRevision,
}): Promise<Uint8Array>

admitProjectResult({
  projectId,
  executionId,
  baseSourceRevision,
  claimedResultSourceRevision,
  resultBundle,
}): Promise<{
  baseSourceRevision: string
  resultSourceRevision: string
  patch: string
}>
```

Exact exported names may follow repo convention, but ordinary code must not pass
fake `changeId`, `sourceChangeId`, `workUnitId` or `actorRunId` merely to reuse a
legacy function.

## Source preparation law

For exact source S:

```text
if refs/conexus/sources/S exists and resolves exactly S
    create bundle from refs/conexus/sources/S
else if refs/heads/main resolves exactly S
    create bundle from refs/heads/main
else
    refuse
```

Do not move `refs/heads/main` when Builder working source advances.

## Result admission law

For base A and claimed result B:

```text
A must be exact admitted source
B must be exact bundle result
B must have direct parent A
A..B commit count must equal 1
changed entries must be safe regular app files
patch/bytes/files remain bounded
retain refs/conexus/sources/B exactly
only later DB CAS may make B current
```

### Mutation ownership for the fixed app profile

Ordinary C-020 Builder mutation is exactly:

```text
app/**
```

Files under `app/**` created by an earlier BuilderRun remain editable by later
BuilderRuns.

Anything outside `app/**` is refused in the ordinary C-020 path.
Legacy Change callers retain their legacy ownership-manifest behavior through a
separate adapter until they are deleted.

## Required failing tests first

Add/reshape a real bare-Git test, without mocking the source port, that proves:

```text
main=A
Run1: A→B
  refs/conexus/sources/B=B
  main still A
Run2 prepareSource(B) succeeds
Run2: B→C, modifying at least one app/** file created in B
  refs/conexus/sources/C=C
  main still A
```

Also prove:

- result with two commits is refused;
- wrong parent is refused;
- non-`app/**` mutation is refused;
- unsafe/symlink/submodule behavior remains refused;
- duplicate/stale custody does not silently replace an existing source ref.

## Verification

Run at minimum:

```sh
node --test --test-concurrency=1 tests/implementation/builder-working-source-runtime.test.mjs
node node_modules/typescript/bin/tsc --project apps/hub/tsconfig.json --pretty false
npx --no-install biome check apps/hub/src/builder/source.ts apps/hub/src/builder/service.ts tests/implementation/builder-working-source-runtime.test.mjs
git diff --check
```

## Slice acceptance

PASS only if the real Git fixture proves A→B→C while main remains A and the
ordinary implementation no longer adapts `executionId` into fake Change
coordinates.

**Review gate:** STOP. Do not start Slice 2.

---

# Slice 2 — Source inspection authority + latest-run Diff basis

## Goal

Make Code/Diff inspection read exact C-020 source truth instead of legacy
Baseline/Change lineage, without allowing arbitrary Git OID disclosure.

## Current defect

`builder.admit_source_revision()` still admits only approved Baseline or
Change/WorkUnit lineage. Valid C-020 working/result source can therefore be
refused by real Code/Diff endpoints even if mocked browser tests pass.

## Files

- create `apps/hub/migrations/037_builder_c020_source_inspection.sql`
- modify `scripts/run-hub-migrations.mjs`
- modify/add focused PostgreSQL tests
- modify `apps/hub/src/builder/store.ts` only if projection helpers are required

Do not edit 030–036.

## Admission semantics

After current `project.source.read` authority succeeds, C-020 may admit an exact
source revision only when it equals one of:

```text
ProjectWorkingState.working_source_revision
ProjectWorkingState.last_preview_source_revision
latest relevant BuilderRun.base_source_revision
latest relevant BuilderRun.result_source_revision
```

Then legacy source-read semantics may be used as fallback for legacy callers.

Do not admit an arbitrary OID just because Git contains it.

## Latest code-changing run projection

The Product will later need the latest code-changing run for Diff:

```text
baseSourceRevision
resultSourceRevision
resultKind
```

If the current `read_builder_run` projection is insufficient to distinguish the
latest code-changing run from a later RESPONSE_ONLY run, add the smallest
server-owned read projection here or defer only that projection to Slice 4.
Do not create a new durable record.

## Required tests

Use PostgreSQL current migrations and prove:

```text
working C admitted
last-good B admitted
latest run base B admitted
latest run result C admitted
random unrelated OID refused
other Project's source refused
unauthorized account refused
legacy accepted source remains accepted for its legacy caller
```

Also execute the current migration-install test that proves new Project creation
initializes `ProjectWorkingState`.

## Verification

At minimum:

```sh
node --test --test-concurrency=1 tests/implementation/hub-migration-postgres.test.mjs
# plus the focused source-admission postgres test introduced/extended here
node node_modules/typescript/bin/tsc --project apps/hub/tsconfig.json --pretty false
git diff --check
```

## Slice acceptance

PASS when real backend source inspection can read the C-020 working/Preview/run
sources and refuses unrelated OIDs.

**Review gate:** STOP. Do not start Slice 3.

---

# Slice 3 — Mastra lifecycle, message projection and true PLAN read-only

## Goal

Finish the native Mastra harness correctly without adding Conexus session/chat
machinery.

## Files

- `apps/hub/src/builder/module.ts`
- `apps/hub/src/builder/runtime.ts`
- `apps/hub/src/builder/application-starter.ts`
- `qualification/4d/mastra-builder-capability/probe.test.mjs`
- focused runtime/session tests

## 3.1 Session lifecycle

Keep:

```text
one shared AgentController
one shared createCodingAgent
scope = builder:<builderRunId>
one persistent Project Thread
```

At terminal cleanup call native:

```ts
await controller.deleteSession({
  resourceId: projectId,
  scope: runScope,
})
```

Then destroy E2B/Workspace. Thread/messages remain persisted.

Extend qualification to prove:

```text
sendMessage
→ persisted Thread contains message
→ deleteSession
→ live Session removed
→ same Thread/message still exists
→ new Session with new Workspace binds same Thread
```

Do not create a custom live-session registry.

## 3.2 Product message normalization

Installed Mastra 1.63.2 stores the user message as:

```text
role=signal
type=user
```

BLD-23 projection must map:

```text
signal/user → user
assistant   → assistant
intentional displayable system row → system
other internal signals/tasks/reminders → omit from Product conversation
```

Sort Product conversation chronologically.

Add an integration-level test through the real Session/Memory projection, not a
fabricated JSON fixture.

## 3.3 PLAN end-to-end read-only

Keep the native Mastra PLAN `availableTools` allowlist.

Additionally:

```ts
if (mode === 'BUILD') {
  materializeFixedApplicationStarter(...)
}
```

PLAN must never materialize starter files.

Fresh Project PLAN proof:

```text
no app directory before request
PLAN request
→ RESPONSE_ONLY
→ same working source
→ no canonical source commit
→ no compiler call
```

## 3.4 Shared stable instructions

The shared agent and any temporary legacy adapter must derive from one stable
instruction owner that includes:

```text
work only in exact Session Workspace
ordinary app edits under app/**
fixed REACT_VITE_V1 stack
no dependency/package installation
no platform/generated mutation
no network/credential authority
```

Remove duplicated/drifting ordinary prompt text where practical.

## 3.5 Native tasks

Do not add TaskSignalProvider or a durable task UI in this slice. P-01 does not
need it to prove the coding loop.

## Verification

At minimum:

```sh
npm test --prefix qualification/4d/mastra-builder-capability
# focused runtime/session tests added or extended by the slice
node node_modules/typescript/bin/tsc --project apps/hub/tsconfig.json --pretty false
npx --no-install biome check apps/hub/src/builder/module.ts apps/hub/src/builder/runtime.ts qualification/4d/mastra-builder-capability/probe.test.mjs
git diff --check
```

## Slice acceptance

PASS when Session deletion preserves Thread history, the real Mastra user row
renders as Product `user`, and PLAN cannot mutate source even through host-side
bootstrap.

**Review gate:** STOP. Do not start Slice 4.

---

# Slice 4 — Product API + P-01 Preview/Diff simplification

## Goal

Make the Product surface match the approved experience: app visible by default,
chat on the right, server-owned Preview truth and useful latest-change Diff.

## Files

- `contracts/api/product/builder-paths.yaml`
- generated wire/client projections required by the repo method
- `apps/hub/src/builder/routes.ts`
- `apps/hub/src/builder/module.ts`
- `apps/web/src/features/builder/api.ts`
- `apps/web/src/features/builder/components/project-build.tsx`
- `tests/implementation/builder-browser.test.mjs`
- focused Hub route tests where appropriate

## 4.1 Session response terminology

The backend currently returns the latest run, including terminal runs. Name it:

```text
latestBuilderRun
```

not `activeBuilderRun`.

Run state still tells the UI whether it is active.

## 4.2 Preview summary contract

Exact session Preview summary:

```text
workingSourceRevision
lastGoodSourceRevision
lastGoodArtifactRevisionId
lastGoodArtifactDigest
```

All nullable where no good Preview exists.

The OpenAPI and actual response must match exactly.

## 4.3 Remove ordinary BLD-10 duplication

P-01 already gets current Preview summary from BLD-23.

Remove ordinary `getBuildPreview(projectId)` polling from `ProjectBuild`.
Keep BLD-10 only for remaining accepted legacy/other callers.

## 4.4 Preview launch is server-resolved

Ordinary endpoint remains conceptually:

```http
POST /api/control/projects/:projectId/builder-session/preview
```

The client does not send BuilderRun/source/artifact coordinates.

Server resolves:

```text
authorized Project
→ ProjectWorkingState last-good source/artifact
→ Registry exact artifact
→ MAR route/grant
```

Do not redesign MAR; its existing internal compatibility fields may remain.

## 4.5 Preview is automatic and dominant

When a last-good Preview exists:

```text
Build screen loads
→ launch Preview automatically
→ iframe renders actual app
```

No mandatory `Abrir Preview` button.
Optional secondary `Nova aba` is allowed.

Move source/artifact technical IDs to `Detalhes`.

## 4.6 Diff semantics

Primary Diff basis is the latest code-changing BuilderRun:

```text
baseSourceRevision → resultSourceRevision
```

Use Slice-2 source-read authority to read both exact revisions.

States:

```text
latest code-changing run exists → compare base/result
latest request RESPONSE_ONLY    → state clearly that request changed no source
no code-changing run yet        → honest empty state
```

Do not use working source vs last-good Preview as the primary Diff.

## 4.7 Browser contract test

Keep Playwright mocking for this test. It is a UI/contract test, not live
composed proof.

Prove:

```text
Preview iframe appears automatically when last-good exists
no BuilderRun/internal label in ordinary surface
chat messages render correct user/assistant roles
BUILD/PLAN controls work
Code reads working source
Diff reads latest run base/result
Details contain technical IDs
reload restores UI from session response
```

## Verification

At minimum:

```sh
node --test --test-concurrency=1 tests/implementation/builder-browser.test.mjs
npm run wire:bundle
npm run wire:builder
npm run wire:bijection
node node_modules/typescript/bin/tsc --project apps/hub/tsconfig.json --pretty false
node node_modules/typescript/bin/tsc --project apps/web/tsconfig.json --pretty false
git diff --check
```

## Slice acceptance

PASS when the Product contract and UI no longer require the browser to echo
Preview authority, the iframe is automatic, and Diff represents the last actual
code change.

**Review gate:** STOP. Do not start Slice 5.

---

# Slice 5 — Subtract premature Brain path + align current verification

## Goal

Remove functionality that entered before its Product proof, and make the current
verification graph prove the C-020 implementation actually being shipped.

## Files

Potentially:

- `apps/hub/src/builder/runtime.ts`
- `apps/hub/src/builder/module.ts`
- `apps/hub/src/server.ts`
- `apps/hub/src/brain/module.ts`
- `apps/hub/src/brain/store.ts`
- `tests/implementation/builder-brain-context.test.mjs`
- `scripts/conexus-verify.mjs`
- repository verification tests

Touch Brain files only to remove Task-10-only additions. Do not alter accepted
general Brain behavior.

## 5.1 Remove pre-query/prompt injection

The ordinary Builder must not do:

```text
every message
→ custom Brain keyword lookup
→ formatBrainContext
→ append business text to prompt
```

Remove:

```text
brainReader from ordinary runtime execution
formatBrainContext ordinary prompt injection
server→Builder brainReader wiring
custom Task-10-only retrieval code if it has no other accepted consumer
```

If the newly added `BrainProjectKnowledgeReader/readProjectKnowledge` has no
accepted consumer after this removal, remove it rather than keep dormant code.

Brain itself remains intact.

## 5.2 Verification graph

Keep the current C-020 candidate-graph philosophy.

Do not reintroduce historical R1/R2/RB stage graphs as mandatory current gates.

Current objective leaves must execute, not merely lint, the important proofs,
including:

```text
hub current migration/PostgreSQL installation
Slice-1 A→B→C source test
Slice-2 source admission test
Slice-3 Mastra lifecycle/PLAN tests
Slice-4 UI/contract test
Registry/compiler/current wire checks
```

Remove `c020-builder-brain` from the current core candidate graph until Task 10
is actually authorized.

## Verification

Run focused verification while editing, then:

```sh
CONEXUS_TEST_DB_HOST=127.0.0.1 \
CONEXUS_TEST_DB_PORT=<current test port> \
CONEXUS_TEST_DB_NAME=conexus_test \
CONEXUS_TEST_DB_USER=postgres \
CONEXUS_TEST_DB_PASSWORD=postgres \
npm run verify
```

Use the actual current disposable PostgreSQL coordinates; do not hard-code a
new port in Product code/docs.

## Slice acceptance

PASS when ordinary Builder has no premature Brain pre-injection and the current
verification graph executes the objective C-020 proofs required by Slices 1–4.

**Review gate:** STOP. Do not start Slice 6.

---

# Slice 6 — Real composed proof + operator-ready checkpoint

## Goal

Prove the simple Product end-to-end with the actual current stack. Do not add
architecture in this slice unless the proof exposes a root-cause defect.

## Reuse existing live harnesses

Do not create a new live-testing framework.

Adapt/reuse existing opt-in live harnesses where useful, especially:

```text
tests/implementation/rb-builder-mastra-e2b-live.test.mjs
existing Builder application/compiler live proof
```

Adapt the Builder live test to the C-020 input (`executionId`, no Change graph).
Keep live model/E2B proof opt-in; it is not a normal offline `npm run verify`
leaf.

## Real Product journey

Run actual local Hub/Web/PostgreSQL/Mastra/model/E2B/Git/compiler/Registry/MAR.
Use a disposable internal Project.

Exact journey:

```text
1. Create a new Project.
2. BUILD: "Crie um contador que comece em 0 com os botões Adicionar e Zerar."
   → actual app appears automatically in Preview.
3. BUILD: "Adicione abaixo do título o texto 'Contagem da equipe'."
   → prior buttons still work and source continuity is A→B→C.
4. BUILD: "Como o botão Zerar funciona?"
   → response only; no source commit and no compile.
5. Reload/restart.
   → same conversation + working source + last-good Preview.
6. BUILD one third visible edit.
   → continues from current source.
```

For the same Project inspect database/source truth and record:

```text
working source before/after each request
last-good Preview source before/after each request
BuilderRun base/result/kind/state
ordinary builder.change rows = 0
```

## Required final checks

- current `npm run verify` green;
- opt-in live model/E2B worker proof green if credentials/authority exist;
- actual Preview app is interactive;
- second and third requests use current source;
- response-only request creates no source/build mutation;
- reload/restart preserves Thread + Preview;
- zero ordinary Change rows.

## Deliverable to operator

Return:

```text
HEAD
exact startup command
exact browser URL
6-step manual test
Mastra versions
working/Preview source transitions
evidence ordinary Change rows = 0
known limitations only
```

## Slice acceptance

PASS only after GPT reviews the code/evidence and the operator is given a real
manual test route.

**Review gate:** STOP. Core C-020 is now ready for operator acceptance, not
implicitly delivered.

---

# Slice 7 — First real Brain-backed build

## Authorization

This slice is **DEFERRED / NOT AUTHORIZED** until Slice 6 is accepted.

## Goal

Prove one real Metal Nobre business rule without copying its formula into the
user prompt.

## Target interaction

Use narrow Mastra-native tools, conceptually:

```text
searchBrain(query)
readBrainItem(itemId)
```

Conexus derives:

```text
Account
Workspace/Project authority
Project Brain binding
admitted Brain revision
provenance
```

The model never chooses tenant authority or credentials.

Do not add MCP/RAG/vector DB unless these direct authorized tools prove
insufficient.

## Acceptance

```text
real accepted rule discovered
revision/digest/provenance preserved
app uses rule
follow-up visual edit preserves rule
missing/ambiguous rule produces honest gap
```

This slice receives its own detailed handoff only after core Builder acceptance.

---

# Slice status register

The mutable state below is mirrored by `docs/roadmap.md`; roadmap wins on current
authorization.

| Slice | Meaning | Current state |
| --- | --- | --- |
| 0 | Planning/authority reconciliation | COMPLETE |
| 1 | Source A→B→C continuity | PLANNED / NEXT, NOT YET AUTHORIZED |
| 2 | Source inspection authority | PLANNED |
| 3 | Mastra lifecycle/message/PLAN | PLANNED |
| 4 | Product API + P-01 Preview/Diff | PLANNED |
| 5 | Remove premature Brain + verify alignment | PLANNED |
| 6 | Real composed proof/operator checkpoint | PLANNED |
| 7 | Real Brain tools/rule | DEFERRED until core acceptance |

---

# Reopen triggers

Do not open a new architecture program for ordinary implementation defects.
Reopen only the smallest implicated C-020 boundary if real evidence proves:

- shared Mastra Controller cannot isolate Projects;
- native Session deletion cannot preserve required Thread continuity;
- PLAN cannot be end-to-end read-only;
- BuilderRun cannot hold required concurrency/idempotency/restart truth;
- source-native custody cannot support real A→B→C while preserving protection;
- a real accepted Product capability cannot fit the existing owner boundary.

Everything else is implementation/correction inside this plan.
