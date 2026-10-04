# 0014. One access rule for the Hub, applied in one place

**Date**: 2026-10-04
**Status**: Approved (approved by the operator on 2026-10-04)
**Lane**: `lane:shaped`
**Depends on**: spec 0013 (S4, approved). Its migrations 0057 to 0059 land first, and 0058 rewrites
`iam.mint_application_handoff` and `iam.open_preview`; this spec starts from those bodies. Spec 0009
(merged in #499) for the failure table. Base `125d7a6c`.
**Changes**: spec 0008 (Proposed). Its slice 1 (session length as a setting) will read the single
lifetime owner this spec creates, `iam.session_lifetimes()`, instead of the literals it planned to
replace.
**Keeps for 0013**: `iam.end_host_session(bytea, text)` unchanged; the `*_expires_at` columns stay the
truth the reaper reads; the clauses `(ended_at IS NULL) = (provider_refresh_token IS NOT NULL)` (HUB,
APPLICATION) and `(ended_at IS NULL) = (ended_reason IS NULL)`; the `ended_reason` values. This spec
does not touch `iam.reap_expired` or `iam.purge_project`.

References to "spike N" name facts measured before the build against PostgreSQL 17.10 with every Hub
migration applied (and S4's 0057 to 0059), on the real Hub, Preview and application Fastify apps,
and in a headless Chromium against a local HTTPS echo server. "Review" names the multi-model
adversarial review of the first draft; "cross check" names the second model's reading of the revised
draft. Neither is in this repository. Each part proves its fact again in its own tests.

## Summary

Today every Hub route that changes data checks its own Origin and its own CSRF token, in eleven hand
copies that disagree on order and on how the token is checked, and GET routes with side effects are
not checked at all. After this spec, each route declares one access kind from a closed table, one
enforcer applies that table on all three listeners (where the request comes from, before the body is
read; who sends it, after), and a route without a kind stops the Hub from starting. The CSRF token
goes: every write requires the exact Origin, the session cookie is `__Host-`, and the table refuses the
one thing the token still stopped (an HTML form on a Hub page). Each session lifetime gets one owner in
SQL, and each cookie name one owner in TypeScript; a CI check keeps every reader inside its owner.

Four rules hold the design together, and each closes a family of cases rather than one:

1. **A read changes nothing, and HEAD is opt in.** Only page reads answer HEAD. A GET that runs a
   transaction is declared as such and has no HEAD (section 1).
2. **The routes are a ledger, not a rule applied blind.** One file lists every route with its kind,
   its body shape and the answers it must give; the walk test fails on any route the ledger does not
   name (section 5).
3. **One owner per fact, inside this spec too.** One body parser, one Preview host parser, one header
   policy per listener, one session shape (section 4).
4. **No temporary security model.** The token leaves in the same part the enforcer lands (Build plan).

## Requirements

**User stories**:
- As a person using Conexus, I want a link or a form on another site, or on a sibling application,
  to be unable to start work in my Builder conversation or finish a model account login, so my
  sessions only move when I act on the Hub page.
- As the operator, I want one answer to "how is this request checked and how long does this session
  live", so a change to a rule or a lifetime is one edit, proved by one test.
- As the next engineer, I want to declare a route's access once and receive its session typed in my
  handler, so I cannot forget a check or read a session the route does not have.

**Acceptance criteria**:

*The table and the boot check*
- **AC-1**: Every route on the Hub, Preview and application listeners declares exactly one access
  kind from `navigation`, `sign-in`, `session`, `sign-out`, `bootstrap`, `host-write`, `hub-entry`
  (section 1). An owned route declares it through `routes(app)[kind]({...})`; the Builder Mastra mount
  and `@fastify/static` declare it through `foreignRoutes(app, kind, register)`, whose scope stamps
  `config.access` on every route it registers.
- **AC-2**: HEAD is opt in. `createHttpApp` builds Fastify with `exposeHeadRoutes: false`. The
  `navigation` definer registers `method: 'GET'` with the route option `exposeHeadRoute: true`, so
  Fastify builds the HEAD twin itself (empty body, the GET's `content-length`; the route option wins
  over the server's, `fastify/lib/route.js:223`); `@fastify/static` keeps its own explicit
  `['HEAD', 'GET']` (`@fastify/static/index.js:139,463`); no other definer exposes HEAD. A HEAD to a
  `session`, `sign-in` or any write route, the mount's included, answers 404 `NOT_FOUND`. A HEAD to an
  application or Preview page answers as today (`tests/implementation/application-host.test.mjs:438`,
  `preview-application-api.test.mjs:128` stay green).
- **AC-3**: `installAccess` records every route in `onRoute` and checks the records in `onReady`.
  The Hub does not start, and the failure names the route, when a route has no kind
  (`ROUTE_ACCESS_UNDECLARED`), a kind its listener does not carry (`ROUTE_ACCESS_FOREIGN`), a method
  its kind does not allow (`ROUTE_ACCESS_METHOD`, table in section 1, HEAD included), or a
  `foreignRoutes` stamp over a different declared kind (`ROUTE_ACCESS_CONFLICT`). Each is
  `Failure('INTERNAL_UNEXPECTED', { details: { invariant, route } })`.

*Authenticity, before the body*
- **AC-4**: `apps/hub/src/http/access.ts` is the only code in the Hub that reads `Origin`,
  `Sec-Fetch-*`, the request `content-type` for authenticity, the Hub session cookie and the bootstrap
  cookie. It decides authenticity with the pure function `authentic(row, facts, expected)` over
  `ACCESS[kind]` and nothing else, in an `onRequest` hook registered after `@fastify/helmet` and after
  the listener's header hook, so every refusal carries the headers an answer carries.
- **AC-5**: Header facts keep three states (section 1): absent, a single string, or malformed (any
  other value). A malformed value never matches and is refused wherever the row reads that header. On
  `session`, `sign-out`, `bootstrap` and `host-write`, a `Sec-Fetch-Site` that is present and not
  `same-origin` or `none` is refused with 403 `REQUEST_AUTHENTICITY_DENIED` on every method (this
  refuses a sibling application, `same-site`, and a link from another site, `cross-site`). An absent
  `Sec-Fetch-Site` passes.
- **AC-6**: Origin, by kind: on `session` a present Origin must be exactly the Hub origin on every
  method, and a write needs it; `sign-out`, `bootstrap` and `hub-entry` always need exactly the Hub
  origin; `host-write` needs exactly the request's own application or Preview origin. A missing Origin
  where one is needed is refused with 403 `REQUEST_AUTHENTICITY_DENIED`.
- **AC-7**: Mode and form, by kind. On `session`, `sign-out` and `bootstrap` writes, either condition
  alone refuses with 403 `REQUEST_AUTHENTICITY_DENIED`: a present `Sec-Fetch-Mode: navigate`, or a
  form media type (`application/x-www-form-urlencoded`, `multipart/form-data`, `text/plain`), read as
  the `content-type` up to its first `;`, trimmed and lowercased. A write with no `content-type` (a
  body-less write) and a JSON write pass this rule. On `sign-in` a present `Sec-Fetch-Mode` must be
  `navigate`. `navigation` and `sign-in` have no Origin or `Sec-Fetch-Site` rule.

*Order and credential*
- **AC-8**: The order on every listener: the listener's header hook (on the Preview, a closing
  listener answers 503 here); authenticity in `onRequest` (403); Fastify reads, parses and validates
  the body against the route's schema (400, 413, 415); the credential in a root `preHandler` (401,
  503); the route's own `preHandler` and handler. A request that matches no route passes both access
  hooks and answers 404 `NOT_FOUND` with the listener's headers. On the Builder mount, Mastra
  validates its own body schema inside its handler (`@mastra/fastify/dist/index.js:418,549`), so a
  well-formed body that fails Mastra's schema answers 400 after the credential and the Project
  admission; a malformed JSON body answers 400 `REQUEST_JSON_INVALID` before the credential (today 500).
- **AC-9**: The credential step, exhaustive on the row. `session` calls
  `resolveHubSession(digest): Promise<CurrentSession | null>` once; null answers 401
  `AUTHENTICATION_REQUIRED`, a provider failure propagates as today (503
  `IDENTITY_PROVIDER_UNAVAILABLE`); the handler receives `HubSession` (section 4) as its third argument.
  `sign-out` receives the session digest unresolved (no slide, no Keycloak call); an absent or
  malformed session cookie answers 401 `AUTHENTICATION_REQUIRED` there, and the handler answers the
  same 401 when `endHub(digest)` finds no open session. `bootstrap` receives the parsed bootstrap
  token, or 401 `BOOTSTRAP_REQUIRED`. An authenticity refusal makes no session, provider, store or body
  work. On the host listeners the session stays in the handlers; each host route's answer without a
  credential is a ledger row (section 5), not a universal rule.

*One owner per fact*
- **AC-10**: One JSON body parser, `parseJsonBody`, exported from `http/app.ts` and registered by the
  Hub root and by the mount scope right after `registerContextMiddleware`: an empty or whitespace body
  is no body (`undefined`) on every method; any other body is parsed with Fastify's default JSON rules
  (prototype poisoning refused). A route whose schema requires a body then answers 400
  `REQUEST_VALIDATION_FAILED`. The DELETE special case, the failure `REQUEST_JSON_EMPTY` and its
  mapping from `FST_ERR_CTP_EMPTY_JSON_BODY` (`http/app.ts:26`) are gone.
- **AC-11**: The two model account polls change method: `GET .../openai-codex/oauth/poll?loginId=` and
  `GET .../google-ai-pro/login/:loginId` become `POST` with the same path, query or path parameter, and
  answer; the web callers (`features/settings/components/chatgpt-account.tsx:41`,
  `google-ai-pro-account.tsx:44`) send POST with no body. Both callers turn any failure into
  "waiting", so a test drives each caller's exact request against the Hub, not only the route.
  Model accounts are outside the product contract (`contracts/api/product/` names none of their
  routes), so no contract changes. A GET or HEAD to either old path answers 404 `NOT_FOUND`.
- **AC-12**: `previewHostOf(host)` in `mar/module.ts` is the one parser of a Preview host (table in
  section 4). Authenticity, `activePreview`, `preview-entry` and `previewAddress` use it; the
  `routeHostOf` helper (`mar/preview-routes.ts:112`) is gone.
- **AC-13**: Each listener's security headers have one owner, passed to `createHttpApp` in its
  `ListenerPolicy` (section 4), and the walk asserts the header table of section 4 on a 403, a 401, a
  400 from the parser, a 404 and a success, per listener. CSP is compared by directives and nonce
  shape, not by a literal nonce.

*The token, the cookies and the lifetimes*
- **AC-14**: The CSRF token does not exist: no cookie `__Host-conexus_csrf`, no header
  `x-conexus-csrf` read or sent, no column `iam.host_session.csrf_digest`; the functions are
  `iam.open_hub_session(bytea, uuid, text, timestamptz)`, `iam.resolve_hub_session(bytea, timestamptz)`
  and `iam.end_hub_session(bytea)`. `apps/web` reads no cookie, and the four contract generators and
  their clients send no CSRF header. `ResolveCurrentSession`, `SessionRequest`, `requireCsrf`,
  `platform/origin.ts`, the cookie read in `identity-access/module.ts:111-116`, the bootstrap
  cookie-equals-header compare (`identity-access/routes.ts:113,171`) and the failure `ORIGIN_REFUSED`
  are gone; a Preview launch takes the session digest (`launchPreview(session.digest, ...)`,
  `openPreview({ hubSessionDigest })`), with no second hash and no cookie read.
- **AC-15**: `apps/hub/src/http/cookies.ts` holds the six cookie names (section 6) and one options
  object, and is the only module that calls `reply.setCookie` or `reply.clearCookie` or reads
  `request.cookies`. A cookie whose life comes from its session row cannot be set without that row's
  seconds (a type error).
- **AC-16**: `iam.session_lifetimes()` (`STABLE`) returns the composite `iam.session_lifetime`
  (section 7) and is the only place a session lifetime is written in live SQL. Every function that
  opens, slides, rechecks or bounds a session or handoff reads it. The `host_session`, `preview` and
  `handoff` checks hold shape only and call no function. Every writer stores exactly the deadline of
  the oracle table in section 7, one PostgreSQL assertion per row of that table.
- **AC-17**: After `iam.session_lifetimes()` is replaced with the test vector of section 7, on a
  connection that already ran every reader: the next call of each reader stores the new deadline; a
  row written before the change still slides, rechecks and ends through `iam.end_host_session`; and
  `pg_dump` followed by `pg_restore` into a fresh database restores every row of the compared
  relations with equal counts.
- **AC-18**: `apps/hub/src/platform/lifetimes.ts` holds `OIDC_TRANSACTION_SECONDS` (600),
  `APPLICATION_SIGN_IN_COOKIE_SECONDS` (720), `BOOTSTRAP_WINDOW_SECONDS` (600) and `INVITATION_DAYS`
  (14: workspace and application invitations). No other copy of these exists. A PostgreSQL test
  asserts `APPLICATION_SIGN_IN_COOKIE_SECONDS >= OIDC_TRANSACTION_SECONDS + application_handoff`.
- **AC-19**: A PostgreSQL test reads `infra/keycloak/realm-conexus.json` and `iam.session_lifetimes()`
  and asserts `ssoSessionIdleTimeout > hub_idle + provider_recheck`,
  `ssoSessionMaxLifespan >= hub_absolute` and `>= application_absolute`, and
  `accessTokenLifespan <= provider_recheck` (the realm sets it against the recheck,
  `infra/keycloak/README.md:18`).

*Proof*
- **AC-20**: `scripts/check-access-owner.mjs`, run by `npm run verify:quick`, finds zero violations in
  the scan boundary of section 10. Each predicate has a fixture that fails the check with that
  predicate's identity.
- **AC-21**: The route walk builds the three listeners with their real registrars, records every
  route through `onRoute`, and asserts that the recorded set equals the ledger's rows exactly (a route
  the ledger does not name fails, and so does a ledger row with no route). For each row it sends the
  ledger's sample and asserts the literal answers of section 5: the authenticity refusals of the
  row's kind (403, never 400 or 401, with every condition wrong at once included), the answer without
  a credential, and the security headers. Spies assert zero session, provider and store calls on every
  authenticity refusal. A boot test covers each refusal of AC-3. A delayed-body test holds the last
  byte of a `session` write, ends the session after `onRequest` has passed, releases the byte, and
  asserts 401 and that the handler did not run.
- **AC-22**: Live, on the local Conexus in the driven browser: sign in, a Builder turn through the
  mount, a model account login poll, a Preview, and an application sign in all work; the requests
  carry `Origin` on writes and `Sec-Fetch-Site: same-origin`; a link to a mount stream URL clicked
  from another site answers 403.
- **AC-23**: The documents say the same: `docs/reference/security-and-authority.md` (no token; the
  rule, the four rules and the lifetime relations point at `http/access.ts`, the ledger,
  `iam.session_lifetimes()` and the AC-19 test), `docs/reference/mastra-boundary.md`,
  `single-owner-map.md` and `data-and-persistence.md` (no token), `docs/evidence/single-session/README.md`
  (the Keycloak SSO idle limit is 2400, the README still says 1800), the product contract's
  `x-conexus-browser-request-authenticity` (`fetchMetadata: SAME_ORIGIN_OR_NONE`,
  `fallback: EXACT_ORIGIN_ON_WRITE`, `forms: REFUSED`), `shapes.md` (the decided line), and principle 6
  in `codebase-principles.md` (enforced by `scripts/check-access-owner.mjs`; the "hand-read CSRF
  cookie" review line goes).

## Decision

One closed table of access kinds, read by one pure function, enforced by one hook pair per listener
(authenticity before the body, the credential after it); routes declared through a typed definer per
kind, so the handler receives the grant its kind gives; HEAD only on page reads; deny by default at
boot; every route named in a ledger the walk test enforces; the CSRF token removed in the same part the
enforcer lands, with Fetch Metadata, the exact Origin and a form refusal covering what it covered; one
owner each for the body parser, the Preview host and each listener's headers; one composite SQL owner
for the session lifetimes, read by the functions and never by a check; one cookie module; a
type-checker CI check that keeps every reader inside its owner. No new dependency.

**Implementation skills**: `conexus-development` (`.agents/skills/conexus-development/`), `mastra`
(the installed `@mastra/fastify` registers the mount's routes).

## Rationale

Reasoning, options, the evidence from the spikes, the review and the cross check: see
[rationale.md](rationale.md).

## Feature design

### 1. The access kinds

`apps/hub/src/http/access.ts` owns the closed set and the table. Nothing else in the Hub decides
authenticity.

| Kind | Routes | Methods | Fetch site | Mode and form | Origin | Credential, and the handler's grant |
| --- | --- | --- | --- | --- | --- | --- |
| `navigation` | SPA shell, static files, application host `no-access`, application and Preview pages `/` and `/*` | PAGE | any | any | none | none; `{ document: boolean }` |
| `sign-in` | Hub OIDC `GET /protocol/oidc/login` and `/callback`; application host `GET /__conexus/sign-in/complete` | GET | any | navigate when present | none | none; `{}` |
| `session` | every `/api/control/**` route except IAM-02 and IAM-03, and the 9 Builder mount routes | ANY | same-origin or none | writes: not navigate, no form type | Hub when present; required on writes | live Hub session; `HubSession` |
| `sign-out` | `DELETE /api/session` | WRITE | same-origin or none | not navigate, no form type | Hub, required | session cookie, unresolved; `{ digest }` |
| `bootstrap` | `POST /api/control/accounts` | WRITE | same-origin or none | not navigate, no form type | Hub, required | bootstrap cookie; `{ token }` |
| `host-write` | application host `sign-out` and `api/:operation`; Preview `api/:operation` | WRITE | same-origin or none | any | own, required | none; `{}` |
| `hub-entry` | Preview `POST /__conexus/preview-entry` | WRITE | any | any (it is a form) | Hub, required | none; `{}` |

Methods: `PAGE` is GET and HEAD; `GET` is GET only; `WRITE` is POST, PUT, PATCH or DELETE; `ANY` is
GET or a write, never HEAD. The boot check refuses any other method on the kind (AC-3).

**Rule 1, a read changes nothing.** A HEAD runs its GET's handler and drops the body, so a GET that
changes state does so on HEAD too, unseen. The table therefore gives HEAD only to `navigation`, whose
routes read. The routes that run a transaction on GET (the OIDC pair, and the application sign-in
completion, which redeems a one-use handoff) are `sign-in`, GET only. The mount's four GETs open the
conversation's live session; they stay GET because Mastra and `EventSource` own them, and they are
`session`, so a cross-site or sibling link is refused by Fetch Metadata and a foreign Origin by AC-6.
The two model account polls, which finish a login, become POST (AC-11). An application page answers a
signed-out document navigation by starting a sign in (it sets the binding cookie and redirects); a
HEAD is never a document navigation, so a HEAD there answers 401 and sets nothing.

`document` is `Sec-Fetch-Mode: navigate` and `Sec-Fetch-Dest: document` (the application host's
redirect-or-401 choice, today `mar/application-host-routes.ts:180`). `hub-entry` takes any Fetch
Metadata because the Hub page posts the entry form to the Preview host; the Hub Origin plus the
one-use 30 s handoff is its proof. The Hub listener carries `navigation`, `sign-in`, `session`,
`sign-out`, `bootstrap`; a host listener carries `navigation`, `sign-in`, `host-write`, `hub-entry`
(`LISTENER_KINDS`).

```ts
type AccessKind = 'navigation' | 'sign-in' | 'session' | 'sign-out' | 'bootstrap' | 'host-write' | 'hub-entry'
type AccessRow = Readonly<{
  methods: 'PAGE' | 'GET' | 'WRITE' | 'ANY'
  fetchSite: 'SAME_ORIGIN_OR_NONE' | 'ANY'
  mode: 'NAVIGATE' | 'NOT_NAVIGATE_ON_WRITE' | 'ANY'   // NOT_NAVIGATE_ON_WRITE also refuses form media types on writes
  origin: 'NONE' | 'HUB_WHEN_PRESENT_REQUIRED_ON_WRITE' | 'HUB_ALWAYS' | 'OWN_ALWAYS'
  credential: 'NONE' | 'HUB_SESSION' | 'HUB_SESSION_COOKIE' | 'BOOTSTRAP_COOKIE'
}>
export const ACCESS: Readonly<Record<AccessKind, AccessRow>>
const MALFORMED: unique symbol
type HeaderFact = string | undefined | typeof MALFORMED   // undefined: absent
type RequestFacts = Readonly<{
  write: boolean; origin: HeaderFact; fetchSite: HeaderFact; fetchMode: HeaderFact
  formBody: boolean; document: boolean; host: HeaderFact
}>
type Grants = {
  navigation: Readonly<{ document: boolean }>
  'sign-in': Readonly<Record<never, never>>
  session: HubSession
  'sign-out': Readonly<{ digest: HubSessionDigest }>
  bootstrap: Readonly<{ token: BootstrapToken }>
  'host-write': Readonly<Record<never, never>>
  'hub-entry': Readonly<Record<never, never>>
}
```

`RequestFacts` is parsed once in `onRequest`. A header that is absent is `undefined`; a single string
is itself; anything else is `MALFORMED`, which equals no expected value, so a row that reads the
header refuses it and a row that does not read it ignores it. `formBody` is the media type of AC-7
being one of the three form types; an absent `content-type` is not a form. `write` is the method being
POST, PUT, PATCH or DELETE. Every switch on `AccessKind`, `methods`, `mode`, `origin` and `credential`
is exhaustive.

### 2. Declaring a route

```ts
const route = routes(app)
route.session<{ Body: Ws01Body }>({
  ...WORKSPACE_GENERATED_ROUTES['WS-01'],
  handler: async (request, reply, session) => { /* session.account.accountId */ },
})
route['sign-out']({ ...IAM_GENERATED_ROUTES['IAM-02'], handler: async (_request, reply, { digest }) => { /* endHub(digest) */ } })
await foreignRoutes(app, 'session', async (scope, grant) => {
  scope.addHook('preHandler', async (request) => admitMount(request, grant(request)))
  // new MastraServer({ app: scope, ... }) as today, then parseJsonBody (section 4)
})
```

- `routes(app)` returns one definer per kind. Each calls `app.route({ ...route, config: { access: K },
  handler: (request, reply) => route.handler(request, reply, grantOf(request, K)) })`; the
  `navigation` definer sets `method: 'GET'` and `exposeHeadRoute: true`, the `sign-in` definer
  `method: 'GET'` and nothing else (the server's `exposeHeadRoutes: false` leaves it without HEAD). The kind
  is the method name, so a `navigation` route cannot be written to read a session.
- The enforcer stores `{ kind, grant }` in a request slot keyed by a module-private symbol
  (`decorateRequest`). `grantOf(request, kind)` returns the grant, and throws `INTERNAL_UNEXPECTED`
  with `invariant: 'ACCESS_GRANT_MISSING'` when the slot is empty and `'ACCESS_GRANT_MISMATCH'` when
  the stored kind is not `kind`; both are tested.
- `foreignRoutes(app, kind, register)` registers a child scope whose own `onRoute` stamps
  `config.access = kind` (`@mastra/fastify` 1.5.15 drops route `config`, `dist/index.js:538-555`);
  a route that already carries a different kind is recorded as `ROUTE_ACCESS_CONFLICT`. It hands the
  scope's hooks a typed `grant`. Used for the Mastra mount (`session`) and `@fastify/static`
  (`navigation`).
- S1 inherits this: its generated route object becomes the argument to `routes(app)[kind]`; the
  enforcer and the boot check do not change. S1 may move the kind into the contract per operation.
- Tests build a listener through one helper, `testListener(policyOverrides)`, with a stubbed
  `resolveHubSession` that still receives a digest the enforcer parsed from a real cookie; a test
  route declares its kind through `routes(app)` like any other. The 27 test files that call
  `createHttpApp` move to it.

### 3. The enforcer and the order

`createHttpApp({ policy, registerRoutes, ... })` takes the `ListenerPolicy` (section 4) as a required
argument, builds Fastify with `exposeHeadRoutes: false`, and installs, in this order:
`@fastify/cookie`, `@fastify/helmet` (Hub options as today), `policy.onRequest` (the listener's header
hook, section 4), then `installAccess(app, policy)`, then `registerRoutes`. Fastify runs `onRequest`
hooks in registration order and stops at the first answer or throw, so every refusal carries the
headers an answer carries.

`installAccess`:

1. `onRoute`: push every route options object (array methods included).
2. `onReady`: check every record (AC-3). It runs after every scope's stamp has landed; a root
   `onRoute` that threw would see the mount's routes before their stamp (spike 2).
3. `onRequest`: a request whose route has no `config.access` is the not-found handler and returns at
   once. Otherwise parse the facts, call `authentic`, throw `REQUEST_AUTHENTICITY_DENIED` on `DENY`.
4. Root `preHandler`, after Fastify has read and validated the body: a request with no
   `config.access` returns at once (Fastify runs root `preHandler` hooks for not-found requests too,
   `fastify/lib/handle-request.js:149`). Otherwise run the credential step (AC-9) and store
   `{ kind, grant }`. Root hooks run before a child scope's, so the mount's own `preHandler` already
   sees the grant. A root 401 on a mount stream ends the request before Mastra starts streaming
   (cross check, installed-package probe).

The Builder mount replaces the JSON parser in its scope (`registerContextMiddleware`,
`dist/index.js:646-661`) and passes a raw `SyntaxError`, which the error handler turns into 500
today (spike 2). The mount scope registers `parseJsonBody` right after `registerContextMiddleware`.

### 4. One owner per fact

**The body.** `parseJsonBody` (AC-10) is the one JSON parser. Its empty-body rule is Mastra's (an
empty or whitespace body is no body on every method), because `@mastra/client-js` is a caller the Hub
does not write; the Hub's DELETE-only exception goes with it. The census of every write's body shape
is in section 5.

**The session.** `identity-access/current-session.ts` owns:

```ts
type HubSessionDigest = Buffer & { readonly __brand: 'HubSessionDigest' }
type BootstrapToken = string & { readonly __brand: 'BootstrapToken' }
type HubSession = CurrentSession & Readonly<{ digest: HubSessionDigest }>
const hubSessionDigest = (token: OpaqueToken): HubSessionDigest   // the one SHA-256 of the cookie value
const bootstrapToken = (value: unknown): BootstrapToken | null     // parseOpaqueToken, branded
```

`parseOpaqueToken` (`platform/opaque-token.ts`) returns the branded `OpaqueToken` instead of `string`.
The enforcer parses the cookie, computes the digest once, calls
`policy.resolveHubSession(digest): Promise<CurrentSession | null>` (the composition's adapter over
`hostSessions.resolveHub(digest)`), and grants `{ ...session, digest }`. Nothing downstream hashes the
cookie again.

**The Preview host.** `previewHostOf(host: HeaderFact): PreviewHost | null` in `mar/module.ts`, with
`type PreviewHost = Readonly<{ artifactRevisionId: string; exactHost: string; origin: string }>`.
`previewAddress(artifactRevisionId)` builds its host from the same rule, and the port rule is
`config.ts`'s `authority` (a browser leaves 443 out of Host and Origin). With `<P>` the configured
Preview port and `<id>` a lowercase UUID (PostgreSQL prints UUIDs in lowercase):

| Host header | Port | Result |
| --- | --- | --- |
| `preview-<id>.conexus.localhost:<P>` | `<P>` ≠ 443 | `{ artifactRevisionId: <id>, exactHost: 'preview-<id>.conexus.localhost', origin: 'https://preview-<id>.conexus.localhost:<P>' }` |
| `preview-<id>.conexus.localhost` | 443 | the same, origin without a port |
| `preview-<id>.conexus.localhost:443` | 443 | null |
| `preview-<id>.conexus.localhost` | `<P>` ≠ 443 | null |
| any other port | any | null |
| an uppercase letter anywhere, a trailing dot, a non-UUID id, another domain, absent, `MALFORMED` | any | null |

A null host answers 404 on `navigation` (as today) and 403 on `host-write` and `hub-entry`
(authenticity). A well-formed host that names no live Preview passes authenticity and the handler's
binding check refuses it, as today. `exactHost` is the value stored in the Preview binding, so the
binding compare and the authenticity origin come from one parse.

**The headers.** `http/app.ts` exports `type ListenerPolicy`:

```ts
type ListenerPolicy =
  | Readonly<{ listener: 'hub'; hubOrigin: string; previewCspSource?: string; resolveHubSession(digest: HubSessionDigest): Promise<CurrentSession | null> }>
  | Readonly<{ listener: 'preview' | 'application'; hubOrigin: string; ownOrigin(host: HeaderFact): string | null; onRequest: onRequestHookHandler }>
```

`createMarModule` returns `previewPolicy` and `applicationPolicy`; their `onRequest` hooks are today's
header hooks moved out of the registrars (`mar/preview-routes.ts:84-91`,
`mar/application-host-routes.ts:72-77`), and the CSP builders stay where they are. `hub.ts` builds the
Hub policy (`resolveHubSession` from the identity module) and passes each policy to its
`createHttpApp`. No new import edge is needed (section 8). The headers each listener sends, on every
answer:

| Header | Hub | Application | Preview |
| --- | --- | --- | --- |
| `content-security-policy` | helmet, as today: nonce, the three style hashes, the configured Preview `frame-src`, `connect-src`, `form-action` (`http/app.ts:75`) | `applicationHostContentSecurityPolicy` (`platform/application-csp.ts:13`) | `previewContentSecurityPolicy(hubOrigin)` |
| `referrer-policy` | `strict-origin` | `no-referrer` | `no-referrer` |
| `x-frame-options` | `SAMEORIGIN` | `DENY` | absent |
| `cache-control` | as the route sets it | `no-store` | `no-store` |
| `access-control-allow-origin`, `-credentials` | absent | absent | Hub origin and `true`, on GET and HEAD only, read from `request.method` |
| helmet's COOP and CORP `same-origin`, `origin-agent-cluster: ?1`, HSTS `max-age=31536000; includeSubDomains`, `x-content-type-options: nosniff`, `x-dns-prefetch-control: off`, `x-download-options: noopen`, `x-permitted-cross-domain-policies: none`, `x-xss-protection: 0`, no `x-powered-by` | yes | yes | yes |

The Preview's CORS grant no longer reads Origin: it is constant, so `Vary: Origin` goes (a cache may
share one answer across origins because the answer no longer depends on the Origin). The Preview's
`onRequest` keeps its shutdown answer (503 when the listener is closing), before authenticity.

### 5. The route ledger

`tests/implementation/access/route-ledger.mjs` exports one row per route record of the three
listeners:

```ts
type LedgerRow = Readonly<{
  listener: 'hub' | 'preview' | 'application'
  method: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  url: string                                  // the pattern as onRoute records it
  kind: AccessKind
  body: 'JSON' | 'NONE' | 'FORM'               // what the real caller sends
  sample: Readonly<{ path: string; body?: unknown }>   // concrete, valid params and a schema-valid body
  withoutCredential: Answer                    // right Origin and Fetch Metadata, no cookie
}>
type Answer = Readonly<{ status: number; code?: FailureCode; location?: string; html?: true }>
```

The walk (AC-21) derives the authenticity refusals from the row's kind (every one is 403
`REQUEST_AUTHENTICITY_DENIED`) and reads `withoutCredential` from the row. Samples use 43-character
base64url tokens (`platform/opaque-token.ts:4`) whose digests the stubbed resolver maps to named
sessions, and the Hub, application and Preview origins of the test policy. A route registered only
when its dependency is configured (Google AI Pro, `@fastify/static`, the mount) is in the ledger, and
the walk builds every listener with every optional registrar on.

**Default answers by kind** (each row repeats the literal value):

| Kind | `withoutCredential` |
| --- | --- |
| `session` | 401 `AUTHENTICATION_REQUIRED` |
| `sign-out` | 401 `AUTHENTICATION_REQUIRED` |
| `bootstrap` | 401 `BOOTSTRAP_REQUIRED` |
| `navigation` on the Hub | 200, the SPA shell or the file |

**Host rows**, whose answers are the handlers' own and stay as today:

| Listener | Route | Kind | `withoutCredential` |
| --- | --- | --- | --- |
| application | `POST /__conexus/sign-out` | `host-write` | 204, both cookies cleared (idempotent) |
| application | `POST /__conexus/api/:operation` | `host-write` | 401 `APPLICATION_SIGN_IN_REQUIRED` |
| application | `GET /__conexus/sign-in/complete` | `sign-in` | 403 HTML (no binding); with binding and a valid handoff, 303 to `/` |
| application | `GET`, `HEAD /__conexus/no-access` | `navigation` | 403 HTML (public) |
| application | `GET`, `HEAD /` and `/*` | `navigation` | document navigation: 303 to the Hub `/protocol/oidc/login`; otherwise 401 `APPLICATION_SIGN_IN_REQUIRED` |
| preview | `POST /__conexus/preview-entry` | `hub-entry` | not a form: 415; missing or spent handoff: 403 |
| preview | `POST /__conexus/api/:operation` | `host-write` | 403 `PREVIEW_REFUSED` |
| preview | `GET`, `HEAD /` and `/*` | `navigation` | 403 |

**Write bodies.** Prefixes: `C=/api/control`, `W=C/workspaces/:workspaceId`, `P=C/projects/:projectId`,
`A=C/model-accounts`, `B=P/builder-session`, `M=/api/builder/agent-controller/:controllerId/sessions`.
Read from the callers by the cross check; the walk's positive cases prove each.

- JSON, 18 owned writes: `POST C/accounts`; `POST C/workspaces`; `POST W/invitations`;
  `PUT W/members/:accountId`; `POST P/application-access`; `POST W/projects`; `POST W/connections`;
  `POST P/connection-bindings`; `POST C/installation/administrators`; `PUT A/:provider/api-key`;
  `POST A/anthropic/oauth/start`; `POST A/anthropic/oauth/complete`; `POST A/openai-codex/oauth/start`;
  `POST A/google-ai-pro/login/start`; `POST A/google-ai-pro/login/complete`; `POST B/messages`;
  `POST B/preview`; `POST B/runs/:builderRunId/cancel`.
- No body, 10 owned writes: `DELETE /api/session`; `DELETE W/roster/:entryKind/:entryId`;
  `DELETE P/application-access/:entryKind/:entryId`; `DELETE P`;
  `POST W/connections/:connectionId/authentication-check`; `DELETE W/connections/:connectionId`;
  `DELETE P/connection-bindings/:bindingId`; `DELETE C/installation/administrators/:accountId`; and
  the two polls, `POST A/openai-codex/oauth/poll`, `POST A/google-ai-pro/login/:loginId`.
- Mount, 5 writes: JSON for `POST M`, `POST M/:resourceId/model`, `POST M/:resourceId/tool-suspension`,
  `PUT M/:resourceId/state`; no body for `POST M/:resourceId/abort`.
- Form, 1: the Preview `preview-entry`, which is `hub-entry`. No Hub write uses a form media type.

### 6. Cookies

`http/cookies.ts`:

| Key | Name | Life |
| --- | --- | --- |
| `hubSession` | `__Host-conexus_session` | browser session; the row's deadline decides |
| `bootstrap` | `__Host-conexus_bootstrap` | browser session; the context's deadline decides |
| `oidcState` | `__Host-conexus_oidc_state` | browser session; the transaction's deadline decides |
| `applicationSession` | `__Host-conexus_app` | from the session row (`redeemed.maxAgeSeconds`) |
| `applicationSignIn` | `__Host-conexus_app_signin` | `APPLICATION_SIGN_IN_COOKIE_SECONDS` |
| `previewSession` | `__Host-conexus_preview` | from the session row |

One options object: `{ path: '/', secure: true, httpOnly: true, sameSite: 'lax' }`, no Domain.
`setCookie(reply, name, value, ...maxAge)` demands the seconds for the two row-lived cookies by type.
`readCookie` accepts every name except the two credential cookies; `readCredentialCookie` is imported
only by `http/access.ts`.

### 7. Session lifetimes

```sql
CREATE TYPE iam.session_lifetime AS (
  hub_absolute interval, hub_idle interval, application_absolute interval,
  provider_recheck interval, preview interval, application_handoff interval, preview_handoff interval);
CREATE FUNCTION iam.session_lifetimes() RETURNS iam.session_lifetime
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT ROW(interval '8 hours', interval '30 minutes', interval '8 hours', interval '5 minutes',
                   interval '15 minutes', interval '60 seconds', interval '30 seconds')::iam.session_lifetime $$;
```

- `STABLE`, not `IMMUTABLE`: no check or index reads it, and an IMMUTABLE zero-argument call may be
  folded into a cached plan of a PL/pgSQL reader, so a replacement would not reach a warm connection.
- The `AS $$ SELECT ... $$` form, not `RETURN expr`: the catalog snapshot hashes `prosrc`, which is
  empty for a `RETURN` body, so a changed lifetime would not show as drift (spike 2).
- Owner `iam_owner`, `REVOKE ALL FROM PUBLIC`; only `iam_owner` functions call it.
- Checks hold shape only, with no duration and no function call: `host_session_hub_check` (`idle_expires_at`
  set, `idle_expires_at <= absolute_expires_at`, `absolute_expires_at > started_at`,
  `provider_checked_at >= started_at`, the token pairing, no project, Preview or parent);
  `host_session_application_check` (project set, `absolute_expires_at > started_at`,
  `provider_checked_at >= started_at`, the token pairing, no idle, Preview or parent);
  `host_session_preview_check` (Preview and parent set, `absolute_expires_at > started_at`, no
  project, token, provider check or idle); `preview_lifetime_check` (`expires_at > opened_at`);
  `handoff_ttl_check` (`expires_at > minted_at`); `host_session_end_check` unchanged.
- Why no check reads the owner: rows are written only by `iam_owner` SECURITY DEFINER functions that
  read it (`hub_iam_runtime` holds only EXECUTE), so a check copy guarded nothing they do not; and a
  check that reads a function breaks on the first change of that function (old rows fail on their
  next UPDATE, a `pg_dump`/restore loses the table; spike 1). The oracle table below holds every
  writer instead.
- A future change of a lifetime is one migration that replaces `iam.session_lifetimes()`; rows keep
  the deadlines they were written with.

**Oracle** (`L` is `iam.session_lifetimes()`, `now` the function's `p_now`). Each row is one AC-16
assertion, run at the boundary instant and one microsecond on each side where the row has a compare:

| Writer | Column or decision | Value |
| --- | --- | --- |
| `open_hub_session` | `absolute_expires_at`, `idle_expires_at` | `now + L.hub_absolute`, `now + L.hub_idle` |
| `resolve_hub_session` | idle slide | `least(now + L.hub_idle, absolute_expires_at)` |
| `resolve_hub_session` | ends as `EXPIRED` | `now >= idle_expires_at` or `now >= absolute_expires_at` |
| `resolve_hub_session`, `resolve_application_session`, `resolve_preview_session` (the parent Hub row) | provider recheck due | `provider_checked_at <= now - L.provider_recheck` (due at equality) |
| `mint_application_handoff` | handoff `minted_at`, `expires_at` | `p_authenticated_at`, `p_authenticated_at + L.application_handoff` |
| `open_preview` | Preview `expires_at`; Preview handoff `expires_at`; returned deadline | `now + L.preview`; `now + L.preview_handoff`; `now + L.preview` |
| `redeem_handoff` | redeemable | `now < handoff.expires_at` (strict) |
| `redeem_handoff`, APPLICATION | session `started_at`, `absolute_expires_at`, `provider_checked_at` | `handoff.minted_at`, `handoff.minted_at + L.application_absolute`, `handoff.minted_at` |
| `redeem_handoff`, PREVIEW | session `started_at`, `absolute_expires_at` | `now`, `least(now + L.preview, preview.expires_at)` |

The AC-17 test vector replaces the owner with `(6 hours, 20 minutes, 6 hours, 3 minutes, 10 minutes,
45 seconds, 20 seconds)`, runs every oracle row again on the same warmed connection (each reader
called once before the replacement), keeps one open Hub, application and Preview row written before
it, and compares `iam.host_session`, `iam.preview` and `iam.handoff` row counts and contents before
the dump and after the restore.

TypeScript lifetimes (AC-18) live in `platform/lifetimes.ts` because `mar/` may not import
`identity-access/`. The Keycloak realm relation is the AC-19 test, not prose.

### 8. Module boundaries (import law)

`scripts/check-import-law.mjs` changes in part 2, each edge with a positive and a negative fixture:

- `http/` may import `identity-access/current-session.ts` (the session contract types),
  `platform/opaque-token.ts` and `platform/lifetimes.ts`, besides what it imports today. It still may
  not import identity stores, `mar/` or any other module's internals.
- Every route file may import `http/access.ts` and `http/cookies.ts`; the allowances for
  `platform/origin.ts` go with the file.
- `identity-access/store.ts`, `identity-access/membership.ts`, `identity-access/application-access.ts`
  and `mar/` may import `platform/lifetimes.ts`.
- No edge from `hub.ts` to `http/access.ts`, and none from `http/app.ts` to `mar/` or
  `platform/application-csp.ts`: the policies travel as values (section 4).

### 9. The migration

Migration 0060 (the next number after 0059 at merge), starting from the bodies 0058 leaves:

- Create `iam.session_lifetime` and `iam.session_lifetimes()`.
- Drop and re-add the five checks of section 7; drop `iam.host_session.csrf_digest`.
- Drop `open_hub_session(bytea, bytea, uuid, text, timestamptz)`,
  `resolve_hub_session(bytea, bytea, timestamptz)`, `end_hub_session(bytea, bytea)`; create
  `open_hub_session(bytea, uuid, text, timestamptz)`, `resolve_hub_session(bytea, timestamptz)` and
  `end_hub_session(bytea) RETURNS text` (from the 0050 body: row lock, sealed token returned once).
- Replace `resolve_application_session`, `resolve_preview_session`, `redeem_handoff`,
  `mint_application_handoff` and `open_preview` with bodies that read the owner, keeping 0058's
  removal of the lazy deletes.
- Owner `iam_owner`, `SET search_path`, `REVOKE ALL FROM PUBLIC`, grants to `hub_iam_runtime`
  as today. The digest constant and census entry in `scripts/run-hub-migrations.mjs`, the catalog
  snapshot and the role register are regenerated.
- Unchanged: `iam.end_host_session`, `iam.hub_session_live`, `iam.record_provider_check`,
  `iam.reap_expired`, `iam.purge_project`, every `*_expires_at` column, `ended_reason`.

### 10. The check's boundary

`scripts/check-access-owner.mjs` has two scans.

- **Owner predicates**, over the TypeScript program of `apps/hub/tsconfig.json` (production sources,
  generated files included, `tests/**` excluded), with the type checker resolving aliases,
  destructuring and computed keys: a key whose type is a string literal counts as that literal (so
  `request.headers[API_KEY_HEADER]`, `x-goog-api-key`, in `builder/google-ai-pro/router.ts:12,19`
  passes), and a key of type `string` is a violation. Outside `http/access.ts` and `http/cookies.ts`,
  zero of: a read of `origin`, `sec-fetch-*` or `cookie` on request headers; `request.raw.headers` or
  `rawHeaders`; `request.cookies`; `setCookie`, `clearCookie` or a `set-cookie` header write on a
  reply or `reply.raw`; a string literal starting `__Host-`; an object literal holding `sameSite`,
  `httpOnly` or `secure` and one more of `path`, `secure`, `httpOnly`, `sameSite`; an import of
  `readCredentialCookie`. Node's own listeners in `hub.ts` (the TLS server) are not requests and are
  outside the predicates.
- **Text scan**: zero `document.cookie` in `apps/web/src`; zero `x-conexus-csrf` in `apps/`,
  `packages/`, `scripts/`, `tests/`, `contracts/` and `docs/evidence/`, generated files included.
- **Fixtures** live in `scripts/fixtures/check-access-owner/`, which both scans skip. Each fixture
  names the predicate it violates; the self test runs the checker on each and asserts it fails with
  exactly that predicate.
- **Baseline** (part 1 only): `scripts/check-access-owner.baseline.json` records each violation as
  `{ predicate, file, symbol }` (no line numbers), and a count per predicate may only fall. Part 3
  deletes the file and the check asserts zero.

### 11. API surface

Routes added or removed: none. Method changed: the two model account polls (AC-11). HEAD removed from
every route except the pages. Behavior changes, all with existing codes:

| Request | Today | After |
| --- | --- | --- |
| `session`, `sign-out`, `bootstrap` or `host-write` with `Sec-Fetch-Site: cross-site` or `same-site` | GET passes; write refused by Origin | 403 `REQUEST_AUTHENTICITY_DENIED`, GET included |
| `session` GET with a foreign Origin (a sibling's fetch) | passes | 403 |
| Hub write posted by an HTML form (navigate, or a form media type) | refused by the token | 403 |
| HEAD to an API, mount or sign-in route | runs the GET handler | 404 `NOT_FOUND` |
| Mount write with a malformed JSON body | 500 | 400 `REQUEST_JSON_INVALID` |
| Mount write, bad Origin and no session | 401 | 403 |
| A write with a bad body and a bad Origin | 400 on 14 routes | 403 |
| A write with a malformed body and no session (Hub, mount) | 401 or 400 by route | 400 |
| A JSON-labelled write with an empty body | 400 `REQUEST_JSON_EMPTY` (DELETE excepted) | no body; 400 `REQUEST_VALIDATION_FAILED` only where the schema needs one |
| Host write with a bad or missing Origin | 403 `ORIGIN_REFUSED` or a bare 403 | 403 `REQUEST_AUTHENTICITY_DENIED` |
| `host-write` on a Host that is not one of the listener's | 404 | 403 |
| `GET .../openai-codex/oauth/poll`, `GET .../google-ai-pro/login/:loginId` | GET | POST, same answer; GET 404 |
| Hub sign in response | sets `__Host-conexus_session` and `__Host-conexus_csrf` | sets `__Host-conexus_session` only |
| Preview GET or HEAD from the Hub page | ACAO only when the Origin is the Hub's, with `Vary: Origin` | ACAO Hub always, no `Vary: Origin` |

### 12. Value sourcing

| Value | Source |
| --- | --- |
| Hub origin | `config.origin` (`platform/config.ts`), in every policy |
| Application origin | `applicationOrigin(address, slug)` (`platform/config.ts:68`), as `applicationPolicy.ownOrigin` |
| Preview origin | `previewHostOf(host).origin` (`mar/module.ts`), as `previewPolicy.ownOrigin` |
| `write` | the method is POST, PUT, PATCH or DELETE |
| `origin`, `fetchSite`, `fetchMode`, `document`, `host` | the request headers, three-state facts, parsed once in `onRequest` |
| `formBody` | the media type of AC-7 |
| Session digest | `hubSessionDigest(parseOpaqueToken(cookie))`, once, in the enforcer |
| `HubSession` | `policy.resolveHubSession(digest)` plus the digest |
| Bootstrap token | `bootstrapToken(cookie)` |
| Session lifetimes | `iam.session_lifetimes()` |
| OIDC, sign-in cookie, bootstrap, invitation windows | `platform/lifetimes.ts` |
| Expected answers per route | the ledger (section 5) |

### 13. Key invariants

- A route the Hub serves has exactly one access kind and one ledger row, or the Hub does not start
  and the walk fails.
- Only a `navigation` route answers HEAD.
- Only `http/access.ts` reads Origin, Fetch Metadata and the two credential cookies; only
  `http/cookies.ts` touches cookies (AC-20).
- A handler's session argument exists exactly when its kind is `session`, and `grantOf` checks it.
- A session is resolved after the request body has arrived.
- A session lifetime is written once in live SQL, and no check reads it.
- An authenticity refusal happens before any credential, store or body work, with the same security
  headers as an answer.

### 14. Security model

The rule: the browser proves where a request comes from (exact `Origin` on every write, refused when
missing; `Sec-Fetch-Site` same-origin or none on every API request; no navigation and no form body on
a Hub API write), and the `__Host-` session cookie, which only the Hub can set or read, proves who it
is. Together they cover what the token covered: a sibling application on the same site cannot read
or set a `__Host-` cookie of the Hub host (spike 1) and is refused by the exact Origin and by
`same-site`; an HTML form injected into a Hub page, which sends the Hub Origin and `same-origin`, is
refused by its mode or its media type (review). A GET runs no transaction except the declared
`sign-in` routes and the mount's GETs, and no HEAD runs one at all. Residual cases: a browser older
than March 2023 sends no `Sec-Fetch-Site`, so the mount's GETs stay open to a cross-site link in it
(effect: cost on the person's own conversation, not authority); XSS on the Hub origin defeats any of
these, the token included. On the host listeners the session is checked in the handler, and the
ledger names each host route's answer. Authorization stays in the SQL functions, unchanged.

### 15. Critical test scenarios

- Boot: a plain `app.get('/x')` fails `ROUTE_ACCESS_UNDECLARED`; a `navigation` POST, a `bootstrap`
  GET and a HEAD on a `session` route fail `ROUTE_ACCESS_METHOD`; a `host-write` on the Hub fails
  `ROUTE_ACCESS_FOREIGN`; a `routes(scope).navigation` route inside a `foreignRoutes(app, 'session')`
  scope fails `ROUTE_ACCESS_CONFLICT`; the real three apps boot (AC-3).
- The walk of AC-21 over the ledger, with the security headers of section 4 on every answer class.
- HEAD: the mount stream, an API GET, the three `sign-in` routes and the two old poll paths answer 404
  and run no handler; an application page and a Preview page answer HEAD as today.
- Facts: mixed-case and parameterized media types (`Text/Plain; charset=utf-8`,
  `multipart/form-data; boundary=x`), an absent `content-type` on a body-less write, navigate alone,
  a form type alone, a `MALFORMED` Origin.
- The order on bootstrap, a session write with a schema, a mount write (malformed JSON, then
  schema-invalid JSON without a session) and a host write (AC-8); the delayed-body test; unknown GET,
  POST and a HEAD to a `sign-in` route answer 404 `NOT_FOUND` with the listener's headers.
- The polls: the web's exact request shapes (POST, no body; Codex with `?loginId=`, Google with the
  path parameter) answer as today.
- `grantOf` with an empty slot and with a mismatched kind.
- Sign-out without a cookie (401 from the enforcer) and with a dead session (401 from the handler).
- `previewHostOf`: every row of section 4's table, and a well-formed unknown Preview against a foreign
  host.
- PostgreSQL: every oracle row of section 7, `iam.end_host_session` on an expired open row under the
  new checks, AC-17's replacement and restore, AC-18's window relation and the AC-19 realm test.
- `check-access-owner.mjs` fixtures, one per predicate (AC-20).
- Live, AC-22.

## Build plan

Each part ends green: `npm run verify:quick`, the suites it touches, and the `rest` and `live` groups.
A part that changes `contracts/`, the failure table or a generator runs `npm run generate` in the same
part. No part carries a second security model: the token leaves in the part the enforcer lands.

1. **The check, with today's baseline.** `scripts/check-access-owner.mjs` (section 10) with its
   fixtures and baseline, in `verify:quick`. Satisfies AC-20 only against the baseline.
2. **The access rule, end to end.** In one part, because the token and the guard copies are the same
   code: `http/access.ts`, `http/cookies.ts`, `platform/lifetimes.ts` (all four constants, since the
   cookie module needs the sign-in cookie's seconds), the `HubSession` types, `createHttpApp({ policy })`
   with `exposeHeadRoutes: false` and the header hooks moved into the Preview and application
   policies, `previewHostOf`, `parseJsonBody`, every route of the three listeners through `routes(app)`
   or `foreignRoutes`, the import law edits of section 8, `testListener` and the 27 test files, the
   ledger and the walk. Removed in the same part: the 11 guard copies, each file's
   `signedIn`/`admittedActor`/`header` helper, the `resolveCurrentSession` plumbing, the five `mar/`
   Origin reads, `routeHostOf`, `platform/origin.ts`, the CSRF token end to end (migration 0060 of
   section 9, `host-sessions.ts` taking digests, the OIDC callback, `identity-access/module.ts`,
   `apps/web/src/app/http.ts`, the four generators, `scripts/builder-eval/{hub,run,plan-bench}.mjs`
   and the q1.8 evidence script), the failures `ORIGIN_REFUSED` and `REQUEST_JSON_EMPTY`, and the
   CSRF cases in the existing suites. The two polls become POST in the Hub and the web. Then
   `npm run generate` (failure table, log codes, the four clients), the migration digest, catalog
   snapshot and role register. The PostgreSQL oracle, replacement and realm tests. Baseline lowered.
   Satisfies AC-1 to AC-19 and AC-21; AC-20 still against a baseline; AC-23 not yet.
3. **The zero and the documents.** The baseline file is deleted and the check asserts zero; the
   documents of AC-23; the product contract's authenticity block, then `npm run generate` once more
   so the four generators' root digests match. Satisfies AC-20 and AC-23.

Verification (`/jm-check verify S3`) proves AC-22 live.

## Consequences

- Positive: one place answers how a request is checked; the GETs with side effects close (two by
  method, the sign-in routes by losing HEAD, the mount's by Fetch Metadata); no HEAD runs a
  transaction; the mount's writes, which never checked the token against the database, follow the
  same rule as every other write; one order on every listener; a session is checked after the body,
  not before; changing a lifetime is one function.
- Positive: the ledger turns "every route is covered" from a claim into a test that fails on a new
  route nobody classified.
- Positive: the product contract's browser authenticity block, promised and partly unenforced,
  becomes true.
- Negative: part 2 is wide (eleven route files, 27 test files, the migration, the web and the
  generators in one part); the gain is no temporary model to build and then remove.
- Negative: a request with a malformed body and no session now answers 400 before 401; on the mount,
  a schema-invalid body without a session still answers 401 first, because Mastra validates inside
  its handler.
- Negative: a pre-2023 browser without `Sec-Fetch-Site` keeps the mount's GETs open to a link (cost
  only).
- Negative: on the host listeners a new route can still forget its session check; the ledger row and
  the walk are the guard.
- Negative: the database no longer bounds a session's length in a check; the owner function is the
  only guard, the oracle holds every writer to it, and only `iam_owner` functions write the rows.
- Negative: the mount's parser is registered right after `@mastra/fastify`'s
  `registerContextMiddleware`, an internal order of version 1.5.15; an upgrade that moves it breaks
  the malformed-JSON test of AC-8, which is the guard.
- Neutral: the migration restates eight function bodies in full, about 200 SQL lines.

## Migration plan

**Strategy**: no compatibility layer (development data). Part 2's migration drops the column and the
old function signatures in the same commit that changes their callers.
**Phases**: parts 1 to 3 above, in one pull request.
**Rollback**: revert the part's commit and its migration on a development database.
**Risks**: a person signed in during the deploy keeps a `__Host-conexus_csrf` cookie the Hub no longer
reads (harmless, it expires with the browser session). Running the migration on the pilot needs the
operator's approval, as every migration does.

## Follow-up

- Spec 0008 slice 1 reads `iam.session_lifetimes()` when it makes the session length a setting; its
  AC-16 literal replacement is done here.
- S1 carries the access kind in the contract per operation, generated into the route object; the
  ledger's `kind` column then reads from it.
- The Preview host rule (`preview-<id>.conexus.localhost`) is fixed in code today; a configurable
  Preview domain belongs to the deployment work, and `previewHostOf` is its one owner when it comes.
