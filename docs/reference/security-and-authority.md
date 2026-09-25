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
→ Conexus issues its own opaque server-owned session (iam.host_session, kind HUB)
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

One session model serves the Hub, every application host and every Preview host:
`iam.host_session`, one row per cookie, of kind `HUB`, `APPLICATION` or `PREVIEW`, with one CHECK
per kind. A Hub session has its CSRF digest and a 30-minute idle limit inside an absolute 8 hours.
An application session lasts 8 hours from sign-in. A Preview session lasts at most 15 minutes
from its launch and only while the Hub session that opened it is live. One handoff primitive,
`iam.handoff`, carries a sign-in to exactly one host (section 4.3, section 6).

Hub and application sessions keep the Keycloak refresh token of their sign-in server side,
sealed at rest with the installation's credential key (`CONEXUS_FACTORY_SECRET_KEY_FILE`, the
Factory's AES-256-GCM envelope; every Hub requires it); the database refuses any unsealed value.
After a key rotation, `CONEXUS_FACTORY_PREVIOUS_SECRET_KEY_FILES` names the retired keys, which
only decrypt, for these tokens and the Factory's credentials alike. A token no named key opens
ends the session (`CUSTODY_CHANGED`). The list is comma-separated with no spaces, and it must not
repeat the current key's file: the Factory throws `Duplicate key id` at start if it does.

**The Keycloak check.** At most every five minutes, a request on any host refreshes the sealed
token of the session that holds it (a Preview uses its Hub session's). Keycloak's refresh refuses
a disabled user (`User disabled`) and an ended SSO session (`Session not active`), so a person
disabled or signed out in Keycloak loses the Hub, every application and every Preview within five
minutes (operator decision 2 of the single session qualification, accepted on 2026-09-25; before it, the Hub never asked
Keycloak). A refused refresh ends that session, and a Hub session's end ends the Previews it
opened; the ending records why: `PROVIDER_USER_DISABLED`, `PROVIDER_SESSION_ENDED` or
`PROVIDER_REFUSED`. When Keycloak cannot answer a due check, the request is refused and the
session is kept: 503 `identity-provider-unavailable` on every Hub route and on application and
Preview hosts. The Factory's routes answer 503 too, because the Hub's own check runs before
Mastra's auth; the operator accepted that answer on 2026-09-25 ([decisions index](../decisions/index.md)). Signing out of the Hub never asks Keycloak.

**Rotation is off.** The realm does not rotate refresh tokens (`revokeRefreshToken: false`,
Keycloak's default): a token refreshes any number of times, so requests that find the same check
due may all refresh, each is served, and a compare-and-set on the check time records one of them.
Rotation served no accepted requirement: the token never leaves the Hub and is sealed at rest,
and rotation forced a claim protocol in the database whose failures signed people out. The
single session qualification proved on Keycloak 26.7.2 that with rotation off a disabled user and
an ended SSO session are still refused and no old token outlives the SSO session. Reopen on a
Keycloak upgrade that changes refresh behaviour for a disabled user or an ended session.

The realm's SSO idle limit is 40 minutes (the operator's decision in the chat with the manager on
2026-09-25): a refresh resets it, and the Hub refreshes only when its five-minute check is due, so it
must outlast the Hub's own 30-minute idle limit plus five minutes.

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
→ the application host redeems it once; a presentation that fails any check (host, binding,
  lifetime, access) is refused and consumes nothing, so the handoff still redeems on its own host
→ the host sets its own opaque, host-only, Secure, HttpOnly, SameSite=Lax session cookie
```

The binding cookie lives ten minutes and redemption leaves it in place, so every handoff of
sign-ins that share it redeems.

An invitation claims nothing for an Account whose grant on that application was revoked at or
after the invitation was issued, whatever address it names; a revocation is keyed by the Account,
not by an email.

Only a top-level document navigation (`Sec-Fetch-Mode: navigate`, `Sec-Fetch-Dest: document`)
starts a sign-in. Any other request without a session answers 401 and sets nothing.

The application session is an `APPLICATION` row of `iam.host_session` (section 4.2). It names
one Account and one application, lasts at most eight hours from sign-in, and holds the sign-in's
sealed Keycloak refresh token. Because of Keycloak's SSO idle limit, a person who makes no
request for about 40 minutes is signed out at the next check and signs in again with their
password. Application sign-out ends only that application session.

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

A Preview is authorized separately from the Control Plane. Each launch writes its immutable
facts (Account, Project, source and artifact revision, digest, exact host, manifest) to
`iam.preview` and mints a `PREVIEW` handoff for the Hub session that asked, valid 30 seconds. The
Hub's own page posts it to the Preview host with the Hub's exact `Origin`; redemption opens a
`PREVIEW` session on that host only, and a presentation on any other host consumes nothing. Every
Preview request resolves the session and its live Hub session again, and again after the
asynchronous artifact read. Possession or guessing of an artifact path never bypasses that check.
An issued handoff is not proof that an application works.

A Preview lives in PostgreSQL, not in the Hub process: any Hub serves it, and it survives a Hub
restart. It ends 15 minutes after launch, or when its Hub session ends, idles out or is refused by
Keycloak. The next launch removes ended Previews and their sessions.

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
