# 4F(R1) S3-P4-B receipt-locked recovery implementation result

> **Verdict:** `CLOSED PASS`
> **Combined gate:** `S3-P4 CLOSED PASS`
> **Product operation delta:** `0`

## Delivered vertical outcome

P4-B closes the abandoned-attempt recovery prerequisite without exposing a
Product route or scheduler. The command role can claim either one exact expired
PRJ-03 receipt or the oldest at most `16` eligible receipts through the same
named `project.claim_abandoned_create_project_attempt` capability. Every claim
requires `RESERVED`, no terminal response and no committed Project, deletes only
inside the caller's still-open transaction, and returns the exact receipt and
Project identity.

The Project-owned production recovery adapter removes only the claimed
uncommitted Project identity's `staging`, `quarantine`, `bundles` and canonical
`projects` candidates. It refuses invalid identities, traversal, symlinked
roots/categories/candidates and cleanup errors. A refusal followed by rollback
restores the receipt for re-entry; a successful cleanup followed by commit
makes the abandoned attempt reclaimable. Terminal receipts, committed Projects
and sibling identities remain preserved.

The first corrected candidate still had one material identity-law mismatch:
accepted P4-A staging admits UUID versions `1..8`, while recovery admitted only
`1..5`. That would have made an eligible v6-v8 receipt permanently
uncleanable. Recovery now has exact `1..8` parity, the filesystem proof cleans
a v8 identity and refuses v9, and the real composed PostgreSQL proof claims and
cleans a v8 Project.

## Exact final implementation bytes

| Class | Path | SHA-256 |
| --- | --- | --- |
| `PLATFORM-CONTRACT` | `apps/hub/migrations/004_project_source_recovery.sql` | `c7477d9ac1786ebe330221641a916df102b8af553d18fb8b3c302b519b13f313` |
| `PLATFORM-CONTRACT` | `apps/hub/migrations/005_project_source_recovery_scan.sql` | `8eac8987356002c4a22ee96d169c5a33622d0116d7b5b8190af5f412f6db2bd5` |
| `PLATFORM-CONTRACT` | `apps/hub/migrations/atlas.sum` | `e94109ddf008d4df1ed737431f96f5725c985ffc8ebca84cc54eeda51aa20609` |
| `PLATFORM-CONTRACT` | `apps/hub/src/project/source-recovery.ts` | `65f50c0169192af290a3ab44564402ebd7056140d4d3df8aaa1e4aa996070aa3` |
| `PLATFORM-CONTRACT` | `scripts/run-hub-migrations.mjs` | `3f7e48f4901e7f4f500aa486879e78295c7b8ccef0e2e4ad40859b57bbf8ed17` |
| `TEST` | `tests/implementation/r1-s3-postgres.test.mjs` | `79a09290585291b294d708f7a9d498cce24704799a88a6fc580176603931acef` |
| `TEST` | `tests/implementation/r1-s3-source-recovery.test.mjs` | `78ae111accf048b7a93ea0fbb8573deb62b931e6d38e492036df9161769a7f05` |
| `PLATFORM-CONTRACT` | `package.json` | `7b1ed47c792fc522565db98e69d7298369d0205576a64563cc76321a3b5b7fe6` |

The frozen predecessor migrations `001..004` remain byte-identical. Migration
custody admits exactly `001..005`, binds both final function overload bodies on
every restart and refuses migration or live function-source drift.

The final independent confirmation froze candidate manifest
`1a25f6845f0a0e05f0779ea8ec316815adb2b1c3c5c584cdcda1932c82349979`
and brief
`b59cec04a7b4083646bee7a9bb9c1f990deecae4d3408944f8e66887da2c025a`.

## Deciding proof

The operator authorized only
`docker.io/library/postgres@sha256:6e5a6518f9d2ff9e9f4cba2a5a87d8f41b0f067f6f92ac847c344351a6c8d923`.
The acquired image ID equals that digest, reports `linux/amd64` and PostgreSQL
`17.10`. No mutable tag or different input was substituted. The loopback-only
ephemeral container was removed after each proof.

```text
production-adapter filesystem proof
  PASS / 2 of 2
  v8 exact cleanup / v9 refusal / sibling preservation / traversal and symlink refusal

real PostgreSQL composed proof
  PASS / P1 + P4-B = 2 of 2 / 23658 ms
  v8 exact claim+cleanup / oldest-16 / row lock / rollback+re-entry
  terminal and committed preservation / live function-drift refusal

P4-A proportional regression
  PASS / 29 active / 4 unchanged live canaries skipped

Hub typecheck + targeted Biome
  PASS

import law
  PASS / 26 of 26

R1C-14 native successor
  PASS / 31 of 31 / manifest 17 of 17

npm ci after final correction
  PASS / 191 added / 192 audited / 0 vulnerabilities

npm run conexus:verify -- --scope final
  PASS / npm run verify exit 0 / 73052 ms
```

No credential value is retained in this Evidence. The synthetic loopback test
password exists only in test process state and the PostgreSQL container is
absent.

## Independent closure and Lead adjudication

The first fresh round was justified by the oldest-16/canonical-cleanup false
PASS. It exposed the narrower UUID parity blocker; Lead accepted only that
material finding and corrected it without reopening P4-A or migrations.

| Round | Lane | Actual identity | Raw verdict |
| --- | --- | --- | --- |
| correction challenge | Claude Code Fable | CLI `2.1.257`; alias `fable`; canonical `claude-fable-5-1`; `xhigh`; plan/read-only; session `e22458d4-4f71-46b8-b6aa-a1d88b105779` | `LOCAL EXECUTION CORRECTION BEFORE P4-B CLOSURE / NO UPSTREAM REOPEN` |
| correction challenge | AGY Gemini | CLI `1.1.23`; `gemini-3.1-pro-high`; `high`; plan+sandbox; conversation `8d47afc9-59ab-4e81-b146-213df0143061` | `PASS` |
| final confirmation | Claude Code Fable | CLI `2.1.257`; alias `fable`; canonical `claude-fable-5-1`; `xhigh`; plan/read-only; session `fd3d6238-779d-49ae-b20f-dfbefd5e1573` | `CLEAR / NO MATERIAL BLOCKER / METHOD FINDING=0 / PRODUCT-PLAN GAP=0 / LOCAL EXECUTION GAP=5 NON-BLOCKING DEFER SAFELY` |
| final confirmation | AGY Gemini | CLI `1.1.23`; `gemini-3.1-pro-high`; `high`; plan+sandbox; conversation `1697eff0-e864-4b31-9411-851731f959a7` | `CLEAR` |

The earlier quota-limited Fable session
`c15f0a06-e20b-48a6-949b-0adb0caf328f` and AGY conversation
`cb84526b-0534-40b1-bc2d-b94df2092b9a` produced no review and are discarded,
not Evidence. Valid lanes were fresh and isolated; neither received the other
lane's output.

Lead adjudication is `CLEAR`:

1. UUID v1..5/v1..8 mismatch — `ACCEPTED + CORRECTED`; final v8 filesystem
   and real PostgreSQL proofs pass;
2. duplicated identity regex — `DEFER SAFELY`; exact bytes and v8/v9 controls
   are current; revisit in P5 before a third consumer and centralize one
   Project-owned identity law without reopening P4-A;
3. reservation accepts any PostgreSQL UUID — `DEFER SAFELY`; no production
   caller exists; P5 must mint or validate the server candidate through the
   same law before reservation;
4. cleanup API is not structurally claim-bound — `DEFER SAFELY`; only tests
   call it; P5 must make cleanup reachable only from a successful open claim
   and prove an unclaimed/committed identity cannot reach removal;
5. scan concurrency controls are not directly exercised — `DEFER SAFELY`;
   static single-statement locking is sound and no caller exists; P5 composed
   proof must cover concurrent scanners and a held settlement receipt;
6. expiry cutoff versus unlocked staging duration — `DEFER SAFELY`; current
   behavior fails closed and no caller exists; P5 must own a server cutoff
   above the longest admitted attempt or hold the receipt lock across staging.

Required-workflow wiring remains a final S3 receipt trigger, not a P4-B
blocker. No further reviewer call is justified: the final frozen candidate has
independent CLEAR convergence and no material correction remains.

## Remaining boundary

S3-P4-A and S3-P4-B now jointly close `S3-P4`. P5/P6 remain separately gated.
Before any P5 Product byte, the existing S3 packet must materialize the
source-complete PRJ-03 caller with the five deferred caller/composition
obligations above, its exact owner envelope, RED falsifiers and proportional
proof. Cognition/R1C-13, Product/provider calls, generic Git/argv/shell access,
external publication, commit, push, PR and merge remain blocked.
