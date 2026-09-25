# Conexus OS operation ledger

This file owns the census of fixed Product operations. [The product contract](contract.md)
owns product meaning, [the permission contract](permission-contract.md) owns who may do
what, [the wire contract](wire-contract.md) owns wire shape, and
[the roadmap](../roadmap.md) owns status.

The census in section 3 is the authority. `scripts/check-wire-bijection.mjs` parses that
table and requires the Product OAS to hold exactly the same set, by id and by operation
name, in both directions. The gate is `wire-bijection` in the candidate graph.

```text
fixed Product operations = 31
```

The number is a result, not a target. It is whatever the table below holds, and the gate
fails if the wire disagrees. The count was 39 until 2026-09-19, when Project Inception
and the Project Baseline left the product. It became 26 later that day, when a model
connection stopped being a Claude account and `CLA-08` added an API key connection for
any provider the model router's registry knows. It became 18 on 2026-09-21, when the eight
`CLA` Model Connection operations left with the subsystem: Mastra owns model credentials
and selection (C-022). `BLD-27` to `BLD-29` then raised the table to 21 while this line still read
18. It became 24 on 2026-09-23, when Stage 2 Q3 let a Workspace Owner grant one person the use of
a Project's application (`IAM-11` to `IAM-13`). It became 31 on 2026-09-24, when Stage 2 Q4 let an
installation administrator hold a Workspace's Connector Connection and a Workspace Owner grant one
Project one of its operations (`CON-01` to `CON-07`).

---

## 1. Principals

| Class | Meaning |
| --- | --- |
| `HUMAN_ACCOUNT_SESSION` | an authenticated human mapped to one Conexus Account and one opaque Conexus session |
| `TRUSTED_BOOTSTRAP_CONTEXT` | the transient pre-Account context for the one server-preconfigured OIDC subject; it may self-provision only that Account through `IAM-03` and is invalid afterwards |
| `SYSTEM_OWNER_TRANSITION` | an owner-internal transition after an admitted command; it has no public operation and no Permission |
| `APPLICATION_SESSION` | a human Account acting in exactly one application through one opaque application session on that application's own host; it reaches no Product operation |

These are never principals:

```text
a Keycloak role, group or organization
a Mastra agent, thread or workflow identity
an E2B sandbox or process identity
a trace or span or provider request id
a storage key, path or URL
any role, project or id supplied by the browser
```

## 2. Ingress

| Code | Meaning |
| --- | --- |
| `CONTROL_PLANE` | an authenticated Control Plane interaction; every current operation uses this |
| `SYSTEM` | an owner-internal transition; not a Product operation |
| `APPLICATION_HOST` | a request to one application's own host: its files, its sign-in handoff, its sign-out and its manifest-declared operations; mechanics, not a Product operation |

An application's operations belong to its own manifest, not to this census. They run as
`POST /__conexus/api/{operation}` on the application's host, the same executor shape section 4
refuses as a Product operation, and the Preview listener's routes follow the same rule.

An OIDC callback, a provider token refresh, a model provider call, an E2B call, Git
transport and static byte transport are mechanics. They are not Product operations
because they exist.

Setting the first installation administrator is an operator shell step,
`npm run iam:bootstrap-installation-administrator`, not a Product operation. Granting and
revoking installation administration exist as `iam` functions with no route yet. Each earns a
row here when its first Control Plane consumer does.

---

# 3. Current fixed Product census

Each row names the semantic owner and the real consumer. This table and the Product OAS
must agree exactly.

| ID | Operation | Owner | Consumer / authority root | Class |
| --- | --- | --- | --- | --- |
| `IAM-01` | `GetControlPlaneAccessContext` | I&A | Control Plane shell; server-resolved Account + Workspace/Project context | read |
| `IAM-02` | `EndSession` | I&A | authenticated human through the current Conexus session | command |
| `IAM-03` | `ProvisionAccount` | I&A | first account for the configured bootstrap identity, or an invited verified email | command |
| `IAM-04` | `ListWorkspaceMembers` | I&A | current Workspace roster: members and pending invitations in one projection | read |
| `IAM-05` | `InviteWorkspaceMember` | I&A | exact Workspace + verified email the invited person must sign in with; the pair is the natural key | command |
| `IAM-06` | `RemoveWorkspaceRosterEntry` | I&A | exact Workspace roster entry; narrowing, and removing a member withdraws every derived right | narrowing command |
| `IAM-10` | `SetWorkspaceMemberRole` | I&A | exact Workspace membership; the last owner cannot be demoted | command/current-authority |
| `IAM-11` | `ListApplicationAccess` | I&A | exact Project's application: its address, open grants and pending invitations in one projection; Owner of the Project's Workspace only | read |
| `IAM-12` | `GrantApplicationAccess` | I&A | exact Project + verified email the person must sign in with; the pair is the natural key; an email whose person already holds an open grant answers that grant and opens nothing; the first grant fixes the application's address; Owner of the Project's Workspace only | command |
| `IAM-13` | `RevokeApplicationAccessEntry` | I&A | exact Project access entry (grant or invitation); narrowing, and a revoked grant stops the person at their next request and withdraws any invitation to their email for the application | narrowing command |
| `WS-01` | `CreateWorkspace` | Workspace | any authenticated Account; the creator becomes its owner | command |
| `WS-02` | `GetWorkspace` | Workspace | current Workspace disclosure flow | read |
| `PRJ-01` | `ListProjects` | Project | current Workspace Projects selection flow | read |
| `PRJ-03` | `CreateProject` | Project | current Project creation flow; atomically establishes source and initial access | command |
| `PRJ-02` | `GetProject` | Project | current Project disclosure/open flow | read |
| `BLD-08` | `ListProjectSourceTree` | Project Git via Builder | authorized Project + exact immutable source revision | read |
| `BLD-09` | `GetProjectSourceFile` | Project Git via Builder | authorized Project + exact immutable source revision/path | read |
| `BLD-23` | `GetBuilderSession` | Builder projection + Mastra conversation | authorized Project + persisted Project Thread and latest BuilderRun/Preview projection | read |
| `BLD-24` | `SendBuilderMessage` | Builder | authorized Project + server-resolved current source and Project Thread | command |
| `BLD-25` | `CancelBuilderRun` | Builder | authorized Project + exact BuilderRun; repeated requests remain idempotent | command |
| `BLD-26` | `GetBuilderRunTrace` | Builder | authorized Project + exact BuilderRun; safe native trace projection only | read |
| `BLD-27` | `ListFactoryConversations` | Builder over Factory storage | authorized Project bound to its Factory repository; conversations are Factory session rows | read |
| `BLD-28` | `CreateFactoryConversation` | Builder over Factory storage | authorized Project bound to its Factory repository + client-chosen conversation id; a retry returns the existing row | command |
| `BLD-29` | `CompareProjectSourceRevisions` | Project Git via Builder | authorized Project + two exact admitted source revisions; file content stays behind GetProjectSourceFile | read |
| `CON-01` | `ListWorkspaceConnections` | Connector | the Workspace's Connections, never a credential field; installation administrator only | read |
| `CON-02` | `CreateWorkspaceConnection` | Connector | installation administrator; client-chosen Connection id, idempotent on it; the credential fields are write-only and never returned | command |
| `CON-03` | `CheckWorkspaceConnection` | Connector | installation administrator; runs only the Connector's allow-listed authentication, never a provider value in the response | read |
| `CON-04` | `DisableWorkspaceConnection` | Connector | installation administrator; narrowing, revokes the Connection's open grants, and the rows stay as the record | narrowing command |
| `CON-05` | `ListProjectConnectorGrants` | Connector | exact Project's open grants and the operations it could still be granted, in one projection; Owner of the Project's Workspace only | read |
| `CON-06` | `GrantProjectConnectorOperation` | Connector | exact Project + one operation of one Connection of its own Workspace; Owner of the Project's Workspace only; an operation already granted through another Connection answers that grant | command |
| `CON-07` | `RevokeProjectConnectorGrant` | Connector | exact Project's connector grant; narrowing, and the next call through it is refused; Owner of the Project's Workspace only | narrowing command |

# 4. What is not an operation

An operation earns a row by having a real consumer. These were rejected and stay
rejected:

```text
execute(anySlug, anyInput)
execute(anySql)
execute(anyProviderOperation)
a caller-selected connection
a caller-selected target URL
GetBlob(storageKey)
UploadAnyFile
```

The bijection gate refuses a Product path shaped like a generic executor, so a path
containing `{operationSlug}` or a path segment `execute` fails the build rather than a
review.

An operation is also not created by a screen, a button, a persona or an internal
function. Internal dispatch by identifier is mechanism, not authority.
