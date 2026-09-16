# Conexus OS roadmap

This file owns only mutable stage/status, allowed work, and the exact next action.

Current program plan: [`tasks/builder-first-app.md`](tasks/builder-first-app.md)  
Current completed slice task: [`tasks/builder-7r-1-native-live.md`](tasks/builder-7r-1-native-live.md)  
Current Builder technical owner: [`reference/builder-c020-mastra-native.md`](reference/builder-c020-mastra-native.md)

Historical Evidence and old delivery plans do not grant execution authority.

---

## Current direction

**Builder Foundation Rebaseline** remains current.

The Product objective is the smallest clean internal coding product in which a non-technical Metal Nobre user opens one Project, talks naturally to Conexus, sees the coding agent work, receives an automatically usable Preview, continues from exact current source, and can reload/restart without losing conversation, working source, or last-good Preview.

The current frontend remains a **Diagnostic UI** until the foundation engine is accepted.

## Current state

- **7R-0:** CLOSED. Exact `@mastra/core@1.63.2` investigation reconciled Session/Thread/Workspace/display-state ownership into C-020.
- **7R-1:** **ACCEPTED / INDEPENDENT REVIEW PASS**. Initial implementation `3276f8fbf3ae8a38f6d0cab43fe540df221ebee9`; bounded live-transport correction `fb1b1d4fe77e5a60e1d8bf78adacbf1e11ffad57`.
- **7R1-LIVE-01:** CLOSED. The browser retries transient Session unavailability and resynchronizes current native state after unexpected stream termination without replay.
- **7R-2:** **PLANNING AUTHORIZED / IMPLEMENTATION BLOCKED**.
- 7R-3, 7R-4, 7R-5, 7U and business-capability expansion remain blocked/deferred according to the board below.

The executor's correction commit wrote `ACCEPTED` before independent review. That wording did not grant acceptance. Acceptance was established by the subsequent independent review and reconciled into the 7R-1 task and this status owner.

## Foundation rebaseline board

| Slice | Purpose | State |
| --- | --- | --- |
| **7R-0** | exact Mastra-native proof + authority reconciliation | **CLOSED** |
| **7R-1** | native live-state/streaming convergence and deletion of the parallel observation lifecycle | **ACCEPTED** |
| **7R-2** | runtime waterfall and quantitative measurement baseline | **PLANNING AUTHORIZED / IMPLEMENTATION BLOCKED** |
| **7R-3** | source/Git logical transaction rebase | **BLOCKED** |
| **7R-4** | Preview runtime rebase | **BLOCKED** |
| **7R-5** | final engine composed proof | **BLOCKED** |
| **7U** | frontend Product rebaseline | **BLOCKED** |
| **8** | first narrow Brain/Sankhya business capability | **DEFERRED** |

## 7R-1 accepted result

The accepted ordinary live path is:

```text
persistent Project Thread/messages
+ fresh scoped Session per BuilderRun
+ native Session.displayState / display_state_changed
→ thin Conexus authorization + safe disclosure boundary
→ browser current-state replacement
```

No Conexus replay log, generation/sequence cursor, observation feed, custom Session registry, second conversation store or second tool/text lifecycle is current.

The reconnect correction remains transport-only. It did not change C-020 Product authority or the Mastra runtime ownership model.

## Current grant — 7R-2 planning only

Planning may now investigate and close the dedicated 7R-2 measurement task.

Planning must:

- start from the current Product objective and accepted C-020/7R-1 architecture;
- treat current implementation and historical performance hypotheses as Evidence, not predetermined conclusions;
- use PSTACK/Poteto and measure before selecting optimizations;
- identify the complete bounded runtime waterfall and expensive-boundary census to measure;
- define exact instrumentation/proof and falsifiers;
- create one dedicated `docs/tasks/builder-7r-2-*.md` owner when the plan is closed;
- update this roadmap to point to that task while keeping Product implementation blocked.

Planning must not optimize Git/source, change E2B lifetime, redesign Preview, redesign the frontend, add Brain/Sankhya capability, upgrade Mastra, or implement any 7R-2 Product/runtime change.

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

**Use PSTACK/Poteto to plan 7R-2 only. Produce the dedicated runtime-waterfall measurement task before any implementation authorization.**

Do not implement 7R-2 yet.