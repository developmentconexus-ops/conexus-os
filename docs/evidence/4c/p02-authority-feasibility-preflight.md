# P-02 — Data / Capabilities / Integrations / Brain — authority-feasibility preflight

> **Status:** `P-02 = OPEN / AUTHORITY PREFLIGHT`
> **Gate:** operator adjudication of candidate `F16..F19` before selected RED or P7
> **P7 = BLOCKED**
> **P8 = BLOCKED**
> **Product implementation = BLOCKED**

## 1. Human job

P-02 must let a person understand, inside one Project:

```text
Data         = what the Project can read / reason over as data
Capabilities = what the Project can do through admitted semantic operations
Integrations = which external systems/resources the Project uses
Brain        = which shared enterprise meaning the Project adopts
```

The locked GF-01 Project rail already owns these destinations. P-02 must not invent a second generic Resources hub or mirror backend modules as IA.

## 2. Current reference Evidence

Current mature-product reference study was used only as Evidence:

- Microsoft Power Platform separates Connector, Connection and Connection Reference; an app/solution consumes an explicit reference rather than owning credential lifecycle itself.
- Superblocks treats integrations as reusable managed resources while application builders consume them, and keeps broader organizational knowledge distinct from application-level context.

This supports the existing Conexus split:

```text
Connections owns Connection lifecycle
Project owns ProjectConnectionBinding
Workspace Brain owns published knowledge
Project owns ProjectBrainBinding/adoption
```

The reference study does not authorize generic RBAC, a solution explorer, a universal binding framework or execute-anything consoles.

## 3. Authority currently sufficient

### Capabilities = NO UPSTREAM FINDING CURRENTLY

`PRJ-16/17` expose exact `ProjectCapability` with:

```text
capabilityId
operationId
regime = QUERY | ACTION | INTEGRATION
```

`project-operation/v1.operationId` is already defined as the exact Release-admitted **semantic operation identity**, not a random transport route. P-02 can therefore present a locally formatted human reading while preserving the exact `operationId` as the authoritative identity.

Inspection remains:

```text
project.read
-X-> invocation grant
```

No generic capability runner is admitted by this block.

## 4. Candidate findings requiring operator adjudication

### F16 — Data human identity

#### Root cause

`PRJ-18 ListProjectDataResources` returns `ProjectDataResourceSummary` containing only:

```text
dataResourceId
```

`PRJ-19` adds grain/freshness/coverage/provenance but still carries no guaranteed human presentation identity. Unlike `operationId`, current authority does not define `dataResourceId` as human semantic presentation.

#### Target invariant

```text
Data browse
→ human recognizes the resource without interpreting an opaque id
→ exact dataResourceId remains machine identity
```

#### Recommended smallest realization

Add required server-owned `name` to both:

```text
ProjectDataResourceSummary
ProjectDataResource
```

Binding:

```text
name = presentation only
name -X-> routing
name -X-> authorization
name -X-> uniqueness authority
```

No new operation, Permission, owner, durable record or generic DB explorer.

---

### F17 — Integration binding selection disclosure

#### Root cause A — existing bindings are not human-recognizable

`PRJ-13 ListProjectConnectionBindings` returns only:

```text
connectionId
connectionRevisionId
environment
```

A `project.manage` user can know that a binding exists but cannot recognize the Connection by its server-owned human `Connection.name` without independently acquiring `connection.read`.

#### Root cause B — bind authority can exist without catalog disclosure

`PRJ-14 SetProjectConnectionBinding` requires:

```text
project.manage + connection.use
```

but the human Connection catalog `CON-03 ListConnections` is currently routed only under:

```text
connection.read
```

Therefore a principal can be authorized to bind/use an eligible Connection while lacking an admitted human selection projection. A frontend join against CON-03 would silently require an extra Permission not declared by PRJ-14.

#### Existing sufficient Connection projection

`CON-03` already returns the narrow non-secret summary needed for safe selection:

```text
Connection.name
ownerScopeKind
currentRevisionId
connectorDefinitionId/version
credentialConfigured
connectionTest.state
environment when tested
```

No new convenience endpoint is needed.

#### Recommended smallest realization

1. Enrich `ProjectConnectionBinding` with server-composed `connectionName` for human recognition of an already-disclosed Project binding.
2. Admit an **operation-specific alternate CON-03 disclosure under `connection.use`** in exact Workspace/Project scope for binding selection.

Binding law:

```text
connection.use -X-> generic connection.read
connection.use + CON-03 alternate route
→ narrow list disclosure only
-X-> CON-04 configuration read
-X-> credentials
-X-> Connection management
-X-> qualification authority
```

Rejected alternative: `ListBindableConnections` screen-shaped convenience operation.

No new operation, Permission, owner or durable record.

---

### F18 — Brain binding selection disclosure

#### Root cause

`PRJ-11 SetProjectBrainBinding` requires:

```text
project.manage + brain.bind
```

but the immutable Brain revision catalog `BRN-02 ListBrainRevisions` is currently routed under:

```text
brain.read
```

A caller may therefore be authorized to adopt a Brain revision without an admitted human catalog from which to choose it.

`BRN-02 BrainRevision` already carries enough narrow immutable selection information:

```text
brainRevisionId
brainDigest
sourceRevision
availability
reviewText
```

#### Recommended smallest realization

Admit an **operation-specific alternate BRN-02 disclosure under `brain.bind`** for immutable revision selection.

Binding law:

```text
brain.bind -X-> generic brain.read
brain.bind + BRN-02 alternate route
→ narrow immutable revision list
-X-> BRN-03 structured knowledge browse
-X-> proposal/review/publication authority
```

No new operation, Permission, owner or durable record.

Current `ProjectBrainBinding` itself does not need to duplicate full `reviewText`; one canonical Workspace Brain plus exact revision/validation/update state is sufficient for the already-bound state.

---

### F19 — AnalyticQuery semantic input catalog

#### Root cause

The accepted human Control Plane route `BRN-12 RunAnalyticQuery` requires canonical semantic inputs:

```text
datasetSemanticId
selectSemanticIds[]
```

and is authorized by:

```text
brain.read + project.data.read
```

But no current Product read enumerates the exact **Project-admitted** dataset and selectable semantic IDs needed to construct that request.

`BRN-03 knowledgeBrowse` cannot substitute because its `conceptRef` is explicitly not canonical semantic identity, and Workspace Brain browse is broader than exact Project-curated analytical admission.

Therefore current UI choices would be limited to two invalid options:

```text
user memorizes opaque semantic IDs
OR
frontend invents a semantic catalog
```

#### Target invariant

```text
human AnalyticQuery
→ chooses only server-admitted semantic inputs
→ exact Project Brain binding + curated dataset eligibility preserved
→ no physical SQL/table/join authority disclosed
```

#### Recommended Global-Maximum / YAGNI realization

Add one purpose-built Product read, candidate identity:

```text
BRN-13 GetProjectAnalyticQueryCatalog
```

Owner:

```text
Brain + accepted Project binding/data composition
```

Control Plane Permission:

```text
brain.read + project.data.read
```

Output projection only:

```text
projectId
projectBindingDigest
datasets[]:
  datasetSemanticId
  label
  selectableSemantics[]:
    semanticId
    label
```

It exposes only valid semantic choices for BRN-12. It does not expose physical SQL, arbitrary dimensions/metrics, new join topology or universal semantic search.

Expected count impact if selected:

```text
N_platform 116 → 117
Brain 11 → 12
wire 116↔116 → 117↔117 after bounded recompile
ordinary Permissions unchanged = 25
new owner = 0
new durable record = 0
```

Rejected alternatives:

```text
put canonical IDs into BRN-03 knowledgeBrowse
→ conflates Workspace publication browse with exact Project query eligibility

put Brain semantic IDs only into PRJ-19
→ leaks Brain authority under project.data.read without brain.read

generic semantic search / SQL console
→ violates accepted Product boundary
```

## 5. Leading structural hypothesis after authority closure

Not yet P7 authority. If the selected findings are closed, the current leading structure is:

```text
A — FOUR FOCUSED PROJECT ROUTES

Data
→ human resource catalog
→ grain / freshness / coverage / provenance
→ optional governed analytic exploration backed by F19 + BRN-12

Capabilities
→ Query / Action / Integration grouping
→ semantic operation identity
→ inspection only

Integrations
→ "Used by this Project" bindings first
→ Connection name + environment + qualification/test applicability
→ bind/change/remove
→ contained Project-private Connections lifecycle
→ existing context-preserving exact-subject maintenance panel

Brain
→ current Project adoption / validation / update available
→ select/compare immutable revision
→ bind/change/clear
→ Workspace Brain publication remains W-02A, not duplicated
```

Competing structures to test at P7 after authority closure:

```text
B — one Project Resources hub with tabs
→ likely duplicate of already LOCKED Project rail / unnecessary depth

C — backend-owner-first resources/revisions/bindings pages
→ backend-shaped UX / rejected unless real task Evidence falsifies A
```

## 6. Current gate

```text
F16..F19 = CANDIDATE FINDINGS / NOT SELECTED
P7 = BLOCKED
P8 = BLOCKED
P-03+ = NOT OPEN
P11 = NOT ASSEMBLED
4D = NOT STARTED
Product implementation = BLOCKED
```

Next action:

```text
operator adjudicates F16..F19
→ APPROVE | REVISE
→ only selected findings receive RED
→ bounded 4A/4B recompile
→ whole-wire GREEN
→ then materialize P-02 P7 competing hypotheses
→ stop again before P8
```
