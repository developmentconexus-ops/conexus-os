# Single session qualification evidence

**Task:** [Single session qualification](../../tasks/single-session-qualification.md)

**Verdict: ACCEPT**, given by the operator on 2026-09-25 in the chat with the manager. With refresh-token rotation off, one session
model (`iam.host_session`) and one handoff (`iam.handoff`) in PostgreSQL serve the Hub, application hosts and
Preview hosts. On the pilot, after a person was disabled or signed out in Keycloak, no request to the Hub, the
application or their Preview that started five minutes or more later was allowed, and the first one after five
minutes was refused (measured to the 10-second polling interval of the proof, see S6). A Preview survived a Hub restart. A handoff presented on the wrong host was refused
and still redeemed on its own host within 60 s. Every Stage 2 Q3.6 negative case still failed. No falsifier of
task section 8 fired:

1. The probe's falsifier did not hold (no old token accepted after the SSO session ended), and no disabled or
   signed-out person kept a host past five minutes (S6).
2. No Q3.6 negative case succeeded (S6).
3. No property of section 4 was lost. Two answers changed. The realm's SSO idle limit is 40 minutes, so that it
   outlasts the Hub's own 30-minute idle limit: the operator decided it in the chat with the manager on
   2026-09-25. A due check that cannot reach Keycloak answers 503 on every Hub route, the Factory's included, and
   keeps the session: the operator accepted it on 2026-09-25 in the chat with the manager, replacing the 401 D4 had
   named for the Factory's routes (see the review and the decisions index).
4. No handoff was consumed by a failed presentation, and none redeemed twice (tests, and S6 `handoff-on-other-host`,
   `handoff-redeemed-twice`).
5. A Preview did not die on a Hub restart (S6 `preview-survives-hub-restart`).
6. One session model, one handoff and one liveness check remain: `iam.session`, `iam.application_session`,
   `iam.application_handoff`, `preview-access.ts`, the MAR route map and the claim protocol are gone.

## S0. Native census

Versions installed in this worktree (`npm ci` at `6274f205`): `@mastra/core` 1.67.0, `@mastra/server` 1.67.0,
`@mastra/factory` 0.15.0, `@mastra/code-sdk` 1.7.2, `@mastra/auth` 1.1.3, `@mastra/fastify` 1.5.11,
`openid-client` 6.8.7, `@fastify/cookie` 11.1.2, `fastify` 5.12.1, `zod` 4.5.2, `undici` 7.29.0, `pg` 8.23.0,
`@types/node` 24.13.3 on Node 24.20.0. PostgreSQL is 17.10 (`.github/workflows/verify.yml`). Keycloak on the
pilot is **26.7.2** (`kc.sh --version` in `conexus-s7-keycloak`, image digest
`sha256:c2a17fe407e892196d0b7cf9cef54e60952d6c372a9205f661a9efa0911463b0`). The base was the operator's
Q3 Mastra-first review; each row below was checked again at these versions. The Mastra claims of that review held
at 1.67.0 and 0.15.0. Its Keycloak claims came from 26.3.2 and 26.5.2; the probe below covers 26.7.2. The
Context7 index holds Keycloak documentation up to 26.5.2 only, so a "26.5.2" source below is the newest versioned
document and the probe is the 26.7.2 evidence.

| Mechanism | Native offer examined | Source | Verdict |
| --- | --- | --- | --- |
| Session (Hub, application, Preview) | Mastra `ISessionProvider`, `CookieSessionProvider`, `MemorySessionProvider`. The cookie provider is stateless and its `validateSession`, `destroySession` and `refreshSession` take no effect (`_sessionId` unused), so it cannot revoke, end on a grant change or check Keycloak. The memory provider is the same in-memory model this task deletes. Mastra's auth "secures Studio UI and API routes". No session library is installed (`@fastify/session` absent, `cookie-signature`, `jose` and `oauth4webapi` are transitive). Keycloak's Client Session Max is per client and starts at the first login, not at the handoff. | `node_modules/@mastra/core/dist/_types/@internal_auth/dist/session/{index,cookie,memory}.d.ts` (1.67.0); `@mastra/auth/dist/docs/references/docs-auth-overview.md` (1.1.3); `ls node_modules \| grep -i session` | **KEEP** an opaque server-owned session in PostgreSQL, one model instead of three. PostgreSQL CHECKs and `SECURITY DEFINER` functions are the native part. |
| Handoff | OIDC authorization code with PKCE is a single-use handoff, but it needs every application host as a `redirect_uri` of the client, and Keycloak accepts a wildcard only at the end of a redirect URI, never in the host. Registering hosts means a Keycloak admin credential in the Hub (non-goal, STOP law). Token exchange is a non-goal. Mastra `ISSOProvider.handleCallback(code, state)` assumes one callback host. | Keycloak 26.5.2 `server_admin/topics/clients/oidc/con-basic-settings.adoc` ("Wildcards are permitted at the end of a URL pattern"); `@mastra/core/.../@internal_auth/dist/index.d.ts` (1.67.0) | **KEEP** one Hub-minted, single-use, 60 s, browser-bound handoff. **SIMPLIFY** to one primitive for the application and the Preview (the Preview entry grant in memory goes). |
| Liveness check | The refresh grant already tests the user and the SSO session: "User disabled", "Session not active" (`TokenManager.java`, 26.5.2 and 26.3.2; probe case `disabled` and `logout` on 26.7.2). Rotation is optional and off by default (`revokeRefreshTokenHelp`, `changes.adoc`, 26.5.2). Token introspection was not examined: the refresh also resets the SSO idle timer (probe case `idle`), so one call does both jobs. Back-channel logout does not report a disable and stays out of scope. | Keycloak 26.5.2 `TokenManager.java`, `messages_en.properties`, `changes.adoc`; `openid-client` 6.8.7 `refreshTokenGrant`; probe | **KEEP** `refreshTokenGrant`. **SIMPLIFY** the protocol around it: rotation off, and the claim, wait loop and clock correction go (S1). |
| Sealed refresh token | `createFactorySecretEncryption`: versioned AES-256-GCM envelope with decrypt-only previous keys. The prefix `mastra:factory-secret:v1:` is a private constant of `secret-encryption.js`, not exported. | `node_modules/@mastra/factory/dist/secret-encryption.{d.ts,js}` (0.15.0) | **KEEP**. S5 adds a test that seals with the installed Factory and asserts the prefix the CHECK constraints require, so a `v2` envelope fails a test instead of a login. |
| CSRF | No CSRF facility in Mastra or Fastify 5.12.1. `@fastify/csrf-protection` is not installed; `@fastify/*` installed: `cookie`, `helmet`, `static` and support packages. Fetch Metadata (`Sec-Fetch-Site`) is missing before Safari 16.4 (Q3 boundary 9), and sibling application hosts are same-site, so it does not replace an exact Origin. | `ls node_modules/@fastify`; Q3 evidence | **KEEP** the two policies (Hub Origin plus double-submit, application exact Origin plus `application/json`). |
| Origin check | Three copies: `exactOrigin` in `identity-access/routes.ts:21` and `workspace/routes.ts:11`, `strictOrigin` in `mar/preview-routes.ts:90`. Nothing native. | repository grep | **SIMPLIFY** to one helper in `platform/` (S5). |
| Opaque token, digest | Node `crypto.randomBytes` and `crypto.hash('sha256', value, 'buffer')` (`crypto.hash` is in `@types/node` 24.13.3). PostgreSQL 17 has `sha256(bytea)` but no strong-random bytes function without an extension, so the token is minted in TypeScript and only its digest is stored. Five copies of `randomBytes(32).toString('base64url')` and `createHash('sha256')`, two `OPAQUE` regexes. | `node_modules/@types/node/crypto.d.ts:3963`; repository grep | **KEEP** the primitives. **SIMPLIFY** to one generator, one parser and one digest in `platform/` (S5). |
| Slug | The PostgreSQL CHECK `application_slug_check` on `iam.application` is the boundary. Two TypeScript copies of the regex and the `--` rule: `platform/config.ts:42` and `identity-access/application-session.ts:33`. | `apps/hub/migrations/0022_application_access.sql:22`; repository grep | **KEEP** the CHECK. **SIMPLIFY** to one TypeScript parser (S5). |
| Caller | Mastra `RequestContext` reserved keys `MASTRA_RESOURCE_ID_KEY` and `MASTRA_MESSAGE_AUTHOR_KEY` apply to Mastra agents, tools and workflows, and the handlers here are not Mastra tools. `zod` 4.5.2 is already the runner's schema library. | `@mastra/core/dist/docs/references/docs-server-request-context.md` "Reserved keys" (1.67.0); `app-runner/requests.ts:9` | **KEEP** `{ db, caller }`. **SIMPLIFY** the hand-written `parseCaller` inside `z.custom` to a strict zod `callerSchema` with `Caller = z.infer<...>` (S5). The `RequestContext` mapping is a non-goal. |
| Authority per request | PostgreSQL `SECURITY DEFINER` functions with a fixed `search_path`, CHECKs and partial indexes: `iam.has_application_access`, `iam.account_access_scope`. | migrations 0023, 0024 | **KEEP**. |
| Host listener | Fastify `constraints: { host }` on one listener would fold the hosts, but a separate listener isolates the CSP and CORS hooks. `@mastra/fastify` 1.5.11 mounts Mastra routes, not this. | `server.ts`; Q3 review | **KEEP**. |
| Hub session seam | `HubSessionAuthProvider` implements Mastra's `MastraAuthProvider` over `resolveCurrentSession`; the Factory gates its routes through it. | `apps/hub/src/builder/hub-session-auth.ts`; `@mastra/factory/dist/auth.d.ts` (0.15.0) | **KEEP** `resolveCurrentSession` as the one seam. The session model behind it changes; its callers do not. |

Nothing in the installed Mastra, Keycloak 26.x, PostgreSQL 17 or an installed dependency replaces the session, the
handoff or the CSRF policy of this repository. The two mechanisms the census simplifies are the claim protocol (S1)
and the duplicated helpers and session models (S3, S5).

## S0. Keycloak probe

**Rotation off holds on Keycloak 26.7.2.** Every case below passed with `revokeRefreshToken: false`, and the
falsifier of the task ("an old refresh token accepted after the SSO session ended") did not fire.

The probe is [`scripts/keycloak-refresh-probe.mjs`](../../../scripts/keycloak-refresh-probe.mjs). It signs a
probe user in through the realm's real authorization-code flow with PKCE (login form, cookie jar) and refreshes
with the same `openid-client` call the Hub uses.

**Where it ran.** A disposable container from the pilot's own image digest (`kc.sh` 26.7.2), holding a copy of
the pilot realm `r1f` taken read-only from the running pilot (`partial-export`, secrets masked and replaced; no
theme, no keys, no users) and one probe user. The pilot's realm and users were not touched. The pilot's realm has
`revokeRefreshToken: true`, `refreshTokenMaxReuse: 0`, `ssoSessionIdleTimeout: 1800`. The scratch realm sets the
SSO idle limit to 60 s so that the `idle` case takes 80 s, and the rotation flag as each run states. The
confirmation on the pilot itself, with a real 1800 s limit, waits for the operator's go-ahead to touch the pilot
realm.

| Case | Result on 26.7.2 (rotation off) |
| --- | --- |
| Four concurrent refreshes of one token | All four `ACTIVE`; the original token still refreshes afterwards. |
| Disabled user | Refresh refused: `invalid_grant`, `User disabled`. The user was enabled again. |
| Keycloak logout (RP-initiated, `id_token_hint`) after four refreshes | The original token and the four returned tokens all refused: `invalid_grant`, `Session not active`. This is the falsifier check, and no old token was accepted. |
| Refresh resets the SSO idle timer | Session A, refreshed at 40 s, refreshed again at 80 s (limit 60 s): alive. Session B, never refreshed: refused at 80 s (`Token is not active`, the refresh token's own expiry follows the idle limit). |
| `account-console`, `security-admin-console` | Both complete a sign-in with PKCE and refresh, with the pilot's client settings. |

**Control, rotation on** (the pilot's setting today): four concurrent refreshes gave one success and three
`invalid_grant` (`Session doesn't have required client` twice, `Maximum allowed refresh token reuse exceeded`
once), and the original token stopped working. That is the problem the claim protocol of migration 0024 was built
around, and it is gone with rotation.

**On the new realm.** The operator replaced the pilot's `r1f` realm with one named `conexus`, built from
[`realm-conexus.json`](../../../infra/keycloak/realm-conexus.json), which holds only what differs from Keycloak's
defaults. Diffing the pilot's realm against a default realm of the same image showed that `r1f` differed in the
theme and locale settings, Q3's rotation, `sslRequired: none` and a duplicate client. The probe was rerun on a
scratch container provisioned by [`provision.sh`](../../../infra/keycloak/provision.sh) (import, then the Hub
client's secret): the same five cases held, in [`probe-scratch-conexus-realm.json`](probe-scratch-conexus-realm.json).
The same script imported the four pilot people with their ids and password hashes.

**On the pilot's own Keycloak.** The old container `conexus-s7-keycloak` was stopped and kept, renamed
`conexus-s7-keycloak-r1f`, and `provision.sh` created `conexus-keycloak` on the pilot port with the `conexus`
realm and the pilot's people. On it, with the Conexus login theme and a disposable user that was deleted
afterwards ([`probe-pilot-conexus-realm.json`](probe-pilot-conexus-realm.json)), `concurrent`, `disabled`, `logout` and
`clients` held at the realm's real 1800 s idle limit. The `idle` case then ran in real time on the same
realm ([`probe-pilot-conexus-realm-idle.json`](probe-pilot-conexus-realm-idle.json)): a session refreshed at 20 minutes
was still alive at 40 minutes, and a session never refreshed was refused at 40 minutes. All five cases hold on the
pilot's Keycloak 26.7.2 with rotation off.

The Hub follows the new realm: the pilot env names issuer `…/realms/conexus` and client `conexus-hub`, and the four
Accounts' issuer was updated in one transaction (backup `conexus_s7-before-realm-conexus-20260924T201926.dump`). The
old container and the scratch containers and volumes were removed by the operator. The probe needed one change for the themed page: the
Keycloakify theme embeds the form action as `loginAction` instead of rendering the stock form.

Records: [`probe-scratch-rotation-off.json`](probe-scratch-rotation-off.json),
[`probe-scratch-rotation-on-control.json`](probe-scratch-rotation-on-control.json). In the control file
`"held": false` is the expected outcome, not a failure of the probe.

Two defects of the probe itself were fixed before the recorded run: the logout case first tried tokens of another
session, and the idle case required a description that Keycloak words differently for an expired refresh token.

### Rerun

```bash
PROBE_CLIENT_SECRET=… PROBE_USER_PASSWORD=… PROBE_ADMIN_PASSWORD=… \
node scripts/keycloak-refresh-probe.mjs --issuer <realm issuer URL> --username <probe user> \
  --admin-user <admin> --sso-idle-seconds <realm ssoSessionIdleTimeout> \
  --redirect-uri <the client's registered redirect URI> --out probe.json
```

`--loopback-host hub.conexus.localhost` resolves the pilot's `.localhost` name to 127.0.0.1 and
`NODE_EXTRA_CA_CERTS` trusts the local CA, as in the Q3 rerun.

## S6. Pilot proof

The pilot ran `feat/single-session` at `572fb6a8` on 2026-09-25: migration `0026_single_session.sql` applied after
a backup (`conexus_s7-before-0026-20260925T110312.dump`; `run-hub-migrations` verdict PASS against the catalog
snapshot; the migration ended every open session), the realm `conexus` with `ssoSessionIdleTimeout` 2400, and the
Hub and runner from `~/single-session/`. The operator authorized each pilot change through the manager: the
migration, the realm setting, disabling and re-enabling `conexus-test-operator` and `funcionario-teste`, the
Keycloak logout, and `REFRESH_TOKEN` events during the run (before: `eventsEnabled: false`, no types; after: the
same, [`s6-keycloak-events-before.json`](s6-keycloak-events-before.json),
[`s6-keycloak-events-after.json`](s6-keycloak-events-after.json); every user read back `enabled: true`).

The member is the test operator (`conexus-test-operator`, a member of `sdasdsa`), whose saved Keycloak password
signed them in without anyone typing. The Owner (`conexus_admin`) and the employee (`funcionario-teste`) were signed
in by the operator in visible browser windows ([`scripts/q3-sign-in.mjs`](../../../scripts/q3-sign-in.mjs), now with
a banner naming who signs in). The first Owner window was used by mistake for the employee: the Hub refused the
application-only Account and no session or state was kept, as Q3.6 expects; the attempt was discarded.

The levers are [`scripts/q3-negative-proof.mjs`](../../../scripts/q3-negative-proof.mjs) for the Q3.6 and review cases
and [`scripts/single-session-proof.mjs`](../../../scripts/single-session-proof.mjs) for the cases this task added.
Each record holds the request, the answer and whether the expected result held.

| S6 case | Request | Answer | Record |
| --- | --- | --- | --- |
| Every Q3.6 negative case | the Q3 script's `main`, `control`, `expired` and `caller` phases, with the member and the employee | 28 cases (22 in `main` with the employee, 1 `control`, 1 `expired`, 4 `caller`), all held; a member-only `main` run before the employee signed in also held its 9: the employee is refused at the Hub (callback 403, no Hub cookie), on the Preview host (403), on every Control Plane route (401/403) and on the other application (no-access); a caller or author in the input is refused (400); a session value planted before sign-in is replaced; the eight-hour limit ends a session | [`s6-q3-main-with-employee.json`](s6-q3-main-with-employee.json), [`s6-q3-main.json`](s6-q3-main.json), [`s6-q3-control.json`](s6-q3-control.json), [`s6-q3-expired.json`](s6-q3-expired.json), [`s6-q3-caller.json`](s6-q3-caller.json), [`s6-employee-note.png`](s6-employee-note.png) |
| Handoff on another application's host | one handoff on `pedidos-de-ferias`, then on its own host without the binding, then with it, then again | 403, 403, 303 with `__Host-conexus_app` inside 60 s, 403 | `handoff-on-other-host` in the `main` records (member and employee runs) |
| Preview across a Hub restart | Preview opened at 11:10:29Z (launch 201, entry 303, page 200, entry replayed 403) on the Hub process started at about 11:06:57Z (`server.js` PID 2016841, elapsed 3 min 53 s when read at the restart); that process stopped at about 11:10:52Z and a new one started at 11:10:56Z (`hub starting` line); the same Preview cookie | 200, no new sign-in; the Hub session that opened it (started 11:07:25Z) also survived the restart and served until attempt 1 below ended it | [`s6-single-session.json`](s6-single-session.json) `preview-opens`, `preview-survives-hub-restart` |
| Employee disabled in Keycloak | `funcionario-teste` disabled at 11:41:41Z; an application request every 20 s | last allowed at 11:46:02Z (261 s), first refused 11:46:22Z (281 s), 401 | [`s6-q3-employee-disabled.json`](s6-q3-employee-disabled.json) |
| Hub user disabled | `conexus-test-operator` disabled at 11:18:40Z with a Preview open; the Hub and the Preview every 10 s | Hub and Preview last allowed at 292 s, refused at 302 s (401, 403); Hub session `PROVIDER_USER_DISABLED`, token dropped; Preview `PARENT_ENDED` | `hub-user-disabled-loses-hub-and-preview` |
| Keycloak logout ends the Hub | `conexus-test-operator` signed out in Keycloak (admin logout) at 11:24:03Z with a Preview open | last allowed at 291 s, refused at 301 s; Hub `PROVIDER_SESSION_ENDED`; Preview `PARENT_ENDED` | `keycloak-logout-ends-hub-and-preview` |
| Four concurrent requests with a due check | the member's application session aged six minutes; four page requests (`GET /`) at once, a route that answers 200 past authority without the runner's admission bound | 200, 200, 200, 200; session open, check recorded; Keycloak logged exactly four `REFRESH_TOKEN` events and no error for that user in that window | [`s6-single-session.json`](s6-single-session.json) `concurrent-due-check-all-served` (events on for the run and off again: [`s6-keycloak-events-before-concurrent.json`](s6-keycloak-events-before-concurrent.json), [`s6-keycloak-events-after-concurrent.json`](s6-keycloak-events-after-concurrent.json)). An earlier run through the API gave 404, 404, 429, 404 (429 is the Project's admission bound of two) with four events: [`s6-q3-review-with-events.json`](s6-q3-review-with-events.json), [`s6-keycloak-refresh-events.json`](s6-keycloak-refresh-events.json) |
| #234 grant | the Owner grants `funcionario-teste@gmail.com` in the Hub (IAM-12), after Q3 had left the grant revoked | 200, an invitation; the employee's sign-in claimed it (one grant, no membership, one application session) | `owner-grants-again` |
| #234 re-grant | the Owner grants again while the employee holds the grant | 200, `kind: grant`, the same grant, no invitation opened | `owner-regrants-held-grant` |
| #234 revoke | the Owner revokes (IAM-13) while the employee calls the API every second | 204, access list empty; last allowed request 11:41:06.028Z, first refused 11:41:07.043Z | `owner-revokes-grant`, [`s6-q3-revoke.json`](s6-q3-revoke.json) |
| #234 revoke holds | the revoked employee opens the application again | lands on `/__conexus/no-access` | `revoked-employee-signs-in-again` |
| #234 grant after revoke | the Owner grants again after the revoke, and the employee opens the application | an invitation, then the application (`/`) | `owner-grants-after-revoke`, `employee-signs-in-after-new-grant` |
| Review and verification cases on the new code | the Q3 script's `review` and `verification` phases | navigation-only sign-in, the application CSP, one read per file, parallel sign-ins, a token under a foreign key ending the session (`CUSTODY_CHANGED`): all held | [`s6-q3-review.json`](s6-q3-review.json), [`s6-q3-verification.json`](s6-q3-verification.json) |

**A failed attempt, kept.** The first run of the Hub-disable case
([`s6-single-session-attempt-1.json`](s6-single-session-attempt-1.json)) is recorded FAILED: its tool required the
first refusal within 300 s while polling every 20 s, and the refusal came at 310 s. That criterion was stricter than
the property and did not record the last allowed request, so the run could not show whether the property held. The
tool now uses the criterion below and polls every 10 s; the rerun above held. It also exits with an error when a case
fails or no case runs, so a failed case no longer passes silently.

**The five-minute criterion and its resolution.** Task section 8 rejects the hypothesis if a disabled or signed-out
person keeps any host past five minutes. `scripts/single-session-proof.mjs` holds a case only when a request was
allowed after the event, no request that started 300 s or more after it was allowed, the first request after 300 s
was refused, and the Preview's session ended with its Hub session (`PARENT_ENDED`). The proof polls every 10 s, so it
places the refusal between 300 s and 310 s; it cannot resolve the instant inside that interval. Keycloak refreshes
only when a request finds the five-minute check due, so the refusal comes with the first request after the check
that follows the event. The recorded runs: disable 292 s allowed and 302 s refused, logout 291 s and 301 s, on both
the Hub and the Preview. The application case of the Q3 script polls every 20 s: 261 s allowed, 281 s refused.

**Provenance of the reruns.** The Preview openings of the disable rerun (11:18:37Z) and the logout run (11:24:01Z)
held (`preview-opens`), but their records went to a scratch file in the session's temporary directory, which was
cleaned when the session resumed. The test operator signed in each time through `~/conexus-test-session.sh`, which
logs in with the saved password when the Hub session is gone; it keeps no record either. What the pilot database
still holds is in [`s6-pilot-session-rows.json`](s6-pilot-session-rows.json): the test operator's Hub sessions
started at 11:07:25Z (ended `PROVIDER_USER_DISABLED` at 11:17:42Z, attempt 1), 11:18:36Z (ended
`PROVIDER_USER_DISABLED` at 11:23:42Z, the disable at 11:18:40Z) and 11:24:00Z (ended `PROVIDER_SESSION_ENDED` at
11:29:05Z, the logout at 11:24:03Z), and the logout run's Preview session (started 11:24:01Z, ended `PARENT_ENDED` at
11:29:05Z). The disable rerun's Preview row was removed at a later launch, once it had ended, as the design does. The
tool now records the Preview host, the Hub session behind it and the Hub's start time in every opening.

## Independent review

Two challengers read the frozen candidate against the task and the owners, without the author's
summary and without each other's report: Codex (`gpt-6-astra`, read-only) and a fresh Claude Opus
subagent. A first Claude challenger on Fable was stopped before it finished, since the operator
excludes that model for cost, and its partial result was not used. Every finding was classified
against the task and the owners; the table says how each was resolved.

| Round, reviewer | Finding | Resolution |
| --- | --- | --- |
| 1, Codex (`b3dd88db`) | `export-users.sh` left the database copy and its directories world-writable. | `umask 077`; the throwaway container runs as this user (`0f015c91`). |
| 1, Codex | A Hub without the Builder and Factory no longer started: the sealing key came from the Factory runtime. | The credential key is `HubConfig.secretKey` for every Hub (`0f015c91`). |
| 1, Codex | The launch response's `expiresAt` became the 30 s entry deadline. | `iam.open_preview` answers the Preview's own end (`0f015c91`). |
| 1, Codex | The evidence held S0 only, and no upgrade of a populated database. | A test upgrades a 0025 database with an open Hub session, an open application session and a handoff (`0f015c91`). S6 below. |
| 2, Opus (`0f015c91`) | `workspace-http` built a Hub configuration without the key. | Fixture fixed (`880ab936`); CI caught it too. |
| 2, Opus | Hub sign-out failed with 503 while a due check found Keycloak down, and the session stayed open. | `iam.end_hub_session` ends the session on its CSRF digest and never asks Keycloak; tested with Keycloak down (`ec4b09dc`). |
| 2, Opus | Factory routes answered 503, not the 401 recorded for D4. | Kept 503, proposed to the operator, who accepted it on 2026-09-25 in place of D4's 401: the Hub's preHandler runs before Mastra's auth, and 503 says the truth (nobody signed out). The error handler matches the error's code, not any 503. Tested on a Factory route (`ec4b09dc`). |
| 2, Opus | Keycloak's 1800 s SSO idle limit could sign a Hub user out after about 26 idle minutes, since the token is refreshed only when the five-minute check is due. | Realm `ssoSessionIdleTimeout` 2400 in `realm-conexus.json` (`ec4b09dc`); the operator decided it in the chat with the manager on 2026-09-25, and the pilot realm took it before S6. |
| 2, Opus | `iam.preview` and ended Preview sessions grew without bound (the memory map was capped at 4,096). | The next launch removes every ended Preview and its sessions; tested (`ec4b09dc`). |
| 2, Opus and Codex | `export-users.sh` kept the mode of an existing output file. | It refuses an existing file and writes with `flag: 'wx'` (`ec4b09dc`). |
| 2, Codex | A Preview request could be served on a due check when a concurrent refusal ended its Hub session between the first check and the token query. | The token query repeats the Hub session's liveness in the same statement (`ec4b09dc`). |

Both reviewers found no defect in the atomic handoff redemption, in the removal of the other session
mechanisms, in cookies, lifetimes, CSRF, authority or caller, or in the import-law change, which admits
exactly the three `platform/` helpers S5 made the owners.

The corrections changed the migrations in place, since no database had applied them. Before the pilot,
the four step migrations (one per step S1 to S4) were merged into one, `0026_single_session.sql`, which goes
from 0025 straight to the final state: each function is defined once. The merged migration produces the same
catalog, digest `cf09b9ac…`, as the four did, and the upgrade test from a populated 0025 database passes.
