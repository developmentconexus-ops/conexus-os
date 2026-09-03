# R1C-14 Git source-custody qualification

This directory is an isolated feasibility and falsifier harness. It is not the
Product `GitInfra` implementation and does not create a Product schema, service,
catalog or background process.

The image builds Git `2.55.0` from the kernel.org release archive after exact
SHA-256, release-key fingerprint and detached-signature verification. Its Linux
base, build inputs and package versions are exact. `probe.mjs` exercises only
temporary repositories and emits machine-readable Evidence.

The gate can pass only when all of these claims pass together:

- owner-isolated canonical bare repositories for NEW and EXISTING_GIT fixtures;
- one immutable source commit and expected-old-zero ref CAS, including loser;
- closed locator admission plus inherited credential/config and protocol denial;
- refusal of partial source, missing object/ref and corrupt recovery bundle;
- complete bundle verification and same-object-ID restore;
- cleanup of every temporary repository, server and secret canary.

The admitted build was produced with BuildKit provenance enabled. Its retained,
pinned build-metadata file identifies the exact OCI index and records the build
recipe and five source materials. The OCI index is the binding execution
identity; the Linux/amd64 manifest is
corroborating-only because rejected and admitted attestations can share the same
platform manifest. Rootfs layer list, executable, dependency closure and provenance
metadata are verified by the exact runner. The runner deliberately does not
rebuild or float the image. It measures every file under the five Product roots before
and after the probe; only the finalizer may promote the provisional result. A
missing or different image must be re-admitted rather than silently substituted.
Only a local synthetic credential challenge is executed; no provider call is
made.

Seven changed `2026-08-31` deciding protocol files — `admission.mjs`,
`admission.test.mjs`, `finalize-result.mjs`, `https-fixture.mjs`, `probe.mjs`,
`product-census.mjs` and `run.ps1` — are retained under
`evidence/superseded-protocol/`. The eighth closed-result identity, `Dockerfile`,
remains byte-identical at its current path. The closed result binds all eight
SHA-256 identities. Historical copies are custody only; `run.mjs` and the current
pin remain the native successor protocol.

`run.mjs` is the Linux-native readmission runner. It requires an exact pin
input, a new versioned Evidence directory and an absolute temporary root outside
the repository. It refuses an existing Evidence directory, so the closed
PowerShell-era result remains immutable. The current native command is:

The final rename can replace only a concurrently-created empty placeholder
directory at the new versioned target; it cannot replace an evidence-bearing or
non-empty directory. The temporary work root is removed only after this runner
successfully creates and therefore owns it.

Executable protocol files remain equality-enforced by the independent consumer.
The three prose files recorded in `protocolDigests` retain their observed run-time
hashes but may be corrected without requalifying the image. Superseded complete
candidates are retained or explicitly disclosed under
`evidence/superseded-candidates/`. The current manifest binds the latest
supersession record, which digest-links every earlier native candidate; the
read-only consumer enumerates retained candidate directories and refuses an
orphan.

```bash
BUILDX_GIT_INFO=0 BUILDX_METADATA_PROVENANCE=max docker buildx build \
  --platform linux/amd64 \
  --provenance=mode=max \
  --metadata-file /home/leandrotheodoro/conexus-r1c14-native-readmission/build-metadata-v3.json \
  --load \
  --tag conexus-r1c14-git:2.55.0-native-readmission-v3 \
  qualification/4d/r1-git-source-custody

node qualification/4d/r1-git-source-custody/run.mjs \
  --pin qualification/4d/r1-git-source-custody/native-readmission-pin.json \
  --build-metadata /home/leandrotheodoro/conexus-r1c14-native-readmission/build-metadata-v3.json \
  --evidence-directory evidence/native-readmission-linux-2026-09-01-v14 \
  --work-root /var/tmp/conexus-r1c14-native-readmission-work-v14
```

The historical `run.ps1` is retained only as protocol history and exits before
any filesystem mutation. It cannot rerun or delete the closed 2026-08-31
Evidence.
