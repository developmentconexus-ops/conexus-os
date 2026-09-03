# 4F(R1) S3-P0 — exact Git execution binding result

> **Status:** `CLOSED PASS`
> **Stage:** `S3 ACTIVE / S3-P1 NEXT`
> **Product operation delta:** `0`
> **Provider/external network calls:** `0`
> **Execution environment:** WSL Ubuntu, Node `24.20.0`, npm `12.0.2`, Docker Engine `29.7.2`

## Delivered vertical outcome

S3-P0 consumes the closed R1C-14 native-successor receipt and manifest as one
generated Hub identity. The Project-private `GitExecutionPort` exposes exactly
one operation, `verifyAdmittedImage()`. Its production adapter inspects and runs
only OCI index
`sha256:5e5c3526292bb87a97a3fa41c8e715800a02da5238fbe07bf99c1c4b614f7851`
through fixed Docker vectors.

The no-network process boundary uses `--pull never`, `--network none`,
`--cap-drop ALL`, `no-new-privileges`, a read-only root and bounded tmpfs. It
fails closed on an absent/failed/signaled/overflowing process, image mismatch,
Git version mismatch or executable-hash mismatch. The returned verified facts
are exactly Git `2.55.0` and executable SHA-256
`b5d1f9f76f9805ce8721accc9d8bbff9af9b7407e182ab07a5677dafa6c22201`.

There is no caller-supplied image, executable, argv, shell, mount, environment,
network mode or credential input. No host executable named `git` is invoked,
and the mutable tag, Linux/amd64 manifest, two live rejected indices and absent
historical index cannot enter an adapter vector.

## Exact outputs

| Class | Path | SHA-256 |
| --- | --- | --- |
| `GENERATED` | `apps/hub/src/generated/r1c14-git-identity.ts` | `4657153b85863ef106fb086f2679427e3a6b5410eeda000eb7004f9eb70061e5` |
| `PLATFORM-CONTRACT` | `apps/hub/src/project/git-execution.ts` | `4c455a800da2689f4cec8b00919ef6c32392f3d31abe2c75f4c9b0195d326efc` |
| `PLATFORM-CONTRACT` | `scripts/generate-r1-s3-git-identity.mjs` | `dfdfc2593ae5f7f79690880be8084c0a8681196f9bddef65da5b961c7e3c484b` |
| `PLATFORM-CONTRACT` | `scripts/check-r1-s3-git-execution.mjs` | `6383adc0570b677fb88ecf2b776c7a88c711aa60afafdba40fac8e5bc20a32ca` |
| `PLATFORM-CONTRACT` | `tests/implementation/r1-s3-git-execution.test.mjs` | `fafa94ab09acee40d617bf326b54422d70f36f4bf3849beeb58353889a7036e5` |
| `PLATFORM-CONTRACT` | `package.json` | `a9062ab373aaea4de8debeb3d9c7cb54dcfeb81bfc1350999f46867f9e831429` |

The inherited `package.json` subject entered S3-P0 at exact prior digest
`282ce4fb8b5c8973f0218ffc42bc7f530a3fc077899cbe324`. The native manifest and
receipt remain unchanged at `b2f6d25a20e63c375f87d07fdea5b4f0f977e53599a33b49540c882e537be9a9`
and `efeb59e2c486659fea0088bf5779280e74f3c8fe490a9fab8a1bf0452e0ee66f`.

## Deciding proof

```text
npm run r1:s3:p0:generate        PASS
npm run r1:s2:hub:typecheck      PASS
npm run r1:s3:p0:check           PASS / 12 PASS + 1 intentional live skip
npm run r1:s2:import-law         PASS / 26 OF 26
npm run r1:s3:p0:live            PASS / 13 OF 13 / real admitted image
node --check (three new .mjs)     PASS
Biome targeted check             PASS / two warnings corrected
```

The real case ran the production adapter inside WSL and completed its exact
inspect/version/hash sequence with container networking disabled. No external
OCI publication, registry access, Product/provider call or production effect
was required.

## Closure and next boundary

All nine stage-packet protected claims remain intact. S3-P0 is therefore
`CLOSED PASS`; S3 itself remains active. The next authorized part is S3-P1:
Project schema, operation-idempotency/recovery receipt and exact direct creator
grant boundary, proved in real PostgreSQL without routes, UI, source settlement
or later Git operation expansion.

Cognition/R1C-13, Product/provider calls, external OCI/input custody, commit,
push, PR and merge remain blocked.
