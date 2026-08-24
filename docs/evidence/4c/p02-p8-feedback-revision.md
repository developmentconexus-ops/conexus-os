# P-02 — P8 operator-feedback revision

> **Status:** `P7 OPERATOR APPROVED / P8 REVISION APPROVED / REVISED P8 PENDING WALKTHROUGH / NOT LOCKED`
> **Scope:** smallest bounded correction proved by the operator walkthrough of Data, Capabilities and Integrations.
> **Product implementation authority:** none.

The operator walkthrough did **not** approve the prior P8 as final. It exposed three concrete comprehension gaps and explicitly approved the bounded redesign below. P7's four focused Project routes remain valid; only the smallest missing server-owned presentation/inspection truth is recompiled.

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

Boundary:

```text
semantic structure != physical database topology
logical field != permission to disclose physical column/storage topology
TABLE = human resource kind, not a SQL/schema browser grant
```

Explicitly rejected:

```text
schemaName
tableName
indexName
DDL / SQL text
connectionString / storageKey
arbitrary schema explorer
SQL console
```

F20 preserves Project ownership, `project.data.read`, PRJ-18/19, operation count, principal classes, trust boundaries and durable record classes.

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

The revised P8 must use human language and an explicit replacement flow:

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

## 4. Census / invariants

```text
4C-F20 new operations = 0
4C-F21 new operations = 0
N_platform = 117
Project = 23
Builder = 17
Brain = 12
Connections = 9
ordinary Permissions = 25
owners = unchanged
durable record classes = unchanged
Technical Ingress = 3 / Product-count impact = 0
```

## 5. TDD evidence

```text
Verify #913 = EXPECTED RED
→ repository tests = 133
→ pass = 128
→ fail = 5
→ all prior tests remained green
→ exact five failures = F20 authority, F21 authority, revised Data UX, revised Capabilities UX, revised Integrations UX
```

The invalid earlier #912 run is intentionally not used as TDD evidence because that first guard could terminate on a missing evidence-file read rather than the intended missing semantic properties.

## 6. Current gate

```text
P-02 = OPEN
P7 = OPERATOR APPROVED
P8 = REVISION APPROVED / REVISED CANDIDATE PENDING WALKTHROUGH / NOT LOCKED
P9/P10 = BLOCKED
P-03+ = NOT OPEN
P11 = NOT ASSEMBLED
4D = NOT STARTED
Product implementation = BLOCKED
merge = NOT AUTHORIZED
```
