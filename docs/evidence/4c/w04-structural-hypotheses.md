# 4C W-04 — Workspace Agent Catalog P7 Structural Hypotheses

> **Status:** `P7 CANDIDATE / OPERATOR ADJUDICATION / P8 BLOCKED / NOT LOCKED`
> **Block:** `W-04 — Workspace Agent catalog`.
> **Method:** Frontend Product Experience Planning Method v2.2 + DevelopmentConexus Engineering Method.
> **Leading hypothesis:** `A — Agent-first searchable catalog`.
> **Authority posture:** interaction-structure Evidence only; no Product implementation, P8, LOCK, P-01, P11, 4D or merge authority.

## 1. Recompiled starting point

The operator-approved `4C-F13 — Product Agent Human Identity + Workspace Catalog Context` has been recompiled through the existing Product Agent presentation owner and canonical Project wire without changing operation or Permission topology.

```text
fixed Product operations = 116
canonical fixed Product wire = 116 ↔ 116
Project operations = 23
ordinary Permissions = 25
semantic owners = 13
durable record classes = 46
Technical Ingress = 3 / Product impact 0
F13 blocking authority/data findings = 0
```

F13 now establishes:

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

Identity law:

```text
agentId = technical identity
ProductAgent.name = human presentation identity
ProductAgent.purpose = authored semantic purpose
ProjectSummary.name = human owning-Project context

name -X-> authorization
name -X-> routing identity
purpose -X-> authorization
activeReleaseId -X-> runtime health
```

`PRJ-22 ListWorkspaceProductAgents` remains an access-filtered Project-owned projection. It does not create a Workspace Agent owner or fleet-management domain.

## 2. Human job and target invariant

The Workspace operator needs one cross-Project discovery surface that answers quickly:

```text
Which Product Agent am I looking for?
What is it for?
Which Project owns it?
Is it included in that Project's active Release coordinate?
Where do I go when I need deeper Project-owned Agent work?
```

The user must not have to decode Agent/Project/revision/Release IDs or traverse every Project just to discover an Agent.

Target invariant:

> The Workspace Agent catalog is a human-first, access-filtered discovery projection over Project-owned Product Agents. It optimizes cross-Project recognition and findability while all authoring, runtime, trigger, run and approval authority remains with the exact Project/PAR surfaces that own those jobs.

## 3. P6 reference Evidence

Reference study is Evidence only. It does not create Conexus Product requirements.

### 3.1 ServiceNow AI Agent Studio — source observation

Current ServiceNow Agent Studio documentation presents an Agent list intended for search/filter and selection of a named Agent, while activity/analytics and configuration concerns remain distinct work contexts rather than being collapsed into one fleet screen.

Source: https://www.servicenow.com/docs/r/intelligent-experiences/ai-agent-studio.html

Inference relevant to W-04:

```text
catalog usefulness
→ recognition + findability first
→ deeper configuration/observation remains separate
```

Conexus decision:

- retain the discoverability principle;
- reject any implication that W-04 owns Agent configuration, runs, analytics or runtime health.

### 3.2 Salesforce Agentforce — source observation

Agentforce presents a central Agent discovery/list experience while distinguishing building/configuration work from observation/operational work; descriptive human Agent naming is a first-class recognition requirement.

Source: https://trailhead.salesforce.com/pt-BR/content/learn/modules/introduction-to-agent-builder/get-to-know-agent-builder

Inference relevant to W-04:

```text
central list != universal Agent lifecycle owner
```

Conexus decision:

- use human Agent identity + purpose in the catalog;
- keep authoring under Builder/Change and runtime observation under later owner-specific surfaces.

### 3.3 Microsoft agent catalog surfaces — source observation

Microsoft's current Agent experiences provide an `All agents` discovery concept while maintaining separate owner/environment contexts for deeper management.

Source: https://learn.microsoft.com/en-us/microsoft-365-copilot/extensibility/copilot-studio-agent-builder-publish

Inference relevant to W-04:

```text
cross-context catalog
→ owner context must remain visible
```

Conexus decision:

- make the exact owning `ProjectSummary` part of each catalog item;
- reject a new Workspace Agent/fleet owner.

### 3.4 Reference synthesis

The useful repeated pattern is:

```text
central catalog
→ human recognition
→ search/filter
→ owner context visible
→ deeper work returns to the real owner

catalog != lifecycle owner
catalog != runtime dashboard
```

## 4. Structural hypotheses compared

| Hypothesis | Structure | Strengths | Material failure |
| --- | --- | --- | --- |
| **A — Agent-first searchable catalog** | one Workspace Agent collection; each result leads with Agent name/purpose, shows owning Project and honest active-Release presence; local search/filter over the complete disclosed collection | preserves the reason a Workspace catalog exists; best cross-Project discovery; human recognition first; Project ownership stays visible; responsive/list-card transformation is straightforward | no material failure against current accepted authority. **LEADING CANDIDATE.** |
| **B — Project-grouped catalog** | group Agents under Project headings, then browse Agents inside each group | ownership is visually obvious | makes cross-Project Agent discovery slower, scales vertically, duplicates the Project tree and weakens the Workspace-wide Agent mental model. **REJECTED.** |
| **C — Project-first master/detail** | choose Project first, then inspect that Project's Agent list | maps closely to Project ownership and `PRJ-20` | recreates `Projects → Project Agents`, requires deeper Project/source-read semantics, and removes the reason for `PRJ-22` Workspace catalog. **REJECTED.** |

No fourth fleet/dashboard hypothesis is admitted because runtime health, runs, triggers, approvals and authoring are not owned by `PRJ-22`.

## 5. Leading candidate A — route-level structure

```text
Agents
├── search / local filters
│   ├── human query
│   ├── Project
│   └── Release presence
│
└── access-filtered Agent collection
    ├── ProductAgent.name
    ├── ProductAgent.purpose
    ├── ProjectSummary.name
    ├── exact Release-presence wording
    └── future P-03 boundary for deeper Project-owned Agent work
```

The catalog is Agent-first rather than endpoint-first or Project-tree-first.

It is one `ROUTE_PAGE` candidate corresponding to existing `WS-S03 Workspace Agent catalog`. No additional Product screen/domain is created.

## 6. Catalog item information hierarchy

Primary presentation:

```text
Agent name
Purpose / what this Agent is for
Owning Project name
Release presence
```

Secondary/technical presentation when useful:

```text
agentId
authoredRevisionId
activeReleaseId exact coordinate when present
releaseRefs[]
Project id / archived coordinate where needed
```

Technical coordinates must not dominate ordinary recognition.

### 6.1 Human identity

```text
ProductAgent.name
→ primary Agent label

ProductAgent.purpose
→ semantic secondary explanation

ProjectSummary.name
→ visible owning context

agentId = technical identity
```

The browser never infers Agent names from source files, slugs, revisions, model identity or runtime state.

### 6.2 Owning Project state

`ProjectSummary.archived` is available in the canonical PRJ-22 item. When true, the UI may disclose explicit text such as `Owning Project archived`; it must not convert that fact into an invented Agent lifecycle state.

```text
Project archived -X-> Agent inactive
Project archived -X-> Agent runtime stopped
```

## 7. Release-presence language

`activeReleaseId` is a Project projection coordinate, not runtime or serving health.

The only admitted high-level catalog labels are:

```text
activeReleaseId present
→ Included in active Release

activeReleaseId null
→ No active Release
```

Exact forbidden semantic inflation:

```text
Active / Inactive = FORBIDDEN
Healthy / Running / Online / Ready = FORBIDDEN
Deployed successfully = FORBIDDEN
activeReleaseId -X-> runtime health
activeReleaseId -X-> AgentRun state
activeReleaseId -X-> served verification
```

The exact Release ID may remain available as technical detail when useful.

## 8. Search, filter, sort and scale law

Current `PRJ-22` wire returns an array and defines no query/pagination/sort contract.

Therefore the honest F1 structure is:

```text
complete already-disclosed PRJ-22 collection
→ local search/filter only
```

Admitted local filters:

- human text query over already-disclosed `ProductAgent.name`, `ProductAgent.purpose` and `ProjectSummary.name`;
- exact Project selection from the Projects represented in the already-disclosed catalog response;
- Release-presence selection (`Included in active Release | No active Release`).

These are `EPHEMERAL_UI`, not Product operations.

Binding limits:

```text
local search/filter != server search universe
no PRJ-22 pagination contract
no server-side sort contract
```

P7 does not invent authoritative alphabetical, recent-activity, health or popularity ordering.

If real F1 Workspace Agent volume makes the complete list unusable, reopen only the exact `PRJ-22` list-scale question. Do not preemptively add pagination/search by symmetry.

## 9. Permission and deeper-work boundary

Permission separation is binding:

```text
PRJ-22 Workspace catalog
→ project.read

PRJ-20 ListProjectProductAgents
PRJ-21 GetProjectProductAgent
→ project.source.read

project.read != project.source.read
```

Therefore W-04 cannot assume that a human who can discover an Agent may inspect its authored Project/source detail.

```text
PRJ-21 dependency under project.read = FORBIDDEN
```

A catalog item may expose only the truth already present in `WorkspaceProductAgentCatalogItem` under PRJ-22.

Deeper exact-Agent authoring/configuration, Project Agent lifecycle, triggers, runs and approvals belong to the future P-03 block and owner-specific Project/PAR surfaces.

```text
future P-03 boundary
```

P7 deliberately terminates there rather than secretly designing P-03.

## 10. Material interactions

W-04 is read/discovery-only at this block:

```text
open Workspace Agent catalog → NAVIGATION
inspect Agent rows/cards       → PRODUCT_READ projection from PRJ-22
search                         → LOCAL_UI / EPHEMERAL_UI
Project filter                 → LOCAL_UI / EPHEMERAL_UI
Release-presence filter        → LOCAL_UI / EPHEMERAL_UI
technical detail expansion     → LOCAL_UI / EPHEMERAL_UI
future deeper Agent work       → boundary only; P-03 not designed here
```

No write is needed to prove W-04.

```text
Agent create/edit/run controls = NOT ADMITTED
```

Agent authoring remains the accepted Builder/Change → `agent/v1` → proof → Release path.

## 11. Authority/data feasibility matrix

| W-04 requirement | Exact current authority | Result |
| --- | --- | --- |
| access-filtered Workspace Agent collection | `PRJ-22 ListWorkspaceProductAgents` | PRESENT-IN-AUTHORITY |
| human Agent identity | `ProjectProductAgent.name` after F13 | PRESENT-IN-AUTHORITY |
| human semantic purpose | `ProjectProductAgent.purpose` after F13, derived from existing `agent/v1` meaning | PRESENT-IN-AUTHORITY |
| owning Project human context | `WorkspaceProductAgentCatalogItem.project → ProjectSummary` after F13 | PRESENT-IN-AUTHORITY |
| exact authored revision / Release coordinates | `ProjectProductAgent.authoredRevisionId`, `releaseRefs[]`, `activeReleaseId?` | PRESENT-IN-AUTHORITY |
| owning Project archived fact | `ProjectSummary.archived` | PRESENT-IN-AUTHORITY |
| human text / Project / Release-presence filtering | local view over complete already-disclosed PRJ-22 collection | PRESENT-IN-AUTHORITY / LOCAL_UI |
| server pagination | none | NOT REQUIRED for current P7; F1 scale assumption |
| server authoritative sort | none | NOT REQUIRED; no sort promise invented |
| exact authored Agent detail | `PRJ-21`, but requires distinct `project.source.read` | OUTSIDE W-04 / future P-03 boundary |
| Agent authoring / mutation | Builder/Change path, not PRJ-22 | OUTSIDE W-04 |
| runtime health / runs / triggers / approvals | Release/PAR owner surfaces | OUTSIDE W-04 |

Blocking authority/data findings after F13: **0**.

## 12. Client-state boundary candidate

The honest state set for W-04 is intentionally small:

```text
SERVER
→ PRJ-22 access-filtered WorkspaceProductAgentCatalogItem[]

EPHEMERAL_UI
→ local human query
→ local Project filter
→ local Release-presence filter
→ expanded technical coordinates

URL_NAVIGATION
→ W-04 route itself
→ no exact Agent source-detail deep link is selected by W-04

FORM_DRAFT
→ none required for Product work in this read-only catalog block
```

No fifth state class is justified.

The filter set is not required to become URL authority at P7. P8 may falsify whether preserving filters in the URL materially improves catalog re-entry; if not, filters remain ephemeral.

## 13. Responsive and accessibility obligations

Wide-layout candidate:

```text
search/filter controls
→ compact Agent rows / dense scannable list
```

Narrow-layout candidate:

```text
same semantic collection
→ stacked Agent cards
→ same name / purpose / Project / Release-presence meaning
```

Responsive transformation never changes Product semantics.

Accessibility obligations:

- Agent name and purpose are textual;
- owning Project is explicit text;
- Release presence uses exact text, never color-only badge meaning;
- archived Project context, when shown, is text and not color-only;
- search/filter controls have persistent labels;
- collection rows/cards are semantic and keyboard reachable where interactive;
- technical-details disclosure is keyboard operable;
- focus order follows search/filter → collection → optional detail disclosure;
- no hover-only Agent identity or Project context.

## 14. Context / navigation preservation

W-04 is a discovery route, not a contextual mutation panel. It does not need the W-03/W-02B exact-subject panel as its root structure.

A later P-03 exact Agent experience may accept navigation from W-04 while preserving a return coordinate, but W-04 does not decide the P-03 detail pattern or production URL.

```text
W-04 catalog context
→ future exact-Agent/P-03 boundary
→ return behavior tested when P-03/P11 exists
```

## 15. Explicit forbidden authority

```text
Workspace Agent/fleet owner = FORBIDDEN
frontend Agent/Project label join = FORBIDDEN
frontend source-derived Agent name = FORBIDDEN
frontend purpose inference = FORBIDDEN
PRJ-21 dependency under project.read = FORBIDDEN
project.read elevation to project.source.read = FORBIDDEN
Agent create/edit/run controls = NOT ADMITTED
Agent rename/update metadata operation = NOT ADMITTED
universal Agent status model = NOT ADMITTED
fleet analytics/dashboard = NOT ADMITTED
Approval Center = NOT ADMITTED
runtime-health projection from activeReleaseId = FORBIDDEN
Active / Inactive = FORBIDDEN
Healthy / Running / Online / Ready = FORBIDDEN
server search/pagination/sort by frontend convenience = NOT ADMITTED
```

## 16. P7 proof chronology

```text
F13 selected-realization RED
→ Verify #755 = EXPECTED FAILURE
→ 94 tests / 92 pass / 2 exact expected failures
→ presentation authority + Project wire only

F13 bounded recompile
→ human-context identity authority
→ ProjectProductAgent name + purpose
→ PRJ-22 closed { agent, project } composition
→ bounded Project catalog checker

Verify #763 = SUCCESS
→ full repository + Product wire GREEN
→ fixed Product wire remains 116 ↔ 116

Verify #764 = EXPECTED P7 RED
→ 95 tests / 94 pass / exactly 1 expected failure
→ missing w04-structural-hypotheses.md only
→ F13 and every prior locked block remained GREEN
```

## 17. Operator gate

Current disposition:

```text
Hypothesis A = LEADING CANDIDATE
Hypothesis B = REJECTED
Hypothesis C = REJECTED
W-04 = NOT LOCKED
P8 = BLOCKED
```

Exact next decision is **APPROVE | REVISE** this W-04 P7 structure.

Approval would authorize creation of the functional low-fidelity P8 candidate for the Workspace Agent catalog. It would **not** itself LOCK W-04, open P-01/P11/4D, authorize Product implementation or authorize merge.
