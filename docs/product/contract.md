# Conexus OS — Product Contract

> **Semantic authority:** CURRENT / ACCEPTED PRODUCT CONTRACT
> **Mutable status:** owned only by [../roadmap.md](../roadmap.md). Accepted technology qualification is summarized in [../phases/3l-technology-qualification.md](../phases/3l-technology-qualification.md).
> **Method:** DevelopmentConexus Engineering Method v1.0.0

This current accepted authority projection consolidates **what Conexus is, what users can do, which Product meanings and whole-product journeys must remain true, and which future capabilities are deliberately preserved without becoming F1 machinery**.

It is derived from accepted Product/system authority, especially C-001/C-003, 3B, 3K and the owner/state/security boundaries of 3C–3J. It does not replace those detailed semantic homes and does not turn runtime/provider mechanics into Product authority.

Round-3 Fable corrections, closure-keyed `R3C-01..08`, Round-3.1 projection correction and final GPT authority review are complete. The operator accepted this projection through 3A-R11.

---

# 1. North Star

> **Conexus is an AI-first enterprise software platform that helps people build, evolve and operate business applications and Product Agents over real enterprise systems and data, while preserving explicit business knowledge, governed authority, verifiable engineering and truthful operational evidence.**

Conexus combines four strengths that must remain coherent rather than becoming four unrelated products:

```text
1. Conexus Builder / Harness
   → build and evolve software through governed agentic engineering

2. Enterprise Brain
   → reusable, published business meaning and knowledge above individual Projects

3. Business Applications / Capabilities / Integrations
   → turn ERP and external-system data/capabilities into useful software

4. Product Agents
   → Project-owned AI capabilities that reason and act only through governed product context/tools
```

The Product experience is:

```text
agent-first
+
simple by default
+
inspectable by design
+
authority-preserving
```

A user should normally describe business intent and inspect the result rather than operate infrastructure. When trust, debugging, review or risk demands depth, Conexus exposes the real Plan, Change, Data, Capabilities, bindings, diff, Findings, Evidence, cost and runtime observations needed to understand what happened.

---

# 2. Product strategy

## 2.1 F1 — internal/company-first platform

F1 is the first complete usable Conexus platform operated internally to build and deliver real business software.

It is not an open self-service SaaS launch. There is no F1 requirement for public signup, billing or marketplace machinery merely because those may exist later.

## 2.2 Later SaaS direction

Opening Conexus as a SaaS offering remains an accepted Product direction from C-001.

That direction does not authorize speculative F1 infrastructure. When SaaS is actually selected, the Product must deliberately decide onboarding, billing/customer operations, isolation/economics and **authenticated reachability to private/on-prem enterprise systems when a real customer source requires it**.

The old phrase “managed tunnel” is not a permanently selected technology; the future requirement class is private/on-prem reachability with correct identity, custody and policy.

## 2.3 First vertical

The first vertical remains:

> **Analisador Inteligente de Orçamentos — Sankhya**

It is both a useful business application and a permanent Builder benchmark against the known Mitra result and later Conexus versions.

The first vertical is intentionally **read-only analytics**. It does not require a Product Agent, external write or automation just to exercise infrastructure.

---

# 3. What Conexus is not

F1 is deliberately not:

```text
an ERP replacement
an unrestricted database console
a generic integration/iPaaS platform
a generic workflow/BPM engine
a universal automation/scheduler product
a generic RAG/vector/knowledge platform
a universal policy/authorization engine
a marketplace of plugins/apps/agents
a generic Agent fleet runtime
a low-code form/workflow builder
an IDE as the primary Product experience
a black-box chat that hides real resources/truth
a native-mobile-first product
an unrestricted autonomous-agent platform
```

Shared mechanics may exist internally; they never absorb Product/business authority by convenience.

---

# 4. Primary users and actors

## 4.1 Workspace owner / platform operator

Trusted human who can establish/administer a Workspace, create/authorize Projects, manage Workspace resources and oversee software being built and served.

Administrative authority never implies automatic business access to every Published Application.

## 4.2 Project administrator / Builder operator

Authorized to create/evolve a Project, manage its Baseline/Changes/bindings/access and drive candidate verification/Release according to current gates.

## 4.3 Project contributor / reviewer

Participates in Project evolution, Plan/Change review, Preview/Evidence inspection and only the actions currently permitted.

## 4.4 Published Application user

Consumes a business application/capability delivered by a Project without necessarily receiving source/Builder access.

## 4.5 Product Agent user

A Published Application or admitted headless consumer that interacts with an exact active Project-owned Product Agent under the applicable runtime/app authority.

## 4.6 Approver / decision maker

A currently eligible principal shown one **exact** owner-specific decision subject — for example a Change checkpoint, effect proposal, Promotion or access mutation.

There is no universal Approval Center that flattens all decision meanings.

## 4.7 Auditor / technical investigator

Inspects history, Evidence, provenance, Findings, run/tool observations, cost and receipts without turning telemetry into current-state authority.

---

# 5. Core Product concepts

## 5.1 Account

One global human identity. An Account may participate in multiple Workspaces; shared identity never creates cross-Workspace authority.

## 5.2 Workspace

Sovereign Product isolation/organization root.

Workspace-owned visible resources include:

```text
Projects
access-filtered Agent catalog
Brain
Workspace-scoped Connections
Areas/membership context
administration/settings
```

## 5.3 Area

Optional organizational grouping of people inside a Workspace. Area is not a software/dependency owner.

## 5.4 Project

Independent unit of software/Product lifecycle inside a Workspace.

A Project may contain:

```text
application/frontend surfaces
business data/read models
Queries / Actions
integration bindings
private Project-scoped Connections
Product Agents
managed jobs when needed
artifacts
Releases
```

A technical layer does not become another Project by default.

F1 has one canonical source repo per Project; multi-repo is deferred until a real consumer.

Every software-publishing Project fixes exactly one `ApplicationRuntimeProfile` in its approved Project Baseline:

```text
ApplicationRuntimeProfile = MANAGED | DEDICATED
```

This is a closed F1 union inside one Software Factory. `MANAGED` uses the Conexus-governed application runtime. A `DEDICATED` application may own its independently executable runtime/data plane and Product-specific network behavior; the Gateway remains the Conexus-governed capability boundary, not a mandatory universal network stack for that application. Conexus-owned capabilities require an explicit binding/Platform Service, and no Connection, Hub or Vault credential is inherited. It is not a second Factory, and automatic profile conversion is not promised.

The DEDICATED semantic/trust contract is current even though physical deployment remains deferred until the first real deployment. Its server-side principal is `DedicatedApplicationPrincipal`; `private_key_jwt` authenticates a signed assertion bound to the exact `ReleaseRef`, yielding a short-lived signed bearer. Every request rechecks `credentialGeneration`, Project/Release containment, Release-pinned service composition and current owner/security gates. F1 admits only `SERVICE_SCOPED` exchange.

### 5.4.1 Archived Project

Archive freezes ordinary authoring and future intent expansion. It is deliberately not a runtime stop:

```text
ARCHIVED
-X-> unpublish
-X-> stop current serving
-X-> stop a pre-existing enabled Product-Agent trigger
-X-> stop an existing managed recurrence by itself
```

While archived, trigger `CREATE`/`ENABLE`/semantic reconfiguration and ordinary new composition remain blocked; explicit trigger `DISABLE` remains allowed narrowing. Recovery may target only a Release previously activated for that Project that still passes current conformance. The Product must tell the operator plainly: **Archive does not stop automations and does not unpublish.**

## 5.5 Project Baseline

Approved, versioned statement of Project architecture/Product meaning sufficient for current work.

```text
SPEC-ANCHORED
LIVING
INCREMENTAL
```

Readable source lives in Project Git; the Hub pins the exact approved revision/digest.

The Baseline is sufficient for the current Change, not every imagined future. A coding actor must not be forced to invent a material Project-level decision because the Baseline omitted something the Change requires.

## 5.6 Change

Bounded/verifiable Project evolution describing **what must become true**.

```text
Change
!= Work Unit
!= Builder ActorRun
```

## 5.7 Plan

When Change complexity/uncertainty warrants explicit planning, Conexus produces an approvable **visual Plan** derived from current accepted intent.

The Plan may expose:

```text
work items / Work Units
dependency graph
acceptance/assertion links
known blockers/unknowns
current progress
```

The two current axes are independent:

```text
PlanningDepth = DIRECT | LIGHT | FULL
RigorProfile  = FAST | BOUNDED | CONTROLLED
```

`DIRECT + CONTROLLED` and `FULL + BOUNDED` are both valid. Human checkpoint/Change authority fixes the `PlanningDepth` floor; the system/operator may elevate it, but runtime dispatch cannot downgrade it. `RigorProfile` is the maximum calculated from declared effect/authority risk, detected diff/artifact risk and environment risk; unknown never lowers rigor. Dispatch requires both gates to pass. These enum names are inspectable contract language, not vocabulary the normal UI must force on users. There is no 3×3 policy matrix, `PlanningEngine`, LOC score or LLM-authoritative classifier.

The Hub owns accepted Plan/current plan-item state. Model/worker narration cannot mark work complete by itself.

## 5.8 Live execution checklist and `tasks.md`

The live checklist is Hub-owned operational progress projected to the UI.

```text
worker/model proposes transition
→ Hub validates/current-state applies transition
→ durable current progress
→ UI projects it
```

Worker death/interruption is represented honestly.

`tasks.md` is durable **purpose/context memory** in Project Git — what is being built, why, what remains, known limitations and causes/corrections. It is not the authority for “is item X operationally complete?”. At SHARE, its fenced structured block **must** be mechanically checked against current Hub `planRevision` and item state; stale revision or incompatible `statusCode` blocks SHARE. Free prose is not operational authority.

## 5.9 Brain

Workspace-scoped canonical reusable business meaning/knowledge.

Closed content classes:

```text
SEMANTIC
→ datasets, entities, dimensions, measures, metrics, grain, relationships

KNOWLEDGE
→ glossary, rules, caveats, processes, campaigns/policies/context

EVIDENCE_SPEC
→ specifications of what/how to prove, assertions, verification requirements, golden cases
```

Brain `EVIDENCE_SPEC` describes required proof; Builder/verification `Evidence` is the actual collected proof.

Brain is published/versioned and used through explicit `ProjectBrainBinding`.

Brain is not agent memory, RAG/index, Project DB, telemetry store or security policy engine.

Brain content is not a privileged instruction channel:

```text
real ERP data in Brain Git                              = FORBIDDEN
sample/verified-query fixture source                    = enum | synthetic
PII lint + secret scanning + human review               = REQUIRED
custom_instructions command authorization/tools/
  approvals/credentials/platform policy                = FORBIDDEN
Brain widens grant/tool/data/platform authority         = NEVER
```

## 5.10 Brain Discovery

F1 capability for **machine-propose / human-decide** semantic discovery against real enterprise data/source metadata.

Current shape:

```text
source dictionary/catalog + directed profiling
→ candidate semantic mappings
→ provenance/hypothesis state
→ machine proposes
→ human interview resolves what cannot be inferred
→ reviewed publication becomes Brain authority
```

The Product must visibly distinguish inferred/proposed from confirmed knowledge.

## 5.11 AnalyticQuery

Second governed read regime for semantic/analytical questions that should be expressed through Brain meaning rather than static pre-authored Query slugs.

Current v0 intent:

```text
agent/caller uses Brain semantic IDs
→ validate against exact Brain + Project binding
→ restricted semantic plan/AST
→ SELECT-only proof
→ Project read-only authority
```

One AnalyticQuery operates on one curated analytical dataset in v0. New join topology/physical SQL is not chosen freely by the LLM at runtime.

Static registered Query remains the other read regime. The first Budget Analyzer is not forced to use AnalyticQuery merely to exercise infrastructure.

AnalyticQuery being an admitted platform read regime does **not** automatically place it in a Product Agent `ToolProjection`. A named current consumer and exact Release/tool authority must explicitly admit that use.

## 5.12 Connection

One Connections-module-owned semantic lifecycle for a relationship to an external system/environment using a versioned Connector, qualification facts and opaque credential relationship:

```text
Connection.ownerScope = WORKSPACE | PROJECT
WORKSPACE → reusable organizational resource
PROJECT   → private Project resource, not implicitly reusable by siblings
```

Provider does not determine scope. Project use of an exact `ConnectionRevision` requires explicit `ProjectConnectionBinding`; cross-Workspace use is denied. These scopes do not create two Connection classes or a generic scope engine.

## 5.13 Capability

Real Project capability users/software/Agents can invoke through governed platform contracts.

F1 Product vocabulary includes at least:

```text
Query
Action
```

Capability does not erase owner-specific Integration Operation/AnalyticQuery semantics.

## 5.14 Integration

Project view/use of explicitly bound external-system capability. Connections owns the Connection lifecycle; the owning Workspace or Project supplies the scoped resource, Project owns binding/use, and Gateway owns last-mile execution/effect safety.

## 5.15 Artifact / immutable revision

Git contains authored source; Registry contains immutable compiled revisions/digests/availability. Availability is not active production use.

## 5.16 Release

Immutable exact composition of Project outputs/bindings/config/runtime facts eligible to be served.

```text
candidate verified
!= Release AVAILABLE
!= Promotion approved
!= pointer switched
!= SERVED_VERIFIED
```

No governed execution resolves through mutable `latest`.

## 5.17 Promotion

Governed movement of an exact Release toward a target environment with current authorization/conformance/gates. Rollback is another governed Promotion, never an implicit business-data rewind.

`4C-F31/F32` close the human operation projection without merging these truths:

```text
Release collection/detail
→ immutable human label + creation/source coordinate
→ scalable newest-created-first list
→ stable safe component/binding/config/runtime composition projection

Project serving state
→ server-disclosed target environments
→ per-target pointer generation + active Release when set
→ independent serving verification

Promotion history
→ exact target identity + immutable human label
→ request-time human actor/time + optional settlement time
→ chronological pagination
```

The human label/summary is presentation owned by the Release projection; it is not caller-selected naming or mutable Project authority. A promoter never types an environment authority coordinate free-form: the target comes from the server-disclosed Release owner matrix. `AVAILABLE`, pointer transition and `SERVED_VERIFIED` remain distinct.

## 5.18 Build

Primary Project construction surface:

```text
Project navigation
+ Preview-dominant workspace
+ contextual/retractable Conexus assistance
+ Preview | Code | Diff lenses
+ Plan/progress/Evidence detail when needed
```

Agent-first, not agent-only.

## 5.19 Platform Consultant / contextual Conexus assistant

Builder-owned Control Plane capability that helps the operator understand/use Conexus, its SDK/paved roads/patterns/current Project context and next safe action.

Its platform knowledge is published/versioned/provenance-preserving according to Builder/platform pack discipline. It is **not Workspace Brain content** and does not create a global Product Agent/tenant authority.

## 5.20 RunPreview

Controlled candidate/result serving for inspection before production.

```text
Preview ready
!= VERIFIED
!= Release AVAILABLE
!= Published App live
```

## 5.21 Published Application

Business runtime served from an exact active Project Release under an authorization context independent from Control Plane/Builder access.

## 5.22 Product Agent

Project-owned, git-first, Release-pinned AI Product resource whose canonical authoring contract is `agent/v1`.

It includes purpose/instructions/model policy/bounded tools/Brain context/admitted memory/interactions/policies/approvals/budgets/verification/known limitations.

Manual/structured and natural-language authoring converge on the **same Change, candidate, diff, proof and Release path**.

`4C-F30` makes that existing meaning truthfully inspectable and authorable without creating another Agent owner:

```text
PRJ-21
→ safe complete authored ProductAgentDefinition
→ exact immutable authoredRevisionId + Release coordinates

Builder Change
→ server-owned typed ProductAgentAuthoringDraft
→ explicit NEW or EXISTING origin
→ exact draftRevision + candidateSubjectDigest
→ structured/manual edits and Conexus edits converge on the same candidate agent/v1
```

The Product definition is framework-neutral and schema-closed. It exposes authored name, purpose, instructions, bounded model policy/sampling, governed capability bindings, Project-bound Brain context, currently admitted memory/interactions, policy/approval/budget/verification references and known limitations. It never exposes credentials, provider passthrough objects, Mastra/Stored-Agent identity, runtime revision overrides or arbitrary extension payloads.

`ProductAgentAuthoringDraft` is subordinate current candidate state inside one exact Builder Change. It is not a second Agent database, direct source write, live Agent mutation, Release or runtime configuration owner. Creating a draft is idempotent and states `NEW | EXISTING`; revising it requires the exact current `draftRevision`. The server issues or revalidates `agentId`, containment, base authored revision and candidate subject on every admitted operation.

Framework-specific “system prompt,” skill, workflow and tool representations are mechanisms. Product meaning remains the canonical instructions, policy references and governed Project capability bindings unless a later accepted Product decision admits another semantic owner.

## 5.23 Conversation

Conexus identity for a user-facing Product Agent conversation. Not a provider thread/session identity and not authorization by existence.

Conversation owns human-recognizable chronology, a safe last-message preview and the exact current `NONE | NEEDS_YOUR_RESPONSE` attention projection. A structured clarification is a `QUESTION` message with bounded optional response choices. The clarification question completes the current AgentRun; a human reply references that exact current question and the reply starts a new exact AgentRun. An absent, stale or already-answered question is rejected by PAR.

Clarification is not effect approval. It does not reuse `ApprovalRequest`, keep an ordinary model process suspended or grant authority through a selected option. Effect authorization remains the distinct sealed-subject flow.

## 5.24 Product AgentRun

One admitted exact-pinned Product Agent execution.

PAR owns its admission time, optional settlement time, lifecycle state and optional safe human problem projection. Run lists are newest-admitted-first with an owner-defined stable tie-breaker; browser receipt time, array accident and identifier shape are not temporal truth. Human problem context does not create retry/resume authority and does not expose raw framework/provider payload.

```text
AgentRun COMPLETED
!= every external effect succeeded
```

## 5.25 ApprovalRequest

Exact durable approval wait/subject in the Production Agent Runtime (PAR). Approval binds the exact sealed proposal; changed args/content require new authority.

The request also preserves immutable request-time Agent/Release presentation, a deterministic safe human action summary, requested time and optional expiry time so an eligible human can recognize the decision without unrelated Project/source reads. This historical context is presentation Evidence only: current eligibility, Release, owner state, sealed subject and digest are rechecked at decision time.

## 5.26 AgentTrigger

Owner-managed headless Product Agent trigger semantics.

Current F1 admitted trigger = bounded `SCHEDULE` where used. `EVENT`/webhook remains deferred until a real consumer/contract exists.

Interactive and headless remain one Product Agent concept.

## 5.27 Managed Job / job run

Project-scoped deterministic background capability. First F1 `job/v1` consumer = governed sync, not arbitrary privileged Project code.

Queue/scheduler technology is mechanism, not Product authority.

## 5.28 Finding

Durable Project/Change problem/contradiction that survives the discovering runtime when needed. A worker can originate it; owner authority accepts/closes it.

## 5.29 Evidence

Provenance-preserving proof over facts/results/receipts/tests/decisions supporting a claim. Agent prose, green badges or telemetry alone are not sufficient Evidence by existence.

## 5.30 Environment

Explicit Project environments such as DEV and PROD where present. Validation DB is ephemeral proof; Preview is candidate serving, not a third persistent business environment.

## 5.31 Private attachment/blob capability

Project/app features may store/download bytes through owner-specific attachment/storage contracts.

Current Product property:

```text
private by default
owner/current authorization controls access
public exposure only through explicit admitted Product policy
```

Storage provider/path/object key/prefix never becomes semantic identity or authorization authority.

---

# 6. Ownership map

| Meaning | Owner / authority |
|---|---|
| global human identity/session/access | Identity & Access |
| Workspace/Area lifecycle | Workspace |
| Project identity/Baseline/binding intent | Project |
| Change/Plan/WorkUnit/Builder ActorRun/Findings | Builder |
| authored Project source | Project Git |
| published canonical Brain source | Workspace/Brain Git boundary |
| immutable compiled revision | Artifact Registry |
| reusable enterprise meaning/knowledge | Brain |
| external account/environment relationship | Connections |
| external effect/credential last-mile/replay | Capability Gateway |
| Product Agent Conversation/AgentRun/Approval/Trigger | Production Agent Runtime |
| active Project composition | Release / Promotion/serving authority |
| Project business data | Project DB / declared external source semantics |
| managed background occurrence | Managed Application Runtime |
| operational observation/audit projection | Observability & Audit, never business-state replacement |
| exact attachment semantics | owning record/module; shared storage does not transfer authority |

Visual composition never merges owners.

---

# 7. Journey A — first access / Workspace

```text
exact preconfigured bootstrap OIDC subject authenticates
→ transient TRUSTED_BOOTSTRAP_CONTEXT self-provisions only its own Account
→ bootstrap context becomes invalid
→ normal Account-backed Conexus session is established
→ trusted operator creates the first Workspace with exact initial creator access
→ initial Workspace access is owner-established, not inferred by the browser
→ current authority resolves the new Workspace context
→ Projects / Agent catalog / Brain / Connections / administration
```

No public signup, tenant onboarding, billing or default reusable admin credential is admitted in F1. The bootstrap context is pre-Account, one-shot and cannot access ordinary Product resources. Workspace membership does not imply every Project/Agent/resource. Agent catalog is filtered projection, not fleet owner/Approval Center.

---

# 8. Journey B — Project Inception / Baseline

```text
Workspace
→ Create/Import Project
→ establish/associate canonical source repo
→ Inception / Discovery
→ inspect objective/users/constraints/source systems/real data where relevant
→ propose sufficient Project Baseline
→ human checkpoint: “this is what we are building”
→ approved Baseline digest
→ initial Change
```

Brownfield Discovery includes current source/contracts/architecture/data reality.

Inception is not a fake Change. Baseline is incremental and can later be revised through governed Project authority.

---

# 9. Journey C — Plan / build / verify / publish

```text
user states intent
→ Change
→ current Baseline/authority pinned
→ discovery/planning proportional to risk/uncertainty
→ visual Plan/checkpoint when warranted
→ Hub-owned live checklist / Work Units
→ Builder executes bounded ActorRuns
→ code/data/capability/integration/Agent candidates evolve
→ mechanical tests + runtime observations + assertions/Evidence
→ independent material verifier when required
→ known limitations + accepted criteria checked item-by-item
→ candidate VERIFIED or honestly failed/blocked/unverified
→ RunPreview
→ exact Release
→ Promotion
→ serving verification
→ SERVED_VERIFIED
```

```text
model says done      != Change accepted
item says completed  != verified
0 Findings           != verified
Preview ready        != verified/live
Release AVAILABLE    != live
pointer switched     != SERVED_VERIFIED
```

Material Project-level discovery returns to Baseline/decision before coding silently crosses the boundary.

---

# 10. Journey D — Brain assisted Discovery

```text
Project/source-system discovery need
→ current Connector/Connection + Hub/Gateway read-only discovery authority
→ source dictionary/catalog + directed profiling
→ machine proposes semantic candidates
→ provenance badge / unresolved uncertainty shown
→ prioritized human interview
→ reviewed candidate Brain changes
→ publish only through Brain owner/human authority
```

ERP credentials never go to E2B simply to perform Brain Discovery.

Expected percentage accuracy is never Product truth until measured; unsupported semantic mapping remains hypothesis.

---

# 11. Journey E — Brain publish / bind / feedback

```text
Workspace authors/reviews Brain
→ immutable Brain revision AVAILABLE
→ Project explicitly ProjectBrainBinding exact revision
→ mandatory local binding/conformance proof
→ Release pins binding
→ runtime receives bounded effective Brain slice
```

For Brain-dependent Agent execution:

```text
AgentRun pins Brain health snapshot
→ recheck critical dependency health before final response
→ recheck again before any effect/approval execution
→ critical health change invalidates continuation/approval and recomposes context

Brain-dependent approval binds effectiveBrainSliceDigest
critical SUSPECT/INVALID content blocks dependent use where current policy requires it
```

Feedback:

```text
Project / Builder / Product Agent / human discovery
→ KnowledgeProposal
→ Brain owner human review
→ new published revision
→ UPDATE_AVAILABLE
→ each Project independently revalidates/rebinds/promotes
```

No memory self-publish; no live inheritance.

---

# 12. Journey F — Connection / Integration

```text
Workspace exposes a reusable Connection or Project defines a private Project-scoped Connection
→ secret entered through write-only trusted path
→ Connection qualified against real environment
→ Project explicitly binds exact Connection revision/environment
→ Release pins binding
→ Project capability/Agent/job calls admitted operation
→ Gateway resolves current binding/access/effect/credential/destination
→ receipt/result/provenance returns to owner
```

```text
configured != qualified
qualified != bound
bound != healthy
healthy != caller authorized
```

No credential in chat/Project Git/browser/guest.

---

# 13. Journey G — Data / static Query / AnalyticQuery

A Project chooses the minimum data path its accepted Product slice needs; there is no universal LIVE/MIRROR/HYBRID setting.

Static read:

```text
registered Query
→ exact input contract
→ governed read-only execution
```

Semantic analytical read where admitted:

```text
AnalyticQuery semantic IDs
→ exact Brain + binding
→ restricted plan/AST
→ SELECT-only proof
→ Project read-only role
```

A new arbitrary join/physical expression is Builder work, not a runtime LLM decision.

---

# 14. Journey H — Publish and use business application

```text
verified candidate
→ exact Release
→ current approval/conformance
→ Promotion
→ active pointer
→ real-path byte/runtime proof
→ SERVED_VERIFIED
→ Published Application under independent app authority
```

Project admin can manage app access without receiving all business data/capabilities. App user can use software without Builder/source access.

---

# 15. Journey I — create/evolve Product Agent

Entry points may include:

```text
Project → Agents → New Agent
Project → Agent → Change with Conexus
Project → Build → natural-language Agent intent
```

They converge:

```text
same Change
→ dependency analysis
→ missing dependencies explicit
→ material capability/effect widening shown before build
→ structured/manual OR natural-language edits
→ same candidate agent/v1
→ diff/verification/limitations
→ immutable revision
→ Release
→ Promotion
```

No `ManualAgentDefinition`, `AIAgentDefinition`, second Agent authoring DB or Mastra Stored Agent authority.

---

# 16. Journey J — use Product Agent

Interactive:

```text
Published App user
→ Project-designed Agent surface
→ typed app context refs
→ Conversation
→ exact-pinned AgentRun
→ admitted Product Agent
→ bounded ToolProjection
→ owner capabilities/Gateway
→ truthful response/receipts
```

When the Agent needs clarification rather than effect authority:

```text
Agent QUESTION message + optional bounded choices
→ current Conversation = NEEDS_YOUR_RESPONSE
→ exact human reply references the open question
→ prior AgentRun remains settled
→ reply starts a new exact AgentRun
```

Headless:

```text
SCHEDULE wake
→ guarded PAR ingress
→ validate current TriggerRevision/schedule
→ stable intended-slot identity before AgentRun admission
→ cursor per (TriggerId, TriggerRevision)
→ single-flight admission
→ exact current Release pin
→ direct Product Agent execution
```

Scheduled runs are threadless by default.

```text
valid occurrence + active trigger-origin run
→ consume occurrence as SKIPPED
→ no AgentRun
→ no catch-up/backlog from the skipped Product-Agent slot
```

Schedule fire never executes the Product Agent directly or borrows MAR sync catch-up semantics.

Product Agent is product/context-aware by default, not source/host-aware. No automatic repo/shell/browser/raw-network/raw-DB/raw-secret/Builder-workspace authority.

---

# 17. Journey K — exact effect approval

```text
Agent proposes exact governed effect
→ owner persists sealed subject
→ ApprovalRequest
→ eligible current human recognizes request-time Agent + safe action/temporal context
→ eligible current human sees exact sealed subject
→ ALLOW_ONCE | DENY | EXPIRED | STALE
```

On `ALLOW_ONCE`:

```text
same exact proposal + args
→ current authorization/policy/budget rechecked
→ Gateway admission
→ exact effect/idempotency identity
→ external attempt
```

Changed proposal requires new authority. Runtime retry is not effect retry authority. Ambiguous acceptance = `OUTCOME_UNKNOWN` + reconciliation, not blind replay.

---

# 18. Journey L — managed sync/job

```text
active Release contains admitted job/v1
→ MAR exposes safe human-recognizable runnable-job identity from that exact served Release
→ schedule derived
→ manual/fixed interval occurrence
→ MAR job run
→ governed Gateway/Project capabilities
→ Project state/read model updated
→ occurrence/result/provenance recorded
```

Current F1 laws:

```text
single-flight / coalesce
after downtime, at most one catch-up only if the current served Release still requires sync
  and current freshness is behind
not replay every missed slot
no arbitrary privileged Project job code
no workflow/scheduler business domain
```

This is the MAR managed-sync profile, not a shared recurrence abstraction and not Product-Agent `SCHEDULE` behavior.

`4C-F33` assigns the distinct discovery job to `MAR-04 ListRunnableManagedJobs`. A job with no prior JobRun remains discoverable. The catalog is neither JobRun history nor a queue/scheduler control surface; `MAR-03` still re-resolves the exact currently served Release and current authority before admitting one occurrence.

---

# 19. Journey M — duplicate Project

F1 Project duplication preserves source/config intent without cloning hidden authority:

```text
Duplicate Project
→ copy code
→ copy config schema/contracts
→ copy declarations/source artifacts as applicable
→ ask whether business data should be copied
→ default = NO DATA
```

Never copy automatically:

```text
Project database contents
credentials
Connection bindings
current external authorization
runtime sessions/history
```

The accepted C-014 base is no Project DB contents, credentials or Connection bindings. Excluding current external authorization and runtime sessions/history is a monotonic consequence of their separate owner authority, not a new copy domain.

Destination must explicitly rebind Connections/Brain/environment authority according to its own current context.

---

# 20. Journey N — first vertical Budget Analyzer

```text
Workspace: Metal Nobre
├── Brain: budget/pending/conversion definitions + caveats
├── Connection: Sankhya
└── Project: Budget Analyzer
    ├── Baseline
    ├── Brain binding
    ├── Connection binding
    ├── governed sync
    ├── Project analytical read model
    ├── registered read-only Queries
    ├── frontend dashboard
    └── Release / Published App
```

Data path:

```text
Sankhya
→ Gateway live reads
→ Discovery / qualification / reconciliation / verification / Evidence

Sankhya
→ governed sync
→ Project DB analytical read model
→ registered Queries
→ dashboard
```

```text
Project DB != Sankhya source authority
Project DB != Brain semantic authority
read model existence != proof of completeness
historical benchmark != current operational truth
```

Unsupported margin/source semantics are omitted/blocked/qualified honestly, never fabricated.

For this vertical:

```text
Product Agent required  = NO
external/business write = NO
automation              = NO
```

Agents surface may honestly be empty.

---

# 21. Journey O — maintenance and reusable learning

```text
new request / bug / source change / Finding / Brain update
→ Change
→ pin current Baseline/Release-relevant context
→ investigate
→ revise Baseline only if Project meaning materially changes
→ build/verify
→ Release/Promotion
→ served verification
```

Reusable company learning follows KnowledgeProposal→Brain review rather than invisible memory inheritance.

Repeated platform failure classes can improve scaffold/gates/runtime seams; one local workaround does not become universal framework automatically.

---

# 22. Cost, usage and execution transparency

F1 must make agentic execution economics observable without inventing false certainty.

F1 preserves finite server-derived model-call/step limits and truthful usage/cost visibility. A hard per-run USD/provider-invoice guarantee is not promised for F1; monetary reservation/cost-envelope enforcement is deferred by 3L-R1 until a named reopen trigger becomes real.

Where the source exposes the facts, user-facing execution detail supports:

```text
per turn / run / ActorRun / AgentRun:
  model/provider identity
  input/output/cache/reasoning token classes where available
  LLM cost state / USD where calculable
  duration
  tool/runtime observations

rollup:
  conversation/session/run
  Project
  period
```

Builder sandbox wall-clock cost is a separate monetary class from LLM spend when available.

Usage/cost states remain explicit:

```text
REPORTED | INFERRED | MISSING
CALCULATED | MISSING_USAGE | MISSING_PRICE | UNSUPPORTED
provider/reconciled states where available
```

```text
missing != zero
inferred != reported
calculated != provider-reported != reconciled
```

UI may summarize; drill-down preserves provenance/state.

---

# 23. Product truth / inspectability laws

## 23.1 Request/data

```text
loading != successful empty != failed != partial
```

Source/environment/freshness/coverage/provenance are visible when material.

## 23.2 Build

```text
model narration != Hub progress
0 Findings != verified
working != blocked != waiting-for-user != completed
```

Plan/checklist/Evidence use owner facts.

## 23.3 Preview

```text
Preview ready != VERIFIED != AVAILABLE != live
building next candidate != currently inspectable last-good Preview
```

Building a new candidate must not require destroying/replacing the last usable Preview before the next one is ready.

## 23.4 Release

```text
AVAILABLE != Promotion approved != pointer swapped != SERVED_VERIFIED
```

## 23.5 Agent/effect

```text
AgentRun completed != every effect succeeded
SENT_NO_RESPONSE != definitive external failure
OUTCOME_UNKNOWN != retry permission
```

## 23.6 Observation

```text
runtime/provider/trace/telemetry observation != owner terminal/verified truth
```

`4C-F34` keeps Project Activity a chronological OBS projection while making it human-operable: each entry carries a projection-time subject label, deterministic summary and an optional exact admitted owner-read target. The target is absent when no truthful detail read exists or is disclosable; when present, the named owner revalidates authority. Activity never becomes generic dispatch, Audit, mutation or current owner state.

## 23.7 Contextual inspectability and progressive disclosure

```text
REAL PRODUCT RESOURCES
→ directly inspectable: Data, Capabilities, Integrations, Agents, Brain binding/context,
  Versions, Preview, Code/Diff and Activity/Evidence entry

PLATFORM MACHINERY
→ progressive detail: WorkUnit/ActorRun internals, Gateway/Registry/CAS mechanics,
  Mastra/E2B refs, owner rows and technical digests unless material
```

`Ask Conexus about this` may pass the selected resource/context to the contextual assistant under current server-derived authorization. It grants no new authority, hidden capability or cross-Project access.

---

# 24. Authorization/security Product laws

1. One Account may participate in multiple Workspaces; authority never crosses automatically.
2. Workspace is deny-by-default isolation root.
3. Same Workspace does not imply Project/Brain/Connection/Agent use.
4. Control Plane, Preview and Published App authorization are independent.
5. Project admin does not become app user/admin automatically.
6. Published App user does not gain Project/Builder authority.
7. Managing access does not imply exercising all business capabilities.
8. Client/browser/model-provided IDs/roles/approval state never create authority.
9. Current mutable authority is rechecked server-side at protected control points.
10. Runtime/provider identity is not a Conexus principal.
11. Durable privileged credentials stay with trusted owners.
12. Attachment/blob access is private by default and follows owning Product authority.
13. `TRUSTED_BOOTSTRAP_CONTEXT` is the sole pre-Account human principal: it is bound to one server-preconfigured OIDC subject, may self-provision only that Account through IAM-03 and becomes invalid immediately after Account establishment.

Current F1 Published App role set remains `{admin, member}` until a later material decision explicitly changes it.

Published-App access administration operates only over existing Conexus Accounts. Human candidate discovery and grant presentation use I&A-owned `AccountSummary`; they do not query the Keycloak directory from the browser, admit an Account or prove whether a provider identity exists. Account admission remains the separate trusted provisioning boundary. Before assignment, the administration read exposes each exact role's complete current active-Release capability subset from `Ops(R)`; this is decision truth, not a second role engine or client-derived authorization.

Published-App access context also carries the canonical current `AccountSummary` needed for session recognition. `EndSession` has one I&A-owned meaning across Control Plane and Published Application: end the exact opaque Conexus session. Ending the Conexus session does not claim global Keycloak SSO logout and does not make provider token/profile/role data Product authority.

For Product Agent construction, `project.build` admits purpose-bound human discovery of exact Project capabilities, Project-bound Brain authoring references and Project-owned model-policy summaries. This discovery grants no capability invocation, business data, generic Project/source/Brain read, provider/model selection, credentials or runtime authority. In minimal F1, optional general/approval/budget/verification references are empty for NEW definitions and preserved but not freely editable for EXISTING definitions until their semantic owners are admitted.

---

# 25. F1 / CURRENT Product scope

F1 target Product scope includes, even where technology-specific proof remains pending:

```text
Account/session/current access
Workspace + optional Areas
Project lifecycle + Inception/Baseline
Change + proportional visual Plan/checklist
agent-first Build workspace
Platform Consultant/contextual Conexus assistance
Preview / Code / Diff / Plan / progress inspectability
Data inspectability
Query / Action Capabilities
Brain Discovery + Brain publication/binding/feedback
AnalyticQuery second read regime
Artifact Registry / exact Release
Connections + explicit Project bindings
Capability Gateway / governed external effects
Product Agent authoring/management/use
Workspace access-filtered Agent catalog
Conversation / AgentRun / exact ApprovalRequest
manual/SCHEDULE Product Agent invocation
Managed Application Runtime for admitted jobs/sync
Versions / Promotion / rollback / served verification
Activity / Findings / Evidence / cost-tokens-duration transparency
Published App serving + independent app access
private attachment/storage capability where Product needs bytes
Project duplication with no-data default
first-installation backup/restore/emergency-stop correctness
first vertical Budget Analyzer
model-spend truth/enforcement obligations
Golden benchmark + Builder quality evaluation obligations
honest data/verification/operational presentation
```

F1 Product scope does not mean the first Budget Analyzer must instantiate every capability.

---

# 26. NEXT / admitted Product directions

## 26.1 SaaS opening

Accepted direction, not current F1 implementation. When selected, decide onboarding/billing/customer operations/isolation and private/on-prem source reachability from real topology.

## 26.2 Product Agent expansion

Product Agent is already F1. Broader use in purchasing/pricing/CRM/sales/operations occurs through named Projects, not generic fleet expansion.

## 26.3 Brain incremental growth

Broader company domains/namespaces grow from actual Project discovery and publication, not prebuilt ontology completeness.

---

# 27. FUTURE / DEFERRED capability seams

| Future capability | Reopen seam/trigger |
|---|---|
| SaaS signup/billing/customer operations | Phase-2 Product program selected |
| SaaS→private/on-prem reachability | SaaS installation + real private enterprise target |
| multi-repo Project | real Project requiring independently evolving repos |
| cross-Workspace Brain/Connection/package exchange | named consumer + consent/provenance/policy |
| DEDICATED physical deployment | first real DEDICATED consumer |
| stronger HA/PITR/multi-host | measured RPO/RTO/availability need |
| external SLA monitoring/paging | real SLA/on-call consumer |
| Product Agent Working/Agent Memory | named consumer + eval |
| Semantic Recall | measured consumer/eval benefit |
| Product Agent Observational Memory | measured consumer/eval; Builder result does not auto-enable it |
| Memory Extractors | named durable consumer/authority-safe workflow |
| Durable Agent reconnect-to-same-stream | real UX requiring reattachment to in-flight stream |
| EVENT triggers | real event source/consumer/failure contract |
| Agent-as-tool/subagents/networks | named Product composition + isolation/effect proof |
| MCP/A2A/external Agent clients | real client over existing owner API/capabilities |
| Product Agent browser/source/workspace access | named Agent need + security/qualification |
| Connection pools/failover | measured availability/throughput need |
| external Vault/KMS/HSM/per-secret DEK | compliance/host-compromise/selective-rekey need |
| SSO/SCIM/passkeys | enterprise/customer requirement |
| public/embed audience | named public/external Published App consumer |
| richer app roles/data scope | real business audience beyond current closed set |
| Brain vector/RAG index | deterministic selection no longer satisfies measured retrieval need |
| broader clone/export/import | named portability/copy workflow |

Deferred = not now, not never.

---

# 28. REJECTED / SUPERSEDED F1 inheritance

```text
Pi as primary Builder runtime
guest model-provider key
fresh cognitive reset every WorkUnit
Vercel AI SDK Product Agent loop as current authority
Mastra Stored/Editor/latest Agent authority
Mission/Milestone/Fleet work model
generic workflow engine
generic scheduler/automation business domain
arbitrary privileged Project job code
universal ResourceBinding/Tool/Status/Envelope
shared mutable cross-Project DB/runtime state
memory/RAG framework as Brain authority
browser/frontend authorization authority
URL-fragment auth token as current Published App contract
mandatory universal chat widget/postMessage state machine
Product Agent repo/shell/browser/raw-network access by default
public Internet ingress first installation
Product Agent added artificially to Budget Analyzer
one analytical mirror strategy forced on every Project
Workspace Agent catalog as fleet owner
formal security deferred because “F1 is internal”
```

---

# 29. Product invariants

1. Workspace is sovereign isolation root; shared Account identity never transfers authority.
2. Project owns one coherent Product/software lifecycle; technical layers do not automatically split Projects.
3. Material Project intent is pinned by approved Baseline.
4. Change describes what must become true; WorkUnit/ActorRun do not replace Change authority.
5. Plan/current checklist state is Hub-owned; model narration cannot close work.
6. `tasks.md` preserves purpose/context but never operational status authority.
7. Mechanism/framework/storage/provider never gains Product authority by convenience.
8. Project Git != Hub control truth != Project DB != Registry/CAS serving output.
9. Workspace Brain and every Workspace- or Project-scoped Connection are used by a Project only through explicit typed exact-revision bindings; cross-Workspace use is denied.
10. Direct mutable cross-Project data/runtime reach is denied.
11. Brain is published business meaning, not memory/RAG/Project implementation.
12. Brain Discovery proposals remain hypotheses until human-reviewed publication.
13. New Brain revision never live-inherits into an active Project.
14. AnalyticQuery uses semantic IDs/restricted plan, never free runtime LLM SQL/join topology.
15. Durable privileged credentials never become browser/chat/Project/Agent guest data.
16. Gateway owns governed external-effect replay/credential last-mile.
17. Human approval binds exact sealed subject only.
18. Current mutable authorization is rechecked at real control point.
19. Control Plane, Preview and Published App authority remain separate.
20. Administer != business use.
21. Product Agent authoring modes converge to one Change/candidate/Release authority.
22. Product Agent tools come from exact Release-derived bounded projection.
23. Product Agent is product/context-aware, not host/source-aware by default.
24. Release runtime composition is exact/immutable; no mutable latest.
25. Build/Preview/AVAILABLE/pointer-swapped never masquerade as SERVED_VERIFIED.
26. Runtime/provider/telemetry observations never manufacture owner terminal truth.
27. Missing/partial/ambiguous usage/cost/data/effect outcome never becomes zero/success.
28. Derived read model never proves its own completeness/correctness.
29. Project duplication never silently copies DB/credentials/Connection bindings; data default = no copy.
30. Attachments/storage are private by default and owner-authorized.
31. First vertical composition does not become universal ERP/data-path doctrine.
32. Future capability preserves seam/trigger without empty F1 machinery.
33. Selected architecture != qualified behavior.
34. Honest empty/unsupported Product state is preferred to fake completeness.
35. Project Archive freezes future intent; it neither unpublishes nor silently stops current serving/automations.
36. Product-Agent skipped schedule slots never borrow MAR managed-sync catch-up semantics.
37. Brain health/current effective slice is rechecked before dependent final response/effect/approval.
38. Ordinary telemetry degradation, audit-required failure and verification-required missing Evidence remain distinct.
39. Working, blocked, waiting-for-user and completed are distinct Product truths.
40. A next candidate never silently destroys the last-good inspectable Preview.

---

# 30. Whole-Product scenario gate

| Scenario | Required truth |
|---|---|
| Account in two Workspaces | identity can be shared; authority/resources do not cross |
| Workspace member lacks Project grant | Project remains undiscoverable/unusable under current access rules |
| Create greenfield Project | Discovery → Baseline candidate → approval → initial Change |
| Import brownfield | current code/contracts/data reality discovered before target assumptions |
| Tiny safe Change | lighter route allowed; applicable authority/proof not bypassed |
| Material Change | visual Plan/checkpoint/progress visible and owner-held where required |
| Worker dies mid-plan | current item becomes honest interrupted/recoverable state; prose cannot say done |
| `tasks.md` says done but Hub does not | structured mismatch fails/checks; Hub state wins |
| Material architecture discovery during coding | stop → Finding/Replan/Baseline checkpoint |
| Builder session spans WorkUnits | cognitive continuity okay; ActorRuns stay bounded/auditable |
| physical E2B sandbox dies | no silent cross-incarnation write replay |
| New Brain revision | Project remains pinned until explicit rebind/revalidation/Release |
| Brain Discovery infers relationship | remains provenance-tagged hypothesis until human publication |
| AnalyticQuery asks unsupported cross-dataset join | fail closed; Builder creates approved analytical source/model if needed |
| Project discovers reusable rule | KnowledgeProposal→human Brain review |
| Same Workspace has several Connections | only explicit compatible binding can be used |
| Connection secret rotates compatibly | source/app need not change if logical authority remains compatible |
| Connection unhealthy | honest unavailable/degraded state; no silent fallback |
| Project needs provider operation | provider existence alone does not grant Project/Agent authority |
| Archive Project with active serving/automation | authoring freezes; app remains published and pre-existing automation may continue until explicit owner action |
| Publish candidate | verification/Release/Promotion/serving remain distinct |
| Rollback | new governed Promotion; no automatic business-data rewind |
| Business user can use app but not build | Published App access works independently |
| Project admin manages app access without business role | administer != use |
| Create Agent manually | same Change/diff/proof/Release |
| Create Agent by natural language | same canonical Agent definition; no AI-only authority |
| Agent needs missing Action | scope/effect/permission widening shown before build |
| Agent uses page context | refs/hints only; material fact re-resolved through owners |
| Agent asks unprojected capability | fail closed; no generic execute(anySlug) |
| exact effect needs approval | sealed proposal + current rechecks + Gateway |
| Agent runtime retries | does not create duplicate effect authority |
| provider acceptance ambiguous | OUTCOME_UNKNOWN; no blind replay |
| scheduled Agent after restart | stable occurrence; no fake Conversation history by default |
| scheduled Agent overlaps active trigger run | occurrence consumed SKIPPED; no AgentRun and no backlog/catch-up |
| EVENT has no consumer | absent/deferred, not decorative switch |
| managed sync misses slots | max one catch-up, no backlog replay |
| critical Brain health changes before response/effect | continuation/approval invalidated; context recomposed; no silent use |
| audit-required record cannot persist | operation FAIL CLOSED; ordinary telemetry degradation remains a separate class |
| telemetry says success but owner fact absent | NOT_PROVEN/pending/unknown |
| execution usage unavailable | UI says missing/unknown, never zero cost/tokens by invention |
| dashboard query fails | failure, never successful empty |
| read model partial | coverage visible; derived total not universal total |
| unsupported margin | omit/block/qualify; never fabricate |
| Budget Analyzer has no Agent | Agents can honestly be empty |
| Duplicate Project | copies source/config/declarations; no DB/credential/binding; default no data |
| Blob owner not authorized | storage key possession does not grant read; deny |
| first DEDICATED consumer | reopen physical deployment through seam |
| SaaS needs private ERP | decide authenticated private reachability; no F1 tunnel assumed |

A new Product concept/module/service with no scenario/invariant/named-consumer justification is presumptively YAGNI.

---

# 31. F1 success criterion

F1 is Product-complete when a real operator/company can, under accepted technical/operational proof:

```text
establish Workspace/access
→ create/import Project
→ perform Discovery/Inception
→ approve sufficient Baseline
→ formulate/approve Plan when needed
→ ask Conexus to build/evolve real business software
→ inspect Preview/Code/Diff/Plan/progress/Data/Capabilities/Integrations/Brain/Agents/Versions/Activity
→ see truthful token/cost/duration/provenance/limitations
→ discover/publish/bind reusable Brain meaning with human authority
→ use real external systems through qualified Connections + explicit bindings
→ verify changes against mechanical/runtime/business Evidence
→ create exact Release
→ promote and prove what is actually served
→ let business users use Published App independently from Builder access
→ create/evolve/use Project-owned Product Agents through same Change/Release laws
→ approve exact Agent effects where needed
→ run admitted managed sync/job without workflow platform
→ duplicate a Project without silently copying data/credentials/bindings
→ store/serve Product bytes privately by default
→ restore/recover without fabricating authority
→ reproduce Budget Analyzer with real Sankhya-derived data and honest semantic limitations
```

without requiring open SaaS signup/billing, cross-Workspace sharing, multi-repo, DEDICATED physical deployment, generic workflow engine, advanced memory, EVENT trigger, generic Agent fleet, external Vault/KMS, public/embed runtime, SSO/SCIM or universal plugin/tool/resource frameworks.

---

# 32. Quality/evaluation obligations

The Product/engineering system preserves two separate quality anchors:

## Golden benchmark

Budget Analyzer remains reproducible benchmark: same accepted spec/inputs → compare Conexus output against known benchmark and prior Conexus versions without treating exact visual similarity as sole correctness.

## Conexus Worker Eval

A real-task evaluation suite remains an F1 engineering capability for comparing coding-runtime/model candidates across representative work such as backend feature, migration, React page, complex bug, Sankhya integration and recovery.

It gates a challenger/reconsideration when current primary runtime/model is materially questioned. Historical `Pi × Claude Agent SDK` is not the permanent candidate pair; current comparisons follow current runtime/model authority.

---

# 33. Qualification-state boundary

This Product Contract owns required Product meaning, not mutable phase or technology-qualification status. Current stage/implementation authority lives only in [../roadmap.md](../roadmap.md). The accepted bounded 3L outcomes, exact pins, proven properties, unproven properties and requalification triggers live in [../phases/3l-technology-qualification.md](../phases/3l-technology-qualification.md) and the routed qualification references.

Framework/substrate Evidence may strengthen or falsify a realization claim; it never changes Product meaning by implication.

---

# 34. Reopen triggers

Reopen only the smallest implicated Product/architecture decision on material Evidence such as:

```text
changed Product requirement/ownership
new named consumer current F1 cannot represent
new trust/irreversible/external-effect class
real scale/availability/compliance constraint
provider/framework behavior falsifies load-bearing assumption
implementation proves boundary structurally unworkable
SaaS transition creates concrete onboarding/billing/private-source needs
cross-Workspace or multi-repo requirement becomes real
Product Agent needs advanced memory/browser/source/workspace capability
first real DEDICATED consumer
```

Do not reopen for framework popularity, newer version alone, reviewer preference, hypothetical enterprise feature or mere historical presence.

---

# 35. Authority provenance

Primary derivation:

```text
C-001 Product vision
C-003 Product/F1 requirements
C-011 Brain
C-013 observability/checklist/cost
C-014 lifecycle/duplication
3A-R7/R8/R9/R10 reconciliation
3B System Context
3C-R1 owners
3D-R1 dependencies
3E-R1 data
3F-R1 contracts
3G-R1 state
3H-R1 runtime
3I-R1 security
3J-R1 deployment/operations
3K-01 Project/Build Product model
3K-02 truth laws
3K-03 first vertical
3K-04 Product Agent journey
3K-R1 Product closure
3L-Q0 + 3L-A qualification
R11-A census
R11-B accepted current reconciliation
R11-E Round-1 findings
R11-F Fresh Actor review
R11-G independent Fable review + accepted FBL-01..17 adjudication
```

Detailed accepted homes remain controlling for exact semantic depth and when resolving any projection conflict.

---

# 36. Accepted verdict

```text
North Star / product boundary                     = represented
users/actors                                      = represented
Project/Builder/Plan/checklist                     = represented
Brain/Discovery/AnalyticQuery/feedback             = represented
Connections/Data/Capabilities                      = represented
Release/Published App                              = represented
Product Agent authoring/use/approval               = represented
managed jobs                                       = represented
Project duplication                                = represented
cost/tokens/duration visibility                     = represented
private storage                                    = represented
Platform Consultant                               = represented
first vertical                                     = represented
F1/NEXT/FUTURE/REJECTED                            = separated
Product invariants                                = explicit
whole-product scenario gate                        = present
technology qualification                          = not overstated
new Product authority intentionally invented       = NO
```

**Current next action:** owned only by [../roadmap.md](../roadmap.md). This accepted Product verdict does not authorize a later phase or implementation by inheritance.


# 37. Public ecosystem routes

```text
Public ecosystem domain = conexus.fun
Conexus OS = https://conexus.fun/conexus
Marketplace Central = https://conexus.fun/marketplacecentral
MetalDocs = https://conexus.fun/metaldocs
Routing convention = conexus.fun/<product>
Exact proxy/CDN/ingress realization = DEFERRED TO DEPLOYMENT REALIZATION
```

Marketplace Central and MetalDocs routes are ecosystem decisions, not code-ownership claims for this repository.
