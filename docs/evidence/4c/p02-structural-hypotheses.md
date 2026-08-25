# 4C P-02 — Project Data / Capabilities / Integrations / Brain Structural Hypotheses

> **Status:** `P7 REBASELINED / OPERATOR APPROVED DESIGN / P8 BLOCKED PENDING EXPLICIT EXECUTION AUTHORITY / NOT LOCKED`
> **Block:** `P-02 — Data / Capabilities / Integrations / Brain`
> **Leading hypothesis:** `A — Four coherent Project lenses`
> **Methods:** DevelopmentConexus Engineering Method v1.0.0 + Frontend Product Experience Planning Method v2.3.
> **Product implementation authority:** none.

F22 and F23 materially changed the P-02 authority baseline after the original P7. This record is the bounded v2.3 P7 rebaseline. It preserves all unaffected Project IA/locks, incorporates the current 122-operation wire, and does not authorize revised P8 HTML, production components, P-03, P11, 4D or Product implementation.

---

## 1. Human job and protected IA

Inside one exact Project, the four routes are distinct human lenses over the same Product:

```text
Data         → what facts/records does this Project own or have authority to read, how are they physically structured, and what do they mean?
Brain        → what enterprise meaning has this Project adopted and has available in its Project Brain context?
Capabilities → what business/semantic behavior does this Project expose and what is its human contract?
Integrations → which external systems/resources does this Project use through governed bindings?
```

Compact mental model:

```text
Data         = FACTS
Brain        = MEANING
Capabilities = BEHAVIOR
Integrations = EXTERNAL SYSTEMS
```

GF-01 keeps these as direct Project destinations. Coherence comes from the exact Project and server-owned relationships, not from introducing another abstraction layer.

```text
four distinct human jobs
-X-> generic Project Resources domain
-X-> backend-owner navigation
-X-> endpoint/revision/binding console as root UX
```

---

## 2. Current evidence and dispositions

The current decision space incorporates:

- F16–F21 human-recognizable Data/Capability/Integration/Brain-binding projections;
- F22 operator-proved need for real read-only tabular inspection;
- F23 operator-proved need for server-resolved Project Brain Context;
- existing W-02A Workspace Brain governance and W-02B Connections lifecycle locks.

Material capability dispositions:

| Capability / structure | Disposition |
| --- | --- |
| real authorized table/view rows | `PRESENT-IN-AUTHORITY` — F22 |
| physical + semantic Data together | `PRESENT-IN-AUTHORITY` |
| Project-resolved adopted/available Brain knowledge | `PRESENT-IN-AUTHORITY` — F23 |
| Workspace Brain governance inside Project | `REJECTED` — duplicate authority |
| SQL editor / unrestricted DB console | `REJECTED` — Product boundary |
| generic Capability runner | `REJECTED` — inspection != invocation |
| Project bindings first / Connection mechanics second | `PRESENT-IN-AUTHORITY` |
| generic Project Resources hub | `REJECTED` — unnecessary depth/ontology |
| browser-derived Brain applicability | `REJECTED` — frontend authority |
| Data field → exact Brain concept cross-link | `DEFERRED` — no current exact relation/consumer |
| Integration → exact Capability dependency map | `DEFERRED` — no current exact relation/consumer |

No reference capability is rejected merely because an API is absent; the two deferred cross-route relationships lack a proven current job/owner truth, not merely a route.

---

## 3. Competing structural hypotheses

### A — Four coherent Project lenses

**SELECTED / OPERATOR APPROVED P7 DESIGN.**

```text
PROJECT
│
├── DATA — PRJ-S11 + PRJ-S12
│   ├── Sources / objects = physical-source-first browse
│   ├── exact object workspace
│   │   ├── Data = default real rows/columns
│   │   ├── Structure
│   │   ├── Relationships
│   │   └── Rules / constraints with authority distinction
│   ├── semantic augmentation from PRJ-18/19 where server-linked
│   └── Analyze = contextual secondary semantic workspace
│
├── BRAIN — PRJ-S19A + PRJ-S19B
│   ├── Project Brain Context = primary
│   │   ├── adopted/available domains
│   │   ├── concepts + summaries
│   │   ├── SEMANTIC | KNOWLEDGE | EVIDENCE_SPEC content
│   │   ├── bounded sections / provenance
│   │   └── current binding/conformance/update context
│   ├── Binding administration = secondary
│   │   ├── change revision → purpose-bound BRN-02 chooser
│   │   └── set / clear exact binding through PRJ-11/12
│   └── Workspace Brain governance = explicit cross-boundary handoff
│
├── CAPABILITIES — PRJ-S13
│   ├── human name + purpose first
│   ├── QUERY | ACTION | INTEGRATION classification
│   ├── logical inputs / outputs
│   └── capabilityId / operationId as secondary technical identity
│
└── INTEGRATIONS — PRJ-S14 + PRJ-S15
    ├── Used by this Project = primary
    │   ├── recognizable ProjectConnectionBinding
    │   ├── add/change → purpose-bound CON-03 chooser
    │   └── remove binding
    └── Project-owned Connections = secondary lifecycle region
```

Why A is the Global Maximum:

1. **Task completion:** each route answers one stable human question while remaining one coherent Project experience.
2. **Truthfulness:** Data exposes facts instead of metadata masquerading as data; Brain exposes Project-resolved meaning instead of binding metadata masquerading as understanding.
3. **Authority fit:** server-owned projections close the user jobs without browser inference or screen-shaped convenience APIs.
4. **Progressive disclosure:** human meaning leads; technical coordinates/binding mechanics remain inspectable when needed.
5. **Ownership preservation:** Workspace Brain publication and Connection lifecycle remain in their accepted homes.
6. **YAGNI:** no Resources hub, universal graph, SQL console, capability runner, generic Context owner or speculative cross-route dependency framework.
7. **Responsive viability:** each route has one dominant job and can collapse secondary detail/management into drawers/sheets without changing semantic ownership.

### B — One Project Resources hub

**REJECTED.**

```text
Resources
→ Data | Brain | Capabilities | Integrations
```

It adds depth without improving a user job, makes “resource” look like Product ontology, weakens direct findability, and pressures materially different owners into false shared CRUD/patterns.

### C — Backend/engineering console

**REJECTED.**

```text
Bindings / Revisions / Schemas / Operations / Connections / Semantic Catalog
```

It mirrors backend mechanics, promotes revision/binding vocabulary ahead of user outcomes, and is the exact backend-shaped UX local maximum prohibited by Frontend Method v2.3.

---

## 4. Route-level structure

### 4.1 Data — facts first

F22 replaces the old metadata-first Data hypothesis.

```text
PRJ-25 ListProjectDataExplorerSources
→ Project Database + exact explorer-eligible currently bound integration sources

PRJ-26 ListProjectDataExplorerObjects
→ TABLE | VIEW | genuinely tabular DATASET

PRJ-27 GetProjectDataExplorerObject
→ physical columns / key roles / relationships / constraints

PRJ-28 ListProjectDataExplorerRows
→ actual read-only rows
→ bounded typed filter / sort / continuation
```

The exact object defaults to **Data**, not metadata. Structure, Relationships and Rules are secondary lenses.

Semantic augmentation stays separate:

```text
PRJ-18 / PRJ-19
→ semantic Data-resource name / grain / freshness / coverage / provenance / fields / relationships / rules

PRJ-27/28 optional semanticDataResourceId / semanticFieldId
→ server-owned cross-link only
```

```text
physical identity != semantic meaning
bounded read-only explorer != unrestricted database console
```

Analyze remains contextual:

```text
BRN-13 GetProjectAnalyticQueryCatalog
→ server-admitted semantic choices

BRN-12 RunAnalyticQuery
→ deterministic governed submit
→ current Project/Brain/binding/health revalidation
```

No SQL editor, free-form expression/join, DML/DDL, browser source authority or frontend semantic catalog is admitted.

### 4.2 Brain — meaning first, binding second

The Project Brain route is no longer binding-only.

Primary surface:

```text
BRN-14 GetProjectBrainContext
→ exact Project
→ current Project Brain binding
→ server-resolved Project-local realization/refinement
→ adopted/available domains / concepts / content / provenance
→ validationState + updateAvailable context
```

Critical distinction:

```text
Project Brain Context
!= whole Workspace Brain publication
!= runtime effectiveBrainSlice
```

The browser never loads the whole Workspace Brain and guesses applicability.

Secondary administration remains:

```text
PRJ-10 GetProjectBrainBinding

change revision
→ BRN-02 purpose-bound immutable revision chooser
→ project.manage + brain.bind
→ PRJ-11 SetProjectBrainBinding

clear
→ PRJ-12 ClearProjectBrainBinding
```

`brain.read + project.read` owns Project-context inspection; `project.manage + brain.bind` owns binding change. **Understand != administer.**

Workspace Brain Discovery/proposals/review/publication remain W-02A and may only be reached through an explicit boundary/cross-link.

### 4.3 Capabilities — human contract first

```text
PRJ-16 ListProjectCapabilities
PRJ-17 GetProjectCapability
→ human name
→ purpose
→ regime = QUERY | ACTION | INTEGRATION
→ logical inputs / outputs
→ capabilityId / operationId
```

P7 priority:

```text
purpose / human contract
→ logical inputs/outputs
→ technical identity when needed
```

Inspection creates no generic Run/Execute authority.

### 4.4 Integrations — Project use first

Primary question: **which external systems/resources does this Project use?**

```text
PRJ-13 ListProjectConnectionBindings
→ connectionName + exact binding/revision/environment

add/change
→ CON-03 purpose-bound exact-Project chooser
→ project.manage + connection.use
→ PRJ-14 SetProjectConnectionBinding

remove
→ PRJ-15 RemoveProjectConnectionBinding
```

Binding/use and Connection lifecycle remain distinct:

```text
ProjectConnectionBinding != Connection
connection.use -X-> generic connection.read
```

Project-private Connections remain secondary contained lifecycle work. Workspace/shared Connections remain W-02B.

---

## 5. Cross-route coherence

The four lenses may cross-link only through exact server-owned coordinates.

```text
server-owned exact relation
→ contextual navigation allowed

same label / apparent semantic similarity / browser join
-X-> Product relationship
-X-> authorization
```

Currently proven cross-link:

```text
physical Data object/column
→ optional semanticDataResourceId / semanticFieldId
→ PRJ-19 semantic Data truth
```

Deliberately deferred until proven:

```text
Data field → exact Brain concept
Integration → exact Capability set
Capability → exact Connection dependency
```

This preserves whole-Product coherence without manufacturing a universal resource graph.

---

## 6. P7 feasibility register

| Required structural truth | Status | Current authority |
| --- | --- | --- |
| physical source/object discovery | `PRESENT-IN-AUTHORITY` | PRJ-25/26 |
| real rows + columns | `PRESENT-IN-AUTHORITY` | PRJ-27/28 |
| bounded filter/sort/paging | `PRESENT-IN-AUTHORITY` | PRJ-28 F22 wire |
| semantic Data meaning/provenance | `PRESENT-IN-AUTHORITY` | PRJ-18/19 |
| admitted Analyze choices/submit | `PRESENT-IN-AUTHORITY` | BRN-13/12 |
| Capability human contract | `PRESENT-IN-AUTHORITY` | PRJ-16/17 F21 |
| current Integration recognition | `PRESENT-IN-AUTHORITY` | PRJ-13 F17 |
| bindable Connection selection | `PRESENT-IN-AUTHORITY` | purpose-bound CON-03 |
| Integration writes | `PRESENT-IN-AUTHORITY` | PRJ-14/15 |
| Project-resolved Brain knowledge | `PRESENT-IN-AUTHORITY` | BRN-14 F23 |
| current Brain binding/admin | `PRESENT-IN-AUTHORITY` | PRJ-10/11/12 + purpose-bound BRN-02 |
| Workspace Brain governance boundary | `PRESENT-IN-AUTHORITY` | W-02A locked block |
| Data→Brain exact concept relation | `DEFERRED` | no proven current exact owner relation |
| Integration→Capability exact map | `DEFERRED` | no proven current exact owner relation |

No unresolved **blocking** upstream finding remains for this leading P7 structure. Deferred relationships are not required to complete the current four human jobs.

---

## 7. Client-state classification

| State | Class | Rule |
| --- | --- | --- |
| selected Data source/object/view | `URL_NAVIGATION` where re-entry matters | server revalidates untrusted coordinates |
| open Data object-tab set / column visibility / row selection | `EPHEMERAL_UI` | presentation only |
| filter draft | `FORM_DRAFT` | becomes bounded PRJ-28 request only on apply |
| Analyze selected dataset/semantics | `FORM_DRAFT` | becomes BRN-12 input only on submit |
| current Data/Capability/Integration/Brain truth | `SERVER` | browser never becomes durable authority |
| selected Brain domain/concept | `EPHEMERAL_UI` or later URL navigation if re-entry proves material | browse coordinate only |
| Connection / Brain chooser open state | `EPHEMERAL_UI` | presentation only |
| selected Connection/revision before binding | `FORM_DRAFT` | owner writes decide on submit |

---

## 8. Material states for revised P8

```text
Data:
loading != known-empty != denied != absent/non-disclosable != dependency unavailable
object exists + structure available != row read available
unknown total != zero
stale continuation != fresh page
truncated value != complete value

Analyze:
empty admitted catalog != missing Brain binding != unhealthy/unavailable dependency
catalog choice != durable submit authority
binding/semantic change may invalidate submit

Capabilities:
known-empty != denied/non-disclosable != read failure
inspection != invocation eligibility

Integrations:
no binding != no eligible Connection != denied disclosure
configured != qualified != bound != healthy
selection disclosure != Connection management authority

Brain:
no binding != bound with known-empty Project context != denied/non-disclosable != dependency failure
Project context != whole Workspace publication
Project context != runtime effective slice
bound current != update available
context inspection authority != binding-change authority
```

---

## 9. Explicit forbidden frontend authority

```text
generic Project Resources hub as new Product ontology = REJECTED
backend owner/revision/binding console as root UX = REJECTED
browser-derived Brain applicability = FORBIDDEN
Project Brain Context portrayed as runtime effectiveBrainSlice = FORBIDDEN
Project Brain UI owning Workspace publication/review = FORBIDDEN
brain.bind promoted to brain.read = FORBIDDEN
generic capability Run/Execute control = FORBIDDEN
SQL editor / unrestricted DB console = FORBIDDEN
frontend-owned analytic semantic catalog = FORBIDDEN
connection.use promoted to generic connection.read = FORBIDDEN
Project binding UI owning Workspace Connection lifecycle = FORBIDDEN
human label used for routing/authorization = FORBIDDEN
unproven cross-route relationship inferred from matching labels = FORBIDDEN
```

---

## 10. Operator gate

The operator approved this rebaselined four-lens P7 design while authorizing F23 authority correction. That approval does **not** authorize construction of a new P8 artifact automatically.

```text
P-02 = OPEN / F23 AUTHORITY GREEN
P7 = REBASELINED / OPERATOR APPROVED DESIGN
P8 = BLOCKED PENDING EXPLICIT EXECUTION AUTHORITY
existing F22 P8 = historical/learning Evidence / NOT LOCKABLE AFTER F23
P-02 = NOT LOCKED
P9/P10 = BLOCKED
P-03+ = NOT OPEN
P11 = NOT ASSEMBLED
4D = NOT STARTED
Product implementation = BLOCKED
```

Next bounded gate:

```text
operator explicitly authorizes revised P8 execution
→ TDD/structural proof for the rebaselined P8
→ revise the same P-02 functional low-fi artifact only
→ fresh Verify
→ operator walkthrough
→ only operator may LOCK P8
```
