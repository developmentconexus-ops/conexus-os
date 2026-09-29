# 24. The stop button and the sandbox lifecycle

Date 2026-09-29. Branch `feat/builder-own-harness` at `04d06b49`. Mastra core 1.71.0, `@mastra/e2b`
0.12.1, `e2b` SDK 2.46.1. Read only. Nothing was run except reads and greps. No call to the Hub or E2B.

## Resumo para o Leandro

**Hoje o botão Parar mata a E2B e joga fora o trabalho.** Ele para o agente do jeito certo (o
Mastra interrompe o turno), mas depois o Hub apaga a sessão, destrói a E2B e escreve na conversa
que as alterações foram descartadas. A próxima mensagem começa do `main`, numa E2B nova. Para a
pessoa, "Parar" hoje quer dizer "desfazer tudo desta mensagem".

**O Mastra e a E2B já fazem o que você quer.** O Mastra interrompe o turno e mantém a conversa; a
próxima mensagem continua na mesma conversa. A E2B pausa sozinha quando fica parada (não cobra) e
volta com os arquivos quando alguém a chama de novo. Somos nós que desligamos isso: um id de E2B
por mensagem, `onTimeout: 'kill'` e `destroy` no fim de toda execução.

**O certo:** Parar só interrompe o agente. A E2B e os arquivos ficam. A próxima mensagem continua
no mesmo ambiente. Quem pausa é a própria E2B, depois de uns minutos parada. Quem mata é o Hub, e
só em três casos: a E2B quebrou, a conversa foi apagada, ou ficou pausada tempo demais.

**Isso não é um conserto separado. É a unidade B3 do estudo 23.** Quando a conversa for dona da
E2B, o Parar certo sai quase de graça: basta o fim do turno não destruir nada. Antes do B3 vêm o
B1 (cópia dos arquivos da conversa no Hub a cada fim de turno, incluindo o Parar) e o B2 (a próxima
mensagem começa dessa cópia). Com B1 e B2, o Parar já não perde nada, mesmo com a E2B por mensagem
de hoje.

**Uma pergunta para você:** depois de Parar, o que ficou pela metade entra na próxima versão
junto com o próximo pedido (recomendo, é o que o Claude Code faz), ou a pessoa ganha um botão
"Desfazer o que foi parado"?

## Legend

- `wt/` is a branch worktree, `hub/` is `wt/apps/hub/src/builder`, `web/` is
  `wt/apps/web/src/features/builder`, `mig/` is `wt/apps/hub/migrations`.
- `core/` is `wt/node_modules/@mastra/core/dist`, and `docs/` is `core/docs/references`.
- `ctl.js` is `core/agent-controller-0NjSdCnl.js`, `agent.js` is `core/agent-BOxKOk3n.js`,
  `storage.js` is `core/storage-2D12aTJj.js`, `ws.js` is `core/workspace-CfX5EIVK.js`.
- `e2bm/` is `wt/node_modules/@mastra/e2b/dist`, and `e2bsdk/` is `wt/node_modules/e2b/dist`.
- `tests/` is `wt/tests/implementation`.
- Study 23 is `23-durable-agent-and-sandbox-reuse.md` beside this file.

## 1. The stop path today, end to end

### The button and the request

1. The composer shows one button. While the run of this conversation is active it is a stop
   button, labelled "Parar", and "Parando" once a stop is pending (`web/composer/composer.tsx:193`).
   Submitting the form while `RUNNING` calls `onStop` (`web/composer/composer.tsx:106`).
2. `onStop` fires the `cancel` mutation once (`web/construir/construir.tsx:334`, mutation at
   `:187-191`). It posts `/api/control/projects/:projectId/builder-session/runs/:builderRunId/cancel`
   (`web/api.ts:149-155`).
3. The route checks origin and CSRF and calls `service.cancelBuilderRun` (`hub/routes.ts:137-155`).
4. The service does two things (`hub/service.ts:264-268`). It calls the SQL function
   `request_builder_run_cancellation`, and it aborts the run's in-memory `AbortController`.
5. The SQL function (`mig/0008_builder_run_conversation.sql:203-233`) turns a `QUEUED` run straight
   into `INTERRUPTED`. A `RUNNING` run keeps `RUNNING` and only gets `cancellation_requested_at`.
   From then on `set_builder_run_phase` refuses every phase write (`mig/0001_baseline.sql:563-577`),
   so the poll shows "Parando" (`web/construir/run-state.ts:47`, `:64`).

### The agent turn

6. The run's signal is the person's signal joined with the keepalive's (`hub/run-runtime.ts:125`).
   `sendTurn` listens on it and calls `session.abort()` (`hub/run-runtime.ts:399-401`).
7. If the turn was waiting for a plan approval or an answer, `nextAgentEnd` resolves `aborted`
   at once (`hub/run-runtime.ts:406`, `:423-433`). If it was waiting between two transient-failure
   continuations, the wait ends and the error is thrown (`hub/runtime.ts:135-140`, `:157-159`).
8. Inside Mastra, `session.abort()` clears the displayed suspensions and calls `abortRun`
   (`ctl.js:3889-3898`). `abortRun` drops parked suspensions and emits `tool_suspension_cancelled`,
   resolves a pending approval gate as a decline, then aborts the live stream
   (`ctl.js:3815-3854`). The thread runtime aborts the run's own `AbortController` and publishes
   `run-aborted` (`storage.js:1239-1257`).
9. The agentic loop stops at the next boundary. A tool that already started is waited out, and its
   result is committed to the run; work that never started is dropped (`agent.js:27750-27772`,
   `:28356-28372`). A shell command started through the workspace is killed on abort
   (`ws.js:2961-2970`, the tool passes its `abortSignal` at `ws.js:8808`).
10. The run ends with `agent_end` reason `aborted` (`ctl.js:1216`). `sendBuilderSessionMessage`
    returns that reason (`hub/runtime.ts:109`, `:125`).

### The Hub after the agent

11. `execute` logs `BUILDER_AGENT_END:aborted`, binds the person's message id, then sees the
    person's signal and throws `BUILDER_RUN_CANCELLED` (`hub/run-runtime.ts:226-231`). This is
    before `pullCandidate` (`:237`), so nothing the agent wrote leaves the sandbox.
12. The `finally` block runs (`hub/run-runtime.ts:330-336`). It releases the keepalive, ends the
    connector scope, and deletes the Mastra session (`hub/run-runtime.ts:138-143`, `:371-381`).
    `deleteSession` removes only runtime state; "persisted threads and messages remain"
    (`ctl.js:5548-5566`). Then it calls `sandbox.destroy()`.
13. `destroy()` in `@mastra/e2b` kills every process, unmounts, and kills the VM
    (`e2bm/index.js:913-931`). The sandbox is gone, with every file the agent changed.
14. The service's catch sees the run reached the `AGENT` phase (`hub/service.ts:136-139`), so it
    appends a `RUN_NOT_FINISHED` note to the conversation (`hub/service.ts:207-216`). The note says
    the run did not finish, "as alterações desta execução foram descartadas e os arquivos voltaram à
    revisão <base>", and names `BUILDER_RUN_CANCELLED` (`hub/module.ts:116-123`).
15. It then calls `interrupt_builder_run(run, 'USER_CANCELLED')` (`hub/service.ts:219-220`). The
    row becomes `INTERRUPTED` with `failure_code = 'USER_CANCELLED'` (`mig/0001_baseline.sql:380-393`).
    The project's run lock is free, and the next message is a new run on `main`.

### What the person sees

16. The wire maps any `INTERRUPTED` run except a restart to `RUN_CANCELLED`
    (`hub/failure-vocabulary.ts:173`). The web shows the outcome "Parado"
    (`web/construir/run-state.ts:38`, `:57`), the reason "Execução interrompida por você."
    (`web/failure-reasons.ts:23`), and the line "As alterações desta execução não foram aplicadas."
    (`web/construir/construir.tsx:314`). The thread also shows the discard note from step 14.

### Stop at other moments

| Stop lands during | What happens | Evidence |
| --- | --- | --- |
| `QUEUED` | SQL marks it `INTERRUPTED` at once; no sandbox existed | `mig/0008_builder_run_conversation.sql:212-215` |
| `PREPARING` (sandbox, seed, starter) | Checked before the seed; later, the refused `AGENT` phase write throws. No note, since the agent never ran. Sandbox destroyed. | `hub/run-runtime.ts:193`, `hub/service.ts:136-139`, `:219-220` |
| `AGENT`, including a pending plan | As above: abort, destroy, discard note, `USER_CANCELLED` | steps 6 to 16; test `tests/builder-run-runtime.test.mjs:626-638` |
| `SOURCE_ADMISSION` | Refused before `recordCandidate`. The candidate commit already sits in `refs/conexus/runs/<runId>` in the Conexus Git, but nothing ever reads it. | `hub/run-runtime.ts:247-250`, `:278-280`; test `:305` |
| `COMPILING` or later | Too late. `main` already moved, and the run settles admitted. | `hub/service.ts:155-160`; test `tests/builder-run-runtime.test.mjs:286` |

### A second stop control nobody uses

The Hub mounts Mastra's own `POST .../sessions/:resourceId/abort` for a run's scope
(`hub/mastra-session-routes.ts:33`, `:184-188`). The web never calls it. If it did, the turn would
end `aborted` without the person's signal, and the run would fail as `BUILDER_MODEL_INCOMPLETE`
(`hub/run-runtime.ts:229-232`), shown as "O provedor do modelo recusou" (`hub/failure-vocabulary.ts:54`).
A test pins that behavior for aborts that are not the person's (`tests/builder-run-runtime.test.mjs:606`).

## 2. Every way a run ends today

"Uncommitted work" means files the agent changed that are not on `main`.

| Event | Agent | Sandbox | Uncommitted work | What the person sees |
| --- | --- | --- | --- | --- |
| Stop | `session.abort()`, turn ends `aborted`; session deleted (`hub/run-runtime.ts:399`, `:332`) | Destroyed (`hub/run-runtime.ts:333`) | Lost. Never pulled (`:231` before `:237`). Discard note in the thread. | "Parado", "Execução interrompida por você.", "As alterações desta execução não foram aplicadas." |
| Success with changes | Turn `complete`; session deleted before the pull (`hub/run-runtime.ts:233`) | Destroyed after the Preview build | None. It is on `main` (`hub/run-runtime.ts:282`). The plan file is dropped on purpose (`hub/conexus-git.ts:318`). | The result card and a new version |
| Success, answer only | Same | Destroyed | None | The answer |
| Admission check fails | Turn was `complete` | Destroyed | The candidate is kept in `refs/conexus/runs/<runId>` but never read again. Note `CANDIDATE_REFUSED` with the reason (`hub/service.ts:210-215`, `hub/module.ts:128-129`). | "A nova fonte proposta foi recusada." (`SOURCE_RESULT_REJECTED`) |
| Build fails after admission | Turn was `complete` | Destroyed | None; the source is on `main`. Note `BUILD_FAILED` (`hub/service.ts:172-177`). | "O aplicativo não compilou." |
| Model or platform error | Up to 2 continuations on the same session for retryable faults (`hub/runtime.ts:132-163`), then the error | Destroyed | Lost. Discard note `RUN_NOT_FINISHED`. | The category text, for example "O provedor do modelo recusou" or the platform text (`web/failure-reasons.ts:17-37`) |
| Sandbox dies (keepalive sees it gone) | Keepalive aborts the run signal, so `session.abort()` (`hub/run-runtime.ts:164-168`) | Already gone; destroy attempted | Lost. Discard note. | "Não foi possível preparar o ambiente de código." (`BUILDER_SANDBOX_KEEPALIVE_FAILED`, `hub/failure-vocabulary.ts:32`) |
| Hub crash or hard kill | Dies with the process; live session state is not kept (`docs/reference-agent-controller-session.md:769`) | Orphaned. E2B kills it when the last 15 minute timeout lapses (`hub/sandbox.ts:98-108`, `onTimeout: 'kill'`). | Lost. No discard note on this path (`hub/service.ts:284-287`). | "O Conexus reiniciou durante a execução." plus "não foram aplicadas" (`web/construir/run-state.ts:39`, `web/failure-reasons.ts:24`) |
| Hub graceful shutdown | Not aborted. `close()` waits for every active run to finish (`hub/service.ts:241-249`). | Destroyed when the run ends | As for the run's own ending | As for the run's own ending |
| Idle timeout | There is none. While a run lives, the keepalive resets the 15 minute E2B timeout every 5 minutes (`hub/sandbox.ts:38-63`), even while a plan waits for approval, with no upper bound (`hub/run-runtime.ts:406`). Between runs no sandbox exists. | Billed the whole time a plan waits | n/a | n/a |

Every row except success loses the files. The stop row is the only one where the loss is chosen
by the person's click rather than by a fault.

## 3. What Mastra already offers

Read from the embedded docs and source of `@mastra/core` 1.71.0.

- **Abort.** `session.abort()` aborts the active run and clears pending suspension display state
  (`docs/reference-agent-controller-session.md:136-141`). Underneath, it drops parked suspensions,
  declines a pending approval, aborts the stream, and marks the run so its end reason is `aborted`
  (`ctl.js:3801-3854`).
- **Pending tool calls.** A suspended `ask_user` or `submit_plan` is cancelled with
  `tool_suspension_cancelled` (`ctl.js:3816-3822`). A tool call already started is waited out and
  its outcome recorded; a queued one is dropped (`agent.js:27750-27772`). Abort is cooperative, so
  "a tool that ignores it still does its side effect" (`agent.js:27753-27754`). A workspace shell
  command gets the abort signal and its process is killed (`ws.js:2961-2970`, `:8808`).
- **The thread after abort.** The thread survives. "Subscribers remain attached, and new input can
  start another run" (`docs/reference-agents-agent.md:499`, `docs/docs-harness-signals.md:120`).
  Aborting keeps queued input unless `clearPendingSignals` is set (`docs/docs-harness-signals.md:114`).
  Deleting the session removes only runtime state (`ctl.js:5550-5552`).
- **Interrupt and redirect.** `session.steer({ content })` aborts the current run and sends the new
  input, keeping queued follow ups (`docs/reference-agents-agent.md:273`,
  `docs/reference-agent-controller-session.md:110-116`). `session.followUp()` queues a message
  while a run is active (`:118-124`). This is Claude Code's "type while it works".
- **Suspend and resume.** Mastra suspends only interactive tools (`ask_user`, `submit_plan`,
  approvals) and resumes them with `respondToToolSuspension`
  (`docs/docs-harness-agent-controller.md:275-288`). There is no "pause the agent here and resume
  the same run later" for a user stop. The durable agent can re-drive a crashed run, but it is beta
  and gated on a stable sandbox (study 23, B8).
- **Continuing a stopped turn.** There is no API to resume an aborted run. The next message is a new
  run on the same thread, and the model reads the history (`lastMessages: 40`,
  `hub/module.ts:345`). That is the continuation, and it is exactly how Claude Code behaves after
  Esc. It only works if the files the history describes still exist.
- **Session and workspace lifetime.** A session resolves its workspace once, at creation
  (`docs/reference-agent-controller-agent-controller-class.md:99`, `:437`), and keeps it until the
  session is deleted. So a long-lived conversation session with a long-lived workspace is the
  native shape. We delete both at every run end.
- **Live state is not durable.** Pending approvals, suspensions and run state do not survive a
  process restart (`docs/reference-agent-controller-session.md:769`,
  `docs/docs-harness-agent-controller.md:98`, `:421`).

## 4. What the installed E2B SDK offers

Installed: `e2b` 2.46.1 and `@mastra/e2b` 0.12.1.

- **Pause.** `sandbox.pause()` takes a full memory snapshot by default. With `keepMemory: false` it
  keeps only the filesystem, and resume cold boots from disk, losing processes and connections
  (`e2bsdk/index.d.ts:10926-10947`).
- **Resume.** `Sandbox.connect(id)` resumes a paused sandbox automatically
  (`e2bsdk/index.d.ts:10767-10768`). The REST description says the same and adds that the TTL is
  only extended (`e2bsdk/index.d.ts:172`).
- **Timeout action.** `lifecycle.onTimeout` is `'pause'`, `'kill'`, or `{ action: 'pause',
  keepMemory }`. Left unset, the API default is kill (`e2bsdk/index.d.ts:9253-9286`).
- **Auto resume.** `lifecycle.autoResume` wakes a paused sandbox on inbound traffic. It needs
  `onTimeout: 'pause'` and a memory snapshot (`e2bsdk/index.d.ts:9288-9296`). We do not need it:
  the Hub always resumes explicitly through `connect`.
- **Timeout.** `setTimeout` resets the TTL from now, each call overwriting the last
  (`e2bsdk/index.d.ts:623`). That is how our keepalive works.
- **The Mastra wrapper.** `E2BSandbox` defaults to `{ onTimeout: 'pause' }`
  (`e2bm/index.js:720`, `e2bm/sandbox/index.d.ts:64-75`). Its `stop()` always pauses: filesystem,
  memory and running processes, and billing stops (`e2bm/index.js:883-907`). Its `start()` first
  reattaches by the stored provider id when given one (fail closed, and it refuses a sandbox owned
  by another logical id), then finds one by the `mastra-sandbox-id` metadata and resumes it
  (`e2bm/index.js:1228-1296`). Only then does it create.
- **What we set instead.** A new logical id per run, `conexus-run-<runId>` (`hub/sandbox.ts:104`),
  `onTimeout: 'kill'` (`hub/sandbox.ts:108`), and `destroy()` in `finally`
  (`hub/run-runtime.ts:333`). The seed also resets any checkout it finds:
  `git checkout --force -B main <base>` and `git clean -fdq` (`hub/conexus-git.ts:285-287`).
- **Not in the SDK.** How long E2B keeps a paused sandbox, and what paused storage costs.

## 5. The design

### What stop should do

Stop interrupts the agent. Nothing else.

1. The web posts the same cancel request. The Hub calls `session.abort()` on the conversation's
   session. Mastra ends the turn with `aborted`, cancels a pending plan card, waits out a started
   tool and kills a running shell command.
2. The turn settles as **stopped**, a normal outcome, not a failure. No discard note. The thread gets
   a short truthful note instead: the person stopped, and the files are as the agent left them.
3. The Hub mirrors the checkout into the conversation's ref, as at every turn end (B1). Stop is a
   turn end like any other.
4. The Hub kills the agent user's processes, as at every turn end (B6), so nothing keeps running.
5. The sandbox is not destroyed. The keepalive is released and the timeout is set once to the idle
   window. The session stays.
6. No version is made. A stopped turn never lands on `main` by itself.
7. The next message goes to the same session and the same sandbox. The model sees its own tool calls
   and the files match them. It continues.

### Who pauses and who kills

| Actor | Action | When |
| --- | --- | --- |
| E2B | Pause (full memory snapshot) | The idle window lapses after a turn end: `onTimeout: 'pause'`, timeout set once at turn end, for example 10 minutes |
| Hub | Resume | The next turn: `start()` reattaches by the stored provider id and resumes |
| Hub | Kill | The sandbox is broken (keepalive sees it gone, incarnation changed, resume fails) |
| Hub | Kill | The conversation is deleted |
| Hub | Kill | A sweeper finds it paused longer than the TTL (study 23, Decision 5) |
| Nobody | Kill on stop, on success, on a model error, or on a failed check | Never |

A model or platform error is not a sandbox error. It ends the turn and keeps the sandbox, like
stop. Only a fault of the sandbox itself kills it, and then the next turn rebuilds from the mirror.

### The data shape

The owner is the conversation. The Hub stores little and lets E2B own the running or paused state.

```ts
type ConversationSandbox = Readonly<{
  conversationId: ConversationId     // owner; one sandbox per conversation
  projectId: ProjectId
  logicalId: `conexus-conv-${ConversationId}` // E2B metadata `mastra-sandbox-id`
  providerSandboxId: string | null  // last incarnation, passed as `sandboxId` for a fail-closed reattach
  mirrorHead: string | null         // refs/conexus/conversations/<id> after the last turn (B1)
  syncedMain: string | null         // the `main` revision last merged into the checkout (B2)
  lastTurnEndedAt: Date | null      // for the TTL sweeper
}>

type SandboxLifecycle =
  | { state: 'NONE' }                        // never created, or killed; next turn seeds from mirrorHead ?? main
  | { state: 'ACTIVE'; turnId: TurnId }      // a turn holds it; keepalive on
  | { state: 'IDLE' }                        // turn ended; timer running in E2B
  | { state: 'PAUSED' }                      // E2B paused it; billing stopped
```

`ACTIVE`, `IDLE` and `PAUSED` are E2B facts, read with `Sandbox.getInfo`. The Hub never writes them;
it writes only `providerSandboxId`, `mirrorHead`, `syncedMain` and `lastTurnEndedAt`. The turn,
not the sandbox, carries the outcome: `COMPLETE`, `STOPPED` or `FAILED`.

Transitions: `NONE` goes to `ACTIVE` on create and seed. `ACTIVE` goes to `IDLE` on every turn end,
stop included. `IDLE` goes to `PAUSED` by E2B. `IDLE` or `PAUSED` goes to `ACTIVE` on the next
turn. Any state goes to `NONE` only by a Hub kill, for the three reasons above.

### How it fits study 23, design B

| Unit | What it gives stop |
| --- | --- |
| B0 (transient fixes) | Already on the branch (`hub/runtime.ts:132-163`, `web/failure-reasons.ts:29-35`). Nothing for stop. |
| B1 (mirror per conversation at turn end and on edits) | Stop stops losing work. The mirror must run before the cancel check that today skips the pull (`hub/run-runtime.ts:231` before `:237`). |
| B2 (seed from the mirror, then SYNC `main`) | The next message after a stop continues with the stopped files, even in a fresh sandbox. |
| B3 (conversation-owned sandbox, `onTimeout: 'pause'`, long-lived session, no destroy) | This is Leandro's rule. Stop becomes `session.abort()` and nothing more. |
| B4 (version act) | A stopped turn makes no version. The next completed turn versions everything, stopped work included. |
| B5 (lock per conversation) | A stopped turn frees its conversation's lock only. |
| B6 (TTL sweeper, process kill at turn end) | The only killers besides a broken sandbox and a deleted conversation. |
| B7 (draft Preview) | Lets the person see the stopped work before deciding. Later. |
| B8 (durable agent) | Not needed for stop. |

### The smallest unit that could land first on today's per run model

B1, with stop counted as a turn end. On today's model the smallest real change is: when the person
stops during `AGENT`, pull the checkout into `refs/conexus/conversations/<id>` before throwing
`BUILDER_RUN_CANCELLED`, and write a truthful note instead of "descartadas". The sandbox is still
destroyed, so this alone does not meet Leandro's rule. It does make stop lossless on the Hub side,
and B2 then makes the next message start from it.

I recommend against a stop-only shortcut that keeps today's per-run sandbox alive and paused. The
next run has a new logical id, so `start()` cannot find it (`hub/sandbox.ts:104`), and the Mastra
wrapper refuses to attach a sandbox owned by another logical id (`e2bm/index.js:1262-1263`). The
seed would also wipe its checkout (`hub/conexus-git.ts:285-287`). Making it work means changing the
id to the conversation and the seed to "merge, don't reset". That is B3 and B2. Build them as
designed rather than a special case that B3 then deletes.

Two small cleanups can ride with B1. First, stop mounting Mastra's run-scope `abort` route for the
browser, or map an abort there to stop; today it would report a stop as a model refusal
(`hub/mastra-session-routes.ts:33`, `hub/run-runtime.ts:232`). Second, a plan waiting for approval
keeps a VM billed with no limit (`hub/run-runtime.ts:406`, `hub/sandbox.ts:38-63`); under B3 that
wait becomes an idle turn and the VM pauses.

### Spec impact

Spec 0002 keeps cancel "as today" (`docs/tasks/specs/0002-builder-own-harness/index.md:248`). The stop
behavior needs the same AC amendments as design B: AC-14 (fresh sandbox per run, admission at the
end), AC-16 (lock per Project) and AC-17 (a failed or stopped run ends and the next starts from
`main`). The web copy "As alterações desta execução não foram aplicadas" (`web/construir/construir.tsx:314`)
changes to say the work is kept and the next message continues it.

## 6. What is unproven, and the cheap proof for each

| Claim | Status | Cheapest proof |
| --- | --- | --- |
| What an aborted turn leaves in the thread: partial text, the finished tool calls with results, a started tool's result | Read in source, not observed | A Hub test with a real `AgentController`, in-memory storage and a mock model that emits a tool call then waits. Abort mid-stream, list the thread, assert the literal messages. No E2B. |
| The same session takes a new message after `abort()` and ends `complete` | Documented (`docs/docs-harness-signals.md:120`), not observed on 1.71 | Same test: send a second message after the abort, assert `agent_end` `complete`. |
| A running `execute_command` process dies on stop | Read in source (`ws.js:2961-2970`) | Same test with a fake sandbox whose `spawn` records the kill. |
| Pause then connect keeps `/workspace/repo`, the agent user, and root-only files; resume time | Not measured | One throwaway E2B script with our template: create with `onTimeout: 'pause'`, write a file, `pause()`, `Sandbox.connect()`, read the file, time the resume. Costs cents. Outside this read-only unit. |
| A timeout lapse pauses, not kills, when the timeout was reset by `setTimeout` after create | Implied by the lifecycle being set at create (`e2bm/index.js:823`) | The same script with a 60 second timeout and one `setTimeout` call, then `getInfo` shows `paused`. |
| Processes resume with a memory snapshot and would keep running after a stop | SDK says so (`e2bsdk/index.d.ts:10930-10934`) | The same script: start `sleep 999`, pause, connect, `ps`. This decides whether the process kill at turn end (B6) is required; I expect yes. |
| How long E2B keeps a paused sandbox, and its storage price | Not in the SDK | E2B docs and dashboard. Needed for the TTL (Decision 5). The mirror makes it a speed question, not a loss question. |
| Reattach after a Hub restart by stored provider id is fast and never forks a second VM | Read in source (`e2bm/index.js:1228-1275`) | Part of B3's proof in study 23: kill the Hub mid-turn, boot, send a message, assert the same provider id. |

## Principles applied

- **Redesign from First Principles.** Treating "stop never tears down the environment" as a
  day-one rule showed that stop is not its own feature. It falls out of conversation ownership (B3),
  so the recommendation is to build B1 to B3, not a stop special case.
- **Laziness Protocol.** The design reuses `session.abort()`, E2B's own `onTimeout: 'pause'`, and the
  wrapper's `start()` reattach instead of new pause or resume code. The Hub stores four fields and
  reads the running or paused state from E2B rather than mirroring it.
- **Model the Domain.** The sandbox lifecycle is a small state machine with named killers, and the
  outcome of stop lives on the turn, not on the sandbox. That removed the question "should stop
  pause the VM?": stop only ends a turn, and pausing belongs to the idle timer.
- **Make Operations Idempotent.** Every turn end, stop included, runs the same mirror and process
  kill, so a crash at any point leaves the same recoverable state.

## Decision (Leandro, 2026-09-29)

After a stop, the work done so far stays in the conversation's sandbox and branch and goes into the
next version together with the next request, once its check passes. There is no "desfazer" button now.
This is what Claude Code, Codex and Mastra Code do: stopping never discards work on disk. Claude Code
adds checkpoints (`/rewind`) as a separate way back. Our per turn branch commits (design B) give the
same checkpoints for free, so a "voltar a este ponto" per message can come later, when someone needs it.
Until then, the person asks the Builder to undo.
