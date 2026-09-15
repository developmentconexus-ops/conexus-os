# Conexus OS roadmap

This file owns current status, allowed work and the exact next action.
`docs/tasks/builder-first-app.md` owns implementation detail.
`docs/reference/builder-c020-mastra-native.md` remains the current Builder reference, but its realization details are explicitly under revalidation by the foundation rebaseline below.
Historical Evidence and old delivery plans do not grant execution authority.

---

## Current direction — Builder Foundation Rebaseline

The operator explicitly reopened the **realization** of the ordinary Builder after live Slice-7 use exposed structural problems that green component tests did not reveal.

The Product job is now intentionally narrow:

> Build the smallest clean internal coding product in which a non-technical Metal Nobre user opens one Project, talks naturally to Conexus, sees the coding agent work in real time, receives an automatically usable Preview, continues from the exact current source, and can reload/restart without losing conversation, source or last-good Preview.

The current frontend is a **diagnostic surface**, not the final Product Experience. Do not spend foundation slices beautifying it.

The current foundation scope is:

```text
Identity / authentication
Workspace
Project
Builder
Project source custody
Compiler
ArtifactRevision / Registry
last-good Preview
```

The following remain preserved but **frozen from Product expansion** until the basic engine and later frontend rebaseline are accepted:

```text
Brain
Connections
Project business bindings
Sankhya Builder capabilities
workflows
subagents
generic task UX
advanced observational-memory UX
MCP/RAG/vector-store expansion
```

### C-020 disposition during this rebaseline

C-020's core ownership intent remains the working invariant:

```text
Mastra owns coding-harness mechanics.
Conexus owns Product/system authority that Mastra must not own.
```

However, implementation evidence has materially reopened several realization choices previously treated as settled, especially:

```text
fresh Mastra Session per BuilderRun
custom BuilderObservation protocol
custom per-BuilderRun replay/SSE feed
manual live text/tool reducers
micro-operation Git OCI boundaries
legacy Preview correlation coordinates
```

Therefore **"C-020 is ratified" must not be read as "the current realization may not be challenged"**. Slice 7R-0 exists to prove the exact installed Mastra primitives and reconcile the smallest affected authority before production refactoring proceeds.

Accepted historical facts remain evidence and invariants where still applicable; accepted implementation shape is not target authority merely because it exists.

---

## Why the reopen is justified

Live Slice-7 execution proved the basic product can work, but also falsified important realization assumptions:

- Project creation is dominated by repeated hardened `docker run` startup rather than useful Git work.
- BUILD/Code/Diff paths can multiply Git OCI executions through tree + per-file reads.
- the browser currently learns about a BuilderRun and only then attaches the custom run stream, creating delayed/backfilled streaming behavior;
- Conexus maintains a second display/event state machine over native AgentController events even though the installed Mastra line already exposes Session events and AgentController display state intended for UIs;
- dynamic Mastra Workspace support removed the original need to bind one immutable Workspace to one shared agent instance;
- Preview security mechanics are useful, but ordinary Builder launch still crosses legacy correlation concepts that no longer belong to the current Product model.

These are Global-Maximum reopen triggers under the Engineering Method: current structure is allowed to change when it preserves the root cause or duplicates authority.

---

## Target ownership model to prove

The target is deliberately smaller than the current implementation:

```text
PROJECT
│
├── Mastra coding harness
│   ├── shared AgentController
│   ├── shared coding Agent
│   ├── persistent Project Thread / messages
│   ├── Project-scoped live Session               <- hypothesis to prove in 7R-0
│   ├── native live events / display state
│   └── per BuilderRun dynamic Workspace + E2B    <- E2B lifetime remains measured, not dogma
│
└── Conexus Product authority
    ├── Account / Workspace / Project authorization
    ├── BuilderRun durability / idempotency / concurrency
    ├── ProjectWorkingState
    ├── exact Git/source custody + CAS
    ├── compiler
    ├── ArtifactRevision identity
    └── last-good Preview + serving authorization
```

No Conexus conversation store, Turn model, workflow engine, task engine, custom durable event log or second coding-harness lifecycle is authorized for the ordinary Builder.

---

## Foundation laws

Every remaining Builder slice follows these rules:

1. **Native before custom.** If the exact installed Mastra version already owns a harness mechanic, use it unless a named Product/security boundary requires an adapter.
2. **Authority is not mechanism.** Native Mastra Session/events may be reused without moving Project/source/artifact authorization into Mastra.
3. **Subtract before add.** Migrate accepted callers, prove the successor, then delete the parallel path.
4. **Measure before optimizing.** Performance work begins with a complete bounded waterfall, not guessed caching/pooling.
5. **Logical operation over micro-operation.** Expensive isolation boundaries should align with a logical source transaction, not every tiny Git command.
6. **Frontend is frozen as Product design.** Foundation slices may alter the diagnostic UI only when required to prove engine behavior.
7. **No speculative platform expansion.** Brain/Sankhya/workflow/subagent capability remains blocked until the basic engine is accepted.
8. **One slice at a time.** Each slice gets an exact handoff, implementation/probe, fresh proof, commit + push when changed, STOP, then independent review before the next slice.
9. **Published migrations are immutable.** Schema corrections are forward-only.
10. **Do not protect old code from evidence.** Existing code/tests/docs are evidence, not authority by existence.

---

## Preserved checkpoints

These checkpoints remain useful evidence. Their named invariants survive unless a later slice produces a material falsifier.

| Checkpoint | Status | Preserved fact |
| --- | --- | --- |
| Slice 1 — `e56dcec3c6125bd1d812a6645ded5a35418118ad` | PASS | source-native A→B→C continuity; immutable `refs/conexus/sources/<oid>`; ordinary mutation bounded to `app/**` |
| Slice 2 — `df762d525d27b4aaf85d4de5ba5fa1fe2e806958` | PASS | exact current/last-good/latest-code-change source inspection authority |
| Slice 3 — `58d53fa908eb954bc6cb756a706f377eba8fe53b` | PASS / historical realization partly reopened | persistent Project Thread/message proof and true PLAN read-only behavior remain valuable; per-run Session realization is reopened |
| Slice 4 — `e644958c90c3a76a4d820842034059e145d1fcf3` | PASS / Product proof | server-owned Preview truth and latest code-changing Diff basis remain useful |
| Slice 5 — `999904f12dc185592c1a738920624e1cfc8439f2` | PASS | Change-era ordinary Builder lifecycle excised from current runtime |
| Slice 6 | PASS / CLOSED | premature Brain pre-injection removed; current verification graph rebaselined |
| Slice 7A — branch checkpoint `0834f182d00d3fa803ac9f9590511514256da1ba` | FUNCTIONAL EVIDENCE | real SOURCE_CHANGED → compiler → Registry → settlement → PREVIEW_READY succeeded; native dynamic Workspace worked; this is evidence, not final architecture |

---

## Foundation rebaseline board

| Slice | Purpose | Expected outcome | State / authorization |
| --- | --- | --- | --- |
| **7R-0** | Exact Mastra-native proof + authority reconciliation | prove what `@mastra/core@1.63.2` already owns; decide stable Project Session vs per-run Session; define exact deletion boundary before production refactor | **AUTHORIZED / NEXT** |
| **7R-1** | Native Project Session + streaming convergence | one Project Session/Thread, stream connected before send, native-shaped Session/display events behind a thin Conexus auth/disclosure boundary; delete parallel observation stack after proof | BLOCKED on 7R-0 |
| **7R-2** | Runtime waterfall / measurement baseline | quantitative end-to-end timing and expensive-boundary census for Project create, BUILD, streaming, Code/Diff and Preview; no optimization yet | BLOCKED on 7R-1 |
| **7R-3** | Source/Git logical transaction rebase | one logical source operation approximates one hardened OCI execution; remove N+1 source reads; server-side snapshot/diff primitives | BLOCKED on 7R-2 |
| **7R-4** | Preview runtime rebase | source/artifact-native Preview with current security guarantees and no fake Change-era ordinary coordinates | BLOCKED on 7R-3 |
| **7R-5** | Engine composed proof | prove create/build/continue/response-only/failure-repair/restart/concurrency/Code/Diff/Preview/reconnect on the final engine | BLOCKED on 7R-4 |
| **7U** | Frontend Product rebaseline | deliberately redesign/rebuild Product Experience using the accepted engine plus wireframe/Mitra/Mastra Code/Studio references | BLOCKED on 7R-5 |
| **8** | First real business capability / Brain-Sankhya path | narrow capability added only after the basic Builder engine and Product surface are accepted | DEFERRED / NOT AUTHORIZED |

`docs/tasks/builder-first-app.md` defines each slice's expected result, candidate keep/refactor/delete set, falsifiers, proof and stop law.

---

## Rebaseline hypotheses — not yet mandates

The following are the current best hypotheses and must be proven rather than inherited as truth:

### H1 — Project Session lifetime

Preferred target:

```text
Project
└── stable live Mastra Session + persistent Thread

BuilderRun N
├── fresh RequestContext
├── dynamic Workspace
└── fresh E2B initially
```

7R-0 must prove the exact installed version supports repeated Workspace isolation and conversation continuity safely. If not, STOP with the exact missing primitive; do not silently upgrade Mastra or recreate the same behavior in Conexus.

### H2 — Native display/stream semantics

Preferred target:

```text
native Mastra Session events / display state
→ Conexus Project authorization + disclosure/sanitization only
→ browser diagnostic renderer
```

The current custom `BuilderObservation` lifecycle is a deletion candidate, not a protected contract.

### H3 — Thin adapter before direct Mastra HTTP adoption

The preferred first convergence is to keep Conexus Fastify/session/CSRF/Project authority and expose native-shaped Mastra state/events through a thin authenticated adapter. Direct adoption of official Mastra server/client routes remains an option only if later evidence removes more code without weakening Conexus authority.

### H4 — Git isolation granularity

Keep the hardened isolation/security properties; challenge the one-container-per-micro-operation realization. First batch logical transactions. Do not build a warm pool/daemon unless 7R-2 measurements show batching is insufficient.

### H5 — E2B lifetime

Fresh coding E2B per BuilderRun and separate compiler E2B remain **MEASURE**, not permanent law. Do not merge them or make them warm until timings and security/lifecycle evidence justify the change.

---

## Product completion target before frontend rebaseline

The engine is not accepted until the following behavior is real without relying on frontend polish:

```text
create Project
→ open Project
→ Project Session is ready and live stream established
→ "crie uma calculadora"
→ text/tool activity is observable while it happens
→ exact source changes
→ compiler succeeds
→ ArtifactRevision retained
→ Preview updates automatically and works
→ "adicione histórico"
→ same Project conversation, exact current source as base
→ second Preview works
→ "como você implementou o histórico?"
→ RESPONSE_ONLY, zero source mutation
→ reload / Hub restart
→ conversation + working source + last-good Preview remain coherent
→ continue editing normally
```

A compile-failure proof must additionally show:

```text
working source = failed new source
last-good Preview = previous successful artifact
next BUILD starts from the failed working source and can repair it
```

---

## Review / execution protocol

For every 7R/7U slice:

```text
read roadmap + current task
→ state protected result and falsifier
→ inspect exact current code/framework evidence
→ implement/probe only the authorized slice
→ run focused proof
→ run broader proof required by the slice
→ commit + PUSH if the slice changed tracked code/docs
→ STOP
→ GPT reviews actual remote diff/evidence
→ operator authorizes next slice
```

A slice must not opportunistically fix findings belonging to later slices unless the current protected result cannot be decided without them.

---

## Exact next action

Execute **7R-0 only — Exact Mastra-native proof + authority reconciliation**.

7R-0 is primarily a proof/reconciliation slice. It must inspect the exact installed `@mastra/core@1.63.2` embedded docs/source first, then compare current Conexus runtime with the native AgentController/Session/Workspace/event/display primitives. It may add bounded deterministic qualification/probe code required to falsify the target, but it must **not** yet delete the observation stack, optimize Git, redesign Preview, redesign the frontend, upgrade Mastra, or start Brain/Sankhya.

STOP after the 7R-0 proof and owner reconciliation. 7R-1 requires a separate operator authorization.
