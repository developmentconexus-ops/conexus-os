# Conexus OS roadmap

This file owns only mutable stage/status, allowed work, and the exact next action.

Current program plan: [`tasks/builder-first-app.md`](tasks/builder-first-app.md)  
Current slice task: [`tasks/builder-7r-2-runtime-waterfall.md`](tasks/builder-7r-2-runtime-waterfall.md)  
Current Builder technical owner: [`reference/builder-c020-mastra-native.md`](reference/builder-c020-mastra-native.md)

Historical Evidence and old delivery plans do not grant execution authority.

---

## Current direction

**Builder Foundation Rebaseline** remains current.

The Product objective is the smallest clean internal coding product in which a non-technical Metal Nobre user opens one Project, talks naturally to Conexus, sees the coding agent work, receives an automatically usable Preview, continues from exact current source, and can reload/restart without losing conversation, working source, or last-good Preview.

The current frontend remains a **Diagnostic UI** until the foundation engine is accepted.

## Current state

- **7R-0:** CLOSED.
- **7R-1:** **ACCEPTED / INDEPENDENT REVIEW PASS**. Initial implementation `3276f8fbf3ae8a38f6d0cab43fe540df221ebee9`; accepted live-transport correction `fb1b1d4fe77e5a60e1d8bf78adacbf1e11ffad57`.
- **7R1-LIVE-01:** CLOSED. Browser reconnect/resync uses current native state without replay.
- **7R-2:** **BASELINE CAPTURED / INDEPENDENT REVIEW PENDING**. P1/P2/P3 passed, and the retained artifact records the current S1-S6 waterfall with explicit partial/inconclusive buckets.
- 7R-3, 7R-4, 7R-5, 7U and business-capability expansion remain blocked/deferred.

7R-1 acceptance came from independent review and owner reconciliation. Executor-written status never grants acceptance by itself.

## Foundation rebaseline board

| Slice | Purpose | State |
| --- | --- | --- |
| **7R-0** | exact Mastra-native proof + authority reconciliation | **CLOSED** |
| **7R-1** | native live-state/streaming convergence and deletion of the parallel observation lifecycle | **ACCEPTED** |
| **7R-2** | runtime waterfall and quantitative measurement baseline | **BASELINE CAPTURED / INDEPENDENT REVIEW PENDING** |
| **7R-3** | source/Git logical transaction rebase, driven by 7R-2 evidence | **BLOCKED** |
| **7R-4** | Preview runtime rebase | **BLOCKED** |
| **7R-5** | final engine composed proof | **BLOCKED** |
| **7U** | frontend Product rebaseline | **BLOCKED** |
| **8** | first narrow Brain/Sankhya business capability | **DEFERRED** |

## 7R-1 accepted result

```text
persistent Project Thread/messages
+ fresh scoped Session per BuilderRun
+ native Session.displayState / display_state_changed
→ thin Conexus authorization + safe disclosure boundary
→ browser current-state replacement and reconnect
```

No Conexus replay log, generation/sequence cursor, observation feed, custom Session registry, second conversation store or second tool/text lifecycle is current.

## 7R-2 plan

The task [`tasks/builder-7r-2-runtime-waterfall.md`](tasks/builder-7r-2-runtime-waterfall.md) is the execution/review contract.

Its protected result remains a reproducible quantitative baseline for the current engine covering:

```text
Project create
Builder BUILD
live attach / first visible activity
RESPONSE_ONLY control
Code
Diff
compiler
Preview readiness
```

The task measures current boundaries and retains raw samples plus an expensive-boundary census. It does **not** optimize them.

Historical hypotheses such as repeated hardened Git containers, source-read N+1, fresh coding E2B or fresh compiler E2B remain hypotheses until the baseline quantifies their cost.

### 7R2-PROBE-01 — completed pre-baseline gate

The stopped execution at `bd66ae48719028d9d01faa4ed58d3859ca431e7c` produced no admissible `baseline.json`.

The deciding Evidence is currently:

```text
Git probe > 10 s
≠ proof that Git/runtime environment is invalid

compiler E2B
= three real fresh-sandbox completions (~3.1–6.5 s)

first coding composition
= invalid because persistent Project Thread was absent

corrected manually composed coding harness
= unresolved > 5 min with no active provider connection observed
```

That last result does not yet distinguish:

```text
qualification harness defect
vs
external environment/provider/direct-runtime defect
vs
exact C-020 Product-composition defect
```

The corrected P2 composition and the exact Product P3 composition both passed. The gate is therefore open, and the retained `qualification/7r2/builder-runtime-waterfall/baseline.json` contains the resulting S1–S6 measurements with unresolved buckets called out explicitly.

The intended controls are:

```text
P1 real hardened Git path with Product timeout semantics
P2 existing direct live coding-runtime proof
P3 exact current C-020 Product composition via createConfiguredBuilderModule/current Product path
P4 bounded qualification-only phase timing only if still necessary
```

If P2 and P3 pass, the pre-baseline gate passes and 7R-2 may continue directly into S1–S6 without a new Product-design decision. If P2 fails, or P2 passes while P3 fails, STOP according to the task disposition instead of repairing architecture inside a performance slice.

## Current grant

The operator authorized **7R2-PROBE-01 plus automatic continuation into S1–S6 only if the pre-baseline gate passes**.

The executor must:

```text
read AGENTS.md
→ read this roadmap
→ read .agents/skills/conexus-development/SKILL.md
→ read .agents/skills/conexus-development/references/slice-lifecycle.md
→ read docs/tasks/builder-7r-2-runtime-waterfall.md
→ read owners named by the task
→ preserve existing local qualification/7r2 working evidence
→ do not reset/clean untracked work
→ execute P1/P2/P3 in order
→ use P4 only if still required to discriminate the cause
→ if PRE-BASELINE GATE PASS: continue S1-S6 measurement only
→ if direct runtime/environment is blocked: STOP with exact evidence
→ if direct runtime passes but exact C-020 composition fails: STOP and reopen smallest technical owner
→ never optimize 7R-3 concerns inside 7R-2
→ produce baseline.json only from valid retained samples
→ run required verification
→ commit + push
→ STOP for independent review
```

No 7R-3 optimization may be bundled into 7R-2.

## Foundation freeze

Until the basic engine reaches the later acceptance gate, preserve but do not expand:

```text
Brain
Connections
Project business bindings
Sankhya Builder capabilities
managed workflows
subagents
generic task UX
advanced observational-memory UX
MCP/RAG/vector-store capability
```

The Diagnostic UI may change only when a foundation slice requires it for truthful proof.

## Exact next action

**Review the retained 7R-2 measurement package from [`tasks/builder-7r-2-runtime-waterfall.md`](tasks/builder-7r-2-runtime-waterfall.md) and `qualification/7r2/builder-runtime-waterfall/`. No optimization is granted; 7R-3 remains blocked pending independent review.**

Do not optimize or start 7R-3.
