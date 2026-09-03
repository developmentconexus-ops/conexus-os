# 4F(R1) S4-P1 — Exact candidate re-entry result

> **Verdict:** `CLOSED PASS`
> **Stage state:** `S4-P2 IMPLEMENTATION NEXT`
> **Proof ceiling:** candidate custody/re-entry only; no approval or approved Baseline runtime outcome is claimed

## Delivered vertical

S4-P1 delivers the first S4 server-to-browser outcome:

```text
qualification-only canonical candidate injection
→ immutable Project-owned PostgreSQL custody
→ direct project.manage admission
→ PRJ-23 exact HTTP disclosure
→ digest-addressed refresh-safe Chromium review
```

The fixture exists only under `tests/fixtures`, has no Product route or runtime
grant, and is absent from canonical migrations/production composition. The
runtime read role cannot invoke it or mutate Project tables.

The browser renders the exact digest, source revision, runtime profile and
immutable source text from server truth; refresh/re-entry, 404, 503 and narrow
layout remain honest. No approval, assistant, refinement or model/provider UI is
present.

## RED → GREEN evidence

Initial P1 backend RED was `0/3`; the fixture, store method and route were absent.
The browser structural RED independently failed on the absent exact-digest
route. After realization:

| Proof | Result |
| --- | --- |
| targeted P1 structure/HTTP/Chromium/typechecks | `8/8 PASS`; Hub/Web typechecks PASS |
| real PostgreSQL 16.10 P1 | `1/1 PASS` |
| exact properties | canonical digest, process-loss re-entry, cross-Project miss, membership revocation, no direct table DML, no runtime fixture invocation |
| cleanup | all exact S4-P1 PostgreSQL containers removed |

Two qualification-harness corrections were required: parameterized setup was
split into individual driver calls, and a fixture-local variable was renamed to
remove a PL/pgSQL column ambiguity. Neither changed Product bytes, a protected
property or deciding-proof meaning; no additional reviewer call is justified.

## Exact implementation digests

```text
beb806b1143be57b9d4ced773c1ae87591fb6cb87b8a063987d34bdef9cc6445  tests/fixtures/r1-s4-baseline-candidate.sql
c8a70dbfc9b419da73ad59777d93ccd0612e9b0fdd2909a883a973efd542e12a  apps/hub/src/project/store.ts
09fcaaf0abab70fe3c521ef8660693258b52ba2dc16d04205331be83dbfb891a  apps/hub/src/project/routes.ts
8467fc0d3b1bfc9aa1d30fda8f225a73ced40c535d767663503944538a26a44b  apps/hub/src/project/module.ts
a57f961ddf7bc7b889ef9eb41ffb955e3c70372bf86585e4a15414e8c9c1e2bb  apps/hub/src/platform/config.ts
2e33f3ed9868aa39983b2ce659f6c162d4dec31ecf3636ef5309f4360f17b5e2  apps/web/src/features/project/api.ts
a7a0caeee5d4e86d4161c858ac954af86bd1bf451ba6523214e9f0b22538475a  apps/web/src/features/project/components/baseline-candidate.tsx
ef62d3cff50ed55306aa4bfb6cbb7d0120cda3c27d5ed1cb8103a9f5e05294d0  apps/web/src/routes/project-baseline-candidate.tsx
fad88e40f8727e12364ea230812ec520654048be50c9a487193ce8812e2377c1  apps/web/src/app/router.tsx
0aeecb236662929b5bb6578d8c535fd6bcb9d1f40235b8c909d55058032eef72  apps/web/src/styles.css
f206d90970c3ff98f21b3ed2423557bfa2c2c0638a015c2fcfdd5bad803eb535  tests/implementation/r1-s4-baseline-reentry.test.mjs
716217c01d8e6fa53b7bae64ca4c36a6657ab2d8ab5f996ff453d1265a3a6f09  tests/implementation/r1-s4-baseline-browser.test.mjs
f622fe8f14d84dd0ac980046cbbeb8792f7304e22bac89096eea8bf4a89fce21  tests/implementation/r1-s4-postgres.test.mjs
116d0aa5951e684b70711e5405d299bc09a16878b9ec87f0ed2e5a7aed49e467  package.json
```

No credential, cookie, CSRF value or synthetic secret is recorded here.

## Next boundary

S4-P2 may now realize only exact current-digest PRJ-09 approval, PRJ-08 approved
Baseline disclosure and their honest browser decision/re-entry. All frozen S4
blockers remain unchanged.
