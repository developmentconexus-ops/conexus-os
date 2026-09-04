# P-02 — Project Product surfaces Screen Contract

> **Status:** `LOCKED BASELINE / P12 FAMILY 2 IDENTITY DELTA RE-LOCKED / OPERATOR APPROVED`
> **Method:** Frontend Product Experience Planning Method v2.3
> **P9:** `P9 EXACT TRACE CLOSED`
> **P10:** `P10 CONSOLIDATED`
> **P11:** `P11 LATER ASSEMBLED PRODUCT`
> **Final operator-approved P8:** `docs/evidence/4c/p02-project-resources-functional-wireframe.html`
> **Exact artifact identity:** `approved final P8 artifact blob = 1ea0f096a6e72000d5d5f09ebf64f03d6a346417`
> **P12 Family 2 approved identity:** `approved governed-adoption P8 delta blob = fd23303ac71bbf256887bf361fb0f8c7cf9aae00`
> **Accepted bounded upstream corrections:** `4C-F16..F23`
> **Product implementation authority:** none; `Product implementation = BLOCKED`.

---

## 1. Locked human experience

P-02 locks four focused Product lenses inside one exact Project:

```text
Data = facts
Brain = meaning
Capabilities = behavior
Integrations = external systems
```

The locked human jobs are:

```text
Data
→ discover authorized Project and integration-backed sources
→ open a real tabular object
→ inspect read-only rows, structure, relationships and rules
→ optionally compose a governed semantic analysis

Capabilities
→ recognize what the Project can do
→ understand purpose, inputs and outputs
→ inspect technical identity only when needed

Integrations
→ understand which external systems the Project uses
→ inspect exact use and independently authorized Connection detail
→ add/remove exact Project use
→ create and administer a private Project Connection when authorized

Brain
→ understand the enterprise meaning adopted/available in this Project
→ browse domains, concepts, rules, caveats, evidence requirements and provenance
→ administer the exact immutable binding secondarily when authorized
```

The four routes remain one Project experience without creating a generic Product-resource ontology.

```text
ProjectConnectionBinding != Connection
physical identity != semantic meaning
Project Brain Context != Workspace Brain publication
Project Brain Context != runtime effective Brain slice
```

---

## 2. P9 — shell, route and information-role trace

P-02 inherits the locked GF-01 Project shell and does not create another navigation frame.

```text
Project → Data = URL_NAVIGATION
Project → Capabilities = URL_NAVIGATION
Project → Integrations = URL_NAVIGATION
Project → Brain = URL_NAVIGATION
Project subroute = URL_NAVIGATION
```

Information roles are binding:

| Route | Primary information role | Secondary information role |
| --- | --- | --- |
| Data | current authorized physical facts | semantic meaning and governed analysis |
| Capabilities | human behavior contract | exact technical operation identity |
| Integrations | external systems used by this Project | contained Project-private Connection lifecycle |
| Brain | current Project-resolved adopted/available meaning | exact binding administration and Workspace boundary |

The browser may compose presentation across accepted reads but never becomes a semantic owner, authorization engine or durable cross-owner mirror.

---

## 3. Data — physical facts, semantic meaning and analysis

### 3.1 Source and object discovery

```text
PRJ-25 ListProjectDataExplorerSources
GET /api/control/projects/{projectId}/data-explorer/sources
→ project.data.read
→ exact Project
→ server-resolved current Project Database + eligible currently bound integration sources

PRJ-26 ListProjectDataExplorerObjects
GET /api/control/projects/{projectId}/data-explorer/sources/{dataSourceId}/objects
→ project.data.read
→ exact disclosed source
→ paged/searchable TABLE / VIEW / genuinely tabular DATASET summaries
```

`dataSourceId`, search and continuation coordinates are untrusted input. The server re-resolves Project containment, current binding eligibility and disclosure. Local filtering is truthful only for an explicitly complete disclosed collection; scalable object discovery remains server-side.

### 3.2 Exact object, rows and inspector

```text
PRJ-27 GetProjectDataExplorerObject
GET /api/control/projects/{projectId}/data-explorer/sources/{dataSourceId}/objects/{dataObjectId}
→ project.data.read
→ physical columns / types / keys / relationships / source constraints
→ optional exact semantic coordinates

PRJ-28 ListProjectDataExplorerRows
POST /api/control/projects/{projectId}/data-explorer/sources/{dataSourceId}/objects/{dataObjectId}/rows:query
→ project.data.read
→ bounded typed filters / sort / columns / continuation
→ current read-only row page + observedAt + truncation truth
```

The row inspector is a context-preserving exact-subject panel over the selected disclosed row. It adds no row mutation, export, SQL or database-administration authority.

Wire and state laws:

```text
filter/sort column must be a disclosed exact-object column
typed lexical value != SQL expression
continuation is scoped to exact Project/source/object/filter/order
stale continuation → explicit refresh/restart
truncated cell != complete value
50 rows loaded != complete object
```

### 3.3 Semantic Data resource inspection

```text
PRJ-18 ListProjectDataResources
GET /api/control/projects/{projectId}/data-resources

PRJ-19 GetProjectDataResource
GET /api/control/projects/{projectId}/data-resources/{dataResourceId}
→ project.data.read
→ exact semantic Data resource
→ human name + resource/source class + grain/freshness/coverage/provenance
→ logical fields / relationships / governed rules
```

`PRJ-18/19` never become physical table/row authority. `PRJ-25..28` never invent semantic business meaning.

### 3.4 Governed Analyze flow

```text
BRN-13 GetProjectAnalyticQueryCatalog
GET /api/control/projects/{projectId}/analytic-query-catalog
→ brain.read + project.data.read
→ current binding-bound human labels + canonical dataset/semantic IDs

BRN-12 RunAnalyticQuery
POST /api/projects/{projectId}/analytic-queries
→ brain.read + project.data.read
→ exact Project + current Brain binding + curated admitted semantic IDs
→ deterministic governed analytic result
```

The selection catalog is a current server projection, not durable browser authority. `BRN-12` revalidates current grant, binding, health, dataset and semantic admission at submit time.

Success consequence: the result is analysis truth for the exact admitted request; it does not mutate Data, Brain or the source.

---

## 4. Capabilities — human contract first

```text
PRJ-16 ListProjectCapabilities
GET /api/control/projects/{projectId}/capabilities

PRJ-17 GetProjectCapability
GET /api/control/projects/{projectId}/capabilities/{capabilityId}
→ project.read
→ exact Project/capability identity
→ human name + purpose + QUERY/ACTION/INTEGRATION regime
→ logical Inputs + Outputs
→ technical operation identity secondarily
```

Capability inspection is read-only and never grants invocation. A visible Capability, operation ID or logical input contract is not a generic executor.

```text
Capability presentation != runtime ToolProjection
Capability inspection != invocation authorization
Project capability != generic operation dispatch
```

Success consequence: the human understands available behavior; no business action is executed.

---

## 5. Integrations — Project use and Connection lifecycle stay separate

### 5.1 Current Project use

```text
PRJ-13 ListProjectConnectionBindings
GET /api/control/projects/{projectId}/connection-bindings
→ project.manage
→ exact ProjectConnectionBinding summaries
→ connectionId + server-owned connectionName + connectionRevisionId + environment
```

The used-system card and contextual detail represent Project-owned use truth. `connectionName` is presentation; exact IDs/revision/environment remain routing and concurrency coordinates.

```text
PRJ-14 SetProjectConnectionBinding
POST /api/control/projects/{projectId}/commands/set-connection-binding
→ project.manage + connection.use
→ exact qualified compatible ConnectionRevision/environment
→ current Project/binding revalidation

PRJ-15 RemoveProjectConnectionBinding
POST /api/control/projects/{projectId}/commands/remove-connection-binding
→ project.manage
→ exact current binding narrowing
```

Success consequences:

```text
Set → Project uses the submitted exact qualified revision/environment
Remove → Project stops using it; the Connection is unchanged
```

### 5.2 Purpose-bound choice disclosure

```text
CON-03 ListConnections
GET /api/control/connection-scopes/{ownerScopeKind}/{ownerId}/connections?forProjectId={projectId}
→ project.manage + connection.use
→ lightweight eligible Workspace + exact same-Project private summaries only
```

The alternate selection disclosure does not grant configuration, credential, qualification-history or generic Connection read authority.

```text
connection.use -X-> generic connection.read
selection disclosure != Connection management authority
```

### 5.3 Contextual Connection detail

```text
CON-04 GetConnection
GET /api/control/connections/{connectionId}
→ connection.read
→ exact ownerScope containment
→ currentRevisionId + current non-secret configuration
→ credentialConfigured + current derived test applicability
```

When `connection.read` is absent, P-02 preserves the recognizable Project-use summary and explicitly withholds configuration/access/test Evidence. The frontend never infers Permission from the existence of a binding.

### 5.4 Project-private Connection lifecycle

The secondary region reuses the locked W-02B lifecycle grammar without importing Workspace ownership into the Project:

```text
CON-05 CreateConnection
POST /api/control/connection-scopes/PROJECT/{projectId}/connections
→ connection.manage
→ exact Project owner scope + connector + name + non-secret configuration

CON-06 ReviseConnection
POST /api/control/connections/{connectionId}/revisions
→ connection.manage
→ expected currentRevisionId + non-secret configuration
→ new immutable revision; older test basis becomes stale

CON-07 SetConnectionCredential
PUT /api/control/connections/{connectionId}/credential
→ connection.manage
→ write-only secret boundary
→ credential generation advances; prior test basis becomes stale

CON-08 QualifyConnection
POST /api/control/connections/{connectionId}/qualifications
→ connection.qualify
→ exact ConnectionRevision/environment + server-resolved current credential generation
→ real provider/source proof job

CON-09 GetConnectionQualification
GET /api/control/connections/{connectionId}/qualifications/{qualificationId}
→ connection.read
→ exact test basis + human diagnostic/remediation + Evidence
```

The UI label `Test connection` is presentation for `CON-08/09`; it creates no parallel operation.

Binding laws:

```text
ProjectConnectionBinding != Connection
Connection revision != Project binding revision
configured != qualified != bound != healthy
Connection current revision advance -X-> automatic Project binding advance
credential value = write-only / never readable
Project-owned = private to exact Project / no sibling reuse
```

After an exact current revision/environment passes, making the Project use it or advancing an existing same-Connection binding remains an explicit `PRJ-14` decision.

---

## 6. Brain — Project meaning first, binding administration second

### 6.1 Current Project Brain Context

```text
BRN-14 GetProjectBrainContext
GET /api/control/projects/{projectId}/brain-context
→ brain.read + project.read
→ exact current Project Brain binding
→ server-resolved adopted/available Project-local domains, concepts and content
→ definitions / business rules / caveats / evidence requirements / provenance
```

The frontend does not join the whole Workspace Brain with binding metadata to decide Project applicability.

```text
Project Brain Context != Workspace Brain publication
Project Brain Context != runtime effective Brain slice
Project Brain Context != analytic-input catalog
```

### 6.2 Secondary binding administration

```text
PRJ-10 GetProjectBrainBinding
GET /api/control/projects/{projectId}/brain-binding
→ project.manage
→ exact pinned revision + validation/update state

BRN-02 ListBrainRevisions
GET /api/control/workspaces/{workspaceId}/brain/revisions?forProjectId={projectId}
→ purpose-bound project.manage + brain.bind
→ immutable revision selection summaries only

PRJ-11 SetProjectBrainBinding
PUT /api/control/projects/{projectId}/brain-binding
→ project.manage + brain.bind
→ exact immutable revision + conformance + current binding conditional

PRJ-12 ClearProjectBrainBinding
DELETE /api/control/projects/{projectId}/brain-binding
→ project.manage
→ exact current binding narrowing
```

The purpose-bound `BRN-02` route does not grant knowledge browse, proposal, review, publication or generic `brain.read`.

```text
brain.bind -X-> generic brain.read
binding metadata != Project Brain knowledge
Workspace Brain governance remains W-02A
```

Success consequences:

```text
Set → exact immutable revision becomes Project binding after server conformance checks
Clear → binding is absent; Workspace Brain content remains unchanged
```

---

## 7. Permission and disclosure separation

The following separations are binding across every P-02 route:

```text
project.read != project.data.read
project.manage != project.read
connection.use != connection.read != connection.manage != connection.qualify
brain.bind != brain.read
brain.read + project.data.read != project.data.read alone
brain.read + project.read != project.read alone
```

| Human job | Exact operations | Permission |
| --- | --- | --- |
| Physical and semantic Data inspection | `PRJ-18/19`, `PRJ-25..28` | `project.data.read` |
| Governed analytic discovery/run | `BRN-13`, `BRN-12` | `brain.read + project.data.read` |
| Capability inspection | `PRJ-16/17` | `project.read` |
| Project binding browse/remove | `PRJ-13/15` | `project.manage` |
| Connection choice and bind | purpose-bound `CON-03`, `PRJ-14` | `project.manage + connection.use` |
| Connection inspect/qualification result | `CON-04/09` | `connection.read` |
| Connection create/revise/credential | `CON-05..07` | `connection.manage` |
| Test Connection | `CON-08` | `connection.qualify` |
| Project Brain Context | `BRN-14` | `brain.read + project.read` |
| Brain binding read/clear | `PRJ-10/12` | `project.manage` |
| Brain revision choice/bind | purpose-bound `BRN-02`, `PRJ-11` | `project.manage + brain.bind` |

A visible route, card, button, disclosed name, binding coordinate or cached fixture never elevates these permissions.

---

## 8. Client-state classification

```text
server projection = SERVER
Data source/object/detail/row pages = SERVER
semantic Data resource/capability/Project use/Brain Context = SERVER
Connection configuration/credential state/test evidence = SERVER
Project Brain/Connection binding = SERVER
analytic result = SERVER read response; never mutation authority

search/filter/sort draft = EPHEMERAL_UI until submitted
open object tabs = EPHEMERAL_UI
selected row/capability/concept/Connection = EPHEMERAL_UI reference only
drawer/panel open state = EPHEMERAL_UI
create/configuration/credential form draft = EPHEMERAL_UI until accepted
review-control scenario = EPHEMERAL_UI Evidence harness only

Project subroute = URL_NAVIGATION
```

P8 fixtures remain disposable Evidence. They are not a production cache, authorization engine, revision registry, binding store or analytic catalog.

---

## 9. Material failures, message intent and recovery

### 9.1 Data

```text
loading != known-empty != denied != absent/non-disclosable != dependency failure
freshness unknown != fresh
coverage partial != complete
row read unavailable != object absent
stale continuation != empty next page
```

Message intent states what is known, what is not known and the next safe action. Denial never probes hidden existence; dependency failure never masquerades as empty; stale continuation requests explicit refresh.

### 9.2 Capabilities

```text
known-empty capability collection != denied Project read
missing exact capability != generic route failure
inspection success != executable behavior
```

### 9.3 Integrations

```text
no binding != no eligible Connection != denied disclosure
detail denied != Connection absent
manage denied != read denied
qualify denied != prior qualification failed
qualification failure != dependency unavailable != timeout/outcome unknown
revision conflict != generic save failure
```

Failure messages preserve the exact owner boundary: binding errors refer to Project use; configuration/credential/test errors refer to the Connection. Qualification failure exposes only accepted diagnostic/remediation/Evidence. Secret values are never echoed.

### 9.4 Brain

```text
no Brain binding != denied knowledge access != Project Brain Context unavailable
invalid binding != unavailable dependency
update available != automatically adopted
```

The no-binding state routes to authorized binding administration; denial does not reveal hidden knowledge; unavailability preserves the last known distinction without claiming current context.

---

## 10. P10 — bounded pattern consolidation

P-02 was compared with GF-01, W-01, W-02A, W-02B, W-03, W-04 and P-01.

The already-graduated semantic vocabulary remains valid:

```text
context-preserving exact-subject panel
```

P-02 instantiates it for row inspection, Connection detail/maintenance and focused analytic/binding choices while retaining the current Project route context. Owner, Permission, subject identity, read/write semantics and failure behavior remain supplied by each local Screen Contract trace; the pattern does not create generic authority.

The following remain single-instance P-02 composition:

```text
four-lens Data / Capabilities / Integrations / Brain Project model
physical Data explorer with complementary semantic meaning
used-by-first Integrations + secondary Project-private Connection lifecycle
Project Brain Context first + binding administration second
fixture-only Review controls harness
```

```text
P10 new graduated shared patterns = 0
existing graduated patterns remain = 1
P11 = LATER ASSEMBLED PRODUCT
```

No generic ResourceHub, Explorer framework, CapabilityCard abstraction, IntegrationManager, BrainContextStore, universal drawer API, shared cross-owner DTO or frontend Permission layer is selected by P10.

---

## 11. Forbidden / not admitted

```text
generic Project Resources hub = FORBIDDEN
backend owner/revision/binding console as root UX = FORBIDDEN
SQL editor / arbitrary query execution = FORBIDDEN
INSERT / UPDATE / DELETE / DDL = FORBIDDEN
browser-derived semantic joins = FORBIDDEN
generic Capability Run/Execute = FORBIDDEN
generic operation dispatch = FORBIDDEN
generic Integration switch/replacement semantics = FORBIDDEN
binding purpose/role invented by frontend = FORBIDDEN
automatic Project binding advance after Connection revision = FORBIDDEN
connection.use permission elevation = FORBIDDEN
credential readback = FORBIDDEN
browser-derived Project Brain applicability = FORBIDDEN
Workspace Brain governance inside Project Brain = FORBIDDEN
runtime effective Brain slice inside Control Plane Project Brain = FORBIDDEN
frontend-owned durable catalog/binding/revision truth = FORBIDDEN
P11 early assembly = FORBIDDEN
Product implementation = BLOCKED
```

---

## 12. Locked result and reopen law

The operator-approved P-02 experience and the exact bidirectional trace above are locked. P9 found no contradiction requiring an upstream reopen. P10 adds no new shared semantic pattern and preserves the one already-graduated interaction vocabulary.

```text
P-02 = LOCKED / OPERATOR APPROVED / P9/P10 CLOSED
P-03 = NEXT / NOT OPEN
P11 = LATER ASSEMBLED PRODUCT
4D = NOT STARTED
Product implementation = BLOCKED
merge = NOT AUTHORIZED
```

Only a later material falsifier may reopen the smallest affected P-02 owner/route. This closure does not authorize P-03 opening, P11 assembly, 4D, merge or Product implementation.
