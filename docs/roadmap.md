# Conexus OS Roadmap

This is the single current phase/status authority.

| Phase | Status | Exit condition / preserved result | Reopen trigger |
| --- | --- | --- | --- |
| 3A | CLOSED | Whole-product authority reconciled and ratified | Material Product/owner contradiction |
| 3B–3K | CLOSED | Architecture families accepted | Material invariant/boundary falsifier |
| 3L | CLOSED | Packages A/B/D closed; C/E safely deferred | Named qualification trigger |
| 3M | CLOSED | Recovery/reactivation ratified | Material recovery/topology/effect falsifier |
| 3N | CLOSED | Architecture verification survived | Material architecture falsifier |
| 3O | CLOSED | First Budget Analyzer proof contract accepted | Material contract/downstream falsifier |
| C-018 | RATIFIED / OPERATOR RATIFIED | Final Product architecture continuity ratified | Material Product/architecture falsifier |
| C-015 refinement | REFINED / KEYCLOAK SELECTED / OPERATOR APPROVED | Authentication selected; Conexus owns authorization | Material identity/security falsifier |
| Realization Planning | ACCEPTED / OPERATOR ACCEPTED | R1–R7 retained as Phase-4 input | Material Phase-4 falsifier |
| 4A — Product Surface & Authority Contract | CLOSED / `F23` RATIFIED | `122` fixed Product operations | Interaction Evidence proves missing Product meaning/authority |
| 4B — Executable Wire Contract | CLOSED / `F23` RATIFIED | `122↔122`; Project=27; Brain=13 | 4A change or wire/proof falsifier |
| 4C — Frontend Interaction & Authority Realization | OPEN / METHOD v2.3 / `GF-01..W-04 + P-01 LOCKED` / `P-02 F22+F23 P8 PRODUCT/REVIEW SEPARATED CANDIDATE / WALKTHROUGH / NOT LOCKED` | Functional blocks + P11/P12 close with zero invented frontend authority | Material 4A/4B gap or incoherent interaction |
| 4D — Project Paved Road & Runtime Realization | NOT STARTED | Runtime/Paved Road contract ratified | Accepted property requires authority change |
| 4E — Whole-System Coherence & Golden Flows | NOT STARTED | Whole system composes into falsifiable flows | Composed-flow contradiction |
| 4F — Implementation Program & Execution Graph | NOT STARTED | Implementation/proof graph rederived | Contracts require different graph |
| 4G — Adversarial Implementation Readiness | NOT STARTED | Fresh challenge leaves no material finding | Material readiness finding |
| Product implementation | BLOCKED | Requires 4A–4G + explicit operator grant | No historical grant carries forward |

```text
4A = CLOSED / F23 RATIFIED / N_platform=122
4B = CLOSED / F23 RATIFIED / 122↔122 / Project=27 / Builder=17 / Brain=13 / Connections=9 / IAM=19 / OBS=5
4C = OPEN / METHOD v2.3 / GF-01 LOCKED / W-01 LOCKED / W-02A LOCKED / W-02B LOCKED / W-03 LOCKED / W-04 LOCKED / P-01 LOCKED

F22 = RATIFIED / Project Data Explorer / PRJ-25..28 / Permissions=25
F23 = RED #987 → GREEN #993 / BRN-14 GetProjectBrainContext / 122↔122 / Brain=13 / Permissions=25

P-02 P7 = REBASELINED / OPERATOR APPROVED DESIGN
P-02 P8 base = RED #999 → GREEN #1000 / prior blob 7624694b86017c83deed661ee5ae17dc05495dc3
P-02 P8 coherence correction = RED Verify #1010 → GREEN commit 58963af84d343f26d32565f14746d2416c9c47d2 / blob bc1898682a459e532b9efaf6e549073d3ce591f3
P-02 P8 Product/Review surface separation = commit b266721c206a31a6d49abdd3e5c351b7fb4559bf / targeted Verify #1034 GREEN
4C checkpoint PR #57 = MERGED / main 619b069c73f4c0a396c9c9e820abc96fc58fbd7a / Verify #1038 GREEN
P-02 P8 = WALKTHROUGH / NOT LOCKED

Continuation readiness = GREEN / repository-governance blocker = 0
Whole/global checkpoint review = NEXT / independent Fable review of the Product-realization working model
P9/P10 = BLOCKED pending P8 LOCK
P-03+ = NOT OPEN
P11 = NOT ASSEMBLED
4D–4G = NOT STARTED
Product implementation = BLOCKED
```

Historical lock Evidence remains in the owning Screen Contracts and Evidence records; this roadmap does not duplicate those histories as mutable current-state guards.

## 4C routing

```text
P8 = functional low-fidelity HTML per material block
P9 = exact bidirectional frontend ↔ backend Screen Contract after operator P8 LOCK
P10 = pattern consolidation after LOCK
P11 = assembled interactive low-fidelity Product after all material blocks LOCK
P12 = whole-product adversarial UX + architecture walkthrough
```

## P-01 — Build workspace — LOCKED

App-first: current app + right Conexus; BUILD→BLD-03; pre-Change PLAN→BLD-16; F15 `BLD-10 GetBuildPreview(changeId?)` = `CURRENT_PROJECT | CHANGE_CANDIDATE`.

## P-02 — current rebaselined Product model

```text
Data         = facts / real authorized data
Brain        = enterprise meaning adopted/available in this exact Project
Capabilities = human-readable Product behavior contracts
Integrations = external systems/resources used through governed bindings
```

Current authority:

```text
Data         → PRJ-18/19 + PRJ-25..28 + BRN-13/12 Analyze
Brain        → BRN-14 context + PRJ-10/11/12 binding administration
Capabilities → PRJ-16/17
Integrations → PRJ-13/14/15 + purpose-bound CON-03
```

Project Brain Context is server-resolved and is neither the whole Workspace Brain nor a runtime `effectiveBrainSlice`. Workspace Brain governance remains the locked W-02A owner surface. Cross-route links require exact server-owned coordinates; Data→Brain concept and Integration→Capability maps remain deferred until a current user job and owner relation are proven.

The exact current functional P8 is the F22+F23 fixture-only walkthrough candidate with the bounded Integrations coherence correction and Product/Review surface separation. The default Product surface is human-facing; fixture selectors, wire coordinates, invariants and proof/debug markers remain available only in the closed Review controls harness. Product behavior and authority semantics were not changed by this presentation correction.

Data remains a bounded read-only physical explorer plus separate semantic meaning; Brain Context is primary and binding administration secondary; Capabilities are human-contract-first; Integrations are system-use-first.

For Integrations, current P8 may add exact Project use through `Use connection` and remove exact current use through `Stop using`. It does not infer a generic “Switch connection” relation or invent a binding `purpose`; current authority defines no integration role/slot that would make unrelated Connections interchangeable. A future proven replacement-role user job reopens the smallest owning Product decision rather than becoming frontend fixture truth.

P8 is not accepted merely because its executable proof is green.

[P-01 Screen Contract](evidence/4c/p01-build-workspace-screen-contract.md) · [P-02 surface rebaseline](evidence/4c/p02-project-surface-rebaseline.md) · [P-02 P7](evidence/4c/p02-structural-hypotheses.md) · [F22 design](evidence/4c/p02-f22-data-explorer-design.md) · [F23 decision/proof](evidence/4c/p02-f23-project-brain-context-design.md) · [Current P8 F22+F23 Evidence](evidence/4c/p02-p8-f22-f23-revision.md)

```text
smallest-owner reopen != smallest patch
```

## Continuation posture

PR #57 is integrated into `main`. This checkpoint does **not** close 4C, LOCK P-02 P8, authorize P9/P10/P-03/P11/4D+, or authorize Product implementation.

The repository is ready to continue Product planning. Do not reopen accepted Product/architecture decisions, locked frontend blocks, governance restoration, or repository process without a named material falsifier. Required CI protects objective repository/Product properties; it is not a review-ceremony gate.

The established Claude Code / AI_DIALOG / Fable review model is **whole-package and independent**. The primary/Lead session first assembles a coherent, verified meaningful package or checkpoint. Fable then receives the exact package/HEAD with fresh context, reconstructs repository authority independently, and reviews the whole result. Fable findings are Evidence, not authority; the Lead adjudicates every material finding against current authority and corrects only findings that survive. A further Fable round is required only when a surviving material correction materially changes the reviewed package or leaves a material contradiction unresolved.

### Objective of the current Fable review

This review is **not primarily asking whether P-02, the current HTML, or 4C “looks good”**. It is reviewing whether the current **Product-realization working model** has the right properties for the stage Conexus is now in.

The stage context is:

```text
Product direction / platform model        = substantially planned
technology direction                      = substantially planned
architecture / implementation readiness   = substantially planned through current accepted phases
Product operations + executable API wire  = substantially planned and closed through 4A/4B
current work                               = concretize that plan into real human interaction
```

4C therefore uses functional low-fidelity frontend as **executable Product thinking**: operate Conexus as a user, make abstract decisions tangible, validate whether the Product actually works as a human system, and expose missing jobs, truth, ownership, operations, states or relationships that earlier planning could not reveal. The frontend is a falsifier and Product-learning instrument, not the final deliverable and not authority to invent backend semantics.

Fable must evaluate concrete properties rather than answer the vague question “does the method make sense?” The current working model should:

```text
turn accepted abstract planning into coherent user behavior
keep Product progress moving instead of stopping for ceremony
surface real omissions/incoherence before implementation makes them expensive
distinguish a Product/architecture gap from a local UX/detail problem
preserve accepted decisions when interaction Evidence does not falsify them
allow the operator to experience and challenge the Product as a user
```

When interaction exposes a **material gap**, work should stop only at the smallest real owner needed to solve that gap. The gap is then analyzed through the Engineering Method rather than patched locally:

```text
Evidence / Known / Inferred / Unknown
→ Root Cause
→ Target Invariant
→ Constraints
→ credible Alternatives
→ Local vs Global Maximum
→ Essential vs Accidental Complexity
→ YAGNI / future cost
→ Authority / Proof Strategy
→ operator decision when Product meaning changes
→ bounded replan/recompile of the affected owner
→ resume Product realization
```

The desired behavior is neither “never revisit the plan” nor “replan whenever the UI feels awkward.” Fable should attack both failure modes, plus endpoint-shaped UX, HTML iteration becoming an end in itself, process/document/test growth without protected value, local-optimum decisions that harm the whole platform, and repeated review loops after no material finding survives.

A useful review result distinguishes at least:

```text
METHOD FINDING       = the working model systematically impedes or misses Product learning
PRODUCT/PLAN GAP     = interaction Evidence falsifies accepted Product/architecture meaning
LOCAL EXECUTION GAP  = real issue solvable inside the current accepted owner/block
NO FINDING           = current method/property survives challenge
```

This is not a per-file, per-HTML-edit or cosmetic review loop. Micro-iterations remain inside the primary Product-design loop. Meaningful completed packages/checkpoints receive one independent whole/global review before they are treated as a trusted continuation baseline. The mandatory whole-4C independent Fable review at 4C-14 remains the final phase-level instance of this same model.

## Exact next action

**Independent Fable whole/global review of the current Product-realization working model using the exact integrated 4C checkpoint as Evidence.** Fable should judge the concrete properties above and identify method findings, real Product/plan gaps or local execution gaps without ceremonially reopening accepted work. Lead then adjudicates every material finding. If no material method/Product gap survives, continue directly with the current P-02 operator walkthrough and keep advancing the Product block by block. If a material gap survives, apply the Engineering Method to find the Global-Maximum correction at the smallest real owner, replan/recompile that bounded scope, and resume Product realization. Do not add another review round solely because a review occurred.
