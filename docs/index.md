# Conexus OS Documentation Map

> **Role:** navigation aid only. Current stage, implementation gate, and exact next action live in [`roadmap.md`](roadmap.md). This file gives useful starting points; it does not limit what may be read.

## Start

Read [`../AGENTS.md`](../AGENTS.md) and [`roadmap.md`](roadmap.md), then use the adopted local method that fits the work:

- material engineering and Global Maximum decisions: [`development/engineering-method.md`](development/engineering-method.md)
- frontend Product Experience planning: [`development/frontend-product-experience-planning-method.md`](development/frontend-product-experience-planning-method.md)

Use the references below to orient investigation. There is no fixed file count or owner count. Expand into Product, architecture, decisions, contracts, Evidence, qualification, research, Git history, code, runtime, or external sources whenever they can materially change or falsify the conclusion.

## Useful starting points

| Need | Useful starting references |
| --- | --- |
| Current stage / implementation gate / next action | [`roadmap.md`](roadmap.md) |
| Engineering reasoning / root cause / Global Maximum / proof | [`development/engineering-method.md`](development/engineering-method.md) |
| Frontend Product Experience / P0–P14 | [`development/frontend-product-experience-planning-method.md`](development/frontend-product-experience-planning-method.md) |
| Phase 4 implementation-readiness program | [`phases/4-implementation-readiness-program.md`](phases/4-implementation-readiness-program.md) |
| 4A Product Surface & Authority | [`phases/4a-product-surface-and-authority-contract.md`](phases/4a-product-surface-and-authority-contract.md), [`product/operation-ledger.md`](product/operation-ledger.md), [`product/permission-contract.md`](product/permission-contract.md) |
| 4B Executable Wire | [`phases/4b-executable-wire-contract.md`](phases/4b-executable-wire-contract.md), [`product/wire-contract.md`](product/wire-contract.md), `contracts/api/product/openapi.yaml` |
| 4C Frontend Interaction & Authority | [`phases/4c-frontend-interaction-and-authority-realization.md`](phases/4c-frontend-interaction-and-authority-realization.md), the frontend method, and the relevant Product/wire/Evidence for the current block |
| Current P-02 / F22 Data Explorer | [`evidence/4c/p02-f22-data-explorer-design.md`](evidence/4c/p02-f22-data-explorer-design.md), [`evidence/4c/p02-f22-data-explorer-recompile-proof.md`](evidence/4c/p02-f22-data-explorer-recompile-proof.md), [`evidence/4c/p02-p8-walkthrough-script-fix.md`](evidence/4c/p02-p8-walkthrough-script-fix.md) |
| Product meaning / scope / journeys | [`product/contract.md`](product/contract.md), [`product/operation-ledger.md`](product/operation-ledger.md), [`decisions/index.md`](decisions/index.md) |
| Human context identity | [`product/human-context-identity-contract.md`](product/human-context-identity-contract.md) |
| Architecture overview / semantic owners | [`architecture/index.md`](architecture/index.md), then the relevant reference document |
| Builder / Harness | [`reference/builder-and-harness.md`](reference/builder-and-harness.md) |
| Product Agents / runtime / Mastra | [`reference/runtime-and-agents.md`](reference/runtime-and-agents.md), [`reference/mastra/index.md`](reference/mastra/index.md) |
| Brain / knowledge | [`reference/brain-and-knowledge.md`](reference/brain-and-knowledge.md), [`reference/data-and-persistence.md`](reference/data-and-persistence.md) |
| Data / Sankhya | [`reference/data-and-persistence.md`](reference/data-and-persistence.md), [`reference/integrations-and-gateway.md`](reference/integrations-and-gateway.md) |
| Integrations / Gateway | [`reference/integrations-and-gateway.md`](reference/integrations-and-gateway.md), [`reference/security-and-authority.md`](reference/security-and-authority.md) |
| Security / authority | [`reference/security-and-authority.md`](reference/security-and-authority.md), [`architecture/index.md`](architecture/index.md) |
| Release / deployment / recovery | [`reference/release-deployment-and-operations.md`](reference/release-deployment-and-operations.md), [`phases/3m-failure-recovery-architecture.md`](phases/3m-failure-recovery-architecture.md) |
| Frontend/Product surfaces | [`reference/frontend-and-product-surfaces.md`](reference/frontend-and-product-surfaces.md), [`product/contract.md`](product/contract.md) |
| Managed execution | [`reference/managed-execution.md`](reference/managed-execution.md), [`reference/managed-execution-qualification.md`](reference/managed-execution-qualification.md) |
| Decision rationale / reopen | [`decisions/index.md`](decisions/index.md), then the implicated owner/Evidence |
| Repository Git/CI/proof specialization | [`development/engineering-rules.md`](development/engineering-rules.md) |
| Production realization research | [`development/engineering-method.md`](development/engineering-method.md) plus [`development/production-realization-guide.md`](development/production-realization-guide.md) when its detailed technology/proof lenses are useful |
| Blueprint / planning-harness design | [`development/blueprint-harness-design.md`](development/blueprint-harness-design.md) |
| SoftwareForge reference assessment | [`development/softwareforge-reference-assessment.md`](development/softwareforge-reference-assessment.md) |
| Mitra / Factory AI / Mastra research | [`research/index.md`](research/index.md) and the relevant study |
| Qualification Evidence | [`evidence/qualification/3l/summary.md`](evidence/qualification/3l/summary.md), then the exact harness/source needed for the claim |

## Authority hierarchy

```text
accepted Product / architecture authority
→ current decision register + roadmap
→ detailed current technical references and contracts
→ accepted qualification conclusions
→ reproducible Evidence + exact source/version
→ research + historical Git content
```

Mechanism is not authority. Evidence and research may falsify an accepted decision through the adopted methods; they do not silently replace Product authority.

## Navigation principle

These links are entry points, not fences. Do not omit materially relevant context because it sits outside a suggested starting set. Do not read irrelevant material merely to satisfy ceremony.
