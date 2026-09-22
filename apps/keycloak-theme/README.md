# Conexus Keycloak theme

A [Keycloakify](https://docs.keycloakify.dev) login theme for the `r1f` pilot realm:
Grafite e Ipê tokens, self-hosted Hanken Grotesk / Bricolage Grotesque / JetBrains Mono,
the Encaixe mark fitting together on load, and no Keycloak default styling anywhere.

Six pages get a custom Conexus layout: `login`, `login-reset-password`,
`login-update-password`, `error`, `info`, `login-page-expired`. Every other Keycloak
login page id (WebAuthn, OTP, identity-broker steps, ...) falls back to Keycloakify's
own default page component (`src/login/KcPage.tsx`), so the realm keeps working end to
end even for flows this theme didn't restyle by hand.

## Local preview

```
npm install
npm run dev
```

Opens on `http://localhost:5173` (or the next free port). It renders against a mocked
`kcContext` (pt-BR, matching the pilot realm's locale) since there is no real Keycloak
backend in dev mode. Switch pages with a query parameter:

```
http://localhost:5173/?pageId=login.ftl
http://localhost:5173/?pageId=login-reset-password.ftl
http://localhost:5173/?pageId=login-update-password.ftl
http://localhost:5173/?pageId=error.ftl
http://localhost:5173/?pageId=info.ftl
http://localhost:5173/?pageId=login-page-expired.ftl
```

Your OS light/dark setting drives the theme; toggle it to preview both. The mark-fit and
wordmark-arrive animation plays once per page load, so reload to see it again.

## Building the jar

```
npm run build-keycloak-theme
```

Needs a JDK and Maven on `PATH` (Keycloakify shells out to `mvn package`). Produces
`dist_keycloak/keycloak-theme-for-kc-all-other-versions.jar` (and a Keycloak-22-to-25
variant). `../../infra/keycloak/install-theme.sh install` runs this and installs the
result into the pilot container; see that script and `../../infra/keycloak/README.md`
for the coordinator's install and revert steps.

## Verification

- `npm run typecheck` (`tsc --noEmit`)
- `npm run build` (the Vite app alone, fast; what CI runs via `npm run verify`)
- `npm run build-keycloak-theme` (the full jar; needs Maven/a JDK, not wired into CI)
