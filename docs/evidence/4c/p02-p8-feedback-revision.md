# P-02 — P8 operator-feedback revision

> **Status:** `P7 OPERATOR APPROVED / F20-F21 HISTORICAL / F22 RATIFIED / P8 F22 REVISED CANDIDATE / WALKTHROUGH / NOT LOCKED`
> **Scope:** preserves the F20/F21 correction history and records the later F22 supersession of only the former physical-explorer rejection.
> **Product implementation authority:** none.

The first operator walkthrough did **not** approve the prior P8 as final. It exposed three concrete comprehension gaps and approved the bounded F20/F21 redesign below. A later walkthrough with Mitra screenshots then proved F20 still stopped one level too early and produced F22. P7's four focused Project routes remain valid throughout.

## 1. 4C-F20 — Data semantic structure inspectability

Human need:

```text
Data must include Project-owned data as well as integration-backed and derived data
→ human can recognize what kind of resource it is and where it comes from
→ exact resource detail can explain its logical fields, relationships and business rules
```

Selected authority correction:

```text
PRJ-18 ListProjectDataResources
→ existing dataResourceId + name
→ resourceKind = TABLE | VIEW | DATASET
→ sourceKind = INTERNAL | INTEGRATION | DERIVED

PRJ-19 GetProjectDataResource
→ same identity/presentation + grain/freshness/coverage/provenance
→ fields[] = ProjectDataField
→ relationships[] = ProjectDataRelationship
→ rules[] = ProjectDataRule
```

`ProjectDataField` exposes resource-scoped semantic field identity, human name, logical type, requiredness and human description. `ProjectDataRelationship` exposes semantic source/target field/resource coordinates plus human description. `ProjectDataRule` exposes stable resource-scoped rule identity plus human description.

Historical F20 boundary:

```text
semantic structure != physical database topology
logical field != permission to disclose physical column/storage topology
TABLE = human resource kind, not a SQL/schema browser grant
```

F22 later **supersedes only F20's rejection of a bounded physical explorer**. PRJ-18/19 remain the semantic Data-resource family and do not become physical table/row authority. F22 adds a separate Project-owned read-only explorer projection through PRJ-25..28; SQL/write/admin/credential authority remains rejected.

F20 preserves Project ownership, `project.data.read`, PRJ-18/19, principal classes, trust boundaries and durable record classes.

## 2. 4C-F21 — human-readable Capability inspection

Human need:

```text
Capabilities must answer “what can this Project do?”
without requiring the operator to infer meaning from capabilityId / operationId.
```

Selected authority correction:

```text
PRJ-16 ListProjectCapabilities
→ human name + purpose
→ capabilityId + operationId + regime

PRJ-17 GetProjectCapability
→ same identity/presentation
→ inputs[] + outputs[] = ProjectCapabilityField
```

`ProjectCapabilityField` exposes human field name, logical type, requiredness and human description sufficient to understand the admitted semantic contract.

Boundary:

```text
name / purpose / inputs / outputs = inspection truth
-X-> invocation authority
-X-> generic executor
```

No Run/Execute operation, new Permission, new capability framework, new owner, principal, trust boundary or durable record class is admitted.

## 3. Integrations — interaction-language correction only

No Product-authority correction is required. The accepted ownership remains:

```text
ProjectConnectionBinding != Connection
PRJ-13 = current Project use
CON-03(forProjectId?) = purpose-bound eligible selection
PRJ-14 = set/switch exact binding
PRJ-15 = remove exact binding
```

The revised P8 uses human language and an explicit replacement flow:

```text
Connections used by this Project
+ Use connection
Switch connection
→ Current connection
→ Switch to
→ Confirm switch

Connections owned by this Project
```

“Switch connection” changes which qualified Connection revision/environment the Project uses; it does not edit Connection configuration or grant generic `connection.read`.

## 4. Current census after F22

```text
N_platform = 121
Project = 27
Builder = 17
Brain = 12
Connections = 9
ordinary Permissions = 25
new semantic owners = 0
new durable record classes = 0
Technical Ingress = 3 / Product-count impact = 0
```

F20/F21 themselves added zero operations; F22 later adds four exact Project-owned reads.

## 5. Original F20/F21 TDD evidence

```text
Verify #913 = EXPECTED RED
→ repository tests = 133
→ pass = 128
→ fail = 5
→ all prior tests remained green
→ exact five failures = F20 authority, F21 authority, revised Data UX, revised Capabilities UX, revised Integrations UX
```

The invalid earlier #912 run is intentionally not used as TDD evidence because that first guard could terminate on a missing evidence-file read rather than the intended missing semantic properties.

## 6. F22 downstream falsifier and closure

The subsequent revised-P8 walkthrough plus operator-supplied Mitra screenshots proved that F20 still stopped one level too early: `Fields / Relationships / Rules` explain a Data resource but do not let the human open a real table/view and inspect authorized rows/columns.

That material falsifier produced the separately approved [F22 read-only Data Explorer design](p02-f22-data-explorer-design.md) and [F22 recompile proof](p02-f22-data-explorer-recompile-proof.md).

F22 is now operator-ratified after RED/GREEN, independent R1/R2 review convergence and explicit confirmation that existing `project.data.read` grants may become eligible for raw rows only under exact Project grant + server-resolved explorer eligibility. The Permission vocabulary remains 25.

P8 F22 TDD:

```text
Verify #974 = EXPECTED RED / 131 tests / 130 pass / 1 exact Data Explorer P8 failure
Verify #975 = SUCCESS / 131 tests / 131 pass / 121↔121 / Project=27
```

The revised fixture-only P8 now demonstrates physical source tree, real tabular rows, Data/Structure/Relationships/Rules, multiple object tabs, bounded filter/sort/column visibility, pagination, Row Inspector, truncation truth and material states while preserving Analyze as BRN-13→BRN-12 semantic flow and explicitly rejecting SQL/write/admin authority.

## 7. Current gate

```text
P-02 = OPEN
P7 = OPERATOR APPROVED
F22 = OPERATOR RATIFIED
P8 = F22 REVISED CANDIDATE / OPERATOR WALKTHROUGH / NOT LOCKED
P9/P10 = BLOCKED
P-03+ = NOT OPEN
P11 = NOT ASSEMBLED
4D = NOT STARTED
Product implementation = BLOCKED
merge = NOT AUTHORIZED
```
