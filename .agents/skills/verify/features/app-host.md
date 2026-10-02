# Built app and app runner

A Project's built app is served at its own origin, `https://<slug>.<application domain>:<application port>`. A person with access opens it, signs in through the Hub, and uses it. The app's server code runs in the application runner, never in the Hub. A Project owner decides who besides the Workspace may use the app in Project settings, `Acesso ao aplicativo`.

## Sub-features

- `app-access-settings` lists and changes who may use the app, at `/projects/<id>/settings/access`.
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
- **Invite.** Not proven yet. An invitation is a mutation: read it back from the database before calling it verified.
- **App, API and Preview.** Report as skipped, with the unmet precondition "no built app: E2B closed, no runner".

## Gotchas

- The runner and the application listener are what `infra/pilot/runner.sh` and the pilot's Hub env add. Never point this harness at the pilot's runner socket or its databases.
