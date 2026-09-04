# 4D OPP-C02 — Agent Memory, Reconnect and Learning Study

> **Status:** `PASS 2 REVISED / OPERATOR APPROVED / BUILDER FALSIFIER ROUTED`
> **Inputs:** C-010, C-011, C-013, PAR/Brain owners, FE-09, PA-01, OPP-A01 and OPP-C01, current Mastra mapping/qualification
> **Research date:** `2026-08-28`
> **Runtime/platform execution:** `NOT PERFORMED`
> **Implementation authority:** `BLOCKED`

## 1. Decision question

Which memory, reconnect and learning capabilities materially improve Product
Agent continuity and quality while keeping Conversation, Brain, owner facts,
authorization and accepted revisions sovereign?

## 2. Continuity layers

```text
PAR Conversation/messages       = owner chronology and human-visible truth
live event stream/cache         = reconnect delivery projection
recent-message context          = bounded runtime input projection
working memory                  = derived task/user context candidate
semantic recall index           = derived retrieval projection over messages
observational summaries         = lossy model-generated context projection
Brain                           = separately governed organizational knowledge
trace/eval themes               = Evidence for improvement inquiry
accepted Agent/Brain Change     = only through existing owner decision paths
```

No layer may silently promote itself into another.

## 3. Current consumer boundary

- PAR Conversation history and typed `TEXT | QUESTION` chronology are already
  accepted for the first real Product Agent.
- `FE-09` requires durable history and reconnect in the reusable Product Agent
  experience road.
- Working Memory, Semantic Recall, Observational Memory and Memory Extractors
  remain off until a named consumer/evaluation proves benefit.
- Brain is explicitly not Conversation memory, AgentRun history, personal
  memory, vector index or scratchpad.
- The first operational Budget Analyzer proof now has a named BuilderMastra
  consumer, but still has no Product Agent or advanced-memory consumer.
- Builder persistent CodingSession/thread, tasks/goals and versioned artifact/
  context continuity are baseline mechanics, not “advanced memory”.

## 4. Reconnect architecture

### History reconnect

```text
authorized ConversationId
→ PAR reads owner-sequenced messages and current run/attention state
→ opaque pagination/cursor
→ client renders owner truth
```

The client never resubmits the full history as authority. Current Mastra
documentation warns that doing so duplicates stored history and can introduce
ordering bugs from client timestamps.

### Live reconnect

```text
owner-sequenced Conversation/AgentRun events
→ runtime PubSub/event cache projection with opaque delivery cursor
→ reconnect supplies events after cursor when available
→ gap/expired cursor triggers owner-state + message refetch
→ cache cannot create message, run outcome or approval truth
```

The live stream may include deltas not yet committed as owner messages only when
clearly transient. After reconnect, committed owner chronology wins. Completion,
failure, clarification and approval states are resolved from PAR, not inferred
from stream end or cache presence.

Mastra DurableAgent `observe(runId)` is a useful candidate for runtime delivery,
but C01's beta, persistent-cache, repeated-call and multi-instance recovery
falsifiers remain. Framework-neutral owner/cursor semantics must survive its
replacement.

**Disposition:** `PROMOTE RECONNECT PROPERTY / RUNTIME MECHANISM DEFERRED`.

## 5. Mastra memory mechanisms

### Message History

Mastra stores messages under explicit thread and resource identifiers, retrieves
history for context/UI, supports pagination/querying and deletion. Current docs
state that its memory system does not enforce access control; Conexus must check
authorization before every list/recall/delete path.

Mapping remains:

```text
Conexus ConversationId → Mastra threadId
Conexus exact scoped subject/resource → Mastra resourceId
PAR owner message → runtime memory rendering
```

Mastra-created thread/message identity cannot replace PAR identity or chronology.

**Disposition:** `PRESERVE ACCEPTED SUBSTRATE / OWNER-AUTHORIZATION ADAPTER REQUIRED`.

### Working Memory

Mastra Working Memory is an LLM-updated Markdown block at resource or thread
scope. It is useful for preferences, current goals and recurring task context.

Risks:

- model extraction can be wrong, stale or prompt-injected;
- resource scope may cross threads more broadly than intended;
- user-profile facts become real Product personal data needing visibility,
  correction, deletion, retention and purpose authority;
- free-form Markdown has weak provenance/conflict semantics;
- it can accidentally duplicate Brain, Project Baseline or owner records.

**Disposition:** `HIGH-VALUE CANDIDATE / DEFER UNTIL INSPECT-CORRECT-FORGET PRODUCT LOOP`.

### Semantic Recall

Mastra Semantic Recall embeds messages and retrieves similar prior messages with
context windows. It is disabled by default and adds an embedder plus vector
store.

The index is derived, rebuildable and scope-filtered. Retrieved similarity does
not prove truth, currentness or relevance. Deletion/retention must propagate to
embeddings, and recalled tool/user content remains untrusted data.

**Disposition:** `LONG-CONVERSATION CANDIDATE / DEFER UNTIL EVAL DEFEATS RECENCY BASELINE`.

### Observational Memory and Extractors

Mastra Observational Memory uses background Observer/Reflector agents to replace
older raw context with dense observations and can extract structured values. It
offers substantial long-context/token opportunity.

It is also materially lossy and model-generated:

- observations may omit, distort or over-generalize source messages;
- background models add cost, provider behavior and asynchronous consistency;
- extracted profile/task facts can silently become persistent personal data;
- replacing raw history in model context is acceptable only when raw PAR owner
  history remains retained/available under its own lifecycle;
- observations/extractions require source-message refs, model/prompt/version,
  timestamp and stale/correction state for adjudication.

**Disposition:** `STRONG COMPACTION/EXTRACTION OPPORTUNITY / DEFER + REQUALIFY`.

## 6. External memory alternatives

### Mem0

Mem0 extracts memories from message histories and supports user/session/agent/
application scoping, search, update, delete and history. It is a strong dedicated
memory challenger with managed and self-hosted forms.

Material concerns from current source:

- extraction is another model-derived truth path;
- its REST create model has no caller-supplied memory ID/idempotency key;
- deletion removes vector/entity references but keeps a deletion history record,
  while raw-message lifecycle is separate;
- scopes do not automatically encode Conexus Workspace/Project/Agent/purpose
  authorization;
- managed use adds external personal-data and availability custody.

**Disposition:** `LEADING DEDICATED MEMORY CHALLENGER / DEFER`.

### Zep / Graphiti

Graphiti builds temporally aware entity/relation memory with episodes,
valid/invalid/expired times, hybrid retrieval, group scoping and episode-linked
provenance/deletion. This is strategically strong for changing relational facts.

It also looks close to a temporal knowledge graph and can easily duplicate the
Workspace Brain or business owners. Python/graph database/model/embedding
operations add substantial topology.

**Disposition:** `LEADING TEMPORAL-GRAPH REFERENCE / ADMIT ONLY FOR A NAMED TEMPORAL-MEMORY CONSUMER`.

### LangGraph Store / LangMem family

Namespaced cross-thread key/value memory, TTL and optional semantic search show
a clean separation between thread checkpoints and long-term store. The pattern
is useful; adopting a second agent runtime merely for its Store is not.

**Disposition:** `REFERENCE FOR NAMESPACE/TTL/STORE SEPARATION`.

### Letta and agent-owned persistent state

Persistent editable memory blocks and self-editing agent state are interesting
for autonomous assistants, but risk making runtime-stored Agent state the
current definition and authority.

**Disposition:** `REFERENCE / REJECT AS CONEXUS AGENT AUTHORITY`.

### Small Conexus-owned memory store

Building a generic memory database would recreate extraction, retrieval,
privacy, deletion and evaluation machinery prematurely. Owner-specific explicit
facts should remain in their existing owners; derived runtime memory belongs in
the selected role-isolated substrate.

**Disposition:** `REJECT GENERIC BUILD / ALLOW ONLY EXACT OWNER FACTS`.

## 7. Governed learning

Learning means identifying improvement candidates, not mutating the running
Product Agent.

```text
completed traces + owner outcomes + user feedback + eval results
→ aggregate recurring goal/outcome/behavior/sentiment themes
→ drill down to exact trace/run examples
→ reproduce/evaluate candidate change
→ Agent Change or Brain KnowledgeProposal through existing owner
→ human/authorized acceptance
→ immutable artifact + Release
```

Mastra Trace Intelligence is a useful current research candidate: it clusters
completed traces across goal, outcome, behavior and sentiment. It is private
beta, needs sufficient completed traces, and produces AI-generated summaries
that must be verified against examples and underlying traces.

Learning Evidence cannot:

- rewrite Agent instructions, tools, model policy, memory template or Brain;
- promote a theme, score or sentiment to owner fact;
- use only successful/available telemetry and treat missing traces as success;
- train/persist personal information outside admitted purpose and retention;
- bypass Change/KnowledgeProposal/Release authority.

Detailed evaluator/Trace Intelligence selection remains OPP-C04. C02 fixes only
the learning-to-owner boundary.

## 8. Promoted strategic properties

1. `MEM-01`: every non-message memory declares exact Workspace/Project/Agent/
   subject/class/purpose scope, source provenance, retention and derived status;
2. `MEM-02`: reconnect uses owner sequence plus an opaque delivery cursor and
   reconciles any gap from PAR owner state; cache/stream never creates truth;
3. `MEM-03`: persistent user-affecting memory requires an admitted inspect,
   correct and forget lifecycle before enablement;
4. `MEM-04`: recalled/extracted/observed content is untrusted context and cannot
   grant tools, permissions, bindings, effects or publication;
5. `LRN-01`: learning outputs are traceable Evidence/proposals and can change an
   Agent or Brain only through existing owner acceptance and Release.

These add no Product operation now. `MEM-03` is a Product-loop trigger: the
first persistent personal-memory consumer must establish the human lifecycle
before implementation rather than hiding it in runtime settings.

## 9. Required future falsifiers

1. `C02-P1`: cross-Workspace/Project/Agent/subject/purpose memory access is denied.
2. `C02-P2`: client-supplied full history/timestamps cannot reorder or replace owner chronology.
3. `C02-P3`: expired/missing live cursor reconciles from owner state without duplicate/lost committed messages.
4. `C02-P4`: stream/cache completion without PAR terminal fact remains non-terminal.
5. `C02-P5`: recalled similarity, observation or extraction cannot become current owner/Brain truth.
6. `C02-P6`: prompt-injected recalled content cannot widen tool/effect/authorization scope.
7. `C02-P7`: correction/deletion propagates to derived indexes, observations and caches under exact retention law.
8. `C02-P8`: persistent user memory is inspectable, correctable and forgettable before enablement.
9. `C02-P9`: raw owner history remains adjudicable when lossy context compaction is used.
10. `C02-P10`: long-context/quality/cost eval proves advanced memory beats bounded recent history for the named consumer.
11. `C02-P11`: learning theme is tied to exact examples/traces and cannot self-modify Agent/Brain.
12. `C02-P12`: accepted improvement traverses existing Change/KnowledgeProposal/proof/Release route.
13. `C02-P13`: missing/biased telemetry remains explicit and cannot yield a universal positive learning claim.
14. `C02-P14`: exact memory/runtime/model/storage versions pass role-isolation, security and recovery requalification.

## 10. Pass-2 outcome

```text
OPP-C02 PASS 2 = REVISED / OPERATOR APPROVED
PAR Conversation/message history = OWNER TRUTH / PRESERVE
owner-sequence + delivery cursor + reconciliation = LEADING RECONNECT CONTRACT
Builder persistent thread/tasks/versioned context = REQUIRED BASELINE
Mastra Message History = ACCEPTED SUBSTRATE CANDIDATE / OWNER AUTH REQUIRED
Mastra Working Memory = HIGH-VALUE / DEFER PENDING HUMAN LIFECYCLE
Mastra Semantic Recall = DEFER PENDING LONG-CONTEXT EVAL
Mastra Observational Memory/Extractors = STRONG OPPORTUNITY / DEFER + REQUALIFY
Mem0 = LEADING DEDICATED MEMORY CHALLENGER
Graphiti = LEADING TEMPORAL-GRAPH REFERENCE
LangGraph Store = NAMESPACE/TTL REFERENCE
Letta agent-owned state = REJECT AS AUTHORITY
Trace Intelligence = PROMISING LEARNING EVIDENCE / C04 DECIDES MECHANISM
MEM-01..04 + LRN-01 = PROMOTE TO 4D PROPERTY CONTRACTS
new Product operation/owner/record = 0
exact memory/vector/model/runtime selection = 0
Product implementation authority = 0
```

The operator's broader Builder-capability falsifier is adjudicated separately in
[C02R Builder Capability Falsifier Adjudication](4d-c02r-builder-capability-falsifier-adjudication.md).
It revised Realization Planning applicability and RUN/CON rows without turning
advanced Product-Agent memory into a Builder prerequisite.
