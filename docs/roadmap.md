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
| 4C — Frontend Interaction & Authority Realization | OPEN / METHOD v2.2 REBASELINED / `GF-01 LOCKED` / `W-01 LOCKED` / `W-02 OPEN` / `F04 GREEN` / `F05 GREEN` / `F06 OPERATOR ACCEPTED` / `F06 SELECTED REALIZATION RED` | Functional block interactions + P11/P12 closure with zero invented frontend authority | Material 4A/4B gap or incoherent interaction |
| 4D — Project Paved Road & Runtime Realization | NOT STARTED | Runtime/Paved Road contract ratified | Accepted property requires authority change |
| 4E — Whole-System Coherence & Golden Flows | NOT STARTED | Whole system composes into falsifiable flows | Composed-flow contradiction |
| 4F — Implementation Program & Execution Graph | NOT STARTED | Implementation/proof graph rederived | Contracts require different graph |
| 4G — Adversarial Implementation Readiness | NOT STARTED | Fresh challenge leaves no material finding | Material readiness finding |
| Product implementation | BLOCKED | Requires 4A–4G + explicit operator grant | No historical grant carries forward |

```text
4A = CLOSED / N_platform=113 / F04+F05 RECOMPILED
4B = CLOSED / 113↔113 / Project=23 / Brain=11 / Connections=9 / F04+F05 RECOMPILED
4C = OPEN / METHOD v2.2 REBASELINED / GF-01 LOCKED / W-01 LOCKED / W-02 OPEN / F04 GREEN / F05 GREEN / F06 OPERATOR ACCEPTED / F06 SELECTED REALIZATION RED
4D–4G = NOT STARTED
Product implementation = BLOCKED
```

## Frontend method v2.2 bounded rebaseline

The operator replaced the canonical frontend methodology with Frontend Product Experience Planning Method v2.2.

```text
P8 = functional low-fidelity HTML per material block
P11 = assembled interactive low-fidelity Product
P12 = whole-product adversarial UX + architecture walkthrough
```

`GF-01 H1-R2` and `W-01 C1-R1` remain LOCKED because the method revision does not materially falsify them. Future P11/P12 Evidence may reopen only the smallest affected block.

Evidence: [v2.2 bounded rebaseline](evidence/4c/frontend-method-v22-bounded-rebaseline.md).

## Current W-02 state

```text
W-02A = Workspace Brain
W-02B = Connections
```

`F04` confirmed logical Connection as human-identity owner (`Connection.name`). `F05` confirmed Brain/`BRN-07` as proposal-intake owner and admitted source-backed + Discovery-backed intake without a new operation/owner.

### F06 — Brain exact review-content inspectability — OPERATOR ACCEPTED / SELECTED REALIZATION RED

The operator accepted the F06 Global Maximum:

```text
CURRENT STRUCTURE CONFIRMED
→ Brain remains semantic/source owner
→ BRN-03 and BRN-06 remain the correct exact detail reads
→ exact source-bound human review content is required
→ no new Product operation/domain
```

Selected realization to falsify:

```text
BrainRevision.sourceRevision + reviewText
KnowledgeProposal.candidateSourceRevision + reviewText
```

`reviewText` is a nonblank deterministic Brain-owned human-readable projection of the exact source revision. It is read-only presentation content, not canonical source or decision identity.

Preserved decision subjects:

```text
BRN-08 → expectedProposalRevision + decision
BRN-09 → candidateSourceRevision
```

No generic Brain source browser/editor, Builder source reuse, generic ReviewProjection Product owner, new Permission or durable record is admitted.

Evidence: [F06 finding](evidence/4c/w02-brain-review-content-finding.md) / [Global Maximum](evidence/4c/w02-brain-review-content-global-maximum.md) / [selected realization](evidence/4c/w02-brain-review-content-selected-realization.md).

## Method law

```text
smallest-owner reopen != smallest patch
```

Frontend finding → root cause → invariant → real owner → alternatives → Global Maximum/YAGNI → operator decision → selected RED → bounded recompile.

## Exact next action

**Run the selected F06 RED against the unchanged 4A/4B Brain authority.** If the RED is clean, recompile only the Brain detail-read semantics/wire, prove whole-wire GREEN, then boundedly rebaseline affected FP0/P3/P5 artifacts and resume W-02A P7/P8 functional HTML.

Do not lock W-02, open later blocks, begin 4D, merge PR #57 or implement Product code.
