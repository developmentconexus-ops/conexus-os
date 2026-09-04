# 4F(R1) S3 — bounded vertical stage code packet

> **Status:** `MATERIALIZED / S3-P0..P6 CLOSED PASS / S3 CLOSED PASS / S4 PACKET NEXT`
> **Owner:** 4F(R1) §§6–7 Project, Git custody and browser
> **Entry gate:** `R1C-14 NATIVE SUCCESSOR CLOSED PASS`
> **Current Product operation delta:** `0` (no route or disclosed operation)
> **First measurable outcome:** exact-image Git execution binding, with no PRJ operation exposed

## Packet boundary and proportionality law

This is the smallest existing S3 owner and is the stage code packet required by
Engineering Method 1.1. It admits one bounded vertical sequence and freezes the
protected claims before Product bytes. Work advances part by part; a valid
non-blocking recovery, framework or later-stage observation is `DEFER SAFELY`,
not a reason to recursively expand the current gate or review surface.

No additional reviewer round is authorized by this packet. Reopen review only
if a material correction invalidates a protected property or its deciding
proof. The first outcome is complete only when production-shaped code and its
real WSL/no-network proof both pass; document-only progress is insufficient.

The protected-claim and blocker census is frozen at exactly:

1. `EXACT_OCI_IDENTITY` — every production Git process names the admitted OCI
   index, never a host executable, mutable tag or platform manifest;
2. `FAIL_CLOSED_FIRST_USE` — absence, inspect mismatch, nonzero/signaled
   process, version mismatch or executable-hash mismatch refuses;
3. `NAMED_OPERATION_ONLY` — Project-private code exposes named operations, not
   arbitrary argv, shell or generic repository CRUD;
4. `BOUNDED_CONTAINER` — local operations use no network, no capabilities,
   no-new-privileges, read-only root and bounded tmpfs;
5. `OWNED_PATH_ONLY` — later repository operations may mount only one validated
   Project-owned path and cannot traverse, follow a symlink or cross owner root;
6. `CATALOG_BEFORE_NETWORK` — only EXISTING_GIT may enable network, and only
   after one exact enabled catalog entry has admitted its canonical destination;
7. `SECRET_NON_DISCLOSURE` — credentials never enter URL, argv, environment
   value, Git config, DB, log, Evidence or bundle;
8. `SOURCE_COMPLETE_SETTLEMENT` — PRJ-03 is invisible until its exact source,
   creator grant and terminal receipt settle atomically or recover honestly;
9. `HISTORICAL_EVIDENCE_PRESERVATION` — the closed R1C-14 Evidence and receipt
   are consumed by digest and never rewritten as S3 output.

Only a violation of one of these nine claims is a current material blocker.

## Material question

R1C-14 selected and reproduced an exact Git executable inside OCI index
`sha256:5e5c3526292bb87a97a3fa41c8e715800a02da5238fbe07bf99c1c4b614f7851`.
S3 must consume that identity without falling through to host Git `2.53.0`, a
mutable tag, the Linux/amd64 manifest digest or the superseded OCI index.
The deciding daemon also retains the explicitly rejected indices
`sha256:a75b3631df2a6e6bcdf94e4ee511bb81ddbab3f21b391badae9598f3bae1b9d7`
and `sha256:4b52df3b20e6c4654bb8cf4270fbe911cc3b0e8bc738a54fa325496b24e2854a`;
their shared platform manifest is non-discriminating and they are mandatory
live negative controls, never admissible substitutes.

## Selected physical binding

S3 uses one Project-private `GitExecutionPort` whose production implementation
is an OCI process adapter. It exposes only the named Git operations required by
4F §7; it does not expose generic argv, shell or repository CRUD. Every Git
process is `docker run --pull never` against the exact admitted OCI index above.
The immutable index is generated into the Hub from the admitted R1C-14
successor; runtime configuration cannot override it.

The adapter:

- refuses startup/first use unless `docker image inspect` resolves the exact
  index and the container reports Git executable SHA-256
  `b5d1f9f76f9805ce8721accc9d8bbff9af9b7407e182ab07a5677dafa6c22201`;
- invokes no executable named `git` on the host and has no fallback path;
- uses `--network none`, `--cap-drop ALL`, `--security-opt
  no-new-privileges`, a read-only container root and a bounded tmpfs for every
  NEW, CAS, verification, bundle and restore operation;
- mounts only the exact owned staging/canonical path required by the named
  operation, never the repository root or another Project root;
- enables network only for the single EXISTING_GIT discovery/fetch operation,
  after the deployment-owned `GitImportAdmissionCatalog` has selected one
  canonical entry; Git redirects, ambient configuration/helpers and terminal
  prompts remain disabled exactly as 4F §7 requires;
- mounts the matched credential slot as a restrictive temporary read-only file;
  the secret never enters URL, argv, environment value, Git config, DB, log,
  Evidence or bundle;
- returns typed result/refusal data and owner-safe stderr rather than exposing
  raw process handles or command construction outside Project GitInfra.

The Docker CLI/daemon is a physical process boundary, not Product authority.
The local R1 deciding proof uses WSL Ubuntu and Docker Engine `29.7.2`. External
OCI export/registry custody remains a separately routed operator action and is
not silently granted by this local binding.

## Parts and mutation envelope

| Part | Sustainable vertical outcome | Mutation ceiling | Completion proof |
| --- | --- | --- | --- |
| `S3-P0` | exact admitted-image identity projection and Project-private first-use verification | generated identity, named executor, generator/checker, targeted tests and command wiring only | structural RED matrix plus real WSL `--network none` version/hash probe |
| `S3-P1` | Project schema, idempotency/recovery receipt and direct creator grant boundary | Project/I&A migrations and owner ports; no route/UI | real PostgreSQL authority, replay, conflict and rollback proof |
| `S3-P2` | NEW stages exact generated/platform tree, empty APP set and immutable source revision | named local Git operations and owned paths only | real exact-image Git NEW/CAS/loser proof |
| `S3-P3` | EXISTING_GIT exact catalog admission and secret-file transport | catalog, restrictive askpass and named import operation only | redirect/destination/config/helper/credential negative matrix plus admitted canary |
| `S3-P4` | crash-safe promotion, settlement, bounded cleanup and same-ID bundle restore | recovery state machine and bundle mechanics only | every §7 crash row, corrupt bundle and same-ID restore |
| `S3-P5` | PRJ-03 source-complete command | generated PRJ-03 route plus owner composition | real PostgreSQL/Git HTTP replay/failure/re-entry proof |
| `S3-P6` | PRJ-01/02 disclosure and locked W-01 create/browse browser outcome | generated reads/client and exact locked UI slice | real Chromium honest-state, authority and responsive proof |

`S3-P0` was the first authorized mutation window and is now closed. It added:

```text
apps/hub/src/generated/r1c14-git-identity.ts             GENERATED
apps/hub/src/project/git-execution.ts                    PLATFORM-CONTRACT
scripts/generate-r1-s3-git-identity.mjs                  PLATFORM-CONTRACT
scripts/check-r1-s3-git-execution.mjs                    PLATFORM-CONTRACT
tests/implementation/r1-s3-git-execution.test.mjs        PLATFORM-CONTRACT
package.json                                             PLATFORM-CONTRACT
```

The exact prior digest for the only inherited path in that window is:

```text
package.json = 282ce4fb8b5c8973f0218ffc42bc7f530a3fc077899cbe324
```

All other S3-P0 code paths are additions. Roadmap/index/result updates are
authority routing and Evidence, not Product implementation. Receipt-time
snapshots remain provenance; they are not standing CI pins over mutable roadmap,
package or review artifacts.

The generator consumes only the closed native-successor manifest and receipt.
Its generated projection carries the exact OCI index, Linux/amd64 manifest,
Git path/version/hash, rejected indices and source Evidence digests. Runtime
configuration cannot replace those values.

### S3-P0 measurable outcome

`S3-P0` adds a Project-private `GitExecutionPort` with exactly one currently
implemented named operation: `verifyAdmittedImage`. Its production adapter:

1. inspects the exact OCI index and requires its image ID to equal that index;
2. invokes the immutable image with the fixed hardening vector and no network;
3. runs only the image entrypoint's `--version` probe and one fixed Node-based
   executable-hash probe;
4. requires zero exit status, no signal, bounded output, exact Git version and
   exact executable SHA-256;
5. returns a typed identity result or an owner-safe refusal code.

There is no caller-supplied executable, image, argv, shell, mount, environment,
network mode or credential surface. S3-P0 does not register the adapter at Hub
startup because no PRJ owner composition exists yet; S3-P1 must consume the
verified capability before any Project settlement can become disclosable.

### S3-P1 bounded subpacket

`S3-P1` is the current and only authorized mutation window. Its measurable
delivery outcome is a real PostgreSQL capability boundary that can reserve one
`PRJ-03` identity, distinguish replay from request conflict, persist the exact
Project record, establish only the direct creator grant, lock the receipt for
later recovery composition and terminalize it. The settlement path is exercised
only inside a transaction that is rolled back in this part: no source-complete
Project may become durably visible before S3-P2/P5 supplies and composes the
source operation.

The exact schema delta is:

```text
project.project
project.operation_idempotency
iam.account_project_grant
```

The exact application role is `hub_prj03_command`: `LOGIN`, `NOINHERIT`,
`NOSUPERUSER`, `NOBYPASSRLS`, no owner membership, no table DML, no `SET ROLE`,
and only schema `USAGE` plus `EXECUTE` on these five owner functions:

```text
project.reserve_or_replay_create_project
project.lock_create_project_receipt
project.create_project_with_source
iam.establish_project_creator_grant
project.complete_create_project_receipt
```

All functions are `SECURITY DEFINER`, owned by the exact `NOLOGIN` schema owner,
use static fully-qualified SQL with `search_path=pg_catalog, pg_temp`, and revoke
`PUBLIC` execution. The creator grant contains only `project.read` and
`project.manage`; no build, review, source or generic authority is inferred.
Project→Workspace and grant→Project are explicit `ON DELETE RESTRICT` Tier-2
foreign keys.

The mutation ceiling is exactly:

```text
apps/hub/migrations/003_project_foundation.sql             PLATFORM-CONTRACT / ADD
apps/hub/migrations/atlas.sum                              PLATFORM-CONTRACT / MODIFY
scripts/run-hub-migrations.mjs                             PLATFORM-CONTRACT / MODIFY
scripts/record-r1c14-native-readmission-receipt.mjs         PLATFORM-CONTRACT / MODIFY
tests/implementation/r1-s2-postgres.test.mjs               TEST / MODIFY
tests/implementation/r1-s3-postgres.test.mjs               TEST / ADD
package.json                                               PLATFORM-CONTRACT / MODIFY
```

The frozen prior digests for inherited paths are:

```text
apps/hub/migrations/001_iam_foundation.sql = d27e76b972145bc3a6bf669d4fd32734fc06153d07cddaf1072c6b29845b112f
apps/hub/migrations/002_workspace_foundation.sql = b64a8e041a8e63ac3b85559805ac5573a1d53f6d5d95ba1421ffe3f9803804b5
apps/hub/migrations/atlas.sum = 67384191b192e6119b4f415e1753c3156f088344e23d6ce5df77ea60b3a2f1f7
scripts/run-hub-migrations.mjs = 83b71b43df5fcd6087f87497925b6c53896e9daf29fd041a02975083782ce6a8
scripts/record-r1c14-native-readmission-receipt.mjs = 96fcb9019da6e053658f0530f80adeacc4bc942f7c59d81f6f20479742df2100
tests/implementation/r1-s2-postgres.test.mjs = 39adf0a30ce735f67d5623820a1a6d7939ba32c29c482f81b9b5890f540f6f8e
package.json = a9062ab373aaea4de8debeb3d9c7cb54dcfeb81bfc1350999f46867f9e831429
```

The deciding proof is: exact catalog and privilege census; reserve/replay/
conflict behavior; receipt lock ownership and concurrent exclusion; rollback at
each cross-owner boundary; rejection of direct DML, owner role assumption,
unlisted execution and `PUBLIC`; plus a final zero-durable-Project/grant/
terminal-receipt census. The existing migration runner must freeze migration
`002`, admit only exact `003`, and verify its live catalog on every restart.
Because that runner is inherited S2 Platform custody, the native receipt
finalizer records the exact `S3_P1_PROJECT_MIGRATION_CUSTODY` transition reason;
the closed native manifest, result, adjudication and published receipt bytes
remain unchanged.

Routes, UI, TypeScript command composition, source staging or settlement,
cleanup/abandonment claiming, later Git operations, Product/provider calls and
external input acquisition are not in S3-P1. In particular,
`project.claim_abandoned_create_project_attempt` remains owned by S3-P4, where
filesystem recovery semantics exist; introducing it here would be a dormant and
under-specified capability.

### S3-P1 closed result

The bounded code candidate now exists at exact digests:

```text
apps/hub/migrations/003_project_foundation.sql = 866c6da3d1a4171437b2c0a5beb72ff4994cfce499826cd8b397c2daa60037f2
apps/hub/migrations/atlas.sum = ea4e7a29357407dd996b2b56b1ad65101348df6faa1a7d5e80db6ad51e6e77fa
scripts/run-hub-migrations.mjs = 1077b0dda367c54c87cbb601324dcf6ed19f2659cc69d60ac08f868c8b379a8c
scripts/record-r1c14-native-readmission-receipt.mjs = b960d9bf62f0788498dff350d291b78eac5a9a556a01519f55a6d2971d4d9e76
tests/implementation/r1-s2-postgres.test.mjs = 530668f373ed36b9797d5e3e39ee45f7ed9050dced7077ccd241d247e59dfb83
tests/implementation/r1-s3-postgres.test.mjs = ddadd337dff27ad5b40a435042f7535ba29040c0119f5e092a83edbc1076bf19
package.json = 696a01c835066af6a422b20b576ddbcb98e66e30c1648485801c8ffa827e32c1
```

Static migration custody, Atlas validation, Node syntax, targeted Biome,
Hub typecheck, import law `26/26`, repository check, preflight, clean `npm ci`,
full `npm run verify` and the native-successor suite `31/31` pass. The native
suite initially fired on the two changed inherited S2 paths; adding only their
explicit S3 transition reasons restored the deciding proof without changing
the closed native manifest, result, adjudication or published receipt.

After explicit operator admission, the deciding proof ran in WSL against the
exact Linux/amd64 PostgreSQL manifest
`sha256:6e5a6518f9d2ff9e9f4cba2a5a87d8f41b0f067f6f92ac847c344351a6c8d923`
from `docker.io/library/postgres:17.10-bookworm`. The image ID equalled that
manifest, the server reported PostgreSQL `17.10`, the endpoint was loopback
only, and the database, role and credential were synthetic and ephemeral.

The first real run exposed a test-only falsifier: its deliberate replacement
function omitted the existing input parameter names, so PostgreSQL correctly
refused the replacement before migration custody could detect changed function
source. Naming the same five inputs corrected only that deciding-proof
mechanism; no migration or Product semantic changed. The repeated S3-P1 proof
then passed `1/1`, including exact catalog and privilege census, replay and
request conflict, reserved-ID conflict, receipt locking and concurrent
exclusion, every cross-owner rollback case, direct-authority rejection,
function-source tamper refusal, and the zero-durable-state census. The affected
S2 real PostgreSQL proof also passed `1/1` against the same exact input.

The dedicated result is recorded in
[`4f-r1-s3-p1-implementation-result.md`](4f-r1-s3-p1-implementation-result.md).
S3-P1 is `CLOSED PASS`; S3-P2 is the next bounded part. No route, UI, source
settlement, recovery claim, Product/provider call, external publication,
commit, push, PR or merge was introduced.

### S3-P2 bounded subpacket

`S3-P2` is the current and only authorized mutation window. Its measurable
delivery outcome is one NEW-mode owner-isolated bare repository whose initial
`refs/heads/main` points to one immutable commit containing exactly the admitted
generated/platform seed and no APP-owned path. The first expected-old-zero
update wins; a repeated update is a typed CAS loser and cannot move the ref.
This part creates no canonical Project directory, database settlement, route,
UI, cleanup, bundle, import/network or Product response.

The exact NEW seed is frozen from the closed S2 ownership manifest and receipt:

```text
runtime/r1/.conexus/s2-ownership-manifest.json = f3a132e9ab3ef6e682ebf25da73f0318e2a55b74c53557d1957241fe2b6d1242
runtime/r1/.conexus/s2-generation-receipt.json  = f505e67f1e31f2f94ab7268e31dee6882f5e0d58975b878f3e2ecbdb8aa487e7

GENERATED runtime/r1/generated/r1/operations.json = 6d86a8c7ffd04138c4ed051f99bc36a5dc06fe327848dde49b7ec0d505a436f7
GENERATED runtime/r1/generated/r1/operations.mjs  = e7c0f68c5e44b0062000bbdcd84d7d2d44d4ee407babd7d34a11433a3748e5bf
PLATFORM-CONTRACT runtime/r1/platform/r1/contract.json = bca5ab767f98e3260af9c3838693d5e238553a0875a80282617754d62f18dd9c
APP-OWNED path count = 0
```

A generator validates those manifest classes/digests and embeds only those
three exact bytes into a generated Hub projection. Production writes that
projection beneath a newly created, mode-`0700` attempt directory derived only
from validated UUID Project/attempt identities under one configured absolute
owner root. It refuses a missing/non-directory/symlink owner root, unsafe
identity, path escape, source byte mismatch, or an existing attempt containing
a symlink or non-repository/mismatched state. Exact same-attempt re-entry is
admitted only to classify the expected-old-zero CAS loser. The repository root
is never mounted.

The named `stageNewProjectSource` operation first reuses the closed P0 image
verification, then invokes one fixed Node orchestrator inside the exact admitted
image. That orchestrator uses only `/usr/local/bin/git` fixed vectors for bare
init, exact work-tree index/write-tree, deterministic commit creation,
expected-old-zero `update-ref` and ref/object/tree verification; it has no
caller input or shell surface. The container is no-network, capability-free,
no-new-privileges, read-only-root and bounded-tmpfs, runs as the owner process
UID:GID, and mounts only the exact attempt directory. No caller supplies
executable, image, argv, shell, mount, environment or ref. Git commit
identity/time inputs are fixed non-secret adapter constants, so identical seed
bytes yield one deterministic revision. The temporary work tree is removed
after the typed result is validated.

The mutation ceiling is exactly:

```text
apps/hub/src/generated/r1-new-project-seed.ts             GENERATED / ADD
apps/hub/src/project/git-execution.ts                     PLATFORM-CONTRACT / MODIFY
scripts/generate-r1-s3-new-project-seed.mjs               PLATFORM-CONTRACT / ADD
scripts/check-r1-s3-git-execution.mjs                     PLATFORM-CONTRACT / MODIFY
scripts/record-r1c14-native-readmission-receipt.mjs       PLATFORM-CONTRACT / MODIFY
tests/implementation/r1-s3-git-execution.test.mjs         TEST / MODIFY
package.json                                              PLATFORM-CONTRACT / MODIFY
```

The frozen inherited digests are:

```text
apps/hub/src/project/git-execution.ts = 4c455a800da2689f4cec8b00919ef6c32392f3d31abe2c75f4c9b0195d326efc
scripts/check-r1-s3-git-execution.mjs = 6383adc0570b677fb88ecf2b776c7a88c711aa60afafdba40fac8e5bc20a32ca
scripts/record-r1c14-native-readmission-receipt.mjs = b960d9bf62f0788498dff350d291b78eac5a9a556a01519f55a6d2971d4d9e76
tests/implementation/r1-s3-git-execution.test.mjs = fafa94ab09acee40d617bf326b54422d70f36f4bf3849beeb58353889a7036e5
package.json = 696a01c835066af6a422b20b576ddbcb98e66e30c1648485801c8ffa827e32c1
```

The deciding proof freezes the generated projection, port surface and Docker
vectors; fires RED controls for source/class/digest drift, nonempty APP set,
unsafe/symlink/mismatched/cross-root paths, arbitrary process surface and every
Git/process/verification failure; then runs the production adapter twice on a
fresh exact owner root against the real admitted image. The first result must
return `STAGED`, the second `CAS_CONFLICT`, the exact ref must remain unchanged,
and container-side `fsck`, `rev-parse` and `ls-tree` must prove the complete
three-file tree. No additional reviewer is justified unless implementation
changes a protected claim or this deciding-proof design materially.

### S3-P2 closed result

The bounded implementation closed at these exact output digests:

```text
apps/hub/src/generated/r1-new-project-seed.ts = 2183a8d86be9f3be4354d424166d4905000e82f38c6925ee01b39d068216621f
apps/hub/src/project/git-execution.ts = f6cd76ed266c2c4ee741d85f4e9f31c8b181812ac377a6d25cd4759c3dd962b2
scripts/generate-r1-s3-new-project-seed.mjs = 3d4c3f705dcc762289c154e0c855dc108824db66e453e42849e06b23ba0956f4
scripts/check-r1-s3-git-execution.mjs = a5fbf5ee9cb78bc5137361ebc3be3f657632f22a27b157044a91b68e6d7faddc
scripts/record-r1c14-native-readmission-receipt.mjs = 08849c55b9b85c483e82a7dadf3a799835439a18b2a32f5e43cdaf3d0443800a
tests/implementation/r1-s3-git-execution.test.mjs = 0b9e24567a2a6af44c7723c5c5805e997e93f11200410d26b06496772c2f870c
package.json = 9d961db435a6ce0d93fd50330611f0d1105cfefc7f7b2f0e691e12eb4329c21c
```

The generated NEW tree is exactly
`8d5c876574e525ab4b071107be5001040f30f64d`; its deterministic immutable
source revision is exactly `3445e593a344d1cdefd106e2808ea00aa5203ea1`.
Static proof passed `21/21` active tests with the two named live cases skipped;
the dedicated real S3-P2 case then passed `1/1` against OCI index
`sha256:5e5c3526292bb87a97a3fa41c8e715800a02da5238fbe07bf99c1c4b614f7851`.
It proved the exact three-file path/blob tree, empty APP set, expected-old-zero
winner and same-revision loser with no ref movement.

The first live run refused because the daemon's remapped container root could
not write the owner-UID WSL bind mount. Binding the fixed container user to the
owner process UID:GID corrected that physical ownership mismatch. Consolidating
the fixed Git calls into one no-shell Node orchestrator inside the same exact
image reduced Docker boundary latency and changed no named operation, mount,
network, credential, Product or source semantics. The strengthened repeated
proof bound the independently computed exact tree/revision and every blob
SHA-256. No protected claim was invalidated, so the frozen no-recursive-review
law did not justify another reviewer call.

The dedicated receipt-last result is
[`4f-r1-s3-p2-implementation-result.md`](4f-r1-s3-p2-implementation-result.md).
S3-P2 is `CLOSED PASS`; S3-P3 was next and remained unmaterialized at that
receipt. No route, UI,
Project settlement, EXISTING_GIT network/catalog/secret behavior, recovery,
bundle, external publication, commit, push, PR or merge was added.

### S3-P3 bounded subpacket

`S3-P3` is the current and only authorized mutation window. Its measurable
delivery outcome is one owner-isolated bare staging repository whose
`refs/heads/main` is created expected-old-zero from the exact server-resolved
default-ref OID of one catalog-admitted HTTPS repository. It exposes only the
named `stageExistingGitProjectSource` operation; no route, Product response,
canonical promotion, database settlement, recovery, cleanup or bundle exists.

The deployment-owned `GitImportAdmissionCatalog` is constructed once, deeply
validated and frozen before it can reach the executor. Every enabled entry
contains exactly: stable entry ID; canonical lowercase DNS host; HTTPS port;
canonical absolute path prefix; exact `refs/heads/*` default ref; TLS policy
(`SYSTEM` or one external CA-file slot); optional external credential-file
slot; one server-owned Docker network; timeout, fetched-byte and object-count
ceilings; and enabled state. Duplicate/overlapping entries refuse catalog
construction. Admission requires one exact entry and rejects userinfo,
password, query, fragment, non-HTTPS, IP literal, noncanonical encoding/path,
wrong port, outside-prefix destination or disabled entry before Docker/network
execution. Redirects remain wholly disabled, which is stricter than the
required cross-entry refusal.

The external slot resolver is deployment input, never Product/caller input.
Resolved credential and CA paths must be absolute, regular, non-symlink files;
the credential must be owner-only and contain exactly two nonempty UTF-8 lines
(`username`, `password`) with no additional line. The adapter copies those
bytes to a mode-`0400` attempt-local file, writes one fixed mode-`0500` Node
askpass adapter, mounts both files read-only, and removes both in `finally`.
Only non-secret paths enter Docker argv/environment. Credential bytes never
enter URL, argv, environment value, Git config, database, log, Evidence, typed
result or bundle.

Inside the exact admitted OCI index, one fixed Node orchestrator invokes only
`/usr/local/bin/git`. It uses a minimal constructed environment with system and
global config disabled, empty HOME/XDG, helpers cleared per command, prompts
off, HTTPS as the only protocol, no persistent remote and
`http.followRedirects=false`. It discovers `HEAD` with `ls-remote --symref`,
requires the catalog's exact default ref and one 40-hex OID, fetches that OID
without writing `FETCH_HEAD`, verifies commit/tree/fsck and the configured
ceilings, then creates `refs/heads/main` expected-old-zero. Re-entry may return
only a same-OID typed CAS conflict; no ref may move.

The mutation ceiling is exactly:

```text
apps/hub/src/project/git-import-admission.ts              PLATFORM-CONTRACT / ADD
apps/hub/src/project/git-execution.ts                     PLATFORM-CONTRACT / MODIFY
scripts/check-r1-s3-git-execution.mjs                     PLATFORM-CONTRACT / MODIFY
scripts/record-r1c14-native-readmission-receipt.mjs       PLATFORM-CONTRACT / MODIFY
tests/fixtures/r1-s3-git-import-https-fixture.mjs         TEST / ADD
tests/implementation/r1-s3-git-execution.test.mjs         TEST / MODIFY
package.json                                              PLATFORM-CONTRACT / MODIFY
```

The frozen inherited digests are:

```text
apps/hub/src/project/git-execution.ts = f6cd76ed266c2c4ee741d85f4e9f31c8b181812ac377a6d25cd4759c3dd962b2
scripts/check-r1-s3-git-execution.mjs = a5fbf5ee9cb78bc5137361ebc3be3f657632f22a27b157044a91b68e6d7faddc
scripts/record-r1c14-native-readmission-receipt.mjs = 08849c55b9b85c483e82a7dadf3a799835439a18b2a32f5e43cdaf3d0443800a
tests/implementation/r1-s3-git-execution.test.mjs = 0b9e24567a2a6af44c7723c5c5805e997e93f11200410d26b06496772c2f870c
package.json = 9d961db435a6ce0d93fd50330611f0d1105cfefc7f7b2f0e691e12eb4329c21c
```

The deciding proof freezes the catalog/port/process surfaces; fires refusal
for malformed or ambiguous catalog entries, every forbidden locator class,
disabled/unknown/missing slots, unsafe secret/CA files, image/process/discovery/
default-ref/fetch/object/ceiling/CAS/result failures, ambient config/helper and
credential leakage; then runs one synthetic, isolated HTTPS canary on a fresh
Docker network against the real admitted image. The canary must prove exact
HEAD/OID import, no redirect follow, no ambient helper, credential-file use,
same-OID CAS loser, unchanged ref, and zero secret occurrence outside the
temporary secret input. No external provider, real credential or external
publication is authorized. No additional reviewer is justified unless a
correction changes a protected claim or deciding-proof reliability.

### S3-P3 closed result

The bounded implementation closed at these exact output digests:

```text
apps/hub/src/project/git-import-admission.ts = 8963c9bc518b723fc474340db11a64f2f82fcd2c1bf9ee8739277bd11eba0185
apps/hub/src/project/git-execution.ts = 62b1f4aaa60abac16874077acf3d859613cc71596f7e6b6d5a8bbbeadd74e18f
scripts/check-r1-s3-git-execution.mjs = 030fb268ef42538593d44a09c1924c750ff7ea307ae5e057aa6003c104490fa1
scripts/record-r1c14-native-readmission-receipt.mjs = 08849c55b9b85c483e82a7dadf3a799835439a18b2a32f5e43cdaf3d0443800a
tests/fixtures/r1-s3-git-import-https-fixture.mjs = ee3f7f59cdb727f25f8e445228acd40ce40dd411c6d6a615d6b2a2ab6db7ac4c
tests/implementation/r1-s3-git-execution.test.mjs = 7f2fbfe70f1857dbb9627e0b8a8bade68c125f16cddbe16ac7a064b881fd55f3
package.json = 74ae7c5363dd50bd2e3481f1dec56d7b1abafe13a00e2375bc3f94ac41c5ff40
```

Static production/harness proof passed `24/24` active tests with three named
live cases skipped. The dedicated isolated S3-P3 canary then passed `1/1`
against the exact admitted OCI index. Its deterministic default-ref/source OID
was `1bc328d363b387d9be353e47d516ffcc79983a69`, with exactly three reachable
objects and 231 reachable bytes. The second expected-old-zero update returned
the same-OID CAS loser; the redirect target was never requested; the controlled
credential was observed only as authorization by the fixture and its bytes
occurred nowhere outside the external input file after cleanup.

The first canary attempt fired the 10-second catalog timeout under abnormal
local daemon latency. Raising only the synthetic canary entry to the already
frozen maximum 60-second ceiling preserved production law and proved the
timeout control. The fixture initially could not read the owner-only input
under daemon user remapping; running it with the owner UID:GID corrected only
the test boundary. Fixed synthetic commit dates made the deciding OID
reproducible. None changed a protected claim or proof reliability, so no new
review round was justified.

The dedicated receipt-last result is
[`4f-r1-s3-p3-implementation-result.md`](4f-r1-s3-p3-implementation-result.md).
S3-P3 is `CLOSED PASS`; S3-P4 was subsequently materialized below. No route, UI,
Project settlement, promotion/recovery/cleanup/bundle, Product/provider call,
external publication, commit, push, PR or merge was added.

### S3-P4 bounded subpacket

`S3-P4` is split only at its real proof dependency; the protected outcome and
completion gate remain one. `P4-A` is the current mutation window and closes
exact-image filesystem promotion, adoption/quarantine classification and
same-ID bundle mechanics. `P4-B` adds the receipt-locked abandoned-attempt claim
and composes it with cleanup. S3-P4 cannot close until both pass together.

The observable invariant is: a verified staged bare repository becomes the one
canonical `projects/<projectId>` repository by same-filesystem atomic rename;
re-entry adopts only an exact same-ID/same-revision repository, mismatch moves
only the implicated uncommitted candidate to an owner-local quarantine and
refuses, and no cleanup can touch a committed Project or terminal receipt. A
verified complete bundle restores only the same Project ID and exact source
revision into an empty isolated target before atomic adoption.

The named Git custody surface adds only:

```text
promoteStagedProjectSource
createProjectSourceBundle
restoreProjectSourceBundle
```

All three reuse first-use OCI verification and fixed no-network Node/Git
orchestrators. Promotion validates UUIDs, exact owner paths, non-symlink
directories, `refs/heads/main`, commit/tree and strict fsck before rename.
Canonical-exists re-entry returns `ADOPTED` only for the expected revision;
otherwise the staged candidate, never the canonical repository, is atomically
renamed beneath `quarantine/<projectId>/<attemptId>` and the operation refuses.
Bundle creation writes to an owner-local temporary path, verifies it inside the
exact image, then renames it to `bundles/<projectId>/<sourceRevision>.bundle`.
Restore clones into a fresh staging attempt, verifies exact ref/object/tree and
promotes through the same named path. Corrupt, wrong-ID, wrong-revision,
symlink, existing-target or partial output refuses without canonical mutation.

`P4-B` adds only the named
`project.claim_abandoned_create_project_attempt` capability through immutable
migrations `004` and `005`. The exact overload uses `FOR UPDATE`; the scan
overload locks the oldest at most `16` eligible receipts with `FOR UPDATE SKIP
LOCKED`. Both require `RESERVED`, expiry, no Project row and no terminal
response, delete only inside the caller transaction and return exact receipt
and Project identity. The Project-owned recovery adapter removes only that
claimed identity's `staging`, `quarantine`, `bundles` and canonical `projects`
candidates. A cleanup refusal rolls the claim transaction back and blocks
intake. No scheduler/background task exists.

The frozen crash matrix is exactly:

| Crash | P4 behavior |
| --- | --- |
| receipt before source | same-key retry rebuilds staging |
| staging before promotion | exact bytes resume; corrupt candidate quarantines/refuses |
| promotion before settlement | receipt-locked retry adopts exact canonical revision |
| mismatched canonical/candidate | canonical preserved; candidate quarantined; refuse |
| bundle temp/write/verify | no published bundle; retry rebuilds |
| restore before verification | isolated target removed/refused |
| cleanup after claim | transaction rollback keeps receipt recoverable |
| Project/terminal receipt exists | cleanup claim refuses; canonical never eligible |

`P4-A` mutation ceiling:

```text
apps/hub/src/project/git-execution.ts                     PLATFORM-CONTRACT / MODIFY
scripts/check-r1-s3-git-execution.mjs                     PLATFORM-CONTRACT / MODIFY
scripts/record-r1c14-native-readmission-receipt.mjs       PLATFORM-CONTRACT / MODIFY
tests/implementation/r1-s3-git-execution.test.mjs         TEST / MODIFY
package.json                                              PLATFORM-CONTRACT / MODIFY
```

Frozen inherited digests:

```text
apps/hub/src/project/git-execution.ts = 62b1f4aaa60abac16874077acf3d859613cc71596f7e6b6d5a8bbbeadd74e18f
scripts/check-r1-s3-git-execution.mjs = 030fb268ef42538593d44a09c1924c750ff7ea307ae5e057aa6003c104490fa1
scripts/record-r1c14-native-readmission-receipt.mjs = 08849c55b9b85c483e82a7dadf3a799835439a18b2a32f5e43cdaf3d0443800a
tests/implementation/r1-s3-git-execution.test.mjs = 7f2fbfe70f1857dbb9627e0b8a8bade68c125f16cddbe16ac7a064b881fd55f3
package.json = 74ae7c5363dd50bd2e3481f1dec56d7b1abafe13a00e2375bc3f94ac41c5ff40
```

`P4-B` additionally owns immutable migrations `004` and `005`, Atlas/migration
custody, the migration runner, the Project recovery adapter, S3 PostgreSQL and
filesystem proof, and package wiring. Its real PostgreSQL proof was initially
`STOP / SPLIT PREREQUISITE` because the exact manifest was absent locally. The
operator authorized reacquisition of only that digest, removing the
prerequisite without widening custody.

P4-A completion requires static RED controls plus real exact-image NEW and
EXISTING_GIT promotion, exact re-adoption, mismatch quarantine, bundle create/
verify and isolated same-ID restore, including corrupt-bundle refusal and zero
canonical movement. No additional reviewer is justified unless a correction
changes the protected property or deciding-proof reliability.

### S3-P4-A closed result

P4-A is `CLOSED PASS`. Its deterministic RED matrix passes `4/4`; the complete
targeted suite passes `29/29` active tests; Hub typecheck and targeted Biome
pass. Direct WSL canaries pass for NEW and EXISTING_GIT against the exact
admitted OCI index, including corrupt-bundle same-attempt recovery, exact
re-adoption, mismatch quarantine with canonical preservation, secret-file
non-disclosure and exact OID
`1bc328d363b387d9be353e47d516ffcc79983a69`.

The material scratch-reentry correction survived one fresh isolated Claude
Code Fable + AGY Gemini closure round. Both lanes returned CLEAR; the Lead
corrected only the missing deterministic RED matrix and deferred six valid
non-blocking integration/recovery observations to their named P4-B/P5 triggers.
Clean `npm ci` and full `npm run verify` pass after the final implementation
bytes. The dedicated receipt-last result and adjudication is
[`4f-r1-s3-p4a-implementation-result.md`](4f-r1-s3-p4a-implementation-result.md).

### S3-P4-B closed result

After exact operator authorization, the Linux/amd64 PostgreSQL 17.10 manifest
`sha256:6e5a6518f9d2ff9e9f4cba2a5a87d8f41b0f067f6f92ac847c344351a6c8d923`
was reacquired by digest and verified without tag substitution. The first
database-only pass was reopened after P5 packet materialization exposed missing
production oldest-16 discovery and canonical cleanup. Migration `005` and the
Project recovery adapter close those two false-PASS routes.

The first fresh Fable+AGY challenge then exposed UUID-law drift: staging admits
versions `1..8`, while recovery admitted only `1..5`. The bounded correction
establishes exact parity; filesystem proof cleans v8 and refuses v9, and the
real composed PostgreSQL proof claims and cleans a v8 Project. One final fresh
isolated confirmation returned Fable `CLEAR / NO MATERIAL BLOCKER` and AGY
`CLEAR`. Lead adjudication defers only five caller/composition obligations to
P5: centralize identity law before a third consumer, mint/validate the candidate
before reservation, bind cleanup to a successful open claim, prove scan
concurrency, and own an expiry cutoff safe for the admitted staging duration.

P4-A regression, Hub typecheck, Biome, import law, native successor, clean
`npm ci` and Linux final verification pass after final bytes. The receipt-last
result and full adjudication is
[`4f-r1-s3-p4b-implementation-result.md`](4f-r1-s3-p4b-implementation-result.md).
P4-A and P4-B jointly close `S3-P4`; P5 Product bytes remain blocked until its
bounded packet is materialized below.

### S3-P5 bounded subpacket

`S3-P5` is now the current and only authorized mutation window. Its first and
complete sustainable vertical outcome is the generated `PRJ-03 CreateProject`
HTTP command: one authenticated caller with current `project.create` authority
in the exact Workspace can establish either a `NEW` or one catalog-admitted
`EXISTING_GIT` Project, and receives a `201` representation only after the
canonical source, Project row, direct creator grant and terminal idempotency
receipt agree. No partial Project is disclosed. The same successful key replays
the exact stored representation; request conflict, authorization loss, Git
refusal, canonical conflict, settlement failure and recovery refusal fail
closed without inventing success.

The route is generated only from `PRJ-03` in the accepted Product OpenAPI and
the exact G0 operation projection. It admits the accepted body
`{name, sourceBootstrap}` and exact Workspace path/idempotency carrier. Fastify
schema validation owns malformed body/path/header refusal. The owner route owns
same-origin CSRF, current opaque session, exact idempotency-key presence and
problem mapping. It does not expose a generic Project, Git, network, filesystem
or database surface, and it does not add the P6 reads/client/UI.

Before any receipt reservation or Git effect, the server mints a version `1..8`
Project UUID and validates it through one shared Project identity law. Immutable
migration `006` adds one `iam_owner` `SECURITY DEFINER` predicate over the exact
`iam.workspace_membership(account_id, workspace_id, can_create_project)` fact
and replaces only the existing Project reservation/lock bodies so current
authorization is checked both before reservation/replay and again at settlement
lock. `project_owner` alone receives execute on that internal predicate;
`hub_prj03_command` receives no new callable I&A or table authority. Missing or
false membership raises one non-disclosing authorization refusal. Existing
migrations `001..005` remain byte-frozen.

The owner composition is exactly:

```text
pre-intake recover oldest <=16 receipts created at or before server-now - 1 hour
→ one command-role transaction claims rows with FOR UPDATE SKIP LOCKED
→ cleanup only the identities returned by that still-open transaction
→ commit all claims only after every cleanup succeeds; otherwise rollback all
→ mint and shared-law validate projectId + attemptId + opaque projectRevision
→ reserve/replay under current project.create; commit reservation before Git
→ replay: validate the exact stored 201 body and return it without Git
→ RESERVED: stage NEW or catalog-admitted EXISTING_GIT through the named port
→ require STAGED or same-revision CAS re-entry, then promote/adopt canonical
→ begin settlement; lock exact receipt and recheck current project.create
→ require RESERVED plus exact canonical source identity
→ create Project + creator project.read/manage grant + terminal receipt
→ commit once; only then return the exact stored 201 representation
```

The one-hour abandonment age is server-owned and caller-inaccessible. It is ten
times the six fixed 60-second process ceilings on the longest admitted
verify/stage/promotion re-entry path, leaving no valid in-envelope staging
attempt eligible for recovery. This part adds no scheduler. Recovery runs once
before each admitted intake and a recovery refusal blocks that intake. The
Project store owns claim and cleanup in one method and returns only a count; no
route or general caller can construct a claimed identity or call cleanup
independently. The scan proof must hold one settlement receipt lock while two
scanners compete, demonstrate `SKIP LOCKED`, prove at-most-16 oldest order, and
show rollback preserves every receipt when any filesystem cleanup refuses.

`NEW` uses the accepted generated seed. `EXISTING_GIT` uses only one deeply
validated deployment catalog and external file-slot map constructed at startup;
Product input supplies only the untrusted locator. Project enablement is
all-or-nothing configuration: absolute pre-existing owner storage root, command
role password file, nonempty valid catalog and any referenced credential/CA
slots. Secret values remain file-only and are never placed in configuration
objects, URLs, argv, environment values, database rows, responses, logs or
Evidence. No real provider, external credential or external repository is
authorized; the deciding network proof remains synthetic and isolated.

The bounded mutation ceiling is:

```text
apps/hub/migrations/006_project_create_authorization.sql   PLATFORM-CONTRACT / ADD
apps/hub/migrations/atlas.sum                              PLATFORM-CONTRACT / MODIFY
scripts/run-hub-migrations.mjs                             PLATFORM-CONTRACT / MODIFY
scripts/generate-r1-s3-contracts.mjs                       PLATFORM-CONTRACT / ADD
apps/hub/src/generated/s3-routes.ts                        GENERATED / ADD
apps/hub/src/project/identity.ts                           PLATFORM-CONTRACT / ADD
apps/hub/src/project/git-execution.ts                      PLATFORM-CONTRACT / MODIFY
apps/hub/src/project/source-recovery.ts                    PLATFORM-CONTRACT / MODIFY
apps/hub/src/project/errors.ts                             PLATFORM-CONTRACT / ADD
apps/hub/src/project/store.ts                              PLATFORM-CONTRACT / ADD
apps/hub/src/project/routes.ts                             PLATFORM-CONTRACT / ADD
apps/hub/src/project/module.ts                             PLATFORM-CONTRACT / ADD
apps/hub/src/platform/config.ts                            PLATFORM-CONTRACT / MODIFY
apps/hub/src/server.ts                                     PLATFORM-CONTRACT / MODIFY
scripts/check-import-law.mjs                               PLATFORM-CONTRACT / MODIFY
scripts/record-r1c14-native-readmission-receipt.mjs        PLATFORM-CONTRACT / MODIFY
tests/implementation/r1-s3-project-command.test.mjs        PLATFORM-CONTRACT / ADD
tests/implementation/r1-s3-postgres.test.mjs               PLATFORM-CONTRACT / MODIFY
tests/implementation/r1-s3-git-execution.test.mjs          PLATFORM-CONTRACT / MODIFY
tests/implementation/r1-s3-source-recovery.test.mjs        PLATFORM-CONTRACT / MODIFY
package.json                                               PLATFORM-CONTRACT / MODIFY
```

`identity.ts` is the sole Project/attempt UUID validator used by Git execution,
recovery and command composition. The store exposes named PRJ-03 operations
only; canonical request/response digests use the accepted canonical-JSON
package, and replay rejects extra/missing/wrong fields, identity mismatch or a
non-201 receipt as outcome unknown. An uncommitted canonical source is never a
Product success: settlement failure leaves the honest reserved/canonical state
for same-key adoption or bounded recovery. A terminal receipt or committed
Project can never be claimed or cleaned.

The proportional RED/deciding proof is frozen to: exact generated route and G0
census; malformed/authentication/CSRF/idempotency/authorization refusal before
Git; version `1..8` acceptance and v9 refusal at all three consumers; exact
migration/catalog/function-source/privilege census; authorization before reserve
and recheck after revocation; NEW and synthetic admitted EXISTING_GIT HTTP 201;
same-key exact replay; different-request conflict; every Git/promotion/
settlement failure with zero false `201`; concurrent same-key/canonical
re-entry; concurrent recovery/settlement exclusion; cleanup rollback; and zero
secret disclosure. P4-A, P4-B, import law, Hub typecheck and the native successor
remain targeted regressions. A clean `npm ci` plus Linux `npm run verify` is due
only at receipt-last closure after targeted proof passes.

Completion requires the exact route, both source modes, real PostgreSQL plus
exact-image Git composition and all frozen negatives to pass together. P6,
cognition/R1C-13, Product/provider calls, generic Git/argv/shell access,
external publication, production catalog/input custody, local commit, push, PR
and merge remain blocked. No additional reviewer call is justified unless a
material correction invalidates one protected property or its deciding proof.

#### S3-P5 frozen closure candidate

The bounded implementation is complete and frozen for one final independent
closure round. The route projection is exactly one operation (`PRJ-03`), with
Product OpenAPI digest
`67d141e946e933c8a031d456f9d51ed44389053e5b2c50979b10c927dae07cd3`
and generated projection digest
`e7cc1522e555301eccef94d39c354fc875fa4238c87dcec64741cc1bbaa52c7d`.
The immutable migration `006` digest is
`e8db0346c822bc38543d3e18d71862c4be186165709fc032ed1b110260ef32d4`.

The final isolated deciding proof passed for both `NEW` and admitted
`EXISTING_GIT`: `1/1` over real PostgreSQL 17.10 and the exact immutable Git
OCI index, with two Project rows, two creator grants, two terminal receipts,
exact replay and all containers/networks removed. The structural/behavioral P5
suite passes `8/8` with the live canary intentionally skipped; P4-A passes
`29/29` active with four unchanged live canaries skipped; P4-B passes `2/2`;
the import law passes `26/26`; Hub typecheck and targeted Biome pass, retaining
only the pre-existing `server.ts` non-null warning. A clean `npm ci` added 191,
audited 192 with zero vulnerabilities, and `npm run verify` passed. The native
successor passes manifest `17/17` and suite `31/31`; its receipt generator now
declares the exact S3-P5 transitions for configuration, composition and import
boundary without changing historical result bytes.

One fresh Fable plus AGY round is now justified because P4 corrections changed
the deciding-proof reliability inherited by P5 and this is the P5 stage-gate
closure. The candidate, protected-claim census and blocker census are frozen;
no recursive review follows unless adjudication accepts a material correction
that invalidates a protected property or its deciding proof. Valid non-blocking
recovery/framework observations are `DEFER SAFELY`.

The frozen candidate survived both independent lanes with no material blocker.
Lead adjudication is `CLEAR`, the three local observations are `DEFER SAFELY`,
and the receipt-last result is recorded in
[`4f-r1-s3-p5-implementation-result.md`](4f-r1-s3-p5-implementation-result.md).
S3-P5 is `CLOSED PASS`; the bounded subpacket below is the sole route by which
S3-P6 Product bytes can become authorized.

### S3-P6 bounded subpacket

`S3-P6` is now the current and only authorized mutation window. Its first and
complete sustainable vertical outcome is the generated `PRJ-01 ListProjects`
plus `PRJ-02 GetProject` disclosure path and the locked W-01 create/browse
browser subset: an authenticated current Workspace member with a direct current
`project.read` grant can browse only admitted Project summaries, filter that
already-disclosed result locally, open one exact Project through a fresh
server-side authorization check, and create a source-complete `NEW` or
catalog-admitted `EXISTING_GIT` Project through the closed P5 `PRJ-03` command.
The alternate accepted `workspace.access.manage` summary route remains Product
authority but is not realized or simulated in R1; it requires later IAM owner
work. No hidden or disabled browser control is authorization.

The exact generated transport projection is three operations from the accepted
Product OpenAPI and G0 operation census:

```text
PRJ-01 GET  /api/control/workspaces/{workspaceId}/projects
PRJ-02 GET  /api/control/projects/{projectId}
PRJ-03 POST /api/control/workspaces/{workspaceId}/projects
```

`PRJ-01` returns only exact `ProjectSummary[]` values
`{projectId, workspaceId, name, archived}`. `PRJ-02` returns only exact
`ProjectRepresentation` values
`{projectId, workspaceId, name, projectRevision, archived}`. The generator owns
both Fastify schemas/types and the same-origin browser client; no handwritten
parallel Product DTO, copied Problem enum, BFF or generic repository API is
admitted. Existing P5 request, response and idempotency semantics remain byte-
compatible.

Immutable migration `007` adds the least-privileged `hub_s3_read` login role and
owner-local read functions. IAM authority returns only Project identities in
the exact requested Workspace for which the authenticated account has current
Workspace membership and a direct current `can_read` Project grant. The
Project owner accepts only that admitted identity set and returns the exact
summary fields; exact-detail disclosure repeats current membership plus direct
grant admission before returning one representation. The read role receives
execute only on the named owner functions and no table, sequence, mutation,
IAM-management or P5 command authority. List and detail composition run in
read-only transactions. Empty admission is an honest `200 []`; absent,
undisclosed and unauthorized exact Projects do not become an existence oracle.

The browser flow is exactly:

```text
current Workspace context → Projects heading + Create Project
→ PRJ-01 honest loading/empty/error/result state
→ name + active/archive EPHEMERAL_UI filters over disclosed summaries only
→ simple responsive cards with an explicit keyboard-operable Open action
→ PRJ-02 fresh authorized detail disclosure

Create Project → labeled name + NEW/EXISTING_GIT semantic source control
→ conditionally labeled repository locator for EXISTING_GIT
→ PRJ-03 with a client-minted opaque idempotency key
→ exact 201 navigates to PRJ-02 detail; every failure remains on create/recovery
```

Client state is limited to `SERVER` (TanStack Query disclosures/mutations),
`URL_NAVIGATION` (Workspace/Project identities and routes), `FORM_DRAFT` (name,
source choice and conditional locator) and `EPHEMERAL_UI` (local filters). No
universal business store or reusable Product abstraction is introduced. The
existing app shell may expose only the bounded Workspace/Projects context and
navigation required for this outcome; W-01's complete adaptive scope rail,
global visual hardening, Inception/Baseline flows and final visual-design
selection remain S5 or later work.

The bounded mutation ceiling is:

```text
apps/hub/migrations/007_project_read_disclosure.sql         PLATFORM-CONTRACT / ADD
apps/hub/migrations/atlas.sum                               PLATFORM-CONTRACT / MODIFY
scripts/run-hub-migrations.mjs                              PLATFORM-CONTRACT / MODIFY
scripts/generate-r1-s3-contracts.mjs                        GENERATED-BOUNDARY / MODIFY
apps/hub/src/generated/s3-routes.ts                         GENERATED / MODIFY
apps/web/src/generated/project-client.ts                    GENERATED / ADD
apps/hub/src/project/store.ts                               PLATFORM-CONTRACT / MODIFY
apps/hub/src/project/routes.ts                              PLATFORM-CONTRACT / MODIFY
apps/hub/src/project/module.ts                              PLATFORM-CONTRACT / MODIFY
apps/hub/src/platform/config.ts                             PLATFORM-CONTRACT / MODIFY
apps/hub/src/server.ts                                      PLATFORM-CONTRACT / MODIFY
apps/web/src/app/router.tsx                                 GENERATED-UI / MODIFY
apps/web/src/app/shell.tsx                                  GENERATED-UI / MODIFY
apps/web/src/routes/index.tsx                               GENERATED-UI / MODIFY
apps/web/src/routes/workspace-projects.tsx                  GENERATED-UI / ADD
apps/web/src/routes/workspace-project-new.tsx               GENERATED-UI / ADD
apps/web/src/routes/project-detail.tsx                      GENERATED-UI / ADD
apps/web/src/features/project/api.ts                        GENERATED-UI / ADD
apps/web/src/features/project/components/project-list.tsx   GENERATED-UI / ADD
apps/web/src/features/project/components/project-create-form.tsx GENERATED-UI / ADD
apps/web/src/features/project/components/project-detail.tsx GENERATED-UI / ADD
apps/web/src/styles.css                                     GENERATED-UI / MODIFY
scripts/check-import-law.mjs                               PLATFORM-CONTRACT / MODIFY only if exact new boundary requires it
scripts/record-r1c14-native-readmission-receipt.mjs        PLATFORM-CONTRACT / MODIFY only for an inherited-path transition
tests/implementation/r1-s3-project-disclosure.test.mjs     PLATFORM-CONTRACT / ADD
tests/implementation/r1-s3-postgres.test.mjs               PLATFORM-CONTRACT / MODIFY
tests/implementation/r1-s3-project-command.test.mjs         PLATFORM-CONTRACT / MODIFY only for expanded generated census and migration-tail expectations
tests/implementation/r1-s3-project-browser.test.mjs        GENERATED-UI / ADD
package.json                                               PLATFORM-CONTRACT / MODIFY only for exact test-script registration
```

No other Product path is writable under this packet. A listed conditional file
is touched only if the named condition becomes true; otherwise it stays frozen.
Route filename spelling may follow the existing TanStack Router owner, but the
three Product paths, state classes and disclosed fields above may not drift.

The proportional RED and deciding matrix is frozen to:

- generated census/digest and exact PRJ-01/02/03 request/response projection;
- real PostgreSQL privilege census proving read-role execute-only access,
  current membership plus direct `project.read`, cross-Workspace refusal,
  revocation before re-read, exact list/detail fields, honest empty list and
  non-oracular detail refusal;
- HTTP authentication, malformed identity, `401`, non-disclosing `403`/`404`,
  dependency/transport failure and successful empty/result/detail separation;
- browser loading, known empty, populated, authentication, authorization,
  not-found, validation/conflict and dependency-failure states without false
  success or fabricated metadata;
- local name/archive filters that cannot widen disclosure; explicit Open with a
  PRJ-02 recheck; NEW and EXISTING_GIT create drafts; conditional locator;
  double-submit/idempotency behavior; exact `201` navigation and failure staying
  on the recovery path;
- Chromium keyboard/focus/name/role proof and wide/narrow screenshots: cards
  reflow to one column without horizontal-scroll dependence, controls remain
  labeled, reading/action order is preserved and no state is color-only;
- P5, import-law, Hub/Web typecheck and native-successor targeted regressions.

The proof ceiling is local and synthetic: static/generated checks, isolated real
PostgreSQL/HTTP composition, and real Chromium against the local Hub/Web app
using only packet-owned fixtures and the already admitted synthetic P5 source
configuration. It authorizes no live Product/provider/model call, external
repository, credential, publication, production catalog/input or final visual
design claim. A clean `npm ci` plus Linux `npm run verify` is due receipt-last
after targeted proof passes, not between individual RED/GREEN steps.

Completion requires every frozen positive and negative to pass together and a
receipt-last P6 result. Stop and reopen the smallest owner for any Product-field,
authority, trust-boundary, database-role, responsive-contract or false-PASS
contradiction. Cognition/R1C-13, alternate access-admin realization, generic
Git/argv/shell access, provider calls, production/external custody, Inception,
Baseline, final shell/visual completion, local commit, push, PR and merge remain
blocked. Independent review is not called unless a material correction changes
a protected property or its deciding proof.

#### S3-P6 receipt-last closure

The bounded implementation and deciding proof pass together. Generated
PRJ-01/02/03 disclosure, execute-only Project reads, current membership plus
direct `project.read`, source-complete creation, honest browser states and
wide/narrow Chromium proof are recorded in
[`4f-r1-s3-p6-implementation-result.md`](4f-r1-s3-p6-implementation-result.md).
The live NEW/EXISTING_GIT path retained the exact Git OCI identity and all
fixtures were removed. Clean dependency installation, repository verification,
import law, full Product wire verification and native-successor regression pass
after final Product bytes. No material correction triggered another independent
review round. S3-P6 and S3 are `CLOSED PASS`; S4 remains packet-gated.

## Falsifiers and stop law

Stop before Product bytes if any of these is true:

- the exact OCI index is absent or resolves to a different identity;
- any path can invoke host Git or substitute a tag/platform manifest;
- the executor admits arbitrary argv, shell interpolation or cross-Project
  mounts;
- EXISTING_GIT can access a destination before exact catalog admission or
  follow a redirect;
- a credential can enter URL/argv/env/config/log/Evidence/bundle;
- real WSL proof requires external OCI publication, a provider credential or a
  production effect not currently authorized.

This packet selects physical consumption and the full bounded S3 sequence. It
changes no Product operation, Permission, owner, schema meaning or accepted 4F
recovery semantics. Product/provider calls, cognition/R1C-13, external OCI/input
custody, commit, push, PR and merge remain blocked.
