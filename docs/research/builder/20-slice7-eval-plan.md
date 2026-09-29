# 20. Spec 0003 slice 7 eval plan: AC-27 cases and AC-29 Sankhya app

Read-only study on `feat/builder-own-harness-int` at `40d9671d` (worktree `<worktree>`), 2026-09-29.
"Slice 7" here is spec 0003's slice 7 (proof: run spec 0002's AC-27 cases and AC-28, recording each
run's last `CheckReport`), which spec 0002 calls part of its slice 8. Nothing was sent to the branch
Hub, Chromium 9334 or the pilot. Paths below are relative to `<worktree>` unless absolute.

## Answer in five lines

1. The driver exists (`scripts/builder-eval/run.mjs` for one case, `experiment.mjs` for the ERP
   cases as Mastra experiments). It drives the real web UI, so project creation, conversation, model
   pick and Preview grading still line up with the new web. It does **not** approve plans: a new
   conversation starts in Planejar, the run stays `RUNNING` while `submit_plan` waits, and the driver
   polls until its 30-minute timeout. That is the one blocking gap for `todo-reload`.
2. The smallest fix is to click the plan card the web already renders ("Aprovar e construir"), and
   answer a question card, inside the existing poll loop. Under the hood that is Mastra's own
   `respondToToolSuspension` on the run's session, the same call the web makes.
3. `erp/sales-dashboard` cannot run as written on this branch. Its ground truth comes from the
   simulator fixture, the Hub only admits connector `sankhya` pinned to the published Sankhya origins,
   and, most important, **an application handler can only call `sankhya.purchase-order.read`**. A
   sales dashboard cannot read sales at runtime until Q4's handler `connectors.fetch` (Q-6) exists.
4. The branch Hub has no Sankhya at all: `hub.env` has no `CONEXUS_SANKHYA_GATEWAY_ORIGIN`, so every
   connector call answers `CONNECTOR_UNCONFIGURED`, and no Connection holds the pilot credential.
   Adding the origin is config; the credential is Leandro's to type.
5. `todo-reload` and `erp/sankhya-not-connected` can run tonight without Leandro once the driver
   approves plans and has a storage state for `:4443`. AC-29 can run tonight only as a
   purchase-order app, and only after Leandro types the credential.

## 1. The driver

**Where.** `scripts/builder-eval/`:

- `run.mjs` runs one case through the product UI in a headless Playwright Chromium
  (`run.mjs:323-379`). `DEFAULT_BASE_URL` is the pilot, `https://hub.conexus.localhost:3443`
  (`run.mjs:15`).
- `experiment.mjs` runs every arm × trial × ERP case of `cases/erp/` as Mastra dataset experiments,
  binds the Project to the simulator, scores with `scorers.mjs`, and stores results in Mastra
  storage (`experiment.mjs:274-306`, `336-378`).
- `hub.mjs` is the HTTP client (calls made from inside a page, to reuse the cookie and CSRF,
  `hub.mjs:42-57`).
- Unit suites: `tests/implementation/builder-eval-{criteria,simulator,scorers,serve,experiment}.test.mjs`
  and `builder-eval-experiment-postgres.test.mjs`, wired as verify steps `builder-eval` and
  `builder-eval-postgres` (`scripts/conexus-verify.mjs:149-150`). No test covers `run.mjs` itself.

**How a run starts.** `sendAndSettle` (`run.mjs:269-321`) opens `/`, reads usable models from
`GET /api/control/model-accounts/models` (`run.mjs:100-105`), then either creates a Project from the
home composer (`createProjectAndSend`, `run.mjs:182-197`: fill "Mensagem para o agente", "Enviar",
"Nome do Projeto", "Criar e começar") or opens a new conversation on an existing Project
(`openConversationAndSend`, `run.mjs:201-216`). It polls `GET /api/control/projects/:id/builder-session`
every 4 s until the latest run leaves `QUEUED`/`RUNNING` (`run.mjs:127-137`, timeout 30 min at
`run.mjs:20`), sends up to two repair messages when `failureCategory === 'APPLICATION_BUILD_FAILED'`
(`run.mjs:155`, `297-303`), then waits until the Preview names the final run's revision
(`run.mjs:144-151`).

**How it judges.**

- `todo-reload` (`run.mjs` alone): checks run in the Preview iframe (`checks.mjs:46-80`), then, when
  `reload` is set, the driver clears the Preview origin's localStorage, sessionStorage and IndexedDB,
  reloads the frame and reruns the text checks (`run.mjs:248-263`). `PASS` needs every initial and
  reload check to pass (`run.mjs:363-366`).
- ERP cases (`experiment.mjs`): `app-correct` (`scorers.mjs:222-230`). A fixture case compares the
  Preview text with the fixture's figures. A `missingSystem` case passes only when the last run
  changed no source (`NO_SOURCE_CHANGE`) and the final reply names the system and tells the person
  to bind a Conexão in Integrações (`scorers.mjs:415-438`); the reply is read from the last trace
  (`scorers.mjs:227-228`).

**Does it still work with the new Builder?** Field by field:

| Driver dependency | New Builder | Status |
| --- | --- | --- |
| `GET /api/control/model-accounts/models` with `hasApiKey` | Kept, offers Google AI Pro and ChatGPT (`apps/hub/src/builder/model-accounts.ts:76-89`) | works |
| `GET .../builder-session` with `latestBuilderRun`, `preview.lastGood*` | Kept, same shape (`apps/hub/src/builder/routes.ts:78-103`) | works |
| `GET .../source/compare`, `POST .../builder-session/preview` | Kept (`routes.ts:173-201`, `242-259`) | works |
| Selectors: "Mensagem para o agente", `.cx-send-button`, `Modelo …` button, `data-model-id`, "Nome do Projeto", "Criar e começar", "Nova conversa", `.cx-frame-veil`, iframe "Prévia do aplicativo" | All present (`apps/web/src/features/builder/composer/composer.tsx:129,152,197`, `model-picker.tsx:108`, `features/project/components/prompt-box.tsx:132,137`, `construir/construir.tsx:286`, `construir/lens-preview.tsx:89,94`) | works |
| `--prompt-variant` rewrites the messages POST | Route still takes `promptVariant` (`routes.ts:107-125`) | works |
| Run settles `RESPONSE_ONLY` when nothing changed | Yes (`apps/hub/src/builder/run-runtime.ts:237-240`) | works |
| **Plan approval** | New conversation starts in Planejar (`harness/modes.ts:88-89`). A suspended `submit_plan` keeps the run active until the person answers (`run-runtime.ts:393-395`). The driver never answers. | **blocks**: `todo-reload` and `sales-dashboard` time out at 30 min |
| **Question answers** | `ask_user` suspends the same way (`run-runtime.ts:393-395`); the Planejar prompt interviews | **blocks** when the model asks |
| Repair loop | A check refusal now fails admission as `BUILDER_CHECK_FAILED` → `SOURCE_RESULT_REJECTED` (`failure-vocabulary.ts:64`), not repaired; only a post-admission build failure is `APPLICATION_BUILD_FAILED`. The agent runs `conexus_check` itself in Construir. | acceptable; repairs will be rare |
| `experiment.mjs` simulator binding | `hub.mjs:11-13` binds `connectorId: 'sankhya-sim'`; the contract admits only `sankhya` (`apps/hub/src/connectors/model.ts:1`, generated CON-01/02 schemas) | **blocks** fixture cases (#346 open) |
| Eval Mastra storage | `scorers.mjs:21-22` reads schema `factory` as `hub_factory`; the Builder still stores there (`apps/hub/src/builder/module.ts:188-189`) | works until spec 0002's removal slice moves it to `mastra` |
| Trace lookup | Keys `conexusBuilderRunId`/`conexusBuilderProjectId` still set (`apps/hub/src/builder/runtime.ts:39-43`, `run-runtime.ts:145`) | works; a Planejar→Construir run may have more than one root span per run id, and `findTraceIds` keeps one (`scorers.mjs:72-80`), so trace metrics may undercount |
| Session helper | `resolveStatePath` falls back to `<home>/conexus-test-session.sh` (`run.mjs:84-92`), which probes and may sign in on **3443** (`<home>/conexus-test-session.sh:14`, `<home>/conexus-test-operator-login.mjs:7`) | **hazard**: touches the pilot unless `CONEXUS_STATE` is set |

**Auto-approval: does it exist?** No. Nothing in `scripts/builder-eval/` names `submit_plan`,
`tool-suspension`, "Aprovar" or "Pergunta". AC-27 requires it.

**Smallest Mastra-native way.** The web approves with
`session.respondToToolSuspension(toolCallId, { action: 'approved' })` on the run's own session
(`apps/web/src/features/builder/mastra-session.ts:233-236`), which is Mastra's
`POST /api/builder/agent-controller/conexus-builder/sessions/project:<id>/tool-suspension?sessionScope=builder:<runId>`
with `{ toolCallId, resumeData }` (`node_modules/@mastra/server/dist/server/handlers/agent-controller.js:143-147`,
`626-660`; allowed by the Hub mount at `apps/hub/src/builder/mastra-session-routes.ts:36-37`). The
catch is `toolCallId`: the stream has no replay on subscribe (`agent-controller.js:474-540`), and the
session state route does not return pending suspensions (`agent-controller.js:760-835`). The web
learns it from the live `tool_suspended` event (`apps/web/src/features/builder/live-turn.ts:101-102`)
and renders a card.

So the lazy path is the one a person takes. The driver already keeps one page open on the
conversation for the whole run, so the web's own subscription catches the suspension and renders:

- the plan card, `section[aria-label="Plano para aprovar"]` with the button "Aprovar e construir"
  (`apps/web/src/features/builder/construir/pending-card.tsx:65-74`);
- the question card, `[aria-label="Pergunta do agente"]`: an option click submits a single-select
  question; otherwise fill its text box and click its submit button
  (`construir/pending-card.tsx:80-89`, `construir/ask-user-pt.tsx:35-76`).

Inside `pollForSettledRun`, each tick: if the plan card is visible, record its title and plan text,
click "Aprovar e construir"; if a question card is visible, record the question, answer the first
option or the fixed text "Pode seguir com o que achar mais simples.", submit. Record each answer in
`result.answers`. Two gotchas: the pending card lives only in live state (`live-turn.ts:23`,
`construir.tsx:153`), so the driver must never reload the page while a run is active (it does not
today); and the refusal case must not see a plan card, so a plan card on that case is recorded, and
approving it is still correct (the scorer then fails the case on the changed source, which is the
right verdict).

If the card path proves flaky, the fallback is the direct route above, with `toolCallId` taken from
the thread's messages (`GET .../threads/:threadId/messages` is allowed, `mastra-session-routes.ts:32`).
Whether a suspended call is already persisted there is not verified; measure it before relying on it.

## 2. The three cases

| Case | File | Asserts | Needs |
| --- | --- | --- | --- |
| `todo-reload` | `scripts/builder-eval/cases/todo-reload.json:1-9` | Fill `input` with "Lavar o carro", click "Adicionar", body contains it; after clearing browser storage and reloading the frame, body still contains it (`run.mjs:248-263`) | A usable model; the new Builder's data path (a migration and handlers) so data survives the reload |
| `erp/sankhya-not-connected` | `scripts/builder-eval/cases/erp/sankhya-not-connected.json:1-4` (`missingSystem: "Sankhya"`, purchase order 40118) | Last run `RESPONSE_ONLY` (no source change) and the final reply names Sankhya and tells the person to bind a Conexão in Integrações (`scorers.mjs:415-438`) | A Project with **no** binding. Nothing else. The brief already tells a Project with no binding that it has no Connection (`tests/implementation/builder-run-runtime.test.mjs:876`) |
| `erp/sales-dashboard` | `scripts/builder-eval/cases/erp/sales-dashboard.json:1-3` (`fixture: "sales-v1"`) | Preview shows every seller name and every monthly and grand total the fixture computes, and none of the planted mistakes (`scorers.mjs:380`, `sankhya-criteria.mjs`, `fixtures/sales-v1.mjs`) | A Sankhya Connection bound to the Project, **and** a way for the app to read sales at runtime |

**What breaks `sales-dashboard` against the pilot's Sankhya.**

1. The truth is the simulator's fixture (`experiment.mjs:139-140`). Real data has no computed truth,
   so `app-correct` cannot grade it.
2. The simulator cannot be bound: the Hub admits only connector `sankhya`
   (`apps/hub/src/connectors/model.ts:1`) and pins its origin to `https://api.sankhya.com.br` or the
   sandbox (`apps/hub/src/connectors/sankhya/gateway.ts:13`, `46-48`). This is issue #346.
3. At runtime a handler can call only `connectors.call(operationId, input)` over `/v1/call`
   (`apps/hub/src/app-runner/worker.ts:42-49`, `apps/hub/src/connectors/handler-port.ts:83-102`), and
   the one operation is `sankhya.purchase-order.read`, a lookup of one purchase order by number
   (`apps/hub/src/connectors/sankhya/definition.ts:16`, `sankhya/purchase-order.ts:13-16`, `98`). The
   Sankhya skill says the same (`sankhya/skill.ts:34`). The Builder can read sales while it builds
   (`connector_fetch`), but the app it builds cannot. The honest outcomes are a refusal or an app with
   baked-in numbers, and the second is both wrong and a leak.

The handler `connectors.fetch` is item 2 of the Q4 closure set
(`docs/tasks/stage2-q4-sankhya-connector-qualification.md:112-118`), decided by Leandro on
2026-09-28 as Q-6 (browser gets the handler return only, runner cap 256 KiB, 8 calls;
`decisions.tsv` row at 14:40:45Z). It is not built on `main` or on the
branch.

**Recommendation.** Declare now, before the run, one of two routes for the third case, and write it
into the gate-proof declaration:

- **A (recommended).** Build Q-6 first (it is Q4 closure item 2 anyway), then run `sales-dashboard`
  against the pilot Sankhya with a structural pass: the final run admitted and built; the Preview
  shows six month labels (janeiro to junho or their abbreviations), a seller column with at least one
  row, and a "Total" row; no error text; the app's handler read through the binding (Hub connector
  log line or span for the Preview invocation). Values are masked in every artifact. Exact figures
  are not graded (no truth); Leandro may spot-check one number privately.
- **B.** Keep the case graded exactly, against the simulator, after #346 decides how the Hub admits a
  simulator connector. This needs a product call on #346 and still needs Q-6.

Either way, AC-29 can be proven tonight without Q-6 by a purchase-order app (see section 3).

## 3. Sankhya on the branch Hub

**What the branch has.** `<branch-state>/hub.env` key names (values not read):
`CONEXUS_APPLICATION_DOMAIN`, `CONEXUS_APPLICATION_PORT`, `CONEXUS_APP_RUNNER_SOCKET`,
`CONEXUS_BOOTSTRAP_SUBJECT`, `CONEXUS_BUILDER_E2B_API_KEY_FILE`, `CONEXUS_BUILDER_E2B_TEMPLATE_ID`,
`CONEXUS_CLIPROXY_BIN`, `CONEXUS_CLIPROXY_SHA256`, `CONEXUS_CONNECTOR_SOCKET_DIR`,
`CONEXUS_DB_BUILDER_EXECUTOR_PASSWORD_FILE`, `CONEXUS_DB_BUILDER_INGRESS_PASSWORD_FILE`,
`CONEXUS_DB_FACTORY_PASSWORD_FILE`, `CONEXUS_DB_HOST`, `CONEXUS_DB_MODEL_ACCOUNT_PASSWORD_FILE`,
`CONEXUS_DB_NAME`, `CONEXUS_DB_PASSWORD_FILE`, `CONEXUS_DB_PORT`,
`CONEXUS_DB_PROJECT_COMMAND_PASSWORD_FILE`, `CONEXUS_DB_PROJECT_READ_PASSWORD_FILE`,
`CONEXUS_DB_USER`, `CONEXUS_DB_WORKSPACE_COMMAND_PASSWORD_FILE`,
`CONEXUS_DB_WORKSPACE_READ_PASSWORD_FILE`, `CONEXUS_FACTORY_SECRET_KEY_FILE`, `CONEXUS_GIT_ROOT`,
`CONEXUS_OIDC_CLIENT_ID`, `CONEXUS_OIDC_CLIENT_SECRET_FILE`, `CONEXUS_OIDC_ISSUER`, `CONEXUS_ORIGIN`,
`CONEXUS_PORT`, `CONEXUS_PREVIEW_CERT_FILE`, `CONEXUS_PREVIEW_KEY_FILE`, `CONEXUS_PREVIEW_PORT`,
`NODE_EXTRA_CA_CERTS`, `XDG_STATE_HOME`.

`CONEXUS_SANKHYA_GATEWAY_ORIGIN` is absent. The README's config dry run shows the pilot with
`gatewayOrigin: https://api.sankhya.com.br` and the branch with none
(`<branch-state>/README.md`, "Dry run" block). The connector socket dir exists and is empty,
mode 700. Without the origin, `checkConnection` answers `CONNECTOR_UNCONFIGURED` before any network
(`apps/hub/src/connectors/module.ts:76-77`, `99`), and the gateway adapter is not built
(`module.ts:84`). The Hub reads the origin at boot (`apps/hub/src/platform/config.ts:259`).

**How a Connection is created and bound (Q4).**

- Create: `POST /api/control/workspaces/:workspaceId/connections` (CON-02), installation administrator
  only, body `{ connectionId, connectorId: 'sankhya', label, credential }`
  (`apps/hub/src/connectors/routes.ts:91-118`). The credential is exactly
  `{ clientId, clientSecret, xToken }` (`apps/hub/src/connectors/sankhya/credential.ts:6-10`), sealed
  by the store (`apps/hub/src/connectors/store.ts:99-104`). The web form is Integrações
  (`apps/web/src/routes/project-integrations.tsx:14`, `apps/web/src/features/connector/components/integrations-screen.tsx`).
- Check: CON-03 returns `OK` or a closed code (`routes.ts:121-132`).
- Bind: `POST /api/control/projects/:projectId/connection-bindings` with `{ connectionId, name }`
  (CON-09, `routes.ts:164-179`), the same call `hub.mjs:80` makes.

**What creating one on the branch needs.**

1. Add `CONEXUS_SANKHYA_GATEWAY_ORIGIN=https://api.sankhya.com.br` to `<branch-state>/hub.env`
   and restart the branch Hub by PID once the live-proof agent has finished. Not secret; no Leandro.
2. The pilot's gateway credential (client id, client secret, X-Token). It exists only sealed in the
   pilot database and with Leandro. **Leandro types it himself** in Integrações on `:4443`, signed in
   as the branch administrator. Copying the sealed row from the pilot database would work in
   principle (the branch shares the pilot's secret key file by design, README "shared by design"),
   but it reads the pilot database and moves a vendor credential, so it is his call, not ours.
3. CON-03 check returns `OK`.
4. The vendor-side read-only confirmation (Q4 evidence "Read-only") stays as recorded for the pilot's
   integration user; the same user means the same boundary.

## 4. Running against the branch Hub

**Transport.** Keep the UI driver: it is the Builder proof rule's "browser interaction" and it reuses
the plan card. Headless Playwright Chromium with a storage state, all API calls made from the page
(`hub.mjs:1-2` explains why: the local CA is trusted by Chromium's NSS store, not by Node). Auth is
the Hub session cookie `__Host-conexus_session` plus the CSRF pair (`__Host-conexus_csrf` cookie and
`x-conexus-csrf` header, `mastra-session-routes.ts:131-136`, `routes.ts:113-114`).

**Which account.** The branch database is fresh; the working model account (ChatGPT, openai-codex)
belongs to the branch administrator (`conexus_admin`, handoff 2026-09-29), and model sharing has no
route yet (`apps/hub/src/builder/model-accounts.ts:42-45`). So the eval runs as the administrator,
from a storage state exported once from the branch Chromium profile
(`<branch-state>/chromium-profile`, CDP 9334) **after** the live-proof agent finishes:
`chromium.connectOverCDP('http://127.0.0.1:9334')` then `contexts()[0].storageState({ path })`, saved
as `<branch-state>/eval/storage-state.json` (mode 600). Cookies ignore ports, so this file
must never be used against 3443. The test operator route (`<home>/conexus-test-operator-login.mjs`) is
hard-wired to 3443 and has no usable model on the branch.

**Never touch the pilot by accident.** Pass `--base-url https://hub.conexus.localhost:4443` and
`CONEXUS_STATE` on every call. Better, make `run.mjs` refuse to start without `CONEXUS_STATE` when
`--base-url` is not the default (one line in `resolveStatePath`), so the pilot helper can never run.

**Duration.** Pilot runs took 3 to 12 minutes (`run.mjs:19`). A new-Builder case adds Planejar
before Construir, an E2B start and the five-step check (about 5-10 s per check on the branch log,
`<branch-state>/logs/hub.log`, `BUILDER_CHECK` lines). Estimate 10 to 25 minutes for
`todo-reload` and `sales-dashboard`, 1 to 4 minutes for the refusal. The gate is one run each plus
one rerun per failure, sequential (one agent on the branch Hub): at most about 1.5 hours. Measure the
first run and replace this estimate.

**Evidence to record per case** (`--out <branch-state>/eval/<case>/<attempt>/`):

- `result.json` as today (`run.mjs:336-345`): Project, conversation, model, runs with state,
  `resultKind`, failure code and category, revisions, files changed, checks, Preview text, outcome.
- New: `answers[]` (each plan approved with its title and the plan text, each question with the
  answer given) and `headSha` (the branch head the Hub runs; `hub.log` prints it at start).
- New: the run's **last CheckReport**. CheckReports are not persisted by the Hub. Two sources exist:
  the agent's own `conexus_check` results in the thread's messages (tool output is the report,
  `apps/hub/src/builder/application-check.ts:26-34`; read through the allowed messages route), and the
  admission and Preview check summaries the Hub logs as
  `BUILDER_CHECK:admission|preview:<runId>:<steps>` (`run-runtime.ts:264`, `297`). The driver reads
  the first; the operator greps the second from `<branch-state>/logs/hub.log` into
  `check-log.txt` beside `result.json`.
- `preview.png` and, for `todo-reload`, `preview-after-reload.png`. For Sankhya cases, screenshots use
  Playwright's `mask` over the table cells, and `previewText` is written with digits replaced, so no
  business value lands on disk (AC-29).

## 5. Step plan for a Sonnet implementer

**Unit E1. Driver approves plans and answers questions (no Leandro).** Files:
`scripts/builder-eval/run.mjs`, `scripts/builder-eval/scorers.mjs` (export `gradeRefusal`),
`scripts/builder-eval/cases/sankhya-not-connected-run.json` (new), `scripts/builder-eval/README.md`,
`tests/implementation/builder-eval-run.test.mjs` (new), `scripts/conexus-verify.mjs` (add the new test
to the `builder-eval` step), `docs/development/builder-eval.md` (one paragraph).

1. In `pollForSettledRun`, per tick, answer a visible plan card ("Aprovar e construir") or question
   card as in section 1; push `{ kind, title, text, answer }` to `result.answers`.
2. `resolveStatePath`: when `--base-url` is not `DEFAULT_BASE_URL` and `CONEXUS_STATE` is unset, fail.
3. After settle, read the thread messages from the page and store the last `conexus_check` output as
   `result.lastCheckReport` (or `null` with a reason).
4. Add `--mask-values`: mask `td, [role=cell]` in screenshots and replace digits in `previewText`.
5. Test (behavior, literal values): export the card-answering function and drive it against a static
   HTML page served by Playwright (`page.setContent`) that renders both cards; assert the recorded
   answers equal literal objects and the click landed. Assert `parseArgs` + `resolveStatePath` refuse
   a non-default base URL without `CONEXUS_STATE` with the literal message.
6. Run: `node --test tests/implementation/builder-eval-run.test.mjs`, then
   `node scripts/conexus-verify.mjs` leaf `builder-eval`.

**Unit E2. Branch storage state (no Leandro, after the live proof ends).** A 15-line script
`<branch-state>/eval/export-state.mjs` (outside the repo) that connects over CDP 9334 and
writes the storage state, mode 600. Run once. Verify with one read: `GET /api/control/access-context`
from a page using the state returns 200.

**Unit E3. Run the two cases that need no Sankhya (no Leandro).** Declared as gate proof in the
night-run file before starting, with the head SHA.

```bash
cd <worktree>
export CONEXUS_STATE=<branch-state>/eval/storage-state.json
B=https://hub.conexus.localhost:4443
node scripts/builder-eval/run.mjs --base-url $B \
  --case scripts/builder-eval/cases/todo-reload.json --out <branch-state>/eval/todo-reload/1
```

`--model` is optional; the driver takes the first usable model from the models route. To pin one,
use an id that route returns (ids are `openai/<model>` for ChatGPT,
`apps/hub/src/builder/openai-codex/credential.ts:13`).

`erp/sankhya-not-connected` is graded by `gradeRefusal`, which only `experiment.mjs` reaches, and it
is not exported (`scripts/builder-eval/scorers.mjs:420`). Standing up the experiment pipeline and its
database URL for one item costs more than the case. Instead: export `gradeRefusal` (one word), run
the case through `run.mjs` with a case file `scripts/builder-eval/cases/sankhya-not-connected-run.json`
(the ERP case's `request`, `checks: []`), expect `failure: NO_SOURCE_CHANGE`, then grade the thread's
last assistant message with `gradeRefusal(output, 'Sankhya', reply)` and write the verdict into
`result.json`. Cover the export with the existing `builder-eval-scorers.test.mjs`.

Rerun a failed case once. Record per section 4.

**Unit E4. Sankhya on the branch (needs Leandro for step 2).**

1. Add `CONEXUS_SANKHYA_GATEWAY_ORIGIN=https://api.sankhya.com.br` to `hub.env`; restart the branch
   Hub by PID when no other agent drives it.
2. **Leandro**: open `https://hub.conexus.localhost:4443`, Integrações, create the Sankhya Conexão
   with the pilot's client id, client secret and X-Token, and press the check. About 2 minutes.
3. AC-29 without Q-6: a new Project, bind the Conexão as `erp`, ask "Quero um app onde eu digito o
   número de um pedido de compra e vejo fornecedor, itens, valor total e situação, lendo do nosso
   Sankhya." Approve the plan. In the Preview, type a real order number Leandro names (<número real> was read
   on 2026-09-26, Q4 kept evidence). Screenshot with values masked; record the connector call's
   outcome from the Hub log.
4. `erp/sales-dashboard`: only after route A or B of section 2 is chosen and, for A, Q-6 is merged
   into the branch.

**What needs Leandro.** The Sankhya credential (E4 step 2); the choice between routes A and B for
`sales-dashboard` (a product call on what "passes" means against real data, and on #346); the order
number to use for AC-29 if <número real> should not be read again. Everything else runs without him.

## Principles applied

- Laziness Protocol: auto-approval clicks the card the web already renders instead of adding a Mastra
  client, an SSE reader and `toolCallId` plumbing to the driver; the refusal case runs through
  `run.mjs` with one exported grader instead of standing up the experiment pipeline for one item.
- Prove It Works: every claim above cites the file it was read from; the sales-dashboard blocker was
  confirmed by reading the handler transport and the one registered operation, not inferred from the
  case file.
