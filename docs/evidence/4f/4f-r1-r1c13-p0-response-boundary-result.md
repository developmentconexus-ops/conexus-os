# 4F(R1) R1C13-P0 — response-boundary result
> **Status:** `IN_PROCESS_BOUNDARY CANDIDATE / INDEPENDENT CLOSURE REQUIRED`
> **Product/root dependency bytes:** `0`
> **Provider/model/credential calls:** `0`

## Result

The preferred safe-stable-repin route is unavailable: on `2026-09-02`,
`@mastra/core@1.63.2` remains current stable and its bundled AI SDK v5 JSON
response path still admits a 2 GiB default. The public built-in
`ModelsDevGateway` has no `fetch` input; mutating the returned model's internal
`config.fetch` is rejected.

The historical owner-local-adapter reopen trigger therefore fired. Current
official Mastra documentation exposes a public `MastraModelGateway` whose
`resolveLanguageModel` returns an AI SDK model. The isolated candidate uses that
surface with `@ai-sdk/openai-compatible@3.0.43`; the adapter is subordinate
transport mechanics, never a direct Product invocation or second cognition
owner.

The candidate boundary:

- admits one exact origin and requires HTTPS outside a loopback-only
  qualification mode;
- forces manual redirects and rejects every redirect;
- rejects an oversized declared body before admitting bytes downstream;
- counts decoded stream bytes and cancels/errors before an over-limit chunk is
  exposed to the provider parser;
- returns only stable Conexus failure classes, without response or credential
  bytes;
- remains removable when the adopted dependency supplies an equivalent native
  limit.

## Exact isolated identities

```text
Node                              24.20.0
npm                               12.0.2
@mastra/core                      1.63.2
@ai-sdk/openai-compatible        3.0.43
@ai-sdk/provider-utils           5.0.36
zod                               4.5.2
Mastra embedded provider-utils-v5 3.0.30
```

All direct pins are registry tarballs with lock integrity, compatible Node
engines, no install script and Apache-2.0/MIT licenses. `npm audit signatures`
reported `159` verified registry signatures and `35` verified attestations.

`npm audit` reports only the already-owned low advisory through Mastra's
embedded `provider-utils-v5@3.0.30`; the adopted adapter's
`provider-utils@5.0.36` is not affected. This is not a waiver: P1 must make every
built-in/unbounded gateway unreachable and prove only the admitted custom
gateway can resolve a Project model. If it cannot, R1C-13 stops.

## Executable proof

Harness:

```text
qualification/4f/r1-project-cognition-admission/
```

`npm test` is `7/7 PASS`:

1. a below-limit response traverses the public gateway and remains usable;
2. a chunked oversized success response refuses before full production or
   settlement and cancels its source;
3. an oversized `Content-Length` refuses with zero bytes admitted to parsing;
4. origin and redirect denials fire independently;
5. production construction rejects non-HTTPS origin and invalid limit;
6. the same oversized fixture without the boundary is fully consumed, proving
   the negative fixture is not self-failing;
7. an oversized provider-error response is bounded by the same control.

The deciding source digests are:

```text
package.json                    5f2594307993a3d5c666cac3ddaae1e269ce8e3c0249d0ced815b20c04a5001f
package-lock.json               5ba70429001845b75db00e2a5454256b9875568ef19e1551c762c4122fb1942e
bounded-provider-fetch.mjs      dcd782671af14dab745007c866d0e58aa0dc294f427a0cbfa8263eb4dd917b45
p0-response-boundary.test.mjs   5e46f4b985fc0ea51a90854f5e058cf2d7d673d65f5b549c8ebc25c33e89eca3
```

## Lead candidate disposition

`TRANSITIONAL SOLUTION`: accept this public in-process boundary only if the
isolated independent closure finds no material false-PASS or trust-boundary
route. P1 then owns built-in-gateway exclusion and complete stateless/supply-
chain re-admission. P2 owns the actual exact provider adapter, non-alias model,
official origin, secret-file slot and egress proof. No root/Product dependency
may be added before the complete R1C-13 receipt.

Deletion condition: replace the adapter boundary when an adopted exact stable
Mastra/provider path provides and proves the same pre-parse decoded-byte ceiling.
