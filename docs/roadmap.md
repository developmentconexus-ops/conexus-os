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
- **7R-2:** **PLANNED / IMPLEMENTATION BLOCKED**. Dedicated task exists and owns the bounded measurement contract.
- 7R-3, 7R-4, 7R-5, 7U and business-capability expansion remain blocked/deferred.

7R-1 acceptance came from independent review and owner reconciliation. Executor-written status never grants acceptance by itself.

## Foundation rebaseline board

| Slice | Purpose | State |
| --- | --- | --- |
| **7R-0** | exact Mastra-native proof + authority reconciliation | **CLOSED** |
| **7R-1** | native live-state/streaming convergence and deletion of the parallel observation lifecycle | **ACCEPTED** |
| **7R-2** | runtime waterfall and quantitative measurement baseline | **PLANNED / IMPLEMENTATION BLOCKED** |
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

Its protected result is a reproducible quantitative baseline for the current engine covering:

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

## Current grant

Planning of 7R-2 is complete.

**7R-2 implementation is not authorized until the operator explicitly approves execution of the dedicated task.**

When authorized, the executor must:

```text
read AGENTS.md
→ read this roadmap
→ read .agents/skills/conexus-development/SKILL.md
→ read docs/tasks/builder-7r-2-runtime-waterfall.md
→ read owners named by the task
→ measure only; do not optimize
→ produce raw reproducible baseline + census
→ run required verification
→ commit + push
→ STOP
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

**Wait for operator authorization to execute 7R-2 measurement only, using [`tasks/builder-7r-2-runtime-waterfall.md`](tasks/builder-7r-2-runtime-waterfall.md).**

Do not optimize or start 7R-3.