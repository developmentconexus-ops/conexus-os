# How to measure a Builder change with an experiment

An experiment sends the same product request to the real Builder once per arm and trial, and stores
every result in Mastra. An arm is one Builder configuration, today a model. Each result links to the
Builder run's own trace and carries its scores. You read and compare the results in Mastra Studio.
[`scripts/builder-eval/README.md`](../../scripts/builder-eval/README.md) is the reference for the
scripts and their options.

## Before you start

- The Hub must accept a Connection to the simulated Sankhya (`sankhya-sim`). A Hub that does not
  accept one fails the experiment's preflight before it creates anything.
- Get the operator's approval for live Builder runs. Every run spends model quota and creates a
  Project and a private GitHub repository.
- Keep the disk above 20 GB free. Each run adds traces to the Hub database.

## Test the lab itself

CI does not run the lab's own tests. After you change `scripts/builder-eval/`, run
`npm run builder:eval`; `npm run builder:eval:postgres` runs the one test that needs the
`CONEXUS_TEST_DB_*` PostgreSQL. The lab tests live in `tests/manual/`, which no CI group runs, and both scripts take every
file there by name pattern.

## Start the three local services

Run each command in its own terminal, from a checkout of this repository.

1. Start the simulated Sankhya. It listens on `127.0.0.1` only and serves synthetic data.

   ```bash
   node scripts/builder-eval/sankhya-sim.mjs
   ```

2. Point the eval at the Hub database. The eval uses the Factory's role, `hub_factory`, and writes
   only to Mastra's own tables in schema `factory`. It never changes a table definition.

   ```bash
   env_file=${CONEXUS_PILOT_HUB_ENV:?set CONEXUS_PILOT_HUB_ENV}
   export CONEXUS_EVAL_DATABASE_URL=$(node --env-file="$env_file" -e '
   	const { readFileSync } = require("node:fs")
   	const password = encodeURIComponent(readFileSync(process.env.CONEXUS_DB_FACTORY_PASSWORD_FILE, "utf8").trim())
   	const { CONEXUS_DB_HOST: host, CONEXUS_DB_PORT: port, CONEXUS_DB_NAME: name } = process.env
   	process.stdout.write(`postgresql://hub_factory:${password}@${host}:${port}/${name}`)')
   ```

3. Start the eval server. It serves every Mastra route on `http://127.0.0.1:4111/api`, with the
   eval's scorers registered, and has no sign-in. Keep it on the operator's machine.

   ```bash
   node scripts/builder-eval/serve.mjs
   ```

4. Start Mastra Studio against the eval server. Version 1.30.0 of the `mastra` CLI matches the
   repository's `@mastra/core` 1.67.0.

   ```bash
   npx --yes mastra@1.30.0 studio
   ```

   Open `http://localhost:3000`.

## Run an experiment

1. Sign in the test operator, as for any `run.mjs` run.

   ```bash
   export CONEXUS_STATE=$(~/conexus-test-session.sh)
   ```

2. Run the comparison. Pick a new `--comparison` id for every new setup. The command runs two
   Builder runs at a time.

   ```bash
   node scripts/builder-eval/experiment.mjs --comparison flash-vs-luna-1 --arms flash,luna --trials 1 \
   	--hub-version "$(git -C ~/conexus-pilot rev-parse --short HEAD)"
   ```

3. Read the summary. The command prints one line per experiment and exits with 0 only when every
   experiment finalized.

To run one case through the product UI on a Hub other than the pilot, set `CONEXUS_STATE` to a
storage state for that Hub and pass `--base-url`; `run.mjs` refuses to start without the state, so it
never falls back to the pilot session. While a run waits for a person, the driver approves the plan
(the approval card, recognized by its options "Aprovar e construir" and "Pedir ajustes") and answers a question card with the first option, and it records the last `conexus_check`
report. Add `--mask-values` for a case that reads real business data. See `scripts/builder-eval/README.md`.

If a run fails for a platform reason (the model quota, the runner, a Hub restart), the result is
stored as an error and the experiment stays open. Run the same command again. It runs only the
missing and failed items, then finalizes. If you change an arm file, start a new comparison id. The
command refuses to mix two setups under one id.

## Read the results in Studio

1. Open **Experiments**. Each experiment is one arm and one trial. Studio shows it as
   `<comparison> · <arm> · t<trial>`, and its id is `be:<comparison>:<arm>:t<trial>`.
2. Click **Compare**, select two experiments, and click **Compare Experiments**. Studio shows each
   scorer's value for both experiments and the difference.
3. Open an experiment, then open a result. The result shows every score. Click **Trace** to open the
   Builder run's spans.

The **Inbox**, **Metrics** and **Logs** pages stay empty or show an error. The Hub's trace store keeps
no feedback, metrics or logs.

The Hub deletes traces after 30 days. The experiments and their scores stay, but a result's
**Trace** link then finds nothing, so read the traces of a comparison within that window.

The scorers are these:

| Scorer | What it measures | Better |
| --- | --- | --- |
| `app-correct` | 1 when the Preview shows every known amount and seller name and no total that a known mistake produces. In a refusal case, 1 when the Builder changes no source and its reply names the missing system and Integrações | higher |
| `tool-calls` | Tool calls by the Builder's main agent | lower |
| `calls-per-step` | Tool calls per model step that called a tool | higher |
| `repeated-reads` | Reads of a file that did not change since the last read, and identical `connector_fetch` reads | lower |
| `skill-reloads` | Skills loaded again in the same run | lower |
| `tool-errors` | Tool calls that failed | lower |
| `wall-minutes` | Minutes the Builder worked, repairs included | lower |
| `input-tokens`, `output-tokens` | Tokens of the main model | lower |
| `sim-refusals` | Valid queries the simulator does not model; a value above 0 is the eval's fault, not the arm's | lower |

The `app-correct` reason names what is missing and which mistake a wrong total matches, for example
the total of an app that also counts orders. In a refusal case it says whether the Builder changed
the source and what its reply left out.

## Read a trace from a bad score

Start from the worst score, not from the whole trace.

1. Open the result and follow its trace link.
2. Read the root `agent_run` span first, then the `tool_call` spans in order, then the
   `skill_action` spans named `skill:activate`, then the `error` fields. Skip `processor_run` spans.
   They repeat the message list on every step.
3. Count before you conclude. "The agent read the same file again" is the `repeated-reads` number,
   not an impression.
4. Treat one trace as one example. Call a cause real when it shows up in at least two of three trials.

To read the same data from a shell, query the eval server:

```bash
curl -s 'http://127.0.0.1:4111/api/experiments?comparisonId=flash-vs-luna-1' | jq '.experiments[] | {id, status}'
curl -s "http://127.0.0.1:4111/api/observability/traces/$TRACE_ID" | jq '.spans | length'
```

Traces from the pilot hold real business data. Quote span ids and counts in a report, never values.

## Add an arm

Add one file, `scripts/builder-eval/arms/<id>.json`, with the model id the Builder's model picker
uses:

```json
{ "model": "google-ai-pro/gemini-3.8-flash-high" }
```

Then pass the new id in `--arms` under a new comparison id.
