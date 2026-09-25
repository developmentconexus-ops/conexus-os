# Review: Identity and session

## Scope

Who a request acts for: Hub and application sessions, OIDC with Keycloak, Preview access, the caller the platform builds, the realm, the sign-in theme and the administrator bootstrap. Paths, as [`areas.json`](areas.json) lists them:

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
