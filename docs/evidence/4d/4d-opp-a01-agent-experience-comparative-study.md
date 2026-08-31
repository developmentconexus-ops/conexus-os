# 4D OPP-A01 — Published-App Product Agent Experience Comparative Study

> **Status:** `PASS 1 COMPLETE / LEADING STRUCTURAL HYPOTHESIS / NO PACKAGE SELECTION`
> **Input:** accepted `4C-F29`
> **Research date:** `2026-08-28`
> **Implementation authority:** `BLOCKED`

## 1. Decision question

> What is the smallest reusable Product Agent experience road that serves the
> locked PA-01 full-page, contextual-panel and inline hosts while preserving
> PAR/I&A/Gateway/Release authority and Project-owned composition?

Required coverage:

```text
framework-neutral Product client
+ React/headless bindings
+ optional accessible/themable primitives
+ Conversation history
+ honest reconnect/history recovery
+ typed app-context references
+ safe typed rich parts
+ exact approval interaction
+ application-owned renderers
+ honest lifecycle states
+ fixtures/testing
+ contract/version discipline
```

## 2. Exact Conexus boundary

The canonical Product surface already exists:

```text
IAM-13  current Published-App access context
PAR-01  Conversation list
PAR-02  exact Conversation / typed TEXT | QUESTION history
PAR-03  create exact Conversation
PAR-04  ordinary turn or exact clarification reply → new AgentRun
PAR-06  AgentRun list
PAR-07  exact AgentRun owner truth
PAR-08  actionable ApprovalRequest discovery
PAR-09  exact sealed decision subject
PAR-10  ALLOW_ONCE | DENY with expectedSubjectDigest
TI-03   optional incremental projection of one already-admitted AgentRun
```

Locked laws:

```text
framework thread/run/tool IDs != Product identity
stream connected/disconnected != AgentRun state
stream end != completion
clarification != effect approval
frontend app role != approval eligibility
generic tool confirmation != PAR-10 decision
client persistence != Conversation/AgentRun/ApprovalRequest truth
Project app composition != one universal chat shell
```

Therefore no candidate may replace the generated Conexus Product client or make
its message/thread/tool ontology canonical by convenience.

## 3. Sources and identity

Primary/current sources examined:

- [Mastra Client](https://mastra.ai/docs/server/mastra-client.md)
- [Mastra AI SDK UI integration](https://mastra.ai/integrations/agentic-ui/ai-sdk-ui.md)
- [Mastra assistant-ui integration](https://mastra.ai/integrations/agentic-ui/assistant-ui.md)
- [Mastra CopilotKit integration](https://mastra.ai/integrations/agentic-ui/copilotkit.md)
- [Vercel AI SDK repository/docs](https://github.com/vercel/ai)
- [AI SDK UI persistence](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence)
- [AI SDK UI stream resume](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams)
- [assistant-ui repository/docs](https://github.com/assistant-ui/assistant-ui)
- [assistant-ui External Store Runtime](https://www.assistant-ui.com/docs/runtimes/custom/external-store)
- [CopilotKit repository/docs](https://github.com/CopilotKit/CopilotKit)
- [CopilotKit thread lifecycle](https://docs.copilotkit.ai/threads-lifecycle)
- [CopilotKit self-managed persistence](https://docs.copilotkit.ai/strands/threads-self-managed)
- [CopilotKit Rich Threads](https://docs.copilotkit.ai/a2a/threads)

Context7 resolved and queried the official/high-reputation sources for Vercel AI
SDK `6.0.0`, assistant-ui and CopilotKit. Mastra packages are absent locally, so
the current official Mastra remote docs were used according to the Mastra skill.

Registry observations are volatility Evidence, not pins or bundle-size proof:

| Package | Observed version | License | Unpacked package size | Observation |
| --- | --- | --- | --- | --- |
| `ai` | `7.0.84` | Apache-2.0 | ~6.86 MB | fast-moving core; current registry version is ahead of Context7's stable indexed version |
| `@ai-sdk/react` | `4.0.87` | Apache-2.0 | ~0.31 MB | depends on `ai`, SWR and provider/MCP utilities |
| `@assistant-ui/react` | `0.15.17` | MIT | ~2.17 MB | includes core/store/tap/Radix/Zustand plus optional-cloud-facing dependencies |
| `@copilotkit/react-core` | `1.69.3` | MIT | ~7.18 MB | broad AG-UI/A2UI/rendering/runtime dependency surface |
| `@copilotkit/react-ui` | `1.69.3` | MIT | ~1.98 MB | prebuilt UI over react-core/runtime client |
| `@mastra/client-js` | `1.42.4` | Apache-2.0 | ~5.06 MB | depends on Mastra core and exposes broad server resources |
| `@mastra/ai-sdk` | `1.10.0` | Apache-2.0 | ~7.78 MB | server/stream compatibility layer; unpacked size is not shipped-bundle proof |
| `@mastra/react` | `1.4.9` | Apache-2.0 | ~1.49 MB | builds on `@mastra/client-js` and UI/rendering dependencies |

All packages were modified/published recently at the observation date. This
shows active maintenance and high migration volatility; it does not establish
fitness or safe compatibility.

## 4. Candidate analysis

### A — generated Conexus Product Agent client + bounded React headless layer

Shape:

```text
canonical 4B PAR/IAM/TI wire
→ GENERATED framework-neutral Conexus Agent client
→ PLATFORM-CONTRACT React/headless adapter
→ optional UI primitives
→ APP-OWNED host composition/renderers
```

Strengths:

- exact Conexus operations, Problems, identity and authorization remain canonical;
- history refresh naturally re-reads PAR owner truth;
- TI-03 remains an optional projection rather than runtime authority;
- approval uses PAR-08..10 rather than generic tool approval;
- host layout and rich-part rendering remain Project-owned;
- framework replacement boundary is explicit.

Cost/risk:

- Conexus owns a small adapter/state reducer and must prove its lifecycle;
- accessible primitives and rich rendering should be reused where they fit
  rather than rebuilt wholesale.

**Pass-1 disposition:** `PROMOTE_TO_4D_PROPERTY / LEADING STRUCTURAL HYPOTHESIS`.

This is not a package decision. It is the authority-preserving composition root
against which external accelerators are evaluated.

### B — Vercel AI SDK UI over a Conexus transport adapter

Useful properties:

- framework-agnostic UI protocol with React/Svelte/Vue/Angular integrations;
- transport-oriented `useChat` architecture;
- typed message/data/tool parts and schema validation hooks;
- custom renderers and explicit approval-requested UI state;
- application-supplied persistence and resume endpoints.

Material gaps/risks:

- `useChat` owns a client chat state projection that must never become PAR truth;
- official persistence guidance recommends storing `UIMessage`; Conexus must
  instead treat any UIMessage form as a derived projection of PAR owner records;
- message IDs may be client-created unless deliberately overridden;
- generic tool approval is not equivalent to PAR-10 sealed-subject approval;
- current official resume design requires extra active-stream persistence and
  Redis/resumable-stream machinery;
- current docs state resume and abort/stop are incompatible in the documented
  configuration, which conflicts with a seamless assumption of both controls;
- Mastra compatibility versions move independently from AI SDK versions.

**Pass-1 disposition:** `KEEP_AS_IMPLEMENTATION_ALTERNATIVE` for stream/message
projection mechanics behind a strict Conexus adapter; reject it as canonical
Conversation/approval authority.

### C — assistant-ui External Store Runtime over the generated Conexus client

Useful properties:

- external-store adapter explicitly supports app/backend-owned messages and
  custom conversion;
- provides `onNew`, `onResume`, `onCancel`, `onRefetchThread`, tool-result and
  thread-list integration seams;
- headless/composable primitives allow full-page, panel and inline hosts;
- strong current accessibility patterns: live regions, labels, busy states,
  reduced-motion handling and grouped typed parts;
- application-owned renderers and theming are natural;
- backend-specific runtime adapter can map exact PAR truth without adopting a
  Mastra Agent ontology.

Material gaps/risks:

- External Store Runtime and some thread APIs are marked experimental/unstable;
- the adapter surface is broad and could accidentally permit edit/delete/reload
  operations that Conexus does not admit;
- external message repository/branch semantics must not create Product meaning;
- dependency graph includes assistant cloud/store/tap and UI state machinery;
- version/migration stability must be tested against the exact admitted subset;
- AssistantCloud persistence must not be used as a second Conversation owner.

**Pass-1 disposition:** `KEEP_AS_IMPLEMENTATION_ALTERNATIVE / LEADING OPTIONAL
PRIMITIVES CANDIDATE`, restricted to a narrow adapter and capability allowlist.

### D — CopilotKit / AG-UI composition

Useful properties:

- broad React/headless API and controlled tool renderers;
- typed component catalogs and strong generative-UI exploration surface;
- AG-UI event protocol, AgentRunner/connect concepts and replay models provide
  valuable reconnect/reference architecture;
- current HITL, thread replay, concurrency locking and custom renderer patterns
  are rich reference inputs.

Material conflicts:

- `useHumanInTheLoop` is implemented as a frontend tool that pauses/resumes an
  agent, while Conexus approvals are PAR-owned exact sealed decisions and effect
  admission remains Gateway-owned;
- frontend tools and shared agent/application state can grant browser mechanics
  a role Conexus explicitly rejects;
- Rich Threads introduces a separate server-side event-history/thread lifecycle
  with rename/archive/delete and live-run continuity;
- the hosted Intelligence Platform or its self-hosted deployment becomes a
  substantial persistence/operational dependency;
- self-managed mode does not replay full AG-UI/generative UI history or resume
  live runs without additional machinery;
- open-ended MCP Apps/model-composed UI is outside current F29 safety boundary;
- broad dependency and ontology surface creates high lock-in/authority-adapter cost.

**Pass-1 disposition:** `KEEP_REFERENCE_ONLY` for AG-UI event/reconnect,
controlled rendering and concurrency ideas. Do not adopt CopilotKit Threads,
shared state, frontend tools, HITL authority or open-ended UI into the current
Product road. A future bounded AG-UI adapter remains reconsiderable only if it
proves smaller than the leading structure.

### E — Mastra Client / `@mastra/react` direct browser integration

Useful properties:

- current typed client exposes agent streaming, memory/history, tools,
  workflows, logs and telemetry;
- session-cookie support and request cancellation exist;
- direct UI packages and integrations are actively maintained.

Material conflicts:

- client APIs expose Mastra Agent/tool/workflow/memory identities rather than
  the exact Conexus PAR Product surface;
- browser `clientTools` can execute DOM/local-storage/Web APIs, conflicting with
  governed Conexus capability/Gateway boundaries if treated as Product tools;
- a browser-configured base URL/resource ID and broad resource client widen the
  allowed surface unnecessarily;
- Mastra thread/memory state cannot become Conversation or AgentRun truth.

**Pass-1 disposition:** `REJECT` direct Mastra Client/React Product authority;
`KEEP_REFERENCE_ONLY` for client mechanics.

### F — `@mastra/ai-sdk` behind PAR

Useful properties:

- provides framework-agnostic handlers and AI SDK stream conversion;
- separates Mastra runtime integration from React rendering;
- can be mounted behind Conexus-owned routes/adapters rather than exposed
  directly.

Material gaps/risks:

- built-in routes select Mastra agent/workflow/network resources and therefore
  cannot replace the exact PAR admission/owner flow;
- compatibility is explicitly versioned across AI SDK protocol generations;
- broad chat/workflow/network adapters exceed current PA-01 need;
- output parts still require safe translation to Release/PAR-owned schemas.

**Pass-1 disposition:** `KEEP_AS_IMPLEMENTATION_ALTERNATIVE` only as a bounded
server-side stream translation mechanism after exact source/version
requalification. It never owns the browser Product client or PAR operations.

## 5. Comparative matrix

| Candidate | Authority separation | Host composition | History/reconnect | Typed/rich UI | Exact PAR approval | Accessibility/theming | Lock-in/operational burden | Pass-1 result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Generated Conexus client + headless layer | strongest | strongest | PAR reads + TI-03 projection | exact Release-owned schema | native PAR-08..10 | application/selected primitives | custom bounded seam | leading hypothesis |
| AI SDK UI adapter | viable with strict adapter | strong/custom | app-owned persistence; resume machinery; abort conflict | strong typed parts | custom mapping required | app-owned | medium protocol/version coupling | keep alternative |
| assistant-ui External Store | strong if capability allowlisted | very strong | external owner + resume/refetch seams | strong primitives/tool renderers | custom mapping required | strongest observed primitives | medium API/dependency volatility | leading optional-primitives alternative |
| CopilotKit/AG-UI | weak without major reduction | broad | strongest packaged replay, but separate platform/store | very rich including generative UI | generic frontend-tool HITL conflicts | strong/prebuilt + headless | high ontology/platform coupling | reference only |
| Mastra Client/React direct | weak | moderate | Mastra thread/memory-centric | runtime-centric | framework approval-centric | package-provided | high authority coupling | reject direct Product use |
| `@mastra/ai-sdk` behind PAR | viable server-side only | renderer-neutral | no Conexus history owner | strong stream conversion | custom PAR route required | N/A | medium version coupling | keep alternative |

## 6. Leading Global Maximum

Pass 1 supports this bounded structure:

```text
canonical PAR/IAM Product wire + TI-03 projection
→ generated framework-neutral ConexusAgentExperienceClient
→ React headless adapter over external/server-owned truth
→ optional accessible primitives selected from a qualified UI layer
→ Project-owned full-page / panel / inline composition and renderers
```

Likely reuse split, still unselected:

```text
Product transport/identity/approval/lifecycle = Conexus generated client
stream translation                          = custom minimum or bounded AI SDK adapter
React state projection                      = narrow Conexus adapter
accessible optional primitives              = assistant-ui candidate or smaller equivalent
rich business renderers                     = APP-OWNED typed catalog
```

The structure intentionally does not adopt a universal chat shell, frontend
tool execution, generic agent state, framework thread owner or managed
conversation cloud.

## 7. Required follow-up before any selection

1. Map every candidate adapter action to exact IAM-13/PAR-01..10/TI-03 wire and
   prove there is no extra Product command.
2. Define the framework-neutral client boundary independently of React and any
   message-library type.
3. Define typed rich parts from exact Release interaction schemas, including
   safe unknown/unsupported rendering.
4. Separate history hydration, live projection reconnect and runtime execution
   resume; do not call all three “resume”.
5. Preserve stop/cancel semantics without assuming stream abort proves AgentRun
   cancellation or settlement.
6. Prototype the approval adapter contract on paper/types: generic tool
   callbacks cannot decide PAR approval without exact `approvalRequestId`,
   `expectedSubjectDigest` and current revalidation.
7. Determine whether assistant-ui's exact required subset can be isolated from
   experimental thread/branch/cloud behavior and versioned behind one adapter.
8. Compare a minimal custom React adapter against AI SDK + assistant-ui total
   dependency/migration cost.
9. Define negative fixtures for raw runtime ID leakage, client-owned owner truth,
   generic frontend effect execution, forced shell and unsafe rich UI.
10. Revalidate exact packages/source/security/licenses only at selection time.

## 8. Pass-1 outcome

```text
OPP-A01 PASS 1 = COMPLETE
4C-F29 property = CONFIRMED / FE-09
leading structural hypothesis = generated Conexus client + bounded React headless layer
leading optional primitives candidate = assistant-ui External Store subset
AI SDK / @mastra/ai-sdk = bounded stream alternatives
CopilotKit = REFERENCE_ONLY
direct Mastra Client/React Product use = REJECT
exact package/version selection = 0
Product implementation authority = 0
```

This is comparative Evidence, not ratification. A later 4D-C decision may select
only mechanisms that survive the exact contract mapping and negative controls.
