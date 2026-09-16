# Conexus OS roadmap

This file owns only mutable stage/status, allowed work, and the exact next action.

Current program plan: [`tasks/builder-first-app.md`](tasks/builder-first-app.md)  
Current slice task: [`tasks/builder-7r-1-native-live.md`](tasks/builder-7r-1-native-live.md)  
Current Builder technical owner: [`reference/builder-c020-mastra-native.md`](reference/builder-c020-mastra-native.md)

Historical Evidence and old delivery plans do not grant execution authority.

---

## Current direction

**Builder Foundation Rebaseline** remains current.

The Product objective is the smallest clean internal coding product in which a non-technical Metal Nobre user opens one Project, talks naturally to Conexus, sees the coding agent work, receives an automatically usable Preview, continues from exact current source, and can reload/restart without losing conversation, working source, or last-good Preview.

The current frontend remains a **Diagnostic UI** until the foundation engine is accepted.

## Current state

- **7R-0:** CLOSED. Exact `@mastra/core@1.63.2` investigation reconciled the Session/Thread/Workspace/display-state boundary into the current C-020 technical owner.
- **7R-1:** implementation candidate exists at `3276f8fbf3ae8a38f6d0cab43fe540df221ebee9`; **REVIEW PENDING / NOT ACCEPTED**.
- **7R-2:** BLOCKED until 7R-1 review is adjudicated and the next task is planned.
- No 7R-2 Product implementation, Git optimization, Preview rebase, frontend redesign, Brain/Sankhya expansion, workflow expansion, or Mastra upgrade is authorized now.

## Foundation rebaseline board

| Slice | Purpose | State |
| --- | --- | --- |
| **7R-0** | exact Mastra-native proof + authority reconciliation | **CLOSED** |
| **7R-1** | native live-state/streaming convergence and deletion of the parallel observation lifecycle | **CANDIDATE AT `3276f8f...` / REVIEW PENDING** |
| **7R-2** | runtime waterfall and quantitative measurement baseline | **BLOCKED** |
| **7R-3** | source/Git logical transaction rebase | **BLOCKED** |
| **7R-4** | Preview runtime rebase | **BLOCKED** |
| **7R-5** | final engine composed proof | **BLOCKED** |
| **7U** | frontend Product rebaseline | **BLOCKED** |
| **8** | first narrow Brain/Sankhya business capability | **DEFERRED** |

## Current grant

The next activity is **independent review of the 7R-1 remote candidate only**.

Review authority:

```text
AGENTS.md
→ this roadmap
→ docs/tasks/builder-7r-1-native-live.md
→ owners named by that task
→ actual remote candidate + proof
```

The review is read-only for Product implementation. It may update status/owners only after the review conclusion requires that reconciliation.

Do not fix Product code during review.

## Review disposition

The 7R-1 review ends in one of three states.

### PASS

- reconcile any remaining accepted owner/document drift;
- mark 7R-1 accepted in this roadmap;
- use PSTACK/Poteto to plan 7R-2;
- create `docs/tasks/builder-7r-2-*.md` before any 7R-2 Product edit;
- require a separate operator authorization for 7R-2 implementation.

### CORRECTION REQUIRED

- record the smallest failing invariant and required correction in the existing 7R-1 task;
- keep 7R-2 blocked;
- require explicit operator authorization before the executor changes Product code.

### REPLAN

- reopen the smallest semantic/technical owner falsified by evidence;
- keep 7R-2 blocked;
- do not patch around the contradiction.

## Freeze

Until 7R-1 is accepted, preserve but do not expand:

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

**Review 7R-1 candidate `3276f8fbf3ae8a38f6d0cab43fe540df221ebee9` against [`tasks/builder-7r-1-native-live.md`](tasks/builder-7r-1-native-live.md).**

Do not implement a correction and do not plan/execute 7R-2 inside the review.
