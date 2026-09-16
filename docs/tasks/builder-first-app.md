# Builder Foundation Rebaseline — program plan

> **Status:** CURRENT PROGRAM PLAN / REVIEW-GATED
> **Status and grant owner:** `docs/roadmap.md`
> **Current technical owner:** `docs/reference/builder-c020-mastra-native.md`
> **Current slice detail:** the dedicated task named by the roadmap

This file owns program sequencing and the Product outcome for the Builder Foundation Rebaseline. It does not own mutable status, detailed slice execution, or current architecture by itself.

---

## Internal pilot refactoring

This is the current internal-pilot direction.

The ordinary Builder is being reduced to the smallest reliable coding product before Product Experience redesign or business-capability expansion.

A fresh actor should route:

```text
AGENTS.md
→ docs/roadmap.md
→ this program plan when program context is needed
→ current slice task named by the roadmap
→ semantic/technical owners named by the task
```

## Directed MVP consolidation

Historical consolidation work produced the smaller ordinary Builder direction now owned by C-020. Do not resume historical R3/L1 queues from this anchor. Current work follows the rebaseline board in `docs/roadmap.md`.

## Delivery checkpoints

Historical delivery checkpoints remain in Git history. Current execution checkpoints are one task per actionable 7R/7U slice. The roadmap owns which one is active.

## Create and open work packet

The earlier create/open packet proved useful Product facts but is not the current execution contract. Current create/open/continue expectations are summarized below and owned technically by C-020 plus the active slice task.

---

# 1. Product outcome

Before frontend rebaseline, the engine must support this ordinary journey:

```text
create/open Project
→ Project coding conversation is ready
→ send a natural-language request
→ see real coding-agent text/tool activity while it happens
→ agent works against exact current Project source
→ source-changing result is admitted mechanically
→ app compiles automatically
→ last-good Preview updates automatically
→ use the app
→ send a second request
→ continue the same Project conversation from exact current source
→ ask a no-code question
→ RESPONSE_ONLY with no source/build mutation
→ reload/restart
→ conversation + working source + last-good Preview remain coherent
→ continue editing
```

The ordinary user does not administer `Change`, `Plan`, `WorkUnit`, `ActorRun`, `CodingSession`, Git refs, artifact IDs, Preview preparation, Mastra runtime IDs, or E2B IDs.

# 2. Foundation scope

Current foundation work may be driven by:

```text
Identity / authentication
Workspace
Project
Builder
source/Git custody
compiler
Registry / ArtifactRevision
last-good Preview
```

Preserve but do not expand until the engine is accepted:

```text
Brain
Connections
Project business bindings
Gateway/Sankhya capability expansion
managed workflows
subagents
generic task UX
advanced observational-memory UX
MCP/RAG/vector-store capability
```

The current React surface is Diagnostic UI until 7R-5 passes.

# 3. Foundation facts already reconciled

The durable technical meaning lives in `docs/reference/builder-c020-mastra-native.md`. The program depends on these current facts:

- `BuilderRun` remains a Conexus Product transaction for authorization, idempotency, concurrency, exact source/version, result settlement, and failure truth.
- one persistent Project Mastra Thread/messages owns conversation history;
- fresh scoped Mastra Session per BuilderRun is required for a fresh per-run Workspace in the adopted Mastra line;
- the shared `AgentController` registry is keyed by Project/resource and run scope, so Conexus does not own a second Session registry;
- `Session.displayState` and `display_state_changed` are the canonical live display mechanics;
- reconnect resynchronizes current state instead of replaying a Conexus event log;
- Conexus keeps authentication, authorization, disclosure/redaction, source admission, compilation, artifact, and last-good Preview authority;
- live runtime state is disposable; Thread/messages, BuilderRun, ProjectWorkingState, source, and last-good Preview are durable Product truth.

If current exact-version evidence later falsifies one of these facts, reopen the smallest technical/decision owner before implementation.

# 4. Slice ownership law

Every implementation slice gets one dedicated task **before the first Product implementation edit**.

The task contains implementation/review detail. This program file keeps only sequencing and cross-slice outcome.

Do not create placeholder tasks far ahead. Exact code census, falsifiers, and target details for a later slice are planned after predecessor evidence is accepted.

Implementation handoffs should point to the task instead of copying it.

```text
plan slice
→ create/update dedicated task
→ roadmap authorizes exactly that task
→ executor implements + verifies + commit/push + STOP
→ reviewer compares remote candidate to task/owners
→ PASS, CORRECTION REQUIRED, or REPLAN
→ only then plan the next slice
```

# 5. Rebaseline sequence

| Slice | Program purpose | Task owner |
| --- | --- | --- |
| **7R-0** | prove exact Mastra-native lifetime/live-state boundary | closed investigation; durable result absorbed by C-020 technical owner |
| **7R-1** | converge live UI mechanics on native Mastra state and delete the parallel observation lifecycle | [`builder-7r-1-native-live.md`](builder-7r-1-native-live.md) |
| **7R-2** | measure complete runtime waterfall before optimization | create dedicated task after 7R-1 acceptance |
| **7R-3** | rebase expensive Git/source micro-operations into logical transactions using 7R-2 measurements | create dedicated task after 7R-2 acceptance |
| **7R-4** | remove legacy ordinary Preview correlations while preserving security and last-good semantics | create dedicated task after 7R-3 acceptance |
| **7R-5** | prove the final engine as one composed Product journey | create dedicated task after 7R-4 acceptance |
| **7U** | deliberately redesign/rebuild Product Experience over the accepted engine | create dedicated task after 7R-5 acceptance |
| **8** | add the first narrow real business capability/Brain-Sankhya path | deferred until engine + Product surface acceptance |

# 6. What later slices are expected to answer

These are program questions, not implementation contracts.

## 7R-2

Measure where time is spent in Project create, BUILD, live activity, Code/Diff, compilation, and Preview. Produce a quantitative bounded waterfall and expensive-boundary census. Do not optimize in the measurement slice.

## 7R-3

Use 7R-2 evidence to reduce source/Git isolation overhead at the logical-operation level. Remove N+1 source reads and avoid one hardened OCI start per tiny Git operation where a single bounded transaction preserves the same custody/security invariants.

## 7R-4

Make ordinary Preview source/artifact-native. Remove Change-era ordinary correlation coordinates that no longer own Product meaning while preserving exact artifact identity, authorization, CSP/origin/sandbox boundaries, and last-good Preview behavior.

## 7R-5

Prove the final engine across create/build/continue/response-only/failure-repair/restart/concurrency/Code/Diff/Preview/reconnect. A compile failure must leave failed new source as working source while the prior good Preview remains usable and the next BUILD can repair from that failed source.

## 7U

Only after the engine passes, redesign the final Product Experience deliberately. The current diagnostic UI is evidence infrastructure, not a styling baseline.

# 7. Program stop law

Stop and return to the smallest owner when evidence exposes a material Product requirement, trust-boundary, semantic-owner, runtime-lifetime, source/artifact-authority, or exact-framework contradiction that the current slice task does not already resolve.

Do not solve a future slice opportunistically merely because its code is adjacent.
