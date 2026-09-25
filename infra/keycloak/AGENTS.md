# infra/keycloak

The Keycloak side of sign-in: the `r1f` realm export and the scripts that install the sign-in theme and create an installation's first person. [`README.md`](README.md) explains each file. [`security-and-authority.md`](../../docs/reference/security-and-authority.md#4-human-authentication) owns human authentication.

## Traps

- `install-theme.sh` copies the theme into the running pilot container and restarts it. `create-first-user.sh` creates a user in the running realm and asks you to restart the Hub. Run either only when the issue names a pilot proof.
- `realm-r1f.json` is a reference export that nothing imports. Every client secret, private key and other credential value holds a `<..._PLACEHOLDER_REPLACE_BEFORE_IMPORT>` value. Never commit a real one. Policy settings whose names contain `password`, such as `resetPasswordAllowed`, are not credentials and keep their values.
- Keycloak only authenticates. Its roles, groups and claims grant no Conexus authority. A realm change states its effect on every client in the realm, `r1f-primary` and `r1f-other` included.
- The theme's source lives in `apps/keycloak-theme`. Change it there, not here.

## Verify

No script checks this directory. Before you commit the realm export, confirm every credential value still holds its placeholder. For the theme the install script ships:

```bash
npm run keycloak-theme:check
```
