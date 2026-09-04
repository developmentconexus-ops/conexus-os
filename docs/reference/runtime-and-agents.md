# Runtime and Product Agents

Current technical detail extracted without semantic rewriting from the accepted Phase-3 architecture baseline. `docs/architecture/index.md` owns the overview; this file owns the detailed task surface named by its title.

## 24. Production Agent Runtime architecture

## 24.1 Current line

```text
exact active Conexus Release
→ derived RuntimeAgentProjection
→ ParMastra / mastra_par
→ direct Mastra Agent
→ Product AgentRun
```

Runtime projection is derived/rebuildable/cacheable, non-authoritative.

No `RuntimeAgentRevision` business class.

## 24.2 Admission before execution

```text
resolve current admissible surface
→ admit Product AgentRun owner fact
→ pin exact Release/agent/tool/model/runtime facts
→ commit
→ only then model/tool execution
```

## 24.3 Closed override channels

Production never resolves authoritative Agent behavior from:

```text
Mastra Stored Agent latest
Editor mutable config
request-body revision override
runtime “current version”
```

A suspended old run reconstructs from exact old pins.

## 24.4 Conversation/memory

```text
ConversationId = Conexus identity
Mastra threadId = substrate mechanism
```

Baseline:

```text
Conversation/message history = ON when Conversation exists
Working/Agent Memory          = consumer/eval-gated
Semantic Recall               = OFF until admitted/evaluated
Observational Memory          = OFF until admitted/evaluated
Memory Extractors             = OFF until admitted/evaluated
```

Scheduled Agent runs are threadless by default.

`4C-F37` adds no new runtime owner. PAR persists typed `TEXT | QUESTION` Conversation messages, owner chronology and current clarification attention. A clarification-producing run settles; answering the exact still-open question through the existing turn admission starts a new AgentRun. Native runtime suspension remains reserved for accepted durable waits such as exact effect approval rather than ordinary conversation questions.

Memory resource scope includes Workspace + Project + Agent + memory class/purpose + subject where applicable.

## 24.5 Suspension/resume

For durable waits:

```text
PAR owner persists exact proposal/ApprovalRequest first
→ owner commit
→ native Mastra requireApproval provides mechanical suspension/checkpoint in mastra_par
→ process may disappear
→ resume rebuilds exact old projection
→ current authorization/owner facts rechecked
→ raw RequestContext remains non-authoritative runtime substrate
→ governed tool/effect boundary rechecks current owner truth
→ resume exact same AgentRun
```

Owner wait without runtime snapshot is a recoverable failure case. Runtime snapshot without owner authority is structurally unacceptable.

## 24.6 Exact proposal identity

Resume re-presents exact:

```text
proposalRef + args
```

Mismatch to the sealed subject fails closed. Mastra `toolCallId` is correlation only.

## 24.7 Product-Agent `SCHEDULE`

Product-Agent recurrence is PAR-owned and distinct from MAR managed-sync catch-up:

```text
schedule wake
→ guarded PAR schedule-fire ingress
→ validate current trigger/revision/schedule
→ stable intended-slot identity before AgentRun admission
→ consume cursor scoped by (TriggerId, TriggerRevision)
→ enforce single-flight
→ resolve/pin exact current Release
→ admit AgentRun
```

```text
valid occurrence + active trigger-origin AgentRun
→ consume occurrence as SKIPPED
→ no AgentRun
→ no hidden backlog/catch-up
```

Schedule fire never executes the Product Agent directly. Exact transport remains Package-B proof.

## 24.8 Failure and recovery

Normal restart distinguishes a durable admitted wait from an ordinary actively executing AgentRun.

For the existing approval/suspension path, the same AgentRun may resume only when the exact owner `ApprovalRequest`, old Release/AgentRun pins and current owner checks remain admissible. Native Mastra suspension/resume remains mechanical continuation only.

For an ordinary active AgentRun that loses its process:

```text
no PAR terminal owner fact
-X-> infer completion from Mastra thread/snapshot/trace/message
-X-> silently re-drive the same execution through a new runtime
```

A later attempt requires owner admission. Current F1 does not enable DurableAgent active-run crash recovery/reconnect by inheritance; enabling it remains an explicit requalification trigger.

Cancel/timeout first prevents new PAR progression and propagates cooperative abort where available. Abort, timeout and process loss do not prove that an already-crossed Gateway effect did not happen. Late runtime completion remains subordinate to current guarded/write-once owner transitions.

After disaster restore, restored pending `ApprovalRequest`/Mastra suspension state is historical as-of-cutoff and is not directly actionable merely because it was pending in the recovered generation. Effect-capable continuation is re-established through current owner authority; the restored runtime state never authorizes itself and cannot bypass the initial Gateway/operations external-effect deny posture.

---

## 25. Builder ↔ Production Agent Runtime isolation

## 25.1 Role-specific Mastra

```text
Builder role
├── BuilderMastra
├── mastra_builder
├── Builder-local PubSub/runtime namespace
└── Builder-only AgentController/tools/Workspaces

PAR role
├── ParMastra
├── mastra_par
├── PAR-local PubSub/runtime namespace
└── PAR-only Agents/tools/schedules/memory
```

Forbidden sharing:

```text
same mutable Mastra store
same same-process PubSub instance
same external PubSub namespace/keyPrefix
same Agent object instance
same mutable Memory instance
Builder Workspace/toolset in PAR
standalone/ephemeral fallback for governed runs
```

## 25.2 Same-process baseline is conditional

Builder and PAR may coexist in one Hub application process only if Package B proves the enabled F1 mutable surfaces can be partitioned/fenced.

Material unpartitionable cross-role framework global state fires the process-split trigger; semantic owners do not change.

## 25.3 RequestContext

Mastra RequestContext is runtime/configuration/correlation substrate, not Product/business authority.

Every dispatch/rebind/resume supplies the complete current request/runtime configuration required by early Agent shaping:

```text
current/pinned owner facts
→ build NEW role-specific RequestContext
→ Mastra continuation mechanics may retain subordinate runtime keys
→ governed owner/tool/Gateway decision rechecks current Conexus owner truth
→ fail closed on stale/revoked/mismatched authority before effect admission
```

Raw or restored `RequestContext`, Mastra approval state, `toolCallId` and model output never become permission, role, binding, approval or effect authority. Physical survival of an unknown stale key is not itself a failure; its use as current authority is prohibited.

## 25.4 Frozen 3L qualification snapshot

The block below preserves the accepted 3L runtime qualification result. It is not current program-status authority; current stage and implementation authorization live only in [../roadmap.md](../roadmap.md).

```text
architecture = CURRENT
3L-R1 framework-native rebaseline = APPROVED / CURRENT
Package B B0 = EXECUTION COMPLETE / LEAD-ADJUDICATED / PASS
Package B proof-routing amendment = APPROVED / CURRENT
Package B BT-1 = PASS
Package B BT-2 = PASS
Package B BT-3 observed Mastra merge behavior = FRAMEWORK BEHAVIOR CHARACTERIZED
Package B BT-3A = COMPLETE / NATIVE SCHEMA HYPOTHESIS REJECTED
Package B BT-3N = PASS / LEAD-ADJUDICATED / PASS_NATIVE_HITL_OWNER_BOUNDARY
Package B BT-4N = PASS / LEAD-ADJUDICATED / PASS_NATIVE_SCHEDULE_INGRESS
Package B BT-5N = PASS / LEAD-ADJUDICATED / QUALIFIED_SAME_PROCESS
Package B B1-01..B4-18 = PRESERVED DOWNSTREAM PROOF INVENTORY / NOT LITERAL PRE-C-018 EXECUTION
CX-AGENT-MASTRA-01 = QUALIFIED FOR CURRENT F1 TESTED PROPERTIES
CX-RUNTIME-ISOLATION-01 = QUALIFIED_SAME_PROCESS FOR ENABLED F1 SURFACES
Package B = CLOSED / LEAD-ADJUDICATED / QUALIFIED FOR CURRENT F1 TESTED PROPERTIES
Package C = DEFER SAFELY / NOT EXECUTED
Package D = CLOSED / LEAD-ADJUDICATED / QUALIFIED_TRANSACTIONAL_MANAGED_OCCURRENCE_ADMISSION
Package E = DEFER SAFELY / NO PRE-C-018 RUNTIME PROBE
CX-MANAGED-JOB-01 = QUALIFIED FOR CURRENT F1 TESTED TRANSACTIONAL-ADMISSION SUBSET = DOWNSTREAM REMAINDER PRESERVED
3L = CLOSED / 3L-R3 FINAL CLOSURE
```

Same-process qualification is accepted only for the currently enabled F1 Mastra surfaces. Disabled scorer/evaluation, DurableAgent and Observational Memory globals remain deferred and require requalification before enablement.

---

## 26. Product Agent authoring architecture

Agent authoring is a specialized Builder experience over Project authority:

```text
structured/manual edit
OR
natural-language Conexus edit
→ same Change
→ same candidate agent/v1
→ same Plan/diff/work graph
→ same proof/checkpoint
→ immutable ArtifactRevision
→ same Release
```

No `AgentBuilderModule`, second Agent DB or Mastra Editor authority.

ToolProjection compiles exact admitted owner resources such as:

```text
Project Query
Project Action
Integration Operation
explicit platform-native tool with real consumer
```

AnalyticQuery remains an admitted Brain read regime, but it is **not** an automatic Product-Agent ToolProjection source. A named current consumer plus exact Release/tool authority must explicitly admit that use.

No `execute(anySlug, anyInput)` capability primitive is exposed to the model.

Missing dependency can be proposed by Builder, but must become explicit Change scope and pass applicable effect/access/Release gates.

---

## 29. F5 owner-control handoff

Runtime has two semantically different outbound paths:

```text
A. owner-control F5 proposal
B. Operational Telemetry observation
```

Never reconstruct owner control truth from telemetry.

## 29.1 In-process

```text
runtime
→ narrow typed callback/function bound to owner dispatch context
→ owner validates current facts
→ owner writes owner transition
```

Producer-supplied run ID = cross-check only. Effective target identity comes from the owner dispatch closure/opaque handle.

```text
owner dispatch target identity != producer payload identity
→ refuse proposal
→ diagnostic/Finding as applicable
-X-> terminalize or mutate another run
```

## 29.2 Duplicate/lost response

Owner terminal/output transitions are current-guarded/write-once where required; duplicate callback cannot manufacture a second conflicting terminal fact.

Transport acknowledgement != domain application.

## 29.3 Future process split

If runtime later moves out of process, narrow authenticated RPC may preserve the same owner semantics.

No generic RuntimeBus/EventBus/UniversalRuntimeEnvelope for optionality.

---

## 45. Recovery architecture after 3M

3M confirms that existing owners are sufficient; no generic recovery owner, universal retry lifecycle or active-run DurableAgent requirement is added.

Runtime-level recovery must preserve:

1. owner truth survives runtime/process restart where recoverability is required;
2. runtime snapshot without owner authority never authorizes continuation;
3. protected re-entry rechecks current/exact-pinned owner facts;
4. model spend survives restart/resume through owner facts;
5. external-effect ambiguity and replay remain Gateway-owned;
6. Mastra thread/trace/suspension state is mechanics, not domain-run or current-authorization truth;
7. same-execution continuation requires the positive owner-specific basis described above;
8. cancel/timeout/process loss initiate owner settlement and do not imply rollback;
9. disaster-restored runtime/approval state is historical as-of-cutoff until current owner authority is re-established;
10. enabling DurableAgent, active-run same-stream recovery, changed cancellation/orphan semantics or changed Builder/PAR topology reopens the existing 3L qualification boundary.

No additional pre-C-018 runtime probe is required by 3M; the remaining falsifiers belong to 3N, first-build and first-production integrated paths.

---
