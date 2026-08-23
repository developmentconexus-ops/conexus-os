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
| 4A — Product Surface & Authority Contract | CLOSED / OPERATOR RATIFIED / `F04`+`F05`+`F06` RECOMPILED | `N_platform=113` | Interaction Evidence proves missing Product meaning/authority |
| 4B — Executable Wire Contract | CLOSED / OPERATOR RATIFIED / INTEGRATED / `F04`+`F05`+`F06` RECOMPILED | `113↔113`; Project=23; Brain=11; Connections=9 | 4A change or wire/proof falsifier |
| 4C — Frontend Interaction & Authority Realization | OPEN / METHOD v2.2 REBASELINED / `GF-01 LOCKED` / `W-01 LOCKED` / `W-02 OPEN` / `F04 GREEN` / `F05 GREEN` / `F06 GREEN` | Functional block interactions + P11/P12 closure with zero invented frontend authority | Material 4A/4B gap or incoherent interaction |
| 4D — Project Paved Road & Runtime Realization | NOT STARTED | Runtime/Paved Road contract ratified | Accepted property requires authority change |
| 4E — Whole-System Coherence & Golden Flows | NOT STARTED | Whole system composes into falsifiable flows | Composed-flow contradiction |
| 4F — Implementation Program & Execution Graph | NOT STARTED | Implementation/proof graph rederived | Contracts require different graph |
| 4G — Adversarial Implementation Readiness | NOT STARTED | Fresh challenge leaves no material finding | Material readiness finding |
| Product implementation | BLOCKED | Requires 4A–4G + explicit operator grant | No historical grant carries forward |

```text
4A = CLOSED / N_platform=113 / F04+F05+F06 RECOMPILED
4B = CLOSED / 113↔113 / Project=23 / Brain=11 / Connections=9 / F04+F05+F06 RECOMPILED
4C = OPEN / METHOD v2.2 REBASELINED / GF-01 LOCKED / W-01 LOCKED / W-02 OPEN / F04 GREEN / F05 GREEN / F06 GREEN
4D–4G = NOT STARTED
Product implementation = BLOCKED
```

## Frontend method v2.2 bounded rebaseline

The canonical frontend methodology is Frontend Product Experience Planning Method v2.2.

```text
P8 = functional low-fidelity HTML per material block
P11 = assembled interactive low-fidelity Product
P12 = whole-product adversarial UX + architecture walkthrough
```

`GF-01 H1-R2` and `W-01 C1-R1` remain LOCKED because the method revision does not falsify their protected properties. Later P11/P12 Evidence may reopen only the smallest affected block.

Evidence: [v2.2 bounded rebaseline](evidence/4c/frontend-method-v22-bounded-rebaseline.md).

## Current W-02 state

```text
W-02A = Workspace Brain
W-02B = Connections
```

### F04 — Connection human identity — GREEN

The existing logical Connection remains owner. `Connection.name` is required on creation, projected on canonical Connection reads and stable across `ConnectionRevision`; rename remains deferred. No operation/Permission/owner/record was added.

### F05 — Brain Discovery human resolution — GREEN

`BRN-07 SubmitKnowledgeProposal` remains one semantic operation with mutually exclusive source-backed and Discovery-backed intake. Discovery-backed intake binds exact `discoveryCandidateRef` + nonblank human resolution; Brain re-resolves provenance and materializes the candidate source. No new operation/owner/domain.

### F06 — exact Brain review-content inspectability — OPERATOR ACCEPTED / GREEN

The existing Brain detail reads remain the correct owner/surface:

```text
BRN-03 BrainRevision
→ exact sourceRevision
+ nonblank reviewText

BRN-06 KnowledgeProposal
→ exact candidateSourceRevision
+ nonblank reviewText
```

`reviewText` is deterministic Brain-owned human-readable presentation of the exact named source revision. It is not canonical source, identity or decision authority.

Preserved:

```text
BRN-08 → expectedProposalRevision + APPROVE|REJECT
BRN-09 → candidateSourceRevision
reviewText -X-> decision/publication input
```

Rejected/deferred remain: browser Brain-Git access, Builder source reuse, generic Brain editor/source tree, generic ReviewProjection Product domain.

Evidence: [F06 finding](evidence/4c/w02-brain-review-content-finding.md) / [Global Maximum](evidence/4c/w02-brain-review-content-global-maximum.md) / [selected realization](evidence/4c/w02-brain-review-content-selected-realization.md).

## Method law

```text
smallest-owner reopen != smallest patch
```

Frontend finding → root cause → target invariant → real owner → credible alternatives → Global Maximum/YAGNI → operator decision → selected RED → bounded recompile.

## Exact next action

**Resume W-02 under v2.2 FP1:** complete the remaining P7 structural hypotheses separately for `W-02A Brain` and `W-02B Connections`, then produce **functional P8 low-fidelity HTML** candidates with material interactions/states operable for operator walkthrough.

P7 must treat fields/summaries, identities, scale, sort/filter, preview/content truth and material writes as `PRESENT-IN-AUTHORITY | FINDING`. Any new material gap stops at its real owner before HTML fabricates it.

Do not LOCK W-02 automatically, open later blocks as baseline, begin 4D, merge PR #57 or implement Product code.