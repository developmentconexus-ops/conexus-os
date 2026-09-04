# 4F(R1) S4-P2 — Exact Baseline approval result

> **Verdict:** `CLOSED PASS`
> **Stage result:** `S4 CLOSED PASS`
> **Next boundary:** `S5 PACKET NEXT`; no S5 Product byte is authorized

## Delivered vertical

S4-P2 completes the accepted candidate/Baseline custody journey:

```text
exact reviewed current candidate digest
→ direct project.manage admission
→ atomic PRJ-09 decision/current pointer
→ PRJ-08 approved Baseline resolved from immutable candidate bytes
→ honest Chromium approved comparison and re-entry
```

Concurrent approvals of the same current digest converge on one immutable
approval revision. A superseded digest returns stale failure and changes no
approved truth. The browser promotes no local truth before server success and
keeps the exact candidate visibly distinct from the approved Baseline.

## Deciding proof

| Proof | Result |
| --- | --- |
| P2 generated/structural/HTTP/browser/typecheck suite | `10/10 PASS`; Hub/Web typechecks PASS |
| real PostgreSQL 16.10 | `1/1 PASS`; same-digest concurrency convergence, stale refusal, next-current approval, read/re-entry and least privilege |
| real Chromium | exact decision success, approved read, `412` preservation, refresh, 404/503 and narrow no-overflow PASS |
| `npm ci` after final S4 Product bytes | `192` audited; `0` vulnerabilities |
| `npm run verify` | PASS; only pre-existing Redocly warnings |
| qualification cleanup | all exact S4 containers removed |

No credential, cookie, CSRF value or synthetic secret is recorded. The
qualification fixture remains absent from production composition. No Fable/AGY
round was called because no material correction invalidated a protected
property or deciding proof; the only P1 corrections were test-harness fixes.

## Current implementation digests

```text
0c6a3fbe52719cb0e5d38512ca8ef869837924e0e4c4d8d701cfed87234f2fef  apps/hub/src/project/store.ts
6f1d614f656439336e18bc75dd3b36aec950a2d602587c5c661bb9a40c5b675f  apps/hub/src/project/routes.ts
59034fbb95bed932f37e6544dd66b40d374c899c6207a65d9ff0902d308785de  apps/hub/src/project/module.ts
4a895f47fc8043b4fc626cac003905bec081ac38efd87db2aac83fac6c7e547e  apps/hub/src/platform/config.ts
e34ed8511a380b2da8a126cc0360a6645b64fe0a8e6e10f8c97a6c628e556040  apps/web/src/features/project/api.ts
e622279812b2c3ca80856ebc8390f28c87837ace0124f293feb64d4637b278dc  apps/web/src/features/project/components/baseline-candidate.tsx
07191082aca0ac899bf92193fb475bc957c4c48beb9645e7a726d356f735a300  apps/web/src/styles.css
07cbb0f7a619d9d09cb5efde7f2f8a0a2720cc43e662f5803186a326415017ed  tests/implementation/r1-s4-baseline-browser.test.mjs
c32a0c253cf43a7db8afa331446b10a914d9903efe717a1eb1bad77ab33bbbc3  tests/implementation/r1-s4-baseline-decision.test.mjs
a6e9321fccd5548847d236b6d1c6e38445fc8814632b83b09d9ce35d88d046a1  tests/implementation/r1-s4-postgres.test.mjs
0e0af98e1b1244b133b2f48e5edb772e6a14849de8c693ec57ae04d8d11a52fd  package.json
```

## Closure

S4-P0..P2 and S4 are `CLOSED PASS`. S5 begins only by materializing a bounded
packet for complete browser hardening over S1..S4: no new operation/table,
three-browser and authority/session/cache/coordinate/double-command proof, and
no cognition/provider/Product-app expansion.
