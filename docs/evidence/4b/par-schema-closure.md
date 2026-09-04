# 4B Evidence — Product Agent Runtime schema closure

> **Status:** CLOSED OWNER-SLICE EVIDENCE  
> **Phase:** 4B — Executable Wire Contract  
> **Owner slice:** Product Agent Runtime (`PAR-01 → PAR-16`)  
> **Implementation:** BLOCKED

## 1. Result

The canonical Product OAD now closes all 16 caller-visible PAR operations without turning Mastra/runtime mechanics into Product authority.

```text
PAR operations                         = 16 / 16 SCHEMA_CLOSED
fixed Product OAS                      = 111 ↔ 111
schema-closed total                    = 101 / 111
missing / extra / duplicate            = 0 / 0 / 0
literal IF_MATCH                       = { PRJ-12, PAR-14 }
Budget Analyzer generated proof        = green
```

Canonical fragment:

```text
contracts/api/product/par-paths.yaml
```

Executable guard:

```text
scripts/check-wire-par.mjs
npm run wire:par
```

## 2. Product/runtime boundary

Current wire preserves:

```text
Conexus ConversationId
Conexus AgentRunId
Conexus ApprovalRequestId
Conexus AgentTrigger / TriggerRevision
exact Release + Agent authority

!=

Mastra threadId
Mastra runId
Mastra toolCallId
RequestContext
runtime snapshot
provider/model IDs
raw stream/reasoning chunks
```

Mastra native Agent/stream/HITL/schedule mechanics remain preferred realization inputs behind this boundary, but no runtime identifier or framework lifecycle becomes Product authority.

Live streaming/reconnect is deliberately not a seventeenth PAR Product operation. `PAR-04`/`PAR-05` admit exact owner `AgentRun` facts with `202`; a later technical stream projection may attach to that Product identity without inflating `N_platform` or making stream termination owner terminal truth.

```text
stream disconnected/finished
-X-> AgentRun COMPLETED

AgentRun COMPLETED
-X-> every external effect succeeded
```

## 3. Conversation / interactive use

`PAR-01..04` remain Published-App interactions under exact current app access, active Release and Agent authority.

`Conversation` is a Conexus identity with user-visible message history. Provider thread/session identity is not exposed.

`PAR-03 CreateConversation`:

```text
POST /api/apps/{projectId}/agents/{agentId}/conversations
Idempotency-Key: required
body: none
→ 201 Conversation
```

The caller cannot configure model, provider, Release, Agent revision, memory, instructions or runtime state.

`PAR-04 SendProductAgentTurn`:

```text
POST /api/apps/{projectId}/agents/{agentId}/conversations/{conversationId}/turns
Idempotency-Key: required

{
  text,
  contextRefs?[] = { kind, ref }
}

→ 202 InteractiveAgentRunAdmission
```

`contextRefs` are typed untrusted references validated against current app/Release/Agent authority; they do not grant access by possession. Caller-supplied full conversation history and framework execution overrides are rejected.

## 4. Headless and AgentRun truth

`PAR-05 RunProductAgentHeadless` is the same Product Agent concept under the distinct HEADLESS ingress and `agent.headless.invoke` authority.

Its input is tagged:

```text
x-conexus-schema-source = RELEASE_AGENT_INTERACTION
```

so the exact Release-pinned Agent interaction contract owns detailed input meaning rather than 4B creating a parallel universal Agent-input DTO.

Both interactive and headless intake return an exact Release-pinned `AgentRun` admission rather than waiting for final model output.

`PAR-07 GetAgentRun` exposes owner truth with:

```text
agentRunId
projectId
agentId
releaseId
origin = INTERACTIVE | HEADLESS | SCHEDULE
runState = owner-issued string
admittedAt = owner-issued RFC3339 time
optional settledAt = owner-issued terminal settlement time
optional problem = safe human summary/detail/remediation
optional exact Release-owned output projection
```

`PAR-06` orders owner results by `admittedAt DESC`, then stable `agentRunId DESC` before pagination. The identifier is only a tie-breaker, never a time encoding. 4B intentionally does not invent a complete AgentRun lifecycle enum, retry/resume action or raw provider/tool diagnostic from UI convenience or framework states.

## 5. Approval / HITL boundary

`PAR-08` is the current eligible approver queue. `audit.read` alone does not list it.

`PAR-09` may disclose an exact ApprovalRequest to:

```text
current eligible approver
OR
separately authorized read-only investigator
```

The investigator route does not grant queue listing or decision authority.

ApprovalRequest binds:

```text
approvalRequestId
agentRunId
immutable request-time Agent snapshot = agentId + name + purpose + releaseId
safe deterministic actionSummary
requestedAt + optional expiresAt
proposalRef
proposalDigest
owner approvalState
safe exact sealed proposal projection
```

The snapshot/action/time fields let the eligible human recognize the exact decision without a Project/source-read join. They are historical presentation Evidence, not current Agent/Release/authorization truth. `proposalRef` is owner identity/correlation, not Mastra `toolCallId` Product authority.

`PAR-10 DecideApprovalRequest` closes exactly:

```text
carrier = EXPLICIT_SEALED_SUBJECT
effect fence = OWNER_GATEWAY_IC4
If-Match = forbidden

{
  decision: ALLOW_ONCE | DENY,
  expectedSubjectDigest
}
```

The caller cannot replace/re-submit tool, args, Connection, target or effect payload. `EXPIRED`/`STALE` remain owner outcomes. Native Mastra resume/decline is subordinate mechanical continuation; Gateway still revalidates effect authority before escape.

## 6. Trigger / schedule boundary

F1 Product trigger kind remains exactly:

```text
SCHEDULE
```

No EVENT/webhook/workflow/scheduler Product domain is added.

The Product schedule representation is intentionally minimal:

```text
cron     = bounded five-field cron string
timeZone = IANA time-zone identifier
```

Mastra/provider options such as prompt, threadId, resourceId, providerOptions, model and arbitrary metadata are not Product trigger fields.

`PAR-13 CreateScheduleTrigger`:

```text
Idempotency-Key: required
body = { schedule }
→ 201 AgentTrigger
```

Creation does not caller-set enabled/status; enablement is a separate authority-bearing command.

`PAR-14 ReviseScheduleTrigger`:

```text
PATCH same Trigger resource
If-Match: required
body = { schedule }
```

This remains the only PAR literal `If-Match` because the ETag describes the same mutated HTTP representation.

`PAR-15 EnableAgentTrigger`:

```text
carrier = EXPLICIT_TRIGGER_REVISION
body = { expectedTriggerRevisionId }
If-Match = forbidden
```

`PAR-16 DisableAgentTrigger` remains `OWNER_CURRENT` narrowing with no widening/configuration body and remains allowed for an archived Project.

Scheduler wake/timer/storage mechanics cannot directly admit Product Agent execution; current TriggerRevision/schedule/Project/Release/single-flight authority must cross PAR before a scheduled AgentRun exists.

## 7. Explicitly rejected authority

The executable checker rejects or prevents Product-wire admission of:

```text
StreamAgent / ResumeAgent / ObserveAgent Product operations
Mastra runId / toolCallId / threadId
RequestContext / runtime snapshots
raw reasoning/provider chunks
caller model/provider/tool/toolChoice/activeTools override
caller Release/AgentRevision override
caller-selected Connection/target URL
full caller-supplied conversation history as authority
generic ExecuteAgent
approval subject replacement
app role as approval eligibility
investigator approval queue/decision authority
EVENT/webhook trigger
scheduler prompt/thread/provider/model configuration
false If-Match on PAR-10 or PAR-15
loss of If-Match on PAR-14
AgentRun completion collapsed into effect success
```

## 8. TDD proof

Expected RED:

```text
Verify #303
HEAD = 16e18350c5e61d1741ec9e49d6f5a88533d5e27a
FAILURE
Error: PAR-01 is not SCHEMA_CLOSED
```

Before that exact failure, repository/current-state checks, 40/40 repository tests, 111↔111 bijection, carrier proof, and all previously closed owner gates were green.

GREEN:

```text
Verify #305
HEAD = e5e598afacc17156b8f0b06698626dbd5dffd54d
SUCCESS
```

The GREEN run proved:

```text
fixed Product operations = 111
schema-closed            = 101
missing/extra/duplicate  = 0/0/0
IF_MATCH                 = { PRJ-12, PAR-14 }
PAR                      = 16 / 16 PASS
Budget Analyzer          = PASS including negative controls
```

Existing lint warnings remain only in still-provisional later owner slices and pre-existing schema-style warnings. They are not closed by starting future owners prematurely.

## 9. Closure

PAR is schema-closed for 4B. This does not select DurableAgent, AI SDK, React transport, runtime persistence, scheduler implementation or exact Mastra package versions; those remain 4D realization decisions informed by the bounded technology-leverage Evidence.

The next fixed owner slice is Gateway inspection only:

```text
GW-01 ListEffectAttempts
GW-02 GetEffectAttempt
```

Do not begin 4C/4D, Product implementation, or unrelated later owner slices through this closure.
