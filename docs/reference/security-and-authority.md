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

The Hub reaches its database as one login role, `hub_runtime`, and Mastra's storage as `hub_factory`.
`docs/reference/hub-database-roles.md` is the register.

`hub_runtime` logs in and holds nothing on a split table except `iam.account`, whose unported readers
keep a bridge until part 6. Until the parts that own them port the functions it still runs, it holds
the older surface: `INSERT`, `SELECT` and `UPDATE` on `iam.account`, `iam.bootstrap_context`,
`iam.oidc_transaction` and `iam.operation_idempotency`, and `EXECUTE` on the legacy `SECURITY DEFINER`
functions, several of which take the acting account as an argument. Its ceiling is
`runtimePrivileges` in `contracts/technical/hub-catalog-census.json` (92 today: 12 table privileges
and 80 `EXECUTE`), which may only fall. Each transaction's first statement
after `BEGIN` is one `SELECT set_config(...)` that sets the role, to `hub_reader` for a read or to
`hub_command` for a command and a job, both `NOLOGIN NOINHERIT NOBYPASSRLS`, together with the
transaction's settings, all local to the transaction. `hub_runtime` also carries three timeouts, named
in the register: `lock_timeout` 5 s, `statement_timeout` 30 s and `idle_in_transaction_session_timeout`
60 s. A wait or a statement that runs out answers the 503 `DATABASE_BUSY`. `hub_runtime` is a member of the two without `INHERIT`, so the
switch is the only way to use their privileges. It cannot run DDL and cannot read the `factory`
schema; PostgreSQL refuses each with 42501. `hub_factory` owns `factory` and holds nothing else.
Two further roles never log in. `conexus_owner` owns the objects of schema `platform` and the private
schema `rls`, and `iam_rls` owns the three `rls.acting_*` helper functions that the reader policies
call. The schemas are `iam`, `workspace`, `project`, `builder`, `reg`, `model`, `connector`,
`platform` and `rls`.

Who may act is decided in TypeScript and bounded again by the database.

- **The gate and the proof.** `database.transaction(accountId, fn)` and `database.system(job, fn)`
  hand `fn` a `CommandGate`, a nominal class with no query method. Only an admission function in
  `identity-access/admission.ts` opens it, locks the rows it read in the order the old SQL functions
  locked them, decides over `ROLE_ALLOWS` and returns an `Admitted<Scope>`. A command takes that proof
  and writes only on the transaction inside it. A command without a proof, with a proof of another
  scope or action, with an object literal or a spread copy of a gate or a proof, or with a read proof,
  does not compile (`tests/fixtures/admission-negative.ts`, run by
  `tests/repository/admission-types.test.mjs`). Any reference to the `openGate` symbol outside
  `admission.ts` is a finding of the `gateReferences` census item, which resolves the symbol with the
  type checker, so an alias, a namespace import, a destructuring and a dynamic import are found; the
  Biome rule on the named import is a fast hint, not the gate. The acting account comes from the signed session the access enforcer parsed (spec 0014),
  never from a request body, and the gate carries it, so no admission takes an account argument.
- **Reads.** `database.read(accountId, fn)` runs `repeatable read` and read only as `hub_reader`, with
  `conexus.account_id` set local to the transaction. Every table a person reads has `FORCE ROW LEVEL
  SECURITY` and one `FOR SELECT TO hub_reader` policy named `reader` (and `reader_admin` where an
  installation administrator reads across Workspaces), built on the three `rls.*` helpers; the
  catalog lint requires each reader policy to call `rls.acting_account()`. A read that
  forgets its `WHERE` still returns only the acting account's rows, and a read with no account set
  returns none. `hub_reader` holds `SELECT` and nothing else.
- **Commands.** `hub_command` has one policy per split table, `FOR ALL USING (true) WITH CHECK
  (true)`: the wall on a write is the admission, the column grants (a
  command updates only the columns its register row names, never a tenant column), the composite
  tenant keys the parts that add them put in the register (no split table has one yet) and the write
  lint in `scripts/census-boundaries.mjs`, which refuses an update or a delete of a split table whose
  `where` compares none of the key or tenant columns its register row names (`keyColumns`). `system(job, fn)` also sets `conexus.job`, and the four project purge functions refuse any
  other job with `PURGE_REQUIRES_SYSTEM`.
- **The `sql` tag.** It refuses at run time any text whose statements do not start with `select`,
  `insert`, `update`, `delete` or `with`, and the words `conexus`, `session_authorization`, `u&`,
  `set_config` and `current_setting`. It reads string literals, dollar quoted text, quoted identifiers
  and nested comments first, so a word inside a literal is neither a bypass nor a refusal, and every
  statement goes over the extended protocol, which refuses a second statement. A role switch cannot be
  built from our code. `openDatabase` accepts only a `search_path` connection option, and a `read`, `transaction` or `system` opened inside
  another fails with `NESTED_TRANSACTION`.
- **Functions.** A `SECURITY DEFINER` function still holds the rules of an owner that has not been
  ported, with a pinned `search_path`. `hub_runtime` holds `EXECUTE` on the functions the older
  capability roles held. `hub_command` holds `EXECUTE` on the four purges, on
  `builder.register_project_repository` and on `iam.lock_administrators()`; `hub_reader` holds it on
  the three `reg` served functions (each filters by the acting account) and the three helpers. The
  register in `contracts/technical/hub-catalog-census.json` lists them and `npm run db:catalog:check`
  fails on any other. Each part ports one owner's functions into TypeScript before it splits the
  tables they read, the ceilings fall in the register, and `docs/reference/function-callers.md` shows
  which function still calls which.
- **Grants that outlive the split.** Until part 6, `hub_runtime` itself can insert into and update
  `iam.account`, `iam.bootstrap_context` and `iam.oidc_transaction`, and read `iam.account` through
  the `legacy_runtime` policy, because unported TypeScript still reads them. `iam.workspace_membership`
  has no such bridge. The boundaries census names the only modules that may write an authority table,
  by verb. `iam.workspace_membership` belongs to `admission.ts` alone, whose `grantCreatorMembership`
  inserts only into a Workspace that has none. Any write on `project.project_deletion` and `DELETE` on
  `project.project` belong to `project/deletion.ts`, and `DELETE` on `platform.operation_receipt` to
  that file and `platform/receipt.ts` (the `authorityTableWrites` item of
  `scripts/census-boundaries.mjs`, recorded at zero). Part 6 adds its own tables to the rule.
- **Served reads.** A request the application host serves changes nothing, so it uses
  `checkApplication`, not `admitApplication`: the same access and deletion rule in one statement with
  no row lock, returning a `Checked` whose transaction is a read transaction. A `Checked` is not an
  `Admitted`, so no command accepts it. A transaction that also writes admits instead.
- **What the log holds.** A database error logs its SQLSTATE and our own constraint and table names,
  never its message. An admission refusal logs why (`OUTSIDER`, `FORBIDDEN`, `TOMBSTONE` or
  `INACTIVE`) in its details; the response carries the code and nothing else.

What this guards is an accidental broad query, a forgotten check and a revoke racing a write. A
compromised Hub process can set any account, as it could hold any capability role before.

## 3. Egress

Each privileged adapter has a named owner, its own credential and a destination pinned
by server configuration.

```text
I&A OIDC adapter   → the exact configured Keycloak issuer and client
Builder runtime    → E2B
Builder docs       → Context7, mcp.context7.com, over MCP; the installation's key is optional
Builder web        → any public host, through a guarded `web_fetch` from the Hub and the model provider's own search
Builder sandbox    → any host, from the E2B guest (C-023)
Project Git        → the Git provider
```

The Context7 adapter is the Hub's own MCP client, refusing every other host. It sends the
library name and a one-line question the Builder wrote, refused when long or shaped like data, never a Hub credential, and it does not run
in the sandbox.
`web_fetch` is Mastra's `webFetchTool` behind the Hub's guard. It sends no credential and only
GET, and Mastra refuses private, loopback and link-local addresses, also after DNS and on each
redirect. The guard refuses a URL with a query string, a `#` part or a user or password, one
longer than 300 characters, with a path segment over 80 or a host label over 40, a path shaped
like an email or a long number, and a host holding a long number. The host name gets these checks
because it leaves in the DNS lookup before any request. The guard narrows what can leave in the
URL; it cannot prove a URL is free of company data, so a short path or host label of company
words still passes. C-023 keeps the sandbox allowlist before Q5.
The sandbox's destinations are logged, not blocked. At the end of every turn the Hub logs one
`BUILDER_SANDBOX_EGRESS` line per distinct host, port and protocol the sandbox reached since the
last turn, with the run id, conversation id, first-seen time and a count, then a
`BUILDER_SANDBOX_EGRESS_SUMMARY` line saying whether the list is complete, partial or failed.
Two root-run recorders in the guest produce it: a DNS forwarder on `127.0.0.1:53` that names
addresses (upstream: the VM's own resolver, kept as the fallback), and a poller of `/proc/net/tcp`
every 10 seconds, `TIME_WAIT` included, which skips connections the sandbox accepted. A log that
reaches its size cap is truncated and the summary reads partial. A connection
shorter than the poll that never lingers can be missed, so an empty list is not proof of no
egress. Paths, query strings and payloads are never recorded. A recorder or collection failure
is logged and never fails the run. The list is what the Q5 allowlist starts from.
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
per kind. A Hub session has a 30-minute idle limit inside an absolute 8 hours. An application
session lasts 8 hours from sign-in. A Preview session lasts at most 15 minutes from its launch and
only while the Hub session that opened it is live. One handoff primitive, `iam.handoff`, carries a
sign-in to exactly one host (section 4.3, section 6).

Every session lifetime has one owner, `iam.session_lifetimes()`, and only the `iam_owner` functions
that write the rows read it; the table checks hold shape only. The oracle tests in
`tests/implementation/session-lifetimes.postgres.test.mjs` hold every writer to it. The windows the
Hub writes from TypeScript (the OIDC transaction, the application sign-in cookie, the bootstrap
window, invitations) live in `apps/hub/src/platform/lifetimes.ts`. The relations between them and
the Keycloak realm are tests in the same file, not prose: the sign-in cookie outlives the OIDC
transaction plus the application handoff (AC-18), and the realm's SSO idle limit, maximum lifespan
and access token lifespan outlast the sessions they back (AC-19).

### 4.2.1 Request authenticity

The browser proves where a request comes from, and the session cookie proves who sends it. There is
no CSRF token. Every write carries the exact `Origin` of the host it is meant for and is refused
without it; every Hub API request has `Sec-Fetch-Site` `same-origin` or none; a Hub API write is
neither a navigation nor a form body. The Hub session cookie is `__Host-conexus_session`, which only
the Hub host can set or read, so a sibling application on the same site can neither read it nor
pass the exact Origin. An HTML form injected into a Hub page is refused by its mode or media type.

Each route of the three listeners (Hub, Preview, application host) declares one access kind from the
closed table in `apps/hub/src/http/access.ts`, which also owns the one enforcer: authenticity runs
before the body is read, the credential after. A route with no kind, a kind foreign to its
listener, or a method its kind does not allow stops the Hub from starting. Cookie names and options
have one owner, `apps/hub/src/http/cookies.ts`, and only `access.ts` reads the session and
bootstrap cookies; `scripts/check-access-owner.mjs` keeps every header and cookie read inside these
two files.

Four rules hold this together:

1. **A read changes nothing, and HEAD is opt in.** Only page reads answer HEAD. The routes that run
   a transaction on GET (the OIDC pair and the application sign-in completion) are GET only.
2. **The routes are a ledger.** `tests/implementation/access/route-ledger.mjs` lists every route
   with its kind and the answers it must give; the walk in `route-walk.test.mjs` fails on any route
   the ledger does not name.
3. **One owner per fact.** One body parser, one Preview host parser, one header policy per
   listener, one session shape.
4. **No temporary security model.** The token left in the same change that brought the enforcer.

Residual cases: a browser older than March 2023 sends no `Sec-Fetch-Site`, so the Builder mount's
GETs stay open to a cross-site link in it (cost on the person's own conversation, not authority);
XSS on the Hub origin defeats any of these. Authorization stays in the SQL functions.

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
Mastra's auth; the operator accepted that answer on 2026-09-25 ([decisions index](../decisions/index.md)). Signing out of the Hub
never waits on Keycloak to end the Conexus session: the session ends first, and its sealed refresh
token is handed out of the database once, in the same statement. The Hub then posts that token
server to server to Keycloak's `end_session_endpoint`, bounded to three seconds, so Keycloak's SSO
session ends and the next sign-in asks for a password. Keycloak's `204`, or its `invalid_grant`
for a session it no longer holds, counts as ended; anything else, a timeout or an unreachable
Keycloak, is logged as `hub_sign_out_provider_logout_unconfirmed`, with neither token nor Account,
and the sign-out still answers `204`. Local revocation is never reported as upstream revocation.
Once Keycloak's SSO session has ended, the person's application sessions opened from it end at
their next Keycloak check; signing out of an application still ends only that application session.

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

The binding cookie lives twelve minutes, longer than the OIDC transaction plus the handoff, and redemption leaves it in place, so every handoff of
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
must carry the application host's exact `Origin` (the `host-write` kind of section 4.2.1). SameSite does not separate sibling
application hosts, which share one site. Handlers receive the caller from the resolved session,
never from the request.

## 5. Credentials

Conexus holds no model provider credential. Model authentication, credentials, provider
connection and model selection belong to Mastra Code and the Factory, per
[C-022](../decisions/index.md).

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

## 8. Risks accepted for the pilot

The operator accepted these two risks for the pilot on 2026-10-02
([decision register](../decisions/index.md#decided-on-2026-10-02-the-order-of-work-to-q5)).

| Risk | Why it exists | Reopen |
| --- | --- | --- |
| A Project's handler can read the schema, table and column names of another Project's application. It cannot read their rows. | Every Project has its schemas in one shared application database. `app-runner/data-plane.ts` revokes schema and table rights from `PUBLIC`, but every role can read the PostgreSQL catalog (`pg_namespace`, `pg_class`, `pg_attribute`), and handler SQL runs as the Project's runtime role. | A second company's data shares the Applications cluster, a table name itself carries data that must not be seen, or the Stage 2 platform gives each Project its own database. |
| The prompts, tool inputs and outputs, and source text of a deleted Project stay in the Builder's trace spans for up to 30 days. | Deleting a Project does not delete its spans. The Builder's Mastra storage keeps every span for 30 days (`OBSERVABILITY_SPAN_RETENTION` in `builder/module.ts`), and the daily prune removes it after that. | A person or a company asks for its data to be erased at once, or the traces move to a store with a different retention. |
