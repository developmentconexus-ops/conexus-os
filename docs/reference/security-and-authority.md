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
| Guest execution | the E2B sandbox that runs the Builder agent, compiles its output and boots it under headless Chromium | root capable and untrusted |
| Source custody | the OCI git container that exports a Project's source and admits a result bundle | isolated on purpose, and the reason is below |
| External providers | Keycloak, model providers, E2B, the Git provider, package registries | outside the trust boundary |
| Storage | the Hub PostgreSQL cluster and the artifact store | trusted, and not one credential domain |

A module boundary inside the Hub is not process isolation. Full compromise of the Hub
process stays an accepted residual class. Least privilege on the normal path limits the
blast radius that is avoidable.

The Control Plane and Preview browser contexts stay separate. Ids for a Project or a run
that arrive from the browser are hints and are resolved server side.

Source custody is its own zone because the bundle an agent returns is adversarial input
to git. Exporting and admitting run inside a container with no network, a read-only root
filesystem and dropped capabilities, against an image the Hub re-verifies by digest, git
version and the hash of the git binary. The admission refuses anything but a single
commit descending from the declared base, on an allow-listed path, in a regular blob
mode. That boundary is kept deliberately, and merging the remaining two container starts
into one would mean holding a container open across the agent's turn with the repository
mounted for writing.

### 1.1 Authority the destination will need

C-021 creates authorization questions this reference does not answer yet, and nothing
enforces them. [The permission contract](../product/permission-contract.md#5-target-requirements-not-yet-enforced)
owns the list. Two of them are trust-boundary questions rather than vocabulary: a
conversation's author never lends credentials or permissions to whoever continues it,
and a capability granted to a Project never becomes the secret behind it.

## 2. Database roles

The Hub connects as roles named for what they may do, never as one superuser.
`docs/reference/hub-database-roles.md` is the generated register.

```text
hub_iam_runtime        hub_workspace_read      hub_workspace_command
hub_project_read       hub_project_command     hub_builder_ingress
hub_builder_executor
```

The schemas are `iam`, `workspace`, `project`, `builder` and `reg`.
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
```

There is no universal privileged `fetch(url, secret)` and no egress proxy. The generated
application and the E2B guest never receive a durable privileged credential.

Browser egress is platform controlled. Two bounded cross-origin paths are admitted:

1. Conexus may redirect the browser to the configured Keycloak authorization endpoint and
   receive the allowlisted callback.
2. An application host may send the browser to the Hub sign-in, and the Hub may return it to
   that application host with a one-use handoff ([4.3](#43-application-session)).

Any other cross-origin capability is a security contract change, not a configuration
convenience.

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

### 4.3 Application session

Each application has its own host, `<app>.<CONEXUS_APPLICATION_DOMAIN>` on
`CONEXUS_APPLICATION_PORT` (`<app>.conexus.localhost:3445` on the pilot). The host label is the
only application selector. One function, `applicationOrigin`, names that origin for the sign-in
return, the address shown to Owners and the only `Origin` the application API admits. The Hub
session cookie is host-only and never reaches an application host.

```text
document navigation at the application host, without an application session
→ the host sets a sign-in binding cookie (or keeps the one of a sign-in already in progress),
  clears any application session value, and sends the browser to the Hub sign-in with the
  application and the binding's digest
→ Keycloak authenticates through the ordinary Hub OIDC flow
→ the Hub callback resolves the Account, or provisions an app-only Account only from an
  open application invitation to that verified email; it never issues a Hub session to an
  app-only Account
→ the Hub mints a handoff bound to that Account, application and binding, valid 60 seconds
→ the application host redeems it once; any presentation consumes it, even a refused one
→ the host sets its own opaque, host-only, Secure, HttpOnly, SameSite=Lax session cookie
```

Only a top-level document navigation (`Sec-Fetch-Mode: navigate`, `Sec-Fetch-Dest: document`)
starts a sign-in. Any other request without a session answers 401 and sets nothing.

The application session is `iam.application_session`, separate from `iam.session`. It names
one Account and one application and lasts at most eight hours from sign-in. It keeps the
Keycloak refresh token server side, sealed at rest in the handoff and in the session with the
installation's credential key (`CONEXUS_FACTORY_SECRET_KEY_FILE`, the Factory's AES-256-GCM
envelope); the database refuses any unsealed value. The realm rotates refresh tokens
(`revokeRefreshToken`, `refreshTokenMaxReuse: 0`), so a token works once. At most every five
minutes one request claims the check in the database, on whichever Hub it arrives, spends the
token and stores the rotated one in the statement that releases the claim. Other requests that
find the check due meanwhile proceed on the session they resolved. A refused refresh ends the
session and records why, as far as Keycloak's answer says: `PROVIDER_USER_DISABLED`,
`PROVIDER_SESSION_ENDED` (the Keycloak SSO session ended, including its 30-minute idle limit)
or `PROVIDER_REFUSED`. An unreachable Keycloak refuses the request with 503 and releases the
claim. Because of the idle limit, a person who makes no application request for about 30 minutes is
signed out at the next check and signs in again with their password.

The application host is a top-level site. Its content security policy has the Preview's
sources, `frame-ancestors 'none'` and no `sandbox` directive, and it grants no CORS.

Every application request resolves authority again: an unrevoked grant for that Account and
application, or current membership in the Project's Workspace. Every state-changing request
must carry the application host's exact `Origin`. SameSite does not separate sibling
application hosts, which share one site. Handlers receive the caller from the resolved session,
never from the request.

## 5. Credentials

Conexus holds no model provider credential. Model authentication, credentials, provider
connection and model selection belong to Mastra Code and the Factory, per
[C-022](../decisions/index.md). The Hub refuses to boot when a retired credential
variable is set, with `RETIRED_CONFIG_<name>`.

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
