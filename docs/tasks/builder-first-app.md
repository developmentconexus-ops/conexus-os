# Builder operational delivery program

This file owns the delivery sequence and the cross-increment Product outcome.
[The roadmap](../roadmap.md) owns status and grant.
[C-020](../reference/builder-c020-mastra-native.md) owns technical meaning.
Each actionable increment has one dedicated task.

## Internal pilot refactoring

The operator approved a Builder-wide coherence review on 2026-09-16.
Delivery now follows the complete user journey instead of completing every
technical subsystem before the interface can be tested.

The protected outcome is a normal coding agent over a persistent Project.
A user creates an application, sees real agent activity, uses its Preview,
requests a change, and continues after reload or a failed compilation.

The first delivery uses the current fixed React/Vite application scope.
It does not claim generated backends, business integrations, production
publication, or the entire long-term Conexus platform.

## Directed MVP consolidation

Keep the adopted Mastra/Conexus responsibility split. Remove accidental
compatibility and composition dependencies when their consumers are absent.
Do not revive Change, WorkUnit, ActorRun, a second conversation store, or a
second Session registry.

Use native Mastra traces to investigate the agent. Use existing Product facts
and targeted measurements for external operations. A diagnostic tool must observe
the same execution the user initiated, not a parallel imitation.

## Delivery checkpoints

| Increment | Observable result | Contract |
| --- | --- | --- |
| 1. Create, converse, and use | The ordinary Hub starts without unused Project planning/cognition. A real Builder request produces an interactive application in the real Preview. Native traces explain that execution. | [First operational delivery](builder-first-operational-delivery.md). |
| 2. Continue and correct | The next request edits the exact working source. Source consumers use appropriate bounded operations. Safe compiler failure information reaches the next correction without a second conversation system. | Plan only after increment 1 evidence. |
| 3. Continue through failures | Ambiguous HTTP outcomes, interruption, restart, shutdown, and expiring Preview access have truthful, bounded behavior. | Plan only when the preceding evidence identifies the remaining gap. |

These are delivery units, not permission to accumulate unrelated refactors.
Each unit includes its own tests, documentation, and real browser proof.
Known safety controls remain enforced in every unit.

## Create and open work packet

The first unit is an operator pilot. It is not general employee rollout.
Its concrete contract is the linked task, not the historical create/open packet.
Use the P-01 app-first composition and contextual Conexus panel as the minimum
interaction basis. Test that experience early. Full visual redesign is not a
prerequisite, and historical Change mechanics are not reinstated by the wireframe.

BUILD and PLAN currently distinguish native write-capable and read-only tool
exposure. They are not a required plan/approval/build workflow. Do not redesign
those modes, remove read-only enforcement, or build strategy UI in increment 1.

## Preserved guarantees

The program retains Project authorization, one active BuilderRun per Project,
idempotency, immutable source identity, CAS settlement, durable conversation,
isolated per-run Workspace, compiler/artifact identity, and last-good Preview.

A failed compilation preserves the newly admitted working source and the prior
good Preview. The next correction starts from that failed source.
A trace or an assistant statement never replaces Product settlement.

## Findings carried into delivery

| Finding | Treatment and revisit trigger |
| --- | --- |
| Optional Project cognition blocks ordinary bootstrap | Resolve in increment 1 without deleting the enabled capability. |
| No-storage runtime fallback | Confirm callers, migrate tests, and delete in increment 1. |
| Native observability not configured | Connect it to the real runtime in increment 1. No new public execution API. |
| Preview grant response treated as a ready application; automatic retry loop | Correct the client lifecycle in increment 1 and prove actual interaction. |
| Source snapshot uses serial per-file Docker reads; browser reconstructs Diff | Resolve the shared source boundary in increment 2, preserving isolation. |
| Compiler diagnostics do not reach the next agent correction | Resolve in increment 2 through the existing native conversation boundary. |
| Ambiguous retry identity and accepted-request persistence window | Increment 3 deciding tests. No claim of exactly-once delivery across that window before proof. |
| Shutdown/cancellation and Preview expiry | Increment 3 unless a deciding increment-1 failure makes a bounded correction necessary. No silent widening. |
| Legacy Preview correlation fields | Remove only with the full binding consumer census. Cosmetic renaming is not an increment-1 prerequisite. |
| Overlapping source/Registry validation or configuration | Simplify only after locating the boundary and current consumer. Do not delete security checks by line count. |

These findings do not establish that every suspected failure has occurred live.
Source observations, retained measurements, and new reproductions must remain distinct.

## Retained measurement evidence

[7R-2](builder-7r-2-runtime-waterfall.md) is no longer a universal prerequisite.
Preserve its samples and limitations. Correct the measurement tool only when a
current decision needs it. Never infer a full runtime breakdown from its totals.

The old mandatory 7R-3/7R-4/7R-5/7U ordering is superseded. Source simplification,
Preview correctness, integrated proof, and usable UX survive as work inside the
journey, not as four independent projects that must finish before use.

## Final pilot acceptance and later growth

Before expanding beyond the operator pilot, prove creation, second edit,
read-only response, compilation failure and repair, reload/restart, ambiguous
request retry, Project isolation, and usable Preview with bounded access recovery.
Reuse the current verification graph and existing live/browser tests.

After this journey is accepted, add one real business capability at a time.
Brain/Sankhya, specialized skills, workflows, subagents, and a Product trace UI
remain deferred. Keep their authority boundaries, not speculative implementations.

## Stop law

A material authority, isolation, durable-data, framework-lifetime, or Product
contradiction returns to the smallest owner. A performance hypothesis or an
adjacent cleanup does not automatically expand the current task.
