# 0014. Rationale

## Context

On `125d7a6c` the Hub has three browser-facing listeners (Hub, Preview, application) and a Builder
Mastra mount on the Hub listener. A census by mechanism (TypeScript compiler API) and a runtime
enumeration of every route found:

- The rule "exact Origin plus the `x-conexus-csrf` header equal to the `__Host-conexus_csrf` cookie"
  written in 11 functions; `x-conexus-csrf` read 12 times in the Hub and 5 in the web (the web's
  `http.ts` and the generated clients parse the cookie by hand); `const CSRF_COOKIE` declared in 10
  files; 7 cookie names in 23 literals; 7 identical cookie options objects; 16 Origin reads, one of
  them by `!==` instead of `isExactOrigin`.
- Two CSRF models: 24 writes check the token's digest in the database through
  `resolveCurrentSession(request, true)`; the 5 writes of the Builder mount check only cookie equals
  header (a pair the database never issued is admitted on all 5).
- No write escapes the Origin check (all 26 Hub writes and 5 mount writes refuse a wrong and a
  missing Origin, proved by running). GETs are never checked, and four change state: the mount's
  `GET sessions/:resourceId` and `/stream` open the conversation's live session and sandbox, and two
  model account polls finish a login. A link on another site carries the `Lax` cookie.
- Four request orders: the Hub answers 403 before 401, the mount 401 before 403, 14 of 26 writes
  400 before any guard, and the hosts their own way; two codes for the same refusal
  (`REQUEST_AUTHENTICITY_DENIED`, `ORIGIN_REFUSED`) and four bare `reply.code(403)`.
- Session lifetimes: 18 live interval literals in migration 0026 (6 in checks, 12 in function
  bodies); the same lifetime written in 2 to 5 places; the Keycloak realm relation held only in
  prose. In TypeScript, the OIDC window and the sign-in cookie are two constants of one window, and
  the invitation length is written twice.
- Authorization already has one owner: 0 role comparisons in TypeScript, 32 SQL functions decide.
- The product contract promises `fetchMetadata: SAME_ORIGIN_ONLY`, and nothing enforces it.

Constraints: the operator decided the session lifetimes stay fixed (8 h and 30 min), with one owner
that a later configuration spec reads. S4 (spec 0013) lands first and rewrites two of the same SQL
functions. No new dependency. Development data, no compatibility layers.

## Options considered

Three designs were sketched in parallel by different models, each from a different starting
hypothesis, then judged against a rubric (smallest surface, security correctness, honest types, one
owner per fact, subtraction, fit, and the wave's principles).

### Option 1: a closed access table, typed definers per kind, one enforcer on all listeners (chosen)

Routes declare a kind through `routes(app)[kind]`; the handler receives the kind's grant; one
`onRequest` hook reads the table and one root `preHandler` resolves the credential; boot fails on a
route without a kind, checked at `onReady`.

- Pro: a `navigation` route cannot compile a session read; the rule is data read by one pure function;
  the hosts lose their own Origin code; deny by default covers the Mastra mount and static files.
- Pro: one order on every listener (403, then the body's 400, then 401) comes from Fastify's lifecycle,
  not from each handler.
- Con: every owned route's registration call changes; one runtime narrowing remains (`grantOf`).

### Option 2: the native route `config` field plus throwing readers

Routes keep `app.route({ config: { access } })`; handlers call `hubSession(request)`, which throws on
the wrong kind. Hosts keep their own rules.

- Pro: the smallest diff at each call site; S1 keeps the native field.
- Con: a handler on a `navigation` route compiles a session read and fails only at request time.
- Con: the hosts keep five Origin reads and their own code, and get no deny by default.

### Option 3: a typed registrar with a request-keyed grant map

Modules export route definitions; one registrar registers them and passes a typed context; the mount
reads the grant from a `WeakMap`.

- Pro: compile-time context like option 1.
- Con: sign-out resolves the session, adding a Keycloak call that today's sign-out does not make, so
  an outage would block signing out.
- Con: the hosts stay separate, as in option 2.

### Option 4: fix in place

Centralize the guard copies into one `requireSession(request)` each handler calls; keep the token,
make the mount check its digest.

- Pro: the smallest change.
- Con: deny by default is gone (a handler that forgets the call compiles, boots and serves); the body
  is still parsed before the guard; the four GETs stay open unless each gets a call.

### Keeping the CSRF token (considered under every option)

- Pro: OWASP and Django still list a synchronizer token as the primary defense.
- Con: the token proves that the request came from a page that can read the Hub origin's cookie; the
  exact Origin, required and refused when missing on every write, proves the same, and the `__Host-`
  session cookie cannot be set or read by a sibling host. Go 1.25's `CrossOriginProtection` and
  Rails' `:header_only` mode drop the token on the same reasoning; this rule is stricter than Go's
  (a missing Origin on a write is refused).
- Con of dropping it, found in review: an HTML form injected into a Hub page (no script; the CSP
  allows a same-origin form) sends the Hub Origin and `same-origin`, and today only the token stops
  it. The table closes this without a token: a Hub API write refuses `Sec-Fetch-Mode: navigate` and a
  form content type, and a form can avoid neither.

## Rationale

Option 1 wins on the forces that matter here. Agents write most of this code and copy the neighbor,
so the shape must make the wrong route impossible to write, not just reviewable: the typed definer
does that where option 2's throwing reader does not. Deny by default must cover routes the Hub does
not register itself (Mastra, static), which the `onReady` check does after the scope stamps land,
where a throwing `onRoute` fails too early (spike 2). The hosts answer the same question ("is this
write from the page it claims?"), so the same table answers it; their session models differ and stay
in `host-sessions.ts`. Option 3's sign-out regression and option 4's lack of deny by default rule
them out.

The token goes because, with the form refusal, it adds no proof the table does not, and keeping it
keeps two models and the hand-read cookie in the web.

The credential is resolved after the body, not with the authenticity check: resolving it before the
body lets a client hold the body back and land a write after the session ended (review, probed on
Fastify). The price is that a bad body with no session answers 400 before 401, which is now the same
on every listener.

The lifetime owner is a `STABLE` composite read only by function bodies, against all three sketches, which
read it from checks too: a check that calls a replaceable function stops validating on the first
change and breaks a backup restore (spike 1), while shape-only checks survive the change (spike 2).

## Evidence from the spikes

The spikes ran against the first draft: their order, their `IMMUTABLE` owner and their throwaway
migration numbers are historical; the facts below are what they proved.

- **Browser** (spike 1, headless Chromium, HTTPS on `*.localhost`): same-origin writes carry `Origin`
  and `Sec-Fetch-Site: same-origin`; same-origin GET, `EventSource` and streaming fetch carry no
  Origin but carry `Sec-Fetch-Site`; a sibling host is `same-site`; a link from another site is a
  `cross-site` navigation; a 302 chain back to the Hub arrives as `none`, `same-site` or `cross-site`
  depending on the chain (so OIDC routes must not get the Fetch Metadata rule); a sibling cannot read
  or set a `__Host-` cookie of the Hub host.
- **No proxy**: the Hub terminates TLS itself (`hub.ts:252-285`, `trustProxy: false`).
- **Token consumers**: 49 files, 20 of them tests; no non-browser client writes to the Hub; tests use
  `inject` with an explicit Origin and no `Sec-Fetch-Site`, so an absent header must pass.
- **Lifetime in a check** (spike 1): a check may call an IMMUTABLE function, but replacing it does not
  revalidate rows; an old row then fails its next UPDATE, and `pg_dump`/`pg_restore` loses the table.
- **Deny by default** (spike 2): on the real Hub app, 124 route records boot with kinds; removing one
  fails naming it; the 13 mount routes and the static HEAD+GET route get their kind only through the
  scope stamp; the Preview and application apps behave the same.
- **Order** (spike 2, with the first draft's credential in `onRequest`; the review moved it after the
  body): 403, 401, 400 holds on bootstrap and a session write; the mount answers 500
  for a malformed body because Mastra replaces the JSON parser; host writes parse the body before the
  handler's session check.
- **Migration** (spike 2): the 0060 sketch applies on the 56 migrations plus S4's 0057 to 0059; a Hub
  session gets exactly 8 h; the idle slide and the `EXPIRED` end work; `iam.end_host_session` ends an
  expired row under the new checks; after replacing the owner with 6 h, old rows update and a dump
  restores all rows; the catalog snapshot handles the composite and the dropped column; a `RETURN`
  body hashes as empty, so the owner uses `AS $$ SELECT ... $$`.

## Evidence from the review

Three models (Claude Opus, Claude Sonnet, Codex GPT-6 Astra) reviewed the first draft adversarially.
All three accepted removing the token against cross-origin and sibling attackers. The draft changed
for: the session resolved before the body (probed: authentication in `onRequest`, a body completed
after the session ended, gives 200 and one effect; in `preHandler`, 401 and none); the scriptless
form; the enforcer registered before helmet and the host header hooks, which would strip security
headers from every refusal (Fastify runs `onRequest` hooks in registration order and stops at the
first throw); the OIDC mode rule outside the table (now the `sign-in` kind); the Preview origin with
no named source (now `previewOriginOf`); the import law, which forbade the imports the design needs
(now section 7); `foreignRoutes` silently overwriting a declared kind (now `ROUTE_ACCESS_CONFLICT`
and a checked `grantOf`); `IMMUTABLE` folding into cached plans (now `STABLE`); one constant hiding
the sign-in cookie relation (now two, with a test); the model account polls as GETs that change
state (now POST). Node joins a repeated header into one string (run), so the facts parser takes
single strings only and needs no `rawHeaders`.

## Evidence from the cross check

A second model (Codex GPT-6 Astra) read the revised draft for decision completeness and returned 21
findings and "not ready"; it found no flaw in the design itself and confirmed by probe on the
installed packages that a root 401 ends a mount stream before Mastra starts it. HQ checked six
findings in the source (the CSRF digest skipped when the header is absent,
`identity-access/host-sessions.ts:203` and `0026_single_session.sql:217`; Mastra validating its body
inside the handler; the application sign-in completion redeeming on GET; the Google poll sending POST
without a body; the mount refusing every non-GET today; Fastify's default HEAD twins).

The findings shared four premises, so the spec answers each premise once instead of patching 21
places:

1. **A read changes nothing.** HEAD runs a GET's handler, so every GET with an effect also had a
   hidden HEAD (the mount's GETs, the application sign-in completion). Fastify's HEAD twins are now
   off, and only page reads answer HEAD. Go's `CrossOriginProtection`, Rails and Django all leave GET
   and HEAD unchecked on the premise that they are safe, and Mastra's own Fastify adapter skips HEAD
   (`server-adapters/fastify/src/index.ts:740` in the fork); the table makes that premise true here
   instead of assuming it. (Findings 2, 3, 4, 8, 20.)
2. **The rule was specified, the routes were not.** Universal claims ("every host route refuses
   without a session", "zero store calls on every refusal") broke on routes whose answers are their
   own. The ledger names each route's answer and body shape, and the walk fails on any route it does
   not name. (Findings 9 to 14.)
3. **Two owners of one fact, inside the spec.** The empty body (Hub and Mastra parsers), the Preview
   host (authenticity and the binding lookup), the headers (three hooks) and the session shape each
   get one owner. The empty-body rule takes Mastra's because `@mastra/client-js` is a caller the Hub
   does not write. (Findings 4, 5, 6, 7, 15, 16.)
4. **A temporary model is where the bug was.** The interim CSRF path through `resolveHub` skipped the
   database compare whenever the header was missing. Landing the enforcer and the token removal in
   one part removes the interim instead of specifying it. (Findings 1, 18.)

The rest were build details now fixed in the spec (the check's boundary, finding 17; the lifetime
oracle, finding 19). The cross check's text is `crosscheck/critique.md` in the study notebook.

## Not verified

- The full Hub test suites against migration 0060 (the spike changed SQL, not the TypeScript stores).
- `Sec-Fetch-Site` on the local Conexus in the driven browser on all three listeners (AC-22 proves it
  at verification).
- The write body census (index section 5) was read from the callers by the cross check; the walk's
  positive cases prove it in the build.
- The Keycloak behavior with other realm values.

## References

Project sources: the S3 study census and route enumeration; spec 0013; spec 0008; `contracts/api/product/openapi.yaml`
(`x-conexus-browser-request-authenticity`). Practices: Go 1.25 `net/http.CrossOriginProtection`;
OWASP CSRF Prevention and Session Management cheat sheets; Fetch Metadata request headers.
