# 0007. Rationale: telemetry on OpenTelemetry

## Context

On 2026-10-01 the Hub died of an out-of-memory error after 1 hour 43 minutes. Nothing warned: the
Hub had no process metrics, the heap snapshot flag sat on the parent process instead of the child
that died, and the only record was a `FATAL ERROR` line inside 777 KB of `hub.log`, most of it
connector span lines. A live sample afterwards showed RSS climbing about 13 MB a minute toward the
512 MB cap. A gauge sampled every 30 seconds would have drawn a straight line and warned at 80%.

The telemetry study of the same day mapped what exists at `f01f2d72`:

- The Builder is the only observable part. Mastra writes its spans to Postgres
  (`builder/module.ts:161-175`), with `logging: { enabled: false }` because the classic store has
  no log table.
- Connector calls are Mastra spans too, in a separate instance that opens its own trace
  (`connectors/broker.ts:300`), stored in Postgres and printed as JSON lines on stderr
  (`connectors/record.ts:13-30`). They do not join the app request that caused them.
- The app path (application host, invoker, runner, worker, handler, app database) has no trace and
  no structured log. The Fastify logger is off (`http/app.ts:34`), the error handler converts
  errors to problem+json without recording them (`http/app.ts:44`), and the application host's
  `catch {}` (`mar/application-host-routes.ts:164`) drops the cause and answers 503.
- No browser error is reported, from the Hub web or from a generated app.
- No `@opentelemetry/*` package is a dependency.

The operator decided on 2026-10-01 (the study's *Decision* section, binding): OpenTelemetry
everywhere, with Mastra's `OtelBridge` for the Builder and connector observability, the Node SDK in
the Hub and the runner, `traceparent` from the Hub to the runner as a header and from the runner to
the worker as a job field; SigNoz as the per-installation backend, with a light local backend for
development; a Collector in front; Sentry optional per company for browser errors only; a
same-origin reporter to the Hub when a company declines Sentry.

## Options considered

### Option 1: Mastra only, `PostgresStoreVNext` for logs and metrics

Move the Builder store to `PostgresStoreVNext` (`metrics`, `logs`, `trace-query` features in
`@mastra/pg` 1.27.1), and record the app path as Mastra spans in the same store.

**Pros**:
- No new backend; Postgres is already there.
- `mastra api trace|log|metric` gives an agent a query surface.

**Cons**:
- Process metrics (heap, event loop, GC) and HTTP or `pg` spans are not Mastra concepts; we would
  write that instrumentation ourselves.
- A store migration with new tables in the `factory` schema, for a store the Hub shares with its
  own data.
- The OOM case needs an alarm; Postgres has none.

### Option 2: OpenTelemetry in every process, Mastra bridged in, SigNoz behind a Collector (chosen)

The Node SDK with six instrumentations in the Hub and the runner; Mastra spans joined to the same
traces by `OtelBridge`; Mastra's metric events forwarded; one Collector per installation; SigNoz on
the pilot and server, a single container backend on a developer machine; an allowlist in the
process; browser errors through the Hub, to Sentry only by the company's choice.

**Pros**:
- Heap, event loop, GC, HTTP and `pg` come from maintained instrumentation, not our code.
- Mastra stays the producer of Builder and connector spans and of token and cost numbers; we add
  a 30 line metric forwarder because the bridge does not export metric events.
- One trace id across the Hub, the runner, the worker's connector calls and the Builder; probes P1,
  P4 and P5 show the joins in the installed versions.
- The backend is replaceable at the Collector.
- SigNoz gives one UI for traces, logs and metrics, attribute queries, alerts and an MCP server.

**Cons**:
- Nine pinned runtime packages, and the bridge is marked experimental.
- SigNoz needs 4 to 8 GB on the installation.
- The bridge exports prompts and tool payloads as attributes (probe P2); the allowlist must run
  before every exporter, and a test must prove it.

### Option 3: Option 2 with Sentry for everything (errors, traces, Builder spans)

**Pros**:
- The best error grouping, release tracking and alerting with no backend to run.
- `@mastra/sentry` exists for AI spans.

**Cons**:
- Sentry has no OTLP metrics (getsentry/sentry#111136 open), so the heap and event loop that this
  spec exists for would not reach it.
- Builder prompts, tool I/O and app error data would leave the company for a third party.
- Self-hosted Sentry needs 16 to 32 GB, more than an installation can give.

Also rejected: Grafana LGTM as the production backend (four query languages for one question, and
its maintainers label the single container for development and demos; kept as the dev backend);
Jaeger with Prometheus (no logs); `@opentelemetry/sdk-trace-web` in the browser (experimental and
heavy for an error reporter); `@opentelemetry/auto-instrumentations-node` (42 instrumentations
where six are used).

## Rationale

The OOM is the requirement that decides the shape: a warning needs process metrics and an alarm,
and those come from OpenTelemetry's runtime instrumentation and a backend with alert rules, not
from Mastra. Once the Node SDK runs, putting Mastra on it costs one constructor argument per
instance (`bridge: new OtelBridge()`), and probe P1 shows connector spans then sit under the HTTP
span that caused them. Mastra first still holds where Mastra has the mechanism: Mastra produces the
Builder and connector spans and computes tokens and cost; the forwarder only moves Mastra's numbers.

Six choices inside the decision:

1. **Redaction by allowlist, in the process.** Probe P2 shows the bridge exports
   `mastra.agent_run.input`, `gen_ai.tool.call.arguments` and `gen_ai.tool.call.result` with their
   full content. A Collector processor would also work, but then content would cross a process
   boundary first, and a denylist would pass any attribute a library adds later. An allowlist in
   one pure function is testable with planted strings.
2. **Telemetry carries no content; the Postgres trace keeps it.** The Builder's trace summary reads
   Mastra's Postgres store, which holds prompts and tool I/O for 30 days under existing rules.
   Keeping SigNoz content-free makes it safe to open to Conexus support and, later, an agent.
3. **The worker exports nothing.** It runs with no network and an empty environment. It passes the
   trace header outward on connector requests and reports query timings in its result; the runner
   and the Hub make the spans. That adds no capability to the sandbox.
4. **Raw account id inside the installation, a hash toward Sentry.** The uuid is pseudonymous and
   the installation's own database maps it anyway; a hash would protect nothing there and would cost
   the operator the question "what did this person hit". Sentry is a third party, so it gets an HMAC.
5. **Sentry through the Hub, not the browser SDK.** The same reporter runs in every page. The Hub
   forwards to Sentry when the company set a DSN. The CSP stays `'self'`, no third party script
   enters a generated app, and the allowlist runs before data leaves. The cost is Sentry's
   breadcrumbs and session replay, which a generated app's error does not need first.
6. **A Builder run is its own trace.** A run outlives the request that queued it by minutes. A link
   to the request keeps the relation without a 20 minute trace under a 50 millisecond root.

`PostgresStoreVNext` stays out. With SigNoz holding logs and metrics, VNext would add a second copy
of each signal and a migration of the Builder's store, for no current reader.

## Evidence

Probes run on 2026-10-01 in a scratch directory outside the repository, with `@mastra/core`
1.71.0, `@mastra/observability` 1.18.1, `@mastra/otel-bridge` 1.5.11, `@opentelemetry/sdk-node`
0.221.0, the instrumentations of *Pinned packages*, `@fastify/otel` 0.21.0, Fastify 5.12.1, Node
24.20.0:

- **Install**: `npm install` of that set resolves one `@mastra/observability` (1.18.1), one
  `@opentelemetry/api` (1.9.1) and one `@opentelemetry/api-logs` (0.221.0). The registry shows
  `@mastra/otel-bridge` 1.5.11 depends on `@mastra/observability` 1.18.1 exactly and on
  `@opentelemetry/api-logs` `^0.221.0`; 1.5.13 (latest) pins 1.18.3.
- **P1, connector spans join the HTTP trace**: a `DefaultObservabilityInstance` with
  `bridge: new OtelBridge()`, started inside an active OpenTelemetry span, exported
  `connector.fetch` and its child with the HTTP span's trace id and the HTTP span as parent;
  metadata arrived as `mastra.metadata.<key>`.
- **P2, content in attributes**: an agent, model and tool span exported
  `mastra.agent_run.input`, `mastra.agent_run.output`, `mastra.model_generation.input`,
  `mastra.model_generation.output`, `gen_ai.tool.call.arguments` and `gen_ai.tool.call.result`
  with the planted strings.
- **P3, Mastra metrics with cost**: an exporter that implements `onMetricEvent` received
  `mastra_model_total_input_tokens` 1000 and `mastra_model_total_output_tokens` 500 with
  `costContext { provider: 'anthropic', model, estimatedCost, costUnit: 'USD' }`,
  `mastra_model_duration_ms` and `mastra_agent_duration_ms`, each with `traceId`.
- **P4, stored root stays a root**: under an active HTTP span, the Mastra agent span reached the
  exporter with the HTTP span's trace id, `parentSpanId` null and `isRootSpan` true, so the Builder's
  `listTraces` by metadata keeps finding run roots.
- **P5, Hub to runner over a unix socket**: with the ESM hook registered, a Node HTTP request over a
  unix socket to Fastify carried `traceparent`; the server span, Fastify's request and handler spans
  and the client span shared one trace id.
- **P6, the effective heap cap**: on Node 24.20.0, `heap_size_limit` is 704 MiB under
  `--max-old-space-size=512` alone, 1216 MiB under `NODE_OPTIONS=--max-old-space-size=1024` alone,
  and 704 MiB under both `NODE_OPTIONS=--max-old-space-size=1024 node --max-old-space-size=512` and
  `NODE_OPTIONS=--max-old-space-size=256 node --max-old-space-size=512`: the command line wins.
  Two flags on the command line or two in `NODE_OPTIONS` resolve to the last. `process.execArgv`
  holds only the command line flags.
- **P7, unix socket and TCP requests**: on a Node HTTP server, a request over TCP has
  `socket.remoteAddress` `127.0.0.1` and `remoteFamily` `IPv4`; a request over a unix socket has
  both undefined. `instrumentation-http` 0.221.0 calls `startIncomingSpanHook` with the request
  before `propagation.extract(ROOT_CONTEXT, request.headers)` (`build/src/http.js:322,341`).
- **Versions on 2026-10-01** from the GitHub releases API: SigNoz v0.144.0 (installs through
  Foundry; `deploy/README.md` says the compose files are deprecated), `opentelemetry-collector-releases`
  v0.162.0, `docker-otel-lgtm` v0.34.0, `signoz-mcp-server` v0.15.0.
- Not probed: SigNoz itself, the Collector, Sentry's envelope endpoint, the bridge's log
  forwarding, and the Builder's run id in the metadata of a model span's metric event (Mastra
  1.18.1 copies the span's metadata onto the event, `dist/index.js:4866`). Slices 1, 3, 4 and 8
  prove them.

## References

**Project sources**:
- Telemetry study, hub process model and hub OOM diagnosis, 2026-10-01, in the operator's study
  notes (`telemetry/study.md` with its *Decision*, `hub-structure/process-model.md` F8 and F19 to
  F22, `hub-oom/diagnosis.md`).
- `docs/decisions/index.md`: C-029 (the connector record), C-033.
- `docs/roadmap.md` *Technology baseline*; `docs/development/delivery.md` *Technology rule*.
- `apps/hub/src/http/app.ts`, `apps/hub/src/mar/{application-host-routes,application-invoker,preview-routes}.ts`,
  `apps/hub/src/app-runner/{http,module,supervisor,sandbox,worker,main}.ts`,
  `apps/hub/src/connectors/{record,broker,handler-port,module}.ts`,
  `apps/hub/src/builder/{module,service,run-runtime,mastra-session-routes}.ts`,
  `apps/hub/src/platform/{postgres,application-csp}.ts`, `apps/hub/src/server.ts`,
  `scripts/build-hub-local.mjs`, `infra/pilot/{hub,runner}.sh`.
- Mastra docs in the installed packages and in the Mastra docs source:
  `reference/observability/tracing/bridges/otel.mdx`, `docs/observability/metrics/overview.mdx`,
  `reference/observability/metrics/automatic-metrics.mdx`; `@mastra/pg` 1.27.1
  `dist/storage/domains/observability/v-next/index.d.ts`.

**Practices & standards**:
- W3C Trace Context (`traceparent`); OpenTelemetry semantic conventions for HTTP, database, GenAI
  and V8 runtime metrics.
- Collect by allowlist; keep content out of operational telemetry.
- Alert on saturation before failure; capture diagnostics on the process that fails.

**Links**:
- OpenTelemetry JS: https://opentelemetry.io/docs/languages/js/
- SigNoz install (Foundry): https://signoz.io/docs/install/docker/
- SigNoz MCP server: https://github.com/SigNoz/signoz-mcp-server
- Sentry envelopes: https://develop.sentry.dev/sdk/data-model/envelopes/
- Sentry OTLP metrics issue: https://github.com/getsentry/sentry/issues/111136
