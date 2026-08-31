# 4D OPP-C03 — Agent Composition and Interoperability Study

> **Status:** `PASS 1 OPERATOR APPROVED / BOUNDED BUILDER ROLE COMPOSITION PROMOTED / EXTERNAL AGENT ECOSYSTEM DEFERRED`
> **Inputs:** C-007, C-010, C-016, C-017; Builder/PAR/Gateway owners; C02R; Mitra/Factory AI; current Mastra, MCP, ACP and A2A sources
> **Research date:** `2026-08-28`
> **Runtime/protocol execution:** `NOT PERFORMED / WORKER EVAL REQUIRED`
> **Implementation authority:** `BLOCKED`

## 1. Decision question

Which subagent, supervisor, agent-as-tool and interoperability capabilities are
required for a capable first Builder, and which would create a speculative fleet,
duplicate Conexus owners or expose remote protocol state as authority?

## 2. Global Maximum

```text
capable implementation ActorRun
+ mandatory independent material verification
+ Hub-owned typed Finding → correction → reverify loop
+ bounded optional specialist delegation when Worker Eval proves benefit
+ protocol-neutral CodingWorkerRuntime
!= dynamic agent fleet
!= generic Mission/Workflow owner
!= remote protocol task as Conexus truth
```

Mitra falsifies “multi-agent is required for capable coding”: one strong coding
CLI, context, tools and mechanical gates sustained substantial maintenance.
Factory AI falsifies “one worker may safely self-accept”: fresh validators and
real-system QA expose false completion and context bias. Conexus needs the
smallest composition that preserves both findings.

## 3. Required first-Builder role composition

### Implementer

One capable coding ActorRun receives exact Change/WorkUnit/candidate pins,
Context Compiler output, guarded Workspace capabilities and bounded autonomy.

### Independent verifier

Material verification is a separate non-mutating ActorRun with:

- fresh cognition and fresh immutable candidate materialization;
- exact acceptance assertions and protected-property falsifiers;
- no implementation continuation history beyond the minimum source/provenance
  needed to review;
- read/test/browser capabilities appropriate to the claim;
- typed Finding/Evidence output only;
- no acceptance or correction authority.

The proof covers two lenses—source/contracts/authority and black-box user/browser
behavior. Mechanical gates plus one verifier may cover both; two validator agents
are not mandatory unless isolation or Worker Eval proves the split useful.

### Correction loop

```text
typed Finding
→ Builder owner routes local correction / fix WorkUnit / replan
→ successor ActorRun changes the candidate
→ complete applicable revalidation
→ only current owner acceptance may close the Change
```

Verifier self-fix, “stuck = complete” and partial recheck closure are rejected.

## 4. Mastra composition mechanisms

### AgentController constrained subagents

Current AgentController supports named subagent types, allowed controller/
Workspace tools and model selection. It is a credible implementation mechanism
for focused investigation or review.

Important boundaries:

- ordinary subagents receive full parent conversation context by default;
- `messageFilter` is required where freshness/minimization matters;
- delegation hooks proceed/fallback on error by default, so a security or
  independence gate must use fail-closed error strategy and owner checks;
- forked subagents clone parent instructions/tools and are unsuitable for an
  independent verifier by default;
- subagent completion/result remains runtime output, not ActorRun acceptance;
- tool approvals propagate mechanically but still require Conexus owner mapping;
- cancellation is cooperative and does not prove quiescence or rollback.

**Disposition:** `KEEP AS BOUNDED BUILDER MECHANISM / NOT ACCEPTANCE AUTHORITY`.

### Supervisor subagents on Agent

Current Mastra supervisor/subagent support adds delegation hooks, context
filtering, iteration monitoring, isolated memory saves, approval propagation,
background execution and task-completion scoring.

The task scorer and parent synthesis are cognition/Evidence, never Change
acceptance. A material verifier should normally remain a separately admitted
ActorRun rather than a child of the live implementer context.

**Disposition:** `IMPLEMENTATION ALTERNATIVE FOR SEPARABLE SPECIALISTS`.

### Agent Networks

Mastra Agent Networks are officially deprecated; supervisor agents are the
recommended replacement.

**Disposition:** `REJECT`.

### Agent-as-tool / SDK / ACP child

Wrapping a coding or specialist agent as a tool/subagent is useful when the
provider loop is already capable. The Hub must admit the child ActorRun or treat
the invocation as subordinate tool work; the runtime cannot create invisible
work authority.

ACP v1 is the required Builder challenger because it supports coding-agent
sessions, streaming, filesystem/terminal mediation and permission requests.
`cwd`/roots are not isolation, `allow_always` is not Conexus policy, cancel is not
quiescence, and protocol updates are not owner truth.

**Disposition:** `ACP REQUIRED IN WORKER EVAL / AGENT-AS-TOOL BOUNDED`.

## 5. Serial and parallel law

Serial is the default. Parallel writers are admitted only with:

```text
explicit independent/non-overlapping WorkUnits
+ isolated lineages/workspaces
+ exact base/candidate pins
+ deterministic Hub composition order
+ conflict/ambiguity stop
+ measured net benefit
```

Runtime completion order never chooses acceptance or merge order. The first
Worker Eval compares one capable implementer + independent verifier before
testing specialist/parallel variants as a separate topology axis.

## 6. MCP

### Current-version correction

The official MCP `latest` specification is `2026-07-28`, newer than the dated
Context7 corpus found during research. It removes core initialize/session-ID
semantics, makes calls self-contained, adds optional discovery/MRTR and moves
Tasks into the non-wire-compatible `io.modelcontextprotocol/tasks` extension.
Any prior session/task assumption is stale unless an exact older revision is
deliberately selected and qualified.

### Conexus fit

```text
MCP tool/resource
→ exact versioned adapter and schema
→ current principal/Workspace/Project authorization
→ existing owner capability or Gateway
→ typed result/receipt
```

MCP is useful for a hosted coding CLI that needs Conexus capabilities and for
future external clients. It cannot create a second Capability catalog, infer
authority from tool names/handles, make elicitation an ApprovalRequest or make a
Task/response/cancel event owner truth.

Tool descriptions, annotations, resources and results are untrusted model input.
Server packages/commands are executable dependencies; hosts, redirects,
environment, registry provenance and credentials remain allowlisted/admitted.

**Disposition:** `BUILDER IMPLEMENTATION ALTERNATIVE`; `EXTERNAL MCP DEFER WITH CLIENT TRIGGER`.

## 7. A2A

A2A 1.0 provides Agent Cards, messages, Tasks, Artifacts, streaming, polling,
push and remote HITL. That is valuable only for a genuinely independent remote
agent consumer.

```text
A2A Task       != ActorRun / AgentRun / WorkUnit / Change
A2A contextId  != PAR Conversation
A2A Artifact   != ArtifactRevision / accepted Evidence
AUTH_REQUIRED  != ApprovalRequest approval
signed card    != authorized/trusted capability
```

Internal Hub composition through A2A would add serialization, discovery, task
state and security machinery without an independent remote boundary. External
use also requires card/interface/version trust, caller isolation, no existence
leak, stream reconciliation, push idempotency/SSRF protection and untrusted
artifact handling.

**Disposition:** `REJECT FOR INTERNAL COMPOSITION / DEFER FOR REAL REMOTE AGENT`.

## 8. Promoted properties

### Builder composition

1. `CMP-01`: bounded role-typed implement/verify ActorRuns remain Hub-admitted;
2. `CMP-02`: material verifier uses fresh context/materialization, cannot mutate
   and emits typed Finding/Evidence only;
3. `CMP-03`: findings route through correction/replan and full revalidation;
4. `CMP-04`: exact context/tools/autonomy/budget are compiled per child/run, with
   no recursive spawn or inherited secret/authority;
5. `CMP-05`: native Mastra, SDK/ACP or private MCP adapters preserve one complete
   CodingWorkerRuntime/owner envelope;
6. `CMP-06`: serial baseline; concurrent writers require non-overlap, isolation,
   deterministic composition and measured benefit;
7. `CMP-07`: Worker Eval selects topology using correctness, negative controls,
   maintenance, rework, intervention, cost, latency and conflicts;
8. `CMP-08`: Product-Agent/external agent composition remains deferred to a
   named consumer and owner-loop reopen.

### Protocols

1. `IOP-01`: protocol projection is never authority;
2. `IOP-02`: discovery/card/schema/content/result are untrusted inputs;
3. `IOP-03`: every protected call rederives current scope/principal authority;
4. `IOP-04`: protocol task/session/status/cancel cannot settle owner/effect truth;
5. `IOP-05`: every external effect remains Gateway-owned and reconciled;
6. `IOP-06`: protocol permission/auth/HITL response cannot widen the sealed subject;
7. `IOP-07`: protocol revision/extensions are exact-pinned and downgrade fails.

## 9. Required falsifiers

1. `C03-P1`: runtime/subagent success cannot accept Change or settle ActorRun.
2. `C03-P2`: verifier sharing implementation continuation or mutating candidate fails independence.
3. `C03-P3`: stale/different candidate digest invalidates verifier Evidence.
4. `C03-P4`: child receives only exact context/tools/budget; secret, Git remote, DB or opposite-role access fails.
5. `C03-P5`: delegation hook/filter failure at a deciding boundary fails closed.
6. `C03-P6`: recursive spawn and unbounded depth/steps are denied.
7. `C03-P7`: parallel same-lineage writers or ambiguous merge are denied.
8. `C03-P8`: specialist topology must beat the capable-single-worker baseline on named Worker Eval properties.
9. `C03-P9`: adapter swap preserves owner/result/cancel/suspension envelope; truncated/untyped output cannot progress.
10. `C03-P10`: MCP revision/extension mismatch, downgrade and stale tool-cache authorization fail.
11. `C03-P11`: malicious MCP description/result cannot alter allowlist, authority or effect admission.
12. `C03-P12`: MCP duplicate/lost/cancel race cannot duplicate a Gateway effect.
13. `C03-P13`: A2A card/task/artifact cannot become Conexus identity, owner truth or accepted Evidence.
14. `C03-P14`: A2A caller/tenant isolation, reconnect and duplicate push controls fire before admission.
15. `C03-P15`: first Builder dependency/config census contains no internal A2A or Product-Agent fleet.

## 10. Pass-1 outcome

```text
OPP-C03 PASS 1 = OPERATOR APPROVED
capable implementer + independent material verifier = REQUIRED FIRST BUILDER COMPOSITION
dynamic agent fleet / generic Mission owner = REJECT
Mastra constrained subagents = BOUNDED IMPLEMENTATION ALTERNATIVE
Mastra Agent Networks = REJECT / DEPRECATED
native Mastra vs SDK/ACP/private MCP = WORKER EVAL AXIS
ACP = REQUIRED BUILDER CHALLENGER
MCP Builder-private = CREDIBLE ALTERNATIVE
external MCP = DEFER UNTIL REAL CLIENT
internal A2A = REJECT
external A2A = DEFER UNTIL REAL REMOTE AGENT
CMP-01..08 + IOP-01..07 = PROMOTE TO 4D PROPERTY CONTRACTS
new Product owner/operation/record = 0
exact agent/protocol/dependency selection = 0
Product implementation authority = 0
```
