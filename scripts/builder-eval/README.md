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
- `--grade-only` (needs `--project`): send no request; grade the Project's current Preview with the
  case's checks, including the reload when the case asks. Use it to regrade a run the tool misread.
- `--project-name <name>`: name for a newly created Project; default `eval-<date>-<time>`.
- `--max-repairs <n>`: repair messages ("o build falhou, corrija") to send after a run whose failure
  category is `APPLICATION_BUILD_FAILED`, the only failure the source can fix; default 2. A platform
  failure (runner unavailable, Hub restart) is recorded and never repaired.
- `--base-url <url>`: Hub origin; default `https://hub.conexus.localhost:3443`.
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

- `projectId`, `conversationId`, `modelId`, `request`.
- `sourceRevisionBefore` / `sourceRevisionAfter`, `filesChanged` (from
  `GET .../source/compare`).
- `runs`: one entry per BuilderRun sent (the first request plus each repair), with
  `builderRunId`, `state`, `resultKind`, `failureCode`, `failureCategory`.
- `repairIterations`: how many repair messages were actually sent.
- `wallTimeToUsablePreviewMs`: from the request landing to the Preview's loading veil lifting.
- `previewUrl`, `screenshotPath` (relative to `--out`; a reload also writes
  `preview-after-reload.png`), `checks.initial`, `checks.afterReload`, `gradeOnly`.
- `failure`: why no checks ran, when they did not. `FINAL_RUN_NOT_BUILT` means the last run did not
  produce a built source; `PREVIEW_NOT_FROM_FINAL_RUN` means the Preview never named the final
  run's revision within the bound; `NO_PREVIEW` (grade-only) means the Project has no Preview. Checks never grade a Preview the request did not produce.
- `outcome`: `PASS`, `FAIL` (a check failed, `failure` is set, or no Preview became usable), or
  `ERROR` (the tool itself broke; see `error` and `failure.png`).
