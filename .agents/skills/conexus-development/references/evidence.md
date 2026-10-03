# Evidence

Where errors and improvements show up, cheapest first. Quote what you find: trace ids, log codes,
rows, file:line.

## Telemetry

The Hub and the runner export traces, logs and metrics over OpenTelemetry (spec 0007) when
`OTEL_EXPORTER_OTLP_ENDPOINT` is set. The development backend is
[`infra/telemetry/compose.dev.yaml`](../../../../infra/telemetry/compose.dev.yaml): Grafana on
`127.0.0.1:3000` with Tempo, Loki and Prometheus.

- Recent traces: `curl -s -u admin:admin 'http://127.0.0.1:3000/api/datasources/proxy/uid/tempo/api/search?limit=20'`.
- One trace: `.../uid/tempo/api/traces/<traceId>`. Every Hub log line carries its `trace_id`, so a
  log code leads to its trace.
- A trace shows each step's time and every outbound call (E2B, model, vendor). Use it before reading
  code to explain slowness or a failure.
- Traces exist only from when telemetry was turned on.

## Mastra's own record

- Agent steps, tool calls and model calls are spans in the Hub database (`mastra_ai_spans` in the
  Mastra storage schema). Read with SELECT only.
- Thread messages and a suspended run's snapshot are in Mastra storage too: the source of truth for
  what the agent saw.

## Logs

The Hub writes one structured line per event with a registered code
([`log-codes.generated.ts`](../../../../apps/hub/src/telemetry/log-codes.generated.ts)), for example
`BUILDER_RUN_TIMING` (time per stage of a run) and `BUILDER_RUN_FAILED`. An error a person sees
always has a code.

## Drive the real product

- The [`verify`](../../verify/SKILL.md) skill runs an isolated Hub with real PostgreSQL and Keycloak
  and drives the web UI. Its model and E2B are fake, so it cannot prove a Builder turn.
- A Builder turn is proved on the local Conexus with a real model and a real E2B sandbox, on a cheap
  model such as Haiku. Every E2B use needs the operator's ok.
- `npm run rb:builder:live` runs the live harness flows.

## Reference code and docs

- Mastra: the `mastra` skill, then the installed packages' embedded docs
  (`node_modules/@mastra/*/dist/docs`) and source. The installed version is the truth.
- How Mastra's products do it: the `mastracode/` folder of the Mastra repository (Factory and Mastra
  Code). Read it before designing a mechanism Mastra's products already have.
- Any other library: Context7, when the session has it; otherwise the installed package.
- Prior research: [`docs/research/`](../../../../docs/research/), Mitra included.

## Code health

- `git diff --numstat origin/main...HEAD`: lines added and deleted per file. Read product code apart
  from tests, SQL and generated files. A fix that mostly adds is a smell.
- `check-patch-churn` (fixes per file in 30 days), `check-weak-tests` (assertions that cannot
  fail), `knip` (unused code), all in `npm run verify:quick` or CI.
