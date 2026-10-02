# Built app and app runner

A Project's built app is served at its own origin, `https://<slug>.<application domain>:<application port>`. A person with access opens it, signs in through the Hub, and uses it. The app's server code runs in the application runner, never in the Hub. A Project owner decides who besides the Workspace may use the app in Project settings, `Acesso ao aplicativo`.

## Sub-features

- `app-access-settings` lists who may use the app, at `/projects/<id>/settings/access`.
- `app-invite` invites a person by email. The first invitation also creates the app's address. `Cancelar` on a pending invitation opens `Cancelar o convite de <email>?` with `Voltar` and `Cancelar convite`.
- `app-grant` reads `<name> já tem acesso.` when the email belongs to an existing account, which gets access at once. Not reachable under this harness: the run's one account has no email.
- `app-open` opens the built app at its origin and signs the person in. Not reachable under this harness.
- `app-api` calls the app's own API through the runner. Not reachable under this harness.
- `preview` shows the app in Construir's `Prévia` lens. Not reachable under this harness.

## How to get to it (user POV)

- In the Project rail, `Configurações do projeto`, then `Acesso ao aplicativo`.
- The app's own address, shared by the Project owner.
- Construir's `Prévia` tab, after a turn that built the app.

## Driving it with control.mjs

Preconditions:

- Signed in, with a Project (see [projects](./projects.md)).
- For every sub-feature but `app-access-settings`, a built app. That needs a Builder turn that reaches its sandbox, plus the application listener (`CONEXUS_APPLICATION_PORT` and `CONEXUS_APPLICATION_DOMAIN`) and a running application runner with its own PostgreSQL. `control.mjs launch` starts none of these.

- **Access settings.** In the Project, run `$C browser click --role link --name "Configurações do projeto"`, then `$C browser click --role link --name "Acesso ao aplicativo"`, then `$C browser snapshot app-access`. The heading `Acesso ao aplicativo` shows with the regions `Endereço do aplicativo` (`O endereço aparece quando você der o primeiro acesso`), `Pessoas com acesso 0`, `Convites pendentes 0` and `Dar acesso a alguém` (textbox `Email`, button `Convidar`).
- **Invite.** Run `$C browser fill --label "Email" --value "pessoa@conexus.test"` and `$C browser click --role button --name "Convidar"`. The status reads `Convite criado para pessoa@conexus.test.`, and `Convites pendentes 1` lists it with `Vale até <date>` and `Cancelar`. Run `$C db "select a.slug is not null as has_slug, i.email, i.expires_at > now() as valid from iam.application a join iam.application_invitation i using (project_id)" --save app-invitation`: one row, with `has_slug` and `valid` true. Also in the screen: the line `Quem é membro do Workspace já usa o aplicativo sem precisar estar nesta lista.`
- **App, API and Preview.** Report as skipped, with the unmet precondition "no built app: E2B closed, no runner".

## Gotchas

- `Endereço do aplicativo` keeps reading `O endereço aparece quando você der o primeiro acesso` even after an invitation, because the run sets no application listener. The address exists in the database.
- The runner and the application listener are what `infra/pilot/runner.sh` and the pilot's Hub env add. Never point this harness at the pilot's runner socket or its databases.
