# Builder streaming UI investigation

Research date is 2026-09-12. The operator subsequently approved the narrow
implementation. This document preserves the investigation and design comparison;
it is not a replacement architecture or an implementation receipt.
[The first-app task](../../tasks/builder-first-app.md) owns the consumer and
[roadmap](../../roadmap.md) owns permission to proceed.

The [live result](../../tasks/builder-first-app.md#real-streaming-result-and-current-blocker)
now records implemented streaming, real model/E2B/browser observation and the
separate verifier refusal that prevented opening the new candidate. Read that
result for current status; the comparison below preserves the earlier design.

## Question and conclusion

How can a nontechnical person watch Conexus build an application through a real
streaming conversation, using the adopted Mastra coding worker and existing
Preview? The missing capability is live observation of that worker, not another
agent, compiler or application runtime. Recommend native Mastra streaming through
a small, safe Builder observation endpoint, rendered as ordered message parts in
the existing React UI. Do not import Studio's runtime or introduce a second
agent merely to obtain a chat hook. This recommendation still needs the bounded
implementation and browser proof below.

The existing screen owner already calls for an application-first workspace with
Conexus conversation on the right. A Build instruction creates a durable Change
behind that conversation. Technical records belong in optional inspectors.
Streaming is a missing implementation seam, not a reason to redesign the whole
platform. See the [frontend owner](../../reference/frontend-and-product-surfaces.md#336-build-surface)
and [selected screen contract](../../evidence/4c/p01-build-workspace-screen-contract.md#1-locked-human-job).

## Flow at investigation start

The browser submits intent to BLD-03. Hub starts coding, verification and bounded
correction independently of the browser request. The database owns the Change,
candidate and execution states. The browser polls JSON projections. Preview
preparation and authorized opening are separate operations.

```text
Build composer -> Hub admission -> Mastra coding worker -> Git candidate
                                     |                       |
                               live events missing       verification
                                     |                       |
                                  chat UI           retained app -> Preview
```

[runtime.ts](../../../apps/hub/src/builder/runtime.ts) then called
`agent.generate()` and keeps only final `response.text`.
[service.ts](../../../apps/hub/src/builder/service.ts) owns the background job.
[routes.ts](../../../apps/hub/src/builder/routes.ts) then exposed no Builder streaming
endpoint. [ProjectBuild](../../../apps/web/src/features/builder/components/project-build.tsx)
polls Change state every 1.5 seconds and preparation every 750 milliseconds while
preparing. Styling that polling as a chat would not provide token streaming.

BLD-16 is read-only contextual Q&A, not the coding command. TI-03 has a safe SSE
precedent, but its subject is a Published-App Product AgentRun, not a Builder
ActorRun. A Builder-specific observation endpoint needs a narrow contract
addition; neither identifier nor permission can be silently reused.
See [BLD-16](../../../contracts/api/product/builder-paths.yaml) and
[TI-03](../../../contracts/api/technical/openapi.yaml).

## Adopted Mastra APIs

Installed packages are `@mastra/core@1.63.2`, `@mastra/e2b@0.11.0` and
`@ai-sdk/anthropic@4.0.48`. `createCodingAgent` returns an ordinary `Agent`.
Its `stream()` accepts the existing step, timeout and abort controls and exposes
text, tool and lifecycle chunks. `MastraModelOutput.getFullOutput()` drains the
output and returns final text, finish reason, error and tripwire information.
The worker must validate completion before admitting a Git result. Merely
receiving text or stream EOF is insufficient.

These facts were checked against installed declarations at
`dist/coding-agent/index.d.ts`, `dist/agent/agent.d.ts`,
`dist/stream/types.d.ts` and `dist/stream/base/output.d.ts`, rather than inferred
from the latest website. Official API references are
[createCodingAgent](https://mastra.ai/reference/coding-agent/create-coding-agent)
and [MastraModelOutput](https://mastra.ai/reference/streaming/agents/mastra-model-output).

Mastra's official UI integration supports React AI SDK UI and a backend outside
the Mastra server. `toAISdkStream` converts an existing output; `handleChatStream`
starts an agent operation through a Mastra instance. Using the latter as an
unrelated chat route would not observe the existing Builder job. Adapter version
defaults to v5; selecting v7 must be explicit and match the client.
[Mastra AI SDK UI](https://mastra.ai/integrations/agentic-ui/ai-sdk-ui),
[toAISdkStream](https://mastra.ai/reference/ai-sdk/to-ai-sdk-stream).

Registry metadata inspected with `npm view` identifies a possible set of
`@mastra/ai-sdk@1.10.2`, `ai@7.0.99`, and `@ai-sdk/react@4.0.102`.
The adapter's core peer range includes 1.63.2; the React hook depends exactly on
ai 7.0.99 and its React peer range includes our 19.2.8. These packages are not
installed or typechecked together here. Peer-range compatibility is not a
successful integrated build or provider proof.

The AI SDK UI protocol uses SSE with message/text boundaries and structured
data parts. A custom backend can speak it. The protocol does not supply retained
history or execution recovery by itself. A custom `ChatTransport` can keep an
existing command-and-observation backend; adopting it does not require Next.js
or Vercel hosting.
[Stream protocol](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol),
[transport](https://ai-sdk.dev/docs/ai-sdk-ui/transport).

## Guide cross-check

Root read the current Streaming and React + Vite guides in full, the Agent
lifecycle guide, Agent Controller guidance and Fastify adapter reference, and
queried Context7 specifically for these integration paths. This added the
following constraints rather than a new planning stage.

The current Streaming guide uses `Agent.stream().fullStream` for mixed events.
Its `untilIdle` option is for agent background tasks and requires memory; our
Hub-owned background Promise alone does not require it. Tool writers can emit
intermediate updates. `transient: true` keeps custom progress out of stored
message history. Writer calls must be awaited. Do not add a workflow or modify
built-in tools merely to expose events already present in `fullStream`.
[Streaming guide](https://mastra.ai/docs/guides/streaming).

The React + Vite guide provides a ready UI route using AI SDK UI and AI Elements,
with separate conversation, message, composer and tool components. Its example
starts a registered agent through a standalone Mastra server. That is useful
for a new chat app but not a drop-in observer of an existing Conexus Change.
Importing the entire component registry or replacing the app scaffold is not
required. The guide also exposes raw tool input/output for demonstration, which
is not our proposed disclosure boundary.
[React + Vite guide](https://mastra.ai/integrations/frameworks/vite-react).

The lifecycle guide distinguishes the whole run from individual model steps.
A run can end at a step limit, abort, tripwire or failure without a final
assistant answer. Thus a final nonempty text promise cannot be the sole success
test. Runtime identity and access must be established by the application before
model execution, not delegated to a message or prompt.
[Agent lifecycle](https://mastra.ai/docs/guides/agent-lifecycle).

`AgentController` is a real reusable option, already exported by installed core,
not something Conexus should reimplement. The guide marks it beta and describes
a runtime host with Sessions, modes, approvals, threads, state and subscriptions.
Its remote subscription can reconnect, but missed events are not replayed;
consumers reconcile state separately. It is not merely a display adapter for an
arbitrary existing `runtime.execute()` call.
[Agent Controller guide](https://mastra.ai/docs/harness/agent-controller).

For this observation-only increment, retain the current worker. If the next
consumer requires persistent interactive sessions, steering, approvals or shared
conversation modes, evaluate AgentController before adding those mechanisms
ourselves. Existing code is not a reason to rule it out; the present consumer
does not yet require taking on its lifecycle. Do not build a home-grown
AgentController under the name of a streaming helper.

The Fastify adapter can mount Mastra into Fastify and has stream redaction
options. Therefore using Mastra routes does **not** inherently require replacing
Fastify. It would still add Mastra's route/resource surface and require mapping
it to current Conexus admission. The reason not to mount it for this increment
is the missing consumer for that surface, not framework incompatibility.
[Fastify adapter](https://mastra.ai/reference/server/fastify-adapter).

Some bundled prose still shows older `toAISdkV5Stream` and `streamUntilIdle`
examples. The current guide and the installed declarations resolve those
differences. Do not copy names from one documentation generation into another
without checking the actual import and version.

## Reference products

### Mastra Studio, actual open-source implementation

Source was pinned to commit
[`253b5012970f0cc6eab01916279d20376f457fe2`](https://github.com/mastra-ai/mastra/tree/253b5012970f0cc6eab01916279d20376f457fe2).
This is a current-main reference, not the adopted Conexus package tree.

Studio imports `useChat` from **`@mastra/react`**, not `@ai-sdk/react`.
Its provider exposes messages, running state, tasks, send and tool approvals in
separate contexts. The documentation's AI SDK integration is a different path.
[Studio chat provider](https://github.com/mastra-ai/mastra/blob/253b5012970f0cc6eab01916279d20376f457fe2/packages/playground/src/lib/ai-ui/chat/chat-provider.tsx#L98-L127).

The hook uses `@mastra/client-js`. It either invokes the agent's stream or
subscribes to a memory thread before sending a message through thread signals.
Subscription cleanup and explicit cancellation are distinct code paths.
Do not infer durable replay merely because a client subscription can be reopened.
[Native chat hook](https://github.com/mastra-ai/mastra/blob/253b5012970f0cc6eab01916279d20376f457fe2/client-sdks/react/src/agent/hooks.ts#L471-L482).

The native client parses SSE JSON frames and a final marker. It does not require
AI SDK UI-message framing on this path.
[Stream parser](https://github.com/mastra-ai/mastra/blob/253b5012970f0cc6eab01916279d20376f457fe2/client-sdks/client-js/src/utils/process-mastra-stream.ts#L19-L55).

An accumulator updates typed message parts. Text has block boundaries; tool
results update the corresponding invocation instead of appending unrelated
status strings. Its handling of reused text IDs after a tool also demonstrates
why a single growing text string is insufficient for a coding transcript.
Conexus should preserve ordered parts and opaque per-activity correlation, but
must not copy the raw argument/result and reasoning disclosure of a developer
console.
[Message accumulator](https://github.com/mastra-ai/mastra/blob/253b5012970f0cc6eab01916279d20376f457fe2/client-sdks/react/src/lib/mastra-db/accumulator.ts#L598-L614).

Rendering dispatches by part type. Studio groups related tool cards, while
keeping them in the conversation order. These are useful presentation patterns
without adopting its memory, approvals, agent configuration or task controls.
[MessageFactory](https://github.com/mastra-ai/mastra/blob/253b5012970f0cc6eab01916279d20376f457fe2/client-sdks/react/src/ui/MessageFactory/MessageFactory.tsx#L95-L142),
[Studio message row](https://github.com/mastra-ai/mastra/blob/253b5012970f0cc6eab01916279d20376f457fe2/packages/playground/src/lib/ai-ui/messages/message-row.tsx#L241-L302).

Initial history comes from `listThreadMessages` through a separate query.
Streaming is not the history store. Conexus has no equivalent admitted Builder
transcript owner, and the current screen contract explicitly excludes one.
Reopening can show persisted Change intent, state and summary without claiming
to restore every transient chat part.
[Studio history query](https://github.com/mastra-ai/mastra/blob/253b5012970f0cc6eab01916279d20376f457fe2/packages/playground/src/hooks/use-agent-messages.ts#L10-L25).

### Palantir

The streaming session API emits Markdown incrementally, then directs consumers
to reload session content for the full exchange. Cancellation and optional trace
retrieval are separate API concerns. This supports separating live presentation
from settled results. It does not establish that structured tool activity travels
on that same stream, nor prove Conexus recovery semantics.
[Streaming continue session](https://www.palantir.com/docs/foundry/api/aip-agents-v2-resources/sessions/streaming-continue-session).

Workshop embeds a chatbot beside application widgets and maps application
variables into the interaction. Chatbot Studio documents deterministic updates
to those variables after streaming. The transferable idea is contextual chat
that operates alongside an application. We do not need to reproduce Palantir's
Ontology or platform to obtain that experience.
[AIP Chatbot widget](https://www.palantir.com/docs/foundry/workshop/widgets-aip-chatbot),
[application state](https://www.palantir.com/docs/foundry/chatbot-studio/application-state).

### Factory

The Droid TypeScript SDK distinguishes complete messages, optional text deltas,
tool calls/results and terminal outcomes. Its sessions also retain conversation
context and a working directory. This supports the user's coding-CLI analogy,
but it is not evidence that a Mastra transcript preserves Conexus source
lineage. No Droid dependency is proposed.
[Droid TypeScript SDK](https://docs.factory.ai/sdk/typescript).

### Reusable UI libraries

Assistant UI can render messages owned by an external store, including TanStack
Query integrations. Streaming updates the same assistant message; callbacks
enable capabilities such as cancellation, editing and regeneration. It is an
alternative to owning every transcript/composer interaction. Supplying such a
callback would still require the corresponding Conexus behavior; a button must
not imply support we do not have.
[ExternalStoreRuntime](https://www.assistant-ui.com/docs/runtimes/custom/external-store).

Root also opened [Mastra UI Dojo](https://ui-dojo.mastra.ai/) in Chromium and
inspected its composer, example navigation and framework choices. This was
visual inspection only, without sending a model request. It is not a streaming
execution proof.

## Compared designs and synthesis

Two Luna candidates and a Luna cross-judge compared whole integration shapes.
Root read both candidates, the judge and critical Studio source. Model-family
diversity was reduced by the operator's Luna-only rule. The scores are design
judgments, not measured runtime results.

| Criterion, 1 to 5 | A, native safe SSE and existing React | B, AI SDK UI and custom ChatTransport |
| --- | ---: | ---: |
| Existing command, background job and Preview fit | 5 | 4 |
| Exact adopted API feasibility | 4 | 2 |
| Ordered parts, tool correlation and errors | 3 | 2 |
| Bounded attachment and disconnect behavior | 5 | 4 |
| End-user and maintainer effort | 4 | 2 |

The scores compare these submitted sketches, not the inherent quality of AI SDK
UI. Root agrees with A as the base for this increment. Both shapes still need the
same authenticated, Change-bound observation seam. B adds a UI protocol adapter
and package integration without removing that seam. A avoids these additions,
but accepts responsibility for a small stream parser and ordered-part reducer.
This is not a proposal to build a general chat framework.

Neither sketch is ready verbatim. A omitted text-block and activity IDs. Graft
explicit message boundaries from B and correlated tool parts from Studio. Both
need explicit feed bounds, a coherent attachment prefix and a slow-reader rule.
Do not graft B's extra client-supplied stream identity or cursor promise.

B also suggested `chat.reconnectToStream()`. Root checked the exact AI SDK
7.0.99 source; the hook exposes `resumeStream()`, whereas `reconnectToStream` is
a transport method. `toAISdkStream` accepts native Mastra output, not the safe
domain feed described in B. A later standards-based UI must either transform
the native output before filtering or explicitly encode the safe feed as UI
parts. It must not claim this adapter already accepts arbitrary domain events.
[AI SDK useChat source](https://github.com/vercel/ai/blob/ai%407.0.99/packages/react/src/use-chat.ts),
[ChatTransport source](https://github.com/vercel/ai/blob/ai%407.0.99/packages/ai/src/ui/chat-transport.ts).

Assistant UI remains a possible rendering adapter if the small native UI starts
accumulating generic transcript/composer machinery. That is a concrete reopen
trigger, not another research prerequisite. Do not install Studio, both UI stacks
or a durable-agent engine in anticipation of it.

## Proposed smallest implementation

### Usage and ownership

The existing composer calls `createChange` once with its existing idempotency
key. It then observes that returned Change. It does not send a second model
request. Leaving the page releases observation only. Reopening reads the Change
and, if still available, attaches to its live feed without resubmission.

```text
createChange(intent, idempotencyKey) -> exact Change
observeChange(projectId, changeId, onEvent) -> unsubscribe
unsubscribe() -> close browser observation, not the coding worker
```

An internal feed is created before background dispatch, so early output is not
lost between command admission and browser attachment. The server binds every
producer to the exact current ActorRun, including a later correction attempt.
The client receives only presentation IDs, never admission tokens or Mastra
identity as authority.

| Owner | Bounded change |
| --- | --- |
| `builder/runtime.ts` | Consume one `agent.stream()`; map native events and validate final output before existing candidate finalization |
| `builder/service.ts` and one `builder/observation.ts` | Own scoped feed, bounded prefix, subscribers and lifecycle notifications |
| `builder/routes.ts` and technical wire | Authenticate a Builder-specific GET observation route; disclose only the exact authorized Change projection |
| `features/builder/stream.ts` and existing Build component | Decode events into ordered parts; display conversation/activity and reconcile existing queries |
| Existing Preview components | Keep loaded-frame identity and authoritative readiness unchanged |

No new database table, message broker, Mastra server, Product Agent, model call,
memory thread, generic SDK or runtime replacement is needed by this shape.

### Event shape

The wire carries an opaque observation generation and increasing sequence. Its
payload is a discriminated union. The sketch names required data, not exported
framework types or already-implemented APIs.

```text
TEXT_START(blockId)
TEXT_DELTA(blockId, text)
TEXT_END(blockId)
ACTIVITY(activityId, allowedLabel, started | succeeded | failed)
PHASE(coding | verifying | correcting | preparing)
OBSERVATION_END
OBSERVATION_UNAVAILABLE(safeCode)
```

Each text start creates a new presentation block, including when a provider
reuses its own text ID after a tool. Tool completion updates that activity's row
by opaque ID. The actor boundary prevents a correction from overwriting the
prior attempt's parts. Raw reasoning, tool arguments/results, shell output,
provider metadata and arbitrary error strings are not event payloads.

Phase and activity labels derive from actual server execution. Do not invent
percentage complete, animate a completed answer as though it were arriving, or
describe tool-input generation as completed execution. If the model emits no
prose while using tools, show real activity instead of manufacturing narration.

The domain feed has no `ready` or `verified` event. A model finish ends its text
parts; only existing owner reads establish candidate verification, build output
and authorized Preview availability. Observation closure is not run completion.
An error can close observation while coding continues; its UI wording must make
that distinction.

### Attachment, limits and recovery

Retain a bounded, process-local prefix before attachment and then follow live
events. Do not return a truncated suffix pretending to be a complete multipart
message. Adjacent deltas for the same block can be coalesced. Provisional limits
are 1 MiB and 4,096 coalesced events per Change, a 256 KiB subscriber queue, and
two minutes of retention after settlement. Cap aggregate observation memory at
16 MiB, evicting finished feeds first. These are starting values for the probe,
not claimed performance measurements.

Overflow makes observation unavailable and triggers owner-state reconciliation;
it must not stall or fail the coding job. Release disconnected subscribers
promptly. A feed may replace its old transcript prefix on a fresh attachment,
never append that prefix twice. Do not promise a durable cursor, lost-token
replay, or restart continuation. A Hub restart uses existing run recovery and
persisted Change facts.

The proposed route is
`GET /protocol/projects/{projectId}/builder-changes/{changeId}/stream`.
It resolves account, Project access and Change containment server-side, including
before disclosing buffered content. Continue checking current authorization
before disclosure batches using the existing access mechanism, not a new lease
or client-asserted permission. Use `no-store`; do not put credentials in URLs.
Absence or unavailability produces an explicit observation result and normal
Change reconciliation, never an implicit re-execution.

### User experience

The app stays dominant. The right panel shows the user's request, actual
incremental text and compact activities. Technical source/diff/evidence remain
available on demand. A new request is disabled while its current Change is
active. Do not show unsupported stop, regenerate, queue, approval or steering
controls merely because a reference library offers them.

When the coding message ends, the UI can show “Verificando o aplicativo” if
verification really started. When compilation starts, show “Preparando a
visualização”. Only the existing verified/retained/authorized result can offer
the usable Preview. The previous app remains interactive during all of this.
Streaming does not by itself automate the existing preparation/open controls.

Source continuation still requires the task's exact second-request parent and
idempotency work. An ephemeral transcript cannot supply that lineage. Plan-mode
BLD-16 and a full persistent conversational assistant remain separate scope.

## Proof before calling the streaming increment done

First exercise native text/tool boundaries, errors and disconnect through the
actual adopted Mastra adapter and a controlled stream. That checks integration
mechanics, not the Product outcome. Do not label the controlled input a model
demonstration.

Then use the real Hub login and Build UI with the admitted provider/E2B path.
Record the first visible text/activity before the model finishes. Verify an
ordered text, tool, text sequence when the model produces one. Do not hard-code
a second response for the browser. Click the generated application in the
iframe and open it in a new tab.

Disconnect observation during work and reopen the same Change. Check the run
count did not increase and the server continued settling. Exercise slow-reader
overflow, failed model/tool, denied access and late events against the displayed
state. Observe that the existing app remains usable and no raw tool payloads
are sent to the browser. These checks do not require another compiler experiment.

Continue to the real second request and generated-app restart proof in the same
first-app task, then run the full current verification graph. If the native UI
requires a generic message engine or the actual Mastra events cannot provide
the required parts, reopen only the UI adapter choice before expanding code.

## Evidence limits

Two Luna researchers traced Conexus and the adopted Mastra API. Root read the
critical implementation, declarations and selected screen owner, consulted
Context7, read official documentation and inspected rendered reference pages.
No streaming Product code, package installation or new live model call was made
for this investigation. Documentation can justify a candidate mechanism; only
the subsequent real Builder/browser run can prove the integrated experience.

The earlier real counter demonstration establishes Create and open, not
streaming, second-request source continuity or generated-app restart recovery.
Those limits remain visible in the task. Full `npm run verify` is still due
after implementation integration.
