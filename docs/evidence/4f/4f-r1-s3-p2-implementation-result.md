# 4F(R1) S3-P2 — NEW exact-image source staging result

> **Status:** `CLOSED PASS`
> **Stage:** `S3 ACTIVE / S3-P3 NEXT`
> **Product operation delta:** `0`
> **Provider/external network calls:** `0`
> **Execution environment:** WSL Ubuntu, Node `24.20.0`, npm `12.0.2`, Docker Engine `29.7.2`

## Delivered vertical outcome

S3-P2 adds one Project-private named operation, `stageNewProjectSource`. It
creates an owner-isolated NEW-mode bare repository in a validated staging path
and sets `refs/heads/main` exactly once with expected-old-zero CAS. The staged
commit contains only the three admitted R1 generated/platform files; the
APP-owned path census is exactly zero.

The generated projection derives those bytes and their ownership classes from
the closed S2 manifest/receipt. It independently calculates the Git tree and
commit identities. Production accepts no caller image, executable, argv,
shell, mount, environment, ref or source bytes. It mounts only the exact
Project/attempt path, runs as the owner process UID:GID, disables network and
ambient Git config, and invokes only fixed `/usr/local/bin/git` vectors through
one fixed no-shell Node orchestrator inside the admitted OCI image.

## Exact outputs

| Class | Path | SHA-256 |
| --- | --- | --- |
| `GENERATED` | `apps/hub/src/generated/r1-new-project-seed.ts` | `2183a8d86be9f3be4354d424166d4905000e82f38c6925ee01b39d068216621f` |
| `PLATFORM-CONTRACT` | `apps/hub/src/project/git-execution.ts` | `f6cd76ed266c2c4ee741d85f4e9f31c8b181812ac377a6d25cd4759c3dd962b2` |
| `PLATFORM-CONTRACT` | `scripts/generate-r1-s3-new-project-seed.mjs` | `3d4c3f705dcc762289c154e0c855dc108824db66e453e42849e06b23ba0956f4` |
| `PLATFORM-CONTRACT` | `scripts/check-r1-s3-git-execution.mjs` | `a5fbf5ee9cb78bc5137361ebc3be3f657632f22a27b157044a91b68e6d7faddc` |
| `PLATFORM-CONTRACT` | `scripts/record-r1c14-native-readmission-receipt.mjs` | `08849c55b9b85c483e82a7dadf3a799835439a18b2a32f5e43cdaf3d0443800a` |
| `TEST` | `tests/implementation/r1-s3-git-execution.test.mjs` | `0b9e24567a2a6af44c7723c5c5805e997e93f11200410d26b06496772c2f870c` |
| `PLATFORM-CONTRACT` | `package.json` | `9d961db435a6ce0d93fd50330611f0d1105cfefc7f7b2f0e691e12eb4329c21c` |

```text
Git tree        8d5c876574e525ab4b071107be5001040f30f64d
sourceRevision  3445e593a344d1cdefd106e2808ea00aa5203ea1
APP-OWNED paths 0
```

## Deciding proof

```text
npm run r1:s3:p2:generate                PASS
npm run r1:s3:p2:check                   PASS / 21 active / 2 named live skips
npm run r1:s3:p2:live                    PASS / 1 OF 1 / real exact image
npm run r1:s2:hub:typecheck              PASS
Biome targeted check                     PASS
npm run r1:s2:import-law                 PASS / 26 OF 26
npm run r1:r1c14:native:check            PASS / 31 OF 31
npm ci                                   PASS / 191 packages / 0 vulnerabilities
npm run verify                           PASS
```

The real proof used only OCI index
`sha256:5e5c3526292bb87a97a3fa41c8e715800a02da5238fbe07bf99c1c4b614f7851`
with `--pull never` and `--network none`. It verified exact image/version/hash,
created the expected tree/revision, compared every committed blob SHA-256,
passed strict object verification, then repeated the same attempt. The repeat
was classified `CAS_CONFLICT` and returned the unchanged exact revision.

The initial live attempt exposed a physical owner mismatch: remapped container
root could not write the WSL bind mount owned by the service UID. Running the
fixed container as that owner UID:GID corrected the boundary. The repeated
proof passed after Git calls were consolidated into one fixed no-shell
orchestrator inside the same image. This correction changed neither a protected
claim nor the deciding identity/tree/CAS properties, so no new independent
review round was justified.

## Closure and next boundary

S3-P2 is `CLOSED PASS`. S3-P3 is the next part, but must first be materialized
as its own bounded subpacket: closed deployment catalog admission,
EXISTING_GIT destination/redirect policy and restrictive secret-file transport.

S3-P2 creates no canonical Project directory or visible Project state. Routes,
UI, database settlement, recovery/cleanup, bundles and all later Git operations
remain outside this closure. Cognition/R1C-13, Product/provider calls, external
OCI publication, commit, push, PR and merge remain blocked.
