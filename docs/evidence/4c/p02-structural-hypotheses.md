# 4C P-02 — Project Data / Capabilities / Integrations / Brain Structural Hypotheses

> **Status:** `P7 CANDIDATE / OPERATOR REVIEW REQUIRED / P8 BLOCKED / NOT LOCKED`
> **Block:** `P-02 — Data / Capabilities / Integrations / Brain`
> **Leading hypothesis:** `A — Four focused Project routes`
> **Product implementation authority:** none.

P-02 authority is closed through F16–F19 and whole-wire verification. This record performs only P7 layout/interaction-structure reasoning. It does not authorize P8 HTML, final visual design, route implementation, production components, new Product authority, P-03, P11 or 4D.

---

## 1. Human job and protected IA

Inside one exact Project, a person must be able to understand four distinct questions:

```text
Data         → what data can this Project read/reason over, and what does that data mean?
Capabilities → what semantic operations does this Project expose?
Integrations → which external systems/resources does this Project use?
Brain        → which shared enterprise meaning/revision does this Project adopt?
```

GF-01 already gives these jobs distinct Project navigation destinations. P-02 therefore starts from the rule:

```text
four distinct human jobs
-X-> one generic Resources domain
-X-> backend-owner navigation
-X-> endpoint-shaped pages
```

The block may compose related operations inside each destination, but it may not collapse semantic owners or invent a universal resource/binding framework.

---

## 2. Reference Evidence reused at P7

The P-02 preflight already performed the relevant conditional P6 study:

- Microsoft Power Platform separates reusable Connection lifecycle from application/solution Connection Reference consumption.
- Superblocks separates reusable managed integrations from application use and keeps organizational knowledge distinct from application-level context.

That evidence still supports the current Conexus ownership split:

```text
Connection lifecycle       = Connections owner
Project use                = ProjectConnectionBinding
Workspace published meaning = Brain owner
Project adoption           = ProjectBrainBinding
```

No additional reference sweep is justified for P7 because the remaining ambiguity is local structure, not missing product-model evidence.

---

## 3. Competing structural hypotheses

### A — Four focused Project routes

**LEADING CANDIDATE / OPERATOR REVIEW REQUIRED.**

```text
PROJECT
│
├── DATA — PRJ-S11 + PRJ-S12
│   ├── resource catalog = default context
│   ├── exact resource detail
│   │   ├── human name
│   │   ├── grain
│   │   ├── freshness
│   │   ├── coverage
│   │   └── provenance
│   └── Analyze = contextual secondary workspace inside Data
│       ├── BRN-13 admitted dataset/semantic choices
│       ├── form-draft selection
│       └── BRN-12 governed submit/result
│
├── CAPABILITIES — PRJ-S13
│   ├── browse/group by QUERY | ACTION | INTEGRATION
│   └── exact capability detail
│       └── semantic operation identity / inspection only
│
├── INTEGRATIONS — PRJ-S14 + PRJ-S15
│   ├── Used by this Project = primary context
│   │   ├── recognizable ProjectConnectionBinding
│   │   ├── add/change binding → purpose-bound CON-03 chooser
│   │   └── remove binding
│   └── Project connections = secondary contained lifecycle region
│       └── private Project-owned Connection work without redefining bindings
│
└── BRAIN — PRJ-S19
    ├── current Project adoption / revision / validation state
    ├── update-available context
    ├── change revision → purpose-bound BRN-02 chooser
    ├── set / clear exact binding
    └── Workspace Brain publication remains a separate cross-link/boundary
```

Why A leads:

1. **Task completion:** each destination answers one stable human question already represented in the locked Project rail.
2. **Recognition:** F16/F17/F18/F19 now supply the missing labels/selection projections, so the UI no longer needs opaque-ID interpretation or fabricated joins.
3. **Context preservation:** Analyze stays with Data; Connection lifecycle stays adjacent to Project binding work; Brain publication remains outside Project adoption.
4. **Cognitive load:** the ordinary user sees Project concepts, not revision/binding/provider owners as navigation.
5. **Authority fit:** purpose-bound `CON-03` and `BRN-02` selection can appear exactly where used without becoming generic browse grants.
6. **Responsive viability:** each route can collapse master/detail or chooser panels into focused sheets without merging the four jobs.
7. **YAGNI:** no fifth Resources hub, generic binding framework, SQL console, capability runner or duplicate Workspace Brain/Connections administration is required.

### B — One Project Resources hub

**NOT LEADING.**

Candidate:

```text
Resources
→ Data | Capabilities | Integrations | Brain tabs
```

Why it loses:

- duplicates the already accepted Project rail with one extra navigation layer;
- groups concepts because they are “resources,” not because humans perform one coherent job;
- makes a generic resource abstraction look like Product ontology;
- weakens direct deep-link/findability for Data, Integrations and Brain;
- creates pressure for shared CRUD/list/detail patterns across owners that deliberately differ.

### C — Backend-owner-first resource console

**NOT LEADING.**

Candidate:

```text
Resources / Bindings / Revisions / Connections / Semantic Catalog
```

Why it loses:

- mirrors backend ownership/mechanics rather than user outcomes;
- exposes revision and binding vocabulary as primary navigation;
- encourages generic read/manage authority by symmetry;
- makes Connections and Brain lifecycle appear Project-owned;
- trends toward an admin/engineering console rather than a coherent software-building Product.

---

## 4. Route-level structure

### 4.1 Data — PRJ-S11 + PRJ-S12

Default state is the human resource catalog. Selection preserves the Data route while revealing exact detail.

```text
PRJ-18 ListProjectDataResources
→ name = human recognition
→ dataResourceId = exact machine identity

dataResourceId != name

PRJ-19 GetProjectDataResource
→ grain / freshness / coverage / provenance
```

Analyze is a contextual secondary workspace in Data, not a new top-level Project domain:

```text
BRN-13 GetProjectAnalyticQueryCatalog
→ only server-admitted semantic choices

BRN-12 RunAnalyticQuery
→ deterministic governed submit
→ server revalidates current Project grant/binding/health/admission
```

No arbitrary SQL, physical tables/schemas/joins, natural-language planner or frontend-owned semantic catalog is admitted.

### 4.2 Capabilities — PRJ-S13

Capabilities are human inspection of exact Release/authored semantics:

```text
PRJ-16 ListProjectCapabilities
PRJ-17 GetProjectCapability
→ capabilityId
→ operationId
→ regime = QUERY | ACTION | INTEGRATION
```

Grouping by regime is presentation only. Inspection does not imply invocation authority, so P7 admits no generic Run/Execute control.

### 4.3 Integrations — PRJ-S14 + PRJ-S15

The primary question is “what is this Project using?” rather than “what Connections exist globally?”

```text
PRJ-13 ListProjectConnectionBindings
→ connectionName + exact binding/revision/environment

add/change binding
→ CON-03 purpose-bound exact-Project chooser
→ project.manage + connection.use
→ PRJ-14 SetProjectConnectionBinding

remove binding
→ PRJ-15 RemoveProjectConnectionBinding
```

Binding and lifecycle remain distinct inside the same external-system work context:

```text
ProjectConnectionBinding != Connection
connection.use -X-> generic connection.read
```

Project-private Connections may appear as a secondary contained region because they are legitimately Project-owned Connections. Workspace/shared Connection administration remains W-02B, not duplicated here.

### 4.4 Brain — PRJ-S19

The route is Project adoption, not Workspace knowledge authoring.

```text
PRJ-10 GetProjectBrainBinding
→ current exact Project adoption/validation/update truth

change revision
→ BRN-02 purpose-bound immutable revision chooser
→ project.manage + brain.bind
→ PRJ-11 SetProjectBrainBinding

clear
→ PRJ-12 ClearProjectBrainBinding
```

```text
brain.bind -X-> generic brain.read
Project Brain binding != Workspace Brain publication
```

A link/handoff to Workspace Brain may exist only as navigation to the already-owned W-02A domain when disclosed; P-02 does not inline publication/review authoring.

---

## 5. P7 lightweight feasibility register

| Required structural truth | Status | Evidence / rule |
| --- | --- | --- |
| Data human label + exact identity | `PRESENT-IN-AUTHORITY` | F16: `name` + `dataResourceId`; `dataResourceId != name` |
| Data grain/freshness/coverage/provenance | `PRESENT-IN-AUTHORITY` | PRJ-19 |
| Analyze dataset/semantic choices | `PRESENT-IN-AUTHORITY` | BRN-13 GetProjectAnalyticQueryCatalog |
| Governed analytic submit | `PRESENT-IN-AUTHORITY` | BRN-12 RunAnalyticQuery |
| Capability semantic identity/regime | `PRESENT-IN-AUTHORITY` | PRJ-16/17 |
| Existing binding human recognition | `PRESENT-IN-AUTHORITY` | F17 `connectionName` on ProjectConnectionBinding |
| Bindable Connection selection | `PRESENT-IN-AUTHORITY` | purpose-bound CON-03; no generic connection.read |
| Integration material writes | `PRESENT-IN-AUTHORITY` | PRJ-14 set + PRJ-15 remove |
| Current Brain adoption | `PRESENT-IN-AUTHORITY` | PRJ-10 |
| Bindable immutable Brain revision selection | `PRESENT-IN-AUTHORITY` | purpose-bound BRN-02; no generic brain.read |
| Brain material writes | `PRESENT-IN-AUTHORITY` | PRJ-11 set + PRJ-12 clear |
| Pagination / scale | `PRESENT-IN-AUTHORITY` | P7 requires no new server search/pagination contract; existing collection wire remains authoritative; P8 may use bounded fixtures only |
| Sort / filter | `PRESENT-IN-AUTHORITY` | no server filter is required for the leading structure; presentation may group already-disclosed capability rows by regime without claiming new completeness authority |
| Preview/content truth | `PRESENT-IN-AUTHORITY` | exact server projections above are sufficient; no synthetic resource preview is required |

No blocking P7 `FINDING` remains. If operator walkthrough later proves scale/search or another missing truth material, reopen only that smallest owner decision.

---

## 6. Client-state classification candidate

| State | Class | Rule |
| --- | --- | --- |
| selected Data resource / capability detail | `URL_NAVIGATION` | exact opaque ID is an untrusted reference; server revalidates disclosure |
| Analyze selected dataset/semantics before submit | `FORM_DRAFT` | becomes BRN-12 input only on submit |
| current resource/binding/Brain/capability truth | `SERVER` | browser never becomes durable authority |
| Connection / Brain chooser open state | `EPHEMERAL_UI` | presentation only |
| selected Connection/revision before binding submit | `FORM_DRAFT` | PRJ-14/11 and current owner state decide |
| local route grouping/expanded detail | `EPHEMERAL_UI` | no Product truth |

---

## 7. Material states carried to P8/P9

```text
Data:
loading != known-empty != denied != absent/non-disclosable != dependency failure
freshness unknown != fresh
coverage partial != complete

Analyze:
empty admitted catalog != missing Brain binding != unhealthy/unavailable dependency
catalog choice read != durable submit authority
binding/semantic change after read may invalidate BRN-12 submit

Integrations:
no binding != no eligible Connection != denied disclosure
configured != qualified != bound != healthy
selection disclosure != Connection management authority

Brain:
no binding != bound != update available
published revision selection != Workspace Brain authoring
chooser visibility != brain.read grant
```

---

## 8. Explicit forbidden frontend authority

```text
generic Project Resources hub as new Product ontology = REJECTED
backend owner/revision/binding console as root UX = REJECTED
generic capability Run/Execute control = FORBIDDEN
SQL / physical schema / join explorer = FORBIDDEN
frontend-owned analytic semantic catalog = FORBIDDEN
connection.use promoted to generic connection.read = FORBIDDEN
brain.bind promoted to generic brain.read = FORBIDDEN
Project binding UI owning Connection lifecycle = FORBIDDEN
Project Brain UI owning Workspace publication = FORBIDDEN
human label used for routing/authorization = FORBIDDEN
```

---

## 9. Operator gate

```text
P-02 = OPEN / AUTHORITY CLOSED
P7 = CANDIDATE / OPERATOR REVIEW REQUIRED
P8 = BLOCKED
P-02 = NOT LOCKED
P-03+ = NOT OPEN
P11 = NOT ASSEMBLED
4D = NOT STARTED
Product implementation = BLOCKED
```

If the operator approves A, the next authorized increment is to record P7 approval and then explicitly open functional P8 Evidence. Until that approval, no P8 HTML is authorized.