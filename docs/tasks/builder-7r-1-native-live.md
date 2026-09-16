# 7R-1 — Native live-state and streaming convergence

> **Status:** ACCEPTED / INDEPENDENT REVIEW PASS / 2026-09-16
> **Initial implementation:** `3276f8fbf3ae8a38f6d0cab43fe540df221ebee9`
> **Correction:** `fb1b1d4fe77e5a60e1d8bf78adacbf1e11ffad57`
> **Program:** [`builder-first-app.md`](builder-first-app.md)
> **Status/grant owner:** [`../roadmap.md`](../roadmap.md)
> **Technical owner:** [`../reference/builder-c020-mastra-native.md`](../reference/builder-c020-mastra-native.md)
> **Decision owner:** C-020 in [`../decisions/index.md`](../decisions/index.md)

7R-1 is closed. The original candidate correctly removed the parallel Conexus observation lifecycle and converged live Builder display on native Mastra Session state. Independent review found one browser transport race, `7R1-LIVE-01`. The bounded correction closed that race without reopening C-020 or adding another lifecycle owner.

# 1. Protected result

The accepted ordinary live path is:

```text
BuilderRun
→ fresh scoped Mastra Session
→ persistent Project Thread/messages
→ fresh per-run Workspace/E2B
→ Session.displayState + display_state_changed
→ safe stateless Conexus projection
→ browser replaces current live snapshot
```

Durable Product truth remains separate:

```text
BuilderRun
ProjectWorkingState
admitted source
ArtifactRevision
last-good Preview
persistent Mastra Thread/messages
```

Live state remains disposable.

# 2. Accepted ownership

Mastra owns coding-harness mechanics:

- shared `AgentController` and coding Agent;
- persistent Project Thread/messages;
- fresh scoped Session per BuilderRun;
- Workspace/filesystem/tool mechanics;
- BUILD/PLAN tool exposure;
- message/tool/running live state through `Session.displayState`.

Conexus owns:

- Account/Workspace/Project authorization;
- `BuilderRun` idempotency, concurrency, source/version and settlement;
- ProjectWorkingState;
- source/Git admission and CAS;
- compiler/ArtifactRevision/last-good Preview;
- Project/run HTTP authorization;
- a small disclosure boundary that removes raw tool args/results, shell output, provider metadata, credentials and unsafe paths.

No custom Session registry, durable live event log or second conversation store is admitted.

# 3. Deleted duplicate machinery

7R-1 removed the previous parallel observation implementation, including:

```text
apps/hub/src/builder/runtime-observation.ts
apps/hub/src/builder/observation-feed.ts
packages/builder-observation/
custom TEXT_START / TEXT_DELTA / TEXT_END lifecycle
custom ACTIVITY lifecycle state machine
dead PHASE lifecycle
generation / sequence / replay / retained-feed state
```

`apps/web/src/features/builder/observation.ts` remains only as a thin browser transport/parser boundary. Its existence does not create a second semantic live-state owner.

# 4. Accepted runtime shape

```text
resourceId = ProjectId
scope      = builder:<BuilderRunId>
threadId   = persistent Project ThreadId
Workspace  = fresh per BuilderRun
Session    = fresh per BuilderRun
```

Server live path:

```text
authenticate
→ authorize Project/run
→ AgentController.getSessionByResource(projectId, scope)
→ subscribe display_state_changed
→ synchronously read displayState.get()
→ emit safe initial snapshot
→ emit safe replacement snapshots
```

Subscribe precedes the initial snapshot read. No custom replay is required.

# 5. Closed finding — 7R1-LIVE-01

The first implementation made the browser live connection one-shot. A BuilderRun could already be visible while its Mastra Session was still being created, causing an initial `410`. An unexpected stream EOF had the same permanent-loss effect.

Correction `fb1b1d4f...` keeps the fix at the browser transport boundary:

- transient `410`, `5xx`, network failure or EOF retries while the same BuilderRun remains active;
- retries use bounded backoff rather than a hot loop;
- every successful reconnect starts from the server's current native snapshot;
- the React run lifecycle aborts the connection/retry loop when that run is no longer active;
- safety limits apply to the current SSE frame/buffer rather than cumulative bytes for the entire valid stream;
- malformed/non-retryable protocol responses fail closed;
- no replay, generation, sequence cursor, feed, durable live state or new dependency was added.

The adopted repository still does not depend on `@mastra/client-js`; adding that broader client solely for this narrow Project-specific transport did not earn its cost.

# 6. Review proof

Independent review inspected the correction diff against this task and the C-020 owner.

The committed browser proof exercises the Product surface with the required sequence:

```text
first live request  → 410
second connection   → current snapshot
stream EOF          → reconnect
third connection    → newer current snapshot
UI                  → replacement state, no replay reconstruction
```

The test asserts the first three stream statuses are `[410, 200, 200]` and waits for the later snapshot in the rendered Build UI. This directly covers the defect that the previous browser test missed.

The correction changes only:

```text
apps/web/src/features/builder/observation.ts
tests/implementation/builder-browser.test.mjs
docs/roadmap.md
```

No backend Mastra/Product authority code changed in the correction. Existing projection/redaction, Project/run isolation, response-only and BuilderRun settlement proofs therefore remain the relevant protected checks.

The executor reported focused proof, browser `2/2`, Hub/Web typecheck, Biome, `git diff --check`, and `npm run verify` at `28/28` with zero PostgreSQL skips. No GitHub Actions run exists for the correction SHA, so the independent review did not claim a second CI execution.

# 7. Review disposition

**PASS.**

Reasons:

- root cause is fixed rather than hidden;
- browser reconnect/resync now matches the native current-state model;
- no custom event history or parallel lifecycle returned;
- the correction is isolated to the transport boundary;
- the test observes browser behavior, not an internal retry helper;
- C-020 remains coherent and does not require amendment.

The executor had prematurely written `ACCEPTED` into the roadmap before independent review. That wording had no authority by itself. Acceptance is established by this review reconciliation and the roadmap status owner.

# 8. Non-goals preserved

7R-1 did not authorize or perform:

- Git/source performance optimization;
- Preview domain/correlation rebase;
- final frontend Product redesign;
- Brain/Sankhya expansion;
- workflow/subagent/task expansion;
- Mastra package upgrade;
- E2B lifetime optimization.

Those remain later work.

# 9. Reopen triggers

Reopen the smallest owner only if later evidence shows one of these is false:

- native display state cannot represent a real required live Product interaction;
- the disclosure boundary requires durable/custom live state;
- a real Product requirement needs live-event history rather than current-state resync;
- exact adopted Mastra behavior changes materially;
- another current non-legacy consumer requires the deleted observation lifecycle.

Otherwise do not restore the deleted path.

# 10. Follow-on

7R-2 may now be **planned only**. Create its dedicated task using PSTACK/Poteto and current runtime evidence before any 7R-2 Product implementation authorization.