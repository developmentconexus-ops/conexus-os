# Conexus OS — Human Context & Resource Presentation Identity Contract

> **Status:** CURRENT / `4C-F01` + `4C-F04` + `4C-F11` + `4C-F13` OPERATOR ACCEPTED / BOUNDED 4A PROPERTY AUTHORITY
> **Scope:** human-readable presentation identity only for currently proven Workspace, Project, logical Connection, Account, Area and Product Agent consumers.
> **Operation impact:** `4C-F11` adds three I&A reads; `4C-F13` changes zero operation/Permission counts; `N_platform=116`.
> **Implementation authority:** none.

This contract owns the smallest sustainable Product semantics needed for humans to recognize exact server-owned resources and people without turning presentation labels into machine identity, routing, authorization, containment or generic metadata authority.

`4C-F01` admitted this property class for Workspace and Project. `4C-F04` proved the same essential property for logical Connection. `4C-F11` proves that access administration cannot be safe or human-reviewable while Accounts and Areas are exposed only through opaque IDs. `4C-F13` now proves that the Workspace Agent catalog cannot be human-reviewable while Project-owned Product Agents and their owning Projects are projected only through opaque Agent/Project/revision/Release coordinates. The Global-Maximum assessments preserve the existing semantic owners rather than creating presentation owners, frontend label registries, generic metadata domains or fleet authority.

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

### Product Agent / Workspace Agent catalog — `4C-F13`

```text
human finds one Product Agent across several Projects
+ Product Agents remain Project-owned and git-first
+ agentId / revision / Release refs are machine coordinates
+ PRJ-22 is an access-filtered projection, not a Workspace Agent owner
→ ProjectProductAgent must expose human Agent presentation
→ WorkspaceProductAgentCatalogItem must expose canonical human Project context
```

The Product already defines `purpose` as authored `agent/v1` meaning. F13 does not invent a second description field; it makes the existing semantic purpose available in the canonical human-facing Agent projection.

## 2. Accepted bounded semantics

The operator accepts these presentation properties:

```text
Workspace.name
Project.name
Connection.name
Account.displayName
Account.email?
Area.name
ProductAgent.name
ProductAgent.purpose
```

Shared creation-owned resource-name law for Workspace, Project, Connection and Area:

- required human-readable presentation identity;
- non-blank string;
- server-owned and returned only when the underlying subject is currently disclosable;
- independent from stable opaque machine identity;
- never authorization, containment, routing, slug or uniqueness authority;
- immutable after creation in F1 because no current direct rename consumer is admitted.

Product Agent-specific law differs because the Agent is an authored revisioned Product resource:

```text
agentId = stable Product Agent machine identity
ProductAgent.name = required nonblank human presentation in the exact authored agent/v1 revision
ProductAgent.purpose = required nonblank authored semantic purpose already admitted by the Product contract

agentId != ProductAgent.name
ProductAgent.name != authorization
ProductAgent.purpose != authorization
name-derived authorization = FORBIDDEN
name-derived routing = FORBIDDEN
```

`ProductAgent.name` and `ProductAgent.purpose` may evolve only through the accepted Builder/Change → candidate/diff/proof → immutable `agent/v1` artifact revision → Release path. F13 admits no direct metadata mutation channel.

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
ProductAgent.name   != agentId
```

For Connection specifically:

```text
Connection.name = stable across ConnectionRevision changes
```

The revision does not re-own or derive it.

For Product Agent specifically:

```text
ProductAgent.name + ProductAgent.purpose
→ exact authored Agent projection
→ not PAR runtime state
→ not Release/serving health
→ not Workspace fleet identity
```

## 3. Creation / provisioning / authored evolution

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

Product Agent authoring
→ Builder/Change edits canonical agent/v1
→ exact authored revision includes name + purpose
→ PRJ-20/21 project projections expose exact authored name + purpose
→ no direct Product Agent metadata command
```

`IAM-03` presentation input does not replace the stable external identity key and does not create profile-update authority. Area naming does not resurrect generic `WS-06 UpdateArea`. Product Agent presentation does not create a parallel `RenameProductAgent` or `UpdateProductAgentMetadata` path outside Builder/Change.

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

Product Agent / Workspace catalog:

```text
PRJ-20 ListProjectProductAgents
PRJ-21 GetProjectProductAgent
→ ProjectProductAgent
→ agentId + name + purpose + authoredRevisionId + releaseRefs[] + activeReleaseId?

PRJ-22 ListWorkspaceProductAgents
→ WorkspaceProductAgentCatalogItem
→ same ProjectProductAgent projection
→ project: ProjectSummary
```

`PRJ-22` is self-contained for basic human recognition but remains only an access-filtered catalog under `project.read`. Its `ProjectSummary` inclusion does not grant Project source/build/data/manage authority, and catalog visibility does not confer the distinct `project.source.read` required by `PRJ-20/21`.

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
RenameProductAgent
UpdateAccountProfile
UpdateConnectionMetadata
UpdateProductAgentMetadata
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
frontend-derived Product Agent label/purpose
frontend PRJ-01 join as PRJ-22 recognition authority
Workspace Agent/fleet owner
activeReleaseId-derived runtime health
```

A future real direct rename/relabel/profile-sync consumer must reopen only that exact mutation semantic with current-state/concurrency obligations. Product Agent authored presentation can already evolve through the accepted Builder/Change revision path and therefore does not require a direct metadata API.

## 6. Preservation assertions

```text
N_platform                              = 116
N_budget                                = 2
Project Product operations              = 23
IAM Product operations                  = 19
Connections Product operations          = 9
ordinary Permissions                    = 25
resurrected generic mutation operations = 0
new semantic owners                     = 0
new trust boundaries                    = 0
new durable record classes              = 0
Product implementation authority        = 0
```

The historical `4B-F01` finding remains correct for the authority that existed when it closed. `4C-F11` adds evidence-driven creation/read presentation and three real access-administration reads. `4C-F13` changes only Product Agent/catalog presentation projection and creates zero Product operations, Permissions, owners or record classes.

## 7. Global-Maximum disposition

For F11 the rejected alternatives were opaque IDs plus UI heuristics, frontend/Keycloak directory ownership, generic Person/UserProfile + RBAC, record-shaped grant CRUD, and one screen-shaped access dashboard.

For F13 the rejected alternatives are opaque Agent IDs as primary presentation, frontend/source-derived labels and Project joins, a new Workspace Agent/fleet owner, a screen-shaped catalog owner/API, and direct Agent metadata CRUD.

Accepted outcome:

```text
CURRENT OWNERS CONFIRMED
→ human Account presentation belongs to iam.account
→ human Area presentation belongs to Workspace Area
→ Product Agent name + purpose belong to the exact Project-authored agent/v1 projection
→ Workspace Agent catalog remains PRJ-22 Project-owned filtered projection
→ canonical owning Project context = ProjectSummary
→ no generic profile/role/group/Agent-fleet domain
```

## 8. Recompile obligation

```text
Account / Area presentation identity
→ IAM-03 / IAM-04 / IAM-18..20 / WS-04 / WS-05
→ canonical 4B Identity/Workspace wire
→ generated frontend/server projections
→ W-03A human recognition + access review

Product Agent presentation + owning Project context
→ PRJ-20 / PRJ-21 / PRJ-22
→ canonical 4B Project wire
→ generated frontend/server projections
→ W-04 human Agent recognition + Workspace catalog
```

Repository proof must preserve no generic mutation resurrection, exact Project ownership, `project.read` vs `project.source.read` separation, no runtime-health inference from `activeReleaseId`, and Product implementation blockade.
