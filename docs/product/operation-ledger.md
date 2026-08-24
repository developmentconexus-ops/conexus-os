# Conexus OS — Product Operation Ledger

> **Status:** CURRENT / OPERATOR RATIFIED / `4B-F01` + `4C-F02` + `4C-F03` + `4C-F05` + `4C-F06` + `4C-F07` + `4C-F09` + `4C-F10` + `4C-F11` + `4C-F12` + `4C-F14` + `4C-F15` + `4C-F16` + `4C-F17` + `4C-F18` + `4C-F19` + `4C-F20` + `4C-F21` BOUNDED CORRECTIONS ACCEPTED
> **Authority:** derived only from current accepted Product/architecture authority routed by `docs/index.md`, the 4A contract, the operator-approved first Budget Analyzer semantic contract and the operator-approved bounded downstream corrections named above.
> **Mutable program status:** owned only by `docs/roadmap.md`.

This ledger is the canonical 4A Product-operation authority. It is intentionally **not** HTTP/OpenAPI, frontend, database, SDK or runtime design and it does not authorize Product implementation.

The ledger closes three different surfaces because Conexus is a software-publishing platform rather than one fixed business application:

```text
fixed Conexus platform operations = 117
Project-defined operations        = exact finite Ops(R) admitted by the grammar in §4
first Budget Analyzer operations  = 2
ordinary Conexus Permissions      = 25 (owned by permission-contract.md)
```

The numbers are derivation results, not targets. The original 4A candidate survived independent Fable challenge and explicit operator ratification. During executable-wire derivation, `4B-F01` materially falsified three generic mutation rows because no accepted Product authority defined their mutable property sets; the operator explicitly approved their bounded subtraction. During W-01 frontend authority-feasibility work, `4C-F02` then proved that accepted Journey B could not be completed truthfully without creation-time source bootstrap, caller-expressible Inception intent and one durable exact candidate-Baseline read. The later operator-approved `4C-F03` proved that a coherent visual Baseline review loop additionally requires exact-candidate refinement input and one exact candidate-bound contextual explanation surface under Baseline-management authority. During W-02 Brain authority-to-interaction derivation, operator-approved `4C-F05`, `4C-F06` and `4C-F07` enriched existing Brain intake/detail reads without changing Brain ownership or operation count. During W-02B, operator-approved `4C-F09` and `4C-F10` enriched existing Connections current configuration, test applicability and human diagnostics without changing Connections topology. During W-03 authority-feasibility, operator-approved `4C-F11` proved that access administration requires human Account/Area presentation plus three purpose-built I&A reads for membership candidates, exact member effective access and exact Area access; `4C-F12` proved that immutable Audit must be server-filterable and preserve append-time human presentation snapshots rather than relying on browser-local filtering or current-name lookup. During P-01 Builder authority-feasibility, operator-approved `4C-F14` proved that the already-authored Change intent must remain present on Change reads and that existing `BLD-16` must optionally bind one exact current Change when contextual assistance is Change-scoped. During P-01 P9 authority tracing, operator-approved `4C-F15` then proved that the existing Builder Preview read must represent either the server-resolved current Project source Preview or, when an optional exact `changeId` is supplied, that Change candidate Preview. During P-02 authority-feasibility, operator-approved `4C-F16` proved that existing Project Data-resource reads require a server-owned nonblank human presentation name while preserving `dataResourceId` as the exact machine identity. Operator-approved `4C-F17` then proved that existing ProjectConnectionBinding reads require human Connection presentation and that the existing `CON-03` collection read must support a purpose-bound exact-Project binding-selection disclosure under `project.manage + connection.use` without turning `connection.use` into generic `connection.read`. Operator-approved `4C-F18` likewise proved that an admitted `PRJ-11` Project Brain-binding manager needs purpose-bound immutable revision selection through the existing `BRN-02` summary without turning `brain.bind` into generic `brain.read`. Operator-approved `4C-F19` proved that `BRN-12 RunAnalyticQuery` requires one current binding-bound human-discoverable semantic-input catalog because no existing Product read exposes the canonical dataset/semantic IDs its deterministic request requires. The first P-02 functional walkthrough then produced operator-approved `4C-F20` and `4C-F21`: existing Data reads must expose bounded logical structure and source/resource classification sufficient to inspect Project-owned, integration-backed and derived Data without becoming a physical database explorer; existing Capability reads must expose human name/purpose plus logical inputs/outputs sufficient to understand an admitted capability without creating generic execution authority. F14–F18/F20/F21 add no operation; F19 adds exactly one fixed Brain read and no new Permission, owner, principal, trust boundary or durable record class. All unaffected 4A semantics remain preserved.

---

## 1. Surface closure

### 1.1 Fixed platform census

```text
N_platform = 117
platform operations with named owner       = 117
platform operations with real consumer     = 117
platform operations with authority mapping = 117
orphaned platform operations                = 0
speculative platform operations             = 0
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

`AnalyticQuery` is not an arbitrary Project slug. It remains the fixed Brain-governed platform read regime `BRN-12`.

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

# 5. Fixed Conexus platform census

The tables below are the exact 117 current Product operations. IDs deliberately remain stable around subtracted candidates so review history does not silently renumber authority.

## 5.1 Identity & Access — 19

| ID | Operation | Owner | Consumer / authority root | Class |
| --- | --- | --- | --- | --- |
| `IAM-01` | `GetControlPlaneAccessContext` | I&A | Control Plane shell; current Account session and disclosable context | read |
| `IAM-02` | `EndSession` | I&A | authenticated human; exact current Conexus session | command |
| `IAM-03` | `ProvisionAccount` | I&A | trusted platform operator/admin; stable external identity + bounded human presentation | command |
| `IAM-04` | `ListWorkspaceMembers` | I&A | Workspace access administration; human Account summaries | read |
| `IAM-05` | `AddWorkspaceMember` | I&A | exact Workspace membership administration | command/current-authority |
| `IAM-06` | `RemoveWorkspaceMember` | I&A | exact Workspace; narrowing | narrowing command/current-authority |
| `IAM-07` | `GrantAccountProjectAccess` | I&A | exact Workspace + contained Project | command/current-authority |
| `IAM-08` | `RevokeAccountProjectAccess` | I&A | exact Project; narrowing | narrowing command/current-authority |
| `IAM-09` | `AddAreaMember` | I&A | exact Area in Workspace | command |
| `IAM-10` | `RemoveAreaMember` | I&A | exact Area; narrowing | narrowing command |
| `IAM-11` | `GrantAreaProjectAccess` | I&A | exact Area + Project in same Workspace | command/current-authority |
| `IAM-12` | `RevokeAreaProjectAccess` | I&A | exact Area + Project; narrowing | narrowing command/current-authority |
| `IAM-13` | `GetPublishedAppAccessContext` | I&A | exact Published App human; current app access/role | read |
| `IAM-14` | `ListPublishedAppAccess` | I&A | Project/app administration; business use not implied | read |
| `IAM-15` | `SetPublishedAppAccess` | I&A | exact Project/app + Account + `{admin,member}` + expected current grant state, including explicit absent state on create | command/current-authority |
| `IAM-17` | `RevokePublishedAppAccess` | I&A | exact current app grant; narrowing | narrowing command/current-authority |
| `IAM-18` | `ListWorkspaceMembershipCandidates` | I&A | exact Workspace access administration; currently disclosable existing Account candidates | read |
| `IAM-19` | `GetWorkspaceMemberAccess` | I&A | exact Workspace + member Account; current Area memberships, direct grants and I&A-derived effective Project access with exact sources | read/current-authority projection |
| `IAM-20` | `GetAreaAccess` | I&A | exact Workspace + Area; current members and Area→Project grants with human summaries | read/current-authority projection |

`IAM-16 ChangePublishedAppAccessRole` was subtracted into `IAM-15`: grant and role change are one Product meaning over `iam.published_app_access`; wire-level create/update/precondition detail belongs to 4B.

### 5.1.1 `4C-F11` — human-reviewable access administration

W-03A P7 proved that the accepted membership/grant writes cannot be safely operated from a human frontend while Account and Area presentation is opaque and the I&A owner exposes no exact current effective-access reads.

The operator accepted `CURRENT OWNERS CONFIRMED`:

```text
iam.account
→ accountId remains stable machine identity
→ verified external identity mapping remains authentication identity
→ required nonblank displayName
→ optional email presentation/contact

ws.area
→ required nonblank Area.name at creation

IAM-18
→ human existing Account candidates for exact Workspace membership administration

IAM-19
→ exact member current access
→ Area memberships
→ direct Project grants
→ effective Project access derived by I&A
→ exact source set DIRECT and/or AREA + exact Area identity

IAM-20
→ exact Area current members + Project grants
```

Access composition law:

```text
I&A current membership/grant facts
→ I&A derives effective Project access + source set
→ browser renders that projection

browser-local joins -X-> effective authorization authority
```

Narrow cross-owner summary disclosure is admitted only for the existing access-administration job:

```text
WS-04 ListAreas
→ workspace.manage ordinary route
OR workspace.access.manage summary-only route

PRJ-01 ListProjects
→ project.read ordinary route
OR workspace.access.manage exact-Workspace ProjectSummary-only route
```

The alternate `PRJ-01` route does not confer Project content/source/data/build authority. Account/Area labels never authorize, email is never Account identity, and Keycloak role/group/organization remains authentication-provider state rather than Conexus authorization.

No `Person`, `UserProfile`, generic RBAC/custom-role engine, generic grant CRUD family, `UpdateAccountProfile`, `RenameArea`, `WS-06` resurrection, new Permission, new semantic owner, new principal class, new trust boundary or new durable record class is admitted by F11.

```text
N_platform 113 → 116
IAM 16 → 19
Permissions = 25
records = 46
owners = 13
```

## 5.2 Workspace — 4

| ID | Operation | Owner | Consumer / authority root | Class |
| --- | --- | --- | --- | --- |
| `WS-01` | `CreateWorkspace` | Workspace | trusted F1 operator/first-access flow | command |
| `WS-02` | `GetWorkspace` | Workspace | current Workspace member/admin disclosure | read |
| `WS-04` | `ListAreas` | Workspace | exact Workspace structure administration **or** narrow access-administration AreaSummary disclosure | read |
| `WS-05` | `CreateArea` | Workspace | exact Workspace administration; explicit human Area name at creation | command |

`WS-03 UpdateWorkspace` and `WS-06 UpdateArea` remain subtracted by operator-approved `4B-F01`. F11 proves creation/read presentation (`Area.name`) and does not admit generic mutation or rename authority.

No `DeleteWorkspace`, `DeleteArea`, generic Organization tree or hidden/default Workspace operation is admitted.

## 5.3 Project — 23

| ID | Operation | Owner | Consumer / authority root | Class |
| --- | --- | --- | --- | --- |
| `PRJ-01` | `ListProjects` | Project | Workspace Projects surface under ordinary disclosure **or** exact-Workspace access-administration ProjectSummary-only disclosure | read |
| `PRJ-02` | `GetProject` | Project | exact Project disclosure/access | read |
| `PRJ-03` | `CreateProject` | Project + accepted L7 composition | exact Workspace; atomically establishes Project + initial I&A grant + one canonical Project source bootstrap | command/cross-owner atomic |
| `PRJ-05` | `ArchiveProject` | Project | exact Project archive authority; does not unpublish/stop automations | command/current-state |
| `PRJ-06` | `DuplicateProject` | Project | source authority + destination Workspace create authority; default NO DATA; no credential/binding copy | command/cross-scope |
| `PRJ-07` | `RunInceptionInvestigation` | Project | exact greenfield/brownfield Project + caller intent; optional refinement binds explicit human review feedback to one exact immutable prior candidate while source/context remain server-resolved | investigation command |
| `PRJ-08` | `GetApprovedProjectBaseline` | Project | exact Project/Baseline disclosure | read |
| `PRJ-09` | `ApproveProjectBaselineRevision` | Project | exact candidate Baseline digest + current approval authority | decision/current-state |
| `PRJ-10` | `GetProjectBrainBinding` | Project | exact pinned binding + validation/update state | read |
| `PRJ-11` | `SetProjectBrainBinding` | Project + accepted L7 composition | exact immutable Brain revision + conformance + Project authority | command/current-state |
| `PRJ-12` | `ClearProjectBrainBinding` | Project | exact current binding; narrowing | narrowing command |
| `PRJ-13` | `ListProjectConnectionBindings` | Project | exact Project disclosure with server-composed human Connection presentation; binding identity remains exact machine coordinates | read |
| `PRJ-14` | `SetProjectConnectionBinding` | Project + accepted L7 composition | exact qualified compatible ConnectionRevision/environment | command/current-state |
| `PRJ-15` | `RemoveProjectConnectionBinding` | Project | exact current binding; narrowing | narrowing command |
| `PRJ-16` | `ListProjectCapabilities` | Project projection | exact authored/Release capabilities with human name/purpose; inspection only, no invocation grant | read |
| `PRJ-17` | `GetProjectCapability` | Project projection | exact Project/capability identity + human purpose + logical input/output contract; inspection only | read |
| `PRJ-18` | `ListProjectDataResources` | Project | declared Project Data resources with exact machine identity + server-owned human presentation + semantic resource/source classification | read/provenance |
| `PRJ-19` | `GetProjectDataResource` | Project | exact Data resource identity/presentation + grain/freshness/coverage/provenance + logical fields/relationships/rules | read/provenance |
| `PRJ-20` | `ListProjectProductAgents` | Project projection | authored Agent identities/revisions/Release state | read |
| `PRJ-21` | `GetProjectProductAgent` | Project projection | exact Agent authoring identity/revisions/Release refs | read |
| `PRJ-22` | `ListWorkspaceProductAgents` | Project-owned filtered projection | Workspace access-filtered catalog; no Workspace Agent owner | read |
| `PRJ-23` | `GetProjectBaselineCandidate` | Project | exact candidate Baseline human review/re-entry by Project + candidate digest before approval | read |
| `PRJ-24` | `AskConexusAboutBaselineCandidate` | Project | exact immutable candidate Baseline contextual explanation for the current Baseline-management reviewer; generated visual-selection context is untrusted and revalidated | read/assistant interaction |

`PRJ-04 UpdateProject` remains subtracted. F11's alternate PRJ-01 access-administration route reveals only exact contained `ProjectSummary` identity needed to administer grants; it is not generic `project.read` and does not restore Project mutation.

`PRJ-18/19` remain declared semantic Data-resource projections. F20 permits bounded logical resource structure needed by the Project Data consumer; it still does not create a generic physical database explorer, SQL console or storage-topology surface.

### 5.3.1 `4C-F02` — Project source/Inception/Baseline correction

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

PRJ-07 RunInceptionInvestigation
→ requires one non-blank human intent
→ intent expresses the current objective/users/constraints in ordinary language
→ source selection remains server-resolved from already-admitted Project authority
→ no repository URL/source ID/arbitrary Connection/SQL/target URL input is admitted
→ produces the exact candidate Baseline representation for immediate review

PRJ-23 GetProjectBaselineCandidate
→ exact Project + candidateBaselineDigest
→ durable read of that immutable candidate for refresh/re-entry before decision
→ returns candidate digest + sourceRevision + sourceText + ApplicationRuntimeProfile
```

Binding negative laws:

```text
successful Project create -X-> partially initialized Project awaiting source attach
post-create source switching/editing = NOT ADMITTED
multi-repo F1 = NOT ADMITTED
Repository CRUD/Product owner = NOT ADMITTED
Git credentials in Product source input = FORBIDDEN
PRJ-07 source-selection authority = FORBIDDEN
candidate list/CRUD/workflow domain = NOT ADMITTED
browser cache/localStorage = NEVER candidate-Baseline authority
```

`PRJ-23` is one new read because a real human consumer needs durable exact candidate review after refresh/re-entry. No new ordinary Permission, semantic owner, principal class or durable record class is created. Candidate source remains Project-Git/immutable-byte authority projected by the Project owner.

### 5.3.2 `4C-F03` — Baseline visual review / contextual refinement correction

W-01 visual-review Evidence proved two additional missing Product properties and no broader review domain.

```text
PRJ-07 RunInceptionInvestigation
→ ordinary first investigation still requires human intent only
→ refinement may additionally name exactly one priorCandidateBaselineDigest
→ refinement requires explicit non-blank reviewFeedback about that exact candidate
→ priorCandidateBaselineDigest and reviewFeedback are all-or-nothing
→ server re-resolves exact candidate containment/current Project authority
→ Candidate A is never mutated; successful refinement produces a new immutable Candidate B
→ HTML/DOM/annotation/Mastra state is never candidate authority

PRJ-24 AskConexusAboutBaselineCandidate
→ exact Project + candidateBaselineDigest + non-blank question
→ optional candidate-local generated review context may identify a projection anchor / selected rendered text
→ review context is untrusted presentation context and must be revalidated against the exact candidate
→ response is read-only contextual explanation with candidate identity + provenance
→ no mutation, approval, grant, Builder authority or hidden Project state transition
```

Binding negative laws:

```text
feedback hidden inside free-form intent -X-> exact-candidate lineage
chat message -X-> Baseline mutation
HTML/DOM selector -X-> Product identity
generated review anchor -X-> Product authority
Mastra RequestContext/thread/memory -X-> Baseline truth
project.manage -X-> project.build
BLD-16 -X-> Baseline-management authority by frontend convenience
BaselineComment/BaselineThread/ReviewSession CRUD = NOT ADMITTED
candidate list/CRUD/workflow domain = NOT ADMITTED
```

`PRJ-24` is one new read/assistant interaction because a real Baseline-management reviewer needs to ask about the exact immutable candidate without acquiring the distinct `project.build` authority of Builder `BLD-16`. `4C-F03` creates zero new ordinary Permissions, semantic owner classes, principal classes, trust boundaries or durable record classes. Visual anchors and conversation continuity remain generated/local/cognitive mechanisms; Project owner truth stays candidate-digest bound.

### 5.3.3 `4C-F16` — Data human identity

P-02 authority-feasibility proved that `PRJ-18/19` expose exact Data-resource machine identity and semantic/provenance axes but did not guarantee a human-recognizable presentation identity. The operator accepted `CURRENT STRUCTURE CONFIRMED`: Project remains the owner and the existing reads remain the complete Product operation family.

Binding semantic property:

```text
PRJ-18 / PRJ-19
→ server-owned required nonblank Data resource name
→ dataResourceId remains exact machine identity
→ name = presentation only
→ name -X-> routing / authorization / containment / uniqueness authority
```

No physical database explorer, generic metadata editor, new operation, Permission, owner, principal, trust boundary or durable record class is admitted by `4C-F16`.

```text
F16 new operations = 0
Project remains 23
N_platform = 116
ordinary Permissions remain 25
records remain 46
```

### 5.3.4 `4C-F17` — Project Connection binding recognition and purpose-bound selection disclosure

P-02 authority-feasibility proved two coupled human-operability gaps: an existing `ProjectConnectionBinding` had no guaranteed human Connection presentation, and a caller admitted to perform `PRJ-14` under `project.manage + connection.use` could not obtain a narrow candidate list without also gaining the broader `connection.read` Permission. The operator accepted `CURRENT STRUCTURE CONFIRMED`: Project remains binding owner, Connections remains Connection owner, and existing `PRJ-13/14` plus `CON-03` remain the operation family.

```text
PRJ-13 / PRJ-14 response
→ ProjectConnectionBinding gains server-composed connectionName
→ binding identity remains connectionId + connectionRevisionId + environment
→ connectionName = presentation only

CON-03 ordinary disclosure
→ connection.read

CON-03 purpose-bound Project binding-selection disclosure
→ exact target Project context
→ project.manage + connection.use
→ same lightweight Connection[] projection
→ Workspace-owned candidate remains constrained to the exact target Project/Workspace authority
→ Project-owned candidate must be owned by that same exact Project
```

Purpose-bound negative laws:

```text
connectionName -X-> binding identity / routing / authorization
connection.use -X-> generic connection.read
purpose-bound CON-03 -X-> CON-04 configuration
purpose-bound CON-03 -X-> credentials / connection.manage / connection.qualify
purpose-bound CON-03 -X-> qualification history / qualification matrix
purpose-bound CON-03 -X-> cross-Workspace or sibling-private Connection disclosure
```

The existing current `Connection.connectionTest` is sufficient for the F1 candidate presentation only when all exact coordinates agree:

```text
connectionTest.state = PASSED
AND candidate revision = currentRevisionId
AND selected binding environment = connectionTest.environment
```

This is a presentation eligibility cue, not write authority. `PRJ-14` always revalidates exact qualified compatible ConnectionRevision/environment and current Project/binding authority at submit time.

No `ListBindableConnections`, generic ResourceBinding framework, qualification-history family, new operation, Permission, owner, principal, trust boundary or durable record class is admitted by `4C-F17`.

```text
F17 new operations = 0
Project remains 23
Connections remains 9
N_platform = 116
ordinary Permissions remain 25
records remain 46
```

### 5.3.5 `4C-F20` — Data semantic structure inspectability

The first P-02 functional walkthrough proved that a human-recognizable Data resource name plus grain/freshness/coverage/provenance is insufficient for the intended Project Data job. A Project may own application data directly, consume integration-backed data, or expose derived governed data; the operator needs to understand that distinction and inspect the resource's logical structure without receiving physical database authority.

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

Explicitly rejected:

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
Project remains 23
N_platform remains 117
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
Project remains 23
N_platform remains 117
ordinary Permissions remain 25
records remain 46
```

## 5.4 Builder — 17

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

A generic `AcceptChange` is rejected. `bld.change_acceptance` remains an owner current-proof fact produced by exact checkpoints/verifier/Builder settlement. Direct `CreateWorkUnit`, plan-JSON patch, `SetWorkItemStatus`, `CreateActorRun`, `ResumeSandbox` and `MarkVerified` are owner/runtime mechanics.

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
N_platform remains 116
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
N_platform = 116
ordinary Permissions remain 25
records remain 46
```

## 5.5 Brain — 12

| ID | Operation | Owner | Consumer / authority root | Class |
| --- | --- | --- | --- | --- |
| `BRN-01` | `GetWorkspaceBrain` | Brain | exact Workspace Brain disclosure | read |
| `BRN-02` | `ListBrainRevisions` | Brain/Registry projection | ordinary exact Workspace Brain history under `brain.read`, or purpose-bound immutable revision selection for one exact target Project under `project.manage + brain.bind` | read |
| `BRN-03` | `GetBrainRevision` | Brain/Registry projection | exact immutable revision + deterministic human-readable review content + deterministic structured source-bound knowledge browse of its exact sourceRevision | read |
| `BRN-04` | `StartBrainDiscovery` | Brain | exact Workspace/Project + admitted read-only source scope; proposals remain hypotheses | investigation command |
| `BRN-05` | `ListKnowledgeProposals` | Brain | exact Workspace Brain review visibility | read/review |
| `BRN-06` | `GetKnowledgeProposal` | Brain | exact proposal + provenance/hypothesis state + deterministic human-readable review projection of its exact candidateSourceRevision | read/review |
| `BRN-07` | `SubmitKnowledgeProposal` | Brain | source-backed exact candidate+provenance **or** Discovery-backed exact discovery candidate + explicit human resolution; Brain re-resolves provenance/materializes candidate source; never self-publishes | command |
| `BRN-08` | `DecideKnowledgeProposal` | Brain | exact proposal + current human review authority | decision/current-state |
| `BRN-09` | `PublishBrainRevision` | Brain | exact reviewed/validated candidate → immutable revision | consequential command/current-proof |
| `BRN-10` | `GetBrainHealth` | Brain | exact Brain/binding context; preserves `UNVERIFIED/VALID/SUSPECT/INVALID/CHECK_ERROR` | read/provenance |
| `BRN-12` | `RunAnalyticQuery` | Brain/Gateway governed read regime | exact Project + Brain binding + curated dataset + semantic IDs + admitted caller route | analytic read |
| `BRN-13` | `GetProjectAnalyticQueryCatalog` | Brain + accepted Project binding/data composition | exact current Project semantic-input disclosure for BRN-12 under current Brain binding + curated analytical admission | read/provenance |

`BRN-11 RunBrainHealthProbe` is `SYSTEM_OWNER_TRANSITION`: owner/proof orchestration may produce health Evidence but is not a caller Product command. No generic discovery-session owner, vector/RAG search operation, free-form SQL, memory publication or machine semantic approval is admitted.

### 5.5.1 `4C-F05` — Discovery-backed KnowledgeProposal intake

W-02A proved that accepted Brain Discovery could not reach durable proposal review truthfully when `BRN-07` required a pre-existing source revision for every caller. The operator accepted the Global-Maximum outcome `CURRENT STRUCTURE CONFIRMED`: Brain remains the semantic owner and `BRN-07 SubmitKnowledgeProposal` remains the one proposal-intake operation.

Two mutually exclusive semantic intake forms are admitted:

```text
source-backed
→ exact existing candidateSourceRevision + provenance
→ submit that Brain-owned candidate for review

Discovery-backed
→ exact discovery candidate
+ explicit human resolution
→ Brain owner revalidates exact discovery context/provenance
→ Brain owner materializes the exact candidateSourceRevision
→ same durable KnowledgeProposal result
```

Binding laws:

```text
BRN-04 Discovery remains read-only hypothesis/provenance work
Discovery-backed browser input -X-> candidateSourceRevision authority
Discovery-backed browser input -X-> caller-supplied provenance authority
human resolution = explicit non-blank semantic confirmation/correction/resolution
KnowledgeProposal remains durable proposal truth after submission
BRN-08 remains exact proposal review decision
BRN-09 remains exact reviewed-candidate publication
proposal submission -X-> publication
Project Builder / Project Git -X-> Workspace Brain source ownership
```

No `ResolveBrainDiscoveryCandidate`, `BrainDraft`, `DiscoverySession`, interview-thread Product domain, new operation, new ordinary Permission, new principal class or new durable record class is admitted by `4C-F05`. If a real durable pre-submission draft/collaboration consumer appears later, reopen only that exact Brain-authoring decision.

### 5.5.2 `4C-F06` — exact source-bound human review content

W-02A P7/data-feasibility proved that the existing exact Brain detail reads carried machine identity, state and provenance but not the human-readable meaning an authorized reviewer must inspect after refresh/re-entry. The operator accepted `CURRENT STRUCTURE CONFIRMED`: Brain remains the semantic/source owner and `BRN-03` / `BRN-06` remain the correct detail reads.

Binding semantic property:
```text
exact sourceRevision / candidateSourceRevision
→ Brain-owned deterministic human-readable read projection
→ reviewer can inspect the exact meaning represented by that source
```

The wire spelling selected downstream is `reviewText`, but 4A owns only its semantic property:

```text
review content = nonblank human-readable deterministic projection
review content derives from the exact named Brain source revision
review content is read-only presentation content
review content -X-> canonical Brain source
review content -X-> source/revision/digest identity
review content -X-> proposal decision subject
review content -X-> publication subject
```

Decision/current-state authority remains unchanged:

```text
BRN-08 DecideKnowledgeProposal → exact proposalRevision/current reviewer authority
BRN-09 PublishBrainRevision     → exact reviewed candidateSourceRevision
```

No Brain file/tree browser/editor, Project Builder source reuse, generic cross-owner `ReviewProjection` Product domain, new operation, new ordinary Permission, new principal or new durable record class is admitted by `4C-F06`. Rich rendering, projection compilation, generated anchors and shared mechanism remain downstream interaction/4D questions and never become Brain Product authority by presentation convenience.

### 5.5.3 `4C-F07` — exact source-bound structured knowledge browse

W-02A P9 proved that plain human review prose is not enough to implement the operator-approved `Knowledge → Domain → Concept` browse without making the frontend infer semantic hierarchy from `reviewText`, rendered DOM or Brain Git. The operator accepted `CURRENT STRUCTURE CONFIRMED`: Brain remains the semantic/source owner and `BRN-03 GetBrainRevision` remains the exact published-revision detail read.

Binding semantic property:

```text
exact sourceRevision
→ Brain-owned deterministic structured source-bound browse/review projection
→ business-aligned domain/namespace grouping
→ business concept recognition + human summary/detail
→ canonical content-class attribution where relevant
→ explicit disclosable provenance
```

The structured projection must expose enough server-owned truth for the approved human experience without selecting physical Brain-Git topology. At 4A the required semantic roles are:

```text
domain coordinate + human label
concept coordinate + human label + summary
canonical content-class attribution from SEMANTIC | KNOWLEDGE | EVIDENCE_SPEC
human review sections sufficient for definition/business meaning/calculation/grain/relationships/rules/caveats/verification when present
explicit provenance references when disclosable
```

Projection coordinates are scoped to the exact source revision and support rendering/local navigation only:

```text
domain/concept projection coordinate -X-> canonical Brain source identity
domain/concept projection coordinate -X-> semantic-ID authority
domain/concept projection coordinate -X-> proposal decision subject
domain/concept projection coordinate -X-> publication subject
```

Current F1 does not admit a separate Brain catalog/search/pagination Product family merely to implement this browse. Local find/filter may operate only over already-disclosed structured revision truth. Reopen list/detail/search/pagination only when a real locked consumer proves the whole-revision detail read insufficient for response size, latency, independent disclosure or exact concept re-entry.

Decision/current-state authority remains unchanged:

```text
BRN-08 DecideKnowledgeProposal → exact proposalRevision/current reviewer authority
BRN-09 PublishBrainRevision     → exact reviewed candidateSourceRevision
ProjectBrainBinding             → separately pins exact immutable Brain revision
```

No new Product operation, Permission, semantic owner, principal class, trust boundary or durable record class is admitted by `4C-F07`. Browser Brain-Git access, `reviewText`/DOM parsing as semantic authority, vector/RAG catalog authority and a generic cross-owner ReviewProjection domain remain rejected.

### 5.5.4 `4C-F18` — Project Brain binding revision-selection disclosure

P-02 authority-feasibility proved that a principal may hold the exact `PRJ-11` write authority `project.manage + brain.bind` while lacking generic `brain.read`, leaving no honest human route to choose the immutable Brain revision being adopted. The operator accepted reuse of `BRN-02 ListBrainRevisions` rather than a screen-shaped parallel operation.

```text
BRN-02 ordinary disclosure
→ brain.read

BRN-02 purpose-bound Project Brain-binding selection disclosure
→ exact target Project context
→ project.manage + brain.bind
→ same immutable BrainRevision[] summary
→ server revalidates Workspace/Project containment

brain.bind -X-> generic brain.read
purpose-bound BRN-02 -X-> BRN-03 knowledgeBrowse
purpose-bound BRN-02 -X-> proposal / review / publication / Brain mutation authority
```

`PRJ-11` remains the final binding authority and revalidates the exact immutable revision, Project containment/conformance and current binding subject at submit time. The alternate disclosure provides selection information only; stale summaries never become binding authority.

No `ListBindableBrainRevisions`, BRN-03 widening, new operation, Permission, owner, principal, trust boundary or durable record class is admitted by `4C-F18`.

```text
F18 new operations = 0
Brain remains 11
Project remains 23
N_platform = 116
ordinary Permissions remain 25
records remain 46
```

### 5.5.5 `4C-F19` — Project AnalyticQuery semantic-input catalog

P-02 authority-feasibility proved that `BRN-12 RunAnalyticQuery` is a deterministic governed analytical executor whose request requires canonical `datasetSemanticId + selectSemanticIds[]`, but no accepted Product read exposes the exact current Project-admitted IDs with human presentation. `BRN-03` browse coordinates are revision-local navigation coordinates and explicitly not canonical semantic identity; `PRJ-18/19` cannot absorb Brain-owned semantic authority under `project.data.read` alone.

The operator accepted exactly one new read:

```text
BRN-13 GetProjectAnalyticQueryCatalog
→ exact target Project
→ current Project Brain binding
→ brain.read + project.data.read
→ current server-derived admitted semantic query choices
→ projectId + brainRevisionId + brainDigest + projectBindingDigest
→ datasets[]
   → datasetSemanticId + human label
   → selectableSemantics[]
      → semanticId + human label
```

Authority/freshness law:

```text
label = presentation only
canonical semantic IDs = exact BRN-12 request coordinates after server revalidation
catalog read = current projection, never durable browser authority
binding/semantic change after read may invalidate a later submit
BRN-12 always revalidates current Project grant/binding/health/dataset/semantic admission
```

Explicitly rejected in F1:

```text
List + Get analytic-dataset operation family
natural-language analytic planner
arbitrary SQL / expressions
physical tables / schemas / joins
semantic-search API
metric/dimension framework without a proved consumer
pagination without evidenced scale need
conceptRef promoted to canonical semanticId
frontend-owned semantic catalog
```

```text
F19 new operations = 1
Brain 11 → 12
N_platform 116 → 117
ordinary Permissions remain 25
new owners = 0
new durable records = 0
```

## 5.6 Connections — 9

| ID | Operation | Owner | Consumer / authority root | Class |
| --- | --- | --- | --- | --- |
| `CON-01` | `ListConnectorDefinitions` | Connections/platform-pack projection | admitted Connector definitions | read |
| `CON-02` | `GetConnectorDefinition` | Connections/platform-pack projection | exact Connector version/definition | read |
| `CON-03` | `ListConnections` | Connections | ordinary exact Workspace/Project collection under `connection.read`, or purpose-bound exact-Project binding-selection summary under `project.manage + connection.use`; current derived Connection-test applicability remains presentation truth only | read |
| `CON-04` | `GetConnection` | Connections | exact Connection + ownerScope containment + exact currentRevisionId-bound non-secret configuration + current derived Connection-test applicability | read |
| `CON-05` | `CreateConnection` | Connections | exact ownerScope/owner + Connector; no sibling reuse | command |
| `CON-06` | `ReviseConnection` | Connections | exact current logical Connection → immutable/new revision semantics; successful revision makes prior test basis stale | command/current-state |
| `CON-07` | `SetConnectionCredential` | Connections + CredentialBackend boundary | exact Connection; write-only secret boundary; successful replacement advances server-owned logical credential generation and makes prior test basis stale | consequential write-only command |
| `CON-08` | `QualifyConnection` | Connections | exact ConnectionRevision/environment + server-resolved current logical credential generation + real source Evidence | proof command |
| `CON-09` | `GetConnectionQualification` | Connections | exact revision/credential-generation/environment test result + human diagnostic/remediation + Evidence; configured/qualified/bound/healthy remain distinct | read/provenance |

No secret read, arbitrary TestURL, generic credential fetch/executor or cross-Workspace share operation is admitted.

### 5.6.1 `4C-F09` — current non-secret configuration inspectability

W-02B P7 authority/data feasibility proved that accepted create/revise semantics already made provider-specific non-secret configuration durable Connection-revision meaning, but the existing exact Connection detail read did not expose that current meaning after refresh/re-entry. The operator accepted `CURRENT STRUCTURE CONFIRMED`: Connections remains the semantic owner and `CON-04 GetConnection` remains the exact logical Connection detail read.

Binding semantic property:

```text
exact logical Connection
+ exact currentRevisionId
→ Connections-owned provider-specific non-secret configuration for that exact current revision
→ authorized human can inspect current truth and initialize an intentional CON-06 revision draft
```

Protected boundaries:

```text
Connection.name = logical human presentation identity
configuration = non-secret current revision meaning
credentialConfigured = non-secret credential-presence fact only
credential = write-only secret material through CON-07
qualification = separate exact revision/environment Evidence
ProjectConnectionBinding = separate Project-owned use/binding truth
Gateway health/effect admission = separate runtime truth

configuration -X-> credential material
configuration presence -X-> qualification
credentialConfigured -X-> qualification
configured != qualified != bound != healthy != caller-authorized
```

`CON-03 ListConnections` and `CON-05 CreateConnection` remain lightweight projections and do not carry full provider configuration merely by schema reuse. `CON-07` remains write-only with no plaintext/ciphertext/handle readback. Current F1 does not admit a generic Connection revision-history browser, rollback, `GetConnectionConfiguration`, `GetConnectionRevision`, rename/delete authority, qualification history or synthesized `latestQualification` merely to implement this current-detail consumer.

No new Product operation, ordinary Permission, semantic owner, principal class, trust boundary or durable record class is admitted by `4C-F09`; at its closure `N_platform` remained 113.

### 5.6.2 `4C-F10` — current test applicability and human diagnostics

The W-02B functional P8 walkthrough proved that exact qualification Evidence alone does not close the human job “does this Connection work now, and if not why?” after refresh/re-entry. The operator accepted `CURRENT STRUCTURE CONFIRMED`: Connections remains the owner; `CON-08 QualifyConnection` remains the one real provider/source proof job; `CON-09 GetConnectionQualification` remains the exact result read.

Binding semantic properties:

```text
CON-08
→ caller supplies exact connectionRevisionId + environment only
→ Connections resolves the current logical credential generation server-side
→ existing ConnectionQualification binds exact revision + credential generation + environment + testedAt

CON-09
→ exact qualification result preserves owner-specific qualificationState + Evidence
→ additionally exposes stable human outcome PASSED | FAILED | INDETERMINATE
→ additionally exposes deterministic human diagnostic title/message and optional remediation
```

Connections derives a small current test-applicability projection for `CON-03` / `CON-04`:

```text
NOT_TESTED
= no prior qualification is available

NEEDS_RETEST
= prior qualification exists but its exact ConnectionRevision and/or logical credential generation no longer match current Connection truth

PASSED | FAILED | INDETERMINATE
= the projected qualification basis still matches the current revision + logical credential generation
```

This is **test applicability**, never a generic Connection lifecycle or runtime-health state. Old qualification Evidence remains durable when configuration or credentials change; only its current applicability changes.

Logical credential generation is a non-secret Connections-owned coordinate:

```text
logical credential generation -X-> credential bytes
logical credential generation -X-> crypto key version
logical credential generation -X-> transient provider access token
caller -X-> choose credential generation for CON-08
```

Protected negative laws:

```text
qualification passed -X-> Connected
qualification passed -X-> Active / Ready / Healthy
qualification passed -X-> Project bound
qualification passed -X-> caller authorized
frontend evidenceRefs parsing -X-> diagnostic authority
configuration or credential change -X-> old qualification remains current
```

The Control Plane may label `CON-08 QualifyConnection` as **Test connection** and `CON-09` as **Test result / View problem** without creating a second Product operation.

No new Product operation, ordinary Permission, semantic owner, principal class, trust boundary or durable record class is admitted by `4C-F10`. At its closure `N_platform` remained 113; F11 later raises the current whole-platform count independently.

## 5.7 Release / Promotion / serving — 7

| ID | Operation | Owner | Consumer / authority root | Class |
| --- | --- | --- | --- | --- |
| `REL-01` | `ListReleases` | Release | exact Project version disclosure | read |
| `REL-02` | `GetRelease` | Release | exact immutable Release composition | read |
| `REL-04` | `ListPromotions` | Release | exact Project/environment history | read |
| `REL-05` | `GetPromotion` | Release | exact Promotion history/current state | read |
| `REL-06` | `PromoteRelease` | Release | exact Release + environment + current proof/conformance + expected pointer generation | consequential decision/current-state |
| `REL-07` | `GetProjectServingState` | Release/MAR projection | exact active pointer + served verification; AVAILABLE != served | read/provenance |
| `REL-08` | `GetEnvironmentConformance` | Release | exact target PG/privileges/migrations/config/bindings/current pointer checks | read/proof |

`REL-03 ComposeRelease` is `SYSTEM_OWNER_TRANSITION`: exact accepted proof causes owner-controlled immutable composition; no separate human command is required. Rollback is another governed `PromoteRelease` to an eligible prior Release. Pointer setting and served verification are not direct caller operations.

## 5.8 Product Agent Runtime — 16

| ID | Operation | Owner | Consumer / authority root | Class |
| --- | --- | --- | --- | --- |
| `PAR-01` | `ListConversations` | PAR | exact Project/Agent + current Published-App disclosure | read |
| `PAR-02` | `GetConversation` | PAR | exact Conversation + current Project/Agent/app authority | read |
| `PAR-03` | `CreateConversation` | PAR | exact active Release + Agent + current app access | command |
| `PAR-04` | `SendProductAgentTurn` | PAR | exact Conversation + current app/Agent/Release authority; admits exact AgentRun | consequential command |
| `PAR-05` | `RunProductAgentHeadless` | PAR | exact active Release/Agent + explicit headless authority | consequential command |
| `PAR-06` | `ListAgentRuns` | PAR | exact Project/Agent/Conversation + current disclosure | read/provenance |
| `PAR-07` | `GetAgentRun` | PAR | exact AgentRun; `COMPLETED != every effect succeeded` | read/provenance |
| `PAR-08` | `ListApprovalRequests` | PAR | current eligible approver UX; exact Project/AgentRun disclosure | read/approval |
| `PAR-09` | `GetApprovalRequest` | PAR | current eligible approver or separately authorized investigator; exact sealed subject/current state | read/approval |
| `PAR-10` | `DecideApprovalRequest` | PAR | current eligible human shown the exact sealed proposal; surface does not confer eligibility | decision/current-authority |
| `PAR-11` | `ListAgentTriggers` | PAR | exact Project/Agent trigger administration | read |
| `PAR-12` | `GetAgentTrigger` | PAR | exact TriggerRevision/current state | read |
| `PAR-13` | `CreateScheduleTrigger` | PAR | exact active/evolvable Agent + current Project authority | command |
| `PAR-14` | `ReviseScheduleTrigger` | PAR | exact current TriggerRevision + authority | command/current-state |
| `PAR-15` | `EnableAgentTrigger` | PAR | exact TriggerRevision + active Project/Release/current authority | consequential command/current-state |
| `PAR-16` | `DisableAgentTrigger` | PAR | exact TriggerRevision; explicit narrowing allowed for archived Project | narrowing command |

Agent authoring stays in `BLD-03` + normal Change/Release. Mastra thread/tool-registry/runtime snapshot/provider IDs and owner terminal transitions are not Product operations.

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
| `GW-01` | `ListEffectAttempts` | Gateway | exact Project/originating run/operation + audit disclosure; no retry authority | read/effect evidence |
| `GW-02` | `GetEffectAttempt` | Gateway | exact EffectAttempt receipt/reconciliation/provenance; preserves `OUTCOME_UNKNOWN` | read/effect evidence |

Effect admission, idempotency claim, resume/reconciliation are owner-internal after an admitted business command. Generic Retry/MarkSucceeded/ResolveUnknown shortcuts are rejected.

## 5.10 Managed Application Runtime — 3

| ID | Operation | Owner | Consumer / authority root | Class |
| --- | --- | --- | --- | --- |
| `MAR-01` | `ListManagedJobRuns` | MAR | exact Project + Release/job filters | read |
| `MAR-02` | `GetManagedJobRun` | MAR | exact JobRun + pinned Release/job/current state | read/provenance |
| `MAR-03` | `RunManagedJobNow` | MAR | exact currently served Release + admitted `job/v1` + current authority | command/occurrence |

Queue/redelivery/catch-up/single-flight mechanics remain owner/runtime behavior. No CreateCron, ReplayMissedSlots, ForceRedelivery or MarkJobSucceeded Product operation is admitted.

## 5.11 Observability & Audit — 5

| ID | Operation | Owner | Consumer / authority root | Class |
| --- | --- | --- | --- | --- |
| `OBS-01` | `ListProjectActivity` | OBS/Audit projection | exact Project disclosure; entries reference owner facts | read |
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

The operator-approved `docs/product/budget-analyzer-contract.md` closes the first Project-defined operation set:

| ID | Operation | Regime | Owner | Consumer | Product authority |
| --- | --- | --- | --- | --- | --- |
| `BUD-01` | `AnalyzePendingBudgets` | registered `Query` | Budget Analyzer Project/Product semantic contract | Published-App human | exact active Budget Analyzer Release; current app access; role `{admin,member}`; exact ProjectConnectionBinding/Brain mapping + system-resolved result coordinate |
| `BUD-02` | `ListPendingBudgets` | registered `Query` | Budget Analyzer Project/Product semantic contract | Published-App human | same exact Release/app/source authority; each response/page has its own disclosed system-resolved result coordinate |

`AnalyzePendingBudgets` returns exactly the closed R1–R5 analytical snapshot under the admitted filter set; it is not arbitrary metrics/dimensions/group-by/SQL. `ListPendingBudgets` returns R6 drilldown. F1 does not promise cross-call or cross-page snapshot pinning: a changed result coordinate must remain visible and mixed-coordinate data must not be represented as one coherent snapshot. Neither operation admits arbitrary historical reconstruction through caller-selected `as_of`.

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
| `IAM-01` | `HUMAN_ACCOUNT_SESSION / CP` | `authenticated` | exact current Conexus session; server resolves only disclosable Workspace/Project context | `READ` | `IC0` |
| `IAM-02` | `HUMAN_ACCOUNT_SESSION / CP` | `authenticated` | exact current session subject | `COMMAND` | `IC1` |
| `IAM-03` | `HUMAN_ACCOUNT_SESSION / CP` | trusted `platform_operator` | trusted F1 provisioning boundary; stable provisioned external identity + human presentation/uniqueness prevents duplicate Account creation; no public signup | `COMMAND` | `IC3` |
| `IAM-04..12,IAM-18..20` | `HUMAN_ACCOUNT_SESSION / CP` | `workspace.access.manage` | exact Workspace/Area/Project containment; access reads are exact current I&A projections; grant/revoke target and current authority rechecked at commit | read rows `READ`; writes `COMMAND` | reads `IC0`; writes `IC1` |
| `IAM-13` | `PUBLISHED_APP_HUMAN / PA` | exact app access + role | exact Published App + active Release; app role never implies Control Plane authority | `READ` | `IC0` |
| `IAM-14` | `HUMAN_ACCOUNT_SESSION / CP` | `project.manage` | exact Project/app administration | `READ` | `IC0` |
| `IAM-15,IAM-17` | `HUMAN_ACCOUNT_SESSION / CP` | `project.manage` | exact Project/app/Account subject; current grant state includes explicit absent state for create and exact current role/grant for change/revoke | `COMMAND` | `IC2` |
| `WS-01` | `HUMAN_ACCOUNT_SESSION / CP` | trusted `platform_operator` | trusted first-access Workspace creation | `COMMAND` | `IC3` |
| `WS-02` | `HUMAN_ACCOUNT_SESSION / CP` | current Workspace membership | exact Workspace disclosure | `READ` | `IC0` |
| `WS-04` | `HUMAN_ACCOUNT_SESSION / CP` | `workspace.manage` **or** narrow `workspace.access.manage` access-administration summary disclosure | exact Workspace; alternate route reveals AreaSummary identity only for access administration | `READ` | `IC0` |
| `WS-05` | `HUMAN_ACCOUNT_SESSION / CP` | `workspace.manage` | exact Workspace + explicit human Area name + stable create intake; duplicate intake cannot create duplicate Area | `COMMAND` | `IC3` |
| `PRJ-01` | `HUMAN_ACCOUNT_SESSION / CP` | ordinary `project.read` **or** narrow `workspace.access.manage` access-administration summary disclosure | ordinary route applies current Project disclosure; alternate route exposes only contained ProjectSummary identities in exact Workspace | `READ` | `IC0` |
| `PRJ-02` | `HUMAN_ACCOUNT_SESSION / CP` | `project.read` + exact Project grant | exact Project disclosure | `READ` | `IC0` |
| `PRJ-03` | `HUMAN_ACCOUNT_SESSION / CP` | `project.create` | destination Workspace + atomic Project/initial-grant + one canonical source-bootstrap admission; success implies a source-complete Project | `COMMAND` | `IC3` |
| `PRJ-05` | `HUMAN_ACCOUNT_SESSION / CP` | `project.manage` | exact current Project; archive preserves independent serving/automation laws | `COMMAND` | `IC2` |
| `PRJ-06` | `HUMAN_ACCOUNT_SESSION / CP` | source `project.manage` + destination `project.create` | source Project + destination Workspace; NO DATA/no credentials/no bindings by default | `COMMAND` | `IC3` |
| `PRJ-07` | `HUMAN_ACCOUNT_SESSION / CP` | `project.manage`; plus `connection.use` only when an already-admitted external source context actually requires it | exact inception Project + non-blank human intent + server-resolved admitted source/context; optional refinement requires exact prior candidate + explicit review feedback; investigation cannot publish authority directly | `PROOF` | `IC3` |
| `PRJ-08,PRJ-09,PRJ-10,PRJ-12,PRJ-13,PRJ-15,PRJ-23,PRJ-24` | `HUMAN_ACCOUNT_SESSION / CP` | `project.manage` | exact Project/current or candidate Baseline/binding subject; PRJ-13 binding responses may compose Connection presentation but gain no Connection management/read authority; PRJ-24 is exact candidate-bound read-only explanation; removals are narrowing | reads `READ`; decisions/writes `DECISION/COMMAND` | reads `IC0`; writes `IC2` |
| `PRJ-11` | `HUMAN_ACCOUNT_SESSION / CP` | `project.manage + brain.bind` | exact immutable Brain revision + current conformance + exact Project binding subject | `DECISION` | `IC2` |
| `PRJ-14` | `HUMAN_ACCOUNT_SESSION / CP` | `project.manage + connection.use` | exact qualified compatible ConnectionRevision/environment + current Project binding | `DECISION` | `IC2` |
| `PRJ-16,PRJ-17` | `HUMAN_ACCOUNT_SESSION / CP` | `project.read` | exact Project + capability identity; human name/purpose and logical input/output contract are inspection truth only and do not grant invocation | `READ` | `IC0` |
| `PRJ-18,PRJ-19` | `HUMAN_ACCOUNT_SESSION / CP` | `project.data.read` | exact declared Data resource + admitted source/read-model scope; human name, resource/source kind and logical fields/relationships/rules are disclosed semantic inspection truth only, never physical topology or authorization | `PROVENANCE_READ` | `IC0` |
| `PRJ-20,PRJ-21` | `HUMAN_ACCOUNT_SESSION / CP` | `project.source.read` | exact Project/Agent authored identity/revision | `READ` | `IC0` |
| `PRJ-22` | `HUMAN_ACCOUNT_SESSION / CP` | `project.read` | Workspace-filtered Project-owned Agent disclosure; no fleet owner | `READ` | `IC0` |
| `BLD-01..04,BLD-06,BLD-10,BLD-16,BLD-17` | `HUMAN_ACCOUNT_SESSION / CP` | `project.build` | exact Project/Change human intent/Plan/current-or-candidate Preview/current selected context; BLD-10 and BLD-16 may optionally narrow to one exact current Change without widening authority | reads `READ`; `BLD-03` `COMMAND` | reads `IC0`; `BLD-03` `IC3` |
| `BLD-05,BLD-11..15` | `HUMAN_ACCOUNT_SESSION / CP` | `project.review` | exact Change/Plan/Finding/Evidence subject + current eligibility | reads `READ`; decisions `DECISION` | reads `IC0`; decisions `IC2` |
| `BLD-07..09` | `HUMAN_ACCOUNT_SESSION / CP` | `project.source.read` | exact immutable/current source revision/path/lineage | `READ` | `IC0` |
| `BRN-01,BRN-03,BRN-10` | `HUMAN_ACCOUNT_SESSION / CP` | `brain.read` | exact Workspace Brain/detail/health disclosure; BRN-03 includes exact-source deterministic human-readable review content plus structured source-bound knowledge browse | `PROVENANCE_READ` | `IC0` |
| `BRN-02` | `HUMAN_ACCOUNT_SESSION / CP` | ordinary `brain.read`; purpose-bound alternate `project.manage + brain.bind` | ordinary route exposes exact Workspace immutable revision history; alternate requires exact target Project and returns only immutable BrainRevision summaries for binding selection, never BRN-03 knowledgeBrowse/proposal/publication authority | `READ` | `IC0` |
| `BRN-04` | `HUMAN_ACCOUNT_SESSION / CP` | `brain.discover`; plus `connection.use` for external source | exact Workspace/Project/source scope; hypotheses only | `PROOF` | `IC3` |
| `BRN-05,BRN-06,BRN-08` | `HUMAN_ACCOUNT_SESSION / CP` | `brain.review` | exact proposal/review subject + current reviewer authority; BRN-06 includes exact-candidate-source deterministic human-readable review content | reads `READ`; decision `DECISION` | reads `IC0`; decision `IC2` |
| `BRN-07` | `HUMAN_ACCOUNT_SESSION / CP` | `brain.propose` | exact Workspace Brain; source-backed exact candidate/provenance or Discovery-backed exact candidate + explicit human resolution; Brain re-resolves Discovery provenance/materializes candidate source; cannot self-publish | `COMMAND` | `IC3` |
| `BRN-09` | `HUMAN_ACCOUNT_SESSION / CP` | `brain.publish` | exact reviewed/validated candidate + current publication authority | `DECISION` | `IC2` |
| `BRN-12` Control Plane route | `HUMAN_ACCOUNT_SESSION / CP` | `brain.read + project.data.read` | exact Project + Brain binding + curated dataset + semantic IDs + current Project grant | `ANALYTIC` | `IC0` |
| `BRN-12` Published-App route | `PUBLISHED_APP_HUMAN / PA` | exact Release-declared app role subset | exact active Release + app access + Brain/dataset projection | `ANALYTIC` | `IC0` |
| `BRN-12` Agent route | `PAR_AGENT_RUN_CONTEXT / PAR_TOOL` | exact ToolProjection | exact active AgentRun/Release/Brain/dataset projection | `ANALYTIC` | `IC0` |
| `BRN-13` | `HUMAN_ACCOUNT_SESSION / CP` | `brain.read + project.data.read` | exact Project + current Brain binding + curated analytical admission; catalog is a current server projection and does not become durable browser authority | `READ` | `IC0` |
| `CON-01..04,CON-09` | `HUMAN_ACCOUNT_SESSION / CP` | ordinary `connection.read`; `CON-03` additionally admits purpose-bound `project.manage + connection.use` | ordinary route uses exact Connector/Connection/revision/environment/ownerScope disclosure; purpose-bound CON-03 requires exact target Project and returns only the existing lightweight summary; CON-04 additionally exposes current non-secret configuration; CON-09 exposes exact test basis + human diagnostic/remediation + Evidence | `CON-09` `PROVENANCE_READ`; others `READ` | `IC0` |
| `CON-05..07` | `HUMAN_ACCOUNT_SESSION / CP` | `connection.manage` | exact ownerScope/current Connection; credential is write-only; CON-06 revision or CON-07 credential replacement makes an older test basis non-current | `COMMAND`/`CONSEQUENTIAL` | `CON-05` `IC3`; `CON-06` `IC2`; `CON-07` `IC3` |
| `CON-08` | `HUMAN_ACCOUNT_SESSION / CP` | `connection.qualify` | exact ConnectionRevision/environment + server-resolved current logical credential generation + real provider/source Evidence | `PROOF` | `IC3` |
| `REL-01,REL-02,REL-04,REL-05,REL-07` | `HUMAN_ACCOUNT_SESSION / CP` | `project.read` | exact Project/Release/Promotion/serving disclosure | `REL-07` `PROVENANCE_READ`; others `READ` | `IC0` |
| `REL-06` | `HUMAN_ACCOUNT_SESSION / CP` | `release.promote` | exact Release/environment + current proof/conformance + expected pointer generation; repeatable promotion intake cannot manufacture duplicate Promotion/effect | `CONSEQUENTIAL` | `IC2 AND IC3` |
| `REL-08` | `HUMAN_ACCOUNT_SESSION / CP` | `release.promote` | exact target-environment conformance subject; read grants no pointer mutation | `PROOF` | `IC0` |
| `PAR-01..04` | `PUBLISHED_APP_HUMAN / PA` | exact app access/role + active Release/Agent | exact Project/Agent/Conversation/Release scope | reads `READ`; `PAR-03` `COMMAND`; `PAR-04` `CONSEQUENTIAL` | reads `IC0`; create/turn `IC3`; downstream effects additionally `IC4` |
| `PAR-05` | `HUMAN_ACCOUNT_SESSION / HEADLESS` | `agent.headless.invoke` | exact active Release/Agent + current headless admission | `CONSEQUENTIAL` | `IC3`; downstream effects `IC4` |
| `PAR-06,PAR-07` | `HUMAN_ACCOUNT_SESSION / CP` or `PUBLISHED_APP_HUMAN / PA` | Control Plane `project.read` or exact in-scope app access | exact AgentRun/Conversation/Project disclosure | `PAR-07` `PROVENANCE_READ`; `PAR-06` `READ` | `IC0` |
| `PAR-08` | `HUMAN_ACCOUNT_SESSION / CP` or `PUBLISHED_APP_HUMAN / PA` | `agent.effect.approve` + exact current approver eligibility | exact Project/AgentRun/ApprovalRequest scope; PA additionally requires current app access/Release; app role alone is never approval authority | `READ` | `IC0` |
| `PAR-09` | eligible approver via `CP` or `PA`, or `HUMAN_ACCOUNT_SESSION / CP` investigator | approver route: `agent.effect.approve` + exact current eligibility; investigator route: `audit.read` | exact sealed ApprovalRequest/proposal digest; investigator is read-only; PA app role alone is never approval authority | `PROVENANCE_READ` | `IC0` |
| `PAR-10` | `HUMAN_ACCOUNT_SESSION / CP` or `PUBLISHED_APP_HUMAN / PA` | `agent.effect.approve` + exact current approver eligibility | exact sealed proposal + current revocation/Release/eligibility recheck; changed subject requires new request; PA additionally requires current app access/Release | `DECISION` | `IC2/IC4` |
| `PAR-11..16` | `HUMAN_ACCOUNT_SESSION / CP` | `agent.trigger.manage` | exact Project/Agent/TriggerRevision; archive blocks creation/enable but narrowing disable remains allowed | reads `READ`; writes `COMMAND` | reads `IC0`; create `IC3`; revise/enable `IC2`; disable `IC1` |
| `GW-01,GW-02` | `HUMAN_ACCOUNT_SESSION / CP` | `audit.read` | exact Project + originating run/operation/effect subject; no retry authority | `PROVENANCE_READ` | `IC0` (underlying effect owner uses `IC4`) |
| `MAR-01,MAR-02` | `HUMAN_ACCOUNT_SESSION / CP` | `project.read` | exact Project/Release/job/JobRun | `MAR-02` `PROVENANCE_READ`; `MAR-01` `READ` | `IC0` |
| `MAR-03` | `HUMAN_ACCOUNT_SESSION / CP` | `job.run` | exact currently served Release + admitted job + normal single-flight/coalesce laws | `COMMAND` | `IC3` |
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
- 1 BRN-11 RunBrainHealthProbe
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
+ 1 PRJ-23 GetProjectBaselineCandidate
= 112 fixed operations after 4C-F02
```

W-01 visual-review feasibility then produced operator-approved `4C-F03`:

```text
112
+ 1 PRJ-24 AskConexusAboutBaselineCandidate
= 113 fixed operations after 4C-F03
```

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
+ 1 BRN-13 GetProjectAnalyticQueryCatalog
= 117 current fixed Conexus platform Product operations
```

P-02 F20/F21 subsequently enrich existing PRJ-18/19 and PRJ-16/17 reads only; the current count remains 117.

`PRJ-03`, `PRJ-07`, `BRN-02`, `BRN-03`, `BRN-06`, `BRN-07`, `CON-03`, `CON-04`, `CON-07`, `CON-08`, `CON-09`, `OBS-04`, `OBS-05`, `BLD-01`, `BLD-02`, `BLD-03`, `BLD-10`, `BLD-16`, `PRJ-13`, `PRJ-14`, `PRJ-16`, `PRJ-17`, `PRJ-18` and `PRJ-19` gained only bounded missing semantics required by real consumers; they remain the same Product operations. F11 adds exactly three purpose-built reads because three independent access-administration read jobs are proven; F19 adds exactly one purpose-built read because BRN-12's human semantic-input discovery is otherwise impossible from Product authority.

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
ListAreaMembers
ListAreaProjectGrants
ListAccountProjectGrants
SearchAudit
CreateRole
UpdateAccountProfile
RenameArea
BrowsePhysicalProjectSchema
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

F11 reuses existing `iam.account`, membership/grant records and `ws.area`; F12 reuses existing `obs.audit_record`; F14/F15/F16/F17/F18/F19/F20/F21 reuse existing Builder/Project/Connections/Brain owners/projections. BRN-13 is a current projection, not a new durable catalog record. Data logical fields/relationships/rules and Capability input/output inspection are projections of already-admitted Project/Release meaning, not new durable Product records. None admits a new durable record class or owner.

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

The bounded SoftwareForge review itself adds no Product operation, Permission, owner or trust boundary. F11/F12/F14/F15/F16/F17/F18/F19/F20/F21 are later interaction falsifiers and remain bounded to their existing I&A/Workspace/Project/OBS/Builder/Connections/Brain owners.

---

# 12. Closure assertions after independent review + bounded downstream corrections

```text
N_platform                              = 117
N_budget                                = 2
ordinary Permissions                    = 25
fixed operations with semantic owner    = 117/117
fixed operations with consumer          = 117/117
fixed operations with principal/ingress = 117/117
fixed operations with auth/scope route  = 117/117
fixed operations with outcome profile   = 117/117
fixed operations with exact IC profile  = 117/117
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
→ add PRJ-23 and source-complete Project/Inception semantics
→ N_platform 111 → 112

4C-F03 OPERATOR ACCEPT
→ add PRJ-24 and exact-candidate refinement semantics
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
→ preserve PRJ-18/19 as the existing Project Data reads
→ require server-owned nonblank human Data-resource name on summary/detail
→ preserve dataResourceId as exact machine identity
→ name remains presentation only
→ no new operation / Permission / owner / principal / trust boundary / durable record class
→ N_platform remains 116

4C-F17 OPERATOR ACCEPT
→ preserve Project-owned concrete ProjectConnectionBinding authority
→ enrich disclosed binding responses with server-composed connectionName presentation
→ preserve CON-03 as the one Connection collection operation
→ ordinary CON-03 remains connection.read
→ purpose-bound CON-03 requires exact target Project + project.manage + connection.use
→ connection.use -X-> generic connection.read
→ no ListBindableConnections / qualification-history matrix / new Permission / owner / record
→ N_platform remains 116

4C-F18 OPERATOR ACCEPT
→ preserve BRN-02 as the one immutable Brain revision list
→ ordinary BRN-02 remains brain.read
→ purpose-bound BRN-02 requires exact target Project + project.manage + brain.bind
→ summary-only immutable revision disclosure; BRN-03 knowledgeBrowse remains separately governed
→ brain.bind -X-> generic brain.read
→ no ListBindableBrainRevisions / new Permission / owner / record
→ N_platform remains 116

4C-F19 OPERATOR ACCEPT
→ add exactly BRN-13 GetProjectAnalyticQueryCatalog
→ exact Project + current Brain binding + curated semantic-input projection
→ brain.read + project.data.read; no new ordinary Permission
→ human labels remain presentation; canonical semantic IDs remain BRN-12 request coordinates
→ no SQL / physical topology / natural-language planner / semantic-search family
→ no new owner / principal / trust boundary / durable record class
→ Brain 11 → 12
→ N_platform 116 → 117

4C-F20 OPERATOR ACCEPT
→ preserve PRJ-18/19 as the complete Project Data read family
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
```

4A remains **operator-ratified as boundedly corrected through `4C-F21`**. 4B must preserve the canonical 117-operation machine wire/checker/projection stack while P-02 remains open for revised P8 operator walkthrough. Product implementation remains blocked.