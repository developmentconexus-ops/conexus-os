# P-02 — F16–F19 selected authority-correction contract

> **Status:** `OPERATOR SELECTED / SPEC WRITTEN / 4A+4B RECOMPILE NOT STARTED`
> **Scope:** bounded cross-layer correction discovered by P-02 frontend authority-feasibility work
> **Parent Evidence:** [p02-authority-feasibility-preflight.md](p02-authority-feasibility-preflight.md)
> **Method:** DevelopmentConexus Engineering Method v1.0.0 + Frontend Product Experience Planning Method v2.2
> **Product implementation authority:** none

## 1. Decision

P-02 proved four material human-operability gaps in the accepted Product/wire surface. The operator selected `F16..F19` with the narrowings below.

The decision outcome is:

```text
CURRENT STRUCTURE CONFIRMED
+
bounded Product/wire correction
```

No owner, trust boundary, durable record class or ordinary Permission is added. Existing Project, Brain and Connections ownership remains canonical.

The frontend must not work around these gaps by inventing display truth, requiring opaque IDs from a human, broadening read Permissions locally, reading Brain Git/Connection configuration through foreign authority, or fabricating semantic catalogs.

## 2. Shared invariant

For every P-02 selection or inspection job:

```text
human-recognizable presentation
+ exact machine identity
+ exact current scope/authority
→ server-owned admissible choice
```

and never:

```text
human label → authorization
frontend join → effective authority
screen visibility → grant
opaque ID memorization → acceptable primary UX
```

Selection disclosure is purpose-bound to the exact write/read job that needs it and must not silently become generic domain read authority.

---

## 3. F16 — Data human identity

### Evidence / root cause

`PRJ-18 ListProjectDataResources` currently exposes `ProjectDataResourceSummary.dataResourceId` only. `PRJ-19 GetProjectDataResource` adds `grain`, `freshness`, `coverage` and `provenance`, but current authority does not define `dataResourceId` as guaranteed human presentation identity.

P-02 has a real human browse consumer, so an opaque machine identity alone is insufficient.

### Target invariant

```text
Data browse
→ person recognizes the declared resource
→ exact dataResourceId remains canonical machine identity
```

### Selected correction

Enrich the existing Project Data projections only:

```text
ProjectDataResourceSummary
  dataResourceId
  name

ProjectDataResource
  dataResourceId
  name
  grain
  freshness
  coverage
  provenance
```

`name` is required, nonblank, server-owned human presentation.

```text
name -X-> routing
name -X-> authorization
name -X-> containment
name -X-> uniqueness authority
```

### Explicitly rejected

```text
new ListHumanDataResources operation
generic metadata editor
physical database/schema/table browser
frontend formatting of dataResourceId as Product truth
```

### Count impact

```text
new operations = 0
new Permissions = 0
new owners = 0
new records = 0
```

---

## 4. F17 — Integration binding recognition and candidate disclosure

### Evidence / root cause

`PRJ-13 ListProjectConnectionBindings` currently exposes:

```text
connectionId
connectionRevisionId
environment
```

without the Connections-owned human `Connection.name`.

`PRJ-14 SetProjectConnectionBinding` requires:

```text
project.manage + connection.use
+ exact qualified compatible ConnectionRevision/environment
```

while the existing human Connection catalog `CON-03 ListConnections` is ordinarily disclosed under `connection.read`.

Therefore the accepted binding write can exist without an admitted human-recognizable selection/read path unless the frontend silently demands a stronger unrelated read Permission.

### Target invariant

```text
person can recognize an existing Project binding
and choose a currently admissible Connection candidate
without receiving generic Connection inspection authority
```

### Selected correction A — existing binding recognition

Enrich `ProjectConnectionBinding` with:

```text
connectionName
```

`connectionName` is a server-composed presentation snapshot/projection from the exact referenced logical Connection at response time; it is not binding identity, routing, authorization or a mutable foreign-owner mirror.

The exact binding identity remains:

```text
connectionId
+ connectionRevisionId
+ environment
```

### Selected correction B — purpose-bound reuse of CON-03

Do **not** add `ListBindableConnections`.

Reuse `CON-03 ListConnections` through an alternate, purpose-bound disclosure for Project binding selection.

The semantic route requires:

```text
exact target Project context
+ project.manage
+ connection.use
```

The 4B wire must carry the exact target Project context on the alternate route; an optional/explicit `forProjectId` query coordinate is the leading transport realization because the existing owner-scope path alone cannot prove which Project-scoped `connection.use` authority is being exercised.

For a Workspace-owned candidate the caller may read only the narrow existing `Connection` summary needed for selection. For a Project-owned candidate, the owner scope must be that same exact Project. Cross-Workspace or sibling-private disclosure remains denied.

The alternate route:

```text
-X-> CON-04 configuration read
-X-> credentials
-X-> Connection management
-X-> qualification authority
-X-> qualification history
-X-> generic connection.read
```

### Current F1 bindability presentation law

The existing `Connection.connectionTest` contains one current/relevant qualification projection, including its exact `environment` when present. P-02 must not manufacture a multi-environment qualification matrix.

A candidate may be presented as **currently bindable from the disclosed summary** only when:

```text
connectionTest.state = PASSED
AND currentRevisionId is the candidate revision
AND connectionTest.environment is the submitted binding environment
```

`PRJ-14` remains the final server authority and revalidates exact qualification, compatibility, current revision/environment and current Project state at submit time.

```text
PASSED -X-> bound
PASSED -X-> healthy
PASSED -X-> generic authorized
stale test -X-> bindable
other environment -X-> inferred qualified
```

If future real use requires multiple simultaneously qualified environments per Connection, that is a reopen trigger; F1 does not prebuild qualification-history or environment-matrix Product authority.

### Explicitly rejected

```text
ListBindableConnections screen-shaped operation
Connection qualification history family
generic ResourceBinding framework
browser-side authorization join
connection.use → generic connection.read
```

### Count impact

```text
new operations = 0
new Permissions = 0
new owners = 0
new records = 0
```

---

## 5. F18 — Brain binding revision-selection disclosure

### Evidence / root cause

`PRJ-11 SetProjectBrainBinding` requires:

```text
project.manage + brain.bind
```

but `BRN-02 ListBrainRevisions` is ordinarily disclosed under `brain.read`.

A principal may therefore have the exact authority needed to adopt a Brain revision while lacking a purpose-bound human revision list from which to make the decision.

### Target invariant

```text
person authorized to manage this exact Project Brain binding
→ may recognize/select an immutable candidate revision
→ does not gain general Workspace Brain inspection authority
```

### Selected correction

Do **not** add `ListBindableBrainRevisions`.

Reuse `BRN-02 ListBrainRevisions` through a purpose-bound alternate disclosure requiring:

```text
exact target Project context
+ project.manage
+ brain.bind
```

The 4B wire must carry the exact target Project context on the alternate route; an explicit `forProjectId` query coordinate is the leading transport realization because the Workspace Brain revision path alone cannot prove which Project-scoped `brain.bind` authority is being exercised.

The alternate route exposes only the existing immutable `BrainRevision` summary projection needed for selection:

```text
brainRevisionId
brainDigest
sourceRevision
availability
reviewText
```

It does not widen to `BRN-03 BrainRevisionDetail` or structured `knowledgeBrowse`.

```text
brain.bind -X-> generic brain.read
alternate BRN-02 -X-> BRN-03
alternate BRN-02 -X-> proposals/review/publication
alternate BRN-02 -X-> Brain mutation
```

`PRJ-11` remains the final authority and revalidates exact immutable revision, Project containment/conformance and current binding state at submit time.

### Explicitly rejected

```text
new bindable-Brain operation
BRN-03 knowledge browse under brain.bind
brain.bind → brain.read implication
frontend reuse of stale revision summaries as binding authority
```

### Count impact

```text
new operations = 0
new Permissions = 0
new owners = 0
new records = 0
```

---

## 6. F19 — AnalyticQuery semantic-input catalog

### Evidence / root cause

`BRN-12 RunAnalyticQuery` is an accepted deterministic semantic analytical read. Its request requires:

```text
datasetSemanticId
selectSemanticIds[]
```

under the Control Plane authority:

```text
brain.read + project.data.read
```

No current Product read enumerates the exact Project-admitted canonical dataset/semantic IDs required to construct that request.

`BRN-03 knowledgeBrowse` cannot substitute because its `domainRef` / `conceptRef` values are revision-scoped browse coordinates, explicitly not canonical semantic identity. `PRJ-18/19` cannot absorb the Brain semantic catalog because `project.data.read` alone must not disclose Brain-governed semantic authority.

### Target invariant

```text
human AnalyticQuery
→ chooses only server-admitted semantic inputs
→ choices are tied to exact current Project Brain binding
→ no physical SQL/table/join authority is disclosed
```

### Selected correction

Add exactly one Product read:

```text
BRN-13 GetProjectAnalyticQueryCatalog
```

Owner:

```text
Brain
+ accepted Project binding/data composition
```

Control Plane Permission:

```text
brain.read + project.data.read
```

Exact Project context is part of the operation subject.

Selected projection:

```text
projectId
brainRevisionId
brainDigest
projectBindingDigest

datasets[]
  datasetSemanticId
  label
  selectableSemantics[]
    semanticId
    label
```

The additional Brain revision/digest coordinates make the governing semantic publication human/debug-inspectable without requiring the separate `project.manage` authority used by `PRJ-10`.

Labels are presentation only. Exact semantic IDs remain request authority for BRN-12 after server revalidation.

### Freshness / authority law

The catalog is a current server projection, not a durable browser authority.

```text
catalog read
→ current binding-derived admitted choices

later BRN-12 submit
→ revalidate current Project grant
→ revalidate current Brain binding/health/dataset/semantic IDs
```

A binding or semantic change between read and submit may invalidate the request; the frontend must recover from the server outcome rather than preserve stale eligibility locally.

### Explicitly rejected

```text
List + Get analytic-dataset operation family
natural-language analytics planner in F1 merely for this screen
arbitrary SQL / raw expressions
physical tables/schemas/joins
semantic search API
metric/dimension framework not proven by a current consumer
pagination without evidenced scale requirement
conceptRef promoted into canonical semanticId
frontend-owned semantic catalog
```

### Count impact

```text
N_platform 116 → 117
Brain 11 → 12
wire 116↔116 → 117↔117
ordinary Permissions 25 → 25
new owners = 0
new durable records = 0
```

---

## 7. Capabilities — no upstream finding

`PRJ-16/17` already expose the exact Release-admitted semantic operation identity:

```text
capabilityId
operationId
regime = QUERY | ACTION | INTEGRATION
```

P-02 may format/present this truth for humans, but inspection does not grant invocation and no generic capability runner is admitted.

```text
project.read
-X-> Query/Action/Integration invocation grant
```

No correction is selected for Capabilities.

---

## 8. P-02 structural direction after wire closure

This contract does **not** yet approve P7 or P8. It only removes the authority blockers that made honest P7 impossible.

Leading structure to test after the corrected wire is GREEN:

```text
Data
  Resources
  Analyze

Capabilities
  inspect only

Integrations
  Used by this Project
  Private Connections

Brain
  current adoption / validation / update available
  choose immutable revision
  bind / change / clear
```

Project-scoped Connection lifecycle stays inside Integrations as a distinct material region and reuses the already locked W-02B Connection interaction grammar. `Connection != Integration` remains explicit.

Analytic interaction is Data-led because it serves a Project data question; Brain remains the semantic authority behind it rather than becoming the navigation home for analytical work.

A generic `Resources` hub remains rejected unless P7 evidence later falsifies the focused-route structure.

---

## 9. Proof strategy before recompile

The selected correction must be implemented through RED → GREEN proof.

Required negative/positive properties include at least:

### F16

```text
RED: PRJ-18/19 projections lack required nonblank human name
GREEN: summary/detail expose name while exact dataResourceId remains identity
NEGATIVE: no physical DB fields or generic metadata mutation appear
```

### F17

```text
RED: project.manage + connection.use cannot obtain a purpose-bound recognizable candidate list without connection.read
GREEN: CON-03 admits exact Project-context selection disclosure and ProjectConnectionBinding exposes connectionName
NEGATIVE: alternate route cannot read CON-04/configuration/credentials or cross Workspace/sibling Project scope
NEGATIVE: bindable presentation cannot infer qualification for another environment/revision
```

### F18

```text
RED: project.manage + brain.bind cannot obtain a purpose-bound immutable revision list without brain.read
GREEN: BRN-02 admits exact Project-context summary-only revision selection disclosure
NEGATIVE: alternate route cannot obtain BRN-03 knowledgeBrowse or proposal/publication authority
```

### F19

```text
RED: no Product read enumerates canonical Project-admitted BRN-12 inputs
GREEN: BRN-13 exposes exact binding-bound dataset/semantic choices under brain.read + project.data.read
NEGATIVE: no SQL/physical topology/generic semantic search is introduced
NEGATIVE: BRN-03 conceptRef remains noncanonical for BRN-12
```

Whole-wire closure must prove:

```text
fixed Product operations = 117
fixed Product OAS operations = 117
Brain Product operations = 12
ordinary Permissions = 25
missing = 0
extra = 0
duplicate = 0
whole generated projection / no-parallel-DTO proof = GREEN
```

Only after whole-wire GREEN may P-02 enter P7 competing-structure adjudication.

---

## 10. Adversarial challenge disposition

Strongest rejected alternatives:

```text
A. preserve 116 operations and make users type semantic IDs
→ local maximum; transfers missing Product meaning into UI/user cognition

B. add generic bindable-resource APIs/framework
→ accidental complexity; duplicates existing owner boundaries

C. broaden connection.use/brain.bind into generic read Permissions
→ violates least disclosure and accepted Permission separation

D. implement natural-language AnalyticQuery now
→ changes the analytical regime itself and introduces unresolved planning/ambiguity/provenance semantics

E. expose Brain semantic IDs through PRJ-19 only
→ leaks Brain-owned meaning through project.data.read without brain.read
```

No remaining material contradiction is known inside the selected F16–F19 scope.

---

## 11. Reopen triggers

Reopen only on material evidence, including:

- a real Project needs multiple simultaneously qualified Connection environments and current `connectionTest` cannot represent honest selection;
- Project binding selection requires materially richer Connection disclosure than the lightweight summary without granting `connection.read`;
- Brain revision selection requires content comparison that cannot be completed from the bounded immutable summary without generic `brain.read`;
- a real AnalyticQuery consumer needs filters, measures/dimensions, semantic search, pagination or natural-language planning that cannot be added without changing authority;
- P7/P8 shows the four focused Project routes create a material discoverability/task-completion defect;
- executable wire proof exposes owner, Permission, current-state or cross-scope contradiction.

Hypothetical future convenience is not a reopen trigger.

---

## 12. Gate

```text
F16 = OPERATOR SELECTED
F17 = OPERATOR SELECTED / NARROWED
F18 = OPERATOR SELECTED / NARROWED
F19 = OPERATOR SELECTED / ONE READ

4A/4B recompile = NOT STARTED
P7 = BLOCKED
P8 = BLOCKED
P-03+ = NOT OPEN
P11 = NOT ASSEMBLED
4D = NOT STARTED
Product implementation = BLOCKED
```

Next allowed engineering step after this written contract is a bounded RED-first 4A/4B recompile plan for the selected F16–F19 correction pack. No Product implementation or PR merge is authorized by this decision.
