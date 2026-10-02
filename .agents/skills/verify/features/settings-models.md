# Model accounts

Settings, `Minhas contas de modelo` (`/settings/models`), is where a person connects the model accounts the Builder runs on. Each person uses their own account. A shared account serves anyone who hasn't connected one.

## Sub-features

- `models-list` shows the sections `Google AI Pro`, `ChatGPT`, `Assinatura Claude` and `Chave de API da Anthropic (Claude)`.
- `google-connect` connects Google AI Pro: a sign-in tab opens, and the person pastes the address it ended on.
- `google-connected` shows `Conectado com a sua conta Google.` with `Reconectar`.
- `chatgpt-connect`, `claude-connect` and `anthropic-key` connect the other providers. Not reachable under this harness: each reaches the real provider.
- `my-account` shows `Minha conta` at `/settings/account`: `Dados da conta` and `Meus Workspaces`.
- `admins` lists the installation administrators at `/settings/installation/admins`. Adding one by email (`Tornar administrador`) needs a second person with an account, so it is not reachable under this harness, whose realm has one person.

## How to get to it (user POV)

- The account menu `Conta de <name>`, then the menu item `Configurações`, which opens `Minha conta`. The rail then holds `Minha conta` and `Minhas contas de modelo` under `Pessoal`, and `Administradores` under `Instalação`.
- Open `/settings/models`.
- In the composer with no model, the placeholder reads `Escolha um modelo para começar`, and the model popover links `Conecte uma conta de modelo`.

## Driving it with control.mjs

Preconditions:

- Signed in (see [sign-in](./sign-in.md)).

- **Open.** Run `$C browser click --role button --name "Conta de Verify Operator"` and `$C browser click --role menuitem --name "Configurações"`. The URL is `/settings/account` and the heading reads `Minha conta`. Run `$C browser click --role link --name "Administradores"`: the heading `Administradores` lists `Verify Operator (você)`. Run `$C browser click --role link --name "Minhas contas de modelo"` and `$C browser snapshot models-list`. The heading `Minhas contas de modelo` and the four provider regions show.
- **Start the Google sign-in.** Run `$C browser click --role button --name "Conectar com o Google"`. A second tab opens and fails to load, because the run's browser can't resolve accounts.google.com. The section shows the link `Abrir a entrada do Google` and the textbox `Endereço da aba que não abriu`.
- **Paste the callback.** Run `$C browser attr --role link --name "Abrir a entrada do Google" --attr href` and take its `state` parameter. Run `$C browser fill --label "Endereço da aba que não abriu" --value "http://localhost:51121/oauth-callback?state=<state>&code=verify"` and `$C browser click --role button --name "Concluir"`. Within a few seconds the section shows `Conectado com a sua conta Google.` and the status `Google AI Pro conectado.`
- **Close the dead tab.** Run `$C browser close-page`. With no `--page`, it closes every tab that is not on the Hub origin. `$C browser pages` then lists one tab.
- **Proof.** Run `$C browser snapshot google-connected` and `$C db "select m.provider, m.kind, m.sharing, a.display_name as owner from model.model_account m join iam.account a on a.account_id = m.owner_account_id" --save model-account`. One row: `google-ai-pro`, `google_ai_pro`, `just_me`, `Verify Operator`.

## Gotchas

- The account is real Hub state sealed with the run's key, but the proxy behind it is `scripts/fake-cliproxy.mjs`. It serves sign-in and readiness only, not model calls. Say so in any proof that uses it.
- The pasted address is what a person copies when the Google redirect to `localhost:51121` fails. The `state` must be the one from this attempt.
- ChatGPT and Claude sign-in, and an Anthropic key, reach the real provider. Never drive them here.
- Never select the `secret` column. It holds the sealed credential.
