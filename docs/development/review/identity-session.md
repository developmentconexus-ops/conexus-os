# Review: Identity and session

## Scope

Who a request acts for: Hub and application sessions, OIDC with Keycloak, Preview access, the caller
the platform builds, the realm, the sign-in theme and the administrator bootstrap. Paths, as
[`areas.json`](areas.json) lists them:

- `apps/hub/src/identity-access/**`
- `apps/hub/src/builder/hub-session-auth.ts`
- `apps/hub/src/mar/application-host-routes.ts`
- `apps/hub/src/mar/preview-routes.ts`
- `apps/hub/src/platform/caller.ts`
- `infra/keycloak/**`
- `apps/keycloak-theme/**`
- `scripts/bootstrap-installation-administrator.mjs`
- `scripts/q3-sign-in.mjs`
- `scripts/q3-negative-proof.mjs`

## What to check

- [ ] `needs:aprovo` is on the pull request. Every change here is a security or authentication
      change. Owner: [Ask for "Aprovo"](../delivery.md#ask-for-aprovo-on-three-kinds-of-change).
- [ ] Keycloak only authenticates. Conexus owns the mapping from an identity to an account,
      Workspace and Project grants, per C-015 in the [decision register](../../decisions/index.md).
      A realm change states its effect on every client in the realm.
- [ ] The caller is built from a resolved session, never from request input. Owner:
      [Security and authority](../../reference/security-and-authority.md#4-human-authentication).
- [ ] Every state-changing route checks Origin and the CSRF token the way the existing routes do. A
      new variant says why the existing check cannot serve.
- [ ] A route that acts on a child resource by id checks that the child belongs to the parent the
      path names.
- [ ] A claim or attribute from the identity provider is parsed at the boundary. A malformed value
      fails closed and is diagnosable without logging the value.
- [ ] Cheap admission checks (concurrency, size, authority) run before expensive per-request work.
- [ ] Sessions, handoffs and tokens follow the one model per concept in
      [Session](../../reference/security-and-authority.md#42-session) and
      [Application session](../../reference/security-and-authority.md#43-application-session).

## Proof required

- The PostgreSQL leaves that exercise identity (for example `iam-membership-authority`,
  `iam-application-access`, `iam-installation-administrator`) ran at the head SHA with zero
  skipped cases. The reviewer reads the `verify` run log and counts skips. A case skipped with
  "real PostgreSQL configuration not supplied" is a failed item.
- A negative case for each refusal the change adds: another Workspace, another Project, an expired
  or revoked session, a missing CSRF token. A test that proves only the allowed path fails.
- A claim about Keycloak behavior (refresh, logout, token exchange) cites the documentation or
  source at the pilot's Keycloak version, or asks for a probe.

## Traps from history

- An owner of one Workspace could cancel an invitation of another Workspace by naming their own
  Workspace in the URL, because the database function resolved authority from the invitation and
  ignored the path. Fixed by #107 (`d71c410e`). Now at
  `apps/hub/src/identity-access/membership.ts:228-242`.
- An `email_verified` claim sent as the string `"true"` was refused exactly like an unverified
  address, and the operator could not tell the two apart. Fixed by #107 (`d71c410e`), which logs
  the claim's type and never its value. Now at `apps/hub/src/identity-access/oidc.ts:42-57`.
- Membership routes carried no `params` schema, so a malformed id reached PostgreSQL and answered
  500 instead of 400. Fixed by #107 (`d71c410e`). Now at
  `apps/hub/src/identity-access/membership.ts:22-29`.
- The Preview application API read and encoded a whole server tree before checking the runner's
  concurrency cap, then read every file before checking the size limit. Fixed in review rounds of
  #196 (`b90c54f7`). Now at `apps/hub/src/mar/application-invoker.ts:63-82`.

## Principles

- **Boundary Discipline.** Parse the session, the claims and the path once at the edge, then trust
  the typed caller inside.
- **Type System Discipline.** Brand ids such as `WorkspaceId` so a path id and a body id cannot be
  swapped.
- **Model the Domain.** One session model and one handoff model. A second variant is a finding.
- **Test Behavior, Not Implementation.** Assert the refusal a real request receives, not that a
  guard function was called.
- **Prove It Works.** Identity claims need PostgreSQL and Keycloak evidence, not a mock.
