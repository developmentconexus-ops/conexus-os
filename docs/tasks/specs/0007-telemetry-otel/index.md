# 0007. Telemetry on OpenTelemetry: one trace from the Hub route to the handler, process metrics and a heap alarm

**Date**: 2026-10-01
**Status**: Proposed
**Amends**: none of the accepted specs. It changes the pilot launch scripts (`infra/pilot/hub.sh`,
`infra/pilot/runner.sh`, `scripts/build-hub-local.mjs`) and the connector record's output channel
under C-029 (the record stays; its stderr line goes). The records it adds or amends are listed
under *Follow-up* and need the operator's approval before this spec is Accepted.
**Depends on**: nothing for slices 1 to 3 and 5 to 8. It runs beside
[0005](../0005-app-access-perfis/index.md): when 0005's `Principal` replaces `caller`, the account
id attribute reads from the principal. Slice 4 lands with
[0008](../0008-configuration-model/index.md) slice 4, which owns `apply signoz`, the settings `telemetry.retention` and `alerts.telegram.chat`, and the drift gauge.

## Summary

The Hub and the app runner start the OpenTelemetry Node SDK before any app code, and both send
traces, logs and metrics over OTLP to one OpenTelemetry Collector per installation. The Collector
forwards to SigNoz on a pilot or server installation, and to a light single container backend on a
developer machine. One trace id follows a request from the Hub route through the invoker, the
runner, the sandboxed worker and the handler, down to each app database query and each connector
fetch. Mastra's `OtelBridge` puts Builder runs and connector calls into the same traces, and a small
forwarder sends the token, cost and duration metrics that Mastra already computes. Every log line
carries its trace id. The Hub and the runner export heap, RSS, event loop, GC, sessions, runs,
streams and pool usage, and an alarm fires when the heap passes 80% of its limit. An allowlist in
the process strips attributes before export, and exported log bodies and errors carry codes, never
free text: prompts, tool and handler payloads, SQL text, URL queries and error messages never leave
the process. Each Builder run's tokens and estimated cost are exported under its run id and Project.
A public entry point starts a new trace and ignores a caller's `traceparent`. Browser errors from
the Hub web and from generated apps reach the Hub through a same-origin reporter. A company that
opts in sends them to Sentry instead.

## Requirements

**User stories**:
- As the Conexus operator, I open one screen and see, for one failing app call, which app, which
  operation, which person (by id), how long each step took and which error ended it.
- As the Conexus operator, I am warned before the Hub runs out of memory, not after.
- As the Conexus operator, I see what each Builder run cost: model, tokens, estimated cost and
  duration.
- As a company administrator, I know that telemetry holds no prompts, no business data and no
  credentials, and that browser errors leave the company only if we turned Sentry on.
- As an agent working on Conexus (later), I query traces, logs and metrics by the attribute names
  this spec fixes.

**Out of scope** (named so nobody builds them here): splitting the Builder into its own process
(the process model study's first risk); fixing the heap leak itself (the OOM diagnosis); a
supervisor and `/healthz` (process model F10, F18); Mastra's `PostgresStoreVNext`; content capture
of connector bodies (C-029's capture, built on a real need); browser tracing with
`@opentelemetry/sdk-trace-web`; source-map resolution of generated app stacks; the agent's query
tool itself (a named seam, *Agent query seam*).

**Acceptance criteria** (each is checked on its own; the proof is named in brackets: a suite under
`tests/implementation/`, new when absent today, or a live check on the named installation):

SDK and pipeline
- **AC-1**: `apps/hub/src/telemetry/register.ts` is loaded with `node --import` by the Hub child
  process and by the runner, before `server.js` and `app-runner/main.js`. It starts one `NodeSDK`
  with the instrumentations in *Pinned packages*, the resource `service.name` (`conexus-hub` or
  `conexus-runner`), `service.version` (the git short head) and `deployment.environment.name`, and
  OTLP over HTTP to `OTEL_EXPORTER_OTLP_ENDPOINT`. With that variable unset, no SDK starts and the
  process runs as today. [`telemetry-register`]
- **AC-2**: `scripts/build-hub-local.mjs` passes to the child, in this order: the heap cap,
  `--heapsnapshot-near-heap-limit=1`, `--diagnostic-dir`, `--report-on-fatalerror`,
  `--report-directory` (both directories from `CONEXUS_DIAGNOSTIC_DIR`), and `--import` of the
  built `telemetry/register.js`. The runner script passes the same flags. A forced OOM on a
  throwaway child writes a heap snapshot and a diagnostic report into that directory.
  [`hub-launch-flags`, live check on the dev installation]
- **AC-3**: `infra/telemetry/collector.yaml` receives OTLP over HTTP on `127.0.0.1:4318` only,
  runs `memory_limiter` (256 MiB) and `batch`, adds `conexus.installation`, and exports to one
  backend named by the deployment: SigNoz's ingestion endpoint on the pilot, the dev backend on a
  developer machine. The Hub and the runner know only the Collector. [live check on dev and pilot]
- **AC-4**: When the Collector is down, the Hub and the runner keep serving. Exporters drop after
  their queue fills; no request waits on export. [`telemetry-register`: export to a closed port
  while 200 requests run, p99 within 10% of the run without the SDK]

One trace end to end
- **AC-5**: A `POST /__conexus/api/:op` on the application host yields one trace holding, as parent
  and child in this order: the Fastify server span, `conexus.app.invoke` (the invoker, with admission
  wait), the HTTP client span to the runner, the runner's server span (the `traceparent` header
  over the unix socket), `conexus.app.handler` (the sandbox run), one `db.query` span per handler
  query, and one `connector.fetch` span per connector fetch with its provider request spans.
  [`telemetry-app-trace`, live check on dev]
- **AC-6**: The worker job carries `traceparent` (the `conexus.app.handler` span). The worker sends
  it as a header on every connector port request, and the Hub's port server continues that trace.
  The worker reports at most 100 query timings in its result (`{ op, startMs, ms, rows, sqlstate }`,
  no SQL text), and the runner turns them into `db.query` spans inside the handler span's window.
  [`app-runner-http`, `telemetry-app-trace`]
- **AC-7**: The Preview host invoke and the Builder's `run-operation` produce the same span chain,
  with `conexus.source` set to `PREVIEW` or `BUILDER`. [`telemetry-app-trace`]
- **AC-8**: Every response of the Hub, the Preview host and the application host carries
  `x-conexus-trace-id` with the trace id of its server span. [`telemetry-app-trace`]
- **AC-28**: A request that reaches a TCP listener (the Hub API, the Preview host, the application
  host) with `traceparent`, `tracestate` or `baggage` headers gets a server span that is the root of
  a new trace, with no parent and no link to the inbound ids. A request over a unix socket (the Hub
  to the runner, the worker to the Hub's handler port) continues the inbound trace.
  [`telemetry-trace-trust`]

Attributes and redaction
- **AC-9**: App spans carry the attributes in *Attributes*: `conexus.project_id`,
  `conexus.app_slug`, `conexus.operation`, `conexus.source`, `conexus.artifact_revision_id`,
  `conexus.account_id`, `conexus.result` and, on failure, `error.type` and span status `ERROR`.
  [`telemetry-app-trace`]
- **AC-10**: Every span, span event and log record passes the redaction of *Redaction* before
  export. Only keys on the allowlist leave the process; every other key is dropped and counted in
  `conexus.telemetry.attributes_dropped` by key. A log record's body leaves as its leading code
  (`PROJECT_DELETION_INCOMPLETE` of `PROJECT_DELETION_INCOMPLETE:<id> ...`) when the Hub's own
  source defines that code, or as `UNCODED_LOG`, never as its text. Request paths and user agents
  are chosen by the caller, so `url.path` and `user_agent.original` never leave; the route is
  `http.route`, the template. An error leaves as its type and its stack frames, never as its message. A
  recorded Builder run, an app invoke with a connector fetch, a model request to a URL with `?key=`,
  a log line written through `logLine` or `logger`, and an error logged with `recordFailure` export
  none of the strings planted in their prompts, tool arguments, tool results, handler input,
  handler output, SQL, URL query, request path, user agent, log text, uppercase log text shaped
  like a code or error message. [`telemetry-redaction`]
- **AC-11**: The thrown message and the stdout and stderr of a handler are never exported. A
  failing handler exports `error.type` (the worker's result code, or `CRASHED`, `TIMEOUT`,
  `RESULT_TOO_LARGE`) and nothing of its text. [`telemetry-redaction`]

Logs
- **AC-12**: The Hub's three Fastify apps and the runner's Fastify app share one pino logger
  (`platform/logger.ts`) with request logging off. Every log record written inside a span carries
  `trace_id` and `span_id`, on stdout and in the OTLP log export. [`telemetry-logs`]
- **AC-13**: The log sinks that write to stderr or `console` today (`server.ts:254`,
  `builder/module.ts:266`, `connectors/module.ts:67`, `identity-access/oidc.ts:57,68`,
  `app-runner/main.ts:42`) write through that logger. A repository test fails when runtime code
  under `apps/hub/src` writes to `process.stderr`, `process.stdout` or `console`, except the two
  check scripts that run as child processes (`builder/application-check.ts`,
  `builder/application-server-build.ts`) and the runner's `ready` line, which stays byte-identical.
  [`hub-log-sinks`]
- **AC-14**: `setErrorHandler` (`http/app.ts:44`) logs every 5xx at `error` with the error's type,
  message and stack, records the exception on the active span and sets its status to `ERROR`. A 4xx
  is not logged. The answer body is unchanged. The stdout record holds the message; the export
  holds what *Redaction* lets through. [`hub-http-errors`]
- **AC-15**: The `catch` at `mar/application-host-routes.ts:164` logs the cause (type, message,
  `conexus.project_id`, `conexus.operation`) and records it on the span, then answers 503
  `APPLICATION_RUNNER_UNAVAILABLE` as today. The message stays on stdout, as in AC-14.
  [`application-host`]

Metrics and the heap alarm
- **AC-16**: The Hub and the runner export the metrics in *Metrics*: heap used and heap space
  sizes, `conexus.process.heap.used_ratio` (used heap divided by the old-space cap, see *Metrics*),
  RSS, event loop delay and utilization, GC duration, and on the
  Hub controller sessions, active runs, open session streams, pool connections by pool and state,
  app invocations in flight and queued. The runner adds sandboxes running. The Hub also exports
  `conexus.settings.drifted`, read through `settings.drift_count`, which 0008's slice 4 grants to
  `hub_iam_runtime` (0008 AC-30). The export interval is 15 seconds. [`telemetry-metrics`]
- **AC-17**: When `conexus.process.heap.used_ratio` (used heap divided by the old-space cap) is
  above 0.8 on two samples in a row, the
  process logs one `PROCESS_HEAP_HIGH` record at `warn` with the ratio, RSS, sessions, active runs
  and open streams. It logs again only after the ratio fell below 0.7. This works with no Collector.
  [`telemetry-metrics`]
- **AC-18**: The installation's SigNoz holds the alert rules in `infra/telemetry/alerts/`, applied
  by `conexus-settings apply signoz` ([0008](../0008-configuration-model/index.md) AC-29,
  idempotent; it writes `settings.enforcement`): heap ratio above 0.8 for 2 minutes, event loop delay p99 above 1 second
  for 2 minutes, a Hub or runner with no metrics for 2 minutes, the SigNoz data volume above 80%,
  and `conexus.settings.drifted` above 0 (0008 AC-30). Each rule notifies a Telegram bot chat
  (operator decision of 2026-10-01): the chat id is the setting `alerts.telegram.chat`, the bot token
  the secret file `telegram-bot-token` in the operator secrets directory, never printed. An email
  copy follows once the installation's sender exists. `apply signoz` is built and owned by 0008's
  slice 4; this spec references it and does not specify it again.
  [live check on the pilot: a child process held above 0.8 raises the alert]

Builder and connectors through Mastra
- **AC-19**: `createBuilderObservability` and `createConnectorObservability` set
  `bridge: new OtelBridge()`. Builder spans and connector spans join the active OpenTelemetry trace.
  A connector fetch made from a handler is a child of that handler's span, and one made by the
  Builder agent is a child of the run's tool span. [`telemetry-mastra-bridge`]
- **AC-20**: A Builder run is its own trace: a `conexus.builder.run` root span with
  `conexus.builder_run_id`, `conexus.project_id` and `conexus.conversation_id`, linked to the HTTP
  span that queued it. The run's id in the Hub's Postgres trace store equals its OpenTelemetry trace
  id, and `readTrace` (`builder/module.ts:406`) still returns the run's summary.
  [`telemetry-mastra-bridge`, `builder-trace-summary`]
- **AC-21**: `MastraMetricForwarder`, an exporter that implements only `onMetricEvent`, turns
  Mastra's automatic metrics into OpenTelemetry instruments: `mastra_*_duration_ms` as histograms,
  `mastra_model_*_tokens` as counters with `gen_ai.provider.name` and `gen_ai.request.model`, and
  `conexus.builder.cost` (USD, from Mastra's `costContext.estimatedCost`). A Builder run with a
  known model shows its tokens and estimated cost in the backend. These counters stay per provider
  and model: a run id as a metric label would grow one series per run.
  [`telemetry-mastra-bridge`]
- **AC-29**: For each token or cost metric event, the forwarder also writes one
  `BUILDER_MODEL_USAGE` log record under the event's trace id, with `conexus.builder_run_id`,
  `conexus.project_id`, `gen_ai.provider.name`, `gen_ai.request.model`, `conexus.builder.metric`,
  `conexus.builder.metric_value` and, when Mastra estimated one, `conexus.builder.cost_usd`. Two
  Builder runs of one Project on the same model, run at the same time, export records whose sums by
  `conexus.builder_run_id` equal each run's own tokens and cost. [`telemetry-mastra-bridge`]
- **AC-22**: The Builder keeps `MastraStorageExporter` and its 30 day retention unchanged. The
  connector instance keeps its `MastraStorageExporter` (the C-029 record) and loses
  `SpanLineExporter`; connector JSON lines no longer reach stderr. [`connector-record`]

Browser errors
- **AC-23**: The Hub web registers `window.onerror`, `unhandledrejection` and the router's error
  component, and posts each error to `POST /api/telemetry/browser-errors`. The app host and the
  Preview host serve `/__conexus/report.js` and add one `<script src="/__conexus/report.js">` to
  every `index.html` they serve; the script posts to `POST /__conexus/telemetry/browser-errors` on
  the same origin. No CSP changes. [`browser-error-reporter`, live check in the driven browser]
- **AC-24**: A report holds only the fields of *Browser report*. The Hub admits a body up to 8 KiB,
  accepts 20 reports a minute per session and drops the rest, answers 204, adds
  `conexus.account_id`, `conexus.project_id` and `conexus.app_slug` from the session, never from
  the body, and records the report as an OTLP log record with `error.type` and a span event.
  [`browser-error-reporter`]
- **AC-25**: With `CONEXUS_SENTRY_DSN_FILE` set (0008 AC-31), the Hub sends each admitted report to
  that Sentry project as an envelope with the same fields, with `user.id` set to
  `conexus.account_hash`, and not to the Collector. Unset, nothing goes to Sentry. [`browser-error-sentry`, live check against a
  test Sentry project]

Deployment and retention
- **AC-26**: `infra/telemetry/` holds the Collector config, the dev backend compose, the SigNoz
  Foundry `casting.yaml` with its generated compose, and a README with the start, stop and upgrade
  commands. The pilot runs SigNoz with traces and logs kept 15 days and metrics 30 days, from the
  setting `telemetry.retention` applied and observed by `apply signoz` (0008 AC-29), not set by hand
  in the SigNoz UI, on a data volume capped at 20 GB. Whether SigNoz v0.144.0 sets retention through
  its API is UNVERIFIED; if it does not, `apply signoz` observes it and the README names the manual
  step. [live check on the pilot]
- **AC-27**: End to end on the pilot: a page of a generated app calls an operation that reads the
  app database and fetches from a connector, the handler throws, and the operator finds the trace
  in SigNoz by `conexus.app_slug`, sees every span of AC-5, the `error.type`, and the log record of
  the failure under the same trace id. [live check, in the release evidence]

## Decision

**Chosen option**: Option 2 of [rationale.md](rationale.md): OpenTelemetry in every Node process,
Mastra's bridge for Mastra spans, a Collector per installation, SigNoz as its backend, redaction by
allowlist in the process, and a same-origin reporter for browser errors with Sentry as a per-company
option.

**Implementation skills**: `conexus-development` (`.agents/skills/conexus-development/`) · `mastra`
(`.agents/skills/mastra/`, for the bridge, the exporter contract and the metric events)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Design

### Where each signal comes from

| Signal | Producer | Process |
|---|---|---|
| HTTP server spans | `@fastify/otel` and `instrumentation-http` | Hub (three Fastify apps), runner |
| HTTP client spans (Hub to runner, model providers, E2B, Keycloak) | `instrumentation-http`, `instrumentation-undici` | Hub |
| Hub Postgres spans | `instrumentation-pg` | Hub, runner (provisioner and relay pools) |
| `conexus.app.invoke`, `conexus.app.handler`, `db.query` | our code (`mar/application-invoker.ts`, `app-runner/supervisor.ts`) | Hub, runner |
| Builder agent, model, tool, processor spans | Mastra through `OtelBridge` | Hub |
| `connector.*` spans | Mastra through `OtelBridge` (`connectors/broker.ts:300,317,334`) | Hub |
| Logs | pino through `instrumentation-pino` | Hub, runner |
| Runtime metrics | `instrumentation-runtime-node` | Hub, runner |
| Heap ratio, RSS, business gauges | our observable gauges (`telemetry/metrics.ts`) | Hub, runner |
| Builder tokens, cost, durations | Mastra metric events through `MastraMetricForwarder` | Hub |
| Browser errors | the reporter and the Hub route | browser, Hub |

The worker inside the sandbox runs no SDK: it has no network and an empty environment
(`sandbox.ts:142`). It carries the trace id outward on connector requests and reports its query
timings in its result; the runner and the Hub make the spans.

### Pinned packages (AC-1)

Verified on 2026-10-01 against the installed `@mastra/core` 1.71.0 and `@mastra/observability`
1.18.1, with an install probe outside the repository (*Evidence* in the rationale):

| Package and exact version | Consumer | Why this version |
|---|---|---|
| `@mastra/otel-bridge` 1.5.11 | `createBuilderObservability`, `createConnectorObservability` | Depends on `@mastra/observability` 1.18.1 exactly, so the tree keeps one copy. 1.5.12 and 1.5.13 pin 1.18.2 and 1.18.3. Brings `@mastra/otel-exporter` 1.4.2 |
| `@opentelemetry/api` 1.9.1 | all instrumentation | The single API copy every package dedupes to |
| `@opentelemetry/sdk-node` 0.221.0 | `telemetry/register.ts` | The bridge needs `@opentelemetry/api-logs` `^0.221.0`. SDK 0.222.0 would install a second `api-logs`, and the bridge's log forwarding would find no global `LoggerProvider`. Brings the OTLP proto exporters for traces, metrics and logs at 0.221.0 |
| `@opentelemetry/instrumentation-http` 0.221.0 | Hub, runner | 0.221 line |
| `@opentelemetry/instrumentation-undici` 0.31.0 | Hub (model providers, E2B) | Last release on `instrumentation` 0.221 |
| `@opentelemetry/instrumentation-pg` 0.73.0 | Hub, runner | Last release on 0.221; `pg` 8.23.0 |
| `@opentelemetry/instrumentation-runtime-node` 0.34.0 | Hub, runner | Last release on 0.221 |
| `@opentelemetry/instrumentation-pino` 0.67.0 | Hub, runner | Last release on 0.221; `pino` 10.3.1 comes with Fastify |
| `@fastify/otel` 0.21.0 | Hub, runner | On `instrumentation` 0.221; Fastify 5.12.1 |

Not used: `@opentelemetry/auto-instrumentations-node` (42 instrumentations for 6 needed),
`@mastra/sentry`, `@mastra/otel-exporter` as an exporter (the bridge already emits real spans), and
`MastraPlatformExporter` (data would leave the installation). Upgrades move the Mastra packages and
the bridge together, and the OpenTelemetry 0.x line to the one the bridge's `api-logs` range names.

### Startup (AC-1, AC-2)

```ts
// apps/hub/src/telemetry/register.ts, loaded with --import before the app
register('@opentelemetry/instrumentation/hook.mjs', import.meta.url)  // ESM loader hook
if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) startTelemetry({ service: serviceFromArgv() })
startHeapWatch()  // AC-17: runs with or without the SDK
```

`startTelemetry` builds the `NodeSDK` with `spanProcessors: [new BatchSpanProcessor(redacting(new
OTLPTraceExporter()))]`, `logRecordProcessors: [new BatchLogRecordProcessor(redacting(new
OTLPLogExporter()))]`, a `PeriodicExportingMetricReader` at 15 seconds, the sampler
`parentbased_always_on`, and the instrumentations above. `instrumentation-http` ignores incoming
requests for static assets and `/v1/health`. `SIGTERM` flushes with a 2 second deadline. The
resource's `service.version` comes from `CONEXUS_SERVICE_VERSION`, and every other resource
attribute from `OTEL_RESOURCE_ATTRIBUTES`, so a launch script never edits a variable the env file
also sets (`node --env-file` keeps an inherited variable over the file's value).

Trust of inbound trace context (AC-28) is one `startIncomingSpanHook` on `instrumentation-http`. The
instrumentation calls it before it extracts the inbound context. For a request whose socket has a
remote address, that is a TCP listener, the hook deletes `traceparent`, `tracestate` and `baggage`
from the request headers, so extraction finds nothing and the server span starts a new trace. A
unix socket has no remote address (probe P7), so the runner and the handler port keep the header.
`@fastify/otel` extracts only when no span is active, and the HTTP server span always is, so it
adds no second path. The inbound id is not kept as a link: an outside caller could still tie
unrelated requests together through it.

Launch: `scripts/build-hub-local.mjs:36` spawns the child with
`['--max-old-space-size=512', '--heapsnapshot-near-heap-limit=1', '--diagnostic-dir=<d>',
'--report-on-fatalerror', '--report-directory=<d>', '--import', '<build>/telemetry/register.js',
'<build>/server.js']`. The heap snapshot flag sits on the child, where the OOM happens (process model
F8). `infra/pilot/runner.sh` gains the same flags on its `node` line. `infra/pilot/hub.sh` keeps
its `tee`.

### Trace propagation (AC-5 to AC-8)

```
browser ── POST /__conexus/api/listDeals ──▶ Hub application host (Fastify server span)
  └ conexus.app.invoke             mar/application-invoker.ts: admission wait, port open, runner call
     └ POST /v1/invoke (client)    app-runner/module.ts:30, traceparent header on the unix socket
        └ POST /v1/invoke (server) runner Fastify, traceparent extracted
           └ conexus.app.handler   supervisor.ts:273, sandbox run; job.traceparent = this span
              ├ db.query × n       from the worker's reported timings (no SQL text)
              └ POST /v1/fetch     Hub handler port server span, traceparent from the worker
                 └ connector.fetch (Mastra, bridged) └ provider request spans
```

- Hub to runner: the Node HTTP client instrumentation injects `traceparent` on the unix socket
  request and the runner's Fastify extracts it. Probe P5 shows both. No code of ours.
- Runner to worker: `WorkerJob` (`worker.ts:17`) gains `traceparent: string` on `invoke` and
  `migrate`. The worker's `post` (`worker.ts:38`) adds it as a header.
- Worker to Hub: the handler port (`connectors/handler-port.ts`) is a Node HTTP server, so the
  instrumentation extracts the header and the broker's Mastra spans become children through the
  bridge. A handler can forge that header; it can only misplace its own spans within telemetry.
- Query timings: the worker wraps the `db.query` it hands to the handler and records
  `{ op: first SQL keyword, startMs, ms, rows, sqlstate }` for at most 100 queries. `WorkerResult`
  gains `timings`. The runner clamps each timing to the sandbox window and creates the spans. A
  handler that opens its own `pg` client is not timed; its time stays in the handler span.
- Builder runs: `builder/service.ts` starts each run under `ROOT_CONTEXT` with a
  `conexus.builder.run` span and a link to the request span. A run lasts minutes and survives the
  request, so it does not hang under a short HTTP span.
- `x-conexus-trace-id`: one `onSend` hook in `http/app.ts`, shared by the three apps.
- Public entry points: the Hub API, the Preview host and the application host listen on TCP, behind
  the reverse proxy, and start a new trace for every request (AC-28). Only the two unix socket hops
  above carry a trace in. A browser that wants to name its trace reads `x-conexus-trace-id` from
  the answer instead.

### Attributes (AC-9)

| Attribute | Value | Set on |
|---|---|---|
| `conexus.project_id` | Project uuid | app spans, Builder run, connector spans (from `projectId` metadata) |
| `conexus.app_slug` | the application's slug | app host spans |
| `conexus.operation` | manifest operation key | `conexus.app.invoke`, `conexus.app.handler` |
| `conexus.source` | `APPLICATION`, `PREVIEW`, `BUILDER` | `conexus.app.invoke` |
| `conexus.artifact_revision_id` | revision uuid | `conexus.app.invoke` |
| `conexus.account_id` | account uuid | server spans past authentication, browser reports |
| `conexus.builder_run_id`, `conexus.conversation_id` | uuids | `conexus.builder.run` |
| `conexus.result` | `OK` or the platform code | app spans, connector spans |
| `error.type` | the platform code, the exception class, or `CRASHED`, `TIMEOUT`, `RESULT_TOO_LARGE` | any failed span |
| `conexus.admission.wait_ms` | number | `conexus.app.invoke` |
| `conexus.sandbox.outcome` | `RESULT`, `TIMEOUT`, `RESULT_TOO_LARGE`, `CRASHED` | `conexus.app.handler` |

Privacy choice, account id: inside the installation the raw account uuid is exported. It is
pseudonymous, the installation's own database already maps it to a person, and the operator needs
to answer "what did this person hit". Email and display name are never exported. Toward Sentry,
which is a third party, the Hub sends `conexus.account_hash`: HMAC-SHA256 of the account id with the
installation's salt, read from the file `CONEXUS_TELEMETRY_SALT_FILE` names, first 16 hex
characters.

### Redaction (AC-10, AC-11)

`redactAttributes` in `telemetry/redact.ts` is pure: it takes an attribute map and returns the
allowed subset. `redacting(exporter)` applies it to span attributes, span event attributes and log
record attributes before the wrapped exporter runs, and replaces each log record's body by its
code. What an exported record may carry, exactly:

| Record | Exported | Never exported |
|---|---|---|
| Span | name (set by an instrumentation or our code after a route template, operation, tool or model, never after a value), kind, ids, parent, links, times, status code, allowlisted attributes, events with allowlisted attributes | status message, every other attribute |
| Log record | time, severity, trace and span ids, allowlisted attributes, and a body that is the leading code of the message or `UNCODED_LOG` | the message text past its code, every other attribute |
| Error (on a span event or a log record) | `exception.type`, `error.type`, `exception.stacktrace` from its first frame line on | `exception.message`, and the message lines a stack begins with |
| Resource | `service.name`, `service.version`, `deployment.environment.name`, `conexus.installation`, the SDK's host and process attributes | nothing of the environment beyond `OTEL_RESOURCE_ATTRIBUTES` and `CONEXUS_SERVICE_VERSION` |

A code is a run of capital letters, digits and underscores with at least one underscore, at the
start of the message and followed by its end, a colon or a space, and it is exported only when it
is in the registry: `HTTP_SERVER_ERROR`, `BUILDER_RETENTION_PRUNED` of
`BUILDER_RETENTION_PRUNED:builder.runs:12`. The shape alone proves nothing, since a caller's text
can be `CUSTOMER_NAME_123`. The registry is `telemetry/log-codes.generated.ts`, generated by
`scripts/generate-log-codes.mjs` from the code literals in the Hub source, so a log call that
names a new code registers it on the next generation and a test fails while the file is stale. The platform already
writes its log lines this way (`builder/run-runtime.ts`, `platform/postgres.ts`,
`platform/connection-census.ts`). A line with no code, such as the runner's JSON lines until slice 2
writes them as fields, leaves as `UNCODED_LOG` with its allowlisted fields. The full text stays on
stdout and in `hub.log` on the installation's own disk, found by the record's trace id.

The allowlist is exact keys and prefixes:

- Resource and HTTP: `http.request.method`, `http.response.status_code`, `http.route`,
  `url.scheme`, `server.address`, `server.port`, `network.*`.
- Database: `db.system.name`, `db.operation.name`, `db.collection.name`, `db.namespace`,
  `db.response.status_code`.
- GenAI and Mastra: `gen_ai.operation.name`, `gen_ai.provider.name`, `gen_ai.request.model`,
  `gen_ai.response.model`, `gen_ai.response.finish_reasons`, `gen_ai.usage.*`,
  `gen_ai.agent.name`, `gen_ai.tool.name`, `gen_ai.tool.type`, `mastra.span.type`,
  `mastra.metadata.conexusBuilderProjectId`, `mastra.metadata.conexusBuilderRunId`,
  `mastra.metadata.result`, `mastra.metadata.consumer`, `mastra.metadata.connector`,
  `mastra.metadata.step`, `mastra.metadata.attempt`, `mastra.metadata.shared`, `mastra.tags`.
- Ours: `conexus.*`, `error.type`.
- Exceptions: `exception.type`, and `exception.stacktrace` cut to its frames.
- Logs: `trace_id`, `span_id`, `level`, `event`, `code`. The body is not an attribute; it leaves as
  its code.

What this removes, by name: `gen_ai.input.messages`, `gen_ai.output.messages`,
`gen_ai.system_instructions`, `gen_ai.tool.call.arguments`, `gen_ai.tool.call.result`,
`gen_ai.tool.definitions` and every `mastra.<span type>.input` and `.output` (probe P2: the bridge
exports all of these, prompts and tool results included); `db.query.text`; `url.full` and
`url.query` (a Google model URL carries `?key=`); `url.path` and `user_agent.original` (the caller
picks both, and application-host routes take any path); `exception.message`; any `mastra.metadata.*`
not listed. Handler stdout, stderr, thrown messages, input and output never become attributes: the
runner already logs only codes (`app-runner/http.ts:48-57`), and AC-11 keeps that rule for spans.

The Builder's prompts and tool payloads stay where they are today: Mastra's Postgres store, 30
days, read by the Builder's trace summary. Telemetry gets the structure, timing and usage of a run,
never its content. That keeps the backend safe to open to Conexus support and to an agent.

### Logs (AC-12 to AC-15)

`platform/logger.ts` creates one pino logger (JSON to stdout, level from `LOG_LEVEL`, default
`info`). The Hub passes it as `loggerInstance` to the three Fastify apps with
`disableRequestLogging: true`; request records would only repeat the server spans.
`instrumentation-pino` adds `trace_id` and `span_id` to each record and sends it to the
`LoggerProvider`. The existing string sinks keep their call sites and text: their lines become the
record's message (`logger.info(line)`), so a `grep BUILDER_RETENTION_PRUNED hub.log` still works;
the export carries the line's code (*Redaction*).
`identity-access/oidc.ts` logs its event object as fields. The runner's `ready` line stays a raw
stderr write; a test may wait on it.

Mastra keeps `logging: { enabled: false }` (`builder/module.ts:172`): the classic Postgres store
has no log table, and Mastra's internal logs are out of scope here.

### Metrics (AC-16, AC-17)

| Instrument | Kind | Source |
|---|---|---|
| `v8js.memory.heap.used`, `v8js.memory.heap.space.size`, `v8js.memory.heap.space.available_size`, `v8js.memory.heap.space.physical_size` (per space), `v8js.gc.duration`, `nodejs.eventloop.delay.*`, `nodejs.eventloop.utilization`, `nodejs.eventloop.time`, `v8js.resource.active` | from `instrumentation-runtime-node` | Hub, runner |
| `conexus.process.heap.used_ratio` | observable gauge | `v8.getHeapStatistics().used_heap_size` divided by the old-space cap |
| `process.memory.usage` (RSS, bytes) | observable gauge | `process.memoryUsage().rss` |
| `conexus.builder.sessions` | up-down counter | `controller.onSessionCreated` and `onSessionDeleted` (Mastra) |
| `conexus.builder.runs.active` | observable gauge | `builderActive.size` (`builder/service.ts:87`) |
| `conexus.builder.streams.open` | up-down counter | the projected stream (`builder/mastra-session-routes.ts:82-92`): +1 on start, -1 on cancel or close |
| `conexus.db.pool.connections` (`conexus.pool`, `state`: `total`, `idle`, `waiting`) | observable gauge | every pool made by `platform/postgres.ts:33`, registered by name |
| `conexus.app.invocations.in_flight`, `conexus.app.invocations.queued` | observable gauges | the two gates of `mar/application-invoker.ts:122,128` |
| `conexus.runner.sandboxes.running` | observable gauge | the `running` count checked at `app-runner/supervisor.ts:266` |
| `conexus.telemetry.attributes_dropped` (`key`) | counter | `redactAttributes` |
| `conexus.settings.drifted` | observable gauge | Hub only; `settings.drift_count(p_now)` (0008 AC-30) |

The heap ratio divides used heap by the old-space cap, read once at start, and falls back to
`heap_size_limit` only when no flag is set. V8 dies when used heap reaches the cap, not
`heap_size_limit` (the cap plus the young generation): under a 512 MiB cap `heap_size_limit` is 704
MiB on Node 24.20 and the process died at about 0.73 of it, so a ratio over `heap_size_limit` never
reaches 0.8. The gauge's description names its denominator.

The effective cap is the last `--max-old-space-size` in `process.execArgv` when the command line
sets one, and otherwise the last one in `NODE_OPTIONS`. The command line wins whatever the order of
values (probe P6): `NODE_OPTIONS=--max-old-space-size=1024 node --max-old-space-size=512` and
`NODE_OPTIONS=--max-old-space-size=256 node --max-old-space-size=512` both give a `heap_size_limit`
of 704 MiB, the 512 MiB cap. `process.execArgv` never holds the `NODE_OPTIONS` flags.

`instrumentation-runtime-node` 0.34.0 emits only the instruments in the table. It declares
`v8js.memory.heap.limit` as deprecated and does not emit it, so no heap limit instrument is exported;
the ratio is the one signal that names the cap. The watch in AC-17 samples every 15 seconds.

### Builder metrics through Mastra (AC-21)

```ts
// apps/hub/src/telemetry/mastra-metrics.ts
export class MastraMetricForwarder extends BaseExporter {
  override name = 'conexus-metric-forwarder'
  protected override async _exportTracingEvent(): Promise<void> {}
  async onMetricEvent(event: MetricEvent): Promise<void>  // histogram or counter by name; cost counter
}
```

Mastra computes the durations, tokens and cost (`estimateCostForMeter` in `@mastra/observability`
1.18.1) and hands them to any exporter that implements `onMetricEvent` (probe P3: the metric event
carries `traceId`, `labels` and `costContext { provider, model, estimatedCost, costUnit }`). Neither
the bridge nor `@mastra/otel-exporter` exports metric events, so this forwarder is the only code of
ours on that path. It is added to the Builder config's `exporters` beside `MastraStorageExporter`.
The estimate uses list prices. A run billed through a subscription costs what the subscription
costs, and the dashboard labels the number "estimated, at list price".

Per run (AC-29): the counters answer "what does this model cost us"; the `BUILDER_MODEL_USAGE`
records answer "what did this run cost". The forwarder writes one record per token or cost event
through the OpenTelemetry logs API, with the event's `traceId` and `spanId` as its context, so the
record sits in the run's trace. The run id and Project come from the event's `metadata`: Mastra
copies the span's metadata onto each metric event, and the Builder puts `conexusBuilderRunId` and
`conexusBuilderProjectId` into every span's metadata through
`BUILDER_TRACE_REQUEST_CONTEXT_KEYS` (`builder/runtime.ts:39`). An event without a run id is
counted and writes no record. In SigNoz, the run's cost is the sum of `conexus.builder.cost_usd`
over `BUILDER_MODEL_USAGE` records grouped by `conexus.builder_run_id`, and a Project's cost the same
grouped by `conexus.project_id`.

### Browser report (AC-23 to AC-25)

```ts
type BrowserErrorReport = Readonly<{
  kind: 'error' | 'unhandledrejection' | 'route'
  name: string            // error class, at most 100 characters
  message: string         // at most 300 characters; emails and runs of 6 or more digits replaced by [redacted]
  frames: readonly { file: string; line: number; column: number }[]  // at most 30; file is a path, no query
  path: string            // location.pathname only
  traceId?: string        // from the x-conexus-trace-id of a failed API answer, when the error carries it
  release: string         // Hub version or artifact revision id
}>
```

Never in a report: query strings, form values, response bodies, local storage, cookies. The
`message` follows the rule for errors in *Redaction*: the Hub writes it to its stdout log under the
report's trace id and exports the report without it, to the Collector and to Sentry alike. The Hub
web adds the reporter in `apps/web/src/main.tsx` and the router's `defaultErrorComponent`
(`apps/web/src/app/router.tsx:48`). Generated apps change nothing: the host adds the script tag
when it serves `index.html`, so the Builder cannot remove it, and `script-src 'self'` and
`connect-src 'self'` (`platform/application-csp.ts:4`) already admit it. Generated stacks point at
the minified bundle; mapping them through source maps is later work.

Sentry is the company's opt-in, its DSN a secret file named by `CONEXUS_SENTRY_DSN_FILE`. The
browser code is the same either way; the Hub decides where an admitted report goes. It sends the envelope from the server
(`POST https://<host>/api/<project>/envelope/`), so the CSP stays `'self'`, no third party script
runs in a generated app, and the redaction above runs before data leaves. Browser errors go to one
destination only: Sentry when the company opted in, the Collector otherwise.

### Deployment (AC-3, AC-18, AC-26)

| Piece | Dev machine | Pilot and server |
|---|---|---|
| Collector | `otel/opentelemetry-collector-contrib:0.162.0`, `127.0.0.1:4318` | same image and config |
| Backend | `grafana/otel-lgtm:0.34.0` in one container (Grafana on `127.0.0.1:3000`); 1 to 2 GB | SigNoz v0.144.0 installed by Foundry (`foundryctl forge` and `cast` from a committed `casting.yaml`): ClickHouse, ZooKeeper, SigNoz, SigNoz's ingestion collector; 4 GB minimum, 8 GB planned |
| Ports | loopback only | loopback only; SigNoz UI through the same reverse proxy and sign-in the operator uses for the Hub |
| Alerts | none | `infra/telemetry/alerts/*.json` applied by `apply signoz` (0008 slice 4) through SigNoz's API |

SigNoz stopped publishing compose files in `deploy/` (its v0.144.0 README); Foundry generates
them from `casting.yaml`. The repository keeps both the casting and the generated compose, so a
diff shows what an upgrade changes.

Retention and disk budget, pilot: traces and logs 15 days, metrics 30 days, the setting
`telemetry.retention` (`{ tracesAndLogsDays: 15, metricsDays: 30 }`) that `apply signoz` applies.
The data volume is capped at 20 GB and alarmed at 80%. The estimate to check in
slice 4: about 300,000 spans a day (Hub HTTP including Builder polling, about 5,000 invokes at 12
spans each, 20 Builder runs at about 500 spans each) at about 0.5 KB a span after compression is
about 150 MB a day, or 2.3 GB for 15 days of traces, with logs below that. The measured number
replaces this estimate in the README. Mastra's Postgres spans keep 30 days, unchanged.

### Agent query seam (not built)

An agent reads telemetry through SigNoz's query API with a read-only API key, or through
`SigNoz/signoz-mcp-server` (v0.15.0 on 2026-10-01) configured with that key in `conexus-hq`. The
contract is the attribute and metric names of this spec; renaming one is a change to this spec.
Building the tool and its prompt is later work.

### What happens to the current Mastra storage

| Today | After |
|---|---|
| Builder: `MastraStorageExporter` to Postgres schema `factory`, 30 days (`builder/module.ts:168`) | Kept. Content-bearing, read by `readTrace`. The bridge adds a content-free copy in OpenTelemetry |
| Connectors: `MastraStorageExporter` + `SpanLineExporter` to stderr (`connectors/record.ts:13-42`) | Storage kept (C-029's always-on record). `SpanLineExporter` deleted; the bridge carries the span |
| `PostgresStore` classic | Kept. `PostgresStoreVNext` is not adopted: SigNoz already holds logs and metrics, and VNext would add a second copy and a migration. Reopen when Mastra Studio metrics or `mastra api` over Builder data become a need |

### Value sourcing

| Value | Source |
|---|---|
| `service.version` | `git rev-parse --short HEAD`, exported by the launch script as `CONEXUS_SERVICE_VERSION` |
| `deployment.environment.name` | `OTEL_RESOURCE_ATTRIBUTES` in the installation's env file |
| `conexus.installation` | the Collector's `resource` processor |
| `conexus.app_slug`, `conexus.project_id` | the app host's resolved target (`application-host-routes.ts:140`) |
| `conexus.account_id` | the session authority (`authority.caller.accountId`) |
| handler span parent | `traceparent` of the runner's active span, written into `WorkerJob` |
| query timings | the worker's `db.query` wrapper, clamped by the runner |
| tokens, cost, durations | Mastra metric events |
| run id and Project of a usage record | the metric event's `metadata` (`conexusBuilderRunId`, `conexusBuilderProjectId`) |
| heap ratio | `v8.getHeapStatistics()` |
| account hash | HMAC-SHA256 with the salt of `CONEXUS_TELEMETRY_SALT_FILE` |
| retention | `telemetry.retention`, applied by `apply signoz` |
| alert chat; bot token | `alerts.telegram.chat`; `telegram-bot-token` in the operator secrets directory |

### Key invariants

- One trace id per request from the Hub route to the handler; one per Builder run.
- No exporter runs without `redacting`: `startTelemetry` is the only place exporters are built, and
  a test asserts every processor wraps one.
- Telemetry never blocks or fails a request. A dead Collector costs telemetry, never availability.
- The heap warning needs no backend.
- One log path: pino, with a repository test against new raw sinks.

### Security model

- What leaves the process is the allowlist, not "everything minus a list": a new library attribute
  is dropped until a person adds it.
- The Collector listens on loopback only. SigNoz's UI is behind the operator's sign-in.
- The worker gains no network and no secret; `traceparent` and timings are not secrets.
- Sentry receives only what the Collector would, under a hashed account id, and only when the
  company set the DSN.
- Free text never leaves: a log body leaves as its code, an error as its type and frames. A value a
  provider echoed into an error message stays in `hub.log` on the installation.
- Trace context is trusted only on unix sockets, which only the Hub, the runner and the worker
  reach. Every TCP request starts a new trace.
- Stated limits: a handler can forge its timings and the trace header of its port requests; both
  affect only telemetry of its own Project. Span names come from instrumentations and our code; a
  library that names a span after a value would export it, and slice 3's planted-string run is the
  check for Mastra's names.

### Configuration required

| Variable | Where | Meaning |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Hub and runner env | `http://127.0.0.1:4318`; unset turns the SDK off |
| `OTEL_RESOURCE_ATTRIBUTES` | the installation's env file | `deployment.environment.name=dev` or `pilot` |
| `CONEXUS_SERVICE_VERSION` | launch scripts | the git short head, the resource's `service.version` |
| `CONEXUS_DIAGNOSTIC_DIR` | launch scripts | heap snapshots and fatal reports |
| `LOG_LEVEL` | Hub and runner env | default `info` |
| `CONEXUS_TELEMETRY_SALT_FILE` | Hub env | path of a mode 600 file holding 32 random bytes, per installation |
| `CONEXUS_SENTRY_DSN_FILE` | Hub env | optional path of a mode 600 file holding the DSN; set only when the company opts in |

The OpenTelemetry variables stay boot env. Retention and the alert chat are settings of
[0008](../0008-configuration-model/index.md), `telemetry.retention` and `alerts.telegram.chat`;
the bot token is the `telegram-bot-token` file of the operator secrets directory.

### Critical test scenarios

Beyond the AC proofs: a handler that throws a message holding a planted customer name (AC-11); a
connector fetch whose provider answers 500 with a planted body (AC-10); a model request to a URL
with `?key=planted` (AC-10); a Builder tool result holding a planted string (AC-10); the Collector
port closed during a burst (AC-4); a worker that reports 500 timings and timings outside its window
(AC-6); a session stream cancelled by the browser and one closed by session delete (AC-16); the
heap ratio crossing 0.8, staying, dropping to 0.75 and crossing again (one record, AC-17); a
browser report of 9 KiB and the 21st report in a minute (AC-24); a report body that claims another
account id (AC-24); a request whose path, query and user agent hold planted strings (AC-10); an uppercase
underscore line such as `PLANTED_CUSTOMER_NAME_123` through `logLine` (AC-10); a log line
`CODE:PLANTED` and an error whose message is planted, through
`logLine`, `logger` and `recordFailure` (AC-10); a request with a forged `traceparent` on each TCP
listener and one over the runner's unix socket (AC-28); two concurrent Builder runs on one model
(AC-29); `NODE_OPTIONS` and the command line both setting `--max-old-space-size` (AC-17).

## Build plan

Each slice is one pull request, merged and checked on the dev installation before the next.

1. **The OOM would have been seen.** Pinned packages, `telemetry/register.ts`, `redact.ts`, the
   launch flags, `platform/logger.ts` and the sink migration, the error handler and the host
   `catch`, runtime metrics, heap ratio, RSS and the heap watch, `infra/telemetry/collector.yaml`
   and the dev backend compose. This is the study's first slice, items 1, 5 and 6. Satisfies
   **AC-1** to **AC-4**, **AC-10**, **AC-12** to **AC-15**, **AC-17**, **AC-28** (the HTTP
   instrumentation ships here), and the process part of **AC-16**.
2. **One trace to the handler.** `conexus.app.invoke`, `conexus.app.handler`, `traceparent` in the
   job and on the port, worker timings, `x-conexus-trace-id`, the attributes. The study's items 2
   and 3. Satisfies **AC-5** to **AC-9**, **AC-11**.
3. **Mastra in the same trace.** `OtelBridge` on both instances, the Builder run root, the
   `MastraMetricForwarder`, `SpanLineExporter` removal, the redaction cases for Builder content.
   The study's item 4. Satisfies **AC-19** to **AC-22** and **AC-29**.
4. **SigNoz on the pilot**, with 0008's slice 4, which builds `apply signoz`, the two settings and
   the drift gauge. Foundry casting and generated compose, data volume cap, the alert rules, the
   measured disk number in the README. Needs the operator's Telegram bot and the pilot's memory.
   Satisfies **AC-18**, **AC-26**, and the drift gauge of **AC-16**.
5. **Business gauges.** Sessions, runs, streams, pools, gates, sandboxes. Satisfies the rest of
   **AC-16**.
6. **Browser errors.** The Hub web reporter, `/__conexus/report.js` and its injection, the two
   routes, limits and the log record. Satisfies **AC-23**, **AC-24**.
7. **Proof.** AC-27 on the pilot with a Builder-made app, recorded in the release evidence.
   Satisfies **AC-27**.
8. **Sentry, per company.** Only when a company asks for it: the envelope sender and the account
   hash, proved against a test Sentry project. Satisfies **AC-25**.

## Migration plan

**Strategy**: additive. No database migration, no data moves. Each slice ships behind
`OTEL_EXPORTER_OTLP_ENDPOINT`: unset, the Hub runs as before except for the logger change (slice 1)
and the removal of connector stderr lines (slice 3).
**Rollback**: unset the variable and restart, or revert the slice's pull request.
**Risks**: the bridge is marked experimental by Mastra (pinned, and its behavior is under test in
slice 3); instrumentation overhead on the 512 MB Hub (slice 1 measures heap baseline and p99 with
and without the SDK and records both); SigNoz's 4 to 8 GB beside the Hub on a 10 GB WSL pilot
(the operator's memory choice before slice 4).

## Consequences

**Positive**:
- The next OOM shows as a rising line and a warning minutes before, with a heap snapshot after.
- A failing app call is one trace with its app, operation, person id, timings and error code.
- Builder cost and tokens per model and per run come from Mastra's own numbers.
- Changing backend is a Collector exporter change.

**Negative / tradeoffs**:
- Nine new runtime packages, pinned to the OpenTelemetry 0.221 line until the bridge moves.
- The pilot needs 4 to 8 GB more memory for SigNoz.
- Telemetry holds no content; diagnosing a wrong Builder answer still needs the Postgres trace.
- Handler queries made outside the provided `db` are not timed.
- Generated app stacks are minified until source maps are wired.

## Follow-up

Records to amend, each needing the operator's approval before this spec is Accepted:
- [ ] New decision (next free number after C-033 and 0005's proposed C-034): OpenTelemetry in
      every Node process, Mastra's bridge for Mastra spans, a Collector and SigNoz per installation,
      redaction by allowlist, telemetry carries no content, browser errors through the Hub, Sentry
      only by the company's choice.
- [ ] Amend C-029: the connector record also travels through the bridge to the installation's
      telemetry; its stderr line is removed.
- [ ] `docs/roadmap.md` *Technology baseline*: add the rows of *Pinned packages* under the new
      decision.
- [ ] `infra/pilot/README.md`: the telemetry stack, its memory and how to start it.

Later work:
- [ ] Source maps for generated app stacks, resolved at the Hub.
- [ ] The agent's query tool over SigNoz (*Agent query seam*).
- [ ] Mastra internal logs to OpenTelemetry once a log store question is settled.
- [ ] Rotation of `hub.log` and `runner.log`.
