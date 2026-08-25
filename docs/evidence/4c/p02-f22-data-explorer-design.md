# P-02 — F22 read-only Data Explorer design

> **Status:** `OPERATOR RATIFIED / R2 CONVERGED / P8 F22 REVISED CANDIDATE / NOT LOCKED`
> **Scope:** P-02 Data only. P7 four-route structure remains valid; the Data route is materially restructured.
> **Runtime authority:** none. F22 ratifies 4A/4B Product authority only; Product implementation, P8 lock, P9/P10, P-03, 4D and merge remain blocked.
> **Execution plan:** [F22 Read-Only Data Explorer Implementation Plan](p02-f22-data-explorer-implementation-plan.md)
> **Realization proof:** [F22 Data Explorer recompile proof](p02-f22-data-explorer-recompile-proof.md)

Sections describing the original inference/plan are retained as design provenance. Current executable authority is the ratified 4A/4B wire and realization proof above.

## 1. Decision outcome

The operator walkthrough plus Mitra screenshots materially falsified the F20 assumption that Data could stop at semantic resource metadata and reject a physical data explorer.

Selected outcome:

```text
RESTRUCTURE NOW — bounded upstream F22

Project > Data
→ read-only real Data Explorer
→ internal Project Database + eligible bound integration sources
→ genuinely tabular derived data appears at its truthful physical source
→ physical source/object/column/row truth remains explicit
→ semantic meaning remains complementary, never a replacement for physical identity
```

The selected design is **not** a SQL editor, DB admin console, migration surface or record editor.

## 2. Evidence / Known / resolved hypotheses / Deferred

### Known

```text
K1  The required human job includes opening a real table/view and seeing its actual rows and columns.
K2  Internal Project-owned business/application data is first-class, not only integration-backed data.
K3  Bound external sources may also provide explorer-eligible tabular data.
K4  The operator explicitly rejected SQL Editor for this scope.
K5  The explorer is read-only: no INSERT / UPDATE / DELETE / DDL.
K6  F20 metadata-only Data is insufficient; Fields/Relationships/Rules are information about an object, not the object data itself.
K7  P7's four focused Project routes remain valid; only the Data route is materially restructured.
```

### Pre-realization hypotheses — now resolved by F22

```text
I1  No new semantic owner is required.                    → CONFIRMED
I2  project.data.read can cover the bounded explorer.     → CONFIRMED + operator F4 confirmation
I3  No new durable record class is required.              → CONFIRMED
I4  ProjectConnectionBinding remains external-source basis.→ CONFIRMED
```

Accepted current result:

```text
PRJ-25 ListProjectDataExplorerSources
PRJ-26 ListProjectDataExplorerObjects
PRJ-27 GetProjectDataExplorerObject
PRJ-28 ListProjectDataExplorerRows

N_platform = 121
Project = 27
ordinary Permissions = 25
new semantic owners = 0
new durable record classes = 0
Technical Ingress = 3 / Product impact 0
```

Connector-specific runtime feasibility, source masking/disclosure policy and actual provider codecs remain realization concerns. If an owner cannot safely decide disclosure, that source/object is not explorer-eligible.

### Safely deferred

```text
SQL editor / arbitrary query text
record editing
create/alter/drop table or schema
migrations
index administration
EXPLAIN / execution plans
bulk export/download
arbitrary joins / expression language
cross-source joins
exact total row count as a mandatory property
persistent saved filters/views
column pinning beyond local UI convenience
```

## 3. Root cause

The prior P8 collapsed two different concepts:

```text
semantic Data Resource
= what data means to the Project

physical/operational Data Object
= where tabular data is exposed and what rows/columns currently exist
```

F20 made the semantic projection richer but still treated metadata as the primary Data experience. The human could not perform the actual job: **open the data and inspect the records**.

Patching another `Fields` tab would preserve the defect class.

## 4. Target invariants

### F22-I1 — real data is primary

For an explorer-eligible table/view/dataset, the default object experience exposes actual authorized rows and columns. Structure/relationships/rules are secondary inspection surfaces.

### F22-I2 — physical identity remains truthful

```text
source identity
+ namespace/schema when applicable
+ physical object name
+ physical column identity
!= semantic label
```

Human/business meaning may augment physical identity; it may never silently replace it.

### F22-I3 — semantic meaning remains separate

```text
physical object truth
→ Data / Structure / Relationships / Constraints

semantic Project/Brain truth
→ human meaning / grain / provenance / governed business rules
```

One UI may compose both projections, but neither becomes the other's authority. `PRJ-18/19` remain semantic Data resources; `PRJ-25..28` are the separate physical read-only explorer projection.

### F22-I4 — read-only end to end

No F22 path creates Product authority for SQL text, DML, DDL, record mutation, schema mutation, migration, credential access or arbitrary provider execution.

### F22-I5 — Project data only

The explorer may disclose:

```text
Project Database business/application data
eligible Project-bound integration data
eligible tabular derived Project data at its truthful physical source
```

It must never become a browser for:

```text
hub_control
mastra_builder
mastra_par
Keycloak provider persistence
another Project Database
foreign Workspace/Project sources
CredentialBackend material
```

Physical co-location never weakens this boundary.

### F22-I6 — server-resolved source authority

External explorer access is derived from exact current ProjectConnectionBinding / connector/source authority. Browser-supplied source/object coordinates are untrusted references only.

Accepted Permission law:

```text
project.data.read
+ exact Project grant
+ server-resolved current explorer source/object eligibility
→ bounded raw-row disclosure
```

A bound Connection alone never authorizes browsing. The operator explicitly accepted that already-issued `project.data.read` grants may gain this F22 raw-row capability when all additional current-owner conditions are satisfied. A real tenant requiring semantic inspection without raw rows reopens the Permission decision.

### F22-I7 — bounded typed exploration, no SQL-shaped escape hatch

Filtering, ordering and pagination are typed explorer operations over already-disclosed columns. No free-form WHERE, SQL, expression, join or target URL is accepted.

### F22-I8 — truthfulness over convenience

```text
loading != empty
empty != denied
object absent != source unavailable
source unavailable != no rows
page N + page N+1 != stable snapshot unless the source explicitly proves one
unknown total row count != zero
truncated preview != complete value
```

If a continuation becomes invalid/stale, the client surfaces that state and requires an explicit refresh; it never silently restarts and presents mixed pages as one coherent snapshot.

## 5. Credible alternatives

### A — separate read-only explorer projection — SELECTED

Keep semantic `ProjectDataResource` meaning distinct from physical explorer truth. Add only the Product reads required for source/object/row inspection.

**Strengths:** truthful ownership, strong security boundary, supports internal + external data, avoids turning semantic resources into a database DTO, grows cleanly if source capabilities differ.

### B — expand PRJ-18/19 into physical DB objects — REJECTED

Make `ProjectDataResource` simultaneously represent semantic resource, table/view identity, physical structure and rows.

**Why rejected:** duplicate/blurred meaning, oversized schema, poor fit for non-physical derived resources, physical-source changes would contaminate semantic identity, foreseeable structural dead end.

### C — generic DB browser / provider console — REJECTED

Expose generic database/provider introspection and query capabilities.

**Why rejected:** accidental complexity, permission/trust expansion, provider coupling, admin-console pressure and easy path to SQL/mutation authority that no current consumer requires.

## 6. Selected Product model

The UI composes two explicit layers.

```text
Project Data Explorer                    Semantic augmentation
─────────────────────                    ─────────────────────
Physical Source                          Data Resource / Brain meaning
Namespace / schema                       human meaning
Table / View / tabular Dataset           grain
Columns / keys / constraints             provenance
Rows                                     governed business rules
Relationships                            analytic/semantic mapping where admitted
```

### 6.1 Explorer source

An explorer source is a current Project-scoped **physical/source disclosure projection**, not a new durable owner.

Admitted source classes:

```text
INTERNAL
→ Project Database only

INTEGRATION
→ exact current eligible Project binding/source
```

`DERIVED` is not automatically a physical source. A derived table/view/dataset remains under the physical source that actually serves it and may additionally carry derived semantic/origin presentation.

The existing F20 semantic `sourceKind = INTERNAL | INTEGRATION | DERIVED` is not reused as though it were physical source identity.

A Connection existing in the Workspace is not enough. A source is explorer-eligible only when current Project binding plus its connector/source contract can truthfully provide bounded read-only tabular discovery/read semantics.

### 6.2 Explorer object

An object is a source-scoped browsable object such as:

```text
TABLE
VIEW
DATASET   only when genuinely tabular/browsable
```

Required semantic roles:

```text
exact source-scoped object coordinate
physical object name
object kind
namespace/schema presentation when the source has one
optional server-owned human/business label
optional derived/origin presentation when truthfully known
```

The object coordinate is routing/disclosure machinery; human/derived labels never authorize.

### 6.3 Structure

For one exact object, disclose only what is needed to understand the tabular contract:

```text
physical column name
source-native/logical type presentation
nullable / required truth
key role when disclosable: PRIMARY / FOREIGN / UNIQUE / NONE
human/business meaning when admitted
```

F1 does not require index catalogs, storage parameters, partitions, triggers, procedures or engine internals.

### 6.4 Relationships

Relationships are navigable when the source/project can truthfully disclose them.

```text
source object/column
→ target object/column
→ relationship kind / human meaning
```

Selecting a relationship may open the target object in another local explorer tab. It grants no additional disclosure; the target must independently pass current Project/source authorization.

### 6.5 Constraints vs business rules

Do not collapse physical constraints and semantic rules.

```text
Database / source constraints
→ PK / FK / UNIQUE / NOT NULL / bounded CHECK-style meaning when safely representable

Governed business rules
→ Project/Brain semantic meaning
```

The UI may present both under `Rules`, but visibly distinguishes their authority source.

### 6.6 Rows

Row browsing returns current read-only table data for one exact disclosed object.

Required roles:

```text
column projection sufficient to render the current page
rows with typed/null values
opaque continuation/page token when more data is available
observed/read time sufficient to avoid implying timeless truth
```

Exact total count is optional. `50 rows loaded · Next` is sufficient when counting the whole source is expensive or unsupported.

A page token is scoped to the exact Project/source/object/filter/order request. It may not be replayed to switch object/source or widen disclosure. If supplied filters/sort conflict with token-bound scope, the wire rejects 422 rather than silently reinterpreting the token. Page-size `limit` remains bounded transport mechanics.

Large/binary/structured cell payloads may be server-bounded for the grid, but truncation must be explicit. A preview may never be represented as the full value. F1 adds no generic Blob/export/download endpoint merely to inspect a large cell.

## 7. Bounded filter / sort grammar

F22 provides safe exploration, not a query language.

Accepted operator set:

```text
EQ
NE
GT
GTE
LT
LTE
CONTAINS
IS_NULL
IS_NOT_NULL
```

Rules:

```text
column must come from the exact disclosed object structure
operator must be compatible with the disclosed source type
value is an opaque non-executable source-typed lexical scalar
ambiguous/unsupported operator-type values reject 422
server validates every filter
server chooses bind/parameter mechanism for the concrete source
caller cannot supply SQL fragments, functions, casts, joins or expressions
```

Sorting is bounded to disclosed columns and ASC/DESC.

## 8. UX contract — realized in revised P8 candidate

### 8.1 Layout

```text
PROJECT > DATA

┌ Sources / objects ───────────────┬ Object workspace ───────────────────────┐
│ Search data...                   │ [ TGFCAB ] [ TGFITE ] [ tasks ]        │
│                                  ├─────────────────────────────────────────┤
│ ▼ Project Database               │ TGFCAB                                  │
│   ▼ public                       │ Sales documents                         │
│      customers                   │ Sankhya ERP · SANKHYA · TABLE           │
│      follow_up_tasks             │                                         │
│      sales_performance · Derived │ [Data] [Structure] [Relationships][Rules]│
│                                  │                                         │
│ ▼ Sankhya ERP                    │ Filter · Columns · Sort                 │
│   ▼ SANKHYA                      │                                         │
│      TGFCAB                      │ NUNOTA │ CODPARC │ DTNEG │ VLRNOTA ...  │
│      TGFITE                      │ ...                                    │
│      TGFPAR                      │                                         │
│                                  │ 50 rows loaded · Next →                  │
└──────────────────────────────────┴─────────────────────────────────────────┘
```

The tree is physical-source-first. `Derived` appears as object meaning/badge, never as a fake physical source.

### 8.2 Default object tab

`Data` is the default. Metadata is never presented as though it were the table contents.

Secondary tabs:

```text
Data
Structure
Relationships
Rules
```

`Analyze` remains a distinct governed semantic capability and is never relabeled or implemented as SQL.

### 8.3 Multi-object tabs

Opening multiple tables/views creates local workspace tabs. This is navigation/UI state, not Product authority or durable server state in F1.

### 8.4 Row Inspector

Selecting one already-loaded row opens a read-only drawer optimized for wide tables:

```text
physical field
value
human meaning when available
navigable disclosed relationships
```

No separate row mutation domain is admitted. The P8 uses already-disclosed page data only.

### 8.5 Column visibility

Show/hide columns is local client state over already-disclosed row data. It creates no server authority.

### 8.6 Human + physical naming

Preferred pattern:

```text
TGFCAB
Sales documents

CODPARC
Customer / partner
```

Physical identity stays visible; semantic meaning adds comprehension.

## 9. Client state classification

```text
selected Data route                         = URL_NAVIGATION
selected source/object                      = URL_NAVIGATION
selected Data/Structure/Relationships/Rules = URL_NAVIGATION
open object-tab set                         = EPHEMERAL_UI
column visibility                           = EPHEMERAL_UI
row selection / Row Inspector               = EPHEMERAL_UI
filter draft                                = FORM_DRAFT
applied filter/sort/page                     = EPHEMERAL_UI in F1
server-disclosed source/object/structure/rows= SERVER
```

Applied filter/sort need not become shareable URL state until a real re-entry/shareability consumer is proven.

## 10. Material states

The revised P8 makes these concepts distinct:

```text
source/object/rows loading
known empty
no explorer-eligible disclosure / denied
absent/non-disclosable
source dependency unavailable
structure available but row read unavailable
next page available
continuation expired/invalid/stale
```

The UI never claims stable cross-page snapshot consistency unless the server/source proves it. No browser state may convert dependency failure into empty data.

## 11. Security / trust boundaries

### 11.1 No Hub/control-store exposure

The explorer's `Project Database` means Project-owned business/application data only.

```text
Project Data Explorer -X-> hub_control
Project Data Explorer -X-> iam/ws/prj/bld/... owner schemas
Project Data Explorer -X-> mastra_builder
Project Data Explorer -X-> mastra_par
Project Data Explorer -X-> Keycloak provider persistence
```

### 11.2 No credential/config authority

Explorer responses do not authorize:

```text
passwords
credential handles usable for retrieval
connection strings
host/port secrets
provider access tokens
private storage keys
```

Human source context such as `Sankhya ERP · Production · Oracle` is presentation only when safely derivable from admitted source/binding truth.

`qualified Connection != fresh/current data`; qualification, binding and data freshness remain distinct truths.

### 11.3 Cross-scope references fail closed

A guessed source/object/page token from another Project/Workspace cannot become an existence oracle or disclosure grant. After Project-level admission, undisclosed source/object coordinates are indistinguishable from absent (`404`); `403` is reserved for Project-level authority failure before resource probing.

### 11.4 Sensitive raw data

F22 does not invent a browser-local masking policy. If current Project/source authority cannot safely decide whether an object/column/row is disclosable, that source/object is **not explorer-eligible** until the owning authority is closed. The frontend never receives protected raw data merely to hide it cosmetically.

## 12. Accepted 4A/4B realization

Three human jobs resolved to four exact Project-owned reads because source discovery and scalable object discovery have independent pagination/search shapes:

```text
J1a / PRJ-25 ListProjectDataExplorerSources
→ current explorer-eligible physical sources

J1b / PRJ-26 ListProjectDataExplorerObjects
→ bounded source-scoped object discovery

J2 / PRJ-27 GetProjectDataExplorerObject
→ exact structure / relationships / constraints + semantic cross-link presentation

J3 / PRJ-28 ListProjectDataExplorerRows
→ bounded typed filter + sort + pagination over exact object rows
```

Accepted census:

```text
N_platform = 121
Project = 27
Builder = 17
Brain = 12
Connections = 9
ordinary Permissions = 25
new semantic owners = 0
new durable record classes = 0
Technical Ingress = 3 / Product impact 0
```

No generic resource/provider framework or DB-admin owner was created.

## 13. Proof result

### 13.1 Authority RED / recompile GREEN

F22 execution demonstrated an authority RED before adding PRJ-25..28, then closed 4A↔4B at `121↔121`, Project=27, Permissions=25, generated projection/Kubb and whole-4B proofs.

### 13.2 Independent review

R1 found no MATERIAL issue and produced bounded corrections for exact allowlists, continuation conflict law, proof routing, Permission consequence, source-typed filter values and 404/403 existence-oracle behavior. R2 independently confirmed all R1 dispositions and concluded **no material uncertainty survives**.

R2's three remaining findings are MINOR/DEFER-SAFE and do not reopen F22:

```text
checker precision for patternProperties / alternate success status
planted true-positive proof for explicit-any AST scanner
continuation token + omitted filters/sort interoperability wording
```

### 13.3 Functional P8 RED/GREEN

```text
Verify #974 = EXPECTED RED / 131 tests / 130 pass / 1 exact Data Explorer P8 failure
Verify #975 = SUCCESS / 131 tests / 131 pass
4A↔OAS = 121↔121
Project = 27
F22 checker = PASS / 8 firing negative controls
```

The revised HTML is fixture-only and demonstrates the accepted UX without Product network calls or persistence.

## 14. Adversarial challenge

### "This is just pgAdmin inside Conexus"

Rejected by scope. F22 has no SQL, mutation, DDL, migrations, index/admin tooling, arbitrary connection target or credential access. The real consumer is Project data comprehension, not database administration.

### "One generic tree API would be simpler"

A generic Resource tree risks becoming framework authority. The selected source/object split keeps Data-specific typed semantics and gives large sources independent bounded pagination/search.

### "Raw integration tables leak too much"

Eligibility is fail-closed. A bound Connection is not automatically raw-data disclosure authority. Source/connector + current Project authority must support the explorer projection; otherwise F22 does not list/browse it.

### "Exact row counts are expected in a database UI"

Not required. Mandatory exact count can be expensive and provider-specific. F1 requires honest pagination/continuation, not a global COUNT(*) contract.

### "Why not add write now?"

No current consumer requires it, and write creates a qualitatively different authority/effect/concurrency/audit problem. YAGNI rejects it.

## 15. Reopen triggers

Reopen only the affected decision when Evidence proves one of:

```text
a real user needs SQL rather than typed exploration
a real user needs record mutation
a real user needs schema/migration/index administration
a real source cannot support honest pagination/filtering under the current explorer contract
column/row-level disclosure policy becomes necessary for a real source
a real tenant requires semantic Data inspection without raw-row disclosure
cross-page snapshot consistency becomes a Product requirement
non-tabular data requires a materially different exploration model
payload size proves Row Inspector requires an exact row/cell detail read
source scale proves the selected discovery shape cannot remain bounded
```

## 16. Current gate

```text
P7 = OPERATOR APPROVED
F22 = OPERATOR RATIFIED / R2 CONVERGED
4A = CLOSED THROUGH F22 / N_platform=121
4B = CLOSED THROUGH F22 / 121↔121 / Project=27
P8 = F22 REVISED CANDIDATE / OPERATOR WALKTHROUGH / NOT LOCKED
P9/P10 = BLOCKED UNTIL P8 OPERATOR APPROVAL
P-03+ = NOT OPEN
P11 = NOT ASSEMBLED
4D = NOT STARTED
Product implementation = BLOCKED
merge = NOT AUTHORIZED
```

Next action: operator walkthrough of the exact verified revised P8. Any material feedback returns to the smallest owning decision; otherwise explicit approval locks P8 and opens P9/P10 tracing.
