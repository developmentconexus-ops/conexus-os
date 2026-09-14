# First Builder-created app — C-020 slice implementation plan

> **Status:** CURRENT EXECUTION PLAN / OPERATOR REVIEW-GATED
> **Goal:** make the ordinary Builder behave like a simple coding agent over one persistent Project, remove the superseded Change-era Builder, then prove the real composed product.
> **Architecture:** `docs/reference/builder-c020-mastra-native.md`
> **Status / grant owner:** `docs/roadmap.md`
> **Accepted implementation checkpoints:** Slice 1 `e56dcec3c6125bd1d812a6645ded5a35418118ad`; Slice 2 `df762d525d27b4aaf85d4de5ba5fa1fe2e806958`

This plan supersedes the previous Task 0–11 queue and the earlier 0–7 slice ordering.

The operator requires a one-slice-at-a-time review loop:

```text
plan all slices
→ authorize exactly one slice
→ Codex implements only that slice
→ focused proof + commit/checkpoint
→ STOP
→ GPT reviews actual diff/evidence
→ next slice requires explicit authorization
```

Codex must not continue automatically across slice boundaries.

---

## 1. Product outcome

Core Builder is ready for operator UX testing only when this real journey works:

```text
create/open Project
→ Build
→ persistent Project conversation
→ ask for app
→ app appears automatically in Preview
→ ask for second edit
→ second edit starts from exact current source
→ ask no-code question
→ no source/build mutation
→ reload/restart
→ same conversation + working source + last-good Preview
→ continue editing
```

The ordinary path uses:

```text
Project
Mastra Thread/Messages
BuilderRun
ProjectWorkingState
immutable source refs
ArtifactRevision / last-good Preview
```

The final current runtime must **not** retain a parallel Change-era Builder architecture.

---

## 2. Global constraints

Every slice inherits:

- exact Mastra stack: `@mastra/core 1.63.2`, `@mastra/e2b 0.11.0`, `@mastra/memory 1.28.1`, `@mastra/libsql 1.22.2`;
- read `.agents/skills/mastra/SKILL.md` and exact installed source before guessing Mastra behavior;
- PSTACK/Poteto: subtract before add, fix root cause, one authority per concept, prefer native framework mechanics;
- `BuilderRun` is the only new durable ordinary execution record;
- one deterministic persistent Mastra Thread per Project; no Conexus Turn;
- one shared `AgentController` + one shared `createCodingAgent`;
- fresh Session/Workspace/E2B per BuilderRun;
- host owns canonical result commit and source admission;
- immutable source refs: `refs/conexus/sources/<oid>`;
- working source and last-good Preview may intentionally differ after build failure;
- ordinary path creates zero new `builder.change` rows;
- published migration bytes are immutable; schema cleanup is forward-only;
- no Brain/Sankhya product expansion before the core composed journey is accepted;
- historical R1/R2/RB evidence is not current stage choreography;
- preserve `.audit/` and existing untracked build directories;
- no merge to `main` without operator authority.

### Subtraction law

The final codebase must not keep two Builders merely for compatibility.

```text
migrate accepted caller
→ prove caller moved
→ delete dead runtime/API/schema surface
```

Published migrations remain as immutable upgrade history, but dead current tables,
functions, routes, types and runtime branches are removed by a forward cleanup migration
and code deletion once the last accepted caller is gone.

---

# Slice 0 — Planning / authority reconciliation

**State:** COMPLETE

Established canonical owners and the review-gated execution protocol.

---

# Slice 1 — Source-native A → B → C continuity

**State:** PASS

**Accepted implementation:** `e56dcec3c6125bd1d812a6645ded5a35418118ad`

Accepted invariants:

```text
main=A
A→B retained as refs/conexus/sources/B
B→C starts from exact B
refs/conexus/sources/C=C
canonical main remains A
transport bundle exposes requested source through temporary refs/heads/main
ordinary mutation boundary = app/**
legacy Change custody no longer used by ordinary BuilderRun
```

Do not redesign Slice 1 unless real evidence violates these invariants.

---

# Slice 2 — C-020 source inspection authority

**State:** PASS

**Accepted implementation:** `df762d525d27b4aaf85d4de5ba5fa1fe2e806958`

Migration 037 established current source-read authority for:

```text
working source
last-good Preview source
latest code-changing BuilderRun base
latest code-changing BuilderRun result
```

and added a minimal latest-code-changing projection so a later `RESPONSE_ONLY`
request does not erase the useful Diff basis.

Arbitrary/stale unrelated OIDs remain refused.

Migration 037 still contains a legacy Baseline/Change fallback only as temporary
compatibility debt. Slice 5 removes it after final caller migration.

---

# Slice 3 — Mastra lifecycle, message projection and true PLAN read-only

**State:** PASS / CLOSED

**Accepted checkpoint:** `58d53fa908eb954bc6cb756a706f377eba8fe53b`

The exact production-shaped `Memory.recall` proof is green. The real
`Session.sendMessage` operator row is recalled as `role=signal`, `type=user`
and projects to Product `user`; assistant, internal signal and empty-row
behavior also pass. Native Session deletion, persistent Thread continuity,
PLAN read-only behavior and shared instructions remain accepted.

## Goal

Finish the native Mastra harness correctly without adding Conexus session/chat
machinery.

## Primary files

```text
apps/hub/src/builder/module.ts
apps/hub/src/builder/runtime.ts
apps/hub/src/builder/application-starter.ts
qualification/4d/mastra-builder-capability/probe.test.mjs
focused runtime/session tests
```

## 3.1 Session lifecycle

Keep:

```text
shared AgentController
shared createCodingAgent
scope = builder:<builderRunId>
persistent Project Thread
fresh Workspace/E2B per run
```

At terminal cleanup use native:

```ts
await controller.deleteSession({ resourceId: projectId, scope: runScope })
```

Then destroy physical sandbox/workspace. Do not delete Thread/messages.

Qualification must prove:

```text
sendMessage
→ persisted Thread contains message
→ deleteSession
→ live Session removed
→ persisted Thread/message remain
→ new Session with new Workspace binds same Thread
```

Do not create a custom durable/live Session registry.

## 3.2 Product message projection

Exact installed Mastra behavior already proved:

```text
user message: role=signal, type=user
```

Project conversation projection:

```text
signal/user → user
assistant → assistant
intentional Product system row → system
other internal signals/tasks/reminders → omit
```

Sort chronologically.

The test must use real Session/Memory persistence, not fabricated message JSON.

## 3.3 PLAN end-to-end read-only

Native PLAN `availableTools` remains the mutation control inside Mastra.

Host bootstrap must also be read-only:

```ts
if (mode === 'BUILD') {
  materializeFixedApplicationStarter(...)
}
```

Fresh Project PLAN proof:

```text
no app directory before
PLAN request
→ RESPONSE_ONLY
→ working source unchanged
→ no canonical result commit
→ no compiler call
```

## 3.4 Shared stable instructions

Ordinary shared coding agent instructions must have one owner and include:

```text
work only in exact Session Workspace
ordinary app edits under app/**
fixed REACT_VITE_V1 stack
no package/dependency installation
no platform/generated mutation
no network/credential authority
```

Do not build native task UX merely because Mastra supports tasks.

## Slice 3 acceptance

PASS when:

```text
deleteSession preserves persistent Thread continuity
real Mastra user row projects as Product user
internal signals do not pollute chat
PLAN cannot mutate through tools or host starter
shared instructions do not drift across ordinary paths
```

**Review gate:** CLOSED. Slice 4 is the current authorized implementation slice.

---

# Slice 4 — Product API + P-01 Preview/Diff simplification

**State:** PASS / CLOSED

Accepted checkpoint: `e644958c90c3a76a4d820842034059e145d1fcf3`.

## Goal

Make the Product surface match the approved experience and migrate the final
ordinary Product callers off Change-era surfaces.

## Primary files

```text
contracts/api/product/builder-paths.yaml
generated wire/client projections required by repo method
apps/hub/src/builder/routes.ts
apps/hub/src/builder/module.ts
apps/web/src/features/builder/api.ts
apps/web/src/features/builder/components/project-build.tsx
tests/implementation/builder-browser.test.mjs
focused Hub route tests
```

## 4.1 Session contract

Rename the misleading projection:

```text
activeBuilderRun → latestBuilderRun
```

BLD-23 Preview summary is exactly:

```text
workingSourceRevision
lastGoodSourceRevision
lastGoodArtifactRevisionId
lastGoodArtifactDigest
```

Browser never chooses Thread/source/runtime authority.

## 4.2 Preview launch

Ordinary endpoint:

```http
POST /api/control/projects/:projectId/builder-session/preview
```

must not require browser-authored BuilderRun/source/artifact coordinates.

Server resolves:

```text
authorized Project
→ ProjectWorkingState last-good coordinates
→ exact Registry artifact
→ existing MAR serving/grant mechanism
```

Do not redesign MAR.

## 4.3 Preview dominant UX

If last-good Preview exists:

```text
Build screen loads
→ server-resolved launch
→ iframe appears automatically
```

No mandatory “Abrir Preview”. Optional `Nova aba` may remain.
Technical source/artifact identifiers belong in Details.

## 4.4 Diff

Primary Diff is:

```text
latest code-changing BuilderRun.baseSourceRevision
→ latest code-changing BuilderRun.resultSourceRevision
```

Use Slice-2 source-read authority.

A later response-only request must not erase the previous code-change Diff.

## 4.5 Migrate final ordinary callers

By Slice-4 exit, the current P-01/browser flow must not call or require:

```text
/session/turns
Change chooser/snapshot
Findings/Evidence routes
legacy PreviewPreparation routes
legacy BLD-01..21 surfaces for ordinary Builder UX
```

Do not delete all those implementations in this slice; prove current Product no
longer calls them. Slice 5 removes them.

## Slice 4 acceptance

PASS when:

```text
Preview auto-renders
server owns Preview truth
Diff shows latest real code change
reload reconstructs from BLD-23
current Product path has no Change-era API dependency
```

The Playwright test remains UI/contract proof, not live composed proof.

**Review gate:** CLOSED. Slice 5 is the current authorized implementation slice.

---

# Slice 5 — Legacy Builder excision

**State:** AUTHORIZED / CURRENT

## Goal

Delete the superseded Change-era Builder after Slice 4 proves no accepted
ordinary Product caller remains.

This is a mandatory PSTACK subtraction slice, not cosmetic cleanup.

## 5.1 Start with a caller census

Search current runtime, routes, contracts, frontend, tests and server wiring for
actual callers of legacy Builder concepts.

Classify each occurrence:

```text
accepted current caller → migrate/remove caller first inside this slice if bounded
historical migration/evidence text → keep as immutable history
runtime/API/schema with no accepted caller → delete
```

Do not preserve code merely because old tests reference it.

## 5.2 Runtime/API deletion target

Expected dead concepts include, subject to exact caller census:

```text
ChangeProjection / PlanProjection / ChangeProgress / ChangeDiff / ChangeExecution
BuilderSnapshot Change graph
createChange / listChanges / readSnapshot
claimChange / claimCorrection
bindSandbox / settleResult / settleResponse
verification/correction/finding/evidence pipeline used only by Change
/session/turns legacy routes
legacy Change/findings/evidence endpoints
legacy PreviewPreparation ordinary path
activeTurn derived from Change
legacy source prepareSource/prepareCandidate/admitCandidate path
refs/conexus/changes custody code with no accepted non-Builder consumer
```

Remove dead files entirely when they have no remaining owner.
Do not leave “deprecated” wrappers with zero callers.

## 5.3 Database cleanup

Use the next available **forward migration** at Slice-5 time.
Never edit historical migration bytes.

After caller proof, drop current legacy Builder tables/functions/columns that no
accepted runtime depends on, including Change-era lifecycle objects as proven by census.

Candidates include:

```text
builder.change
builder.plan
builder.work_unit
builder.actor_run
builder.coding_session
legacy finding/evidence/acceptance/receipt tables
legacy Change-only functions
legacy PreviewPreparation functions
legacy Change coordinates in project_working_state
legacy fallback inside current source-read/application admission functions
```

Exact drop order must honor foreign keys and function dependencies.

Do not drop a shared IAM/Project/Registry primitive merely because it predates C-020.

## 5.4 Contracts/tests cleanup

Remove dead Change-era Product contracts and tests from the **current** product
surface. Historical evidence files may remain.

Current verification should stop spending runtime on a deleted architecture.

## Slice 5 acceptance

PASS when:

```text
ordinary runtime/API contains one Builder architecture
no current Product route exposes Change-era Builder UX
no current Builder store/service/source method exists solely for Change-era path
current database schema no longer retains proven-dead Builder lifecycle tables/functions/columns
published migrations remain byte-identical
current tests prove C-020, not deleted legacy behavior
```

**Review gate:** STOP. Do not start Slice 6.

---

# Slice 6 — Remove premature Brain path + align current verification

## Goal

Remove functionality that entered before Product proof and make the current
verification graph execute the C-020 proofs actually being shipped.

## 6.1 Remove Brain pre-query/prompt injection

Ordinary Builder must not do:

```text
every message
→ custom Brain keyword lookup
→ formatBrainContext
→ append business text to prompt
```

Remove Task-10-only reader/retrieval code with no accepted consumer.
Preserve the general Brain subsystem.

Future Brain integration remains direct Mastra tools after core acceptance.

## 6.2 Verification graph

Current objective verification must execute important current proofs:

```text
current migration/PostgreSQL install
Slice-1 A→B→C
Slice-2 source inspection
Slice-3 Mastra lifecycle/PLAN
Slice-4 Product UI/contract
Slice-5 clean current schema/runtime
Registry/compiler/wire checks
```

Do not restore R1/R2/RB historical stage choreography as current gates.
Remove Brain core leaf until Brain is truly authorized.

## Slice 6 acceptance

PASS when ordinary Builder has no premature Brain injection and `npm run verify`
represents the cleaned C-020 product rather than historical Builder architecture.

**Review gate:** STOP. Do not start Slice 7.

---

# Slice 7 — Real composed Product proof

## Goal

Prove the simple Product with the actual stack after legacy deletion.

Reuse existing live harnesses; do not create another live-testing framework.

Actual journey:

```text
1. Create Project.
2. BUILD: create counter with Adicionar/Zerar.
3. Preview appears automatically and works.
4. BUILD: add “Contagem da equipe”; prior behavior remains.
5. Ask “Como o botão Zerar funciona?”; response only, no source/build mutation.
6. Reload/restart; same Thread + source + Preview.
7. Make a third visible edit from current source.
```

Record:

```text
BuilderRun base/result/kind/state
working source transitions
last-good Preview transitions
zero Change-era current objects/callers as expected after Slice 5
```

Required:

```text
npm run verify green
opt-in live model/E2B proof green when credentials exist
real Preview interactive
A→B→C→... continuity real
response-only no mutation
reload persistence real
```

Deliver exact startup command, browser URL and operator test steps.

**Review gate:** STOP. Core is operator-ready, not implicitly delivered.

---

# Slice 8 — First real Brain-backed build

**State:** DEFERRED / NOT AUTHORIZED before Slice 7 acceptance

Use narrow Mastra-native tools, conceptually:

```text
searchBrain(query)
readBrainItem(itemId)
```

Conexus owns Account/Project/Brain binding/revision/provenance authority.

Do not add MCP/RAG/vector DB unless direct authorized tools prove insufficient.

Acceptance requires one exact approved Metal Nobre rule used by a real app while
preserving revision/digest/provenance and honest missing/ambiguous behavior.

---

# Slice status register

`docs/roadmap.md` wins on current authorization.

| Slice | Meaning | Current state |
| --- | --- | --- |
| 0 | Planning/authority reconciliation | COMPLETE |
| 1 | Source A→B→C continuity | PASS |
| 2 | Source inspection authority | PASS |
| 3 | Mastra lifecycle/message/PLAN | PASS / CLOSED |
| 4 | Product API + P-01 Preview/Diff | AUTHORIZED / NEXT |
| 5 | Legacy Builder excision | PLANNED / REQUIRED / BLOCKED |
| 6 | Remove premature Brain + verify alignment | PLANNED |
| 7 | Real composed proof/operator checkpoint | PLANNED |
| 8 | Real Brain tools/rule | DEFERRED until core acceptance |

---

# Reopen triggers

Do not open a new architecture program for ordinary implementation defects.
Reopen only the smallest implicated C-020 boundary if real evidence proves:

- shared Mastra Controller cannot isolate Projects;
- native Session deletion cannot preserve required Thread continuity;
- PLAN cannot be end-to-end read-only;
- BuilderRun cannot hold required concurrency/idempotency/restart truth;
- source-native custody cannot support real A→B→C while preserving protection;
- deleting legacy reveals a genuinely accepted capability with no C-020 owner;
- a real accepted Product capability cannot fit the current owner boundary.

Everything else is implementation/correction inside this plan.
