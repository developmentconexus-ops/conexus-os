# 4C — Candidate Information Architecture + Terminology

> **Status:** CANDIDATE / 4C-4
> **Authority posture:** derived from the operator-accepted 4C contract and green 4C-0→4C-3 foundation. This document does not create Product operations, screens, routes, DTOs, authorization, runtime behavior or implementation authority.
> **Method:** `docs/development/frontend-product-experience-planning-method.md` v2.1, profiled by `docs/phases/4c-frontend-interaction-and-authority-realization.md`.

4C-4 answers one question only:

> How should current human Product work be findable and named before screen composition begins?

The Phase-3 Workspace/Project shells are semantic seeds, not a pre-approved navbar. Their semantic resource homes remain binding inputs; labels, grouping, order and navigation priority are deliberately re-derived here from accepted human goals and flows.

```text
4C-0→3 GREEN foundation
→ accepted actors + Journey A–O
→ object/task inventory
→ bounded reference challenge
→ candidate mental model
→ candidate global IA
→ terminology glossary

4C-5 screen/material-surface inventory = NOT STARTED
4C-8 rendered structural wireframes     = NOT STARTED
4D Paved Road/runtime                    = NOT STARTED
```

No structure in this document is `LOCKED`. `LOCKED` remains operator-only and requires the later rendered global-frame block cycle.

---

## 1. Human mental-model constraints recovered from authority

The Product contract establishes a hierarchy that is meaningful to users independent of backend implementation:

```text
Account
→ Workspace
→ Project
→ Build / Product resources / operation

and independently:

exact active Release
→ Published Application
→ business capability / Product Agent interaction
```

The IA must preserve these user-visible distinctions:

1. Workspace is the organization/isolation context; it is not a Project folder or backend tenant label.
2. Project is the lifecycle container for one independently evolving software Product.
3. Build is the primary Project construction surface and is agent-first with Preview dominant.
4. Brain and Connections may be Workspace resources shared deliberately into Projects; Project use never implies ownership transfer.
5. Connection and Integration are distinct meanings: Connection is the external-system relationship; Integration is Project use/binding of that relationship.
6. Data, Capabilities, Integrations, Agents and Brain context are real Product resources and must remain directly inspectable rather than hidden behind platform machinery.
7. Release, Promotion and serving state are distinct Product truths; navigation terminology must not collapse them.
8. Control Plane authority and Published Application authority are independent.
9. Product-Agent approval is exact-subject authority, not a global workflow/Approval Center domain.
10. Audit/telemetry is evidence/projection and never current business-state authority.

---

## 2. Object/task inventory

| Human concept / task | Why the user cares | Primary current actions | Findability role | IA implication |
| --- | --- | --- | --- | --- |
| Workspace | choose the organization/isolation context in which work occurs | enter/create authorized Workspace; administer access/resources | global context selector | Workspace context must remain visible and switchable without implying cross-Workspace authority |
| Projects | find, create and oversee independently evolving software Products | list/open/create/import/duplicate/archive Projects | primary Workspace browse | **Projects is the primary Workspace destination** because accepted F1 work enters/evolves software through Projects |
| Build | state intent, inspect Plan/progress, Preview, code/diff, Findings/Evidence and evolve the Product | create/review Change; inspect/decide; ask Conexus | primary Project work | **Build is the primary Project destination** and default construction context |
| Data | understand what business data the Project can truthfully use | inspect declared resources, grain/freshness/coverage/provenance | direct Project resource | directly findable under Project; never a generic DB explorer |
| Capabilities | understand callable Product behavior | inspect exact Queries/Actions and current capability meaning | direct Project resource | distinct from source code and from Integration mechanics |
| Connections | establish/manage qualified relationships to external systems/environments | list/create/revise/credential/qualify Connection | Workspace or Project resource depending ownerScope | Connection lifecycle needs a direct home at its owning scope |
| Integrations | understand/use the external-system capabilities explicitly bound to one Project | inspect/set/remove ProjectConnectionBinding | direct Project resource | separate label/home from Connections to preserve ownership semantics |
| Brain | inspect/review/publish reusable enterprise meaning and Project binding/health | discover/propose/review/publish; inspect/bind exact revision | Workspace shared resource + Project context | same concept, different scope-specific tasks; no RAG/vector/memory vocabulary |
| Product Agents | create/evolve Project-owned Agents and use/manage current runtime-facing Agent resources | inspect Project Agents; evolve through Change; administer triggers; use exact published Agent | Project resource; Workspace catalog is filtered projection | Project is the ownership context; Workspace Agents is browse/catalog only, never a fleet owner |
| Releases | understand immutable eligible Product compositions and what is actually served | list/inspect Release; inspect conformance; promote; inspect serving state | Project operation/inspection | Project-wide `Versions` is too ambiguous; Release-specific home is clearer |
| Activity / Evidence | understand what happened and inspect proof/provenance | inspect activity, execution detail, usage/cost, Findings/Evidence | Project investigation | direct inspection entry; current state must still come from semantic owner |
| People & access | administer Workspace membership/Areas/Project access without implying business-app access | list/add/remove membership; grant/revoke Project access | Workspace administration | task-centered label should cover people plus access decisions rather than only `Members` |
| Published-app access | administer who may use one exact Published Application | list/set/revoke app access | Project administration | belongs with Project/app administration, independent from Workspace membership and Builder access |
| Audit | inspect immutable governed history at Workspace/Project scope | list/get AuditRecords | secondary governance/investigation | findable in administration/investigation, not merged into current Product state |
| Contextual Conexus assistance | ask what something means / next safe action in current authorized context | Ask Conexus about selected Project context | contextual, not global Product-Agent fleet | available in Build/resource context; grants no new authority |

### 2.1 Deliberate non-destinations

Current authority does **not** admit the following as Product-wide IA destinations:

```text
universal Approval Center = REJECTED
universal workflow center = REJECTED
universal scheduler       = REJECTED
global file manager       = REJECTED
raw database explorer     = REJECTED
provider/runtime console  = REJECTED
Product-wide global search = NOT ADMITTED
```

`global search = NOT ADMITTED` as a current Product-wide capability or destination because no accepted operation owns cross-Product search semantics. Local browse/search/filter controls inside exact admitted collections may still be derived later when exact wire/data supports them; this statement does not forbid LOCAL_UI filtering.

ApprovalRequest UX must remain attached to the exact Project/AgentRun/Published-App context that current authority admits. There is no universal Approval Center merely because multiple owner-specific decisions exist.

---

## 3. Bounded current reference challenge

4C-4 uses external references as pattern Evidence only. They do not create Conexus Product authority.

Observed on 2026-08-22:

| Reference | Source observation | Useful inference for Conexus | Disconfirming / mismatch |
| --- | --- | --- | --- |
| Replit Project Editor | Project Editor is a home base where the user describes intent to Agent while seeing the app take shape in a live Preview; project tools remain accessible around that core workspace. | Supports accepted Conexus `Build` as the primary agent-first Project context with Preview dominant. | Replit can centralize more tooling into one editor; Conexus cannot hide Data/Capabilities/Integrations/Brain/Evidence because current authority requires those real resources directly inspectable. |
| Vercel dashboard | Team owns Projects; selecting a Project opens Project-specific deployments/settings/observability. Deployment and production concepts are navigated in the Project context. | Supports explicit Workspace→Project context and scope-local administration rather than one flat global navigation. | Vercel's `Deployments` language is too coarse for Conexus because `Release AVAILABLE != Promotion != SERVED_VERIFIED`. |
| Supabase dashboard | Organization groups Projects; inside a Project, users navigate capability areas such as Database/Auth/Storage/Functions. | Supports Project-context resource navigation and keeping shared organization administration separate from project-specific work. | Supabase service/tool labels mirror its backend platform model more closely than Conexus should; Conexus must organize around accepted Product resources/tasks, not infrastructure products. |
| Retool | Platform material groups user jobs into Build, Automate and Govern, with Apps/Agents/Workflows/Administration as distinct task families. | Supports task-centered grouping and progressive separation of building versus governance/admin work. | Retool's Agents/Workflows are independent product families; Conexus Product Agents remain Project-owned and Conexus explicitly rejects a universal workflow domain. |

Reference sources:

- `https://docs.replit.com/learn/projects-and-artifacts/project-editor`
- `https://vercel.com/academy/optimize-your-vercel-account/tour-the-dashboard`
- `https://vercel.com/docs/projects`
- `https://supabase.com/docs/guides/platform`
- `https://docs.retool.com/`

The reference study validates patterns, not exact labels or screen layouts.

---

## 4. Candidate global IA model

The candidate uses **scope first, task second**:

```text
human session
├── CONTROL PLANE
│   └── Workspace context
│       ├── Workspace-level work/resources/governance
│       └── Project context
│           ├── primary Build work
│           ├── inspectable Product resources
│           ├── releases/operation evidence
│           └── bounded administration
│
└── PUBLISHED APPLICATION
    └── exact active Release + independent app authority
        └── Project-defined business IA
```

This explicitly avoids making Published Applications subpages of the Control Plane merely because one Account may access both.

### 4.1 CONTROL PLANE — global frame

Global frame responsibilities are limited to context and reachability:

```text
current Account/session projection
current Workspace context / allowed Workspace switching
entry to Workspace destinations
entry to exact Project context
session end / reauthentication behavior later in 4C
```

The global frame does **not** own business authorization, Project lifecycle state, app role, approval eligibility or universal search.

### 4.2 CONTROL PLANE — candidate Workspace IA

Candidate grouping:

```text
Workspace
│
├── WORK
│   ├── Projects          ← primary Workspace destination
│   └── Agents            ← access-filtered Project-owned Agent catalog
│
├── SHARED CONTEXT
│   ├── Brain             ← Workspace reusable enterprise meaning
│   └── Connections       ← Workspace-owned reusable Connections
│
└── ADMINISTRATION / INVESTIGATION
    ├── People & access   ← members, Areas, Project access
    └── Audit             ← immutable audit inspection
```

Candidate decisions:

- **Projects is the primary Workspace destination.** It is the natural entry for Journey B/C/M/O and the container from which Project-owned Build/resources/releases become meaningful.
- `Agents` survives as a Workspace browse destination only as the accepted access-filtered catalog. It must never present itself as a global Agent owner/fleet.
- `Brain` and `Connections` remain first-class Workspace shared resources because Journey D/E/F explicitly require organization-level reuse and review.
- `Members` is not the leading candidate label. `People & access` better covers the actual current tasks: members, Areas and Project access, without pretending app access is implied.
- A generic top-level `Settings` destination is **not promoted in this candidate** merely because Phase 3 had a semantic Settings seed. `4B-F01` removed generic Workspace/Area mutation because no closed mutable property set exists. Any later Settings surface must be populated only by concrete accepted current tasks.
- Workspace `Audit` is secondary governance/investigation, not a current-state dashboard.

No ordering among non-primary Workspace items is treated as frequency evidence. That remains `4C-A02`.

### 4.3 CONTROL PLANE — candidate Project IA

Candidate grouping:

```text
Project
│
├── BUILD
│   └── Build             ← primary/default Project destination
│
├── PRODUCT
│   ├── Data
│   ├── Capabilities
│   ├── Integrations
│   ├── Agents
│   └── Brain
│
├── OPERATE / INSPECT
│   ├── Releases
│   └── Activity
│
└── MANAGE
    └── Settings          ← only concrete accepted Project/app administration
```

Candidate decisions:

- **Build is the primary Project destination.** This comes directly from accepted Product authority, not from external reference popularity.
- Build remains Preview-dominant with contextual Conexus assistance, but composition/lenses belong to later screen/block work.
- Data, Capabilities, Integrations, Agents and Brain remain directly findable Product resources rather than being collapsed into `Build` or an infrastructure `Tools` menu.
- `Connection` remains the external-system relationship owned at Workspace/Project scope; `Integration` remains Project use/binding of a Connection/capability. The two labels must not be merged.
- **Versions — REJECTED as the leading Project navigation label.** `Version` is overloaded across Baseline revisions, Brain revisions, Connection revisions, Agent revisions, Trigger revisions and other immutable/current subjects.
- **Releases — CANDIDATE Project navigation label.** It points to the exact immutable Project composition and provides the semantic home from which Promotion, conformance and serving-state distinctions can remain visible.
- `Deployments` is not adopted from Vercel because it risks collapsing accepted Release/Promotion/serving truth.
- `Activity` is the entry for chronological execution/usage/Evidence investigation; it never replaces owner current state.
- Project `Settings` is a bounded administration home only. It does not imply generic rename/metadata mutation; `PRJ-04 UpdateProject` remains subtracted.
- Approval UX is contextual to exact owner subject and therefore does not become a project-global approval domain by default.

### 4.4 PUBLISHED APPLICATION — independent IA rule

Published Application browser experience is **not** forced into the Control Plane IA.

```text
exact Published App
→ exact active Release
→ current app access / role
→ Project-defined business user goals
→ Project-defined IA
```

Platform-owned browser responsibilities remain limited to authentication/session, current app access/disclosure, exact serving context and any exact Product-Agent/approval surface admitted by that application.

Therefore:

- a Published App user does not see Builder navigation by inheritance;
- a Project admin does not become a business-app user by inheritance;
- Product-Agent conversation/approval UI may exist inside the Published App only where the exact app design and current authority admit it;
- Budget Analyzer IA will be derived from its two accepted human queries during 4C-5/per-block work, not by importing Control Plane navigation.

---

## 5. Journey A–O preservation check

Candidate IA must make each accepted journey findable without inventing a new Product destination.

| Journey | Candidate IA home / context |
| --- | --- |
| Journey A — first access / Workspace | CONTROL PLANE global frame → Workspace context → Projects / Agents / Brain / Connections / People & access |
| Journey B — Project Inception / Baseline | Workspace → Projects → exact Project → Build/Project administration context |
| Journey C — Plan / build / verify / publish | Project → Build, then Releases for exact Release/Promotion/serving inspection |
| Journey D — Brain assisted Discovery | Workspace → Brain, with exact Project/source context where discovery is Project-triggered |
| Journey E — Brain publish / bind / feedback | Workspace → Brain for review/publication; Project → Brain for exact binding/context |
| Journey F — Connection / Integration | Workspace/Project-owned Connection home → Project → Integrations for binding/use |
| Journey G — Data / static Query / AnalyticQuery | Project → Data / Capabilities / Brain according to the exact semantic subject |
| Journey H — Publish and use business application | Project → Releases for serving/admin; separate PUBLISHED APPLICATION for business use |
| Journey I — create/evolve Product Agent | Project → Agents or Build; both converge on the same Change/Build path |
| Journey J — use Product Agent | PUBLISHED APPLICATION exact Agent surface; Control Plane only where a current inspection route exists |
| Journey K — exact effect approval | exact Project/AgentRun/Published-App context; no universal Approval Center |
| Journey L — managed sync/job | Project → Activity / exact operation detail, with run-now control only where currently authorized |
| Journey M — duplicate Project | Workspace → Projects / exact Project management action; destination rebinds authority explicitly |
| Journey N — first vertical Budget Analyzer | separate Budget Analyzer PUBLISHED APPLICATION; Control Plane retains Project build/resource/release administration |
| Journey O — maintenance and reusable learning | Project → Build for Change; Workspace → Brain only when reusable learning becomes KnowledgeProposal/review |

All fifteen journeys have a candidate findability home. None requires a new Product owner or universal cross-domain destination.

---

## 6. Candidate terminology glossary

The glossary chooses user-facing language that preserves accepted distinctions. Marketing copy is not frozen here.

| Concept/action | User-facing term | Avoid / do not conflate with | Rationale |
| --- | --- | --- | --- |
| Workspace | Workspace | Tenant, Organization as authority synonym | accepted sovereign user-visible isolation/organization root |
| Area | Area | Project, Team-as-owner | optional people grouping only; not software/dependency owner |
| Project | Project | App, repository | independent software/Product lifecycle container; one repo is implementation/source, not Product identity |
| Build | Build | IDE, Coding | agent-first Product construction surface; includes Preview/Plan/proof, not merely editing code |
| Change | Change | Task, WorkUnit, PR | bounded/verifiable Product evolution; deliberately distinct from runtime work units |
| Plan | Plan | Workflow | approvable build plan when warranted; not a generic workflow engine |
| Preview | Preview | Live, Production | candidate/result inspection; `ready != verified != live` |
| Brain | Brain | RAG, vector store, memory, knowledge DB | canonical reusable enterprise meaning/knowledge with publication/binding authority |
| Connection | Connection | Integration | external account/system/environment relationship + qualified revision/credential boundary |
| Integration | Integration | Connection | Project use/binding of explicitly admitted external capability |
| Capability | Capability | Endpoint, tool | real Project behavior users/software/Agents can invoke; Query/Action are core Product vocabulary |
| Release | Release | generic Version, Deployment | immutable exact Project composition eligible to be served |
| Promotion | Promotion | Deploy, Publish as one-step state | governed movement of exact Release toward target environment; preserves separate serving verification |
| Product Agent | Agent | Bot, Platform Consultant, runtime thread | Project-owned Release-pinned AI Product resource; `Agent` is acceptable UI shorthand when context is unambiguous |
| Conexus | Conexus | Product Agent | contextual platform consultant/assistant; `Ask Conexus` does not create Agent authority |
| Finding | Finding | generic error, log | durable review/problem/contradiction with owner-governed resolution |
| Evidence | Evidence | log, green badge, model narration | provenance-preserving proof; not telemetry by existence |
| Activity | Activity | current state, Audit | chronological observation/projection entry; owner facts remain authoritative |
| Audit | Audit | Activity, business history projection | immutable governance record with separate disclosure scope |
| Published Application | App | Control Plane Project | business runtime from exact active Release under independent app authority |
| People & access | People & access | app access, universal RBAC | Workspace membership/Areas/Project grants; Published-App access remains independent |

### 6.1 Terminology decision: `Versions` → `Releases`

`Versions` was an acceptable Phase-3 semantic placeholder but is not the leading 4C navigation candidate because Conexus has many independently versioned/revisioned subjects.

```text
Baseline revision
Brain revision
Connection revision
Agent revision
Trigger revision
Plan revision
Release
```

Using one top-level `Versions` label would force users to infer which versioned subject it means. `Releases` is narrower and maps directly to the Project composition/Promotion/serving journey.

This is a **CANDIDATE IA terminology decision**, not `LOCKED` copy.

---

## 7. Findability laws for 4C-5 and later blocks

The next stage may derive screens/surfaces only inside these candidate constraints:

```text
scope before action
Workspace context != Project context != Published Application context
Build primary, but real Product resources stay directly inspectable
shared Workspace resource ownership != Project binding/use
Connection != Integration
Release != Promotion != served/live
Activity/Audit != owner current truth
approval visibility != authorization
no universal search/approval/workflow/file/scheduler domain
```

Collection-specific search/filter/sort is neither required nor forbidden by this global IA. It must be justified later from the exact user task, scale and admitted wire fields.

---

## 8. Assumption register update

| ID | Prior state | 4C-4 result | New state |
| --- | --- | --- | --- |
| `4C-A01` | semantic Workspace/Project shells are useful seeds but do not prove final nav | confirmed: candidate preserves semantic homes while changing grouping/labels (`Members`→`People & access`, `Versions`→`Releases`, generic Workspace `Settings` not promoted) and adds only an already-admitted Audit home | **VALIDATED** |
| `4C-A02` | task frequency/urgency not established | no direct user/analytics frequency Evidence was found; candidate sets only authority-backed primary anchors (`Projects`, `Build`) and refuses to infer ordering among other destinations | **OPEN** |

`4C-A02` does not block candidate IA. It must be probed in the later rendered global-frame/operator walkthrough before IA can become `LOCKED`.

---

## 9. 4C-4 candidate verdict

```text
human actor contexts preserved              = 7 / 7
accepted Journey A–O findability homes      = 15 / 15
CONTROL PLANE / PUBLISHED APPLICATION split = explicit
primary Workspace anchor                    = Projects
primary Project anchor                      = Build
real Product resource inspectability        = preserved
Connection / Integration distinction        = preserved
Release / Promotion / serving distinction   = preserved
universal Approval Center                    = rejected
Product-wide global search                   = not admitted
invented Product operation                   = 0
invented Product owner                       = 0
invented Product-wide policy domain          = 0
4C-A01                                       = VALIDATED
4C-A02                                       = OPEN
4C-5                                         = NOT STARTED
LOCKED IA                                    = 0
```

4C-4 exits **CANDIDATE**. The next allowed stage is 4C-5 candidate screen/material-surface inventory. IA may become `LOCKED` only later through the first rendered global-frame block with explicit operator visual adjudication.
