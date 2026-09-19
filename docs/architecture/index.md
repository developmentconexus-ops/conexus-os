# Conexus OS Architecture

This is the current structural overview and qualification-outcome summary. [ROADMAP.md](../roadmap.md) alone owns current phase and implementation status. Detailed owner and boundary semantics live in the linked task references from [INDEX.md](../index.md). Mechanisms remain subordinate to Conexus OS semantic owners.

## 1. Architecture in one sentence

Conexus F1 is a **Node/TypeScript modular-monolith Hub with PostgreSQL-backed authoritative control state**, Project-owned Git/business-data/Release lifecycles, a separate Workspace Brain Git authority, Connections-module-owned Workspace- or Project-scoped Connections, a Hub-owned Capability Gateway for governed data/effects/credential last-mile, a **Mastra coding harness with one persistent Project Thread, replaceable E2B Workspace, Conexus BuilderRun execution settlement, working source and last-good Preview**, a **direct Mastra Agent Production Agent Runtime (PAR)** derived from exact Releases, a bounded Managed Application Runtime for Project apps/jobs, and an agent-first React/TypeScript/Vite/TanStack Product shell; every runtime/provider/storage mechanism remains subordinate to Conexus owner facts, current authorization and exact immutable composition.

---

## 2. Structural laws

```text
one semantic authority per meaning
mechanism != authority
current implementation != target authority by existence
Workspace = sovereign isolation root
Project = independent software/product lifecycle unit
Mastra Thread/Message != BuilderRun
BuilderRun != Product AgentRun != Gateway EffectAttempt != Promotion
conversation mechanics != Project/source/artifact authority
Project Git != Workspace Brain Git != Hub control truth != Project business DB != Registry/CAS serving output
Workspace owns the canonical Brain; Connections owns one Connection lifecycle with
ownerScope WORKSPACE | PROJECT; Project use requires explicit exact-revision binding
same Workspace != implicit resource-use authority
same bytes/digest != same semantic identity/authorization
Control Plane != Preview != Published App authorization
administer != use
current mutable authorization is server-derived and rechecked at protected control points
runtime/provider/trace/telemetry identity != Conexus authority/principal
Gateway = business/application effect + credential-last-mile/replay authority
approval binds one exact sealed subject and never widens it
unknown/missing/partial != zero/success
OUTCOME_UNKNOWN never grants blind automatic replay
Release/composition is immutable and never resolved by mutable latest
AVAILABLE != PROMOTED != SERVED_VERIFIED
telemetry/observation != owner F5/terminal truth
Brain != agent/runtime memory
future seam != dormant implementation
selected/current architecture != qualified behavior
review finding != requirement authority
recovery meaning remains owner-local; no generic Recovery owner/FSM exists
same-execution continuation requires positive owner-specific basis
normal restart != disaster restore
recovery posture is deny-only and never grants Product authority
missing after restore != never happened
Gateway unresolved effect truth fences replay and duplicate new admission within validated scope
```

Recovery uses the existing owners rather than a sixth cross-cutting lifecycle. Runtime/queue/snapshot/process state can help detect and execute recovery mechanics but never decides semantic continuation, replay or current authority. Exact recovery behavior lives in the owning references.

---

## 3. Logical whole-system topology

```text
                         ┌──────────────────────────────┐
                         │      Browser / Client        │
                         │ Control Plane / Preview / App│
                         └──────────────┬───────────────┘
                                        │
                             authenticated / typed
                                        │
                                        ▼
┌────────────────────────────────────────────────────────────────────┐
│                     CONEXUS HUB — Node / TS                         │
│                        modular monolith                             │
│                                                                    │
│ Identity & Access      Workspace               Project              │
│        │                   │                      │                 │
│        ├──────────── current authority ──────────┤                 │
│        │                   │                      │                 │
│ Builder              Artifact Registry         Release              │
│    │                       │                      │                 │
│ Connections ───── Capability Gateway ───────── external I/O         │
│    │                                                              │
│ Brain                Observability & Audit                         │
│                                                                    │
│ Production Agent Runtime          Managed Application Runtime       │
└───────────────┬──────────────────────────────┬─────────────────────┘
                │                              │
                │ control-side                 │ exact active Release
                ▼                              ▼
       ┌────────────────────┐          ┌──────────────────────┐
       │ BuilderMastra      │          │ Published Apps /     │
       │ AgentController    │          │ managed job runtime  │
       │ Project Thread     │          └──────────────────────┘
       │ Session / Workspace│
       └─────────┬──────────┘
                 │
                 ▼
          ┌─────────────┐
          │ E2B sandbox │
          │ guest/root  │
          └─────────────┘

Product Agent control-side path:

exact active Release
→ RuntimeAgentProjection
→ ParMastra role instance
→ direct Mastra Agent
→ bounded ToolProjection
→ Conexus owners / Gateway
```

The diagram is logical. A module box does not imply a separate service/process/database. Physical first-production placement is defined later.

---

## 4. Semantic owner/module architecture

F1 is a modular monolith with explicit semantic owners:

| Owner/module | Owns | Explicitly does not own |
|---|---|---|
| **Identity & Access** | Account identity/auth/session, memberships, grants, role assignments, effective surface access context | domain preconditions, external effects, Release eligibility, business-data truth |
| **Workspace** | Workspace, Area, organizational structure/lifecycle | Account identity, Project internals, Brain semantic content, Connection credentials |
| **Project** | Project identity/lifecycle, Project Baseline, explicit Brain/Connection binding intent, Project-level composition intent | Workspace resources themselves, runtime implementation, external effect authority |
| **Builder** | BuilderRun execution settlement, Project working-source coordination, source/result custody coordination, Builder/Preview orchestration | Mastra conversation history/mechanics, Project business meaning, Registry bytes, Release authority, PAR runtime truth |
| **Artifact Registry** | immutable compiled ArtifactRevision identity/digest/payload/availability | authored Git truth, active serving, business meaning of each artifact kind |
| **Connections** | one Connection logical lifecycle with `ownerScope = WORKSPACE \| PROJECT`, qualification/current logical credential relationship | plaintext/ciphertext secret-byte ownership, external effect execution, cross-Workspace use |
| **Capability Gateway** | governed Query/Action/Integration execution, effect admission/replay/idempotency, credential last-mile, execution receipts | Project/Brain meaning, Account identity, Product Agent lifecycle, model-spend authority |
| **Brain** | Workspace `SEMANTIC \| KNOWLEDGE \| EVIDENCE_SPEC` meaning, validation/compilation/publication, Discovery proposal semantics, KnowledgeProposal, health/conformance | actual Builder/verification Evidence, RAG/index, agent memory, Project DB, telemetry, security policy |
| **Production Agent Runtime (PAR)** | Conversation, Product AgentRun, ApprovalRequest, AgentTrigger runtime semantics, exact-projection execution/terminal owner facts | Agent authored source/Release authority, Gateway effect replay, I&A authority |
| **Release** | exact immutable Project composition, Release/Promotion/current serving authority | authored source, mutable framework state, Project business data |
| **Observability & Audit** | authorized audit facts and operational observations/provenance projections | business-state reconstruction from logs, authorization, owner F5 terminal truth |
| **Attachments & Blob** | shared byte/storage mechanics and attachment semantics where owner contracts admit them | semantic identity/authorization of every owner referencing the bytes |
| **Managed Application Runtime (MAR)** | managed app serving mechanics and admitted job occurrences | Product business meaning, scheduler business authority, arbitrary privileged Project code |

No generic `Workflow`, `Tool`, `ResourceBinding`, `Secret`, `Budget`, `Status`, `Runtime`, `EvidenceGraph`, `Automation` or `Recovery` business owner exists simply for uniformity.

## 4.1 Closed dependency architecture

The modular-monolith import graph is acyclic. Narrow direct in-process calls are the default; a module or runtime may not call L7, and L7 is not a universal mediator.

The closed F1 L7 control-plane orchestration set contains exactly six flows:

```text
CreateProject
SetProjectBinding
QualifyConnection
BrainHealthProbe
ComposeRelease
PromoteRelease
```

There is exactly one domain dependency inversion: Gateway defines the narrow approval-claim capability, PAR owns `ApprovalRequest` and implements that capability, and the composition root wires it. The 3D infrastructure boundaries are exactly `CodingRuntime`, `CredentialBackend`, `BlobStore/CAS` and `GitInfra`.

The later 3A-R9 `MANAGED_JOB` addition is a Gateway caller-surface amendment, not an eighth L7 orchestration flow. Disaster-recovery posture is deny-only infrastructure; if realization ever needs a composite Hub-side activation flow, that is an explicit L7 Decision Loop amendment rather than implied recovery plumbing.

---

## 39. Technology-state matrix

Labels are deliberately distinct:

```text
ARCHITECTURE CURRENT
SELECTED / NOT YET QUALIFIED
QUALIFIED
QUALIFIED WITH REQUIRED GUARD
EVALUATED / KEEP OFF
CANDIDATE
DEFERRED
REJECTED F1
```

| Surface | Current state | Notes |
|---|---|---|
| Hub | **ARCHITECTURE CURRENT** — Node/TS modular monolith | exact implementation packages derived later |
| PostgreSQL | **ARCHITECTURE CURRENT** — major 17 | Q0 tested exact 17.10 |
| Builder Mastra | **QUALIFIED for Package-A tested properties** | persistent/current-dispatch properties only as tested |
| E2B | **QUALIFIED WITH REQUIRED PHYSICAL-INCARNATION GUARD** | guard mandatory in Product realization |
| native Codex OAuth | **QUALIFIED for Package-A tested path** | not universal model/provider winner |
| Builder Observational Memory | **EVALUATED / KEEP OFF** | net benefit not proven; no stale-authority regression observed |
| direct Mastra Product Agent | **QUALIFIED FOR CURRENT F1 TESTED PROPERTIES / PACKAGE B CLOSED** | BT-1 and BT-2 passed; BT-3 characterized continuation behavior; BT-3A rejected the native schema hypothesis; BT-3N and BT-4N passed lead adjudication; BT-5N is `QUALIFIED_SAME_PROCESS` for enabled F1 surfaces |
| BuilderMastra != ParMastra same-process isolation | **QUALIFIED_SAME_PROCESS FOR ENABLED F1 SURFACES** | process split remains a future trigger for a reachable enabled-global bleed |
| Conversation history baseline | **ARCHITECTURE CURRENT** | advanced memory gated |
| bounded F1 model execution/economics | **ARCHITECTURE CURRENT / PACKAGE C DEFER SAFELY** | finite server limits and truthful usage/cost visibility remain; advanced hard monetary enforcement is deferred by 3L-R1 |
| managed sync/job semantics | **CLOSED / LEAD-ADJUDICATED / QUALIFIED_TRANSACTIONAL_MANAGED_OCCURRENCE_ADMISSION** | only the tested transactional-admission subset is technology-qualified; recovery semantics for the real governed-sync consumer are now architecture-current and downstream implementation proof remains first-build + 3N/3O |
| pg-boss 12.26.3 | **QUALIFIED FOR TESTED TRANSACTIONAL-ADMISSION MECHANICS / PRIVATE MAR SUBSTRATE / NOT AUTHORITY** | one-catch-up/no-N-slots law remains the Product owner-side law and first-build reconciliation conformance, not a remaining pg-boss cron probe |
| deciding F5/observability surfaces | **DEFER SAFELY / NO PRE-C-018 RUNTIME PROBE** | telemetry-never-authority remains architectural; Package E has no pre-C-018 runtime probe |
| React/TS/Vite/TanStack paved road | **ARCHITECTURE CURRENT** | first-build scaffold conformance pending |
| Brain semantic architecture | **ARCHITECTURE CURRENT** | implementation-dependent Discovery/feedback/conformance probes downstream |
| first-production Linux guest/private ingress | **ARCHITECTURE CURRENT FOR FIRST INSTALLATION** | 3M recovery contract current; activation/restore/security proof remains first-production work |

---

## 40. Q0 exact qualification identity currently carried

Latest-stable Package-A deciding identity:

```text
Node              = 24.18.0 probe pin
@mastra/code-sdk  = 1.1.2
@mastra/core      = 1.56.0
@mastra/memory    = 1.25.0
@mastra/pg        = 1.19.0
@mastra/e2b       = 0.8.0
e2b SDK           = 2.40.0
PostgreSQL        = 17.10 probe pin
package-lock SHA-256
= 7f61c6c74ad92b23abd0fb44353bc63f444ab01dd3b62d23cec7d7de4b1051d5
```

These are deciding Evidence identities, not a `latest` policy. Version drift requires explicit repin and affected-criteria requalification.

Known malicious Mastra package families/versions remain denied under Q0/C-016 supply-chain admission.

---

## 41. Remaining 3L qualification route

R11 is closed; the remaining 3L route preserves serial proof dependency.

Current route:

```text
Package B closure projected from the lead-adjudicated BT-5N Evidence
↓
Package B — Product Agent + Cross-Runtime — CLOSED / LEAD-ADJUDICATED / QUALIFIED FOR CURRENT F1 TESTED PROPERTIES
  B0 EXECUTION COMPLETE / LEAD-ADJUDICATED / PASS
  BT-1 PASS / BT-2 PASS
  BT-3 FRAMEWORK BEHAVIOR CHARACTERIZED
  BT-3A COMPLETE / NATIVE SCHEMA HYPOTHESIS REJECTED
  BT-3N PASS / LEAD-ADJUDICATED / PASS_NATIVE_HITL_OWNER_BOUNDARY
  BT-4N PASS / LEAD-ADJUDICATED / PASS_NATIVE_SCHEDULE_INGRESS
  BT-5N PASS / LEAD-ADJUDICATED / QUALIFIED_SAME_PROCESS
  B1-01..B4-18 PRESERVED DOWNSTREAM PROOF INVENTORY / NOT LITERAL PRE-C-018 EXECUTION
  CX-AGENT-MASTRA-01 = QUALIFIED FOR CURRENT F1 TESTED PROPERTIES
  CX-RUNTIME-ISOLATION-01 = QUALIFIED_SAME_PROCESS FOR ENABLED F1 SURFACES
Package C — DEFER SAFELY / NOT EXECUTED
Package D — Managed Execution
  CLOSED / LEAD-ADJUDICATED / QUALIFIED_TRANSACTIONAL_MANAGED_OCCURRENCE_ADMISSION
  CX-MANAGED-JOB-01 = QUALIFIED FOR CURRENT F1 TESTED TRANSACTIONAL-ADMISSION SUBSET = DOWNSTREAM REMAINDER PRESERVED
↓ adjudicate
Package E — Deciding Evidence
  DEFER SAFELY / NO PRE-C-018 RUNTIME PROBE
↓ adjudicate + completeness/deletion check
3L-R3 final closure = CURRENT / FABLE INCORPORATED
↓
3L qualification closure is recorded in [phases/3l-technology-qualification.md](../phases/3l-technology-qualification.md).
Current phase status is owned only by [roadmap.md](../roadmap.md).
```

The current Package-D admission is bounded to the tested transactional-admission subset. Its Product recovery semantics are now closed by the owner references; downstream realization/proof remains FIRST-BUILD + 3N/3O. Package E remains safely deferred with no pre-C-018 runtime probe.

---

## 42. Downstream proof families not pulled artificially into 3L

Some architecture properties require the first real Product slice to instantiate the mechanism. They remain mandatory first-build conformance, not fake architecture-only tests.

Examples:

```text
Brain Discovery/feedback/conformance/health
scaffold/codegen/frontend contract/security invariants
Builder UX progressive disclosure / platform machinery not primary workflow
Observability/audit/redaction/GC Product paths
Release/Promotion/EnvironmentConformance/serving
Published App authorization/session/browser security
private attachment/blob authorization
supply-chain/dependency admission
Connection/Gateway effect/egress
first-production restore/emergency-stop/activation
first vertical live-source/read-model reconciliation
Golden benchmark / Worker Eval integration into engineering system
```

Builder UX proof must falsify the Product becoming an infrastructure console: WorkUnit/ActorRun/Gateway/CAS/Mastra/E2B machinery remains progressively inspectable when material, but it must not become the required primary workflow for expressing and inspecting ordinary Product intent.

Named proof routing remains explicit:

```text
CX-BUILDER-MASTRA-01   = Package-A deciding proof / COMPLETE for tested properties
CX-BRAIN-V0-01         = before first Brain-backed deploy
CX-BRAIN-DISCOVERY-01  = before Brain Discovery implementation/activation
CX-BRAIN-FEEDBACK-01   = before Brain feedback implementation/activation
```

The Brain identities are current downstream obligations, not already-qualified results.

A future Realization Plan must compile these into the first slice that can actually falsify the property; it may not delete them because they were not executed in 3L.

---

## 43. Explicit future seams — no dormant machinery

Preserved without implementation now:

```text
SaaS onboarding/billing/customer operations
SaaS↔private/on-prem authenticated reachability
multi-repo Project
cross-Workspace sharing/exchange
DEDICATED physical deployment
stronger HA/PITR/multi-host topology
external SLA monitoring/paging
Product Agent Working/Agent Memory
Semantic Recall
Product Agent Observational Memory
Memory Extractors
Durable Agent reconnect semantics
EVENT triggers
Agent-as-tool/subagents/networks
MCP/A2A/external Agent clients
Product Agent browser/workspace/source access
Connection pools/failover
external Vault/KMS/HSM / per-secret envelope/DEK
SSO/SCIM/passkeys
public/embed Published Apps
richer app roles/data scoping
Brain vector/RAG index
Brain G2 Graph projection for measured traversal/impact/dependency reasoning
Brain G4 Advanced knowledge governance for a real ontology/DMN-BPMN/temporal/formal-rule consumer
broader Project export/import/clone workflows
zero-loss replicated external-effect ledger
effect-capable MANAGED_JOB recovery seam before a real consumer
```

No empty module/table/service/registry/engine exists merely to reserve these futures.

---

## 44. Explicit F1 architecture rejects

```text
microservices/service split by aesthetic preference
Kubernetes/service mesh
shared broad Hub DB login
RLS as universal permission engine
generic SecretService
generic BudgetService/quota engine
generic Workflow/Automation/Scheduler domain
generic RuntimeBus/EventBus/UniversalRuntimeEnvelope
generic Tool registry competing with owners
generic ResourceBinding engine
cross-Project mutable DB/runtime access
Product Agent Stored/Editor/latest authority
memory framework as Brain authority
browser/frontend authorization authority
guest durable/model-provider credentials
public Internet first-installation ingress
multiple production coding runtimes for optionality
forced per-WorkUnit cognitive reset
mandatory tunnel infrastructure before SaaS/private-source consumer
generic Recovery owner/engine or universal recovery FSM
```

---

## 46. Verification invariants carried into 3N / 3O

Future architecture verification/proof must be able to falsify at least the following accepted explicit minimum.

Accepted explicit minimum count = 28.

```text
FIRST_BUILD | Workspace isolation bypass through Project/DB/runtime shortcuts
FIRST_BUILD | coding crossing a materially insufficient Project Baseline
FIRST_BUILD | runtime/session closing Change authority by itself
FIRST_BUILD | Plan/tasks/UI state disagreeing with Hub authority without detection
FIRST_BUILD | E2B cross-incarnation silent write replay
FIRST_BUILD | Brain canonical source accidentally residing in first Project repo
FIRST_BUILD | Brain binding silently following new Brain revision
FIRST_BUILD | Brain Discovery proposal becoming authority without human publish
FIRST_BUILD | AnalyticQuery escaping semantic/SELECT-only boundaries
FIRST_BUILD | caller/model selecting arbitrary Connection/effect destination
FIRST_BUILD | Gateway duplicate/lost-response replay manufacturing second effect
FIRST_BUILD | Gateway unresolved effect bypassed by fresh AgentRun/new admission
FIRST_BUILD | Gateway idempotency/reconciliation scope accepted when deliberately under-declared
FIRST_BUILD | Product Agent losing exact old Release pins across suspension/restart
FIRST_BUILD | Builder/PAR mutable-state leakage
FIRST_BUILD | stale RequestContext authority resurrection
FIRST_BUILD | provider/model execution escaping finite server-derived call/step/retry/fallback bounds
FIRST_BUILD | managed sync replaying all missed slots
FIRST_BUILD | managed sync recovery depending on effect-capable machinery with no current consumer
FIRST_BUILD | telemetry manufacturing F5/terminal truth
FIRST_BUILD | Published App authority collapsing into Control Plane
FIRST_BUILD | Release AVAILABLE/pointer swap masquerading as SERVED_VERIFIED
FIRST_BUILD | migration/EnvironmentConformance drift hidden as success
FIRST_BUILD | storage object key bypassing owner authorization
FIRST_PRODUCTION | restore without positive generation continuity opening normal PROD
FIRST_PRODUCTION | restored stale authority regaining privileged/autonomous/effectful use
FIRST_PRODUCTION | post-cutoff canonical Git silently discarded or promoted to current Hub authority
3O_CONTRACT→FIRST_BUILD | first vertical read model proving itself / unsupported KPI fabricated
```

The 28 lines above are an explicit minimum, not an exhaustive proof inventory. Section 42 remains independently load-bearing and must be routed into the first applicable real slice.

`FIRST_BUILD` means the first authorized real Product implementation that actually instantiates the relevant owner/boundary. `FIRST_PRODUCTION` requires the real first-installation topology. `3O_CONTRACT→FIRST_BUILD` means 3O owns only the vertical proof contract; the first authorized real vertical build executes that contract and can falsify the behavior.

No pre-C-018 architecture fixture may claim these implementation/production properties by imitating Product code.

---

## 47. Reopen triggers by family

| Family | Material reopen trigger examples |
|---|---|
| Hub modular monolith | real isolation/scale/availability constraint impossible within current boundaries |
| Builder Mastra | qualification/implementation proves structural authority/correctness failure behind narrow runtime seam |
| E2B | provider no longer satisfies required physical/network/custody properties or guard becomes insufficient |
| same-process Builder/PAR | Package B proves enabled F1 global mutable state cannot be partitioned/fenced |
| Product Agent direct Mastra | B proves direct Agent cannot preserve exact pins/suspension/approval/Gateway safety |
| PostgreSQL 17 | support/security/feature requirement or implementation Evidence invalidates current major |
| owner-scoped DB capability | accepted cross-owner atomicity/ops requirement cannot be expressed without violating negative property |
| Gateway | new effect/integration class cannot preserve current owner/effect/credential/recovery boundary |
| Brain | independent lifecycle/trust/scale consumer proves one Workspace Brain insufficient |
| Release | real consumer needs composition/version/cutover/recovery semantics current model cannot represent |
| MAR/jobs | first real effect-capable MANAGED_JOB or deterministic workflow needs semantics beyond managed-sync seam |
| first-production topology | company server unsuitable; RPO/RTO/public/compliance/DEDICATED consumer demands new placement, or positive generation continuity cannot be realized without new semantic state |
| Published App access | real role/audience/data-scope needs exceed closed F1 role model |
| Product Agent memory/tools | named Product Agent needs advanced memory/browser/source/workspace capability with acceptable proof |
| SaaS private reachability | SaaS deployment + real private/on-prem enterprise target |
| scaffold/frontend | real Product need cannot be expressed without breaking current Generated/Platform/App ownership seam |

Framework popularity, newer package version or hypothetical scale alone is not material Evidence.

---

## 48. R11-D Round-1 correction completeness

```text
Project Git vs Workspace Brain Git separated             = YES
Plan/checklist/tasks.md architecture restored            = YES
current Git branch/result model restored                 = YES
Release composition/state/CAS/serving restored           = YES
environment/config/migration detail restored              = YES
Project duplication semantics represented                = YES
Brain Discovery represented                              = YES
AnalyticQuery represented                                = YES
Brain health/context-budget semantics represented        = YES
cost/tokens/duration observability represented           = YES
private storage property represented                     = YES
Worker Eval / Golden benchmark represented               = YES
scaffold ownership/conformance represented               = YES
SaaS↔private reachability seam represented               = YES
six trust zones preserved                                = YES
qualification strengths preserved                        = YES
new semantic owner/module/DB/workflow introduced         = NO
```

---

## 49. Authority provenance

Primary derivation:

```text
C-003 Product/F1 requirements
C-005 Artifact Registry
C-006 data
C-007 integrations
C-008 sandbox
C-011 Brain
C-012 scaffold/frontend
C-013 observability/checklist/cost
C-014 Release/lifecycle/duplication
C-015 Published App access
C-016 security
C-017 engineering model
3A-R5..R10
3B-01..17
3C-R1
3D-R1
3E-R1
3F-R1
3G-R1
3H-01..03 + 3H-R1
3I-01..05 + 3I-R1
3J-01..03 + 3J-R1
3K-01..04 + 3K-R1
3L-Q0 + 3L-A
3M failure/recovery closure
R11-A census/completion
R11-B accepted current Decision Reconciliation
R11-C accepted current Product Contract
R11-E Round-1 coherence findings
R11-F Fresh Actor review
R11-G independent Fable review + accepted FBL-01..17 adjudication
```

Detailed accepted homes remain controlling for exact semantic depth and when resolving any projection conflict.

---

## 50. Current handoff

> **3L is CLOSED by 3L-R3. Package B is CLOSED / LEAD-ADJUDICATED / QUALIFIED FOR CURRENT F1 TESTED PROPERTIES. Package C and Package E remain DEFER SAFELY / NOT EXECUTED; Package D is CLOSED / LEAD-ADJUDICATED for the current F1 tested transactional-admission subset. CX-MANAGED-JOB-01 preserves its downstream realization/proof remainder for FIRST-BUILD + 3N/3O. Failure/recovery semantics are projected into the owning references without a generic Recovery owner. [roadmap.md](../roadmap.md) alone owns current phase and implementation status. Do not execute another probe or start a later phase by inheritance.**

Historical pre-execution route, superseded by the executor record above: `BT-5N = NEXT / EXECUTION AUTHORIZED`.

Historical pre-3L-R2 route, superseded by the current 3L-R2 + 3L-D + 3L-R3 projection: `Packages D/E = NOT EXECUTED / REQUIRE PROPORTIONAL REDERIVATION`.
