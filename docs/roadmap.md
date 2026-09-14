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
implementation gaps that are being corrected through review-gated slices.

The reviewed implementation baseline is:

```text
a62a5704a2c5bebb26144fa93dd83f1e7c4574f4
```

Slice 1 implementation checkpoint reviewed by GPT:

```text
33c9079c5712f508e0e3165bbefff4db0d128a79
```

That checkpoint correctly separated ordinary C-020 source custody from fake
Change coordinates and added real A→B→C Git custody tests, but review found two
bounded defects before the slice can PASS:

1. a retained-source bundle advertises `refs/conexus/sources/<oid>`, while the
   current coding runtime still materializes ordinary source from
   `refs/heads/main`; the source transport contract therefore still fails on a
   real second BuilderRun even though custody-only tests pass;
2. the new source-result host path constructs Docker `--user` from the
   `process.getuid` / `process.getgid` function objects instead of calling them,
   a defect hidden by the fake-Docker test harness.

Neither finding reopens C-020 or authorizes Slice 2.

---

## Delivery board

| Delivery | State | Current truth | Next condition |
| --- | --- | --- | --- |
| Repository operating model | DELIVERED | Current method supports objective current verification without historical-stage choreography | No prerequisite work |
| C-020 architecture | CURRENT / OPERATOR RATIFIED | `Project + Mastra Thread/Messages + BuilderRun + Working Source + last-good Preview` remains the target | Reopen only on explicit C-020 trigger |
| C-020 implementation | IN PROGRESS / REVIEW-GATED | Slice 1 is implemented but requires two bounded fixes before acceptance | Slice 1 PASS, then review-authorize Slice 2 |
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
| **Slice 1** | Source-native A→B→C continuity | **REVIEW / BOUNDED FIXES REQUIRED** | **Only the explicit Slice-1 bounded-fix pass is authorized** |
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

Slice 1 has reached its first review checkpoint. GPT classified it as
`BOUNDED FIXES REQUIRED`. Codex may perform only the explicit bounded correction
for the two reviewed defects and must stop again. Slice 2 remains blocked.

This grant does **not** authorize:

- starting Slice 2 or any later slice;
- Product API / Preview / Brain / Sankhya changes;
- database migrations in Slice 1;
- production writes;
- public hosting;
- merge to `main`;
- rewriting historical receipts or published migrations;
- deleting legacy tables before caller proof.

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

**Complete the reviewed bounded fix pass for Slice 1 only.**

Required outcomes:

```text
1. prepareProjectSource(B) produces a source bundle that the current ordinary
   coding runtime can actually materialize for the second run, without moving
   canonical Project refs/heads/main;
2. the source-result Docker invocation uses the real numeric uid:gid;
3. focused tests prove both defects instead of relying on the existing fake
   harness behavior;
4. the original A→B→C custody and negative tests remain green.
```

After the bounded-fix checkpoint Codex must stop. GPT will review again and only
a PASS may unlock Slice 2.
