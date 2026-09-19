# Conexus OS operation ledger

This file owns the census of fixed Product operations. [The product contract](contract.md)
owns product meaning, [the permission contract](permission-contract.md) owns who may do
what, [the wire contract](wire-contract.md) owns wire shape, and
[the roadmap](../roadmap.md) owns status.

The census in section 3 is the authority. `scripts/check-wire-bijection.mjs` parses that
table and requires the Product OAS to hold exactly the same set, by id and by operation
name, in both directions. The gate is `wire-bijection` in the candidate graph.

```text
fixed Product operations = 26
```

The number is a result, not a target. It is whatever the table below holds, and the gate
fails if the wire disagrees. The count was 39 until 2026-09-19, when Project Inception
and the Project Baseline left the product. It became 26 later that day, when a model
connection stopped being a Claude account and `CLA-08` added an API key connection for
any provider the model router's registry knows.

---

## 1. Principals

| Class | Meaning |
| --- | --- |
| `HUMAN_ACCOUNT_SESSION` | an authenticated human mapped to one Conexus Account and one opaque Conexus session |
| `TRUSTED_BOOTSTRAP_CONTEXT` | the transient pre-Account context for the one server-preconfigured OIDC subject; it may self-provision only that Account through `IAM-03` and is invalid afterwards |
| `SYSTEM_OWNER_TRANSITION` | an owner-internal transition after an admitted command; it has no public operation and no Permission |

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

An OIDC callback, a provider token refresh, a model provider call, an E2B call, Git
transport and static byte transport are mechanics. They are not Product operations
because they exist.

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
| `CLA-01` | `ListModelConnections` | Model Connection | current Account's model connection disclosure; provider, kind, label and state only, never a credential | read |
| `CLA-02` | `StartModelAuthorization` | Model Connection | current authorization start against the exact named provider's server-pinned flow | command |
| `CLA-03` | `CompleteModelAuthorization` | Model Connection | exact named provider and its pasted authorization result; server resolves the authorized subject | command |
| `CLA-04` | `SelectModelConnection` | Model Connection | exact connection preference for future BuilderRuns | command |
| `CLA-05` | `ShareModelConnection` | Model Connection | exact Workspace the sharing Account belongs to; every member may then use it | command |
| `CLA-07` | `UnshareModelConnection` | Model Connection | exact Workspace share, withdrawn by the connection owner or a Workspace member manager | command |
| `CLA-06` | `RevokeModelConnection` | Model Connection | exact owner-scope connection revocation | command |
| `CLA-08` | `AddModelConnectionApiKey` | Model Connection | exact provider from the model router's registry plus a label and a key; the key goes to custody and is never returned | command |

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

# 5. The Project-defined capability grammar

`contracts/api/project-operation.schema.json` is a declaration grammar for operations a
Project would define for itself, and `contracts/examples/budget-analyzer` holds two
example declarations against it.

Nothing serves them. Their declarations pin an active Release, a Project Brain binding
and a Project connection binding, and their caller is a published application. All four
concepts left the product on 2026-09-19. The grammar and its examples are retained as an
example of shape, not as current Product authority, and nothing in the census above
depends on them.
