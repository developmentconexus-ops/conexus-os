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
- **7R-1:** **ACCEPTED** after the bounded `7R1-LIVE-01` browser transport correction. Native display-state ownership and the safe Conexus projection remain unchanged.
- **7R1-LIVE-01 correction:** **CLOSED**. The browser retries transient Session unavailability and resynchronizes after an unexpected stream end while the BuilderRun remains active.
- **7R-2:** **PLANNING AUTHORIZED / IMPLEMENTATION BLOCKED**. No 7R-2 Product implementation is authorized in this slice.
- No 7R-2 Product implementation, Git optimization, Preview rebase, frontend redesign, Brain/Sankhya expansion, workflow expansion, or Mastra upgrade is authorized now.

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

## 7R-1 review disposition

The core architecture of candidate `3276f8f...` is retained.

Accepted candidate facts:

- custom backend observation projector/feed and `builder-observation` package were removed;
- live state comes from native Mastra Session display state;
- Session lookup uses the shared AgentController registry;
- Conexus retains only safe disclosure projection and Product authority;
- no custom replay/generation/sequence lifecycle is required;
- frontend state is snapshot replacement rather than custom delta reduction.

The blocking finding `7R1-LIVE-01` is resolved by a bounded browser transport
retry loop with backoff and per-frame safety limits.

The browser can attempt the live endpoint before the per-run Mastra Session
exists. The endpoint correctly returns `410`; the corrected client retries the
same active run. Unexpected stream termination also reconnects and receives a
fresh current snapshot. No replay or retained live history is used.

This is a bounded 7R-1 transport correction. It does not reopen C-020 and does not authorize replay/feed machinery.

## Current grant

Planning/review for the correction is closed in [`tasks/builder-7r-1-native-live.md`](tasks/builder-7r-1-native-live.md).

The operator authorized Product implementation of **`7R1-LIVE-01` only**. That
correction is complete. The executor must commit, push, and stop for
independent review. 7R-2 remains implementation-blocked.

The executor must:

```text
read AGENTS.md
→ read this roadmap
→ read docs/tasks/builder-7r-1-native-live.md
→ implement only 7R1-LIVE-01
→ run targeted browser/live proof
→ run required verification
→ commit + push
→ STOP
```

No 7R-2 work may be bundled into that correction.

## Correction disposition

After the executor returns a correction candidate, independent review ends in one of three states.

### PASS

- reconcile any remaining accepted owner/document drift;
- mark 7R-1 accepted in this roadmap;
- use PSTACK/Poteto to plan 7R-2;
- create `docs/tasks/builder-7r-2-*.md` before any 7R-2 Product edit;
- require a separate operator authorization for 7R-2 implementation.

### CORRECTION REQUIRED

- keep the smallest failing invariant in the existing 7R-1 task;
- keep 7R-2 blocked;
- require explicit operator authorization before another Product correction.

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

The Diagnostic UI may change only when the 7R-1 correction requires it for truthful native live-state behavior.

## Exact next action

**Independently review the completed `7R1-LIVE-01` correction in [`tasks/builder-7r-1-native-live.md`](tasks/builder-7r-1-native-live.md). Plan 7R-2 only after that review.**

Do not plan or execute 7R-2 yet.
