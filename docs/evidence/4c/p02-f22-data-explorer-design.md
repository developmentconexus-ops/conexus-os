# P-02 — F22 read-only Data Explorer design

> **Status:** `OPERATOR APPROVED / IMPLEMENTATION PLAN READY / NO REALIZATION AUTHORITY`
> **Scope:** P-02 Data only. P7 four-route structure remains valid; P8 remains NOT LOCKED.
> **Implementation authority:** none. This spec does not authorize 4A/4B recompile, HTML revision, Product implementation, P9/P10, P-03, 4D or merge.
> **Execution plan:** [F22 Read-Only Data Explorer Implementation Plan](p02-f22-data-explorer-implementation-plan.md)

## 1. Decision outcome

The operator walkthrough plus Mitra screenshots materially falsify the current F20 assumption that Data can stop at semantic resource metadata and must reject a physical data explorer.

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

## 2. Evidence / Known / Unknown / Deferred

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

### Inferred, to be falsified during 4A/4B recompile

```text
I1  No new semantic owner is required; Project remains the Product projection owner for Project-scoped Data disclosure.
I2  project.data.read is the natural existing authority candidate, provided it can honestly cover raw disclosable Project data without widening protected source disclosure.
I3  No new durable record class is required; explorer catalogs/rows can be current projections over existing Project DB / bound source truth.
I4  Existing ProjectConnectionBinding coordinates should remain the exact external-source basis; the explorer must not invent caller-selected Connection/revision/environment authority.
```

### Unknown until recompile / source feasibility

```text
U1  Exact fixed Product operation count required to close source discovery, object inspection and row browsing.
U2  Exact wire spelling and HTTP shape.
U3  Which connector definitions can truthfully expose a bounded read-only tabular explorer.
U4  Whether any current source requires additional server-side disclosure/masking policy before raw rows are safe to expose.
```

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

F20 then made the semantic projection richer but still treated metadata as the primary Data experience. The user cannot perform the actual job "open the data and inspect the records."

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

One UI may compose both projections, but neither becomes the other's authority.

### F22-I4 — read-only end to end

No F22 path may create a Product authority for SQL text, DML, DDL, record mutation, schema mutation, migration, credential access or arbitrary provider execution.

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
```

If a continuation becomes invalid/stale, the client surfaces that state and requires an explicit refresh; it never silently restarts and presents mixed pages as one coherent snapshot.

## 5. Credible alternatives

### A — separate read-only explorer projection — SELECTED

Keep semantic `ProjectDataResource` meaning distinct from physical explorer truth. Add only the Product reads required for source/object/row inspection.

**Strengths:** truthful ownership, strong security boundary, supports internal + external data, avoids turning semantic resources into a database DTO, grows cleanly if source capabilities differ.

**Cost:** likely requires a small new read family rather than zero-operation enrichment.

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

`DERIVED` is not automatically a physical source. A derived table/view/dataset remains under the physical source that actually serves it (normally the Project Database in F1) and may additionally carry derived semantic/origin presentation.

The existing F20 semantic `sourceKind = INTERNAL | INTEGRATION | DERIVED` must therefore not be reused as though it were the explorer's physical source identity.

A Connection existing in the Workspace is not enough. A source is explorer-eligible only when current Project binding plus its connector/source contract can truthfully provide bounded read-only tabular discovery/read semantics.

Examples of non-eligible Connections in F1 may include non-tabular providers such as chat/messaging integrations.

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

The UI may present both under `Rules`, but must visibly distinguish their authority source.

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

A page token is scoped to the exact Project/source/object/filter/order request. It may not be replayed to switch object/source or widen disclosure.

Large/binary/structured cell payloads may be server-bounded for the grid, but truncation must be explicit. A preview may never be represented as the full value. F1 adds no generic Blob/export/download endpoint merely to inspect a large cell.

## 7. Bounded filter / sort grammar

F22 provides safe exploration, not a query language.

Minimum candidate operator set:

```text
EQ
NE
GT
GTE
LT
LTE
CONTAINS     only for compatible text-like columns
IS_NULL
IS_NOT_NULL
```

Rules:

```text
column must come from the exact disclosed object structure
operator must be compatible with the disclosed column type
values remain data, never executable syntax
server validates every filter
server chooses bind/parameter mechanism for the concrete source
caller cannot supply SQL fragments, functions, casts, joins or expressions
```

Sorting is similarly bounded to disclosed columns and ASC/DESC. The exact maximum sort/filter cardinality is a realization concern unless a source probe proves a Product-level limit is necessary.

## 8. UX contract for the next P8

### 8.1 Layout

```text
PROJECT > DATA

┌ Sources / objects ───────────────┬ Object workspace ───────────────────────┐
│ Search data...                   │ [ TGFCAB × ] [ TGFITE × ] [ tasks × ]  │
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

The tree is physical-source-first. `Derived` may appear as an object badge/filter or contained collection, but never as a fake physical source when the data is actually served by the Project Database.

### 8.2 Default object tab

`Data` is the default. Metadata is never presented as though it were the table contents.

Secondary tabs:

```text
Data
Structure
Relationships
Rules
```

`Analyze` remains a distinct governed semantic capability inside Data and must not be relabeled or implemented as SQL.

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

No separate row mutation domain is admitted. F1 should prefer already-disclosed page data; a future dedicated row-detail read requires a real payload-size/disclosure consumer.

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

The next P8 must make these visibly distinct:

```text
source loading
source known-empty
no explorer-eligible source
source denied/non-disclosable
source dependency unavailable

object loading
object absent/non-disclosable
object has zero rows
object structure available but row read unavailable

rows loading
rows empty
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

Explorer responses must not disclose:

```text
passwords
credential handles usable for retrieval
connection strings
host/port secrets
provider access tokens
private storage keys
```

Human source context such as `Sankhya ERP · Production · Oracle` may be presentation only when already safely derivable from admitted source/binding truth.

`qualified Connection != fresh/current data`; qualification, binding and data freshness remain distinct truths.

### 11.3 Cross-scope references fail closed

A guessed source/object/page token from another Project/Workspace cannot become an existence oracle or disclosure grant.

### 11.4 Sensitive raw data

F22 does not invent a browser-local masking policy.

If current Project/source authority cannot safely decide whether an object/column/row is disclosable, that source/object is **not explorer-eligible** until the owning authority is closed. The frontend must never receive protected raw data and hide it cosmetically.

## 12. Authority-recompile hypothesis — not yet authority

Three **human jobs** are proven; fixed operation count remains a derivation, not a target.

```text
J1 Browse Project Data Explorer
→ discover current explorer-eligible physical sources / namespaces / objects
→ support server-side object search or lazy browse where source scale requires it

J2 Inspect exact Data Object
→ structure / relationships / constraints + semantic augmentation

J3 Browse exact Data Object rows
→ typed bounded filter + sort + pagination
```

The 4A/4B recompile must choose the smallest honest operation set. It may be three reads, or may split source/object discovery if large-schema lazy discovery cannot be represented truthfully without inventing a generic tree framework.

Desired invariants, not predetermined counts:

```text
new semantic owners = 0
new durable record classes = 0
new write authority = 0
SQL authority = 0
credential disclosure = 0
new ordinary Permission = 0 if project.data.read is semantically sufficient
```

If `project.data.read` cannot safely cover raw explorer disclosure, STOP and reopen only the Permission/disclosure decision; do not silently widen it.

## 13. Proof strategy before realization

### 13.1 Authority RED

Before changing 4A/4B, create a falsifier proving current F20 authority cannot satisfy J1–J3.

Expected RED properties:

```text
current authority has no real source/object row browse
current F20 explicitly rejects physical topology
all unrelated 4A/4B/P-02 guards stay green
```

### 13.2 Recompile GREEN

After operator-approved authority realization:

```text
4A current authority updated first
4B OAS/wire updated second
4A ↔ OAS bijection green
Project owner checker green
whole-4B adversarial/executable proof green
generated projection/no-parallel-DTO proof green
ordinary Permission census unchanged unless a separately ratified disclosure finding proves otherwise
```

### 13.3 Negative controls

At minimum prove:

```text
F22 cannot admit SQL text / expression fragments
F22 cannot admit mutation/DDL operations
F22 cannot disclose hub_control or substrate/provider stores
cross-Project source/object refs fail closed
unbound/ineligible integration source cannot be browsed
caller cannot choose Connection revision/environment independently of Project binding
filter may target only disclosed exact-object columns
filter operator/type mismatch is rejected
page token cannot switch Project/source/object/filter/order scope
credentials never appear in explorer projection
unknown total count is not rendered as zero
truncated cell preview cannot masquerade as complete value
```

### 13.4 Functional P8 proof

The revised HTML must demonstrate, fixture-only:

```text
physical source tree for Project Database + eligible integrations
derived objects at truthful physical source with derived presentation
large-source object search/lazy browse behavior
multiple object tabs
Data grid as default
Structure / Relationships / Rules secondary tabs
physical + human naming together
safe filter / sort / column visibility
opaque next-page behavior without mandatory total count
Row Inspector
explicit truncated/large-value presentation
Analyze remains distinct from SQL
material failure/empty/denied states
no network / persistence / Product implementation authority
```

### 13.5 Independent challenge before F22 ratification

Because F22 opens new raw-data disclosure paths across Project DB and external sources, a fresh independent review is required before authority ratification. The challenge must attack at least:

```text
cross-Project/Workspace disclosure
hub_control/substrate exposure
reuse of project.data.read
Connection binding vs raw-source disclosure
SQL/expression escape hatches
page-token scope
sensitive-column/row leakage
operation/framework overgeneralization
```

Reviewer findings remain Evidence and must return to the smallest owning decision; they cannot silently create new Product authority.

## 14. Adversarial challenge

### "This is just pgAdmin inside Conexus"

Rejected by scope. F22 has no SQL, mutation, DDL, migrations, index/admin tooling, arbitrary connection target or credential access. The real consumer is Project data comprehension, not database administration.

### "One generic tree API would be simpler"

Possibly local-maximum only. A generic Resource tree risks becoming framework authority. The recompile may use lazy discovery but must keep Data-specific typed semantics and a real consumer for every axis.

### "Raw integration tables leak too much"

Valid risk. Eligibility is fail-closed. A bound Connection is not automatically raw-data disclosure authority. Source/connector + current Project authority must explicitly support the explorer projection; otherwise F22 does not list/browse it.

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
cross-page snapshot consistency becomes a Product requirement
non-tabular data requires a materially different exploration model
payload size proves Row Inspector requires an exact row/cell detail read
source scale proves the selected discovery shape cannot remain bounded
```

## 16. Current gate

```text
P7 = OPERATOR APPROVED
F22 written spec = OPERATOR APPROVED
F22 implementation plan = READY / EXECUTION NOT AUTHORIZED
4A/4B F22 recompile = NOT STARTED
revised P8 = NOT STARTED
P8 lock = BLOCKED
P9/P10 = BLOCKED
P-03+ = NOT OPEN
P11 = NOT ASSEMBLED
4D = NOT STARTED
Product implementation = BLOCKED
merge = NOT AUTHORIZED
```

Next action: operator execution authorization for `p02-f22-data-explorer-implementation-plan.md`. No realization begins from this document alone.
