# 7R-1 — Native live-state and streaming convergence

> **Status:** IMPLEMENTATION CANDIDATE PRESENT / REVIEW PENDING / NOT ACCEPTED
> **Candidate commit:** `3276f8fbf3ae8a38f6d0cab43fe540df221ebee9`
> **Parent:** `9a2b52f7d7061f6a98b4bac19a5ac8a4c7a3370e`
> **Program:** [`builder-first-app.md`](builder-first-app.md)
> **Status/grant owner:** [`../roadmap.md`](../roadmap.md)
> **Technical owner:** [`../reference/builder-c020-mastra-native.md`](../reference/builder-c020-mastra-native.md)
> **Decision owner:** C-020 in [`../decisions/index.md`](../decisions/index.md)

This task records the already approved 7R-1 contract before independent review. The existence of the candidate commit does not prove that the task passed.

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

The candidate must preserve:

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
- existing source/compiler/artifact/Preview owners.

## CHANGE

Expected current areas:

```text
apps/hub/src/builder/module.ts
apps/hub/src/builder/runtime.ts
apps/hub/src/builder/routes.ts
apps/hub/src/builder/service.ts
apps/web/src/features/builder/api.ts
apps/web/src/features/builder/components/project-build.tsx
```

Change only as needed to use current Session/display state and a replace-current-state frontend model.

## DELETE after caller migration

Subject to caller census:

```text
apps/hub/src/builder/runtime-observation.ts
apps/hub/src/builder/observation-feed.ts
packages/builder-observation/
apps/web/src/features/builder/observation.ts
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

Live path:

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

Reconnect:

```text
reconnect
→ read current snapshot
→ continue current snapshots
```

No custom replay is required.

Frontend:

```text
receive safe snapshot
→ replace current live view
```

No delta reducer is required.

# 6. Safe browser projection

The projection should be pure/stateless and expose only fields the Diagnostic UI needs, such as:

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

# 7. Implementation checklist

The independent review must verify that the candidate did all applicable items rather than assuming this checklist passed.

- [ ] use the shared `AgentController` native Session registry, not a Conexus registry;
- [ ] bind Session identity to `projectId` + `builder:<builderRunId>`;
- [ ] project `Session.displayState` through a small safe stateless boundary;
- [ ] establish live subscription before the initial snapshot read;
- [ ] resynchronize reconnect from current snapshot, with no durable live-event replay;
- [ ] make the frontend replace current live state rather than reduce custom deltas;
- [ ] remove the custom observation protocol/feed/reducer after accepted callers migrate;
- [ ] remove dead PHASE/generation/sequence/replay machinery;
- [ ] preserve BuilderRun settlement and all Product authority boundaries;
- [ ] preserve conversation history in Mastra Thread/messages;
- [ ] keep Diagnostic UI changes bounded to truthful runtime display;
- [ ] update/delete tests so they prove the current boundary rather than deleted implementation details.

# 8. Falsifiers

The slice fails or requires correction if any of these are true:

1. a late subscriber cannot obtain the current run state without custom replay;
2. assistant message state is lost or reconstructed incorrectly;
3. running/completed/error tool state cannot be projected from native display state;
4. reconnect depends on generation/sequence replay for correctness;
5. raw args/results/shell/provider/private paths reach the browser;
6. Project A can observe Project B Session/Thread state;
7. live-display failure can change BuilderRun/source/Preview settlement;
8. response-only behavior mutates source or invokes compilation incorrectly;
9. a custom observation/feed/reducer lifecycle remains without a named current consumer;
10. a new abstraction duplicates Mastra or Conexus authority without a proven gap.

# 9. Required proof

At minimum, the review must find credible proof for:

- late-subscriber current snapshot;
- assistant text projection;
- running/completed/error tool projection;
- safe path and raw-payload redaction;
- Project/run isolation;
- reconnect/resync without replay;
- response-only no-source-mutation behavior;
- BuilderRun settlement independence from live display;
- affected test/build/typecheck verification required by the repository graph.

Do not promote a unit test or mock to an end-to-end claim it did not execute.

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

# 11. Review procedure

Review candidate `3276f8fbf3ae8a38f6d0cab43fe540df221ebee9` against its parent and this task.

Order:

1. confirm repository/branch/HEAD and candidate parent;
2. read C-020 technical owner and exact Mastra skill as needed;
3. inspect the actual changed-file census and diff;
4. map every change to KEEP/CHANGE/DELETE and the protected result;
5. inspect tests/proof and named falsifiers;
6. search for residual duplicate observation/replay callers;
7. assess accidental new abstractions and authority duplication;
8. return `PASS`, `CORRECTION REQUIRED`, or `REPLAN` with concrete evidence.

Do not change Product implementation while performing this review.

# 12. Owner reconciliation after PASS

If the candidate passes:

- keep C-020 as the current decision;
- reconcile `docs/reference/builder-c020-mastra-native.md` only if the accepted runtime shape differs from its current text;
- keep `docs/reference/builder-and-harness.md` consistent with C-020 and free of a second current execution line;
- update `docs/roadmap.md` to mark 7R-1 accepted and authorize only planning of 7R-2;
- use PSTACK/Poteto to prepare the dedicated 7R-2 task before implementation authorization.

If the candidate fails, record the required correction in this task and keep 7R-2 blocked.

# 13. STOP law

Stop the review and return to owner-level planning if evidence shows:

- exact Mastra behavior differs materially from the C-020 assumptions above;
- disclosure safety needs durable/custom state rather than a pure projection;
- a real Product requirement needs live-event history/replay;
- removing a candidate component breaks a current non-legacy consumer not represented here;
- the candidate changed a Product/architecture authority outside 7R-1.
