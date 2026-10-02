# Model accounts

Settings, Modelos de IA (`/settings/models`), is where a person connects the model accounts the Builder runs on. Each person uses their own account. A shared account serves anyone who hasn't connected one.

## Sub-features

- `models-list` shows the sections `Google AI Pro`, `ChatGPT`, `Assinatura Claude` and `Chave de API da Anthropic (Claude)`.
- `google-connect` connects Google AI Pro: a sign-in tab opens, and the person pastes the address it ended on.
- `google-connected` shows `Conectado com a sua conta Google.` with `Reconectar`.
- `chatgpt-connect`, `claude-connect` and `anthropic-key` connect the other providers. Not reachable under this harness.

## How to get to it (user POV)

- The account menu `Conta de <name>`, then Configurações, then Modelos de IA.
- Open `/settings/models`.
- In the composer with no model, the placeholder reads `Escolha um modelo para começar`, and the model popover links `Conecte uma conta de modelo`.

## Driving it with control.mjs

Preconditions:

- Signed in (see [sign-in](./sign-in.md)).

- **Open.** Run `$C browser goto /settings/models` and `$C browser snapshot models-list`. The heading `Minhas contas de modelo` and the four provider regions show.
- **Start the Google sign-in.** Run `$C browser click --role button --name "Conectar com o Google"`. A second tab opens and fails to load, because the run's browser can't resolve accounts.google.com. The section shows the link `Abrir a entrada do Google` and the textbox `Endereço da aba que não abriu`.
- **Paste the callback.** Run `$C browser attr --role link --name "Abrir a entrada do Google" --attr href` and take its `state` parameter. Run `$C browser fill --label "Endereço da aba que não abriu" --value "http://localhost:51121/oauth-callback?state=<state>&code=verify"` and `$C browser click --role button --name "Concluir"`. Within a few seconds the section shows `Conectado com a sua conta Google.` and the status `Google AI Pro conectado.`
- **Close the dead tab.** Run `$C browser close-page`. With no `--page`, it closes every tab that is not on the Hub origin. `$C browser pages` then lists one tab.
- **Proof.** Run `$C browser snapshot google-connected` and `$C db "select m.provider, m.kind, m.sharing, a.display_name as owner from model.model_account m join iam.account a on a.account_id = m.owner_account_id" --save model-account`. One row: `google-ai-pro`, `google_ai_pro`, `just_me`, `Verify Operator`.

## Gotchas

- The account is real Hub state sealed with the run's key, but the proxy behind it is `scripts/fake-cliproxy.mjs`. Say so in any proof that uses it.
- The pasted address is what a person copies when the Google redirect to `localhost:51121` fails. The `state` must be the one from this attempt.
- ChatGPT and Claude sign-in, and an Anthropic key, reach the real provider. Never drive them here.
- Never select the `secret` column. It holds the sealed credential.
