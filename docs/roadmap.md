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
| 4A — Product Surface & Authority Contract | CLOSED / OPERATOR RATIFIED / `4C-F04` BOUNDED PROPERTY RECOMPILED | `N_platform=113`; current accepted Product authority includes logical Connection human presentation identity without new operation/owner/Permission | Interaction evidence proves further missing Product meaning/identity/trust |
| 4B — Executable Wire Contract | CLOSED / OPERATOR RATIFIED / INTEGRATED / `4C-F04` RECOMPILED | fixed Product wire remains `113↔113`; Connection topology remains 9 operations; canonical Connection carries human identity while secret/revision/qualification laws remain protected | 4A changes materially or Evidence falsifies wire/proof boundary |
| 4C — Frontend Interaction & Authority Realization | OPEN / ACTIVE / `GF-01 LOCKED` / `W-01 LOCKED` / `W-02 OPEN` / `4C-F04 OPERATOR ACCEPTED` | Human interactions trace to Product/wire authority with operator-locked structural Evidence and zero invented frontend authority | Material 4A/4B gap or incoherent interaction requires smallest-real-owner reopen + Global-Maximum decision |
| 4D — Project Paved Road & Runtime Realization | NOT STARTED | Scaffold/Paved Road/runtime/persistence/deployment/conformance ratified | Accepted property requires authority change |
| 4E — Whole-System Coherence & Golden Flows | NOT STARTED | Whole system composes into falsifiable golden/negative flows | Composed flow reveals contradiction |
| 4F — Implementation Program & Execution Graph | NOT STARTED | R1–R7 rederived into implementation/proof slices | Realized contracts require different graph |
| 4G — Adversarial Implementation Readiness | NOT STARTED | Fresh challenge leaves no material finding | Material finding falsifies readiness |
| Product implementation | BLOCKED | Requires 4A–4G closed/integrated + explicit operator grant | No historical grant carries forward |

```text
4A = CLOSED / N_platform=113 / 4C-F04 BOUNDED PROPERTY RECOMPILED
4B = CLOSED / 113↔113 / Project=23 / Connections=9 / 4C-F04 RECOMPILED
4C = OPEN / GF-01 LOCKED / W-01 LOCKED / W-02 OPEN / 4C-F04 OPERATOR ACCEPTED
4D–4G = NOT STARTED
Product implementation = BLOCKED
```

## Current 4C baseline

`GF-01 H1-R2` and `W-01 C1-R1` are operator-locked. W-02 authority preflight is GREEN and requires separate sub-blocks:

```text
W-02A = Workspace Brain
W-02B = Connections
```

### 4C-F04 — accepted Global Maximum

W-02B reference study exposed a real Product property gap: multiple same-provider logical Connections may exist, while the prior canonical `Connection` had no provider-independent human recognition source.

The finding was deliberately separated from its realization and compared through the DevelopmentConexus decision core.

Accepted outcome:

```text
CURRENT STRUCTURE CONFIRMED
→ correct owner = existing logical Connection
→ essential property = server-owned human presentation identity
→ selected realization = Connection.name
→ required non-blank on CON-05 creation
→ canonical Connection read projection carries name
→ stable across ConnectionRevision changes
→ CON-06 remains configuration-only
→ rename = DEFER SAFELY until a real consumer appears
```

Rejected as current structure:

```text
opaque/provider identity
provider/configuration/secret-derived identity
ConnectorDefinition as primary identity owner
rename/current-state machinery without consumer
new ConnectionProfile/presentation domain
```

Preserved:

```text
Product operation count = 113
Connections operations = 9
ordinary Permissions = 25
new semantic owner = 0
new durable record class = 0
credential readback = forbidden
configured != qualified != bound != healthy != authorized
```

Evidence:
- [W-02 authority preflight](evidence/4c/w02-authority-feasibility-preflight.md)
- [4C-F04 finding/adjudication](evidence/4c/w02-connection-human-identity-finding.md)
- [4C-F04 Global-Maximum assessment](evidence/4c/w02-connection-human-identity-global-maximum.md)
- [Human Context & Resource Presentation Identity Contract](product/human-context-identity-contract.md)

Proof discipline:

```text
solution-neutral inquiry → Verify #545 SUCCESS
selected-realization TDD → Verify #546 EXPECTED RED (58 tests / 56 pass / 2 F04 failures only)
→ bounded 4A→4B recompile
→ exact-head Verify must remain GREEN before structural lock work
```

## Methodology law carried forward

```text
smallest-owner reopen != smallest patch
```

When frontend Evidence exposes a material gap:

```text
human job / falsifier
→ root cause
→ target invariant
→ locate real owner in the existing plan
→ credible alternatives
→ Local vs Global Maximum
→ YAGNI / future cost
→ CURRENT STRUCTURE CONFIRMED | RESTRUCTURE NOW | other Method outcome
→ selected-realization RED
→ bounded recompile
```

A missing UI affordance is never automatic authority to add an endpoint/property.

## Carry-forwards

Still unopened:

- `W-04` Workspace Agent catalog;
- `4C-S06` ApprovalRequest discoverability;
- 4D review-projection version/anchor mismatch semantics;
- P-01 real Plan visual grammar before any shared Baseline/Plan rendering primitive.

## Exact next action

**Continue W-02 at 4C-6/7: complete bounded reference + competing structural hypotheses separately for `W-02A Brain` and `W-02B Connections`, using the recompiled F04 authority as input.**

Do not operator-lock either sub-block without a rendered P8 HTML candidate and authority-feasibility trace. Do not open W-03/W-04/P-01, begin 4D, merge PR #57 or implement Product code.
