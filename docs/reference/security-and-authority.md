# Security and authority

Technical detail for the security boundary. [The permission contract](../product/permission-contract.md)
owns who may do what, and [the role register](hub-database-roles.md) owns the database
roles. This file describes the code; where they disagree, the code is right.

## 1. Trust zones

Zones are classifications, not deployment units.

| Zone | Contents | Trust |
| --- | --- | --- |
| Browser | the Control Plane SPA and the Preview it opens | untrusted for anything authority bearing |
| Hub | the modular monolith and its module owners | trusted |
| Guest execution | the E2B sandbox that runs the Builder agent and the application under test | root capable and untrusted |
| External providers | Keycloak, model providers, E2B, the Git provider, package registries | outside the trust boundary |
| Storage | the Hub PostgreSQL cluster, the artifact store and the credential backend | trusted, and not one credential domain |

A module boundary inside the Hub is not process isolation. Full compromise of the Hub
process stays an accepted residual class. Least privilege on the normal path limits the
blast radius that is avoidable.

The Control Plane and Preview browser contexts stay separate. Ids for a Project, a run
or a connection that arrive from the browser are hints and are resolved server side.

## 2. Database roles

The Hub connects as roles named for what they may do, never as one superuser.
`docs/reference/hub-database-roles.md` is the generated register.

```text
hub_iam_runtime        hub_workspace_read      hub_workspace_command
hub_project_read       hub_project_command     hub_builder_ingress
hub_builder_executor   hub_model_connection
```

The schemas are `iam`, `workspace`, `project`, `builder`, `model_connection` and `reg`.
Each schema has an owner role, and the Hub's connection roles hold only the privileges
their capability needs. Authority functions are `SECURITY DEFINER` with a pinned
`search_path`, so a caller cannot reach them through a shadowed schema.

## 3. Egress

Each privileged adapter has a named owner, its own credential and a destination pinned
by server configuration.

```text
I&A OIDC adapter   → the exact configured Keycloak issuer and client
Builder runtime    → E2B
Project Git        → the Git provider
Model adapter      → the model provider the connection names
```

There is no universal privileged `fetch(url, secret)` and no egress proxy. The generated
application and the E2B guest never receive a durable privileged credential.

Browser egress is platform controlled. One bounded cross-origin path is admitted: Conexus
may redirect the browser to the configured Keycloak authorization endpoint and receive
the allowlisted callback. Any other cross-origin capability is a security contract change,
not a configuration convenience.

## 4. Human authentication

C-015 selects Keycloak for authentication and keeps Conexus sovereign over authority.

```text
browser
→ the Conexus login endpoint
→ Keycloak Authorization Code with PKCE S256
→ Keycloak authenticates the human
→ the Conexus callback validates and exchanges the code server side
→ the verified (issuer, subject) pair resolves one iam.account
→ Conexus issues its own opaque server-owned iam.session
→ every protected operation resolves current Conexus authority
```

The OIDC client is confidential and server side. Implicit flow and direct grant are not
admitted. The issuer, redirect URI, client identity and signing expectations are pinned
in server configuration.

Conexus reads `email_verified` from the validated ID token and accepts only the boolean
`true`. An unverified address is refused, which is why an invitation to one can never be
claimed.

Keycloak realm roles, client roles, groups and organizations are provider mechanics. They
never substitute for Workspace membership or any other Conexus fact. A verified
`(issuer, subject)` pair is an attribute of an existing `iam.account`, never a record
class of its own.

### 4.1 The bootstrap exception

```text
no Account maps the server-preconfigured bootstrap subject
→ the verified issuer and subject match that exact configuration
→ a transient TRUSTED_BOOTSTRAP_CONTEXT
→ IAM-03 provisions only that subject
→ the context is invalid immediately afterwards
→ later entry follows the normal Account and session path
```

This context is not durable, holds no action, cannot select another subject and cannot
reach any ordinary route. It is not a Keycloak role, a default credential, a public
signup or a permanent recovery bypass.

### 4.2 Session

The Conexus session is an opaque server-owned cookie. Possession of a Keycloak token
never grants Conexus authority by itself. Ending the Conexus session ends that session;
it does not claim a global Keycloak SSO logout.

## 5. Credentials

A model provider credential goes to the credential backend and is never returned to a
browser. A connection carries a generation, and a revocation raises it, so a credential
read that was admitted under an older generation cannot be replayed.

## 6. Preview serving

A Preview is authorized separately from the Control Plane. Each launch binds its own
immutable route, and a grant is checked again after the asynchronous artifact read.
Possession or guessing of an artifact path never bypasses that check. An issued grant is
not proof that an application works.

Preview grants may expire when the Hub restarts. Artifacts in the registry stay reusable
after fresh authorization.

## 7. Recovery

A restore may reintroduce a control generation older than the last authority decisions. A
restored membership, session or credential is historical as of the cutoff, and does not
become current merely because it exists.

```text
restored sessions
→ invalid for reuse

material privileged authority
→ re-established through the owning module
→ current checks apply again before protected use
```

Recovery must also preserve continuity of the configured Keycloak issuer and of the
stable `(issuer, subject)` identities that `iam.account` references. Rebuilding the
identity provider must never silently remap an existing Account to a different human.
Where identity continuity is unknown, human login stays fail closed until it is
reconciled through I&A.

The recovery posture is deny only. It may prevent normal ingress. Neither its presence
nor its clearing grants authority.
