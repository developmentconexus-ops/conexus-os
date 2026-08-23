# Conexus OS — Human Context & Resource Presentation Identity Contract

> **Status:** CURRENT / `4C-F01` + `4C-F04` OPERATOR ACCEPTED / BOUNDED 4A PROPERTY AUTHORITY
> **Scope:** human-readable presentation identity only for the currently proven Workspace, Project and logical Connection consumers.
> **Operation impact:** none; `N_platform` remains 113.
> **Implementation authority:** none.

This contract owns the smallest sustainable Product semantics needed for humans to recognize exact server-owned resources without turning presentation labels into machine identity, routing, authorization, containment or generic metadata authority.

`4C-F01` first admitted this property class for Workspace and Project. `4C-F04` later proved the same essential property is required for the existing logical Connection owner after W-02B exposed repeated same-provider Connection instances with no provider-independent human recognition source. The Global-Maximum assessment confirmed the logical Connection owner rather than creating a new presentation domain or frontend heuristic.

## 1. Falsifiers

### Workspace / Project — `4C-F01`

Current authority already provides stable opaque Workspace/Project identifiers and server-derived disclosure, but humans must recognize which Workspace and Project context they are entering or switching among.

Opaque identifiers alone are not sufficient human presentation identity.

### Logical Connection — `4C-F04`

Current Connections authority already provides stable `connectionId`, exact owner scope, Connector definition/version, immutable revision identity and non-secret credential-presence truth. It also permits more than one logical Connection in an owner scope without proving one instance per provider.

Therefore:

```text
human chooses one logical Connection
+ repeated same-provider instances are valid
+ provider/configuration/secret cannot be universal identity
→ logical Connection must expose provider-independent human presentation identity
```

## 2. Accepted bounded semantics

The operator accepts these exact presentation-identity properties:

```text
Workspace.name
Project.name
Connection.name
```

Shared law:

- required human-readable presentation identity;
- non-blank string;
- server-owned and returned only when the underlying resource itself is currently disclosable;
- independent from stable opaque machine identity;
- never an authorization, containment, routing, slug or uniqueness source;
- not required to be globally or owner-scope unique by this contract;
- immutable after creation in F1 because no current rename consumer has been admitted.

Resource-specific machine identities remain authoritative:

```text
Workspace.name   != workspaceId
Project.name     != projectId
Connection.name  != connectionId
```

For Connection specifically:

```text
Connection.name = logical Connection presentation identity
```

It is stable across `ConnectionRevision` changes. `ConnectionRevision` does not re-own, version or derive the name. Connector/provider identity, provider-specific configuration, external account fields and secret material may never substitute for the canonical logical Connection name.

Exact authorization continues to use server-owned Account/session/membership/grant/owner facts, operation Permissions and stable resource identifiers.

## 3. Creation and duplication

```text
WS-01 CreateWorkspace
→ requires name
→ returns workspaceId + name

PRJ-03 CreateProject
→ requires name
→ returns Project representation including name

PRJ-06 DuplicateProject
→ requires destinationWorkspaceId + explicit destination name
→ destination name is not silently copied from source Project authority

CON-05 CreateConnection
→ requires explicit name
→ establishes one logical Connection with stable human presentation identity
→ returns canonical Connection including name
```

An implementation may suggest a local default, but the admitted create command must carry the explicit `name` selected for the new resource. No source/provider/configuration field becomes hidden presentation-identity authority.

## 4. Required read projection

Current generated wire must make the accepted human identity available through the canonical resource projections.

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
  → each canonical Connection includes connectionId + name

CON-04 GetConnection
  → canonical Connection includes connectionId + name

CON-05 CreateConnection
  → created canonical Connection includes connectionId + name
```

Any response already defined in terms of the same canonical representation inherits that representation; this does not create parallel DTO authority.

## 5. Explicit non-authority

These presentation identities do **not** admit:

```text
WS-03 UpdateWorkspace
PRJ-04 UpdateProject
RenameWorkspace
RenameProject
RenameConnection
UpdateConnectionMetadata
generic metadata/settings patch
name uniqueness semantics
name-derived routing
name-derived authorization
slug/URL authority derived from name
frontend-owned ID→name registry
repo name as Project Product identity
provider/configuration-derived fallback Connection identity
secret/account-derived Connection identity
```

`CON-06 ReviseConnection` remains configuration-revision authority only. It cannot rename the logical Connection or move presentation identity into `ConnectionRevision`.

Area semantics remain unchanged. `WS-06 UpdateArea` remains subtracted and no Area name is introduced by this contract.

A future real rename/relabel consumer must reopen only that exact mutation semantic with current-state/concurrency obligations. The existence of creation-time `name` is not rename authority.

## 6. Preservation assertions

```text
N_platform                              = 113
N_budget                                = 2
Connections Product operations          = 9
ordinary Permissions                    = 25
new Product operations                  = 0
resurrected generic mutation operations = 0
new semantic owners                     = 0
new trust boundaries                    = 0
new durable record classes              = 0
Product implementation authority        = 0
```

The historical `4B-F01` finding remains correct for the authority that existed when it closed. `4C-F01` and `4C-F04` are later evidence-driven creation/read property additions and do not rewrite that historical Evidence or resurrect generic update APIs.

## 7. Global-Maximum disposition

`4C-F04` compared opaque/provider identity, provider-configuration derivation, ConnectorDefinition label derivation, explicit logical Connection identity, rename-now authority and a separate presentation owner.

Accepted outcome:

```text
CURRENT STRUCTURE CONFIRMED
→ logical Connection remains the semantic owner
→ missing essential property = provider-independent human presentation identity
→ selected realization = Connection.name
→ rename = DEFER SAFELY until a real consumer appears
```

This is not selected because it is the smallest textual patch. It is selected because it fixes the root defect at the correct existing owner without introducing provider heuristics, duplicate authority or unsupported lifecycle machinery.

## 8. Recompile obligation

Accepted semantic chains:

```text
Workspace/Project presentation identity
→ current fixed 4B OpenAPI projections
→ generated frontend/server projections
→ GF-01 / W-01 human recognition

Connection presentation identity
→ CON-05 + canonical Connection 4B projection
→ generated frontend/server projections
→ W-02B human browse/select/create interactions
```

Repository proof must preserve exact operation counts, no generic mutation resurrection, write-only Connection secrets, immutable Connection revisions and the distinction:

```text
configured != qualified != bound != healthy != authorized
```

Product implementation remains blocked by the Phase-4 program.
