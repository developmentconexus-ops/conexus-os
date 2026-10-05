# Security and authority

Who may do what, how a person proves who they are, where secrets live and what may leave. Owners
next door: [database](database.md#roles) for how PostgreSQL bounds each transaction,
[API](../product/wire-contract.md) for the wire, [architecture](architecture.md) for where code runs.
Code owns the exact facts: `identity-access/admission.ts`, `http/access.ts`, `platform/lifetimes.ts`.

## Trust zones

The browser is untrusted for anything authority bearing; ids it sends are hints resolved on the
server. The Hub is trusted, and a module boundary is not process isolation: a compromised Hub
process is an accepted residual. The E2B guest and the runner's workers run untrusted code. The
result an agent returns is adversarial input: the Hub moves `main` only by fast forward from the
run's base, and reads source only as safe paths and regular blobs. Keycloak, model providers and E2B are outside
the boundary. Storage is trusted and is not one credential domain. Enforced by review.

## Who may act

- Control Plane authority is membership of the Workspace that owns the resource, with its role,
  `owner` or `member`. `ROLE_ALLOWS` in `admission.ts` is the whole rule: a member does not manage
  the roster or bind Connections. A Project has no authority of its own beyond its Workspace's. A
  read is gated by containment through the row policies, not by an action. Leaving is
  self-service; the last active owner can be neither demoted nor removed.
- An installation administrator is a fact about an Account, kept as tenures (closed ones stay as
  the record), not a Workspace role. Its actions are `AdministratorAction` in `admission.ts`:
  managing the administrator set, managing any Workspace's Connections, and deleting an idle Project
  in any Workspace, which it still sees while the deletion runs; none needs membership. The last one cannot be revoked;
  changes to the set take one lock. The bootstrap identity's Account becomes the first, only while
  the installation has never had one; `npm run iam:bootstrap-installation-administrator` is the operator's recovery path, refused
  while another active administrator exists.
- An action exists only when a real call site needs the distinction, and it is necessary, never
  sufficient: each operation rechecks the exact subject and current state. No authority is inferred
  from a Keycloak role, group or claim, or from a provider, model, Mastra or E2B identity.
- A command writes only with the `Admitted` proof an admission function returns after locking the
  rows it read; a served read uses `Checked`, which no command accepts. The acting account comes
  from the session the access enforcer parsed, never from a request. A route acting on a child by
  id checks the child belongs to the parent in the path. Cheap checks (concurrency, size,
  authority) run before expensive work.
- A refusal logs its reason (`OUTSIDER`, `FORBIDDEN`, `TOMBSTONE`, `INACTIVE`); the response carries
  the code only. A database error logs its SQLSTATE and our constraint and table names, never its
  message.

Enforced by: `tests/repository/admission-types.test.mjs`, `gateReferences` and
`authorityTableWrites` in `scripts/census-boundaries.mjs`, the row policies, and review.

Not yet enforced, and each waits for its first real call site: private conversations and
everything they carry; continuing another person's conversation without their credentials or
permissions; what a conversation, app or automation may call for a Project;
explicit, authorized Publish; delegated work reaching source only through the Project's own
admission. Runtime authority is rechecked at bounded request or Connector admission.

## Sign-in

Keycloak runs Authorization Code with PKCE S256 for a confidential server-side client whose issuer,
redirect URI and client are pinned in configuration. `email_verified` is accepted only as the
boolean `true`. A verified `(issuer, subject)` resolves one `iam.account`; Keycloak only
authenticates. A claim is parsed at the boundary and a malformed one fails closed, diagnosable
without logging its value. The one bootstrap exception provisions only the preconfigured subject,
is transient and reaches no ordinary route. A realm change states its effect on every client.
Enforced by the identity tests and review.

## Sessions

- One model, `iam.host_session`, one row per cookie of kind `HUB`, `APPLICATION` or `PREVIEW`. A
  Hub session idles out after 30 minutes inside 8 hours; an application session lasts 8 hours; a
  Preview lasts at most 15 minutes and only while its Hub session lives. `iam.session_lifetimes()`
  owns every lifetime; TypeScript windows live in `platform/lifetimes.ts`. `iam.handoff` is a one-use
  proof for one host (application 60 s, bound to the sign-in binding; Preview 30 s). Enforced by
  `tests/implementation/session-lifetimes.postgres.test.mjs`.
- Every write carries the exact `Origin` its access kind names (the Hub's for Hub routes and
  `hub-entry`, the host's own for `host-write`); Hub API requests have `Sec-Fetch-Site`
  `same-origin` or none; there is no CSRF token. The Hub cookie is `__Host-conexus_session`. Every
  route of the three listeners declares one access kind from `http/access.ts`, its one enforcer;
  only `access.ts` and `http/cookies.ts` read headers and cookies. Enforced by
  `scripts/check-access-owner.mjs` and `tests/implementation/access/route-walk.test.mjs`.
- At most every five minutes a request refreshes its session's sealed Keycloak token. A disabled
  user or an ended SSO session ends the session with its reason; an unreachable Keycloak answers 503
  and keeps it. Sign-out ends the Conexus session first, then asks Keycloak to end the SSO session
  within three seconds. Refresh rotation is off; reopen on a Keycloak upgrade that changes refresh
  for a disabled user. The realm's SSO idle limit (40 minutes) outlasts the Hub's idle limit plus
  the check. Enforced by the session tests.
- Each application has its own host. A top-level navigation without a session goes through the Hub
  sign-in and returns with a handoff; an app-only Account never gets a Hub session. Every
  application request resolves an unrevoked grant or Workspace membership again, and handlers get
  the caller from the session, never the request (`iam.account_access_scope`,
  `iam.has_application_access`, `admitApplication`). The application host sends `frame-ancestors
  'none'` and grants no CORS. Enforced by `tests/implementation/application-access.postgres.test.mjs`.
- A Preview launch records its immutable facts in `iam.preview`; every Preview request resolves its
  session and live Hub session again. An artifact path is never a credential.

## Secrets

- A secret at rest is read through `platform/secrets.ts`, which refuses a file other users can
  read, and sealed with the installation's one envelope; refresh tokens and model accounts use it,
  and the database refuses an unsealed value. Retired keys only decrypt. Enforced by the CHECK
  constraints and review.
- Model accounts belong to Conexus, one per person and provider (C-032). Model calls run in the Hub.
  No sandbox, generated app, browser, log or pull request receives a durable privileged credential,
  a Connection's credential included. An upstream catalog passed on keeps the Hub's own filter.
  No secret appears in code, fixtures, logs or a pull request. Review.
- Only authorized exact revisions of a Project are readable; a reachable Git object never grants
  disclosure. Review.
- Telemetry exports only what spec 0007's redaction table allows; a new field or body source comes
  with a planted-string case. Inbound trace context is trusted only on unix socket listeners.
  Enforced by `tests/implementation/telemetry-redaction.test.mjs`.

## Egress

Each privileged adapter has a named owner, its own credential and a destination pinned by
configuration: Keycloak, E2B and Context7 through the Hub's own client. `web_fetch` has no
credential and no pinned destination: it reaches any public host through the Hub's guard (GET only,
no query string or fragment, bounded URL, path and host), which cannot prove a URL carries no
company data. The sandbox may reach any
host (C-023); each turn logs the hosts it reached, and an empty list is not proof of no egress.
There is no privileged `fetch(url, secret)` and no egress proxy. The browser leaves only for the
Keycloak redirect and an application handoff; any other cross-origin path is a security change.
Enforced by `tests/implementation/builder-egress-log.test.mjs` and review.

## Recovery

Not yet implemented, the rule for the first restore: a restored membership, session or credential
is historical as of the cutoff, restored sessions are invalid, privileged authority is
re-established through its owning module, and unknown identity continuity keeps sign-in closed.
Today no restore step ends sessions; `conexus-restore-check.sh` checks row counts and `git fsck`.

## Accepted risks

Accepted by the operator on 2026-10-02 for the pilot. A Project's handler can read other Projects'
schema, table and column names in the shared application database, never their rows; reopen when
a second company shares the cluster or a name carries data. A deleted Project's prompts and source
stay in trace spans up to 30 days; reopen on an erasure request or a store with other retention.
