# Conexus OS Documentation Map

This is the canonical task/intention and knowledge router. Current stage, implementation gate, and exact next action live only in [`roadmap.md`](roadmap.md).

Start with the smallest sufficient context. Expand when a named question, unknown, contradiction, dependency, falsifier, or proof need requires it. Coverage of Conexus knowledge is provided by routing, not by loading it all.

## Fresh-session route

```text
AGENTS.md
→ roadmap.md
→ this index
→ applicable method
→ current task owner(s)
→ additional authority/Evidence only on demand
```

Applicable local methods:

- material engineering / root cause / Global Maximum / proof: [`development/engineering-method.md`](development/engineering-method.md)
- repository / context / Git / docs / CI: [`development/repository-method.md`](development/repository-method.md)
- frontend Product Experience / P0–P14: [`development/frontend-product-experience-planning-method.md`](development/frontend-product-experience-planning-method.md)

## Read by task

| Need | Read first | Add only when needed | Do not read by default |
| --- | --- | --- | --- |
| Current stage / implementation gate / next action | [`roadmap.md`](roadmap.md) | current phase/block owner | Evidence history, research |
| Phase 4 implementation readiness | [`phases/4-implementation-readiness-program.md`](phases/4-implementation-readiness-program.md) | current 4A–4G owner routed by `roadmap.md` | unrelated Phase-3 history |
| 4A Product Surface & Authority | [`phases/4a-product-surface-and-authority-contract.md`](phases/4a-product-surface-and-authority-contract.md), [`product/operation-ledger.md`](product/operation-ledger.md) | [`product/permission-contract.md`](product/permission-contract.md) and exact Product owner implicated by the question | frontend/runtime choices |
| 4B Executable Wire | [`phases/4b-executable-wire-contract.md`](phases/4b-executable-wire-contract.md), [`product/wire-contract.md`](product/wire-contract.md) | exact OpenAPI fragment, owner proof, or 4B Evidence needed by the claim | frontend Evidence, unrelated qualification |
| 4C Frontend Interaction & Authority | [`roadmap.md`](roadmap.md), [`phases/4c-frontend-interaction-and-authority-realization.md`](phases/4c-frontend-interaction-and-authority-realization.md), Frontend Method | exact Product/wire owners implicated by the current block; current block Evidence | the whole 4C Evidence tree |
| Current P-02 | [`evidence/4c/p02-structural-hypotheses.md`](evidence/4c/p02-structural-hypotheses.md), [`evidence/4c/p02-project-resources-functional-wireframe.html`](evidence/4c/p02-project-resources-functional-wireframe.html) | [`evidence/4c/p02-f22-data-explorer-design.md`](evidence/4c/p02-f22-data-explorer-design.md), [`evidence/4c/p02-f23-project-brain-context-design.md`](evidence/4c/p02-f23-project-brain-context-design.md), [`evidence/4c/p02-p8-f22-f23-revision.md`](evidence/4c/p02-p8-f22-f23-revision.md), exact Product/wire owner | superseded P-02 revisions and review chronology |
| Product meaning / scope / journeys | [`product/contract.md`](product/contract.md) | [`decisions/index.md`](decisions/index.md), exact Product owner | research, phase history |
| Current decision / reopen | [`decisions/index.md`](decisions/index.md) | implicated owner + exact deciding Evidence | review chronology, old proposals |
| Human context identity | [`product/human-context-identity-contract.md`](product/human-context-identity-contract.md) | security/IAM owner if implicated | unrelated Product domains |
| Architecture overview / semantic owners | [`architecture/index.md`](architecture/index.md) | one exact reference owner | raw Evidence, research |
| Project | [`reference/data-and-persistence.md`](reference/data-and-persistence.md), relevant Project Product/wire owner | Brain, Integration, Security, or Builder owner only as implicated | whole architecture tree |
| Brain / knowledge | [`reference/brain-and-knowledge.md`](reference/brain-and-knowledge.md) | Project/Data owner or exact Brain contract/Evidence | broad research |
| Data / Sankhya | [`reference/data-and-persistence.md`](reference/data-and-persistence.md) | [`reference/integrations-and-gateway.md`](reference/integrations-and-gateway.md), exact Data Explorer owner/Evidence | runtime qualification |
| Integrations / Gateway | [`reference/integrations-and-gateway.md`](reference/integrations-and-gateway.md) | [`reference/security-and-authority.md`](reference/security-and-authority.md), exact Project binding owner | provider research |
| Builder / Harness | [`reference/builder-and-harness.md`](reference/builder-and-harness.md) | runtime/security owner only when implicated | qualification |
| Product Agents / runtime | [`reference/runtime-and-agents.md`](reference/runtime-and-agents.md) | [`reference/mastra/index.md`](reference/mastra/index.md) when Mastra mechanics materially matter | all Mastra research |
| Security / authority | [`reference/security-and-authority.md`](reference/security-and-authority.md) | exact Product/architecture owner | implementation history |
| Release / deployment / recovery | [`reference/release-deployment-and-operations.md`](reference/release-deployment-and-operations.md) | [`phases/3m-failure-recovery-architecture.md`](phases/3m-failure-recovery-architecture.md) when closure rationale matters | raw historical review |
| Frontend / Product surfaces | [`reference/frontend-and-product-surfaces.md`](reference/frontend-and-product-surfaces.md), Frontend Method | [`product/contract.md`](product/contract.md), exact current block owner | qualification |
| Managed execution | [`reference/managed-execution.md`](reference/managed-execution.md) | [`reference/managed-execution-qualification.md`](reference/managed-execution-qualification.md) | unrelated runtime research |
| Repository / Git / CI | [`development/repository-method.md`](development/repository-method.md), [`development/engineering-rules.md`](development/engineering-rules.md) | exact script/workflow or Git history needed by the question | Product research |
| Production realization | [`development/engineering-method.md`](development/engineering-method.md) | [`development/production-realization-guide.md`](development/production-realization-guide.md) when its detailed technology/proof lenses are useful | unrelated Evidence |
| Blueprint / planning harness | [`development/blueprint-harness-design.md`](development/blueprint-harness-design.md) | [`development/softwareforge-reference-assessment.md`](development/softwareforge-reference-assessment.md) when SoftwareForge-derived ideas matter | Product authority by reference |
| Mitra / Factory AI / Mastra research | [`research/index.md`](research/index.md) | exact study and provenance | unrelated research |
| Qualification Evidence | [`evidence/qualification/3l/summary.md`](evidence/qualification/3l/summary.md) | exact harness/source needed by the claim | Product history |

## Authority hierarchy

```text
accepted Product / architecture / contract authority
→ current decision register + roadmap
→ detailed current technical references
→ accepted qualification conclusions
→ reproducible Evidence + exact source/version
→ research + historical Git content
```

Mechanism is not authority. Evidence and research may falsify an accepted decision through the adopted methods; they do not silently replace Product authority.

## Navigation principle

**Global coverage does not require global context.** The index makes relevant authority discoverable; it is not a requirement to preload every linked document.

Start narrow. Expand for a named reason. Never omit materially relevant context merely because it sits outside the starting set, and never load unrelated material merely because it exists.
