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
| 4C — Frontend Interaction & Authority Realization | OPEN / METHOD v2.2 REBASELINED / `GF-01 LOCKED` / `W-01 LOCKED` / `W-02A P8 OPERATOR APPROVED` / `P9 F07 OPERATOR GATE` / `W-02A NOT LOCKED` / `F04–F06 GREEN` | Functional blocks + P11/P12 close with zero invented frontend authority | Material 4A/4B gap or incoherent interaction |
| 4D — Project Paved Road & Runtime Realization | NOT STARTED | Runtime/Paved Road contract ratified | Accepted property requires authority change |
| 4E — Whole-System Coherence & Golden Flows | NOT STARTED | Whole system composes into falsifiable flows | Composed-flow contradiction |
| 4F — Implementation Program & Execution Graph | NOT STARTED | Implementation/proof graph rederived | Contracts require different graph |
| 4G — Adversarial Implementation Readiness | NOT STARTED | Fresh challenge leaves no material finding | Material readiness finding |
| Product implementation | BLOCKED | Requires 4A–4G + explicit operator grant | No historical grant carries forward |

```text
4A = CLOSED / N_platform=113 / F04+F05+F06 RECOMPILED
4B = CLOSED / 113↔113 / Project=23 / Brain=11 / Connections=9 / F04+F05+F06 RECOMPILED
4C = OPEN / METHOD v2.2 REBASELINED / GF-01 LOCKED / W-01 LOCKED / W-02 OPEN / W-02A P8 OPERATOR APPROVED / W-02A NOT LOCKED / F07 OPERATOR GATE / F04 GREEN / F05 GREEN / F06 GREEN
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

`GF-01 H1-R2` and `W-01 C1-R1` remain LOCKED; the v2.2 rebaseline did not falsify them.

```text
W-02A = Workspace Brain
W-02B = Connections
```

Initial operation/Permission/owner/trust topology was sound. `F04`–`F06` are operator-accepted GREEN bounded recompiles inside existing Connections/Brain owners; fixed Product/wire remains `113↔113`, Brain=11, Connections=9, ordinary Permissions=25.

Preserved bounded follow-up history:

```text
F04 Connection human presentation identity = OPERATOR ACCEPTED / GREEN
F05 Brain Discovery proposal intake         = OPERATOR ACCEPTED / GREEN
F06 Brain exact source-bound review content = OPERATOR ACCEPTED / GREEN
```

W-02A P8 direction is operator approved:

```text
primary mental model = organizational knowledge
Knowledge → Domain/namespace → business concept
SEMANTIC | KNOWLEDGE | EVIDENCE_SPEC = canonical content classes, not mandatory global navigation
Discovery → human resolution → Proposal → exact review → separate publication
Health = operational overlay
physical Brain-Git topology = NOT SELECTED by 4C
```

Functional P8: [Brain wireframe](evidence/4c/w02a-brain-functional-wireframe.html). P7 Evidence: [Brain structural decision](evidence/4c/w02a-brain-structural-hypotheses.md).

### F07 — structured Brain knowledge browse — OPERATOR GATE

P9 exposed that current `BRN-03 GetBrainRevision` supplies exact revision identity plus plain `reviewText`, but no source-bound structured domain/concept projection. Production UI cannot truthfully implement the approved `Knowledge → Domain → Concept` experience by parsing prose/DOM or reading Brain Git.

```text
P8 UX direction = OPERATOR APPROVED
P9 trace = MATERIAL F07
W-02A = NOT LOCKED until F07 closes
```

Leading Global-Maximum candidate preserves Brain + BRN-03 and enriches the exact revision read with a deterministic structured source-bound browse/review projection; no new Product operation/domain is currently justified.

Evidence: [F07 finding](evidence/4c/w02a-brain-knowledge-browse-finding.md) / [F07 Global Maximum](evidence/4c/w02a-brain-knowledge-browse-global-maximum.md).

## Method law

```text
smallest-owner reopen != smallest patch
```

Frontend finding → root cause → target invariant → real owner → alternatives → Global Maximum/YAGNI → operator decision → selected RED → bounded recompile.

## Exact next action

**Operator adjudication of F07: `ACCEPT GLOBAL-MAXIMUM CANDIDATE | REVISE | REJECT`.**

If accepted: derive the exact structured source-bound projection shape, create selected-realization RED, then boundedly recompile 4A/4B/checkers/generated/whole-wire before rerunning W-02A P9. Only after P9 closes may the approved P8 blob be recorded as fully `LOCKED` and P10 close.

Do not advance W-02B as baseline, begin 4D, merge PR #57 or implement Product code.
