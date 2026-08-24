# 4C W-04 — Locked Workspace Agent Catalog Screen Contract

> **Status:** `LOCKED / OPERATOR APPROVED` · P9 EXACT TRACE CLOSED · P10 CONSOLIDATED · P11 LATER ASSEMBLED PRODUCT
> **Block:** `W-04 — Workspace Agent catalog`
> **Locked structure:** Agent-first Workspace discovery catalog → explicit future Project-owned Agent workspace boundary
> **approved revised P8 artifact blob = 65073eb5f532f2675f04ec307eb0d9b91fd1b69d**
> **Product implementation authority:** none.

The operator explicitly approved the exact revised functional W-04 P8 after operating it. The approved HTML remains an immutable Evidence snapshot; its in-artifact `CANDIDATE / NOT LOCKED` language is historical. Current LOCK authority lives in this Screen Contract and the roadmap, pinned to the exact approved revised blob above.

W-04 closes only Workspace Agent discovery. It does not open or design the later Project Agent workspace, does not authorize Product implementation, and does not create a Workspace Agent/fleet owner.

---

## 1. Goal / user-flow role

An authorized Workspace user can discover accessible Project-owned Product Agents without decoding technical IDs or entering every Project:

```text
enter Workspace Agents
→ receive the complete access-filtered PRJ-22 catalog currently disclosed to the caller
→ recognize Agent by ProductAgent.name
→ understand what it is for through ProductAgent.purpose
→ understand the owning Project through ProjectSummary
→ distinguish exact Release presence without inferring runtime health
→ optionally inspect authored/Release technical coordinates already present in the same disclosure
→ search/filter locally over only the already-disclosed collection
→ choose Open Agent when deeper work is needed
→ terminate W-04 at the future Project-owned Agent workspace boundary
```

Locked experience distinction:

```text
WORKSPACE AGENTS = DISCOVER
PROJECT-OWNED AGENT WORKSPACE = UNDERSTAND + COMPOSE + TEST + VERIFY + OPERATE
PUBLISHED-APP AGENT = USE
```

The second and third lines are ownership/destination vocabulary only. W-04 does not select the future P-03 tabs, URL, editor controls, runtime layout or production implementation.

---

## 2. Locked structural baseline

```text
WORKSPACE AGENTS
route page
→ PRJ-22 access-filtered WorkspaceProductAgentCatalogItem[]
→ Agent-first collection
→ ProductAgent.name
→ material Purpose
→ Owning Project
→ authored revision + Release-reference context
→ Included in active Release | No active Release
→ optional Technical coordinates
→ Open Agent
→ explicit P-03 / Project-owned Agent workspace boundary
```

Locked properties:

1. Agent name and purpose are human-authored Product Agent presentation from the exact authored revision; neither becomes identity or authorization;
2. owning Project is explicit human context from `ProjectSummary`, never a frontend join;
3. the complete PRJ-22 response is the only W-04 server collection; local search/filter never becomes a server-search universe;
4. `activeReleaseId` is Release presence only: `Included in active Release | No active Release`;
5. `ProjectSummary.archived` may disclose `Owning Project archived`, but Project archive never becomes Agent lifecycle/runtime state;
6. technical coordinates are progressive disclosure and do not dominate recognition;
7. `Open Agent` is a navigation boundary intent, not a hidden exact-Agent source read;
8. W-04 exposes no Agent create/edit/run control and no system-prompt/tools editor;
9. deeper Agent authoring/configuration/testing/verification/operations remain Project-owned future work;
10. final visual styling, exact production route spelling, cache/query APIs and components remain later realization details.

Binding laws:

```text
project.read != project.source.read
activeReleaseId != runtime health
ProjectSummary.archived != Agent lifecycle
catalog visibility != authoring authority
catalog visibility != runtime authority
```

---

## 3. P9 exact bidirectional authority trace

| W-04 interaction / truth | Class | Exact accepted authority | Permission / boundary | Result |
| --- | --- | --- | --- | --- |
| list accessible Workspace Agents | `PRODUCT_READ` | `PRJ-22 ListWorkspaceProductAgents` | `project.read`; exact current Workspace disclosure | complete currently disclosed `WorkspaceProductAgentCatalogItem[]` |
| human Agent identity | `PRODUCT_READ` | `WorkspaceProductAgentCatalogItem.agent → ProjectProductAgent` | same PRJ-22 disclosure | `ProductAgent.name` |
| human semantic purpose | `PRODUCT_READ` | `WorkspaceProductAgentCatalogItem.agent → ProjectProductAgent` | same PRJ-22 disclosure | `ProductAgent.purpose` |
| owning Project context | `PRODUCT_READ` | `WorkspaceProductAgentCatalogItem.project → ProjectSummary` | same PRJ-22 disclosure | human Project name + archived fact |
| authored/Release coordinates | `PRODUCT_READ` | canonical `ProjectProductAgent` inside PRJ-22 item | same PRJ-22 disclosure | `authoredRevisionId`, `releaseRefs[]`, `activeReleaseId?` |
| text search | `LOCAL_UI` | none | complete already-disclosed PRJ-22 collection only | local subset by Agent name/purpose/Project name |
| Project filter | `LOCAL_UI` | none | Projects represented in already-disclosed PRJ-22 response | local subset |
| Release-presence filter | `LOCAL_UI` | none | exact `activeReleaseId` presence only | local subset |
| technical detail expansion | `LOCAL_UI` | none | already-disclosed fields only | progressive disclosure |
| Open Agent | `NAVIGATION` boundary | future P-03 / Project-owned Agent workspace | no W-04 source-read elevation | W-04 terminates at explicit future-owner boundary |

Exact source-read operations remain outside this block:

```text
PRJ-20 ListProjectProductAgents = OUTSIDE W-04
PRJ-21 GetProjectProductAgent = OUTSIDE W-04

PRJ-20 / PRJ-21
→ project.source.read
→ future Project-owned Agent work only
```

Bidirectional law:

```text
Product/backend → frontend
PRJ-22 → canonical Agent + ProjectSummary → W-04 catalog presentation

frontend → Product/backend
catalog read → PRJ-22 → Project owner projection
local search/filter/detail expansion → no Product operation
Open Agent → future-owner navigation boundary; no PRJ-21 call in W-04
```

Backend sufficiency for W-04 after F13: **SUFFICIENT / no blocking finding**.

---

## 4. Identity / disclosure law

```text
workspaceId = untrusted Workspace reference; server resolves current disclosure
agentId = stable Product Agent machine identity; not the human label
ProductAgent.name = human presentation identity
ProductAgent.purpose = authored semantic explanation
projectId = exact owning Project reference
ProjectSummary.name = human owning-Project presentation
ProjectSummary.archived = Project owner fact only
authoredRevisionId = exact authored Agent revision coordinate
releaseRefs[] = exact Release references
activeReleaseId? = active Release coordinate only
```

Negative laws:

```text
ProductAgent.name -X-> authorization
ProductAgent.purpose -X-> authorization or routing
ProjectSummary.name -X-> authorization
frontend label join -X-> Product truth
activeReleaseId -X-> Healthy / Running / Online / Ready
Project archived -X-> Agent inactive / runtime stopped
catalog visibility -X-> project.source.read
visible Open Agent -X-> authoring/runtime authority
```

---

## 5. Client-state ownership

| State | Class | Rule |
| --- | --- | --- |
| Workspace Agent catalog | `SERVER` | exact current PRJ-22 access-filtered disclosure |
| human query | `EPHEMERAL_UI` | filters only the complete already-disclosed collection |
| Project filter | `EPHEMERAL_UI` | values come only from Projects already represented in PRJ-22 response |
| Release-presence filter | `EPHEMERAL_UI` | derives only present/null `activeReleaseId` into the two admitted labels |
| local search/filter = EPHEMERAL_UI | `EPHEMERAL_UI` | no server search/pagination/sort promise |
| technical detail expansion = EPHEMERAL_UI | `EPHEMERAL_UI` | disclosure only |
| W-04 route | `URL_NAVIGATION` | Workspace Agent catalog entry/re-entry |
| Open Agent = URL_NAVIGATION boundary intent | `URL_NAVIGATION` | future destination; exact P-03 production route remains unopened |
| form draft | none | W-04 has no Product write/form job |

No fifth client-state class is justified.

The browser may derive the local presentation predicate `activeReleaseId present/null` only into the exact accepted Release-presence wording; it may not derive lifecycle/runtime semantics.

---

## 6. Material state / failure / recovery obligations

### PRJ-22 catalog read

Preserve:

```text
loading
!= known-empty
!= 401 unauthenticated
!= 403 denied
!= 404 absent/non-disclosable Workspace
!= transport/dependency failure
```

A failed PRJ-22 read cannot fall back to stale local fixture/catalog state as current Product truth.

### Local search/filter

```text
complete already-disclosed PRJ-22 collection
→ local search/filter only
```

No result means “no match inside the currently disclosed catalog”, not “no such Agent exists globally”. Clearing filters returns the already-disclosed server collection; it performs no authority expansion.

### Open Agent boundary

The W-04 control may preserve the selected Agent/owning Project as untrusted navigation coordinates for a later route, but W-04 itself performs no PRJ-20/21 read and cannot claim that the caller may inspect authored source detail. The future owner must independently recheck exact Project containment, disclosure and Permission.

---

## 7. Authentication / authorization boundary

Current authority split is binding:

```text
PRJ-22 Workspace catalog
→ project.read

PRJ-20 / PRJ-21 Project Agent authored inspection
→ project.source.read

project.read != project.source.read
```

Therefore:

```text
catalog-visible Agent -X-> source visibility
catalog-visible Agent -X-> edit authority
catalog-visible Agent -X-> run authority
catalog-visible Agent -X-> trigger authority
catalog-visible Agent -X-> approval authority
```

The Workspace route never widens a caller from ordinary Project read into Project source read by button placement.

---

## 8. Responsive / accessibility structural obligations

Locked obligations:

- inherit the GF-01 Workspace shell/context grammar;
- Agent name, Purpose, owning Project, Project archived fact and Release presence remain explicit text rather than color-only meaning;
- Purpose remains materially readable rather than compressed into incidental metadata;
- wide layout may use one scannable Agent card/row per result; narrow layout stacks the same semantics without changing ownership;
- persistent labels exist for text/Project/Release-presence filters;
- `Technical coordinates` remains keyboard-operable progressive disclosure;
- `Open Agent` is keyboard reachable and its boundary explanation is perceivable before any future owner-specific implementation;
- boundary dialog/sheet receives focus and Escape/close returns focus where possible;
- technical IDs remain available but do not dominate routine recognition.

Final palette, typography, spacing tokens, icons and production component APIs are not locked.

---

## 9. Forbidden frontend authority

W-04 preserves these exact prohibitions:

```text
PRJ-21 dependency under project.read = FORBIDDEN
Workspace Agent/fleet owner = FORBIDDEN
frontend Agent/Project label join = FORBIDDEN
frontend source-derived Agent name = FORBIDDEN
frontend purpose inference = FORBIDDEN
project.read elevation to project.source.read = FORBIDDEN
Agent create/edit/run controls = NOT ADMITTED
system-prompt/tools editor in W-04 = FORBIDDEN
Agent rename/update metadata operation = NOT ADMITTED
universal Agent status model = NOT ADMITTED
fleet analytics/dashboard = NOT ADMITTED
runtime-health projection from activeReleaseId = FORBIDDEN
server search/pagination/sort by frontend convenience = NOT ADMITTED
```

---

## 10. P10 bounded pattern consolidation

W-04 was compared with all prior locked blocks.

The already-graduated semantic vocabulary remains valid:

```text
context-preserving exact-subject panel
```

W-04 does **not** instantiate that pattern as its root structure: this block is a discovery route and its `Open Agent` dialog is only an unopened-block boundary, not an exact server-owned subject work panel.

The new `catalog → future owner workspace` handoff is useful, but one W-04 occurrence is insufficient to graduate a reusable semantic pattern. Local filtering over a complete disclosed collection is a truth/scale law already used elsewhere, not a reason to invent a component or shared API.

```text
P10 new graduated shared patterns = 0
existing graduated patterns remain = 1
P11 = LATER ASSEMBLED PRODUCT
```

No `AgentCard`, `AgentStudioLink`, generic catalog component, shared hook/store, universal resource workspace or cross-owner DTO is selected by P10.

---

## 11. Closure disposition

```text
W-04 = LOCKED / OPERATOR APPROVED
approved revised P8 artifact = 65073eb5f532f2675f04ec307eb0d9b91fd1b69d
P9 exact Screen Contract = CLOSED
P10 pattern pass = CLOSED / 0 new graduated shared semantic patterns
existing pattern vocabulary = context-preserving exact-subject panel
P11 = LATER ASSEMBLED PRODUCT
P-01 = NEXT / NOT OPEN
```

Only a later material falsifier may reopen the smallest affected W-04 scope. This closure routes the next material 4C block to P-01 but does not open it. P11, 4D, merge and Product implementation remain unauthorized.
