# Conexus OS roadmap

This file owns current status, allowed work and the exact next action.
`docs/tasks/builder-first-app.md` owns implementation detail.
`docs/reference/builder-c020-mastra-native.md` owns the current ordinary Builder architecture.
Historical Evidence and old delivery plans do not grant execution authority.

## Current direction

Build the internal Metal Nobre MVP before widening the platform.

The ordinary Builder job is:

```text
open/create Project
→ Build
→ persistent Project conversation
→ coding agent works on current Project source
→ successful build updates Preview automatically
→ continue the same conversation and source
```

The final ordinary implementation must have **one Builder model**, not a permanent
C-020 path beside a Change-era path.

Mastra owns coding-harness mechanics already provided by the framework:

```text
shared AgentController
shared createCodingAgent
persistent Thread/messages
live Session
Workspace tools
BUILD/PLAN modes
assistant/tool events
```

Conexus owns only Product/system authority that Mastra must not decide:

```text
Project authorization
BuilderRun durable execution facts
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
A → B → C works through source-native custody
refs/conexus/sources/<oid> owns retained source reachability
canonical refs/heads/main does not move with Builder edits
transport bundles remain runtime-compatible
ordinary source mutation boundary = app/**
ordinary BuilderRun does not fabricate Change source coordinates
```

### Slice 2 — PASS

Accepted implementation:

```text
df762d525d27b4aaf85d4de5ba5fa1fe2e806958
```

Accepted facts:

```text
migration 037 is forward-only
working source is inspectable
last-good Preview source is inspectable
latest code-changing BuilderRun base/result are inspectable
later RESPONSE_ONLY does not erase useful Diff basis
arbitrary/stale unrelated OIDs remain refused
source-read authority remains server-owned
legacy source fallback remains temporary compatibility only
```

The Slice-2 implementation added the minimum `read_latest_code_changing_builder_run`
projection and kept direct Builder table access away from ingress callers.

---

## PSTACK subtraction decision — legacy must leave the final runtime

The operator explicitly prefers the final C-020 implementation to be short and
clean rather than permanently carrying two Builder architectures.

That matches PSTACK/Poteto:

```text
migrate accepted callers
→ prove ordinary Product no longer depends on legacy
→ delete legacy runtime/API/schema surface
```

Therefore the following are **temporary compatibility debt**, not permanent
architecture:

```text
Change
Plan
WorkUnit
ActorRun
CodingSession
Findings / verification Evidence
legacy Builder snapshots/routes
legacy Change custody
legacy verification/correction pipeline
legacy PreviewPreparation
legacy source-read fallback
legacy working-state Change/preparation coordinates
```

Important migration law:

- published migration files are immutable history and remain in the repository;
- do not rewrite historical migration bytes or ledger digests;
- after callers are migrated, a forward cleanup migration may drop current
  legacy tables/functions/columns;
- runtime/routes/contracts/tests for dead legacy behavior should be deleted, not
  merely marked deprecated.

The cleanup is intentionally after Product caller migration (Slice 4), so
subtraction does not break an accepted caller by accident.

---

## Delivery board

| Delivery | State | Current truth | Next condition |
| --- | --- | --- | --- |
| Repository operating model | DELIVERED | Review-gated slices and current-objective verification are the operating model | No prerequisite work |
| C-020 architecture | CURRENT / OPERATOR RATIFIED | Project + Mastra Thread/Messages + BuilderRun + Working Source + last-good Preview | Reopen only on explicit C-020 trigger |
| C-020 implementation | IN PROGRESS / REVIEW-GATED | Slices 1–2 accepted | Complete Slices 3–7 with GPT review between each |
| P-01 Builder UI | VALIDATING | Shell exists; Product semantics still need Slice 4 | Slice 4 + Slice 7 |
| Legacy Builder architecture | MIGRATING TO DELETE | Still present in routes/store/service/source/schema for historical callers | Slice 4 migrates final callers; Slice 5 excises it |
| First real Brain rule | DEFERRED / BLOCKED | Core first; exact business rule authority still required | Slice 8 after Slice 7 acceptance |
| Narrow SDK / Sankhya | PLANNED | Not part of current Builder correction | After first real Brain-backed app |
| Colleague use | PLANNED | Not needed before operator accepts Builder | After operator acceptance |

`DELIVERED` requires observable Product behavior, not only green isolated tests.

---

## Slice execution board

| Slice | Purpose | State | Authorization |
| --- | --- | --- | --- |
| **Slice 0** | Planning / authority reconciliation | COMPLETE | Complete |
| **Slice 1** | Source-native A→B→C continuity | **PASS** | Closed |
| **Slice 2** | C-020 source inspection authority | **PASS** | Closed |
| **Slice 3** | Mastra Session lifecycle, message projection, PLAN read-only | **PLANNED / NEXT** | Not authorized until explicit Slice-3 handoff |
| **Slice 4** | BLD-23/P-01 Product API, automatic Preview and useful Diff | PLANNED | Not authorized |
| **Slice 5** | **Legacy Builder excision** after final caller migration | PLANNED / REQUIRED | Not authorized |
| **Slice 6** | Remove premature Brain pre-injection + align current verification | PLANNED | Not authorized |
| **Slice 7** | Real composed Product proof + operator-ready checkpoint | PLANNED | Not authorized |
| **Slice 8** | First real Brain-backed build through Mastra tools | DEFERRED | Not authorized before Slice 7 acceptance |

Execution remains one slice at a time:

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

## Legacy excision acceptance target (Slice 5)

Slice 5 is not a cosmetic cleanup. It must remove dead architecture after Slice
4 has migrated the final Product callers.

Target current runtime/API code must no longer own or expose ordinary concepts
such as:

```text
ChangeProjection / BuilderSnapshot
createChange / claimChange / correction / verifier pipeline
/session/turns legacy routes
Findings/Evidence legacy routes
legacy prepareSource/prepareCandidate/admitCandidate custody path
PreviewPreparation as ordinary Builder flow
activeTurn as Change-derived session state
```

Target current database after a forward cleanup migration must not retain legacy
Builder tables/functions/columns that have no accepted caller.

Exact drop scope is determined from a caller census at the beginning of Slice 5;
no legacy object survives merely because deleting it is inconvenient.

Historical migration files remain unchanged so existing databases can upgrade
through history into the cleaned current schema.

---

## PSTACK / Poteto execution laws

```text
fix root cause
subtract before add
prefer native Mastra mechanics
one Product authority per concept
reuse proven E2B/Git/compiler/Registry/security pieces
migrate callers then delete dead architecture
smallest independently reviewable slice
proof matching the claim
no green-by-mock claim for a live Product journey
```

Do not open another Arena or architecture program for ordinary implementation defects.

---

## Known correction map

```text
Slice 3 → native Mastra Session lifecycle + real message projection + PLAN no mutation
Slice 4 → server-owned BLD-23/Preview/Diff Product surface and migrate final ordinary callers
Slice 5 → delete Change-era runtime/routes/contracts/schema after caller proof
Slice 6 → remove pre-query Brain prompt injection + make current verify prove C-020
Slice 7 → real Hub/Web/DB/Mastra/E2B/Git/compiler/Registry/Preview journey
Slice 8 → real Brain tools/rule only after core acceptance
```

---

## Exact next action

**No implementation beyond Slice 2 is authorized by this roadmap update alone.**

GPT/operator will issue a separate explicit **Slice 3 handoff**.

Slice 3 must not perform the full legacy deletion; it may simplify code it
already touches where the legacy branch is provably dead, but broad excision is
review-gated to Slice 5 after Product caller migration.

Do not start Slice 4+, Brain or Sankhya from this roadmap alone.
