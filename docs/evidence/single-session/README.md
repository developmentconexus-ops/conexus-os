# Single session qualification evidence

**Task:** [Single session qualification](../../tasks/single-session-qualification.md)

**Verdict:** not yet given. This file grows one step at a time. It holds only what a step has proved.

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
