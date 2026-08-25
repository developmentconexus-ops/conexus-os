# 4C-F11 — Human-reviewable access administration finding

> **Status:** `F11 = OPEN / MATERIAL W-03A P7 FINDING`
> **Block:** `W-03A — People & access`
> **Authority posture:** finding only; no Product implementation authority.

## Human job

An authorized Workspace access administrator must be able to answer before changing authority:

```text
Who is this person?
Which Areas are they in?
Which Projects can they access now?
Why do they have each Project access: DIRECT, AREA, or both?
Who belongs to this Area and which Projects does it grant?
Which existing Account am I adding to the Workspace?
```

## Current authority and root cause

The existing owners and durable records are correct:

```text
iam.account
iam.workspace_membership
iam.area_membership
iam.area_project_grant
iam.account_project_grant
ws.area
prj.project
```

Current write operations `IAM-05..12` already own membership/grant changes. The defect is missing human/current-state read semantics around those owners, not a missing RBAC domain.

Current wire exposes opaque presentation:

```text
IAM-04 ListWorkspaceMembers → accountId only
WS-04 ListAreas → areaId only
WS-05 CreateArea → no human name
IAM-05 AddWorkspaceMember → exact accountId with no human candidate lookup
```

The browser also cannot truthfully derive effective Project access by joining hidden/partial grant state.

## Target invariant

```text
human-recognizable Account / Area subjects
+ exact current membership/grant facts
+ I&A-owned effective Project access projection
+ exact access-source explanation DIRECT | AREA
→ administrator can inspect before mutating
```

while:

```text
presentation identity -X-> authorization
Keycloak group/role/org -X-> Conexus grant authority
browser-local joins -X-> effective authorization authority
record existence -X-> CRUD-by-symmetry API
```

## Reopen scope

Reopen only:

```text
4A I&A / Workspace human presentation + access read semantics
4B Identity/Workspace + bounded Project summary disclosure wire
W-03A P7
```

Do not reopen owner topology, 46-record inventory, Keycloak authentication selection, generic roles, Product implementation, 4D or unrelated locked blocks.