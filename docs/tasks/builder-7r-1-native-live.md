# 7R-1 — Native live-state and streaming convergence

> **Status:** CORRECTION REQUIRED / REVIEWED / NOT ACCEPTED
> **Candidate commit:** `3276f8fbf3ae8a38f6d0cab43fe540df221ebee9`
> **Parent:** `9a2b52f7d7061f6a98b4bac19a5ac8a4c7a3370e`
> **Program:** [`builder-first-app.md`](builder-first-app.md)
> **Status/grant owner:** [`../roadmap.md`](../roadmap.md)
> **Technical owner:** [`../reference/builder-c020-mastra-native.md`](../reference/builder-c020-mastra-native.md)
> **Decision owner:** C-020 in [`../decisions/index.md`](../decisions/index.md)

This task owns the bounded 7R-1 execution and review contract. The candidate got the core Mastra-native convergence right, but the independent review found one browser transport lifecycle defect that blocks acceptance.

# 1. Protected result

The ordinary Builder must use Mastra's native live display mechanics without Conexus maintaining a second text/tool/activity lifecycle.

```text
BuilderRun starts
→ fresh scoped Mastra Session for that run
→ persistent Project Thread
→ fresh per-run Workspace/E2B
→ client can attach to current live state
→ native display state represents message/tool/running state
→ Conexus projects only safe Product-facing fields
→ Product settlement remains independent
```

The target removes custom event reconstruction and replay while preserving Conexus authority.

# 2. Established facts from 7R-0

Treat these as input authority for this slice unless exact current Evidence falsifies them:

- Workspace is resolved when a Mastra Session is created. A fresh per-run Workspace therefore requires a fresh scoped Session per BuilderRun in `@mastra/core@1.63.2`.
- the persistent Project Thread/messages survive Session recreation and own conversation history;
- `AgentController.getSessionByResource(resourceId, scope)` already owns the Session registry;
- `Session.displayState.get()` is the canonical live UI state;
- `display_state_changed` is the native state-change signal;
- the adopted Mastra reconnect model does not replay missed server events. The consumer resynchronizes current state;
- `displayState` contains raw/internal tool data that must not cross the browser disclosure boundary unchanged;
- `BuilderRun` remains the durable Conexus Product execution record.

# 3. Preserve

The candidate and correction must preserve:

- Account/Workspace/Project authorization;
- `BuilderRun` idempotency, claim, base source/version, one-active-run rule, settlement, result classification, and failure truth;
- persistent Project Thread/messages;
- fresh Workspace/E2B per BuilderRun unless another accepted owner explicitly changes that later;
- BUILD/PLAN native tool visibility and PLAN read-only semantics;
- source admission/CAS, compilation, ArtifactRevision retention, and last-good Preview behavior;
- Diagnostic UI scope only. No final Product Experience redesign;
- live-display failure must not change BuilderRun/Product settlement.

# 4. Code census

## KEEP

- shared `AgentController`;
- shared coding Agent;
- persistent Project Thread/messages;
- `BuilderRun` and ProjectWorkingState Product authority;
- Project/run authentication and authorization;
- safe disclosure/redaction boundary;
- existing source/compiler/artifact/Preview owners;
- the thin frontend SSE parser/validator may remain if it owns only transport and snapshot replacement, not a second live-state lifecycle.

## CHANGE

Relevant areas for the original slice and its correction:

```text
apps/hub/src/builder/runtime.ts
apps/hub/src/builder/routes.ts
apps/hub/src/builder/service.ts
apps/web/src/features/builder/observation.ts
apps/web/src/features/builder/components/project-build.tsx
tests/implementation/builder-runtime-observation.test.mjs
tests/implementation/builder-run-dispatch.test.mjs
tests/implementation/builder-browser.test.mjs
```

The correction should stay at the smallest browser/live-transport boundary that closes the finding below. Do not reopen the accepted backend architecture without evidence.

## DELETE after caller migration

The candidate correctly removed the duplicate lifecycle owners:

```text
apps/hub/src/builder/runtime-observation.ts
apps/hub/src/builder/observation-feed.ts
packages/builder-observation/
custom TEXT_START / TEXT_DELTA / TEXT_END lifecycle
custom ACTIVITY lifecycle/state machine
dead PHASE lifecycle
generation / sequence / replay / retained-feed state
custom subscriber queues whose only purpose was replaying the duplicate protocol
```

Do not replace these with `BuilderObservationV2`, a second live-state store, a custom Session registry, or another event protocol.

# 5. Target shape

Runtime identity:

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
→ authorize Project
→ verify BuilderRun belongs to Project
→ controller.getSessionByResource(projectId, `builder:${builderRunId}`)
→ subscribe to display_state_changed
→ synchronously read session.displayState.get()
→ emit initial safe snapshot
→ emit subsequent safe snapshots
```

Subscribe before the initial snapshot read. Do not insert an `await` between them.

Browser live path:

```text
active BuilderRun
→ attach to live endpoint
→ Session not created yet or transport disconnects
→ retry/resubscribe while the same run is active
→ each successful connection receives the current snapshot
→ replace current live view
```

No generation, sequence, history reconstruction, or event replay is required.

# 6. Safe browser projection

The projection remains pure/stateless and exposes only fields the Diagnostic UI needs, such as:

```text
running
message:
  id
  text
activities:
  id
  label
  safe optional detail
  state
```

Never disclose raw tool args/results, arbitrary shell output, provider metadata, credentials, private framework state, or unsafe filesystem paths.

Preserve the existing `app/**` path-safety intent where file detail is exposed.

# 7. Candidate review result

## Accepted parts

The independent review confirmed that candidate `3276f8f...`:

- deletes the backend custom observation projector/feed and the `builder-observation` package;
- uses the shared `AgentController` Session registry;
- binds production Sessions as `projectId` + `builder:<builderRunId>`;
- uses `Session.displayState` and `display_state_changed`;
- subscribes before taking the initial snapshot;
- projects a stateless redacted browser view;
- keeps BuilderRun/Product settlement separate from live display;
- removes generation/sequence/replay state;
- makes the frontend replace snapshots instead of reducing custom deltas.

Keeping `apps/web/src/features/builder/observation.ts` is acceptable because the candidate reduced it to thin SSE parsing/validation. The filename does not create a second semantic owner.

## Blocking finding — `7R1-LIVE-01`

The browser connection is one-shot even though Session availability and transport lifetime are not.

The real sequence can be:

```text
POST message returns BuilderRun
→ dispatch claims run
→ source is prepared
→ E2B starts and source is materialized
→ only then Mastra Session is created
```

During that window the browser can already see the BuilderRun as `QUEUED` or `RUNNING` and request the live endpoint. The server correctly returns `410` while no Session exists. The current frontend catches that failure and does not retry. Its effect depends on `projectId`, `runId`, and the boolean `runActive`; the normal `QUEUED → RUNNING` transition leaves `runActive === true`, so it does not create a second attachment attempt.

The same one-shot behavior applies after an unexpected SSE end/error. The client also counts total bytes for the whole connection and fails after 1 MiB, so a valid long-running snapshot stream can terminate solely because enough snapshots were received.

Result: the backend can support current-state resync, but the real browser can miss the live UI for the entire active run.

This violates the protected result and the reconnect/resync proof requirement. It does not reopen C-020 or justify restoring replay.

# 8. Required correction

Close `7R1-LIVE-01` without adding another lifecycle owner.

Required behavior:

- while the same BuilderRun remains active and the component AbortSignal is not aborted, a transient unavailable Session must lead to a later attach attempt rather than permanent live-state loss;
- an unexpected live-stream end/error during the active run must reconnect and resynchronize from the next connection's initial current snapshot;
- retry must be bounded/backed off enough to avoid a hot loop;
- no event replay, generation/sequence cursor, durable live log, retained feed, or second state store may be introduced;
- a stream safety limit must bound an individual frame/buffer or another real resource, not impose a small cumulative lifetime byte ceiling that guarantees disconnect for sufficiently long valid runs;
- terminal BuilderRun state must still stop/cancel live attachment through the existing Product state path.

Exact local retry mechanics are an implementation choice. Do not block the POST on the whole Builder runtime merely to avoid the race.

# 9. Required proof

The correction must add Product-surface proof, not only a service unit proof.

At minimum prove:

1. the first browser stream request can receive `410`, a later request for the same active run receives `200`, and current native snapshot text/tool activity becomes visible;
2. an established stream can end unexpectedly while the run remains active, the browser reconnects, and the next current snapshot replaces the live view without replay;
3. assistant text projection remains correct;
4. running/completed/error tool projection remains correct;
5. safe path and raw-payload redaction remain intact;
6. Project/run isolation remains intact;
7. response-only behavior still causes no source mutation/compile;
8. BuilderRun settlement remains independent from live-display availability;
9. affected typecheck/build/tests and the repository verification required by the current graph pass.

The existing service test that manually calls `observeBuilderRun` a second time proves backend resync capability. It does not prove that the browser reconnects. The current Playwright test always returns an immediately successful stream and therefore does not cover `7R1-LIVE-01`.

# 10. Non-goals

Do not include:

- Git/source performance optimization;
- Preview domain/correlation rebase;
- final frontend Product redesign;
- Brain/Sankhya capability work;
- workflows/subagents/generic task UX;
- Mastra package upgrade;
- E2B lifetime optimization.

Those belong to later slices or explicit replanning.

# 11. Correction review procedure

Review the correction against this same task.

Order:

1. confirm repository/branch/HEAD and correction parent;
2. inspect only the correction diff plus any directly affected tests;
3. prove `7R1-LIVE-01` at the browser surface;
4. confirm no replay/feed/state-machine replacement was introduced;
5. rerun the affected verification graph;
6. return `PASS`, `CORRECTION REQUIRED`, or `REPLAN`.

Do not change Product implementation while performing the independent review.

# 12. Owner reconciliation after PASS

If the corrected slice passes:

- keep C-020 as the current decision;
- reconcile `docs/reference/builder-c020-mastra-native.md` only if the accepted runtime shape differs from its current text;
- keep `docs/reference/builder-and-harness.md` consistent with C-020 and free of a second current execution line;
- update `docs/roadmap.md` to mark 7R-1 accepted and authorize only planning of 7R-2;
- use PSTACK/Poteto to prepare the dedicated 7R-2 task before implementation authorization.

If the correction fails, keep the smallest failing invariant in this task and keep 7R-2 blocked.

# 13. STOP law

Stop and return to owner-level planning if correction evidence shows:

- exact Mastra behavior differs materially from the C-020 assumptions above;
- disclosure safety needs durable/custom state rather than a pure projection;
- a real Product requirement needs live-event history/replay;
- removing a candidate component breaks a current non-legacy consumer not represented here;
- the correction requires changing Product/architecture authority outside 7R-1.