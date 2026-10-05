# Conexus OS operation ledger

This file owns the census of fixed Product operations. [The product contract](contract.md)
owns product meaning, [security](../reference/security-and-authority.md#who-may-act) owns who may do
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
Project one of its operations (`CON-01` to `CON-07`). It became 32 on 2026-09-27, when an
installation administrator gained the power to delete a Project, its data and its GitHub
repository (`PRJ-04`). On 2026-09-28, C-030 replaced the grant per operation (`CON-05` to `CON-07`)
with a binding of a whole Connection under a Project-local name (`CON-08` to `CON-10`), and the
count stayed 32. It became 30 later that day, when spec 0002 gave the Builder its own controller:
a Project's conversations are its Mastra threads, listed and opened over the Agent Controller's
own routes, so `BLD-27` and `BLD-28` left the table. It became 31 on 2026-10-05, when spec 0015 declared
the Projects home's two reads (`PRJ-SUMMARIES`, `PRJ-THUMBNAIL`) in the shared contract, where every
operation the web calls is a row.

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
| `IAM-04` | `ListWorkspaceMembers` | I&A | current Workspace roster: members and invitations with their state in one projection | read |
| `IAM-05` | `InviteWorkspaceMember` | I&A | exact Workspace + verified email the invited person must sign in with; the pair is the natural key | command |
| `IAM-06` | `RemoveWorkspaceRosterEntry` | I&A | exact Workspace roster entry; narrowing, and removing a member withdraws every derived right | narrowing command |
| `IAM-10` | `SetWorkspaceMemberRole` | I&A | exact Workspace membership; the last owner cannot be demoted | command/current-authority |
| `IAM-11` | `ListApplicationAccess` | I&A | exact Project's application: its address, open grants and invitations with their state in one projection; Owner of the Project's Workspace only | read |
| `IAM-12` | `GrantApplicationAccess` | I&A | exact Project + verified email the person must sign in with; the pair is the natural key; an email whose person already holds an open grant answers that grant and opens nothing; the first grant fixes the application's address; Owner of the Project's Workspace only | command |
| `IAM-13` | `RevokeApplicationAccessEntry` | I&A | exact Project access entry (grant or invitation); narrowing, and a revoked grant stops the person at their next request and withdraws any invitation to their email for the application | narrowing command |
| `WS-01` | `CreateWorkspace` | Workspace | any authenticated Account; the creator becomes its owner | command |
| `PRJ-01` | `ListProjects` | Project | current Workspace Projects selection flow | read |
| `PRJ-03` | `CreateProject` | Project | current Project creation flow; atomically establishes source and initial access | command |
| `PRJ-02` | `GetProject` | Project | current Project disclosure/open flow | read |
| `PRJ-04` | `DeleteProject` | Project | exact Project + repeated exact current name; installation administrator only; tears down every Hub row, its conversations (Mastra threads), its application's data and its Conexus Git repository together | narrowing command |
| `PRJ-SUMMARIES` | `ListProjectSummaries` | Project | current Projects home: each Project of the Workspace with its latest Builder activity and whether a Preview exists to thumbnail | read |
| `PRJ-THUMBNAIL` | `GetProjectThumbnail` | Project | exact Project the Account may see; the captured thumbnail of the served application, as an image | read |
| `BLD-08` | `ListProjectSourceTree` | Project Git via Builder | authorized Project + exact immutable source revision | read |
| `BLD-09` | `GetProjectSourceFile` | Project Git via Builder | authorized Project + exact immutable source revision/path | read |
| `BLD-23` | `GetBuilderSession` | Builder projection + Mastra conversation | authorized Project + persisted Project Thread and latest BuilderRun/Preview projection | read |
| `BLD-24` | `SendBuilderMessage` | Builder | authorized Project + server-resolved current source and Project Thread | command |
| `BLD-25` | `CancelBuilderRun` | Builder | authorized Project + exact BuilderRun; repeated requests remain idempotent | command |
| `BLD-26` | `GetBuilderRunTrace` | Builder | authorized Project + exact BuilderRun; safe native trace projection only; token usage carries Mastra's optional `inputDetails` and `outputDetails` breakdowns when the provider reported them | read |
| `BLD-29` | `CompareProjectSourceRevisions` | Project Git via Builder | authorized Project + two exact admitted source revisions; file content stays behind GetProjectSourceFile | read |
| `BLD-30` | `LaunchBuilderPreview` | Builder | authorized Project builder + the Project's last good Preview subject and its registry artifact | command |
| `CON-01` | `ListWorkspaceConnections` | Connector | the Workspace's Connections, never a credential field; installation administrator only | read |
| `CON-02` | `CreateWorkspaceConnection` | Connector | installation administrator; client-chosen Connection id, idempotent on it, and a retry with this id whose fields differ is a conflict; the credential fields are write-only and never returned | command |
| `CON-03` | `CheckWorkspaceConnection` | Connector | installation administrator; runs only the Connector's allow-listed authentication, never a provider value in the response | command |
| `CON-04` | `DisableWorkspaceConnection` | Connector | installation administrator; narrowing, ends the Connection's open bindings, and the rows stay as the record | narrowing command |
| `CON-08` | `ListProjectConnectionBindings` | Connector | exact Project's open bindings and the Workspace's enabled Connections it has not bound, in one projection; Owner of the Project's Workspace only | read |
| `CON-09` | `BindProjectConnection` | Connector | exact Project + one enabled Connection of its own Workspace, under a Project-local name; Owner of the Project's Workspace only; the same Connection under the same name answers the open binding, and the Connection under another name or the name on another Connection is a conflict | command |
| `CON-10` | `UnbindProjectConnection` | Connector | exact Project's binding; narrowing, the row stays as the record, and the next call through it is refused; Owner of the Project's Workspace only | narrowing command |

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
