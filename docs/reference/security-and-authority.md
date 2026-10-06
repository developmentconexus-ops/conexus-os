# Security guide

Who may do what, how a person proves who they are, where secrets live and what may leave. This
guide follows the chapters of the [OWASP ASVS 5.0](https://github.com/OWASP/ASVS) and targets its
level 2. Each section cites the ASVS requirements it covers by identifier. Each rule uses the words
of [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119): **must** and **must not** are defects in
review, **should** and **should not** need a stated reason to break, and **may** is a free choice.

The guide states the target. Code that departs from it is listed in
[architecture section 11](architecture.md#11-risks-and-technical-debt) with the wave that removes
it. Owners next door: [database](database.md#6-roles-and-transactions) for how PostgreSQL bounds
each transaction, the [API guide](../product/wire-contract.md) for the wire, and
[architecture](architecture.md) for where code runs. Exact facts live in code:
`identity-access/admission.ts`, `http/access.ts` and `platform/lifetimes.ts`.

## 1. Trust zones

ASVS V15.

- The browser **must** be untrusted for anything that carries authority. An id it sends is a hint
  the server resolves.
- The result an agent returns **must** be treated as adversarial input. The Hub moves `main` only by
  fast forward from the run's base, and reads source only as safe paths and regular files.
- The E2B sandbox and the runner's workers run untrusted code. Keycloak, model providers and E2B are
  outside the trust boundary.

**Why.** Every zone that runs code someone else wrote is a place an attack starts. Naming the zones
tells each check where it belongs.

**Right.** The Hub reads the candidate's tree as paths and blobs, and never runs its files in the
Hub process.

**Wrong.** The Hub trusts a `projectId` the browser sends without resolving the caller's access to
it.

## 2. Who may act

ASVS V8.

- Authority **must** be membership of the Workspace that owns the resource, with its role, `owner`
  or `member`. `ROLE_ALLOWS` in `admission.ts` is the whole rule: a member does not manage the roster
  or bind connections. The last active owner **must not** be demoted or removed.
- An installation administrator is a fact about an Account, not a Workspace role. Its actions are
  `AdministratorAction` in `admission.ts`. The last one **must not** be revoked.
- An action **must** be necessary and never sufficient: each operation rechecks the exact subject
  and its current state.
- Authority **must not** be inferred from a Keycloak role, group or claim, or from a provider,
  model, Mastra or E2B identity.
- A principal **must** be one of four classes. `HUMAN_ACCOUNT_SESSION` is an authenticated human
  mapped to one Account and one opaque Conexus session. `TRUSTED_BOOTSTRAP_CONTEXT` is the transient
  pre-Account context for the one server-preconfigured OIDC subject; it may self-provision only that
  Account through `provisionAccount` and is invalid afterwards. `SYSTEM_OWNER_TRANSITION` is an
  owner-internal transition after an admitted command, with no public operation and no Permission.
  `APPLICATION_SESSION` is a human Account acting in exactly one application on that application's
  own host, and it reaches no Product operation. A Keycloak role, group or organization, a Mastra
  agent, thread or workflow identity, an E2B sandbox or process identity, a trace, span or provider
  request id, a storage key, path or URL, and any role, project or id the browser supplies are never
  principals.
- A command **must** write only with the `Admitted` proof an admission function returns after
  locking the rows it read. A served read uses `Checked`, which no command accepts.
- The acting Account **must** come from the session, never from the request. A route that acts on a
  child by id **must** check the child belongs to the parent in its path.
- An invitation **must** be claimed only by signing in with its verified email. Removing a roster
  entry **must** withdraw every right it gave.
- A refusal **must** log its reason (`OUTSIDER`, `FORBIDDEN`, `TOMBSTONE`, `INACTIVE`), and the
  response **must** carry the problem fields
  [the API guide](../product/wire-contract.md) declares and no private refusal detail.

**Why.** One rule in one place, rechecked on every operation, leaves no path where a stale or
forged right still works.

**Right.** A member asks to remove someone from the roster, and admission answers `FORBIDDEN`.

**Wrong.** A route that trusts a `role` field sent in the request body.

## 3. Sign-in

ASVS V6.8 and V10.

- Sign-in **must** use Keycloak's Authorization Code flow with PKCE S256, for a confidential client
  whose issuer, redirect URI and client id are pinned in configuration.
- `email_verified` **must** be accepted only as the boolean `true`. A verified `(issuer, subject)`
  resolves one Account. Email is never identity.
- A claim **must** be parsed at the boundary. A malformed claim fails closed and logs no value.
- The bootstrap identity **must** provision only the preconfigured subject, once, and reach no
  ordinary route.
- A change to the realm **must** state its effect on every client.

**Why.** Keycloak proves who the person is. Everything Conexus grants comes from its own records,
so a change in Keycloak never grants a right by itself.

**Right.** A Keycloak user recreated with the same email becomes a new Account.

**Wrong.** An Account matched by email after its Keycloak subject changed.

## 4. Sessions

ASVS V7.

- Every session **must** be one row of `iam.host_session`, one per cookie, of kind `HUB`,
  `APPLICATION` or `PREVIEW`. Lifetimes live in `iam.session_lifetimes()` and
  `platform/lifetimes.ts`.
- The Hub cookie **must** be `__Host-conexus_session`, `Secure`, `HttpOnly`, `SameSite=Lax`, path
  `/`, with no domain.
- A request **must** refresh its session's sealed Keycloak token at a bounded interval. A disabled
  user or an ended SSO session **must** end the Conexus session.
- Sign-out **must** end the Conexus session first, then ask Keycloak to end the SSO session.
- A person **must** be able to end their own sessions, and an administrator another person's.
- Each application **must** have its own host. An app-only Account **must not** get a Hub session.
  Every application request resolves an unrevoked grant or Workspace membership again.
- A handoff **must** be a one-use proof for one host, bound to its sign-in.

**Why.** A session is the key to everything a person can do. A short, revocable session limits what
a stolen cookie is worth.

**Right.** An administrator disables a person, and their next request is refused.

**Wrong.** A session that stays valid after its Keycloak user was disabled.

## 5. Browser boundary

ASVS V3.

- Every route of the three listeners **must** declare one access kind from `http/access.ts`, its one
  enforcer. Only `access.ts` and `http/cookies.ts` read credential cookies and the protected `Origin`,
  `Cookie` and `Sec-Fetch-*` request headers.
- Every write **must** carry the exact `Origin` its access kind names. Hub API requests carry
  `Sec-Fetch-Site` `same-origin` or none. There is no CSRF token.
- The Hub **must** send its security headers: a Content Security Policy with a nonce, a strict
  `Referrer-Policy`, and `frame-ancestors 'none'` on application hosts.
- There **must not** be a credentialed cross-origin Product API. The browser leaves only for the
  Keycloak redirect and an application handoff.

**Why.** One enforcer for every route means a new route cannot forget the check: the Hub refuses to
start with a route that declares no access.

**Right.** A `POST` from another site fails the `Origin` check before the handler runs.

**Wrong.** A route that reads the cookie itself and skips `access.ts`.

## 6. Secrets and cryptography

ASVS V11 and V13.

- A secret at rest **must** be read through `platform/secrets.ts`, which refuses a file other users
  can read, and sealed with the installation's envelope. The database refuses an unsealed value.
- Keys **must** have a rotation procedure. A retired key only decrypts.
- A secret **must not** appear in code, fixtures, logs, telemetry or a pull request.
- No sandbox, generated app, browser or log **must** receive a durable privileged credential,
  including a connection's credential. Model calls run in the Hub.

**Why.** A secret that never leaves the Hub cannot leak through the code that Conexus does not
control.

**Right.** A model account's key is sealed in the database and opened only in the Hub's call.

**Wrong.** An environment variable with a provider key passed into the E2B sandbox.

## 7. Data protection and egress

ASVS V14 and V15.

- Only an authorized exact revision of a Project **must** be readable. A reachable Git object never
  grants disclosure.
- Telemetry **must** export only what the redaction table allows. A new field comes with a test that
  plants a string and proves it is removed.
- Each privileged adapter **must** have a named owner, its own credential and a destination pinned
  by configuration: Keycloak, E2B, Context7 and the integration executor.
- There **must not** be a privileged `fetch(url, secret)`. `web_fetch` carries no credential and
  goes through the Hub's guard.

**Why.** Every outbound call with a credential is a door. Pinning each door to one destination
makes it reviewable.

**Right.** The integration executor calls the vendor host pinned in its configuration.

**Wrong.** A helper that takes any URL and attaches the connection's token.

## 8. Untrusted code

ASVS V15.

- Generated code **must not** run in the Hub process. It runs in a fresh worker with no network
  except its call's connector socket, no host files, no credential, and bounded time, memory and
  output. Each escape names the layer that blocks it.
- A Project's runtime role **must** reach only its own schema.

**Why.** Generated code is written by a model from a person's words. It is treated like code from
the internet.

**Right.** A handler that opens a socket to another host fails in the worker.

**Wrong.** A handler run with `import()` inside the Hub.

## 9. Logging and errors

ASVS V16.

- A security event (sign-in, refusal, session end, administrator change) **must** leave a log line
  with its code and trace id.
- A log line **must not** carry a secret, a token or a claim value.
- An error response **must** carry the problem fields [the API guide](../product/wire-contract.md)
  declares, never a stack trace or an internal message.

**Why.** An incident is investigated from the logs. A log that leaks a token creates the next
incident.

**Right.** `IDENTITY_CLAIM_MALFORMED` logged with the claim's name, not its value.

**Wrong.** A refresh token printed in a debug line.

## 10. Recovery and accepted risks

- A restore **must** treat memberships, sessions and credentials as historical as of the cutoff.
  Restored sessions **must** be invalid, and sign-in stays closed while identity continuity is
  unknown.
- An accepted risk **must** be a decision in [the decisions register](../decisions/index.md) with
  its reopen trigger, and a row in architecture section 11.
