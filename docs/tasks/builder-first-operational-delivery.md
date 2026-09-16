# First operational Builder delivery

[The roadmap](../roadmap.md) owns grant and status.
[The program](builder-first-app.md) owns increment sequencing.
[C-020](../reference/builder-c020-mastra-native.md) owns the preserved architecture.
This is the implementation/review contract for increment 1, not a new platform plan.

## Protected result

In the real local Conexus, the operator creates a NEW Project, sends a bounded
application request, sees native agent activity, and uses the resulting application
inside the real authorized Preview. The same execution produces native persisted
traces for technical diagnosis.

This is an operator pilot. Continuity hardening and business-platform expansion
are not claimed complete by this increment.

## Start and roles

Read `AGENTS.md`, the roadmap, this task, the Conexus development skill and slice
lifecycle, C-020, and the Mastra skill. Use the pinned WSL preflight.
Read the current frontend reference and operate the existing P-01 wireframe
before changing the minimum layout. Do not create a competing wireframe.

The planner fixed the design below. The executor may choose local mechanical
implementation details, not a different runtime topology or trust boundary.
Use PSTACK/Poteto proportionally. Do not repeat the 360 review without a new falsifier.

## Evidence and invariants

The investigated Product subject is `ed658c65152db27390dc1c5c88ff6d1b5cfa406e`.
Revalidate any newer HEAD. Source inspection found mandatory Project cognition
at bootstrap, an unused no-storage runtime alternative, no configured native
observability, and a Preview client that conflates launch with application readiness.

Keep authorization, CSRF, one active BuilderRun per Project, idempotency, exact
source/version, CAS, native Thread/messages, fresh scoped Session/Workspace/E2B,
source admission, isolated compilation, Registry identity, and last-good Preview.
Keep the currently adopted source operations during this increment.
Do not weaken guardrails to get a live proof to pass.

## Design 1. Remove unused bootstrap dependencies

Keep ordinary Project create/read and the Builder model admission in the real Hub.
Make the existing Project planning/cognition group optional at its composition boundary.
The group contains Inception, baseline explanation, and their exclusive pools.

Select this group from its exclusive baseline/Inception configuration inputs.
Shared source-root, model-catalog, credential-slot, and ownership-manifest inputs
must not implicitly activate it. No exclusive planning input means disabled.
A partially supplied group fails configuration rather than enabling a partial service.
A complete group preserves its current routes, authorization, and behavior.

When disabled, do not construct `createProjectMastra`, resolve the separate
Project cognition admission, open planning pools, or register planning-only
PRJ-07/08/09/23/24 handlers. Ordinary PRJ-01/02/03 remain registered.
Keep the existing full configuration valid. Preserve Brain/binding composition
and its independently consumed manifest when enabled.

Use the existing optional baseline-pool seam in `createProjectStore` and
conditional registration in the current Project module/routes.
Do not add a plugin registry, feature framework, service locator, or a new router.
Do not delete the broader planning implementation or published migrations.

## Design 2. One native coding runtime

Confirm the callers of `createMastraE2BCodingWorkerRuntime` on the execution HEAD.
The Product and corrected P2 both supply the native shared composition.
Make that composition required and remove the fallback agent/controller creation,
its unscoped `builder` branch, and per-run fallback controller destruction.

Keep one coding agent and AgentController per Hub instance, native registry
lookup, `resourceId=ProjectId`, `scope=builder:<BuilderRunId>`, the persistent
Project Thread, and fresh Workspace/Session per run.
Do not remove the physical sandbox binding or change E2B retry/isolation policy.
Migrate relevant tests in the same change. An actual remaining Product caller
without this composition is a STOP finding, not permission to retain a broken fallback.

## Design 3. Native local traces on that execution

Add and exactly pin `@mastra/observability@1.17.4`, then verify its installed
exports and peer compatibility before Product edits. Keep core 1.63.2, e2b
adapter 0.11.0, memory 1.28.1, and libsql 1.22.2 unchanged.

Exact-source basis is Mastra commit
`003e75745c5fd6a7af8464ece1d2930f81dd15af`, including
`observability/mastra/src/config.ts`, `exporters/mastra-storage.ts`, and
`packages/core/src/agent-controller/agent-controller.ts`.
This source check is not an executed integration proof.

Use `Observability` with an explicit local `MastraStorageExporter` configuration,
service name `conexus-builder`, native sensitive-data filtering, and the same
LibSQLStore already owned by the Builder. Do not use a convenience default that
adds cloud exporters. Do not add a tracing database or telemetry service.

Pass observability through the existing `AgentController` configuration.
Use only two server-derived correlation keys in the existing RequestContext:
`conexusBuilderProjectId` and `conexusBuilderRunId`.
Whitelist those keys through native `requestContextKeys`. Do not serialize the
Workspace, whole request context, credentials, headers, or arbitrary configuration.
Keep correlation out of the model prompt and public Product response.

Native agent, model, and tool spans are the evidence source. Do not manually
recreate their lifecycle. Token fields unavailable from the provider remain
unavailable, never zero by assumption. Model-call elapsed time is not labeled
as pure internal reasoning time.

Flush using the native lifecycle before storage closes. Export failure must not
change a successful Product settlement into failure or block it indefinitely.
Expose an existing safe diagnostic error rather than inventing a second run status.
Keep optional Mastra usage telemetry disabled; verify tracing separately instead
of removing that protection by assumption.

The deciding trace read uses the native storage API in the existing local proof
or operator diagnostic command. It must read the actual Builder-run trace after
Session deletion. Do not create a public Mastra server or a second coding runtime.
A Studio viewer and a Product trace panel are not prerequisites for this delivery;
the native persisted data is retained for that later read-only integration.

## Design 4. Real Preview and truthful minimum UI

Use the existing production composition in `server.ts`: IdentityAccess entry
issuance, MAR route/grant consumption, Registry reads, and the Preview origin.
A module-only fixture with `launchPreview` absent does not prove this result.
Do not fabricate Change records or redesign MAR correlations in this increment.

Preserve P-01's dominant application area, right-side Conexus interaction, and
read-only Code/Diff lenses. Keep technical identities secondary. Do not add a
mode workflow or extra screens. Preserve the current BUILD/PLAN permission contract.

Keep the Preview client lifecycle local to the current component or one cohesive
hook if extraction reduces its state complexity. Use a stable key containing
Project, source, and artifact identity. Permit one in-flight launch per key.
Ignore stale completion from an older key or an unmounted Project.

A launch failure ends the automatic attempt for that key and shows a retry action.
Only explicit retry or a different preview key starts another attempt.
Render, polling, focus, and mutation-object identity do not reset that failure.
Keep the previous launch/frame on a launch-HTTP failure. Do not blank a good
Preview merely because another BuilderRun is active or compilation failed.

Distinguish a compiled artifact from an issued grant and an application displayed.
Remove unconditional "Preview pronto" after the launch response.
Neither a grant response nor iframe `load` alone proves that application JavaScript
works. Use neutral truthful status when no reliable readiness signal exists.
Do not add an app readiness protocol or alter the trusted compiler recipe just
for this label. The browser proof below establishes actual interactivity.

Retain `expiresAt` in the client representation. Automatic renewal semantics are
left for the failure-continuity increment; do not claim expiry recovery here.
A user-triggered reopen of the current Preview must still be possible.

## Code census

| Action | Existing location and purpose |
| --- | --- |
| CHANGE | `apps/hub/src/platform/config.ts`: optional planning configuration group. |
| CHANGE | `apps/hub/src/project/module.ts` and `routes.ts`: conditional existing planning composition/routes. |
| KEEP/ADJUST | `apps/hub/src/project/store.ts`: existing ordinary paths and optional pools; no custody redesign. |
| CHANGE | `apps/hub/src/builder/module.ts` and `runtime.ts`: required shared composition, native tracing, and lifecycle. |
| KEEP/ADJUST | `apps/hub/src/server.ts`: real composition only; no replacement proof server. |
| CHANGE | `apps/web/src/features/builder/components/project-build.tsx` and `api.ts`: bounded Preview state and truthful labels. |
| KEEP | Builder service/store, source admission, compiler recipe, Registry, MAR security, and published migrations. |
| CHANGE | `package.json` and lockfile for the single admitted tracing dependency. |
| EXTEND | Existing focused tests under `tests/implementation/`, including corrected P2 and actual local/browser proof. |

This is a file envelope, not permission to edit every path.
Do not introduce a new framework or a new qualification directory.

## Ordered work

1. Run preflight and confirm the named callers and exact package APIs.
2. Add focused failing tests for optional bootstrap, required native composition,
   trace correlation/privacy, and bounded Preview failure behavior.
3. Remove the runtime fallback and bootstrap coupling. Run their focused tests.
4. Wire native tracing on the same runtime. Prove persisted correlation and
   safe export behavior without changing Product settlement.
5. Correct the minimum Preview/UX path and run browser negative tests.
6. Run one real bounded application journey through the actual local stack.
7. Reconcile owners and run the applicable complete verification graph.
8. Commit, push, and STOP for independent review of this increment.

Do not collect a new S1-S6 baseline or complete every 360 finding in this task.

## Limited operational configuration extension

The live Hub and Builder proof commands load the already-authorized local
`.audit/slice7/hub.env` explicitly with Node's `--env-file` option. The file is
ignored, mode-restricted, and never committed. Its plain `KEY=value` format is
validated before use; the current process environment has precedence over file
values according to Node's env-file behavior. `readHubConfig` remains the
configuration validator, and an absent or partial file still fails at that
boundary without printing values. This limited extension also reconciles
`rb:first:check` with the current focused test set and restores the durable
Software Forge assessment route in the documentation index. It does not add a
runtime loader, secret manager, observability program, or infrastructure task.

## Deciding proof and falsifiers

| Proof | Required observation |
| --- | --- |
| Minimal bootstrap | Ordinary Project and Builder start without planning-only settings. No cognition model call occurs. Partial planning configuration is refused. Full configuration keeps its routes. |
| Shared runtime | Missing shared composition fails at the boundary. Two native run scopes retain the same Project Thread after Session deletion. No duplicate registry exists. |
| Native traces | The actual user-initiated BuilderRun has a persisted native agent trace with correctly related model/tool spans and the two exact correlation values. No trace is substituted from a probe agent. |
| Trace privacy/failure | An injected synthetic credential is not exported. Exporter failure does not grant access, mutate source, or change terminal Product truth. |
| Preview failure | Inject a launch failure and re-render/poll repeatedly. There is exactly one automatic launch until explicit retry. A stale earlier response cannot replace a newer Project/artifact. |
| Last-good preservation | A failed next compilation and an HTTP launch error preserve the previous usable Preview. Reuse existing tests; do not implement an autonomous repair workflow. |
| Actual application | Create a NEW Project, request a counter starting at 0, await real compilation, enter the real Preview, and click to observe 1 and then reset to 0. No stub replaces Builder execution, compiler, Registry, or Preview access. |
| Operator continuity smoke | Reload the completed Project. Conversation and last-good coordinates remain, and the Preview can be opened. Do not claim crash-window recovery from this smoke. |
| Denial | An unauthorized account/Project cannot read source, observe the run, or obtain/consume an unrelated Preview grant. |

Use isolated/mocked fixtures for specific failure branches. Label those claims.
Use real authorized provider/E2B and real Product composition for the deciding
application journey. Existing admitted local test identity setup may be reused;
do not replace IdentityAccess/MAR/Registry with permissive callbacks in that proof.

Run the current `npm run verify` graph in pinned WSL with its disposable PostgreSQL
configuration and no unaccounted database skips. Use existing commands for Hub/Web
type checks, lint, and `git diff --check` as required by the current graph.
Record exact commands, outcome, and any unexecuted check. Do not claim this planner
session ran those checks. Apply the method's risk-triggered independent review;
self-review is not a separate challenger.

## Owner reconciliation and completion

Update existing owners only for facts this increment changes or proves.
The roadmap advances to a review-pending candidate, not ACCEPTED by the executor.
Keep 7R-2 artifacts unchanged and its incomplete-claim limitations visible.
Document the minimal local launch and native trace-inspection commands in the
existing applicable operator/runtime documentation, not a parallel handbook.

Return final SHA, changed-file/deletion census, deciding browser evidence,
native trace identity/correlation evidence without payload secrets, verification
results, and preserved unrelated local state. Leave the authorized local Product
usable for the operator. Commit and push do not authorize merge or deployment.

## Non-goals and STOP law

No Git/source batching or Diff redesign, compiler-feedback workflow, new durable
message intake, crash recovery redesign, expiry auto-renewal, full Studio integration,
second event store, broad Mastra API, new cloud telemetry, sandbox pooling, or
business capability work belongs here.

STOP on a real caller that needs the removed fallback, exact package incompatibility,
a changed trust boundary, missing authority for the live proof, or a Product defect
that cannot be corrected inside this envelope. Return the smallest failing invariant
and a bounded decision, not a speculative redesign. Otherwise continue mechanical
work to the deciding browser result without repeated approvals.
