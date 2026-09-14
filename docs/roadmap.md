# Conexus OS roadmap

This file owns current status, allowed work and the exact next action.
`docs/tasks/builder-first-app.md` owns implementation detail.
`docs/reference/builder-c020-mastra-native.md` owns the current ordinary Builder architecture.
Historical Evidence and old delivery plans do not grant execution authority.

## Current direction

Build the internal Metal Nobre MVP before widening the platform.

The ordinary Builder job is:

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

Mastra owns coding-harness mechanics already provided by the framework:

```text
shared AgentController
shared createCodingAgent
persistent Thread/messages
live Session
Workspace tools
BUILD/PLAN modes
assistant/tool events
```

Conexus owns only Product/system authority that Mastra must not decide:

```text
Project authorization
BuilderRun durable execution facts
working-source custody/CAS
Git result admission
compiler / ArtifactRevision
last-good Preview
enterprise capability authorization
```

C-020 remains `CURRENT / OPERATOR RATIFIED`.
The final PSTACK audit did **not** reopen the architecture. It found bounded
implementation gaps in source continuity, source inspection, Session cleanup,
message projection, PLAN host-side mutation, Preview/Diff Product semantics and
a premature Brain integration.

The currently reviewed implementation baseline is:

```text
a62a5704a2c5bebb26144fa93dd83f1e7c4574f4
```

Planning/authority reconciliation after that audit is now recorded in the C-020
reference and slice plan.

---

## Delivery board

| Delivery | State | Current truth | Next condition |
| --- | --- | --- | --- |
| Repository operating model | DELIVERED | Current method supports objective current verification without historical-stage choreography | No prerequisite work |
| C-020 architecture | CURRENT / OPERATOR RATIFIED | `Project + Mastra Thread/Messages + BuilderRun + Working Source + last-good Preview` remains the target | Reopen only on explicit C-020 trigger |
| C-020 implementation | IN PROGRESS / REVIEW-GATED | Large portion exists at `a62a5704`, but final audit found source and Product-proof gaps that must be corrected slice-by-slice | Complete Slices 1–6 with GPT review between each |
| P-01 Builder UI | VALIDATING | Preview/chat shell exists, but automatic Preview and latest-run Diff semantics still need correction | Slice 4 + Slice 6 |
| Project direct-to-Build | VALIDATING | Routing/bootstrap implementation exists; real composed Product journey not yet accepted | Slice 6 |
| First real Brain rule | DEFERRED / BLOCKED | Core must be accepted first; exact real rule/authority is still required | Slice 7 after Slice 6 acceptance |
| Narrow SDK / Sankhya | PLANNED | Not part of current Builder correction | After first real Brain-backed app |
| Colleague use | PLANNED | No need before core Builder acceptance | After operator accepts the Builder journey |

`DELIVERED` requires the observable Product result, not only code or green unit tests.

---

## Slice execution board

Implementation is now explicitly review-gated.

| Slice | Purpose | State | Authorization |
| --- | --- | --- | --- |
| **Slice 0** | Planning / authority reconciliation | COMPLETE | Completed by GPT; documentation only |
| **Slice 1** | Source-native A→B→C continuity | PLANNED / NEXT | **NOT YET AUTHORIZED** until explicit Slice-1 handoff |
| **Slice 2** | C-020 source inspection authority | PLANNED | Not authorized |
| **Slice 3** | Mastra Session lifecycle, message projection, PLAN read-only | PLANNED | Not authorized |
| **Slice 4** | BLD-23/P-01 Preview/Diff Product simplification | PLANNED | Not authorized |
| **Slice 5** | Remove premature Brain path + align current verification | PLANNED | Not authorized |
| **Slice 6** | Real composed Product proof + operator-ready checkpoint | PLANNED | Not authorized |
| **Slice 7** | First real Brain-backed build through Mastra tools | DEFERRED | Not authorized before Slice 6 acceptance |

The detailed slice contracts live only in
[`docs/tasks/builder-first-app.md`](tasks/builder-first-app.md).

---

## Current grant

On 2026-09-13 the operator ratified C-020 and later approved the Mastra-native
refinement. On 2026-09-14 the operator changed the implementation cadence to a
**one-slice-at-a-time review loop**.

Therefore the previous instruction to “continue automatically across mechanical
units” is superseded for this Builder correction sequence.

Current rule:

```text
orientation handoff
→ no implementation

explicit Slice N handoff
→ implement Slice N only
→ focused verification
→ commit/checkpoint
→ STOP
→ GPT reviews actual Git diff + evidence
→ only then may Slice N+1 be authorized
```

Routine code inside an explicitly authorized slice may proceed automatically;
Codex does not need to stop per file or per test.

This grant does **not** authorize:

- starting a later slice early;
- production writes;
- public hosting;
- merge to `main`;
- rewriting historical receipts or published migrations;
- deleting legacy tables before caller proof;
- starting Brain/Sankhya work before the roadmap reaches those slices.

---

## PSTACK / Poteto execution laws

Use throughout:

```text
fix root cause
subtract before add
prefer native Mastra mechanics
preserve Conexus Product authority outside Mastra
reuse current proven E2B/Git/compiler/Registry/security pieces
smallest independently reviewable slice
proof matching the claim
no green-by-mock claim for a live Product journey
```

Do not open another Arena or architecture program unless one of the explicit
reopen triggers in `builder-c020-mastra-native.md` fires.

---

## Known correction map

The current plan deliberately addresses these final-audit findings:

```text
Slice 1 → real source A→B→C and app/** mutation boundary
Slice 2 → source-read admission for C-020 working/Preview/run sources
Slice 3 → deleteSession, Mastra signal-user projection, PLAN no starter
Slice 4 → latestBuilderRun naming, server-owned auto Preview, useful Diff
Slice 5 → remove pre-query Brain prompt injection, verify current objective leaves
Slice 6 → real Hub/Web/DB/Mastra/E2B/Git/compiler/Registry/Preview journey
Slice 7 → real Brain tools/rule only after core acceptance
```

---

## Exact next action

**No implementation slice is authorized yet.**

Send Codex the orientation-only handoff. Codex must:

1. synchronize to the current branch;
2. cold-start through the canonical owners;
3. understand C-020 and the slice review protocol;
4. inspect current checkout only as needed to orient itself;
5. make **no code or documentation changes**;
6. return a short readiness acknowledgment with current HEAD and any genuine
   authority contradiction.

After that acknowledgment, GPT/operator will send a separate **Slice 1 handoff**.

Do not start Brain, Sankhya, Slice 1 or any other implementation from the
orientation handoff alone.
