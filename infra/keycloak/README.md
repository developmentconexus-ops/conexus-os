# Keycloak: realm export and the Conexus theme

## Installing the sign-in theme on the pilot

`install-theme.sh` builds `apps/keycloak-theme` into a Keycloakify jar, copies it into
the running `conexus-s7-keycloak` container's `/opt/keycloak/providers/`, points realm
`r1f` at it, and restarts the container:

```
infra/keycloak/install-theme.sh install
```

This also turns on internationalization for the realm with `pt-BR` as the default and
only supported locale (it was off before this branch; Keycloak serves English message
strings regardless of the theme's own translations until a realm has a locale). Admin
auth comes from the container's own `KC_BOOTSTRAP_ADMIN_USERNAME` / `_PASSWORD`
environment variables via `docker exec`, so nothing is typed or stored outside the
container.

To revert to Keycloak's built-in default theme:

```
infra/keycloak/install-theme.sh revert
```

This unsets the realm's `loginTheme`, removes the jar from the container, and restarts
it. It does not turn internationalization back off (leaving `pt-BR` enabled is harmless
against the stock theme, which also ships a `pt-BR` message set).

Building the jar needs a JDK and Maven on `PATH` (`keycloakify build` shells out to
`mvn`); see the comment at the top of `install-theme.sh` for a no-sudo local install if
the coordinator's machine doesn't already have them. Everything else the script needs
(Node, the theme's own npm dependencies) follows the repo's normal `npm ci` flow.

## Realm export: r1f

`realm-r1f.json` is a read-only export of the pilot realm `r1f` from the running
`conexus-s7-keycloak` container. It is a reference for what the realm looks like today,
and a starting point for a future import script; it is not imported automatically by
anything in this repo yet.

## How it was produced

The running container's start-dev server holds an exclusive lock on its embedded H2
database, so `kc.sh export` cannot run inside the live container without stopping it.
The pilot container was never stopped or modified to produce this file:

1. `docker cp conexus-s7-keycloak:/opt/keycloak/data/h2/keycloakdb.mv.db` copied the
   database file out (read-only copy, container untouched).
2. A disposable container (`kc-export-tmp`, same Keycloak image, no image tag or
   coordinates persisted here beyond this doc) mounted that copy and ran
   `kc.sh export --realm r1f --users same_file --file ...` offline.
3. The exported JSON was copied out, the disposable container was stopped and removed,
   and the local database copy was deleted.
4. `users` was dropped from the export entirely (the brief's `--users skip` intent;
   `same_file` was required by `kc.sh export` when exporting to a single file, so the
   export briefly contained user records only inside the throwaway container's output,
   before this repo ever saw it).

## Secrets removed

Every field that can hold key material or a shared secret was replaced with a
placeholder of the form `<FIELD_NAME_PLACEHOLDER_REPLACE_BEFORE_IMPORT>`:

- Client secrets (`r1f-primary`, `r1f-other`, and any future confidential client).
- The realm's generated signing and encryption key material under
  `components["org.keycloak.keys.KeyProvider"]` (`hmac-generated` secret, `aes-generated`
  secret, `rsa-generated` and `rsa-enc-generated` private keys and certificates).
- Any field whose name contains `password` (case-insensitive), anywhere in the tree.

Before importing this file into any Keycloak instance, replace every placeholder with a
freshly generated value for that instance. Keycloak also regenerates its own key
provider material on import if you delete those `components` entries instead of filling
them in; deleting is the simpler and safer default for a new environment.

## What is intentionally still in the file

Realm-level policy (password policy, brute-force settings, token lifespans), the client
list and their non-secret settings (redirect URIs, scopes), roles, groups, authentication
flows, and the two client-registration policy components. None of this is credential
material.
