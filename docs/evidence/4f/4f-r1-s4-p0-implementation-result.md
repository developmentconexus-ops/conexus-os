# 4F(R1) S4-P0 — Baseline custody foundation result

> **Verdict:** `CLOSED PASS`
> **Stage state:** `S4-P1 IMPLEMENTATION NEXT`
> **Proof ceiling:** custody/contracts only; no candidate was injected and no Product Baseline outcome is claimed

## Delivered result

S4-P0 realizes the frozen candidate/Baseline storage foundation without opening
cognition, provider execution or a production injection path:

- the existing canonical generator now projects exactly the closed S3 routes
  plus `PRJ-08`, `PRJ-09` and `PRJ-23` (`6/6` total);
- migration `008` adds Project-owned immutable candidate, current state and
  approval-decision relations;
- `hub_s4_baseline_read` and `hub_s4_baseline_command` receive only their exact
  SECURITY DEFINER functions plus `iam.admit_project_manage`;
- neither role has direct table privilege, owner membership or schema-create;
- canonical migrations, Hub routes/config/module and generated clients contain
  no candidate-injection capability;
- the S3 route registry remains intentionally `PRJ-01/02/03` only until P1/P2.

## RED → GREEN evidence

The initial targeted test produced the expected `2 FAIL / 1 PASS`: the three S4
operations were absent and migration 008 did not exist, while the production
injection-absence control already passed. After realization:

| Proof | Result |
| --- | --- |
| `npm run r1:s4:p0:check` | PASS; generated census `6`; structural `3/3`; Hub and Web typechecks PASS |
| ephemeral PostgreSQL 16.10 migration/checker plus inherited S3 suite | `3/3 PASS`; migration 008 and exact catalog/privilege boundary accepted |
| production injection resolution | absent/refused by canonical migration catalog checker |
| cleanup | exact ephemeral container removed |

No database password, cookie, CSRF value or synthetic secret is recorded in this
receipt.

## Exact implementation digests

```text
066ce45f5df4be134792c575e9339729a5532efa540cd4bf8fa6e776c651add0  apps/hub/migrations/008_project_baseline_custody.sql
cf94a36ebfea8bfb4386686d3b7e9a6cf460690fd84060dcdee957413ad245af  apps/hub/migrations/atlas.sum
434d8e5024aa89be9523926e1a76d1257030c07cc27447e10496444cb4a34c7d  scripts/generate-r1-s3-contracts.mjs
f1aae23a56b67b807e85b2fa36921cfcce007f6a7b565d23c7c788dcb4eb4198  apps/hub/src/generated/s3-routes.ts
99e36d095fbe60006909309b88ecf7f5ff81f67b4255959ae217c62059cea6b1  apps/web/src/generated/project-client.ts
c8d4018cd192e22cf5e3f0485347dc89ffdcedc617256c1c0a0812759ba5b009  scripts/run-hub-migrations.mjs
9fd464fa4ff0ccc42ca8ee6b7a168769eb280267c24b08da2d9916ee7e0dae28  tests/implementation/r1-s4-baseline-custody.test.mjs
a4ba9e2fad64a8c60b0069da028672aaf873fefbc5f5a50f1d1f680720b5392e  package.json
```

The recurring WSL systemd-user-session warning did not affect process exit,
Node/npm selection, PostgreSQL readiness or any deciding proof. It is a valid
non-blocking environment finding and is deferred safely.

No Fable/AGY review was called: no material correction changed a protected
property or deciding proof, so the frozen proportionality rule forbids an
additional assurance round.

## Next boundary

S4-P1 may now realize only the qualification-only injection fixture and durable
`PRJ-23` PostgreSQL → HTTP → refresh-safe Chromium candidate re-entry vertical.
`PRJ-09` and `PRJ-08` runtime/browser realization remain P2-gated.
