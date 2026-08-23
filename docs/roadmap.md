# Conexus OS Roadmap

This is the single current phase/status authority.

| Phase | Status | Exit condition / preserved result | Reopen trigger |
| --- | --- | --- | --- |
| 3A | CLOSED | Whole-product authority reconciled and ratified | Material Product or owner contradiction |
| 3B–3K | CLOSED | Context, modules, dependencies, data, contracts, behavior, runtime, security, operations, and frontend architecture accepted | Evidence invalidates an accepted invariant or boundary |
| 3L | CLOSED | Packages A, B, and D closed for exact tested properties; C and E safely deferred | A named qualification trigger fires |
| 3M | CLOSED | Owner-local failure/recovery and first-installation restore/reactivation operator-ratified | Material 3M recovery/topology/effect falsifier |
| 3N | CLOSED | Architecture verification executed; 3A–3M survived Lead + Fable challenge with bounded corrections | Material Evidence falsifies an accepted architecture invariant/proof route |
| 3O | CLOSED | First Budget Analyzer vertical proof contract accepted | Material Evidence falsifies the contract or its downstream falsifiability |
| C-018 | RATIFIED / OPERATOR RATIFIED | Final Product architecture continuity ratified after exact-head R1–R7 review | Material Product/architecture/qualification falsifier |
| C-015 refinement | REFINED / KEYCLOAK AUTHENTICATION SELECTED / OPERATOR APPROVED | Keycloak authentication selected; Conexus retains authorization sovereignty | Material identity/security/recovery falsifier |
| Realization Planning | ACCEPTED / OPERATOR ACCEPTED | R1–R7 first-build skeleton retained as Phase-4 input | Material Phase-4 Evidence falsifies it |
| 4A — Product Surface & Authority Contract | CLOSED / OPERATOR RATIFIED / 4C-F03 ACCEPTED | `N_platform=113`; accepted Product authority | 4C finding proves missing Product meaning/identity/trust |
| 4B — Executable Wire Contract | CLOSED / OPERATOR RATIFIED / INTEGRATED / 4C-F03 RECOMPILED | fixed Product wire `113↔113`; Project=23 | 4A change or wire falsifier |
| 4C — Frontend Interaction & Authority Realization | OPEN / `GF-01 LOCKED` / `W-01 LOCKED` / `W-02 OPEN` / `4C-F04 GLOBAL-MAXIMUM OPERATOR GATE` | Human interaction closes without invented frontend authority | Material 4A/4B gap → reopen the smallest owner that contains the root cause, then seek the Global Maximum inside that decision |
| 4D — Project Paved Road & Runtime Realization | NOT STARTED | Scaffold/Paved Road/runtime/persistence/deployment/conformance ratified | Accepted property requires authority change |
| 4E — Whole-System Coherence & Golden Flows | NOT STARTED | Whole system composes into falsifiable golden/negative flows | Composed flow reveals contradiction |
| 4F — Implementation Program & Execution Graph | NOT STARTED | R1–R7 rederived into implementation/proof slices | Realized contracts require different graph |
| 4G — Adversarial Implementation Readiness | NOT STARTED | Fresh challenge leaves no material finding | Material finding falsifies readiness |
| Product implementation | BLOCKED | Requires 4A–4G closed/integrated + explicit operator grant | No historical grant carries forward |

```text
4A = CLOSED / N_platform=113
4B = CLOSED / 113↔113 / Project=23
4C = OPEN / GF-01 LOCKED / W-01 LOCKED / W-02 OPEN / 4C-F04 GLOBAL-MAXIMUM OPERATOR GATE
4D–4G = NOT STARTED
Product implementation = BLOCKED
```

## Current 4C baseline

`GF-01 H1-R2` and `W-01 C1-R1` are operator-locked. W-02 authority preflight is GREEN and requires separate sub-blocks:

```text
W-02A = Workspace Brain
W-02B = Connections
```

Current W-02 reference study exposed `4C-F04`: the canonical logical Connection has no provider-independent human presentation identity even though multiple same-provider logical Connections are structurally possible. IDs, provider identity, provider-specific configuration or secret/account heuristics are not accepted substitutes.

The finding is **not** authority for a preselected schema patch. The current decision follows the full Engineering Method loop:

```text
Evidence
→ Root Cause
→ Target Invariant
→ Credible Alternatives
→ Local Maximum vs Global Maximum
→ Essential vs Accidental Complexity
→ YAGNI / Future Cost
→ owner / boundary
→ proof
→ operator decision
```

The bounded Global-Maximum assessment currently concludes:

```text
CURRENT STRUCTURE CONFIRMED
→ logical Connection remains the correct semantic owner
→ a provider-independent human presentation identity is the missing essential property
→ no new presentation/profile domain is justified
→ rename capability is DEFERRED until a real rename consumer appears
```

`Connection.name` is the **leading realization candidate**, not yet admitted Product authority. If accepted, a selected-realization RED must be derived before changing 4A/4B.

Evidence:
- [W-02 authority preflight](evidence/4c/w02-authority-feasibility-preflight.md)
- [4C-F04 Connection identity finding](evidence/4c/w02-connection-human-identity-finding.md)
- [4C-F04 Global-Maximum assessment](evidence/4c/w02-connection-human-identity-global-maximum.md)

Preserved carry-forwards: `W-04` Workspace Agent catalog; `4C-S06` ApprovalRequest discoverability; 4D review-projection version/anchor mismatch semantics; P-01 real Plan visual grammar before any shared Baseline/Plan renderer.

## Exact next action

**Operator adjudication of `4C-F04` Global-Maximum candidate: `ACCEPT GLOBAL-MAXIMUM CANDIDATE | REVISE | REJECT`.**

Do not modify 4A/4B for F04, draw W-02B, open W-03/W-04/P-01, begin 4D, merge PR #57 or implement Product code before that decision.
