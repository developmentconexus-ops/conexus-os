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
| 4C — Frontend Interaction & Authority Realization | OPEN / METHOD v2.2 / `GF-01 LOCKED` / `W-01 LOCKED` / `W-02A P8 OPERATOR APPROVED` / `F07 GREEN` / `F08 SELECTED REALIZATION` / `W-02A NOT LOCKED` | Functional blocks + P11/P12 close with zero invented frontend authority | Material 4A/4B gap or incoherent interaction |
| 4D — Project Paved Road & Runtime Realization | NOT STARTED | Runtime/Paved Road contract ratified | Accepted property requires authority change |
| 4E — Whole-System Coherence & Golden Flows | NOT STARTED | Whole system composes into falsifiable flows | Composed-flow contradiction |
| 4F — Implementation Program & Execution Graph | NOT STARTED | Implementation/proof graph rederived | Contracts require different graph |
| 4G — Adversarial Implementation Readiness | NOT STARTED | Fresh challenge leaves no material finding | Material readiness finding |
| Product implementation | BLOCKED | Requires 4A–4G + explicit operator grant | No historical grant carries forward |

```text
4A = CLOSED / N_platform=113 / F04–F07 RECOMPILED
4B = CLOSED / 113↔113 / Project=23 / Brain=11 / Connections=9 / F04–F07 RECOMPILED
4C = OPEN / METHOD v2.2 / GF-01 LOCKED / W-01 LOCKED / W-02 OPEN / W-02A P8 OPERATOR APPROVED / W-02A NOT LOCKED / F07 GREEN / F08 SELECTED REALIZATION
F06 OPERATOR ACCEPTED / GREEN · F06 GREEN
F07 OPERATOR ACCEPTED / GREEN · F07 SELECTED REALIZATION
F08 OPERATOR ACCEPTED / SELECTED REALIZATION
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

`GF-01 H1-R2` and `W-01 C1-R1` remain LOCKED; v2.2 did not falsify them.

```text
W-02A = Workspace Brain
W-02B = Connections
```

Initial operation/Permission/owner/trust topology remains sound. `F04`–`F07` are operator-accepted GREEN bounded recompiles inside existing Connections/Brain owners; fixed Product/wire remains `113↔113`, Brain=11, Connections=9, ordinary Permissions=25.

```text
F04 Connection human presentation identity = OPERATOR ACCEPTED / GREEN
F05 Brain Discovery proposal intake         = OPERATOR ACCEPTED / GREEN
F06 Brain exact source-bound review content = OPERATOR ACCEPTED / GREEN
F07 Brain structured knowledge browse       = OPERATOR ACCEPTED / GREEN
```

W-02A P8 direction remains operator approved:

```text
primary mental model = organizational knowledge
Knowledge → Domain/namespace → business concept
SEMANTIC | KNOWLEDGE | EVIDENCE_SPEC = canonical content classes, not mandatory global navigation
Discovery → human resolution → Proposal → exact review → separate publication
Health = operational overlay
physical Brain-Git topology = NOT SELECTED by 4C
```

### F07 — structured Brain knowledge browse — GREEN

Accepted result:

```text
BRN-03 → BrainRevisionDetail
→ reviewText
+ knowledgeBrowse → domains[] → concepts[] → contentClasses[] / sections[] / provenanceRefs[]
```

Projection coordinates remain revision-scoped presentation only. `BRN-02` / `BRN-09` remain bounded summaries; remote Brain catalog/search/pagination stays deferred.

```text
Verify #615 = EXPECTED RED
Verify #619 = SUCCESS / fixed Product wire 113↔113 / Brain=11
```

Evidence: [finding](evidence/4c/w02a-brain-knowledge-browse-finding.md) / [Global Maximum](evidence/4c/w02a-brain-knowledge-browse-global-maximum.md) / [selected realization](evidence/4c/w02a-brain-knowledge-browse-selected-realization.md).

### F08 — explicit Brain Discovery Project context — SELECTED REALIZATION

Operator accepted candidate C. Existing backend/wire remains sufficient:

```text
PRJ-01 ListProjects → ProjectSummary { projectId, workspaceId, name, archived }
selected projectId = untrusted FORM_DRAFT
→ BRN-04 StartBrainDiscovery
→ Brain resolves source / Connection context server-side
```

Revise only the Discovery entry/context: labeled Project selector from PRJ-01 truth, no hidden/default Project, Run disabled until explicit selection, archived shown as truth rather than client eligibility policy. Knowledge/Proposal/Revisions/Health and F07 remain unchanged.

Evidence: [finding](evidence/4c/w02a-brain-discovery-project-context-finding.md) / [Global Maximum](evidence/4c/w02a-brain-discovery-project-context-global-maximum.md) / [selected realization](evidence/4c/w02a-brain-discovery-project-context-selected-realization.md).

## Method law

```text
smallest-owner reopen != smallest patch
```

Frontend finding → root cause → target invariant → real owner → alternatives → Global Maximum/YAGNI → operator decision → selected RED → bounded recompile.

## Exact next action

**F08 revised P8 RED → revise only W-02A Discovery Project context → GREEN → operator re-walkthrough/re-approval.**

Only after revised P8 + P9 close may W-02A become LOCKED and P10 close. Do not advance W-02B as baseline, begin 4D, merge PR #57 or implement Product code.
