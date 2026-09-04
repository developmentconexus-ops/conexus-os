# 4F(R1) S6-P0 — Project inception result

> **Status:** `CLOSED PASS`
> **Delivered property:** `PRJ-07 FIRST-USE REALIZED`
> **Stage posture:** `S6 OPEN`; refinement and `PRJ-24` remain separate outcomes

## Delivered vertical

The generated PRJ-07 client and authenticated same-origin HTTP route now traverse
the Project owner, resolve the current immutable source revision, invoke exactly
one admitted `ProjectInceptionAgent` through the closed ProjectMastra catalog,
treat its strict output as untrusted, revalidate Project/source/provenance, and
settle one immutable canonical `ProjectBaselineCandidate`. Idempotent replay
returns the exact stored response; changed source or revoked authority refuses
settlement.

Source inspection executes with the closed Linux-native R1C-14 OCI identity,
not host Git or a mutable tag. The container is read-only, networkless and
receives only the bare repository plus one bounded request. The isolated program
is syntax-checked by the directed suite so a fake runner cannot hide an invalid
container entrypoint.

The exact local development credential mechanism is external operator-owned
Anthropic personal OAuth for `claude-fable-5`; no API key is admitted. Token
bytes remain outside Product state, requests, database, repository, output and
Evidence. S6-P0 used the fake model path only: no Product/provider call was made.
Production, pooling, redistribution and multi-user custody remain blocked.

## Proportional proof

| Proof | Result |
| --- | --- |
| generated PRJ-07 projection | PASS; 7 routes; projection `b86434d93b278c34c23e8103d700d166c195e5da0af92c4f923d3662cf76eafc` |
| focused HTTP/Mastra/OAuth/migration controls | PASS, 2/2 |
| Hub/Web typechecks and import law | PASS; import law 26/26 |
| real PostgreSQL settlement | PASS, 1/1 on `postgres:16.10-alpine@sha256:029660641a0cfc575b14f336ba448fb8a75fd595d42e1fa316b9fb4378742297` |
| clean dependency reconstruction | `npm ci` PASS |
| full repository verification | `npm run verify` PASS |
| R1C-14 native protected property | manifest 17/17 PASS; targeted suite 31/31 PASS |
| package provenance/security | 336 registry signatures and 99 attestations verified; only 2 known low-severity audit findings |

The required repository check exposed a pre-existing false positive at the
exact checkpoint: its hygiene rule rejected the tracked historical
`4e-r1-to-4f-handoff.md` that checkpoint `fd6f771` itself added. The bounded
correction exempts only that exact preserved Evidence path; arbitrary handoff
or dialogue artifacts remain rejected.

The first PostgreSQL attempt reached the service before readiness and failed
with `57P03`; the unchanged proof passed after readiness was established. This
was infrastructure timing, not a Product correction.

## Lead adjudication

`CLEAR`. The bounded implementation preserves the frozen Product authority,
credential boundary, source-custody property and deciding proof. No correction
changed a protected property or invalidated earlier deciding Evidence, so the
methodology forbids an additional Fable/AGY review round. Non-blocking recovery,
framework expansion, browser wiring, PRJ-24 and production custody are deferred
safely to their own authorized increments.

The optional broad `npm test` historical suite has 24 stale roadmap-literal
assertions that still require the pre-implementation `BLOCKED` projection. They
do not exercise S6 code or the current-state verifier, and recursively rewriting
those sealed historical fixtures is deferred safely. The required current
repository check and full `npm run verify` are green.

No commit, push, PR or merge was performed.
