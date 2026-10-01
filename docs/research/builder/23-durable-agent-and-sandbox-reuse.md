# 23. Durable agent, sandbox per conversation, and what a crash loses

Date 2026-09-29. Branch `feat/builder-own-harness` at `cd1b0584`, Mastra core 1.71.0, `@mastra/e2b`
0.12.1, `e2b` SDK 2.46.1. Read only. Nothing was run except reads and greps.

## Resumo para o Leandro

**Hoje, se a execução cai, perde tudo o que ela fez nos arquivos.** O trabalho do modelo vive só
dentro da E2B daquela mensagem. Qualquer falha antes da aprovação final (erro do modelo, o banco
lento de hoje, a E2B morrer, o Hub reiniciar, o check reprovar) apaga a E2B e joga fora as edições.
A conversa e a lista de tarefas ficam salvas, mas descrevem arquivos que não existem mais. O arquivo
do plano some sempre, até quando dá certo. A próxima mensagem começa do `main` e refaz tudo. No log
do branch, todas as execuções que falharam perderam o trabalho: três por falha do banco, uma porque
a E2B sumiu, duas por configuração.

**O erro de hoje não foi o modelo.** Foi o Postgres demorando mais de 5 segundos para dar conexão,
dentro do laço do agente. O Mastra não repete esse passo (0 tentativas), e o nosso código chama
qualquer erro desse tipo de "o provedor do modelo recusou". A mensagem está errada.

**O Mastra tem "durable agent", mas ele não resolve isso sozinho.** Ele salva o estado do laço e
retoma depois de um reinício, mas é beta, não está ligado ao AgentController e grava ainda mais no
banco. As repetições automáticas de erro de modelo já estão ligadas (até 2 vezes). Falta repetir
falha passageira do banco, e isso é nosso: esperar mais pela conexão e continuar a mesma sessão.

**A sua direção é a certa, e o Mitra confirma.** Uma E2B por conversa, que dura. O modelo trabalha
direto nos arquivos dela, como Claude Code. No começo de cada turno ele traz o `main` (fetch e
merge). O Hub guarda uma cópia do branch da conversa a cada turno, então se a E2B morrer nada se
perde. Quando fica parada, a E2B pausa e não cobra. O Mitra faz igual: a E2B dele é descartável, e
o que dura é o branch de cada pessoa, sincronizado no início e salvo no fim de todo turno. No
Mastra não há uma chave "reusar entre turnos"; somos nós que matamos a E2B de propósito
(`onTimeout: 'kill'`, um id por execução e `destroy` no fim).

**Ordem para construir, cada passo com prova de que uma queda não perde nada:**

1. Corrigir a falha passageira: esperar mais pela conexão, continuar a mesma sessão uma vez, e dar
   a mensagem certa. Prova: um teste que derruba o banco no meio do turno, e o turno termina.
2. Cópia do branch da conversa no Hub a cada turno. Prova: matar a E2B depois de 3 edições, e a
   próxima E2B tem as 3.
3. Uma E2B por conversa, pausada quando parada, reencontrada depois de reiniciar o Hub. Prova: duas
   mensagens usam a mesma E2B, e um reinício no meio não perde o arquivo.
4. "Criar versão" separado do turno: check, depois `main`, depois Preview. Um check reprovado não
   apaga mais nada. Prova: duas conversas mexem no mesmo arquivo, e a segunda junta e publica.
5. Trava por conversa, e não mais por Project. Limpeza das E2B paradas há dias.

**Decisões suas** (vão para o `/jm-architect` como emenda da spec 0002):

1. A E2B é da conversa (recomendo) ou do Project?
2. A versão vai para o `main` sozinha no fim de cada turno com check verde (recomendo, é o que o
   Mitra faz) ou só quando a pessoa pede?
3. Conflito com outra conversa: o Builder resolve e só pergunta quando não consegue (recomendo), ou
   sempre pergunta, como o Mitra?
4. A Preview mostra só o `main` (recomendo por agora) ou também a versão em andamento da conversa?
5. Quanto tempo uma E2B parada fica pausada antes de ser apagada (sugiro 7 dias; o branch no Hub
   continua)?

## Legend

- `wt/` is a branch worktree, and `hub/` is `wt/apps/hub/src/builder`.
- `core/` is `wt/node_modules/@mastra/core/dist`, and `docs/` is `core/docs/references`.
- `e2bm/` is `wt/node_modules/@mastra/e2b/dist`, and `e2bsdk/` is `wt/node_modules/e2b/dist`.
- `agent.js` is `core/agent-BOxKOk3n.js`, and `ctl.js` is `core/agent-controller-0NjSdCnl.js`.
- `spec/` is `docs/tasks/specs/0002-builder-own-harness`.
- `mitra/` is the main checkout at `origin/main` (`eb564cfe`), `docs/research/mitra/`.
- `log` is `<branch-state>/logs/hub.log`, read only through the secret filter.

## Question 1. The durable agent and retries

### What failed today, traced to the byte

The stack trace is at `log:776-787`. The agentic loop runs each model iteration as a nested workflow
step named `executionWorkflow` (`agent.js:30434`, `agent.js:30545-30557`). Starting that nested run
calls `Workflow.createRun`, which reads the run back from storage because the step's snapshot policy
persists `pending` runs (`agent.js:5736`, policy at `agent.js:30484-30486`). So every iteration of
the loop touches Postgres. Under load, `pg`'s pool gave up after `connectionTimeoutMillis: 5000`
(`wt/apps/hub/src/platform/postgres.ts:33`) with "timeout exceeded when trying to connect". The
storage pool is the `hub_factory` pool of `max: 20` (`hub/module.ts:284`). The line just before,
`log:765-775`, shows the observability exporter timing out on the same database, so the host was
overloaded, not the model.

The step had no retry. A step's retries are `step.retries ?? retryConfig.attempts ?? 0`
(`agent.js:3049-3050`). A workflow's default `retryConfig` is `{ attempts: 0, delay: 0 }`
(`agent.js:5103-5106`), and neither `agentic-loop` nor `executionWorkflow` passes one
(`agent.js:30480-30490`, `agent.js:30545-30555`). After the last attempt the engine wraps the error
as `WORKFLOW_STEP_INVOKE_FAILED` (`agent.js:3563-3572`), and the stream ends with an `error` chunk.

The retry processors never saw it. `processAPIError` runs only inside the LLM execution step's
catch (`agent.js:28396-28490`). The failure happened one level up, while creating the step's run.

### From the thrown error to the pt-BR sentence

1. The controller turns the error chunk into an `error` event and `agent_end` with reason `error`
   (`ctl.js:1229-1244`, and the chunk path at `ctl.js:1270-1290`).
2. `sendBuilderSessionMessage` sees `terminalReason === 'error'` and calls `modelFailure`
   (`hub/runtime.ts:102`). `modelFailure` knows only "no account", `rate_limit` and `auth`
   (`hub/runtime.ts:51-57`). Mastra Code's `parseError` classifies this message as `timeout` with
   `retryable: true` (`wt/node_modules/@mastra/code-sdk/dist/utils/errors.js:96-100`), which our
   code drops. The code becomes `BUILDER_MODEL_STREAM_FAILED`.
3. `failure-vocabulary.ts` maps that code to `MODEL_REQUEST_REFUSED` (`hub/failure-vocabulary.ts:52`).
4. The web maps the category to "O provedor do modelo recusou ou interrompeu o pedido. Tente
   novamente ou escolha outro modelo." (`wt/apps/web/src/features/builder/failure-reasons.ts:18`),
   shown by `builder-conversation.tsx:225` and the Construir views.

The sentence blames the provider for a database fault and tells the person to switch models, which
cannot help. The same log shows two more runs killed by the database, "Connection terminated
unexpectedly" and "the database system is shutting down". Those were thrown outside the agent, so
`service.ts` turned them into `BUILDER_PREPARATION_FAILED` and `INTERNAL_ERROR`
(`hub/service.ts:113-116`, `hub/failure-vocabulary.ts:135`).

### What Mastra 1.71 offers, and what we use

| Mechanism | What it does | Where | Our setting | Default |
| --- | --- | --- | --- | --- |
| Agent `maxRetries` | AI SDK retries on the model call | `agent.js:36176`, used at `agent.js:27824` | unset | `0` |
| `modelSettings.maxRetries` | Same, per call | `agent.js:27824` | unset | falls back to the agent's `0` |
| `errorProcessors` via `createCodingAgent` | `StreamErrorRetryProcessor` with `retryUnknownErrors: true`, 2 retries at 3 s; bad request once at 2 s; `ECONNRESET` 2 with backoff; auth never | `core/coding-agent/index.js:189-212`, `docs/reference-coding-agent-create-coding-agent.md:187-195` | inherited, active | active when `errorProcessors` is not passed (`index.js:267`) |
| `maxProcessorRetries` | Cap on processor retries per turn | `agent.js:25895-25904` | unset, so the log warns (`log:755`) | falls back to 3 |
| `Retry-After` | Waits the provider's delay, capped | `docs/reference-processors-stream-error-retry-processor.md:46-50` | inherited | `maxRetryAfterMs` 30 s |
| Workflow step `retries` / `retryConfig` | Re-runs a failed step | `agent.js:3049-3050`, `agent.js:3555-3575` | not reachable: the agentic loop builds its own workflows | `0` |
| Suspend and resume | `ask_user`, `submit_plan` park and resume | `docs/docs-harness-agent-controller.md:275-288` | used (`hub/run-runtime.ts:403`) | on |
| Loop snapshots | Stored for `pending`, `paused`, `suspended` only | `agent.js:30484-30486` | inherited | no `running` checkpoints |
| Durable agent (`createDurableAgent`, `createEventedAgent`) | Loop inside a workflow, PubSub stream, snapshot, `observe()` reconnect, crash re-drive | `docs/docs-harness-durable-agents.md:11`, `:81-87`, `:255-261` | not used | beta (`:9`) |
| Inngest agent | Step memoization and step retries | `docs/docs-harness-durable-agents.md:139-157` | not installed | none |
| `recovery.durableAgents` | Re-drives orphaned `running` durable runs on boot | `docs/reference-core-mastra-class.md:134-136` | not set | `'off'` |

What the durable agent is and is not. It persists the loop so a restart can re-drive it from the
last snapshot, and a client can reconnect to the stream (`docs-harness-durable-agents.md:11`,
`:296-298`). It does not add step retries in process; only the Inngest variant memoizes and retries
steps (`:85`, `:141`). Recovery re-issues model calls and re-executes tools, so tools must be
idempotent (`:298`). The AgentController docs never mention it. The controller drives the agent
through `agent.sendSignal` (`ctl.js:4041`, `ctl.js:4116`, `ctl.js:4172`), and a durable agent starts
signal-woken runs with its durable stream (`docs-harness-durable-agents.md:87`). So passing
`createDurableAgent({ agent: createCodingAgent(...) })` to the controller may work, but it is an
undocumented combination of a beta feature. It also writes more to the same Postgres that failed
today. Last, its recovery resolves the workspace again after a restart, and ours comes from
in-memory maps keyed by run (`hub/module.ts:331-339`, `hub/run-runtime.ts:362-364`), which a
restart empties. Durable recovery only becomes useful after the sandbox can be found again by a
stable id (Question 3, unit B3).

### What happens to the run when a step fails

It settles as failed. No retry, no resume. `sendBuilderSessionMessage` throws
(`hub/runtime.ts:102`). The run runtime's `finally` destroys the sandbox (`hub/run-runtime.ts:329-335`).
The service appends the "edits discarded" note (`hub/service.ts:207-216`, text at
`hub/module.ts:113-120`) and fails the run (`hub/service.ts:222`). The next message is a new run
whose base is `main`, read under the Project's run lock (`hub/service.ts:256-257`), in a new sandbox.

On a Hub restart (AC-17), `recover()` runs `builder.recover_builder_runs()` (`hub/service.ts:284-287`).
It marks every `QUEUED` run, and every `RUNNING` run without a candidate, `INTERRUPTED` with
`HUB_RESTART` (`wt/apps/hub/migrations/0032_conexus_git.sql:408-416`). A run with a candidate is
reconciled against `main` (`hub/service.ts:60-81`). No discard note is written on this path, so the
thread keeps tool calls for edits that no longer exist. The orphaned sandbox is killed by E2B when
its 15 minute timeout lapses (`hub/sandbox.ts:98-108`, `onTimeout: 'kill'`).

### Recommendation for transient failures (native first)

1. **Storage waits instead of failing.** Give the Mastra storage pool a longer
   `connectionTimeoutMillis` (for example 30 s) through `createPostgresPool`
   (`wt/apps/hub/src/platform/postgres.ts:26-34`, caller `hub/module.ts:284`). This fixes today's
   failure at the boundary where it happened, because the loop's storage read then waits for a
   free connection. There is no Mastra switch for this.
2. **Name the failure truthfully.** In `modelFailure` (`hub/runtime.ts:51-57`), a `parseError`
   result of `timeout` or `network` that has no HTTP status is a platform fault, not the model. Map
   it to a new code, `BUILDER_AGENT_PLATFORM_FAILED`, under the existing `INTERNAL_ERROR` category
   (`hub/failure-vocabulary.ts`), which already says "Ocorreu um erro interno inesperado. Tente
   novamente." No new category and no web change.
3. **Continue the same turn once.** In `sendTurn` (`hub/run-runtime.ts:391-413`), when the agent
   ends with a retryable error (`parseError(...).retryable`, which covers `timeout`, `network` and
   `rate_limit`), wait `retryDelay` and send one continuation on the same session. The sandbox,
   the thread and every persisted step are still there. At most 2 continuations per run.
4. **Keep what Mastra already does for the model.** Set `maxProcessorRetries: 3` on the agent to
   make today's fallback explicit and silence `log:755`. Leave `maxRetries` at 0 so provider
   attempts don't multiply (`docs/reference-processors-stream-error-retry-processor.md:44`).

Never retry an auth refusal (401, 403, `ProviderAuthRequiredError`, `BUILDER_MODEL_NOT_SELECTED`),
a tripwire, a cancellation, a refused candidate or a failed check. A 400 is already retried once by
Mastra (`core/coding-agent/index.js:199-201`); the Hub adds nothing on top.

Files touched: `platform/postgres.ts`, `builder/module.ts`, `builder/runtime.ts`,
`builder/run-runtime.ts`, `builder/failure-vocabulary.ts`, `builder/harness/controller.ts`. No
spec amendment: AC-17 speaks of a run that fails, and a retried transient fault has not failed yet.

## Question 2. The sandbox per message

### What happens per message today

Each message is one run (`hub/service.ts:253-262`), and each run does all of this in
`hub/run-runtime.ts`:

1. Check the model account (`:130-132`), then open the connector scope (`:133`).
2. Build a new `E2BSandbox` with id `conexus-run-<runId>` and `onTimeout: 'kill'`
   (`:134`, `hub/sandbox.ts:98-114`), then `start()` (`:157`). `start()` would reattach to a sandbox
   with the same logical id (`e2bm/index.js:804-816`, `:1205-1214`), but the id is new every run.
3. Run `true`, record the incarnation, start the keepalive every 5 minutes (`:160-171`,
   `hub/sandbox.ts:38-63`), and check the agent user (`:191`).
4. Seed: the Hub bundles `main`, writes it as root, and the sandbox fetches and checks out the
   base (`:194`, `hub/conexus-git.ts:274-294`).
5. Install the check and server build scripts as root (`:199-209`), then write the starter
   (`:211-215`). No `npm install`; the template carries the compiler's `node_modules`, linked at
   check time (`hub/application-check.ts:549-550`).
6. Open a new session with scope `builder:<runId>` on the conversation's thread (`:217-221`,
   `:383`), then send the turn (`:223`).
7. After the agent: commit the checkout into `refs/conexus/runs/<runId>` and pull it as a bundle
   (`:236`, `hub/conexus-git.ts:301-335`), then run the admission check and the Preview check, each
   about 7 s on this host (`log:745-746`, typecheck 4.4 to 5.0 s).
8. Delete the session (`:370-373`) and destroy the sandbox in `finally` (`:332`).

A second message in the same conversation never reuses the first sandbox. It gets a new id, a new
VM, a new seed, a new session and two new checks.

### How long preparation takes

The log does not show it. It has no timing between claim and the first model step; the only timed
lines are the two checks. Two sources would show it. The first is `builder_run.started_at`, set at
claim (`wt/apps/hub/migrations/0001_baseline.sql:246`), against the first agent span in
`observability.mastra_ai_spans`. The second is a log line to add at `hub/run-runtime.ts:222`,
`BUILDER_RUN_TIMING:<runId>:sandbox=<ms>:seed=<ms>:starter=<ms>:session=<ms>`. The one E2B figure
on record is `Sandbox.connect` at 356 and 365 ms
(`conexus-study/2026-09-27/exec/a/REPORT.md:24`). The two checks alone add about 14 s after every
message that changes files.

### What spec 0002 decided and why

AC-14 says "A run seeds a fresh E2B sandbox from `main`" and makes the end of Construir the moment
the Hub commits and admits (`spec/index.md:87-93`). AC-16 holds one run per Project
(`spec/index.md:96-98`), and AC-17 says a failed run ends failed and "the next run starts from
`main`", keeping the discard note (`spec/index.md:99-102`). The rationale gives no argument for
fresh per run over reuse. Its stated reason is that `main` in the Conexus Git is the admitted
version, "so no second copy of that state is kept anywhere" (`spec/rationale.md:89-91`), and that
the Hub's E2B code was kept as it worked (`spec/rationale.md:97-98`, `spec/index.md:197-202`). Fresh
per run was inherited from the Factory's per-task model, not chosen against an alternative.

### The options

| Option | Cost | Correctness risk | Time saved per message |
| --- | --- | --- | --- |
| Keep fresh per run | One VM per message, billed only while the run lives | None new. Every failure loses the work (Question 3). | none |
| Warm sandbox per conversation for N minutes, reused when `main` has not moved | Idle VM billed until N lapses | Stale base when `main` moved, so it must be recreated anyway. The one-run lock is unchanged. The sandbox still holds no secret. | create, seed and starter, only when `main` is still |
| E2B pause and resume | No compute bill while paused (`e2bm/index.js:884-887`) | Resume must be verified to keep the filesystem (`e2bsdk/index.d.ts:10926-10947`, full memory snapshot by default). Background processes resume too, so the Hub must kill the agent user's processes at turn end. | create, seed and starter; resume replaces create |
| Snapshot of the prepared sandbox (`createSnapshot`, `fork`) | Snapshot storage | A snapshot of the template plus starter is a better template, not a session. Per-Project snapshots go stale on every `main` move. | create only |
| Repo template (`createRepoTemplate`, `e2bm/index.d.ts:4`) | Build per repo head | Needs an https clone URL and a credential (`e2bm/utils/repo-template.d.ts:10-21`). The Conexus Git is on the Hub's disk, and AC-15 forbids Git credentials. Not applicable. | n/a |

Speed alone is a weak reason to change: the checks dominate. The strong reason is durability, which
Question 3 answers. So the recommendation for Question 2 is Question 3's design B.

## Question 3. If it crashes, does it lose everything?

### The premise, written down

"A run's work lives only in its sandbox until admission." Every failure path below assumes it. The
census, from the branch log, is every run that failed: 3 by the database (`log:776`, and the
`BUILDER_RUN_FAILED` at `log:546` "Connection terminated unexpectedly" and `log:421` "the database system is
shutting down"), 1 by the sandbox vanishing (run `0bac448d`, "Sandbox ... not found"), and 2 by
configuration (web search provider). Each cause differs, but every one lost all of the run's file
work. The imbalance is not in any one failure mode. It is the premise, which makes every failure
total.

### What each crash point loses today

Four things are in play: the files, the thread in Mastra memory, the task list, and the plan file.

| Crash point | Files the model wrote | Thread | Task list | Plan file |
| --- | --- | --- | --- | --- |
| Mid model turn (model error after retries) | Lost. Sandbox destroyed in `finally` (`hub/run-runtime.ts:329-335`). | Kept up to the last saved step, plus the discard note (`hub/service.ts:207-216`) | Kept in thread state (`docs/reference-coding-agent-create-coding-agent.md:145`), now describing edits that are gone | Lost |
| After N file edits | Lost, the same path. Nothing leaves the sandbox before `pullCandidate` (`hub/run-runtime.ts:236`). | Kept, with tool calls for the N edits and the note | Kept, stale | Lost |
| During `conexus_check` (agent's own) | Lost. The check runs inside the same turn. | Kept | Kept, stale | Lost |
| During admission, before `recordCandidate` | The candidate commit survives in `refs/conexus/runs/<runId>` on the Hub (`hub/conexus-git.ts:166-185`, `:256`), but nothing reads it again. A refused candidate gets the note "descartadas" (`hub/module.ts:125-126`). | Kept | Kept, stale | Lost |
| During admission, after `recordCandidate` | Kept if `main` has it. Reconciliation admits it (`hub/service.ts:60-81`, `:203-206`). | Kept | Kept | Lost |
| Hub restart | Lost. The run is `INTERRUPTED` with `HUB_RESTART` (`0032_conexus_git.sql:413-414`), and E2B kills the sandbox at timeout. | Kept, but with no discard note on this path (`hub/service.ts:284-287`) | Kept, stale | Lost |
| Sandbox death | Lost. The keepalive aborts the run (`hub/run-runtime.ts:164-171`). | Kept, with the note | Kept, stale | Lost |
| Storage timeout like today | Lost, and the web blames the model (Question 1) | Kept up to the last save | Kept, stale | Lost |

The plan file is lost even on success. `.conexus/plans/` is excluded from the commit
(`hub/conexus-git.ts:318`, AC-14). Its text survives only as the `submit_plan` suspension payload in
the thread (`hub/harness/tools.ts:48`).

Does the next message start from `main` and redo everything? Yes. The base is `main` read under the
lock (`hub/service.ts:256-257`), in a new sandbox, and the model reads a thread that says its edits
were discarded.

Run against the idempotency test ("what if the previous run crashed at every possible point?"),
only the admission step converges. The recorded candidate plus `mainContains` makes a retried
admission land in the same end state. Everything before it depends on what the sandbox held, and
the design answers that by throwing it away.

### Redesign: durability as a day-one requirement

If the Builder had been specified from the start as "the person's work survives any crash", it
would look like the tools Leandro named, and like Mitra.

**How Mitra does it.** Mitra runs Claude Code in one E2B sandbox per project
(`mitra/full-study.md:196`), discarded after 20 idle minutes (`:71`, `:868`). Only what reached Git
survives (`:832-834`). Each person has a branch `user/{id}` (`:838-850`). Every turn starts with
SYNC, `git fetch origin && git merge origin/main`, "the first literal operation of the turn", and
ends with SHARE, one commit merged into `main` and pushed (`:230-240`, the exact sequence at
`:856-865`). Its CLAUDE.md says "skipping SYNC is lying about the real state; skipping SHARE is
orphaned work that vanishes in the 20 minute idle" (`:243`). Merge conflicts are always asked of the
person in business language (`:249`, `:867-868`). Publishing is a separate act: save a release, then
promote DEV to a forked PROD project (`:872-885`). Mitra's sandbox holds a GitHub credential, since
it pushes (`git push origin main` at `mitra/full-study.md:862`). Conexus cannot copy that part (AC-15).

**What Mastra already gives.** A session resolves its workspace once, at creation, and keeps it
(`docs/reference-agent-controller-agent-controller-class.md:99`, `:437`). `createSession` is
get-or-create by resource and scope (`ctl.js:5358-5370`), and `deleteSession` does not destroy the
workspace (`ctl.js:5548-5566`). So reuse across turns is not a flag. It is the session's lifetime
and what the workspace resolver returns. `E2BSandbox` defaults to `onTimeout: 'pause'`
(`e2bm/index.js:720`). Its `stop()` pauses the VM with processes and filesystem
(`e2bm/index.js:884-907`), and `start()` finds a sandbox by its logical id through metadata and
resumes it if paused (`e2bm/index.js:804-816`, `:1205-1214`, `:1282`). The Workspace
`afterToolCall` hook runs after every workspace tool (`docs/reference-workspace-workspace-class.md:198`),
which is the native place for a per-edit checkpoint. We turn all of this off on purpose: a new id per
run (`hub/sandbox.ts:104`), `onTimeout: 'kill'` (`:108`), a new session scope per run
(`hub/run-runtime.ts:383`), and `destroy()` in `finally` (`:332`).

### Design B: a conversation owns its sandbox and its branch

- **Owner.** The conversation, not the Project. The Mastra session and thread are already per
  conversation (`hub/run-runtime.ts:378`, AC-18). Two conversations then have two working trees,
  and one person's half-done edits never show up in another's checkout. A Project owner would force
  one queue for all conversations, which is the lock we have today.
- **Working state.** The sandbox checkout on branch `conv/<conversationId>`. The model works in it
  across turns, like Claude Code.
- **Durability.** The Hub mirrors the checkout into `refs/conexus/conversations/<id>` in the
  Conexus Git, never `main`. That is `pullCandidate` with the previous mirror as parent instead of
  the base (`hub/conexus-git.ts:301-335`), at the end of every turn, and debounced from
  `afterToolCall` on edit tools. It uses the same bundle-out path as today, so the sandbox still
  holds no Git credential.
- **Staying current (SYNC).** At each turn start, when the recorded `main` differs from the Conexus
  Git's `main`, the Hub writes a bundle of `main` as root (the `seedSandbox` path,
  `hub/conexus-git.ts:274-294`), and the checkout merges it. A conflict is the Builder's first task
  of the turn.
- **Re-attach.** The sandbox id becomes `conexus-conv-<conversationId>`, with `onTimeout: 'pause'`.
  After a crash or a Hub restart, the next turn's `start()` finds and resumes it. If E2B lost it, a
  new one is seeded from the mirror ref, then SYNC runs. Either way the files come back.
- **Idle cost.** The keepalive runs only during a turn. Between turns the E2B timeout (for example 10
  minutes) pauses the VM, which stops compute billing. A Hub sweeper kills sandboxes idle longer
  than a TTL (Decision 5). The mirror makes that safe.
- **Version, not admission.** "Make a version" becomes its own act: the check on the conversation's
  tip, a fast-forward of `main` (or a merge commit when `main` moved and the merge is clean), then
  the Preview build. `fastForwardMain` already is the compare-and-swap (`hub/conexus-git.ts:191-196`).
  A failed check leaves the work in the branch, and the next turn fixes it.
- **Lock.** One active turn per conversation. The Project-wide serialization shrinks to the
  compare-and-swap on `main` during a version.
- **Preview.** From `main` only, as today. A draft Preview of the conversation branch is a later
  unit; the agent's own `conexus_check` already builds the tree in the sandbox
  (`hub/run-runtime.ts:220`).
- **Secrets.** Unchanged. Model calls stay in the Hub (AC-15). Git moves only by Hub-made bundles.
  The connector scope stays per turn and is revoked at turn end (AC-12). Two things are new: a
  long-lived VM keeps whatever the agent left running, so the Hub kills the agent user's processes
  at turn end (it already does before admission, `hub/run-runtime.ts:258`), and
  `allowPublicTraffic: false` stays (`hub/sandbox.ts:110`).
- **Settlement by change and migrations 0036 to 0038.** 0036 made a run settle by what it changed
  (`wt/apps/hub/migrations/0036_builder_run_settles_by_change.sql:3-6`). In design B a turn settles
  as a response with an optional mirror revision, and the candidate, advance and reconcile functions
  move to the version act. They stay as written; the row they write becomes a version, not a turn.
  0037 (app stack v2 pins) is unrelated. 0038 (accounts per run) stays, keyed to the turn. No
  migration is reverted; a new one adds the conversation branch head and drops the per-Project lock.

### Design A: today's shape with checkpoints

Keep the run per message and the fresh sandbox. Add the mirror ref per run
(`refs/conexus/runs/<runId>/wip`), written by `afterToolCall` and at turn end. When the previous run
of the same conversation failed unadmitted, seed the next sandbox from its checkpoint instead of
`main`, then merge `main`. Admission stays at the end of each run.

### A against B

| | A. Today plus checkpoints | B. Conversation owns sandbox and branch |
| --- | --- | --- |
| Crash mid-turn | Work since the last checkpoint is saved, and the next run restores it | Nothing lost. Sandbox resumed or rebuilt from the mirror. |
| Failed check | Work saved in the checkpoint, and the next run reseeds from it | Work stays in the branch, and the next turn fixes it |
| Preparation per message | Unchanged: create, seed, starter, session | Resume and SYNC only when `main` moved |
| Two conversations at once | Still one run per Project | Both work; they meet at the `main` compare-and-swap |
| Conflicts | Rare, since runs serialize | Real. The Builder merges in its sandbox at SYNC. |
| Cost | One VM per message | Paused VMs plus a TTL sweeper |
| Spec change | AC-17's "next run starts from `main`" | AC-14, AC-16, AC-17 and the version act |
| Code | Small: one ref and a seed choice | Medium: sandbox identity, session lifetime, version act, lock |
| Fits the product | Keeps "each message is a change" | Matches Claude Code, Codex cloud and Mitra |

**Recommendation.** Build B. A fixes the loss but keeps the change-per-message model Leandro called
legacy, and its checkpoint restore is most of B's hardest unit anyway. B's first two units deliver
A's durability, so nothing is wasted if B stops early.

### Build sequence for B, each unit with its crash proof

Each proof is a test that kills the work at the unit's point and asserts what the next turn sees.

| Unit | What | Proof | Spec 0002 |
| --- | --- | --- | --- |
| B0 | Transient fix from Question 1: pool timeout, `BUILDER_AGENT_PLATFORM_FAILED`, one continuation on the same session, explicit `maxProcessorRetries` | A fake storage throws "timeout exceeded when trying to connect" once in `getWorkflowRunById`. The turn completes and the file written before the fault is in the candidate. A second test with two faults settles `INTERNAL_ERROR`, not `MODEL_REQUEST_REFUSED`. | none |
| B1 | Mirror ref per conversation at turn end and on edit tools (debounced `afterToolCall`) | Write 3 files, destroy the sandbox before turn end. `refs/conexus/conversations/<id>` holds the 3 files. | AC-14 amendment |
| B2 | Seed from the mirror, then SYNC `main` | After B1's kill, the next turn's checkout has the 3 files plus a file another conversation put on `main`. With a conflicting edit on `main`, the turn starts with the conflict and ends with it resolved. | AC-17 amendment |
| B3 | Conversation-owned sandbox: id `conexus-conv-<id>`, `onTimeout: 'pause'`, long-lived session `conversation:<id>`, no destroy at turn end | Two messages record the same sandbox id. Kill the Hub mid-turn, boot, send a message: same sandbox, the file from the first turn is there, and prep time is below the fresh path's (`BUILDER_RUN_TIMING`). | AC-14 amendment |
| B4 | Version act: check, compare-and-swap on `main`, Preview; a failed check keeps the branch | A failing check leaves the branch intact and the next turn fixes it. Kill the Hub between the swap and the Preview: boot reconciles to "admitted, Preview not built" (today's reconcile, `hub/service.ts:60-81`). | AC-14 and AC-17 amendment |
| B5 | Lock per conversation | Two conversations of one Project run turns at once. A second message in one conversation gets the busy answer. | AC-16 amendment |
| B6 | TTL sweeper and process kill at turn end | A sandbox killed from outside while idle: the next message rebuilds from the mirror and loses nothing. No agent process survives a turn end. | none |
| B7 (later) | Draft Preview of the conversation branch | The draft shows the branch while `main`'s Preview is unchanged | new AC |
| B8 (later) | Mastra durable agent with `recovery.durableAgents` to auto-continue an interrupted turn | Kill the Hub mid-turn: on boot the turn continues without a new message, and no tool runs twice with a different result | none, but gated on B3 |

B0 ships now and alone. B1 and B2 are A's durability and prove the mirror. B3 to B5 need the
amendment. Only B5 is disjoint enough to build in parallel with B3; the rest are serial.

### Hard parts, with an answer each

- **Two conversations, one file.** Each has its own branch. The second version finds `main` moved,
  so its compare-and-swap fails with `BUILDER_SOURCE_BASE_MOVED`. Its next turn SYNCs, merges in its
  sandbox, reruns the check and tries again. Mitra asks the person on every conflict
  (`mitra/full-study.md:249`). For people who don't code, the Builder should resolve and ask only
  when the two intents clash (Decision 3).
- **Migrations in both branches.** Two conversations can each add a database migration. The merge
  may be clean in Git and still wrong in order. The check must reject duplicate or reordered
  migration numbers after a merge, before the version lands.
- **Pause resume fidelity.** The SDK says a pause keeps a full memory snapshot by default, and that
  a filesystem-only pause cold-boots from disk (`e2bsdk/index.d.ts:2448-2451`, `:2905-2907`). How
  long E2B keeps a paused sandbox is not in the installed SDK. Check E2B's docs before setting the
  TTL. The mirror makes the answer matter for speed only, not for loss.
- **Cost.** Paused VMs don't bill compute (`e2bm/index.js:884-887`). The E2B price of a paused
  sandbox's storage is not in the SDK either; confirm it with the E2B dashboard before Decision 5.
- **Hub restart during a turn.** The turn is interrupted, but its files survive in the sandbox and
  the mirror. Pending approvals do not survive a restart
  (`docs/docs-harness-agent-controller.md:421`), so a plan card waiting for approval must be shown
  again on reconnect. B8 is the later answer for continuing without a new message.

## Decisions for Leandro (spec 0002 amendment, through `/jm-architect`)

1. Who owns the sandbox and branch: the conversation (recommended) or the Project.
2. When a version lands on `main`: automatically at the end of each turn when the check passes
   (recommended; matches today's experience and Mitra's SHARE), or only when the person asks.
3. On conflict: the Builder resolves and asks only when intents clash (recommended), or it always
   asks.
4. The Preview: `main` only for now (recommended), with a draft Preview of the conversation later.
5. The idle TTL before a paused sandbox is killed: 7 days suggested, after confirming E2B's paused
   retention and storage price.

The ACs to amend are AC-14 (fresh from `main`, admission at the end of Construir), AC-16 (lock per
Project), AC-17 (failed run ends failed, next starts from `main`) and the critical scenario "Restart
after admission" (`spec/index.md:331-332`). B0 needs none.

## Principles applied

- **Make Operations Idempotent** set the frame of Question 3. Walking every crash point showed that
  only admission converges, and that pointed at the mirror ref.
- **Redesign from First Principles** turned "add checkpoints" (design A) into design B, where
  durability is the starting assumption and admission becomes a version act.
- **Attack the Premise** produced the census from the log. Six failed runs had four different
  causes and one shared outcome, which put the fault on the premise rather than on any one failure.
- **Boundary Discipline** placed the storage fix at the pool and the error naming at
  `modelFailure`, the two boundaries where the fault entered and left.
- **Laziness Protocol** kept B0 inside the existing `INTERNAL_ERROR` category and reuses
  `pullCandidate`, `seedSandbox` and `fastForwardMain` for design B instead of new mechanisms.

## Decision 3 (Leandro, 2026-09-29): the Builder resolves conflicts itself

How it runs. When a turn's version finds `main` moved (`BUILDER_SOURCE_BASE_MOVED`), the same turn
goes on, with no new message: the Hub brings the new `main` into the sandbox and merges. A clean merge
reruns `conexus_check`, including the migration order check, and tries the version again. A Git
conflict is handed to the agent as a coding task, with the other conversation's request and diff
summary; it resolves, checks, and retries. Only when the two requests contradict each other in
business terms does it call `ask_user`, with its recommendation first. The person sees a short status
("Juntando com as mudanças de outra conversa"). Proof: an AC-27 eval case with two conversations
editing the same screen, one compatible pair and one contradicting pair.

Leandro's scope note on Decision 3 (2026-09-29): foresee it, keep it small, since it does not happen
yet. The build does only what the design needs anyway: on `BUILDER_SOURCE_BASE_MOVED`, bring `main`
into the sandbox, merge, rerun the check, retry; a Git conflict goes to the agent as an ordinary task.
No special contradiction detector and no dedicated eval case until two conversations really collide.

## Decision 4 (Leandro, 2026-09-29): the Preview stays as it is

`main` only. Focus moves to the Builder's flow, what it creates, the UI it creates and its
performance, to release when ready. Decision 5 (idle TTL) defaults to 7 days, to be confirmed against
E2B's paused retention and price when B3 is built.
