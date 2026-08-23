# Conexus OS Roadmap

This is the single current phase/status authority.

| Phase | Status | Exit condition / preserved result | Reopen trigger |
| --- | --- | --- | --- |
| 3A | CLOSED | Whole-product authority reconciled and ratified | Material Product or owner contradiction |
| 3B–3K | CLOSED | Context, modules, dependencies, data, contracts, behavior, runtime, security, operations, and frontend architecture accepted | Evidence invalidates an accepted invariant or boundary |
| 3L | CLOSED | Packages A, B, and D closed for exact tested properties; C and E safely deferred | A named qualification trigger fires |
| 3M | CLOSED | Owner-local failure/recovery and first-installation restore/reactivation operator-ratified | Material 3M recovery/topology/effect falsifier |
| 3N | CLOSED | Architecture verification executed; 3A–3M survived Lead + Fable challenge with bounded corrections | Material architecture falsifier |
| 3O | CLOSED | First Budget Analyzer vertical proof contract accepted | Material contract/downstream falsifier |
| C-018 | RATIFIED / OPERATOR RATIFIED | Final Product architecture continuity ratified | Material Product/architecture/qualification falsifier |
| C-015 refinement | REFINED / KEYCLOAK AUTHENTICATION SELECTED / OPERATOR APPROVED | Keycloak authenticates; Conexus retains authorization sovereignty | Material identity/security/recovery falsifier |
| Realization Planning | ACCEPTED / OPERATOR ACCEPTED | R1–R7 first-build skeleton retained as Phase-4 input | Material Phase-4 falsifier |
| 4A — Product Surface & Authority Contract | CLOSED / OPERATOR RATIFIED / `4C-F04` RECOMPILED | `N_platform=113`; fixed Product semantics current | Interaction evidence proves missing Product meaning/identity/trust |
| 4B — Executable Wire Contract | CLOSED / OPERATOR RATIFIED / INTEGRATED / `4C-F04` RECOMPILED | fixed Product wire `113↔113`; Project=23; Connections=9 | 4A changes or wire/proof falsifier |
| 4C — Frontend Interaction & Authority Realization | OPEN / ACTIVE / `GF-01 LOCKED` / `W-01 LOCKED` / `W-02 OPEN` / `4C-F04 GREEN` / `4C-F05 OPERATOR GATE` | Human interactions close with zero invented frontend authority | Material 4A/4B gap or incoherent interaction |
| 4D — Project Paved Road & Runtime Realization | NOT STARTED | Paved Road/runtime/persistence/deployment/conformance ratified | Accepted property requires authority change |
| 4E — Whole-System Coherence & Golden Flows | NOT STARTED | Whole system composes into falsifiable flows | Composed flow contradiction |
| 4F — Implementation Program & Execution Graph | NOT STARTED | R1–R7 rederived into implementation/proof slices | Contracts require different graph |
| 4G — Adversarial Implementation Readiness | NOT STARTED | Fresh challenge leaves no material finding | Material readiness finding |
| Product implementation | BLOCKED | Requires 4A–4G closed/integrated + explicit operator grant | No historical grant carries forward |

```text
4A = CLOSED / N_platform=113 / 4C-F04 RECOMPILED
4B = CLOSED / 113↔113 / Project=23 / Connections=9 / 4C-F04 RECOMPILED
4C = OPEN / GF-01 LOCKED / W-01 LOCKED / W-02 OPEN / F04 GREEN / F05 OPERATOR GATE
4D–4G = NOT STARTED
Product implementation = BLOCKED
```

## Current 4C baseline

```text
GF-01 H1-R2 = OPERATOR LOCKED
W-01 C1-R1 = OPERATOR LOCKED
W-02A = Workspace Brain
W-02B = Connections
```

### `4C-F04` — Connection identity — OPERATOR ACCEPTED / GREEN

Global-Maximum result:

```text
CURRENT STRUCTURE CONFIRMED
logical Connection owns provider-independent human presentation identity
selected realization = Connection.name
rename = DEFER SAFELY until a real consumer
```

Preserved: 113 operations; Connections=9; Permissions=25; `CON-06` remains configuration-revision only; no secret readback; `configured != qualified != bound != healthy != authorized`.

Evidence: [finding](evidence/4c/w02-connection-human-identity-finding.md), [Global Maximum](evidence/4c/w02-connection-human-identity-global-maximum.md), [identity authority](product/human-context-identity-contract.md). Proof: solution-neutral #545 GREEN → selected RED #546 → exact recompile #552 GREEN.

### `4C-F05` — Brain Discovery human-resolution gap — OPERATOR GATE

Accepted Journey D/E requires:

```text
machine hypothesis
→ explicit human resolution
→ reviewed Brain proposal
→ review decision
→ immutable publication
```

Current wire skips the caller-expressible resolution bridge:

```text
BRN-04 → candidateRef + hypothesis + provenanceRefs
BRN-07 ← pre-existing candidateSourceRevision + provenanceRefs
```

Global-Maximum candidate:

```text
CURRENT STRUCTURE CONFIRMED
Brain remains the owner
BRN-04 remains read-only Discovery
BRN-05/06 remain durable proposal reads
BRN-08 remains proposal decision
BRN-09 remains publication
missing property = Discovery-backed proposal intake
leading realization = enrich existing BRN-07, not add a new owner/operation
```

The leading shape preserves source-backed proposal submission and adds a Discovery-backed path where exact discovery context + explicit human correction/resolution are revalidated by Brain, which materializes the exact candidate source revision and returns the same durable `KnowledgeProposal`.

Rejected/deferred now: raw Brain-Git revision as ordinary Discovery UX; BRN-04 self-materialization; Builder/Project-Git reuse; new intermediate resolve operation without its own consumer; `BrainDraft`/`DiscoverySession`/interview-thread domain.

No F05 Product/wire change has been made. Solution-neutral finding/assessment is GREEN (#555).

Evidence: [finding](evidence/4c/w02-brain-discovery-resolution-finding.md), [Global Maximum](evidence/4c/w02-brain-discovery-resolution-global-maximum.md).

## Method law

```text
smallest-owner reopen != smallest patch
```

Frontend finding → root cause → invariant → real owner → alternatives → Global Maximum/YAGNI → operator decision → selected-realization RED → bounded recompile.

## Carry-forwards

Unopened: `W-04` Workspace Agent catalog; `4C-S06` ApprovalRequest discoverability; 4D review-projection version/anchor mismatch; P-01 real Plan visual grammar before any shared Baseline/Plan renderer.

## Exact next action

**Operator adjudication of `4C-F05`: `ACCEPT GLOBAL-MAXIMUM CANDIDATE | REVISE | REJECT`.**

If accepted, create selected-realization RED before changing 4A/4B. Do not fabricate the Brain resolution bridge in HTML, operator-lock W-02, open W-03/W-04/P-01, begin 4D, merge PR #57 or implement Product code.
