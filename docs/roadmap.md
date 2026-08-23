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
| 4A — Product Surface & Authority Contract | CLOSED / OPERATOR RATIFIED / `F04`+`F05` RECOMPILED | `N_platform=113` | Interaction Evidence proves missing Product meaning/authority |
| 4B — Executable Wire Contract | CLOSED / OPERATOR RATIFIED / INTEGRATED / `F04`+`F05` RECOMPILED | `113↔113`; Project=23; Brain=11; Connections=9 | 4A change or wire/proof falsifier |
| 4C — Frontend Interaction & Authority Realization | OPEN / `GF-01 LOCKED` / `W-01 LOCKED` / `W-02 OPEN` / `F04 GREEN` / `F05 GREEN` / `F06 OPERATOR GATE` | Human interactions close with zero invented frontend authority | Material 4A/4B gap or incoherent interaction |
| 4D — Project Paved Road & Runtime Realization | NOT STARTED | Runtime/Paved Road contract ratified | Accepted property requires authority change |
| 4E — Whole-System Coherence & Golden Flows | NOT STARTED | Whole system composes into falsifiable flows | Composed-flow contradiction |
| 4F — Implementation Program & Execution Graph | NOT STARTED | Implementation/proof graph rederived | Contracts require different graph |
| 4G — Adversarial Implementation Readiness | NOT STARTED | Fresh challenge leaves no material finding | Material readiness finding |
| Product implementation | BLOCKED | Requires 4A–4G + explicit operator grant | No historical grant carries forward |

```text
4A = CLOSED / N_platform=113 / F04+F05 RECOMPILED
4B = CLOSED / 113↔113 / Project=23 / Brain=11 / Connections=9 / F04+F05 RECOMPILED
4C = OPEN / GF-01 LOCKED / W-01 LOCKED / W-02 OPEN / F04 GREEN / F05 GREEN / F06 OPERATOR GATE
4D–4G = NOT STARTED
Product implementation = BLOCKED
```

## Current W-02 state

```text
W-02A = Workspace Brain
W-02B = Connections
```

`F04` confirmed logical Connection as human-identity owner (`Connection.name`). `F05` confirmed Brain/`BRN-07` as proposal-intake owner and admitted source-backed + Discovery-backed intake without a new operation/owner.

### F06 — Brain exact review-content inspectability — OPERATOR GATE

Current exact Brain detail reads expose identity/state/provenance but no human-readable content for the exact source revision/candidate:

```text
BRN-03 → brainRevisionId + brainDigest + sourceRevision + availability
BRN-06 → proposalId + proposalRevision + candidateSourceRevision + provenanceRefs + states
```

Accepted `brain.read`/`brain.review` human work requires inspecting the meaning being reviewed. Browser-local Discovery text, direct Brain Git access and Builder Project-source reads are not valid authority substitutes.

Global-Maximum candidate:

```text
CURRENT STRUCTURE CONFIRMED
→ Brain remains source/semantic owner
→ BRN-03/BRN-06 remain the correct detail reads
→ missing property = exact source-bound human review content/projection
→ leading realization = enrich those reads; no new Product operation/domain
```

Rejected/deferred: IDs-only UX; browser Brain-Git access; Builder reuse; generic Brain source-tree/editor; generic cross-owner ReviewProjection Product domain. Reusable projection mechanics remain a possible 4D seam only after repeated locked evidence.

Evidence: [F06 finding](evidence/4c/w02-brain-review-content-finding.md) / [Global Maximum](evidence/4c/w02-brain-review-content-global-maximum.md).

## Method law

```text
smallest-owner reopen != smallest patch
```

Frontend finding → root cause → invariant → real owner → alternatives → Global Maximum/YAGNI → operator decision → selected RED → bounded recompile.

## Exact next action

**Operator adjudication of `F06`: `ACCEPT GLOBAL-MAXIMUM CANDIDATE | REVISE | REJECT`.**

If accepted, derive the exact source-bound review-projection wire in a selected-realization RED before changing 4A/4B. Do not fabricate Brain content in HTML, lock W-02, open later blocks, begin 4D, merge PR #57 or implement Product code.