# Keycloak: the Conexus realm

Keycloak authenticates and Conexus authorizes (C-015). This folder builds the Keycloak that does the
authenticating for the pilot: one container, one realm named `conexus`, one client for the Hub.

## The realm is what differs from Keycloak's defaults

[`realm-conexus.json`](realm-conexus.json) holds only the settings the Hub depends on. Everything else is
Keycloak 26.7.2's default, on purpose. The previous realm, `r1f`, differed from the defaults only in the theme
and locale settings, the rotation Q3 turned on, `sslRequired: none`, and a second client identical to the
first. The new file carries none of that spike's export.

| Setting | Value | Why |
| --- | --- | --- |
| `revokeRefreshToken` | `false` | The Hub asks Keycloak at most every five minutes with a stored refresh token, for the Hub, each application and each Preview. Rotation would make two concurrent requests spend one token. The single session qualification proved on 26.7.2 that without rotation a disabled person and a signed-out session are still refused ([evidence](../../docs/evidence/single-session/README.md)). |
| `ssoSessionIdleTimeout` | 2400 | A refresh resets this timer, and the Hub refreshes only when a request finds its five-minute check due. The Hub's own idle limit is 30 minutes, so Keycloak's must outlast 30 plus 5 minutes, or a person active at minute 4 and back at minute 31 would be signed out before the Hub's limit. 40 minutes leaves a margin. |
| `ssoSessionMaxLifespan` | 36000 | Ten hours, above the eight hours the Hub allows a session. |
| `accessTokenLifespan` | 300 | Keycloak's default, stated because the check interval was chosen against it. |
| `loginTheme`, `internationalizationEnabled`, `supportedLocales`, `defaultLocale` | `conexus`, `true`, `["pt-BR"]`, `pt-BR` | The Conexus sign-in page, in Portuguese only. |
| client `conexus-hub` | confidential, authorization code with PKCE (`S256`), redirect URI `https://hub.conexus.localhost:3443/protocol/oidc/callback` | The Hub's client. No direct grants, no service account, no implicit flow. |

The client has no secret in the file. `provision.sh` sets it from the Hub's own secret file.

## Create it

```
infra/keycloak/provision.sh --client-secret-file <the Hub's client secret file> \
  [--users-file <people>] [--theme-jar <conexus-keycloak-theme.jar>]
```

It starts a container named `conexus-keycloak` from the pinned image, on `127.0.0.1:8443`, with its data
on the named volume `conexus-keycloak-data` (so removing the container does not remove the people). It
imports the realm once at start and sets the client secret. Plain HTTP is on inside the container for
`kcadm`; only the HTTPS port is published. The bootstrap admin password is generated and lives only in the
container's environment. Nothing secret is printed. Run it in a WSL shell, with the local TLS files under
`~/.local/share/conexus-local-tls`.

## Move the people of another realm

`export-users.sh` copies a running container's H2 file, exports its people offline with a throwaway
container, and writes them with their password hashes and their ids to a file outside the repository:

```
infra/keycloak/export-users.sh --from-container <name> --from-realm <realm> --out <file outside the repo>
```

Keeping each person's Keycloak id keeps their Hub Account, which is keyed by issuer and subject. Only the
issuer changes, and `provision.sh --users-file <file>` imports them with the same passwords. Every person
gets the realm's default role and no other: no Keycloak role authorizes anything in Conexus.

## The sign-in theme

`install-theme.sh` builds `apps/keycloak-theme` into a Keycloakify jar, copies it into the running
`conexus-keycloak` container's `/opt/keycloak/providers/`, points the `conexus` realm at it and restarts the
container. Building the jar needs a JDK and Maven on `PATH`; see the comment at the top of the script.
`install-theme.sh revert` unsets the theme. `provision.sh --theme-jar` installs an already built jar at
creation.

## The first person of a new installation

`create-first-user.sh` creates the first person in the realm and makes them the Hub's bootstrap identity:

```
infra/keycloak/create-first-user.sh --email you@company.com --name "Your Name" --hub-env path/to/hub.env
```

It prompts for a password without echoing it and marks it temporary, so Keycloak asks for a new one at the
first sign-in; the password is never an argument, a log line or a file. The email is marked verified. With
`--hub-env`, the new user's id replaces `CONEXUS_BOOTSTRAP_SUBJECT`; restart the Hub. That person's first
sign-in lands on `/setup`, which creates their Account and makes it the installation administrator, once
per installation.

## Reopen when

- Keycloak is upgraded past 26.7.x: rerun `scripts/keycloak-refresh-probe.mjs` before trusting rotation off
  ([task](../../docs/tasks/single-session-qualification.md), section 13).
- A requirement to end sessions at the instant of a Keycloak logout (back-channel logout).
