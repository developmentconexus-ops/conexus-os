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

### Slice 3 — PASS / CLOSED

Accepted checkpoint:

```text
58d53fa908eb954bc6cb756a706f377eba8fe53b
```

Focused proof:

```text
builder-session-projection: 1/1
builder-plan-starter: 1/1
Mastra lifecycle qualification: 7/7
```

Accepted facts include native per-run `deleteSession`, persistent Project Thread continuity, true PLAN read-only behavior, shared coding instructions and production-shaped Mastra message projection.

### Slice 4 — PASS / CLOSED

Accepted checkpoint:

```text
e644958c90c3a76a4d820842034059e145d1fcf3
```

Focused proof:

```text
Builder wire check: PASS
Builder browser: 2/2
Builder session projection: 1/1
PLAN starter: 1/1
Mastra lifecycle qualification: 7/7
web typecheck / Biome / git diff --check: PASS
```

Accepted facts:

```text
BLD-23 exposes latestBuilderRun and latest code-changing Diff basis
Preview truth is server-owned
Preview auto-launches before and after reload
RESPONSE_ONLY preserves the previous useful code-change Diff
current P-01/browser path has no Change-era Product dependency
```

### Slice 5 — PASS / CLOSED

Accepted functional checkpoint:

```text
999904f12dc185592c1a738920624e1cfc8439f2
```

The branch may contain later non-functional hygiene commits that do not alter the accepted Slice-5 implementation.

Focused proof:

```text
Migration PostgreSQL: 5/5
Registry PostgreSQL: 1/1
Migration selection/catalog: 6/6
Hub typecheck: PASS
Biome: PASS
git diff --check: PASS
```

Accepted facts:

```text
Change/Plan/WorkUnit/ActorRun/CodingSession current Builder lifecycle removed
legacy Findings/Evidence/verifier/PreviewPreparation surfaces removed
current Product API exposes one C-020 Builder architecture
migration 038 removes proven-dead current schema while 001–037 remain immutable
source admission is C-020-only; legacy Baseline/Change fallback is gone
Registry application path is execution-native; legacy Change entry points are gone
execution Registry functions are not executable by PUBLIC and are granted only to hub_rb_executor
IAM / Project / Registry / MAR shared primitives remain preserved
```

---

## PSTACK subtraction result

Slice 5 completed the mandatory Builder subtraction:

```text
migrate accepted callers
→ prove C-020 owns Product path
→ delete dead runtime/API/schema surface
```

Published migration history remains immutable. Historical evidence may still mention deleted Change-era concepts but does not grant current runtime authority.

---

## Delivery board

| Delivery | State | Next condition |
| --- | --- | --- |
| Repository operating model | DELIVERED | none |
| C-020 architecture | CURRENT / OPERATOR RATIFIED | reopen only on explicit trigger |
| C-020 implementation | SLICE 6B PASS / CLOSED | proceed to composed Product proof |
| P-01 Builder UI | VALIDATING / SLICE 7 NEXT | composed Product proof |
| Legacy Builder architecture | REMOVED FROM CURRENT RUNTIME | none |
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
| 4 | BLD-23/P-01 Product API, automatic Preview, useful Diff | PASS | closed |
| 5 | Legacy Builder excision | PASS | closed |
| 6 | Remove premature Brain pre-injection + align current verify | PASS / CLOSED | current verification graph green |
| 7 | Real composed Product proof + operator checkpoint | AUTHORIZED / NEXT | explicit Slice-7 handoff |
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

Execute Slice 7: prove the real composed current Product journey and operator checkpoint.
