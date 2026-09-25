# Issue #230 pilot proof

**Verdict: ACCEPT**, given by the operator on 2026-09-25 in the chat with the manager.

**Issue:** [#230](https://github.com/developmentconexus-ops/conexus-os/issues/230), explain an unverified email
on the application no-access page. The code merged in #267 (`f035461e`). This file records its "Done when" on
the pilot.

**Result.** Both cases held on 2026-09-25. A Keycloak user with `emailVerified=false` who opens
`pedidos-de-ferias` lands on the page titled "E-mail não verificado". A user with a verified email and no grant
lands on the "Sem acesso" page, which says to ask the Workspace administrator. No email, username or
Keycloak subject appeared in any URL of either sign-in or in either page.

The page says the person's email is not verified but does not print the address. The no-access route picks
its copy only from a fixed `reason` value in the query
([`application-host-routes.ts`](../../../apps/hub/src/mar/application-host-routes.ts), the `/__conexus/no-access`
handler), and every other value falls back to the generic page. Showing the address would mean carrying the
identity in the redirect URL.

## Pilot

- **Hub.** Before the proof, the pilot Hub ran `feat/single-session` at `572fb6a8`, which does not include #267.
  With the operator's approval, the Hub was restarted from a detached worktree at `origin/main` `54a5cec7`,
  with the same pilot env file and `scripts/build-hub-local.mjs` (log line `hub starting 2026-09-25T18:43:36Z
  head 54a5cec7`). No migration changed between the two commits, so the database was not touched. The app
  runner was not restarted.
- **Keycloak.** `conexus-keycloak` (26.7.2), realm `conexus`, `verifyEmail: false`, events off.
- **Application.** `pedidos-de-ferias`, on `https://pedidos-de-ferias.conexus.localhost:3445`, the one S6 of the
  [Single session evidence](../single-session/README.md#s6-pilot-proof) used.

## Test users

With the operator's approval, two disposable users were created in realm `conexus` with `kcadm.sh` inside the
container. Each had a random password that was kept only in a mode 600 file outside the repository.

| User | Email | `emailVerified` | Invitation or grant |
| --- | --- | --- | --- |
| `pilot-230-unverified` | `pilot-230-unverified@example.invalid` | `false` | none |
| `pilot-230-verified` | `pilot-230-verified@example.invalid` | `true` | none |

Before the run, `iam.application_invitation` and `iam.account` held no row for either email. No other user,
grant or realm setting was changed.

## Run

[`scripts/issue-230-no-access-proof.mjs`](../../../scripts/issue-230-no-access-proof.mjs) opens the application
in headless Chromium and signs in through the realm's login form. It then waits for
`/__conexus/no-access`. It records every main-frame navigation request, redirects included, with query values
blanked except `reason`. It also records the no-access response status, the page heading and text, and whether
the user's email, username or Keycloak subject appears in any navigated URL or in the page HTML.

```bash
PILOT230_PASSWORD=… node scripts/issue-230-no-access-proof.mjs --case email-not-verified \
  --username pilot-230-unverified --email pilot-230-unverified@example.invalid \
  --subject <keycloak id> --app pedidos-de-ferias --out email-not-verified.json
PILOT230_PASSWORD=… node scripts/issue-230-no-access-proof.mjs --case verified-no-grant \
  --username pilot-230-verified --email pilot-230-verified@example.invalid \
  --subject <keycloak id> --app pedidos-de-ferias --out verified-no-grant.json
```

## Observed

| Case | Redirect after the Hub callback | Status | Heading | Text | Email, username or subject in a URL or the page |
| --- | --- | --- | --- | --- | --- |
| Unverified email | `/__conexus/no-access?reason=EMAIL_NOT_VERIFIED` | 403 | E-mail não verificado | Você não tem acesso a este aplicativo porque seu e-mail ainda não foi verificado. Verifique seu e-mail e tente entrar de novo. | none |
| Verified email, no grant | `/__conexus/no-access?reason=NOT_GRANTED` | 403 | Sem acesso | Você não tem acesso a este aplicativo. Peça acesso a quem administra o Workspace. | none |

Both runs followed the same navigation chain: the application's `/`, the Hub's `/protocol/oidc/login`, the
Keycloak authorization endpoint, the login form post, the Hub's `/protocol/oidc/callback`, and the no-access
page. Records: [`email-not-verified.json`](email-not-verified.json),
[`verified-no-grant.json`](verified-no-grant.json).

## Cleanup

- After the run, `iam.account` held no row for either email or Keycloak subject. The Hub provisions an
  application Account only for an email with an open invitation, so the sign-ins left no Hub state.
- Both Keycloak users were deleted, which also ended their Keycloak sessions. The realm again lists only
  `conexus-test-operator`, `conexus_admin`, `funcionario-teste` and `r1f-user`.
- The password file was deleted.
- The pilot Hub keeps running `54a5cec7` from `~/wt-pilot-main`, started by `~/pilot-230/hub.sh`.
