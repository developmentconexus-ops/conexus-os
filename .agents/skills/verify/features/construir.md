# Construir

Construir is the Project's conversation with the Builder. The person sends a message, watches the agent's turn stream into the conversation, answers questions it parks, approves its plan, picks the model and reasoning level, and sees the result in the Stage lenses.

## Sub-features

- `send` posts a message from the composer and records a Builder run.
- `turn-failed` shows a failed turn's reason as a note in the conversation, as an alert with `Detalhe técnico` in the `Prévia` lens, and as `Resultado` in the `Sobre` lens.
- `stream` streams the agent's answer into the conversation. Not reachable under this harness.
- `reasoning` shows `Pensando…` while the model's reasoning streams, then a collapsed `Pensou` row. Not reachable under this harness.
- `question-card` parks a question (`Pergunta do agente`) answered with radios and `Enviar resposta` or `Enviar respostas`. Not reachable under this harness.
- `plan-card` parks a plan (`Plano para aprovar`) with `Aprovar e construir` and `O que mudar no plano`. Not reachable under this harness.
- `permission-card` parks a tool request (`Pedido de permissão`) with `Permitir` and `Recusar`. Not reachable under this harness.
- `model-picker` opens `Modelo <name>, raciocínio <level>`, a popover with the `Modelo desta conversa` listbox, `Buscar modelo` and the `Raciocínio` slider.
- `conversations` switches conversations in the `Conversa` combobox and opens one with `Nova conversa`.
- `lenses` shows the Stage tabs `Prévia`, `Código`, `Alterações` and `Sobre`.
- `retry` offers `Tentar de novo` in the `Sobre` lens, which puts a failed request back in the composer.
- `done-check` shows the Conexus check's verdict as a `note` that starts `Verificação do Conexus: o app não passou (N de 3).` while the agent repairs its own app, inside the same run. Not reachable under this harness.
- `memory-status` shows `Memória da conversa` under the composer: how full the message window is before the Builder observes it.
- `composer-states` changes the composer when it can't send: `Carregando modelos…`, `Não foi possível carregar os modelos` with a `Tentar novamente` alert, `Nenhum modelo disponível para você`, `Outra conversa está construindo este Projeto` and `Parar` while a turn runs. Not reachable under this harness.

## How to get to it (user POV)

- Start a Project from the Workspace home's composer (see [projects](./projects.md)). Construir opens on the new conversation.
- Choose a Project card on the Workspace home, then `Construir` in the Project rail.
- Open `/projects/<id>/build` or `/projects/<id>/c/<conversation id>`.

## Driving it with control.mjs

Preconditions:

- Signed in, a Workspace, and a Google AI Pro account connected through the fake proxy (see [model accounts](./settings-models.md)).
- Build and memory defaults set with `$C seed-model-defaults`. No screen sets the memory default yet, and without it every turn is refused before it starts.

- **Send.** In Construir, run `$C browser fill --label "Mensagem para o agente" --value "Crie um contador simples com um botão de somar"`, `$C browser screenshot construir-send-typed` and `$C browser click --role button --name "Enviar" --exact`. The message appears in the `log` with its time. Starting a Project from the Workspace home sends the first message the same way.
- **Turn outcome.** With the `Prévia` lens selected, run `$C browser wait --role alert`, `$C browser click --text "Detalhe técnico"` and `$C browser text --role alert`. Today the text is `Ocorreu um erro interno inesperado. Tente novamente.` with the code `BUILDER_PREPARATION_FAILED`, because the sandbox can't open (E2B is closed). The conversation shows the same sentence as a `note`, and the `Sobre` lens lists it as `Resultado` with the run under `O que já foi feito`.
- **Run record.** Run `$C db "select r.state, r.failure_code, r.sandbox_id, r.request_text from builder.builder_run r" --save construir-run`. One row per message sent in the run, each `FAILED`, `BUILDER_PREPARATION_FAILED`, with a null `sandbox_id` and the message as `request_text`. `hub.log`, one JSON object per line, has a `msg` of `BUILDER_RUN_FAILED:<run id>:fetch failed {}`.
- **Model picker.** Run `$C browser click --css ".cx-model-button"` and `$C browser snapshot construir-model-picker`. The listbox `Modelo desta conversa` lists the Google AI Pro models, such as `Gemini 3.1 Pro` and `Gemini 3 Flash`. `Buscar modelo` filters it, and a search with no match shows `Nenhum modelo encontrado`. Run `$C browser click --role option --name "Gemini 3 Flash" --exact`. Then `$C browser attr --css ".cx-model-button" --attr aria-label` reads `Modelo Gemini 3 Flash, raciocínio Médio`.
- **Reasoning level.** Reopen the picker. Run `$C browser focus --role slider --name "Raciocínio"`, then `$C browser press --key ArrowLeft` or `ArrowRight`. `$C browser attr --role slider --name "Raciocínio" --attr aria-valuetext` steps one level per key and stops at each end. `Gemini 3 Flash` offers `Desligado`, `Baixo`, `Médio` and `Alto`. A model with no levels shows `Este modelo não tem nível de raciocínio para escolher.` Press `Escape`. The model button's name ends with the chosen level.
- **Lenses.** Run `$C browser click --role tab --name "Código"` and `$C browser snapshot construir-code`. The tree `Arquivos do Project` holds `.conexus` (open, with `memory/MEMORY.md` selected and its `versão <hash>` shown), `app`, `AGENTS.md` and `conexus.json`. `Alterações` reads `Nenhuma execução alterou o código ainda.`. `Sobre` shows the region `Sobre este pedido` (`Pedido`, `Resultado`, `Início`, `Código atual`, `Prévia em uso` reading `Ainda não disponível`) and the region `O que já foi feito`, whose failed run offers `Tentar de novo`. Choosing it fills the composer with the request and starts no run.
- **Conversations.** Run `$C browser click --role button --name "Nova conversa"`. The URL has a new conversation id and the model button reads `Modelo Escolha um modelo`. `$C browser click --css ".cx-memory-status"` opens a popover reading `Mensagens 0/30k`. `$C browser click --role combobox --name "Conversa" --exact` lists one option per conversation.
- **Proof.** Run `$C browser screenshot construir-turn` and `$C browser snapshot construir-turn` after the outcome, and keep the run record above.

## Gotchas

- `tests/live/` (`npm run test:live`) drives the same launch with a scripted model and a local sandbox, and reaches `stream`, `question-card`, `plan-card` and `done-check`. This CLI doesn't.
- `composer-states` is source-only (`composer.tsx`, `model-picker.tsx`). The fake proxy always lists models, and a failed turn ends before a stop button can be clicked.
- While a conversation is open, `browser.log` gains a `409 (Conflict)` console error on the conversation URL about every ten seconds, because the Builder's session never becomes ready without a sandbox (cause read from `mastra-session-routes.ts`, not observed). On a Project in deletion, `settings` logs `503`. Both are expected here.
- The Builder opens its E2B sandbox before the model's first token, and this harness closes E2B on purpose. So `stream`, `reasoning`, the parked cards and every lens that needs a built app can't be proven here. The fake model proxy does not answer model calls either, so even with a sandbox these need a model stand-in on Gemini's `/v1beta` API. Report these sub-features as skipped, with "E2B closed" as the unmet precondition.
- The sandbox failure surfaces as the generic internal-error sentence, not `ENVIRONMENT_PREPARATION_FAILED`'s copy. Treat a change in that copy as a behavior change.
- Other models offer other levels. The full set of words is `Desligado`, `Baixo`, `Médio`, `Alto`, `Muito alto` and `Máximo`.
- A conversation whose only turn failed keeps the title `Conversa sem título`, so the `Conversa` list can hold several options with the same name.
- Clicking the slider sets the level under the pointer. Use `focus` and arrow keys for a deterministic level.
- The Workspace home's composer preselects a model of its own (`Gemini 3.1 Pro` in the proof run), not the seeded build default. A conversation opened with `Nova conversa` or from the `Novo Projeto` form starts with no model: the button reads `Modelo Escolha um modelo` and the placeholder `Escolha um modelo para começar`.
- After a failed first turn, the Project card on the Workspace home reads `Falhou: build do aplicativo`, even though no build ran. Treat a change in that label as a behavior change.
