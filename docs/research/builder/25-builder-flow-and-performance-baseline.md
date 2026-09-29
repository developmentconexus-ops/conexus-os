# 25. Builder flow and performance baseline

Date: 2026-09-29. Branch `feat/builder-own-harness`, Hub head `27d02d1d` at the time of reading.
Read only. Nothing was built, restarted or run.

## What this is for

Leandro wants to release the Builder when it is ready. Before anyone changes code, this study
measures what the Builder does today: how long each part takes, what the person sees while they
wait, and what the created apps look like. Every number below comes from a source named beside it.
Where a number is an estimate, it says so.

## Sources

- `builder.builder_run` in the branch Hub database (`conexus-branch-postgres`, `conexus_branch`):
  35 runs from 2026-09-28 21:55 to 2026-09-29 13:26 UTC, with created, started and finished times,
  mode, result and failure code.
- `factory.mastra_ai_spans` in the same database: 4721 spans. The Builder writes them to the
  `factory` schema, not `observability`. `threadId` on each `agent_run` span equals the run's
  `conversation_id`, which links spans to runs.
- `<branch-state>/logs/hub.log` (`BUILDER_CHECK` lines, failures, restarts, connector spans)
  and `runner.log` (one line per operation call, with status and milliseconds).
- Screenshots in `<branch-state>/proof/` (`int-*`, `p2-*`, `p2b-*`, `sk-*`) and the eval
  outputs in `eval-runs/`.
- The admitted source of each app in `<branch-state>/git/<project>.git`, read with
  `git show`.
- Code at `<worktree>` (`27d02d1d`): `apps/hub/src/builder/run-runtime.ts`,
  `apps/hub/src/app-runner/`, `builder-skills/`, `scripts/builder-eval/`.

How the numbers are derived. A run's phases come from its row plus its spans:

- **Preparation** is `started_at` to the first `agent_run` span. In this window the Hub creates the
  E2B sandbox, seeds the checkout, installs the check script, writes the starter and opens the
  session (`run-runtime.ts:157-222`).
- **Agent** is the sum of the run's `agent_run` spans. A plan approval or an answer starts a new
  "resumed" `agent_run`. The gap between two of them is the person reading and deciding. That gap
  is reported apart and is not Builder time.
- **Model time and tool time.** A `model_inference` span includes the tools of its step: the
  `tool-result` chunks sit inside it. So tool time per step is the window from the first tool call's
  start to the last one's end, and model time is the step's duration minus that window.
- **After the agent** is the last `agent_run` end to `finished_at`: pull the candidate, the
  admission check, the fast forward of `main`, the Preview build check, and publishing.
- **First visible output** is the first `model_chunk` span after the send. The attribute
  `completionStartTime` is wrong on this path (it holds the start of the whole generation, so it
  gives negative values), so it is not used.

The SQL that produces the tables is in the appendix, so anyone can rerun it.

## 1. Timeline per real run

Times are seconds from the moment the person sent the message. "Hub after" is the post-agent
phase. Model and tool are Builder working time only.

| Run | Project | Result | Prep | First text | Question | Plan card | Checks (at s, took s, result) | Agent ends | Hub after | Total | Model | Tools | Steps | Input tokens (cached) | Output tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `14ba3aa2` | eval todo-reload | built, PASS | 5.1 | 9.9 | 52 | 76 | 200 (17, green) | 227 | 38.3 | 265 | 176 | 43 | 26 | 589k (29%) | 6,042 |
| `eb510727` | eval sankhya-not-connected | answer only, FAIL | 6.2 | 7.4 | | | | 9 | 0.9 | 10 | 2 | 0 | 1 | 7k | 64 |
| `2e9a55ac` | eval sankhya-not-connected rerun | answer only, PASS | 3.9 | 6.4 | | | | 7 | 0.8 | 8 | 4 | 0 | 1 | 7k | 96 |
| `bcb6996d` | Prova integrada | FAILED `BUILDER_CHECK_FAILED` | 4.4 | 8.0 | | 56 | 374 (1, red), 408, 412, 419 (0.3 each, red) | 435 | 5.0 | 440 | 360 | 60 | 31 | 1,111k (38%) | 14,389 |
| `43ca767d` | Prova integrada, rerun after a person message | built | 6.0 | 10.4 | | | 208 (19, green) | 240 | 26.8 | 267 | 191 | 43 | 13 | 737k (31%) | 8,659 |
| `6d5d1654` | Prova Sankhya, first message | answer only (bind the Connection) | 5.0 | 7.6 | | | | 8 | 0.8 | 9 | 3 | 0 | 1 | 7k | 94 |
| `2b92ed5a` | Prova Sankhya, "Tente novamente" | FAILED `BUILDER_MODEL_INCOMPLETE` | 21.4 | 32.1 | | 171 | | open span | 264 | 435 | 265 | 63 | 22 | 505k | 9,427 |
| `4622998d` | Prova Sankhya, new conversation | built | 5.1 | 9.9 | | 124 | 371 (1.4, red), 393 (0.3, red), 417 (17, green) | 448 | 39.4 | 487 | 355 | 78 | 39 | 1,249k (48%) | 13,218 |
| `8c6592ae` | manager app ("Teste"), first message | answer only (bind the Connection) | 3.9 | 19.6 | | | | 20 | 1.0 | 21 | 14 | 2 | 4 | 37k | 194 |
| `8622591d` | manager app, "Vinculei" | answer only (operation refused) | 4.3 | 15.3 | | | | 27 | 0.9 | 28 | 19 | 3 | 2 | 28k | 623 |
| `2c3319d8` | manager app, new conversation | stopped by the person | 4.1 | 10.8 | 100 | | | 193 | 2.6 | 196 | 72 | 25 | 10 | 97k | 1,841 |
| `4f2c0807` | manager app, final | built | 4.3 | 10.0 | answered at 124, 500, 525 | 569 | 790 (7, red), 840 (12, green) | 889 | 21.8 | 911 | 362 | 75 | 35 | 880k (29%) | 12,360 |

Other runs, for the record: the counter app (`0e59ec22` built but failed the smoke at 143 s,
`ab9c4a86` 102 s, `1859ba86` 94 s), the first todo app (`2f9a73d6` 215 s, `036cdb81` 379 s,
`2568fe06` 273 s), three runs killed by Hub restarts (`0bac448d`, `8498e6e1`, `7b9a9e1c`), and
early failures before the model spoke (2 `BUILDER_PREPARATION_FAILED` from the web search tool on
`google-ai-pro`, 4 `BUILDER_MODEL_NOT_SELECTED`, 2 `BUILDER_MODEL_RATE_LIMITED`). Of 35 runs, 14
succeeded (9 changed the source, 5 answered only), 12 failed and 9 were interrupted (6 by the
person, 3 by a Hub restart).

### The best measured run, step by step

The eval run `14ba3aa2` (todo-reload, `openai/gpt-5.6-sol`, Hub head `ceadbcd1`) is the cleanest
end to end run on record. The eval driver answered the question and approved the plan within about
a second each, so it has almost no person wait.

| At (s) | What happened | Took (s) | Source |
|---|---|---|---|
| 0 | Message sent, run claimed | 0.0 | `builder_run.created_at`, `started_at` |
| 0 to 5.1 | Sandbox, seed, check install, starter, session | 5.1 | first `agent_run` span |
| 8.0 | First model output on the wire | | first `model_chunk` |
| 9.9 | First text for the person | | first text chunk |
| 5 to 52 | Planning: 8 model steps, all three skills loaded in step 1, 7 file operations, 1 question | 47 (model 38, tools 9) | spans |
| 52 | Question card (`ask_user`) | | tool span |
| 53 to 76 | Plan written and submitted: 2 steps | 23 (model 22, tools 2) | spans |
| 76 | Plan card (`submit_plan`) | | tool span |
| 77 to 227 | Build: 16 steps, 6 file writes, 5 file reads | 150 (model 116, tools 33) | spans |
| 200 | `conexus_check`: generate 0.03, typecheck 7.2, build 2.3, server 0.2, boot 5.8. Green on the first try | 16.8 | tool span output |
| 227 to 265 | Hub: pull, admission check (7.1 s of steps), fast forward, Preview check (6.5 s of steps), publish | 38.3 | `hub.log:743-744`, row |
| 265 | Run finished | | `finished_at` |
| 269 | Preview usable in the browser | | eval `wallTimeToUsablePreviewMs` |

About 24 s of the Hub's 38 s after the agent is not the check steps. Nothing records how it splits
between pull, archive, unpack and publish.

### Checks until green, and why each red one failed

| App | Red checks | Cause of each | Cost |
|---|---|---|---|
| Counter (older head, no `conexus_check` yet) | 1 at the Hub | `BOOT_CSP_VIOLATION`: the app loaded Google Fonts | The person had to type "Corrija o problema que o Conexus apontou" and wait another 102 s |
| Prova integrada | 4 in the agent, then 1 at admission | 1 manifest refused `enum` (not supported then). 3 `Cannot find module '/opt/conexus/compiler/generate-client.mjs'`: the E2B template was older than the Hub. Admission failed on the same `generate` step | The whole 440 s run failed. The person had to write "A verificação falhou porque o ambiente estava desatualizado" and wait 267 s more |
| eval todo | 0 | | |
| Prova Sankhya | 2 | Manifest refused `enum`, then `pattern` | 46 s from the first red check to green |
| Manager app | 1 | `TS1131` syntax error in `conexus/handlers/quotes.ts` | 50 s to green |

Of 8 red checks, 3 were manifest keys the compiler refused (2 `enum`, 1 `pattern`), 3 were the
stale sandbox template, 1 was a syntax error, and 1 (older) was an external font. `enum` became
legal at `39f0b66f`, after these runs. `pattern` is still refused, and `conexus-server/SKILL.md:33`
now says so.

## 2. Where the time goes

Summed over the 9 runs that built and admitted an app (`2f9a73d6`, `036cdb81`, `2568fe06`,
`ab9c4a86`, `1859ba86`, `43ca767d`, `14ba3aa2`, `4622998d`, `4f2c0807`):

| Part | Seconds | Share of Builder time |
|---|---|---|
| Model (inference, excluding tool execution) | 1,877 | 74% |
| Tools (file operations in E2B, checks, connector) | 397 | 16% |
| Hub after the agent (pull, two checks, publish) | 204 | 8% |
| Sandbox preparation | 47 | 2% |
| Person reading and answering (not Builder time) | 457 | |

The model is the cost. Three facts explain most of it.

**A third of the steps only update the task list.** 104 of the 239 model steps (44%) in these runs
call nothing but `task_write`, `task_update`, `task_complete` or `task_check`. They cost 484 s of
model time (26%) and 2.2 M of the 5.8 M input tokens (38%). In the eval run it is 15 of 26 steps,
54 of 176 model seconds and 368k of 589k input tokens. Each such step pays the full per-call
latency to move one checkbox.

**Every step pays a fixed latency floor.** Median time from the start of an inference to its first
chunk is 2.2 s (p90 4.9 s). Median time to the first tool call is 3.2 s (p90 9.0 s), over 376
inferences on `gpt-5.6-sol`. Input size barely matters: the correlation between input tokens and
time to the tool call is 0.12. So the number of steps drives the wall time, not the prompt size.

**Tool calls in one step run one after another.** In 69 steps with more than one tool call (252
calls), no two calls ever overlapped. The calls summed 358 s. Run in parallel, the same steps would
take 153 s, so up to 205 s is waiting in line (upper bound, since E2B may serialize some of it).
The cause is in Mastra: `toolCallConcurrency` defaults to 10, but its default strategy
`"available"` drops to 1 when any tool in the set can suspend or needs approval
(`@mastra/core/dist/agent-BOxKOk3n.js`, `effectiveToolSetRequiresSequentialExecution`). The
Builder's set includes `ask_user` and `submit_plan`, which suspend. The strategy `"called"` looks
only at the tools actually called. This link is read from the code, not tested.

File operations cost 1.3 to 2 s each through E2B (`read_file` 57 calls, 95 s; `edit_file` 46 calls,
103 s; `write_file` 43 calls, 66 s in the 9 runs). The agent's own `conexus_check` took 84 s over
8 calls, 21% of tool time.

**The same tree is checked three times in a minute.** In the eval run: the agent's check at 200 s
(17 s), then the Hub's admission check and the Preview check (7.1 s and 6.5 s of steps). Across the
6 built runs with check lines in the log, the two Hub checks are 72 s of the 155 s spent after the
agent (46%). The rest (about 84 s) is unmeasured.

**Preparation is small.** 3.7 to 6.7 s per run, with one outlier of 21.4 s (`2b92ed5a`, during the
Hub database trouble). It matters only for short answers: in the three "not connected" answers,
preparation is 50 to 60% of the 8 to 10 s total, for a sandbox the answer never used.

### Tokens

| Measure | Value | Source |
|---|---|---|
| Input tokens, 9 built runs | 5.78 M, 40% served from cache | `model_step` usage |
| Output tokens, 9 built runs | 61.7k (1 output token per 94 input) | same |
| Input per step, average | 24.2k | same |
| First step input, no Connection | about 7.7k | first inference of each run |
| First step input, with the Connection brief | 9.5k to 10k | same |
| System instructions | 12.5k characters, 19.5k to 21.7k with the Connection brief | `agent_run.attributes.instructions` length |
| Tools offered | 24 | `availableTools` |
| The three skills, once loaded | 21.3k characters (`conexus-app-ui` 7.8k, `conexus-app-code` 7.9k, `conexus-server` 5.6k) | `skill` tool outputs in the eval trace |
| Fixed prompt plus skills per step | about 13k tokens, 55% of the average step | estimate: skills converted at 4 characters per token |
| A second message in the same conversation | starts at 51k input tokens (`43ca767d`) | first inference of that run |

The eval run loaded all three skills in its first planning step, before it knew what it needed.
From then on they ride along in every step.

### Tool calls per run, by tool (9 built runs)

| Tool | Calls | Seconds | In the eval run |
|---|---|---|---|
| `mastra_workspace_read_file` | 57 | 95 | 9 calls, 12.7 s |
| `mastra_workspace_edit_file` | 46 | 103 | 0 |
| `task_complete` | 43 | 1 | 7 |
| `mastra_workspace_write_file` | 43 | 66 | 7 calls, 9.4 s |
| `task_update` | 36 | 1 | 5 |
| `task_write` | 14 | 0 | 2 |
| `skill` | 14 | 0 | 3 |
| `task_check` | 11 | 0 | 1 |
| `mastra_workspace_list_files` | 9 | 12 | 2 |
| `conexus_check` | 8 | 84 | 1 call, 16.8 s |
| `connector_fetch` | 7 | 5 | 0 |
| others (`grep`, `execute_command`, `skill_read`, `file_stat`, `mkdir`, `ask_user`, `submit_plan`) | 33 | 27 | 5 |

About 36 tool calls per built run. 104 of the 326 (32%) are task list calls. The starter files are
read again in almost every run (`app/src/main.tsx` 17 times, `AGENTS.md` 15 times,
`app/src/style.css` 14 times over all traces), although `AGENTS.md` is already in the instructions.

## 3. The flow as the person lives it

**Before the first word.** On the home screen the person types the request, then has to name the
Project in a second box and press "Criar e começar" (`int-05-named.png`, `p2b-03-named.png`). After
sending, "Agente trabalhando" appears at once, and the first words from the model arrive 6 to 10 s
later, 5 s of which is the sandbox being prepared.

**The long wait.** The Preview pane shows "Gerando a primeira prévia..." from the send until the
run ends: 265 s in the eval, 487 s for Prova Sankhya, 911 s for the manager app (`int-15-build-*`,
`sk-01-plan-card.png`, `p2b-12-look.png`). The only moving parts are in the chat: the task list and
reasoning titles.

**What the chat shows.**

- Reasoning titles are in English in a Portuguese product: "Planning order status handling and
  routing", "Designing manifest and handler structure", "Verifying acceptance code and UI handling"
  (`int-07-plan-t010.png`, `int-15-build-01.png`, `sk-01-plan-card.png`,
  `sk-05-nao-encontrado.png`, `p2b-12-look.png`).
- The plan card shows raw Markdown in a monospace block: `## Para a pessoa`, `**Compras**`, arrows
  (`p2b-08-look.png`). The eval's plan also carries a long "Para Construir" section with routes,
  manifest and operations, which the person is asked to approve.
- The composer's mode switch and model picker overlap ("ConstruirCh...", "ConstruirMédio") in 8 of
  the 10 run screenshots opened (`int-07-plan-t010.png`, `p2-03-settled.png`, `p2b-08-look.png`).
  The two `sk-*` ones are clean.
- The result card says "Build passou", in English (`p2-03-settled.png`, `sk-05-nao-encontrado.png`).
- A Hub failure message named the run by UUID and pasted the CSP error in English: "A execução
  0e59ec22-... Diagnóstico seguro: APPLICATION_SMOKE_FAILED. Detalhe: boot failed:
  BOOT_CSP_VIOLATION ..." (counter app thread).
- Small copy slips: "Workspace Workspace Teste" on the home (`int-05-named.png`), "este Project" on
  the error page (`p2b-13-look.png`).

**Steps the person had to take that could be avoided.**

| Step | Where | Avoidable how |
|---|---|---|
| Name the Project before the first message | home | Name it from the request, rename later |
| Bind the Connection, come back, type "Vinculei" or "Tente novamente" | Prova Sankhya, manager app | A bind action in the reply itself |
| Write a new message after an environment failure | Prova integrada | The platform was at fault; the run should retry itself |
| Write a fix request after a CSP smoke failure | counter app | Fixed since: the agent now runs `conexus_check` and repairs before admission |
| Start over after a Hub restart | 3 runs, one at 1,293 s | Study 23, B3 and B8 |
| Sit on a failed run for 264 s after the agent stopped | `2b92ed5a` | The Hub database timed out; the run was labeled `BUILDER_MODEL_INCOMPLETE`, which names the wrong cause |

In the manager app the person went through three conversations and five runs over 30 minutes
(13:06 to 13:36 UTC, their own reading time included) before the build started: bind the
Connection, then a refused operation, then a new conversation, then a stop to add a rule
("é <fator> * Custo").

## 4. What it creates

Judged against spec 0003 and the skills `conexus-app-ui` and `conexus-app-code`.

**The todo app (eval).** Good. One screen, `h1`, one field with a label, the four states (skeleton,
alert, empty with an invitation, list), a toast "Tarefa adicionada", `max-w-2xl`, stacks on a phone.
The data survives reload. One defect: the field error always says "Digite uma tarefa com até 240
caracteres", even for an empty field (`app/src/routes/home.tsx`).

**Controle de pedidos (Prova integrada).** Solid structure: lazy routes, filter in the URL, a
`Select` from the kit, table in `overflow-x-auto`, chart with pt-BR money and an empty message,
form with `zodResolver`, `Field`, pending state and "Pedido salvo". Defects:

- The chart comes first and fills the screen; the table is below the fold
  (`p2-03-settled.png`, `p2-06-order-table-chart.png`). The skill puts the numbers the person
  decides on first and KPI cards before charts; there are no KPI cards.
- "Ver detalhes" carries an appended arrow, a tell the skill names.
- The detail page shows the status twice, as a badge in the header and again in the list.
- `getOrder` returns an array to express "not found".
- Server validation throws plain errors ("Cliente inválido"), which reach the person as the generic
  "Não foi possível concluir a operação".
- `listOrders` returns up to 500 rows with no pagination; the skill says paginate past about 25.

**Consultar pedido de compra (Prova Sankhya).** Good. Search in the URL, number validated by the
generated schema, four states, a separate message for ERP errors, pt-BR money and dates, typed
handler from `types.gen`. It shows supplier, date, total and items as asked. Defects: the first
search after a cold Sankhya login can time out (see below), and a missing unit shows a bare dash.

**Análise de orçamento (the manager app, "Teste").** Weak, and broken at runtime.

- Its main operation never worked for the person. Before 13:57 UTC, 10 of 10 calls to
  `analyzeQuote` failed with `HANDLER_FAILED`: the app runner had been running since 02:33 UTC on
  head `40d9671d`, which predates `connectors.fetch` for handlers (`6db652fc`). After the runner
  restart at 13:57 on `27d02d1d`, 10 of 14 calls failed with `HANDLER_OUTPUT_REFUSED`, because the
  handler adds `items: []` to each quote while the manifest's output object is closed
  (`runner.log`, `conexus/handlers/quotes.ts`). The 4 that passed are the searches with no result.
  The check could not see either failure: `boot` answers every operation empty (spec 0003 AC-7), and
  the handler's return is not typed from `Output<'analyzeQuote'>`.
- The analysis the person asked for is not there. The four analysis columns (average cost without
  ICMS, variable cost, promotional price, stock) all read "Não disponível", and a constant card says
  "<fator>×". The Builder said so honestly in its final message.
- It ignores the kit: a raw `<select>` with hand written classes instead of `Select`, `Label` and
  `Input` instead of `Field`, no `lib/errors.ts`, no `lib/format.ts`.
- Tells from the skill's list: an eyebrow line "Inteligência comercial" above the `h1`, options
  joined with middle dots.
- Raw ERP values reach the screen: the status as the ERP's code, the date as the ERP's string, the
  quantity unformatted.

**Across apps.**

| Floor item (skill) | todo | pedidos | Sankhya | manager |
|---|---|---|---|---|
| Loading, error, empty, data | yes | yes | yes | partly (no empty state before a search result) |
| Kit components only | yes | yes | yes | no |
| pt-BR money and dates via `lib/format.ts` | n/a | yes | yes | no |
| Errors in plain Portuguese via `errorMessage` | yes | yes, but server messages are lost | yes | partly |
| Phone width | yes (from code) | yes (from code) | yes (from code) | yes (from code) |
| Tells avoided | yes | arrow on a button | yes | eyebrow, middle dots |

No screenshot shows a v2 app at phone width, so the phone column is read from the code only.

**The apps' own speed.** Operation calls on the runner: median 194 ms, p90 1.5 s, over 114
successful calls, for queries on a local database (`runner.log`). Each call starts a sandboxed
worker. Sankhya reads through a handler: the ERP login took 1.1 s at the median and up to 4.0 s
(`hub.log` connector spans), and 2 of 11 handler calls to Sankhya hit the 5 s limit
(`HANDLER_TIMEOUT` at 5.4 and 5.9 s; `invokeTimeoutMs: 5000`, `app-runner/supervisor.ts:30`).

## 5. Ranked improvements

| # | Improvement | Measured cost it removes | Evidence | Smallest change | For | Overlap with study 23 |
|---|---|---|---|---|---|---|
| 1 | Stop spending model steps on the task list | 104 of 239 steps, 484 s of 1,877 model seconds (26%), 2.2 M of 5.8 M input tokens (38%) in the 9 built runs. In the eval run: 54 s of 265 s | Section 2, step classification by tool set | One prompt rule: update tasks only in the same response as a work tool, never in a step of their own. Measure; if it does not hold, let the Hub drive the progress list from tool events | the person (speed), the subscription's usage limits (2 Gemini runs already failed `BUILDER_MODEL_RATE_LIMITED`) | none |
| 2 | Pin the runner and the sandbox template to the Hub's head | The only failed build of a real app (`bcb6996d`, 440 s lost plus a 267 s rerun and a person message) and the manager app's runtime failures (10 of 10 calls) | Section 1 red checks; `runner.log` heads `40d9671d` then `27d02d1d`; `6db652fc` | The runner reports its head and `RECIPE_SHA256`/`TEMPLATE_REF`; the Hub refuses to start a run when they differ from its own, with a plain operator message | the maintainer, then the person | none |
| 3 | Run a step's tool calls in parallel | 0 of 252 calls overlapped; up to 205 s of 358 s in multi-tool steps across all traces | Section 2; Mastra `effectiveToolSetRequiresSequentialExecution` | Pass `toolCallConcurrency: { strategy: 'called' }` where the controller streams. First check that `AgentController` forwards the option, and that `ask_user` and `submit_plan` are what forces 1 | the person | none |
| 4 | Give the wait something to show, in Portuguese | "Gerando a primeira prévia..." for 265 to 911 s; English reasoning titles in 5 screenshots; raw Markdown plan card; composer overlap in 8 of 10 run screenshots | Section 3 screenshots | Render the plan card as Markdown; hide reasoning titles or show "Pensando" only; fix the composer layout; show the plan summary and task list in the Preview pane until the first version exists | the person | B7 (draft Preview) covers the later, bigger version |
| 5 | Catch operation contract errors before the person does | Manager app: 10 of 14 calls refused after the runner restart. Manifest keys: 3 of 8 red checks, 46 s per loop | Section 4; `server-manifest.ts:184` closes every object | Skill rule in `conexus-server`: type each handler as `Promise<Output<'op'>>` from `types.gen` and return object literals, so extra keys fail `typecheck`; and send the runner's refusal code back into the conversation | the person | none |
| 6 | Check the candidate once at the end, not twice | 13 to 16 s of Hub check steps per built run, 72 s of 155 s after the agent in 6 runs | `hub.log` `BUILDER_CHECK:admission` and `:preview` pairs | Run the admission check with `collect: true` and build the Preview from its output, instead of a second check on the same revision | the person | B4 (version act) |
| 7 | Do not make the first reply wait for the sandbox | 3.7 to 6.7 s before every first word; 50 to 60% of short answers | Section 2, preparation | Start the turn while the sandbox prepares, and bind the workspace before the first file tool; or reuse the sandbox | the person | B3. Reuse saves about 5 s of a 265 s build (2%). Its value is continuity, not speed |
| 8 | Keep ERP reads under the handler limit | 2 of 11 Sankhya handler calls timed out; logins up to 4.0 s | `runner.log`, `hub.log` connector spans | Raise `invokeTimeoutMs` for operations bound to a Connection, or reuse the Sankhya session between calls | the person using the app | none |

## 6. A repeatable benchmark

The eval driver (`scripts/builder-eval/run.mjs`) already records the outcome, the check report, the
plan and answers, and `wallTimeToUsablePreviewMs`. It does not record where the time went. Two
defects in the existing trace code also need fixing first:

- `traceMetrics` (`scorers.mjs:118`) counts only the root `agent_run`. A resumed `agent_run` is
  nested under the previous model generation, so every tool and token after a question or a plan
  approval is left out. In the eval run that is the whole build.
- It matches Factory tool names (`view`, `write_file`, `string_replace_lsp`). Today's tools are
  `mastra_workspace_read_file`, `_write_file` and `_edit_file`, so `repeatedReads` is always 0.
- `run.mjs` does not call it at all; only `experiment.mjs` does.

What each run should add to `result.json`, as a `timings` block per Builder run:

1. **Identity.** Hub head, runner head, template ref and recipe hash, model id, prompt variant,
   case, repetition number, and the machine load at start (`pgrep -c -x tsc`, other active runs).
2. **Phases.** Queue, preparation, first model chunk, first text, each question and plan card time,
   each approval time, agent end, after-agent, finished, Preview usable.
3. **Model.** Steps, model seconds, tool seconds, task-only steps and their seconds, time to first
   tool call per step (median and p90), input, cached and output tokens, first step input tokens.
4. **Tools.** Calls and seconds per tool, steps with several calls, and the parallel lower bound
   (sum of the longest call per step).
5. **Checks.** Every `conexus_check` with its step times and the first failing problem code; the
   admission and Preview check steps; red checks until green.
6. **Person.** Messages the case had to send (answers, approvals, repairs), and failure codes.

The Hub side needs one addition so the after-agent time stops being a blind 24 s:
`BUILDER_RUN_TIMING:<runId>:sandbox=:seed=:starter=:session=:pull=:admission=:compile=:publish=`
(study 23 already proposes the first four), or the same values as columns on `builder_run` so the
driver reads them without parsing logs.

Protocol. A fixed set of five cases: `todo-reload`, `sankhya-not-connected-run`, the Prova
integrada orders request, the Sankhya purchase order read, and one interview case. Three
repetitions each, same head, same model. Report medians and the spread in one table shaped like
section 1. A change counts only when its table is compared with the baseline table from the same
cases. The appendix query gives the baseline for the runs that already happened.

## What this could not measure

- What the browser drew and when. Span times say when the model produced output, not when it was
  on screen.
- How the 22 to 39 s after the agent splits beyond the two check steps, and how the 5 s of
  preparation splits between E2B, seeding and the starter. No timing is logged for either.
- Whether parallel tool calls would really overlap inside E2B. The 205 s is an upper bound. The
  cause (suspending tools forcing concurrency 1) is read from Mastra's code, not tested.
- The skills' share of the prompt in tokens. It is converted from characters.
- Runs whose spans were lost or left open when the Hub database failed: `7b9a9e1c` has none,
  `8498e6e1` and `2b92ed5a` have open spans. The log has 21 "Failed to persist observability events".
- The Gemini runs (6 inferences with no usage recorded).
- The created apps at phone width, and the manager app in the browser. Both are judged from the
  source and the runner log.
- Money cost per run.

## Appendix. The query behind sections 1 and 2

Run with `docker exec -i conexus-branch-postgres psql -U postgres -d conexus_branch`.

```sql
create temp view s as select *, extract(epoch from "endedAt"-"startedAt") d from factory.mastra_ai_spans;
with runs as (
  select r.builder_run_id id, r.conversation_id conv, r.created_at at time zone 'UTC' c,
         r.started_at at time zone 'UTC' st, r.finished_at at time zone 'UTC' fin
  from builder.builder_run r where r.started_at is not null),
ar as (select runs.id, s.* from runs join s on s."spanType"='agent_run' and s."threadId"=runs.conv
       and s."startedAt" between runs.st and coalesce(runs.fin, now() at time zone 'UTC')),
tr as (select distinct id, "traceId" from ar),
sp as (select tr.id, s.* from tr join s using("traceId")),
stepm as (
  select st.id, st.d step_d,
    coalesce((select extract(epoch from max(t."endedAt")-min(t."startedAt")) from sp t
              where t.id=st.id and t."spanType"='tool_call' and t."parentSpanId"=st."spanId"),0) tool_w,
    (st.attributes->'usage'->>'inputTokens')::int inp,
    (st.attributes->'usage'->'inputDetails'->>'cacheRead')::int cache,
    (st.attributes->'usage'->>'outputTokens')::int outp
  from sp st where st."spanType"='model_step' and st.d > 0.05)
select runs.id,
  extract(epoch from (select min("startedAt") from ar where ar.id=runs.id)-st) prep_s,
  (select sum(d) from ar where ar.id=runs.id) agent_s,
  (select extract(epoch from max("endedAt")-min("startedAt")) - sum(d) from ar where ar.id=runs.id) person_wait_s,
  extract(epoch from fin-(select max("endedAt") from ar where ar.id=runs.id)) after_agent_s,
  extract(epoch from (select min("startedAt") from sp where sp.id=runs.id and "spanType"='model_chunk')-c) first_chunk_s,
  extract(epoch from (select min("startedAt") from sp where sp.id=runs.id and "spanType"='model_chunk' and name like '%text%')-c) first_text_s,
  (select count(*) from stepm where stepm.id=runs.id) steps,
  (select sum(step_d-tool_w) from stepm where stepm.id=runs.id) model_s,
  (select sum(tool_w) from stepm where stepm.id=runs.id) tool_s,
  (select sum(inp) from stepm where stepm.id=runs.id) input_tokens,
  (select sum(cache) from stepm where stepm.id=runs.id) cached_tokens,
  (select sum(outp) from stepm where stepm.id=runs.id) output_tokens
from runs order by c;
```

A step counts as task-only when every `tool_call` whose parent is its `model_step` is one of
`task_write`, `task_update`, `task_complete`, `task_check`. Two tool calls overlap when they share a
parent step and one starts before the other ends.
