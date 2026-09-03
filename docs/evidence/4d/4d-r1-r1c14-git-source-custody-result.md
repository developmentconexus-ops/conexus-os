# 4D(R1) — R1C-14 Git source-custody result

> **Status:** `CLOSED / PASS / INDEPENDENT CONVERGENCE CLEAR`
> **Boundary:** qualification gate only; no S3 Product implementation
> **Observed:** `2026-08-31`

## Admitted result

The mandatory pre-S3 `R1C-14 GIT_SOURCE_CUSTODY` gate passes. The deciding
Linux/amd64 image builds Git `2.55.0` from the exact kernel.org release archive,
after archive checksum, detached-signature and signing-key fingerprint checks.
The OCI index, Linux manifest, build metadata, complete rootfs layer list,
dependency closure and installed executable are externally pinned by the
runner; no VCS revision is claimed for the uncommitted qualification pack.

The isolated harness proves both `NEW` and `EXISTING_GIT`, complete immutable
commit trees, Project-local bare custody, expected-old-zero CAS with one winner
and one classified loser, a closed HTTPS destination/protocol policy, refusal
of caller credentials and ambient credential helpers, partial/missing source
refusal, functional cross-Project alternates escape plus policy denial, complete
bundle restore and corrupt-pack refusal. All repositories and calls are local
fixtures; no real provider was contacted.

The synthetic secret entered through a bounded file slot, never through a URL
or argv. Before cleanup, the proof scanned every regular file under the work,
root, temporary and Evidence roots—including canonical repositories, configs,
logs and bundles—and found zero occurrences. The finalizer promoted the result
from `PROVISIONAL` to `PASS` only after the exact 15-check census passed and the
before/after byte census of `apps`, `contracts`, `packages`, `profiles` and
`runtime` was identical.

## Exact deciding identities

```text
Git version                 = 2.55.0
Git executable SHA-256      = b5d1f9f76f9805ce8721accc9d8bbff9af9b7407e182ab07a5677dafa6c22201
source archive SHA-256      = 457fdb04dc8728e007d4688695e6912e6f680727920f2a40bf11eacc17505357
detached signature SHA-256  = 8673501946204c38ebfed09603c1f3a041ed8d12b31f0aa06a474d41e359e254
signing subkey fingerprint  = E1F036B1FEE7221FC778ECEFB0B5E88696AFE6CB
OCI index                   = sha256:44ad647a10c0a9659e3cfebb28e6b384ac8af15ac53fc2d0cd662cd30d7817b0
Linux/amd64 manifest        = sha256:800f870caa890432f5955cf2c4545af3ead7f3cd6bcc74b419cfd9934e8876e2
build metadata SHA-256      = bd2f37cf76a7307a1d66bee226708386573f75c48c14d9d2304d8a414e384531
rootfs closure SHA-256      = 737d2733325ab0d6c49e102d16dc4892c5ca35a92dffe6c838dbe77c44f93fba
dependency closure SHA-256  = 07ddbd90e07c40f18482f4cbf35c0587d6197b5e7563b96062d00ae86784959c
result SHA-256              = 9f05ac20b221c9902fbeb3305e0f0636df59c6d4a296f3f72126afa270bc972b
```

## Independent convergence and boundary

Claude Code session `c29aa270-bfcf-4135-bb6f-7ed0fa639e27` ran the actual
`claude-opus-5` lane. AGY conversation
`00f57a88-0d5b-43b6-ae06-0569186cd7ae` ran Gemini 3.1 Pro. After adversarial
corrections, both returned `ACCEPT`, `MATERIAL_FINDINGS=0`,
`GLOBAL_MAXIMUM=CLEAR` and `R1C14=ADMISSIBLE/PASS_ADMISSIBLE`.

This closes only the R1C-14 entry gate. S3 Product bytes still require their
separate execution grant. Cognition/R1C-13, provider calls, commit, push, PR and
merge remain blocked. Any pin mismatch, incomplete tree, unclassified CAS
loser, credential/protocol escape, cross-Project object reachability, recovery
failure, secret disclosure, Product census delta or non-firing proof reopens
the smallest R1C-14 owner.
