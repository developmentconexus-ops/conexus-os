# 4C W-03 — People/access + audit authority-feasibility preflight

> **Status:** `W-03 OPEN / P6 COMPLETE / P7 AUTHORITY FINDINGS ACCEPTED / P8 BLOCKED`
> **Split:** `W-03A — People & access` + `W-03B — Audit`
> **Method:** Frontend Product Experience Planning Method v2.2 + DevelopmentConexus Engineering Method.
> **Implementation authority:** none.

## 1. Why W-03 splits

```text
W-03A People & access
= inspect + mutate current authorization facts
= workspace.access.manage

W-03B Audit
= investigate immutable historical Evidence
= audit.read
```

The two jobs share governance context but not semantic owner behavior. They must not be collapsed into one generic administration owner or screen-shaped backend.

## 2. P6 reference result

Mature access-management products make people human-recognizable, make group-derived versus direct access understandable, and let administrators inspect current access before changing it. Mature audit products provide server-side investigation filters over the audited set and immutable detail rather than filtering only a browser page.

References are Evidence only; Conexus Product authority remains repository-owned.

## 3. P7 authority findings

### F11 — human-reviewable access administration

Current writes exist for Workspace membership, Area membership, direct Account→Project grants and Area→Project grants, but current read/presentation authority is insufficient for a human to review the exact subject and current effective access safely.

Material defects:

```text
IAM-04 member presentation = opaque accountId only
WS-04 Area presentation = opaque areaId only
WS-05 cannot establish Area human identity
no human candidate lookup for IAM-05
no exact current member-access projection with access sources
no exact Area access projection with members + Project grants
```

### F12 — human-investigable immutable Audit

`OBS-04/05` own the correct immutable audit surface, but current list filtering and presentation are insufficient for honest investigation:

```text
OBS-04 filters = projectId? + pageToken? only
browser-local filtering -X-> whole audit search
actor/subject kind+ref alone = machine-readable, not human-reviewable
current resource names -X-> historical presentation rewrite
```

## 4. Operator-approved Global-Maximum direction

```text
F11
→ preserve I&A / Workspace / Project owners
→ Account human presentation on iam.account
→ Area.name on Workspace Area
→ add only three real I&A reads: IAM-18 / IAM-19 / IAM-20
→ I&A derives effective Project access + exact DIRECT|AREA sources
→ narrow access-administration disclosure on existing WS-04 / PRJ-01
→ no generic RBAC, no Keycloak authorization mirror, no grant CRUD API

F12
→ preserve OBS owner and OBS-04/05
→ server-side period/actor/action/Project filtering before pagination
→ immutable audit actor/subject presentation snapshots
→ deterministic human-readable audit summary
→ no new Audit operation/domain/Permission/record
```

Selected target topology after F11/F12:

```text
fixed Product operations = 116
IAM operations = 19
ordinary Permissions = 25
durable record classes = 46
semantic owners = 13
Project operations = 23
Brain operations = 11
Connections operations = 9
```

## 5. Gate

The operator approved F11 and F12 for bounded 4A→4B recompilation.

```text
selected-realization RED
→ bounded 4A semantic recompile
→ bounded 4B OAS/checker recompile
→ whole-wire GREEN
→ W-03 P7 recompile
→ operator structural adjudication
→ P8 only later
```

No W-03 P8 HTML may be created until F11/F12 are GREEN and P7 has been recompiled. W-04/P-01+, P11, 4D, merge and Product implementation remain blocked.