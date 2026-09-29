# Builder eval

The one rerunnable proof every Stage 2 Builder gate needs: send a normal product-language
request to the real Builder, on a fresh Project, through the product UI exactly as a person
would, and record whether a usable Preview came out the other end. Guidance, starter and skill
changes become measurements instead of opinions.

## Run

```bash
export CONEXUS_STATE=$(~/conexus-test-session.sh)   # or let run.mjs call the helper itself
node scripts/builder-eval/run.mjs \
  --case scripts/builder-eval/cases/todo-basic.json \
  --out /tmp/builder-eval/run-1
```

Options (`--help` prints the same list):

- `--case <file>` (required): a case JSON, see below.
- `--out <dir>` (required): where `result.json` and, on a usable Preview, `preview.png` land.
- `--project <id>`: reuse an existing Project (a fresh conversation is opened on it) instead of
  creating one.
- `--model <id>`: a model id from `GET /api/control/model-accounts/models`; default is the first
  model the signed-in account can actually use.
- `--prompt-variant <id>`: the Builder prompt variant (a folder of
  `apps/hub/src/builder/harness/prompt/`, such as `v2`) every run of this case uses; the
  eval adds it to each message the UI sends. Default: the Hub's own default. The run's trace
  records the variant the Hub used, as `conexusPromptVariant` beside `conexusBuilderRunId`.
- `--grade-only` (needs `--project`): send no request; grade the Project's current Preview with the
  case's checks, including the reload when the case asks. Use it to regrade a run the tool misread.
- `--project-name <name>`: name for a newly created Project; default `eval-<date>-<time>`.
- `--max-repairs <n>`: repair messages ("o build falhou, corrija") to send after a run whose failure
  category is `APPLICATION_BUILD_FAILED`, the only failure the source can fix; default 2. A platform
  failure (runner unavailable, Hub restart) is recorded and never repaired.
- `--base-url <url>`: Hub origin; default `https://hub.conexus.localhost:3443`. Any other origin needs
  `CONEXUS_STATE` set to a storage state for it; the driver then never calls the pilot session
  helper, which signs in on 3443.
- `--mask-values`: keep business values out of the saved evidence. Table cells (`td`, `[role=cell]`)
  are masked in the screenshots and every digit in `previewText` becomes `#`.
- `--headed`: visible browser instead of headless, for debugging a run.

The run needs a live Hub and a signed-in test-operator session (`~/conexus-test-session.sh`); see
`conexus-live-hub-runbook` and `conexus-test-operator-login` in project memory. It never writes to
the database or Mastra storage directly, only the Hub's own HTTP API and the product UI.

## Case file

```json
{
  "request": "Portuguese, product-language request sent to the Builder as the first message.",
  "checks": [
    { "action": "fill", "selector": "input", "value": "Lavar o carro" },
    { "action": "click", "selector": "text=Adicionar" },
    { "action": "expectText", "selector": "body", "text": "Lavar o carro" }
  ],
  "reload": false
}
```

`checks` run in order against the Preview iframe once the run settles and the Preview names the
final run's source revision (polled up to three minutes). `selector` is any Playwright locator
string (CSS, `text=`, `role=...`). `fill` needs `value`; `expectText` needs `text` and passes when
the element's text contains it within 15 seconds (Playwright's retrying `toContainText`).
`expectNoText` needs `text` and passes when the text is absent; put an `expectText` for data the
page must have loaded before it, or absence passes on a page that has not rendered yet. A failing step is recorded, not thrown, so
every step still runs. `reload` (optional, default `false`): once every initial check passes,
clear the Preview origin's browser storage (localStorage, sessionStorage, IndexedDB), reload the
Preview iframe in place and rerun the `expectText` and `expectNoText` checks against it, to prove the
result was saved outside the browser.

## Output

`result.json` in `--out`:

- `projectId`, `conversationId`, `modelId`, `promptVariant` (`null` when the Hub's default was used), `request`.
- `sourceRevisionBefore` / `sourceRevisionAfter`, `filesChanged` (from
  `GET .../source/compare`).
- `runs`: one entry per BuilderRun sent (the first request plus each repair), with
  `builderRunId`, `state`, `resultKind`, `failureCode`, `failureCategory`.
- `answers`: each card the driver answered while the run waited for a person, as
  `{ kind, title, text, answer }`. A new conversation starts in Planejar, so the driver clicks
  "Aprovar e construir" on the plan card, and on a question card ("Pergunta do agente") picks the
  first option, or sends "Pode seguir com o que achar mais simples." when the card has none. It is
  the same click a person makes, which sends Mastra's own `respondToToolSuspension`; the driver
  adds no Hub route and must never reload the page while a run is active.
- `lastCheckReport`: the last `conexus_check` report the agent got in the conversation, read from
  the thread's messages, or `null` with `lastCheckReportReason`.
- `refusal`: only for a case with `missingSystem` (see `cases/sankhya-not-connected-run.json`):
  `gradeRefusal`'s `{ score, reason }` over the last run and the last assistant reply. The case
  passes when the score is 1. The graded reply text is stored in `refusal.reply`, digits masked with `--mask-values`.
- `repairIterations`: how many repair messages were actually sent.
- `wallTimeToUsablePreviewMs`: from the request landing to the Preview's loading veil lifting.
- `previewUrl`, `screenshotPath` (relative to `--out`; a reload also writes
  `preview-after-reload.png`), `checks.initial`, `checks.afterReload`, `gradeOnly`.
- `failure`: why no checks ran, when they did not. `FINAL_RUN_NOT_BUILT` means the last run did not
  produce a built source; `NO_SOURCE_CHANGE` means the last run answered without changing the
  source; `PREVIEW_NOT_FROM_FINAL_RUN` means the Preview never named the final
  run's revision within the bound; `NO_PREVIEW` (grade-only) means the Project has no Preview. Checks never grade a Preview the request did not produce.
- `previewText`: the Preview's visible text after the checks ran, or `null` when no Preview was
  graded. The experiment driver grades this text.
- `outcome`: `PASS`, `FAIL` (a check failed, `failure` is set, or no Preview became usable), or
  `ERROR` (the tool itself broke; see `error` and `failure.png`).

## Experiments

`experiment.mjs` runs `runCase` for every arm, trial and ERP case, and stores each result in a Mastra
experiment instead of `result.json`. [How to measure a Builder change with an
experiment](../../docs/development/builder-eval.md) is the operator guide. This section is the
reference.

| Script | What it does |
| --- | --- |
| `sankhya-sim.mjs` | Serves synthetic Sankhya data on `127.0.0.1:4180`: `/authenticate`, `CRUDServiceProvider.loadRecords` in the vendor envelope with 50-row pages, and `/__sim/health`. `--port <n>` changes the port. |
| `serve.mjs` | Serves every Mastra route on `127.0.0.1:4111/api` over the database in `CONEXUS_EVAL_DATABASE_URL`, with the eval scorers registered. `--port <n>` changes the port. |
| `experiment.mjs` | Syncs the dataset, creates one experiment per arm and trial, runs two Builder runs at a time, scores each result and finalizes each complete experiment. |

`experiment.mjs` options (`--help` prints the same list):

- `--comparison <id>` (required): groups the experiments of one setup. Rerun the same id to resume.
- `--arms <a,b>`: arm ids from `arms/`; default every arm.
- `--trials <n>`: default 1.
- `--concurrency <n>`: Builder runs at once; default 2.
- `--simulator <origin>`: default `http://127.0.0.1:4180`.
- `--hub-version <sha>`: recorded as the experiments' `provenance.sourceVersion`.
- `--out <dir>`, `--max-repairs <n>`, `--base-url <url>`: as for `run.mjs`.

An arm is `arms/<id>.json` with the key `model` and, optionally, `promptVariant` (as for
`run.mjs --prompt-variant`), so two arms can compare prompt variants on the same model. An ERP case is `cases/erp/<id>.json` with
`request` and one of two keys:

- `fixture`: the driver binds the Project to the simulator, and the case's known answers come from
  that fixture in `fixtures/`, never from the case file.
- `missingSystem`: the Project gets no binding, and the case expects a refusal. The last run changes
  no source, and its reply names that system and Integrações, where the person binds a Conexão.
  `sankhya-not-connected` reproduces Q4.7 run 1 of issue #310.
