# Conexus OS to Mastra mapping

## Current Builder scope

[The C-020 owner](../builder-c020-mastra-native.md) owns the ordinary Builder's
current mapping and exact pins. The current task and roadmap own unimplemented
work and acceptance. Do not use the historical pins below for new Builder code.

Builder native conversation, Session registry, Workspace binding, live display,
and tracing mechanics are distinct from Product execution/source/Preview authority.
The approved operational delivery adds native diagnosis to the same real runtime;
this document does not claim that new integration has already passed.

## Broader ownership split

| Conexus OS owns | Mastra provides |
| --- | --- |
| Product authority | Agent runtime mechanics |
| Workspace and Project | Memory substrate |
| Release and immutable serving composition | RequestContext runtime/configuration carrier |
| RuntimeAgentProjection | Native requireApproval and suspend/resume mechanics |
| AgentRun and terminal Product truth | Workflow for real deterministic flow |
| ApprovalRequest and current approver/revocation truth | Scheduler trigger mechanics |
| TriggerRevision and narrow scheduled admission | Storage adapters |
| Gateway EffectAttempt and effect authority | Observability contracts/exporters |
| Authorization, budgets, and current owner truth | Framework-local traces, snapshots, and runtime records |

## Accepted broader realization

Use direct Mastra Agent for Product Agents, not a universal Workflow wrapper.
Conversation uses Mastra Memory with server-derived threadId/resourceId; Brain is separate.
RequestContext carries runtime/configuration/correlation, not authority. Governed
resumed decisions re-read current owner truth rather than trusting retained keys.

Native requireApproval provides pause mechanics. PAR owns ApprovalRequest,
eligibility, revocation, and continuation admission. Gateway owns authorization,
idempotency, execution, and EffectAttempt truth. Model output does not prove effects.

Native scheduling may trigger narrow PAR admission; it is not MAR due-work authority.
Use Workflow only for a real deterministic multi-step flow.
Builder/PAR instances remain separate for their qualified enabled surfaces.
DurableAgent activation remains a requalification trigger.

## Historical same-process qualification

Separate storage/schema, registry, workflow, agent, model fixture, and PubSub
identities were exercised. A deliberately shared PubSub negative control tested
the wiring guard. Disabled scorer/evaluation, Observational Memory, DurableAgent,
and other process-global facilities were not qualified by that experiment.

Its exact recorded pins were core 1.56.0, memory 1.25.0, pg adapter 1.19.0,
PostgreSQL 17.10, and Node 24.18.0. Preserve those historical identities.
Do not relabel that qualification as a pass for the Builder's later package versions.

Documentation consulted during consolidation supported the mechanism/authority
split. It does not replace exact package source or a new integration's deciding proof.
