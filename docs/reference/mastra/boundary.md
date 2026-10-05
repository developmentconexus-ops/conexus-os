# Mastra boundary

Evidence for [native first](../architecture.md#native-first): each place where the Hub crossed the
line between Conexus and Mastra, what the installed Mastra offers, and what Conexus does instead. The
rule lives in the architecture guide; this page is the evidence a reviewer checks it against.

Each item ends in one decision.

- **A.** A public Mastra API exists. Conexus uses it.
- **B.** No public API exists. The item becomes an upstream proposal for `mastra-ai/mastra`. Conexus
  keeps the smallest honest seam, with a comment that names the proposal, or drops the feature.

The versions each item was read at are named in the item. Mastra paths below are relative to
`node_modules/@mastra/`. Items 1 to 4 and proposals U1, U3, U4 and the first U10 concerned the Mastra
Factory, which left the Hub under C-032; Git history keeps them.

## Summary

| # | Item | Decision | Status |
| --- | --- | --- | --- |
| 5 | Conversation titles in Portuguese | A | Implemented |
| 6a | Classifying model errors | A | Implemented |
| 6b | Writing run diagnostics into a conversation | A, experimental API | Implemented |
| 7 | Mounting the Builder's agent controller | A, with four traps | Implemented |
| 8 | Ending a turn that a processor stopped | B | Implemented; waits on U6 |
| 9 | Keeping a run's sandbox alive | A, plus B for the timeout | Implemented; waits on U7 |
| 10 | Starting the agent's shell in the Project checkout | A | Implemented |
| 11 | Giving the Builder the `connector_fetch` tool | A | Implemented |
| 12 | Keeping vendor values out of the browser | A for the tool's transforms, B for what they miss | Implemented; waits on U8 and U9 |
| 13 | Platform rules above the Project's own instructions | A | Implemented |
| 14 | The composer's focus glow | Deliberate override, C-031 | Implemented |
| 15 | AppShell's frame chrome | Deliberate override, C-031 | Implemented |
| 16 | MainSidebar's row and icon sizing | Deliberate override, C-031 | Implemented |
| 17 | Retrying a model's transient failures | A for the processor, B for Mastra Code's policy | Implemented; waits on U10 |
| 18 | Releasing what Mastra keeps of an ended question | Exception, until mastra-ai/mastra#25903 | Implemented; contained in one module |

## 5. Conversation titles in Portuguese

**Current code.** `apps/hub/src/builder/memory.ts` builds the Builder's `Memory` with
`generateTitle: { model, instructions }` and `observationalMemory.observation.threadTitle: true`
beside an `observation.instruction` that asks for a Portuguese title. The model is the installation's
memory default, paid by the run's account, the same one the Observer uses. The conversation list is
Mastra's own thread list under the Project's resource, so it shows `thread.title` as Mastra wrote it.
Conexus writes no title.

**What Mastra offers.** `options.generateTitle` takes `{ model, instructions, minMessages, emitEvent }`
(`memory/dist/docs/references/reference-memory-memory-class.md:56`). It names a thread after the first
turn when the thread has no title (`core/dist/agent-BOxKOk3n.js:40684`, `shouldGenerate &&
!thread.title`), and the controller creates a thread with the title `""`
(`core/dist/agent-controller-0NjSdCnl.js:1740`). Without `instructions` the default says nothing
about language (`resolveTitleInstructions` in `core/dist/agent-BOxKOk3n.js`), so a Portuguese
conversation can get an English title. `observation.threadTitle` lets the Observer retitle a thread
when its topic changes (`memory/dist/docs/references/reference-memory-observational-memory.md:64`),
and `observation.instruction` appends text to the Observer's prompt (line 60). Mastra Code turns
`threadTitle` on unconditionally and passes no title instructions
(`code-sdk/dist/agents/memory.js:137-167`). The Observer overwrites any differing title unless the
title is pinned by `Session.thread.rename`.

**Why this replaces the first request.** Until the Builder owned its `Memory`, Conexus titled a
conversation with its first request cut to 80 characters, and an earlier Factory-era plan derived the
title from the first user message at read time. Both existed because Mastra Code builds its own
`Memory` and the host could not give it title instructions (upstream proposal U2). The Builder builds
its `Memory`, so the options are reachable.

**Decision.** A. Portuguese instructions go to both writers, `generateTitle` and the Observer. The
Observer's rewrite of a generated title is Mastra Code's behavior and is kept.

## 6a. Classifying model errors

**Current code.** `modelFailure` in `apps/hub/src/builder/runtime.ts` maps `parseError(error).type` to
the Builder's codes.

**What Mastra offers.** Mastra Code names the error hosts match on:
`ProviderAuthRequiredError`, whose `name` is documented as wire-stable so "hosts match on this"
(`code-sdk/dist/auth/provider-auth-error.d.ts:1`). Its `parseError` returns a typed `ErrorType` of
`rate_limit`, `auth` and others (`code-sdk/dist/utils/errors.d.ts:21`), and treats that name as `auth`
(`code-sdk/dist/utils/errors.js:56`). Since `@mastra/code-sdk` 1.8.1 the missing-credential failure
throws `ProviderAuthRequiredError` too (`code-sdk/dist/agents/model.js:126`), which settled
[mastra-ai/mastra#24687](https://github.com/mastra-ai/mastra/issues/24687).

**Decision.** A for classification through `parseError`.

**Plan, implemented.** `runtime.ts` maps `parseError(error).type` to the Builder's codes: `rate_limit`
to `BUILDER_MODEL_RATE_LIMITED`, `auth` to `BUILDER_MODEL_AUTH_FAILED`, anything else to
`BUILDER_MODEL_STREAM_FAILED`. No error is classified by its text.

## 6b. Writing run diagnostics into a conversation

**Current code.** `apps/hub/src/builder/module.ts:108-119` builds a message by hand (`format: 2`, role
`assistant`, a hashed id) and saves it with the memory storage domain's `saveMessages`, bypassing the
agent controller and its event stream.

**What Mastra offers.** Core documents signals as the way to add system context to a thread: "Use
`sendSignal()` for lower-level system context, such as background task notifications"
(`core/dist/docs/references/docs-harness-signals.md:13`). `Session.sendSignalToThread` persists a
signal to a named thread without switching the session's thread
(`core/dist/agent-controller/session.d.ts:1363`). The next turn's model reads it as context, and live
subscribers receive it as an event. Signals are marked experimental
(`core/dist/agent/signals.d.ts:4`).

**Decision.** A.

**Plan, implemented.** The Hub sends each note with `sendSignalToThread` as a `notification` signal
with `source="conexus"`, `outcome` and `run` attributes, and a deterministic signal id, so a retry
writes it once. The signal persists without waking the agent, the next turn's model reads it as
`<notification source="conexus" ...>`, and the web conversation renders a `notification` signal as a
notice (`builder-turn-notice`) apart from the Builder's turn. The hand-built message is deleted.

## 7. Mounting the Builder's agent controller

**Current code.** `apps/hub/src/builder/harness/controller.ts` (`createBuilderController`) builds
`createCodingAgent` from `@mastra/core/coding-agent` and wraps it in an `AgentController` whose id is
`conexus-builder`. `apps/hub/src/builder/module.ts` registers that controller in `new Mastra({
agentControllers })`, and `apps/hub/src/builder/mastra-session-routes.ts` serves an allowlisted subset
of Mastra's own session routes. Conexus does not call `createMastraCode`, so nothing it wires for
the Mastra Code product reaches the Builder unless Conexus wires it in `controller.ts`, `memory.ts` or
`prompt.ts`.

**What Mastra offers.** `AgentController` with `createCodingAgent`, the Session API, and the server
routes in `@mastra/server`. Checked against `@mastra/core` 1.71.0, the mount has four traps:

- **The controller id is the registry key.** The Builder sets both to `conexus-builder`
  (`BUILDER_CONTROLLER_ID`), so the `:controllerId` routes find it and a route guard can compare either.
  Mastra Code's `prepareAgentControllerMount` built the controller as `mastra-code` under another key
  (`code-sdk/dist/index.js:731,1006`); the Builder does not use it.
- **A session has no model.** `SessionModel` starts with an empty id, so `hasSelection()` is false
  (`core/dist/agent-controller-0NjSdCnl.js:2486`). `run/turn.ts` seeds the installation default
  with `session.model.switch` when a run starts and the conversation has none.
- **A model choice belongs to one thread.** `session.model.switch()` persists only when `scope` is
  `"thread"` (`core/dist/agent-controller-0NjSdCnl.js:2554`). `scope: "global"` persists nothing.
  `saveForMode` writes the thread's settings without moving the live session, which also needs `set()`
  (`core/dist/agent-controller-0NjSdCnl.js:2505`). `thread.switch` loads the new thread's model, but
  when that thread has none it keeps the previous model in memory
  (`core/dist/agent-controller-0NjSdCnl.js:1871`).
- **`thread.getById` is not scoped to the resource.** It returns any resource's thread row
  (`core/dist/agent-controller-0NjSdCnl.js:1576`). `listMessages` checks ownership and throws
  `Thread not found` (`core/dist/agent-controller-0NjSdCnl.js:1607`). `mastra-session-routes.ts` serves
  only the thread list and a thread's messages without a session, and checks the resource on both.

The `agent-controller-*.js` chunk name carries a build hash. After an upgrade, find the same code by
searching for `hasSelection`, `saveForMode` and `requireOwnedThread`.

**Decision.** A. The traps are behaviors of public APIs, not missing APIs.

## 8. Ending a turn that a processor stopped

**Current code.** `watchTripwire` in `apps/hub/src/builder/runtime.ts` subscribes to the turn's thread
through `session.machinery.subscribeToThread`. On a `tripwire` chunk it aborts the session, and
`sendBuilderSessionMessage` fails the run with `BUILDER_AGENT_TRIPWIRE`.

**What Mastra offers.** An input processor that calls `abort()` ends the agent's stream with a
`tripwire` chunk. Observational memory does this when it cannot reach its store.
`AgentController.processStreamChunk` has no case for that chunk
(`core/dist/agent-controller-0NjSdCnl.js:441`), so the session emits neither `agent_end` nor `error`,
and `sendMessage` never settles. `Session.machinery` is a public getter
(`core/dist/agent-controller/session.d.ts:1244`), but Mastra documents `SessionMachinery` as what the
controller injects into a session, not as a host API.

**Decision.** B (U6). The watcher stays until the controller settles `sendMessage` on a tripwire.

## 9. Keeping a run's sandbox alive

**Current code.** `ConexusRunSandbox.holdOpen` in `apps/hub/src/builder/sandbox.ts` extends the
deadline with `this.e2b.setTimeout` before a run's first command and every third of the budget until
the run releases it.

**What Mastra offers.** `E2BSandbox` sends its `timeout` to E2B only when it creates the VM
(`e2b/dist/index.js:829`) or connects to an existing one (`:1267`, `:1288`). E2B counts it from that
moment, command activity never moves it, and nothing in `@mastra/e2b` extends it during a run. The field is private in the type declarations. `E2BSandbox.e2b` is the
documented way to reach an E2B feature that the `WorkspaceSandbox` interface lacks, and E2B's
`Sandbox.setTimeout` moves the deadline.

**Decision.** A for the extension through `e2b`. B (U7) for a timeout that the sandbox exposes and
extends itself. Until then the subclass takes the budget as a required option and never copies the
private default.

## 10. Starting the agent's shell in the Project checkout

**Current code.** `ConexusRunSandbox` in `apps/hub/src/builder/sandbox.ts` passes the checkout,
`/workspace/repo`, as its `workingDirectory` when it is constructed.

**What Mastra offers.** A command with no `cwd` runs in the sandbox's `workingDirectory`
(`e2b/dist/index.js:557`), so the agent's shell starts in the checkout.

**Decision.** A.

## 11. Giving the Builder the `connector_fetch` tool

**Current code.** `createConnectorFetchTools` in `apps/hub/src/connectors/builder-tool.ts` returns
`connector_fetch` when the request context carries the consumer of a Builder run the connector module
opened, and nothing otherwise. `module.ts` passes it as `connectorFetch` to `createBuilderController`,
whose `createCodingAgent({ tools })` resolves it per request beside `conexus_check`,
`conexus_run_operation`, `web_search` and `web_fetch`.

**What Mastra offers.** `tools` on an agent is a function of the request context, so a tool can exist
for one run and not for another. The connector module's `BuilderConnectorRun.bind` puts the run's
consumer into the run's `RequestContext`, the only way the tool finds its scope.

**Decision.** A.

## 12. Keeping vendor values out of the browser

**Current code.** `connector_fetch` sets `transform` for the `display` and `transcript` targets on
the input, input-delta, output and error phases, and leaves `toModelOutput` unset
(`apps/hub/src/connectors/builder-tool.ts`). `registerFactoryMastraRoutes` also applies the
connector module's projection to the session's stream route and thread messages route
(`apps/hub/src/builder/mastra-session-routes.ts`, `apps/hub/src/connectors/fetch-projection.ts`).

**What Mastra offers.** `createTool({ transform })` shapes a tool's payloads for display streams and
user-visible transcripts (`core/dist/docs/references/docs-agents-tools.md`, "Transform tool payloads
for UI and transcripts"). Measured on `@mastra/core` 1.71.0 by
`tests/implementation/connector-builder-tool.test.mjs`:

- The output transform reaches the session's `tool_end` event. The input transform does not reach
  `tool_start` when the model streamed the input (`tool-input-start` before `tool-call`), which real
  providers do; the event carries the raw arguments (`core/dist/agent-controller-0NjSdCnl.js:537`).
- The thread's stored messages keep the raw arguments and result beside the transformed copies in
  their metadata, and a later turn of the conversation receives the raw result from them.
- `toModelOutput` stores its value at `providerMetadata.mastra.modelOutput`
  (`core/dist/agent-BOxKOk3n.js:29150-29185`), which the thread messages route serves.

**Decision.** A for the transforms. B (U8, U9) for the two gaps: the route-level projection stays
until Mastra transforms a streamed input and persists only the transcript projection.

## 13. Platform rules above the Project's own instructions

**Current code.** The Conexus prompt is the agent's `instructions`, a function of the request context
(`conexusInstructions` in `apps/hub/src/builder/harness/prompt.ts`). It states the platform rules
first, then the Project's `AGENTS.md` and `.conexus/memory/MEMORY.md`, which the Hub reads from the
Conexus Git `main` and places in the prompt under their own markers. For an `openai/gpt-5.4` or
`openai/gpt-5.5` model it then adds Mastra Code's model-specific prompt, imported from
`@mastra/code-sdk/agents/prompts/model`.

**What Mastra offers.** `instructions` on `createCodingAgent`, resolved again on every call of a run,
including a resumed one. Mastra Code's own prompt builder, with its `hostInstructions` and its
`AGENTS.md` loading, is not part of this path, so the ordering problem it had (platform rules ranked
below the checkout's `AGENTS.md`) does not arise. The model-specific prompts are exported
(`code-sdk/dist/agents/prompts/model.js`); the function that adds them to Mastra Code's prompt
(`buildFullPromptSections`) is not used.

**Decision.** A. The upstream proposal U10 is not needed.

## 14. The composer's focus glow

**Current code.** `apps/web/src/features/builder/composer/composer.css:10-65` layers a continuous
conic-gradient glow on top of `@mastra/playground-ui`'s own `.composer-ring` element, driven by its
own `@property --cx-glow-angle` and `cx-glow-spin` animation, left isolated from the vendor's
`--composer-ring-angle` custom property.

**Why Conexus needs it.** The operator asked for the ring to carry a continuous ipê glow on focus and
while the composer is busy, matching a prototype exactly ("no cursor-following glow, ever", the operator,
2026-09-22). Re-pointing a Mastra-read custom property in `mastra-theme.css`, the ordinary repaint
path, cannot change what triggers the animation or its timing; only overriding the ring's own
animation does.

**Decision.** Not a KEEP/REPLACE/SIMPLIFY mechanism; no table, route or exported helper changes, only
CSS specificity on a rendered part. Recorded here as a deliberate override under C-031's exception
rule, with the reason in the comment at `composer.css:10-16`.

**Implemented.** `composer.css`, on `.cx-composer .composer-ring` and its `[data-busy="true"]` state.

## 15. AppShell's frame chrome

**Current code.** `apps/web/src/app/frame.css:105-110` overrides `AppShell`'s own frame element
(`[data-slot="app-shell-frame"]`: margin, border, radius, shadow and the grid template) and its main
region (`[data-slot="app-shell-main"]`).

**Why Conexus needs it.** `AppShell` frames its content as a floating rounded card. The redesign runs
the top bar and sidebar edge to edge instead, with the frame carrying none of that card styling and
its main region filling the remaining height exactly, per the comment at `frame.css:105-108`.

**Decision.** Not a KEEP/REPLACE/SIMPLIFY mechanism; a deliberate CSS override under C-031's exception
rule, reasoned in the comment at that location.

**Implemented.** `frame.css:109-110`.

## 16. MainSidebar's row and icon sizing

**Current code.** `apps/web/src/app/frame.css:67-72` overrides `MainSidebar`'s own nav row height,
label size and icon size, scoped to `.shell-sidebar li` so the change cannot leak into another list.

**Why Conexus needs it.** The library's default "sm" size (12px, 28px rows, 16px icons) is one step
below the prototype (14px/500, 34px rows, 18px icons), per the comment at `frame.css:67-69`.

**Decision.** Not a KEEP/REPLACE/SIMPLIFY mechanism; a deliberate CSS override under C-031's exception
rule, reasoned in the comment at that location.

**Implemented.** `frame.css:70-72`.

## 17. Retrying a model's transient failures

**Current code.** `apps/hub/src/builder/harness/error-processors.ts` builds the agent's
`errorProcessors`, and `harness/controller.ts` sets `maxProcessorRetries` to 64.
`apps/hub/src/builder/runtime.ts` continues a session only for a storage or network fault under the
loop.

**What Mastra offers.** `StreamErrorRetryProcessor` (`@mastra/core/processors`) retries a failed model
call inside the call, with matchers, a delay and an `onRetry` hook. Mastra Code's own policy for it is
in `createMastraCode` (`code-sdk/dist/index.js`): ten retries for a dropped connection or a 5xx, a
delay of 500 ms doubling to 30 s, an `error` event with `retryable`, `retryAttempt` and `maxRetries`
on each retry, and `maxProcessorRetries` of 64 so core's cap of 3 does not cut it short. The package
does not export the matchers or the delay.

**Decision.** A for the processor and the event. B for the policy: the two matchers, the delay and the
constants are copied with their license note (Apache License 2.0) and listed as U10. The Hub no
longer sends the model a "transient failure" message for a failure Mastra retries itself. A storage
fault still continues the session with one line, because `sendMessage` takes content and has no call
to carry a turn on.

**Implemented.** `error-processors.ts` and `runtime.ts`. The web reads a `retryable` error event as a
retry in progress (`live-turn.ts`).

## 18. Releasing what Mastra keeps of an ended question

**Current code.** `apps/hub/src/builder/mastra-leftovers.ts` calls the Mastra instance's
`__unregisterInternalWorkflow('agentic-loop', runId)` and deletes the snapshot rows of the
`agentic-loop` and `executionWorkflow` workflows through the workflows store's
`deleteWorkflowRunById`. Its one caller is `endQuestions` in `apps/hub/src/builder/run/question.ts`,
after a question the person ended without an answer is aborted or denied.

**What Mastra offers.** Mastra 1.71 keeps the loop registration and both snapshot rows of a suspended
run that an abort ends and that never resumes (mastra-ai/mastra#25903). There is no public release:
`declineToolCall` throws on the aborted run, and resuming only to skip the call costs a model turn.
Without the release, every question ended without an answer stays in the Hub process's heap and in
storage.

**Evidence.** Spike S-8 of spec 0011 (#501, in Git history):
abort, release and snapshot delete keep the heap at the control level and leave no rows; a skip resume
costs an extra model call. The heap test `tests/manual/builder-question-heap.test.mjs` measures it
through real runs.

**Decision.** A documented exception to this page's rule, contained so it cannot spread:
`mastra-leftovers.ts` is the only file that reaches these internals, and the census item
`mastraInternalsOutsideLeftovers` in `scripts/census-builder-run.mjs`, recorded at 0, fails on any other
caller.

**Removal trigger.** The test "Mastra still leaves the loop registration and the snapshot rows of a
question an abort ends" in `tests/implementation/builder-run-question.test.mjs` fails once an upgrade
fixes #25903. Then the module, its caller, the census item and that test go.

## Upstream proposals

U2 is the text of an issue opened on `mastra-ai/mastra` on 2026-09-22. The others are drafts that
are not opened yet. Each names the installed version it was checked against.

### U2 ([mastra-ai/mastra#24688](https://github.com/mastra-ai/mastra/issues/24688)). Let hosts give title instructions, and name the language by default

**Packages.** `@mastra/core` 1.71.0 and `@mastra/code-sdk` 1.8.3.

Core's default title instructions (`resolveTitleInstructions`) do not say which language to use, so a
conversation in Portuguese often gets an English title. Mastra Code builds its `Memory` internally with
`generateTitle: { model }` and turns on `observationalMemory.observation.threadTitle`, and it exposes
neither `generateTitle.instructions` nor an observer title instruction. A host serving non-English
users cannot fix the language without replacing Mastra Code's memory.

**Status.** The Builder builds its own `Memory`, so it sets `generateTitle.instructions` and
`observation.instruction` itself (item 5) and no longer needs this proposal. It stays open for hosts
that mount Mastra Code's `Memory`.

Proposal, two parts.

1. Core and memory: add "write the title in the language of the user's messages" to the default title
   instructions, and to the observer's `thread-title` guidance.
2. Mastra Code: accept title instructions from the host, for example a `titleInstructions` option or a
   setting that Mastra Code passes to both `generateTitle.instructions` and the observer, and let the
   host turn `observation.threadTitle` off.
3. Memory: the observer overwrites a title the host set with `Session.thread.rename`, because its
   prior-title hint reads only its own metadata (`memory` 1.30.0, `dist/src-Dt8oPiQN.js:19244`) and it
   replaces any differing title (`dist/src-Dt8oPiQN.js:24598`). Seed the hint from the thread's title,
   and leave a title set by an explicit rename alone. Fixed in `@mastra/memory` 1.31.0, where a rename
   pins the title.

### U6 (not opened yet). Settle `sendMessage` when a processor stops the run

**Package.** `@mastra/core` 1.71.0, `dist/agent-controller-0NjSdCnl.js:441`.

When a processor calls `abort()`, the agent's stream ends with a `tripwire` chunk.
`AgentController.processStreamChunk` has no case for it, so the session emits neither `agent_end` nor
`error`, and `Session.sendMessage` never settles. A host learns that the run ended only by subscribing
to the thread itself.

Proposal: handle `tripwire` in `processStreamChunk`. Emit `agent_end` with its own reason, or an
`error` event that carries the processor id and the reason, and settle `sendMessage`.

### U7 (not opened yet). Let `E2BSandbox` extend its own timeout

**Package.** `@mastra/e2b` 0.12.1, `dist/index.js:716`, `:829`, `:1267` and `:1288`.

`E2BSandbox` sends `timeout` to E2B only when it creates or connects to the VM. E2B counts that
deadline from that moment, and command activity never moves it, so a long agent run loses its VM in
the middle of its work. The field is private in the type declarations, so a subclass cannot read the budget back, and
nothing calls `Sandbox.setTimeout`.

Proposal: expose the budget as a `timeout` getter and add `extendTimeout(ms?)`, which resets the
deadline to the budget from now. Optionally, extend the deadline while a command or a process runs.

### U8 (not opened yet). Apply a tool's input display transform to a streamed input

**Package.** `@mastra/core` 1.71.0, `dist/agent-controller-0NjSdCnl.js:537`.

When the model streams a tool's input (`tool-input-start`, `tool-input-delta`, `tool-input-end`,
then `tool-call`), the controller's `tool_start` event and the message part it builds carry the raw
arguments, although the tool sets `transform.display.input`. The same tool called without a streamed
input gets the transformed arguments.

Proposal: attach the input-available transform to the `tool-call` chunk on both paths.

### U9 (not opened yet). Persist only the transcript projection of a transformed tool call

**Package.** `@mastra/core` 1.71.0, `dist/agent-BOxKOk3n.js:34833` (`drainUnsavedMessages`).

A thread driven by `AgentController` stores a transformed tool call's raw arguments and result, with
the transformed copies in `providerMetadata.mastra.toolPayloadTransform`. A later turn loads the raw
result into the model's context, and any reader of the stored messages sees it.

Proposal: persist the `transcript` projection in the stored message and keep the raw payload only in
the current turn's model context, or document that the stored message is raw and the projection is a
serving concern.

### U10. Export Mastra Code's transient-error policy

**Package.** `@mastra/code-sdk` 1.8.3, `dist/index.js` (`createMastraCode`).

`createMastraCode` retries a model call that failed on a dropped connection or a 5xx. Its constants,
`isTransientConnectionError`, `isTransientServerError`, `getTransientRetryDelay` and the code that
emits the retryable `error` event are private to that function. A host that builds its own agent
with `createCodingAgent` and `StreamErrorRetryProcessor` cannot reuse them, so it copies them and
drifts when Mastra Code changes them.

Proposal: export them from `@mastra/code-sdk` (for example `@mastra/code-sdk/transient-errors`), or
add them to `defaultErrorProcessors` in `@mastra/core/coding-agent`.
