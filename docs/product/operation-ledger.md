# Conexus OS — Product Operation Ledger

> **Status:** CURRENT / OPERATOR RATIFIED / bounded corrections accepted through `4C-PRE11-F05`
> **Authority:** derived only from current accepted Product/architecture authority routed by `docs/index.md`, the 4A contract, the operator-approved first Budget Analyzer semantic contract and the operator-approved bounded downstream corrections named above.
> **Mutable program status:** owned only by `docs/roadmap.md`.

This ledger is the canonical 4A Product-operation authority. It is intentionally **not** HTTP/OpenAPI, frontend, database, SDK or runtime design and it does not authorize Product implementation.

The retained ledger records the broader platform design; the current Product census below is the supported internal MVP surface:

```text
current fixed Product operations = 34
Project-defined operations        = exact finite Ops(R) admitted by the grammar in §4
first Budget Analyzer operations  = 2
ordinary Conexus Permissions      = 25 (owned by permission-contract.md)
```

The number is derived from the §5 table and nothing else, and `scripts/check-wire-bijection.mjs`
reads the same table and requires the current Product OAS to hold exactly the same set. That
gate is `wire-bijection` in the candidate graph and it reports 34 fixed Product operations,
0 missing, 0 extra and 0 duplicate.

The count was 39 until 2026-09-19, when Project Inception and Baseline left the product and
their five operations were removed from the §5 table and the Product OAS together. It had been
stated as 31 until 2026-09-18 while that table held 39 rows; that was staleness, not a
different definition.

The numbers are derivation results, not targets. The original 4A candidate survived independent Fable challenge and explicit operator ratification. The accepted bounded findings through F38 remain preserved. The pre-P11 coherence review then admits one transient `TRUSTED_BOOTSTRAP_CONTEXT` principal for first Account self-provisioning and adds one Project-owned model-policy discovery read, `PRJ-29`, while ordinary Permissions remain 25. No new semantic owner or durable record class is added.

`PRJ-29` is an open contradiction, recorded here rather than resolved. The sentence above says
it was added, and it is absent from both the §5 table and the current Product OAS. The
bijection gate would refuse it in one and not the other, so the two are consistent with each
other and inconsistent with this sentence. Whether `PRJ-29` is owed as a current operation or
the sentence is stale is a Product call for its owner, not something this ledger can settle by
editing a number.

Historical F03 and Phase-4 reachability records retain their recorded
platform scope. They are retained evidence and do not expand the current Product OAS.

---

## 1. Surface closure

### 1.1 Current fixed Product census

```text
N_current = 20
current operations with named owner       = 20
current operations with real consumer     = 20
current operations with authority mapping = 20
orphaned current operations                = 0
speculative current operations             = 0
```

### 1.2 Project-defined capability grammar

Every exact Release has a finite exact operation set:

```text
exact Release R
→ exact Ops(R)
→ each operation has one semantic owner
→ exact consumer + principal + ingress + authorization + scope
→ exact read/effect/outcome/current-authority obligations
→ generated/conforming wire only later in 4B
```

There is no global mutable Product authority `execute(anySlug, anyInput)`.

### 1.3 First Budget Analyzer census

The operator-approved first-vertical semantic contract closes:

```text
BUD-01 AnalyzePendingBudgets
BUD-02 ListPendingBudgets
N_budget = 2
```

Both are exact Project-defined registered `Query` operations of the Budget Analyzer Release, not fixed Conexus platform operations.

---

## 2. Principal / actor classes

| Class | Meaning | Authority root |
| --- | --- | --- |
| `HUMAN_ACCOUNT_SESSION` | authenticated human mapped to one Conexus Account and opaque Conexus session | current server-resolved Workspace/Project/owner grants |
| `TRUSTED_BOOTSTRAP_CONTEXT` | transient pre-Account human context after exact pinned OIDC issuer/subject verification | server-preconfigured bootstrap subject; IAM-03 self-provision only; invalid after Account establishment |
| `PUBLISHED_APP_HUMAN` | authenticated human using one exact Published App | current `published_app_access` + exact app role `{admin, member}` + exact active Release |
| `PAR_AGENT_RUN_CONTEXT` | one already-admitted Product AgentRun | exact Release-pinned ToolProjection + PAR/Gateway owner facts; model identity is not principal authority |
| `MAR_JOB_RUN_CONTEXT` | one already-admitted managed JobRun | exact Project/Release/job occurrence + current owner gates; queue identity is not authority |
| `SYSTEM_OWNER_TRANSITION` | owner-internal transition after admitted command/event/proof | no public Permission; current owner facts only |
| `DEDICATED_APPLICATION_PRINCIPAL` | future real DEDICATED service principal | exact `SERVICE_SCOPED` projection only; no concrete F1 operation is admitted without a real consumer |

Explicit non-principals:

```text
Keycloak role/group/organization
Mastra Agent/thread/workflow identity
E2B sandbox/process identity
trace/span/provider request id
storage key/path/url
browser-supplied role/project/release/approval ids
```

---

## 3. Ingress classes

| Code | Product meaning |
| --- | --- |
| `CP` | authenticated Control Plane Product interaction |
| `PA` | exact Published Application human Product interaction |
| `HEADLESS` | explicit Product-Agent headless invocation surface |
| `PAR_TOOL` | exact Product Agent ToolProjection invocation of an admitted Project/Brain operation |
| `MAR_JOB` | exact managed JobRun projection invoking an admitted Project capability |
| `SYSTEM` | owner-internal transition/proof/runtime path; not a public Product operation |

OIDC callback/redirect, provider callback/token refresh, queue delivery/redelivery, model-provider calls, E2B calls, Git transport, Blob/CAS URLs, static-byte transport, owner runtime callbacks, backup/restore and emergency-stop controls are protocols/mechanics/operations control, not Product operations by existence.

---

## 4. Project-defined capability admission grammar

### 4.1 Admitted regimes

| Regime | Meaning | Required closure |
| --- | --- | --- |
| registered `Query` | exact Project-defined read | exact input/output; read-only semantics; named consumer; exact Release/source/binding scope; truthful freshness/outcome; `IC0` |
| registered `Action` | exact Project-defined consequential/business command | exact owner semantics; current authorization/preconditions; at least current-state protection; `IC3` when consequential intake can repeat; `IC4` whenever an external/ambiguous effect can escape |
| Integration Operation | exact provider-aware Project capability where provider-specific meaning is honest | exact Connection/binding/revision/environment; Gateway last mile; declared read/effect scope; effectful operations require `IC4` idempotency/reconciliation semantics |

`AnalyticQuery` is not an arbitrary Project slug. Its Brain-governed platform read regime left the product on 2026-09-19 with Brain, connection bindings and the Sankhya gateway.

### 4.2 Required declaration

A Project-defined operation is inadmissible unless its exact Release authority closes:

```text
semantic identity/name
single Product/Project semantic owner
operation regime
input + output meaning
consumer class
principal + ingress
current authorization route
Workspace/Project/Published-App scope
required Brain/Connection/environment/revision pins
read/effect class
knowledge/freshness/outcome semantics
idempotency/reconciliation where consequential
concurrency/current-state requirements
proof + deterministic negative control
```

### 4.3 Forbidden authority

```text
execute(anySlug, anyInput)
execute(anySql)
execute(anyProviderOperation)
caller-selected Connection
a caller-selected target URL
mutable-latest Query/Action/Agent
unregistered runtime tool creation
```

Internal dispatch by identifier is only mechanism **after** exact Release admission.

A Project operation is not automatically a Product-Agent tool. PAR may expose it only when the exact Release + Agent ToolProjection admits that exact operation. A managed `job/v1` is likewise not a fourth generic business-operation regime; its work can invoke only exact governed Project/Gateway capabilities.

Attachments/private bytes are carrier properties of exact owning operations, never a global File Manager (`GetBlob(storageKey)` / `UploadAnyFile` are rejected).

---

# 5. Current fixed Product census

This is the current Product authority for the supported internal MVP. It is the durable operation-level census: each row names the current semantic owner and the real consumer/authority root. Retained operations below are preserved for future surfaces and are not current Product authority.

| ID | Operation | Owner | Consumer / authority root | Class |
| --- | --- | --- | --- | --- |
| `IAM-01` | `GetControlPlaneAccessContext` | I&A | Control Plane shell; server-resolved Account + Workspace/Project context | read |
| `IAM-02` | `EndSession` | I&A | authenticated human through the current Conexus session | command |
| `IAM-03` | `ProvisionAccount` | I&A | first account for the configured bootstrap identity, or an invited verified email | command |
| `IAM-04` | `ListWorkspaceMembers` | I&A | current Workspace roster: members and pending invitations in one projection | read |
| `IAM-05` | `InviteWorkspaceMember` | I&A | exact Workspace + verified email the invited person must sign in with; the pair is the natural key | command |
| `IAM-06` | `RemoveWorkspaceRosterEntry` | I&A | exact Workspace roster entry; narrowing, and removing a member withdraws every derived right | narrowing command |
| `IAM-10` | `SetWorkspaceMemberRole` | I&A | exact Workspace membership; the last owner cannot be demoted | command/current-authority |
| `WS-01` | `CreateWorkspace` | Workspace | any authenticated Account; the creator becomes its owner | command |
| `WS-02` | `GetWorkspace` | Workspace | current Workspace disclosure flow | read |
| `PRJ-01` | `ListProjects` | Project | current Workspace Projects selection flow | read |
| `PRJ-03` | `CreateProject` | Project / accepted L7 composition | current Project creation flow; atomically establishes source and initial access | command |
| `PRJ-02` | `GetProject` | Project | current Project disclosure/open flow | read |
| `BLD-08` | `ListProjectSourceTree` | Project Git via Builder | authorized Project + exact immutable source revision | read |
| `BLD-09` | `GetProjectSourceFile` | Project Git via Builder | authorized Project + exact immutable source revision/path | read |
| `BLD-23` | `GetBuilderSession` | Builder projection + Mastra conversation | authorized Project + persisted Project Thread and latest BuilderRun/Preview projection | read |
| `BLD-24` | `SendBuilderMessage` | Builder | authorized Project + server-resolved current source and Project Thread | command |
| `BLD-25` | `CancelBuilderRun` | Builder | authorized Project + exact BuilderRun; repeated requests remain idempotent | command |
| `BLD-26` | `GetBuilderRunTrace` | Builder | authorized Project + exact BuilderRun; safe native trace projection only | read |
| `CLA-01` | `ListClaudeConnections` | Claude Account | current Account's Claude connection disclosure; safe metadata only | read |
| `CLA-02` | `StartClaudeAuthorization` | Claude Account | current authorization start against the server-pinned Anthropic flow | command |
| `CLA-03` | `CompleteClaudeAuthorization` | Claude Account | exact provider code and state result; server resolves the authorized subject | command |
| `CLA-04` | `SelectClaudeConnection` | Claude Account | exact connection preference for future BuilderRuns | command |
| `CLA-05` | `ShareClaudeConnection` | Claude Account | exact Workspace the sharing Account belongs to; every member may then use it | command |
| `CLA-07` | `UnshareClaudeConnection` | Claude Account | exact Workspace share, withdrawn by the connection owner or a Workspace member manager | command |
| `CLA-06` | `RevokeClaudeConnection` | Claude Account | exact owner-scope connection revocation | command |

# 5A. Broader retained historical/platform ledger

The tables below preserve the broader historical/platform ledger for context. They may repeat IDs from section 5 alongside retained operations; those repetitions do not assign current or non-current status. Only section 5 grants CURRENT Product authority.

## 5.1 Identity & Access — 15

| ID | Operation | Owner | Consumer / authority root | Class |
| --- | --- | --- | --- | --- |
| `IAM-01` | `GetControlPlaneAccessContext` | I&A | Control Plane shell; canonical current AccountSummary + disclosable Workspace/Project context | read |
| `IAM-02` | `EndSession` | I&A | authenticated human through Control Plane or Published App; exact current opaque Conexus session | command |
| `IAM-03` | `ProvisionAccount` | I&A | first account for the configured bootstrap identity, or an invited verified email; bounded human presentation | command |
| `IAM-04` | `ListWorkspaceMembers` | I&A | current Workspace roster: members and pending invitations in one projection | read |
| `IAM-05` | `InviteWorkspaceMember` | I&A | exact Workspace + verified email; the pair is the natural key | command |
| `IAM-06` | `RemoveWorkspaceRosterEntry` | I&A | exact Workspace roster entry; narrowing | narrowing command |
| `IAM-10` | `SetWorkspaceMemberRole` | I&A | exact Workspace membership; the last owner cannot be demoted | command/current-authority |

`IAM-16 ChangePublishedAppAccessRole` was subtracted into `IAM-15`: grant and role change are one Product meaning over `iam.published_app_access`; wire-level create/update/precondition detail belongs to 4B.

### 5.1.1 `4C-F11` — human-reviewable access administration

W-03A P7 proved that the accepted membership writes cannot be safely operated from a human frontend while Account presentation is opaque and the I&A owner exposes no exact current access reads.

The operator accepted `CURRENT OWNERS CONFIRMED`:

```text
iam.account
→ accountId remains stable machine identity
→ verified external identity mapping remains authentication identity
→ required nonblank displayName
→ optional email presentation/contact

IAM-04
→ exact Workspace roster: current members and pending invitations
→ the caller's own role, so the browser can hide what the server would refuse

IAM-18
→ human existing Account candidates for exact Workspace membership administration

IAM-19
→ exact member current access derived from the membership row
```

Access composition law:

```text
I&A current membership facts
→ I&A derives effective Project access
→ browser renders that projection

browser-local joins -X-> effective authorization authority
```

Narrow cross-owner summary disclosure is admitted only for the existing access-administration job:

```text
PRJ-01 ListProjects
→ project.read ordinary route
OR workspace.access.manage exact-Workspace ProjectSummary-only route
```

The alternate `PRJ-01` route does not confer Project content/source/data/build authority. Account labels never authorize, email is never Account identity, and Keycloak role/group/organization remains authentication-provider state rather than Conexus authorization. An invitation email is the one place a verified provider claim is load-bearing, and it decides only which pending invitation an arriving identity may claim.

No `Person`, `UserProfile`, generic RBAC/custom-role engine, generic grant CRUD family, `UpdateAccountProfile`, `WS-06` resurrection, new Permission, new semantic owner, new principal class, new trust boundary or new durable record class is admitted by F11.

```text
N_platform 113 → 116
IAM 16 → 19
Permissions = 25
records = 46
owners = 13
```

## 5.2 Workspace — 2

| ID | Operation | Owner | Consumer / authority root | Class |
| --- | --- | --- | --- | --- |
| `WS-01` | `CreateWorkspace` | Workspace | any authenticated Account; the creator becomes its owner | command |
| `WS-02` | `GetWorkspace` | Workspace | current Workspace member disclosure | read |

`WS-03 UpdateWorkspace` remains subtracted by operator-approved `4B-F01`.

No `DeleteWorkspace`, generic Organization tree or hidden/default Workspace operation is admitted.

## 5.3 Project — 17

| ID | Operation | Owner | Consumer / authority root | Class |
| --- | --- | --- | --- | --- |
| `PRJ-01` | `ListProjects` | Project | Workspace Projects surface under ordinary disclosure **or** exact-Workspace access-administration ProjectSummary-only disclosure | read |
| `PRJ-02` | `GetProject` | Project | exact Project disclosure/access | read |
| `PRJ-03` | `CreateProject` | Project + accepted L7 composition | exact Workspace; atomically establishes Project + initial I&A grant + one canonical Project source bootstrap | command/cross-owner atomic |
| `PRJ-25` | `ListProjectDataExplorerSources` | Project | exact Project; current explorer-eligible Project Database and eligible currently bound integration source summaries, with server-resolved disclosure eligibility | read/provenance |
| `PRJ-26` | `ListProjectDataExplorerObjects` | Project | exact Project + exact disclosed explorer source; paged/searchable TABLE/VIEW/genuinely-tabular DATASET summaries without generic provider-tree authority | read/provenance |
| `PRJ-27` | `GetProjectDataExplorerObject` | Project | exact Project + disclosed source/object; physical columns/keys/relationships/constraints plus optional semantic coordinates; no SQL/storage-admin authority | read/provenance |
| `PRJ-28` | `ListProjectDataExplorerRows` | Project | exact Project + disclosed source/object; current read-only rows through bounded typed filter/sort/pagination with scoped continuation truth | read/provenance |

`PRJ-04 UpdateProject` remains subtracted. F11's alternate PRJ-01 access-administration route reveals only exact contained `ProjectSummary` identity needed to administer grants; it is not generic `project.read` and does not restore Project mutation.

`PRJ-18/19` remain declared **semantic** Data-resource projections. F20 permits bounded logical resource structure needed by the Project Data consumer; it still does not turn those operations into physical database/storage authority. F22 adds a distinct read-only physical explorer family `PRJ-25..28`; physical identity and rows therefore do not contaminate semantic `ProjectDataResource` identity.

### 5.3.1 `4C-F02` — Project source correction

W-01 proved that accepted Journey B cannot be completed truthfully by the pre-correction Project surface. The operator accepted the smallest correction:

```text
PRJ-03 CreateProject
→ sourceBootstrap.mode = NEW | EXISTING_GIT

NEW
→ establish one canonical Project Git source during successful Project creation

EXISTING_GIT
→ caller supplies one untrusted provider-neutral repositoryLocator
→ repositoryLocator identifies Git source only; it is never generic fetch/network authority
→ embedded credential/secret material is forbidden
→ trusted GitInfra validates/adopts the source under server-side credential/policy mechanics
→ server resolves an exact immutable source revision during admission
→ successful Project creation has exactly one canonical Project Git authority

R1 first-creator owner composition
→ WS-01 establishes current creator Workspace membership/access + project.create
→ PRJ-03 establishes exact creator account_project_grant + project.read + project.manage
→ project.build / project.review / project.source.read remain separate and absent until first consumer
```

Binding negative laws:

```text
successful Project create -X-> partially initialized Project awaiting source attach
post-create source switching/editing = NOT ADMITTED
multi-repo F1 = NOT ADMITTED
Repository CRUD/Product owner = NOT ADMITTED
Git credentials in Product source input = FORBIDDEN
```

Project Inception and Baseline left the product on 2026-09-19. The
investigation and candidate-review operations `4C-F02` and `4C-F03` admitted are
retired; the source-bootstrap law above is the part of those corrections that
remains current Product authority. The `4C` records of the retired decisions are
retained in `docs/evidence/`.

### 5.3.3 `4C-F16` — Data human identity

P-02 authority-feasibility proved that `PRJ-18/19` expose exact Data-resource machine identity and semantic/provenance axes but did not guarantee a human-recognizable presentation identity. The operator accepted `CURRENT STRUCTURE CONFIRMED`: Project remains the owner and the existing reads remain the complete **semantic Data-resource** Product operation family.

Binding semantic property:

```text
PRJ-18 / PRJ-19
→ server-owned required nonblank Data resource name
→ dataResourceId remains exact machine identity
→ name = presentation only
→ name -X-> routing / authorization / containment / uniqueness authority
```

No physical database explorer, generic metadata editor, new operation, Permission, owner, principal, trust boundary or durable record class is admitted by `4C-F16` itself. F22 later adds a separate physical explorer family rather than widening these semantic reads.

```text
F16 new operations = 0
Project remains 23 at F16
N_platform = 116 at F16
ordinary Permissions remain 25
records remain 46
```

### 5.3.5 `4C-F20` — Data semantic structure inspectability

The first P-02 functional walkthrough proved that a human-recognizable Data resource name plus grain/freshness/coverage/provenance is insufficient for the intended Project Data job. A Project may own application data directly, consume integration-backed data, or expose derived governed data; the operator needs to understand that distinction and inspect the resource's logical structure without receiving physical database authority through the **semantic Data-resource reads themselves**.

The operator accepted a bounded enrichment of the existing `PRJ-18/19` reads:

```text
PRJ-18 / PRJ-19
→ resourceKind = TABLE | VIEW | DATASET
→ sourceKind = INTERNAL | INTEGRATION | DERIVED

PRJ-19 only
→ fields[]
   → resource-scoped semantic field identity
   → human field name
   → logical type
   → requiredness
   → human description
→ relationships[]
   → resource-scoped semantic relationship identity
   → source semantic field
   → target Data resource + semantic field
   → human relationship description
→ rules[]
   → resource-scoped semantic rule identity
   → human business/semantic description
```

Boundary law:

```text
semantic structure != physical database topology
TABLE = human resource kind only
logical field -X-> physical column/storage topology by implication
relationship -X-> SQL join expression
rule -X-> SQL/DDL/executable-expression authority
```

Explicitly rejected **from PRJ-18/19**:

```text
schemaName
tableName
indexName
DDL / SQL text
connectionString / storageKey
generic schema explorer
SQL console
```

No new operation, Permission, owner, principal, trust boundary or durable record class is admitted by `4C-F20`.

```text
F20 new operations = 0
Project remains 23 at F20
N_platform remains 117 at F20
ordinary Permissions remain 25
records remain 46
```

### 5.3.6 `4C-F21` — human-readable Capability inspection

The same P-02 walkthrough proved that `capabilityId + operationId + regime` is machine-recognizable but does not let a human answer the accepted job “what can this Project do?” without inferring semantics from technical identifiers.

The operator accepted a bounded enrichment of the existing `PRJ-16/17` reads:

```text
PRJ-16 / PRJ-17
→ required human capability name
→ required nonblank human purpose
→ capabilityId + operationId + regime remain exact technical identity

PRJ-17 only
→ inputs[]
→ outputs[]
   each field exposes human name + logical type + requiredness + human description
```

Authority law:

```text
name / purpose / inputs / outputs = inspection truth
-X-> invocation grant
-X-> runtime serializer authority
-X-> generic executor
```

`PRJ-16/17` remain read-only Project projections under `project.read`. No Run/Execute operation, generic Capability executor/framework, new Permission, owner, principal, trust boundary or durable record class is admitted by `4C-F21`.

```text
F21 new operations = 0
Project remains 23 at F21
N_platform remains 117 at F21
ordinary Permissions remain 25
records remain 46
```

### 5.3.7 `4C-F22` — read-only physical Project Data Explorer

The subsequent operator walkthrough plus Mitra screenshots proved a distinct human job that F20 intentionally cannot satisfy: an authorized person must be able to open the Project's real tabular data, see actual rows/columns, and navigate physical structure/relationships while retaining separate semantic meaning.

The operator approved a separate Project-owned physical explorer family rather than widening `ProjectDataResource`:

```text
PRJ-25 ListProjectDataExplorerSources
→ exact Project
→ Project Database business/application source when explorer-eligible
→ exact currently bound integration source only when its connector/source contract is explorer-eligible
→ source identity/presentation is server-resolved current projection

PRJ-26 ListProjectDataExplorerObjects
→ exact Project + exact disclosed source
→ bounded search/lazy/paged discovery of TABLE | VIEW | genuinely tabular DATASET
→ namespace/schema presentation when the source has one
→ optional semanticDataResourceId only as non-authorizing cross-link

PRJ-27 GetProjectDataExplorerObject
→ exact Project + exact disclosed source/object
→ physical columns/types/nullability/key roles
→ disclosable relationships + physical constraints
→ optional semantic coordinates into PRJ-19 truth

PRJ-28 ListProjectDataExplorerRows
→ exact Project + exact disclosed source/object
→ current read-only row page
→ bounded typed filters over disclosed columns only
→ bounded sort over disclosed columns only
→ opaque continuation scoped to exact Project/source/object/filter/order
→ observed/read time + explicit truncation truth
```

Physical/semantic separation law:

```text
physical source/object/column identity != semantic ProjectDataResource identity
physical names remain visible
semantic labels/rules may augment physical truth but never replace identity or authorize
DERIVED = semantic/origin meaning, not a fake physical source
```

Source/disclosure law:

```text
Project Database = Project-owned business/application data only
Project Data Explorer -X-> hub_control
Project Data Explorer -X-> I&A/Workspace/Project/Builder/Brain/etc owner schemas
Project Data Explorer -X-> mastra_builder / mastra_par
Project Data Explorer -X-> Keycloak provider persistence
Project Data Explorer -X-> CredentialBackend material
Project Data Explorer -X-> another Project Database
Project Data Explorer -X-> foreign Workspace/Project sources

bound Connection -X-> automatic raw-source disclosure
source/object/page coordinate = untrusted reference only
current Project grant + project.data.read + server-resolved explorer eligibility remain binding
caller -X-> select Connection revision/environment independently of current Project binding
```

Query/mutation negative law:

```text
PRJ-28 -X-> SQL text
PRJ-28 -X-> free-form WHERE / expression / function / cast / join
PRJ-28 -X-> INSERT / UPDATE / DELETE / DDL
PRJ-28 -X-> schema/index/migration administration
PRJ-28 -X-> arbitrary provider execution
PRJ-28 -X-> bulk export / generic Blob read
page token -X-> Project/source/object/filter/order widening
unknown total count != zero
truncated preview != complete value
```

F22 preserves truthful source failure/empty distinctions and adds no write authority. `project.data.read` remains the existing ordinary Permission because it already owns Project data inspection; exact source/object disclosure eligibility is an additional server-side current-authority condition, not a new generic policy namespace.

```text
F22 new operations = 4
Project 23 → 27
N_platform 117 → 121
ordinary Permissions remain 25
new semantic owners = 0
new principal classes = 0
new trust boundaries = 0
new durable records = 0
```

## 5.4 Builder — 24

| ID | Operation | Owner | Consumer / authority root | Class |
| --- | --- | --- | --- | --- |
| `BLD-01` | `ListChanges` | Builder | exact Project Build/Activity; each Change preserves its authored human intent for recognition | read |
| `BLD-02` | `GetChange` | Builder | exact Project/Change + authored human intent | read |
| `BLD-03` | `CreateChange` | Builder | exact Project + approved Baseline/current build authority + required human intent that remains Change meaning | command |
| `BLD-04` | `GetChangePlan` | Builder | exact Change + current Plan revision | read |
| `BLD-05` | `DecideChangePlanCheckpoint` | Builder | exact Change/Plan revision + current reviewer eligibility | decision/current-state |
| `BLD-06` | `GetChangeProgress` | Builder | Hub-owned Plan/item/Change truth | read |
| `BLD-07` | `GetChangeDiff` | Builder/Git projection | exact candidate/result lineage | read/source |
| `BLD-08` | `ListProjectSourceTree` | Project Git via Builder | exact Project/source revision | read/source |
| `BLD-09` | `GetProjectSourceFile` | Project Git via Builder | exact Project/source revision/path | read/source |
| `BLD-10` | `GetBuildPreview` | Builder/MAR projection | current Project source Preview or optional exact Change candidate Preview; `ready != verified != live` | read |
| `BLD-11` | `ListChangeFindings` | Builder | exact Change + Evidence visibility | read/review |
| `BLD-12` | `GetFinding` | Builder | exact Finding + disclosure | read/review |
| `BLD-13` | `CloseFinding` | Builder | exact Finding + current resolution Evidence/authority | decision/current-state |
| `BLD-14` | `ListChangeEvidence` | Builder projection | exact Change + Evidence visibility | read/review |
| `BLD-15` | `GetEvidence` | Builder projection | exact Evidence/provenance | read/review |
| `BLD-16` | `AskConexusAboutContext` | Builder | selected current authorized Project context + optional exact current Change context; grants no new authority | read/assistant interaction |
| `BLD-17` | `GetChangeExecutionDetail` | Builder | exact Change; subordinate WorkUnit/ActorRun projection | read |
| `BLD-18` | `GetChangeProductAgentDraft` | Builder | exact Change + current server-owned typed Product Agent draft | read |
| `BLD-19` | `CreateChangeProductAgentDraft` | Builder | exact Change + explicit NEW or current authored origin + typed `agent/v1`; idempotent candidate establishment | command |
| `BLD-20` | `ReviseChangeProductAgentDraft` | Builder | exact Change/draft + expected current draft revision + typed `agent/v1` | command/current-state |
| `BLD-21` | `PrepareBuildPreview` | Builder | exact Project + technically admitted Change candidate subject digest; retained preparation status remains distinct from independent verification and MAR serving/readiness | command/current-state |
| `BLD-22` | `LaunchBuildPreview` | Builder | exact PREPARED attempt and immutable artifact coordinates; I&A session-bound grant and MAR route are created without compilation | command/current-state |
| `BLD-23` | `GetBuilderSession` | Builder projection + Mastra persisted conversation | exact authorized Project; persisted Mastra conversation, active BuilderRun summary and Preview summary | read |
| `BLD-24` | `SendBuilderMessage` | Builder | exact authorized Project, nonblank content, `BUILD \| PLAN` mode and Idempotency-Key; server resolves current source and Project Thread | command |
| `BLD-25` | `CancelBuilderRun` | Builder | exact authorized Project and BuilderRun; server records cancellation intent and settles only the admitted run | command |
| `BLD-26` | `GetBuilderRunTrace` | Builder | exact authorized Project and BuilderRun; measured Mastra trace spans, redacted to safe labels and timings | read |

A generic `AcceptChange` is rejected. `bld.change_acceptance` remains an owner current-proof fact produced by exact checkpoints/verifier/Builder settlement. Direct `CreateWorkUnit`, plan-JSON patch, `SetWorkItemStatus`, `CreateActorRun`, `ResumeSandbox` and `MarkVerified` are owner/runtime mechanics.

Internal pilot refinement, approved 2026-09-13: BLD-03 resolves and pins the
expected project working source, while the approved Baseline still supplies
project meaning and limits. Successive edits continue retained source across
Changes. A coding turn may end with a persisted response-only result; it does
not create a parallel assistant owner or use BLD-16 to mutate Change state.
BLD-21 admits technically retained source without independent model acceptance
for this limited Preview path. The verified-candidate restriction in historical
receipts does not apply to that path. This never manufactures change_acceptance
or VERIFIED status. BLD-22 retains exact prepared artifact and launch authority.
The working source, last successful compiled artifact and independent review
remain separate facts. Current schemas and generated consumers must encode this
refinement together before the pilot is handed to an operator.

### 5.4.1 `4C-F14` — human-recognizable Change + exact optional assistant context

P-01 authority-feasibility proved that the existing Builder owner had sufficient Change/Plan/Preview/review topology but two existing projections were insufficient for a truthful human Build surface.

The operator accepted `CURRENT OWNER CONFIRMED`:

```text
BLD-03 CreateChange
→ intent remains the required human semantic statement of what must become true
→ intent is durable meaning on the existing bld.change subject

BLD-01 ListChanges
→ ChangeSummary returns the same authored intent
→ returning users can recognize a Change without client-owned labels

BLD-02 GetChange
→ exact current Change returns the same authored intent

BLD-16 AskConexusAboutContext
→ question only = current authorized Project/platform Builder context
→ question + optional changeId = optional exact current Change context
→ server re-resolves exact Change inside the current Project
→ the same project.build authority/disclosure remains binding
```

Identity/presentation law:

```text
changeId = stable exact Change identity / untrusted reference
intent = required nonblank human semantic meaning

intent != authorization
intent != unique key
intent != status
intent != separately mutable title/name domain
```

Assistant negative laws:

```text
changeId possession -X-> project.source.read
changeId possession -X-> project.review
changeId possession -X-> runtime control
question/prompt text -X-> semantic subject authority
BLD-16 -X-> source file / diff / Finding / Evidence disclosure by convenience
assistant answer -X-> Change / Plan / progress mutation
```

No `Change.title`, `Change.name`, rename/update operation, universal `ContextRef`, AssistantThread owner, assistant-memory authority, new operation, ordinary Permission, semantic owner, principal class, trust boundary or durable record class is admitted by `4C-F14`.

```text
F14 new operations = 0
Builder remains 17
N_platform remains 116 at F14
ordinary Permissions remain 25
records remain 46
```

### 5.4.2 `4C-F15` — current Project source Preview + exact optional Change candidate

P-01 P9 authority tracing proved that the approved app-first Build entry cannot truthfully show the current Project application when `BLD-10` is candidate-only and requires a Change. The real owner is already Builder/MAR Preview projection, so the operator accepted bounded enrichment of the same `BLD-10` rather than adding a parallel operation.

```text
BLD-10 GetBuildPreview
→ exact Project + project.build
→ optional changeId

changeId omitted
→ server resolves current canonical Project source
→ returns CURRENT_PROJECT Preview
→ subjectDigest binds that exact current Project source Preview subject

changeId present
→ server re-resolves exact Change inside current Project
→ returns CHANGE_CANDIDATE Preview
→ subjectDigest binds that exact Change candidate Preview subject
```

Preview subject law:

```text
CURRENT_PROJECT != CHANGE_CANDIDATE
current Project source != active Release
Build Preview != Published App serving state
ready != verified != live
live = false on BLD-10
caller -X-> choose sourceRevision for current Preview
changeId possession -X-> source/review/runtime authority
```

No `BLD-18`, second Preview owner, caller-selected source revision, active-Release alias, generic app-serving read, new Permission, semantic owner, principal class, trust boundary or durable record class is admitted by `4C-F15`.

```text
F15 new operations = 0
Builder remains 17
N_platform = 116 at F15
ordinary Permissions remain 25
records remain 46
```

The historical `BLD-18` rejection above means “no second Preview operation.” It did not reserve the identifier forever. The later, independently proven F30 consumer assigns `BLD-18` to the distinct Product Agent draft read below.

### 5.4.3 `4C-F30` — complete Agent definition + typed Change draft

The P-03 walkthrough proved that human creators cannot inspect or structurally author the Product-owned `agent/v1` contract through the current Product wire. The operator accepted the smallest owner-preserving correction:

```text
PRJ-21
→ exact safe complete authored ProductAgentDefinition
→ immutable authored revision + Release coordinates

BLD-18 GetChangeProductAgentDraft
→ reload exact current server-owned draft

BLD-19 CreateChangeProductAgentDraft
→ explicit origin = NEW | EXISTING
→ idempotent establishment inside exact Change
→ server issues/revalidates Agent identity

BLD-20 ReviseChangeProductAgentDraft
→ expectedDraftRevision
→ stale writes fail closed
→ same candidateSubjectDigest / diff / proof / Release path
```

`ProductAgentDefinition` is a closed framework-neutral `agent/v1` contract: name, purpose, instructions, bounded model policy/sampling, governed capability bindings, Project-bound Brain context, currently admitted memory, interactions, policy/approval/budget/verification references and known limitations. It contains no credential, raw provider configuration, Mastra identity, arbitrary extension object, runtime override or browser-owned state.

```text
PRJ-20/22 summary != PRJ-21 definition detail
draft != live Agent mutation
draft != second source/Agent database
instructions != provider system-prompt storage authority
capabilityId != Mastra/provider tool identifier
typed edit + Conexus edit → same Change candidate
new operations = 3
Builder 17 → 20
N_platform 122 → 125
ordinary Permissions remain 25
semantic owners/principals/trust boundaries/durable record classes remain unchanged
```

## 5.7 Release / Promotion / serving — 7

| ID | Operation | Owner | Consumer / authority root | Class |
| --- | --- | --- | --- | --- |
| `REL-01` | `ListReleases` | Release | scalable human-recognizable exact Project version disclosure | read |
| `REL-02` | `GetRelease` | Release | exact immutable safe human-inspectable Release composition | read |
| `REL-04` | `ListPromotions` | Release | scalable chronological exact Project/environment history | read |
| `REL-05` | `GetPromotion` | Release | exact Promotion history/current state | read |
| `REL-06` | `PromoteRelease` | Release | exact Release + server-disclosed environment + current proof/conformance + expected pointer generation | consequential decision/current-state |
| `REL-07` | `GetProjectServingState` | Release/MAR projection | server-disclosed target matrix + exact active pointer + served verification; AVAILABLE != served | read/provenance |
| `REL-08` | `GetEnvironmentConformance` | Release | exact target PG/privileges/migrations/config/bindings/current pointer checks | read/proof |

`REL-03 ComposeRelease` is `SYSTEM_OWNER_TRANSITION`: exact accepted proof causes owner-controlled immutable composition; no separate human command is required. Rollback is another governed `PromoteRelease` to an eligible prior Release. Pointer setting and served verification are not direct caller operations.

## 5.8 Product Agent Runtime — 16

| ID | Operation | Owner | Consumer / authority root | Class |
| --- | --- | --- | --- | --- |
| `PAR-01` | `ListConversations` | PAR | exact Project/Agent + current Published-App disclosure; recognizable newest-active-first summaries + exact attention | read |
| `PAR-02` | `GetConversation` | PAR | exact Conversation + current Project/Agent/app authority; typed durable text/question/reply history | read |
| `PAR-03` | `CreateConversation` | PAR | exact active Release + Agent + current app access | command |
| `PAR-04` | `SendProductAgentTurn` | PAR | exact Conversation + current app/Agent/Release authority; optional exact current question reply; admits a new exact AgentRun | consequential command |
| `PAR-05` | `RunProductAgentHeadless` | PAR | exact active Release/Agent + explicit headless authority | consequential command |
| `PAR-06` | `ListAgentRuns` | PAR | exact Project/Agent/Conversation + current disclosure; owner-issued newest-admitted-first ordering | read/provenance |
| `PAR-07` | `GetAgentRun` | PAR | exact AgentRun temporal/state truth + optional safe human problem; `COMPLETED != every effect succeeded` | read/provenance |
| `PAR-08` | `ListApprovalRequests` | PAR | current eligible approver UX; exact request-time Agent/action/temporal recognition context | read/approval |
| `PAR-09` | `GetApprovalRequest` | PAR | current eligible approver or separately authorized investigator; recognition context + exact sealed subject/current state | read/approval |
| `PAR-10` | `DecideApprovalRequest` | PAR | current eligible human shown the exact sealed proposal; surface does not confer eligibility | decision/current-authority |
| `PAR-11` | `ListAgentTriggers` | PAR | exact Project/Agent trigger administration | read |
| `PAR-12` | `GetAgentTrigger` | PAR | exact TriggerRevision/current state | read |
| `PAR-13` | `CreateScheduleTrigger` | PAR | exact active/evolvable Agent + current Project authority | command |
| `PAR-14` | `ReviseScheduleTrigger` | PAR | exact current TriggerRevision + authority | command/current-state |
| `PAR-15` | `EnableAgentTrigger` | PAR | exact TriggerRevision + active Project/Release/current authority | consequential command/current-state |
| `PAR-16` | `DisableAgentTrigger` | PAR | exact TriggerRevision; explicit narrowing allowed for archived Project | narrowing command |

Agent authoring stays in `BLD-03` + normal Change/Release. Mastra thread/tool-registry/runtime snapshot/provider IDs and owner terminal transitions are not Product operations.

`4C-F37` keeps clarification inside the existing Conversation owner and operation set. A structured `QUESTION` is durable user-visible message truth, not an `ApprovalRequest` or runtime suspension owner. The question-producing AgentRun settles; a reply through PAR-04 must reference the exact still-open question and starts a new AgentRun. `PAR-01` orders summaries by `lastActivityAt DESC` then stable `conversationId DESC`. PAR remains 16.

Approval is owner-specific rather than Control-Plane-specific:

```text
exact ApprovalRequest subject
→ current eligible human through the exact admitted approval surface
→ PAR revalidates eligibility + revocation + Release + sealed proposal
→ only then can ALLOW_ONCE reach Gateway effect admission
```

The exact approval surface may be Control Plane or Published Application when the current Product experience admits it. Published-App role `{admin,member}` by itself never grants approval authority, and exposing approval in a Published App never grants Builder/Control-Plane access. `PAR-09` may additionally be inspected read-only through the separately authorized audit/investigator route; that route can never list the approval queue through `PAR-08` or decide the request.

## 5.9 Gateway inspection — 2

| ID | Operation | Owner | Consumer / authority root | Class |
| --- | --- | --- | --- | --- |
| `GW-01` | `ListEffectAttempts` | Gateway | exact Project + optional exact server-filtered originating run + audit disclosure; filter applies before pagination and grants no retry authority | read/effect evidence |
| `GW-02` | `GetEffectAttempt` | Gateway | exact EffectAttempt receipt/reconciliation/provenance; preserves `OUTCOME_UNKNOWN` | read/effect evidence |

Effect admission, idempotency claim, resume/reconciliation are owner-internal after an admitted business command. Generic Retry/MarkSucceeded/ResolveUnknown shortcuts are rejected.

## 5.10 Managed Application Runtime — 4

| ID | Operation | Owner | Consumer / authority root | Class |
| --- | --- | --- | --- | --- |
| `MAR-01` | `ListManagedJobRuns` | MAR | exact Project + Release/job filters | read |
| `MAR-02` | `GetManagedJobRun` | MAR | exact JobRun + pinned Release/job/current state | read/provenance |
| `MAR-03` | `RunManagedJobNow` | MAR | exact currently served Release + admitted `job/v1` + current authority | command/occurrence |
| `MAR-04` | `ListRunnableManagedJobs` | MAR/Release projection | safe human-recognizable jobs admitted by the exact currently served Release | read |

Queue/redelivery/catch-up/single-flight mechanics remain owner/runtime behavior. No CreateCron, ReplayMissedSlots, ForceRedelivery or MarkJobSucceeded Product operation is admitted.

## 5.11 Observability & Audit — 5

| ID | Operation | Owner | Consumer / authority root | Class |
| --- | --- | --- | --- | --- |
| `OBS-01` | `ListProjectActivity` | OBS/Audit projection | exact Project disclosure; human summary + optional admitted owner-detail target | read |
| `OBS-02` | `GetExecutionObservationDetail` | OBS/Audit projection | exact closed typed execution subject + technical disclosure | read/evidence |
| `OBS-03` | `GetProjectUsageCostSummary` | OBS/Audit projection | exact Project/period + provenance; missing != zero | read/provenance |
| `OBS-04` | `ListAuditRecords` | OBS/Audit | exact Workspace audit investigation with bounded server-side period/actor/action/Project filters applied before pagination; immutable human snapshots/summary | read/audit |
| `OBS-05` | `GetAuditRecord` | OBS/Audit | exact immutable audit fact + append-time human presentation snapshots + deterministic human summary + Evidence | read/audit |

Telemetry/evidence never becomes current owner truth.

### 5.11.1 `4C-F12` — human-investigable immutable Audit

W-03B P7 proved that `OBS-04/05` already own the correct immutable audit surface, but the previous list shape could not honestly support whole-set investigation from a paginated browser and exact `kind/ref` alone was insufficient human presentation.

The operator accepted `CURRENT OWNER CONFIRMED`:

```text
OBS-04
→ same Product operation
→ optional from / to / actorQuery / actionQuery / projectId / pageToken
→ filters apply to the currently disclosable Workspace audit set before pagination

OBS-owned audit subject snapshot
→ kind
→ ref
→ append-time label

AuditRecordSummary / AuditRecord
→ exact actor/subject snapshots
→ action + occurredAt
→ deterministic nonblank human summary
→ exact detail retains Evidence
```

Historical presentation law:

```text
append-time actor/subject label snapshot
= immutable human Evidence presentation

current resource/account name
-X-> rewrite historical audit presentation

loaded browser page
-X-> audit search universe

label/summary
-X-> authorization
```

The audit-specific snapshot does not widen the generic `OwnerSubjectRef` used by other OBS projections. No `SearchAudit` operation, generic Event/Search owner, new Permission, new semantic owner, new durable record class, retry/undo mutation or current business-state authority is admitted.

```text
F12 new operations = 0
OBS remains 5
N_platform remains 116 after F11
```

---

## 6. Product-visible Published Application boundary

Platform access/serving operations are fixed platform authority:

```text
IAM-13 GetPublishedAppAccessContext
IAM-14 ListPublishedAppAccess
IAM-15 SetPublishedAppAccess
IAM-17 RevokePublishedAppAccess
REL-07 GetProjectServingState
```

Published Application **business operations** are exact Project-defined `Ops(R)`. Static byte/path serving is transport under current app authorization and exact active Release, not one Product operation per file or route.

---

# 7. First Budget Analyzer application census — 2

The operator-approved `docs/product/budget-analyzer-contract.md` closes this operation set:

| ID | Operation | Regime | Owner | Consumer | Product authority |
| --- | --- | --- | --- | --- | --- |
| `BUD-01` | `AnalyzePendingBudgets` | registered `Query` | Budget Analyzer Project/Product semantic contract | Published-App human | exact active Budget Analyzer Release; current app access; role `{admin,member}`; exact ProjectConnectionBinding/Brain mapping + system-resolved result coordinate |
| `BUD-02` | `ListPendingBudgets` | registered `Query` | Budget Analyzer Project/Product semantic contract | Published-App human | same exact Release/app/source authority; each response/page has its own disclosed system-resolved result coordinate |

`AnalyzePendingBudgets` returns exactly the closed R1–R5 analytical snapshot under the admitted filter set; it is not arbitrary metrics/dimensions/group-by/SQL. `ListPendingBudgets` returns R6 drilldown. Every value-bearing response/page carries one exact ISO 4217 currency code; F1 does not aggregate multiple currencies without separately accepted grouping/conversion semantics. Seller/customer results carry stable source-qualified IDs plus owner-issued non-empty human names. F1 does not promise cross-call or cross-page snapshot pinning: a changed result coordinate must remain visible and mixed-coordinate data must not be represented as one coherent snapshot. Neither operation admits arbitrary historical reconstruction through caller-selected `as_of`.

```text
N_budget = 2
Budget Analyzer orphan operations = 0
Budget Analyzer speculative operations = 0
```

Margin is unsupported, Mitra conversion-probability weighting is rejected, actual conversion metrics remain deferred until separately proved/admitted, and a negative Budget age is never silently clamped into an aging band.

---

# 8. Permission / principal / scope / ingress closure

The ordinary Permission vocabulary is canonically owned by `permission-contract.md`. No Project-defined business name creates a global Permission string.

The following grouped matrix is **complete**: every fixed platform operation appears exactly once in one row below; the two Budget operations are mapped separately. The operation table above supplies the exact semantic owner and subject; this matrix supplies the remaining cross-cutting authority fields.

### 8.1 Outcome profiles

| Profile | Required semantic behavior |
| --- | --- |
| `READ` | truthful success/empty; unauthenticated/denied/non-disclosable remain distinct; dependency failure is not empty |
| `PROVENANCE_READ` | `READ` plus current/stale/partial/unknown/provenance distinctions where reachable |
| `COMMAND` | applied/accepted vs validation/denial/conflict remain distinct; no fake success on rejected mutation |
| `DECISION` | exact current subject; stale/changed subject cannot win; accepted/denied/rejected distinguishable |
| `CONSEQUENTIAL` | accepted/pending/terminal/ambiguous where effects can escape; no blind replay of unknown effect |
| `ANALYTIC` | `SUPPORTED_CURRENT`, `SUPPORTED_STALE`, `PARTIAL`, `UNVERIFIED/INDETERMINATE`, `UNSUPPORTED`, `DEPENDENCY_UNAVAILABLE`; unknown != zero |
| `PROOF` | success/failure/error/unknown proof states do not rewrite Product meaning or current owner facts by narration |

### 8.1.1 Disclosure and semantic outcome law

4A fixes the semantic distinction; 4B later chooses the exact Problem schema/code spelling.

```text
401-class unauthenticated
= no valid current Conexus session/principal for a protected human surface

404-class absent / intentionally non-disclosable
= subject does not exist OR current disclosure policy must not confirm that foreign/out-of-scope subject exists
= default for guessed/cross-Workspace/cross-Project identifiers when existence itself is not disclosable

403-class authenticated but denied
= the subject/surface is legitimately disclosable to this current caller, but the caller lacks the required action/decision authority

409-class conflict
= current owner state/uniqueness/single-flight conflict where the request is otherwise admitted

412-class stale precondition/current-subject conflict
= caller named an expected revision/generation/digest/current subject that is no longer current or cannot win

422-class admitted semantic/business-input failure
= caller is authorized for the operation, but the admitted input violates the operation's semantic validation contract

503-class required dependency unavailable
= required current provider/source/runtime dependency is unavailable and the operation cannot truthfully complete
```

Rules:

```text
foreign identifier + no disclosure authority -X-> 403 existence oracle
non-disclosable unknown                     -X-> convenient negative answer
stale/current-authority conflict            -X-> silent last-write-wins
required dependency unavailable             -X-> empty/zero/success
```

Owner-specific finer distinctions may narrow disclosure further, but no later wire/frontend layer may collapse these classes into a more permissive meaning.

### 8.2 Idempotency / concurrency profiles

| Profile | Required property |
| --- | --- |
| `IC0` | read-only; no mutation idempotency requirement |
| `IC1` | ordinary owner mutation; current containment/authority rechecked at protected commit; uniqueness/current-state conflict cannot be hidden |
| `IC2` | exact immutable/current subject or expected revision/generation precondition; stale candidate cannot win |
| `IC3` | consequential intake must be safely repeatable through stable semantic request/subject identity; duplicate intake cannot create duplicate effect/occurrence |
| `IC4` | external/ambiguous effect fence + idempotency/reconciliation; `OUTCOME_UNKNOWN` blocks blind replay/new duplicate-scope admission |

`IC1` is the 4A projection of the accepted current-authority/CR-1 property. Exact carrier/transaction/ETag/lock syntax belongs to 4B/4D.

### 8.3 Complete fixed-platform authority matrix

| Operation IDs | Principal / ingress | Permission or special condition | Scope/current-authority rule | Outcome | IC |
| --- | --- | --- | --- | --- | --- |
| `IAM-01` | `HUMAN_ACCOUNT_SESSION / CP` | `authenticated` | exact current Conexus session; returns canonical AccountSummary and only disclosable Workspace/Project context | `READ` | `IC0` |
| `IAM-02` | `HUMAN_ACCOUNT_SESSION / CP or PA` | `authenticated` | exact current opaque Conexus session subject; ending it does not claim Keycloak SSO logout | `COMMAND` | `IC1` |
| `IAM-03` | `TRUSTED_BOOTSTRAP_CONTEXT / CP` | exact one-shot self-provision from a verified identity that is either the first account or invited | the route derives its own exact subject server-side and cannot provision another Account; an invited Account's email comes from the verified claim and its membership is written in the same transaction; no public signup | `COMMAND` | `IC3` |
| `IAM-04` | `HUMAN_ACCOUNT_SESSION / CP` | current Workspace membership | exact Workspace roster; a caller who is not a member is told nothing, including whether the Workspace exists | `READ` | `IC0` |
| `IAM-05,IAM-06,IAM-10` | `HUMAN_ACCOUNT_SESSION / CP` | `workspace.access.manage` | exact Workspace containment; the actor is the current session and never a request value; authority is rechecked inside the same statement that writes | `COMMAND` | `IC1` |
| `WS-01` | `HUMAN_ACCOUNT_SESSION / CP` | `authenticated` | any authenticated Account may create a Workspace; success establishes the creator's `owner` membership in that exact Workspace so it is immediately disclosable and can create the first Project | `COMMAND` | `IC3` |
| `WS-02` | `HUMAN_ACCOUNT_SESSION / CP` | current Workspace membership | exact Workspace disclosure | `READ` | `IC0` |
| `PRJ-01` | `HUMAN_ACCOUNT_SESSION / CP` | ordinary `project.read` **or** narrow `workspace.access.manage` access-administration summary disclosure | ordinary route applies current Project disclosure; alternate route exposes only contained ProjectSummary identities in exact Workspace | `READ` | `IC0` |
| `PRJ-02` | `HUMAN_ACCOUNT_SESSION / CP` | `project.read` + exact Project grant | exact Project disclosure | `READ` | `IC0` |
| `PRJ-03` | `HUMAN_ACCOUNT_SESSION / CP` | `project.create` | destination Workspace + atomic Project/initial current-Account direct grant carrying `project.read + project.manage` + one canonical source-bootstrap admission; success implies a source-complete Project | `COMMAND` | `IC3` |
| `PRJ-25..28` | `HUMAN_ACCOUNT_SESSION / CP` | `project.data.read` | exact Project + server-resolved current explorer eligibility; Project Database business/application data or exact eligible currently bound integration source only; source/object/page coordinates remain untrusted, and PRJ-28 filters/sorts only disclosed exact-object columns | `PROVENANCE_READ` | `IC0` |
| `BLD-01..04,BLD-06,BLD-10,BLD-16..22` | `HUMAN_ACCOUNT_SESSION / CP` | `project.build` | exact Project/Change human intent/Plan/current-or-candidate Preview/context plus typed Product Agent draft and exact verified Change candidate preparation; BLD-18 reads current draft, BLD-19 idempotently establishes NEW/EXISTING draft, BLD-20 revises only the expected current draft revision, BLD-21 starts/coalesces preparation without setting MAR readiness, and BLD-22 launches only the exact currently prepared attempt with a one-use entry grant | reads `READ`; create/revise/prepare/launch `COMMAND` | reads `IC0`; BLD-03/19 `IC3`; BLD-20/21/22 `IC2` |
| `BLD-05,BLD-11..15` | `HUMAN_ACCOUNT_SESSION / CP` | `project.review` | exact Change/Plan/Finding/Evidence subject + current eligibility | reads `READ`; decisions `DECISION` | reads `IC0`; decisions `IC2` |
| `BLD-07..09` | `HUMAN_ACCOUNT_SESSION / CP` | `project.source.read` | exact immutable/current source revision/path/lineage | `READ` | `IC0` |
| `REL-01,REL-02,REL-04,REL-05,REL-07` | `HUMAN_ACCOUNT_SESSION / CP` | `project.read`; `REL-07` additionally admits purpose-bound `release.promote` target/serving discovery | exact Project/Release/Promotion/server-disclosed target/serving truth | `REL-07` `PROVENANCE_READ`; others `READ` | `IC0` |
| `REL-06` | `HUMAN_ACCOUNT_SESSION / CP` | `release.promote` | exact Release/environment + current proof/conformance + expected pointer generation; repeatable promotion intake cannot manufacture duplicate Promotion/effect | `CONSEQUENTIAL` | `IC2 AND IC3` |
| `REL-08` | `HUMAN_ACCOUNT_SESSION / CP` | `release.promote` | exact target-environment conformance subject; read grants no pointer mutation | `PROOF` | `IC0` |
| `PAR-01..04` | `PUBLISHED_APP_HUMAN / PA` | exact app access/role + active Release/Agent | exact Project/Agent/Conversation/Release scope; recognizable chronology/attention and exact current question reply remain PAR-owned | reads `READ`; `PAR-03` `COMMAND`; `PAR-04` `CONSEQUENTIAL` | reads `IC0`; create/turn `IC3`; downstream effects additionally `IC4` |
| `PAR-05` | `HUMAN_ACCOUNT_SESSION / HEADLESS` | `agent.headless.invoke` | exact active Release/Agent + current headless admission | `CONSEQUENTIAL` | `IC3`; downstream effects `IC4` |
| `PAR-06,PAR-07` | `HUMAN_ACCOUNT_SESSION / CP` or `PUBLISHED_APP_HUMAN / PA` | Control Plane `project.read` or exact in-scope app access | exact AgentRun/Conversation/Project disclosure; admitted/settled times and safe problem remain PAR owner truth | `PAR-07` `PROVENANCE_READ`; `PAR-06` `READ` | `IC0` |
| `PAR-08` | `HUMAN_ACCOUNT_SESSION / CP` or `PUBLISHED_APP_HUMAN / PA` | `agent.effect.approve` + exact current approver eligibility | exact Project/AgentRun/ApprovalRequest scope plus immutable request-time Agent/action/time recognition context; PA additionally requires current app access/Release; app role alone is never approval authority | `READ` | `IC0` |
| `PAR-09` | eligible approver via `CP` or `PA`, or `HUMAN_ACCOUNT_SESSION / CP` investigator | approver route: `agent.effect.approve` + exact current eligibility; investigator route: `audit.read` | recognition context + exact sealed ApprovalRequest/proposal digest; context is not current authorization; investigator is read-only; PA app role alone is never approval authority | `PROVENANCE_READ` | `IC0` |
| `PAR-10` | `HUMAN_ACCOUNT_SESSION / CP` or `PUBLISHED_APP_HUMAN / PA` | `agent.effect.approve` + exact current approver eligibility | exact sealed proposal + current revocation/Release/eligibility recheck; changed subject requires new request; PA additionally requires current app access/Release | `DECISION` | `IC2/IC4` |
| `PAR-11..16` | `HUMAN_ACCOUNT_SESSION / CP` | `agent.trigger.manage` | exact Project/Agent/TriggerRevision; archive blocks creation/enable but narrowing disable remains allowed | reads `READ`; writes `COMMAND` | reads `IC0`; create `IC3`; revise/enable `IC2`; disable `IC1` |
| `GW-01,GW-02` | `HUMAN_ACCOUNT_SESSION / CP` | `audit.read` | exact Project + originating run/operation/effect subject; GW-01 may filter by exact owner-issued originatingRun before pagination; no retry authority | `PROVENANCE_READ` | `IC0` (underlying effect owner uses `IC4`) |

`4C-PRE11-F04` preserves the accepted exact AgentRun investigation continuation with **no new Product operation**. `GW-01` accepts one optional exact `OriginatingRunRef { kind, ref }` filter, applies it server-side before deterministic `attemptedAt DESC / effectAttemptId DESC` pagination and binds the opaque continuation to that exact query shape. The filter is recognition/provenance scope only: it grants no PAR read, Gateway mutation, retry, replay, reconciliation or effect authority.
| `MAR-01,MAR-02` | `HUMAN_ACCOUNT_SESSION / CP` | `project.read` | exact Project/Release/job/JobRun | `MAR-02` `PROVENANCE_READ`; `MAR-01` `READ` | `IC0` |
| `MAR-03` | `HUMAN_ACCOUNT_SESSION / CP` | `job.run` | exact currently served Release + admitted job + normal single-flight/coalesce laws | `COMMAND` | `IC3` |
| `MAR-04` | `HUMAN_ACCOUNT_SESSION / CP` | ordinary `project.read` or purpose-bound `job.run` | safe human job identities only from the exact currently served Release; read grants no run/queue/schedule authority | `READ` | `IC0` |
| `OBS-01,OBS-03` | `HUMAN_ACCOUNT_SESSION / CP` | `project.read` | exact Project/current disclosure; usage result preserves provenance | `OBS-03` `PROVENANCE_READ`; `OBS-01` `READ` | `IC0` |
| `OBS-02,OBS-04,OBS-05` | `HUMAN_ACCOUNT_SESSION / CP` | `audit.read` | exact closed typed execution/audit subject + current disclosure; OBS-04 filtering is server-side before pagination; audit labels/summaries are immutable presentation Evidence, never current authorization | `PROVENANCE_READ` | `IC0` |

### 8.4 Budget Analyzer authority matrix

| Operation | Principal / ingress | Permission/special condition | Scope/current-authority rule | Outcome | IC |
| --- | --- | --- | --- | --- | --- |
| `BUD-01 AnalyzePendingBudgets` | `PUBLISHED_APP_HUMAN / PA` | exact app role `{admin,member}` | exact active Budget Analyzer Release + current app access + exact Project/Brain/Connection/read-model binding + system-resolved result coordinate | `ANALYTIC` | `IC0` |
| `BUD-02 ListPendingBudgets` | `PUBLISHED_APP_HUMAN / PA` | exact app role `{admin,member}` | same exact Release/app/source authority; each response/page binds its own system-resolved coordinate; no cross-call/page snapshot pinning is promised | `ANALYTIC` | `IC0` |

No Product Agent, MAR JobRun or DEDICATED caller is admitted for `BUD-01/02` merely to exercise infrastructure.

---

# 9. Subtractive decisions and explicit non-operations

The first candidate had 117 admitted fixed-platform rows. The original ratified subtractive pass applied:

```text
117
- 1 IAM GrantPublishedAppAccess + ChangePublishedAppAccessRole
    → one IAM-15 SetPublishedAppAccess semantic operation
- 1 RunBrainHealthProbe
    → SYSTEM owner/proof orchestration
- 1 REL-03 ComposeRelease
    → SYSTEM owner transition gated by current accepted proof
= 114 operator-ratified 4A fixed operations
```

Executable-wire derivation then produced operator-approved `4B-F01`:

```text
114
- 1 WS-03 UpdateWorkspace
- 1 WS-06 UpdateArea
- 1 PRJ-04 UpdateProject
= 111 fixed operations after 4B-F01
```

W-01 authority-feasibility then produced operator-approved `4C-F02`:

```text
111
+ 1 Project candidate-review read
= 112 fixed operations after 4C-F02
```

W-01 visual-review feasibility then produced operator-approved `4C-F03`:

```text
112
+ 1 Project candidate-assistant read
= 113 fixed operations after 4C-F03
```

Both reads, and the investigation and Baseline-decision operations beside them,
were retired on 2026-09-19 when Project Inception and Baseline left the product.
This derivation records the platform count as it stood at each accepted
correction; it is not the current Product census, which is in section 5.

W-02A/W-02B bounded findings `4C-F05`, `4C-F06`, `4C-F07`, `4C-F09`, `4C-F10` each added zero operations while enriching existing accepted operations; the count remained 113 through W-02B closure.

W-03A authority-feasibility then produced operator-approved `4C-F11`:

```text
113
+ 1 IAM-18 ListWorkspaceMembershipCandidates
+ 1 IAM-19 GetWorkspaceMemberAccess
+ 1 IAM-20 GetAreaAccess
= 116 fixed Conexus platform Product operations after F11
```

W-03B, P-01 and P-02 F16–F18 then enriched existing operations without count change. P-02 F19 adds the one missing semantic-input catalog proved by the current frontend consumer:

```text
116
+ 1 GetProjectAnalyticQueryCatalog
= 117 fixed Conexus platform Product operations after F19
```

P-02 F20/F21 subsequently enrich existing PRJ-18/19 and PRJ-16/17 reads only; the count remains 117 through F21.

P-02 F22 then admits the separate physical read-only explorer family proved by the operator walkthrough:

```text
117
+ 1 PRJ-25 ListProjectDataExplorerSources
+ 1 PRJ-26 ListProjectDataExplorerObjects
+ 1 PRJ-27 GetProjectDataExplorerObject
+ 1 PRJ-28 ListProjectDataExplorerRows
= 121 fixed Conexus platform Product operations after F22
```

P-02 F23 then admits exactly one server-resolved Project Brain Context read proved by the whole-P-02 product walkthrough:

```text
121
+ 1 GetProjectBrainContext
= 122 current fixed Conexus platform Product operations
```

P-03 F30 then admits three exact Builder interactions for one typed Product Agent draft inside the existing Change owner:

```text
122
+ 1 BLD-18 GetChangeProductAgentDraft
+ 1 BLD-19 CreateChangeProductAgentDraft
+ 1 BLD-20 ReviseChangeProductAgentDraft
= 125 current fixed Conexus platform Product operations
```

P-04 F31–F34 then enrich existing Release/OBS reads and admits one distinct managed-job discovery read:

```text
125
+ 1 MAR-04 ListRunnableManagedJobs
= 126 current fixed Conexus platform Product operations
```

P-05 F35–F36 then enrich existing I&A grant reads/writes and admits one exact app-access candidate read:

```text
126
+ 1 IAM-21 ListPublishedAppAccessCandidates
= 127 current fixed Conexus platform Product operations
```

The operator-approved pre-P11 F05 correction then admits one Project-owned human model-policy discovery read:

```text
127
+ 1 PRJ-29 ListProjectModelPolicies
= 128 current fixed Conexus platform Product operations
```

The 2026-09-19 membership decision then subtracts the grant and Area families, because one membership row is now the only thing that grants anything:

```text
128
- 1 IAM-07 GrantAccountProjectAccess
- 1 IAM-08 RevokeAccountProjectAccess
- 1 IAM-09 AddAreaMember
- 1 IAM-11 GrantAreaProjectAccess
- 1 IAM-12 RevokeAreaProjectAccess
- 1 IAM-20 GetAreaAccess
- 1 WS-04 ListAreas
- 1 WS-05 CreateArea
= 120 current fixed Conexus platform Product operations
```

`IAM-10` is reused for `SetWorkspaceMemberRole`, and `IAM-05` and `IAM-06` keep their ids under the roster meaning that replaced them. Area was the only container between a Workspace and a Project, and nothing now derives access from it.

`PRJ-03`, `OBS-04`, `OBS-05`, `BLD-01`, `BLD-02`, `BLD-03`, `BLD-10`, `BLD-16`, `PRJ-16`, `PRJ-17`, `PRJ-18` and `PRJ-19` gained only bounded missing semantics required by real consumers; they remain the same Product operations. F11 adds two purpose-built reads that survive, because two independent access-administration read jobs remain proven; F22 adds exactly four reads because source discovery, scalable source-scoped object discovery, exact object structure and structured row browsing are independently bounded human reads and must not collapse into a generic provider/resource tree; PRE11-F05 adds exactly one Project-owned model-policy read because a required model-policy reference otherwise has no human-recognizable construction source.

Rejected convenience/mechanism operations include:

```text
CreateWorkflow
ExecuteWorkflow
GenericApprove
GenericRetry
GenericSync
GenericRefresh
SetAnyStatus
ExecuteCapability(anySlug, anyInput)
ExecuteSql
ExecuteProviderOperation(provider,name,payload)
ReadConnectionSecret
GetConnectionConfiguration
GetConnectionRevision
ListConnectionRevisions
TestConnection
ListConnectionQualifications
ListBindableConnections
ListBindableBrainRevisions
ListProjectAnalyticDatasets
GetProjectAnalyticDataset
GetConnectionHealth
SetConnectionActive
SetCurrentReleaseWithoutPromotion
MarkServedVerified
MarkChangeVerified
PublishBrainFromModelMemory
CreateProductAgentOutsideChange
GrantFromKeycloakRole
GetBlobByStorageKeyAsAuthorization
ReplayMissedSlots
CreateCron
ForceQueueRedelivery
MarkAgentRunCompleted
MarkEffectSucceeded
ActivateRecoveredSystem
ImportProjectAsSecondCreationMeaning
AttachOrSwitchProjectSource
ListProjectBaselineCandidates
CreateBaselineComment
CreateBaselineThread
PersistBaselineReviewSession
ResolveBrainDiscoveryCandidate
CreateBrainDraft
CreateDiscoverySession
BrowseBrainSourceTree
EditBrainSourceFile
CreateReviewProjectionDomain
SearchBrainKnowledge
ListBrainKnowledgeDomains
GetBrainKnowledgeConcept
GetAccessDashboard
ListAccountProjectGrants
SearchAudit
CreateRole
UpdateAccountProfile
RunProjectSqlConsole
```

---

# 10. Durable-record / owner closure

The supporting proof in `docs/evidence/4a/operation-coverage.md` classifies all 46 accepted durable record classes as `DIRECT`, `PROJECTION`, `INTERNAL` or `CARRIER` and preserves all 13 semantic owner boundaries.

```text
record classes checked                      = 46/46
unclassified                                = 0
record classes requiring CRUD by symmetry   = 0
mutable foreign-owner mirrors required      = 0
semantic owner boundaries preserved         = 13/13
```

F11 reuses existing `iam.account` and `iam.workspace_membership`, joined by `iam.workspace_invitation` as the only durable record the roster adds; F12 reuses existing `obs.audit_record`; F14/F15/F16/F20/F21 reuse existing Builder/Project owners/projections. Data logical fields/relationships/rules and Capability input/output inspection are projections of already-admitted Project/Release meaning, not new durable Product records. F22's source/object/structure/row views are current Project-owned disclosure projections over existing Project Database / exact bound source truth and introduce no explorer catalog/row durable record class or new semantic owner.

Artifact Registry remains semantic projection rather than Universal Artifact CRUD. Attachments/Blob remain owner-bound carriers. Gateway remains last-mile effect authority rather than a second business-command owner. PAR owns runtime, not authored Agent definition. MAR owns serving/job-run mechanics, not a generic scheduler Product domain.

---

# 11. Blueprint / Forge disposition

Current Product authority already has Project Inception/approved Baseline, Change, PlanningDepth/RigorProfile, Plan/checkpoints, Builder WorkUnit/ActorRun/CodingSession, Platform Consultant, independent verification and Release/Promotion.

Therefore:

```text
Blueprint as new semantic owner/domain = REJECT
Forge as new semantic owner/domain     = REJECT
Blueprint/Forge mandatory Product APIs = REJECT
planning-harness behavior              = PRESERVE as Project/Builder design input
possible UX labels/modes               = 4C only; labels cannot create authority
Paved Road realization                 = 4D
```

The bounded SoftwareForge review itself adds no Product operation, Permission, owner or trust boundary. F11/F12/F14/F15/F16/F17/F18/F19/F20/F21/F22/F23 are later interaction falsifiers and remain bounded to their existing I&A/Workspace/Project/OBS/Builder/Connections/Brain owners.

---

# 12. Historical closure assertions after independent review + bounded downstream corrections

```text
N_platform                              = 128
N_budget                                = 2
ordinary Permissions                    = 25
fixed operations with semantic owner    = 128/128
fixed operations with consumer          = 128/128
fixed operations with principal/ingress = 128/128
fixed operations with auth/scope route  = 128/128
fixed operations with outcome profile   = 128/128
fixed operations with exact IC profile  = 128/128
Budget operations with all fields       = 2/2
Project grammar exact-Release pinned     = yes
universal execute authority              = rejected
orphan concrete operations               = 0
speculative concrete operations          = 0
unresolved material 4A review findings   = 0
```

The original independent Fable review remains historical Evidence. Later bounded corrections preserve that history while changing current authority only where new downstream falsifiers proved it.

```text
4B-F01 OPERATOR ACCEPT
→ N_platform 114 → 111 by subtracting unclosed generic Workspace/Area/Project updates

4C-F02 OPERATOR ACCEPT
→ N_platform 111 → 112

4C-F03 OPERATOR ACCEPT
→ N_platform 112 → 113

4C-F05 / F06 / F07 OPERATOR ACCEPT
→ bounded Brain enrichment only
→ N_platform remains 113

4C-F09 / F10 OPERATOR ACCEPT
→ bounded Connections enrichment only
→ N_platform remains 113

4C-F11 OPERATOR ACCEPT
→ admit Account/Area human presentation
→ add IAM-18 ListWorkspaceMembershipCandidates
→ add IAM-19 GetWorkspaceMemberAccess
→ add IAM-20 GetAreaAccess
→ I&A derives effective Project access + exact DIRECT|AREA sources
→ admit narrow WS-04 / PRJ-01 access-administration summary disclosure
→ no new Permission / owner / principal / trust boundary / durable record class
→ N_platform 113 → 116

4C-F12 OPERATOR ACCEPT
→ preserve OBS-04 / OBS-05
→ add server-side period/actor/action/Project audit filters before pagination
→ add immutable append-time actor/subject presentation snapshots + human summary
→ no new operation / Permission / owner / principal / durable record class
→ N_platform remains 116

4C-F14 OPERATOR ACCEPT
→ preserve the existing BLD-03 Change intent on BLD-01/02 read projections
→ optionally bind BLD-16 to one exact current Change through untrusted changeId
→ keep project.build as the only BLD-16 authority route
→ no new operation / Permission / owner / principal / trust boundary / durable record class
→ N_platform remains 116

4C-F15 OPERATOR ACCEPT
→ preserve BLD-10 as the single Builder/MAR Preview read
→ no changeId returns CURRENT_PROJECT Preview over server-resolved current Project source
→ optional exact changeId returns CHANGE_CANDIDATE Preview
→ subjectDigest binds the exact current/candidate Preview subject
→ Build Preview remains distinct from Published-App serving and active Release
→ no new operation / Permission / owner / principal / trust boundary / durable record class
→ N_platform remains 116

4C-F16 OPERATOR ACCEPT
→ preserve PRJ-18/19 as the existing semantic Project Data reads
→ require server-owned nonblank human Data-resource name on summary/detail
→ preserve dataResourceId as exact machine identity
→ name remains presentation only
→ no new operation / Permission / owner / principal / trust boundary / durable record class
→ N_platform remains 116

4C-F20 OPERATOR ACCEPT
→ preserve PRJ-18/19 as the complete semantic Project Data-resource read family
→ add semantic resourceKind TABLE|VIEW|DATASET and sourceKind INTERNAL|INTEGRATION|DERIVED
→ PRJ-19 adds bounded logical fields/relationships/rules for human inspection
→ semantic structure remains distinct from physical table/schema/index/DDL/SQL/storage topology
→ no new operation / Permission / owner / principal / trust boundary / durable record class
→ N_platform remains 117

4C-F21 OPERATOR ACCEPT
→ preserve PRJ-16/17 as the complete Project Capability inspection family
→ add human name + purpose; PRJ-17 adds logical input/output field inspection
→ inspection does not grant invocation and creates no generic Run/Execute authority
→ no new operation / Permission / owner / principal / trust boundary / durable record class
→ N_platform remains 117

4C-F22 OPERATOR ACCEPT
→ preserve PRJ-18/19 as semantic Data-resource authority only
→ add PRJ-25 ListProjectDataExplorerSources
→ add PRJ-26 ListProjectDataExplorerObjects
→ add PRJ-27 GetProjectDataExplorerObject
→ add PRJ-28 ListProjectDataExplorerRows
→ project.data.read + exact Project/source/object disclosure eligibility; no new ordinary Permission
→ Project Database means Project-owned business/application data only
→ eligible integration source derives from exact current Project binding/source contract; browser cannot select Connection revision/environment
→ bounded typed filter/sort/pagination only; no SQL/expression/join/DML/DDL/export/credentials
→ no hub_control / owner-schema / Mastra / Keycloak / foreign Project/Workspace exposure
→ physical identity remains separate from semantic ProjectDataResource identity
→ no new owner / principal / trust boundary / durable record class
→ Project 23 → 27
→ N_platform 117 → 121

4C-F24 OPERATOR ACCEPT
→ preserve PRJ-20 as the one Project Agent collection read
→ ordinary PRJ-20/21 remain project.source.read
→ purpose-bound PRJ-20 alternate route requires exact Project + agent.trigger.manage
→ existing Agent summary/release/revision coordinates only; no PRJ-21/source/mutation authority
→ no new operation / Permission / owner / principal / trust boundary / durable record class
→ N_platform remains 122

4C-F25 OPERATOR ACCEPT
→ preserve PAR-08/09/10 and exact sealed-subject decision law
→ add immutable request-time Agent/Release presentation + safe action summary + requested/optional expiry times
→ recognition context does not require Project/source reads and is not current authorization truth
→ no raw Mastra/tool/provider payload or generic approval owner
→ no new operation / Permission / owner / principal / trust boundary / durable record class
→ N_platform remains 122

4C-F26 OPERATOR ACCEPT
→ preserve PAR-06/07 and owner-issued runState
→ add owner admittedAt + optional settledAt + safe human problem projection
→ order list by admittedAt DESC with stable agentRunId DESC tie-breaker before pagination
→ no inferred lifecycle enum / retry / resume / OBS join / Evidence parsing
→ no new operation / Permission / owner / principal / trust boundary / durable record class
→ N_platform remains 122

4C-F30 OPERATOR ACCEPT
→ enrich PRJ-21 with the safe complete authored ProductAgentDefinition; PRJ-20/22 remain summaries
→ add BLD-18 GetChangeProductAgentDraft
→ add BLD-19 CreateChangeProductAgentDraft with explicit NEW|EXISTING origin + idempotency
→ add BLD-20 ReviseChangeProductAgentDraft with expectedDraftRevision
→ structured/manual and Conexus authoring converge on the same Change candidate/diff/proof/Release
→ no direct Agent CRUD / source write / Mastra authority / generic extension payload
→ no new Permission / owner / principal / trust boundary / durable record class
→ Builder 17 → 20
→ N_platform 122 → 125

4C-F31 OPERATOR ACCEPT
→ preserve REL-01/02 as the Release collection/detail reads
→ add immutable releaseLabel + createdAt + sourceRevision + composition summary
→ page REL-01 newest-created-first
→ close one stable safe ReleaseManifest inspection projection without replacing realization authority
→ no new operation / Permission / owner / principal / trust boundary / durable record class

4C-F32 OPERATOR ACCEPT
→ preserve REL-04/05/06/07/08
→ REL-07 discloses the exact target-environment serving matrix
→ Promotion carries exact environment identity/label + request-time actor/time + optional settlement time
→ page/filter REL-04 chronologically; REL-06 accepts only a server-disclosed environmentId
→ purpose-bound release.promote may inspect REL-07 target/serving truth without acquiring project.read
→ no new operation / Permission / owner / principal / trust boundary / durable record class

4C-F33 OPERATOR ACCEPT
→ add MAR-04 ListRunnableManagedJobs
→ exact currently served Release + safe jobId/name/purpose/schedule presentation
→ ordinary project.read or purpose-bound job.run discovery; read grants no run/queue/schedule authority
→ MAR-03 remains the only run-now admission and still resolves served Release server-side
→ MAR 3 → 4
→ N_platform 125 → 126

4C-F34 OPERATOR ACCEPT
→ preserve OBS-01 as the one Project Activity collection read
→ add projection-time subject label + deterministic summary + optional exact admitted owner-read target
→ absent target means no truthful detail affordance; owner revalidates disclosure
→ no generic dispatch / Activity mutation / Audit replacement / current owner truth
→ no new operation / Permission / owner / principal / trust boundary / durable record class

4C-F35 OPERATOR ACCEPT
→ IAM-14 current grants and IAM-15 success carry canonical AccountSummary rather than opaque Account ID presentation
→ add IAM-21 ListPublishedAppAccessCandidates over existing I&A-owned Conexus Accounts not already granted
→ exact Project + bounded human query/page; candidate inclusion grants nothing
→ no browser/live Keycloak directory query; no-result never proves provider-identity existence
→ trusted IAM-03 Account provisioning remains separate from Published-App grant administration
→ IAM 19 → 20
→ N_platform 126 → 127

4C-F36 OPERATOR ACCEPT
→ IAM-14 carries both exact role options and each role's complete current active-Release capability subset
→ capability presentation = operationId + human name + purpose + regime
→ empty subset is truthful; browser labels never derive authorization
→ Keycloak role/group/Organization/token claims never become app role, capability or grant authority
→ no new operation / Permission / owner / principal / trust boundary / durable record class

4C-F37 OPERATOR ACCEPT
→ preserve PAR-01..04 and existing Conversation/ConversationMessage ownership
→ add owner createdAt, safe preview, startedAt/lastActivityAt and deterministic newest-active-first ordering
→ add typed TEXT | QUESTION messages, bounded response options and NONE | NEEDS_YOUR_RESPONSE attention
→ exact current question reply enters PAR-04 and starts a new AgentRun; clarification never borrows ApprovalRequest or ordinary-run suspension
→ no new operation / Permission / owner / principal / trust boundary / durable record class
→ PAR remains 16

4C-F38 OPERATOR ACCEPT
→ IAM-13 carries canonical current AccountSummary with exact app role/active Release
→ IAM-02 is admitted through both Control Plane and Published-App human surfaces with one opaque-session termination meaning
→ Conexus session end != global Keycloak SSO logout
→ no provider token/profile/role/group/Organization Product authority
→ no new operation / Permission / owner / principal / trust boundary / durable record class
→ IAM remains 20
```

```text
4C-PRE11-F03 OPERATOR ACCEPT
→ add transient TRUSTED_BOOTSTRAP_CONTEXT for exact preconfigured OIDC subject
→ IAM-03 bootstrap route self-provisions only that subject
→ WS-01 success establishes exact initial current-Account Workspace access
→ no new operation / ordinary Permission / semantic owner / durable record class

4C-PRE11-F05 OPERATOR ACCEPT
→ PRJ-16/17 gain purpose-bound project.build disclosure only
→ add PRJ-29 ListProjectModelPolicies under Project owner
→ optional unowned Agent refs empty for NEW and preserved for EXISTING
→ Project 27 → 28
→ N_platform 127 → 128
→ ordinary Permissions remain 25
```

The historical 4A/4C closure above remains preserved at its recorded 128-operation count. The current bounded Builder consumer adds the following operation mapping:

```text
CURRENT INTERNAL MVP PREVIEW PREPARATION CONSUMER
→ add BLD-21 PrepareBuildPreview under the existing Builder owner
→ exact Project + verified Change candidate subjectDigest + server-derived Account/session
→ explicit Origin/CSRF-protected preparation command returns only attempt/state/expiry and prepared artifact identity
→ BLD-10 remains the sole Preview read and may passively project one exact candidate preparation
→ PREPARED does not set BLD-10 ready before MAR serving
→ no new Permission / owner / principal / durable record class
→ Builder 20 → 21
→ N_platform 128 → 129
```

```text
CURRENT INTERNAL MVP PREVIEW LAUNCH CONSUMER
→ add BLD-22 LaunchBuildPreview under the existing Builder owner
→ exact PREPARED attempt/artifact coordinates plus server-derived Account/session
→ immutable MAR route and single-use I&A entry grant; no compilation or mutable current-route pointer
→ Builder 21 → 22
→ N_platform 129 → 130
```

```text
MEMBERSHIP IS THE ONLY GRANT, 2026-09-19 OPERATOR ACCEPT
→ add IAM-04 ListWorkspaceMembers as the Workspace roster, members and pending invitations in one read
→ add IAM-05 InviteWorkspaceMember keyed by (Workspace, verified email); the same request twice is the same invitation
→ add IAM-06 RemoveWorkspaceRosterEntry for a member or a pending invitation
→ add IAM-10 SetWorkspaceMemberRole over the two roles owner and member
→ subtract IAM-07, IAM-08, IAM-09, IAM-11, IAM-12, IAM-20, WS-04, WS-05 and the Area concept
→ WS-01 drops its platform-operator condition; any authenticated Account may create a Workspace and becomes its owner
→ IAM-03 drops its platform-operator branch; an account is minted for the first configured identity or for an invited verified email, with its membership in the same transaction
→ no new Permission / owner / principal / trust boundary; iam.workspace_invitation is the one added durable record class
→ N_platform 130 → 126
```

The current Product census is the 24-operation surface at the start of this ledger. The retained tables below are not current Product authority.
