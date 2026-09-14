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

## Slice 3 review

Reviewed implementation:

```text
9660b097a80c1f4c5ca522a215314e10aa55be70
```

Accepted implementation pieces:

```text
native per-run AgentController.deleteSession
persistent Project Thread preserved
ordinary PLAN skips host-side starter materialization
PLAN native mutation-tool allowlist remains read-only
shared/fallback coding-agent base instructions share one owner
Product mapper recognizes Mastra signal/user as Product user
```

### Exact-version blocker / corrected premise

The first bounded-fix handoff incorrectly required:

```text
Memory.recall({ hideSignals: false })
```

Exact installed `@mastra/core 1.63.2` / Memory typings do not expose `hideSignals` on this API surface. Codex correctly stopped rather than casting around the installed contract.

The Product invariant is **not** “use `hideSignals:false`”. The invariant is:

```text
same Memory.recall path used by production
must return enough persisted conversation data
for the operator message to project as Product user
```

Therefore Slice 3 remains `REVIEW / EXACT RECALL PROBE REQUIRED`.

Next proof must call the production-shaped `Memory.recall` with only exact installed options and observe the returned persisted message shape before any production change is made.

If the operator message is present and projects correctly, production needs no recall-code change; only the test was wrong.

If it is absent or transformed incompatibly, stop with exact installed source/types and returned message evidence. Do not cast, monkey-patch, add a conversation store, or invent another Session manager.

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
| C-020 implementation | IN PROGRESS / REVIEW-GATED | close Slice 3, then Slices 4–7 |
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
| 3 | Mastra lifecycle / message projection / PLAN read-only | **REVIEW / EXACT RECALL PROBE REQUIRED** | **only explicit Slice-3 recall probe/fix** |
| 4 | BLD-23/P-01 Product API, automatic Preview, useful Diff | PLANNED | not authorized |
| 5 | Legacy Builder excision | PLANNED / REQUIRED | not authorized |
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

Run the explicit **Slice-3 exact Memory.recall probe**.

Required first branch:

```text
real Session.sendMessage
→ production-shaped Memory.recall(threadId, resourceId, page, perPage)
→ inspect exact returned role/type/content
```

If the real operator message is present and `projectBuilderMessages` maps it to `user`, update the focused test only and close Slice 3.

If not, STOP with exact installed API/source evidence before changing production.

Slice 4 remains blocked.
