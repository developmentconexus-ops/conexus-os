# 4C W-03 — People/access + Audit structural decision

> **Current status:** `P7 OPERATOR APPROVED FOR FUNCTIONAL P8 / P8 CANDIDATE / OPERATOR WALKTHROUGH / NOT LOCKED`
> **Block:** `W-03 — People/access + audit`, split into `W-03A — People & access` and `W-03B — Audit`.
> **Selected hypothesis:** `A — subject-first access + filtered immutable Audit`.
> **Authority posture:** interaction Evidence only; no Product implementation, P8 LOCK, P9/P10, final visual design or 4D authority.

Historical pre-approval marker preserved for proof chronology: `P7 CANDIDATE / OPERATOR ADJUDICATION / P8 BLOCKED / NOT LOCKED`.

## 1. Recompiled authority

F11/F12 are GREEN in the accepted backend/wire authority that this P8 consumes:

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

Binding split:

```text
W-03A People & access
→ current authorization subjects and exact membership/grant writes
→ workspace.access.manage

W-03B Audit
→ immutable historical Evidence investigation
→ audit.read

current access administration != immutable audit investigation
```

No generic Admin Center, generic RBAC owner or shared access/audit lifecycle is admitted.

## 2. Selected structure and rejected roots

### A — subject-first access + filtered immutable Audit — OPERATOR APPROVED FOR P8

```text
People & access
├── People collection
│   → contextual person-access panel
└── Areas collection
    → contextual Area-access panel

Audit
→ server-side filters before pagination
→ immutable result collection
→ contextual Audit detail
→ preserve the filtered collection context
```

This structure keeps human subjects primary, preserves collection context during routine work, makes multiple `DIRECT` / `AREA` sources legible, and keeps immutable investigation separate from current authorization changes.

### B — access-matrix first — REJECTED

A primary member × Project grid flattens multi-source `DIRECT` + `AREA` truth, makes Areas secondary, scales poorly on narrow viewports and encourages frontend authorization reconstruction.

### C — operation/task-page first — REJECTED

Separate pages for membership and grant operation families mirror backend topology, create repeated enter → task → return loops and weaken person/Area context.

## 3. W-03A — People & access

### 3.1 People collection

```text
IAM-04 ListWorkspaceMembers
→ AccountSummary
→ accountId + displayName + email?
```

`displayName` is primary recognition; optional email disambiguates. `accountId` remains stable technical identity. Local find may narrow only the complete already-disclosed list.

Add-member flow:

```text
Add member
→ IAM-18 ListWorkspaceMembershipCandidates(query?, pageToken?)
→ AccountSummary page
→ exact Account selection
→ IAM-05 AddWorkspaceMember
→ refresh current server truth
```

### 3.2 contextual person-access panel

```text
IAM-19 GetWorkspaceMemberAccess
→ WorkspaceMemberAccess
→ AccountSummary
→ AreaSummary[]
→ direct ProjectSummary[]
→ effective ProjectSummary[] + complete sources[]
   → DIRECT
   → AREA + exact AreaSummary
```

The panel shows every contributing source. Removing a direct source cannot imply loss of effective access when an Area source remains.

Binding law:

```text
frontend effective-access derivation = FORBIDDEN
```

Exact writes stay with existing owners:

```text
IAM-06 remove Workspace member
IAM-07 / IAM-08 direct Account→Project grant/revoke
IAM-09 / IAM-10 Area membership add/remove
WS-04 ListAreas → AreaSummary
PRJ-01 ListProjects → narrow ProjectSummary access-administration disclosure
```

### 3.3 Areas collection + contextual Area-access panel

```text
WS-04 ListAreas → AreaSummary[]
WS-05 CreateArea(name) → AreaSummary
IAM-20 GetAreaAccess → AreaAccess
→ AreaSummary
→ AccountSummary[] members
→ ProjectSummary[] granted Projects
```

Exact Area writes:

```text
IAM-09 / IAM-10 member add/remove
IAM-11 / IAM-12 Area→Project grant/revoke
```

`WS-06 UpdateArea` remains absent; P8 does not invent rename/settings symmetry.

## 4. W-03B — Audit

Audit is a sibling investigation destination, not a mode inside People & access.

```text
OBS-04 ListAuditRecords
→ from? / to? / actorQuery? / actionQuery? / projectId? / pageToken?
→ server-side filters before pagination
→ browser page != audit search universe
```

At Workspace scope, P8 exposes period/actor/action. It does not invent an audit-only human Project picker under `audit.read`; exact `projectId` may come from an already-known Project context.

Result truth:

```text
AuditRecordSummary
→ occurredAt
→ human summary
→ actor: AuditSubjectSnapshotRef(kind, ref, label)
→ action
→ subject: AuditSubjectSnapshotRef(kind, ref, label)
→ projectId? when present
```

Binding historical law:

```text
current resource lookup as historical Audit label authority = FORBIDDEN
```

`AuditSubjectSnapshotRef.label` is append-time presentation Evidence. Technical `kind/ref` remain available without replacing human labels.

Exact detail:

```text
OBS-05 GetAuditRecord
→ contextual Audit detail
→ immutable actor/subject snapshots
→ action + occurredAt + summary
→ evidenceRefs
→ preserve the filtered collection context
```

No edit, retry, undo, repair or authorization mutation is admitted in Audit detail.

## 5. Scale and client-state boundaries

Current asymmetric wire is preserved rather than normalized by UI convenience:

```text
IAM-18 candidates = server query + pagination
OBS-04 Audit      = server filters + pagination
IAM-04 members    = complete disclosed list; no pagination contract
WS-04 Areas       = complete disclosed list; no pagination contract
PRJ-01 summaries  = complete disclosed list; no pagination contract
IAM-19 / IAM-20   = exact-subject arrays; no pagination contract
```

Client state remains:

```text
SERVER
URL_NAVIGATION candidate
FORM_DRAFT
EPHEMERAL_UI
```

No fifth state class and no browser-owned authorization cache is admitted.

## 6. P8 functional obligations now proved by the candidate

The approved P7 authorized one combined functional HTML Evidence artifact:

`w03-people-access-audit-functional-wireframe.html`

It exercises with fixture state only:

- People ↔ Areas subject views;
- contextual person and Area access panels while collection context remains;
- `IAM-18` candidate search/pagination and `IAM-05` add-member flow;
- direct Project and Area membership/grant fixture writes without deriving effective access in the browser;
- explicit multi-source access (`Direct` + `Area · Tecnologia`);
- Audit period/actor/action filters, invalid-period recovery and pagination;
- immutable Audit record detail with append-time labels, technical refs and Evidence;
- responsive panel/sheet behavior, Escape close and focus return;
- no network request, browser persistence or external dependency.

P8 candidate verification: GREEN. This proves operability of the low-fi Evidence only, not backend runtime behavior.

## 7. Proof chronology

```text
Verify #737 = SUCCESS
→ F11/F12 bounded 4A→4B recompile / 116 ↔ 116 whole-wire GREEN

Verify #738 = EXPECTED P7 RED
→ missing P7 structural record only

Verify #739 = SUCCESS
→ P7 candidate GREEN
→ operator walkthrough of P7 structure = APPROVED

Verify #744 = EXPECTED P8 RED
→ 90 repository tests / 87 pass / exactly 3 expected failures
→ all three failures = functional P8 HTML absent

Verify #745 = SUCCESS
→ functional P8 candidate + repository/wire proof GREEN
```

## 8. Current operator gate

```text
Hypothesis A = OPERATOR APPROVED FOR FUNCTIONAL P8
Hypothesis B = REJECTED
Hypothesis C = REJECTED
W-03 = NOT LOCKED
P8 = CANDIDATE / OPERATOR WALKTHROUGH
```

Exact next decision is **APPROVE | REVISE the exact functional P8 after operating it**. Approval of this exact HTML may authorize W-03 LOCK/P9/P10; it does not happen automatically.

No P9, P10, W-04/P-01+, P11, 4D, merge or Product implementation is authorized by this record.
