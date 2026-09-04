# 4D(R1) — S1 implementation result

> **Status:** `CLOSED / PASS / S2 AWAITING SEPARATE OPERATOR GRANT`
> **Boundary:** `S1 — I&A plus minimum same-origin shell`
> **Product operations realized:** `IAM-01`, `IAM-02`, `IAM-03`
> **Later Product operations realized:** `0`

## 1. Admitted result

S1 implements only the approved I&A vertical. `IAM-03` provisions one Account
from the exact server-configured issuer/subject through a one-shot bootstrap
context and owner idempotency. `IAM-01` returns the current Account plus empty
Workspace/Project summaries. `IAM-02` revokes only the exact opaque Conexus
session; it neither performs nor claims Keycloak logout.

The minimum React shell realizes T-01 first use and GF-01 re-entry: authenticate,
configure Account, explicitly re-enter, disclose the current Account, show the
honest `Nenhum Workspace ainda` state, use the Account menu and sign out of
Conexus. It exposes no Workspace mutation or later-slice action.

## 2. Owners, schemas and mutation census

The canonical Product OpenAPI remains the schema owner. A pinned Redocly bundle
is fully dereferenced and projects only the three admitted operations into the
generated Fastify route module and typed browser client. One Ajv compiler owns
request admission; no handwritten parallel Product DTO or route census exists.

I&A owns six PostgreSQL tables under the non-login `iam_owner` role:
`schema_migration`, `account`, `oidc_transaction`, `bootstrap_context`,
`session` and `operation_idempotency`. The runtime login is non-superuser,
`NOINHERIT`, cannot bypass RLS or assume the owner, and receives only the exact
table grants. Raw session, CSRF and bootstrap tokens are never durable truth;
only digests are stored.

```text
GENERATED paths         = 5
PLATFORM-CONTRACT paths = 13
APP-OWNED paths         = 0
Product route census    = IAM-01 / IAM-02 / IAM-03
Product OAS digest      = 67d141e946e933c8a031d456f9d51ed44389053e5b2c50979b10c927dae07cd3
route projection digest = ad108bb4c4797547e07fbe6496ef442268aa06d7d30e40a65c5592910a2d2e9b
G0 receipt digest       = be9227c82de4aa1b603626c0beeef1221f6ae7781c07e42a67965df627bf3289
S1 manifest digest      = 88ca03c58cbbdb0cefaea87e58f4b3391ac2ba8b631f2d8ecbc172e2d3fe93ac
unresolved conflicts    = 0
```

The receipt is checked before generation and after build/test, so protected
drift refuses instead of being silently normalized. No S1 mutation touches the
G0 receipt or APP-owned bytes.

## 3. Identity, session and security law

The technical ingress uses Authorization Code with PKCE S256, state and nonce.
Issuer, client, redirect URI and scope are server configured. The exact admitted
`openid-client` non-repudiation hook is mandatory, so ID-token signature is
verified against realm JWKS in addition to issuer/audience/nonce validation.
Production refuses an HTTP issuer; the local synthetic proof requires both
`NODE_ENV=test` and an explicit insecure-test opt-in.

OIDC transactions and bootstrap contexts are one-shot and expiring. A completed
Account seals bootstrap for that identity; an expired unconsumed context may be
replaced without making the old token distinguishable or usable. Sessions have
idle and absolute expiry, revocation, restart-safe database truth, Secure
HttpOnly `__Host-` cookies, exact-origin enforcement and double-submit CSRF with
the server-held digest. Provider tokens, Keycloak roles and browser claims never
become Conexus authorization.

## 4. Qualification and falsifiers

Deciding qualification ran in the admitted Linux image with Node `24.20.0`, npm
`12.0.2`, Playwright `1.62.1`/Chromium `151.0.7922.34`, PostgreSQL `17.10` and
Keycloak `26.7.2` in `prod` profile. All credentials and state were synthetic;
the containers and test network were destroyed.

```text
npm ci                                      = PASS / 191 packages / 0 vulnerabilities
npm run r1:g0:verify                        = PASS / 12 of 12
npm run r1:s1:verify                        = PASS / HTTP 7 of 7 / receipt PASS
npm run r1:s1:postgres                      = PASS / 1 of 1 / real PostgreSQL
real Keycloak + PostgreSQL + Chromium       = PASS / 1 of 1
npm run verify                              = PASS
Gitleaks code/scripts/profiles/tests         = CLEAR
```

The runtime-only scan raised one adjudicated `generic-api-key` false positive:
the value is the named SHA-256 `productOpenApiDigest` in the canonical S1
generation receipt, not a credential. No raw credential appeared in any scan.

The live journey proved Keycloak form login, PKCE callback, one-time bootstrap,
Account creation, explicit ordinary re-entry, IAM-01 shell disclosure, honest
empty Workspace state, Account menu, Conexus-only IAM-02 logout, denial after
revocation and Keycloak-SSO re-entry.

The exact Foundation Pack C owner already proves forged issuer, audience and
signature plus wrong state, nonce, PKCE verifier and redirect against this exact
Keycloak/openid-client pin. S1 binds that result through the required
non-repudiation hook and adds integration negatives for insecure production
issuer, callback replay, subject injection, repeated/sealed/expired bootstrap,
same-key replay, changed-request conflict, malformed generated schema, wrong
origin/CSRF, expired/revoked session, public-schema write and owner-role
assumption. Keycloak role authority remains absent by construction and by the
Pack C negative.

## 5. Completion and next boundary

```text
G0 = CLOSED / PASS
S1 = CLOSED / PASS
S2 = BLOCKED / AWAITING SEPARATE OPERATOR GRANT
R1C-14 = STILL REQUIRED IMMEDIATELY BEFORE S3
R1C-13 = STILL REQUIRED IMMEDIATELY BEFORE S6
REAL PROVIDER CALL = UNAUTHORIZED
PUSH / PR / MERGE = UNAUTHORIZED
```

Any route beyond IAM-01..03, public signup, transferable/durable operator,
provider-token or Keycloak-role authority, global logout, new principal,
Permission, Product record, owner contradiction or stale/non-firing proof
reopens the smallest affected S1 owner. S1 PASS grants no successor slice.
