# 4B Evidence — Project Schema Closure

> **Kind:** bounded 4B executable Evidence; not Product authority by itself.
> **Accepted semantic source:** current operator-ratified 4A Product authority plus accepted Project/data/Brain/Connection/Release ownership contracts.
> **Machine authority under proof:** `contracts/api/product/openapi.yaml` resolved graph.

## 1. Decision question

> Can all accepted Project Product operations be given exact HTTP request/success/Problem shapes without recreating the subtracted generic Project mutation or inventing a generic binding/data/runtime authority?

## 2. Exact slice

Current Project slice at the original 4B closure:

```text
PRJ-01
PRJ-02
PRJ-03
PRJ-05 → PRJ-22
```

Original total:

```text
21 operations
```

`PRJ-04 UpdateProject` remains absent after operator-approved `4B-F01`. Later bounded 4C corrections add `PRJ-23/24`, so the current Project Product slice is 23 operations; the original counts below remain historical Evidence rather than current census authority.

Canonical active Path Items for this slice:

```text
contracts/api/product/project-paths.yaml
```

They are authority only through the canonical `contracts/api/product/openapi.yaml` entrypoint and resolved bundle graph.

## 3. Closure laws proved

### 3.1 Project identity and creation

`CreateProject` has no speculative generic metadata request body. The accepted interaction establishes a Project in the exact Workspace plus current owner/grant composition; it does not imply a hidden `name/settings/metadata` mutation vocabulary.

The original resulting representation carried only the minimum current identity/state needed by the then-accepted surface. Later `4C-F01` added bounded human Project presentation without resurrecting generic mutation.

`projectRevision` is the explicit current-subject coordinate already routed by the accepted carrier assessment for command-subpath mutation protection.

### 3.2 Archive is narrowing, not destructive deletion

`ArchiveProject` requires the caller-observed current Project revision explicitly because the command subpath is not the Project representation itself.

No permanent-delete Product operation or generic Project patch reappears.

### 3.3 Duplicate defaults to NO DATA

The duplication request chooses only the destination Workspace.

The wire does not expose speculative switches such as:

```text
copyData
copyCredentials
copyConnectionBindings
dataMode
```

The success contract makes the accepted F1 default explicit:

```text
businessDataPolicy = NO_DATA
```

Credentials, current Connection bindings, runtime sessions/history and external authorization remain outside duplication.

### 3.4 Inception uses admitted Project sources

`RunInceptionInvestigation` does not accept caller-selected URLs, arbitrary Connections, source IDs or SQL merely to make investigation configurable. Current admitted Project/source authority is resolved server-side.

### 3.5 Approved Baseline

The approved Baseline response closes:

```text
baselineDigest
sourceRevision
sourceText
applicationRuntimeProfile
```

The runtime-profile vocabulary is exactly:

```text
MANAGED
DEDICATED
```

`ApproveProjectBaselineRevision` names the exact candidate digest being accepted; approval does not create a second Baseline store or editable DTO authority.

### 3.6 Brain binding conditional semantics

`GetProjectBrainBinding` returns the exact current binding with an `ETag`.

`SetProjectBrainBinding` is the accepted `CURRENT_OR_ABSENT` case over the same target representation:

```text
present binding → If-Match
absent binding  → If-None-Match: *
```

Exactly one present/absent precondition is required by the Conexus extension guard.

`ClearProjectBrainBinding` remains the truthful same-target literal `IF_MATCH` operation. It removes only the Project binding; it cannot delete or mutate Workspace Brain authority.

### 3.7 Connection binding stays concrete

The wire identifies a Project binding with the already accepted concrete authority coordinates:

```text
connectionId
connectionRevisionId
environment
```

After `4C-F17`, disclosed `ProjectConnectionBinding` additionally carries server-composed nonblank `connectionName` presentation. `connectionName` is not binding identity and is never accepted in the PRJ-14 binding-write input.

No generic `bindingKey`, ResourceBinding framework or caller-selected credential authority was introduced.

Set uses explicit expected-current state:

```text
ABSENT
or
PRESENT + exact connectionRevisionId + environment
```

Remove requires the exact current Connection/revision/environment subject. Neither operation deletes the Connection or reads credentials.

### 3.8 Capabilities are projection, not invocation grant

Capability detail closes only exact identity and the accepted regime:

```text
capabilityId
operationId
regime ∈ { QUERY, ACTION, INTEGRATION }
```

Listing/detail does not grant execution or create a generic executor API.

### 3.9 DataResource remains semantic, not physical DB browsing

At original 4B closure, DataResource detail closed:

```text
dataResourceId
grain
freshness
coverage
provenance
```

`4C-F16` later adds only a required server-owned nonblank human `name` to summary/detail while preserving `dataResourceId` as machine identity. No physical topology or generic metadata authority is created.

Forbidden generic physical-data exposure remains:

```text
table
schema
sql
connectionString
storageKey
```

### 3.10 Product Agent projection stays out of runtime authority

Project Agent detail/list exposes authored identity and Release references only. Later `4C-F13` adds bounded human name/purpose and owning-Project presentation without changing runtime authority.

The wire rejects Mastra/runtime/request-override identities as Project Product authority.

Workspace Agent catalog remains an access-filtered projection over Project-owned Agent identities; it does not create a Workspace Agent owner.

## 4. Executable falsifiers

The owner checker rejects at least:

```text
any current PRJ operation not SCHEMA_CLOSED
PRJ-04 returning to the canonical bundle
provisional success authority surviving in Project
CreateProject generic metadata input
ArchiveProject without exact current revision
DuplicateProject data/credential/binding copy switches
Inception caller-selected URL/Connection/SQL scope
Baseline without exact digest/source/profile contract
runtime profile wider/narrower than MANAGED|DEDICATED
Brain binding without honest same-target present/absent conditional semantics
ProjectConnectionBinding missing nonblank connectionName after F17
PRJ-14 accepting connectionName as binding authority
Connection binding without exact Connection/revision/environment/current state
Capability regime wider/narrower than QUERY|ACTION|INTEGRATION
DataResource missing required nonblank human presentation name after F16
DataResource physical database-explorer fields
Product Agent runtime/Mastra override identity
```

Machine guard:

```text
scripts/check-wire-project.mjs
```

## 5. Original executable proof

TDD proof sequence:

```text
Verify #260 = FAILURE
→ expected RED
→ all previous gates passed
→ first Project failure: PRJ-01 is not SCHEMA_CLOSED

Verify #262 = SUCCESS
HEAD = 4ed0fbd9e7eb369c3ea216a8f6ff3ab484bf77f1
```

Exact successful proof at that historical point:

```text
fixed 4A operations      = 111
fixed OAS operations     = 111
schema-closed operations = 41
Project slice            = 21 / 21
IAM/Workspace slice      = 20 / 20
missing                  = 0
extra                    = 0
duplicate                = 0
literal IF_MATCH          = { PRJ-12, PAR-14 }
```

Budget Analyzer declaration/generation/truth-state positive and negative controls also remained green in the same run.

## 6. Original result

```text
Identity & Access + Workspace schema slice = CLOSED inside 4B
Project schema slice                       = CLOSED inside 4B
schema-closed fixed operations             = 41 / 111
4B overall                                  = OPEN / ACTIVE
Product implementation                      = BLOCKED
```

The next owner slice continued compiling accepted owner semantics into the same OAD. Missing authority remains a falsifier/reopen trigger rather than permission to create DTO meaning.

## 7. `4C-F16` bounded Project/Data recompile

P-02 authority-feasibility proved a real human browse consumer for Project Data resources but current `PRJ-18/19` exposed no guaranteed human presentation identity. The operator selected the smallest correction: preserve the Project owner and both existing operations, add one required server-owned presentation property to their existing projections, and keep the fixed operation census unchanged.

Selected realization:

```text
ProjectDataResourceSummary
→ dataResourceId
→ name

ProjectDataResource
→ dataResourceId
→ name
→ grain
→ freshness
→ coverage
→ provenance

name = presentation only
dataResourceId = exact machine identity
name -X-> routing / authorization / containment / uniqueness authority
```

Explicit negatives remain:

```text
new Data operation = 0
physical table/schema/SQL exposure = FORBIDDEN
generic metadata editor = NOT ADMITTED
new Permission / owner / record = 0
```

TDD chronology:

```text
Verify #883 = EXPECTED RED
→ 117 repository tests / 116 pass / 1 fail
→ exact first failure: operation ledger missing F16 token: 4C-F16
→ all prior tests remained green

Verify #884 = SUCCESS
→ selected F16 4A ledger + Project OAS realization compatible with complete existing proof stack

Verify #885 = SUCCESS
→ Project owner checker hardened for required nonblank Data-resource presentation
→ N_platform remains 116
→ Project remains 23
```

## 8. `4C-F17` bounded Project binding-presentation recompile

P-02 authority-feasibility proved that the accepted Project binding job could expose exact machine coordinates without giving the human a recognizable Connection identity. The operator selected a response-only enrichment rather than a new binding owner or picker operation.

Selected Project realization:

```text
ProjectConnectionBinding
→ connectionId
→ connectionRevisionId
→ environment
→ connectionName

connectionName = server-composed Connection presentation at response time
binding identity = connectionId + connectionRevisionId + environment
connectionName -X-> binding identity / routing / authorization
```

The binding write remains machine-coordinate exact:

```text
PRJ-14 request
→ connectionId
→ connectionRevisionId
→ environment
→ expectedCurrent
-X-> connectionName
```

The related purpose-bound candidate disclosure remains Connections-owned and is proved in `connections-schema-closure.md`; Project does not absorb Connection configuration, credentials, qualification or lifecycle authority.

TDD chronology:

```text
Verify #886 = EXPECTED RED
→ 118 repository tests / 117 pass / 1 fail
→ exact first failure: operation ledger missing F17 token: 4C-F17
→ status, F16 and all prior guards remained green

Verify #887 = SUCCESS
→ selected F17 ledger/Permission + Project binding presentation + CON-03 purpose-bound query realization is compatible with the complete existing proof stack
→ N_platform remains 116
→ Project remains 23
→ Connections remains 9
→ ordinary Permissions remain 25
```

The succeeding guard commit makes loss/widening of `connectionName` an executable Project falsifier.
