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
| 4C — Frontend Interaction & Authority Realization | OPEN / METHOD v2.2 / `GF-01 LOCKED` / `W-01 LOCKED` / `W-02A LOCKED` / `W-02B LOCKED` / `W-03 NEXT` | Functional blocks + P11/P12 close with zero invented frontend authority | Material 4A/4B gap or incoherent interaction |
| 4D — Project Paved Road & Runtime Realization | NOT STARTED | Runtime/Paved Road contract ratified | Accepted property requires authority change |
| 4E — Whole-System Coherence & Golden Flows | NOT STARTED | Whole system composes into falsifiable flows | Composed-flow contradiction |
| 4F — Implementation Program & Execution Graph | NOT STARTED | Implementation/proof graph rederived | Contracts require different graph |
| 4G — Adversarial Implementation Readiness | NOT STARTED | Fresh challenge leaves no material finding | Material readiness finding |
| Product implementation | BLOCKED | Requires 4A–4G + explicit operator grant | No historical grant carries forward |

```text
4A = CLOSED / N_platform=113 / F04–F07 + F09–F10 RECOMPILED
4B = CLOSED / 113↔113 / Project=23 / Brain=11 / Connections=9 / F04–F07 + F09–F10 RECOMPILED
4C = OPEN / METHOD v2.2 / GF-01 LOCKED / W-01 LOCKED / W-02A LOCKED / W-02B LOCKED / W-03 NEXT
F06 OPERATOR ACCEPTED / GREEN · F06 GREEN
F07 OPERATOR ACCEPTED / GREEN · F07 SELECTED REALIZATION
F08 OPERATOR ACCEPTED / REVISED P8 GREEN / OPERATOR RE-APPROVED · F08 SELECTED REALIZATION
F09 OPERATOR ACCEPTED / GREEN · F09 SELECTED REALIZATION
F10 OPERATOR ACCEPTED / GREEN · F10 SELECTED REALIZATION
W-02B P9/P10 = CLOSED / VERIFIED GREEN
W-03 = NEXT / NOT OPEN
4D–4G = NOT STARTED
Product implementation = BLOCKED
```

## 4C routing

```text
P8 = functional low-fidelity HTML per material block
P11 = assembled interactive low-fidelity Product after all material blocks LOCK
P12 = whole-product adversarial UX + architecture walkthrough
```

`GF-01 H1-R2`, `W-01 C1-R1`, `W-02A Brain` and `W-02B Connections` are LOCKED. Only later material falsifiers may reopen the smallest affected block.

```text
W-02A = Workspace Brain
W-02B = Connections
W-03  = People/access + audit
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

### W-02B — Connections — LOCKED / OPERATOR APPROVED

The operator approved the exact context-preserving P8. Connection-first browse remains the root model; routine maintenance now stays in one contextual Connection panel over the collection.

```text
Connection.name = primary human identity
CON-04 = exact current non-secret configuration
CON-07 = write-only credential replacement
CON-08 = Test connection
CON-09 = exact result + human diagnostic/remediation + Evidence
connectionTest = NOT_TESTED | NEEDS_RETEST | PASSED | FAILED | INDETERMINATE
config/credential change → old test basis NEEDS_RETEST
configured != qualified != bound != healthy != caller-authorized
```

```text
approved P8 blob = 421f5b8e08d6e5c96f5a56d8c24123902cbe3fab
P9 exact trace = CLOSED
P10 graduated shared patterns = 0
closure verification = GREEN
P11 = LATER ASSEMBLED PRODUCT
```

Evidence: [Connections structural decision](evidence/4c/w02b-connections-structural-hypotheses.md) / [Connections Screen Contract](evidence/4c/w02b-connections-screen-contract.md) / [functional P8](evidence/4c/w02b-connections-functional-wireframe.html).

## Method law

```text
smallest-owner reopen != smallest patch
```

Frontend finding → root cause → target invariant → real owner → alternatives → Global Maximum/YAGNI → operator decision → selected RED → bounded recompile.

## Exact next action

**Open W-03 — People/access + audit.** Begin its bounded FP1 entry with P6 reference-trigger assessment and P7 hypotheses/authority-feasibility before any P8 artifact. `W-03` is NEXT / NOT OPEN until that transition begins.

Do not open W-04/P-01+ early, assemble P11 early, begin 4D, merge PR #57 or implement Product code.