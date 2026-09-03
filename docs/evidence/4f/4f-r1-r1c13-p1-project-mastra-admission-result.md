# 4F(R1) R1C13-P1 — ProjectMastra admission result

> **Status:** `CLOSED PASS`
> **Next:** `R1C13-P2 / EXTERNAL INPUT REQUIRED`
> **Product/root dependency bytes:** `0`
> **Provider/model/credential calls:** `0`

## Result

The exact isolated Project cognition substrate is re-admitted for the
qualification claim only:

```text
@mastra/core                 1.63.2
@ai-sdk/openai-compatible   3.0.43 (representative P0 transport adapter only)
@ai-sdk/provider-utils      5.0.36
zod                          4.5.2
```

`MASTRA_TELEMETRY_DISABLED=1` is assigned before every Mastra dynamic import.
The ProjectMastra fixture contains exactly the two admitted stateless agents and
configures no storage, memory, workflow, worker, scheduler, background,
notification dispatch, scorer, exporter, workspace, subagent or MCP/A2A
capability.

The full Agent path resolves the model only from an opaque admission ID through
one closed catalog and public custom `MastraModelGateway`. Unknown, disabled,
mutable and caller-supplied model coordinates refuse before gateway resolution.
Built-in Mastra gateways, dynamic provider discovery, arbitrary gateway URLs and
ambient gateway credentials are not called by the admitted resolver.

## Clean proof

From a clean isolated installation:

```text
npm ci --ignore-scripts       PASS
npm test                      15/15 PASS
npm audit signatures          159 signatures / 35 attestations PASS
npm audit                     0 critical / 0 high / 0 moderate / 2 low
```

The two low entries are the known embedded Mastra AI SDK v5 response advisory.
P0 bounds the selected model transport, and P1 proves the built-in gateway path
is not used. A later code change that routes through a built-in gateway, raw
model string or unbounded adapter invalidates this admission.

The 15 cases comprise P0's seven response/egress falsifiers plus eight P1
claims:

1. exact lock and no-install-script/telemetry-before-import admission;
2. full Agent path through only the closed custom gateway;
3. PRJ-07 exact two native read tools, strict schema and configured ceilings;
4. unknown/disabled/mutable/caller-selected model refusal;
5. whole-error sanitization discarding prompt/response/credential envelopes;
6. independent tool-call and concurrency budget firing;
7. strict mutation-shape refusal and one-call proof for zero retries;
8. prompt total-timeout abort of a delayed provider.

## Deferred and blocked

P1 does not select an installation provider/model. The representative
OpenAI-compatible adapter proves public gateway mechanics only and is not a P2
selection. P2 remains blocked until repository/deployment authority supplies:

- one exact enabled provider/non-alias model/capability set/official HTTPS
  origin; and
- one external restrictive-permission secret-file path mapped to that
  provider's server-only credential slot.

P2 must then replace or specialize the representative adapter for that exact
entry and prove a firing DNS/socket/HTTP observer, zero unauthorized attempts,
the synthetic canary and the admitted-origin path. A real provider call remains
separately contingent on those inputs and must never borrow reviewer CLI
credentials.

Provider retention/training/region acceptance remains deployment/security
Evidence. It does not recreate the previously removed `dataGovernanceRef`
catalog identity.

S6/root Product dependencies remain forbidden until receipt-last R1C-13
`CLOSED PASS`.
