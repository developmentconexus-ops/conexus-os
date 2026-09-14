# Conexus OS roadmap

This file owns current status, allowed work and the exact next action.
[The index](index.md) routes to Product, architecture, contracts and decisions.
Tasks own implementation detail. Evidence and old delivery plans do not grant
execution.

## Current direction and tracking

Build the internal Metal Nobre MVP before widening the platform.

The ordinary Builder experience is now defined by C-020 and the
[Mastra-native Builder reference](reference/builder-c020-mastra-native.md):

```text
open/create Project
→ Build
→ persistent Project conversation
→ coding agent works on current Project source
→ successful build updates Preview automatically
→ continue the same conversation and source
```

The user does not administer Change, Plan, WorkUnit, ActorRun, CodingSession,
manual Preview preparation or infrastructure choices in the ordinary path.

Mastra owns the coding-harness mechanics it already provides: shared
AgentController, createCodingAgent, persistent Thread/messages, live Session,
Workspace tools, modes, tasks/display state and streaming events. Conexus owns
only Product/system authority that Mastra must not decide: Project authorization,
BuilderRun durable execution facts, working-source custody/CAS, Git result
admission, compiler/ArtifactRevision and last-good Preview.

The current implementation checkpoint is `8ebbc8c` on
`analysis/internal-mvp-2026-09-12`. Verification/current-projection coupling was
separated from historical R1 source-pin custody. The new BuilderRun foundation
exists, but BLD-24 is not yet a usable end-to-end coding path.

| Delivery | State | Observable result | Exact next action |
| --- | --- | --- | --- |
| Repository operating-model cleanup | DELIVERED | Current repository method and verification graph are usable without historical-stage choreography | No new cleanup prerequisite |
| C-020 Mastra-native Builder core | IN PROGRESS | Project Thread persistence and BuilderRun foundation exist; no-Change end-to-end execution is not yet composed | Prove the three exact Mastra assumptions, then implement the shared harness + BuilderRun/source/build/Preview path |
| P-01 Builder UI | PLANNED | Preview-dominant Builder with chat right, Build/Plan and technical detail on demand | Start only after BLD-23/24 work end-to-end without Change |
| Project direct-to-Build entry | PLANNED | New Project opens Build with composer ready; no manual Inception prerequisite | Implement after core session API works |
| First real Brain rule | PLANNED | Builder discovers and uses one real authorized business rule without formula repeated in prompt | Start as soon as create/open/continue is usable; do not wait for all legacy cleanup |
| Narrow SDK / Sankhya capability | PLANNED | Generated app can invoke one real governed company operation | Select the first operation after the Brain-backed app is usable |
| Colleague use | PLANNED | Another authorized person can open and use the app | Detail access after the app is usable |

States are `PLANNED`, `IN PROGRESS`, `VALIDATING`, `DELIVERED`, and `BLOCKED`.
`DELIVERED` requires the observable result, not only code or passing unit tests.
This table is the only mutable delivery-status board.

## Program state

| Work | Status | Current truth |
| --- | --- | --- |
| Product implementation | IN PROGRESS / INTERNAL PILOT | Builder architecture is ratified; runtime migration from Change to Mastra-native C-020 is active |
| C-020 architecture | CURRENT / OPERATOR RATIFIED | `Project + Mastra Thread/Messages + BuilderRun + Working Source + last-good Preview` |
| Change/Plan/WorkUnit/ActorRun/CodingSession | LEGACY / MIGRATING CALLERS | Historical proof remains; no new ordinary Builder work may depend on them after migration |
| Historical R1 foundation pins | HISTORICAL AUDIT | May remain red against current owners; not a current MVP blocker and must not be rewritten to manufacture green |

The historical verifier refusal and old generated/hash failures remain recorded
Evidence/debt. They are not the next Builder blockers unless a current claim
explicitly depends on them.

## Current grant

On 2026-09-13 the operator ratified C-020, then explicitly approved the
Mastra-native refinement recorded in
[builder-c020-mastra-native.md](reference/builder-c020-mastra-native.md).

Routine reversible implementation and focused local verification are authorized
inside the current internal pilot. Continue automatically across mechanical
units; stop only for:

- a genuine Product contradiction not answered by C-020;
- missing external credentials/authority required for the exact live proof;
- risk of destructive non-disposable data effect.

This does not authorize production writes, public hosting, merge to `main`, or
rewriting historical receipts/migrations to manufacture green status.

The current branch publication is an analysis/pilot checkpoint, not delivery
acceptance.

## Execution board

The active implementation owner is
[`docs/tasks/builder-first-app.md`](tasks/builder-first-app.md).

Use PSTACK/poteto-mode throughout:

```text
fix root cause
subtract before add
use Mastra natively before creating Conexus machinery
preserve Product authority outside the framework
smallest verifiable increment
browser proof for user-visible claims
```

Do not open another architecture program or Arena unless one of the explicit
reopen triggers in the C-020 reference fires.

## Exact next action

1. Run the three exact Mastra 1.63.2 probes defined in
   `docs/reference/builder-c020-mastra-native.md`:
   shared-Controller Project isolation, PLAN tool restriction, and persisted
   user-message ID correlation.
2. Normalize migration discipline: restore published migration 028 bytes/digest
   to the first published form and move all subsequent schema evolution to
   forward migration 029+.
3. Compose the no-Change Builder path using one shared AgentController/
   createCodingAgent, per-run Session/Workspace/E2B, minimal BuilderRun,
   source-identity Git custody, automatic compile and last-good Preview.
4. Prove BLD-23/BLD-24 end-to-end with zero new Change rows, response-only,
   successful edit, failed-build repair, late-result refusal and restart/reopen.
5. Only then migrate the web Builder to the P-01 session API and native live
   Session events.
6. Make new Project entry land directly in Build.
7. Start the first real Brain-rule experiment immediately after
   create/open/continue is usable.

Do not block this sequence on complete legacy deletion or historical R1 pin
reconciliation.
