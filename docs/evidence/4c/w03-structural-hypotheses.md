# 4C W-03 — People/access + Audit P7 Structural Hypotheses

> **Status:** `P7 CANDIDATE / OPERATOR ADJUDICATION / P8 BLOCKED / NOT LOCKED`
> **Block:** `W-03 — People/access + audit`, split into `W-03A — People & access` and `W-03B — Audit`.
> **Method:** Frontend Product Experience Planning Method v2.2 + DevelopmentConexus Engineering Method.
> **Leading hypothesis:** `A — subject-first access + filtered immutable Audit`.
> **Authority posture:** interaction-structure Evidence only; no Product implementation, P8 LOCK, final visual-design or 4D authority.

## 1. Recompiled starting point

F11 and F12 are no longer hypothetical backend gaps. Their selected realization has been recompiled through current 4A and canonical 4B wire authority and survived the whole-wire proof.

```text
fixed Product operations = 116
canonical fixed Product wire = 116 ↔ 116
Identity & Access operations = 19
Project operations = 23
Brain operations = 11
Connections operations = 9
Observability & Audit operations = 5
ordinary Permissions = 25
Technical Ingress = 3 / Product impact 0
blocking authority/data findings = 0
```

Binding semantic split:

```text
W-03A People & access
→ inspect current authorization subjects
→ mutate exact current membership / grant facts
→ workspace.access.manage

W-03B Audit
→ investigate immutable historical Evidence
→ audit.read

current access administration != immutable audit investigation
```

They remain adjacent Workspace governance destinations, but they do not share a semantic owner, lifecycle or mutation model. P7 therefore rejects a generic `Admin Center`, generic RBAC model or one shared access/audit state machine.

## 2. Human jobs and target invariants

### 2.1 W-03A — People & access

A Workspace administrator must be able to answer, without reading opaque IDs or reconstructing authority in the browser:

```text
Who is this person?
Is this person a Workspace member?
Which Areas are they in?
Which Projects do they access directly?
Which Projects are effective through Areas?
When one Project has multiple access sources, what are all of them?
What exact current membership/grant am I about to add or remove?
```

Target invariant:

> Access administration is organized around human-recognizable current subjects (People and Areas), while effective Project access and its complete source set remain server-derived I&A truth.

### 2.2 W-03B — Audit

An auditor/investigator must be able to answer:

```text
What happened in this period?
Who acted?
What kind of audited action/fact am I looking for?
Which immutable record is relevant?
What human actor/subject labels were true at append time?
What exact immutable detail/Evidence supports this record?
```

Target invariant:

> Audit investigation searches the server-disclosable immutable record set before pagination and preserves append-time human presentation; the browser page and current resource names never become historical authority.

## 3. Structural hypotheses compared

| Hypothesis | Structure | Strengths | Material failure |
| --- | --- | --- | --- |
| **A — subject-first access + filtered immutable Audit** | `People & access` has People and Areas collections; selecting one subject opens contextual current-access detail. `Audit` stays a sibling filtered immutable collection with contextual exact-record detail. | Human recognition first; preserves current subject context; makes DIRECT/AREA provenance legible; responsive; aligns exact owners; keeps audit read-only and searchable. | None against current accepted authority. **LEADING CANDIDATE.** |
| **B — access-matrix first** | Workspace members × Projects as the primary grid, with Area-derived access mixed into cells. | Dense comparison for small simple workspaces. | Flattens multi-source `DIRECT` + `AREA` truth, makes Areas secondary, becomes horizontally dense, degrades responsive/accessibility behavior, and tempts frontend effective-access derivation. **REJECTED.** |
| **C — operation/task-page first** | Separate pages for Workspace membership, Area membership, direct Project grants, Area Project grants and Audit detail. | Closely mirrors backend operation families. | Backend-shaped UX; repeated enter → task → return loops; weak person/Area context; high navigation cost; repeats the interaction failure already falsified in W-02B. **REJECTED.** |

A fourth composition was considered and rejected at the W-03 root: one generic Governance page with People/access and Audit as interchangeable tabs. Adjacency is useful, but current authority and immutable history have materially different Permission, truth, recovery and write properties. They remain sibling destinations under `ADMINISTRATION / INVESTIGATION` rather than one generic owner.

## 4. Leading candidate A — W-03A People & access

### 4.1 Route-level structure

```text
People & access
├── People
│   └── current Workspace members
│       → select person
│       → contextual person-access panel
│
└── Areas
    └── current Workspace Areas
        → select Area
        → contextual Area-access panel
```

`People` and `Areas` are human subject views inside one coherent access-administration job. They are not new Product domains and do not map one-to-one to backend endpoints.

### 4.2 People collection

Primary truth:

```text
IAM-04 ListWorkspaceMembers
→ AccountSummary
→ accountId + displayName + email?
```

Collection behavior at P7:

- primary recognition uses `displayName`; optional email disambiguates people;
- stable `accountId` remains technical identity, not the dominant label;
- local find/filter may operate only over the complete already-disclosed IAM-04 response; no server member-search endpoint is invented;
- no server-side sort contract exists, so P7 does not promise authoritative alphabetical/activity ordering.

#### Add member

```text
Add member
→ IAM-18 ListWorkspaceMembershipCandidates(query?, pageToken?)
→ AccountSummaryPage
→ choose exact Account
→ IAM-05 AddWorkspaceMember
→ refresh current member/access truth
```

IAM-18 is server-side candidate disclosure, not direct Keycloak directory access. Candidate inclusion does not establish membership. The UI may search/paginate this candidate set because the wire explicitly supports `query` and `pageToken`.

### 4.3 contextual person-access panel

Selecting a current person keeps the People collection as the surrounding browse context and opens one focused current-access surface:

```text
IAM-19 GetWorkspaceMemberAccess
→ WorkspaceMemberAccess
   → account: AccountSummary
   → areas: AreaSummary[]
   → directProjects: ProjectSummary[]
   → effectiveProjects:
      ProjectSummary
      + complete sources[]
        → DIRECT
        → AREA + exact AreaSummary
```

Human presentation:

```text
Person
→ displayName + email?

Area membership
→ AreaSummary.name

Direct Project access
→ ProjectSummary.name

Effective Project access
→ ProjectSummary.name
→ source labels remain explicit text:
   Direct
   Area · <Area.name>
→ multiple DIRECT/AREA sources remain visible rather than collapsed
```

Material writes remain exact current-authority operations:

```text
Workspace membership removal → IAM-06
Direct Project grant          → IAM-07
Direct Project revoke         → IAM-08
Area membership add           → IAM-09
Area membership remove        → IAM-10
```

When a person needs a new direct Project grant, the candidate Project set comes from the existing `PRJ-01 ListProjects` `ProjectSummary` disclosure admitted for `workspace.access.manage`; it grants no Project content authority. Available Areas come from `WS-04 ListAreas` `AreaSummary` disclosure admitted for access administration.

Protected rule:

```text
frontend effective-access derivation = FORBIDDEN
```

The panel may explain I&A-owned effective truth but never recompute authorization from direct grants + Area membership locally. Removing a DIRECT source does not let the UI claim access is gone when an AREA source remains.

### 4.4 Areas collection

Primary truth:

```text
WS-04 ListAreas
→ AreaSummary[]
→ areaId + name
```

Create flow:

```text
Create Area
→ explicit nonblank name
→ WS-05 CreateArea
→ AreaSummary
```

No rename/settings symmetry is inferred; `WS-06 UpdateArea` remains absent.

### 4.5 contextual Area-access panel

Selecting an Area preserves the Areas collection as surrounding context:

```text
IAM-20 GetAreaAccess
→ AreaAccess
   → area: AreaSummary
   → members: AccountSummary[]
   → projects: ProjectSummary[]
```

Material writes:

```text
add member to Area           → IAM-09
remove member from Area      → IAM-10
grant Area Project access    → IAM-11
revoke Area Project access   → IAM-12
```

Candidate people for Area membership come from already disclosed Workspace members (`IAM-04`), not a foreign/global directory. Candidate Projects use the narrow access-administration `PRJ-01` summary disclosure.

## 5. Leading candidate A — W-03B Audit

### 5.1 Dedicated Audit destination

Audit remains a sibling Workspace governance/investigation destination, not a mode inside People/access.

```text
Audit
→ investigation filters
→ server-filtered immutable result collection
→ select exact record
→ contextual Audit detail
→ close detail and preserve the filtered collection context
```

### 5.2 Server-side investigation filters

`OBS-04 ListAuditRecords` owns:

```text
from?
to?
actorQuery?
actionQuery?
projectId?
pageToken?
```

Binding behavior:

```text
server-side filters before pagination
browser page != audit search universe
```

P7 prioritizes human filters that are directly expressible without inventing identity authority:

- period (`from` / `to`);
- actor free-text (`actorQuery`) over immutable presentation/reference as defined by OBS;
- action free-text (`actionQuery`);
- exact Project scope when the Audit surface is entered from an already-known exact Project context.

The wire also admits `projectId` at Workspace scope, but current `audit.read` alone does not provide a new Workspace-wide Project-name directory. P7 therefore does **not** invent an audit-only Project picker. A future requirement for cross-Project human-name selection under audit-only authority must reopen that exact disclosure question. This is non-blocking because Workspace Audit remains fully investigable by period/actor/action and Project-context entry can supply exact Project scope without browser inference.

Applied filter state is a candidate for `URL_NAVIGATION` at P9 because investigation re-entry/back-forward is materially useful; `pageToken` remains opaque continuation for the same server-filtered query and never becomes semantic authority.

### 5.3 Audit result collection

Each result uses server-owned immutable truth:

```text
AuditRecordSummary
→ auditRecordId
→ occurredAt
→ summary
→ actor: AuditSubjectSnapshotRef(kind, ref, label)
→ action
→ subject: AuditSubjectSnapshotRef(kind, ref, label)
→ projectId? when Project-scoped
```

The primary scan model is a record list/table on wider layouts and a stacked record list on narrow layouts. It should expose time, human summary, actor label, action and subject label without forcing users to parse IDs. `kind/ref` remain inspectable technical/provenance coordinates when needed, not the dominant presentation.

Protected rule:

```text
current resource lookup as historical Audit label authority = FORBIDDEN
```

`AuditSubjectSnapshotRef.label` is append-time Evidence. The browser never replaces it with a current Account/Area/Project/Connection name.

### 5.4 contextual Audit detail

Selecting one result opens exact `OBS-05 GetAuditRecord` detail while preserving the filtered collection context.

Detail includes:

```text
immutable identity + occurredAt
human summary
actor kind/ref/append-time label
action
subject kind/ref/append-time label
projectId? where present
evidenceRefs
```

There is no edit, retry, undo, authorization mutation or “fix record” control. Audit detail is immutable Evidence inspection only.

## 6. P7 authority/data feasibility matrix

| Requirement | Current authority | Result |
| --- | --- | --- |
| human Workspace member recognition | `IAM-04` → `AccountSummary` | PRESENT-IN-AUTHORITY |
| member candidate human lookup | `IAM-18` → `AccountSummaryPage`, `query`, `pageToken` | PRESENT-IN-AUTHORITY |
| exact person current access | `IAM-19` → `WorkspaceMemberAccess` | PRESENT-IN-AUTHORITY |
| complete effective access-source set | `EffectiveProjectAccess.sources[]` → `DIRECT | AREA + AreaSummary` | PRESENT-IN-AUTHORITY |
| human Area recognition/create | `WS-04`, `WS-05` → `AreaSummary` | PRESENT-IN-AUTHORITY |
| exact Area members + Projects | `IAM-20` → `AreaAccess` | PRESENT-IN-AUTHORITY |
| human Project summaries for access administration | `PRJ-01` narrow `workspace.access.manage` disclosure → `ProjectSummary` | PRESENT-IN-AUTHORITY |
| Workspace member writes | `IAM-05`, `IAM-06` | PRESENT-IN-AUTHORITY |
| direct Account→Project writes | `IAM-07`, `IAM-08` | PRESENT-IN-AUTHORITY |
| Area membership writes | `IAM-09`, `IAM-10` | PRESENT-IN-AUTHORITY |
| Area→Project writes | `IAM-11`, `IAM-12` | PRESENT-IN-AUTHORITY |
| audit period/actor/action/Project filters | `OBS-04` | PRESENT-IN-AUTHORITY |
| filter-before-pagination truth | `OBS-04` | PRESENT-IN-AUTHORITY |
| immutable human actor/subject identity | `AuditSubjectSnapshotRef` | PRESENT-IN-AUTHORITY |
| human audit summary | `AuditRecordSummary.summary` / `AuditRecord.summary` | PRESENT-IN-AUTHORITY |
| exact immutable record detail + Evidence | `OBS-05` + `evidenceRefs` | PRESENT-IN-AUTHORITY |

No material P7 interaction requires a new operation, Permission, semantic owner, durable record class or parallel frontend DTO.

## 7. Scale / sort / filter assumptions

Current wire is intentionally asymmetric rather than normalized by frontend convenience:

```text
IAM-18 membership candidates = server query + pagination
OBS-04 Audit                  = server filters + pagination

IAM-04 Workspace members      = current full disclosed list; no pagination contract
WS-04 Areas                   = current full disclosed list; no pagination contract
PRJ-01 Project summaries      = current full disclosed list; no pagination contract
IAM-19 / IAM-20 exact detail  = bounded exact-subject arrays; no pagination contract
```

Therefore:

- P8 may locally find/filter only within already-disclosed complete non-paginated collections;
- it may not pretend that local filtering searches an undisclosed server universe;
- no authoritative sort order is invented where the wire has none;
- if real F1 Workspace member/Area/Project/detail sizes make those complete reads unusable, reopen only the exact list-scale question rather than adding pagination by symmetry.

This is a non-blocking F1 scale assumption, to be attacked again at P12.

## 8. Context preservation, responsive and accessibility obligations

Context-preserving law inherited from the W-02B interaction finding where applicable:

```text
routine work on one current subject
→ keep the collection mental context
→ open focused contextual detail
→ perform bounded subject-specific work
→ return to the unchanged collection context
```

This is an interaction pattern candidate, not a shared component/API decision.

Responsive expectation for P8 later:

```text
wide viewport
→ collection + contextual side panel where useful

narrow viewport
→ collection remains the entry model
→ contextual panel may become a full-height sheet/focused view
→ closing returns to the same People / Areas / Audit context
```

Accessibility obligations:

- Account/Area/Project/Audit labels are text, not color-only identity;
- `DIRECT` versus `AREA` source meaning must have explicit text, not only badges/colors;
- collections and record details require semantic list/table/heading structure;
- panel/sheet focus entry, close, return-focus and keyboard order must be operable;
- destructive/narrowing actions must be distinguishable from ordinary reads/adds without relying on color;
- Audit filters need explicit labels and error association for invalid periods.

## 9. Client-state boundary candidate

P7 does not choose a frontend library. The honest state classes are:

```text
SERVER
→ members, candidate Accounts, member access, Areas, Area access, Project summaries
→ Audit result page + exact record

URL_NAVIGATION candidate
→ People vs Areas local route/subview where re-entry is useful
→ exact selected person / Area / Audit record where deep re-entry is material
→ applied Audit filter set

FORM_DRAFT
→ membership candidate query
→ Area creation name
→ exact grant/revoke/add/remove confirmation/input where needed
→ Audit filter draft before apply

EPHEMERAL_UI
→ local filtering of complete already-disclosed collections
→ panel/sheet open-close state when not represented by exact navigation
→ expanded technical/provenance detail
```

No fifth state class and no browser-owned authorization cache is admitted.

## 10. Explicit non-authority

```text
frontend effective-access derivation = FORBIDDEN
current resource lookup as historical Audit label authority = FORBIDDEN
Keycloak directory/roles/groups/orgs as Conexus authority = FORBIDDEN
generic RBAC / custom-role editor = NOT ADMITTED
screen-shaped GetAccessDashboard = NOT ADMITTED
grant-record CRUD domain = NOT ADMITTED
WS-06 UpdateArea resurrection = FORBIDDEN
Audit mutation / retry / undo = NOT ADMITTED
browser-local Audit page filtering as whole-search = FORBIDDEN
new SearchAudit operation = NOT ADMITTED
```

## 11. P7 proof chronology

```text
F11/F12 selected-realization RED
→ expected failure before 4A/4B recompilation

Verify #737 = SUCCESS
→ repository + canonical Product wire + Technical Ingress + generated projection/Kubb + Budget + whole-4B adversarial proof GREEN
→ current Product wire = 116 ↔ 116

Verify #738 = EXPECTED P7 RED
→ 87 repository tests / 86 pass / exactly 1 expected failure
→ missing w03-structural-hypotheses.md only
→ previously green authority/wire remained unaffected
```

## 12. Operator gate

Current P7 disposition:

```text
Hypothesis A = LEADING CANDIDATE
Hypothesis B = REJECTED
Hypothesis C = REJECTED
W-03 = NOT LOCKED
P8 = BLOCKED pending operator structural adjudication
```

Exact next decision is **APPROVE | REVISE** this P7 structure. Approval here would authorize creation of the W-03 functional low-fidelity P8 candidate; it would still **not** itself LOCK W-03. Only an explicit later operator decision after operating the exact P8 HTML may LOCK the block.

No P8 HTML, P9, P10, P11, 4D, merge or Product implementation is authorized by this record.
