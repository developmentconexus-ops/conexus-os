# Conexus OS roadmap

This file owns current status, allowed work and the exact next action.
`docs/tasks/builder-first-app.md` owns slice implementation detail.
`docs/reference/builder-c020-mastra-native.md` owns the current ordinary Builder architecture.
Historical Evidence and published migration history do not grant execution authority.

## Current direction

Build the internal Metal Nobre MVP with one ordinary Builder model:

```text
Project
→ Mastra persistent Thread/Messages
→ BuilderRun
→ Working Source
→ last-good Preview
```

Mastra owns coding-harness mechanics. Conexus owns authorization, durable run/source truth, Git custody, compiler/artifact and Preview authority.

The final implementation must not permanently carry a parallel Change-era Builder.

---

## Accepted checkpoints

| Slice | Result | Accepted implementation |
| --- | --- | --- |
| 0 | Planning/authority reconciliation | COMPLETE |
| 1 | Source-native A→B→C continuity | PASS — `e56dcec3c6125bd1d812a6645ded5a35418118ad` |
| 2 | C-020 source inspection authority | PASS — `df762d525d27b4aaf85d4de5ba5fa1fe2e806958` |

Accepted Slice-1 facts:

```text
refs/conexus/sources/<oid> owns retained Builder source reachability
canonical refs/heads/main does not move with Builder edits
A→B→C works
ordinary mutation boundary = app/**
```

Accepted Slice-2 facts:

```text
working / last-good Preview / latest code-changing base+result are readable subjects
later RESPONSE_ONLY does not erase useful Diff basis
arbitrary/stale unrelated OIDs remain refused
migration 037 is forward-only
```

---

## Slice 3 review

Implementation reviewed:

```text
9660b097a80c1f4c5ca522a215314e10aa55be70
```

The implementation direction is accepted:

```text
native per-run AgentController.deleteSession
persistent Project Thread retained
ordinary PLAN skips host-side starter materialization
shared/fallback agent base instructions share one owner
signal/user Product mapper exists
```

One bounded proof gap remains before PASS:

```text
production BLD-23 hydration uses sessionMemory.recall(...)
current focused projection test uses session.thread.listActiveMessages()
```

This is the exact seam that originally motivated the message-projection correction.
The Product path must explicitly recall signals and the focused test must prove:

```text
Session.sendMessage
→ Memory.recall
→ projectBuilderMessages
→ operator message is Product user
```

No architecture reopen is implied.

---

## Legacy subtraction decision

PSTACK/Poteto requires one final Builder architecture, not C-020 plus permanent compatibility code.

After final Product callers migrate in Slice 4:

```text
Slice 5
→ census remaining legacy callers
→ delete dead Change/Plan/WorkUnit/ActorRun/CodingSession runtime/API/contracts/tests
→ forward cleanup migration drops dead current schema/functions/columns
```

Published migration files remain immutable history so old databases can upgrade into the cleaned current schema.

---

## Execution board

| Slice | Purpose | State | Authorization |
| --- | --- | --- | --- |
| 0 | Planning / authority reconciliation | COMPLETE | Closed |
| 1 | Source-native A→B→C | PASS | Closed |
| 2 | Source inspection authority | PASS | Closed |
| 3 | Mastra lifecycle / conversation / PLAN | **REVIEW — BOUNDED FIX REQUIRED** | **Only explicit Slice-3 bounded fix authorized** |
| 4 | BLD-23/P-01 Product API + automatic Preview + useful Diff | PLANNED | Not authorized |
| 5 | Legacy Builder excision | PLANNED / REQUIRED | Not authorized |
| 6 | Remove premature Brain pre-injection + align current verify | PLANNED | Not authorized |
| 7 | Real composed Product proof + operator checkpoint | PLANNED | Not authorized |
| 8 | First real Brain-backed build via Mastra tools | DEFERRED | Not authorized before Slice 7 acceptance |

Execution remains:

```text
explicit Slice N handoff
→ implement Slice N only
→ focused verification
→ commit/checkpoint
→ STOP
→ GPT reviews actual diff/evidence
→ next slice only after explicit authorization
```

---

## PSTACK / Poteto laws

```text
fix root cause
subtract before add
prefer native Mastra mechanics
one Product authority per concept
reuse proven E2B/Git/compiler/Registry/security pieces
migrate callers then delete dead architecture
smallest independently reviewable slice
proof must match the production path being claimed
```

---

## Exact next action

Complete the **Slice-3 bounded proof fix only**:

```text
1. make production Memory.recall explicitly retain signals required for Product projection;
2. change the focused message-projection test to use the same Memory.recall path as production;
3. prove real persisted signal/user becomes Product user and internal signals remain omitted;
4. preserve all accepted Session deletion, PLAN and instruction behavior.
```

After the bounded-fix checkpoint Codex must STOP. Slice 4 remains blocked until GPT reviews Slice 3 as PASS.
