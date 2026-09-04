# 4F(R1) S3-P1 — Project persistence boundary result

> **Status:** `CLOSED PASS`
> **Stage:** `S3 ACTIVE / S3-P2 NEXT`
> **Product operation delta:** `0` durable Product operations
> **Provider/external publication calls:** `0`
> **Execution environment:** WSL Ubuntu, Node `24.20.0`, npm `12.0.2`, PostgreSQL `17.10`

## Delivered vertical outcome

S3-P1 establishes the smallest real persistence capability needed by later
PRJ-03 composition. It can reserve one Project identity, distinguish replay
from request conflict, create the exact Project row, establish only the direct
creator grant, lock the receipt for later recovery composition and terminalize
that receipt. The complete settlement path is proved only inside transactions
that roll back, so no source-incomplete Project, creator grant or terminal
receipt becomes durably visible in this part.

The migration adds only `project.project`,
`project.operation_idempotency` and `iam.account_project_grant`. The
`hub_prj03_command` login has no table DML, owner membership, role assumption or
unlisted execution authority. Its five admitted owner functions use static,
fully-qualified SQL, fixed security-definer search paths and no `PUBLIC`
execution. The direct creator grant contains only `project.read` and
`project.manage`.

## Exact outputs

| Class | Path | SHA-256 |
| --- | --- | --- |
| `PLATFORM-CONTRACT` | `apps/hub/migrations/003_project_foundation.sql` | `866c6da3d1a4171437b2c0a5beb72ff4994cfce499826cd8b397c2daa60037f2` |
| `PLATFORM-CONTRACT` | `apps/hub/migrations/atlas.sum` | `ea4e7a29357407dd996b2b56b1ad65101348df6faa1a7d5e80db6ad51e6e77fa` |
| `PLATFORM-CONTRACT` | `scripts/run-hub-migrations.mjs` | `1077b0dda367c54c87cbb601324dcf6ed19f2659cc69d60ac08f868c8b379a8c` |
| `PLATFORM-CONTRACT` | `scripts/record-r1c14-native-readmission-receipt.mjs` | `b960d9bf62f0788498dff350d291b78eac5a9a556a01519f55a6d2971d4d9e76` |
| `TEST` | `tests/implementation/r1-s2-postgres.test.mjs` | `530668f373ed36b9797d5e3e39ee45f7ed9050dced7077ccd241d247e59dfb83` |
| `TEST` | `tests/implementation/r1-s3-postgres.test.mjs` | `ddadd337dff27ad5b40a435042f7535ba29040c0119f5e092a83edbc1076bf19` |
| `PLATFORM-CONTRACT` | `package.json` | `696a01c835066af6a422b20b576ddbcb98e66e30c1648485801c8ffa827e32c1` |

## Deciding proof

The operator-admitted input was the exact Linux/amd64 PostgreSQL manifest
`sha256:6e5a6518f9d2ff9e9f4cba2a5a87d8f41b0f067f6f92ac847c344351a6c8d923`
from the pinned `docker.io/library/postgres:17.10-bookworm` reference. The local
image ID equalled the manifest, the server reported PostgreSQL `17.10`, and the
ephemeral endpoint was bound only to loopback. No credential value is retained
in this Evidence.

```text
npm run r1:s3:p1:check                    PASS
npm run r1:s3:p1:postgres                 PASS / 1 OF 1 / real PostgreSQL
r1-s2-postgres.test.mjs                   PASS / 1 OF 1 / same exact input
npm run r1:s2:hub:typecheck               PASS
npm run r1:s2:import-law                  PASS / 26 OF 26
npm run r1:r1c14:native:check             PASS / 31 OF 31
Biome targeted check                      PASS
```

The first live run correctly falsified the test's deliberate tamper setup
before the intended runner assertion: PostgreSQL will not replace a function
while dropping its named input parameters. Restoring those same five names
changed only the test mechanism. The repeated proof exercised exact catalog and
privileges, reservation/replay/conflict, receipt locks and concurrent
exclusion, rollback at every cross-owner boundary, rejection of direct DML and
role assumption, migration function-source tamper refusal, and zero durable
Project/grant/terminal-receipt state.

After the deciding proof, the named ephemeral container and the admitted
PostgreSQL image were absent from the local daemon. No database, synthetic
credential, exported archive or new registry artifact was retained.

## Closure and next boundary

S3-P1 is `CLOSED PASS`. The next bounded part is S3-P2: stage the exact NEW
generated/platform tree, prove an empty APP set and immutable source revision,
and use only named local operations through the already admitted exact Git
image. S3-P2 must be materialized as a bounded subpacket before implementation.

Routes, UI, PRJ-03 source-complete settlement, abandonment recovery and later
Git-operation expansion remain outside this closure. Cognition/R1C-13,
Product/provider calls, external OCI publication, commit, push, PR and merge
remain blocked.
