# P-02 — bounded Project surface rebaseline

> **Status:** CURRENT P-02 P7 INPUT / F16–F19 AUTHORITY RECOMPILED / NO LAYOUT LOCK
> **Authority posture:** bounded delta over the accepted 4C candidate surface inventory. It does not reopen GF-01, W-01, W-02A, W-02B, W-03, W-04 or P-01 and does not authorize P8 or Product implementation.

## 1. Why this delta exists

The original candidate surface inventory was derived before P-02 F16–F19 closed. Rewriting that historical whole-product inventory every time a later block proves one bounded authority correction creates temporal snapshot coupling. P-02 therefore carries only the exact local delta needed for its structural P7 work.

Current Product/wire basis:

```text
N_platform = 117
Project = 23
Brain = 12
Connections = 9
ordinary Permissions = 25
```

## 2. P-02 surface delta

### PRJ-S11 — Data

Human job:

```text
recognize declared Project Data resources
→ inspect exact resource semantic truth
```

Current authority:

```text
PRJ-18 ListProjectDataResources
→ dataResourceId + required server-owned human name

PRJ-19 GetProjectDataResource
→ exact dataResourceId + human name
→ grain + freshness + coverage + provenance
```

No physical table/schema/SQL explorer, generic metadata editor or new Data operation is admitted.

### PRJ-S12 — Analyze

Human job:

```text
choose admitted semantic analytical inputs
→ run the deterministic governed AnalyticQuery
→ inspect truthful result/provenance
```

Current authority:

```text
BRN-13 GetProjectAnalyticQueryCatalog
→ current Project Brain binding
→ human labels + canonical datasetSemanticId / semanticId choices
→ brain.read + project.data.read

BRN-12 RunAnalyticQuery
→ exact Project + current Brain binding
→ selected admitted dataset/semantic IDs
→ server revalidates current binding/health/admission at submit
```

The UI may not invent SQL, physical joins/tables, natural-language query planning, semantic search or a frontend-owned catalog.

### PRJ-S14 — Integrations

Human job:

```text
recognize current Project bindings
→ choose one admissible Connection candidate
→ bind exact qualified revision/environment through Project authority
```

Current authority:

```text
PRJ-13 ListProjectConnectionBindings
→ exact binding identity + server-composed connectionName presentation

CON-03 ListConnections(forProjectId?)
→ ordinary route: connection.read
→ P-02 selection route: exact target Project + project.manage + connection.use
→ same lightweight Connection projection only

PRJ-14 SetProjectConnectionBinding
→ final exact Project-owned binding authority
```

`connection.use -X-> generic connection.read`; the selection route does not expose CON-04 configuration, credentials, management, qualification history/matrix or sibling-private/cross-Workspace Connections.

### PRJ-S15 — Private Connections

**Unchanged.** Existing Project-private Connection administration remains the accepted Connections job. P-02 does not merge it with PRJ-S14 and does not create a generic ResourceBinding framework.

### PRJ-S19 — Brain binding

Human job:

```text
recognize current Project Brain binding
→ choose an immutable published Brain revision when authorized to change the binding
→ set/clear exact Project binding
```

Current authority:

```text
PRJ-10 GetProjectBrainBinding
PRJ-11 SetProjectBrainBinding
PRJ-12 ClearProjectBrainBinding

BRN-02 ListBrainRevisions(forProjectId?)
→ ordinary route: brain.read
→ P-02 selection route: exact target Project + project.manage + brain.bind
→ immutable BrainRevision summary only
```

`brain.bind -X-> generic brain.read`; the purpose-bound route does not widen to BRN-03 exact revision detail, knowledge browse, proposal/publication or Brain mutation authority.

### Capabilities

**Unchanged.** `PRJ-16/17` remain authored/Release capability inspection. P-02 does not add a generic execution browser, capability framework or screen-shaped backend operation.

## 3. P7 boundary

P7 may now derive structural hypotheses for these Project surfaces from the closed authority above. It may compose existing operations into human jobs; it may not introduce new Product meaning.

```text
P7 = NEXT
P8 = BLOCKED
P-03+ = NOT OPEN
P11 = NOT ASSEMBLED
4D = NOT STARTED
Product implementation = BLOCKED
```

No route composition, component hierarchy, density decision or visual layout is locked by this rebaseline.
