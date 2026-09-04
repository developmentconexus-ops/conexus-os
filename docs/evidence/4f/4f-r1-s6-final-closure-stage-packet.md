# 4F(R1) S6 — Final whole-S6/R1 closure stage packet

> **Status:** `CLOSED PASS / RECEIPT-LAST PASS`
> **Scope:** final completion proof only; no Product implementation delta
> **Prerequisite:** `S6-P0..P5 CLOSED PASS`
> **Execution grant:** operator-approved bounded S6 continuation; no real
> Product/provider call, production, publication, commit, push, PR or merge
> **Result:** [receipt-last S6/R1 closure](4f-r1-s6-final-closure-result.md)

## 1. Protected outcome

Close S6 and the R1 implementation tranche only if the already-realized 13/13
operation vertical survives one clean, Linux-native completion run. This packet
adds no Product behavior. It composes existing exact proofs for first-use,
refinement, explanation, honest failure, immutable Candidate re-entry,
authority/source/CAS settlement and historical R1 conformance.

## 2. Frozen proof set

```text
repository/toolchain identity + preflight
npm ci
R1 A0/G0 successor conformance and canonical 13-operation projection
R1C-13 isolated P0/P1/P2 admission suite (no live provider call)
R1C-14 native manifest + targeted false-PASS suite
S6-P0/P1 fake-model HTTP/owner/Mastra proofs
S4 and S6-P0/P1 real PostgreSQL 17.10 settlement proofs
S6-P2 exact-candidate explanation proof
S6-P5 full first-use/refinement/explanation browser composition
production-module Fastify/Project/Mastra/Chromium/PostgreSQL 17.10 composition
production bounded-fetch/OAuth/budget/zero-retry controls
repository current-state, hygiene, index and qualification-provenance checks
npm run verify
final preflight
```

Prior S1..S5 receipts and their immutable subject/dependency identities are
digest-valid unless a current check names drift. No historical gate is
reperformed merely for assurance. The current R1C-13 suite may read only its
synthetic fixtures and retained non-secret Evidence; the external OAuth
credential file and live provider path are excluded.

The exact G0 command is `npm run r1:a0:g0:verify`. Its deliberate skip is only
the original pre-cognition R1C-01 root-dependency equality assertion; that
assertion cannot admit the later operator-approved Mastra/Anthropic/Zod root
pins. Their successor identity is instead decided by the current R1C-13 supply-
chain/catalog tests and lock. Running legacy `npm run r1:g0:verify` is a
non-deciding stale diagnostic, not permission to remove the admitted pins.

Run the applicable extended checks individually. The legacy
`check-architecture-verification.mjs` snapshot is excluded: its frozen 3N
progression assertion requires `Product implementation = BLOCKED`, so it cannot
decide a post-operator-grant R1 closure. Hygiene, documentation reachability and
qualification provenance remain deciding; this exclusion changes no Product or
architecture invariant.

Correction after the diagnostic run: the complete historical repository test
suite is not deciding for S6 closure. It returned `289 PASS / 24 FAIL`, with all
failures projecting superseded pre-implementation roadmap states such as
`Product implementation = BLOCKED` or forbidding the already operator-approved
4D opening. It is absent from current required CI and no failure names an S6
Product/runtime/secret/authority property. Those status-projection tests are
`DEFER SAFELY` to repository-test maintenance; current-state, hygiene, index,
qualification provenance, import law, wire proof and required CI remain
deciding. Revisit on the next repository-test maintenance packet or if a
current required gate begins consuming them.

## 3. Exact PostgreSQL execution boundary

Use one ephemeral exact admitted `postgres:17.10-bookworm` index
`sha256:9b18b78397054fce88a9552e9d5a3ad5bb7fd258c5b3cc1c5028e46373d6ea8f`
on loopback with a test-only password, wait for final TCP readiness, assert
`server_version_num=170010`, run S4, S6-P0/P1 and composed suites, then remove
only that named container. No repository or external database is a target.

## 4. Frozen completion claims

| Claim | Deciding evidence |
| --- | --- |
| exact R1 surface | canonical G0 projection and accepted 13↔13 repository proof pass; no later route |
| current cognition admission | isolated R1C-13 P0/P1/P2 suite passes without network/provider execution |
| current Git/OCI custody | exact native R1C-14 manifest 17/17 and targeted firing suite pass |
| first-use/refinement settlement | fake-model HTTP plus real PostgreSQL authority/source/CAS/replay proofs pass |
| human browser journey | first-use, two-field refinement, honest failure, Candidate B PRJ-23 re-entry and explanation regressions pass |
| no optimistic/hidden authority | exact request bodies, server-issued digest navigation and fresh Candidate reads pass |
| clean reproducibility | `npm ci`, generation checks, typechecks, import law, repository checks and `npm run verify` pass |
| secret/history preservation | repository/qualification checks find no credential/runtime-history disclosure or historical receipt mutation |

Any `FAIL`, `NOT_PROVEN` or `INCONCLUSIVE` blocks S6 closure. Known Redocly
warnings remain non-blocking only if their accepted census is unchanged.

## 5. Frozen blockers and review ceiling

Blocked: real Product/provider calls, production/multi-user OAuth custody,
review-context projection, external OCI/input custody, deployment, publication,
commit, push, PR and merge.

The final fresh isolated Opus fallback + AGY/Gemini round and Lead adjudication
are complete. No further round is justified: the surviving corrections are
authority routing and documentation precision only; recovery/operability
findings are fail-closed and deferred to their named future admission triggers.
