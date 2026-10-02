# Telemetry

The Hub and the app runner export traces, logs and metrics over OTLP/HTTP to one Collector per
installation. Spec: [0007](../../docs/tasks/specs/0007-telemetry-otel/index.md).

- `collector.yaml`: the Collector. It listens on `127.0.0.1:4318`, limits memory to 256 MiB, adds
  `conexus.installation` and forwards to the backend named by `CONEXUS_TELEMETRY_BACKEND`.
- `compose.dev.yaml`: the dev backend and the Collector. `docker compose -f infra/telemetry/compose.dev.yaml up -d`
  starts them; `stop` stops them. Grafana is on `http://127.0.0.1:3000`.
- `alerts/`: alert rules for SigNoz. The script that applies them and the SigNoz install come in slice 4.

Turn the SDK on by setting `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318` for the Hub and the
runner and restarting them. Unset, no SDK starts; the heap warning `PROCESS_HEAP_HIGH` still logs.
