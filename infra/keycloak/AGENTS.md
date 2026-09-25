# infra/keycloak

The Keycloak that authenticates the pilot: one container, one realm named `conexus`, one client `conexus-hub`. [`README.md`](README.md) explains each script and each realm setting. [`security-and-authority.md`](../../docs/reference/security-and-authority.md#4-human-authentication) owns human authentication.

## Traps

- `realm-conexus.json` holds only the settings the Hub depends on; everything else is Keycloak's default on purpose. A new setting states why the Hub needs it, as the README's table does.
- The client secret is never in the file. `provision.sh` sets it from the Hub's secret file. Never commit a secret, a password or an exported people file.
- `provision.sh`, `install-theme.sh`, `create-first-user.sh` and `export-users.sh` act on running pilot containers. Run them only when the issue names a pilot proof.
- `revokeRefreshToken` is `false` and the idle timeout outlasts the Hub's own, for reasons the README gives. A Keycloak upgrade past 26.7.x reruns `scripts/keycloak-refresh-probe.mjs` before trusting rotation off.
- Keycloak only authenticates. Its roles and claims grant no Conexus authority. The theme's source lives in `apps/keycloak-theme`.

## Verify

No script checks this directory. Read the diff for secrets before you commit. For the theme the install script ships:

```bash
npm run keycloak-theme:check
```
