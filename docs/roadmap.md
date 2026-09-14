# Conexus OS roadmap

This file owns current status, allowed work and the exact next action.
`docs/tasks/builder-first-app.md` owns implementation detail.
`docs/reference/builder-c020-mastra-native.md` owns the current ordinary Builder architecture.
Historical Evidence and old delivery plans do not grant execution authority.

## Current direction

Build one simple ordinary Builder:

```text
Project
→ persistent Mastra Thread/Messages
→ BuilderRun
→ working source
→ last-good Preview
```

The final runtime must not permanently carry a second Change-era Builder.

Mastra owns coding-harness mechanics. Conexus owns Product/system authority:

```text
Project authorization
BuilderRun durability/idempotency/concurrency
working-source custody/CAS
Git result admission
compiler / ArtifactRevision
last-good Preview
enterprise capability authorization
```

C-020 remains `CURRENT / OPERATOR RATIFIED`.
No architectural reopen is authorized.

---

## Accepted checkpoints

### Slice 1 — PASS

Accepted implementation:

```text
e56dcec3c6125bd1d812a6645ded5a35418118ad
```

Accepted facts:

```text
A → B → C source-native continuity
immutable refs/conexus/sources/<oid>
canonical refs/heads/main does not move with Builder edits
runtime-compatible transport bundles
ordinary mutation boundary = app/**
no fake Change source coordinates in ordinary BuilderRun
```

### Slice 2 — PASS

Accepted implementation:

```text
df762d525d27b4aaf85d4de5ba5fa1fe2e806958
```

Accepted facts:

```text
forward migration 037
working / last-good / latest code-changing base+result source inspection
later RESPONSE_ONLY does not erase useful Diff basis
arbitrary/stale unrelated OIDs refused
source-read authority remains server-owned
```

---

## Slice 3 — PASS / CLOSED

Accepted checkpoint:

```text
58d53fa908eb954bc6cb756a706f377eba8fe53b
```

Focused proof is green:

```text
builder-session-projection: 1/1
builder-plan-starter: 1/1
Mastra lifecycle qualification: 7/7
```

Accepted facts include native per-run `deleteSession`, persistent Project Thread
continuity, end-to-end PLAN read-only behavior, shared coding instructions, and
the production-shaped `Memory.recall` path projecting the real
`signal/user` operator row as Product `user`. No `hideSignals` workaround,
cast, raw LibSQL query, custom conversation store, or custom Session manager is
used.

## Slice 4 — AUTHORIZED / NEXT

The next authorized implementation slice is Product API and P-01
Preview/Diff simplification. Slice 5 remains blocked until Slice 4 proves the
current Product caller migration.

---

## PSTACK subtraction decision — legacy must leave final runtime

Temporary compatibility debt:

```text
Change
Plan
WorkUnit
ActorRun
CodingSession
Findings / verification Evidence
legacy Builder snapshots/routes
legacy Change custody
legacy verifier/correction pipeline
legacy PreviewPreparation
legacy source-read fallback
legacy working-state Change/preparation coordinates
```

Execution law:

```text
migrate accepted callers
→ prove C-020 owns the Product path
→ delete dead runtime/API/schema surface
```

Published migration files remain immutable history. A forward cleanup migration may remove dead current schema after callers migrate.

---

## Delivery board

| Delivery | State | Next condition |
| --- | --- | --- |
| Repository operating model | DELIVERED | none |
| C-020 architecture | CURRENT / OPERATOR RATIFIED | reopen only on explicit trigger |
| C-020 implementation | IN PROGRESS / SLICE 4 AUTHORIZED | complete Slice 4, then review |
| P-01 Builder UI | VALIDATING | Slice 4 + Slice 7 |
| Legacy Builder architecture | MIGRATING TO DELETE | Slice 4 caller migration → Slice 5 excision |
| First real Brain rule | DEFERRED / BLOCKED | after Slice 7 acceptance |
| Narrow SDK / Sankhya | PLANNED | after first real Brain-backed app |

---

## Slice execution board

| Slice | Purpose | State | Authorization |
| --- | --- | --- | --- |
| 0 | Planning / authority reconciliation | COMPLETE | closed |
| 1 | Source-native A→B→C | PASS | closed |
| 2 | C-020 source inspection authority | PASS | closed |
| 3 | Mastra lifecycle / message projection / PLAN read-only | PASS | closed |
| 4 | BLD-23/P-01 Product API, automatic Preview, useful Diff | AUTHORIZED / NEXT | explicit Slice-4 handoff |
| 5 | Legacy Builder excision | PLANNED / REQUIRED | blocked until Slice 4 passes |
| 6 | Remove premature Brain pre-injection + align current verify | PLANNED | not authorized |
| 7 | Real composed Product proof + operator checkpoint | PLANNED | not authorized |
| 8 | First real Brain-backed build via Mastra tools | DEFERRED | not authorized before Slice 7 |

Execution remains:

```text
explicit slice handoff
→ implement/probe only that slice
→ focused verification
→ commit/checkpoint if changed
→ STOP
→ GPT reviews
```

---

## Exact next action

Execute the authorized Slice 4 Product API and P-01 Preview/Diff
simplification. Do not start Slice 5.
