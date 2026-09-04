# 4D(R1) — R1C-14 Linux-native readmission result

> **Status:** `CLOSED PASS v14 / 17 OF 17 PASS / RECEIPT-LAST`
> **Boundary:** R1C-14 successor closed; S3 separately governed by its stage packet
> **Observed:** `2026-09-01`

## Candidate result

The deciding environment is now WSL2 Ubuntu 26.04 LTS with native Docker Engine
29.7.2. The prior admitted OCI index remains closed historical Evidence but is
not present in this daemon. Silent substitution was refused. A fresh exact image
was built from the same digest-pinned Dockerfile inputs, archive, detached
signature and release-key fingerprints.

The first native build was rejected because Buildx attached an unverified
`vcs:revision` hint to a dirty local context. Its index, metadata SHA and exact
offending fields are retained as a firing negative control. The deciding build
keeps both image provenance and metadata-file provenance at `mode=max` while
documented `BUILDX_GIT_INFO=0` excludes those unverified hints. The full retained
metadata contains build graph, materials, invocation, timestamps, completeness
and reproducibility fields and contains no `vcs:revision` or `vcs:source`.
The exact keyserver response was independently re-read on `2026-09-01`: its
SHA-256 remained `fd2809d850e844b614ac60f13ded554c55d9052e5c799a5814abcba2a68a063c`,
with primary fingerprint `96E07AF25771955980DAD10020D04E5A713660A7` and
signing-subkey fingerprint `E1F036B1FEE7221FC778ECEFB0B5E88696AFE6CB`.

The Linux-native runner verifies Node `v24.20.0`, waits for the WSL-cold-started
Docker daemon, pins index/manifest/rootfs/metadata/executable/dependencies,
refuses an existing final Evidence directory and atomically promotes a new one
only after host-side finalization. Fresh proof returned all 17 checks PASS, its
admission unit suite returned 12/12, identical before/after five-root Product
census, zero Product delta and zero secret contamination across 334 scanned
files. Both probe executions address the raw immutable OCI index digest after
the mutable tag is inspected, closing the tag time-of-check/time-of-use route.
Seven changed historical protocol files — `admission.mjs`, `admission.test.mjs`,
`finalize-result.mjs`, `https-fixture.mjs`, `probe.mjs`, `product-census.mjs` and
`run.ps1` — were recovered before their tool capture ref could be pruned and now
live under `evidence/superseded-protocol/` with their original hashes. The eighth
closed-result identity, `Dockerfile`, remains byte-identical at its current path.
`scripts/check-r1c14-native-readmission.mjs` now consumes the candidate envelope
without asserting Product authority: it recomputes every referenced digest,
checks the result/pin/image/metadata/negative-control semantics and refuses a
forged result digest. The runner and checker decode the Dockerfile embedded in
the pinned BuildKit build-metadata provenance, require its exact bytes, require
the exact five material digests and derive the result recipe/source claims from
those retained values. The targeted suite also proves finalizer refusal for a
changed Product census, incomplete check census, incomplete cleanup and secret
disclosure.
The v14 hardening executes both qualification containers with `--network none`,
anchors the exact 12-test TAP census, refuses percent-decoded slash, backslash,
NUL and dot-segment locator escapes, and proves both request-target and
filesystem secret detectors by planting, detecting, removing and rescanning
owned canaries. The retained v9, v10 and v11 Evidence directories are each
covered by the exact digest-linked supersession chain rather than left as
apparent PASS authority. The native read-only consumer suite is 30/30 PASS;
the review-wrapper suite is 9/9 PASS. Together they also bind review outputs to
exact current brief/result digests and fire on read-only argv drift,
including firing controls for required-path omission, undeclared prior
transition, unowned build-context input and incomplete review-lane census. All
eight protocol identities asserted by the closed result are retained byte-exact;
fingerprint fields are truthfully recorded rather than claiming a verification
the probe did not perform.

The v14 closure correction derives receipt location from the current manifest,
keeps the review brief digest enforced after PASS, preserves reviewer output
bytes for recomputation and leaves raw reviewer verdicts subordinate to a
machine-bound Lead adjudication. Locator admission now decodes to closure and
refuses residual encoding, empty path segments and caller query strings. Both
live provenance-rejected OCI indices are explicit forbidden S3 identities.

```text
OCI index                   = sha256:5e5c3526292bb87a97a3fa41c8e715800a02da5238fbe07bf99c1c4b614f7851
Linux/amd64 manifest        = sha256:5c4c1731bb91b227c26ab40efd8298a8a9b3a3f8a5a40642d65817d581a72276
build metadata SHA-256      = 841a96b0bdfca1f96e1b4b532f35e05c5ea5f11486b61f49d246e7fb93a4aa6a
rootfs closure SHA-256      = 5d7ff67d036c769c39c19b06bba5e94f4dc7d69ef435843c2406bf16f63c3ea1
dependency closure SHA-256  = 07ddbd90e07c40f18482f4cbf35c0587d6197b5e7563b96062d00ae86784959c
Git executable SHA-256      = b5d1f9f76f9805ce8721accc9d8bbff9af9b7407e182ab07a5677dafa6c22201
admission-test SHA-256      = 78ad0bb18256925a1848d9c79129030a5d86b2346dcc9423ae68f79e930f0507
result SHA-256              = d5ccba4ecf683417a5a78313c5fa7230fd3eb56fd8ced0eca7e14b844be767c6
```

## Final closure

Fresh isolated Opus and Gemini lanes bound the frozen six-claim brief and exact
v14 result. Gemini returned zero material blockers. Opus cleared the exact OCI,
qualification, Product-delta, secret and historical-Evidence claims and exposed
three deciding-review-integrity gaps. Lead adjudication corrected checkout-path
portability, failed/empty-lane refusal and independently frozen read-only argv
vectors; targeted firing proof is 30/30 plus review-wrapper 9/9 PASS. Recovery,
external custody and S3-specific hardening findings are recorded as
`DEFER SAFE` with explicit triggers and later owners.

The admitted successor binds only OCI index
`sha256:5e5c3526292bb87a97a3fa41c8e715800a02da5238fbe07bf99c1c4b614f7851`.
Its receipt-last successor lives beside the v14 result. Cognition/R1C-13,
Product providers, local commit, push, PR and merge remain blocked.
