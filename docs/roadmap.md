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
| 4A — Product Surface & Authority Contract | CLOSED / OPERATOR RATIFIED / `F04`–`F07` RECOMPILED | `N_platform=113` | Interaction Evidence proves missing Product meaning/authority |
| 4B — Executable Wire Contract | CLOSED / OPERATOR RATIFIED / INTEGRATED / `F04`–`F07` RECOMPILED | `113↔113`; Project=23; Brain=11; Connections=9 | 4A change or wire/proof falsifier |
| 4C — Frontend Interaction & Authority Realization | OPEN / METHOD v2.2 / `GF-01 LOCKED` / `W-01 LOCKED` / `W-02A LOCKED` / `W-02B P7 NEXT` | Functional blocks + P11/P12 close with zero invented frontend authority | Material 4A/4B gap or incoherent interaction |
| 4D — Project Paved Road & Runtime Realization | NOT STARTED | Runtime/Paved Road contract ratified | Accepted property requires authority change |
| 4E — Whole-System Coherence & Golden Flows | NOT STARTED | Whole system composes into falsifiable flows | Composed-flow contradiction |
| 4F — Implementation Program & Execution Graph | NOT STARTED | Implementation/proof graph rederived | Contracts require different graph |
| 4G — Adversarial Implementation Readiness | NOT STARTED | Fresh challenge leaves no material finding | Material readiness finding |
| Product implementation | BLOCKED | Requires 4A–4G + explicit operator grant | No historical grant carries forward |

```text
4A = CLOSED / N_platform=113 / F04–F07 RECOMPILED
4B = CLOSED / 113↔113 / Project=23 / Brain=11 / Connections=9 / F04–F07 RECOMPILED
4C = OPEN / METHOD v2.2 / GF-01 LOCKED / W-01 LOCKED / W-02 OPEN / W-02A LOCKED / W-02B P7 NEXT
F06 OPERATOR ACCEPTED / GREEN · F06 GREEN
F07 OPERATOR ACCEPTED / GREEN · F07 SELECTED REALIZATION
F08 OPERATOR ACCEPTED / REVISED P8 GREEN / OPERATOR RE-APPROVED · F08 SELECTED REALIZATION
4D–4G = NOT STARTED
Product implementation = BLOCKED
```

## 4C routing

Frontend method v2.2 is canonical:

```text
P8 = functional low-fidelity HTML per material block
P11 = assembled interactive low-fidelity Product
P12 = whole-product adversarial UX + architecture walkthrough
```

`GF-01 H1-R2`, `W-01 C1-R1` and `W-02A Brain` are LOCKED. Only later material falsifiers may reopen them.

```text
W-02A = Workspace Brain
W-02B = Connections
```

Initial operation/Permission/owner/trust topology remains sound. `F04`–`F07` are operator-accepted GREEN bounded recompiles inside existing Connections/Brain owners; `F08` was interaction-only and changed no backend/wire authority. Fixed Product/wire remains `113↔113`, Brain=11, Connections=9, ordinary Permissions=25.

```text
F04 Connection human presentation identity = OPERATOR ACCEPTED / GREEN
F05 Brain Discovery proposal intake         = OPERATOR ACCEPTED / GREEN
F06 Brain exact source-bound review content = OPERATOR ACCEPTED / GREEN
F07 Brain structured knowledge browse       = OPERATOR ACCEPTED / GREEN
```

### W-02A — Workspace Brain — LOCKED

Locked human structure:

```text
Knowledge → Domain/namespace → business concept
Discovery → explicit Project context → hypothesis → human resolution → Proposal
Proposal exact review → APPROVE | REJECT
approval != publication
Revisions = immutable publication history
Health = operational overlay
```

F07 supplies exact revision-scoped structured `knowledgeBrowse`; F08 supplies explicit `PRJ-01 → selected projectId → BRN-04` context without frontend source/Connection authority.

```text
approved P8 blob = 9ca84ddbf40f6bcd969bfa638203bff8b9abf46e
P9 exact trace = CLOSED
P10 graduated shared patterns = 0
P11 = LATER ASSEMBLED PRODUCT
```

Evidence: [Brain structural decision](evidence/4c/w02a-brain-structural-hypotheses.md) / [Brain Screen Contract](evidence/4c/w02a-brain-screen-contract.md) / [functional P8](evidence/4c/w02a-brain-functional-wireframe.html).

### W-02B — Connections — P7 NEXT

Preserved direction from W-02 preflight:

```text
browse Connections by human Connection.name
→ focused Connection detail
→ explicit configuration / write-only credential / qualification tasks

configured != qualified != bound != healthy != caller-authorized
```

P7 must adjudicate the exact structural hypothesis against current `CON-01..09` authority before any functional P8 is created. Do not invent `latestQualification`, generic qualification history, secret readback or a permanent generic `Connected` badge.

## Method law

```text
smallest-owner reopen != smallest patch
```

Frontend finding → root cause → target invariant → real owner → alternatives → Global Maximum/YAGNI → operator decision → selected RED → bounded recompile.

## Exact next action

**W-02B Connections P7 structural adjudication.** Present the bounded structural candidate(s) against current Connections authority; only after operator approval of one P7 direction may functional P8 HTML be created.

Do not begin W-02B P8 before that approval, assemble P11 early, begin 4D, merge PR #57 or implement Product code.
