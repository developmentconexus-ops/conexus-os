# 4E ProjectMastra admission probe

Evidence-only harness for the operator-approved isolated non-provider probe.

It uses exact `@mastra/core@1.63.2` and `zod@4.5.2`, deterministic local model
fixtures and no credentials or provider calls. It proves only the claims named
in `probe.test.mjs`; it is not Product implementation.

Mastra feature telemetry is enabled by default and targets PostHog. The harness
sets `MASTRA_TELEMETRY_DISABLED=1` before dynamically importing Mastra and its
deciding replay runs with container networking disabled. Any realization that
omits this opt-out fails the zero-ambient-egress contract.

Run with Node `24.18.0`:

```bash
npm ci --ignore-scripts
npm audit signatures
npm test
```

The known `@ai-sdk/provider-utils-v5` advisory is a deciding negative control.
The exact shipped code caps a response at 2 GiB, which is finite but not an
acceptable in-process Hub resource ceiling. Consequently this probe can close
the framework/profile mechanics while keeping the exact pin `HOLD FOR PRODUCT
USE` until a patched stable pin or a separately admitted bounded adapter/process
boundary is proven.
