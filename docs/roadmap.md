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
| 4A — Product Surface & Authority Contract | CLOSED / OPERATOR RATIFIED / `F04`–`F07` + `F09`–`F10` RECOMPILED | `N_platform=113` | Interaction Evidence proves missing Product meaning/authority |
| 4B — Executable Wire Contract | CLOSED / OPERATOR RATIFIED / INTEGRATED / `F04`–`F07` + `F09`–`F10` RECOMPILED | `113↔113`; Project=23; Brain=11; Connections=9 | 4A change or wire/proof falsifier |
| 4C — Frontend Interaction & Authority Realization | OPEN / METHOD v2.2 / `GF-01 LOCKED` / `W-01 LOCKED` / `W-02A LOCKED` / `F10 GREEN` / `W-02B P8 REVISE` | Functional blocks + P11/P12 close with zero invented frontend authority | Material 4A/4B gap or incoherent interaction |
| 4D — Project Paved Road & Runtime Realization | NOT STARTED | Runtime/Paved Road contract ratified | Accepted property requires authority change |
| 4E — Whole-System Coherence & Golden Flows | NOT STARTED | Whole system composes into falsifiable flows | Composed-flow contradiction |
| 4F — Implementation Program & Execution Graph | NOT STARTED | Implementation/proof graph rederived | Contracts require different graph |
| 4G — Adversarial Implementation Readiness | NOT STARTED | Fresh challenge leaves no material finding | Material readiness finding |
| Product implementation | BLOCKED | Requires 4A–4G + explicit operator grant | No historical grant carries forward |

```text
4A = CLOSED / N_platform=113 / F04–F07 + F09–F10 RECOMPILED
4B = CLOSED / 113↔113 / Project=23 / Brain=11 / Connections=9 / F04–F07 + F09–F10 RECOMPILED
4C = OPEN / METHOD v2.2 / GF-01 LOCKED / W-01 LOCKED / W-02A LOCKED / F10 GREEN / W-02B P8 REVISE
F06 OPERATOR ACCEPTED / GREEN · F06 GREEN
F07 OPERATOR ACCEPTED / GREEN · F07 SELECTED REALIZATION
F08 OPERATOR ACCEPTED / REVISED P8 GREEN / OPERATOR RE-APPROVED · F08 SELECTED REALIZATION
F09 OPERATOR ACCEPTED / GREEN · F09 SELECTED REALIZATION
F10 OPERATOR ACCEPTED / GREEN · F10 SELECTED REALIZATION
4D–4G = NOT STARTED
Product implementation = BLOCKED
```

## 4C routing

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

`F04`–`F07` and `F09`–`F10` are operator-accepted GREEN bounded recompiles inside existing owners; `F08` was interaction-only. Fixed Product/wire remains `113↔113`, Brain=11, Connections=9, ordinary Permissions=25.

```text
F04 Connection human presentation identity = OPERATOR ACCEPTED / GREEN
F05 Brain Discovery proposal intake         = OPERATOR ACCEPTED / GREEN
F06 Brain exact source-bound review content = OPERATOR ACCEPTED / GREEN
F07 Brain structured knowledge browse       = OPERATOR ACCEPTED / GREEN
F09 Connection current non-secret configuration = OPERATOR ACCEPTED / GREEN
F10 Connection test applicability + diagnostics = OPERATOR ACCEPTED / GREEN
```

### W-02A — Workspace Brain — LOCKED

```text
Knowledge → Domain/namespace → business concept
Discovery → explicit Project context → hypothesis → human resolution → Proposal
Proposal exact review → APPROVE | REJECT
approval != publication
Revisions = immutable publication history
Health = operational overlay
```

```text
approved P8 blob = 9ca84ddbf40f6bcd969bfa638203bff8b9abf46e
P9 exact trace = CLOSED
P10 graduated shared patterns = 0
P11 = LATER ASSEMBLED PRODUCT
```

Evidence: [Brain structural decision](evidence/4c/w02a-brain-structural-hypotheses.md) / [Brain Screen Contract](evidence/4c/w02a-brain-screen-contract.md) / [functional P8](evidence/4c/w02a-brain-functional-wireframe.html).

### W-02B — Connections — P8 REVISE / NOT LOCKED

Approved P7 remains Connection-first. First P8 walkthrough produced F10 plus local UX findings.

```text
Connection.name = primary human identity
CON-03/04 connectionTest = NOT_TESTED | NEEDS_RETEST | PASSED | FAILED | INDETERMINATE
CON-08 QualifyConnection = human label “Test connection”
CON-09 = exact result + human diagnostic/remediation + Evidence
config/credential change → old test basis NEEDS_RETEST
configured != qualified != bound != healthy != caller-authorized
```

P8 revision must use card-based browse, human-first labels, collapsed technical details and a Sankhya **API** fixture rather than Oracle-like DB configuration. Do not invent Active/Inactive, generic Connected/Healthy, qualification history, secret readback or background monitoring.

F10 Evidence: [finding](evidence/4c/w02b-connection-test-diagnostics-finding.md) / [Global Maximum](evidence/4c/w02b-connection-test-diagnostics-global-maximum.md) / [selected realization](evidence/4c/w02b-connection-test-diagnostics-selected-realization.md).

## Method law

```text
smallest-owner reopen != smallest patch
```

Frontend finding → root cause → target invariant → real owner → alternatives → Global Maximum/YAGNI → operator decision → selected RED → bounded recompile.

## Exact next action

**Revise the W-02B functional P8, prove GREEN, then return it for operator re-walkthrough.** Only explicit operator approval after that walkthrough may permit LOCK/P9/P10.

Do not auto-LOCK W-02B, assemble P11 early, begin 4D, merge PR #57 or implement Product code.