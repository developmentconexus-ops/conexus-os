# 4F(R1) S3-P3 — EXISTING_GIT admission implementation result

> **Status:** `CLOSED PASS`
> **Authority:** bounded S3-P3 subpacket in
> [`4f-r1-s3-git-execution-binding-candidate.md`](4f-r1-s3-git-execution-binding-candidate.md)
> **Product operation delta:** `0`
> **Successor:** `S3-P4 NEXT / UNMATERIALIZED`

## Delivered outcome

The Project-private Git executor now exposes one additional named operation,
`stageExistingGitProjectSource`. A constructed, deeply frozen deployment
`GitImportAdmissionCatalog` admits exactly one canonical HTTPS destination,
default ref, TLS/credential slots, network and ceilings before any networked
container starts. The exact admitted OCI index remains the only Git process;
there is no host Git, mutable tag, arbitrary argv/shell or generic repository
surface.

The operation resolves the admitted default ref to one OID, fetches and verifies
its complete reachable object set in an owner-isolated bare staging repository,
enforces byte/object/time ceilings and creates `refs/heads/main` with
expected-old zero. System/global Git config, helpers, prompts, persistent remotes
and redirects are disabled. An optional owner-only external credential slot is
copied to a temporary mode-`0400` file, consumed by one fixed askpass adapter,
mounted read-only and removed in `finally`; only non-secret paths enter process
argv/environment.

## Deciding Evidence

- targeted static/typed suite: `24/24 PASS`, three named live cases skipped;
- exact-image isolated HTTPS canary: `1/1 PASS`;
- OCI index:
  `sha256:5e5c3526292bb87a97a3fa41c8e715800a02da5238fbe07bf99c1c4b614f7851`;
- deterministic imported source revision:
  `1bc328d363b387d9be353e47d516ffcc79983a69`;
- reachable census: `3` objects / `231` bytes;
- repeat result: same-OID `CAS_CONFLICT`, ref unchanged;
- redirect target request count: `0`;
- synthetic credential occurrence after cleanup: only the external input file;
- native R1C-14 regression: `31/31 PASS`;
- repository check and Conexus preflight: `PASS`.

The final required `npm ci` and `npm run verify` ran after the implementation,
receipt body and roadmap routing were finalized.

## Corrections and proportionality

The canary first proved its 10-second timeout under local daemon latency. Its
catalog entry moved only to the already-admitted 60-second maximum. The fixture
then adopted the owner UID:GID required by daemon user remapping, and fixed
synthetic commit dates made the OID reproducible. These are proof-harness
corrections; no protected property, Product meaning or deciding-proof design
changed. Engineering Method 1.1 therefore did not justify another reviewer
round.

## Final verification

`npm ci` installed 191 packages, audited 192 packages and reported zero
vulnerabilities. The complete `npm run verify` floor passed. Its accepted
Redocly warnings were unchanged and non-blocking. Repository check and final
Conexus preflight are repeated after recording this verdict.

## Non-goals preserved

No PRJ route/UI, canonical promotion, database settlement, recovery, cleanup,
bundle, Product/provider call, external OCI/input custody decision, commit,
push, PR or merge is included. Historical R1C-14 Evidence remains unchanged.
