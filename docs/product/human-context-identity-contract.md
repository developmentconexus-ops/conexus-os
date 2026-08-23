# Conexus OS — Human Context & Resource Presentation Identity Contract

> **Status:** CURRENT / `4C-F01` + `4C-F04` + `4C-F11` OPERATOR ACCEPTED / BOUNDED 4A PROPERTY AUTHORITY
> **Scope:** human-readable presentation identity only for currently proven Workspace, Project, logical Connection, Account and Area consumers.
> **Operation impact:** `4C-F11` adds three I&A reads; `N_platform=116` after the bounded correction.
> **Implementation authority:** none.

This contract owns the smallest sustainable Product semantics needed for humans to recognize exact server-owned resources and people without turning presentation labels into machine identity, routing, authorization, containment or generic metadata authority.

`4C-F01` admitted this property class for Workspace and Project. `4C-F04` proved the same essential property for logical Connection. `4C-F11` now proves that access administration cannot be safe or human-reviewable while Accounts and Areas are exposed only through opaque IDs. The Global-Maximum assessment confirms the existing `iam.account` and Workspace Area owners rather than creating a Person/UserProfile domain, mirroring Keycloak authorization, or inventing frontend identity heuristics.

## 1. Falsifiers

### Workspace / Project — `4C-F01`

Opaque identifiers alone are not sufficient human presentation identity for entering or switching Workspace/Project context.

### Logical Connection — `4C-F04`

```text
human chooses one logical Connection
+ repeated same-provider instances are valid
+ provider/configuration/secret cannot be universal identity
→ logical Connection must expose provider-independent human presentation identity
```

### Account / Area — `4C-F11`

```text
human administrator chooses/reviews another Account
+ Workspace membership and Project grants use stable accountId
+ authentication provider attributes are not Conexus authorization authority
→ iam.account must expose server-owned human presentation
```

and:

```text
Area membership / Area→Project grants are real current authority
+ an administrator must understand which Area is being changed
→ Workspace Area must expose human presentation identity
```

## 2. Accepted bounded semantics

The operator accepts these presentation properties:

```text
Workspace.name
Project.name
Connection.name
Account.displayName
Account.email?
Area.name
```

Shared resource-name law for Workspace, Project, Connection and Area:

- required human-readable presentation identity;
- non-blank string;
- server-owned and returned only when the underlying subject is currently disclosable;
- independent from stable opaque machine identity;
- never authorization, containment, routing, slug or uniqueness authority;
- immutable after creation in F1 because no current rename consumer is admitted.

Account-specific law:

```text
accountId = stable Conexus machine identity
(issuer, subject) = verified authentication mapping
Account.displayName = required nonblank human presentation
Account.email = optional human presentation/contact data

displayName != authorization
email != authorization
email != stable identity
Area.name != authorization
Keycloak role/group/organization != Conexus authorization
```

The I&A owner may retain the accepted verified external identity mapping while storing the bounded Account presentation needed by Conexus Product consumers. Keycloak remains authentication provider, not a second authorization/presentation owner consulted directly by the browser.

Resource-specific machine identities remain authoritative:

```text
Workspace.name      != workspaceId
Project.name        != projectId
Connection.name     != connectionId
Area.name           != areaId
Account.displayName != accountId
```

For Connection specifically:

```text
Connection.name = stable across ConnectionRevision changes
```

The revision does not re-own or derive it.

## 3. Creation / provisioning

```text
WS-01 CreateWorkspace
→ requires name
→ returns workspaceId + name

PRJ-03 CreateProject
→ requires name
→ returns Project representation including name

PRJ-06 DuplicateProject
→ requires destinationWorkspaceId + explicit destination name

CON-05 CreateConnection
→ requires explicit name
→ returns canonical Connection including name

IAM-03 ProvisionAccount
→ requires externalSubject + displayName
→ accepts optional email
→ returns canonical AccountSummary
→ caller cannot select issuer/provider authority

WS-05 CreateArea
→ requires explicit nonblank name
→ returns AreaSummary
```

`IAM-03` presentation input does not replace the stable external identity key and does not create profile-update authority. Area naming does not resurrect generic `WS-06 UpdateArea`.

## 4. Required read projection

Workspace / Project:

```text
IAM-01 GetControlPlaneAccessContext
  workspaces[] → workspaceId + name
  projects[]   → projectId + workspaceId + name

WS-02 GetWorkspace
  → workspaceId + name

PRJ-01 ListProjects
  → ProjectSummary including name

PRJ-02 GetProject
  → ProjectRepresentation including name
```

Logical Connection:

```text
CON-03 ListConnections
CON-04 GetConnection
CON-05 CreateConnection
→ canonical Connection includes connectionId + name
```

Account / Area access administration:

```text
IAM-04 ListWorkspaceMembers
IAM-18 ListWorkspaceMembershipCandidates
IAM-19 GetWorkspaceMemberAccess
IAM-20 GetAreaAccess
→ AccountSummary = accountId + displayName + email?

WS-04 ListAreas
IAM-19 GetWorkspaceMemberAccess
IAM-20 GetAreaAccess
→ AreaSummary = areaId + name
```

Any response already defined in terms of the same canonical summary representation inherits that representation; this does not create parallel DTO authority.

## 5. Explicit non-authority

These presentation identities do **not** admit:

```text
WS-03 UpdateWorkspace
PRJ-04 UpdateProject
WS-06 UpdateArea
RenameWorkspace
RenameProject
RenameConnection
RenameArea
UpdateAccountProfile
UpdateConnectionMetadata
generic metadata/settings patch
name uniqueness semantics
name-derived routing
name-derived authorization
email-derived authorization
email as Account identity
slug/URL authority derived from name
frontend-owned ID→name registry
frontend direct Keycloak directory authority
Keycloak role/group/org as Conexus grant authority
repo name as Project Product identity
provider/configuration-derived fallback Connection identity
```

A future real rename/relabel/profile-sync consumer must reopen only that exact mutation semantic with current-state/concurrency obligations.

## 6. Preservation assertions

```text
N_platform                              = 116
N_budget                                = 2
IAM Product operations                  = 19
Connections Product operations          = 9
ordinary Permissions                    = 25
resurrected generic mutation operations = 0
new semantic owners                     = 0
new trust boundaries                    = 0
new durable record classes              = 0
Product implementation authority        = 0
```

The historical `4B-F01` finding remains correct for the authority that existed when it closed. `4C-F11` adds evidence-driven creation/read presentation and three real access-administration reads; it does not resurrect generic update APIs.

## 7. Global-Maximum disposition

For F11 the rejected alternatives were opaque IDs plus UI heuristics, frontend/Keycloak directory ownership, generic Person/UserProfile + RBAC, record-shaped grant CRUD, and one screen-shaped access dashboard.

Accepted outcome:

```text
CURRENT OWNERS CONFIRMED
→ human Account presentation belongs to iam.account
→ human Area presentation belongs to Workspace Area
→ AccountSummary / AreaSummary are bounded server-owned read projections
→ access composition remains I&A authority
→ no generic profile/role/group domain
```

## 8. Recompile obligation

```text
Account / Area presentation identity
→ IAM-03 / IAM-04 / IAM-18..20 / WS-04 / WS-05
→ canonical 4B Identity/Workspace wire
→ generated frontend/server projections
→ W-03A human recognition + access review
```

Repository proof must preserve no generic mutation resurrection, Keycloak authentication-provider separation, exact current access authority at I&A, and Product implementation blockade.