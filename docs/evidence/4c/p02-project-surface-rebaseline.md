# P-02 — bounded Project surface rebaseline

> **Status:** CURRENT P-02 P7 INPUT / F22+F23 AUTHORITY RECOMPILED / NO P8 LOCK
> **Authority posture:** bounded delta over the accepted 4C candidate surface inventory. It does not reopen GF-01, W-01, W-02A, W-02B, W-03, W-04 or P-01 and does not authorize a revised P8 or Product implementation.
> **Methods:** DevelopmentConexus Engineering Method v1.0.0 + Frontend Product Experience Planning Method v2.3.

## 1. Why this delta exists

F22 materially restructured the Data job after the earlier candidate inventory rejected a physical explorer. F23 then proved that Project Brain cannot stop at binding metadata and cannot be derived by browser-side filtering of the whole Workspace Brain. Frontend Method v2.3 requires a bounded rebaseline after accepted Product/backend authority changes rather than restarting unrelated locked blocks.

Current Product/wire basis:

```text
N_platform = 122
Project = 27
Brain = 13
Connections = 9
ordinary Permissions = 25
```

P-02 now represents four different human lenses over the same exact Project:

```text
Data         = facts / records
Brain        = adopted enterprise meaning available to this Project
Capabilities = behaviors the Project exposes
Integrations = external systems/resources the Project uses
```

These remain four focused Project destinations. A generic Project `Resources` hub and a backend-owner console remain rejected.

## 2. P-02 surface delta

### PRJ-S11 — Data

Human job:

```text
recognize current Project data sources
→ open real authorized tabular objects
→ inspect actual rows/columns
→ inspect physical structure/relationships/constraints
→ understand complementary semantic Project meaning
```

Current authority:

```text
PRJ-25 ListProjectDataExplorerSources
PRJ-26 ListProjectDataExplorerObjects
PRJ-27 GetProjectDataExplorerObject
PRJ-28 ListProjectDataExplorerRows

PRJ-18 ListProjectDataResources
PRJ-19 GetProjectDataResource
→ separate semantic Data-resource truth
→ semanticDataResourceId / semanticFieldId may cross-link only where server-issued
```

Selected Product law:

```text
bounded read-only Project Data Explorer = ACCEPTED
unrestricted DB/admin/SQL console       = REJECTED
physical identity != semantic meaning
```

No SQL editor, arbitrary join/expression, DML/DDL, credential disclosure, cross-Project source browse or browser-derived authorization is admitted.

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

Analyze remains a contextual Data capability, never SQL or a generic query-builder domain.

### PRJ-S13 — Capabilities

Human job:

```text
recognize what the Project can do
→ understand purpose
→ understand logical inputs/outputs
→ inspect exact technical identity when needed
```

Current authority:

```text
PRJ-16 ListProjectCapabilities
PRJ-17 GetProjectCapability
→ name + purpose
→ QUERY | ACTION | INTEGRATION
→ logical inputs / outputs
→ capabilityId + operationId remain technical identity
```

Presentation priority is human contract first, technical operation second. Inspection does not imply invocation; no generic Run/Execute control is admitted.

### PRJ-S14 — Integrations

Human job:

```text
understand which external systems/resources this Project uses
→ recognize current binding
→ understand environment/current selection context
→ change/remove binding when authorized
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
PRJ-15 RemoveProjectConnectionBinding
```

The primary Product question is **what systems this Project uses**, not Connection-revision administration. `connection.use -X-> generic connection.read`; selection disclosure does not expose configuration, credentials, management or qualification history.

### PRJ-S15 — Private Connections

**Preserved.** Existing Project-private Connection administration remains a secondary contained lifecycle region inside external-system work. It does not replace Integrations and does not create a generic ResourceBinding framework.

### PRJ-S19A — Project Brain Context

Human job:

```text
understand which enterprise meaning this exact Project has adopted and has available
→ browse server-resolved domains/concepts/sections/provenance
→ understand current binding/conformance/update context
```

Current authority:

```text
BRN-14 GetProjectBrainContext
→ brain.read + project.read
→ exact Project grant + exact current Project Brain binding
→ server-resolved Project-local realization/refinement
→ adopted/available Project Brain context
```

Binding laws:

```text
Project Brain Context != whole Workspace Brain publication
Project Brain Context != runtime effectiveBrainSlice
frontend -X-> decide Project applicability
brain.bind -X-> brain.read
```

Project-context domain/concept coordinates are browse coordinates only; they are not canonical semantic IDs, decision subjects, source authority or runtime ToolProjection coordinates.

### PRJ-S19B — Brain binding administration

Human job:

```text
recognize current exact Project Brain binding
→ choose an immutable published Brain revision when authorized
→ set/clear the exact Project binding
```

Current authority remains:

```text
PRJ-10 GetProjectBrainBinding
PRJ-11 SetProjectBrainBinding
PRJ-12 ClearProjectBrainBinding

BRN-02 ListBrainRevisions(forProjectId?)
→ ordinary route: brain.read
→ binding-selection route: exact target Project + project.manage + brain.bind
→ immutable BrainRevision summary only
```

Workspace Brain publication/governance remains W-02A and may be reached only as a boundary/cross-link. P-02 never inlines Discovery/proposal/review/publication ownership.

## 3. Cross-route coherence law

The four routes are one Project experience, but cross-links require exact server-owned relationships:

```text
server-owned exact coordinate
→ contextual cross-link allowed

same label / browser inference
-X-> semantic relationship
-X-> authorization
```

Current admitted example:

```text
physical Data object/column
→ optional semanticDataResourceId / semanticFieldId
→ PRJ-19 semantic Data truth
```

Not currently admitted:

```text
Data field → exact Brain concept         = DEFERRED
Integration → exact Capability set       = DEFERRED
Capability → exact Connection dependency = DEFERRED
```

Useful-looking relationships do not become Product authority without a proven current user job and owner truth.

## 4. Frontend-v2.3 capability dispositions

| Capability / experience | Disposition |
| --- | --- |
| real table/view rows | `PRESENT-IN-AUTHORITY` — F22 |
| physical + semantic Data together | `PRESENT-IN-AUTHORITY` |
| Project-resolved adopted Brain knowledge | `PRESENT-IN-AUTHORITY` — F23 |
| Workspace Brain governance inside Project | `REJECTED` — duplicate authority |
| SQL editor / unrestricted DB console | `REJECTED` — Product boundary |
| generic Capability runner | `REJECTED` — inspection != invocation |
| Project bindings first / Connection mechanics second | `PRESENT-IN-AUTHORITY` |
| generic Project Resources hub | `REJECTED` — unnecessary abstraction/depth |
| browser-derived Brain applicability | `REJECTED` — frontend authority |
| Data→Brain exact concept links | `DEFERRED` — no current exact relation/consumer |
| Integration→Capability exact dependency map | `DEFERRED` — not yet proven/represented |

## 5. P7 boundary

This rebaseline supplies the current P7 authority pack. It does not authorize revised HTML.

```text
P7 = REBASELINED DESIGN INPUT
P8 = BLOCKED / EXISTING P8 NOT LOCKABLE AFTER F23
P-03+ = NOT OPEN
P11 = NOT ASSEMBLED
4D = NOT STARTED
Product implementation = BLOCKED
```
