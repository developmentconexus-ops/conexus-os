# Implement the approved interactive Builder

The roadmap owns status and execution permission. This is the single current
execution contract. It integrates the unfinished connection and first-delivery
work rather than starting another coding runtime or an independent UI project.

## Protected result

An operator connects Claude from the chat, chooses a model, creates an application,
uses its real Preview, changes the model for a second request, and continues on
the same Project and source. A failed compilation preserves the last-good Preview.
The operator can request a correction, interrupt a run, reload, inspect Code and
Changes, and open safe details for the actual execution.

The operator approved the interactive HTML on 2026-09-17 and explicitly prioritized
functionality over colors, fonts, and visual polish. Interaction parity is the
acceptance target. Pixel parity, a new design system, and another mockup approval
are not prerequisites.

## Read first

AGENTS.md -> docs/roadmap.md -> .agents/skills/conexus-development/SKILL.md ->
this task -> docs/reference/frontend-and-product-surfaces.md section 33.6 ->
docs/reference/builder-c020-mastra-native.md.

Use the slice-lifecycle and Mastra skills for the touched boundaries. Consult the
frontend method only for a real interaction contradiction. The approved prototype
replaces the old ordinary diagnostic presentation, not the whole P-01 family.

## Exact approved artifact

Input attachment: `conexus_builder_interativo.html`, 106309 bytes.
SHA-256: `465ffcabf3974f2f227c825c5288916f9dfbad5d1c8b736c6aaca81f62d62665`.
Git blob: `731b36f6da30426b5e12cb9d439dd02192911851`.

The planning publication records this identity. The original bytes are supplied
in the operator's handoff package, not claimed to be already in the repository.
As the first mechanical action, import the exact supplied HTML to
`docs/evidence/builder/approved-interactive-builder.html`, verify both hashes,
and operate it in Chromium. Do not regenerate the HTML or copy its simulator
into Product code. If the attachment is missing, request that file, not another
product-design decision. Reference it from section 33.6 once the file is present.

Demo playback, artificial speed, pause presentation, scenario selection, seeded
conversations, hardcoded models, invented token counts, and demo credentials do
not enter the Product. The example quotation app is a proof subject, not an ERP
integration or a hardcoded Conexus application. Runtime form-state transfer in the
demo is not authority for a generic cross-artifact data-migration service.

## Starting evidence

Reviewed Product code is `f9fbb655463aa24da1c3e902c20d555487ce9629`.
Planning baseline is `2e39f3ebd5db24838358671604f4b29c1583e4fa`.
Revalidate HEAD and local work before implementing.

The current code already has shared Mastra composition, persistent Threads,
per-run E2B, source admission, compiler, Registry, authorized Preview, native
observability, connection routes, and a safe live-state feed. Preserve them.

The connection review found whole-operation revocation, state continuity,
per-object refresh coordination, and generation semantics defects. Its details
remain in `claude-account-connection.md` as predecessor evidence, not a second
execution grant. No previous partial proof becomes accepted through this task.

## Chosen realization

Keep React, Vite, TanStack Query/Router, Fastify, the current Mastra pins, and the
existing PostgreSQL/CredentialBackend division. The pilot has one active Hub
process. Do not add distributed execution or concurrent Hub replicas here.

Use only the needed AI Elements components: Conversation, Message/MessageResponse,
PromptInput, ModelSelector, and Tool. Use their Radix/shadcn dependencies and a
resizable-panel component for interaction behavior. Integrate Tailwind without
replacing the existing global stylesheet or breaking other screens. Record exact
installed versions and imported component provenance in the change. A compatible
published version selection is mechanical; replacing the runtime is not.

Feed these controlled components from the current authorized session projection
and observation endpoint. Do not add a second useChat runtime, a public Mastra
mutation API, a second message store, or a reconstructed tool lifecycle. AI SDK
packages needed as component dependencies do not authorize a new execution path.
Do not execute the full-registry installer or copy the guide's standalone agent.

References checked during planning:
- https://mastra.ai/integrations/frameworks/vite-react
- https://elements.ai-sdk.dev/docs/usage
- https://elements.ai-sdk.dev/components/model-selector

Keep the current narrow Anthropic adapter and fix it against its qualified flow.
Do not add the full Mastra Code SDK only for login, a CLI subprocess, Agent SDK,
API-key fallback, or another provider. The operator explicitly authorized local
account OAuth after being informed of provider restrictions. This is acceptance
of implementation/support risk, not vendor endorsement or permission to evade
refusal. A provider rejection is reported honestly; no bypass is authorized.
The user performs sign-in and pastes the code in the application, never in logs
or the coding-agent conversation.

## Decisions that implementation must preserve

### Connection and renewal

Use the existing Account connection, Workspace bindings, and encrypted backend.
Start and completion are bound to the existing IAM Account and session identity.
Use an expiring, one-use authorization transaction. Preserve independent state
and verifier; send the validated state in exchange and the verifier only as
code_verifier. Keep current client, scopes, redirect, and egress restrictions.

Only the connection owner can revoke the connection or remove all its bindings.
Lock its row for ownership/state changes, including share and revoke. Non-owner
or unknown requests change no rows. Repeated authorized disconnect is idempotent.
Sharing stays explicit and same-Workspace, never a process-global fallback account.

Pin logical connection identity at run admission. Keep admission generation for
audit and replay. Refresh may advance tokens of that same connection without
changing the selected account or rewriting the snapshot. Preference changes only
affect later submissions. Completed disconnect denies new credential acquisitions;
requests that already acquired a credential may finish. Do not promise remote
provider revocation or instantaneous cancellation of an already-sent request.

In the existing connection module, share one in-flight acquisition/refresh promise
per connectionId before the provider call. All model instances use that boundary.
Check active state on acquisition even when the token is cached. Remove settled
promises. Do not create a service, queue, Redis dependency, or per-run auth store.
This promise coalesces operations in the single active Hub, not across processes.

Bound exchange and refresh waits. Publish the next immutable secret before
advancing its current-generation metadata. If a next generation already exists,
reconcile that same connection's complete stored token set before another refresh.
On provider refusal, conflicting publication, or uncertain rotation outcome,
return a safe reconnect-required result; do not loop indefinitely or silently
repeat a potentially consumed refresh. Crash recovery may require explicit login.
Do not claim exactly-once provider rotation across process failure.

### Model selection and admission

The chat obtains a server-owned list of choices for its authorized connection.
Add a Project-scoped model-choice read under the existing builder-session API.
Each choice has a public choiceId, label, provider label, and supported capabilities.
It resolves server-side to exact provider/model/admission coordinates. Registry
metadata is not a claim of subscription entitlement. Never use demo model IDs,
client-provided endpoints, browser-held secrets, or mutable `latest` as admission.

POST message carries content, BUILD/PLAN, connectionId, modelChoiceId, and the
existing Idempotency-Key. Validate connection permission and choice before E2B.
Record model and connection in the same BuilderRun admission transaction. Include
them in the semantic request digest. Claim and Mastra dynamic model resolution
consume that admitted choice, not runtime.modelIdentity's global default.

An uncertain retry reuses the original key AND original request body. Selector
changes during a run affect only the next submission. Never mutate the shared
agent's global model to switch a single run. Persist the per-Account/Project UI
choice as a revalidated local preference, not as execution authority. Logout
clears account-scoped cache. Provider/model refusal is explicit, without fallback.
Qualify two exact supported Claude choices for the real switching proof; do not
invent availability or declare a single-model proof equivalent.

### Conversation, progress, and Preview

Native Thread/messages remain history. Native displayState remains live agent
state. Project ordered safe message parts and stable native tool-call identity
through the existing boundary. Do not use activity array indexes as durable
identity, fabricate finished tools, or build an event-replay store.

Derive preparing/working/compiling states from actual work boundaries. If current
BuilderRun facts cannot distinguish compilation, add one bounded Product phase
field to BuilderRun; it is not a second lifecycle. A timer is elapsed display,
not a prediction of progress or completion. Missing measurements remain unknown.

Compiled artifact, issued access, loaded iframe, and working application are
separate observations. Keep last-good Preview visible while a new candidate runs.
Open/reopen uses current authorized last-good identity. Ignore stale launch
responses and bound retry. New-tab access retains the same authorization rules.
Device switching changes viewport only. Never replace MAR/Preview with srcdoc,
run generated code in the Hub origin, or weaken CSP to match the prototype.

### Correction and stopping

A failure after source admission preserves the failed working source and old
Preview. Store a bounded, redacted compiler diagnostic associated with that run
and exact source. Provide it as one idempotent native Thread result message,
using the installed Memory API. Do not save another conversation table or raw
shell logs. The next normal user request uses that source and diagnostic.
A correction suggestion fills the composer; it does not secretly execute a run.
Do not add autonomous repair loops or a Plan/approval workflow.

Add authorized idempotent cancellation to the existing Project/run API. Reuse the
service's active-work map with an AbortController per run, not a Session registry.
Record cancellation intent on BuilderRun before signaling runtime/compiler through
their existing AbortSignal seams. Finalization arbitrates cancellation against
source/Preview settlement under existing database locking/CAS. A settled run wins;
a pending accepted cancellation forbids later success/Preview promotion. Preserve
already-admitted source and the previous Preview. Terminal state is INTERRUPTED
with a safe user-cancel reason, not a new unrelated state machine. Closing the
browser or detaching SSE is not cancellation. Stop remains 'stopping' until
confirmed, and repeated clicks do not create more work.

### Inspectors and execution details

Code and Diff remain read-only. Diff compares the selected authorized run's base
and result, not current source against last-good after a successful compile.
Read paths lazily; do not fetch all files just to open the Builder. Use existing
Git capability for bounded diff/snapshot reads when needed, without a Git rewrite.

History lists bounded/paginated authorized BuilderRuns. A read-only run-detail
projection combines Product result/timestamps and that run's native trace. Project
only model label, duration, measured usage, safe span labels/timing, and safe errors.
No raw provider payload, secret coordinate, internal reasoning, or broad Studio API.
Absent traces show 'not available'; never synthetic spans, fake zeros, or durations
labeled as internal model thinking. Details do not determine settlement.

## Code envelope

| Area | Keep / change |
| --- | --- |
| `apps/web/src/features/builder/components/project-build.tsx` | Replace diagnostic presentation with approved composition. Split by actual responsibilities: workspace, conversation/composer, Preview, source inspector, run details. Do not copy demo engine. |
| `apps/web/src/features/builder/api.ts`, `observation.ts` | Extend the same authenticated contracts. Keep one observation path and reuse TanStack queries. |
| `apps/web/src/features/claude-account/` | Reuse account dialog/routes from the composer and Settings; no duplicated flow. |
| `apps/web/src/components/`, Vite/style config, package files | Add only consumed AI Elements/Radix/resizable dependencies; preserve other screens and exact lockfile. |
| `apps/hub/src/claude-account/`, `project/anthropic-oauth*.ts`, `project/oauth-token-store.ts` | Fix authorization, use one connection credential lifecycle, parameterize model ID. Delete obsolete callers after census. |
| `apps/hub/src/builder/module.ts`, `runtime.ts`, `store.ts`, `service.ts`, `routes.ts` | Carry admitted model, safe parts, phase, cancellation, diagnostics and reads through existing owners. Preserve shared controller. |
| `apps/hub/src/builder/application-build.ts`, `application-artifact-runtime.ts`, `source.ts` | Bounded diagnostic/abort/diff integration only; preserve isolation and source admission. |
| `apps/hub/src/identity-access/` | Expose existing safe session identity only where authorization binding requires it. No new login. |
| `apps/hub/migrations/`, `scripts/run-hub-migrations.mjs`, existing contracts/generators | New forward migrations and current API generation. Never rewrite 041 or historical digests. |
| `tests/implementation/` | Extend current connection/PostgreSQL/Builder/browser/live proofs; add focused tests where no behavior proof exists. |

No blanket cleanup, framework swap, generated-app template expansion, migration
of secrets, operational password change, or deletion of historical evidence.

## Ordered work within this task

These are implementation units, not new tasks or repeated approval gates. Record
progress and focused evidence here. Stop between them only for the named stop law.

### Unit 1. Connect and select a real execution subject

- [ ] Import the exact approved HTML and inspect it without altering its bytes.
- [ ] Add failing authorization/state/refresh/concurrency tests for the known defects.
- [ ] Implement the connection decisions and current API/schema generation.
- [ ] Add server-owned model choices and immutable per-run model admission.
- [ ] Prove non-owner revoke has no effects; expired/replayed/cross-session code is
  refused; concurrent same-connection callers make one refresh; two runs retain
  different admitted models; no connection fails before sandbox creation.

### Unit 2. Operate the approved workspace

- [ ] Integrate the chosen components into the existing Build route. Preserve
  keyboard use, scroll-follow, resizable panes, fullscreen, and mobile switching.
- [ ] Wire the composer connection dialog, model selector, Edit/Read-only controls,
  submission, native message/activities, and real Preview. Enter sends, Shift+Enter
  inserts a line, and IME composition never accidentally sends.
- [ ] Remove superseded handwritten rendering and duplicate state after migrating
  callers. No demo controls or permanent diagnostic-only page as the main Builder.
- [ ] Exercise a real creation and second request with two models. Prove model
  identity at provider invocation and trace, not only in the selector label.

### Unit 3. Correct and continue

- [ ] Supply safe compiler feedback and preserve current-source/last-good separation.
- [ ] Implement cancellation propagation and its settlement race tests.
- [ ] Exercise a failed source B with Preview A, then a user correction to C. Verify
  actual source lineage, unchanged main, continued Thread, and usable Preview C.
- [ ] Verify read-only creates no source mutation/compile, reload restores actual
  conversation and state, and disconnect does not delete Project or Preview.

### Unit 4. Inspect and close the pilot candidate

- [ ] Complete Code/Diff, run history, and safe native trace detail reads.
- [ ] Verify current-account/Project isolation, trace absence, old launch response,
  preview failure/reopen, and cancellation before/after source admission.
- [ ] Run focused checks, then the current complete candidate graph in the pinned
  WSL environment with the disposable test PostgreSQL. Do not silently skip live
  proofs when explicitly requested. Preserve actual commands and safe results.
- [ ] Return the local start command and demonstrated Project URL. Reconcile owners,
  commit/push the candidate, and stop for independent review, not automatic merge.

## Deciding proof

Use the existing composed-live runner and isolated PostgreSQL conventions.
The quotation example uses fictitious products and no Sankhya calls. The model
must create the app; do not seed its generated result into Product code to pass.

| Claim | Falsifier / required observation |
| --- | --- |
| Real account flow | Start, provider sign-in, code completion, safe connected status and real request. No credentials in logs/browser storage/trace. |
| Real model choice | Submit with A, select B while A runs, then submit B. A remains A, second run uses B, same Project/Thread. Unsupported selection is refused. |
| Usable application | Change quantities/discount in the compiled Preview; request freight and interact with the edited app. App-specific values are test data. |
| Honest activity | Actual native text/tools and compiler phase. No timer-driven transcript or frontend-created success. |
| Failure/repair | Induce a bounded compilation failure with a test seam/fixture, not reliance on an LLM making an error. Preserve A, retain B source, correct to C. |
| Stop | Before source admission no partial source becomes current; after admission source remains, prior Preview remains; late completion cannot override cancellation. |
| Reload/idempotency | Preserve history and admitted model; retransmit the same uncertain submission with the same key/body without a second run. No automatic replay after crash. |
| Inspection | Exact file and base/result Diff, current-user authorization, measured trace correlation after Session deletion. Missing data stays missing. |
| Workspace interaction | Desktop and narrow/mobile use, keyboard/focus, scrolling, resize and expand work without required pixel matching. |

Do not promise arbitrary generated-app state migration, provider-side logout,
exactly-once external refresh, replay of missed transient events, or automatic
resumption after a Hub crash. Current interrupted-run recovery stays truthful.

## Environment and stop law

Read the existing private env file through the documented `node --env-file` path.
Preserve `.audit/slice7/hub.env`, secret files, permissions, containers, and local
work. The previously reported PostgreSQL failures are recorded observations,
not proof of their current state. Check all required operational connections in
one read-only pass before live work. This task does not authorize changing another
role/password; report an exact remaining operational block once, while continuing
independent Product implementation/tests. Never weaken auth, TLS, or isolation.

Use the approved local OAuth path and existing E2B/provider admission for the named
proof; no unattended credential acquisition, public deployment, new providers, or
anti-abuse bypass. Preserve evidence of provider refusal without fake success.

Risk-triggered independent review under the repository method remains required
for authority/cancellation/credential changes. Planner self-review and prototype
approval do not replace it. Do not add review rounds without a surviving material
falsifier. Update current contract owners before acceptance, including generated
APIs and security meaning touched by credential access.

A new runtime, secret backend, multi-process topology, unowned data migration,
unsupported pinned API, or genuinely missing product choice returns to the planner.
Colors, spacing preferences, historical 7R-2 timing gaps, and unrelated refactors
do not block this functional delivery. Do not start the next product increment.
