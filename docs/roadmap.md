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

The pre-C-020 checkout checkpoint was `8ebbc8c` on
`analysis/internal-mvp-2026-09-12`. Since then, the current Project → Mastra
Session → BuilderRun → source → Preview path has been composed and verified;
the remaining blocker is the exact accepted Metal Nobre authority for the live
Brain-backed rule proof.

| Delivery | State | Observable result | Exact next action |
| --- | --- | --- | --- |
| Repository operating-model cleanup | DELIVERED | Current repository method and verification graph are usable without historical-stage choreography | No new cleanup prerequisite |
| C-020 Mastra-native Builder core | VALIDATING | Shared native harness, BuilderRun/source/build/Preview path and no-Change browser flow are composed; local proof is green | Complete the authorized live Brain-backed rule proof |
| P-01 Builder UI | VALIDATING | Preview-dominant Builder with chat right, Build/Plan and on-demand Code/Diff/Details are browser-proven | Complete the authorized live Brain-backed rule proof |
| Project direct-to-Build entry | VALIDATING | New Project opens Build with composer ready; no manual Inception prerequisite is browser-proven | Complete the authorized live Brain-backed rule proof |
| First real Brain rule | BLOCKED | Local Brain lookup, provenance and missing/ambiguous-gap behavior are implemented; the accepted real Metal Nobre rule is unavailable | Obtain the exact accepted Metal Nobre rule and authority for its live proof |
| Narrow SDK / Sankhya capability | PLANNED | Generated app can invoke one real governed company operation | Select the first operation after the Brain-backed app is usable |
| Colleague use | PLANNED | Another authorized person can open and use the app | Detail access after the app is usable |

States are `PLANNED`, `IN PROGRESS`, `VALIDATING`, `DELIVERED`, and `BLOCKED`.
`DELIVERED` requires the observable result, not only code or passing unit tests.
This table is the only mutable delivery-status board.

## Program state

| Work | Status | Current truth | Reopen trigger |
| --- | --- | --- | --- |
| Product implementation | VALIDATING / INTERNAL PILOT | Builder architecture is ratified; C-020 Tasks 0–9 and ordinary Task 11 cleanup are locally verified | Missing authority for the exact live Brain-backed rule proof |
| C-020 architecture | CURRENT / OPERATOR RATIFIED | `Project + Mastra Thread/Messages + BuilderRun + Working Source + last-good Preview` | Material Product, trust-boundary or structural contradiction |
| Change/Plan/WorkUnit/ActorRun/CodingSession | LEGACY / MIGRATING CALLERS | Historical proof remains; no new ordinary Builder work may depend on them after migration | An accepted caller still requires the legacy owner |
| Historical R1 foundation pins | HISTORICAL AUDIT | May remain red against current owners; not a current MVP blocker and must not be rewritten to manufacture green | A current claim explicitly depends on a historical pin |

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

**Obtain the exact accepted Metal Nobre rule and authority required for the live Brain-backed Builder proof.**

Tasks 0–9 and the ordinary Task 11 cleanup are implemented and locally
verified. The next authorized proof must use the real accepted rule, preserve
its Brain revision/provenance, and exercise the create/open/continue flow.

Do not block this sequence on complete legacy deletion or historical R1 pin
reconciliation.
