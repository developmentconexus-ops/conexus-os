# Sign-in and first account

A person opens Conexus, signs in on the identity provider's page, and lands back in Conexus. The first person of an installation confirms a display name at `/setup`, which creates their account and makes them the installation administrator.

## Sub-features

- `signin-redirect` sends a signed-out visitor from `/` to the sign-in page.
- `signin-keycloak` accepts the person's username and password and returns to the Hub origin.
- `signin-setup` creates the first account at `/setup` and asks the person to sign in again.
- `signin-landing` routes a signed-in person with no Workspace to `/workspaces/new`.
- `signout` ends the Hub session from the account menu's `Sair do Conexus` and shows `Sessão encerrada` with `Entrar de novo`.

## How to get to it (user POV)

- Open the Hub origin with no session.
- Choose `Entrar` or `Entrar de novo` on an entry screen.

## Driving it with control.mjs

Preconditions:

- A fresh run that nobody has signed in to yet.

- **Redirect.** Open the root. Run `$C browser goto /`. The URL becomes the Keycloak issuer's login page on `127.0.0.1:<keycloak port>`.
- **Sign in and set up.** Run `$C sign-in`. It fills `#username` and `#password`, submits, fills `Seu nome`, chooses `Criar minha conta`, waits for the heading `Conta criada`, and chooses `Entrar`. It saves `screens/sign-in-account-created.png` and `screens/sign-in-landed.png`, and prints the landing URL, `/workspaces/new` on a fresh run.
- **Landing.** Run `$C browser snapshot signin-landing`. The banner holds `Conta de Verify Operator`, and the content holds the heading `Novo Workspace`.
- **Sign out.** Run `$C browser click --role button --name "Conta de Verify Operator"` and `$C browser click --role menuitem --name "Sair do Conexus"`. The URL is `/signed-out`, with the heading `Sessão encerrada` and the link `Entrar de novo`. `Entrar de novo` shows Keycloak's `#username` form again. `$C sign-in` then signs back in.
- **Proof.** Run `$C db "select display_name, active from iam.account" --save signin-account` and `$C db "select granted_via from iam.installation_administrator" --save signin-admin`. One account `Verify Operator`, active, with `OPERATOR_BOOTSTRAP`.

## Gotchas

- The sign-in page is Keycloak's own theme, because the run does not build the Conexus theme jar. Don't judge the sign-in page's look from this run. `apps/keycloak-theme` has its own check.
- `browser.log` holds `401` console errors on `/` before sign-in and on `/setup` during the first sign-in, while the session has no account yet. They are expected. Any other console error is a finding.
- A second `sign-in` in the same run skips `/setup` and lands wherever the entry route sends the person.
- `Sair do Conexus` ends the Hub session, then asks Keycloak to end its SSO session, so the next sign-in shows the form. When Keycloak does not confirm, `hub.log` holds `hub_sign_out_provider_logout_unconfirmed` and the next sign-in may return without the form. `$C sign-in` handles both cases.
