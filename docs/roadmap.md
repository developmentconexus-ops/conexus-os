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
The final PSTACK audit did **not** reopen the architecture. Remaining implementation
work is being corrected through review-gated slices.

The reviewed implementation baseline is:

```text
a62a5704a2c5bebb26144fa93dd83f1e7c4574f4
```

Slice 1 completed through two reviewed checkpoints:

```text
33c9079c5712f508e0e3165bbefff4db0d128a79
  source-native C-020 custody + A→B→C proof

e56dcec3c6125bd1d812a6645ded5a35418118ad
  runtime-compatible retained-source transport + numeric Docker uid:gid
```

GPT review result:

```text
SLICE 1 = PASS
```

The accepted Slice-1 behavior is:

```text
canonical Project main may remain A
A → B retained at refs/conexus/sources/B
B → C starts from exact B and is retained at refs/conexus/sources/C
source bundles normalize an ephemeral refs/heads/main to the exact requested source
ordinary BuilderRun source custody uses source/execution semantics, not fake Change coordinates
ordinary mutation boundary = app/**
```

This does not authorize arbitrary source disclosure. Source inspection authority is
owned by Slice 2.

---

## Delivery board

| Delivery | State | Current truth | Next condition |
| --- | --- | --- | --- |
| Repository operating model | DELIVERED | Current method supports objective current verification without historical-stage choreography | No prerequisite work |
| C-020 architecture | CURRENT / OPERATOR RATIFIED | `Project + Mastra Thread/Messages + BuilderRun + Working Source + last-good Preview` remains the target | Reopen only on explicit C-020 trigger |
| C-020 implementation | IN PROGRESS / REVIEW-GATED | Slice 1 source continuity is accepted; source inspection still reasons from legacy Baseline/Change authority | Complete Slice 2 and review before Slice 3 |
| P-01 Builder UI | VALIDATING | Preview/chat shell exists, but automatic Preview and latest-run Diff semantics still need correction | Slice 4 + Slice 6 |
| Project direct-to-Build | VALIDATING | Routing/bootstrap implementation exists; real composed Product journey not yet accepted | Slice 6 |
| First real Brain rule | DEFERRED / BLOCKED | Core must be accepted first; exact real rule/authority is still required | Slice 7 after Slice 6 acceptance |
| Narrow SDK / Sankhya | PLANNED | Not part of current Builder correction | After first real Brain-backed app |
| Colleague use | PLANNED | No need before core Builder acceptance | After operator accepts the Builder journey |

`DELIVERED` requires the observable Product result, not only code or green unit tests.

---

## Slice execution board

Implementation is explicitly review-gated.

| Slice | Purpose | State | Authorization |
| --- | --- | --- | --- |
| **Slice 0** | Planning / authority reconciliation | COMPLETE | Completed by GPT; documentation only |
| **Slice 1** | Source-native A→B→C continuity | **COMPLETE / PASS** | Accepted at `e56dcec3` |
| **Slice 2** | C-020 source inspection authority + latest code-changing run basis | **AUTHORIZED / IN PROGRESS** | **AUTHORIZED 2026-09-14 — Slice 2 only** |
| **Slice 3** | Mastra Session lifecycle, message projection, PLAN read-only | PLANNED | Not authorized |
| **Slice 4** | BLD-23/P-01 Preview/Diff Product simplification | PLANNED | Not authorized |
| **Slice 5** | Remove premature Brain path + align current verification | PLANNED | Not authorized |
| **Slice 6** | Real composed Product proof + operator-ready checkpoint | PLANNED | Not authorized |
| **Slice 7** | First real Brain-backed build through Mastra tools | DEFERRED | Not authorized before Slice 6 acceptance |

The detailed slice contracts live only in
[`docs/tasks/builder-first-app.md`](tasks/builder-first-app.md).

---

## Current grant

The operator ratified C-020 and approved the Mastra-native refinement, then
changed this correction sequence to a one-slice-at-a-time review loop.

Current rule:

```text
explicit Slice N handoff
→ implement Slice N only
→ focused verification
→ commit/checkpoint
→ STOP
→ GPT reviews actual Git diff + evidence
→ only then may Slice N+1 be authorized
```

Slice 1 has passed GPT review. The operator has now authorized **Slice 2 only**.

This grant permits the bounded forward migration and store/test changes required
to make C-020 source inspection exact. It does **not** authorize Product UI or
Preview changes yet.

This grant does **not** authorize:

- starting Slice 3 or any later slice;
- changing Mastra Session lifecycle or PLAN behavior;
- Product API / Preview UI changes owned by Slice 4;
- Brain / Sankhya work;
- production writes;
- public hosting;
- merge to `main`;
- rewriting published migrations 001–036;
- deleting legacy Builder tables or legacy source-read behavior before caller proof.

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

```text
Slice 1 → real source A→B→C and app/** mutation boundary                         PASS
Slice 2 → source-read admission for C-020 working/Preview/latest-code-run sources  NOW
Slice 3 → deleteSession, Mastra signal-user projection, PLAN no starter
Slice 4 → latestBuilderRun naming, server-owned auto Preview, useful Diff
Slice 5 → remove pre-query Brain prompt injection, verify current objective leaves
Slice 6 → real Hub/Web/DB/Mastra/E2B/Git/compiler/Registry/Preview journey
Slice 7 → real Brain tools/rule only after core acceptance
```

---

## Exact next action

**Execute Slice 2 only: C-020 source inspection authority + latest code-changing run basis.**

Required outcomes:

```text
1. source inspection admits only exact authorized C-020 revisions:
   - current working source
   - last-good Preview source
   - latest code-changing BuilderRun base/result
   - legacy accepted source as fallback for legacy callers;
2. unrelated arbitrary Git/OID values remain refused;
3. cross-Project and unauthorized-account disclosure remain refused;
4. a server-owned latest code-changing BuilderRun projection exists for future Diff;
5. migration 037 is forward-only and migrations 001–036 remain byte-identical;
6. current migration install/upgrade proof remains green.
```

At Slice 2 completion Codex must commit/checkpoint, stop and return the required
evidence. Do not start Slice 3.
