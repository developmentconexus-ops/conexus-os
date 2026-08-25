# 4C-F11 — Human-reviewable access administration selected realization

> **Status:** `OPERATOR ACCEPTED / SELECTED REALIZATION / RED REQUIRED`
> **Block:** `W-03A — People & access`
> **Selected alternative:** `F — enrich current owners + three purpose-built I&A reads`.
> **Authority posture:** bounded 4A→4B contract recompile only; no Product implementation authority.

## Selected semantic realization

```text
Account presentation
→ displayName required/nonblank
→ email optional
→ AccountSummary = accountId + displayName + email?

Area presentation
→ Area.name required/nonblank at WS-05 creation
→ AreaSummary = areaId + name

IAM-18 ListWorkspaceMembershipCandidates
IAM-19 GetWorkspaceMemberAccess
IAM-20 GetAreaAccess
```

`IAM-19` must expose server-derived current effective Project access with exact source set. A source is either:

```text
DIRECT
AREA + exact AreaSummary
```

Multiple sources for one Project are allowed and must remain visible; the browser never computes effective authority from local joins.

Existing `WS-04 ListAreas` and `PRJ-01 ListProjects` gain only the narrow access-administration summary disclosure required by `workspace.access.manage`; this does not confer Workspace structure mutation or Project content authority.

## Required preservation

```text
N_platform 113 → 116
IAM 16 → 19
Permissions = 25
records = 46
owners = 13
Project = 23
Brain = 11
Connections = 9
```

Forbidden:

```text
Keycloak group/role/org as Conexus authority
generic Person/UserProfile owner
generic RBAC/custom-role engine
UpdateAccountProfile
RenameArea / WS-06 resurrection
frontend effective-access derivation
screen-shaped GetAccessDashboard
CRUD endpoint per grant record
```

## Proof sequence

```text
selected-realization test
→ EXPECTED RED against current 113-operation authority/wire
→ bounded 4A recompile
→ bounded 4B Identity/Workspace + Project-summary recompile
→ owner checker + whole-wire GREEN
→ W-03 P7 recompile
```

This selection does not authorize W-03 P8.