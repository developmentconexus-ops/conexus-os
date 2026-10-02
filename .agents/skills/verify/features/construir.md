# Construir

Construir is the Project's conversation with the Builder. The person sends a message, watches the agent's turn stream into the conversation, answers questions it parks, approves its plan, picks the model and reasoning level, and sees the result in the Stage lenses.

## Sub-features

- `send` posts a message from the composer and records a Builder run.
- `turn-failed` shows a failed turn's reason in the conversation and the Stage, with `Detalhe técnico`.
- `stream` streams the agent's answer into the conversation. Not reachable under this harness.
- `reasoning` shows `Pensando…` while the model's reasoning streams. Not reachable under this harness.
- `question-card` parks a question (`Pergunta do agente`) answered with radios and `Enviar resposta` or `Enviar respostas`. Not reachable under this harness.
- `plan-card` parks a plan (`Plano para aprovar`) with `Aprovar e construir` and `O que mudar no plano`. Not reachable under this harness.
- `permission-card` parks a tool request (`Pedido de permissão`) with `Permitir` and `Recusar`. Not reachable under this harness.
- `model-picker` opens `Modelo <name>, raciocínio <level>`, a popover with the `Modelo desta conversa` listbox, `Buscar modelo` and the `Raciocínio` slider.
- `conversations` switches conversations in the `Conversa` combobox and opens one with `Nova conversa`.
- `lenses` shows the Stage tabs `Prévia`, `Código`, `Alterações` and `Sobre`.

## How to get to it (user POV)

- Start a Project from the Workspace home's composer (see [projects](./projects.md)). Construir opens on the new conversation.
- Choose a Project card on the Workspace home, then `Construir` in the Project rail.
- Open `/projects/<id>/build` or `/projects/<id>/c/<conversation id>`.

## Driving it with control.mjs

Preconditions:

- Signed in, a Workspace, and a Google AI Pro account connected through the fake proxy (see [model accounts](./settings-models.md)).
- Build and memory defaults set with `$C seed-model-defaults`. No screen sets the memory default yet, and without it every turn is refused before it starts.

- **Send.** In Construir, run `$C browser fill --label "Mensagem para o agente" --value "Crie um contador simples com um botão de somar"`, `$C browser screenshot construir-send-typed` and `$C browser click --role button --name "Enviar"`. The message appears in the `log` with its time. Starting a Project from the Workspace home sends the first message the same way.
- **Turn outcome.** Run `$C browser wait --role alert` and `$C browser click --text "Detalhe técnico"`, then `$C browser text --role alert`. Today the text is `Ocorreu um erro interno inesperado. Tente novamente.` with the code `BUILDER_PREPARATION_FAILED`, because the sandbox can't open (E2B is closed).
- **Run record.** Run `$C db "select r.state, r.failure_code, r.sandbox_id, r.request_text from builder.builder_run r" --save construir-run`. One row: `FAILED`, `BUILDER_PREPARATION_FAILED`, a null `sandbox_id`, and the message as `request_text`. `hub.log` has `BUILDER_RUN_FAILED:<run id>:fetch failed`.
- **Model picker.** Run `$C browser click --css ".cx-model-button"` and `$C browser snapshot construir-model-picker`. The listbox `Modelo desta conversa` lists the Google AI Pro models, such as `Gemini 3.1 Pro` and `Gemini 3 Flash`. Run `$C browser click --role option --name "Gemini 3 Flash" --exact`. Then `$C browser attr --css ".cx-model-button" --attr aria-label` reads `Modelo Gemini 3 Flash, raciocínio Médio`.
- **Reasoning level.** Reopen the picker. Run `$C browser focus --role slider --name "Raciocínio"`, then `$C browser press --key ArrowLeft`. `$C browser attr --role slider --name "Raciocínio" --attr aria-valuetext` steps one level per key, through `Baixo`, `Médio`, `Alto` and `Máximo`. Press `Escape`. The model button's name ends with the chosen level.
- **Lenses.** Run `$C browser click --role tab --name "Código"` and `$C browser snapshot construir-code`. The tree `Arquivos do Project` holds the starter files `.conexus`, `app`, `AGENTS.md` and `conexus.json`. `Alterações` reads `Nenhuma execução alterou o código ainda.`. `Sobre` shows the region `Sobre este pedido` with the request and its result.
- **Conversations.** Run `$C browser click --role button --name "Nova conversa"`. The `Conversa` combobox reads `Conversa sem título` and the URL has a new conversation id.
- **Proof.** Run `$C browser screenshot construir-turn` and `$C browser snapshot construir-turn` after the outcome, and keep the run record above.

## Gotchas

- The Builder opens its E2B sandbox before the model's first token, and this harness closes E2B on purpose. So `stream`, `reasoning`, the parked cards and every lens that needs a built app can't be proven here. The fake model proxy already streams `reasoning_content` and text, but that path has never run end to end. Report these sub-features as skipped, with "E2B closed" as the unmet precondition.
- The sandbox failure surfaces as the generic internal-error sentence, not `ENVIRONMENT_PREPARATION_FAILED`'s copy. Treat a change in that copy as a behavior change.
- On main, settled reasoning is not shown. A `Pensou` row in a screenshot means this map is stale.
- Clicking the slider sets the level under the pointer. Use `focus` and arrow keys for a deterministic level.
- The Workspace home's composer preselects a model of its own (`Gemini 3.1 Pro` in the proof run), not the seeded build default. A conversation opened with `Nova conversa` starts with no model: the button reads `Modelo Escolha um modelo` and the placeholder `Escolha um modelo para começar`.
- After a failed first turn, the Project card on the Workspace home reads `Falhou: build do aplicativo`, even though no build ran. Treat a change in that label as a behavior change.
