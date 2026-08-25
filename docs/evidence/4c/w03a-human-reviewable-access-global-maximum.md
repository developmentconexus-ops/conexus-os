# 4C-F11 — Human-reviewable access administration Global Maximum

> **Status:** `GLOBAL MAXIMUM / OPERATOR ACCEPTED`
> **Block:** `W-03A — People & access`
> **Finding:** `w03a-human-reviewable-access-finding.md`

## Decision problem

Make current access safely human-reviewable without turning Keycloak, the browser, or grant-record CRUD into a second authorization owner.

## Credible alternatives

### A — show opaque IDs and let the UI label them
**REJECT.** Human recognition remains non-authoritative and brittle.

### B — query Keycloak directly from the frontend / reuse Keycloak groups and roles
**REJECT.** Keycloak remains authentication provider; Conexus I&A owns authorization.

### C — create a generic Person/UserProfile + RBAC/Role engine
**REJECT / OVERENGINEERING.** Duplicates `iam.account` and invents a policy system without a consumer.

### D — expose CRUD/list endpoints for every membership/grant record
**REJECT.** Durable-record existence is not Product CRUD authority and leaves effective access composition to consumers.

### E — one screen-shaped `GetAccessDashboard`
**REJECT.** Couples backend authority to one UI and merges unrelated read meanings.

### F — enrich current owners + three purpose-built I&A reads
**SELECTED GLOBAL MAXIMUM / OPERATOR ACCEPTED.**

```text
iam.account
→ required nonblank displayName
→ optional email
→ accountId remains stable machine identity
→ (issuer, subject) remains authentication mapping

ws.area
→ required nonblank name at creation
→ Area.name is presentation only

IAM-04
→ human AccountSummary[]

IAM-18 ListWorkspaceMembershipCandidates
→ disclosable existing AccountSummary candidates for exact Workspace membership administration

IAM-19 GetWorkspaceMemberAccess
→ exact AccountSummary
→ AreaSummary[] memberships
→ direct ProjectSummary[] grants
→ effective Project access derived by I&A
→ exact source set: DIRECT and/or AREA with Area identity

IAM-20 GetAreaAccess
→ exact AreaSummary
→ current AccountSummary[] members
→ current ProjectSummary[] grants

WS-04 ListAreas
→ AreaSummary[]
→ admitted under normal workspace.manage OR narrow workspace.access.manage administration disclosure

WS-05 CreateArea
→ required name

PRJ-01 ListProjects
→ existing ProjectSummary shape
→ normal project.read OR narrow exact-Workspace workspace.access.manage summary disclosure
```

## Protected laws

```text
displayName != authorization
email != authorization
email != stable identity
Area.name != authorization
access-admin Project summary != Project content access
Keycloak group/role/org != Conexus authorization
browser-local join != effective access authority
```

No Account profile mutation, Area rename, generic role editor, generic group domain, or per-record CRUD family is admitted.

## Topology result

```text
N_platform = 116
IAM = 19
Permissions = 25
records = 46
owners = 13
Project = 23
Brain = 11
Connections = 9
```

The operation count grows because three independent current human reads are now proven. Counts remain derivation results, never targets.