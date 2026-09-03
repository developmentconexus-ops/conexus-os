# 4F(R1) S3-P5 — source-complete PRJ-03 implementation result

> **Verdict:** `CLOSED PASS`
> **Product operation delta:** `+1 generated operation (PRJ-03 only)`
> **Next boundary:** `S3-P6 PACKET NEXT`; no P6 Product bytes authorized yet

## Delivered vertical outcome

P5 realizes the exact generated `PRJ-03 CreateProject` command for both the
accepted `NEW` seed and one startup-admitted `EXISTING_GIT` locator. A current
authenticated Workspace member with `project.create` receives `201` only after
the canonical source, Project row, direct creator grant and terminal receipt
agree. The same key replays the exact stored representation; request conflict,
authorization loss, Git refusal, canonical conflict, settlement failure and
recovery refusal remain honest non-success states.

Immutable migration `006` keeps the IAM predicate internal to `project_owner`,
checks current authorization before reservation/replay and rechecks it at the
settlement lock. The command role gains no direct IAM predicate or table
authority. One shared Project identity law admits UUID versions `1..8` and
refuses v9 across command, Git and recovery.

Pre-intake recovery claims the oldest at most 16 eligible receipts using a
server-owned one-hour cutoff and `FOR UPDATE SKIP LOCKED`. Claim, exact-identity
filesystem cleanup and commit remain inseparable; any refusal rolls back and
blocks intake. Settlement holds the same receipt lock, re-verifies canonical
source identity and atomically writes Project, creator grant and terminal
receipt. No P6 read/client/UI or generic Git, shell, argv, database, network or
filesystem authority is introduced.

## Exact final implementation bytes

| Class | Path | SHA-256 |
| --- | --- | --- |
| `PLATFORM-CONTRACT` | `apps/hub/migrations/006_project_create_authorization.sql` | `e8db0346c822bc38543d3e18d71862c4be186165709fc032ed1b110260ef32d4` |
| `PLATFORM-CONTRACT` | `apps/hub/migrations/atlas.sum` | `5d3aff51e854e234da20bfa1f24c1bb73aaf361d09fc1d892a7419457e12c9e4` |
| `GENERATED` | `apps/hub/src/generated/s3-routes.ts` | `ca1ef73eccef397ad3dcade3480f316bf662768f06e0eab2ab03a6a7660f5c15` |
| `PLATFORM-CONTRACT` | `apps/hub/src/project/identity.ts` | `de8ec917d4d519c5718c04dc6012b0a9812c8c2e418c9ce44fbcdc36291dfc22` |
| `PLATFORM-CONTRACT` | `apps/hub/src/project/git-execution.ts` | `ef18db6f690348dd6277d9d461226168ce2c3efa6ff0e98eedc113ab6085fcfd` |
| `PLATFORM-CONTRACT` | `apps/hub/src/project/source-recovery.ts` | `4cba6cc8e1b71d761e6bc341f6667881aa0178da162dfef80f82dace00e71b69` |
| `PLATFORM-CONTRACT` | `apps/hub/src/project/errors.ts` | `726097314912b6e9d41f190d1369e084bbb64abd988c40a2f00fb491cc6c9058` |
| `PLATFORM-CONTRACT` | `apps/hub/src/project/store.ts` | `f5116eedfddf57b0c5047a806d6f9816b0ac357b263d1380d927a338f0366ed6` |
| `PLATFORM-CONTRACT` | `apps/hub/src/project/routes.ts` | `a7e98f209331fc6f7ea1f6d8dd6aec9fe2b356d4c9bf2cfc5cb52cc158c9f371` |
| `PLATFORM-CONTRACT` | `apps/hub/src/project/module.ts` | `0e7d6a34feee1871af01419dcc5c7461999dcb5e5a24d9887d44e37e6ccc5884` |
| `PLATFORM-CONTRACT` | `apps/hub/src/platform/config.ts` | `e378dc98c01a4f95c3e6a05bcb9b7634bc5538c8cc3c5a794b5779f71242070f` |
| `PLATFORM-CONTRACT` | `apps/hub/src/server.ts` | `69067a3a1b4b833f4826223f07feeb98becd64f96beebbd55cfa9020b9724355` |
| `PLATFORM-CONTRACT` | `scripts/generate-r1-s3-contracts.mjs` | `6a51c00eba6fb5bd60b6645dbdca9ec211460038a3edb7882e7e0b5cbeeafe57` |
| `PLATFORM-CONTRACT` | `scripts/run-hub-migrations.mjs` | `92e5513a7e7fb81546d459ebd1311d785348bba0b2c6b91fe04ecdcc479ad5e4` |
| `PLATFORM-CONTRACT` | `scripts/check-import-law.mjs` | `50455cc2214463ccbbaf17cdddb1eee04be7a1f6e63b08074f9f44fa3d62a13d` |
| `PLATFORM-CONTRACT` | `scripts/record-r1c14-native-readmission-receipt.mjs` | `cff45645e7f624d9d1b326827884c96c82048a143c12aa97b58c2db7b9582afc` |
| `TEST` | `tests/implementation/r1-s3-project-command.test.mjs` | `ee0c49c3d32b8bb104bba007b63b6760eb657162d155d1434391f14c901bf3a4` |
| `TEST` | `tests/implementation/r1-s3-postgres.test.mjs` | `74fd68abab47883e7eb6fcb101078c159a28bee475034955e02b3cebcf7f62d5` |
| `TEST` | `tests/implementation/r1-s3-git-execution.test.mjs` | `b211893101f1f7289bcb52015240886e6910bc62cb673bf7c2d0b88af1b8f075` |
| `TEST` | `tests/implementation/r1-s3-source-recovery.test.mjs` | `78ae111accf048b7a93ea0fbb8573deb62b931e6d38e492036df9161769a7f05` |
| `PLATFORM-CONTRACT` | `package.json` | `23728ce1dd11a2ecc797bebf51f5df9dde6719974a5c3a89c8641457918bdccb` |

The exact generated Product OpenAPI digest is
`67d141e946e933c8a031d456f9d51ed44389053e5b2c50979b10c927dae07cd3`
and its one-route projection digest is
`e7cc1522e555301eccef94d39c354fc875fa4238c87dcec64741cc1bbaa52c7d`.
The frozen review candidate digest is
`0bde184094751ead251c2c4bc8c032d3e05bf1b91f4396de6c9865f804fa0758`
and the neutral brief digest is
`9d9901b3eb25d7a0bd98d531a71bf6287b521474d7d5ca6d6e6ee3ecf4ef91ca`.

## Deciding proof

The live proof used only PostgreSQL
`docker.io/library/postgres@sha256:6e5a6518f9d2ff9e9f4cba2a5a87d8f41b0f067f6f92ac847c344351a6c8d923`
and Git OCI index
`sha256:5e5c3526292bb87a97a3fa41c8e715800a02da5238fbe07bf99c1c4b614f7851`.
The Git identity was never substituted by host Git, a mutable tag or another
platform manifest. `EXISTING_GIT` used only a synthetic isolated HTTPS fixture
and ephemeral credential/certificate. All proof containers and networks were
absent afterward.

```text
P5 generated/behavioral proof
  PASS / 8 active / 1 isolated live canary skipped
  exact PRJ-03 only / shared UUID law / claim-bound recovery / failure matrix

P5 real NEW + EXISTING_GIT HTTP composition
  PASS / 1 of 1 / 150086 ms
  two Projects / two creator grants / two terminal receipts / exact replay

real PostgreSQL composed proof
  PASS / P1 + P4-B = 2 of 2
  current authorization / oldest-16 / settlement lock / two scanners
  SKIP LOCKED / rollback / live function-source drift refusal

P4-A proportional regression
  PASS / 29 active / 4 unchanged live canaries skipped

P4-B proportional regression
  PASS / 2 of 2

Hub typecheck + targeted Biome
  PASS / no errors / one pre-existing server.ts warning retained

import law
  PASS / 26 of 26

npm ci + npm run verify
  PASS / 191 added / 192 audited / 0 vulnerabilities / verify exit 0

R1C-14 native successor
  PASS / 31 of 31 / manifest 17 of 17
  historical result SHA-256 d5ccba4ecf683417a5a78313c5fa7230fd3eb56fd8ced0eca7e14b844be767c6
```

No credential value is retained in this Evidence.

## Independent closure and Lead adjudication

One final round was justified because the P4 corrections changed the deciding
proof reliability inherited by P5 and this is the P5 stage-gate closure. Both
valid lanes inspected the same frozen bytes and neither received the other
lane's output.

| Lane | Actual identity | Raw verdict |
| --- | --- | --- |
| Claude Code Fable | CLI `2.1.257`; alias `fable`; canonical `claude-fable-5-1`; `xhigh`; plan/read-only; session `0f430d6d-f74f-4012-9d37-a28d338a7afd` | `CLEAR / NO MATERIAL BLOCKER / METHOD FINDING=0 / PRODUCT-PLAN GAP=0 / LOCAL EXECUTION GAP=0 BLOCKING + 3 NON-BLOCKING DEFER SAFELY / S3-P5 CLOSURE CANDIDATE SURVIVES` |
| AGY Gemini | CLI `1.1.23`; `gemini-3.1-pro-high`; `high`; plan+sandbox/read-only; conversation `85644f4d-715b-4bd9-9d70-ea2be4301b35` | `PASS` |

AGY conversation `964e7dbc-1d25-4f4c-bdfc-169426430f5e` was canceled
before producing a review because headless command permission was unavailable.
It is discarded and is not Evidence.

Lead adjudication is `CLEAR`:

1. Hub clock versus database clock for the one-hour cutoff — `DEFER SAFELY`;
   current single-host R1 has about 50 minutes of safety margin and migration
   005 refuses future cutoffs. Revisit when multi-host/separate-database
   topology opens; later owner is Release/operations.
2. Storage-root and external slot-file validity are fail-closed at first use,
   while password file and catalog are startup-validated — `DEFER SAFELY`;
   no protected property can become a false success. Revisit at P6 readiness
   and startup composition; later owner is Project module composition.
3. The settlement-time `SUCCEEDED` replay branch lacks a direct isolated test —
   `DEFER SAFELY`; lock exclusion, canonical adoption, strict replay validation
   and the failure matrix prevent a false `201`. Revisit on any settlement or
   replay change; later owner is the P5 regression suite under P6.

No material correction is required. No further reviewer call is justified.

## Remaining boundary

S3-P5 is `CLOSED PASS`. S3-P6 remains separately gated and unmaterialized; its
packet must freeze the generated PRJ-01/02 disclosure plus locked W-01
create/browse browser outcome before any P6 Product byte. Cognition/R1C-13,
Product/provider calls, generic Git/argv/shell access, production catalog/input
custody, external publication, commit, push, PR and merge remain blocked.
