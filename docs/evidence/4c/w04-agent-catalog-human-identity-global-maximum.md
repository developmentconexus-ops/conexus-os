# 4C-F13 — Product Agent Human Identity + Workspace Catalog Context

> **Status:** `OPERATOR ACCEPTED / CURRENT OWNERS CONFIRMED / SELECTED REALIZATION GREEN`
> **Block:** `W-04 — Workspace Agent catalog`.
> **Selected realization:** Product Agent owns human `name` plus its already-accepted semantic `purpose`; `PRJ-22` carries the canonical Agent projection and exact owning `ProjectSummary`.
> **Authority posture:** bounded 4A→4B contract correction only; no Product implementation, W-04 P8, LOCK, P-01, P11, 4D or merge authority.

## 1. Evidence / falsifier

Current accepted Product already defines a Product Agent as Project-owned, git-first, Release-pinned, authored through `agent/v1`, with semantic `purpose`, instructions, model policy, tools, Brain context, policies, approvals, budgets, verification and known limitations.

Before F13, the canonical Project wire exposed:

```text
ProjectProductAgent
→ agentId
→ authoredRevisionId
→ releaseRefs[]
→ activeReleaseId?

WorkspaceProductAgentCatalogItem
→ machine-oriented Agent projection
→ projectId
```

`PRJ-22 ListWorkspaceProductAgents` is an access-filtered Workspace projection over Project-owned Agents; it is deliberately **not** a Workspace Agent/fleet owner.

That projection was insufficient for a human catalog because the operator would have to recognize Agents and owning Projects primarily from opaque machine IDs. This repeats the already-proven human-recognition defect class from Workspace/Project/Connection/Account/Area.

## 2. Root cause

The Project-owned Agent semantics and ownership were sound. The defect was missing human presentation at the existing owner boundary:

```text
human must find one Product Agent across several Projects
+ Agent remains Project-owned
+ agentId / revision / Release refs are machine coordinates
+ PRJ-22 is the admitted Workspace catalog projection
→ catalog requires owner-issued human Agent identity + semantic purpose + human Project context
```

A frontend-only label map, local `PRJ-01` join, inferred name from source/slug, or generic Workspace Agent owner would preserve or worsen the root cause by creating parallel presentation/authority.

## 3. Target invariant

For every currently disclosable Workspace Agent-catalog item:

```text
human-recognizable Agent identity
+ what the Agent is for
+ human-recognizable owning Project context
+ exact authored revision / Release coordinates when material
+ no frontend join required for basic recognition
+ no fleet/runtime authority implied
```

Presentation laws:

```text
agentId = stable machine identity
ProductAgent.name = human presentation identity
ProductAgent.purpose = existing authored semantic purpose
ProjectSummary = canonical human owning-Project context

ProductAgent.name -X-> authorization
ProductAgent.name -X-> routing identity
ProductAgent.purpose -X-> authorization
activeReleaseId -X-> runtime health
activeReleaseId -X-> “Agent is running”
```

## 4. Constraints preserved

- Product Agent remains Project-owned and git-first.
- Agent authoring remains Builder/Change → candidate/diff/proof → immutable artifact revision → Release.
- `PRJ-20/21` remain authored/source inspection under `project.source.read`.
- `PRJ-22` remains the Workspace access-filtered catalog under `project.read`.
- `project.read` does not silently become `project.source.read`.
- no Workspace Agent owner, fleet manager, Approval Center or runtime dashboard is created.
- no direct Agent metadata CRUD/rename/update operation is created.
- no new Permission, semantic owner, principal class, trust boundary or durable-record class.
- fixed Product operation count remains 116 and Project operation count remains 23.

## 5. Alternatives

### A — keep opaque `agentId` + machine coordinates as primary recognition

**REJECT.** Machine addressing is not a sustainable human catalog identity. It makes the Workspace catalog technically truthful but human-hostile.

### B — frontend derives labels through local joins / source names / presentation heuristics

**REJECT.** This creates parallel frontend presentation truth, requires extra calls or cached ID maps, and can diverge from the exact Project-owned Agent revision.

### C — create a Workspace Agent/fleet owner and screen-shaped catalog DTO/API

**REJECT / OVERENGINEERING.** `PRJ-22` already owns the required filtered projection. A new owner would duplicate Project Agent ownership and invite lifecycle/runtime semantics the Product explicitly rejects.

### D — enrich the existing Project Agent projection and `PRJ-22`

**ACCEPTED GLOBAL MAXIMUM.**

```text
ProjectProductAgent
→ agentId
→ name
→ purpose
→ authoredRevisionId
→ releaseRefs[]
→ activeReleaseId?

WorkspaceProductAgentCatalogItem
→ agent: ProjectProductAgent
→ project: ProjectSummary
```

The explicit closed `{ agent, project }` composition is intentional. The pre-F13 `allOf` extension shape was not retained because extending a closed `ProjectProductAgent` (`additionalProperties:false`) with sibling Project fields is structurally unsafe under JSON Schema/OpenAPI 3.1 composition. The nested shape preserves the approved semantics while keeping both canonical sub-schemas closed and reusable.

This fixes recognition at the existing semantic owner and reuses canonical `ProjectSummary` instead of adding `projectName` or requiring frontend composition.

### E — add direct rename/update Agent metadata operations now

**REJECT / YAGNI.** Product Agent `name` and `purpose` are authored meaning. If they change, they evolve through the already-accepted Builder/Change/`agent/v1` revision path. A second direct metadata mutation channel would bypass the Product's git-first authoring law.

## 6. Selected semantics

```text
CURRENT OWNERS CONFIRMED
→ Product Agent owner = Project-authored agent/v1 / Project projection
→ missing property = human Agent presentation identity
→ existing semantic purpose projected explicitly
→ Workspace catalog carries canonical Agent + owning ProjectSummary
→ no new Product operation/domain required
```

Important distinction from creation-time-only resource naming:

```text
ProductAgent.name + purpose
→ authored fields of the exact agent/v1 revision
→ may evolve only through the governed Builder/Change/revision path
→ no direct RenameProductAgent / UpdateProductAgentMetadata authority
```

## 7. Permission / census result

```text
N_platform = 116
Project operations = 23
ordinary Permissions = 25
semantic owners = 13
durable record classes = 46
Technical Ingress = 3 / Product impact 0
```

Permission separation remains:

```text
PRJ-22 Workspace catalog → project.read
PRJ-20 / PRJ-21 authored Agent inspection → project.source.read

project.read -X-> project.source.read
catalog visibility -X-> authoring/detail authority
```

F13 creates no `agent.read`, `agent.manage`, `agent.rename` or generic metadata Permission.

## 8. W-04 structural consequence after GREEN

The accepted leading P7 hypothesis is **A — Agent-first searchable catalog**:

```text
Agents
→ search/filter the complete already-disclosed PRJ-22 collection
→ Agent name + purpose first
→ owning Project name visible
→ exact Release-presence language only
→ future exact-Agent/P-03 boundary when deeper Project-owned work is required
```

Exact Release language:

```text
Included in active Release
No active Release
```

Forbidden inference:

```text
Active / Inactive
Healthy / Running / Online / Ready
Deployed successfully
```

`activeReleaseId` proves only inclusion in the Project projection's active Release coordinate; it does not prove PAR execution, serving health or deployment verification.

## 9. Proof chronology

```text
Verify #754 = EXPECTED initial selected-realization RED
→ 94 tests / 92 pass / 2 expected F13 failures

RED refinement
→ preserved unaffected operation-ledger / Permission authority rather than ceremonial status churn
→ bounded affected owners only

Verify #755 = EXPECTED selected-realization RED
→ 94 tests / 92 pass / 2 expected failures
→ human presentation authority + Project wire only

bounded GREEN
→ human-context-identity-contract
→ ProjectProductAgent name + purpose
→ PRJ-22 closed { agent, project } composition
→ existing Project checker preserved byte-for-byte
→ bounded F13 Project sub-checker added to wire:project

Verify #763 = SUCCESS
→ full repository + canonical Product wire + generated/whole-4B proof GREEN
→ Product wire remains 116 ↔ 116
→ Project operations remain 23
→ ordinary Permissions remain 25
```

## 10. Operator decision

```text
OPERATOR ACCEPTED
→ F13 selected and GREEN
→ ProductAgent.name + existing ProductAgent.purpose
→ PRJ-22 owns self-contained canonical Agent + ProjectSummary context
→ +0 operations / +0 Permissions / +0 owners / +0 records
→ hypothesis A selected for W-04 P7 candidate
```

F13 GREEN removes the authority blocker for W-04 P7. It does not authorize P8 by itself; P8 remains blocked pending the W-04 P7 operator adjudication.
