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
| 4C — Frontend Interaction & Authority Realization | OPEN / ACTIVE / `GF-01 LOCKED` / `W-01 LOCKED` / `W-02 OPEN` / `4C-F04 GREEN` / `4C-F05 OPERATOR GATE` | Human interactions trace to Product/wire authority with operator-locked structural Evidence and zero invented frontend authority | Material 4A/4B gap or incoherent interaction requires smallest-real-owner reopen + Global-Maximum decision |
| 4D — Project Paved Road & Runtime Realization | NOT STARTED | Scaffold/Paved Road/runtime/persistence/deployment/conformance ratified | Accepted property requires authority change |
| 4E — Whole-System Coherence & Golden Flows | NOT STARTED | Whole system composes into falsifiable golden/negative flows | Composed flow reveals contradiction |
| 4F — Implementation Program & Execution Graph | NOT STARTED | R1–R7 rederived into implementation/proof slices | Realized contracts require different graph |
| 4G — Adversarial Implementation Readiness | NOT STARTED | Fresh challenge leaves no material finding | Material finding falsifies readiness |
| Product implementation | BLOCKED | Requires 4A–4G closed/integrated + explicit operator grant | No historical grant carries forward |

```text
4A = CLOSED / N_platform=113 / 4C-F04 BOUNDED PROPERTY RECOMPILED
4B = CLOSED / 113↔113 / Project=23 / Connections=9 / 4C-F04 RECOMPILED
4C = OPEN / GF-01 LOCKED / W-01 LOCKED / W-02 OPEN / 4C-F04 GREEN / 4C-F05 OPERATOR GATE
4D–4G = NOT STARTED
Product implementation = BLOCKED
```

## Current 4C baseline

`GF-01 H1-R2` and `W-01 C1-R1` are operator-locked. W-02 remains split into materially distinct sub-blocks:

```text
W-02A = Workspace Brain
W-02B = Connections
```

### 4C-F04 — accepted and GREEN

W-02B exposed missing provider-independent human Connection identity. Global-Maximum analysis confirmed the existing logical Connection owner and selected:

```text
Connection.name
→ explicit create-time human presentation identity
→ canonical Connection reads
→ stable across ConnectionRevision changes
→ no rename/update-metadata authority in F1
```

Preserved:

```text
Product operation count = 113
Connections operations = 9
ordinary Permissions = 25
credential readback = forbidden
CON-06 = configuration revision only
configured != qualified != bound != healthy != authorized
```

Proof:

```text
solution-neutral inquiry = Verify #545 SUCCESS
selected realization = Verify #546 EXPECTED RED (2 exact F04 failures)
recompiled exact head = Verify #552 SUCCESS
```

Evidence:
- [W-02 authority preflight](evidence/4c/w02-authority-feasibility-preflight.md)
- [4C-F04 finding/adjudication](evidence/4c/w02-connection-human-identity-finding.md)
- [4C-F04 Global-Maximum assessment](evidence/4c/w02-connection-human-identity-global-maximum.md)
- [Human Context & Resource Presentation Identity Contract](product/human-context-identity-contract.md)

### 4C-F05 — Brain Discovery human-resolution gap

W-02A authority-to-interaction derivation exposed a second real gap before any Brain wireframe was drawn.

Accepted Journey D/E requires:

```text
machine discovery hypothesis
→ human interview / resolution
→ reviewed Brain change proposal
→ human review decision
→ immutable publication
```

Current wire instead jumps:

```text
BRN-04 response
→ candidateRef + hypothesis + provenanceRefs

BRN-07 request
← pre-existing candidateSourceRevision + provenanceRefs
```

No current browser input expresses the accepted human resolution or explains how the Discovery consumer truthfully obtains the required Brain-owned source revision.

Global-Maximum comparison currently concludes:

```text
CURRENT STRUCTURE CONFIRMED
→ Brain remains the correct owner
→ BRN-04 remains read-only Discovery
→ BRN-05/06 durable proposal reads remain correct
→ BRN-08 review decision remains correct
→ BRN-09 publication remains correct
→ missing property = caller-expressible Discovery-backed proposal intake
→ leading realization = enrich existing BRN-07
```

Alternatives rejected/deferred for current F1:

```text
raw Brain-Git revision as ordinary Discovery UX = REJECT for this flow
BRN-04 auto-materializes source before human resolution = REJECT
new ResolveBrainDiscoveryCandidate operation = REJECT unless an independent pre-submission artifact consumer appears
Builder/Project-Git reuse = REJECT / owner inversion
BrainDraft / DiscoverySession / interview-thread domain = REJECT / YAGNI
```

The leading candidate preserves the existing source-backed BRN-07 path and would add a Discovery-backed submission path where an exact Discovery candidate plus explicit human correction/resolution is revalidated by the Brain owner, which then materializes the exact candidate source revision and returns the same durable `KnowledgeProposal`.

**No 4A/4B change has been made for F05.**

Proof:

```text
solution-neutral F05 finding + Global-Maximum comparison
→ Verify #555 = SUCCESS
```

Evidence:
- [4C-F05 finding](evidence/4c/w02-brain-discovery-resolution-finding.md)
- [4C-F05 Global-Maximum assessment](evidence/4c/w02-brain-discovery-resolution-global-maximum.md)

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
→ operator decision
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

**Operator adjudication of the `4C-F05` Global-Maximum candidate: `ACCEPT GLOBAL-MAXIMUM CANDIDATE | REVISE | REJECT`.**

If accepted, derive a selected-realization RED before changing 4A/4B. Do not draw a Brain interaction that fabricates the missing resolution bridge, operator-lock W-02A/W-02B, open W-03/W-04/P-01, begin 4D, merge PR #57 or implement Product code before that decision.
