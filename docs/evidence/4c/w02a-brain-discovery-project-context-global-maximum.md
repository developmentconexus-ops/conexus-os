# 4C-F08 — Brain Discovery Project-context Global-Maximum assessment

> **Status:** `DECISION EVIDENCE / OPERATOR GATE / NOT PRODUCT AUTHORITY`
> **Finding:** [Brain Discovery explicit Project-context finding](w02a-brain-discovery-project-context-finding.md)
> **Question:** how should Workspace Brain Discovery expose the exact Project context already required by BRN-04 without inventing source/Connection authority or moving Brain ownership?

## 1. Evidence

Current accepted authority already provides:

```text
PRJ-01 ListProjects
→ currently disclosable ProjectSummary[]
→ projectId + workspaceId + human-readable name + archived

BRN-04 StartBrainDiscovery
→ request { projectId }
→ Brain re-resolves exact Project containment and admitted source/Connection context server-side
→ read-only hypotheses + provenance
```

The operator-approved P8 currently presents Discovery from Workspace Brain but hides this Project coordinate.

## 2. Target invariant

```text
human understands which Project context will be used
→ explicit Project selection/recognition
→ untrusted projectId
→ BRN-04
→ server-owned source/Connection resolution
```

No frontend source eligibility inference, hidden default, credential choice or Workspace-wide scanning is admitted.

## 3. Credible alternatives

### A — hidden/default Project fixture

**REJECT.**

The action would depend on browser/test state the human cannot inspect. A fixture default also teaches a false production model.

### B — infer a Project from Workspace/current navigation context

**REJECT for the current Workspace Brain entry.**

The locked GF-01 Workspace context does not imply one current Project while the user is in Workspace Brain. Persisting a previously visited Project would turn incidental navigation history into action authority and would fail refresh/new-device cognition.

### C — explicit Project context selector inside Brain Discovery using PRJ-01

**LEADING GLOBAL-MAXIMUM CANDIDATE.**

Within the Discovery region:

```text
Project context
[ Budget Analyzer ▾ ]

Uses this Project's already-admitted source / Connection context.
The browser does not select credentials or source internals.

[ Run discovery ]
```

The selector is populated only from already-disclosed `PRJ-01 ProjectSummary` truth. It shows the human-readable `name`; `archived` may be shown as truthful status but must not be turned into client-side eligibility policy unless Product authority says so.

Interaction/state law:

```text
PRJ-01 result                 = SERVER
selected projectId before run = FORM_DRAFT
BRN-04 result                 = SERVER
source/Connection context     = server-resolved Brain/Project authority
```

If PRJ-01 is loading/failed/known-empty, the UI reports that honestly. It does not silently fall back to a hidden Project.

Why this leads:

- uses existing admitted operations;
- makes the consequential context visible before action;
- preserves Workspace Brain as the canonical governance experience;
- reuses the already-locked human Project identity property rather than adding metadata;
- requires no new Product operation, Permission, owner, trust boundary or wire change;
- revises only the smallest falsified P8 region.

### D — move Brain Discovery primarily into a Project page

**REJECT as primary correction.**

A Project-context ingress could be a future navigation convenience, but moving canonical Discovery out of Brain would fracture the approved mental model and make Brain governance appear Project-owned. The missing property is explicit context, not ownership/location.

### E — remove projectId and make BRN-04 Workspace-wide discovery

**REJECT.**

This is an upstream semantic widening, not a UI correction. It would require inventing rules for which Projects/sources/Connections are scanned, cross-Project disclosure, cost/budget and conflict resolution. No current consumer requires that broader operation.

## 4. Global Maximum / YAGNI

Local minimum:

```text
hardcode currentProjectId
```

fails truthfulness and re-entry.

Architecture maximum:

```text
Workspace-wide Discovery orchestrator + eligibility/search API
```

fails YAGNI and changes Product semantics without need.

Global Maximum for current evidence:

```text
CURRENT BACKEND AUTHORITY CONFIRMED
→ PRJ-01 supplies human Project recognition
→ BRN-04 remains Project-context Discovery
→ revise only P8 Discovery region to make Project context explicit
```

## 5. P8 revision obligations if accepted

The revised functional HTML must:

```text
show a labeled Project context control before Run discovery
populate deterministic fixture options shaped exactly like PRJ-01 ProjectSummary
show name as primary human identity and archived truth where present
carry selected projectId only as FORM_DRAFT
keep Run discovery disabled until a Project is explicitly selected
make source/Connection server-resolution boundary visible in helper text
preserve all previously approved Knowledge/Proposal/Revision/Health interactions
preserve F07 Knowledge → Domain → Concept structure
not add fetch/localStorage/sessionStorage or production integration
```

Because this changes a material action context, the operator must operate/re-approve the revised P8 before final W-02A LOCK.

## 6. Operator gate

```text
LEADING GLOBAL-MAXIMUM CANDIDATE = C
```

Operator disposition required:

```text
ACCEPT GLOBAL-MAXIMUM CANDIDATE
| REVISE
| REJECT
```
