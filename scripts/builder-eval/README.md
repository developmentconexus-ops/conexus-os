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
- `--arm <id>`: the methodology arm under test. `arms/<id>.json` may set `model` and `promptVariant`; an
  id with no file is itself the prompt variant. It reaches the Hub only as the `promptVariant` field of
  each message the driver sends, never in the Project name, the request or the person's words. The Hub's
  route accepts only the ids in `PROMPT_VARIANTS`, so an arm the MethodologyVariant record has not added
  yet is refused with a 400 at the first message.
- `--repetition <n>`, `--hub-version <sha>`: recorded in `timings.identity`.
- `--max-slices <n>`: messages sent to carry a plan on after a version while it lists slices left;
  default 6.
- `--no-correction`: skip the scripted person's one correction message.
- `--project-name <name>`: name for a newly created Project; default is the case's `person.projectName`
  (an organic name such as "Cobrança"), else `eval-<date>-<time>`.
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

## Bakeoff cases

The methodology bakeoff (study 34) runs the cases in `cases/bakeoff/` on one arm at a time. A bakeoff
case has a `person` block (the answer sheet) and an `oracle` id, and no `checks`: the oracle grades it.

```bash
export CONEXUS_EVAL_VALUES_FILE=~/eval-private/values.json   # {"quoteTop": "...", "quoteNumber": "..."}, outside the repo
export CONEXUS_EVAL_ORACLE_DIR=~/eval-private/oracle         # <case>.json per case, outside every workspace
export CONEXUS_EVAL_DATABASE_URL=...             # optional: spans for the timing block
export CONEXUS_HUB_LOG=~/conexus-branch-state/logs/hub.log   # optional: BUILDER_RUN_TIMING lines
node scripts/builder-eval/run.mjs --case scripts/builder-eval/cases/bakeoff/h1.json --arm v2 --repetition 1 \
  --out /tmp/builder-eval/h1-v2-1 --mask-values
```

- **The scripted person** (`person.mjs`). A small Mastra Agent reads each question card and returns which
  rule of the sheet it touches (and, on an option card, which option says what the sheet says). The words
  come from the sheet. A question the sheet does not cover gets "Não sei." in text, or on an option card
  the option that says "não sei" or "tanto faz", else the last option that is neither the first nor
  marked "recomendado". Every plan card is approved, in order. It sees the card and nothing else, never the arm.
  The person runs on Claude Opus 5.5 through the Claude subscription, with no API key: Mastra's claude-max
  provider (`@mastra/code-sdk`) reads Mastra Code's own credential store (`auth.json` under
  `MASTRA_APP_DATA_DIR`, else the default app data dir), so the Hub and its accounts are not involved. Sign the
  subscription in once with `node scripts/builder-eval/login.mjs start`, which prints an address to open in a
  browser, then `node scripts/builder-eval/login.mjs complete <code>` with the code the page shows. The verifier
  waits in a mode 600 file in the system temp dir, and no token is ever printed. `CONEXUS_EVAL_PERSON_MODEL`
  (a Mastra model id, which needs its own provider key) overrides the model.
- **Sheets.** Words and rules only. A private value is a `{{value:name}}` placeholder filled from the
  file named by `CONEXUS_EVAL_VALUES_FILE`; a missing one stops the run before it starts. The matcher
  model reads the text with the placeholder, never the value. A rule with `"hidden": true` is a
  requirement the person holds and says only when a question touches it.
- **Slices.** After a run that built, the driver reads the last plan and the last reply. While one says
  `Fatias restantes: N` with N above zero, the person sends the sheet's `continue` text (default "Pode
  seguir com a próxima fatia."), up to `--max-slices`. The arm's prompt must print that line.
- **Oracle** (`oracle.mjs`). `node scripts/builder-eval/oracle.mjs --case h1 --preview <text file>
  [--plan <text file>]` compares a Preview with `<CONEXUS_EVAL_ORACLE_DIR>/h1.json` and prints booleans
  and counts only. The file format is in the header of the script. The oracle agent that writes those
  files runs separately, with its own ERP access.
- **Correction.** When the first Preview differs from the oracle, the person sends one message built from
  the differences (counts and column names, never a value), and the new Preview is compared again.
  `result.oracle` holds both comparisons, `result.correction` the message and its outcome.
- **Timing block.** `result.timings` holds the identity (case, arm, repetition, model, Hub version, machine
  load), the person's counts and, per Builder run, the block of `timing.mjs`: phases, model against tool
  time, tools, checks until green. It needs `CONEXUS_EVAL_DATABASE_URL`; without it the block is null and
  says why. `BUILDER_RUN_TIMING:<runId>:sandbox=...` lines from the Hub log fill `phases.hubStages`.
- **Outcome.** A bakeoff case is `PASS` when the first Preview matches the oracle, `FAIL` when it does
  not, and `UNGRADED` when no oracle file exists for it.
